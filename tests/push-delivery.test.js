'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { configureWebPush, recipientIsFocused } = require('../server');
const isolatedDb = require('./helpers/isolated-db');

test('web push keys are created once and reused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-vapid-'));
  const first = configureWebPush(dir);
  const second = configureWebPush(dir);
  assert.equal(first.publicKey, second.publicKey);
  assert.equal(first.privateKey, second.privateKey);
  assert.equal(fs.existsSync(path.join(dir, 'vapid.json')), true);
});

test('a visible client in that conversation suppresses the push', () => {
  assert.equal(recipientIsFocused([{ visible: true, contactSyncId: 'SYNC-1002' }], { contactSyncId: 'sync-1002' }), true);
  assert.equal(recipientIsFocused([{ visible: false, contactSyncId: 'SYNC-1002' }], { contactSyncId: 'SYNC-1002' }), false);
  assert.equal(recipientIsFocused([{ visible: true, contactSyncId: 'SYNC-1003' }], { contactSyncId: 'SYNC-1002' }), false);
  assert.equal(recipientIsFocused([{ visible: true, channelId: 'chan-anuncios' }], { channelId: 'chan-anuncios' }), true);
  assert.equal(recipientIsFocused([], { contactSyncId: 'SYNC-1002' }), false);
});

test('push subscriptions require the browser encryption keys', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-push-sub-'));
  const db = isolatedDb(path.resolve(__dirname, '..'), dir, [
    { syncId: 'SYNC-1001', username: 'alice', formattedName: 'SYNC-1001 - Alice', cleanDisplayName: 'Alice' }
  ]);
  assert.equal(db.savePushSubscription('SYNC-1001', { endpoint: 'https://push.example/a' }), false);
  assert.equal(db.savePushSubscription('SYNC-1001', {
    endpoint: 'https://push.example/a',
    keys: { p256dh: 'key', auth: 'auth' }
  }), true);
  assert.equal(db.getPushSubscriptions('SYNC-1001')[0].keys.auth, 'auth');
});
