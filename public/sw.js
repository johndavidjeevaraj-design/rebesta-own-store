/* Rebesta Fresh — service worker (PWA)
   Strategy:
   - HTML navigations: network-first, cached home as offline fallback
   - Product images: stale-while-revalidate
   - Other static assets: stale-while-revalidate — served instantly from
     cache, then refreshed from the network in the background. Next.js can
     keep the same CSS filename across deploys when only its content
     changes, so assets must self-heal instead of being served frozen.
   - API calls: always live (stock and prices must be real-time)
*/
const CACHE = 'rebesta-shell-v38';
const SHELL = [
  '/',
  '/css/styles.css',
  '/js/store.js',
  '/manifest.json',
  '/assets/brand/logo.png',
  '/assets/brand/icon-192.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put('/', fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match('/')) || (await cache.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  /* everything else: stale-while-revalidate — instant offline-capable
     response, cache healed from network on every load */
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const network = fetch(request)
      .then(response => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
      .catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
