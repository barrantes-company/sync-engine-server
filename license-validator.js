const crypto = require('crypto');

class LicenseValidator {
    constructor(publicKeyPem) {
        this.publicKey = publicKeyPem;
    }

    validate(licenseData) {
        try {
            const { configuration, signature } = licenseData;
            if (!configuration || !signature) {
                return { valid: false, error: 'Estructura de licencia inválida: Faltan campos.' };
            }

            if (typeof configuration.expirationDate !== 'string' || !configuration.expirationDate.trim()) {
                return { valid: false, error: 'La licencia no tiene una fecha de expiración válida.' };
            }

            const verifier = crypto.createVerify('SHA256');
            verifier.update(JSON.stringify(configuration));
            verifier.end();

            const isVerified = verifier.verify(this.publicKey, signature, 'base64');
            if (!isVerified) {
                return { valid: false, error: 'Firma digital inválida. La licencia fue alterada.' };
            }

            const expirationDate = new Date(configuration.expirationDate);
            if (Number.isNaN(expirationDate.getTime())) {
                return { valid: false, error: 'La licencia no tiene una fecha de expiración válida.' };
            }
            if (new Date() > expirationDate) {
                return { valid: false, error: `La licencia comercial expiró el: ${configuration.expirationDate}` };
            }

            if (!Number.isInteger(configuration.maxDevices) || configuration.maxDevices < 1) {
                return { valid: false, error: 'La licencia no tiene un límite de dispositivos válido.' };
            }

            if (!configuration.allowedFeatures || typeof configuration.allowedFeatures !== 'object') {
                return { valid: false, error: 'La licencia no tiene funciones autorizadas válidas.' };
            }

            return {
                valid: true,
                client: configuration.clientName,
                features: configuration.allowedFeatures,
                maxDevices: configuration.maxDevices
            };
        } catch (error) {
            return { valid: false, error: `Error interno de validación: ${error.message}` };
        }
    }
}

module.exports = LicenseValidator;
