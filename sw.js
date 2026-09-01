const CACHE = 'butchers-v1';
const ALWAYS_FRESH = ['/', '/index.html'];

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isHtml = ALWAYS_FRESH.some(p => url.pathname === p || url.pathname.endsWith('/index.html'));

  if (isHtml) {
    // Always fetch HTML fresh from network, fall back to cache
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
  // All other assets use default browser caching
});
