// Makes the game installable as an app (it then opens full screen and sideways, no tap needed).
// Samsung Internet only installs a site whose service worker really answers requests, so this
// one passes the game's own requests through to the network. It caches nothing: every load is the
// latest version. (Other sites' files, e.g. the 3D library, go straight to the network.)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req));
});
