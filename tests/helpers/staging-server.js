"use strict";
// Runs the actual app and disk DB. Only GCP delivery is injected over private IPC.
const db = require("../../db");
db.readDb();
const { server, io, deliverPubSubEvent } = require("../../server");
server.listen(0, "127.0.0.1", () => process.send({ ready: server.address().port }));
process.on("message", async ({ id, op, payload }) => {
  try {
    let result;
    if (op === "deliver") result = deliverPubSubEvent(payload);
    else if (op === "flush") result = await db.writeDb(db.readDb());
    else if (op === "expire") {
      db.readDb().sessions.find((session) => session.token === payload).expiresAt = 1;
      await db.writeDb(db.readDb());
    } else if (op === "revoke") db.revokeSession(payload);
    else if (op === "messages") result = db.readDb().messages;
    else if (op === "stop") {
      await db.writeDb(db.readDb());
      await new Promise((resolve) => io.close(resolve));
      process.disconnect();
      return;
    }
    process.send({ id, result });
  } catch (error) { process.send({ id, error: error.message }); }
});
