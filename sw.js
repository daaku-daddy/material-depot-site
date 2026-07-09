const CACHE = 'md-v2';
const OFFLINE = ['/Site_Auditor_App.html', '/Site_Installer_App.html', '/md_icon.svg', '/pwa-install.js', '/manifest_auditor.json', '/manifest_installer.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network-first: try network, fall back to cache
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Only cache same-origin HTML/SW-related assets; pass through API calls
  if (url.hostname !== self.location.hostname) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
