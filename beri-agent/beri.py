#!/usr/bin/env python3
"""Minimal, honest BeriGame agent client.

Real API only. No fake workers, no fake immortality.
Docs: https://beta.berigame.com/agent.md  OpenAPI: /api/agent/v1/openapi.json

Usage:
  python3 beri.py join            # create a NEW character, save token+renewToken
  python3 beri.py renew           # return to saved character via renewToken
  python3 beri.py recovery        # export a replacement recovery key
  python3 beri.py state           # print a compact world snapshot
  python3 beri.py act <name> [json]   # POST /actions/<name>
"""
import json, sys, os, time, uuid, urllib.request, urllib.error

BASE = "https://beta.berigame.com/api/agent/v1"
UA = "BeriGame-Agent/1.0"
HERE = os.path.dirname(os.path.abspath(__file__))
SECRETS = os.path.join(HERE, ".secrets.json")

def load():
    if os.path.exists(SECRETS):
        with open(SECRETS) as f:
            return json.load(f)
    return {}

def save(d):
    with open(SECRETS, "w") as f:
        json.dump(d, f, indent=2)
    os.chmod(SECRETS, 0o600)

def call(method, path, token=None, body=None, idem=None, retries=3):
    url = BASE + path
    data = json.dumps(body if body is not None else {}).encode()
    req = urllib.request.Request(url, data=data if method != "GET" else None, method=method)
    req.add_header("User-Agent", UA)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    if idem:
        req.add_header("Idempotency-Key", idem)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if raw else {})
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                payload = json.loads(raw)
            except Exception:
                payload = {"raw": raw.decode(errors="replace")}
            if e.code == 429 and attempt < retries - 1:
                wait = float(e.headers.get("Retry-After", "5"))
                time.sleep(min(wait, 30))
                continue
            return e.code, payload
    return 0, {"error": "unreachable"}

def join():
    st, d = call("POST", "/sessions")
    if st != 201:
        print("JOIN FAILED", st, d); return 1
    sec = load()
    sec["token"] = d["token"]
    sec["renewToken"] = d.get("renewToken")
    sec["sessionId"] = d.get("sessionId")
    sec["playerId"] = d.get("playerId")
    save(sec)
    print("JOINED ok. sessionId=%s playerId=%s renewToken saved=%s"
          % (d.get("sessionId"), d.get("playerId"), bool(d.get("renewToken"))))
    return 0

def renew():
    sec = load()
    rt = sec.get("renewToken")
    if not rt:
        print("NO renewToken saved"); return 1
    st, d = call("POST", "/renewals", token=rt)
    if st != 200:
        print("RENEW FAILED", st, d); return 1
    sec["token"] = d["token"]
    sec["renewToken"] = d.get("renewToken", rt)
    save(sec)
    print("RENEWED ok. new token saved, renewToken rotated.")
    return 0

def recovery():
    sec = load(); tok = sec.get("token") or sec.get("renewToken")
    st, d = call("POST", "/recovery", token=tok)
    if st != 200:
        print("RECOVERY FAILED", st, d); return 1
    sec["recoveryToken"] = d.get("recoveryToken")
    sec["recoveryExpiresAt"] = d.get("expiresAt")
    save(sec)
    print("RECOVERY key saved. expiresAt=%s" % d.get("expiresAt"))
    return 0

def state():
    sec = load(); st, d = call("GET", "/state", token=sec.get("token"))
    if st != 200:
        print("STATE FAILED", st, d); return 1
    p = d.get("player", {})
    online = [o.get("name") for o in d.get("players", [])] if isinstance(d.get("players"), list) else d.get("players")
    inv = [(i.get("itemId"), i.get("quantity")) for i in (d.get("inventory") or []) if i]
    print(json.dumps({
        "name": p.get("name"), "hp": p.get("hp"), "maxHp": p.get("maxHp"),
        "tile": p.get("tile"), "action": p.get("action"),
        "coins": p.get("coins"),
        "objective": d.get("objective"), "goal": d.get("goal"),
        "online": online, "inventory": inv,
    }, indent=2))
    return 0

def act(name, payload):
    sec = load(); st, d = call("POST", "/actions/" + name, token=sec.get("token"),
                              body=payload, idem=str(uuid.uuid4()))
    print(st, json.dumps(d)[:500])
    return 0 if st < 400 else 1

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "state"
    if cmd == "join": sys.exit(join())
    if cmd == "renew": sys.exit(renew())
    if cmd == "recovery": sys.exit(recovery())
    if cmd == "state": sys.exit(state())
    if cmd == "act":
        pl = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
        sys.exit(act(sys.argv[2], pl))
    print(__doc__)
