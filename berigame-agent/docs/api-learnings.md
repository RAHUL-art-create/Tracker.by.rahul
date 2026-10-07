# BeriGame API - Decoded Command Reference

All knowledge reverse-engineered from the game client JS + live API discovery.

## Frontier commands (POST /api/agent/v1/actions/frontier)
Body: {"command": "<JSON string>"}  (the command string is itself JSON!)

| Action | Payload |
|---|---|
| walk | {action:"walk",id:"settlement"\|"bramblewild",x,z} (home island only!) |
| move | {action:"move",x,z} (other islands: cinder/reedwake/sea) |
| sail | {action:"sail",x,z} (sea coordinates!) |
| dock | {action:"dock",id:"cinder"\|"reedwake"\|"bramblewild"} |
| disembark | {action:"disembark"} (REQUIRED before moving on foreign islands!) |
| board | {action:"board",id:"skiff-227"} |
| pilot | {action:"pilot"} |
| gather | {action:"gather",id:"settlement-timber"} (frontier resources) |
| build | {action:"build",id:"settlement-9",item:"roof",x,z,rotation} |
| move_building | {action:"move_building",id:"piece-123",x,z,rotation} |
| dismantle | {action:"dismantle",id:"piece-123"} (75% materials back) |
| container | {action:"container",id:"piece-212",target:"withdraw"\|"deposit",item,quantity} |
| permit | {action:"permit",id:"settlement-15",target:"<playerId>",permissions:7} |
| boat_permit | {action:"boat_permit",id:"skiff-227",target,permissions:7} |
| specialize | {action:"specialize",disciplines:[3,1],earlySwitch:true} |
| quest | {action:"quest",id:"supplies"} (claims need proximity to steward!) |
| order | {action:"order",id:"timber"} (delivers 8 timber = 10 coins, 60/day cap!) |
| talk | {action:"talk",id:"steward"\|"shipwright"} |
| craft | {action:"craft",id:"planks"\|"rope"\|"taming_feed"\|"hammer"\|"axe"...} |
| observe/tame/train/companion/ability | {action:"observe",id:"burrowbun-1"} etc. |
| claim | {action:"claim",id:"settlement-15"} (needs 50 coins: deed 20 + tax 30!) |
| survey | {action:"survey"} (other islands - hidden caches!) |
| boat | {action:"boat"} (assemble skiff: 1 hull + 1 sail!) |
| expedition | {action:"start"\|"take"\|"roll"\|"bait"\|"feed"...,expeditionId,x,z} |
| plant/harvest_crop | {action:"plant",id:"piece-157"} / {action:"harvest_crop",id} |
| restore_shrine | {action:"restore_shrine",id:"reedwake"} |

## REST actions (/actions/*)
- harvest {nodeId} - grove/coast nodes (berry/driftwood/tide_rock/obsidian)
- craft {recipe} - stone_club (driftwood+2flint), berry_mash, flint_knife
- trade_request {playerId} / trade_offer {tradeId,offer:"item:qty,..."} / trade_coins / trade_confirm / trade_respond {tradeId,answer}
- pickup {id} - ground items (5-min TTL!)
- wield {slot} / unwield / inventory_move {from,to}
- attack {playerId} / eat {slot} / chat {text} (200 char limit!)
- name {name} / follow / friend_add

## Session management
- POST /sessions {} - new character (no auth!)
- POST /renewals (Bearer renewToken) - fresh session + ROTATED renewToken + FRESH ACTION BUDGET!
- POST /recovery (Bearer session) - export 180-day recovery key!
- POST /recover (Bearer recoveryToken) - restore character!

## Key timings
- gather: 3s | node regrow: 12s | walk: ~0.7s/tile
- trade window: ~50s | offer change clears confirmations
- feeding spacing: 60s | trade cancel distance: 6 tiles
- ground item TTL: 500 ticks (5 min!)
- plot cap: 128 pieces (tier 0); expansion = 100 coins + upkeep adjustment
