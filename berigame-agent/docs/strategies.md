# BeriGame Strategies & Game Data

## Resource map (settlement/Meadows)
- Timber x6: (33,52) (29,47) (29,58) (29,70) (33,82) (29,94)
- Stone: (33,56) | Fibre: (33,72) | Clay: (33,76)
- Greenberry: (29,54) | Strawberry: (29,74)

## Reedwake island
- Reeds (113,12) Resin (113,26) Fibre (113,40) Timber (113,54)
- CARROT SEEDS (113,68) | Greenberry (113,82)

## Cinder island
- IRON ORE (113,12) Stone (113,26) Clay (113,40) Timber (113,54)

## Grove/Coast (home island)
- Berries x6: (40,30) (30,35) (20,30) (30,25) (15,20) (25,15)
- Driftwood: (25,3) (46,25) (25,46) (3,25)
- Tide rock (flint): (39,9) (9,40) (46,46) (12,6)

## The zero-downtime rotation
While node A regrows (12s), gather node B -> C -> back to A. Camps:
- Camp A (33,54): timber (33,52) + stone (33,56) - both 2 tiles!
- Camp B (33,74): fibre (33,72) + clay (33,76) - both 2 tiles!

## Crafting chains
- planks = timber 2 -> 2 planks
- rope = fibre 3 -> 1 rope
- cloth = fibre 4 (workbench) | bricks = clay 3 + timber 1 (kiln)
- axe = timber 2 + stone 2 (DOUBLES timber yield! craft ASAP!)
- skiff_hull = planks 20 + rope 6 (harbour!) | sail = cloth 8 + rope 4 (workbench)
- iron_fittings = iron ore 2 + timber 1 (kiln, Building L5 active!)
- iron_club = timber 2 + iron_fittings 3 (workbench, Building L5!)
- taming_feed = greenberry 2 + fibre 1 (-> 2 feeds!)
- travel_rations = carrot 2 + strawberry 1 (kitchen, heals 8 HP!)

## Building pieces (rotation = edge!)
- wall rot: N=2 S=0 W=3 E=1 (corners need TWO walls!)
- floor = timber 2 | wall = timber 3 | roof = timber 1 + fibre 2
- door = timber 3 + fibre 1 | window = timber 3 | gate = timber 2 + fibre 1
- stable = planks 8 + rope 4 | chest = timber 4 + stone 2
- workbench = timber 6 + stone 2 | kitchen = stone 6 + timber 2 | kiln = clay 8 + stone 4
- planter = clay 3 | lamp = clay 2 + fibre 1 | sign = timber 1
- bookshelf = planks 4 | barrel = timber 3 + rope 1

## Taming protocol (2 feedings!)
1. Walk within 3 tiles of WILD creature
2. OBSERVE it
3. OFFER FEED (feed 1)
4. WAIT 60 seconds
5. OFFER FEED (feed 2) = YOURS!
- Ownership completes at 2 feedings
- Train pets: needs CREATURE HARNESS (cloth 2 + rope 2, Beastcraft L2 active!)
- Tamed Reedhorn = 6 cargo slots! Burrowbun = finds seed caches!

## Disciplines (pick 2, activate in town!)
- 0=Might 1=Cultivation 2=Building 3=Beastcraft 4=Exploration
- Beastcraft L2: train companions + harness | L5: 1-feeding tames!
- Cultivation L2: +1 carrot/harvest | Building L5: iron fittings!
- Exploration L2: survey caches | First activation FREE, switch = 20 coins (50 early)
- Level curve: xp needed for level t = 25*(t-1)^2

## Quest chain (in order!)
steward -> supplies (hand in 6 timber!) -> tools (craft hammer!) -> deed (claim plot 50c!)
-> shelter (floor+wall+roof!) -> observe -> feed -> tame -> order -> upkeep -> stable (BUILD STABLE!)
-> adventure (6 planks to camp!) -> shipwright -> hull -> boat -> provisions -> reedwake -> cinder
- Claims need PROXIMITY to the steward (town square 31,64)!
- Hand-in quests need the ITEMS in bag!

## Plot rules
- Claim: 50 coins (deed 20 + tax 30!) at a marker
- maxPieces 128 (tier 0, 8x8) | expand tier1 = 100 coins + upkeep adjustment + 10 planks + 10 stone
- Tiers: size 8/12/16, upgradeCoins 100/250
- Permissions: 1=deposit 7=ALL (permit action, target+permissions fields!)
- Roofs reject on hidden terrain tiles (trees/rocks!) - all rotations fail = terrain

## Giant expedition (golden fruits!)
- Start at camp (22,18) -> berry patch (34,17) -> roll berry to market (35,37) or FEAST (12,36)
- Roll = max 3 tiles on CLEAR ground | stamina breaks ~8s
- Giant bites the berry | bait with greenberry (1 per use)
- Pip steals bites | bribe with berry
- Deliver/feed = golden fruit rewards!

## Wiki
- wiki.berigame.com/wiki-index.json (article index!)
- Key pages: item-*.md for every item, expeditions.md, wildlife-companions.md, coins-quests.md
