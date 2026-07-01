import MockServer from "./MockServer.js";
import SocketTransport from "./SocketTransport.js";

// The single seam between the UI and the game authority. Components only ever
// touch this facade, never the transport.
//
// REACT_APP_API_URL set  -> online: real server (SocketTransport), cheat-proof.
// REACT_APP_API_URL unset -> offline: in-browser MockServer (practice vs AI).
//
// Both transports expose the same on/emit bus and the same action surface, so
// the UI is identical in either mode.

const API_URL = process.env.REACT_APP_API_URL;

export default class GameClient {
  constructor() {
    this.online = Boolean(API_URL);
    this.transport = this.online ? new SocketTransport(API_URL) : new MockServer();
  }

  on(event, cb) {
    return this.transport.on(event, cb);
  }

  signup(username, password) {
    return this.transport.signup(username, password);
  }

  login(username, password) {
    return this.transport.login(username, password);
  }

  refreshLobby() {
    this.transport.refreshLobby?.();
  }

  challenge(target, sentienceKey) {
    this.transport.challenge(target, sentienceKey);
  }

  respondChallenge(accept) {
    this.transport.respondChallenge(accept);
  }

  cancelChallenge() {
    this.transport.cancelChallenge?.();
  }

  startVsAI() {
    return this.transport.startVsAI();
  }

  logout() {
    this.transport.logout?.();
  }

  placeShip(kind, cells) {
    this.transport.placeShip(kind, cells);
  }

  clearPlacement() {
    this.transport.clearPlacement();
  }

  ready() {
    this.transport.ready();
  }

  fire(x, y) {
    this.transport.fire(x, y);
  }

  sendChat(text) {
    this.transport.sendChat?.(text);
  }

  leave() {
    this.transport.leave?.();
  }
}
