'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO_ROOT = path.resolve(__dirname, '..');

function isInsideRepo(target) {
  const relative = path.relative(REPO_ROOT, target);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function generateLicenseKeys(outputDirectory = path.join(os.homedir(), '.sync-engine-license-keys')) {
  const outputDir = path.resolve(outputDirectory);
  if (isInsideRepo(outputDir)) {
    throw new Error('Por seguridad, las claves deben generarse fuera del repositorio');
  }

  fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const privatePath = path.join(outputDir, 'license-private.pem');
  const publicPath = path.join(outputDir, 'license-public.pem');
  if (fs.existsSync(privatePath) || fs.existsSync(publicPath)) {
    throw new Error('Ya existen archivos de claves en el destino; no se sobrescribirán');
  }

  const pair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicExponent: 0x10001,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  try {
    fs.writeFileSync(privatePath, pair.privateKey, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.writeFileSync(publicPath, pair.publicKey, { encoding: 'utf8', mode: 0o644, flag: 'wx' });
  } catch (error) {
    try { if (fs.existsSync(privatePath)) fs.unlinkSync(privatePath); } catch (_) {}
    try { if (fs.existsSync(publicPath)) fs.unlinkSync(publicPath); } catch (_) {}
    throw error;
  }

  return { privatePath, publicPath, publicKey: pair.publicKey };
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    let outputDirectory = path.join(os.homedir(), '.sync-engine-license-keys');
    if (args.length === 2 && args[0] === '--out-dir') outputDirectory = args[1];
    else if (args.length !== 0) throw new Error('Uso: node scripts/generate-license-keys.js [--out-dir <directorio-fuera-del-repo>]');

    const result = generateLicenseKeys(outputDirectory);
    process.stdout.write('Clave privada: ' + result.privatePath + '\n');
    process.stdout.write('Clave pública: ' + result.publicPath + '\n');
    process.stdout.write('\nLICENSE_PUBLIC_KEY (configurar en Render):\n' + result.publicKey);
    process.stderr.write('\nIMPORTANTE: conserva la clave privada fuera del repositorio y con acceso restringido. No la compartas ni la subas a Render.\n');
  } catch (error) {
    process.stderr.write('[license-keys] ' + error.message + '\n');
    process.exitCode = 1;
  }
}

module.exports = { generateLicenseKeys, isInsideRepo };
