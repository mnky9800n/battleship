// Mock `your_view` payload: the exact redacted shape the server will eventually
// push over the socket (see claude-generated-plan.md, "Event protocol").
//
// The renderer is built against THIS contract, not against the server, so the
// frontend and backend agree on one interface from day one. The server's job is
// to produce an object of this shape; the renderer's job is to draw it.
//
// Redaction rule: this object contains YOUR full fleet plus only the REVEALED
// cells of the enemy board (your shots and their results). It never contains the
// enemy's ship layout.

export const SHIP_KINDS = {
  carrier: { length: 5, label: "Carrier" },
  battleship: { length: 4, label: "Battleship" },
  cruiser: { length: 3, label: "Cruiser" },
  submarine: { length: 3, label: "Submarine" },
  destroyer: { length: 2, label: "Destroyer" },
};

// Build the contiguous cells for a ship from an origin + orientation.
function shipCells(kind, x, y, orientation) {
  const len = SHIP_KINDS[kind].length;
  const cells = [];
  for (let i = 0; i < len; i++) {
    cells.push({
      x: orientation === "h" ? x + i : x,
      y: orientation === "v" ? y + i : y,
    });
  }
  return cells;
}

export const mockView = {
  size: 10,
  whoseTurn: "you",

  // YOUR fleet: full positions are known to you (this is your own board).
  ownShips: [
    { id: "s1", kind: "carrier", orientation: "h", cells: shipCells("carrier", 1, 1, "h") },
    { id: "s2", kind: "battleship", orientation: "v", cells: shipCells("battleship", 8, 0, "v") },
    { id: "s3", kind: "cruiser", orientation: "h", cells: shipCells("cruiser", 3, 5, "h") },
    { id: "s4", kind: "submarine", orientation: "v", cells: shipCells("submarine", 6, 4, "v") },
    { id: "s5", kind: "destroyer", orientation: "h", cells: shipCells("destroyer", 0, 8, "h") },
  ],

  // Enemy shots that have landed on YOUR board.
  ownHits: [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
  ],

  // YOUR shots on the enemy board and their revealed results.
  shots: [
    { x: 4, y: 4, result: "miss" },
    { x: 5, y: 5, result: "hit" },
    { x: 5, y: 6, result: "hit", sunkShip: null },
    { x: 0, y: 0, result: "miss" },
    { x: 9, y: 9, result: "miss" },
  ],
};
