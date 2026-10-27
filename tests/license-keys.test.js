'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { generateLicenseKeys } = require('../scripts/generate-license-keys');

test('generates RSA-3072 keys outside the repository with restrictive private permissions', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-license-keys-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, 'keys');
  const result = generateLicenseKeys(output);
  const privateKey = crypto.createPrivateKey(fs.readFileSync(result.privatePath, 'utf8'));
  const publicKey = crypto.createPublicKey(fs.readFileSync(result.publicPath, 'utf8'));
  assert.equal(privateKey.asymmetricKeyType, 'rsa');
  assert.equal(privateKey.asymmetricKeyDetails.modulusLength, 3072);
  assert.equal(publicKey.asymmetricKeyType, 'rsa');
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(result.privatePath).mode & 0o777, 0o600);
  }
});

test('refuses to generate keys inside the repository or overwrite an existing pair', (t) => {
  assert.throws(() => generateLicenseKeys(path.resolve(__dirname, '..', '.test-license-keys')), /fuera del repositorio/);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-license-keys-existing-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  generateLicenseKeys(root);
  assert.throws(() => generateLicenseKeys(root), /no se sobrescribirán/);
});
