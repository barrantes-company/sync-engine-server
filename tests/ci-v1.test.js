const assert = require('assert');
const http = require('http');

// Validación básica de carga de módulos v1
try {
  const identity = require('../src/controllers/identity.service');
  const relay = require('../src/services/relay.service');
  const adapter = require('../src/adapters/workspace-webhook');

  assert.strictEqual(typeof identity.loginHandler, 'function', 'loginHandler debe ser una función');
  assert.strictEqual(typeof relay.relayEventHandler, 'function', 'relayEventHandler debe ser una función');
  assert.strictEqual(typeof adapter.dispatchLogToWorkspace, 'function', 'dispatchLogToWorkspace debe ser una función');

  console.log('[CI TEST PASSED] Todos los módulos Hub-and-Spoke v1 cargaron correctamente.');
  process.exit(0);
} catch (err) {
  console.error('[CI TEST FAILED]', err.message);
  process.exit(1);
}
