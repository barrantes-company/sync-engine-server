'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

module.exports = function isolatedDb(root, tempDir, users) {
  const fixtureTokens = new Map(users.map((user) => {
    const label = 'test-' + user.username;
    return [label, createHash('sha256').update(label).digest('hex')];
  }));
  const contacts = Object.fromEntries(users.map((user) => [user.syncId,
    users.filter((other) => other.syncId !== user.syncId).map((other) => other.syncId)]));
  fs.mkdirSync(path.join(tempDir, 'data'), { recursive: true });
  fs.writeFileSync(path.join(tempDir, 'data', 'sync_db.json'), JSON.stringify({
    users, contacts, sessions: users.map((user) => ({ token: fixtureTokens.get('test-' + user.username), syncId: user.syncId, createdAt: Date.now() })),
    messages: [], files: [], pinnedMessages: {}, subscriptions: {}
  }));
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'db.js'), 'utf8') + '\nmodule.exports.testData = readDb();', {
    __dirname: tempDir, require, module, process: { env: { NODE_ENV: 'test' } },
    console, Buffer, Promise, Set
  });
  // Preserve readable legacy fixture labels; exercise the real session validator with valid token shape.
  const getUserByToken = module.exports.getUserByToken;
  module.exports.getUserByToken = (token) => getUserByToken(fixtureTokens.get(token) || token);
  return module.exports;
};
