"""Completed-game history is stored (moves, outcome, timestamps) and queryable."""

from app import db
from app.engine import Game


def _fresh_db():
    db.DB_PATH = ":memory:"
    db._conn = None
    db.init_db()
    db.create_user("a", "h", None)
    db.create_user("b", "h", None)


def test_completed_game_is_stored_and_queryable():
    _fresh_db()
    g = Game("game1", ["a", "b"])
    g.status = "over"
    g.winner = "a"
    g.move_log = [
        {"player": "a", "x": 0, "y": 0, "result": "miss"},
        {"player": "b", "x": 1, "y": 1, "result": "hit"},
        {"player": "a", "x": 2, "y": 2, "result": "hit"},
    ]
    db.save_completed_game(g)
    db.record_result("a", "b")

    # Full detail with the append-only move log, outcome, and timestamps.
    rec = db.get_game("game1")
    assert rec["winner"] == "a" and rec["status"] == "over"
    assert rec["created_at"] and rec["ended_at"]
    assert [m["result"] for m in rec["moves"]] == ["miss", "hit", "hit"]
    assert rec["moves"][1] == {"seq": 1, "player": "b", "x": 1, "y": 1, "result": "hit"}

    # History listing, and the per-player filter.
    assert any(r["id"] == "game1" and r["winner"] == "a" for r in db.recent_games())
    assert db.recent_games(player="a") and not db.recent_games(player="zzz")
    assert db.get_game("nope") is None
