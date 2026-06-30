import React, { useState, useEffect, useRef, useCallback } from "react";
import BoardRenderer from "./board/BoardRenderer.jsx";
import GameClient from "./net/GameClient.js";

// Milestone 2: the frontend plays a full game against a backend that doesn't
// exist yet. GameClient -> MockServer runs the real rules in the browser; this
// component never knows the authority is a mock. Clicking enemy waters fires
// through the client, the (mock) AI fires back, and the redacted views update
// live, exactly as they will over a socket.

const COL = (x) => String.fromCharCode(65 + x);
const coord = (s) => (s ? `${COL(s.x)}${s.y + 1}` : "--");

export default function App() {
  const clientRef = useRef(null);
  if (!clientRef.current) clientRef.current = new GameClient();
  const client = clientRef.current;

  const [snap, setSnap] = useState(null);
  const [mode, setMode] = useState("enemy"); // "enemy" = firing grid, "mine" = your fleet
  const [flash, setFlash] = useState(null);

  const newGame = useCallback(() => {
    client.startVsAI();
    setMode("enemy");
  }, [client]);

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

  const handleTileClick = useCallback(
    (tile) => {
      if (mode !== "enemy") {
        setFlash("switch to enemy waters to fire");
        return;
      }
      if (!snap || snap.status !== "playing") return;
      if (snap.whoseTurn !== "you") {
        setFlash("not your turn");
        return;
      }
      client.fire(tile.x, tile.y);
    },
    [client, mode, snap]
  );

  const view = snap ? (mode === "enemy" ? snap.enemy : snap.own) : null;
  const yourTurn = snap?.whoseTurn === "you";
  const over = snap?.status === "over";
  const won = over && snap?.winner === "you";

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {view && <BoardRenderer view={view} onTileClick={handleTileClick} />}

      {/* HUD */}
      <div style={hudStyle}>
        <div style={{ fontSize: 20, letterSpacing: 3 }}>BATTLESHIP</div>
        <div style={{ opacity: 0.6, fontSize: 11, marginBottom: 10 }}>
          drag pan · wheel zoom · click fires on enemy waters
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 10, pointerEvents: "auto" }}>
          <Toggle on={mode === "enemy"} onClick={() => setMode("enemy")} label="ENEMY WATERS" />
          <Toggle on={mode === "mine"} onClick={() => setMode("mine")} label="YOUR FLEET" />
        </div>

        <div style={{ fontSize: 13 }}>
          {over ? (
            <span style={{ color: won ? "#6effa0" : "#ff6e6e" }}>
              {won ? "ENEMY FLEET DESTROYED — YOU WIN" : "YOUR FLEET LOST"}
            </span>
          ) : (
            <span style={{ color: yourTurn ? "#9fe8ff" : "#ffb066" }}>
              {yourTurn ? "YOUR TURN — fire at will" : "ENEMY TURN…"}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
          last shot: {coord(snap?.lastShot)}{" "}
          {snap?.lastShot?.result ? `(${snap.lastShot.result}${snap.lastShot.sunkShip ? " — sank " + snap.lastShot.sunkShip : ""})` : ""}
        </div>

        <button onClick={newGame} style={btnStyle}>
          ↻ NEW GAME
        </button>
      </div>

      {flash && <div style={flashStyle}>{flash}</div>}
    </div>
  );
}

const hudStyle = {
  position: "absolute",
  top: 16,
  left: 16,
  zIndex: 10,
  color: "#9fe8ff",
  textShadow: "0 0 6px rgba(40,180,230,0.55)",
  fontFamily: '"Courier New", monospace',
  lineHeight: 1.5,
  pointerEvents: "none",
  userSelect: "none",
};

const btnStyle = {
  marginTop: 12,
  pointerEvents: "auto",
  cursor: "pointer",
  background: "transparent",
  color: "#9fe8ff",
  border: "1px solid rgba(120,200,235,0.5)",
  padding: "5px 10px",
  fontFamily: '"Courier New", monospace',
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
  fontFamily: '"Courier New", monospace',
  fontSize: 12,
  letterSpacing: 1,
};

function Toggle({ on, onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        cursor: "pointer",
        fontFamily: '"Courier New", monospace',
        fontSize: 11,
        letterSpacing: 1,
        padding: "5px 9px",
        color: on ? "#06121b" : "#9fe8ff",
        background: on ? "#9fe8ff" : "transparent",
        border: "1px solid rgba(120,200,235,0.5)",
      }}
    >
      {label}
    </button>
  );
}
