"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { fork } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { once } = require("node:events");
const { io } = require("socket.io-client");
const WebSocket = require("ws");
const { startBridge } = require("../ws-bridge");
let temp, child, base, alice, alice2, bob, outsider, anonymous, childEnv;
let requestId = 0;
const clients = [], bridges = [];
const tokens = Object.fromEntries(["alice", "bob", "outsider"].map((name) => [name, randomBytes(32).toString("hex")]));
const users = ["alice", "bob", "outsider"].map((username, i) => ({ username, syncId: "SYNC-" + (1001 + i), cleanDisplayName: username }));
const received = new Map();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function event(target, name, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { target.off(name, done); reject(new Error("Missing event " + name)); }, timeoutMs);
    function done(value) { clearTimeout(timeout); resolve(value); }
    target.once(name, done);
  });
}
function command(op, payload) {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.off("message", response); reject(new Error("IPC timeout: " + op)); }, 15000);
    function response(message) {
      if (message.id !== id) return;
      child.off("message", response); clearTimeout(timeout);
      if (message.error) reject(new Error(message.error)); else resolve(message.result);
    }
    child.on("message", response); child.send({ id, op, payload });
  });
}
async function connect(token, transport = "websocket") {
  const socket = io(base, { transports: [transport], autoConnect: false, forceNew: true, reconnection: false });
  clients.push(socket); received.set(socket, []);
  socket.on("pubsub-chat-event", (payload) => received.get(socket).push(payload));
  const connected = event(socket, "connect"); socket.connect(); await connected;
  if (token) { const ready = event(socket, "authenticated"); socket.emit("authenticate", { token }); await ready; }
  return socket;
}
async function publish(payload, expected = []) {
  const waits = expected.map((socket) => event(socket, "pubsub-chat-event"));
  const delivered = await command("deliver", payload);
  await Promise.all(waits);
  await delay(120); // bounded observation for unintended network deliveries
  return delivered;
}

before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "sync-real-integration-"));
  fs.writeFileSync(path.join(temp, "sync_db.json"), JSON.stringify({
    users, contacts: {}, messages: [], files: [],
    sessions: users.map((user) => ({ token: tokens[user.username], syncId: user.syncId, createdAt: Date.now() }))
  }));
  childEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
      NODE_ENV: "test", DATA_DIR: temp, UPLOADS_DIR: path.join(temp, "uploads"),
      DISABLE_LOCAL_TLS: "true", PUBSUB_ENABLED: "false" };
  child = fork(path.join(__dirname, "helpers/staging-server.js"), [], { env: childEnv, silent: true });
  child.stdout.resume(); child.stderr.resume();
  const ready = await event(child, "message", 30000);
  base = "http://127.0.0.1:" + ready.ready;
  alice = await connect(tokens.alice); alice2 = await connect(tokens.alice, "polling");
  bob = await connect(tokens.bob); outsider = await connect(tokens.outsider); anonymous = await connect();
});

after(async () => {
  for (const bridge of bridges) await bridge.close();
  for (const socket of clients) socket.disconnect();
  if (child?.connected) {
    const stopped = once(child, "exit"); child.send({ op: "stop" }); await stopped;
  } else if (child?.exitCode === null) child.kill();
  if (temp) fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

test("real HTTP server and both Socket.IO transports authenticate disposable users", async () => {
  assert.equal((await fetch(base + "/api/status")).status, 200);
  assert.equal(alice.io.engine.transport.name, "websocket");
  assert.equal(alice2.io.engine.transport.name, "polling");
  const rejected = event(anonymous, "auth-error"); anonymous.emit("authenticate", { token: "invalid" }); await rejected;
});

test("SEC-01: real network isolates private Pub/Sub across two devices, another user, outsider and anonymous", async () => {
  for (const list of received.values()) list.length = 0;
  const payload = { toSyncId: users[0].syncId, text: "private fixture" };
  assert.equal(await publish(payload, [alice, alice2]), 2);
  assert.equal(received.get(alice).length, 1); assert.equal(received.get(alice2).length, 1);
  for (const socket of [bob, outsider, anonymous]) assert.equal(received.get(socket).length, 0);
  for (const payload of [{ text: "no audience" }, { fromSyncId: users[0].syncId }, { channelId: "chan-general" },
    { toSyncId: "offline-user" }, { recipientSyncIds: ["../bad", null] }]) assert.equal(await publish(payload), 0);
  assert.equal(received.get(alice).length, 1);
  assert.equal(await publish({ recipientSyncIds: [users[0].syncId, users[1].syncId, users[0].syncId] }, [alice, alice2, bob]), 3);
});

test("SEC-01: reauthentication removes previous identity; failed reauth removes access", async () => {
  const ready = event(alice2, "authenticated"); alice2.emit("authenticate", { token: tokens.bob }); await ready;
  received.get(alice2).length = 0;
  assert.equal(await publish({ toSyncId: users[0].syncId }, [alice]), 1);
  assert.equal(received.get(alice2).length, 0);
  assert.equal(await publish({ toSyncId: users[1].syncId }, [alice2, bob]), 2);
  const rejected = event(alice2, "auth-error"); alice2.emit("authenticate", { token: "invalid" }); await rejected;
  received.get(alice2).length = 0;
  assert.equal(await publish({ toSyncId: users[1].syncId }, [bob]), 1);
  assert.equal(received.get(alice2).length, 0);
});

test("real private message persists and is inaccessible to an unrelated conversation", async () => {
  const sent = event(alice, "message-sent"), delivered = event(bob, "receive-private-message");
  alice.emit("send-private-message", { toSyncId: users[1].syncId, text: "durable fixture", type: "text" });
  await sent; const message = await delivered;
  await command("flush");
  const disk = JSON.parse(fs.readFileSync(path.join(temp, "sync_db.json"), "utf8"));
  assert.ok(disk.messages.some((item) => item.id === message.id && item.text === "durable fixture"));
  const headers = { Authorization: "Bearer " + tokens.outsider };
  const response = await fetch(base + "/api/messages/" + users[0].syncId, { headers });
  const body = await response.json();
  assert.ok(!JSON.stringify(body).includes("durable fixture"));
});

async function bridgeFor(name) {
  const token = randomBytes(32).toString("hex");
  const bridge = startBridge({ env: { WS_BRIDGE_TOKEN: token, WS_BRIDGE_UPSTREAM_TOKEN: tokens[name],
    WS_BRIDGE_UPSTREAM_URL: base, WS_BRIDGE_PORT: "0" }, logger: { error() {} } });
  bridges.push(bridge);
  const authenticated = event(bridge.upstream, "authenticated");
  if (!bridge.wss.address()) await event(bridge.wss, "listening");
  await authenticated;
  const url = "ws://127.0.0.1:" + bridge.wss.address().port;
  const client = new WebSocket(url, { headers: { Authorization: "Bearer " + token } });
  await event(client, "open");
  return { ...bridge, token, url, client };
}

test("SEC-02: real WebSocket denies missing/wrong credentials; distinct bridges isolate upstream identities", async () => {
  const a = await bridgeFor("alice"), b = await bridgeFor("bob");
  for (const authorization of [undefined, "Bearer wrong", "Bearer " + b.token]) {
    await new Promise((resolve, reject) => {
      const client = new WebSocket(a.url, { headers: authorization ? { Authorization: authorization } : {} });
      const timeout = setTimeout(() => { client.terminate(); reject(new Error("handshake timeout")); }, 5000);
      client.on("open", () => { clearTimeout(timeout); client.terminate(); reject(new Error("unauthorized WS accepted")); });
      client.on("error", (error) => { clearTimeout(timeout); assert.match(error.message, /401/); resolve(); });
    });
  }
  const seenA = [], seenB = [];
  a.client.on("message", (data) => seenA.push(JSON.parse(data)));
  b.client.on("message", (data) => seenB.push(JSON.parse(data)));
  const gotA = event(a.client, "message");
  assert.equal(await publish({ recipientSyncId: users[0].syncId, text: "alice WS" }, [alice]), 2);
  await gotA;
  assert.equal(seenA.length, 1); assert.equal(seenB.length, 0);
  const gotB = event(b.client, "message");
  assert.equal(await publish({ recipientSyncId: users[1].syncId, text: "bob WS" }, [bob]), 2);
  await gotB;
  assert.equal(seenA.length, 1); assert.equal(seenB.length, 1);
  a.client.close(); b.client.close();
});

test("SEC-02: a rejected upstream session cannot forward through an otherwise valid WS handshake", async () => {
  const token = randomBytes(32).toString("hex");
  const bridge = startBridge({ env: { WS_BRIDGE_TOKEN: token, WS_BRIDGE_UPSTREAM_TOKEN: randomBytes(32).toString("hex"),
    WS_BRIDGE_UPSTREAM_URL: base, WS_BRIDGE_PORT: "0" }, logger: { error() {} } });
  bridges.push(bridge);
  const rejected = event(bridge.upstream, "auth-error");
  if (!bridge.wss.address()) await event(bridge.wss, "listening");
  await rejected;
  const client = new WebSocket("ws://127.0.0.1:" + bridge.wss.address().port, {
    headers: { Authorization: "Bearer " + token }
  });
  await event(client, "open");
  const seen = [];
  client.on("message", (data) => seen.push(data));
  await publish({ toSyncId: users[0].syncId, text: "no unauthorized upstream" }, [alice]);
  assert.equal(seen.length, 0);
  assert.equal(bridge.upstream.connected, false);
  client.close();
});

test("SEC-01: expired and revoked sessions receive nothing despite remaining connected", async () => {
  await command("expire", tokens.alice); await command("revoke", tokens.bob);
  received.get(alice).length = 0; received.get(bob).length = 0;
  assert.equal(await publish({ recipientSyncIds: [users[0].syncId, users[1].syncId] }), 0);
  assert.equal(received.get(alice).length, 0); assert.equal(received.get(bob).length, 0);
});

test("real process restart reloads the persisted private conversation", async () => {
  for (const bridge of bridges.splice(0)) await bridge.close();
  for (const socket of clients) socket.disconnect();
  const stopped = once(child, "exit"); child.send({ op: "stop" }); await stopped;
  child = fork(path.join(__dirname, "helpers/staging-server.js"), [], { env: childEnv, silent: true });
  child.stdout.resume(); child.stderr.resume();
  const ready = await event(child, "message", 30000);
  assert.ok(ready.ready > 0);
  const messages = await command("messages");
  assert.equal(messages.filter((message) => message.text === "durable fixture").length, 1);
});
