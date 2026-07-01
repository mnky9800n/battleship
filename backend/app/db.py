"""SQLite persistence: users, completed-game history, and the leaderboard.

Live game state lives in memory (sockets.py); this module stores accounts and
finished games so history can be queried and the leaderboard survives restarts.
"""

from __future__ import annotations

import os
import sqlite3
import threading
from datetime import datetime, timezone

DB_PATH = os.environ.get("BATTLESHIP_DB", os.path.join(os.path.dirname(__file__), "..", "battleship.db"))

_conn: sqlite3.Connection | None = None
_lock = threading.Lock()

# The AI opponents shown in matchmaking. The value is the "brain mode" that
# drives how each one plays. They are real user rows so their games score.
BOTS = {
    "ClassicBot": "classic",      # hardcoded hunt/target, no LLM
    "HaikuBot": "haiku",          # Claude picks moves + taunts, no memory
    "SentienceBot": "sentience",  # Claude + your Sentience memories
}


def is_bot(username: str) -> bool:
    return username in BOTS


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
    return _conn


def init_db() -> None:
    conn = connect()
    with _lock:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                avatar TEXT,
                wins INTEGER NOT NULL DEFAULT 0,
                losses INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS games (
                id TEXT PRIMARY KEY,
                code TEXT,
                p1 TEXT NOT NULL,
                p2 TEXT NOT NULL,
                status TEXT NOT NULL,
                winner TEXT,
                created_at TEXT NOT NULL,
                ended_at TEXT
            );
            CREATE TABLE IF NOT EXISTS moves (
                game_id TEXT NOT NULL,
                seq INTEGER NOT NULL,
                player TEXT NOT NULL,
                x INTEGER NOT NULL,
                y INTEGER NOT NULL,
                result TEXT NOT NULL
            );
            """
        )
        conn.commit()


# --- users ---------------------------------------------------------------

def create_user(username: str, password_hash: str, avatar: str | None) -> sqlite3.Row:
    conn = connect()
    with _lock:
        conn.execute(
            "INSERT INTO users (username, password_hash, avatar) VALUES (?, ?, ?)",
            (username, password_hash, avatar),
        )
        conn.commit()
    return get_user(username)


def get_user(username: str) -> sqlite3.Row | None:
    conn = connect()
    cur = conn.execute("SELECT * FROM users WHERE username = ?", (username,))
    return cur.fetchone()


def ensure_bots(password_hash: str, avatar_for) -> None:
    for name in BOTS:
        if get_user(name) is None:
            create_user(name, password_hash, avatar_for(name))


def record_result(winner: str, loser: str) -> None:
    conn = connect()
    with _lock:
        conn.execute("UPDATE users SET wins = wins + 1 WHERE username = ?", (winner,))
        conn.execute("UPDATE users SET losses = losses + 1 WHERE username = ?", (loser,))
        conn.commit()


def all_users() -> list[dict]:
    """Every registered account (incl. the AI), for the matchmaking list."""
    conn = connect()
    cur = conn.execute("SELECT username, avatar, wins, losses FROM users")
    return [dict(r) for r in cur.fetchall()]


def leaderboard() -> list[dict]:
    conn = connect()
    placeholders = ",".join("?" * len(BOTS))
    cur = conn.execute(
        f"SELECT username, avatar, wins, losses FROM users WHERE username NOT IN ({placeholders}) "
        "ORDER BY wins DESC, losses ASC",
        tuple(BOTS),
    )
    return [dict(r) for r in cur.fetchall()]


# --- completed games -----------------------------------------------------

def save_completed_game(game) -> None:
    """Persist a finished game's record + append-only move log."""
    conn = connect()
    p1, p2 = game.players
    with _lock:
        conn.execute(
            "INSERT OR REPLACE INTO games (id, code, p1, p2, status, winner, created_at, ended_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (game.id, getattr(game, "code", None), p1, p2, game.status, game.winner, _now(), _now()),
        )
        conn.executemany(
            "INSERT INTO moves (game_id, seq, player, x, y, result) VALUES (?, ?, ?, ?, ?, ?)",
            [
                (game.id, i, m["player"], m["x"], m["y"], m["result"])
                for i, m in enumerate(game.move_log)
            ],
        )
        conn.commit()
