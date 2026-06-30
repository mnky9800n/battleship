import React, { useState, useEffect, useRef, useCallback } from "react";
import GameClient from "./net/GameClient.js";
import Login from "./screens/Login.jsx";
import Lobby from "./screens/Lobby.jsx";
import GameScreen from "./screens/GameScreen.jsx";
import { T, FONT } from "./theme.js";

// Top-level router: login (online only) -> lobby -> game. A single GameClient
// is shared; its transport is the real server (online) or the in-browser
// MockServer (offline), chosen by REACT_APP_API_URL.

export default function App() {
  const clientRef = useRef(null);
  if (!clientRef.current) clientRef.current = new GameClient();
  const client = clientRef.current;

  // Offline mode has no accounts, so seed a local user and skip login.
  const [user, setUser] = useState(client.online ? null : { username: "player", avatar: null });
  const [snap, setSnap] = useState(null);
  const [lobbyInfo, setLobbyInfo] = useState(null);
  const [flash, setFlash] = useState(null);

  const notify = useCallback((msg) => setFlash(msg), []);

  useEffect(() => {
    const offState = client.on("state", setSnap);
    const offErr = client.on("error", (e) => setFlash(e.message));
    const offCreated = client.on("game_created", setLobbyInfo);
    return () => {
      offState();
      offErr();
      offCreated();
    };
  }, [client]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2000);
    return () => clearTimeout(t);
  }, [flash]);

  const toLobby = useCallback(() => {
    client.leave();
    setSnap(null);
    setLobbyInfo(null);
  }, [client]);

  let screen;
  if (client.online && !user) {
    screen = <Login client={client} notify={notify} onAuthed={setUser} />;
  } else if (snap) {
    screen = <GameScreen client={client} snap={snap} notify={notify} onExit={toLobby} />;
  } else {
    screen = <Lobby client={client} user={user} online={client.online} lobbyInfo={lobbyInfo} notify={notify} />;
  }

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {screen}
      {flash && <div style={flashStyle}>{flash}</div>}
    </div>
  );
}

const flashStyle = {
  position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 50,
  color: T.bg, background: T.green, padding: "8px 16px", fontFamily: FONT, fontSize: 15,
  letterSpacing: 1, boxShadow: "0 0 16px rgba(57,255,20,0.5)",
};
