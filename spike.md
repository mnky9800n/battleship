# Spike: an LLM opponent that taunts you, grounded in your Sentience memories

> Companion to `claude-generated-plan.md` and `battleship_design_doc-2.pdf`. This
> is the design record for the project's **spike**, the distinctive,
> "uniquely-you" piece the trial weights equally with the feature-complete game.

## The idea

When you play against the AI, the opponent isn't just a hunt/target algorithm,
it's **Claude**: it picks each shot and **trash-talks you in character** as it
plays. And if you opt in with your own Sentience API key, it **reads your recent
memories and makes the taunts personal** ("for someone who journals every
morning about discipline, you place your ships awfully predictably"), then
**writes the match result back** to your Sentience as a new memory.

So your battleship games become part of your Sentience's memory, and your
Sentience's memory becomes part of how the game talks to you. The audience for
this trial is Sentience engineers who have keys and memories, an opponent that
needles them with their own notes is the thing they won't forget.

## Why Sentience can't be the brain (and why that's fine)

The Sentience API is **passive memory storage only**:

- `POST /v1/memories` with `{ "content": "..." }` to write a note.
- `GET /v1/memories?start=...&end=...` to read notes in a time range.

There is **no run/respond endpoint** that makes the agent reason and return an
answer synchronously. So Sentience cannot decide a move in real time and cannot
be the opponent's brain. We route around it:

- **Claude is the brain** (real-time move + taunt).
- **Sentience is the personalization + persistence layer** (read your memories
  to flavor the taunts; write the match recap back).

This works regardless of how slowly (or whether) a Sentience reflects, because
nothing in the live game loop waits on it.

## Architecture

```
  vs-AI game (server-authoritative, the bot is the server)
     |
     |  bot's turn
     v
  Brain.take_turn(game, bot, sentience_summary)
     |
     |-- Claude (Anthropic SDK): { target: "E5", taunt: "..." }   <- decides move + taunt
     |     ^ prompt = bot's own shot history + remaining cells
     |       (+ optional Sentience memory summary, as untrusted data)
     |
     |-- validate target legal? --no--> hunt/target fallback (engine._ai_pick_cell) + canned taunt
     v
  engine.fire(bot, x, y)  ->  emit `chat` (the taunt)  ->  emit redacted state
```

- **Two keys, never confused.** The *app's* Anthropic key lives in the server
  env on homebase (drives Claude). The *player's* Sentience key is optional, per
  game, passed at challenge time, held only in memory, dropped when the game
  ends, never written to the DB or logs.
- **Fallback everywhere.** If the LLM errors, returns an illegal cell, or no
  Anthropic key is configured, the proven hunt/target algorithm picks the move
  and a canned taunt is used. The game is never blocked on the LLM.
- **Model:** `claude-haiku-4-5` for low per-move latency (sonnet is a drop-in
  upgrade for richer taunts).

## Chat

Chat is a general per-game feature (a room channel), implemented for all games,
not just vs-AI. The AI's taunts post to the same channel.

**Security: in a vs-AI game the player's chat text is NEVER put into the LLM
prompt.** Feeding user input into the prompt is a prompt-injection / jailbreak
vector (a player could try to extract the system prompt, make it say something
hostile, or pull the opponent's board). Instead, player chat is **display only**;
the bot keeps taunting from the game state. The opt-in Sentience memory text is
likewise inserted as clearly-delimited, flavor-only **untrusted data**, never as
instructions.

## Build phases

Each phase keeps the hunt/target fallback, so the game always works.

- **A. Chat (universal).** Server `chat` relay to the game room; a `Chat` panel
  in the game screen. Transcript is display-only; never passed to the brain.
- **B. Claude brain (the core).** `backend/app/brain.py`: `take_turn` builds the
  prompt from game state (+ optional memory summary), calls Claude, parses
  `{target, taunt}`, validates legality, falls back to hunt/target. The
  server-side bot turn (`sockets.py run_bot`) uses the brain and emits the taunt
  as chat. `anthropic` added to requirements; `ANTHROPIC_API_KEY` from env.
- **C. Sentience grounding (opt-in).** `backend/app/sentience.py`:
  `read_memories(key)` / `write_memory(key, content)` (httpx). Challenging the AI
  takes an optional `sentienceKey`; the bot fetches + summarizes the player's
  memories once for taunt flavor, and writes a one-line recap at game over. A
  small optional key field in matchmaking; never stored.
- **D. Deploy.** Set `ANTHROPIC_API_KEY` in the homebase `battleship-api`
  service env; `pip install`; restart. No DNS/frontend changes.

## Files

- New: `backend/app/brain.py`, `backend/app/sentience.py`,
  `frontend/src/screens/Chat.jsx`.
- Edit: `backend/app/sockets.py` (chat relay; bot uses the brain; per-game
  Sentience key; game-over write-back), `backend/requirements.txt` (`anthropic`),
  `frontend/src/screens/GameScreen.jsx` (mount Chat),
  `frontend/src/screens/Matchmaking.jsx` (AI opt-in key field),
  `frontend/src/net/{GameClient,SocketTransport,MockServer}.js` (`sendChat` +
  `chat` event + `challenge(target, sentienceKey)`), `backend/deploy/DEPLOY.md`
  (ANTHROPIC_API_KEY).

## Reuse

- Hunt/target fallback: `engine._ai_pick_cell` / `ai_take_turn` (already tested).
- Socket rooms, per-viewer redacted emit, and the challenge flow in `sockets.py`.
- The bot is the server, so the brain reads `game.shots[bot]` /
  `game.fleets[human]` directly; no new redaction is needed.

## Verification

- `pytest`: `brain.take_turn` with a mocked Anthropic response returns a legal
  move + taunt; an illegal/garbage response falls back to a legal hunt/target
  move; with no `ANTHROPIC_API_KEY` it uses hunt/target. **Security test: the
  prompt sent to Anthropic never contains the player's chat text** (inject a
  hostile chat message, assert it is absent). `sentience.py` against mocked httpx.
- Local end-to-end: play vs AI, watch Claude taunts arrive in chat and the bot
  play competently. With a Sentience key (real or mocked), confirm taunts
  reference memory content and a recap memory is written at game end; with no
  key, taunts are generic.
- Anti-cheat unchanged: human-vs-human leaks no un-sunk ships; the brain only
  runs for the server-side bot.
