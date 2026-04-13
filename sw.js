const CACHE_NAME = 'fire-gym-v6';
const assets = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => {
    self.skipWaiting(); // إجبار السيرفس وركر على العمل فوراً
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(assets)));
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(ks => {
        return Promise.all(
            ks.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
        );
    }));
    self.clients.claim(); // السيطرة على الصفحة فوراً
});

self.addEventListener('fetch', e => {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
