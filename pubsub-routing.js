"use strict";

function recipientsFor(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const ids = [payload.toSyncId, payload.recipientSyncId];
  if (Array.isArray(payload.recipientSyncIds)) ids.push(...payload.recipientSyncIds);
  return [...new Set(ids.filter((id) => typeof id === "string" && /^[A-Za-z0-9_-]{3,128}$/.test(id)))];
}

// Use the current socket identity, never a client-supplied sender or a stale room.
function deliver(payload, socketToUser, io, isAuthorized) {
  const recipients = new Set(recipientsFor(payload));
  let delivered = 0;
  for (const [socketId, user] of socketToUser) {
    if (recipients.has(user.syncId) && isAuthorized(socketId, user)) {
      io.to(socketId).emit("pubsub-chat-event", payload);
      delivered += 1;
    }
  }
  return delivered;
}

module.exports = { recipientsFor, deliver };
