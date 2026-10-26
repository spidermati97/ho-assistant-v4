/* HO Assistant service worker: keeps the app shell available offline.
 * Tasks are not stored here — they live in the page's local storage on the phone. */
const VERSION = 'ho-shell-fbf768cee7';
const FONT_CACHE = 'ho-fonts-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './favicon.png', './apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ho-shell-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // AI calls and anything else go straight to the network
  const url = new URL(req.url);

  // Page loads: serve the cached app instantly (works offline); fall back to network.
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      caches.match('./index.html', { cacheName: VERSION })
        .then((hit) => hit || fetch(req))
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // App files: cache first.
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
    return;
  }

  // Google Fonts: cache after first online load so typography also works offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) =>
        cache.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }))
      ).catch(() => new Response('', { status: 503 }))
    );
  }
});

// Tapping a reminder notification opens (or focuses) the app on that task.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const taskId = event.notification.data && event.notification.data.taskId;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        await c.focus();
        if (taskId) c.postMessage({ type: 'open-task', taskId });
        return;
      }
    }
    await self.clients.openWindow(taskId ? `./?task=${encodeURIComponent(taskId)}` : './');
  })());
});
