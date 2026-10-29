"use strict";
const dns = require("node:dns/promises");
const http = require("node:http");
const https = require("node:https");
const { isIP, BlockList } = require("node:net");

const denied = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]
]) denied.addSubnet(address, prefix, "ipv4");
denied.addAddress("168.63.129.16", "ipv4"); // Azure platform virtual IP.
const globalIPv6 = new BlockList();
globalIPv6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]]) {
  denied.addSubnet(address, prefix, "ipv6");
}

function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !denied.check(address, "ipv4");
  // Fail closed for mapped/compatible IPv4, NAT64, ULA, link-local, multicast,
  // loopback, unspecified and other non-global/transition IPv6 ranges.
  return family === 6 && globalIPv6.check(address, "ipv6") && !denied.check(address, "ipv6");
}

function abortable(promise, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function validateTarget(url, lookup, signal) {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Metadata URL is not allowed");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "metadata.google.internal") {
    throw new Error("Metadata host is not allowed");
  }
  const family = isIP(hostname);
  const addresses = family ? [{ address: hostname, family }]
    : await abortable(lookup(hostname, { all: true, verbatim: true }), signal);
  if (!Array.isArray(addresses) || !addresses.length || addresses.some((item) =>
    !isPublicAddress(item.address) || isIP(item.address) !== item.family)) {
    throw new Error("Metadata address is not public");
  }
  return addresses;
}

function requestPage(protocol, options, callback) {
  return (protocol === "https:" ? https : http).request(options, callback);
}

// Injection is only a module-level test seam, never controlled by HTTP input/env.
function createMetadataFetcher({ lookup = dns.lookup, request = requestPage,
  timeoutMs = 3500, maxBytes = 1024 * 1024, maxRedirects = 5 } = {}) {
  return async function fetchMetadata(target) {
    const signal = AbortSignal.timeout(timeoutMs);
    let url = new URL(target);
    for (let redirects = 0; ; redirects++) {
      signal.throwIfAborted();
      const addresses = await validateTarget(url, lookup, signal);
      const result = await new Promise((resolve, reject) => {
        // Use only this validated DNS snapshot. No second DNS resolution, pool
        // reuse or automatic redirect may choose an unchecked destination.
        const requestOptions = {
          protocol: url.protocol,
          hostname: addresses[0].address,
          port: url.port || undefined,
          path: url.pathname + url.search,
          servername: url.hostname,
          agent: false, signal, family: addresses[0].family, autoSelectFamily: false,
          lookup(_host, options, callback) {
            if (options.all) callback(null, addresses);
            else callback(null, addresses[0].address, addresses[0].family);
          },
          headers: {
            "User-Agent": "SYNC-ENGINE-LinkPreview/1.0",
            Accept: "text/html,application/xhtml+xml",
            Host: url.host
          }
        };
        const req = request(url.protocol, requestOptions, (response) => {
          const status = response.statusCode;
          const location = response.headers.location;
          if ([301, 302, 303, 307, 308].includes(status) && location) {
            response.destroy();
            resolve({ status, location, body: "" });
            return;
          }
          let size = 0;
          const chunks = [];
          response.on("data", (chunk) => {
            size += chunk.length;
            if (size > maxBytes) {
              const error = new Error("Metadata response too large");
              reject(error);
              response.destroy();
              req.destroy(error);
            } else chunks.push(chunk);
          });
          response.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString("utf8") }));
          response.on("error", reject);
          response.on("aborted", () => reject(new Error("Metadata response aborted")));
        });
        req.on("error", reject);
        req.end();
      });
      if (!result.location) return { ...result, ok: result.status >= 200 && result.status < 300, url: url.href };
      if (redirects >= maxRedirects) throw new Error("Too many metadata redirects");
      const next = new URL(result.location, url);
      if (url.protocol === "https:" && next.protocol !== "https:") throw new Error("Metadata TLS downgrade blocked");
      url = next; // Fully validate scheme, host and every address on each hop.
    }
  };
}

module.exports = { createMetadataFetcher, isPublicAddress };
