'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { TOKEN_VERSION, PRODUCT, ALLOWED_PLANS, ALLOWED_MODULES, stableStringify } = require('../license');

function readArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--') || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new Error('Argumento inválido: ' + key);
    }
    args[key.slice(2)] = argv[++i];
  }
  return args;
}

function issueLicense(args) {
  if (!args['private-key'] || !args.subject || !args.plan || !args['expires-at']) {
    throw new Error('Uso: node scripts/create-license.js --private-key <ruta.pem> --subject SYNC-1234 --plan pro|enterprise --expires-at <ISO-8601> [--modules a,b]');
  }
  const subject = String(args.subject).trim().toUpperCase();
  if (!/^SYNC-[0-9]{4,8}$/.test(subject)) throw new Error('subject debe ser un SYNC-ID válido');
  if (!ALLOWED_PLANS.has(args.plan) || args.plan === 'free') throw new Error('plan debe ser pro o enterprise');
  const expiresAtMs = Date.parse(args['expires-at']);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) throw new Error('expires-at debe ser una fecha futura ISO-8601');
  const modules = args.modules ? args.modules.split(',').map((item) => item.trim()).filter(Boolean) : [];
  if (modules.some((item) => !ALLOWED_MODULES.has(item))) throw new Error('modules contiene un módulo no permitido');

  const privateKey = fs.readFileSync(args['private-key'], 'utf8');
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims = {
    schemaVersion: 1,
    licenseId: crypto.randomUUID(),
    product: PRODUCT,
    subject,
    plan: args.plan,
    issuedAt,
    notBefore: issuedAt,
    expiresAt: Math.floor(expiresAtMs / 1000),
    modules
  };
  const payload = Buffer.from(stableStringify(claims), 'utf8').toString('base64url');
  const signature = crypto.sign('sha256', Buffer.from(TOKEN_VERSION + '.' + payload), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: 32
  }).toString('base64url');
  return TOKEN_VERSION + '.' + payload + '.' + signature;
}

if (require.main === module) {
  try {
    process.stdout.write(issueLicense(readArgs(process.argv.slice(2))) + '\n');
  } catch (error) {
    process.stderr.write('[license] ' + error.message + '\n');
    process.exitCode = 1;
  }
}

module.exports = { issueLicense, readArgs };
