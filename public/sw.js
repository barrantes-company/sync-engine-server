const CACHE_NAME = 'sync-engine-v2';
const CACHE_PREFIX = 'sync-engine-';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/widget.html',
  '/widget.css',
  '/widget.js',
  '/manifest.json',
  '/assets/logo.png'
];
const OFFLINE_DB_NAME = 'sync-engine-offline';
const OFFLINE_STORE_NAME = 'transmissions';
const OFFLINE_SYNC_TAG = 'sync-engine-transmissions';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/socket.io/') ||
    url.pathname.startsWith('/api/') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

function notificationOptions(payload) {
  const data = payload.data || {};
  const isCall = data.type === 'call';
  const groupingId = data.fromSyncId || data.syncId || 'inbox';
  const actions = isCall
    ? [
        { action: 'open', title: 'Atender' },
        { action: 'dismiss', title: 'Ignorar' }
      ]
    : [
        { action: 'open', title: 'Abrir chat' },
        { action: 'reply', title: 'Responder', type: 'text', placeholder: 'Escribe una respuesta' }
      ];

  return {
    body: payload.body,
    icon: payload.icon || '/assets/logo.png',
    badge: payload.badge || '/assets/logo.png',
    image: payload.image,
    tag: payload.tag || `sync-${isCall ? 'call' : 'msg'}-${groupingId}`,
    renotify: true,
    data,
    vibrate: isCall ? [300, 100, 300, 100, 300, 100, 500] : [100, 50, 100],
    actions
  };
}

self.addEventListener('push', (event) => {
  const payload = {
    title: 'SYNC ENGINE | Barrantes Co.',
    body: 'Nuevo mensaje recibido',
    icon: '/assets/logo.png',
    badge: '/assets/logo.png',
    data: {}
  };

  if (event.data) {
    try {
      Object.assign(payload, event.data.json());
    } catch (error) {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, notificationOptions(payload))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const notificationData = event.notification.data || {};
  let targetUrl;
  try {
    targetUrl = new URL(notificationData.url || '/', self.location.origin);
  } catch (error) {
    targetUrl = new URL('/', self.location.origin);
  }
  if (targetUrl.origin !== self.location.origin) {
    targetUrl = new URL('/', self.location.origin);
  }

  const message = {
    type: 'NOTIFICATION_CLICKED',
    data: notificationData,
    action: event.action,
    reply: event.action === 'reply' ? String(event.reply || '').trim() : ''
  };

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const sameOriginClients = clients.filter((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch (error) {
          return false;
        }
      });
      const targetClient = sameOriginClients.find((client) => {
        return new URL(client.url).pathname === targetUrl.pathname;
      }) || sameOriginClients[0];

      if (targetClient) {
        targetClient.postMessage(message);
        return targetClient.focus();
      }
      return self.clients.openWindow(targetUrl.href);
    })
  );
});

function openOfflineDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(OFFLINE_STORE_NAME)) {
        request.result.createObjectStore(OFFLINE_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir la cola offline'));
  });
}

function storeOfflineTransmission(transmission) {
  return openOfflineDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(OFFLINE_STORE_NAME, 'readwrite');
    transaction.objectStore(OFFLINE_STORE_NAME).put(transmission);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('No se pudo guardar la transmisión offline'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error('Se canceló el guardado de la transmisión offline'));
    };
  }));
}

function getOfflineTransmissions() {
  return openOfflineDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(OFFLINE_STORE_NAME, 'readonly');
    const request = transaction.objectStore(OFFLINE_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('No se pudo leer la cola offline'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('No se pudo leer la cola offline'));
    };
  }));
}

function deleteOfflineTransmission(id) {
  return openOfflineDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(OFFLINE_STORE_NAME, 'readwrite');
    transaction.objectStore(OFFLINE_STORE_NAME).delete(id);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('No se pudo quitar la transmisión de la cola'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error('No se pudo quitar la transmisión de la cola'));
    };
  }));
}

function notifyClients(message) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => client.postMessage(message));
  });
}

async function retryOfflineTransmissions() {
  const transmissions = await getOfflineTransmissions();

  for (const transmission of transmissions) {
    let url;
    try {
      url = new URL(transmission.url, self.location.origin);
    } catch (error) {
      await deleteOfflineTransmission(transmission.id);
      await notifyClients({
        type: 'OFFLINE_TRANSMISSION_FAILED',
        id: transmission.id,
        error: 'La URL de la transmisión no es válida'
      });
      continue;
    }

    if (url.origin !== self.location.origin || transmission.method !== 'POST') {
      await deleteOfflineTransmission(transmission.id);
      await notifyClients({
        type: 'OFFLINE_TRANSMISSION_FAILED',
        id: transmission.id,
        error: 'Solo se permiten transmisiones POST al mismo origen'
      });
      continue;
    }

    let response;
    try {
      const headers = new Headers(transmission.headers || {});
      headers.set('Idempotency-Key', transmission.id);
      response = await fetch(url.href, {
        method: 'POST',
        headers,
        body: transmission.body,
        credentials: 'same-origin'
      });
    } catch (error) {
      throw error;
    }

    if (response.status >= 500) {
      throw new Error(`El servidor respondió HTTP ${response.status}`);
    }

    await deleteOfflineTransmission(transmission.id);
    await notifyClients({
      type: response.ok ? 'OFFLINE_TRANSMISSION_SENT' : 'OFFLINE_TRANSMISSION_FAILED',
      id: transmission.id,
      status: response.status
    });
  }
}

self.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || message.type !== 'QUEUE_OFFLINE_TRANSMISSION') return;

  const transmission = message.transmission || {};
  let url;
  try {
    url = new URL(transmission.url, self.location.origin);
  } catch (error) {
    event.ports[0]?.postMessage({ ok: false, error: 'La URL de la transmisión no es válida' });
    return;
  }

  if (url.origin !== self.location.origin || (transmission.method || 'POST').toUpperCase() !== 'POST') {
    event.ports[0]?.postMessage({ ok: false, error: 'Solo se permiten transmisiones POST al mismo origen' });
    return;
  }

  const queuedTransmission = {
    id: transmission.id || (self.crypto.randomUUID
      ? self.crypto.randomUUID()
      : `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    url: url.href,
    method: 'POST',
    headers: transmission.headers || {},
    body: transmission.body === undefined ? null : transmission.body,
    queuedAt: Date.now()
  };

  event.waitUntil(
    storeOfflineTransmission(queuedTransmission)
      .then(() => {
        if (self.registration.sync) {
          return self.registration.sync.register(OFFLINE_SYNC_TAG);
        }
        return retryOfflineTransmissions();
      })
      .then(() => event.ports[0]?.postMessage({ ok: true, id: queuedTransmission.id }))
      .catch((error) => {
        event.ports[0]?.postMessage({ ok: false, id: queuedTransmission.id, error: error.message });
        throw error;
      })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === OFFLINE_SYNC_TAG) {
    event.waitUntil(retryOfflineTransmissions());
  }
});
