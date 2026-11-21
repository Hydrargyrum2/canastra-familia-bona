// Service worker: aplikace se dá nainstalovat a hra proti robotům jde i bez internetu.
// Stránka se bere vždy nejdřív ze sítě (ať je hned nejnovější verze), uložená kopie jen když síť nejde.
// /api/* se nikdy neukládá. Zobrazuje i upozornění (pozvánky, přátelé).
const CACHE = 'canastra-bona-v4';
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
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/music/')) return;
  // jiné hry na stejném webu (např. /bobri/) si řeší všechno samy
  if (url.pathname.startsWith('/bobri/') || url.pathname === '/bobri') return;

  // stránka (i s ?t=KÓD apod.): síť, jinak uložená
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => { if (r.ok && url.pathname === '/') { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); } return r; })
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

// ---------- upozornění ----------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Canastra família Bona', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.startsWith(self.location.origin) && 'focus' in c) {
        c.postMessage({ t: 'open', url });
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
