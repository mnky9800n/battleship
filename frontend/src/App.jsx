import React, { useState, useEffect, useRef, useCallback } from "react";
import BoardRenderer from "./board/BoardRenderer.jsx";
import GameClient from "./net/GameClient.js";
import { SHIP_KINDS, FLEET, footprintCells, placementValid } from "./board/ships.js";

// Full single-player flow: a SETUP phase where you place your fleet (pick a ship,
// a ghost follows the cursor, click to drop, right-click to rotate), then PLAY
// against the AI. All driven by GameClient -> MockServer.

const COL = (x) => String.fromCharCode(65 + x);
const coord = (s) => (s ? `${COL(s.x)}${s.y + 1}` : "--");
const cellKey = (c) => `${c.x},${c.y}`;

export default function App() {
  const clientRef = useRef(null);
  if (!clientRef.current) clientRef.current = new GameClient();
  const client = clientRef.current;

  const [snap, setSnap] = useState(null);
  const [flash, setFlash] = useState(null);
  const [selectedKind, setSelectedKind] = useState(FLEET[0]);
  const [orientation, setOrientation] = useState("h");

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

  // Reset placement selection whenever a fresh game starts.
  const lastGame = useRef(null);
  useEffect(() => {
    if (snap && snap.gameId !== lastGame.current) {
      lastGame.current = snap.gameId;
      setSelectedKind(FLEET[0]);
      setOrientation("h");
    }
  }, [snap]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  const status = snap?.status;
  const isSetup = status === "setup";
  const isPlaying = status === "playing";
  const over = status === "over";

  // --- placement state derived from the snapshot ---
  const placedShips = snap?.own?.ships ?? [];
  const placed = new Set(placedShips.map((s) => s.kind));
  const remaining = FLEET.filter((k) => !placed.has(k));
  const allPlaced = isSetup && remaining.length === 0;
  const occupiedExcept = (kind) =>
    new Set(placedShips.filter((s) => s.kind !== kind).flatMap((s) => s.cells.map(cellKey)));

  const rotate = useCallback(() => setOrientation((o) => (o === "h" ? "v" : "h")), []);

  const handlePlace = useCallback(
    (anchor) => {
      if (!isSetup || !selectedKind) return;
      const cells = footprintCells(anchor, SHIP_KINDS[selectedKind].length, orientation);
      if (!placementValid(cells, occupiedExcept(selectedKind))) {
        setFlash("can't place there");
        return;
      }
      client.placeShip(selectedKind, cells);
      const placedAfter = new Set([...placed, selectedKind]);
      const next = FLEET.find((k) => !placedAfter.has(k));
      if (next) setSelectedKind(next);
    },
    [client, isSetup, selectedKind, orientation, placed]
  );

  const handleFire = useCallback(
    (tile) => {
      if (!isPlaying) return;
      if (snap.whoseTurn !== "you") {
        setFlash("not your turn");
        return;
      }
      client.fire(tile.x, tile.y);
    },
    [client, isPlaying, snap]
  );

  const placement =
    isSetup && selectedKind
      ? {
          length: SHIP_KINDS[selectedKind].length,
          orientation,
          occupied: occupiedExcept(selectedKind),
        }
      : null;

  const yourTurn = snap?.whoseTurn === "you";
  const won = over && snap?.winner === "you";

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={barStyle}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <span style={{ fontSize: 20, letterSpacing: 3 }}>BATTLESHIP</span>
          <span style={{ fontSize: 11, opacity: 0.55 }}>
            {isSetup
              ? "place your fleet · click to drop · right-click to rotate"
              : "drag pan · wheel zoom · click enemy waters to fire"}
          </span>
        </div>

        {isSetup ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {FLEET.map((k) => (
              <ShipChip
                key={k}
                kind={k}
                placed={placed.has(k)}
                selected={k === selectedKind}
                onClick={() => setSelectedKind(k)}
              />
            ))}
            <span style={{ fontSize: 11, opacity: 0.6, width: 64 }}>
              {orientation === "h" ? "horizontal" : "vertical"}
            </span>
            <button onClick={() => client.clearPlacement()} style={btnStyle}>✕ CLEAR</button>
            <button
              onClick={() => client.ready()}
              disabled={!allPlaced}
              style={{ ...btnStyle, ...(allPlaced ? readyStyle : disabledStyle) }}
            >
              ✓ READY
            </button>
          </div>
        ) : (
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
        )}
      </div>

      {/* Boards */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Panel label="YOUR WATERS" sub={isSetup ? "place your fleet here" : "your fleet · incoming fire"} active={isSetup}>
          {snap && (
            <BoardRenderer
              view={snap.own}
              onTileClick={isSetup ? handlePlace : undefined}
              onRotate={isSetup ? rotate : undefined}
              placement={placement}
            />
          )}
        </Panel>
        <Panel label="ENEMY WATERS" sub={isSetup ? "locked until ready" : "your shots · click to fire"} divider active={yourTurn && isPlaying}>
          {snap && <BoardRenderer view={snap.enemy} onTileClick={isPlaying ? handleFire : undefined} />}
          {isSetup && <div style={lockStyle}>◵ awaiting deployment</div>}
        </Panel>
      </div>

      {flash && <div style={flashStyle}>{flash}</div>}
    </div>
  );
}

function ShipChip({ kind, placed, selected, onClick }) {
  const { label, length } = SHIP_KINDS[kind];
  return (
    <button
      onClick={onClick}
      title={`${label} (${length})`}
      style={{
        cursor: "pointer",
        fontFamily: FONT,
        fontSize: 11,
        letterSpacing: 0.5,
        padding: "5px 8px",
        color: selected ? "#06121b" : placed ? "#6effa0" : "#9fe8ff",
        background: selected ? "#9fe8ff" : "transparent",
        border: `1px solid ${placed ? "rgba(110,255,160,0.6)" : "rgba(120,200,235,0.5)"}`,
        opacity: placed && !selected ? 0.7 : 1,
      }}
    >
      {placed ? "✓ " : ""}
      {label} {length}
    </button>
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

const lockStyle = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "rgba(159,232,255,0.5)",
  fontFamily: FONT,
  fontSize: 13,
  letterSpacing: 2,
  pointerEvents: "none",
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

const readyStyle = { color: "#06121b", background: "#6effa0", border: "1px solid #6effa0" };
const disabledStyle = { opacity: 0.4, cursor: "not-allowed" };

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
