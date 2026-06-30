import React, { useState } from "react";
import { T, FONT, solidBtnStyle, btnStyle } from "../theme.js";

// Design-doc matchmaking: a list of all registered users with presence, and a
// profile panel for the selected user with a CHALLENGE TO BATTLE button.

const DOT = { online: T.green, offline: T.red, ai: "#8aa0ff" };

function avatarUrl(u) {
  return u?.avatar ? `${process.env.PUBLIC_URL}/assets/headshots/${u.avatar}` : null;
}

export default function Matchmaking({ users, me, outgoing, onChallenge, onCancel }) {
  const [selected, setSelected] = useState(null);
  const sel = users.find((u) => u.username === selected) || null;
  const isSelf = sel?.username === me;
  const challengeable = sel && !isSelf && (sel.presence === "online" || sel.presence === "ai") && !sel.inGame;

  return (
    <div style={{ display: "flex", gap: 16, height: "100%", padding: 16 }}>
      {/* user list */}
      <div style={listBox}>
        <div style={listHeader}>PLAYERS</div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {users.map((u) => (
            <button key={u.username} onClick={() => setSelected(u.username)}
              style={{ ...row, ...(u.username === selected ? rowSel : null) }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: DOT[u.presence], boxShadow: `0 0 6px ${DOT[u.presence]}` }} />
              <span style={{ flex: 1, textAlign: "left" }}>
                {u.presence === "ai" ? "🤖 " : ""}{u.username}{u.username === me ? " (you)" : ""}
              </span>
              {u.inGame && <span style={{ fontSize: 10, color: T.amber }}>in game</span>}
            </button>
          ))}
        </div>
      </div>

      {/* profile / challenge */}
      <div style={profileBox}>
        {!sel ? (
          <div style={{ margin: "auto", color: T.greenDim, fontSize: 14 }}>select a player to challenge</div>
        ) : outgoing?.to === sel.username ? (
          <div style={{ margin: "auto", textAlign: "center" }}>
            <div style={{ fontSize: 18, color: T.green, textShadow: T.glow }}>CHALLENGE SENT</div>
            <div style={{ fontSize: 13, color: T.greenDim, margin: "8px 0 16px" }}>waiting for {sel.username} to respond…</div>
            <button style={btnStyle} onClick={onCancel}>✕ CANCEL</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 18 }}>
              {avatarUrl(sel)
                ? <img src={avatarUrl(sel)} alt="" style={avatarImg} />
                : <div style={{ ...avatarImg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{sel.presence === "ai" ? "🤖" : "?"}</div>}
              <div>
                <div style={{ fontSize: 22, color: T.green, textShadow: T.glow }}>{sel.username}</div>
                <div style={{ fontSize: 13, color: DOT[sel.presence] }}>{sel.presence === "ai" ? "AI OPPONENT" : sel.presence.toUpperCase()}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 24, fontSize: 16, marginBottom: 24 }}>
              <span>Wins: <b style={{ color: T.green }}>{sel.wins}</b></span>
              <span>Losses: <b style={{ color: T.red }}>{sel.losses}</b></span>
            </div>
            <button
              style={{ ...solidBtnStyle, fontSize: 16, padding: "12px 18px", opacity: challengeable ? 1 : 0.4, cursor: challengeable ? "pointer" : "not-allowed" }}
              disabled={!challengeable}
              onClick={() => onChallenge(sel.username)}>
              ⚔ CHALLENGE TO BATTLE!
            </button>
            {isSelf && <div style={{ fontSize: 12, color: T.greenDim, marginTop: 8 }}>that's you</div>}
            {sel.inGame && <div style={{ fontSize: 12, color: T.amber, marginTop: 8 }}>already in a game</div>}
          </>
        )}
      </div>
    </div>
  );
}

const listBox = { width: 240, display: "flex", flexDirection: "column", border: `1px solid ${T.greenFaint}`, background: "rgba(57,255,20,0.03)" };
const listHeader = { padding: "8px 12px", fontSize: 13, letterSpacing: 2, color: T.green, borderBottom: `1px solid ${T.greenFaint}` };
const row = { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", background: "transparent", border: "none", borderBottom: `1px solid rgba(57,255,20,0.07)`, color: T.greenSoft, fontFamily: FONT, fontSize: 14, cursor: "pointer" };
const rowSel = { background: "rgba(57,255,20,0.12)", color: T.green };
const profileBox = { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: 28, border: `1px solid ${T.greenFaint}`, background: "rgba(57,255,20,0.03)" };
const avatarImg = { width: 72, height: 72, objectFit: "cover", border: `1px solid ${T.greenDim}`, filter: "saturate(0.6) brightness(1.05)", background: "rgba(57,255,20,0.05)" };
