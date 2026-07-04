/**
 * Service worker de R4ce.
 * - Cachea el shell de la app para que abra rápido y funcione con cobertura irregular.
 * - NUNCA cachea /api (los tiempos y tramos siempre van a red).
 * - Muestra notificaciones cuando la página se lo pide (tramo cercano).
 */
const CACHE = 'r4ce-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API: siempre red, nunca caché
  if (url.pathname.startsWith('/api')) return;

  // Navegación: red primero, caché como fallback (offline)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
    );
    return;
  }

  // Estáticos: caché primero, red como fallback (y se guarda)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        if (resp.ok && url.origin === self.location.origin) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return resp;
      });
    })
  );
});

// Al tocar la notificación de "tramo cercano" → abrir el modo Live
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const stageId = event.notification.data?.stageId;
  const target = stageId ? `/live?stage=${stageId}` : '/live';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          client.navigate(target);
          return;
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
