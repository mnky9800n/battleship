import React, { useState, useEffect, useCallback, useRef } from "react";
import GameScreen from "./GameScreen.jsx";
import Matchmaking from "./Matchmaking.jsx";
import Leaderboard from "./Leaderboard.jsx";
import { T, FONT, titleStyle, btnStyle, solidBtnStyle } from "../theme.js";

// The design-doc app shell: header (battleship! · active-battle indicator ·
// logout) + tabs (matchmaking / game / leaderboard) + footer. Orchestrates the
// lobby/challenge flow and drops into the game when a match starts.

export default function Shell({ client, user, notify, onLogout }) {
  const [tab, setTab] = useState("matchmaking");
  const [snap, setSnap] = useState(null);
  const [users, setUsers] = useState([]);
  const [incoming, setIncoming] = useState(null); // {from}
  const [outgoing, setOutgoing] = useState(null); // {to}

  const lastGame = useRef(null);

  useEffect(() => {
    const offs = [
      client.on("state", setSnap),
      client.on("lobby_update", (d) => setUsers(d.users || [])),
      client.on("challenge_received", (d) => setIncoming(d)),
      client.on("challenge_sent", (d) => setOutgoing(d)),
      client.on("challenge_declined", (d) => { notify(`${d.by} declined`); setOutgoing(null); }),
      client.on("challenge_expired", () => { notify("challenge expired"); setIncoming(null); setOutgoing(null); }),
      client.on("challenge_cancelled", (d) => { notify(`${d.by} cancelled`); setIncoming(null); }),
    ];
    client.refreshLobby();
    return () => offs.forEach((off) => off && off());
  }, [client, notify]);

  // When a game starts, jump to the game tab and clear any pending challenge.
  useEffect(() => {
    if (snap && snap.gameId !== lastGame.current) {
      lastGame.current = snap.gameId;
      setTab("game");
      setIncoming(null);
      setOutgoing(null);
    }
  }, [snap]);

  const toLobby = useCallback(() => {
    client.leave();
    setSnap(null);
    setTab("matchmaking");
  }, [client]);

  const respond = (accept) => { client.respondChallenge(accept); setIncoming(null); };

  const inGame = snap && snap.status !== "over";

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", fontFamily: FONT, color: T.greenSoft }}>
      {/* header */}
      <header style={headerBar}>
        <span style={{ ...titleStyle, fontSize: 30 }}>battleship!</span>
        <button
          onClick={() => incoming && setTab("matchmaking")}
          style={{ ...indicator, ...(incoming ? indicatorOn : null) }}>
          {incoming ? `⚔ ${incoming.from} CHALLENGES YOU` : "no active battle"}
        </button>
        <button style={btnStyle} onClick={onLogout}>logout</button>
      </header>

      {/* tabs */}
      <nav style={tabBar}>
        <Tab on={tab === "matchmaking"} onClick={() => setTab("matchmaking")}>MATCHMAKING</Tab>
        <Tab on={tab === "game"} onClick={() => snap && setTab("game")} disabled={!snap}>GAME</Tab>
        <Tab on={tab === "leaderboard"} onClick={() => setTab("leaderboard")}>LEADERBOARD</Tab>
      </nav>

      {/* main viewer */}
      <main style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {tab === "matchmaking" && (
          <Matchmaking users={users} me={user.username} outgoing={outgoing}
            onChallenge={(t) => client.challenge(t)} onCancel={() => { client.cancelChallenge(); setOutgoing(null); }} />
        )}
        {tab === "leaderboard" && <Leaderboard users={users} />}
        {tab === "game" && (
          snap
            ? <GameScreen client={client} snap={snap} notify={notify} onExit={toLobby} />
            : <div style={empty}>no active game — challenge someone from matchmaking</div>
        )}
      </main>

      <footer style={footerBar}>{inGame ? "// IN BATTLE" : "// standing by"}</footer>

      {/* incoming challenge popup */}
      {incoming && (
        <div style={modalWrap}>
          <div style={modal}>
            <div style={{ fontSize: 18, color: T.green, textShadow: T.glow, marginBottom: 8 }}>⚔ INCOMING CHALLENGE</div>
            <div style={{ fontSize: 15, marginBottom: 18 }}><b style={{ color: T.green }}>{incoming.from}</b> challenges you to battle!</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button style={solidBtnStyle} onClick={() => respond(true)}>✓ ACCEPT</button>
              <button style={btnStyle} onClick={() => respond(false)}>✕ DECLINE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Tab({ on, onClick, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        flex: 1, padding: "16px 0", fontFamily: FONT, fontSize: 26, letterSpacing: 4, cursor: disabled ? "default" : "pointer",
        background: on ? "rgba(57,255,20,0.12)" : "transparent",
        color: on ? T.green : disabled ? "rgba(125,255,160,0.25)" : T.greenSoft,
        border: "none", borderBottom: on ? `2px solid ${T.green}` : "2px solid transparent",
        textShadow: on ? T.glow : "none",
      }}>
      {children}
    </button>
  );
}

const headerBar = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: `1px solid ${T.greenFaint}`, background: "#040a06" };
const indicator = { background: "transparent", border: `1px solid ${T.greenFaint}`, color: T.greenDim, fontFamily: FONT, fontSize: 12, letterSpacing: 1, padding: "6px 14px", cursor: "default" };
const indicatorOn = { color: T.bg, background: T.amber, border: `1px solid ${T.amber}`, cursor: "pointer", boxShadow: "0 0 12px rgba(255,176,0,0.6)", animation: "flicker 1.2s infinite" };
const tabBar = { display: "flex", borderBottom: `1px solid ${T.greenFaint}`, background: "rgba(57,255,20,0.02)" };
const footerBar = { padding: "6px 16px", borderTop: `1px solid ${T.greenFaint}`, fontSize: 12, color: T.greenDim, letterSpacing: 1 };
const empty = { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: T.greenDim, fontSize: 14 };
const modalWrap = { position: "absolute", inset: 0, background: "rgba(2,6,4,0.78)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 };
const modal = { textAlign: "center", padding: 28, border: `1px solid ${T.greenDim}`, background: "#06120b", boxShadow: "0 0 30px rgba(57,255,20,0.25)" };
