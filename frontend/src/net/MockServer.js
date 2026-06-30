import { SHIP_KINDS, FLEET, BOARD_SIZE, orientationOf } from "../board/ships.js";

// In-browser game authority. This is the reference implementation of the
// Battleship rules that the Python backend will later mirror: random placement,
// the fire-validation pipeline, hit/miss/sunk resolution, win detection, an
// append-only move log, redacted per-player views, and a hunt/target AI.
//
// It is deliberately transport-shaped: the UI talks to it through GameClient and
// only ever receives redacted views + events, exactly as it will over a socket.
// Swapping this for a real server later changes one wire, not the UI.

const key = (x, y) => `${x},${y}`;
const inBounds = (x, y) => x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;

function randInt(n) {
  return Math.floor(Math.random() * n);
}

// Place the full fleet randomly with no overlaps. Returns ships with cells +
// an empty hit set.
function randomFleet() {
  const occupied = new Set();
  const ships = [];
  for (const kind of FLEET) {
    const len = SHIP_KINDS[kind].length;
    for (;;) {
      const horizontal = Math.random() < 0.5;
      const x = randInt(horizontal ? BOARD_SIZE - len + 1 : BOARD_SIZE);
      const y = randInt(horizontal ? BOARD_SIZE : BOARD_SIZE - len + 1);
      const cells = [];
      for (let i = 0; i < len; i++) {
        cells.push({ x: horizontal ? x + i : x, y: horizontal ? y : y + i });
      }
      if (cells.some((c) => occupied.has(key(c.x, c.y)))) continue;
      cells.forEach((c) => occupied.add(key(c.x, c.y)));
      ships.push({ id: `${kind}-${ships.length}`, kind, cells, hits: new Set() });
      break;
    }
  }
  return ships;
}

function shipIsSunk(ship) {
  return ship.hits.size >= ship.cells.length;
}

function fleetDefeated(ships) {
  return ships.every(shipIsSunk);
}

// Cells form a single straight, gap-free horizontal or vertical run.
function isStraightContiguous(cells) {
  if (cells.length === 0) return false;
  if (cells.length === 1) return true;
  const sameRow = cells.every((c) => c.y === cells[0].y);
  const sameCol = cells.every((c) => c.x === cells[0].x);
  if (!sameRow && !sameCol) return false;
  const axis = sameRow ? "x" : "y";
  const vals = cells.map((c) => c[axis]).sort((a, b) => a - b);
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] !== vals[i - 1] + 1) return false;
  }
  return true;
}

export default class MockServer {
  constructor() {
    this.listeners = new Map();
    this.game = null;
    this.aiTimer = null;
  }

  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  emit(event, payload) {
    this.listeners.get(event)?.forEach((cb) => cb(payload));
  }

  // --- lifecycle ---------------------------------------------------------

  // Minimal "login": the trial's security is intentionally trivial.
  login(username) {
    return Promise.resolve({ username, token: `mock-${username}`, avatar: null });
  }

  // Offline parity with SocketTransport. Offline mode is practice-vs-AI only.
  signup(username) {
    return Promise.resolve({ username, token: `mock-${username}`, avatar: null });
  }

  createGame() {
    this.startVsAI(); // offline: any "create" is a vs-AI practice game
  }

  joinGame() {
    this.emit("error", { message: "joining is online-only — start the server for multiplayer" });
  }

  leave() {}

  // Start a vs-AI game in the SETUP phase. The AI places randomly now (hidden);
  // the human places their fleet via placeShip, then ready() begins play.
  startVsAI() {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.game = {
      id: `g-${Date.now()}`,
      status: "setup",
      turn: null,
      fleets: { you: [], ai: randomFleet() },
      // shots[by] = ordered list of { x, y, result, sunkShip } that `by` fired
      shots: { you: [], ai: [] },
      fired: { you: new Set(), ai: new Set() }, // dedupe of cells `by` has fired at
      moveLog: [],
      winner: null,
      ai: { targets: [] }, // hunt/target queue of cells to probe
    };
    this.publish();
    return this.game.id;
  }

  // --- setup phase: ship placement ---------------------------------------

  // Place (or reposition) one of the player's ships. Validates kind, length,
  // straightness, bounds, and overlap with the player's other ships.
  placeShip(kind, cells) {
    const g = this.game;
    if (!g || g.status !== "setup") return this.reject("not in setup");
    if (!SHIP_KINDS[kind]) return this.reject("unknown ship");
    if (cells.length !== SHIP_KINDS[kind].length) return this.reject("wrong length");
    if (!cells.every((c) => inBounds(c.x, c.y))) return this.reject("off board");
    if (!isStraightContiguous(cells)) return this.reject("must be a straight line");

    // Overlap check against the player's OTHER ships (reposition replaces).
    const others = g.fleets.you.filter((s) => s.kind !== kind);
    const taken = new Set(others.flatMap((s) => s.cells.map((c) => key(c.x, c.y))));
    if (cells.some((c) => taken.has(key(c.x, c.y)))) return this.reject("ships overlap");

    g.fleets.you = [...others, { id: kind, kind, cells, hits: new Set() }];
    this.publish();
    return true;
  }

  clearPlacement() {
    const g = this.game;
    if (!g || g.status !== "setup") return;
    g.fleets.you = [];
    this.publish();
  }

  // Begin play once the whole fleet is placed. You move first.
  ready() {
    const g = this.game;
    if (!g || g.status !== "setup") return this.reject("not in setup");
    const placed = new Set(g.fleets.you.map((s) => s.kind));
    if (!FLEET.every((k) => placed.has(k))) return this.reject("place all ships first");
    g.status = "playing";
    g.turn = "you";
    this.publish();
  }

  // --- the fire pipeline (the only in-play write path) -------------------

  // Public action used by GameClient: the human ("you") fires. Identity is fixed
  // here, mirroring the server binding identity to the socket.
  fire(x, y) {
    this._fire("you", x, y);
  }

  _fire(by, x, y) {
    const g = this.game;
    // 1. game live?
    if (!g || g.status !== "playing") return this.reject("game not live");
    // 2. sender's turn?
    if (g.turn !== by) return this.reject("not your turn");
    // 3. target legal?
    if (!inBounds(x, y)) return this.reject("invalid target");
    if (g.fired[by].has(key(x, y))) return this.reject("already fired there");

    const opponent = by === "you" ? "ai" : "you";
    const { result, sunkShip } = this.resolve(g.fleets[opponent], x, y);

    g.fired[by].add(key(x, y));
    g.shots[by].push({ x, y, result, sunkShip });
    g.moveLog.push({ player: by, x, y, result }); // append-only, server-truth

    // 4. check win, else swap turn
    if (fleetDefeated(g.fleets[opponent])) {
      g.status = "over";
      g.winner = by;
    } else {
      g.turn = opponent;
    }
    this.publish();

    // AI plays its turn automatically after a beat.
    if (g.status === "playing" && g.turn === "ai") {
      this.aiTimer = setTimeout(() => this.aiMove(), 450);
    }
  }

  // Resolve a shot against a fleet: mutate the hit ship, report hit/miss/sunk.
  resolve(fleet, x, y) {
    for (const ship of fleet) {
      if (ship.cells.some((c) => c.x === x && c.y === y)) {
        ship.hits.add(key(x, y));
        return {
          result: "hit",
          sunkShip: shipIsSunk(ship) ? SHIP_KINDS[ship.kind].label : null,
        };
      }
    }
    return { result: "miss", sunkShip: null };
  }

  reject(message) {
    this.emit("error", { message });
  }

  // --- hunt/target AI ----------------------------------------------------

  aiMove() {
    const g = this.game;
    if (!g || g.status !== "playing" || g.turn !== "ai") return;

    const cell = this.aiPickCell();
    if (cell) this._fire("ai", cell.x, cell.y);
  }

  aiPickCell() {
    const g = this.game;
    const fired = g.fired.ai;

    // Target mode: drain queued neighbours of recent hits.
    while (g.ai.targets.length) {
      const c = g.ai.targets.pop();
      if (inBounds(c.x, c.y) && !fired.has(key(c.x, c.y))) {
        this.queueAfterHit(c);
        return c;
      }
    }

    // Hunt mode: random unshot cell, preferring a checkerboard parity (no ship
    // can hide entirely between parity cells, so this halves the search).
    const candidates = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        if (!fired.has(key(x, y)) && (x + y) % 2 === 0) candidates.push({ x, y });
      }
    }
    if (!candidates.length) {
      for (let x = 0; x < BOARD_SIZE; x++)
        for (let y = 0; y < BOARD_SIZE; y++)
          if (!fired.has(key(x, y))) candidates.push({ x, y });
    }
    if (!candidates.length) return null;
    const pick = candidates[randInt(candidates.length)];
    this.queueAfterHitConditional(pick);
    return pick;
  }

  // If the chosen hunt cell turns out to be a hit, its neighbours get queued.
  // We can't know the result before firing, so we peek at the player's fleet
  // here only to decide whether to enqueue (the AI is allowed to "remember" its
  // own hits; this is not reading hidden enemy info beyond its own shot result).
  queueAfterHitConditional(c) {
    const willHit = this.game.fleets.you.some((s) =>
      s.cells.some((cell) => cell.x === c.x && cell.y === c.y)
    );
    if (willHit) this.queueAfterHit(c);
  }

  queueAfterHit(c) {
    const neighbours = [
      { x: c.x + 1, y: c.y },
      { x: c.x - 1, y: c.y },
      { x: c.x, y: c.y + 1 },
      { x: c.x, y: c.y - 1 },
    ];
    for (const n of neighbours) {
      if (inBounds(n.x, n.y) && !this.game.fired.ai.has(key(n.x, n.y))) {
        this.game.ai.targets.push(n);
      }
    }
  }

  // --- redacted views ----------------------------------------------------

  // Build the view of one board for the human player. `board` is "own" (your
  // waters: your fleet + incoming AI fire) or "enemy" (their waters: your shots,
  // and only their SUNK ships are revealed).
  viewFor(board) {
    const g = this.game;
    if (!g) return null;

    if (board === "own") {
      return {
        size: BOARD_SIZE,
        ships: g.fleets.you.map((s) => ({
          id: s.id,
          kind: s.kind,
          orientation: orientationOf(s.cells),
          cells: s.cells,
          sunk: shipIsSunk(s),
        })),
        incoming: g.shots.ai.map(({ x, y, result }) => ({ x, y, result })),
        outgoing: [],
      };
    }

    // enemy waters: redaction — only sunk enemy ships are revealed.
    return {
      size: BOARD_SIZE,
      ships: g.fleets.ai
        .filter(shipIsSunk)
        .map((s) => ({
          id: s.id,
          kind: s.kind,
          orientation: orientationOf(s.cells),
          cells: s.cells,
          sunk: true,
        })),
      incoming: [],
      outgoing: g.shots.you.map(({ x, y, result, sunkShip }) => ({ x, y, result, sunkShip })),
    };
  }

  snapshot() {
    const g = this.game;
    if (!g) return null;
    const last = g.shots.you[g.shots.you.length - 1] || g.shots.ai[g.shots.ai.length - 1];
    return {
      gameId: g.id,
      status: g.status,
      whoseTurn: g.turn,
      winner: g.winner,
      lastShot: last || null,
      own: this.viewFor("own"),
      enemy: this.viewFor("enemy"),
    };
  }

  publish() {
    this.emit("state", this.snapshot());
  }
}
