const WebSocket = require('ws');
const { io } = require('socket.io-client');

console.log('🚀 Inicializando adaptador nativo SYNC ENGINE HUB...');

const socketConnection = io('http://127.0.0.1:3000');
const wss = new WebSocket.Server({ port: 8123 });

wss.on('connection', (ws) => {
  console.log('[Adapter] Cliente móvil en emulador conectado con éxito vía WS Puro.');
  
  ws.on('message', (message) => {
    try {
      const payload = JSON.parse(message);
      console.log('[Móvil → Servidor]:', payload);
    } catch (e) {
      console.log('[Móvil RAW]:', message.toString());
    }
  });

  ws.on('close', () => console.log('[Adapter] Conexión con el móvil cerrada de forma segura.'));
});

socketConnection.on('pubsub-chat-event', (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
      console.log('[Pub/Sub → WS Móvil] Evento propagado al stream del HUB:', data.type || 'sync');
    }
  });
});

console.log('[OK] Servidor WebSocket activo escuchando de forma estricta en el puerto :8123');
