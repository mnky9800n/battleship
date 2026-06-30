import React, { useState, useEffect, useRef, useCallback } from "react";
import BoardRenderer from "./board/BoardRenderer.jsx";
import GameClient from "./net/GameClient.js";

// Two-board layout: your waters (fleet + incoming fire) on the left, enemy
// waters (your shots; click to fire) on the right. Both are driven live by the
// GameClient -> MockServer authority.

const COL = (x) => String.fromCharCode(65 + x);
const coord = (s) => (s ? `${COL(s.x)}${s.y + 1}` : "--");

export default function App() {
  const clientRef = useRef(null);
  if (!clientRef.current) clientRef.current = new GameClient();
  const client = clientRef.current;

  const [snap, setSnap] = useState(null);
  const [flash, setFlash] = useState(null);

  const newGame = useCallback(() => client.startVsAI(), [client]);

  useEffect(() => {
    const off = client.on("state", setSnap);
    const offErr = client.on("error", (e) => setFlash(e.message));
    client.login("player").then(newGame);
    return () => {
      off();
      offErr();
    };
  }, [client, newGame]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  const handleFire = useCallback(
    (tile) => {
      if (!snap || snap.status !== "playing") return;
      if (snap.whoseTurn !== "you") {
        setFlash("not your turn");
        return;
      }
      client.fire(tile.x, tile.y);
    },
    [client, snap]
  );

  const yourTurn = snap?.whoseTurn === "you";
  const over = snap?.status === "over";
  const won = over && snap?.winner === "you";

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={barStyle}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <span style={{ fontSize: 20, letterSpacing: 3 }}>BATTLESHIP</span>
          <span style={{ fontSize: 11, opacity: 0.55 }}>
            drag pan · wheel zoom · click enemy waters to fire
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 13, color: over ? (won ? "#6effa0" : "#ff6e6e") : yourTurn ? "#9fe8ff" : "#ffb066" }}>
            {over
              ? won
                ? "ENEMY FLEET DESTROYED — YOU WIN"
                : "YOUR FLEET LOST"
              : yourTurn
              ? "YOUR TURN — fire at will"
              : "ENEMY TURN…"}
          </span>
          <span style={{ fontSize: 12, opacity: 0.75 }}>
            last: {coord(snap?.lastShot)}
            {snap?.lastShot?.result ? ` (${snap.lastShot.result}${snap.lastShot.sunkShip ? " · sank " + snap.lastShot.sunkShip : ""})` : ""}
          </span>
          <button onClick={newGame} style={btnStyle}>↻ NEW GAME</button>
        </div>
      </div>

      {/* Boards */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Panel label="YOUR WATERS" sub="your fleet · incoming fire">
          {snap && <BoardRenderer view={snap.own} />}
        </Panel>
        <Panel label="ENEMY WATERS" sub="your shots · click to fire" divider active={yourTurn && !over}>
          {snap && <BoardRenderer view={snap.enemy} onTileClick={handleFire} />}
        </Panel>
      </div>

      {flash && <div style={flashStyle}>{flash}</div>}
    </div>
  );
}

function Panel({ label, sub, divider, active, children }) {
  return (
    <div
      style={{
        flex: 1,
        position: "relative",
        minWidth: 0,
        borderLeft: divider ? "1px solid rgba(120,200,235,0.18)" : "none",
        background: "radial-gradient(circle at 50% 40%, #0b2030 0%, #06121b 72%)",
        boxShadow: active ? "inset 0 0 0 2px rgba(120,230,255,0.35)" : "none",
      }}
    >
      {children}
      <div style={labelStyle}>
        <div style={{ fontSize: 14, letterSpacing: 2 }}>{label}</div>
        <div style={{ fontSize: 10, opacity: 0.55 }}>{sub}</div>
      </div>
    </div>
  );
}

const FONT = '"Courier New", monospace';

const barStyle = {
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 16px",
  color: "#9fe8ff",
  fontFamily: FONT,
  textShadow: "0 0 6px rgba(40,180,230,0.45)",
  background: "#06121b",
  borderBottom: "1px solid rgba(120,200,235,0.18)",
  userSelect: "none",
};

const labelStyle = {
  position: "absolute",
  top: 12,
  left: 14,
  color: "#9fe8ff",
  fontFamily: FONT,
  textShadow: "0 0 6px rgba(40,180,230,0.5)",
  pointerEvents: "none",
  userSelect: "none",
};

const btnStyle = {
  cursor: "pointer",
  background: "transparent",
  color: "#9fe8ff",
  border: "1px solid rgba(120,200,235,0.5)",
  padding: "5px 10px",
  fontFamily: FONT,
  fontSize: 12,
  letterSpacing: 1,
};

const flashStyle = {
  position: "absolute",
  bottom: 28,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 11,
  color: "#06121b",
  background: "#9fe8ff",
  padding: "6px 14px",
  fontFamily: FONT,
  fontSize: 12,
  letterSpacing: 1,
};
