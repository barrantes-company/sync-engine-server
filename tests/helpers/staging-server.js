"use strict";
// Runs the actual app and disk DB. Only GCP delivery is injected over private IPC.
const db = require("../../db");
db.readDb();
const { server, io, deliverPubSubEvent, shutdown } = require("../../server");
const fs = require("node:fs");
const rename = fs.promises.rename;
let releaseWrite = null;
let failWrites = false;
let blocked = 0;
fs.promises.rename = async (...args) => {
  if (releaseWrite) {
    blocked++;
    await releaseWrite.promise;
    blocked--;
  }
  if (failWrites) throw new Error("fixture storage failure");
  return rename(...args);
};
server.listen(0, "127.0.0.1", () => process.send({ ready: server.address().port }));
process.on("message", async ({ id, op, payload }) => {
  try {
    let result;
    if (op === "deliver") result = deliverPubSubEvent(payload);
    else if (op === "holdWrites") {
      let release;
      const promise = new Promise((resolve) => { release = resolve; });
      releaseWrite = { promise, release };
    } else if (op === "releaseWrites") {
      const held = releaseWrite;
      releaseWrite = null;
      held?.release();
    } else if (op === "blockedWrites") result = blocked;
    else if (op === "failWrites") failWrites = true;
    else if (op === "flush") {
      await db.writeDb(db.readDb());
      await db.flushWrites();
    } else if (op === "expire") {
      db.readDb().sessions.find((session) => session.token === payload).expiresAt = 1;
      await db.writeDb(db.readDb());
    } else if (op === "revoke") db.revokeSession(payload);
    else if (op === "messages") result = db.readDb().messages;
    else if (op === "stop") {
      await shutdown();
      process.disconnect();
      return;
    }
    process.send({ id, result });
  } catch (error) {
    process.send({ id, error: error.message });
  }
});
