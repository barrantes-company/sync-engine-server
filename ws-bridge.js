"use strict";
const WebSocket = require("ws");
const { io } = require("socket.io-client");
const { createBridgeAuth } = require("./bridge-security");
const { recipientsFor } = require("./pubsub-routing");

// One bridge process represents ONE upstream user. It is not a multi-user gateway.
function startBridge({ env = process.env, logger = console } = {}) {
  const authenticate = createBridgeAuth(env.WS_BRIDGE_TOKEN);
  if (!env.WS_BRIDGE_UPSTREAM_TOKEN) throw new Error("SEC-02: WS_BRIDGE_UPSTREAM_TOKEN is required");
  const host = env.WS_BRIDGE_HOST || "127.0.0.1";
  if (!["127.0.0.1", "::1"].includes(host)) throw new Error("SEC-02: bridge must bind to loopback");
  const port = Number(env.WS_BRIDGE_PORT ?? 8123);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid bridge port");
  const upstreamUrl = new URL(env.WS_BRIDGE_UPSTREAM_URL || "http://127.0.0.1:3000");
  if (upstreamUrl.username || upstreamUrl.password ||
      !["http:", "https:"].includes(upstreamUrl.protocol) ||
      (upstreamUrl.protocol === "http:" && !["127.0.0.1", "[::1]", "localhost"].includes(upstreamUrl.hostname))) {
    throw new Error("SEC-02: remote upstream requires HTTPS");
  }
  let identity = null;
  const wss = new WebSocket.Server({
    host, port, maxPayload: 64 * 1024,
    verifyClient: ({ req }, done) => done(authenticate(req), 401, "Unauthorized")
  });
  wss.on("error", () => logger.error("[Bridge] WebSocket listener failed"));
  wss.on("connection", (client) => client.on("error", () => {}));
  const upstream = io(upstreamUrl.href, { autoConnect: false, reconnection: true });
  upstream.on("connect", () => {
    identity = null;
    upstream.emit("authenticate", { token: env.WS_BRIDGE_UPSTREAM_TOKEN });
  });
  upstream.on("authenticated", ({ user } = {}) => { identity = user?.syncId || null; });
  upstream.on("disconnect", () => { identity = null; });
  upstream.on("auth-error", () => {
    identity = null;
    logger.error("[Bridge] Upstream authentication rejected");
    upstream.disconnect();
  });
  upstream.on("pubsub-chat-event", (payload) => {
    if (!identity || !recipientsFor(payload).includes(identity)) return;
    const data = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  });
  upstream.connect();
  return {
    wss, upstream,
    async close() {
      identity = null;
      upstream.disconnect();
      for (const client of wss.clients) client.terminate();
      await new Promise((resolve) => wss.close(resolve));
    }
  };
}

if (require.main === module) {
  const bridge = startBridge();
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => bridge.close());
}
module.exports = { startBridge };
