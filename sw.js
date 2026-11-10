'use strict';
// Service worker: guarda la app en el teléfono para que abra al instante y sin conexión.
//
// Qué NO toca: rates.json y DolarApi pasan directo a la red. Una tasa vieja servida
// desde caché sería peor que ninguna; si no hay conexión, app.js ya muestra la última
// tasa guardada y lo indica con el punto rojo.
//
// Al cambiar cualquier archivo de la app, sube VERSION para que los teléfonos que ya la
// tienen instalada descarguen la nueva.
const VERSION = 'v3';
const APP_CACHE = `bcv-app-${VERSION}`;
const CDN_CACHE = `bcv-cdn-${VERSION}`;

const APP_FILES = [
  './',
  'index.html',
  'styles.css',
  'boot.js',
  'i18n.js',
  'quotes.js',
  'app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-maskable.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

// Terceros de los que depende el diseño (Tailwind y las fuentes). Solo estos se guardan.
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  // Borra las cachés de versiones anteriores.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== CDN_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Archivos propios: primero la red (siempre la versión más nueva), la caché si no hay conexión.
  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/rates.json')) return;
    event.respondWith(networkFirst(request));
    return;
  }

  // Tailwind y fuentes: versiones fijas que no cambian, así que primero la caché.
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
  // Todo lo demás (DolarApi) va directo a la red, sin pasar por aquí.
});

async function networkFirst(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    // Sin conexión: el archivo guardado, o la página principal si es una navegación.
    return (await cache.match(request, { ignoreSearch: true }))
      || (request.mode === 'navigate' ? cache.match('./') : Response.error());
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CDN_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  // Las respuestas "opacas" (status 0) son las de <script>/<link> sin CORS; también sirven.
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
  return res;
}
