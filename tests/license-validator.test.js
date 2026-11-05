const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const LicenseValidator = require('../license-validator');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

function signedLicense(overrides = {}) {
  const configuration = {
    licenseId: 'TEST-001',
    clientName: 'Cliente de prueba',
    issuedDate: '2026-01-01',
    expirationDate: '2099-01-01',
    maxDevices: 5,
    allowedFeatures: { enterpriseChat: true },
    ...overrides
  };
  const signer = crypto.createSign('SHA256');
  signer.update(JSON.stringify(configuration));
  signer.end();
  return { configuration, signature: signer.sign(privateKey, 'base64') };
}

test('valida una licencia firmada y devuelve sus capacidades', () => {
  const result = new LicenseValidator(publicKey).validate(signedLicense());

  assert.equal(result.valid, true);
  assert.equal(result.client, 'Cliente de prueba');
  assert.equal(result.maxDevices, 5);
  assert.deepEqual(result.features, { enterpriseChat: true });
});

test('rechaza una licencia alterada después de firmarse', () => {
  const license = signedLicense();
  license.configuration.maxDevices = 50;

  const result = new LicenseValidator(publicKey).validate(license);

  assert.equal(result.valid, false);
  assert.match(result.error, /Firma digital inválida/);
});

test('rechaza fechas inválidas o expiradas', () => {
  const validator = new LicenseValidator(publicKey);

  assert.match(validator.validate(signedLicense({ expirationDate: 'fecha-inválida' })).error,
    /fecha de expiración válida/);
  assert.match(validator.validate(signedLicense({ expirationDate: '2020-01-01' })).error,
    /expiró/);
});

test('rechaza límites y capacidades mal formados', () => {
  const validator = new LicenseValidator(publicKey);

  assert.match(validator.validate(signedLicense({ maxDevices: 0 })).error,
    /límite de dispositivos válido/);
  assert.match(validator.validate(signedLicense({ allowedFeatures: null })).error,
    /funciones autorizadas válidas/);
});
