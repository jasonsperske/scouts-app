/* Scout's service worker.

   Everything the app needs to run is precached, so a saved place list, the whole
   ephemeris and the unit machinery keep working with no connection at all — the
   distance to Mars is arithmetic, not a lookup. Only two things genuinely need
   the network: searching for new places, and reverse-geocoding a saved spot.
   Those are left on the network deliberately: a stale geocode is worse than an
   honest failure. */

const VERSION = 'scout-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const FONT_CACHE = `${VERSION}-fonts`;

/* Kept in step with the repository by the `check` job in the deploy workflow. */
const PRECACHE = [
  './',
  './index.html',
  './site.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/drag.js',
  './js/geo.js',
  './js/units.js',
  './js/astro/catalog.js',
  './js/astro/frames.js',
  './js/astro/index.js',
  './js/astro/moon.js',
  './js/astro/planets.js',
  './js/astro/rotation.js',
  './js/astro/time.js',
  './js/astro/vec.js',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

/* Must match the stylesheet link in index.html exactly, or the cached copy is
   never found. The `check` job in the deploy workflow enforces that. */
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(PRECACHE);
    // Without the icon font every button reads "drag_indicator". Requests the
    // page made before this worker existed were never seen by it, so fetch the
    // font files here rather than hoping for a second visit.
    await warmFontCache().catch(() => {});
  })());
});

/** Fetch the font stylesheet, then the woff2 files it points at. */
async function warmFontCache() {
  const cache = await caches.open(FONT_CACHE);
  const stylesheet = await fetch(FONT_CSS);
  if (!stylesheet.ok) return;

  const css = await stylesheet.clone().text();
  await cache.put(FONT_CSS, stylesheet);

  const urls = new Set(
    [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map(match => match[1])
  );
  await Promise.all([...urls].map(async url => {
    try {
      const font = await fetch(url);
      if (font.ok) await cache.put(url, font);
    } catch {
      /* One missing weight is not worth failing the install over. */
    }
  }));
}

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter(name => !name.startsWith(VERSION)).map(name => caches.delete(name))
    );
    // Control pages that loaded before this worker existed, so the first visit
    // is already offline-capable without a reload.
    await self.clients.claim();
  })());
});

/* A waiting worker will not activate while a tab is still controlled by the old
   one, and reloading does not release that control. So the page offers a Reload
   action, and this is how it asks to be replaced. */
self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }
  if (FONT_HOSTS.has(url.hostname)) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }
  // Nominatim and anything else: straight to the network, uncached.
});

/** For the page itself: fresh when possible, cached when not. */
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put('./index.html', response.clone());
    return response;
  } catch {
    return (await cache.match(request))
      || (await cache.match('./index.html'))
      || Response.error();
  }
}

/** For assets: serve from cache, then refresh it in the background. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request).then(response => {
    if (response.ok && response.type !== 'opaque') cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  if (cached) return cached;
  const response = await network;
  return response || Response.error();
}
