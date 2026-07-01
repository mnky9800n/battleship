"""Engine tests — mirror the node smoke suite for MockServer.

Run from backend/:  python -m pytest
"""

import pytest

from app.engine import (
    Game,
    GameError,
    FLEET,
    SHIP_KINDS,
    BOARD_SIZE,
    ship_is_sunk,
    random_fleet,
)


def footprint(x, y, length, orient="h"):
    return [
        {"x": x + (i if orient == "h" else 0), "y": y + (i if orient == "v" else 0)}
        for i in range(length)
    ]


def place_full_fleet(g, pid):
    # Each ship on its own row, horizontal, no overlaps.
    for i, kind in enumerate(FLEET):
        g.place_ship(pid, kind, footprint(0, i, SHIP_KINDS[kind]["length"], "h"))


def started_game():
    g = Game("g1", ["a", "b"])
    place_full_fleet(g, "a")
    place_full_fleet(g, "b")
    g.set_ready("a")
    g.set_ready("b")
    return g


def test_setup_and_ready_flow():
    g = Game("g1", ["a", "b"])
    assert g.status == "setup"
    with pytest.raises(GameError):  # nothing placed
        g.set_ready("a")
    place_full_fleet(g, "a")
    place_full_fleet(g, "b")
    g.set_ready("a")
    assert g.status == "setup"  # only one player ready
    g.set_ready("b")
    assert g.status == "playing"
    assert g.turn == "a"  # creator moves first


@pytest.mark.parametrize(
    "cells, message",
    [
        (footprint(0, 0, 4), "wrong length"),          # carrier is 5
        (footprint(8, 0, 5), "off board"),             # 8..12
        ([{"x": 0, "y": 0}, {"x": 2, "y": 0}, {"x": 3, "y": 0}, {"x": 4, "y": 0}, {"x": 5, "y": 0}], "must be a straight line"),
    ],
)
def test_placement_rejections(cells, message):
    g = Game("g", ["a", "b"])
    with pytest.raises(GameError) as e:
        g.place_ship("a", "carrier", cells)
    assert message in str(e.value)
    assert g.fleets["a"] == []  # nothing placed


def test_overlap_and_reposition():
    g = Game("g", ["a", "b"])
    g.place_ship("a", "carrier", footprint(0, 0, 5))
    with pytest.raises(GameError):  # destroyer onto the carrier's row
        g.place_ship("a", "destroyer", footprint(0, 0, 2))
    # repositioning the same kind replaces it (no growth)
    g.place_ship("a", "carrier", footprint(0, 5, 5))
    assert len(g.fleets["a"]) == 1


def test_full_game_to_win():
    g = started_game()
    enemy_cells = [c for s in g.fleets["b"] for c in s["cells"]]
    sunk = []
    for c in enemy_cells:
        g.turn = "a"  # force a's turn (ignore b's interleaving)
        g.fire("a", c["x"], c["y"])
        if g.shots["a"][-1]["sunkShip"]:
            sunk.append(g.shots["a"][-1]["sunkShip"])
    assert g.status == "over"
    assert g.winner == "a"
    assert len(sunk) == 5  # all five ships announced sunk
    assert len(g.move_log) == 5 + 4 + 3 + 3 + 2  # 17 cells


def test_redaction():
    g = started_game()
    # fresh: enemy view reveals 0 ships, own view reveals all 5
    assert len(g.view_for("a", "enemy")["ships"]) == 0
    assert len(g.view_for("a", "own")["ships"]) == 5
    # after sinking everything, enemy view reveals exactly the sunk ships
    for c in [c for s in g.fleets["b"] for c in s["cells"]]:
        g.turn = "a"
        g.fire("a", c["x"], c["y"])
    enemy = g.view_for("a", "enemy")["ships"]
    assert len(enemy) == 5
    assert all(s["sunk"] for s in enemy)


def test_fire_guards():
    g = started_game()  # a's turn
    with pytest.raises(GameError) as e:
        g.fire("b", 0, 0)  # not b's turn
    assert "not your turn" in str(e.value)
    with pytest.raises(GameError) as e:
        g.fire("a", -1, 0)  # off board
    assert "invalid target" in str(e.value)
    g.turn = "a"
    g.fire("a", 9, 9)
    g.turn = "a"
    with pytest.raises(GameError) as e:
        g.fire("a", 9, 9)  # already fired
    assert "already fired" in str(e.value)


def test_snapshot_perspective():
    g = started_game()
    snap_a = g.snapshot_for("a")
    snap_b = g.snapshot_for("b")
    assert snap_a["whoseTurn"] == "you"   # a moves first
    assert snap_b["whoseTurn"] == "enemy"
    assert snap_a["status"] == "playing"
    # Opponent identity is exposed (not secret) so the client can offer a rematch.
    assert snap_a["opponent"] == "b"
    assert snap_b["opponent"] == "a"


def test_vs_ai_bot_turn():
    g = Game("g", ["human", "playerAI"], vs_ai=True)
    g.fleets["playerAI"] = random_fleet()
    place_full_fleet(g, "human")
    g.set_ready("playerAI")
    g.set_ready("human")
    assert g.status == "playing"
    # human fires, then the bot takes its turn and a shot is recorded
    g.fire("human", 0, 0)
    assert g.turn == "playerAI"
    g.ai_take_turn("playerAI")
    assert len(g.shots["playerAI"]) == 1
