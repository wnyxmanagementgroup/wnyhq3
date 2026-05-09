const CACHE_NAME = 'wny-pwa-shell-v3';
const APP_SHELL = [
  './',
  './index.html',
  './app/',
  './app/index.html',
  './archive/',
  './archive/index.html',
  './offline.html',
  './manifest.webmanifest',
  './css/style.css?v=6',
  './css/pwa.css?v=2',
  './js/config.js?v=3',
  './js/utils.js?v=3',
  './js/firebaseService.js?v=3',
  './js/auth.js?v=4',
  './js/requests.js?v=4',
  './js/admin.js?v=5',
  './js/stats.js?v=3',
  './js/tokenSign.js?v=4',
  './js/main.js?v=6',
  './js/sarabun.js?v=3',
  './js/signature.js?v=3',
  './js/pwa.js?v=2',
  './assets/pwa/icon-192.png',
  './assets/pwa/icon-512.png',
  './assets/pwa/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isVersionedStaticAsset =
    url.pathname.includes('/js/') ||
    url.pathname.includes('/css/');

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match('./offline.html');
        })
    );
    return;
  }

  if (isVersionedStaticAsset) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200) return response;
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./offline.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        void fetch(request)
          .then((response) => {
            if (!response || response.status !== 200) return response;
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => null);
        return cached;
      }
      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200) return response;
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match('./offline.html'));
    })
  );
});
