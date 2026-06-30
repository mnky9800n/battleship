# Battleship backend

FastAPI + python-socketio game authority. Holds all game state server-side so
multiplayer is cheat-resistant: a client only ever receives its own **redacted**
snapshot (an opponent's un-sunk ships never cross the wire).

## Layout
- `app/engine.py` — pure game rules (placement, fire pipeline, hunt/target AI, per-player redaction). Port of `frontend/src/net/MockServer.js`; the reference spec.
- `app/sockets.py` — Socket.IO layer + the multi-game registry (many 2-player games at once, one room each).
- `app/auth.py` — bcrypt passwords, session tokens, avatar assignment.
- `app/db.py` — SQLite (users, completed games, move log, leaderboard).
- `app/main.py` — ASGI entrypoint (REST auth/leaderboard + Socket.IO).

## Run locally
```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```
REST: `POST /signup`, `POST /login`, `GET /leaderboard`, `GET /health`. Socket.IO at `/socket.io`.
The DB path defaults to `backend/battleship.db` (override with `BATTLESHIP_DB`).

## Test
```bash
cd backend && .venv/bin/python -m pytest        # engine unit tests
```

## Deploy (homebase)
1. DNS: `A api.johnspace.xyz -> <homebase public IP>`.
2. Run uvicorn (systemd/container) on `localhost:8000`.
3. `caddy run --config ./Caddyfile` — terminates TLS (auto Let's Encrypt) and proxies, WebSocket upgrade included.
4. Point the frontend at it with `REACT_APP_API_URL=https://api.johnspace.xyz`.

CORS allows `https://johnspace.xyz` and localhost dev origins (see `ORIGINS` in `app/main.py`).
