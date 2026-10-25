"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "db.js"), "utf8");

function fixture(t, content, filesystem = fs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-persistence-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const file = path.join(dir, "sync_db.json");
  if (content !== undefined) fs.writeFileSync(file, content);
  function load() {
    const module = { exports: {} };
    vm.runInNewContext(source, {
      __dirname: root, module, process: { env: { NODE_ENV: "test", DATA_DIR: dir } },
      require(name) { return name === "fs" ? filesystem : require(name); },
      console: { error() {}, warn() {} }, Buffer, setTimeout
    });
    return module.exports;
  }
  return { dir, file, load };
}

test("DATA-01: corrupt, empty, primitive and wrong-shaped JSON cannot be replaced after a failed read", async (t) => {
  for (const content of ["{broken", "", "null", "[]", "42", '{"messages":{}}', '{"users":"wrong"}', '{"contacts":[]}']) {
    const { file, load } = fixture(t, content);
    const db = load();
    assert.throws(() => db.readDb(), /DB_READ_FAILED/);
    assert.throws(() => db.writeDb({ users: [] }), /DB_READ_FAILED/);
    assert.equal(fs.readFileSync(file, "utf8"), content);
    assert.throws(() => db.readDb(), /DB_READ_FAILED/);
  }
});

test("DATA-01: unreadable DB is preserved and the error does not expose DB contents", (t) => {
  const filesystem = Object.create(fs);
  filesystem.readFileSync = () => { throw new Error("EACCES secret database contents"); };
  const { file, load } = fixture(t, '{"users":[]}', filesystem);
  assert.throws(() => load().readDb(), (err) => err.message.startsWith("DB_READ_FAILED") && !err.message.includes("secret"));
  assert.equal(fs.readFileSync(file, "utf8"), '{"users":[]}');
});

test("DATA-01: missing DB initializes; queued atomic writes survive a fresh module restart", async (t) => {
  const { file, load } = fixture(t);
  const db = load();
  const data = db.readDb();
  const writes = [];
  for (let i = 0; i < 60; i++) {
    data.messages.push({ id: "persist-" + i, fromId: "SYNC-1001", toId: "SYNC-1002", text: "fixture-" + i });
    writes.push(db.writeDb(data));
  }
  await Promise.all(writes);
  const fresh = load().readDb();
  assert.equal(fresh.messages.length, 60);
  assert.equal(fresh.messages[59].text, "fixture-59");
  assert.equal(JSON.parse(fs.readFileSync(file)).messages.length, 60);
});

test("DATA-01: failed atomic rename rejects write and preserves last disk snapshot", async (t) => {
  const filesystem = Object.create(fs);
  Object.defineProperty(filesystem, "promises", { value: {
    writeFile: fs.promises.writeFile, unlink: fs.promises.unlink,
    rename: async () => { throw new Error("simulated disk rename failure"); }
  } });
  const original = '{"users":[],"messages":[{"id":"original"}]}';
  const { file, load } = fixture(t, original, filesystem);
  const db = load();
  const data = db.readDb();
  data.messages.push({ id: "uncommitted" });
  await assert.rejects(db.writeDb(data), /rename failure/);
  assert.equal(fs.readFileSync(file, "utf8"), original);
});

test("closing the write queue drains snapshots and rejects new writes", async (t) => {
  const { file, load } = fixture(t);
  const db = load();
  const data = db.readDb();
  data.messages.push({ id: "last-snapshot" });
  db.writeDb(data);
  await db.closeWrites();
  assert.equal(JSON.parse(fs.readFileSync(file)).messages[0].id, "last-snapshot");
  assert.throws(() => db.writeDb(data), /DB_CLOSED/);
});

test("DATA-01: a saved message is not confirmed until it survives a fresh read", async (t) => {
  const { file, load } = fixture(t);
  const db = load();
  const saved = await db.saveTextMessage("SYNC-1001", "SYNC-1002", "confirmado");
  const fresh = load().readDb();
  assert.equal(fresh.messages.some((message) => message.id === saved.id && message.text === "confirmado"), true);
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).messages.some((message) => message.id === saved.id), true);
});

test("DATA-01: a failed message write is rejected and is not kept as confirmed", async (t) => {
  const filesystem = Object.create(fs);
  Object.defineProperty(filesystem, "promises", { value: {
    writeFile: fs.promises.writeFile, unlink: fs.promises.unlink,
    rename: async () => { throw new Error("simulated disk rename failure"); }
  } });
  const original = '{"users":[],"messages":[]}';
  const { file, load } = fixture(t, original, filesystem);
  const db = load();
  await assert.rejects(db.saveTextMessage("SYNC-1001", "SYNC-1002", "perdido"), /rename failure/);
  assert.equal(db.readDb().messages.length, 0);
  assert.equal(fs.readFileSync(file, "utf8"), original);
});

test("DATA-01: real server exits before listening when its DB is corrupt", { timeout: 30000 }, async (t) => {
  const { dir, file } = fixture(t, "{broken");
  const child = spawn(process.execPath, [path.join(root, "server.js")], {
    cwd: root, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
      NODE_ENV: "test", PORT: "0", DATA_DIR: dir, UPLOADS_DIR: path.join(dir, "uploads"),
      DISABLE_LOCAL_TLS: "true", PUBSUB_ENABLED: "false" }, stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let stdout = "", stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const [code] = await once(child, "exit");
  assert.notEqual(code, 0);
  assert.match(stderr, /DB_READ_FAILED/);
  assert.doesNotMatch(stdout, /Server Activo/);
  assert.equal(fs.readFileSync(file, "utf8"), "{broken");
});


test("the real server handles SIGTERM with a clean exit", { timeout: 10000 }, async (t) => {
  const { dir } = fixture(t);
  const child = spawn(process.execPath, ["--require", path.join(__dirname, "helpers/no-network-interfaces.js"), path.join(root, "server.js")], {
    cwd: root, env: { PATH: process.env.PATH, NODE_ENV: "test", PORT: "0", DATA_DIR: dir,
      UPLOADS_DIR: path.join(dir, "uploads"), DISABLE_LOCAL_TLS: "true", PUBSUB_ENABLED: "false" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(() => { if (child.exitCode === null) child.kill("SIGKILL"); });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  await new Promise((resolve, reject) => {
    child.once("exit", (code, signal) => reject(new Error("Exited before ready: " + code + "/" + signal + " " + stderr)));
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Server Activo")) resolve();
    });
  });
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  assert.deepEqual(await exited, [0, null]);
});
