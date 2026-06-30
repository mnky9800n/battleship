// Shared fleet definition, used by both the renderer (ShipLayer) and the mock
// authority (MockServer). Mirrors the classic Battleship fleet from the design
// doc / sentient-task.md.

export const SHIP_KINDS = {
  carrier: { length: 5, label: "Carrier" },
  battleship: { length: 4, label: "Battleship" },
  cruiser: { length: 3, label: "Cruiser" },
  submarine: { length: 3, label: "Submarine" },
  destroyer: { length: 2, label: "Destroyer" },
};

// The fleet a player places, in descending size.
export const FLEET = ["carrier", "battleship", "cruiser", "submarine", "destroyer"];

export const BOARD_SIZE = 10;

// Orientation of a placed ship inferred from its cells ("h" = along grid-x).
export function orientationOf(cells) {
  if (cells.length < 2) return "h";
  return cells[0].x === cells[1].x ? "v" : "h";
}

// Cells a ship would occupy from an anchor cell, in a given orientation.
export function footprintCells(anchor, length, orientation) {
  const cells = [];
  for (let i = 0; i < length; i++) {
    cells.push({
      x: orientation === "h" ? anchor.x + i : anchor.x,
      y: orientation === "v" ? anchor.y + i : anchor.y,
    });
  }
  return cells;
}

// A placement is legal if every cell is on the board and unoccupied.
export function placementValid(cells, occupied) {
  return cells.every(
    (c) =>
      c.x >= 0 &&
      c.x < BOARD_SIZE &&
      c.y >= 0 &&
      c.y < BOARD_SIZE &&
      !occupied.has(`${c.x},${c.y}`)
  );
}
