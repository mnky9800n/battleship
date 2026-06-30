import MockServer from "./MockServer.js";

// The single seam between the UI and the game authority. Components only ever
// touch this facade, never the transport, so swapping the in-browser MockServer
// for a real FastAPI/Socket.IO connection later is a one-line change here.
//
// Events (subscribe with .on):
//   "state" -> full redacted snapshot { status, whoseTurn, winner, own, enemy, lastShot }
//   "error" -> { message }
//
// The event names and the snapshot shape are the contract the real server will
// implement.

export default class GameClient {
  constructor(transport = new MockServer()) {
    this.transport = transport;
  }

  on(event, cb) {
    return this.transport.on(event, cb);
  }

  async login(username, password) {
    return this.transport.login(username, password);
  }

  startVsAI() {
    return this.transport.startVsAI();
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
    // Identity ("you") is bound by the transport, mirroring the design's
    // socket-bound identity. A real client would not pass the actor at all.
    this.transport.fire("you", x, y);
  }
}
