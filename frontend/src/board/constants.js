// Battleship board geometry. Forked from rainy-city's constants, shrunk from a
// 75x75 city to a flat 10x10 ocean. Only `water` is needed as a tile type.

export const tileConfig = {
  water: {
    color: "#1f6391", // deep ocean; no texture, drawTile falls back to this color
  },
};

// Isometric tile dimensions (pixels, before zoom). Same diamond ratio as rainy-city.
export const tileWidth = 64;
export const tileHeight = 32;

// Battleship is a 10x10 grid.
export const gridWidth = 10;
export const gridHeight = 10;

// Height of one elevation level in pixels. The board is flat (elevation 0), but
// drawTile and getOffsets still reference this, so keep it consistent.
export const elevationScale = 24;
