const CACHE_PREFIX = 'seclusaweather-';
const VERSION = 'v0.7.20';
const CACHE_NAME = CACHE_PREFIX + VERSION;
const ASSET_VER = '0.7.20';
const NETWORK_TIMEOUT_MS = 8000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('network timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function ownCache() {
  return caches.open(CACHE_NAME);
}

function ownMatch(request) {
  const key =
    typeof request === "string"
      ? new URL(request, self.location.href).href
      : request;
  return ownCache().then((cache) => cache.match(key));
}

const STATIC_ASSETS = [
  './',
  './index.html',
  './offline.html',
  `./seclusa-base.css?v=${ASSET_VER}`,
  `./css/style.css?v=${ASSET_VER}`,
  `./css/responsive.css?v=${ASSET_VER}`,
  `./js/config.js?v=${ASSET_VER}`,
  `./js/theme-boot.js?v=${ASSET_VER}`,
  `./js/store.js?v=${ASSET_VER}`,
  `./js/theme.js?v=${ASSET_VER}`,
  `./js/utils.js?v=${ASSET_VER}`,
  `./js/icons.js?v=${ASSET_VER}`,
  `./js/api.js?v=${ASSET_VER}`,
  `./js/ui.js?v=${ASSET_VER}`,
  `./js/ui-current.js?v=${ASSET_VER}`,
  `./js/ui-details.js?v=${ASSET_VER}`,
  `./js/ui-forecast.js?v=${ASSET_VER}`,
  `./js/ui-modal.js?v=${ASSET_VER}`,
  `./js/ui-chart.js?v=${ASSET_VER}`,
  `./js/app.js?v=${ASSET_VER}`,
  `./js/offline.js?v=${ASSET_VER}`,
  `./manifest.json?v=${ASSET_VER}`,
  './assets/icons/pwa-192.png',
  './assets/icons/pwa-512.png',
  './assets/icons/pwa-maskable-192.png',
  './assets/icons/pwa-maskable-512.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-192.png',
  './assets/icons/icon-maskable-512.png',
  './assets/fonts/dm-sans-latin-400-normal.woff2',
  './assets/fonts/dm-sans-latin-600-normal.woff2',
  './assets/fonts/dm-sans-latin-700-normal.woff2',
  './assets/fonts/sora-latin-600-normal.woff2',
  './assets/fonts/sora-latin-700-normal.woff2',
  './assets/fonts/sora-latin-800-normal.woff2'
];

const OPEN_METEO_ORIGINS = new Set([
  'https://api.open-meteo.com',
  'https://air-quality-api.open-meteo.com',
  'https://geocoding-api.open-meteo.com',
]);

function isOpenMeteoRequest(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && OPEN_METEO_ORIGINS.has(u.origin);
  } catch {
    return false;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled(STATIC_ASSETS.map((url) => cache.add(url)));
      const core = ['./index.html', `./js/app.js?v=${ASSET_VER}`, `./css/style.css?v=${ASSET_VER}`, `./seclusa-base.css?v=${ASSET_VER}`];
      const failedCore = results.some((r, i) => r.status === 'rejected' && core.includes(STATIC_ASSETS[i]));
      if (failedCore) throw new Error('core precache failed');
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          // Only drop this app's older caches. Bare delete-all wipes site/games/NoCal
          // Cache Storage on the shared origin.
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => {
      self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = request.url;

  // Never intercept Open-Meteo. Re-fetching inside the SW is subject to the
  // SW script's CSP and was synthesizing fake offline API responses on the
  // hosted site, which broke search and refresh.
  if (isOpenMeteoRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      withTimeout(fetch(request), NETWORK_TIMEOUT_MS)
        .then((response) => {
          if (response && response.status === 200) {
            try {
              const u = new URL(request.url);
              if (u.origin === self.location.origin && !u.search && !u.hash) {
                const clone = response.clone();
                event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {}));
              }
            } catch { /* ignore bad URLs */ }
          }
          return response;
        })
        .catch(() =>
          ownMatch(request)
            .then((cached) => cached || ownMatch('./offline.html'))
            .then((response) => response || Response.error())
            .catch(() => Response.error())
        )
    );
    return;
  }

  // Network-first for app shell assets so Refresh / new deploys are not stuck
  // on a stale cache-first hit. Offline falls back to the app's own cache only.
  event.respondWith(
    withTimeout(fetch(request), NETWORK_TIMEOUT_MS)
      .then((response) => {
        try {
          const u = new URL(request.url);
          const stampOnly = u.search === '' || /^\?v=[0-9][\d.]*$/.test(u.search);
          if (response && response.status === 200 && u.origin === self.location.origin && stampOnly) {
            const clone = response.clone();
            event.waitUntil(ownCache().then((cache) => cache.put(request, clone)).catch(() => {}));
          }
        } catch { /* ignore bad URLs */ }
        return response;
      })
      .catch(() => ownMatch(request).then((cached) => cached || Response.error()))
  );
});
