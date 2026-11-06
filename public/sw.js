// ============================================
// SERVICE WORKER - TIENDA-FG (VERSIÓN DE INSTALACIÓN FORZADA)
// ============================================

self.addEventListener('install', (event) => {
    // Forzamos la activación inmediata
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Tomamos el control de las páginas abiertas inmediatamente
    event.waitUntil(clients.claim());
});

// ============================================
// INTERCEPTAR PETICIONES (La clave para que instale)
// ============================================
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 🛑 REGLA DE ORO: 
    // Si Chrome pide el manifest, el service worker o los íconos, 
    // NO los interceptamos. Los dejamos pasar directo a internet.
    // Esto le dice a Chrome: "Todo está limpio, puedes instalar".
    if (
        url.pathname === '/manifest.json' || 
        url.pathname === '/manifest-admin.json' ||
        url.pathname === '/sw.js' || 
        url.pathname.startsWith('/icons/') ||
        url.pathname.startsWith('/api/')
    ) {
        return; 
    }

    // Para el resto de la página, intentamos buscar en caché o en la red.
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).catch(() => {
                // Solo mostramos offline si es una navegación de página
                if (event.request.mode === 'navigate') {
                    return caches.match('/offline.html');
                }
            });
        })
    );
});

// ============================================
// NOTIFICACIONES PUSH (Para que siga sonando)
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
        vibrate: [500, 200, 500, 200, 500], // Vibración fuerte
        requireInteraction: true,
        data: { url: data.url || '/admin' }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// ============================================
// CLIC EN LA NOTIFICACIÓN
// ============================================
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const url = event.notification.data?.url || '/admin';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // Si ya hay una pestaña del admin abierta, la enfocamos
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