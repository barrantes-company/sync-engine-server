const CACHE_NAME = 'sync-engine-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // No interceptar peticiones de Socket.io, API ni transferencias en base64
  if (
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
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// Manejo de Notificaciones Web Push y Espejo en Segundo Plano
self.addEventListener('push', (event) => {
  let payload = {
    title: 'SYNC ENGINE | Barrantes Co.',
    body: 'Nuevo mensaje recibido',
    icon: '/assets/logo.png',
    badge: '/assets/logo.png',
    tag: 'sync-msg-' + Date.now(),
    data: {}
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = Object.assign(payload, parsed);
    } catch (_) {
      try {
        payload.body = event.data.text();
      } catch (__) {}
    }
  }

  const isCall = payload.data && payload.data.type === 'call';

  const options = {
    body: payload.body,
    icon: payload.icon || '/assets/logo.png',
    badge: payload.badge || '/assets/logo.png',
    tag: payload.tag || (isCall ? `sync-call-${payload.data?.fromSyncId || Date.now()}` : `sync-msg-${payload.data?.fromSyncId || Date.now()}`),
    renotify: true,
    data: payload.data || {},
    vibrate: isCall ? [300, 100, 300, 100, 300, 100, 500] : [100, 50, 100],
    actions: isCall
      ? [
          { action: 'open', title: '📞 Atender' },
          { action: 'dismiss', title: '✕ Ignorar' }
        ]
      : [
          { action: 'open', title: '💬 Abrir Chat' },
          { action: 'dismiss', title: '✕ Descartar' }
        ]
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const targetUrl = notifData.url || '/';

  if (event.action === 'dismiss') {
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            data: notifData,
            action: event.action
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
