const crypto = require('crypto');
const { dispatchLogToWorkspace } = require('../adapters/workspace-webhook');

async function loginHandler(req, res) {
  try {
    const { username, password, device_info } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        status: "error",
        message: "Usuario y contraseña son requeridos"
      });
    }

    const userId = "USR-" + crypto.randomBytes(3).toString('hex').toUpperCase();
    const token = crypto.randomBytes(32).toString('hex');

    const responsePayload = {
      status: "success",
      data: {
        user_id: userId,
        username: username,
        access_token: token,
        token_type: "Bearer",
        expires_in: 3600,
        device_info: device_info || {}
      }
    };

    dispatchLogToWorkspace({
      event_id: "AUTH-" + Date.now(),
      sender_id: userId,
      event_type: "USER_LOGIN",
      payload: { username, client_version: device_info?.version || "unknown" }
    }).catch(err => console.error("Error en despacho de log:", err));

    return res.status(200).json(responsePayload);
  } catch (error) {
    return res.status(500).json({ status: "error", message: error.message });
  }
}

module.exports = { loginHandler };
