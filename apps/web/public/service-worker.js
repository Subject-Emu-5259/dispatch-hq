// Dispatch HQ — Service Worker (offline fallback + push notifications)
// NOTE: bump CACHE_NAME on every release that changes static assets (logos,
// bundles). activate() deletes old caches, so a stale logo/favicon cached by
// an older SW version is purged the moment the new SW takes control.
const CACHE_NAME = 'dispatch-hq-v148';
const OFFLINE_URL = '/offline.html';
const PRECACHE_ASSETS = [
  '/', '/index.html', '/offline.html', '/manifest.json',
  '/logo.png', '/logo-512.png', '/icon-192.png', '/favicon.png', '/apple-touch-icon.png',
  // Self-hosted fonts (v0.23.2) — no Google Fonts dependency, so the whole
  // game is servable with zero third-party requests, online and offline.
  '/fonts/fonts.css',
  '/fonts/inter-400-latin.woff2', '/fonts/inter-400-latin-ext.woff2',
  '/fonts/inter-500-latin.woff2', '/fonts/inter-500-latin-ext.woff2',
  '/fonts/inter-600-latin.woff2', '/fonts/inter-600-latin-ext.woff2',
  '/fonts/inter-700-latin.woff2', '/fonts/inter-700-latin-ext.woff2',
  '/fonts/inter-800-latin.woff2', '/fonts/inter-800-latin-ext.woff2',
  '/fonts/jetbrainsmono-400-latin.woff2', '/fonts/jetbrainsmono-400-latin-ext.woff2',
  '/fonts/jetbrainsmono-500-latin.woff2', '/fonts/jetbrainsmono-500-latin-ext.woff2',
];

// Desktop notifications for critical calls: the page posts {type:'notify',
// title, body} and the SW shows it (works even while the tab is hidden).
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'notify') return;
  event.waitUntil(
    self.registration.showNotification(String(data.title || 'Dispatch HQ'), {
      body: String(data.body || ''),
      icon: '/logo-512.png',
      badge: '/favicon.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    }),
  );
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        const stale = keys.filter((k) => k !== CACHE_NAME);
        // A real upgrade (an older cache existed) — tell every open window to
        // reload ONCE so the stale bundle self-heals without a hard refresh
        // (the v0.23.x black-map incident: a deploy's assets sat in an old
        // cache while the page kept serving them). The very first install has
        // no old cache and stays silent, so new players never get a spurious
        // reload.
        if (stale.length > 0) {
          self.clients.matchAll({ type: 'window' }).then((clients) => {
            clients.forEach((client) =>
              client.postMessage({ type: 'DHQ_UPDATE_READY', cache: CACHE_NAME }),
            );
          });
        }
        return Promise.all(stale.map((k) => caches.delete(k)));
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Navigation requests: serve offline fallback when network fails.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL)),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
