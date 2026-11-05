const crypto = require('crypto');
const fs = require('fs');

console.log('[CRIPTOGRAFÍA] Generando par de llaves RSA de 2048 bits para Barrantes Co...');

crypto.generateKeyPair('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
}, (err, publicKey, privateKey) => {
    if (err) {
        console.error('Error al generar las llaves:', err);
        return;
    }
    
    // Guardar los archivos de manera local y segura
    fs.writeFileSync('barrantes_private.pem', privateKey);
    fs.writeFileSync('barrantes_public.pem', publicKey);
    
    console.log('==================================================');
    console.log('¡LLAVES RSA GENERADAS CON ÉXITO!');
    console.log('1. barrantes_private.pem -> GUARDAR EN SECRETO (Úsala para firmar licencias).');
    console.log('2. barrantes_public.pem  -> CLAVE PÚBLICA (Va dentro de server.js).');
    console.log('==================================================');
});
