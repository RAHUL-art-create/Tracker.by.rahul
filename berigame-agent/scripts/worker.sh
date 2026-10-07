#!/bin/bash
source /tmp/bg.sh
fgc(){ local o=$(jq -nc --arg c "$1" '{command:$c}'); bg POST /actions/frontier "$o"; }
count(){ bg GET /state | jq "[.inventory[] | select(.itemId==\"$1\") | .quantity] | add // 0"; }
walkto(){ fgc "$(jq -nc --arg id "${3:-settlement}" --argjson x "$1" --argjson z "$2" '{action:"walk",id:$id,x:$x,z:$z}')" >/dev/null; for i in $(seq 1 50); do sleep 2; d=$(bg GET /state | jq -r '.player.destination // empty'); [ -z "$d" ] && return; done; }
echo '=== WORKER: collect + earn + HOLD! (no trades!) ==='
while true; do
  T=$(count timber); S=$(count stone); F=$(count fibre); C=$(count clay)
  echo "$(date +%T) 📦 holding: T=$T S=$S F=$F C=$C"
  if [ "${T:-0}" -lt 100 ]; then
    walkto 33 54
    fgc '{"action":"gather","id":"settlement-timber"}' >/dev/null; sleep 4
    fgc '{"action":"gather","id":"settlement-stone"}' >/dev/null; sleep 4
    fgc '{"action":"gather","id":"settlement-timber-2"}' >/dev/null; sleep 4
    fgc '{"action":"gather","id":"settlement-stone"}' >/dev/null; sleep 4
  elif [ "${F:-0}" -lt 30 ] || [ "${C:-0}" -lt 30 ]; then
    walkto 33 74
    fgc '{"action":"gather","id":"settlement-fibre"}' >/dev/null; sleep 4
    fgc '{"action":"gather","id":"settlement-clay"}' >/dev/null; sleep 4
  else
    # MAKE MONEY! (orders + quests at the steward!)
    echo '💰 making money at the steward!'
    walkto 31 64
    fgc '{"action":"talk","id":"steward"}' >/dev/null; sleep 3
    for Q in steward supplies tools deed shelter observe feed tame order; do fgc "$(jq -nc --arg q "$Q" '{action:"quest",id:$q}')" >/dev/null; sleep 2; done
    T=$(count timber)
    if [ "${T:-0}" -ge 8 ]; then fgc '{"action":"order","id":"timber"}' >/dev/null; sleep 3; fi
    CO=$(bg GET /state | jq '.frontier.profile.coins')
    echo "💰 coins: $CO - keeping everything for Mersal's request!"
    sleep 30
  fi
done
