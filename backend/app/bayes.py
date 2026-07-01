"""Bayesian belief-state targeting for a Battleship bot ("BayesBot").

This is the classic Battleship probability-density algorithm, framed as a myopic
(one-step-greedy) policy over a POMDP belief state:

  - The hidden state is the opponent's ship layout (partially observable).
  - The belief is the set of ALL ship placements consistent with what the bot has
    observed so far (its own hits, misses, and sunk announcements). Every
    consistent placement is treated as equally likely, so the posterior
    probability that a cell is occupied is proportional to how many consistent
    placements cover it.
  - The action is greedy: fire at the un-fired cell with the highest posterior
    hit probability (the densest cell on the heatmap).

It reads only the bot's OWN observations (game.shots[bot] / game.fired[bot]),
never the hidden enemy board, so it is not cheating. No LLM, no taunts: BayesBot
just does the math (it says so, once).
"""

from __future__ import annotations

import random
from collections import defaultdict

from .engine import BOARD_SIZE, FLEET, SHIP_KINDS, _key

_LABEL_TO_LEN = {SHIP_KINDS[k]["label"]: SHIP_KINDS[k]["length"] for k in FLEET}


def _observations(game, bot):
    """Split the bot's shot history into misses, hits, and sunk events."""
    misses: set[tuple[int, int]] = set()
    hits: set[tuple[int, int]] = set()
    sunk: list[tuple[int, int, str]] = []  # (x, y, ship label)
    for s in game.shots[bot]:
        cell = (s["x"], s["y"])
        if s["result"] == "miss":
            misses.add(cell)
        else:
            hits.add(cell)
            if s.get("sunkShip"):
                sunk.append((s["x"], s["y"], s["sunkShip"]))
    return misses, hits, sunk


def _find_run(sx, sy, length, hits, claimed):
    """A straight run of `length` hit cells through (sx, sy), none already claimed."""
    for dx, dy in ((1, 0), (0, 1)):  # horizontal, then vertical
        for start in range(length):
            cells = [(sx - start * dx + i * dx, sy - start * dy + i * dy) for i in range(length)]
            if all(c in hits and c not in claimed for c in cells):
                return cells
    return None


def _resolve_sunk(hits, sunk):
    """Which hit cells belong to sunk ships, and which ship kinds remain afloat.

    When a ship of length L is sunk at (sx, sy), it occupies a straight run of L
    hit cells through that cell. We claim the first such run we find; ships may be
    adjacent so this is a heuristic, but it is correct in the common case and only
    affects how tightly we focus fire, never legality."""
    occupied: set[tuple[int, int]] = set()
    sunk_labels: set[str] = set()
    for sx, sy, label in sunk:
        sunk_labels.add(label)
        run = _find_run(sx, sy, _LABEL_TO_LEN.get(label, 1), hits, occupied)
        occupied |= set(run) if run else {(sx, sy)}
    remaining = [k for k in FLEET if SHIP_KINDS[k]["label"] not in sunk_labels]
    return occupied, remaining


def heatmap(game, bot):
    """Posterior hit-count per un-fired cell, over all consistent placements."""
    fired = game.fired[bot]
    misses, hits, sunk = _observations(game, bot)
    occupied, remaining = _resolve_sunk(hits, sunk)
    open_hits = hits - occupied           # hits not yet explained by a sunk ship
    target_mode = bool(open_hits)

    heat: dict[tuple[int, int], int] = defaultdict(int)
    for kind in remaining:
        length = SHIP_KINDS[kind]["length"]
        for horizontal in (True, False):
            max_x = BOARD_SIZE - length + 1 if horizontal else BOARD_SIZE
            max_y = BOARD_SIZE if horizontal else BOARD_SIZE - length + 1
            for x in range(max_x):
                for y in range(max_y):
                    cells = [(x + i, y) if horizontal else (x, y + i) for i in range(length)]
                    # Consistent = avoids every miss and every sunk-ship cell.
                    if any(c in misses or c in occupied for c in cells):
                        continue
                    # In target mode, only placements that explain a live hit
                    # count — this concentrates fire around open hits and extends
                    # partial lines automatically.
                    if target_mode and not any(c in open_hits for c in cells):
                        continue
                    for c in cells:
                        if _key(c[0], c[1]) not in fired:
                            heat[c] += 1
    return heat


def pick_cell(game, bot):
    """Greedy shot: the un-fired cell with the highest posterior hit probability."""
    heat = heatmap(game, bot)
    if heat:
        best = max(heat.values())
        x, y = random.choice([c for c, v in heat.items() if v == best])
        return {"x": x, "y": y}
    # Belief collapsed to nothing consistent (shouldn't happen mid-game); any
    # un-fired cell keeps the game moving.
    rest = [
        (x, y)
        for x in range(BOARD_SIZE)
        for y in range(BOARD_SIZE)
        if _key(x, y) not in game.fired[bot]
    ]
    if not rest:
        return None
    x, y = random.choice(rest)
    return {"x": x, "y": y}
