#!/bin/bash
source /tmp/bg.sh
fgc(){ local o=$(jq -nc --arg c "$1" '{command:$c}'); bg POST /actions/frontier "$o"; }
count() { bg GET /state | jq "[.inventory[] | select(.itemId==\"$1\") | .quantity] | add // 0"; }
walkto() { fgc "$(jq -nc --arg id "$3" --argjson x "$1" --argjson z "$2" '{action:"walk",id:$id,x:$x,z:$z}')" >/dev/null; for i in $(seq 1 60); do sleep 2; d=$(bg GET /state | jq -r '.player.destination // empty'); [ -z "$d" ] && return; done; }
# THE MAP KNOWLEDGE - all node positions! (proactive map awareness!)
# TIMBER: (33,52) (29,47) (29,58) (29,70) (33,82) (29,94) | STONE: (33,56) | FIBRE: (33,72) | CLAY: (33,76)
echo '=== PRODUCTIVITY ENGINE (task memory + cooldown rotation!) ==='
while true; do
  TASK=$(cat /tmp/task.txt 2>/dev/null)
  echo "$(date +%T) 🧠 CURRENT TASK: $TASK"
  T=$(count timber); S=$(count stone); F=$(count fibre); C=$(count clay)
  echo "📊 stocks: T=$T S=$S F=$F C=$C"
  # TASK-BASED ACTION with COOLDOWN ROTATION (never idle!)
  if [ "${T:-0}" -lt 75 ]; then
    echo '🪵 TIMBER MODE - 6-node rotation (each regrows while I work the next!)'
    walkto 33 52 settlement
    fgc '{"action":"gather","id":"settlement-timber"}' >/dev/null; sleep 4
    walkto 29 47 settlement
    fgc '{"action":"gather","id":"settlement-timber-2"}' >/dev/null; sleep 4
    walkto 29 58 settlement
    fgc '{"action":"gather","id":"settlement-timber-3"}' >/dev/null; sleep 4
    walkto 29 70 settlement
    fgc '{"action":"gather","id":"settlement-timber-4"}' >/dev/null; sleep 4
  elif [ "${S:-0}" -lt 20 ]; then
    echo '🪨 STONE MODE - alternating with fibre (dual-camp, zero idle!)'
    walkto 33 54 settlement
    fgc '{"action":"gather","id":"settlement-stone"}' >/dev/null; sleep 5
    fgc '{"action":"gather","id":"settlement-timber"}' >/dev/null; sleep 5
  elif [ "${F:-0}" -lt 20 ] || [ "${C:-0}" -lt 20 ]; then
    echo '🌿🏺 FIBRE+CLAY MODE - dual patch rotation!'
    walkto 33 74 settlement
    fgc '{"action":"gather","id":"settlement-fibre"}' >/dev/null; sleep 5
    fgc '{"action":"gather","id":"settlement-clay"}' >/dev/null; sleep 5
  else
    echo '✅ ALL TARGETS MET! Doing coin quests + waiting for trade!'
    walkto 31 64 settlement
    fgc '{"action":"talk","id":"steward"}' >/dev/null; sleep 2
    for Q in steward supplies tools; do fgc "$(jq -nc --arg q "$Q" '{action:"quest",id:$q}')" >/dev/null; sleep 1.5; done
    CO=$(bg GET /state | jq '.frontier.profile.coins')
    echo "💰 coins: $CO - task complete, ready for delivery!"
    echo 'collect more for Mersal' > /tmp/task.txt
    sleep 30
  fi
done
