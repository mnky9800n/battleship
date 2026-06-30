import React, { useRef, useEffect } from "react";
import { useBoardContext } from "../BoardContext.jsx";
import { getOffsets } from "../isometric.js";
import { tileWidth, tileHeight, elevationScale } from "../constants.js";
import { toScreenCoords, drawTile, adjustBrightness } from "../rendering.js";

// Draws the ocean: the seafloor diamond per tile (via the forked drawTile) plus
// a translucent lighter "surface" diamond on top, the same two-pass look the
// city renderer used for water. Static for the slice (no wave animation yet).
const WaterLayer = () => {
  const canvasRef = useRef(null);
  const { dimensions, zoom, panX, panY, textures, tiles } = useBoardContext();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    const { offsetX, offsetY } = getOffsets(dimensions, zoom, panX, panY);
    const surfaceOffset = -0.35 * elevationScale * zoom;

    for (const tile of tiles) {
      const { screenX, screenY } = toScreenCoords(tile.x, tile.y, zoom, offsetX, offsetY);

      // Seafloor / base water tile.
      drawTile(ctx, screenX, screenY, tile.elevation, tile.type, tile.corners, zoom, textures);

      // Translucent surface sheen, lifted slightly above the seafloor.
      ctx.save();
      ctx.fillStyle = adjustBrightness("#1f6391", 22);
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(screenX, screenY + surfaceOffset);
      ctx.lineTo(screenX + (tileWidth / 2) * zoom, screenY + (tileHeight / 2) * zoom + surfaceOffset);
      ctx.lineTo(screenX, screenY + tileHeight * zoom + surfaceOffset);
      ctx.lineTo(screenX - (tileWidth / 2) * zoom, screenY + (tileHeight / 2) * zoom + surfaceOffset);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }, [dimensions, zoom, panX, panY, textures, tiles]);

  return (
    <canvas
      ref={canvasRef}
      width={dimensions.width}
      height={dimensions.height}
      style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}
    />
  );
};

export default WaterLayer;
