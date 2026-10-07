#!/bin/bash
source /tmp/bg.sh
ME='c20005f8378e7f08e1f9194eca8a0dba0ef367dae5e0d9d85bee3fd388c1ef1f'
MERSAL='c2000e251292ab830f8a94d6c971d998a58b75fc93689f37ed82ce144e38a3ec'
safe_attack() {
  local T="$1"
  if [ -z "$T" ] || [ "$T" = "$ME" ] || [ "$T" = "$MERSAL" ]; then
    echo "$(date +%T) 🛡️ BLOCKED attack on $T (Mersal is SACRED!)"
    return 1
  fi
  echo "$(date +%T) ⚔️ striking hostile $T"
  bg POST /actions/attack "{\"playerId\":\"$T\"}" >/dev/null
}
while true; do
  S=$(bg GET /state)
  HP=$(echo "$S" | jq -r '.player.health // 20')
  MAX=$(echo "$S" | jq -r '.player.maxHealth // 30')
  TGT=$(echo "$S" | jq -r '.player.combatTarget // empty')
  WPN=$(echo "$S" | jq -r '.player.weapon.itemId // empty')
  # RULE: ONLY fight non-Mersal targets in active combat!
  if [ -n "$TGT" ]; then safe_attack "$TGT"; sleep 2; continue; fi
  # RULE: heal INSTANTLY when hurt (but NO revenge strikes at all!)
  if [ "$HP" -lt "$MAX" ]; then
    echo "$(date +%T) 💚 healing ($HP/$MAX)"
    SLOT=$(echo "$S" | jq -r '[.inventory[] | select(.itemId=="berry_goldberry" or .itemId=="berry_mash" or .itemId=="travel_rations" or .itemId|test("berry")) | .slot] | first // empty')
    [ -n "$SLOT" ] && bg POST /actions/eat "{\"slot\":$SLOT}" >/dev/null
    sleep 3; continue
  fi
  # keep weapon ready (self only!)
  if [ -z "$WPN" ]; then
    SS=$(echo "$S" | jq -r '[.inventory[] | select((.itemId=="stone_club" or .itemId=="stick") and .slot<=2) | .slot] | first // empty')
    if [ -z "$SS" ]; then SS=$(echo "$S" | jq -r '[.inventory[] | select(.itemId=="stone_club" or .itemId=="stick") | .slot] | first // empty'); [ -n "$SS" ] && bg POST /actions/inventory_move "{\"from\":$SS,\"to\":2}" >/dev/null && sleep 1 && SS=2; fi
    [ -n "$SS" ] && bg POST /actions/wield "{\"slot\":$SS}" >/dev/null
  fi
  sleep 5
done
