const CACHE_NAME='v10';
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(['./','./index.html']))); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.map(k=>{if(k!==CACHE_NAME)return caches.delete(k);})))); self.clients.claim(); });
self.addEventListener('fetch',e=>e.respondWith(fetch(e.request).catch(()=>caches.match(e.request))));

