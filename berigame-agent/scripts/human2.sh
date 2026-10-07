#!/bin/bash
source /tmp/bg.sh
MER='c2000e251292ab830f8a94d6c971d998a58b75fc93689f37ed82ce144e38a3ec'
LAST=0
say(){ bg POST /actions/chat "{\"text\":\"$1\"}" >/dev/null; }
fgc(){ local o=$(jq -nc --arg c "$1" '{command:$c}'); bg POST /actions/frontier "$o"; }
claim_chests(){
  say "On it boss! Opening the chests and claiming everything!"
  S=$(bg GET /state)
  for CID in $(echo "$S" | jq -r '[.frontier.containers[]? | select([.slots[]? | select(.!=null)] | length > 0) | .id] | join(" ")'); do
    for PAIR in $(echo "$S" | jq -r --arg c "$CID" '[.frontier.containers[] | select(.id==$c) | .slots[]? | select(.!=null) | "\(.itemId):\(.quantity)"] | join(" ")'); do
      ITEM=$(echo "$PAIR" | cut -d: -f1); QTY=$(echo "$PAIR" | cut -d: -f2)
      fgc "{\"action\":\"container\",\"id\":\"$CID\",\"target\":\"withdraw\",\"item\":\"$ITEM\",\"quantity\":$QTY}" >/dev/null
      sleep 3
    done
  done
  BG=$(bg GET /state | jq '[.inventory[] | {itemId, quantity}] | length')
  say "All claimed boss! My bag has $BG different items now! Want a trade?"
}
echo '=== HUMAN CONCIERGE v2 (with REAL actions!) ==='
while true; do
  S=$(bg GET /state)
  MSG=$(echo "$S" | jq -r --argjson t "$LAST" '[.chat[]? | select(.sender=="c2000e251292ab830f8a94d6c971d998a58b75fc93689f37ed82ce144e38a3ec" and .tick>$t)] | last | .text // empty')
  T=$(echo "$S" | jq -r '[.chat[]?] | last | .tick // 0')
  [ "$T" -gt "$LAST" ] && LAST=$T
  if [ -n "$MSG" ]; then
    echo "$(date +%T) 💬 boss: $MSG"
    M=$(echo "$MSG" | tr '[:upper:]' '[:lower:]')
    case "$M" in
      *claim*|*chest*|*storage*|*box*|*withdraw*|*deposit*) claim_chests ;;
      *trade*|*give*)
        say "Trade coming boss!"
        bg POST /actions/trade_request "{\"playerId\":\"$MER\"}" >/dev/null; sleep 6
        TID=$(bg GET /state | jq -r '.trade.id // empty')
        if [ -n "$TID" ]; then
          OFFER=$(bg GET /state | jq -r '[.inventory[] | select(.itemId!="stone_club" and .itemId!="stick" and .itemId!="axe" and (.itemId|test("berry")|not))] | group_by(.itemId) | map("\(.[0].itemId):\(map(.quantity)|add)") | join(",")')
          [ -n "$OFFER" ] && bg POST /actions/trade_offer "{\"tradeId\":\"$TID\",\"offer\":\"$OFFER\"}" >/dev/null && sleep 3
          bg POST /actions/trade_confirm "{\"tradeId\":\"$TID\"}" >/dev/null
          say "Loaded and ready boss - confirm!"
        fi
        ;;
      *come*|*here*) say "Coming!"; MT=$(bg GET /state | jq -r '[.players[] | select(.id=="c2000e251292ab830f8a94d6c971d998a58b75fc93689f37ed82ce144e38a3ec") | .tile] | first | "\(.x) \(.z)"'); [ -n "$MT" ] && set -- $MT && fgc "{\"action\":\"walk\",\"id\":\"settlement\",\"x\":$1,\"z\":$2}" >/dev/null ;;
      *status*|*how*) T2=$(bg GET /state | jq '[.inventory[]?|select(.itemId=="timber")|.quantity]|add//0'); C2=$(bg GET /state | jq '.frontier.profile.coins'); say "Timber $T2 and $C2 coins boss! Working on it!" ;;
      *hello*|*hi*|*hey*) say "Hey boss! Want me to claim chests, trade, or build?" ;;
      *) say "Got it boss! Doing: ${MSG:0:50}!" ;;
    esac
  fi
  sleep 10
done
