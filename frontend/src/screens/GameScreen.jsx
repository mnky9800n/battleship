import React, { useState, useEffect, useRef, useCallback } from "react";
import BoardRenderer from "../board/BoardRenderer.jsx";
import { SHIP_KINDS, FLEET, footprintCells, placementValid } from "../board/ships.js";
import ShipSprite from "../board/ShipSprite.jsx";
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
          <span style={{ fontSize: 14, color: T.greenDim }}>// deploy your fleet — drag ships from the menu onto the map</span>
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

      {isSetup ? (
        // SETUP: ship menu (left) · single map (center) · controls (right).
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <ShipMenu placed={placed} onPick={setSelectedKind} />
          <Panel label="YOUR WATERS" sub="drag ships onto the map" active>
            <BoardRenderer view={snap.own} onTileClick={handlePlace} onRotate={rotate} onDropTile={handlePlace} placement={placement} />
          </Panel>
          <div style={controlsCol}>
            <div style={sideTitle}>DEPLOYMENT</div>
            <div style={{ fontSize: 15 }}>{remaining.length} ship{remaining.length !== 1 ? "s" : ""} left to place</div>
            <button onClick={rotate} style={btnStyle}>⟳ ROTATE [{orientation === "h" ? "HORIZ" : "VERT"}]</button>
            <button onClick={() => client.clearPlacement()} style={btnStyle}>✕ CLEAR</button>
            <button onClick={() => client.ready()} disabled={!allPlaced} style={{ ...btnStyle, ...(allPlaced ? solidBtnStyle : disabledStyle), fontSize: 16, padding: "12px 16px" }}>▶ READY</button>
            <div style={readyBox}>
              <div>you: <b style={{ color: snap.youReady ? T.green : T.amber }}>{snap.youReady ? "READY" : "placing…"}</b></div>
              <div>enemy: <b style={{ color: snap.enemyReady ? T.green : T.amber }}>{snap.enemyReady ? "READY" : "placing…"}</b></div>
            </div>
          </div>
        </div>
      ) : (
        // PLAY: two boards side by side.
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <Panel label="YOUR WATERS" sub="your fleet · incoming fire">
            <BoardRenderer view={snap.own} />
          </Panel>
          <Panel label="ENEMY WATERS" sub="your shots · click to fire" divider active={yourTurn && isPlaying}>
            <BoardRenderer view={snap.enemy} onTileClick={isPlaying ? handleFire : undefined} />
          </Panel>
        </div>
      )}

      {/* win/lose popup */}
      {over && (
        <div style={overWrap}>
          <div style={{ ...overModal, borderColor: won ? T.green : T.red, boxShadow: `0 0 40px ${won ? "rgba(57,255,20,0.35)" : "rgba(255,90,90,0.35)"}` }}>
            <div style={{ ...titleStyle, fontSize: 52, color: won ? T.green : T.red, textShadow: `0 0 16px ${won ? "rgba(57,255,20,0.6)" : "rgba(255,90,90,0.6)"}` }}>
              {won ? "VICTORY" : "DEFEAT"}
            </div>
            <div style={{ fontSize: 16, color: T.greenDim, margin: "10px 0 24px" }}>
              {won ? "enemy fleet destroyed" : "your fleet was lost"}
            </div>
            <button style={{ ...solidBtnStyle, fontSize: 16, padding: "12px 20px" }} onClick={onExit}>▶ RETURN TO LOBBY</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Design-doc ship menu: just the ship sprites (side view), draggable onto the
// map. No labels. Dragging a sprite selects it so the board ghost previews it.
function ShipMenu({ placed, onPick }) {
  return (
    <div style={shipMenuStyle}>
      {FLEET.map((kind) => (
        <ShipSprite
          key={kind}
          kind={kind}
          done={placed.has(kind)}
          onDragStart={(e) => { onPick(kind); e.dataTransfer.setData("text/plain", kind); e.dataTransfer.effectAllowed = "move"; }}
        />
      ))}
    </div>
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
const disabledStyle = { opacity: 0.35, cursor: "not-allowed", textShadow: "none", background: "transparent", color: T.green, boxShadow: "none" };
const shipMenuStyle = { width: 200, display: "flex", flexDirection: "column", justifyContent: "center", gap: 18, padding: 16, borderRight: `1px solid ${T.greenFaint}`, background: "rgba(57,255,20,0.03)", userSelect: "none" };
const controlsCol = { width: 230, display: "flex", flexDirection: "column", gap: 12, padding: 16, borderLeft: `1px solid ${T.greenFaint}`, background: "rgba(57,255,20,0.03)", fontFamily: FONT, color: T.greenSoft };
const sideTitle = { fontSize: 17, letterSpacing: 2, color: T.green, textShadow: T.glow };
const readyBox = { marginTop: "auto", fontSize: 15, lineHeight: 1.9, paddingTop: 12, borderTop: `1px solid ${T.greenFaint}` };
const overWrap = { position: "absolute", inset: 0, background: "rgba(2,6,4,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70 };
const overModal = { textAlign: "center", padding: "40px 56px", border: "2px solid", background: "#06120b" };
