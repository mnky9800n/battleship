import React, { useState, useEffect, useRef, useCallback } from "react";
import BoardRenderer from "../board/BoardRenderer.jsx";
import { SHIP_KINDS, FLEET, footprintCells, placementValid } from "../board/ships.js";
import { T, FONT, titleStyle, btnStyle, solidBtnStyle } from "../theme.js";

// The two-board game: SETUP (place your fleet) then PLAY (fire). Driven by the
// snapshot `snap` from GameClient; identical whether the authority is the local
// MockServer (offline) or the real server (online).

const COL = (x) => String.fromCharCode(65 + x);
const coord = (s) => (s ? `${COL(s.x)}${s.y + 1}` : "--");
const cellKey = (c) => `${c.x},${c.y}`;

export default function GameScreen({ client, snap, notify, onExit }) {
  const [selectedKind, setSelectedKind] = useState(FLEET[0]);
  const [orientation, setOrientation] = useState("h");

  // Reset placement selection when a fresh game starts.
  const lastGame = useRef(null);
  useEffect(() => {
    if (snap && snap.gameId !== lastGame.current) {
      lastGame.current = snap.gameId;
      setSelectedKind(FLEET[0]);
      setOrientation("h");
    }
  }, [snap]);

  const status = snap?.status;
  const isSetup = status === "setup";
  const isPlaying = status === "playing";
  const over = status === "over";

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
        notify("invalid position");
        return;
      }
      client.placeShip(selectedKind, cells);
      const placedAfter = new Set([...placed, selectedKind]);
      const next = FLEET.find((k) => !placedAfter.has(k));
      if (next) setSelectedKind(next);
    },
    [client, isSetup, selectedKind, orientation, placed, notify] // eslint-disable-line
  );

  const handleFire = useCallback(
    (tile) => {
      if (!isPlaying) return;
      if (snap.whoseTurn !== "you") {
        notify("not your turn");
        return;
      }
      client.fire(tile.x, tile.y);
    },
    [client, isPlaying, snap, notify]
  );

  const placement =
    isSetup && selectedKind
      ? { length: SHIP_KINDS[selectedKind].length, orientation, occupied: occupiedExcept(selectedKind) }
      : null;

  const yourTurn = snap?.whoseTurn === "you";
  const won = over && snap?.winner === "you";
  const statusColor = over ? (won ? T.green : T.red) : yourTurn ? T.green : T.amber;

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", animation: "flicker 6s infinite" }}>
      <div style={barStyle}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{ ...titleStyle, fontSize: 22 }}>BATTLESHIP</span>
          <span style={{ fontSize: 13, color: T.greenDim }}>
            {isSetup ? "// deploy fleet · click drop · right-click rotate" : "// click enemy grid to fire"}
          </span>
        </div>

        {isSetup ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {FLEET.map((k) => (
              <ShipChip key={k} kind={k} placed={placed.has(k)} selected={k === selectedKind} onClick={() => setSelectedKind(k)} />
            ))}
            <span style={{ fontSize: 14, color: T.greenDim, width: 72 }}>[{orientation === "h" ? "HORIZ" : "VERT"}]</span>
            <button onClick={() => client.clearPlacement()} style={btnStyle}>✕ CLEAR</button>
            <button onClick={() => client.ready()} disabled={!allPlaced} style={{ ...btnStyle, ...(allPlaced ? solidBtnStyle : disabledStyle) }}>▶ READY</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 17, color: statusColor, textShadow: T.glow }}>
              {over ? (won ? "ENEMY FLEET DESTROYED // VICTORY" : "FLEET LOST // DEFEAT") : yourTurn ? "YOUR TURN // FIRE AT WILL" : "ENEMY TURN //"}
            </span>
            <span style={{ fontSize: 15, color: T.greenDim }}>
              last: {coord(snap?.lastShot)}
              {snap?.lastShot?.result ? ` [${snap.lastShot.result}${snap.lastShot.sunkShip ? " · SANK " + snap.lastShot.sunkShip.toUpperCase() : ""}]` : ""}
            </span>
            <button onClick={onExit} style={over ? solidBtnStyle : btnStyle}>{over ? "▶ LOBBY" : "✕ LEAVE"}</button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Panel label="YOUR WATERS" sub={isSetup ? "deploy fleet here" : "your fleet · incoming fire"} active={isSetup}>
          <BoardRenderer view={snap.own} onTileClick={isSetup ? handlePlace : undefined} onRotate={isSetup ? rotate : undefined} placement={placement} />
        </Panel>
        <Panel label="ENEMY WATERS" sub={isSetup ? "locked until ready" : "your shots · click to fire"} divider active={yourTurn && isPlaying}>
          <BoardRenderer view={snap.enemy} onTileClick={isPlaying ? handleFire : undefined} />
          {isSetup && <div style={lockStyle}>◵ AWAITING DEPLOYMENT</div>}
        </Panel>
      </div>
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
        cursor: "pointer", fontFamily: FONT, fontSize: 14, letterSpacing: 0.5, padding: "7px 10px",
        color: selected ? T.bg : T.green, background: selected ? T.green : "transparent",
        border: `1px solid ${selected ? T.green : T.greenDim}`, opacity: placed && !selected ? 0.55 : 1,
        textShadow: selected ? "none" : T.glow,
      }}
    >
      {placed ? "✓ " : ""}{label} {length}
    </button>
  );
}

function Panel({ label, sub, divider, active, children }) {
  return (
    <div style={{
      flex: 1, position: "relative", minWidth: 0,
      borderLeft: divider ? `1px solid ${T.greenFaint}` : "none",
      background: "radial-gradient(circle at 50% 38%, #07150d 0%, #030806 72%)",
      boxShadow: active ? `inset 0 0 0 1px ${T.greenDim}, inset 0 0 60px rgba(57,255,20,0.06)` : "none",
    }}>
      {children}
      <div style={labelStyle}>
        <div style={{ fontSize: 18, letterSpacing: 4, color: T.green, textShadow: T.glow }}>{label}</div>
        <div style={{ fontSize: 13, color: T.greenDim }}>{sub}</div>
      </div>
    </div>
  );
}

const barStyle = {
  flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 16px", color: T.greenSoft, fontFamily: FONT,
  borderBottom: `1px solid ${T.greenFaint}`, userSelect: "none",
};
const labelStyle = { position: "absolute", top: 12, left: 14, fontFamily: FONT, pointerEvents: "none", userSelect: "none" };
const lockStyle = {
  position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
  color: T.greenDim, fontFamily: FONT, fontSize: 13, letterSpacing: 3, pointerEvents: "none",
};
const disabledStyle = { opacity: 0.35, cursor: "not-allowed", textShadow: "none", background: "transparent", color: T.green, boxShadow: "none" };
