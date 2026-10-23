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
      (upstreamUrl.protocol === "http:" && !["127.0.0.1", "::1", "localhost"].includes(upstreamUrl.hostname))) {
    throw new Error("SEC-02: remote upstream requires HTTPS");
  }
  let identity = null;
  const wss = new WebSocket.Server({
    host, port, maxPayload: 64 * 1024,
    verifyClient: ({ req }, done) => done(authenticate(req), 401, "Unauthorized")
  });
  wss.on("error", (err) => logger.error("[Bridge] WebSocket listener failed:", err?.message || err));
  wss.on("connection", (client) => client.on("error", (err) => logger.warn("[Bridge] Client error:", err?.message || err)));
  const upstream = io(upstreamUrl.href, { autoConnect: false, reconnection: true });

  upstream.on("pubsub-chat-event", (payload) => {
    if (!identity) return;
    const targets = recipientsFor(payload);
    if (!targets.includes(identity)) return;
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(payload));
      }
    }
  });

  upstream.connect();

  async function close() {
    upstream.disconnect();
    for (const client of wss.clients) {
      try {
        client.terminate();
      } catch (_) {}
    }
    // CORRECCIÓN: Manejo adecuado de error en la promesa de cierre del socket
    await new Promise((resolve, reject) => {
      wss.close((err) => (err ? reject(err) : resolve()));
    });
  }

  return { wss, upstream, close };
}

if (require.main === module) {
  const bridge = startBridge();
  // CORRECCIÓN: Cierre asíncrono ordenado en señales de terminación
  let isClosing = false;
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, async () => {
      if (isClosing) return;
      isClosing = true;
      try {
        await bridge.close();
        process.exit(0);
      } catch (err) {
        console.error(`[Bridge] Error during ${signal} graceful shutdown:`, err);
        process.exit(1);
      }
    });
  }
}

module.exports = { startBridge };
