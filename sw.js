// Offline shell: try the network first so updates show up straight away,
// fall back to the last cached copy when offline. API calls are never cached.
const CACHE = 'pagelings-2.0.6';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    // no-cache: always check with the server, so GitHub's 10-minute HTTP cache can't serve stale code
    fetch(new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('./'))),
  );
});
