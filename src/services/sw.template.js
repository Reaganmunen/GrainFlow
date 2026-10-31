/* GrainFlow service worker. Served by src/services/serviceWorker.js, which fills in the three values below.
 * It keeps the app itself (pages, scripts, styles, fonts, icons) on the computer so GrainFlow opens with no internet.
 * It never touches /api: money data always goes to the server, and the app's own offline queue (js/offline.js) handles the rest. */
'use strict';

const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;   // files served by this app
const EXTERNAL = __EXTERNAL__;   // fonts and icons from a CDN
const SHELL = `gf-shell-${VERSION}`;
const RUNTIME = 'gf-runtime-v1';
const WAIT_MS = 4000;            // a slow or half-dead connection falls back to the saved copy after this long

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await Promise.all([
      ...PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})),
      ...EXTERNAL.map((url) => fetch(url, { mode: 'no-cors' }).then((res) => cache.put(url, res)).catch(() => {})),
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('gf-shell-') && n !== SHELL).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

function fetchWithTimeout(request, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  return fetch(request, { cache: 'no-cache', signal: ctl.signal }).finally(() => clearTimeout(timer));
}

/** Online: always the fresh copy (and keep it). Offline or too slow: the saved copy. */
async function networkFirst(request, fallbackUrls) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetchWithTimeout(request, WAIT_MS);
    if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(request, { ignoreSearch: true }))
      || (await (async () => { for (const u of fallbackUrls) { const h = await cache.match(u); if (h) return h; } return null; })());
    if (hit) return hit;
    throw err;
  }
}

/** Fonts and icons from a CDN: serve the saved copy at once and refresh it in the background. */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const hit = (await cache.match(request)) || (await (await caches.open(SHELL)).match(request));
  const refresh = fetch(request).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()); return res; }).catch(() => null);
  return hit || (await refresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return;      // never cache or answer API calls here
    if (url.pathname === '/sw.js') return;
    if (req.mode === 'navigate') {
      const login = url.pathname === '/login.html';
      event.respondWith(networkFirst(req, login ? ['/login.html'] : ['/index.html']));
      return;
    }
    event.respondWith(networkFirst(req, []));
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});
