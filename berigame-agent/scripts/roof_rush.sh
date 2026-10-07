#!/bin/bash
source /tmp/bg.sh
fgc(){ local o=$(jq -nc --arg c "$1" '{command:$c}'); bg POST /actions/frontier "$o"; }
count(){ bg GET /state | jq "[.inventory[] | select(.itemId==\"$1\") | .quantity] | add // 0"; }
walkto(){ fgc "$(jq -nc --argjson x "$1" --argjson z "$2" '{action:"walk",id:"settlement",x:$x,z:$z}')" >/dev/null; for i in $(seq 1 40); do sleep 2; d=$(bg GET /state | jq -r '.player.destination // empty'); [ -z "$d" ] && return; done; }
echo '=== ROOF RUSH - fill every slot with THATCH! ==='
echo '--- first: gather supplies (timber + fibre!) ---'
walkto 33 54
for i in $(seq 1 12); do T=$(count timber); [ "${T:-0}" -ge 60 ] && break; fgc '{"action":"gather","id":"settlement-timber"}' >/dev/null; sleep 4.5; done
walkto 33 74
for i in $(seq 1 20); do F=$(count fibre); echo "fibre=$F"; [ "${F:-0}" -ge 80 ] && break; fgc '{"action":"gather","id":"settlement-fibre"}' >/dev/null; sleep 4; done
echo '--- LAY THE THATCH! (every empty tile!) ---'
walkto 15 49
for Z in 46 47 48 49 50 51 52 53; do
  for X in 14 15 16 17 18 19; do
    HAS=$(bg GET /state | jq -r --arg x "$X" --arg z "$Z" '[.frontier.buildings[] | select(.claim=="settlement-9" and .piece=="roof" and .x==($x|tonumber) and .z==($z|tonumber))] | length')
    [ "${HAS:-0}" -gt 0 ] && continue
    R=$(fgc "{\"action\":\"build\",\"id\":\"settlement-9\",\"item\":\"roof\",\"x\":$X,\"z\":$Z,\"rotation\":0}")
    echo "roof $X,$Z -> $(echo $R | jq -r '.accepted // .error.message')"
    sleep 3
done
done
echo "=== ROOF RUSH END: $(bg GET /state | jq '[.frontier.buildings[] | select(.claim==\"settlement-9\" and .piece==\"roof\")] | length') roofs! ==="
