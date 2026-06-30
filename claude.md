# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This is a **pre-code repository**: there is no application source, build, lint, or test setup yet. The repo currently holds planning material (`devblog.md`, `bullet-points.md`, `sentient-task.md`), the authoritative design (`battleship_design_doc-2.pdf`), and 3D ship assets (`assets/*.glb`). The job is to build a real-time, multiplayer Battleship web app from these docs. Once code lands, add the build/lint/test commands here.

## What this is

A Sentience engineering work-trial: build a rules-correct, web-based Battleship game with two deliverables that are weighted equally (see `sentient-task.md`):
1. **Feature-complete game** meeting all requirements.
2. **A spike** — something distinctive. The owner's intended spike is a Sentience AI integration (an AI opponent that plays, possibly taunts via chat). Constraint the owner has flagged: Sentience is only reachable by reading/writing memories through its API, with no prompt/response loop, so true AI-opponent integration is an open question — treat it as a later-stage experiment, not a blocker for the core game.

The visual concept reskins Battleship in the **isometric, particle-animation style of rainy-city.com** (https://github.com/mnky9800n/rainy-city): two ocean grids with a flat seabed, animated whales, click-to-fire events, and destruction animations. The `.glb` models in `assets/` are the in-game ships (sized 1–5 cells; attribution is in `bullet-points.md` — preserve it).

## Hard rules (from project owner)

1. **Features get built on branches**, never committed straight to `main`.
2. **PRs are sent to the owner** for review (do not self-merge).
3. **Python preferred for the backend** (the design implies Flask + WebSockets).
4. **Hosting target**: homebase via Tailscale at `100.68.78.101` (a DigitalOcean server). A separate todo is figuring out public DigitalOcean deployment for the required public URL.

## Architecture (from `battleship_design_doc-2.pdf`)

The design doc is the source of truth. Read it before building; key decisions below.

**Server is the sole authority.** The client is a thin renderer. The cheating-prevention rule drives the whole shape: **ship positions never leave the server.** Each shot returns only a redacted hit/miss/sunk result. Each player's pushed state is *their* full board plus only the *revealed* cells of the opponent's board, plus whose turn it is.

**Identity binding (anti-spoofing).** Login is `POST /login` (username + password; security is intentionally minimal — plaintext `username:password` is acceptable for the trial). The server returns a session token; the client opens a WebSocket and sends the token; the server binds that socket to the user. **A move's identity comes from the socket binding, never from the message payload** — any `user_id` in a `fire()` payload is ignored.

**Two write phases.** Game state is written in two places, and each needs server-side validation:
- **Setup phase — ship placement.** Placing ships populates each player's board (server-side only, since positions must never leave the server). Validate every placement: on-grid, non-overlapping, correct fleet (Carrier-5, Battleship-4, Cruiser-3, Submarine-3, Destroyer-2); only accept "Ready!" once all ships are placed. The board freezes when both players are ready.
- **Playing phase — `fire(cell)`.** Once boards are frozen, this is the only path that mutates the game forward. The validation pipeline, in order: (1) is the sender a player bound to this game? → else drop; (2) is it the sender's turn and the game live? → else reject "not your turn"; (3) is the target legal (in range, not already fired)? → else reject "invalid target"; (4) resolve hit/miss/sunk, append to the move log, push redacted results to both clients.

**Persistence & replay.** Each game has a unique id; the record holds both boards, the turn pointer, status, and an **append-only move log of `(player, x, y, result)`**. Reconnection replays the log *filtered to that player's visibility* to rebuild client state — this is how mid-game refresh survives. Store completed game history (moves, outcome, timestamps) so it can be queried later; pick and justify the storage layer.

**Real-time everywhere.** WebSockets keep clients live with no manual refresh: online/offline presence in matchmaking, leaderboard updates even mid-game, and instant challenge notifications.

### Game lifecycle (state machine)

- **Lobby/challenge flow:** `Idle` (available) → player A challenges B → `Challenge pending` → on accept, `Game created` (enter setup); on decline/expire/cancel, both return to lobby.
- **In-game flow:** `Setup` (placing ships) → both ready → `Playing` (turns alternate) → all ships sunk → `Game over` → `Back in lobby`. A dropped socket goes `Playing → Disconnected` (grace timer running); reconnect returns to `Playing`, grace timeout = forfeit.
- **Per-turn loop** (hidden inside "Playing"): validate it's your turn → validate the cell wasn't already hit → resolve hit/miss/sunk → check win → swap active player. Only the win check exits to "Game over."
- **Timers:** a single **60-second grace timer** covers both timeout cases — an unanswered challenge, and an in-game disconnect/quit (which forfeits). The design also notes a 15-second turn countdown that can end a game without all-ships-sunk.

### Core domain rules

Standard Battleship on a **10×10 grid** (columns A–J, rows 1–10). Fleet: Carrier-5, Battleship-4, Cruiser-3, Submarine-3, Destroyer-2. Ships are horizontal/vertical only, fully on-grid, non-overlapping (may be adjacent). One shot per turn regardless of hit. A ship is "sunk" when all its cells are hit, and the sink announces *which* ship.

**Game modes:** (1) **vs AI** — AI ships placed randomly; AI shot logic must be at least moderately smart (probe cells adjacent to a hit, not pure random). (2) **vs Human** — two browser windows in real time, both updating without refresh.

**Terms:** *User* = website account (username/password). *Player* = in-game participant with a tracked board; can be human or AI (only the decision source differs). *Online* = currently logged in.

### Frontend views (wireframes in the design doc)

- **Start page:** animated ship hero + username/password login + "create new user."
- **App shell:** header (`battleship!`, "Active battle available" challenge indicator, logout) + three tabs (`matchmaking`, `game`, `leaderboard`) + main viewer + footer. Lands on matchmaking after login.
- **Matchmaking:** scrollable user list with presence dots (green online / red offline / robot = AI), selected user's profile (avatar, Wins/Losses), and a "CHALLENGE TO BATTLE!" button that notifies the target.

  **Avatar assignment (feature):** on account creation, a user is automatically assigned an avatar — a headshot of a character from the movie *Hackers* — pulled from a not-yet-existing assets directory of those headshots (separate from the `.glb` ship models in `assets/`). The avatar is stored on the user and shown as their profile image in matchmaking and the leaderboard. The design's "user can click to upload" remains a later override of this default.
- **Game (setup):** isometric battle map, draggable ship menu using the real `.glb` assets, drag-drop placement with splash, zoom on scroll, a "Ready!" button (enabled only when all ships placed) and an enemy-readiness indicator.
- **Game (play):** two maps side by side — your fleet (incoming hits) and your shots on the enemy — with an active-turn indicator, "Confirm target!" (enabled only on your turn with a cell selected), destruction animations (5× on hit, 1× on miss), sunk ships recolored red, and a win/loss popup that returns to matchmaking.
- **Leaderboard:** Player / Wins / Losses, ordered by wins, live even during play.

## Notes & gotchas

- `claude.md` (lowercase) is an untracked duplicate of this file; edit `CLAUDE.md` (the tracked one) and avoid divergence.
- `devblog.md` is an ongoing build journal the owner maintains; the trial expects an AI-written summary of it before delivery, plus a writeup of the approach and the chosen spike.
- The repo must eventually be shared with these GitHub users (from `sentient-task.md`): skececi, JulesLabador, iltenahmet, royce-sentience, aleks-azen, prathamodi, aayushkt, teddyschoenfeld.
- Runtime-complexity note from the design: shots are O(1) coordinate lookups, so the model scales to large boards.
