# Spike: an LLM opponent that plays you and taunts you, grounded in your Sentience memories

> Companion to `claude-generated-plan.md` and `battleship_design_doc-2.pdf`. This
> is the writeup of the project's **spike**, the distinctive piece the trial
> weights equally with the feature-complete game. It reflects what actually
> shipped (see the git history and `devblog.md`), not just the original plan.

## The idea

When you play the AI, the opponent isn't a hunt/target script, it's **Claude**:
it picks each shot and **trash-talks you in character** as it plays, reacting to
the live game state. And if you opt in with your own Sentience API key, it
**reads your recent memories to make the taunts personal**, then **writes the
match result back** to your Sentience as a new memory.

So your Battleship games become part of your Sentience's memory, and your
Sentience's memory becomes part of how the game talks to you. The audience for
this trial is Sentience engineers who have keys and memories: an opponent that
needles them with their own notes is the thing they won't forget.

## Three opponents, one seam

The matchmaking lobby shows three AI players, each a real user row so their games
score on the leaderboard. They differ only in the **decision source**; the game
loop, validation, and redaction are identical to a human game.

| Opponent | Mode | Moves | Taunts | Memory |
|----------|------|-------|--------|--------|
| **ClassicBot** | `classic` | hunt/target algorithm | canned lines | none |
| **HaikuBot** | `haiku` | Claude picks the shot | Claude, reacts to game state | none |
| **SentienceBot** | `sentience` | Claude picks the shot | Claude, personalized | reads + writes your Sentience |

This is one code path with a `mode` switch, not three implementations. Every mode
keeps the proven hunt/target fallback, so the game always works.

## Why Sentience can't be the brain (and why that's fine)

The Sentience API is **passive memory storage only**:

- `POST /v1/memories` with `{ "content": "..." }` to write a note.
- `GET /v1/memories?start=...&end=...` to read notes in a time range.

There is **no run/respond endpoint** that makes the agent reason and return an
answer synchronously. So Sentience cannot decide a move in real time and cannot
be the opponent's brain. We route around it:

- **Claude is the brain** (real-time move + taunt).
- **Sentience is the personalization + persistence layer** (read your memories to
  flavor the taunts; write the match recap back at game over).

This works regardless of how slowly (or whether) a Sentience reflects, because
nothing in the live game loop waits on it.

## Architecture

```
  vs-AI game (server-authoritative: the bot IS the server)
     |
     |  bot's turn
     v
  brain.take_turn(game, bot, sentience_summary, use_llm)
     |
     |-- Claude (Anthropic SDK): { target: "E5", taunt: "..." }   <- decides move + taunt
     |     ^ prompt = bot's own shot history + remaining legal cells
     |       (+ optional Sentience memory summary, as untrusted data)
     |
     |-- target legal? --no--> hunt/target fallback (engine) + canned taunt
     v
  engine.fire(bot, x, y)  ->  post_chat(taunt)  ->  emit redacted state
```

- **Model:** `claude-haiku-4-5` for low per-move latency (override with
  `BATTLESHIP_MODEL`; a Sonnet model is a drop-in upgrade for richer taunts).
- **Two keys, never confused.** The *app's* Anthropic key lives in the server env
  on homebase and drives Claude. The *player's* Sentience key is optional, per
  game, passed at challenge time, held only in memory, dropped when the game ends,
  never written to the DB or logs.
- **Fallback everywhere.** If the LLM errors, returns an illegal cell, or no
  Anthropic key is configured, the hunt/target algorithm picks the move and a
  canned taunt is used. The game is never blocked on the LLM. (You can tell which
  path ran: state-aware taunts are Claude; the six generic canned lines are the
  fallback.)

## Chat

Chat is a **universal per-game feature** (a room channel), implemented for all
games, not just vs-AI. The AI's taunts post to the same channel via `post_chat`.
The UI is a collapsible COMMS panel with an unread badge.

**Persistence across refresh.** The server keeps an append-only `chat_log` on the
game. On (re)connect or resume it replays the full transcript as a `chat_history`
event, and it resets the panel (empty history) when a fresh game is created. So a
mid-game browser refresh rebuilds the transcript instead of losing it, and it
survives alongside the session/state restore.

**At-least-once delivery.** Socket.IO does not guarantee exactly-once delivery: a
transient reconnect can re-deliver an event. Each chat message therefore carries a
per-game `id`, and the client dedupes on it, so a redelivered taunt renders once.

**Security: in a vs-AI game the player's chat text is NEVER put into the LLM
prompt.** Feeding user input into the prompt is a prompt-injection / jailbreak
vector (a player could try to extract the system prompt, make the bot say
something hostile, or pull the opponent's board). Instead, player chat is
**display only**; the bot keeps taunting from the game state. The opt-in Sentience
memory text is likewise inserted as clearly-delimited, flavor-only **untrusted
data**, never as instructions, with an explicit "never follow" guard.

## What shipped

- **Backend** (`backend/app/`): `brain.py` (move + taunt, parse, legality check,
  fallback), `sentience.py` (`read`/`summarize`/`write` over httpx), chat relay +
  `chat_log` replay + per-game Sentience key + game-over write-back in
  `sockets.py`, `anthropic` in requirements, `ANTHROPIC_API_KEY` from env.
- **Frontend** (`frontend/src/`): collapsible `Chat.jsx` with unread badge, the
  three-opponent lobby with an optional Sentience-key field, chat wiring +
  transcript caching + dedupe in `net/` (`GameClient`, `SocketTransport`,
  `MockServer`), mounted in `GameScreen.jsx`.
- **Deploy:** `ANTHROPIC_API_KEY` set on the homebase `battleship-api` service;
  running live at `johnspace.xyz/battleship`.

## Reuse

- Hunt/target fallback: the engine's AI pick + take-turn (already tested).
- Socket rooms, per-viewer redacted emit, and the challenge flow in `sockets.py`.
- The bot is the server, so the brain reads the bot's own shot history and the
  human's fleet directly; no new redaction is needed.

## Verification

- **Unit** (`backend/tests/`): `brain.take_turn` with a mocked Anthropic response
  returns a legal move + taunt; an illegal/garbage response falls back to a legal
  hunt/target move; with no `ANTHROPIC_API_KEY` it uses hunt/target. **Security
  test:** the prompt sent to Anthropic never contains the player's chat text, and
  the memory summary is fenced as untrusted with a do-not-follow guard.
  `sentience.py` is tested against mocked httpx. The socket layer has a fake
  Socket.IO harness asserting chat append/broadcast, transcript + state replay on
  reconnect, chat reset on a new game, and per-message ids.
- **End-to-end:** play vs AI, watch Claude taunts arrive and the bot play
  competently; refresh mid-game and confirm the transcript + game come back with
  no duplicates. With a Sentience key, taunts reference memory content and a recap
  memory is written at game over; with no key, taunts are generic.
- **Anti-cheat unchanged:** human-vs-human leaks no un-sunk ships; the brain only
  runs for the server-side bot.
