#!/bin/bash
source /tmp/bg.sh
fgc(){ local o=$(jq -nc --arg c "$1" '{command:$c}'); bg POST /actions/frontier "$o"; }
count(){ bg GET /state | jq "[.inventory[] | select(.itemId==\"$1\") | .quantity] | add // 0"; }
coins(){ bg GET /state | jq '.frontier.profile.coins'; }
walkto(){ fgc "$(jq -nc --argjson x "$1" --argjson z "$2" '{action:"walk",id:"settlement",x:$x,z:$z}')" >/dev/null; for i in $(seq 1 40); do sleep 2; d=$(bg GET /state | jq -r '.player.destination // empty'); [ -z "$d" ] && return; done; }
echo '=== MY COIN GRIND (target 50 for my plot!) ==='
for round in $(seq 1 8); do
  C=$(coins); echo "$(date +%T) coins=$C"
  [ "${C:-0}" -ge 50 ] && break
  walkto 33 54
  for i in $(seq 1 12); do T=$(count timber); [ "${T:-0}" -ge 8 ] && break; fgc '{"action":"gather","id":"settlement-timber"}' >/dev/null; sleep 4.5; done
  walkto 31 64
  R=$(fgc '{"action":"order","id":"timber"}'); echo "  order -> $(echo $R | jq -r '.accepted // .error.message')"
  sleep 3
done
echo "=== COIN GRIND END: $(coins) coins ==="
