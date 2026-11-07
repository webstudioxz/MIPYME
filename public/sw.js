// ============================================
// Service Worker - Tienda-FG
// Maneja las notificaciones Push y el modo Offline
// ============================================

// 1. Forzar la activación inmediata
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// 2. Tomar el control de las páginas abiertas
self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// 3. Escuchar las notificaciones Push enviadas desde el servidor
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

// 4. Qué pasa cuando el admin toca la notificación
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const url = event.notification.data?.url || '/admin';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // Si ya hay una pestaña abierta, la enfoca
            for (let i = 0; i < windowClients.length; i++) {
                let client = windowClients[i];
                if (client.url.includes(url) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Si no, abre una nueva
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});

// 5. Interceptar peticiones (para que no falle el modo offline)
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // No interceptar el manifest, sw, ni la API
    if (
        url.pathname === '/manifest.json' || 
        url.pathname === '/manifest-admin.json' ||
        url.pathname === '/sw.js' || 
        url.pathname.startsWith('/icons/') ||
        url.pathname.startsWith('/api/')
    ) {
        return; 
    }

    // Buscar en caché o en la red
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