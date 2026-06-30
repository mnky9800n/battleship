import React, { useRef, useEffect } from "react";
import { useBoardContext } from "../BoardContext.jsx";
import { getOffsets } from "../isometric.js";
import { tileWidth, tileHeight, elevationScale } from "../constants.js";
import { toScreenCoords } from "../rendering.js";
import { footprintCells, placementValid } from "../ships.js";

// Overlay for everything that lives on top of the water: the grid outline, the
// hover highlight, and the shot/hit markers read from the view. Sits at the same
// "surface" height as the water sheen so markers rest on the waterline.
const SURFACE = (zoom) => -0.35 * elevationScale * zoom;

// Trace the diamond for one tile at surface height into the current path.
function tileDiamond(ctx, sx, sy, zoom) {
  const off = SURFACE(zoom);
  ctx.moveTo(sx, sy + off);
  ctx.lineTo(sx + (tileWidth / 2) * zoom, sy + (tileHeight / 2) * zoom + off);
  ctx.lineTo(sx, sy + tileHeight * zoom + off);
  ctx.lineTo(sx - (tileWidth / 2) * zoom, sy + (tileHeight / 2) * zoom + off);
  ctx.closePath();
}

function tileCenter(x, y, zoom, offsetX, offsetY) {
  const { screenX, screenY } = toScreenCoords(x, y, zoom, offsetX, offsetY);
  return { cx: screenX, cy: screenY + (tileHeight / 2) * zoom + SURFACE(zoom) };
}

const GridLayer = () => {
  const canvasRef = useRef(null);
  const { dimensions, zoom, panX, panY, tiles, hoveredTile, view, placement } = useBoardContext();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    const { offsetX, offsetY } = getOffsets(dimensions, zoom, panX, panY);

    // Grid cell outlines.
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(120, 200, 235, 0.28)";
    for (const tile of tiles) {
      const { screenX, screenY } = toScreenCoords(tile.x, tile.y, zoom, offsetX, offsetY);
      ctx.beginPath();
      tileDiamond(ctx, screenX, screenY, zoom);
      ctx.stroke();
    }

    // Incoming shots landing on THIS board (enemy fire on your waters):
    // orange burst for a hit on your hull, white splash ring for a miss.
    for (const shot of view?.incoming ?? []) {
      const { cx, cy } = tileCenter(shot.x, shot.y, zoom, offsetX, offsetY);
      if (shot.result === "hit") {
        ctx.fillStyle = "rgba(255, 120, 30, 0.92)";
        ctx.beginPath();
        ctx.arc(cx, cy, 5 * zoom, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = "rgba(200, 225, 240, 0.7)";
        ctx.lineWidth = 1.25 * zoom;
        ctx.beginPath();
        ctx.arc(cx, cy, 4.5 * zoom, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Cells of fully-sunk ships: the .glb model is revealed there, so we skip
    // the hit-marker so the model shows instead of red Xs.
    const sunkCells = new Set();
    for (const s of view?.ships ?? []) {
      if (s.sunk) for (const c of s.cells) sunkCells.add(`${c.x},${c.y}`);
    }

    // Your outgoing shots on this board (red X for hit, white ring for miss).
    for (const shot of view?.outgoing ?? []) {
      if (sunkCells.has(`${shot.x},${shot.y}`)) continue;
      const { cx, cy } = tileCenter(shot.x, shot.y, zoom, offsetX, offsetY);
      const r = 6 * zoom;
      if (shot.result === "hit") {
        ctx.strokeStyle = "#ff3b3b";
        ctx.lineWidth = 2.5 * zoom;
        ctx.beginPath();
        ctx.moveTo(cx - r, cy - r);
        ctx.lineTo(cx + r, cy + r);
        ctx.moveTo(cx + r, cy - r);
        ctx.lineTo(cx - r, cy + r);
        ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(235, 245, 255, 0.85)";
        ctx.lineWidth = 1.5 * zoom;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Placement ghost: the candidate ship's footprint follows the cursor during
    // setup, green if it's a legal placement, red if not.
    if (placement && hoveredTile) {
      const cells = footprintCells(hoveredTile, placement.length, placement.orientation);
      const ok = placementValid(cells, placement.occupied);
      ctx.fillStyle = ok ? "rgba(110, 255, 160, 0.30)" : "rgba(255, 80, 80, 0.30)";
      ctx.strokeStyle = ok ? "rgba(150, 255, 190, 0.95)" : "rgba(255, 120, 120, 0.95)";
      ctx.lineWidth = 2;
      for (const c of cells) {
        if (c.x < 0 || c.x >= 10 || c.y < 0 || c.y >= 10) continue;
        const { screenX, screenY } = toScreenCoords(c.x, c.y, zoom, offsetX, offsetY);
        ctx.beginPath();
        tileDiamond(ctx, screenX, screenY, zoom);
        ctx.fill();
        ctx.stroke();
      }
    } else if (hoveredTile) {
      // Plain hover highlight (firing / idle).
      const { screenX, screenY } = toScreenCoords(hoveredTile.x, hoveredTile.y, zoom, offsetX, offsetY);
      ctx.beginPath();
      tileDiamond(ctx, screenX, screenY, zoom);
      ctx.fillStyle = "rgba(120, 230, 255, 0.22)";
      ctx.fill();
      ctx.strokeStyle = "rgba(160, 245, 255, 0.95)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [dimensions, zoom, panX, panY, tiles, hoveredTile, view, placement]);

  return (
    <canvas
      ref={canvasRef}
      width={dimensions.width}
      height={dimensions.height}
      style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}
    />
  );
};

export default GridLayer;
