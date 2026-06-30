import React, { useState } from "react";
import { T, FONT, titleStyle, solidBtnStyle, btnStyle, inputStyle } from "../theme.js";

// Start/login screen. Username + password, sign up or log in. On success it
// hands the authed user up to App. The movie-trailer tagline lives here.

export default function Login({ client, notify, onAuthed }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      notify("enter a username and password");
      return;
    }
    setBusy(true);
    try {
      const user = mode === "signup" ? await client.signup(username, password) : await client.login(username, password);
      onAuthed(user);
    } catch (err) {
      notify(err.message || "auth failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={wrap}>
      <div style={tagline}>
        From the creator of <b style={{ color: T.green }}>STREETS OF RAINY-CITY.COM</b> and the mayor of{" "}
        <b style={{ color: T.green }}>RAINY-CITY.COM</b> comes
      </div>
      <div style={{ ...titleStyle, fontSize: 56, marginBottom: 28 }}>BATTLESHIP</div>

      <form onSubmit={submit} style={card}>
        <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          <Tab on={mode === "login"} onClick={() => setMode("login")}>LOG IN</Tab>
          <Tab on={mode === "signup"} onClick={() => setMode("signup")}>CREATE USER</Tab>
        </div>
        <input style={inputStyle} placeholder="username" value={username} autoFocus
          onChange={(e) => setUsername(e.target.value)} />
        <input style={inputStyle} placeholder="password" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" disabled={busy} style={{ ...solidBtnStyle, opacity: busy ? 0.6 : 1 }}>
          {busy ? "..." : mode === "signup" ? "▶ ENLIST" : "▶ AUTHENTICATE"}
        </button>
        {!client.online && (
          <div style={{ fontSize: 11, color: T.amber }}>offline build · the server isn't configured</div>
        )}
      </form>
    </div>
  );
}

function Tab({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      style={{ ...btnStyle, flex: 1, color: on ? T.bg : T.green, background: on ? T.green : "transparent", textShadow: on ? "none" : T.glow }}>
      {children}
    </button>
  );
}

const wrap = {
  position: "absolute", inset: 0, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center",
  background: "radial-gradient(circle at 50% 40%, #07150d 0%, #030806 75%)",
  fontFamily: FONT, color: T.greenSoft, animation: "flicker 6s infinite",
};
const tagline = { fontSize: 14, color: T.greenDim, letterSpacing: 1, marginBottom: 6, textAlign: "center", maxWidth: 620 };
const card = { display: "flex", flexDirection: "column", gap: 10, width: 320, padding: 22, border: `1px solid ${T.greenFaint}`, background: "rgba(57,255,20,0.03)" };
