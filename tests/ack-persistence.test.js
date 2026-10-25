"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { fork } = require("node:child_process");
const { once } = require("node:events");
const { randomBytes } = require("node:crypto");
const { io } = require("socket.io-client");
const root = path.resolve(__dirname, "..");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function event(target, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { target.off(name, done); reject(new Error("Missing " + name)); }, 5000);
    function done(value) { clearTimeout(timer); resolve(value); }
    target.once(name, done);
  });
}
async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-ack-"));
  const file = path.join(dir, "sync_db.json");
  const token = randomBytes(32).toString("hex");
  fs.writeFileSync(file, JSON.stringify({ users: [{ syncId: "SYNC-1001", username: "fixture", cleanDisplayName: "Fixture" }],
    sessions: [{ token, syncId: "SYNC-1001", createdAt: Date.now() }], messages: [] }));
  const child = fork(path.join(__dirname, "helpers/staging-server.js"), [], { silent: true,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_ENV: "test", DATA_DIR: dir,
      UPLOADS_DIR: path.join(dir, "uploads"), PUBSUB_ENABLED: "false", DISABLE_LOCAL_TLS: "true" } });
  child.stdout.resume(); child.stderr.resume();
  let socket, id = 0;
  function command(op) {
    const request = ++id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.off("message", done); reject(new Error("IPC " + op)); }, 5000);
      function done(message) {
        if (message.id !== request) return;
        clearTimeout(timer); child.off("message", done);
        if (message.error) reject(new Error(message.error)); else resolve(message.result);
      }
      child.on("message", done); child.send({ id: request, op });
    });
  }
  t.after(async () => {
    socket?.disconnect();
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit"); child.kill(); await exited;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const { ready } = await event(child, "message");
  socket = io("http://127.0.0.1:" + ready, { autoConnect: false, transports: ["websocket"], reconnection: false });
  const connected = event(socket, "connect"); socket.connect(); await connected;
  const authenticated = event(socket, "authenticated"); socket.emit("authenticate", { token }); await authenticated;
  async function waitBlocked() {
    for (let i = 0; i < 100; i++) { if (await command("blockedWrites")) return; await delay(10); }
    throw new Error("Write did not reach the disk barrier");
  }
  return { socket, child, file, command, waitBlocked };
}

test("private, quick-reply and channel ACK/delivery wait for the atomic disk rename", { timeout: 15000 }, async (t) => {
  const f = await fixture(t);
  for (const [request, response, payload] of [
    ["send-private-message", "message-sent", { toSyncId: "SYNC-1002", type: "text", text: "private durable" }],
    ["quick-reply", "quick-reply-sent", { toSyncId: "SYNC-1002", text: "quick durable" }],
    ["send-channel-message", "channel-message-received", { channelId: "chan-general", type: "text", text: "channel durable" }]
  ]) {
    if (request === "send-channel-message") {
      payload.channelId = await f.command("createChannel");
      f.socket.emit("join-channel", { channelId: payload.channelId });
    }
    let count = 0;
    const observe = () => count++;
    f.socket.on(response, observe);
    await f.command("holdWrites");
    f.socket.emit(request, payload);
    await f.waitBlocked(); await delay(80);
    assert.equal(count, 0, request + " acknowledged before persistence");
    assert.ok(!fs.readFileSync(f.file, "utf8").includes(payload.text));
    const ack = event(f.socket, response);
    await f.command("releaseWrites"); await ack;
    assert.ok(fs.readFileSync(f.file, "utf8").includes(payload.text));
    f.socket.off(response, observe);
  }
});

test("storage failure emits an error without successful ACK or delivery", { timeout: 10000 }, async (t) => {
  for (const [request, success, payload] of [
    ["send-private-message", "message-sent", { toSyncId: "SYNC-1002", type: "text", text: "not durable" }],
    ["quick-reply", "quick-reply-sent", { toSyncId: "SYNC-1002", text: "not durable" }],
    ["send-channel-message", "channel-message-received", { channelId: "chan-general", type: "text", text: "not durable" }]
  ]) {
    const f = await fixture(t);
    const before = fs.readFileSync(f.file, "utf8");
    const successes = [];
    if (request === "send-channel-message") {
      payload.channelId = await f.command("createChannel");
      f.socket.emit("join-channel", { channelId: payload.channelId });
    }
    f.socket.on(success, (x) => successes.push(x));
    f.socket.on("receive-private-message", (x) => successes.push(x));
    await f.command("failWrites");
    const error = event(f.socket, "error-message");
    f.socket.emit(request, payload);
    assert.ok((await error).message);
    await delay(80);
    assert.equal(successes.length, 0, request);
    assert.equal(fs.readFileSync(f.file, "utf8"), before);
    const rejected = event(f.socket, "auth-error");
    f.socket.emit("authenticate", { token: JSON.parse(before).sessions[0].token });
    await rejected;
    assert.equal(f.child.exitCode, null, "storage failure must not crash reauthentication");
  }
});

test("shutdown waits for an in-flight message and drains writes before process exit", { timeout: 10000 }, async (t) => {
  const f = await fixture(t);
  await f.command("holdWrites");
  f.socket.emit("send-private-message", { toSyncId: "SYNC-1002", type: "text", text: "shutdown durable" });
  await f.waitBlocked();
  let exited = false;
  const exit = once(f.child, "exit").then((value) => { exited = true; return value; });
  f.child.send({ op: "stop" });
  await delay(100);
  assert.equal(exited, false);
  await f.command("releaseWrites");
  const [code] = await exit;
  assert.equal(code, 0);
  assert.ok(fs.readFileSync(f.file, "utf8").includes("shutdown durable"));
});
