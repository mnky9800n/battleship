import React from "react";
import { T, FONT } from "../theme.js";

// Design-doc leaderboard: Player / Wins / Losses, ordered by wins. Live — it's
// fed by the same lobby_update stream as matchmaking, so it updates mid-game.

const DOT = { online: T.green, offline: T.red, ai: "#8aa0ff" };

export default function Leaderboard({ users }) {
  const rows = [...users].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  return (
    <div style={{ padding: 16, height: "100%" }}>
      <div style={box}>
        <div style={{ ...gridRow, ...head }}>
          <span>PLAYER</span><span style={num}>WINS</span><span style={num}>LOSSES</span>
        </div>
        <div style={{ overflowY: "auto" }}>
          {rows.map((u, i) => (
            <div key={u.username} style={{ ...gridRow, color: i === 0 ? T.green : T.greenSoft }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: DOT[u.presence], boxShadow: `0 0 6px ${DOT[u.presence]}` }} />
                {i === 0 ? "★ " : ""}{u.presence === "ai" ? "🤖 " : ""}{u.username}
              </span>
              <span style={{ ...num, color: T.green }}>{u.wins}</span>
              <span style={{ ...num, color: T.red }}>{u.losses}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const box = { maxWidth: 640, margin: "0 auto", border: `1px solid ${T.greenFaint}`, background: "rgba(57,255,20,0.03)", fontFamily: FONT };
const gridRow = { display: "grid", gridTemplateColumns: "1fr 90px 90px", alignItems: "center", padding: "11px 16px", borderBottom: `1px solid rgba(57,255,20,0.07)`, fontSize: 15 };
const head = { fontSize: 13, letterSpacing: 2, color: T.green, borderBottom: `1px solid ${T.greenFaint}` };
const num = { textAlign: "right" };
