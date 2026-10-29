"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { createMetadataFetcher, isPublicAddress } = require("../metadata-fetch");

const publicV4 = { address: "8.8.8.8", family: 4 };
const publicV6 = { address: "2606:4700:4700::1111", family: 6 };

test("SSRF blocks private, loopback, link-local, mapped and special IPv4/IPv6 ranges", async () => {
  for (const address of ["0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.1.2",
    "192.168.1.2", "198.18.0.1", "224.0.0.1", "255.255.255.255", "168.63.129.16", "192.0.2.1", "203.0.113.1",
    "::", "::1", "fc00::1", "fd12::1", "fe80::1", "fec0::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:8.8.8.8",
    "::127.0.0.1", "64:ff9b::a00:1", "2001:db8::1", "2002:7f00:1::1", "2001::1", "3fff::1", "invalid"]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress(publicV4.address), true);
  assert.equal(isPublicAddress(publicV6.address), true);
  let requests = 0;
  const fetch = createMetadataFetcher({ lookup: async () => { throw new Error("No DNS expected"); },
    request() { requests++; throw new Error("No connection expected"); } });
  for (const url of ["http://[::1]/", "http://[fd00::1]/", "http://[fe80::1]/", "http://[::ffff:127.0.0.1]/",
    "http://2130706433/", "http://0x7f000001/", "http://127.1/", "http://localhost./", "http://sub.localhost/",
    "http://metadata.google.internal/", "http://user:password@public.example/", "file:///etc/passwd"]) {
    await assert.rejects(fetch(url));
  }
  assert.equal(requests, 0);
});

test("SSRF validates ALL DNS answers and fails closed on empty, invalid or failed resolution", async () => {
  for (const answers of [[], [publicV4, { address: "::1", family: 6 }], [publicV6, { address: "10.0.0.1", family: 4 }],
    [{ address: "8.8.8.8", family: 6 }], [{ address: "not-an-ip", family: 4 }]]) {
    let requests = 0;
    const fetch = createMetadataFetcher({ lookup: async (_host, options) => {
      assert.equal(options.all, true); return answers;
    }, request() { requests++; } });
    await assert.rejects(fetch("http://mixed.example/"));
    assert.equal(requests, 0);
  }
  await assert.rejects(createMetadataFetcher({ lookup: async () => { throw new Error("DNS failed"); } })("http://dns.example/"), /DNS failed/);
});

async function fixture(t, { resolve, ...config } = {}) {
  const visited = [], snapshots = [], resolutions = [];
  const server = http.createServer((req, res) => {
    visited.push(req.headers.host + req.url);
    const redirects = {
      "/public": "http://next.example/ok", "/relative": "/ok", "/private": "http://127.0.0.1/secret",
      "/ipv6": "http://[::1]/secret", "/private-dns": "http://internal.example/secret",
      "/rebinding": "/ok", "/loop": "/loop", "/downgrade": "http://next.example/ok"
    };
    if (redirects[req.url]) { res.writeHead(302, { Location: redirects[req.url] }); res.end(); }
    else if (req.url === "/large") res.end("x".repeat(2048));
    else if (req.url === "/slow") { res.write("start"); setTimeout(() => res.end("end"), 200); }
    else res.end("<html><title>Local fixture</title></html>");
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise((done) => server.close(done)));
  const fetch = createMetadataFetcher({
    ...config,
    lookup: async (host, options) => {
      resolutions.push(host);
      assert.equal(options.all, true);
      if (resolve) return resolve(host, resolutions);
      return host === "internal.example" ? [{ address: "fd00::1", family: 6 }] : [publicV4, publicV6];
    },
    request(protocol, options, callback) {
      assert.equal(options.agent, false);
      assert.equal(options.autoSelectFamily, false);
      options.lookup(options.hostname, { all: true }, (error, addresses) => {
        assert.equal(error, null); snapshots.push(addresses);
        assert.ok(addresses.every((x) => isPublicAddress(x.address)));
      });
      options.lookup(options.hostname, {}, (error, address, family) => {
        assert.equal(error, null); assert.ok(isPublicAddress(address)); assert.equal(family, options.family);
      });
      // Test-only transport routes validated public destinations to a disposable
      // loopback HTTP server. The production request uses the pinned lookup above.
      assert.equal(protocol, options.protocol);
      return http.request({ hostname: "127.0.0.1", port: server.address().port, path: options.path,
        agent: false, headers: options.headers, signal: options.signal }, callback);
    }
  });
  return { fetch, visited, snapshots, resolutions };
}

test("SSRF follows public/relative redirects with fresh validated DNS snapshots and pinned connections", async (t) => {
  const f = await fixture(t);
  const result = await f.fetch("http://start.example/public");
  assert.equal(result.ok, true);
  assert.match(result.body, /Local fixture/);
  assert.equal(result.url, "http://next.example/ok");
  assert.deepEqual(f.resolutions, ["start.example", "next.example"]);
  assert.equal(f.snapshots.length, 2);
  const relative = await f.fetch("http://start.example/relative");
  assert.equal(relative.url, "http://start.example/ok");
  assert.equal(f.resolutions.length, 4);
});

test("SSRF rejects private IPv4/IPv6/DNS redirect destinations before making the next request", async (t) => {
  for (const route of ["/private", "/ipv6", "/private-dns"]) {
    const f = await fixture(t);
    await assert.rejects(f.fetch("http://start.example" + route), /not public/);
    assert.deepEqual(f.visited, ["start.example" + route]);
  }
});

test("SSRF prevents DNS rebinding: connection lookup reuses the validated snapshot, redirects re-resolve", async (t) => {
  const f = await fixture(t, { resolve: (_host, calls) => calls.length === 1 ? [publicV4] : [{ address: "127.0.0.1", family: 4 }] });
  await assert.rejects(f.fetch("http://rebind.example/rebinding"), /not public/);
  assert.equal(f.resolutions.length, 2);
  assert.deepEqual(f.snapshots, [[publicV4]]);
  assert.deepEqual(f.visited, ["rebind.example/rebinding"]);
});

test("SSRF bounds redirects, response size, total body time and TLS downgrade", async (t) => {
  const f = await fixture(t, { maxRedirects: 1, maxBytes: 64 });
  await assert.rejects(f.fetch("http://start.example/loop"), /redirects/);
  await assert.rejects(f.fetch("http://start.example/large"), /large|aborted/);
  await assert.rejects(f.fetch("https://start.example/downgrade"), /TLS downgrade/);
  const slow = await fixture(t, { timeoutMs: 40 });
  await assert.rejects(slow.fetch("http://start.example/slow"), /abort|timeout/i);
  const stuckDns = await fixture(t, { timeoutMs: 40, resolve: () => new Promise(() => {}) });
  await assert.rejects(stuckDns.fetch("http://start.example/ok"), /abort|timeout/i);
});
