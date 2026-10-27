'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { TOKEN_VERSION, PRODUCT, stableStringify, verifyLicense, resolveUserEntitlements } = require('../license');

function fixture(overrides = {}) {
  const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const now = 2000000000;
  const claims = {
    schemaVersion: 1, licenseId: 'lic_test_001', product: PRODUCT, subject: 'SYNC-1234',
    plan: 'enterprise', issuedAt: now - 60, notBefore: now - 60, expiresAt: now + 3600,
    modules: ['private-messaging', 'team-channels'], ...overrides
  };
  const payload = Buffer.from(stableStringify(claims)).toString('base64url');
  const signature = crypto.sign('sha256', Buffer.from(TOKEN_VERSION + '.' + payload), {
    key: pair.privateKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32
  }).toString('base64url');
  return { token: TOKEN_VERSION + '.' + payload + '.' + signature, publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }), now, claims };
}

test('verifies an RSA-PSS signed license and resolves enterprise entitlements', () => {
  const f = fixture();
  const result = verifyLicense(f.token, { publicKey: f.publicKey, now: f.now });
  assert.equal(result.valid, true);
  const entitlements = resolveUserEntitlements({ syncId: 'SYNC-1234', licenseToken: f.token }, { publicKey: f.publicKey, now: f.now });
  assert.equal(entitlements.plan, 'enterprise');
  assert.equal(entitlements.features.teamChannels, true);
});

test('rejects payload tampering and invalid signatures', () => {
  const f = fixture();
  const parts = f.token.split('.');
  const altered = Buffer.from(stableStringify({ ...f.claims, plan: 'pro' })).toString('base64url');
  assert.equal(verifyLicense(parts[0] + '.' + altered + '.' + parts[2], { publicKey: f.publicKey, now: f.now }).valid, false);
});

test('rejects expired, not-yet-valid and mismatched-subject licenses', () => {
  const expired = fixture({ expiresAt: 1999999999 });
  assert.equal(verifyLicense(expired.token, { publicKey: expired.publicKey, now: expired.now }).reason, 'expired');
  const future = fixture({ notBefore: 2000000100 });
  assert.equal(verifyLicense(future.token, { publicKey: future.publicKey, now: future.now }).reason, 'not-yet-valid');
  const valid = fixture();
  assert.equal(resolveUserEntitlements({ syncId: 'SYNC-9999', licenseToken: valid.token }, { publicKey: valid.publicKey, now: valid.now }).plan, 'free');
});

test('rejects unsupported plans and malformed claims even when signed', () => {
  const badPlan = fixture({ plan: 'root' });
  assert.equal(verifyLicense(badPlan.token, { publicKey: badPlan.publicKey, now: badPlan.now }).reason, 'invalid-plan');
  const badModules = fixture({ modules: ['admin-all'] });
  assert.equal(verifyLicense(badModules.token, { publicKey: badModules.publicKey, now: badModules.now }).reason, 'invalid-modules');
});

test('legacy users without a signed token remain on free', () => {
  assert.equal(resolveUserEntitlements({ syncId: 'SYNC-1234' }, { publicKey: '' }).plan, 'free');
});
