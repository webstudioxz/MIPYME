// ============================================
// Service Worker - Tienda-FG
// ============================================

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Notificaciones Push
self.addEventListener('push', function(event) {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { title: 'Tienda-fg', body: 'Nuevo pedido recibido' };
    }

    const title = data.title || 'Nuevo Pedido 🛒';
    const options = {
        body: data.body || 'Tienes un nuevo pedido',
        icon: '/icons/pacho-optica.png',
        badge: '/icons/pacho-optica.png',
        vibrate: [500, 200, 500, 200, 500],
        requireInteraction: true,
        data: { url: data.url || '/admin' }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// Clic en la notificación
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const url = event.notification.data?.url || '/admin';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (let i = 0; i < windowClients.length; i++) {
                let client = windowClients[i];
                if (client.url.includes(url) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});

// Interceptar peticiones (Modo offline)
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (
        url.pathname === '/manifest.json' || 
        url.pathname === '/manifest-admin.json' ||
        url.pathname === '/sw.js' || 
        url.pathname.startsWith('/icons/') ||
        url.pathname.startsWith('/api/')
    ) {
        return; 
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).catch(() => {
                if (event.request.mode === 'navigate') {
                    return caches.match('/offline.html');
                }
            });
        })
    );
});