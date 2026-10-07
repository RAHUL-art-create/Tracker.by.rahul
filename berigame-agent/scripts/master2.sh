#!/bin/bash
source /tmp/bg.sh
fgc() { local outer=$(jq -nc --arg c "$1" '{command:$c}'); bg POST /actions/frontier "$outer"; }
count() { bg GET /state | jq "[.inventory[] | select(.itemId==\"$1\") | .quantity] | add // 0"; }
coins() { bg GET /state | jq '.frontier.profile.coins'; }
walkto() { fgc "$(jq -nc --arg id "$3" --argjson x "$1" --argjson z "$2" '{action:"walk",id:$id,x:$x,z:$z}')" >/dev/null; for i in $(seq 1 60); do sleep 2; d=$(bg GET /state | jq -r '.player.destination // empty'); [ -z "$d" ] && return; done; }
MER='c2000e251292ab830f8a94d6c971d998a58b75fc93689f37ed82ce144e38a3ec'
trade_all() {
  S=$(bg GET /state)
  OFFER=$(echo "$S" | jq -r '[.inventory[] | select(.itemId!="stick" and .itemId!="stone_club" and (.itemId|test("berry")|not)) | "\(.itemId):\(.quantity)"] | join(",")')
  [ -z "$OFFER" ] && return
  echo "TRADING: $OFFER + coins"
  bg POST /actions/trade_request "{\"playerId\":\"$MER\"}" >/dev/null; sleep 5
  TID=$(bg GET /state | jq -r '.trade.id // empty')
  [ -z "$TID" ] && { echo 'Mersal not reachable'; return; }
  bg POST /actions/trade_offer "{\"tradeId\":\"$TID\",\"offer\":\"$OFFER\"}" >/dev/null; sleep 4
  C=$(coins); [ "${C:-0}" -gt 0 ] && { bg POST /actions/trade_coins "{\"tradeId\":\"$TID\",\"coins\":$C}" >/dev/null; sleep 1; }
  bg POST /actions/trade_confirm "{\"tradeId\":\"$TID\"}" >/dev/null; sleep 6
}
echo '=== MASTER ECONOMY V2 ==='
for cycle in $(seq 1 25); do
  echo "--- cycle $cycle ---"
  walkto 33 54 settlement
  for i in $(seq 1 20); do
    fgc '{"action":"gather","id":"settlement-timber"}' >/dev/null; sleep 4
    fgc '{"action":"gather","id":"settlement-stone"}' >/dev/null; sleep 4
    T=$(count timber); S2=$(count stone)
    [ "${T:-0}" -ge 50 ] && [ "${S2:-0}" -ge 50 ] && break
  done
  walkto 33 74 settlement
  for i in $(seq 1 20); do
    fgc '{"action":"gather","id":"settlement-fibre"}' >/dev/null; sleep 4
    fgc '{"action":"gather","id":"settlement-clay"}' >/dev/null; sleep 4
    F=$(count fibre); C2=$(count clay)
    [ "${F:-0}" -ge 50 ] && [ "${C2:-0}" -ge 50 ] && break
  done
  T=$(count timber)
  if [ "${T:-0}" -ge 8 ]; then
    walkto 31 64 settlement
    fgc '{"action":"order","id":"timber"}' | jq -c '.accepted // .error'; sleep 4
    fgc '{"action":"talk","id":"steward"}' >/dev/null; sleep 4
    for Q in steward supplies tools deed shelter; do fgc "$(jq -nc --arg q "$Q" '{action:"quest",id:$q}')" >/dev/null; sleep 1.5; done
  fi
  echo "STATUS: T=$(count timber) S=$(count stone) F=$(count fibre) C=$(count clay) coins=$(coins)"
  trade_all
done
echo '=== MASTER V2 END ==='
