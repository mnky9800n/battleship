"""Socket.IO layer: the multi-game registry and real-time game traffic.

Holds many concurrent 2-player games at once, each isolated in its own room.
Player identity is bound to the socket on connect (never read from message
payloads), which is what makes the redaction in engine.py an actual trust
boundary: a client only ever receives its own redacted snapshot.
"""

from __future__ import annotations

import asyncio
import random
import string
import uuid

from . import auth, db
from .engine import Game, GameError, random_fleet

BOT = db.BOT_USERNAME
GRACE_SECONDS = 60
BOT_DELAY = 0.45

# --- in-memory registry (many pairs at once) ---
games: dict[str, Game] = {}            # game_id -> Game
pending: dict[str, str] = {}           # join code -> creator username (awaiting opponent)
pending_user: dict[str, str] = {}      # creator username -> their pending code
user_game: dict[str, str] = {}         # username -> active game_id (one game per user)
sid_user: dict[str, str] = {}          # socket id -> username
user_sids: dict[str, set[str]] = {}    # username -> connected socket ids
grace_tasks: dict[str, asyncio.Task] = {}


def _gen_code() -> str:
    while True:
        code = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
        if code not in pending and code not in {getattr(g, "code", None) for g in games.values()}:
            return code


def game_of(username: str) -> Game | None:
    gid = user_game.get(username)
    return games.get(gid) if gid else None


def register(sio) -> None:
    async def emit_state(game: Game) -> None:
        # Each human player gets THEIR OWN redacted snapshot (never broadcast one).
        for p in game.players:
            if p == BOT:
                continue
            snap = game.snapshot_for(p)
            for s in list(user_sids.get(p, ())):
                await sio.emit("state", snap, to=s)

    async def emit_error(sid: str, message: str) -> None:
        await sio.emit("error", {"message": message}, to=sid)

    async def finalize(game: Game) -> None:
        db.save_completed_game(game)
        if game.winner:
            db.record_result(game.winner, game.opponent(game.winner))
        for p in game.players:
            if user_game.get(p) == game.id:
                user_game.pop(p, None)

    async def run_bot(game: Game) -> None:
        await asyncio.sleep(BOT_DELAY)
        if game.status == "playing" and game.turn == BOT:
            game.ai_take_turn(BOT)
            await emit_state(game)
            if game.status == "over":
                await finalize(game)

    async def grace_forfeit(username: str, gid: str) -> None:
        try:
            await asyncio.sleep(GRACE_SECONDS)
        except asyncio.CancelledError:
            return
        game = games.get(gid)
        if not game or game.status != "playing":
            return
        if user_sids.get(username):  # reconnected in time
            return
        game.status = "over"
        game.winner = game.opponent(username)
        await emit_state(game)
        await finalize(game)

    # --- connection lifecycle ---

    @sio.event
    async def connect(sid, environ, auth_data):
        username = auth.user_for_token((auth_data or {}).get("token"))
        if not username:
            return False  # reject unauthenticated sockets
        sid_user[sid] = username
        user_sids.setdefault(username, set()).add(sid)
        # Cancel any pending forfeit; resume an in-progress game.
        task = grace_tasks.pop(username, None)
        if task:
            task.cancel()
        game = game_of(username)
        if game:
            await sio.enter_room(sid, game.id)
            await sio.emit("state", game.snapshot_for(username), to=sid)
        return True

    @sio.event
    async def disconnect(sid):
        username = sid_user.pop(sid, None)
        if not username:
            return
        socks = user_sids.get(username)
        if socks:
            socks.discard(sid)
        if not user_sids.get(username):
            game = game_of(username)
            if game and game.status == "playing":
                grace_tasks[username] = asyncio.create_task(grace_forfeit(username, game.id))

    # --- lobby ---

    @sio.event
    async def create_game(sid, data):
        username = sid_user.get(sid)
        if not username:
            return
        if game_of(username) or username in pending_user:
            return await emit_error(sid, "you are already in a game")
        code = _gen_code()
        if (data or {}).get("vsAI"):
            gid = uuid.uuid4().hex[:12]
            game = Game(gid, [username, BOT], vs_ai=True)
            game.code = code
            game.fleets[BOT] = random_fleet()
            game.set_ready(BOT)
            games[gid] = game
            user_game[username] = gid
            await sio.enter_room(sid, gid)
            await sio.emit("game_created", {"code": code, "vsAI": True}, to=sid)
            await emit_state(game)
        else:
            pending[code] = username
            pending_user[username] = code
            await sio.emit("game_created", {"code": code, "waiting": True}, to=sid)

    @sio.event
    async def join_game(sid, data):
        username = sid_user.get(sid)
        if not username:
            return
        if game_of(username):
            return await emit_error(sid, "you are already in a game")
        code = ((data or {}).get("code") or "").upper()
        creator = pending.get(code)
        if not creator:
            return await emit_error(sid, "no such game")
        if creator == username:
            return await emit_error(sid, "cannot join your own game")
        gid = uuid.uuid4().hex[:12]
        game = Game(gid, [creator, username])
        game.code = code
        games[gid] = game
        user_game[creator] = gid
        user_game[username] = gid
        pending.pop(code, None)
        pending_user.pop(creator, None)
        for p in (creator, username):
            for s in list(user_sids.get(p, ())):
                await sio.enter_room(s, gid)
        await emit_state(game)

    # --- setup + play (all identity from the socket binding) ---

    async def _with_game(sid, fn):
        username = sid_user.get(sid)
        game = game_of(username) if username else None
        if not game:
            return await emit_error(sid, "not in a game")
        try:
            fn(username, game)
        except GameError as e:
            return await emit_error(sid, str(e))
        await emit_state(game)
        return game

    @sio.event
    async def place_ship(sid, data):
        await _with_game(sid, lambda u, g: g.place_ship(u, data["kind"], data["cells"]))

    @sio.event
    async def clear_placement(sid, data=None):
        await _with_game(sid, lambda u, g: g.clear_placement(u))

    @sio.event
    async def ready(sid, data=None):
        await _with_game(sid, lambda u, g: g.set_ready(u))

    @sio.event
    async def fire(sid, data):
        game = await _with_game(sid, lambda u, g: g.fire(u, data["x"], data["y"]))
        if not game:
            return
        if game.status == "over":
            await finalize(game)
        elif game.vs_ai and game.turn == BOT:
            asyncio.create_task(run_bot(game))

    @sio.event
    async def resume(sid, data=None):
        username = sid_user.get(sid)
        game = game_of(username) if username else None
        if game:
            await sio.enter_room(sid, game.id)
            await sio.emit("state", game.snapshot_for(username), to=sid)

    @sio.event
    async def leave(sid, data=None):
        username = sid_user.get(sid)
        if not username:
            return
        # Drop a pending (un-joined) game outright.
        code = pending_user.pop(username, None)
        if code:
            pending.pop(code, None)
        game = game_of(username)
        if game and game.status == "playing":
            game.status = "over"
            game.winner = game.opponent(username)
            await emit_state(game)
            await finalize(game)
        elif game:
            for p in game.players:
                if user_game.get(p) == game.id:
                    user_game.pop(p, None)
