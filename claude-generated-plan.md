# Battleship — Claude-Generated Build Plan (v1)

> Companion to `battleship_design_doc-2.pdf`. The PDF is the source-of-truth design; this document is the implementation plan derived from it, written to be iterated on. The networking/WebSockets sections are intentionally detailed since that is where the most back-and-forth is expected.

## Context

A Sentience engineering work-trial: build a rules-correct, web-based Battleship game plus a distinctive "spike." Starting point is planning docs, the design PDF, and `.glb` ship assets, no code yet.

The visual concept reuses the rainy-city.com isometric renderer: two ocean grids, animated whales, click-to-fire, destruction animations. Deployment: static frontend on GitHub Pages at `rainy-city.com/battleship`, Python backend on homebase (publicly reachable; Tailscale IP `100.68.78.101` is the deploy target).

---

## Recon result: rainy-city renderer is highly reusable

(From reading `mnky9800n/rainy-city`, ~4,900 lines of React 18 / CRA source.)

- **All isometric tile rendering is Canvas 2D** (`src/city/rendering.js` `drawTile`, `src/city/isometric.js` projection). **three.js is used in exactly one layer**, `WhaleLayer.jsx`, which loads `.glb` models with `GLTFLoader` onto a transparent canvas aligned to the grid via `getOffsets`. That is the exact mechanism we reuse to render battleship `.glb` ships.
- **Coordinate math is done and directly reusable:** `toScreenCoords` (tile→screen), `screenToTile` (screen→tile = click-to-fire), `getOffsets` (center/pan/zoom). Grid size is two constants in `constants.js` (`gridWidth`/`gridHeight`, 75×75 to 10×10).
- **Layer architecture is pluggable:** `CityRenderer.jsx` composes layers; each reads shared state from `CityContext.jsx` (zoom, pan, dimensions, tiles, offsets).
- **Keep:** isometric core, water (`SeafloorLayer`, `WaterSurfaceLayer`), `WhaleLayer`, `RainCanvas`, zoom/pan, click projection. **Drop:** terrain/coastline/elevation generation, roads, buildings, pathfinding, cars, beacons (this simplifies `CityContext` significantly, since a board is flat water).
- **Verdict:** medium conversion, high reuse. The genuinely new frontend work is 4 battleship-specific layers (grid, ships, shots, destruction).

---

## System architecture (big picture)

```
  Browser (static React build, GitHub Pages @ rainy-city.com/battleship)
     |   HTTPS  POST /login           (get session token)
     |   WSS    socket w/ token        (all real-time game traffic)
     v
  Homebase (public HTTPS/WSS, Python backend = game authority)
     |  - in-memory live game state (the source of truth during play)
     |  - SQLite (users, avatars, completed-game history, leaderboard)
     v
  SQLite file on disk
```

Two hard principles from the design doc drive everything:
1. **The server is the only authority.** The client is a thin renderer. Ship positions never leave the server; shots return only redacted hit/miss/sunk.
2. **Identity comes from the socket binding, never the message payload.** Any `user_id` inside a `fire` message is ignored.

---

## Backend (the part to go deep on)

### Why WebSockets at all

A normal web request is one-shot: the browser asks, the server answers, the connection closes. That cannot push "your opponent just fired" to you without you constantly re-asking (polling), which is laggy and wasteful. A **WebSocket** is a single connection that stays open both ways, so the server can push updates the instant they happen: opponent fired, opponent is ready, someone challenged you, leaderboard changed. The design doc's "no lag or refresh required" requirement is exactly why this is the backbone.

### Recommended stack

- **FastAPI + `python-socketio`** (ASGI, served by `uvicorn`). FastAPI handles the REST login; Socket.IO handles real-time.
- **Why Socket.IO over raw WebSockets:** it gives us, for free, three things this game needs and that are fiddly to hand-roll: **rooms** (a room per game for clean message targeting; a lobby room for presence/leaderboard broadcast), **automatic reconnection** with a stable session id (maps directly onto the grace-timer / reconnect requirement), and a clean named-event protocol. It has a matching browser client library.
- **Alternative (closer to the design doc's Flask mention):** `Flask-SocketIO`. Same Socket.IO model, sync-flavored. Open question below; either works.

### Connection lifecycle (maps to the doc's auth diagram)

1. `POST /login` with `{username, password}` (security intentionally minimal for the trial; plaintext compare is acceptable). Server returns a **session token**.
2. Browser opens the Socket.IO connection and sends the token in the connect handshake.
3. Server validates the token and **binds this socket to that user** (`sid -> user_id`). From now on the socket's identity is fixed server-side.
4. Server joins the socket to the **lobby room** (presence + leaderboard + challenge notifications).
5. On `fire`, the actor is looked up from the socket binding. A `user_id` in the payload is ignored.

### Event protocol (first draft, to refine together)

Client to server: `login` (REST), `challenge {targetUser}`, `challenge_response {gameId, accept}`, `place_ships {gameId, placements}`, `ready {gameId}`, `fire {gameId, x, y}`, `resume {gameId}`, `leave {gameId}`.

Server to client: `lobby_update {users[], presence}`, `leaderboard_update {rows[]}`, `challenge_received {fromUser, gameId}`, `game_created {gameId, opponent}`, `setup_state {yourShipsPlaced, enemyReady}`, `turn_update {activePlayer, lastShot:{x,y,result,sunkShip?}}`, `your_view {ownBoard, revealedEnemyCells, whoseTurn}`, `game_over {winner}`, `error {code, message}`.

Note the redaction: `your_view` sends **your** full board plus only the **revealed** cells of the opponent's board. Never the opponent's ship layout.

### The `fire(cell)` validation pipeline (the only in-play write path)

In strict order, rejecting at the first failure:
1. **Is the sender a player bound to this game?** else silently drop.
2. **Is it the sender's turn and the game live?** else reject `not your turn`.
3. **Is the target legal** (in range, not already fired)? else reject `invalid target`.
4. **Resolve** hit/miss/sunk, **append** `(player, x, y, result)` to the game's move log, **check win**, **push redacted results** to both clients, **swap active player** (unless game over).

(Setup-phase ship placement is a *separate* validated write path: on-grid, non-overlapping, full fleet; `ready` accepted only when all ships placed; board frozen when both ready.)

### State machines (from the doc)

- **Challenge/lobby:** `Idle`, A challenges B, `Challenge pending`, accept = `Game created` (setup); decline/expire/cancel = both back to `Idle`.
- **In-game:** `Setup`, both ready, `Playing` (turns alternate), all ships sunk, `Game over`, `Back in lobby`. `Playing` to `Disconnected` on socket drop (grace timer); reconnect returns to `Playing`; grace timeout = forfeit.
- **Timers:** single **60-second grace timer** for both an unanswered challenge and an in-game disconnect/quit. (Doc also notes a 15-second turn countdown as a second way a game can end; open question on whether to include in v1.)

### Concurrency model

- Many games run at once; a player is in **at most one** game at a time.
- Live game state lives **in memory** in a `games[gameId]` structure (boards, turn pointer, status, move log, the two player sockets). This is the authority during play.
- Async I/O (FastAPI/uvicorn or Flask-SocketIO) handles many sockets on one process. A single homebase process is plenty for this scale; no horizontal scaling needed.
- Timers (grace, turn) implemented as cancellable async tasks per game.

### Storage: SQLite (with rationale, since the doc asks)

- **Choice: SQLite**, single file on homebase. Zero-config, persistent across restarts, fully queryable (satisfies "store completed game history so it could be queried later"), ample for one server. The requirement explicitly invites choosing and justifying a storage layer.
- **Tables:** `users` (username, password, avatar, wins, losses), `games` (id, players, status, winner, created_at, ended_at), `moves` (game_id, seq, player, x, y, result) = the append-only log, persisted.
- **Refresh survival:** a mid-game **page refresh** is handled by keeping the game in memory and replaying the move log (filtered to that player's visibility) on `resume`. Surviving a **server restart** is a stretch goal: periodically snapshot live games to SQLite so they can be rehydrated. v1 targets page-refresh survival (the doc's minimum); server-restart survival is a nice-to-have.
- **Anti-cheat scaling note (doc):** shots are O(1) coordinate lookups, so the model scales to large boards.

---

## Frontend

### Stack decision

**Fork rainy-city's React 18 / CRA app** into the battleship repo and strip it to the battleship renderer. Highest reuse, least friction, since we are forking its layers directly. CRA is end-of-life; if it bites we migrate to Vite later, but it does not block v1. (Revisitable; see open questions.)

### Renderer conversion (the isolated hard part, build first)

1. Set grid to 10x10; replace terrain generation with a flat all-water board (`elevationMap` all zeros, no coastline/roads/buildings).
2. Strip city layers (Terrain, Car, Beacon, Cloud-optional, Debug, buildings, pathfinding). Keep Seafloor, WaterSurface, Whale, Rain, zoom/pan.
3. Add **GridLayer**: 10x10 cell overlay, hover highlight (reuse `hoveredTile` + `screenToTile`), cell selection for firing.
4. Add **ShipLayer**: place `.glb` ships on tiles, forking `WhaleLayer`'s three.js + `GLTFLoader` + `getOffsets` pattern; drag-drop placement during setup.
5. Add **ShotLayer**: hit/miss/sunk markers; sunk ships recolored red.
6. Add **DestructionLayer**: particle animation on fire (repurpose rainy-city's existing `destroyTiles`/destruction mode), 5x on hit, 1x on miss.

**Vertical slice to prove it first:** one 10x10 water grid + click-to-fire + one rendered `.glb` ship, driven by a **mock `your_view` object** (the exact shape the server will send). This validates the renderer against the real data contract before any backend exists.

### Views (wireframes in the design doc)

Start/login; app shell (header + 3 tabs + footer); matchmaking (presence list, profile with Hackers avatar, challenge button); game-setup (ship menu, drag-drop placement, ready button, enemy-readiness); game-play (two isometric grids side by side, turn indicator, confirm-target, destruction animations, win/loss popup); leaderboard (live).

Aesthetic direction for the non-renderer UI: Hackers (1995) meets rainy-city isometric (neon-on-black, CRT glow, rave-flyer type).

### Auth + avatars

Username/password account creation; on creation auto-assign a Hackers character headshot from an avatars asset dir (under `assets/avatars/`); shown in matchmaking + leaderboard. "Click to upload" is a later override of the assigned default.

---

## The spike (AI opponent) + Sentience note

- **vs-AI mode** is a core requirement: AI ships placed randomly, shot logic at least moderately smart (hunt/target: probe cells adjacent to a hit rather than pure random). Implement AI as just another "player" whose decisions come from code instead of a socket (the doc's User/Player distinction makes this clean).
- **Sentience integration** is the intended spike but is constrained: Sentience is only reachable by reading/writing memories via its API, with no prompt/response loop. So a true AI-opponent-via-Sentience is an open research item, not a v1 dependency. v1 ships the code-based AI; the Sentience angle is explored as a stretch experiment (e.g. persisting game memories, or taunts) once the game works.

---

## Deployment

- **Frontend:** GitHub Pages via Actions (rainy-city already deploys this exact way). Deploy battleship as a project page under the account owning the `rainy-city.com` Pages domain to reach `rainy-city.com/battleship`. Set the build base path accordingly.
- **Backend:** Python app on homebase, served over **HTTPS/WSS** with a valid cert (required so the HTTPS Pages site can connect without mixed-content blocking), CORS / WS-origin allowing `rainy-city.com`.
- Frontend points its socket/REST base URL at the homebase public HTTPS endpoint.

---

## Build sequence (milestones)

1. **Renderer vertical slice** (isolated): 10x10 water grid + click-to-fire + one `.glb` ship, driven by a mock `your_view`. Proves the hardest unknown.
2. **Backend skeleton + contract**: FastAPI/Socket.IO, login to token to socket bind, lobby room, the `your_view` / event protocol, SQLite schema. Wire the slice to a real (single-player, local) game.
3. **Core game loop**: ship placement + validation, ready, the `fire` pipeline, hit/miss/sunk, win detection, turn swap.
4. **vs-AI mode**: hunt/target AI as a code-driven player.
5. **Multiplayer**: challenge flow, two-browser real-time play, presence, leaderboard, grace timer + reconnect/replay.
6. **Persistence**: completed-game history + page-refresh survival.
7. **Polish + views**: full UI with the Hackers aesthetic, destruction animations, whales.
8. **Deploy**: Pages + homebase, end-to-end on the public URL.
9. **Spike experiment**: Sentience memory integration.
10. **Writeup**: approach + AI-usage + spike (trial deliverable), plus the AI-written devblog summary.

---

## Open design questions (for back-and-forth)

1. **Backend framework:** FastAPI + python-socketio (recommended) vs Flask-SocketIO (closer to the doc's Flask mention). Preference?
2. **Turn timer:** include the 15-second turn countdown in v1, or grace-timer-only?
3. **Server-restart survival:** v1 = page-refresh only (doc minimum), or invest in live-game snapshotting to SQLite?
4. **Frontend tooling:** keep CRA (fastest reuse) or migrate the fork to Vite up front?
5. **AI difficulty:** hunt/target only, or full probability-density targeting for a stronger opponent?
6. **Scope ordering:** is "renderer slice first" the right opening move, or do you want backend-first?

---

## Verification

- **Renderer slice:** run the forked React app locally; confirm a 10x10 water grid renders, hovering highlights the correct cell (via `screenToTile`), clicking selects/fires, and one `.glb` ship renders on the board from the mock `your_view`.
- **Backend:** unit-test the `fire` pipeline (each rejection branch + hit/miss/sunk/win) and ship-placement validation; integration-test login to socket bind to fire.
- **Multiplayer:** two browser windows, real-time updates with no manual refresh; mid-game refresh replays correct visible state; disconnect past grace = forfeit.
- **End-to-end:** play a full game vs AI and vs human on the deployed `rainy-city.com/battleship` URL against the homebase backend.
