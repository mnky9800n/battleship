"""Socket.IO layer: lobby presence, the challenge flow, and game traffic.

Holds many concurrent 2-player games at once, each isolated in its own room.
Player identity is bound to the socket on connect (never read from payloads),
which makes the redaction in engine.py a real trust boundary.

Matchmaking follows the design doc: everyone sees the list of registered users
with presence; you challenge an online user (or the AI); they accept and a game
is created. There is no join-by-code.
"""

from __future__ import annotations

import asyncio
import uuid

from . import auth, brain, db, sentience
from .engine import Game, GameError, random_fleet

GRACE_SECONDS = 60
CHALLENGE_SECONDS = 60
BOT_DELAY = 0.45
LOBBY = "lobby"

# --- in-memory registry (many pairs at once) ---
games: dict[str, Game] = {}            # game_id -> Game
user_game: dict[str, str] = {}         # username -> active game_id (one game per user)
sid_user: dict[str, str] = {}          # socket id -> username
user_sids: dict[str, set[str]] = {}    # username -> connected socket ids
challenges: dict[str, dict] = {}       # target username -> {"from": challenger, "task": Task}
grace_tasks: dict[str, asyncio.Task] = {}


def game_of(username: str) -> Game | None:
    gid = user_game.get(username)
    return games.get(gid) if gid else None


def _presence(username: str) -> str:
    if db.is_bot(username):
        return "ai"
    return "online" if user_sids.get(username) else "offline"


def register(sio) -> None:
    # --- lobby presence -------------------------------------------------

    def user_list() -> list[dict]:
        rows = []
        for u in db.all_users():
            bot = db.is_bot(u["username"])
            rows.append({
                **u,
                "presence": _presence(u["username"]),
                "inGame": (not bot) and game_of(u["username"]) is not None,
                "aiMode": db.BOTS.get(u["username"]),  # None for humans
            })
        # online first, then AI, then offline; alphabetical within.
        order = {"online": 0, "ai": 1, "offline": 2}
        rows.sort(key=lambda r: (order[r["presence"]], r["username"].lower()))
        return rows

    async def broadcast_lobby() -> None:
        await sio.emit("lobby_update", {"users": user_list()}, room=LOBBY)

    async def emit_state(game: Game) -> None:
        for p in game.players:
            if db.is_bot(p):
                continue
            snap = game.snapshot_for(p)
            for s in list(user_sids.get(p, ())):
                await sio.emit("state", snap, to=s)

    async def emit_error(sid: str, message: str) -> None:
        await sio.emit("error", {"message": message}, to=sid)

    async def emit_chat_history(game: Game, sid: str) -> None:
        # Full transcript for a (re)connecting player: rebuilds the chat panel
        # after a refresh, and (empty on a fresh game) resets any stale log.
        await sio.emit("chat_history", {"messages": game.chat_log}, to=sid)

    async def post_chat(game: Game, entry: dict) -> None:
        game.chat_log.append(entry)
        await sio.emit("chat", entry, room=game.id)

    async def finalize(game: Game) -> None:
        db.save_completed_game(game)
        if game.winner:
            db.record_result(game.winner, game.opponent(game.winner))
        for p in game.players:
            if user_game.get(p) == game.id:
                user_game.pop(p, None)
        # If the player opted into Sentience for this vs-AI game, write a recap
        # memory back to their account.
        if game.vs_ai and getattr(game, "ai_key", None):
            human = game.players[0]
            result = "won" if game.winner == human else "lost"
            try:
                await sentience.write_memory(
                    game.ai_key,
                    f"Played a game of Battleship against the AI opponent and {result}.",
                )
            except Exception as e:
                print("sentience: write recap failed:", e)
        await broadcast_lobby()  # leaderboard + presence refresh

    async def run_bot(game: Game) -> None:
        await asyncio.sleep(BOT_DELAY)
        bot = getattr(game, "bot", None)
        if not bot or game.status != "playing" or game.turn != bot:
            return
        mode = getattr(game, "ai_mode", "haiku")
        # Sentience mode: fetch + summarize the player's memories once.
        if mode == "sentience" and getattr(game, "ai_key", None) and not game.ai_summary_fetched:
            game.ai_summary_fetched = True
            game.ai_sentience_summary = await sentience.summarize(game.ai_key)
        # Claude picks move + taunt (classic mode skips the LLM entirely).
        move = await brain.take_turn(game, bot, getattr(game, "ai_sentience_summary", None), use_llm=(mode != "classic"))
        if not move:
            return
        try:
            game.fire(bot, move["x"], move["y"])
        except GameError:
            return
        if move.get("taunt"):
            await post_chat(game, {"from": bot, "text": move["taunt"], "bot": True})
        await emit_state(game)
        if game.status == "over":
            await finalize(game)

    async def grace_forfeit(username: str, gid: str) -> None:
        try:
            await asyncio.sleep(GRACE_SECONDS)
        except asyncio.CancelledError:
            return
        game = games.get(gid)
        if not game or game.status != "playing" or user_sids.get(username):
            return
        game.status = "over"
        game.winner = game.opponent(username)
        await emit_state(game)
        await finalize(game)

    # --- game creation --------------------------------------------------

    async def create_match(a: str, b: str, vs_ai: bool = False, mode: str = "haiku", sentience_key: str | None = None) -> None:
        gid = uuid.uuid4().hex[:12]
        game = Game(gid, [a, b], vs_ai=vs_ai)
        if vs_ai:
            game.bot = b
            game.ai_mode = mode
            game.fleets[b] = random_fleet()
            game.set_ready(b)
            # Optional, per-game, in-memory only. Only sentience mode uses a key.
            game.ai_key = sentience_key if mode == "sentience" else None
            game.ai_sentience_summary = None
            game.ai_summary_fetched = False
        games[gid] = game
        for p in (a, b):
            if db.is_bot(p):
                continue
            user_game[p] = gid
            for s in list(user_sids.get(p, ())):
                await sio.enter_room(s, gid)
        await emit_state(game)
        # Fresh game: reset each player's chat panel (clears any stale transcript).
        for p in game.players:
            if db.is_bot(p):
                continue
            for s in list(user_sids.get(p, ())):
                await emit_chat_history(game, s)
        await broadcast_lobby()

    def _clear_challenge(target: str) -> None:
        pend = challenges.pop(target, None)
        if pend and pend.get("task"):
            pend["task"].cancel()

    def _drop_user_challenges(username: str) -> None:
        # remove challenges where this user is the target or the challenger
        for target in [t for t, p in challenges.items() if t == username or p["from"] == username]:
            _clear_challenge(target)

    # --- connection lifecycle ------------------------------------------

    @sio.event
    async def connect(sid, environ, auth_data):
        username = auth.user_for_token((auth_data or {}).get("token"))
        if not username:
            return False
        sid_user[sid] = username
        user_sids.setdefault(username, set()).add(sid)
        await sio.enter_room(sid, LOBBY)
        task = grace_tasks.pop(username, None)
        if task:
            task.cancel()
        game = game_of(username)
        if game:
            await sio.enter_room(sid, game.id)
            await sio.emit("state", game.snapshot_for(username), to=sid)
            await emit_chat_history(game, sid)
        await sio.emit("lobby_update", {"users": user_list()}, to=sid)
        await broadcast_lobby()
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
            _drop_user_challenges(username)
            game = game_of(username)
            if game and game.status == "playing":
                grace_tasks[username] = asyncio.create_task(grace_forfeit(username, game.id))
            await broadcast_lobby()

    # --- challenge flow -------------------------------------------------

    @sio.event
    async def challenge(sid, data):
        challenger = sid_user.get(sid)
        if not challenger:
            return
        if game_of(challenger):
            return await emit_error(sid, "finish your current game first")
        target = (data or {}).get("target")
        if not target or target == challenger:
            return await emit_error(sid, "invalid opponent")

        if db.is_bot(target):
            mode = db.BOTS[target]
            key = (data or {}).get("sentienceKey") if mode == "sentience" else None
            return await create_match(challenger, target, vs_ai=True, mode=mode, sentience_key=key)

        if not user_sids.get(target):
            return await emit_error(sid, "that player is offline")
        if game_of(target):
            return await emit_error(sid, "that player is in a game")
        if target in challenges:
            return await emit_error(sid, "that player already has a pending challenge")
        if any(p["from"] == challenger for p in challenges.values()):
            return await emit_error(sid, "you already have a pending challenge")

        async def expire():
            try:
                await asyncio.sleep(CHALLENGE_SECONDS)
            except asyncio.CancelledError:
                return
            challenges.pop(target, None)
            for s in list(user_sids.get(challenger, ())):
                await sio.emit("challenge_expired", {"with": target}, to=s)
            for s in list(user_sids.get(target, ())):
                await sio.emit("challenge_expired", {"with": challenger}, to=s)

        challenges[target] = {"from": challenger, "task": asyncio.create_task(expire())}
        for s in list(user_sids.get(target, ())):
            await sio.emit("challenge_received", {"from": challenger}, to=s)
        await sio.emit("challenge_sent", {"to": target}, to=sid)

    @sio.event
    async def challenge_response(sid, data):
        user = sid_user.get(sid)  # the challenged player
        if not user:
            return
        pend = challenges.pop(user, None)
        if not pend:
            return
        if pend.get("task"):
            pend["task"].cancel()
        challenger = pend["from"]
        if not (data or {}).get("accept"):
            for s in list(user_sids.get(challenger, ())):
                await sio.emit("challenge_declined", {"by": user}, to=s)
            return
        if not user_sids.get(challenger) or game_of(challenger) or game_of(user):
            return await emit_error(sid, "challenger is no longer available")
        await create_match(challenger, user)

    @sio.event
    async def cancel_challenge(sid, data=None):
        username = sid_user.get(sid)
        if not username:
            return
        for target in [t for t, p in challenges.items() if p["from"] == username]:
            _clear_challenge(target)
            for s in list(user_sids.get(target, ())):
                await sio.emit("challenge_cancelled", {"by": username}, to=s)

    # --- setup + play (identity from the socket binding) ---------------

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
        elif game.vs_ai and game.turn == getattr(game, "bot", None):
            asyncio.create_task(run_bot(game))

    @sio.event
    async def resume(sid, data=None):
        username = sid_user.get(sid)
        game = game_of(username) if username else None
        if game:
            await sio.enter_room(sid, game.id)
            await sio.emit("state", game.snapshot_for(username), to=sid)
            await emit_chat_history(game, sid)

    @sio.event
    async def chat(sid, data):
        # Relay a chat line to the game room. In vs-AI games this text is shown
        # but NEVER fed to the brain (prompt-injection defense).
        username = sid_user.get(sid)
        game = game_of(username) if username else None
        if not game:
            return
        text = ((data or {}).get("text") or "").strip()[:280]
        if text:
            await post_chat(game, {"from": username, "text": text})

    @sio.event
    async def leave(sid, data=None):
        username = sid_user.get(sid)
        if not username:
            return
        _drop_user_challenges(username)
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
            await broadcast_lobby()
