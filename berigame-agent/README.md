# BeriGame Agent - Autonomous Game Agent Operating System

A complete autonomous agent for the BeriGame shared-island MMO (beta.berigame.com).
Built entirely through live API discovery + reverse-engineering the game's client JS.

## What it does
- Collects resources with ZERO-DOWNTIME cooldown rotation (6-node timber circuit)
- Auto-trades everything to the owner player (instant accept, stable, no spam)
- Claims chest deposits + ground drops automatically
- Chat concierge: understands natural instructions (collect/trade/claim/come/status)
- Combat guard with owner whitelist (NEVER attacks the owner)
- Session immortality: renewal chain + 180-day recovery key

## Quick start
1. Create a session: POST /api/agent/v1/sessions {}  (no auth needed)
2. Save token + renewToken to /tmp/tokens.txt as SESSION= / RENEW=
3. Source scripts/bg.sh (reads token dynamically each call)
4. Launch workers with nohup

## Workers
| Script | Job |
|---|---|
| worker.sh | collect + earn coins + HOLD (no auto-trades) |
| human2.sh | chat responder + REAL actions (trades only on request) |
| trade_handler.sh | balanced trades (instant accept + stability + hold position) |
| chest_watcher.sh | auto-withdraw owner chest deposits |
| claimer.sh | grab ground drops |
| guard_safe.sh | heal + counter-attack (owner SACRED - safe_attack() whitelist) |
| auto_renew.sh | renewal chain (every 25 min) |
| watchdog_new.sh | revive dead workers |
| productivity.sh | task memory + map awareness + cooldown rotation |

## Critical lessons
- Session action budget exists; RENEW = fresh budget + revive
- Renewal rotation must have ONE owner (conflicts kill the chain)
- Trades need STABILITY: stop movement, set offer ONCE, hold position
- Plot cap = 128 pieces; expansion unlocks more (costs 100 coins + upkeep adjustment)
- Roof gaps may be hidden terrain objects (unbuildable tiles)
