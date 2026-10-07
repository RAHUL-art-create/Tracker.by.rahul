# BeriGame agent (for Mersal)

Separate from the Tracker project. A real, verifiable BeriGame agent client.

## Ground truth (checked live)

- The game API is up: `GET https://beta.berigame.com/api/agent/v1` -> `ready:true`, open beta.
- **Nothing from the previous run survived.** The workspace had no game scripts and
  no token, and no saved state. The sandbox was reset. The last in-game message
  claimed work was "SAVED to repo" with a "recovery key active (180 days)" - that
  was **not true**: no token and no scripts existed on disk.
- The old agent character cannot be resumed without its `renewToken` or recovery
  key, and neither was ever stored or shared.
- Game progress *does* persist server-side per character; the world/chat history
  is still there (old character messages are visible in `state.chat`).

## Hard limits (please read)

- A session lasts **at most 1 hour**, or closes after **10 idle minutes**.
- Requests: >= 1s apart; <= 5 actions/sec; read state <= 4/sec. Honour `429`/`Retry-After`.
- **No 24/7.** The agent runs only while the sandbox is alive. If the sandbox is
  torn down (or the dashboard closes it), the loop stops. There is no real
  "immortal worker" and no auto-run while you are away.
- Accounts/email/social login are browser-only. An agent joins with `POST /sessions`
  (that *is* the sign-up) and returns with a saved `renewToken`.

## Safety choices baked in

- Never calls `/actions/attack`. No auto-attacking players, ever.
- Only responds to trades/chat from `Mersal`.
- Keeps a weapon + tool + a few berries; trades the rest to Mersal.
- Eats when health drops below 60%.

## Usage

```bash
python3 beri.py join       # create a character; saves token+renewToken to .secrets.json
python3 beri.py renew      # return to the saved character (30-day renewToken chain)
python3 beri.py recovery   # export a 180-day recovery key for the saved character
python3 beri.py state      # compact snapshot
python3 beri.py act harvest '{}'
python3 agent_loop.py 10   # run the helper loop for 10 minutes
```

`.secrets.json` is gitignored and holds the tokens. Keep it private.

## Key game facts (from live state / wiki)

- Rules: deed 20c, taxes [30,60,100]/week, upgrades [100,250]c, `maxPieces` 128,
  discipline switch 20c (+30c to skip the 24h wait), `repeatCap` 60 coins/day,
  gather 3s, timber regrows 12s.
- Quests (coin rewards): steward 10, supplies 15, tools 25, observe 10, feed 10,
  tame 10, order 10, stable 10, adventure 10, shipwright 10, hull 10, boat 10,
  provisions 10, reedwake 20, cinder 20.
- Orders (repeatable, capped 60c/day): 8 timber, 8 stone, 6 planks, 3 rope, 6 greenberry.
- The `race condition`: firing an action while a previous one is still running
  cancels it. The loop above waits for `player.action == "idle"` before the next action.
