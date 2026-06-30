import React, { useRef, useEffect } from "react";
import { paintShip } from "./shipSpriteRenderer.js";

// A draggable ship sprite: a 2D canvas painted by the shared WebGL renderer
// (one GL context for all sprites). The canvas itself is the drag handle, so the
// ship art is the drag image.

export default function ShipSprite({ kind, done, onDragStart, height = 72 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 170;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(height * dpr);
    paintShip(kind, canvas);
  }, [kind, height]);

  return (
    <canvas
      ref={ref}
      draggable
      onDragStart={onDragStart}
      style={{ width: "100%", height, display: "block", opacity: done ? 0.4 : 1, cursor: "grab" }}
    />
  );
}
