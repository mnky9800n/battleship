"""ASGI entrypoint: FastAPI (REST auth + leaderboard) with Socket.IO mounted.

Run from backend/:  uvicorn app.main:app --reload
The exported `app` is the combined ASGI app (Socket.IO at /socket.io, REST else).
"""

from __future__ import annotations

import secrets
from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import auth, db, sockets

ORIGINS = [
    "https://johnspace.xyz",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=ORIGINS)
sockets.register(sio)


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    # The AI opponents are real user rows (so their games score); passwords unused.
    db.ensure_bots(auth.hash_password(secrets.token_urlsafe(16)), auth.assign_avatar)
    yield


api = FastAPI(lifespan=lifespan, title="Battleship backend")
api.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


class Creds(BaseModel):
    username: str
    password: str


@api.get("/health")
async def health():
    return {"status": "ok"}


@api.post("/signup")
async def signup(c: Creds):
    username = c.username.strip()
    if not username or not c.password:
        raise HTTPException(400, "username and password required")
    if db.get_user(username):
        raise HTTPException(409, "username taken")
    avatar = auth.assign_avatar(username)
    db.create_user(username, auth.hash_password(c.password), avatar)
    return {"token": auth.create_token(username), "username": username, "avatar": avatar}


@api.post("/login")
async def login(c: Creds):
    user = db.get_user(c.username.strip())
    if not user or not auth.verify_password(c.password, user["password_hash"]):
        raise HTTPException(401, "invalid credentials")
    return {
        "token": auth.create_token(user["username"]),
        "username": user["username"],
        "avatar": user["avatar"],
    }


@api.get("/leaderboard")
async def leaderboard():
    return db.leaderboard()


@api.get("/games")
async def games(limit: int = 50, player: str | None = None):
    """Completed-game history (newest first), optionally filtered to a player."""
    return db.recent_games(limit=min(max(limit, 1), 200), player=player)


@api.get("/games/{game_id}")
async def game_detail(game_id: str):
    """One completed game with its full move log (for replay / analysis)."""
    record = db.get_game(game_id)
    if record is None:
        raise HTTPException(404, "no such game")
    return record


# Combined ASGI app: Socket.IO handles /socket.io/*, FastAPI handles the rest.
app = socketio.ASGIApp(sio, other_asgi_app=api)
