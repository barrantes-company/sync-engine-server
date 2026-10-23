"use strict";

if (process.env.APP_ENV === "staging" &&
    (!process.env.PUBSUB_PROJECT_ID || !process.env.PUBSUB_TOPIC || !process.env.PUBSUB_SUBSCRIPTION ||
     (process.env.PUBSUB_PROJECT_ID || "sync-engine-hub") === "sync-engine-hub" ||
     (process.env.PUBSUB_TOPIC || "chat-events-topic") === "chat-events-topic" ||
     (process.env.PUBSUB_SUBSCRIPTION || "chat-events-sub") === "chat-events-sub")) {
  throw new Error("Staging requires dedicated Pub/Sub project, topic and subscription");
}

const { PubSub } = require("@google-cloud/pubsub");

const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 60000;

const gcpConfig = {
  projectId: process.env.PUBSUB_PROJECT_ID || "sync-engine-hub",
  topicName: process.env.PUBSUB_TOPIC || "chat-events-topic",
  subscriptionName: process.env.PUBSUB_SUBSCRIPTION || "chat-events-sub"
};

let pubsubClient = null;

function getPubSubClient() {
  if (!pubsubClient) {
    pubsubClient = new PubSub({ projectId: gcpConfig.projectId });
  }
  return pubsubClient;
}

/**
 * Publica un mensaje en el topic de Pub/Sub
 */
async function publishChatMessage(messageData) {
  try {
    const client = getPubSubClient();
    const dataBuffer = Buffer.from(JSON.stringify(messageData));
    const messageId = await client.topic(gcpConfig.topicName).publishMessage({ data: dataBuffer });
    return messageId;
  } catch (error) {
    console.error("[Pub/Sub Error] Error al publicar mensaje en topic:", error.message);
    throw error;
  }
}

function isRetriableError(error) {
  if (!error) return false;
  const retriableCodes = [1, 4, 8, 10, 13, 14]; // CANCELLED, DEADLINE_EXCEEDED, RESOURCE_EXHAUSTED, ABORTED, INTERNAL, UNAVAILABLE
  return retriableCodes.includes(error.code) || /unavailable|deadline|timeout/i.test(error.message);
}

/**
 * Inicia el listener de suscripción con reconexión por backoff exponencial robusto.
 * CORRECCIÓN: Se elimina el listener duplicado que reseteaba prematuramente el backoff,
 * y se protegen las llamadas asíncronas a message.ack() / message.nack().
 */
function startChatSubscriptionListener(onMessageCallback) {
  const client = getPubSubClient();
  const subscription = client.subscription(gcpConfig.subscriptionName);
  let backoffDelay = BACKOFF_BASE_MS;
  let retryTimer = null;
  let isConnected = false;

  function cleanup() {
    subscription.removeAllListeners("message");
    subscription.removeAllListeners("error");
    subscription.removeAllListeners("close");
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function openStream() {
    cleanup();

    subscription.on("message", async (message) => {
      // Si la conexión está procesando mensajes sanamente, reestablecemos el backoff
      if (!isConnected) {
        isConnected = true;
        backoffDelay = BACKOFF_BASE_MS;
      }

      try {
        const parsedData = JSON.parse(message.data.toString("utf8"));
        await onMessageCallback(parsedData);
        try {
          message.ack();
        } catch (ackErr) {
          console.warn("[Pub/Sub] Warning al confirmar ack:", ackErr.message);
        }
      } catch (parseError) {
        console.error("[Pub/Sub Error] Error al procesar o parsear payload del mensaje:", parseError.message);
        try {
          message.nack();
        } catch (nackErr) {
          console.warn("[Pub/Sub] Warning al confirmar nack:", nackErr.message);
        }
      }
    });

    subscription.on("error", (error) => {
      isConnected = false;
      console.error("[Pub/Sub Stream Error]:", error.message);
      cleanup();

      if (!isRetriableError(error)) {
        console.warn("[Pub/Sub] Error no recuperable, esperando reintento diferido...");
      }

      retryTimer = setTimeout(() => {
        backoffDelay = Math.min(backoffDelay * 2, BACKOFF_MAX_MS);
        console.log(`[Pub/Sub] Reconectando stream en ${backoffDelay}ms...`);
        openStream();
      }, backoffDelay);
    });

    subscription.on("close", () => {
      isConnected = false;
      console.warn("[Pub/Sub Stream] Conexión cerrada. Reconectando...");
      if (!retryTimer) {
        retryTimer = setTimeout(openStream, BACKOFF_BASE_MS);
      }
    });
  }

  openStream();

  return {
    close: () => cleanup()
  };
}

module.exports = {
  publishChatMessage,
  startChatSubscriptionListener,
  getPubSubClient
};
