const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../config/.env') });

const identityService = require('./controllers/identity.service');
const relayService = require('./services/relay.service');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'sync-engine-server-core' });
});

app.post('/api/v1/auth/login', identityService.loginHandler);
app.post('/api/v1/relay/event', relayService.relayEventHandler);

app.listen(PORT, () => {
  console.log(`[SYNC ENGINE] Servidor ejecutándose en http://localhost:${PORT}`);
});
