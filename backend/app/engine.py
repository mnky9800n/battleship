"""Battleship game engine — the server-side authority.

A faithful port of the browser reference implementation
(frontend/src/net/MockServer.js), generalized from "you vs ai" to two arbitrary
players. This module is transport-free and pure-Python so it can be unit-tested
in isolation; the socket layer (sockets.py) drives it.

Output snapshots use camelCase keys to match exactly what the existing frontend
already consumes (snap.gameId, snap.whoseTurn, shot.sunkShip, ...), so swapping
the client's transport requires no UI change.
"""

from __future__ import annotations

import random
from typing import Optional

# Fleet definition — mirrors frontend/src/board/ships.js.
SHIP_KINDS = {
    "carrier": {"length": 5, "label": "Carrier"},
    "battleship": {"length": 4, "label": "Battleship"},
    "cruiser": {"length": 3, "label": "Cruiser"},
    "submarine": {"length": 3, "label": "Submarine"},
    "destroyer": {"length": 2, "label": "Destroyer"},
}
FLEET = ["carrier", "battleship", "cruiser", "submarine", "destroyer"]
BOARD_SIZE = 10


def _key(x: int, y: int) -> str:
    return f"{x},{y}"


def in_bounds(x: int, y: int) -> bool:
    return 0 <= x < BOARD_SIZE and 0 <= y < BOARD_SIZE


def orientation_of(cells: list[dict]) -> str:
    if len(cells) < 2:
        return "h"
    return "v" if cells[0]["x"] == cells[1]["x"] else "h"


def is_straight_contiguous(cells: list[dict]) -> bool:
    """Cells form a single straight, gap-free horizontal or vertical run."""
    if not cells:
        return False
    if len(cells) == 1:
        return True
    same_row = all(c["y"] == cells[0]["y"] for c in cells)
    same_col = all(c["x"] == cells[0]["x"] for c in cells)
    if not same_row and not same_col:
        return False
    axis = "x" if same_row else "y"
    vals = sorted(c[axis] for c in cells)
    return all(vals[i] == vals[i - 1] + 1 for i in range(1, len(vals)))


def random_fleet() -> list[dict]:
    """Place the full fleet randomly with no overlaps."""
    occupied: set[str] = set()
    ships: list[dict] = []
    for kind in FLEET:
        length = SHIP_KINDS[kind]["length"]
        while True:
            horizontal = random.random() < 0.5
            x = random.randint(0, BOARD_SIZE - length) if horizontal else random.randint(0, BOARD_SIZE - 1)
            y = random.randint(0, BOARD_SIZE - 1) if horizontal else random.randint(0, BOARD_SIZE - length)
            cells = [
                {"x": x + i if horizontal else x, "y": y if horizontal else y + i}
                for i in range(length)
            ]
            if any(_key(c["x"], c["y"]) in occupied for c in cells):
                continue
            for c in cells:
                occupied.add(_key(c["x"], c["y"]))
            ships.append({"id": kind, "kind": kind, "cells": cells, "hits": set()})
            break
    return ships


def ship_is_sunk(ship: dict) -> bool:
    return len(ship["hits"]) >= len(ship["cells"])


def fleet_defeated(ships: list[dict]) -> bool:
    return all(ship_is_sunk(s) for s in ships)


class GameError(Exception):
    """Raised on an illegal action; the message is sent to the offending client."""


class Game:
    """Authoritative state for a single match between two player ids."""

    def __init__(self, game_id: str, players: list[str], vs_ai: bool = False):
        if len(players) != 2:
            raise ValueError("a game needs exactly two players")
        self.id = game_id
        self.players = players  # [creator, opponent]
        self.vs_ai = vs_ai
        self.status = "setup"  # "setup" | "playing" | "over"
        self.turn: Optional[str] = None
        self.winner: Optional[str] = None
        self.fleets: dict[str, list[dict]] = {p: [] for p in players}
        self.shots: dict[str, list[dict]] = {p: [] for p in players}
        self.fired: dict[str, set[str]] = {p: set() for p in players}
        self.ready: set[str] = set()
        self.move_log: list[dict] = []  # append-only (player, x, y, result)
        self.ai_state: dict[str, dict] = {p: {"targets": []} for p in players}
        self.last_shot: Optional[dict] = None
        # In-game chat/taunt transcript ({from, text, bot?}); replayed to a
        # (re)connecting player so the log survives a refresh while the game lives.
        self.chat_log: list[dict] = []

    def opponent(self, pid: str) -> str:
        return self.players[1] if pid == self.players[0] else self.players[0]

    # --- setup phase ----------------------------------------------------

    def place_ship(self, pid: str, kind: str, cells: list[dict]) -> None:
        if self.status != "setup":
            raise GameError("not in setup")
        if pid not in self.players:
            raise GameError("not a player in this game")
        if kind not in SHIP_KINDS:
            raise GameError("unknown ship")
        if len(cells) != SHIP_KINDS[kind]["length"]:
            raise GameError("wrong length")
        if not all(in_bounds(c["x"], c["y"]) for c in cells):
            raise GameError("off board")
        if not is_straight_contiguous(cells):
            raise GameError("must be a straight line")

        others = [s for s in self.fleets[pid] if s["kind"] != kind]
        taken = {_key(c["x"], c["y"]) for s in others for c in s["cells"]}
        if any(_key(c["x"], c["y"]) in taken for c in cells):
            raise GameError("ships overlap")

        # Reposition replaces any existing ship of the same kind.
        self.fleets[pid] = others + [{"id": kind, "kind": kind, "cells": cells, "hits": set()}]

    def clear_placement(self, pid: str) -> None:
        if self.status != "setup":
            return
        self.fleets[pid] = []
        self.ready.discard(pid)

    def fleet_complete(self, pid: str) -> bool:
        placed = {s["kind"] for s in self.fleets[pid]}
        return all(k in placed for k in FLEET)

    def set_ready(self, pid: str) -> None:
        if self.status != "setup":
            raise GameError("not in setup")
        if not self.fleet_complete(pid):
            raise GameError("place all ships first")
        self.ready.add(pid)
        if all(p in self.ready for p in self.players):
            self.status = "playing"
            self.turn = self.players[0]  # creator/human moves first

    # --- playing phase: the fire pipeline -------------------------------

    def fire(self, pid: str, x: int, y: int) -> None:
        if self.status != "playing":
            raise GameError("game not live")
        if self.turn != pid:
            raise GameError("not your turn")
        if not in_bounds(x, y):
            raise GameError("invalid target")
        if _key(x, y) in self.fired[pid]:
            raise GameError("already fired there")

        opp = self.opponent(pid)
        result, sunk_ship = self._resolve(self.fleets[opp], x, y)

        self.fired[pid].add(_key(x, y))
        shot = {"x": x, "y": y, "result": result, "sunkShip": sunk_ship}
        self.shots[pid].append(shot)
        self.last_shot = shot
        self.move_log.append({"player": pid, "x": x, "y": y, "result": result})

        if fleet_defeated(self.fleets[opp]):
            self.status = "over"
            self.winner = pid
        else:
            self.turn = opp

    @staticmethod
    def _resolve(fleet: list[dict], x: int, y: int) -> tuple[str, Optional[str]]:
        for ship in fleet:
            if any(c["x"] == x and c["y"] == y for c in ship["cells"]):
                ship["hits"].add(_key(x, y))
                label = SHIP_KINDS[ship["kind"]]["label"] if ship_is_sunk(ship) else None
                return "hit", label
        return "miss", None

    # --- hunt/target AI -------------------------------------------------

    def ai_take_turn(self, bot: str) -> None:
        """Pick a cell, fire it, and queue neighbours on a hit."""
        if self.status != "playing" or self.turn != bot:
            return
        cell = self._ai_pick_cell(bot)
        if cell is None:
            return
        self.fire(bot, cell["x"], cell["y"])
        last = self.shots[bot][-1]
        if last["result"] == "hit" and self.status == "playing":
            self._queue_after_hit(bot, cell)

    def _ai_pick_cell(self, bot: str) -> Optional[dict]:
        fired = self.fired[bot]
        targets = self.ai_state[bot]["targets"]
        # Target mode: drain queued neighbours of recent hits.
        while targets:
            c = targets.pop()
            if in_bounds(c["x"], c["y"]) and _key(c["x"], c["y"]) not in fired:
                return c
        # Hunt mode: random unshot cell, preferring a checkerboard parity.
        parity = [
            {"x": x, "y": y}
            for x in range(BOARD_SIZE)
            for y in range(BOARD_SIZE)
            if _key(x, y) not in fired and (x + y) % 2 == 0
        ]
        candidates = parity or [
            {"x": x, "y": y}
            for x in range(BOARD_SIZE)
            for y in range(BOARD_SIZE)
            if _key(x, y) not in fired
        ]
        return random.choice(candidates) if candidates else None

    def _queue_after_hit(self, bot: str, c: dict) -> None:
        for n in (
            {"x": c["x"] + 1, "y": c["y"]},
            {"x": c["x"] - 1, "y": c["y"]},
            {"x": c["x"], "y": c["y"] + 1},
            {"x": c["x"], "y": c["y"] - 1},
        ):
            if in_bounds(n["x"], n["y"]) and _key(n["x"], n["y"]) not in self.fired[bot]:
                self.ai_state[bot]["targets"].append(n)

    # --- redacted views (the anti-cheat boundary) -----------------------

    def _ships_payload(self, ships: list[dict], only_sunk: bool) -> list[dict]:
        out = []
        for s in ships:
            sunk = ship_is_sunk(s)
            if only_sunk and not sunk:
                continue
            out.append({
                "id": s["id"],
                "kind": s["kind"],
                "orientation": orientation_of(s["cells"]),
                "cells": s["cells"],
                "sunk": sunk,
            })
        return out

    def view_for(self, viewer: str, board: str) -> dict:
        """`board`="own" (your fleet + incoming fire) or "enemy" (your shots;
        only the opponent's SUNK ships are revealed)."""
        opp = self.opponent(viewer)
        if board == "own":
            return {
                "size": BOARD_SIZE,
                "ships": self._ships_payload(self.fleets[viewer], only_sunk=False),
                "incoming": [
                    {"x": s["x"], "y": s["y"], "result": s["result"]} for s in self.shots[opp]
                ],
                "outgoing": [],
            }
        return {
            "size": BOARD_SIZE,
            "ships": self._ships_payload(self.fleets[opp], only_sunk=True),
            "incoming": [],
            "outgoing": [dict(s) for s in self.shots[viewer]],
        }

    def snapshot_for(self, viewer: str) -> dict:
        whose = None
        if self.status == "playing":
            whose = "you" if self.turn == viewer else "enemy"
        winner = None
        if self.winner is not None:
            winner = "you" if self.winner == viewer else "enemy"
        return {
            "gameId": self.id,
            "status": self.status,
            "opponent": self.opponent(viewer),  # identity is not secret (only ship positions are); used for rematch
            "whoseTurn": whose,
            "winner": winner,
            "youReady": viewer in self.ready,
            "enemyReady": self.opponent(viewer) in self.ready,
            "lastShot": dict(self.last_shot) if self.last_shot else None,
            "own": self.view_for(viewer, "own"),
            "enemy": self.view_for(viewer, "enemy"),
        }
