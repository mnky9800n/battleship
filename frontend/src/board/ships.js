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
