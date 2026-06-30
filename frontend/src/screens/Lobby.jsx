import React, { useState } from "react";
import { T, FONT, titleStyle, solidBtnStyle, btnStyle, inputStyle } from "../theme.js";

// Minimal lobby: play vs AI, create a game (get a code), or join by code.
// Offline build only offers practice vs AI.

export default function Lobby({ client, user, online, lobbyInfo, notify }) {
  const [code, setCode] = useState("");
  const waiting = lobbyInfo?.waiting;

  const avatarSrc = user?.avatar
    ? `${process.env.PUBLIC_URL}/assets/headshots/${user.avatar}`
    : null;

  return (
    <div style={wrap}>
      <div style={{ ...titleStyle, fontSize: 40, marginBottom: 6 }}>BATTLESHIP</div>

      {user && (
        <div style={profile}>
          {avatarSrc && <img src={avatarSrc} alt="" style={avatarImg} />}
          <span style={{ fontSize: 16, color: T.green, textShadow: T.glow }}>{user.username}</span>
        </div>
      )}

      {waiting ? (
        <div style={card}>
          <div style={{ fontSize: 14, color: T.greenDim }}>WAITING FOR OPPONENT</div>
          <div style={{ fontSize: 13, color: T.greenSoft }}>share this code:</div>
          <div style={{ ...titleStyle, fontSize: 40, letterSpacing: 10 }}>{lobbyInfo.code}</div>
          <button style={btnStyle} onClick={() => client.leave()}>✕ CANCEL</button>
        </div>
      ) : (
        <div style={card}>
          <button style={solidBtnStyle} onClick={() => client.startVsAI()}>▶ PLAY VS AI</button>

          {online ? (
            <>
              <div style={divider}>— or play a human —</div>
              <button style={btnStyle} onClick={() => client.createGame({})}>+ CREATE GAME</button>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ ...inputStyle, flex: 1, textTransform: "uppercase" }} placeholder="code"
                  value={code} maxLength={4} onChange={(e) => setCode(e.target.value.toUpperCase())} />
                <button style={btnStyle} onClick={() => (code ? client.joinGame(code) : notify("enter a code"))}>JOIN</button>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: T.amber, textAlign: "center" }}>
              offline build · multiplayer needs the server
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const wrap = {
  position: "absolute", inset: 0, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center",
  background: "radial-gradient(circle at 50% 40%, #07150d 0%, #030806 75%)",
  fontFamily: FONT, color: T.greenSoft, animation: "flicker 6s infinite",
};
const profile = { display: "flex", alignItems: "center", gap: 10, marginBottom: 22 };
const avatarImg = { width: 40, height: 40, objectFit: "cover", border: `1px solid ${T.greenDim}`, filter: "saturate(0.6) brightness(1.05)" };
const card = { display: "flex", flexDirection: "column", gap: 12, width: 320, padding: 22, border: `1px solid ${T.greenFaint}`, background: "rgba(57,255,20,0.03)" };
const divider = { fontSize: 11, color: T.greenDim, textAlign: "center", letterSpacing: 1, margin: "2px 0" };
