import React, { useState, useCallback } from "react";
import BoardRenderer from "./board/BoardRenderer.jsx";
import { mockView } from "./mockView.js";

// Renderer vertical slice (milestone 1). Drives the forked rainy-city board with
// a static mock `your_view`: proves the 10x10 ocean renders, click-to-fire maps
// to the right tile, and the .glb ships sit on the board, all against the data
// contract the server will later produce. No backend yet.
export default function App() {
  const [lastShot, setLastShot] = useState(null);

  const handleTileClick = useCallback((tile) => {
    // In the real game this emits `fire {gameId, x, y}`; here we just echo it.
    setLastShot(tile);
  }, []);

  const coord = (t) => `${String.fromCharCode(65 + t.x)}${t.y + 1}`;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <BoardRenderer view={mockView} onTileClick={handleTileClick} />

      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 10,
          color: "#9fe8ff",
          textShadow: "0 0 6px rgba(40,180,230,0.6)",
          fontFamily: '"Courier New", monospace',
          fontSize: 13,
          lineHeight: 1.6,
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        <div style={{ fontSize: 18, letterSpacing: 2 }}>BATTLESHIP // SLICE</div>
        <div style={{ opacity: 0.7 }}>drag = pan · wheel = zoom · click = fire</div>
        <div style={{ marginTop: 6 }}>
          target: {lastShot ? coord(lastShot) : "--"}
        </div>
      </div>
    </div>
  );
}
