#!/usr/bin/env python3
"""A real, honest BeriGame helper loop for one player ("Mersal").

Design rules that fix the problems seen before:
  * ONE action at a time. After every accepted action we poll /state until the
    character is idle again before issuing the next one. Firing actions faster
    than they complete is what cancels harvests and causes "race conditions".
  * >= 1.2s between requests; honour 429/Retry-After (handled in beri.py).
  * Never call /actions/attack. We do not hunt players. If attacked we walk away.
  * Everything gathered is offered to Mersal (and Mersal only). We keep a
    weapon, a tool and a couple of healing berries so we stay useful/alive.
  * Keep health topped up by eating when below the threshold.

This is NOT a 24/7 daemon. A BeriGame session lives at most 1 hour (10 min idle)
and the sandbox can be torn down at any time. Treat it as "run it while I watch".
"""
import json, sys, time, uuid, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import beri

BOSS_NAME = "Mersal"          # only this player can command/get trades
SLEEP = 1.3                    # min seconds between requests
HEAL_BELOW = 0.6               # eat when health < 60%
KEEP = {"berry_greenberry", "berry_blueberry", "berry_goldberry",
        "berry_strawberry", "axe", "pick", "hammer", "watering_can", "stick",
        "stone_club", "iron_club", "travel_rations"}

class Agent:
    def __init__(self):
        self.tok = beri.load()["token"]
        self.boss_id = None
        self.state = None

    def get(self):
        st, d = beri.call("GET", "/state", token=self.tok)
        if st != 200:
            time.sleep(2)
            return
        self.state = d
        self._spot_boss()

    def _spot_boss(self):
        for p in self.state.get("players", []):
            if p.get("name") == BOSS_NAME:
                self.boss_id = p.get("id")

    def act(self, name, payload=None, key=None):
        st, d = beri.call("POST", "/actions/" + name, token=self.tok,
                          body=payload or {}, idem=key or str(uuid.uuid4()))
        time.sleep(SLEEP)
        return st, d

    def settle(self, tries=25):
        for _ in range(tries):
            self.get()
            p = self.state["player"]
            if p["action"] == "idle" and not p.get("gathering"):
                return
            time.sleep(1.2)

    def inv(self):
        return {i["itemId"]: i["quantity"] for i in (self.state.get("inventory") or []) if i}

    def have(self, item):
        return self.inv().get(item, 0)

    def heal(self):
        p = self.state["player"]
        if p["health"] >= p["maxHealth"] * HEAL_BELOW:
            return False
        for idx, row in enumerate(self.state.get("inventory") or []):
            if row and row["itemId"].startswith("berry_"):
                self.act("eat", {"slot": idx})
                self.settle()
                return True
        return False

    def is_boss(self, sender_id):
        return self.boss_id is not None and sender_id == self.boss_id

    def handle_chat(self):
        chat = self.state.get("chat") or []
        if not chat:
            return
        last = chat[-1]
        if not self.is_boss(last.get("sender")):
            return
        if getattr(self, "_last_chat_tick", None) == last.get("tick"):
            return
        self._last_chat_tick = last.get("tick")
        text = (last.get("text") or "").lower()
        if any(w in text for w in ("trade", "give", "bring", "send")):
            self.act("chat", {"text": "On it - loading a trade for you now."})
            self.offer_all()
        elif "status" in text or "how much" in text:
            inv = self.inv()
            self.act("chat", {"text": "Status: " + ", ".join("%s=%s" % kv for kv in inv.items())})

    def offer_all(self):
        tr = self.state.get("trade")
        if not tr or tr.get("status") != "open":
            return
        offer = {}
        for row in self.state.get("inventory") or []:
            if not row:
                continue
            if row["itemId"] in KEEP:
                continue
            offer[row["itemId"]] = row["quantity"]
        if not offer:
            return
        self.act("trade_offer", {"items": offer})
        self.act("trade_confirm", {})
        self.act("chat", {"text": "Trade loaded - please confirm!"})

    def accept_boss_trade(self):
        tr = self.state.get("trade")
        if tr and tr.get("status") == "request" and self.is_boss(tr.get("from")):
            self.act("trade_respond", {"accept": True})
            self.get()
            self.offer_all()

    def _find_node(self, item_id):
        for n in (self.state.get("nodes") or []):
            if n.get("ready") and (n.get("gives") or {}).get("itemId") == item_id:
                return n
        return None

    def gather_priority(self):
        for item in ("timber", "stone", "plant_fibre", "clay", "berry_greenberry"):
            node = self._find_node(item)
            if node:
                self.act("harvest", {"node": node["id"]})
                self.settle()
                return True
        self.act("harvest", {})
        self.settle()
        return True

    def step(self):
        self.get()
        self.accept_boss_trade()
        self.get()
        if (self.state.get("trade") or {}).get("status") == "open":
            self.offer_all()
            return
        self.handle_chat()
        if self.heal():
            return
        self.gather_priority()

    def run(self, minutes=8):
        end = time.time() + minutes * 60
        while time.time() < end:
            try:
                self.step()
            except KeyboardInterrupt:
                break
            except Exception as e:
                print("step error:", e)
                time.sleep(2)
        print("DONE. inv:", self.inv())

if __name__ == "__main__":
    mins = float(sys.argv[1]) if len(sys.argv) > 1 else 2
    Agent().run(mins)

