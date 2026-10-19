'use strict';

const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const http = require('node:http');
const { execSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { io: connect } = require('socket.io-client');
const isolatedDb = require('./helpers/isolated-db');
const { tokenFor } = isolatedDb;

const root = path.resolve(__dirname, '..');
const realRequire = createRequire(path.join(root, 'server.js'));

let tempDir, server, socketServer, base;
const sockets = [];
const users = [
  { syncId: 'SYNC-1001', username: 'alice', formattedName: 'SYNC-1001 - Alice', cleanDisplayName: 'Alice' },
  { syncId: 'SYNC-1002', username: 'bob', formattedName: 'SYNC-1002 - Bob', cleanDisplayName: 'Bob' }
];
let db;

before(async () => {
  tempDir = fs.mkdtempSync(path.join(process.env.SYNC_TEST_TMP || os.tmpdir(), 'sync-widget-'));
  fs.mkdirSync(path.join(tempDir, 'data'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'public', 'uploads'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'data', 'ssl'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'public', 'assets'), { recursive: true });

  for (const file of ['index.html', 'widget.html', 'widget.css', 'widget.js', 'safe-content.js', 'private-files.js', 'style.css', 'sw.js', 'manifest.json']) {
    const srcPath = path.join(root, 'public', file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(tempDir, 'public', file));
    }
  }

  const logoSrc = path.join(root, 'public', 'assets', 'logo.png');
  if (fs.existsSync(logoSrc)) {
    fs.copyFileSync(logoSrc, path.join(tempDir, 'public', 'assets', 'logo.png'));
  }

  db = isolatedDb(root, tempDir, users);

  const context = {
    __dirname: tempDir,
    process: { env: { NODE_ENV: 'test', PORT: '3000' } },
    console: { log() {}, warn() {}, error() {} },
    Buffer, URL, AbortController, AbortSignal, fetch, setTimeout, clearTimeout, setInterval, clearInterval, setImmediate,
    require(name) {
      if (name === 'dotenv') return { config() {} };
      if (name === './db') return db;
      if (name === './public/safe-content') return realRequire(name);
      if (name === 'selfsigned') return { generate: async () => null };
      if (name === 'web-push') return { setVapidDetails() { throw new Error('disabled in fixtures'); } };
      if (name === 'http') return {
        createServer(app) {
          server = http.createServer(app);
          server.listen = () => server;
          return server;
        }
      };
      return realRequire(name);
    }
  };

  vm.runInNewContext(fs.readFileSync(path.join(root, 'server.js'), 'utf8') + '\nglobalThis.testIo = io; globalThis.testOrigins = allowedOrigins;', context);
  socketServer = context.testIo;

  await new Promise((resolve) => http.Server.prototype.listen.call(server, 0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  context.testOrigins.add(base);
});

after(async () => {
  for (const socket of sockets) {
    socket.disconnect();
  }
  if (socketServer) await new Promise((resolve) => socketServer.close(resolve));
  if (server && server.listening) await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => setTimeout(resolve, 50));
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test('WIDGET 1: manifest_extension.json meets Manifest V3 requirements', () => {
  const manifestPath = path.join(root, 'manifest_extension.json');
  assert.ok(fs.existsSync(manifestPath), 'manifest_extension.json must exist');

  const content = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(content.manifest_version, 3);
  assert.ok(Array.isArray(content.permissions));
  assert.ok(content.permissions.includes('notifications'), 'Missing notifications permission');
  assert.ok(content.permissions.includes('sidePanel'), 'Missing sidePanel permission');
  assert.ok(content.permissions.includes('storage'), 'Missing storage permission');
  assert.equal(content.side_panel?.default_path, 'public/widget.html');
  assert.equal(content.background?.service_worker, 'extension_worker.js');
});

test('WIDGET 2: extension_worker.js has valid syntax', () => {
  const workerPath = path.join(root, 'extension_worker.js');
  assert.ok(fs.existsSync(workerPath), 'extension_worker.js must exist');
  assert.doesNotThrow(() => {
    execSync(`node --check "${workerPath}"`, { stdio: 'pipe' });
  });
});

test('FCM Android registra tokens solo en la cuenta autenticada y permite retirarlos', async () => {
  const token = 'fcm-test-registration-token-for-android-device';
  const unauthorized = await fetch(base + '/api/mobile/push-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  assert.equal(unauthorized.status, 401);

  const registered = await fetch(base + '/api/mobile/push-token', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + tokenFor('alice'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ token })
  });
  assert.equal(registered.status, 201);
  assert.equal(db.getMobilePushTokens('SYNC-1001').length, 1);
  assert.equal(db.getMobilePushTokens('SYNC-1002').length, 0);

  const removed = await fetch(base + '/api/mobile/push-token', {
    method: 'DELETE',
    headers: {
      Authorization: 'Bearer ' + tokenFor('alice'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ token })
  });
  assert.equal(removed.status, 200);
  assert.equal(db.getMobilePushTokens('SYNC-1001').length, 0);
});

test('WIDGET 3: GET /widget and /widget.html serve HTML with iframe and CSP headers', async () => {
  for (const endpoint of ['/widget', '/widget.html', '/public/widget.html']) {
    const res = await fetch(base + endpoint);
    assert.equal(res.status, 200, `Endpoint ${endpoint} should return 200`);
    assert.match(res.headers.get('content-type') || '', /text\/html/);
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.match(res.headers.get('content-security-policy') || '', /frame-ancestors 'self' chrome-extension:\* moz-extension:\*/);

    const body = await res.text();
    assert.ok(body.includes('widget.css'), 'Must link widget.css');
    assert.ok(body.includes('widget.js'), 'Must link widget.js');
    assert.ok(body.includes('announcements-list'), 'Must have announcements container');
  }
});

test('WIDGET 4: GET /widget.css serves CSS with required Material You tokens', async () => {
  const res = await fetch(base + '/widget.css');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/css/);

  const css = await res.text();
  assert.ok(css.includes('--se-bg-dark'), 'Missing --se-bg-dark');
  assert.ok(css.includes('--se-bg-card'), 'Missing --se-bg-card');
  assert.ok(css.includes('--se-bg-pill'), 'Missing --se-bg-pill');
  assert.ok(css.includes('--se-primary'), 'Missing --se-primary');
  assert.ok(css.includes('--se-text-light'), 'Missing --se-text-light');
  assert.ok(css.includes('--se-text-muted'), 'Missing --se-text-muted');
  assert.ok(css.includes('--se-success'), 'Missing --se-success');
  assert.ok(css.includes('--se-danger'), 'Missing --se-danger');
});

test('WIDGET 5: GET /widget.js serves client script', async () => {
  const res = await fetch(base + '/widget.js');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /javascript/);

  const js = await res.text();
  assert.ok(js.includes('UPDATE_UNREAD'), 'Must dispatch UPDATE_UNREAD');
  assert.ok(js.includes('#anuncios'), 'Must listen on #anuncios');
});

test('WIDGET 6: Extension CORS headers are allowed for chrome-extension origin', async () => {
  const res = await fetch(base + '/widget', {
    headers: {
      Origin: 'chrome-extension://abcdefghijklmnop'
    }
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), 'chrome-extension://abcdefghijklmnop');
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
});

test('WIDGET 7: Real Socket.IO client connects to #anuncios and receives announcements', async () => {
  const aliceSocket = connect(base, {
    transports: ['websocket'],
    forceNew: true
  });
  sockets.push(aliceSocket);

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Connection timeout')), 5000);
    aliceSocket.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });
  });

  // Authenticate
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Auth timeout')), 5000);
    aliceSocket.once('authenticated', resolve);
    aliceSocket.once('auth-error', (err) => reject(new Error(err.message)));
    aliceSocket.emit('authenticate', { token: tokenFor('alice') });
  });

  // Join #anuncios
  aliceSocket.emit('join-channel', { channelId: '#anuncios' });

  // Send message to #anuncios and expect channel-message-received
  const receivedMsg = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Channel message timeout')), 5000);
    aliceSocket.on('channel-message-received', (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });

    aliceSocket.emit('send-channel-message', {
      channelId: '#anuncios',
      text: 'Despliegue exitoso del nuevo widget',
      type: 'text'
    });
  });

  assert.equal(receivedMsg.text, 'Despliegue exitoso del nuevo widget');
  assert.equal(receivedMsg.senderSyncId, 'SYNC-1001');
});
