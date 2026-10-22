'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

module.exports = function isolatedDb(root, tempDir, users) {
  const contacts = Object.fromEntries(users.map((user) => [user.syncId,
    users.filter((other) => other.syncId !== user.syncId).map((other) => other.syncId)]));
  fs.mkdirSync(path.join(tempDir, 'data'), { recursive: true });
  fs.writeFileSync(path.join(tempDir, 'data', 'sync_db.json'), JSON.stringify({
    users, contacts, sessions: users.map((user) => ({ token: 'test-' + user.username, syncId: user.syncId, createdAt: Date.now() })),
    messages: [], files: [], pinnedMessages: {}, subscriptions: {}
  }));
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'db.js'), 'utf8') + '\nmodule.exports.testData = readDb();', {
    __dirname: tempDir, require, module, process: { env: { NODE_ENV: 'test' } },
    console, Buffer, Promise, Set
  });
  return module.exports;
};
