#!/bin/bash
source /tmp/bg.sh
fgc(){ local o=$(jq -nc --arg c "$1" '{command:$c}'); bg POST /actions/frontier "$o"; }
MER='c2000e251292ab830f8a94d6c971d998a58b75fc93689f37ed82ce144e38a3ec'
# TIMING RULE: every action waits for its receipt + settle time!
act() {
  bg POST /actions/frontier "$(jq -nc --arg c "$1" '{command:$c}')" >/dev/null
  sleep 4
}
# TRADE MODE: freeze ALL movement, stay stable!
trade_mode() {
  echo "$(date +%T) 🤝 TRADE MODE - freezing movement!"
  bg POST /actions/stop '{}' >/dev/null; sleep 2
  local OFFER=$(bg GET /state | jq -r '[.inventory[] | select(.itemId!="stone_club" and .itemId!="stick" and .itemId!="axe" and (.itemId|test("berry")|not))] | group_by(.itemId) | map("\(.[0].itemId):\(map(.quantity)|add)") | join(",")')
  local CO=$(bg GET /state | jq '.frontier.profile.coins')
  local TID=$(bg GET /state | jq -r '.trade.id // empty')
  if [ -z "$TID" ]; then
    bg POST /actions/trade_request "{\"playerId\":\"$MER\"}" >/dev/null
    sleep 6
    TID=$(bg GET /state | jq -r '.trade.id // empty')
  fi
  if [ -n "$TID" ]; then
    echo "$(date +%T) 📦 loading: $OFFER + $CO coins"
    [ -n "$OFFER" ] && bg POST /actions/trade_offer "{\"tradeId\":\"$TID\",\"offer\":\"$OFFER\"}" >/dev/null
    sleep 3
    [ "${CO:-0}" -gt 0 ] && bg POST /actions/trade_coins "{\"tradeId\":\"$TID\",\"coins\":$CO}" >/dev/null
    sleep 3
    bg POST /actions/trade_confirm "{\"tradeId\":\"$TID\"}" >/dev/null
    # STABILITY: hold position while he confirms! (no walks!) 
    for i in $(seq 1 8); do
      sleep 5
      ST=$(bg GET /state | jq -r '.trade.id // empty')
      [ -z "$ST" ] && { echo "$(date +%T) ✅ TRADE COMPLETE!"; return; }
    done
    echo "$(date +%T) ⏳ still waiting - he may be busy!"
  else
    echo "$(date +%T) ⏳ trade not open yet - he needs to accept!"
  fi
}
echo '=== TIMING ORCHESTRATOR (serialized + stable!) ==='
while true; do
  S=$(bg GET /state)
  # CHECK: is Mersal nearby? TRADE FIRST (stability mode!) 
  VIS=$(echo "$S" | jq -r --arg m "$MER" '[.players[] | select(.id==$m)] | length')
  OFFER_N=$(echo "$S" | jq '[.inventory[] | select(.itemId!="stone_club" and .itemId!="stick" and .itemId!="axe" and (.itemId|test("berry")|not))] | length')
  if [ "${VIS:-0}" -gt 0 ] && [ "${OFFER_N:-0}" -gt 0 ]; then
    trade_mode
    continue
  fi
  # GATHER MODE: the cooldown rotation with proper settle times!
  T=$(echo "$S" | jq '[.inventory[]? | select(.itemId=="timber")|.quantity]|add//0')
  echo "$(date +%T) 🪵 gather mode - timber=$T"
  walkto(){ fgc "$(jq -nc --argjson x "$1" --argjson z "$2" '{action:"walk",id:"settlement",x:$x,z:$z}')" >/dev/null; for i in $(seq 1 40); do sleep 2; d=$(bg GET /state | jq -r '.player.destination // empty'); [ -z "$d" ] && return; done; }
  # 4-node timber circuit (each regrows while I work the next!)
  walkto 33 54
  act '{"action":"gather","id":"settlement-timber"}'
  act '{"action":"gather","id":"settlement-stone"}'
  act '{"action":"gather","id":"settlement-timber-2"}'
  act '{"action":"gather","id":"settlement-stone"}'
  walkto 33 74
  act '{"action":"gather","id":"settlement-fibre"}'
  act '{"action":"gather","id":"settlement-clay"}'
  act '{"action":"gather","id":"settlement-fibre"}'
  act '{"action":"gather","id":"settlement-clay"}'
done
echo '=== ORCHESTRATOR END ==='
