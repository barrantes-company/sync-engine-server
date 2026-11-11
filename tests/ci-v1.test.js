const assert = require('assert');

try {
  const identity = require('../src/controllers/identity.service');
  const relay = require('../src/services/relay.service');
  const adapter = require('../src/adapters/workspace-webhook');

  assert.strictEqual(typeof identity.loginHandler, 'function', 'loginHandler debe ser una funcion');
  assert.strictEqual(typeof relay.relayEventHandler, 'function', 'relayEventHandler debe ser una funcion');
  assert.strictEqual(typeof adapter.dispatchLogToWorkspace, 'function', 'dispatchLogToWorkspace debe ser una funcion');

  console.log('[CI TEST PASSED] Modulos Hub-and-Spoke v1 verificados correctamente.');
  process.exit(0);
} catch (err) {
  console.error('[CI TEST FAILED]', err.message);
  process.exit(1);
}
