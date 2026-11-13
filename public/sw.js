// ============================================
// Service Worker Único - Tienda-FG
// ============================================

self.addEventListener('install', (event) => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { 
    event.waitUntil(
        caches.keys().then(cacheNames => Promise.all(cacheNames.map(c => caches.delete(c))))
        .then(() => clients.claim())
    );
});

self.addEventListener('push', function(event) {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }

    const title = data.title || '🛒 Notificación';
    let targetUrl = data.url || '/admin';

    const options = {
        body: data.body || 'Tienes una nueva alerta',
        icon: 'https://i.ibb.co/LDG7Gf2d/fotor-ai-2025020222510.jpg',
        badge: 'https://i.ibb.co/LDG7Gf2d/fotor-ai-2025020222510.jpg',
        vibrate: [500, 200, 500, 200, 500],
        requireInteraction: true,
        tag: 'alerta-' + (data.tienda || 'global'),
        renotify: true,
        silent: false,
        data: { url: targetUrl, tienda: data.tienda || null }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const urlToOpen = event.notification.data.url || '/admin';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(urlToOpen) && 'focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow(urlToOpen);
        })
    );
});

self.addEventListener('fetch', (event) => { return; });