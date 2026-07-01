import { io } from "socket.io-client";

// Real-server transport: same shape as MockServer (an on/emit event bus the UI
// subscribes to), but backed by REST auth + a Socket.IO connection. Swapping
// this in behind GameClient is the entire change needed to make the redaction a
// real trust boundary — the UI consumes identical `state`/`error` events.

const TOKEN_KEY = "bs.token";
const USER_KEY = "bs.user";

export default class SocketTransport {
  constructor(apiUrl) {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.listeners = new Map();
    this.socket = null;
    this.user = null;
    // Cached server pushes so a component mounting after (re)connect can pull the
    // current view: lobby, the live game state, and the chat transcript.
    this.lastLobby = null;
    this.lastState = null;
    this.chatLog = [];
    this._suppressErrors = false;
  }

  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  emit(event, payload) {
    this.listeners.get(event)?.forEach((cb) => cb(payload));
  }

  // --- auth (REST) then open the socket bound to the returned token ---

  async signup(username, password) {
    return this._auth("/signup", username, password);
  }

  async login(username, password) {
    return this._auth("/login", username, password);
  }

  async _auth(path, username, password) {
    const res = await fetch(this.apiUrl + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || "auth failed");
    this.user = { username: data.username, avatar: data.avatar };
    // Persist so a page refresh can reconnect without re-entering credentials.
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(this.user));
    this._connect(data.token);
    return this.user;
  }

  // Reconnect from a stored token on page load. Resolves the cached user on a
  // successful bind, or null if there is no stored session or the token is dead
  // (e.g. the server restarted) — in which case we clear it and fall to login.
  restoreSession() {
    const token = localStorage.getItem(TOKEN_KEY);
    const rawUser = localStorage.getItem(USER_KEY);
    if (!token || !rawUser) return Promise.resolve(null);
    let user;
    try {
      user = JSON.parse(rawUser);
    } catch {
      this._clearStored();
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      this._suppressErrors = true; // don't flash a login-screen error on a dead token
      this._connect(token);
      const cleanup = () => {
        this._suppressErrors = false;
        this.socket?.off("connect", onConnect);
        this.socket?.off("connect_error", onError);
      };
      const onConnect = () => { this.user = user; cleanup(); resolve(user); };
      const onError = () => {
        cleanup();
        this._clearStored();
        if (this.socket) { this.socket.disconnect(); this.socket = null; }
        resolve(null);
      };
      this.socket.on("connect", onConnect);
      this.socket.on("connect_error", onError);
    });
  }

  _clearStored() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  _connect(token) {
    if (this.socket) this.socket.disconnect();
    this.socket = io(this.apiUrl, { auth: { token }, transports: ["websocket", "polling"] });
    // Forward server pushes onto the local bus the UI listens to.
    const fwd = [
      "error",
      "challenge_received", "challenge_sent", "challenge_declined",
      "challenge_expired", "challenge_cancelled",
    ];
    fwd.forEach((ev) => this.socket.on(ev, (d) => this.emit(ev, d)));
    // Cache the latest push of each kind so a late subscriber (Shell/GameScreen
    // mounting after connect, e.g. on a refresh) can pull the current view.
    this.socket.on("lobby_update", (d) => { this.lastLobby = d; this.emit("lobby_update", d); });
    this.socket.on("state", (d) => { this.lastState = d; this.emit("state", d); });
    this.socket.on("chat", (d) => {
      // Dedupe by the server's per-game id so a double delivery doesn't get
      // cached twice (and re-served on refreshChat).
      if (!this.chatLog.some((x) => x.id === d.id)) this.chatLog.push(d);
      this.emit("chat", d);
    });
    this.socket.on("chat_history", (d) => { this.chatLog = d.messages || []; this.emit("chat_history", d); });
    this.socket.on("connect_error", (e) => {
      if (this._suppressErrors) return;
      this.emit("error", { message: e.message || "connection error" });
    });
  }

  // --- lobby + game actions (identity is the socket's bound user) ---

  // Re-emit the cached lobby for a late subscriber; the server also pushes it on
  // connect and on every change.
  refreshLobby() {
    if (this.lastLobby) this.emit("lobby_update", this.lastLobby);
  }

  // Re-emit the cached game state for a late subscriber (Shell mounting after a
  // reconnect). The server pushes state on connect, before the UI is listening.
  refreshState() {
    if (this.lastState) this.emit("state", this.lastState);
  }

  // Re-emit the cached chat transcript for a late subscriber (GameScreen).
  refreshChat() {
    this.emit("chat_history", { messages: this.chatLog });
  }

  challenge(target, sentienceKey) {
    this.socket?.emit("challenge", { target, sentienceKey });
  }

  respondChallenge(accept) {
    this.socket?.emit("challenge_response", { accept });
  }

  cancelChallenge() {
    this.socket?.emit("cancel_challenge");
  }

  startVsAI() {
    this.challenge("playerAI"); // challenging the AI starts a vs-AI game instantly
  }

  placeShip(kind, cells) {
    this.socket?.emit("place_ship", { kind, cells });
  }

  clearPlacement() {
    this.socket?.emit("clear_placement");
  }

  ready() {
    this.socket?.emit("ready");
  }

  fire(x, y) {
    this.socket?.emit("fire", { x, y });
  }

  sendChat(text) {
    this.socket?.emit("chat", { text });
  }

  leave() {
    this.socket?.emit("leave");
  }

  logout() {
    this._clearStored();
    this.socket?.disconnect();
    this.socket = null;
    this.user = null;
    this.lastState = null;
    this.chatLog = [];
  }
}
