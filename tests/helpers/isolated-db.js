'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

// Deterministic credentials for isolated tests only; keep the real validator unchanged.
function tokenFor(username) {
  return createHash('sha256').update('test-' + username).digest('hex');
}

module.exports = function isolatedDb(root, tempDir, users) {
  const contacts = Object.fromEntries(users.map((user) => [user.syncId,
    users.filter((other) => other.syncId !== user.syncId).map((other) => other.syncId)]));
  fs.mkdirSync(path.join(tempDir, 'data'), { recursive: true });
  fs.writeFileSync(path.join(tempDir, 'data', 'sync_db.json'), JSON.stringify({
    users, contacts, sessions: users.map((user) => ({ token: tokenFor(user.username), syncId: user.syncId, createdAt: Date.now() })),
    messages: [], files: [], pinnedMessages: {}, subscriptions: {}
  }));
  const module = { exports: {} };
  const rootRequire = createRequire(path.join(root, 'db.js'));
  vm.runInNewContext(fs.readFileSync(path.join(root, 'db.js'), 'utf8') + '\nmodule.exports.testData = readDb();', {
    __dirname: tempDir, require: rootRequire, module, process: { env: { NODE_ENV: 'test' } },
    console, Buffer, Promise, Set
  });
  return module.exports;
};

module.exports.tokenFor = tokenFor;
