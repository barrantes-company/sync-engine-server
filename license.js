'use strict';

const crypto = require('node:crypto');

const TOKEN_VERSION = 'v1';
const PRODUCT = 'sync-engine';
const ALLOWED_PLANS = new Set(['free', 'pro', 'enterprise']);
const ALLOWED_MODULES = new Set(['private-messaging', 'voice-notes', 'file-sharing', 'encrypted-vault', 'team-channels', 'compliance-export', 'hd-calling']);

function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ':' + stableStringify(value[key])
    ).join(',') + '}';
  }
  return JSON.stringify(value);
}

function decodeBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    return Buffer.from(value, 'base64url');
  } catch (_) {
    return null;
  }
}

function verifyLicense(token, options = {}) {
  const publicKey = options.publicKey === undefined ? process.env.LICENSE_PUBLIC_KEY : options.publicKey;
  const now = options.now === undefined ? Math.floor(Date.now() / 1000) : options.now;
  if (typeof token !== 'string' || token.length > 16384 || typeof publicKey !== 'string' || !publicKey.trim()) {
    return { valid: false, reason: 'missing-token-or-public-key' };
  }

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return { valid: false, reason: 'invalid-token-format' };
  const payloadBytes = decodeBase64Url(parts[1]);
  const signature = decodeBase64Url(parts[2]);
  if (!payloadBytes || !signature) return { valid: false, reason: 'invalid-token-encoding' };

  let claims;
  try {
    const payloadText = payloadBytes.toString('utf8');
    claims = JSON.parse(payloadText);
    if (stableStringify(claims) !== payloadText) return { valid: false, reason: 'non-canonical-payload' };
  } catch (_) {
    return { valid: false, reason: 'invalid-payload' };
  }

  let signatureValid = false;
  try {
    signatureValid = crypto.verify(
      'sha256',
      Buffer.from(TOKEN_VERSION + '.' + parts[1], 'utf8'),
      { key: publicKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
      signature
    );
  } catch (_) {
    return { valid: false, reason: 'invalid-public-key-or-signature' };
  }
  if (!signatureValid) return { valid: false, reason: 'invalid-signature' };

  if (!claims || claims.schemaVersion !== 1 || claims.product !== PRODUCT) return { valid: false, reason: 'unsupported-license' };
  if (typeof claims.licenseId !== 'string' || !claims.licenseId.trim() || typeof claims.subject !== 'string' || !/^SYNC-[0-9]{4,8}$/i.test(claims.subject)) {
    return { valid: false, reason: 'invalid-subject-or-license-id' };
  }
  if (!ALLOWED_PLANS.has(claims.plan)) return { valid: false, reason: 'invalid-plan' };
  if (!Number.isSafeInteger(claims.issuedAt) || !Number.isSafeInteger(claims.expiresAt) ||
      (claims.notBefore !== undefined && !Number.isSafeInteger(claims.notBefore)) ||
      claims.expiresAt <= claims.issuedAt) return { valid: false, reason: 'invalid-validity-period' };
  if (claims.issuedAt > now + 300) return { valid: false, reason: 'issued-in-future' };
  if (claims.notBefore !== undefined && claims.notBefore > now) return { valid: false, reason: 'not-yet-valid' };
  if (claims.expiresAt <= now) return { valid: false, reason: 'expired' };
  if (claims.modules !== undefined && (!Array.isArray(claims.modules) ||
      claims.modules.some((item) => typeof item !== 'string' || !ALLOWED_MODULES.has(item)))) {
    return { valid: false, reason: 'invalid-modules' };
  }
  return { valid: true, claims };
}

function featuresForPlan(plan) {
  const paid = plan === 'pro' || plan === 'enterprise';
  return {
    maxUploadBytes: paid ? 2147483648 : 52428800,
    maxVoiceSeconds: paid ? 600 : 60,
    encryptedVault: paid,
    teamChannels: paid,
    exportAudit: true,
    hdCalling: paid
  };
}

function resolveUserEntitlements(user, options = {}) {
  const result = verifyLicense(user && user.licenseToken, options);
  if (!result.valid || String(result.claims.subject).toUpperCase() !== String(user && user.syncId || '').toUpperCase()) {
    return { plan: 'free', planExpiresAt: null, licenseStatus: result.valid ? 'subject-mismatch' : result.reason, features: featuresForPlan('free'), modules: [] };
  }
  const claims = result.claims;
  return {
    plan: claims.plan,
    planExpiresAt: new Date(claims.expiresAt * 1000).toISOString(),
    licenseStatus: 'valid',
    features: featuresForPlan(claims.plan),
    modules: Array.isArray(claims.modules) ? claims.modules.slice() : []
  };
}

module.exports = { TOKEN_VERSION, PRODUCT, ALLOWED_PLANS, ALLOWED_MODULES, stableStringify, verifyLicense, featuresForPlan, resolveUserEntitlements };
