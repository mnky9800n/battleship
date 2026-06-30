import React, { useState, useEffect, useRef, useCallback } from "react";
import GameClient from "./net/GameClient.js";
import Login from "./screens/Login.jsx";
import Shell from "./screens/Shell.jsx";
import { T, FONT } from "./theme.js";

// Top level: login (online only) -> the app shell (matchmaking / game /
// leaderboard). A single GameClient is shared; its transport is the real server
// (online) or the in-browser MockServer (offline practice), per REACT_APP_API_URL.

export default function App() {
  const clientRef = useRef(null);
  if (!clientRef.current) clientRef.current = new GameClient();
  const client = clientRef.current;

  const [user, setUser] = useState(client.online ? null : { username: "player", avatar: null });
  const [flash, setFlash] = useState(null);

  const notify = useCallback((msg) => setFlash(msg), []);

  useEffect(() => {
    const off = client.on("error", (e) => setFlash(e.message));
    return () => off && off();
  }, [client]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [flash]);

  const logout = useCallback(() => {
    client.logout();
    setUser(client.online ? null : { username: "player", avatar: null });
  }, [client]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {client.online && !user ? (
        <Login client={client} notify={notify} onAuthed={setUser} />
      ) : (
        <Shell client={client} user={user} notify={notify} onLogout={logout} />
      )}
      {flash && <div style={flashStyle}>{flash}</div>}
    </div>
  );
}

const flashStyle = {
  position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 80,
  color: T.bg, background: T.green, padding: "8px 16px", fontFamily: FONT, fontSize: 15,
  letterSpacing: 1, boxShadow: "0 0 16px rgba(57,255,20,0.5)",
};
