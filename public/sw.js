const CACHE = 'novyx-4-shell-v1';
const SHELL = ['./', './manifest.webmanifest', './novyx-icon.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('novyx-') && key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.url.includes('/api/') || request.mode !== 'navigate') return;
  event.respondWith(fetch(request).catch(() => caches.match('./')));
});
