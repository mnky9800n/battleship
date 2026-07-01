"""BayesBot tests: the probability-density / belief-state targeting.

pick_cell reads only the bot's own observations (game.shots[bot] / game.fired[bot]),
so we seed those directly and assert the belief-driven behavior: center bias on an
empty board, targeting neighbours of a live hit, respecting misses and sunk ships,
and never re-firing.
"""

from app import bayes
from app.engine import Game


def shot(x, y, result="miss", sunk=None):
    return {"x": x, "y": y, "result": result, "sunkShip": sunk}


def game_with(bot_shots):
    g = Game("g", ["bot", "human"])
    for s in bot_shots:
        g.shots["bot"].append(s)
        g.fired["bot"].add(f'{s["x"]},{s["y"]}')
    return g


def test_empty_board_prefers_center():
    # With no evidence, the densest cells are central (more placements cover them).
    g = game_with([])
    c = bayes.pick_cell(g, "bot")
    assert 0 <= c["x"] < 10 and 0 <= c["y"] < 10
    assert 2 <= c["x"] <= 7 and 2 <= c["y"] <= 7


def test_center_outweighs_corner():
    h = bayes.heatmap(game_with([]), "bot")
    assert h[(0, 0)] < h[(4, 5)]


def test_targets_neighbours_of_a_hit():
    # A single live hit -> only placements through it count, so the argmax cell is
    # one of its four orthogonal neighbours.
    c = bayes.pick_cell(game_with([shot(5, 5, "hit")]), "bot")
    assert (c["x"], c["y"]) in {(4, 5), (6, 5), (5, 4), (5, 6)}


def test_respects_a_miss_beside_a_hit():
    # The miss to the right blocks that extension; fire elsewhere adjacent.
    c = bayes.pick_cell(game_with([shot(5, 5, "hit"), shot(6, 5, "miss")]), "bot")
    assert (c["x"], c["y"]) in {(4, 5), (5, 4), (5, 6)}


def test_sunk_ship_is_not_retargeted():
    # Destroyer sunk at (0,0)-(0,1): no open hits remain -> back to hunt mode,
    # and it never re-fires a known cell.
    g = game_with([shot(0, 0, "hit"), shot(0, 1, "hit", sunk="Destroyer")])
    c = bayes.pick_cell(g, "bot")
    assert f'{c["x"]},{c["y"]}' not in g.fired["bot"]


def test_never_refires():
    fired = [shot(x, 0, "miss") for x in range(10)] + [shot(x, 1, "miss") for x in range(10)]
    g = game_with(fired)
    for _ in range(20):
        c = bayes.pick_cell(g, "bot")
        assert f'{c["x"]},{c["y"]}' not in g.fired["bot"]
