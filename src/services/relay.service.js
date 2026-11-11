const { dispatchLogToWorkspace } = require('../adapters/workspace-webhook');

async function relayEventHandler(req, res) {
  try {
    const { event_id, channel_id, sender_id, event_type, payload } = req.body;

    if (!event_id || !sender_id || !event_type) {
      return res.status(400).json({
        status: "error",
        message: "Faltan parámetros obligatorios"
      });
    }

    const eventRecord = {
      event_id: event_id,
      channel_id: channel_id || "default_channel",
      sender_id: sender_id,
      event_type: event_type,
      payload: payload || {},
      timestamp: new Date().toISOString()
    };

    const logged = await dispatchLogToWorkspace(eventRecord);

    return res.status(200).json({
      status: "acknowledged",
      event_id: event_id,
      relayed_at: eventRecord.timestamp,
      ssot_synced: logged
    });
  } catch (error) {
    return res.status(500).json({ status: "error", message: error.message });
  }
}

module.exports = { relayEventHandler };
