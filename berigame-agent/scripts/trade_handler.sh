#!/bin/bash
source /tmp/bg.sh
MER='c2000e251292ab830f8a94d6c971d998a58b75fc93689f37ed82ce144e38a3ec'
echo '=== SMART TRADE HANDLER (balanced + reliable!) ==='
echo 'RULES: accept Mersal instantly + hold stable + load right + confirm clean!'
while true; do
  S=$(bg GET /state)
  TID=$(echo "$S" | jq -r '.trade.id // empty')
  ST=$(echo "$S" | jq -r '.trade.status // empty')
  WITH=$(echo "$S" | jq -r '.trade.with // empty')
  if [ -n "$TID" ] && [ "$WITH" = "$MER" ]; then
    echo "$(date +%T) 🤝 trade $TID with BOSS - status: $ST"
    # 1. ACCEPT his request INSTANTLY!
    if [ "$ST" = "requested_by_them" ]; then
      echo "$(date +%T) ✅ accepting boss's request!"
      bg POST /actions/trade_respond "{\"tradeId\":\"$TID\",\"answer\":\"accept\"}" >/dev/null
      bg POST /actions/stop '{}' >/dev/null
      sleep 3
    fi
    # 2. LOAD the goods ONCE + coins (stability!) 
    ST2=$(bg GET /state | jq -r '.trade.status // empty')
    if [ "$ST2" = "open" ]; then
      OFFER=$(bg GET /state | jq -r '[.inventory[] | select(.itemId!="stone_club" and .itemId!="stick" and .itemId!="axe" and (.itemId|test("berry")|not))] | group_by(.itemId) | map("\(.[0].itemId):\(map(.quantity)|add)") | join(",")')
      CO=$(bg GET /state | jq '.frontier.profile.coins')
      echo "$(date +%T) 📦 loading: $OFFER + $CO coins"
      [ -n "$OFFER" ] && bg POST /actions/trade_offer "{\"tradeId\":\"$TID\",\"offer\":\"$OFFER\"}" >/dev/null
      sleep 3
      [ "${CO:-0}" -gt 0 ] && bg POST /actions/trade_coins "{\"tradeId\":\"$TID\",\"coins\":$CO}" >/dev/null
      sleep 3
      # 3. CONFIRM (then HOLD STILL!)
      bg POST /actions/trade_confirm "{\"tradeId\":\"$TID\"}" >/dev/null
      echo "$(date +%T) ⏳ confirmed - HOLDING POSITION for boss!"
      sleep 8
    fi
    sleep 3
    continue
  fi
  # no trade - just watch quietly (NO spam requests!)
  sleep 10
done
