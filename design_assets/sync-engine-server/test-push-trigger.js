require('dotenv').config();
const webpush = require('web-push');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:joseb@barrantes.co',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Generar una llave efímera P-256 válida para el preflight criptográfico local.
const crypto = require('crypto');
const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();

// Payload simulado de registro obtenido del navegador
const mockSubscription = {
  endpoint: 'https://googleapis.com',
  keys: {
    p256dh: ecdh.getPublicKey('base64url'),
    auth: crypto.randomBytes(16).toString('base64url')
  }
};

const payload = JSON.stringify({
  title: 'SYNC ENGINE — Alerta',
  body: 'Mensaje de prueba distribuido mediante Cloud Pub/Sub.',
  url: '/chat'
});

console.log('🚀 Validando notificación Push con curva elíptica P-256...');
try {
  const requestDetails = webpush.generateRequestDetails(mockSubscription, payload);
  if (!requestDetails.headers.Authorization || !requestDetails.body) {
    throw new Error('No se generaron la firma VAPID y el payload cifrado.');
  }
  console.log('[PASS] Validación P-256, cifrado del payload y firma VAPID completados.');
  console.log('[SKIP] No se envió la petición: googleapis.com no es un endpoint Push de suscripción.');
} catch (err) {
  console.error('[Push Error] Falló el preflight criptográfico local:', err.message);
  process.exitCode = 1;
}
