import { io } from "socket.io-client";

// Real-server transport: same shape as MockServer (an on/emit event bus the UI
// subscribes to), but backed by REST auth + a Socket.IO connection. Swapping
// this in behind GameClient is the entire change needed to make the redaction a
// real trust boundary — the UI consumes identical `state`/`error` events.

export default class SocketTransport {
  constructor(apiUrl) {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.listeners = new Map();
    this.socket = null;
    this.user = null;
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
    this._connect(data.token);
    return this.user;
  }

  _connect(token) {
    if (this.socket) this.socket.disconnect();
    this.socket = io(this.apiUrl, { auth: { token }, transports: ["websocket", "polling"] });
    // Forward server pushes onto the local bus the UI listens to.
    const fwd = [
      "state", "error",
      "challenge_received", "challenge_sent", "challenge_declined",
      "challenge_expired", "challenge_cancelled",
    ];
    fwd.forEach((ev) => this.socket.on(ev, (d) => this.emit(ev, d)));
    // Cache the lobby so a late subscriber (Shell mounting after connect) can
    // get the current list via refreshLobby().
    this.socket.on("lobby_update", (d) => { this.lastLobby = d; this.emit("lobby_update", d); });
    this.socket.on("connect_error", (e) => this.emit("error", { message: e.message || "connection error" }));
  }

  // --- lobby + game actions (identity is the socket's bound user) ---

  // Re-emit the cached lobby for a late subscriber; the server also pushes it on
  // connect and on every change.
  refreshLobby() {
    if (this.lastLobby) this.emit("lobby_update", this.lastLobby);
  }

  challenge(target) {
    this.socket?.emit("challenge", { target });
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

  leave() {
    this.socket?.emit("leave");
  }

  logout() {
    this.socket?.disconnect();
    this.socket = null;
    this.user = null;
  }
}
