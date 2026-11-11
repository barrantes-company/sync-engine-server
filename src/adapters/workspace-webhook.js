const https = require('https');
const { URL } = require('url');

async function dispatchLogToWorkspace(payload) {
  const webhookUrl = process.env.WORKSPACE_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('[Adapter Error] WORKSPACE_WEBHOOK_URL no configurado en .env');
    return false;
  }

  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(webhookUrl);
      const postData = JSON.stringify({
        ...payload,
        timestamp: payload.timestamp || new Date().toISOString()
      });

      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 400) {
            resolve(true);
          } else {
            console.warn(`[Adapter Warning] Webhook HTTP ${res.statusCode}: ${responseBody}`);
            resolve(false);
          }
        });
      });

      req.on('error', (err) => {
        console.error('[Adapter Error] Fallo en petición:', err.message);
        resolve(false);
      });

      req.write(postData);
      req.end();
    } catch (err) {
      console.error('[Adapter Error] Excepción en webhook:', err.message);
      resolve(false);
    }
  });
}

module.exports = { dispatchLogToWorkspace };
