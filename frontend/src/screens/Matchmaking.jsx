import React, { useState } from "react";
import { T, FONT, solidBtnStyle, btnStyle, inputStyle } from "../theme.js";

// Design-doc matchmaking: a list of all registered users with presence, and a
// profile panel for the selected user with a CHALLENGE TO BATTLE button.

const DOT = { online: T.green, offline: T.red, ai: "#8aa0ff" };
const AI_DESC = {
  classic: "HARDCODED ALGORITHM · NO LLM",
  haiku: "CLAUDE HAIKU · MOVES + TAUNTS",
  sentience: "CLAUDE HAIKU + YOUR SENTIENCE",
  bayes: "BAYESIAN BELIEF-STATE · NO LLM",
};

function avatarUrl(u) {
  return u?.avatar ? `${process.env.PUBLIC_URL}/assets/headshots/${u.avatar}` : null;
}

export default function Matchmaking({ users, me, outgoing, onChallenge, onCancel }) {
  const [selected, setSelected] = useState(null);
  const [skey, setSkey] = useState("");
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
          <div style={{ margin: "auto", color: T.greenDim, fontSize: 19 }}>select a player to challenge</div>
        ) : outgoing?.to === sel.username ? (
          <div style={{ margin: "auto", textAlign: "center" }}>
            <div style={{ fontSize: 26, color: T.green, textShadow: T.glow }}>CHALLENGE SENT</div>
            <div style={{ fontSize: 17, color: T.greenDim, margin: "10px 0 20px" }}>waiting for {sel.username} to respond…</div>
            <button style={{ ...btnStyle, fontSize: 16 }} onClick={onCancel}>✕ CANCEL</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 18 }}>
              {avatarUrl(sel)
                ? <img src={avatarUrl(sel)} alt="" style={avatarImg} />
                : <div style={{ ...avatarImg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>{sel.presence === "ai" ? "🤖" : "?"}</div>}
              <div>
                <div style={{ fontSize: 38, color: T.green, textShadow: T.glow }}>{sel.username}</div>
                <div style={{ fontSize: 15, color: DOT[sel.presence] }}>{sel.aiMode ? AI_DESC[sel.aiMode] : sel.presence.toUpperCase()}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 32, fontSize: 24, marginBottom: 30 }}>
              <span>Wins: <b style={{ color: T.green }}>{sel.wins}</b></span>
              <span>Losses: <b style={{ color: T.red }}>{sel.losses}</b></span>
            </div>
            {sel.aiMode === "sentience" && (
              <input
                style={{ ...inputStyle, marginBottom: 12, fontSize: 13 }}
                placeholder="Sentience key (optional, for personalized taunts)"
                value={skey}
                onChange={(e) => setSkey(e.target.value)}
              />
            )}
            <button
              style={{ ...solidBtnStyle, fontSize: 22, padding: "16px 24px", opacity: challengeable ? 1 : 0.4, cursor: challengeable ? "pointer" : "not-allowed" }}
              disabled={!challengeable}
              onClick={() => onChallenge(sel.username, sel.aiMode === "sentience" ? skey.trim() || undefined : undefined)}>
              ⚔ CHALLENGE TO BATTLE!
            </button>
            {sel.aiMode === "sentience" && (
              <div style={{ fontSize: 11, color: T.greenDim, marginTop: 8 }}>
                optional · your key is used only for this game, never stored
              </div>
            )}
            {isSelf && <div style={{ fontSize: 15, color: T.greenDim, marginTop: 10 }}>that's you</div>}
            {sel.inGame && <div style={{ fontSize: 15, color: T.amber, marginTop: 10 }}>already in a game</div>}
          </>
        )}
      </div>
    </div>
  );
}

const listBox = { width: 300, display: "flex", flexDirection: "column", border: `1px solid ${T.greenFaint}`, background: "rgba(57,255,20,0.03)" };
const listHeader = { padding: "10px 14px", fontSize: 18, letterSpacing: 2, color: T.green, borderBottom: `1px solid ${T.greenFaint}` };
const row = { display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "13px 14px", background: "transparent", border: "none", borderBottom: `1px solid rgba(57,255,20,0.07)`, color: T.greenSoft, fontFamily: FONT, fontSize: 19, cursor: "pointer" };
const rowSel = { background: "rgba(57,255,20,0.12)", color: T.green };
const profileBox = { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: 36, border: `1px solid ${T.greenFaint}`, background: "rgba(57,255,20,0.03)" };
const avatarImg = { width: 140, height: 140, objectFit: "cover", border: `1px solid ${T.greenDim}`, filter: "saturate(0.6) brightness(1.05)", background: "rgba(57,255,20,0.05)" };
