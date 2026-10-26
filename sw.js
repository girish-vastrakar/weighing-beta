// Service worker for the weighing app.
// Change VERSION whenever you upload a new index.html so phones pick it up.
const VERSION = 'lab-v13';
const SHELL = ['./', './index.html', './bench.js', './lib/jsQR.js', './manifest.json',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => /^(beta|lab)-/.test(k) && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  // Never touch sheet traffic (Apps Script) or anything that isn't a GET
  // Only the app's own files and its fonts are cached. Never the stored data (api.github.com).
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (req.method !== 'GET' || (url.origin !== self.location.origin && !isFont)) return;

  // The page itself: newest version when online, saved copy when offline
  if (req.mode === 'navigate') {
    // each page keeps its own offline copy (the app and the dashboard never overwrite each other)
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req.url.split('#')[0].split('?')[0], copy)); }
      return res;
    }).catch(() => caches.match(req.url.split('#')[0].split('?')[0]).then(hit => hit || caches.match('./index.html'))));
    return;
  }

  // Icons, manifest, fonts: saved copy first, refresh in the background
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
