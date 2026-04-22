const CACHE_NAME = 'v11-FIRE';
const ASSETS = [
    './',
    './index.html',
    './firegym_auth.js',
    './manifest.json'
];

// التثبيت: إجبار السيرفس وركر الجديد على البدء فوراً
self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
    );
});

// التنشيط: مسح كل الكاش القديم (تنظيف شامل)
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(ks => Promise.all(
            ks.map(k => {
                if (k !== CACHE_NAME) {
                    console.log('Cleaning old cache:', k);
                    return caches.delete(k);
                }
            })
        ))
    );
    self.clients.claim();
});

// جلب الملفات: يحاول يجيب من النت أولاً، ولو مفيش نت يشوف الكاش
self.addEventListener('fetch', e => {
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});

