"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { recipientsFor, deliver } = require("../pubsub-routing");
const { createBridgeAuth } = require("../bridge-security");
const { startBridge } = require("../ws-bridge");

test("SEC-01: explicit recipients only; malformed/absent/from/channel never imply an audience", () => {
  for (const payload of [null, [], "all", {}, { fromSyncId: "SYNC-1001" }, { channelId: "chan-general" },
    { recipientSyncIds: ["", "../secret", 1, null, "a".repeat(129)] }]) assert.deepEqual(recipientsFor(payload), []);
  assert.deepEqual(recipientsFor({ toSyncId: "SYNC-1001", recipientSyncId: "SYNC-1001", recipientSyncIds: ["SYNC-1002"] }),
    ["SYNC-1001", "SYNC-1002"]);
});

test("SEC-01: only current authenticated sockets receive; count means delivered sockets", () => {
  const calls = [];
  const io = { to(id) { return { emit(event) { calls.push([id, event]); } }; } };
  const users = new Map([["a1", { syncId: "SYNC-1001" }], ["a2", { syncId: "SYNC-1001" }], ["b", { syncId: "SYNC-1002" }]]);
  assert.equal(deliver({}, users, io, () => true), 0);
  assert.equal(deliver({ toSyncId: "SYNC-1001" }, users, io, (id) => id !== "a2"), 1);
  assert.deepEqual(calls, [["a1", "pubsub-chat-event"]]);
  assert.equal(deliver({ toSyncId: "offline" }, users, io, () => true), 0);
});

test("SEC-02: timing-safe handshake rejects missing/wrong/short tokens", () => {
  assert.throws(() => createBridgeAuth("short"), /32/);
  assert.throws(() => createBridgeAuth(" ".repeat(40)), /32/);
  const token = "unit-test-only-token-".repeat(3);
  const auth = createBridgeAuth(token);
  for (const authorization of [undefined, "wrong", [token], "Bearer " + "x".repeat(token.length)]) {
    assert.equal(auth({ headers: { authorization } }), false);
  }
  assert.equal(auth({ headers: { authorization: "Bearer " + token } }), true);
});

test("SEC-02: configuration rejects public binding, insecure remote upstream and missing upstream token", () => {
  const env = { WS_BRIDGE_TOKEN: "test-only-".repeat(5), WS_BRIDGE_UPSTREAM_TOKEN: "test-session" };
  assert.throws(() => startBridge({ env: { ...env, WS_BRIDGE_HOST: "0.0.0.0" } }), /loopback/);
  assert.throws(() => startBridge({ env: { ...env, WS_BRIDGE_UPSTREAM_URL: "http://example.test" } }), /HTTPS/);
  assert.throws(() => startBridge({ env: { ...env, WS_BRIDGE_UPSTREAM_TOKEN: "" } }), /required/);
});

test("staging Pub/Sub rejects missing configuration and production defaults before constructing SDK", () => {
  const source = fs.readFileSync(path.join(__dirname, "../pubsub-service.js"), "utf8");
  function load(env) {
    const module = { exports: {} };
    vm.runInNewContext(source, { module, process: { env }, require() { return { PubSub: class {} }; } });
  }
  assert.throws(() => load({ APP_ENV: "staging" }), /dedicated/);
  assert.throws(() => load({ APP_ENV: "staging", PUBSUB_PROJECT_ID: "sync-engine-hub", PUBSUB_TOPIC: "stage", PUBSUB_SUBSCRIPTION: "stage" }), /dedicated/);
  assert.doesNotThrow(() => load({ APP_ENV: "staging", PUBSUB_PROJECT_ID: "isolated-stage", PUBSUB_TOPIC: "stage", PUBSUB_SUBSCRIPTION: "stage" }));
});

test("Pub/Sub shutdown closes the SDK and subscription and cancels reconnection", async () => {
  const { EventEmitter } = require("node:events");
  const subscription = new EventEmitter();
  let closed = 0, opened = 0, retry, cancelled = 0;
  subscription.close = async () => { closed++; };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../pubsub-service.js"), "utf8"), {
    module, process: { env: {} }, console: { log() {}, error() {}, warn() {} },
    setTimeout(fn) { retry = fn; return 1; }, clearTimeout() { cancelled++; },
    require() { return { PubSub: class {
      subscription() { opened++; return subscription; }
      async close() { closed++; }
    } }; }
  });
  const stop = module.exports.startChatSubscriptionListener(() => {});
  subscription.emit("error", { code: 14, message: "unavailable" });
  await stop();
  retry();
  assert.equal(closed, 2);
  assert.equal(cancelled, 1);
  assert.equal(opened, 1);
});
