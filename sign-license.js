const crypto = require('crypto');
const fs = require('fs');

const configuration = {
    licenseId: "LIC-2026-SYNC-001",
    clientName: "Cliente Corporativo Ejemplo S.A.",
    issuedDate: "2026-10-27",
    expirationDate: "2027-10-27",
    maxDevices: 50,
    allowedFeatures: {
        enterpriseChat: true,
        e2eEncryption: true,
        auditLogs: true,
        customStorage: true
    }
};

try {
    const privateKey = fs.readFileSync('barrantes_private.pem', 'utf8');

    const signer = crypto.createSign('SHA256');
    signer.update(JSON.stringify(configuration));
    signer.end();
    const signature = signer.sign(privateKey, 'base64');

    const finalLicense = {
        configuration: configuration,
        signature: signature
    };

    fs.writeFileSync('license.json', JSON.stringify(finalLicense, null, 2));
    console.log('==================================================');
    console.log('¡ARCHIVO license.json FIRMADO DIGITALMENTE CON ÉXITO!');
    console.log('==================================================');
} catch (error) {
    console.error('Error critico al firmar la licencia:', error.message);
}
