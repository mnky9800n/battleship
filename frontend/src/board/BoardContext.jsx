import React, { createContext, useContext, useState, useMemo } from "react";
import { gridWidth, gridHeight } from "./constants.js";

// Slimmed-down fork of rainy-city's CityContext. The city version generated
// coastlines, elevation, roads and buildings; a battleship board is just a flat
// 10x10 sheet of water, so all of that is gone. What remains is the shared view
// state (zoom / pan) plus a static list of water tiles and the hovered tile.
//
// `dimensions` is passed in by BoardRenderer (the panel size) rather than read
// from the window, so several boards can sit side by side at any size.

const BoardContext = createContext(null);

export function useBoardContext() {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoardContext must be used within BoardProvider");
  return ctx;
}

// Every tile is flat water (elevation 0, no slope), depth-sorted back-to-front
// the same way the city renderer sorts: by x + y.
function buildWaterTiles() {
  const tiles = [];
  for (let x = 0; x < gridWidth; x++) {
    for (let y = 0; y < gridHeight; y++) {
      tiles.push({
        x,
        y,
        elevation: 0,
        type: "water",
        corners: { n: 0, e: 0, s: 0, w: 0 },
      });
    }
  }
  tiles.sort((a, b) => a.x + a.y - (b.x + b.y));
  return tiles;
}

export function BoardProvider({ view, dimensions, placement = null, initialZoom = 1.2, children }) {
  const [zoom, setZoom] = useState(initialZoom);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [hoveredTile, setHoveredTile] = useState(null);

  const tiles = useMemo(() => buildWaterTiles(), []);

  const value = {
    dimensions,
    zoom,
    setZoom,
    panX,
    setPanX,
    panY,
    setPanY,
    tiles,
    hoveredTile,
    setHoveredTile,
    view,
    placement,
    // Empty texture set: water has no texture, so drawTile falls back to color.
    textures: {},
  };

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}
