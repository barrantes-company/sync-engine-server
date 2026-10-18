"use strict";
const crypto = require("node:crypto");

function createBridgeAuth(token) {
  if (typeof token !== "string" || token.trim().length < 32) {
    throw new Error("SEC-02: WS_BRIDGE_TOKEN must contain at least 32 characters");
  }
  const expected = Buffer.from(`Bearer ${token}`);
  return (req) => {
    const header = req.headers.authorization;
    if (typeof header !== "string") return false;
    const actual = Buffer.from(header);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  };
}

module.exports = { createBridgeAuth };
