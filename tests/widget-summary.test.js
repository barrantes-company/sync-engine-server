'use strict';

const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const isolatedDb = require('./helpers/isolated-db');

const root = path.resolve(__dirname, '..');
let tempDir;
let db;

before(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-summary-'));
  const users = ['A', 'B'].map((letter, index) => ({
    syncId: 'SYNC-000' + (index + 1), username: letter.toLowerCase(),
    cleanDisplayName: 'User ' + letter, formattedName: 'SYNC-000' + (index + 1) + ' - User ' + letter,
    salt: 's', passwordHash: 'h'
  }));
  db = isolatedDb(root, tempDir, users);
});

after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

test('el resumen cuenta mensajes sin leer del destinatario', () => {
  db.saveTextMessage('SYNC-0001', 'SYNC-0002', 'hola');
  db.saveTextMessage('SYNC-0001', 'SYNC-0002', 'segundo');
  const summary = db.getWidgetSummary('SYNC-0002', 0);
  assert.equal(summary.unreadMessages, 2);
  assert.equal(summary.latest[0].fromName, 'SYNC-0001 - User A');
  assert.equal(db.getWidgetSummary('SYNC-0001', 0).unreadMessages, 0);
  db.markMessagesAsRead('SYNC-0001', 'SYNC-0002');
  assert.equal(db.getWidgetSummary('SYNC-0002', 0).unreadMessages, 0);
});

test('solo las llamadas no contestadas cuentan como perdidas', () => {
  db.recordCall('SYNC-0001', 'SYNC-0002', true);
  db.recordCall('SYNC-0001', 'SYNC-0002', false);
  assert.equal(db.resolveCall('SYNC-0001', 'SYNC-0002', 'answered'), true);
  db.recordCall('SYNC-0001', 'SYNC-0002', false);
  assert.equal(db.resolveCall('SYNC-0001', 'SYNC-0002', 'missed'), true);
  assert.equal(db.resolveCall('SYNC-0001', 'SYNC-0002', 'missed'), false);
  assert.equal(db.getWidgetSummary('SYNC-0002', 0).missedCalls, 2);
  assert.equal(db.getWidgetSummary('SYNC-0002', Date.now() + 1000).missedCalls, 0);
  assert.equal(db.getWidgetSummary('SYNC-0001', 0).missedCalls, 0);
});
