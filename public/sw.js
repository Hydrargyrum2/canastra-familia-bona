// Service worker: aplikace se dá nainstalovat a hra proti robotům jde i bez internetu.
// Stránka se bere vždy nejdřív ze sítě (ať je hned nejnovější verze), uložená kopie jen když síť nejde.
// /api/* se nikdy neukládá.
const CACHE = 'canastra-bona-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png', '/icons/favicon-32.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // písma z Google Fonts: uložená kopie, na pozadí obnovit
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
        if (hit) e.waitUntil(net);
        return hit || net;
      })
    );
    return;
  }
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // stránka (i s ?t=KÓD apod.): síť, jinak uložená
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); } return r; })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // ikony a manifest: síť, jinak uložená
  e.respondWith(
    fetch(req)
      .then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; })
      .catch(() => caches.match(req))
  );
});
