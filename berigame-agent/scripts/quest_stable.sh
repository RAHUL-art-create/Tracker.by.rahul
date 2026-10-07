#!/bin/bash
source /tmp/bg.sh
fgc(){ local o=$(jq -nc --arg c "$1" '{command:$c}'); bg POST /actions/frontier "$o"; }
count(){ bg GET /state | jq "[.inventory[] | select(.itemId==\"$1\") | .quantity] | add // 0"; }
walkto(){ fgc "$(jq -nc --argjson x "$1" --argjson z "$2" '{action:"walk",id:"settlement",x:$x,z:$z}')" >/dev/null; for i in $(seq 1 40); do sleep 2; d=$(bg GET /state | jq -r '.player.destination // empty'); [ -z "$d" ] && return; done; }
echo '=== QUEST: Room for friends (BUILD A STABLE!) ==='
echo '--- gather 8 timber + 12 fibre ---'
walkto 33 54
for i in $(seq 1 10); do T=$(count timber); [ "${T:-0}" -ge 8 ] && break; fgc '{"action":"gather","id":"settlement-timber"}' >/dev/null; sleep 4.5; done
walkto 33 74
for i in $(seq 1 12); do F=$(count fibre); [ "${F:-0}" -ge 12 ] && break; fgc '{"action":"gather","id":"settlement-fibre"}' >/dev/null; sleep 4.5; done
echo '--- craft planks + rope ---'
walkto 31 64
for i in 1 2 3 4; do fgc '{"action":"craft","id":"planks"}' >/dev/null; sleep 3; done
for i in 1 2 3 4; do fgc '{"action":"craft","id":"rope"}' >/dev/null; sleep 3; done
echo "crafted: planks=$(count planks) rope=$(count rope)"
echo '--- BUILD THE STABLE in the new south yard! ---'
walkto 16 55
R=$(fgc '{"action":"build","id":"settlement-9","item":"stable","x":15,"z":55,"rotation":0}')
echo "stable -> $(echo $R | jq -r '.accepted // .error.message')"
sleep 3
echo '--- claim the quest! ---'
walkto 31 64
fgc '{"action":"talk","id":"steward"}' >/dev/null; sleep 3
fgc '{"action":"quest","id":"upkeep"}' | jq -c '.accepted // .error'; sleep 2
fgc '{"action":"quest","id":"stable"}' | jq -c '.accepted // .error'
sleep 2
bg GET /state | jq -c '{coins: .frontier.profile.coins, done: [.frontier.quests[] | select(.complete==true) | .id]}'
echo '=== QUEST STABLE END ==='
