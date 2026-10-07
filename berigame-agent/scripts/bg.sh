#!/bin/bash
BASE='https://beta.berigame.com/api/agent/v1'
bg() {
  local method="$1" path="$2" data="$3"
  if [ -z "$data" ]; then data='{}'; fi
  local TOKEN=$(grep '^SESSION=' /tmp/tokens.txt | cut -d= -f2)
  curl -s -X "$method" "$BASE$path" \
    -H 'User-Agent: BeriGame-Agent/1.0' \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: $(date +%s%N)-$RANDOM" \
    -d "$data"
}
