'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const isolatedDb = require('./helpers/isolated-db');

const root = path.resolve(__dirname, '..');

function freshDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-conversation-auth-'));
  return isolatedDb(root, tempDir, [
    { syncId: 'SYNC-1001', username: 'alice', formattedName: 'SYNC-1001 - Alice', cleanDisplayName: 'Alice' },
    { syncId: 'SYNC-1002', username: 'bob', formattedName: 'SYNC-1002 - Bob', cleanDisplayName: 'Bob' }
  ]);
}

test('reactions and pins cannot cross conversation boundaries', () => {
  const db = freshDb();
  const own = db.saveTextMessage('SYNC-1001', 'SYNC-1002', 'hola');
  const foreign = db.saveTextMessage('SYNC-3003', 'SYNC-4004', 'secreto');

  const reactions = db.updateMessageReaction(own.id, 'sync-1001', '🔥', 'sync-1002');
  assert.equal(reactions['SYNC-1001'], '🔥');
  assert.throws(
    () => db.updateMessageReaction(foreign.id, 'SYNC-1001', '🔥', 'SYNC-1002'),
    /permisos/
  );
  assert.equal(db.getMessageById(foreign.id).reactions['SYNC-1001'], undefined);
  assert.throws(() => db.updateMessageReaction(own.id, 'SYNC-1001', '<img>', 'SYNC-1002'), /no válida/i);

  assert.throws(() => db.setPinnedMessage('SYNC-1001', 'SYNC-1002', foreign.id), /permisos/);
  assert.equal(db.setPinnedMessage('SYNC-1001', 'SYNC-1002', own.id).id, own.id);
  assert.equal(db.getPinnedMessage('SYNC-1002', 'SYNC-1001').text, 'hola');

  const stored = db.readDb();
  const key = ['SYNC-1001', 'SYNC-1002'].sort().join(':');
  stored.pinnedMessages[key] = foreign.id;
  db.writeDb(stored);
  assert.equal(db.getPinnedMessage('SYNC-1001', 'SYNC-1002'), null);
  assert.equal(Object.hasOwn(db.readDb().pinnedMessages, key), false);
});

test('delete-for-everyone stays inside the sender conversation', () => {
  const db = freshDb();
  const own = db.saveTextMessage('SYNC-1001', 'SYNC-1002', 'borrar');
  assert.throws(() => db.deleteMessageForEveryone(own.id, 'SYNC-1002', 'SYNC-1001'), /permisos/);
  assert.throws(() => db.deleteMessageForEveryone(own.id, 'SYNC-1001', 'SYNC-4004'), /permisos/);
  const deleted = db.deleteMessageForEveryone(own.id, 'SYNC-1001', 'SYNC-1002');
  assert.equal(deleted.deletedForEveryone, true);
  assert.equal(deleted.text, 'Este mensaje fue eliminado');
});

test('conversation export uses the stored participant ids', () => {
  const db = freshDb();
  db.saveTextMessage('SYNC-1001', 'SYNC-1002', 'exportable');
  const exported = db.exportConversation('SYNC-1001', 'SYNC-1002');
  assert.equal(exported.totalMessages, 1);
  assert.equal(exported.messages[0].fromSyncId, 'SYNC-1001');
  assert.equal(exported.messages[0].toSyncId, 'SYNC-1002');
  assert.equal(exported.messages[0].text, 'exportable');
  assert.equal(exported.securitySeal, undefined);
  assert.equal(exported.participants.requester.plan, undefined);
});

test('history limits stay inside one conversation', () => {
  const db = freshDb();
  const other = db.saveTextMessage('SYNC-1001', 'SYNC-1002', 'conservar');
  const stored = db.readDb();
  for (let i = 0; i < 5001; i += 1) {
    stored.messages.push({
      id: 'bulk-' + i,
      fromId: 'SYNC-3003',
      toId: 'SYNC-4004',
      type: 'text',
      text: 'lleno',
      timestamp: i
    });
  }
  db.writeDb(stored);
  db.saveTextMessage('SYNC-3003', 'SYNC-4004', 'ultimo');
  const messages = db.readDb().messages;
  assert.equal(messages.some((message) => message.id === other.id), true);
  assert.equal(messages.filter((message) => message.fromId === 'SYNC-3003').length, 5000);
});

test('new passwords require 8 characters and old hashes upgrade on login', () => {
  const db = freshDb();
  assert.throws(() => db.registerUser('nueva', 'corta', 'Nueva'), /8/);
  const created = db.registerUser('nueva', 'correcta', 'Nueva');
  assert.equal(created.plan, undefined);
  const legacy = db.readDb();
  const user = legacy.users.find((item) => item.username === 'nueva');
  user.passwordIterations = 10000;
  user.passwordHash = require('node:crypto').pbkdf2Sync('correcta', user.salt, 10000, 64, 'sha512').toString('hex');
  const oldHash = user.passwordHash;
  db.writeDb(legacy);
  const session = db.loginUser('nueva', 'correcta');
  assert.equal(session.user.syncId, created.syncId);
  const upgraded = db.readDb().users.find((item) => item.username === 'nueva');
  assert.equal(upgraded.passwordIterations, 210000);
  assert.notEqual(upgraded.passwordHash, oldHash);
});
