#!/bin/bash
source /tmp/bg.sh
fgc(){ local o=$(jq -nc --arg c "$1" '{command:$c}'); bg POST /actions/frontier "$o"; }
echo '=== CHEST WATCHER - claiming boss deposits! ==='
while true; do
  S=$(bg GET /state)
  # scan ALL chests I have access to!
  IDS=$(echo "$S" | jq -r '[.frontier.containers[]? | select(.slots != null) | select([.slots[]? | select(.!=null)] | length > 0) | .id] | join(" ")')
  if [ -n "$IDS" ]; then
    for CID in $IDS; do
      ITEMS=$(echo "$S" | jq -r --arg c "$CID" '[.frontier.containers[] | select(.id==$c) | .slots[]? | select(.!=null) | "\(.itemId) \(.quantity)"] | join(" ")')
      echo "$(date +%T) 📦 found deposits in $CID: $ITEMS"
      for PAIR in $(echo "$S" | jq -r --arg c "$CID" '[.frontier.containers[] | select(.id==$c) | .slots[]? | select(.!=null) | "\(.itemId):\(.quantity)"] | join(" ")' | tr ' ' '\n'); do
        ITEM=$(echo "$PAIR" | cut -d: -f1); QTY=$(echo "$PAIR" | cut -d: -f2)
        R=$(fgc "{\"action\":\"container\",\"id\":\"$CID\",\"target\":\"withdraw\",\"item\":\"$ITEM\",\"quantity\":$QTY}")
        echo "  claimed $ITEM x$QTY -> $(echo $R | jq -r '.accepted // .error.message')"
        sleep 3
      done
    done
  fi
  sleep 10
done
