// ============================================
// SERVICE WORKER - TIENDA-FG (VERSIÓN DEFINITIVA)
// ============================================

const CACHE_NAME = 'tienda-fg-cache-v3';

// 1. INSTALACIÓN
self.addEventListener('install', (event) => {
    // Forzamos la activación inmediata del nuevo Service Worker
    self.skipWaiting();
});

// 2. ACTIVACIÓN
self.addEventListener('activate', (event) => {
    // Tomamos el control de las páginas abiertas inmediatamente
    event.waitUntil(clients.claim());
});

// 3. INTERCEPTAR PETICIONES (FETCH)
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 🛑 REGLA DE ORO PARA LA INSTALACIÓN:
    // Si el navegador pide el manifest, el service worker, los íconos o la API,
    // lo dejamos pasar directo a internet sin intervenir.
    if (
        url.pathname === '/manifest.json' || 
        url.pathname === '/sw.js' || 
        url.pathname.startsWith('/icons/') ||
        url.pathname.startsWith('/api/')
    ) {
        return; // El navegador lo maneja de forma normal
    }

    // Para el resto de la tienda, intentamos buscar en caché, si no, red.
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).catch(() => {
                // Si falla la red y el usuario navega, mostramos la página offline
                if (event.request.mode === 'navigate') {
                    return caches.match('/offline.html');
                }
            });
        })
    );
});

// ============================================
// 4. NOTIFICACIONES PUSH
// ============================================
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

// ============================================
// 5. CLIC EN LA NOTIFICACIÓN
// ============================================
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const url = event.notification.data?.url || '/admin';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // Si ya hay una pestaña abierta del admin, la enfocamos
            for (let i = 0; i < windowClients.length; i++) {
                let client = windowClients[i];
                if (client.url.includes(url) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Si no, abrimos una nueva
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});