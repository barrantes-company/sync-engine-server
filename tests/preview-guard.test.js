'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { isBlockedPreviewHost, isBlockedPreviewAddress } = require('../server');

test('link previews reject local, metadata and disguised addresses', () => {
  for (const host of ['127.0.0.1', '10.1.2.3', '192.168.1.8', '169.254.169.254', '172.16.0.4',
    '0.0.0.0', '2130706433', 'localhost', 'metadata.google.internal', '::1', '[::1]', 'fe80::1', 'fd00::1']) {
    assert.equal(isBlockedPreviewHost(host), true, host);
  }
  assert.equal(isBlockedPreviewAddress('8.8.8.8'), false);
  assert.equal(isBlockedPreviewAddress('224.0.0.1'), true);
  assert.equal(isBlockedPreviewHost('example.com'), false);
});
