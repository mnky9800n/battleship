# BATTLESHIP

A real-time, multiplayer web Battleship, reskinned in the isometric,
particle-city style of [rainy-city.com](https://github.com/mnky9800n/rainy-city)
and given a twist: the AI opponent is **Claude**, and it trash-talks you, in one
mode using your own Sentience memories.

**▶ Play it live: [johnspace.xyz/battleship](https://johnspace.xyz/battleship)**

Built as a Sentience engineering work-trial. Two deliverables, weighted equally: a
feature-complete game, and a **spike** (the distinctive, uniquely-you piece).

## Read more

- **[Approach & AI-usage writeup](problem_writeup.md)** — how I approached the
  problem, how I built it, considerations, and how I used AI.
- **[Spike writeup](spike.md)** — the Sentience-grounded LLM opponent.
- **[Design doc (PDF)](battleship_design_doc-2.pdf)** — the authoritative design:
  server-authority model, state machine, wireframes.
- **[Dev blog](devblog.md)** — the build journal.
- **[Backend README](backend/README.md)** — server layout, run, deploy.

## The spike

When you play the AI, the opponent is Claude: it picks each shot and taunts you in
character, reacting to the live game state. Pick **SentienceBot** and provide your
Sentience key (used only for that game, never stored) and it reads your recent
memories to make the taunts personal, then writes a match recap back. Sentience's
API is memory-only (no run/respond loop), so Claude is the brain and Sentience is
the personalization + persistence layer. Player chat is never fed into the prompt
(prompt-injection defense).

Four AI opponents in the lobby:

| Opponent | Moves | Taunts |
|----------|-------|--------|
| **ClassicBot** | hunt/target algorithm | canned lines |
| **HaikuBot** | Claude | Claude, reacts to game state |
| **SentienceBot** | Claude | Claude, grounded in your Sentience memories |
| **BayesBot** | probability-density belief-state (a myopic POMDP policy) | none (it "doesn't text") |

## Features

- Rules-correct Battleship on a 10x10 grid: placement with rotate + validation,
  turn-based firing with hit/miss/sunk feedback, win detection, rematch.
- **vs AI** (four bots, all at least "probe after a hit" smart) and **vs Human**
  (two browsers, real-time, no manual refresh).
- Real-time lobby: presence, challenge/accept flow, live leaderboard.
- **Cheat-resistant by construction:** the server is the sole authority, ship
  positions never leave it, each shot returns only a redacted result, and a move's
  identity comes from the socket binding, never the payload.
- **Survives a mid-game refresh:** reconnect replays your redacted view + the chat
  transcript. Completed games (moves, outcome, timestamps) are stored in SQLite.
- In-game chat with a collapsible COMMS panel.
- Isometric board with the real `.glb` ship models, drag-drop placement, zoom.

## Stack

- **Backend:** Python, FastAPI (REST auth + leaderboard) with python-socketio
  (websocket game traffic) on uvicorn, SQLite, bcrypt, the Anthropic SDK for the
  LLM bots.
- **Frontend:** React (Create React App), a 2D-canvas isometric renderer forked
  from rainy-city.com, three.js for the `.glb` ships.
- **Hosting:** backend on homebase (a DigitalOcean box) behind Caddy (TLS);
  frontend on GitHub Pages.

## Run locally

**Backend** (game authority on `:8000`):

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
# optional, for LLM taunts: export ANTHROPIC_API_KEY=sk-ant-...
```

**Frontend:**

```bash
cd frontend
npm install
REACT_APP_API_URL=http://localhost:8000 npm start   # online: talks to the backend
```

With `REACT_APP_API_URL` **unset**, the frontend runs a client-side mock server so
you can play practice-vs-AI with no backend at all.

**Tests:**

```bash
cd backend && .venv/bin/python -m pytest
```

## Repo layout

```
backend/    FastAPI + Socket.IO game authority (engine, sockets, auth, db, bots)
frontend/   React client (isometric renderer, screens, net transports)
assets/     .glb ship models
*.md        design notes, dev blog, spike + approach writeups
battleship_design_doc-2.pdf   the authoritative design
```
