const { PubSub } = require('@google-cloud/pubsub');

const gcpConfig = {
  projectId: process.env.PUBSUB_PROJECT_ID || 'sync-engine-hub',
  topicName: process.env.PUBSUB_TOPIC || 'chat-events-topic',
  subscriptionName: process.env.PUBSUB_SUBSCRIPTION || 'chat-events-sub'
};

if (process.env.APP_ENV === 'staging' &&
    (!process.env.PUBSUB_PROJECT_ID || !process.env.PUBSUB_TOPIC || !process.env.PUBSUB_SUBSCRIPTION ||
     gcpConfig.projectId === 'sync-engine-hub' || gcpConfig.topicName === 'chat-events-topic' ||
     gcpConfig.subscriptionName === 'chat-events-sub')) {
  throw new Error('Staging requires dedicated Pub/Sub project, topic and subscription');
}

const pubsub = new PubSub({ projectId: gcpConfig.projectId });

/**
 * Publica un evento cifrado o payload de chat en el tópico global.
 * @param {object} messageData - Payload serializable a JSON del evento de chat.
 * @returns {Promise<string>} ID del mensaje publicado en Pub/Sub.
 */
async function publishChatMessage(messageData) {
  try {
    const dataBuffer = Buffer.from(JSON.stringify(messageData));
    const messageId = await pubsub.topic(gcpConfig.topicName).publishMessage({ data: dataBuffer });
    console.log(`[Pub/Sub] Mensaje publicado con éxito. ID: ${messageId}`);
    return messageId;
  } catch (error) {
    console.error(`[Pub/Sub Error] Error al publicar en ${gcpConfig.topicName}:`, error.message);
    throw error;
  }
}

// Códigos gRPC que indican errores de red o infraestructura transitoria (recuperables).
// 13 = INTERNAL, 14 = UNAVAILABLE.
const GRPC_RETRIABLE_CODES = new Set([13, 14]);

// Identificadores de errores de credenciales/autenticación (no recuperables con reintento).
const CREDENTIAL_ERROR_PATTERNS = [
  'Could not load the default credentials',
  'UNAUTHENTICATED',
  'invalid_grant',
  'unauthorized'
];

/**
 * Determina si un error de Pub/Sub es transitorio y recuperable con reconexión.
 * @param {Error} error
 * @returns {boolean}
 */
function isRetriableError(error) {
  // Error gRPC con código numérico explícito
  if (error.code !== undefined && GRPC_RETRIABLE_CODES.has(Number(error.code))) {
    return true;
  }
  // Errores de handshake o pérdida de red sin código gRPC
  if (error.message) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('econnreset') ||
      msg.includes('enotfound') ||
      msg.includes('socket hang up') ||
      msg.includes('stream error') ||
      msg.includes('unavailable') ||
      msg.includes('internal')
    ) {
      // Asegurarse de que no sea un error de credenciales disfrazado
      const isCredentialError = CREDENTIAL_ERROR_PATTERNS.some((pattern) =>
        error.message.includes(pattern)
      );
      return !isCredentialError;
    }
  }
  return false;
}

/**
 * Inicializa la escucha activa de la suscripción vinculando un callback
 * para la propagación de payloads hacia los clientes conectados (Electron, web, móvil).
 * Implementa reconexión con Backoff Exponencial ante errores de red gRPC recuperables
 * (códigos 13 INTERNAL y 14 UNAVAILABLE), con limpieza de listeners para evitar
 * fugas de memoria entre intentos.
 * @param {function(object): void} onMessageCallback - Función invocada con el payload parseado.
 */
function startChatSubscriptionListener(onMessageCallback) {
  const BACKOFF_BASE_MS = 1000;   // 1 segundo inicial
  const BACKOFF_MAX_MS  = 30000;  // techo en 30 segundos
  let   backoffDelay    = BACKOFF_BASE_MS;
  let   retryTimer      = null;

  /**
   * Abre (o reabre) el stream de la suscripción.
   * Siempre limpia los listeners del objeto anterior antes de registrar los nuevos,
   * previniendo acumulación de handlers (memory leak) entre reintentos.
   */
  function openStream() {
    // Crear una nueva referencia al objeto Subscription en cada intento;
    // el SDK de @google-cloud/pubsub crea internamente un nuevo StreamingPull por instancia.
    const subscription = pubsub.subscription(gcpConfig.subscriptionName);

    try {
      // Limpieza defensiva: elimina cualquier listener residual de un intento anterior.
      subscription.removeAllListeners();

      console.log(`[Pub/Sub] Abriendo stream en: ${gcpConfig.subscriptionName} (backoff actual: ${backoffDelay}ms)...`);

      subscription.on('message', (message) => {
        try {
          const parsedData = JSON.parse(message.data.toString());
          onMessageCallback(parsedData);
          message.ack();
        } catch (parseError) {
          console.error('[Pub/Sub Error] Estructura de mensaje inválida:', parseError.message);
          message.nack();
        }
      });

      subscription.on('error', (error) => {
        console.error(`[Pub/Sub Stream Error] Código: ${error.code || 'N/A'} — ${error.message}`);

        // Limpiar listeners para evitar duplicados en el próximo intento.
        subscription.removeAllListeners();

        if (!isRetriableError(error)) {
          console.error('[Pub/Sub] Error no recuperable. Se abandona la reconexión automática.');
          return;
        }

        // Cancelar cualquier reintento previo pendiente para evitar reconexiones duplicadas.
        if (retryTimer) {
          clearTimeout(retryTimer);
        }

        console.warn(`[Pub/Sub] Error recuperable detectado. Reintentando en ${backoffDelay}ms...`);
        retryTimer = setTimeout(() => {
          retryTimer = null;
          // Incrementar el backoff antes del próximo intento (duplicar, con techo).
          backoffDelay = Math.min(backoffDelay * 2, BACKOFF_MAX_MS);
          openStream();
        }, backoffDelay);
      });

      // Stream abierto correctamente: resetear el backoff al baseline.
      subscription.on('message', () => {
        backoffDelay = BACKOFF_BASE_MS;
      });

    } catch (initError) {
      // Error síncrono durante la inicialización del stream (raro, pero defensivo).
      console.error('[Pub/Sub] Error al inicializar el stream de suscripción:', initError.message);

      if (isRetriableError(initError)) {
        if (retryTimer) clearTimeout(retryTimer);
        console.warn(`[Pub/Sub] Reintentando inicialización en ${backoffDelay}ms...`);
        retryTimer = setTimeout(() => {
          retryTimer = null;
          backoffDelay = Math.min(backoffDelay * 2, BACKOFF_MAX_MS);
          openStream();
        }, backoffDelay);
      } else {
        console.error('[Pub/Sub] Error fatal en inicialización. No se reintentará.');
      }
    }
  }

  // Arranque inicial del stream.
  openStream();
}

module.exports = {
  publishChatMessage,
  startChatSubscriptionListener
};
