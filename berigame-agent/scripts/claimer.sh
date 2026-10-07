#!/bin/bash
source /tmp/bg.sh
echo '=== SUPPLY CLAIMER - grabbing whatever boss drops! ==='
while true; do
  S=$(bg GET /state)
  # find ground items!
  IDS=$(echo "$S" | jq -r '[.groundItems[]? | .id] | join(" ")')
  N=$(echo "$S" | jq -r '.groundItems | length')
  if [ "${N:-0}" -gt 0 ]; then
    echo "$(date +%T) 📦 SPOTTED $N dropped items - CLAIMING!"
    for ID in $IDS; do
      R=$(bg POST /actions/pickup "{\"id\":\"$ID\"}")
      OK=$(echo "$R" | jq -r '.accepted // empty')
      echo "  pickup $ID -> $(echo $R | jq -r '.accepted // .error.message')"
      sleep 2
    done
    bg GET /state | jq -c '{bag: [.inventory[] | {itemId, quantity}]}'
  fi
  sleep 8
done
