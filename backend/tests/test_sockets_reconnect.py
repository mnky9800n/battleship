"""Socket-layer tests for refresh/reconnect survival.

The Socket.IO handlers in `sockets.py` are closures over module-level registries
and an `sio` server. We drive them directly through a FakeSIO that records every
emit, backed by an in-memory DB, so we can assert the reconnect contract without
standing up a live server:

  - chat appends to the game's transcript and broadcasts to the room,
  - a (re)connect replays both the game state and the full chat transcript to the
    reconnecting socket (surviving a page refresh while the game is live),
  - creating a fresh game resets each player's chat panel (empty history),
  - an explicit `resume` also replays the transcript.
"""

import asyncio

import pytest

from app import auth, db, sockets


class FakeSIO:
    """Minimal stand-in for socketio.AsyncServer: registers @sio.event handlers
    by name and records emits/room joins for assertions."""

    def __init__(self):
        self.handlers = {}
        self.emits = []          # [{event, data, to, room}, ...] in order
        self.rooms = {}          # sid -> set(room)

    # registration surface used by sockets.register
    def event(self, fn):
        self.handlers[fn.__name__] = fn
        return fn

    def on(self, name):
        def deco(fn):
            self.handlers[name] = fn
            return fn
        return deco

    # runtime surface the handlers call
    async def emit(self, event, data=None, to=None, room=None, **_):
        self.emits.append({"event": event, "data": data, "to": to, "room": room})

    async def enter_room(self, sid, room):
        self.rooms.setdefault(sid, set()).add(room)

    async def leave_room(self, sid, room):
        self.rooms.setdefault(sid, set()).discard(room)

    # assertion helpers
    def to(self, sid, event):
        return [e for e in self.emits if e["event"] == event and e["to"] == sid]

    def reset(self):
        self.emits.clear()


@pytest.fixture
def sio():
    # Fresh in-memory DB per test.
    db.DB_PATH = ":memory:"
    db._conn = None
    db.init_db()
    # Clear the in-memory socket registries so tests don't leak into each other.
    for registry in (
        sockets.games, sockets.user_game, sockets.sid_user,
        sockets.user_sids, sockets.challenges, sockets.grace_tasks,
    ):
        registry.clear()
    auth._tokens.clear()
    fake = FakeSIO()
    sockets.register(fake)
    return fake


def _user(name):
    db.create_user(name, "hash", None)
    return auth.create_token(name)


async def _seat_two(sio, ta, tb):
    """alice(sa) and bob(sb) connect; alice challenges, bob accepts -> a game."""
    await sio.handlers["connect"]("sa", {}, {"token": ta})
    await sio.handlers["connect"]("sb", {}, {"token": tb})
    await sio.handlers["challenge"]("sa", {"target": "bob"})
    await sio.handlers["challenge_response"]("sb", {"accept": True})


def test_chat_appends_to_log_and_broadcasts(sio):
    ta, tb = _user("alice"), _user("bob")

    async def scenario():
        await _seat_two(sio, ta, tb)
        game = sockets.game_of("alice")
        sio.reset()
        await sio.handlers["chat"]("sa", {"text": "prepare to lose"})
        return game

    game = asyncio.run(scenario())
    assert game.chat_log == [{"from": "alice", "text": "prepare to lose"}]
    chats = [e for e in sio.emits if e["event"] == "chat"]
    assert chats and chats[0]["data"] == {"from": "alice", "text": "prepare to lose"}
    assert chats[0]["room"] == game.id  # relayed to the whole game room


def test_reconnect_replays_state_and_chat(sio):
    ta, tb = _user("alice"), _user("bob")

    async def scenario():
        await _seat_two(sio, ta, tb)
        await sio.handlers["chat"]("sa", {"text": "hello"})
        await sio.handlers["chat"]("sb", {"text": "hi back"})
        # alice refreshes the page: her socket drops and a new one connects.
        await sio.handlers["disconnect"]("sa")
        sio.reset()
        await sio.handlers["connect"]("sa2", {}, {"token": ta})

    asyncio.run(scenario())
    # The active game is pushed to the reconnecting socket...
    assert sio.to("sa2", "state"), "expected a state snapshot on reconnect"
    # ...along with the full transcript, in order.
    hist = sio.to("sa2", "chat_history")
    assert hist, "expected chat_history on reconnect"
    assert hist[0]["data"]["messages"] == [
        {"from": "alice", "text": "hello"},
        {"from": "bob", "text": "hi back"},
    ]


def test_new_game_resets_chat_panel(sio):
    ta, tb = _user("alice"), _user("bob")

    async def scenario():
        await sio.handlers["connect"]("sa", {}, {"token": ta})
        await sio.handlers["connect"]("sb", {}, {"token": tb})
        sio.reset()
        await sio.handlers["challenge"]("sa", {"target": "bob"})
        await sio.handlers["challenge_response"]("sb", {"accept": True})

    asyncio.run(scenario())
    # Both players get an empty chat_history so a stale transcript can't linger.
    for sid in ("sa", "sb"):
        hist = sio.to(sid, "chat_history")
        assert hist and hist[-1]["data"]["messages"] == []


def test_resume_replays_chat(sio):
    ta, tb = _user("alice"), _user("bob")

    async def scenario():
        await _seat_two(sio, ta, tb)
        await sio.handlers["chat"]("sa", {"text": "gg"})
        sio.reset()
        await sio.handlers["resume"]("sa", {})

    asyncio.run(scenario())
    hist = sio.to("sa", "chat_history")
    assert hist and hist[0]["data"]["messages"] == [{"from": "alice", "text": "gg"}]
