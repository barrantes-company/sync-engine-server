'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const isolatedDb = require('./helpers/isolated-db');

function fixture(users) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-ui-'));
  return isolatedDb(path.resolve(__dirname, '..'), dir, users);
}

test('a conversation page returns the latest slice and keeps the rest', () => {
  const db = fixture([
    { syncId: 'SYNC-1001', username: 'alice', formattedName: 'SYNC-1001 - Alice', cleanDisplayName: 'Alice' },
    { syncId: 'SYNC-1002', username: 'bob', formattedName: 'SYNC-1002 - Bob', cleanDisplayName: 'Bob' }
  ]);
  for (let i = 0; i < 45; i += 1) db.saveTextMessage('SYNC-1001', 'SYNC-1002', 'mensaje ' + i);
  const page = db.getMessagesPage('SYNC-1001', 'SYNC-1002', 40);
  assert.equal(page.messages.length, 40);
  assert.equal(page.hasMore, true);
  assert.equal(page.messages[0].text, 'mensaje 5');
  assert.equal(page.messages.at(-1).text, 'mensaje 44');
  const older = db.getMessagesPage('SYNC-1001', 'SYNC-1002', 40, page.messages[0].id);
  assert.equal(older.messages.length, 5);
  assert.equal(older.hasMore, false);
  assert.equal(older.messages[0].text, 'mensaje 0');
  assert.equal(db.getMessagesBetween('SYNC-1001', 'SYNC-1002').length, 45);
});

test('the call log lists both directions for the signed-in user', () => {
  const db = fixture([
    { syncId: 'SYNC-1001', username: 'alice', formattedName: 'SYNC-1001 - Alice', cleanDisplayName: 'Alice' },
    { syncId: 'SYNC-1002', username: 'bob', formattedName: 'SYNC-1002 - Bob', cleanDisplayName: 'Bob' }
  ]);
  db.recordCall('SYNC-1001', 'SYNC-1002', true);
  db.recordCall('SYNC-1002', 'SYNC-1001', false);
  const calls = db.listCallsForUser('SYNC-1001');
  assert.equal(calls.length, 2);
  assert.equal(calls.map((call) => call.direction).join(','), 'in,out');
  assert.equal(calls.find((call) => call.direction === 'out').status, 'missed');
  assert.equal(calls.find((call) => call.direction === 'out').peerName, 'SYNC-1002 - Bob');
});
