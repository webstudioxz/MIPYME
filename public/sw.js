// ============================================
// Service Worker - Tienda-FG (Modo Siempre Actualizado)
// ============================================

self.addEventListener('install', (event) => { 
    // Forzamos a que el nuevo Service Worker se active de inmediato
    self.skipWaiting(); 
});

self.addEventListener('activate', (event) => { 
    // 🚨 DESTRUIR TODAS LAS CACHÉS VIEJAS AL INSTANTE
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => caches.delete(cacheName))
            );
        }).then(() => clients.claim())
    );
});

// Notificaciones Push (Para el Admin)
self.addEventListener('push', function(event) {
    let data = {};
    try { 
        data = event.data ? event.data.json() : {}; 
    } catch (e) { 
        data = {}; 
    }

    const title = data.title || 'Nuevo Pedido 🛒';
    const options = {
        body: data.body || 'Tienes un nuevo pedido',
        icon: 'https://i.ibb.co/LDG7Gf2d/fotor-ai-2025020222510.jpg',
        badge: 'https://i.ibb.co/LDG7Gf2d/fotor-ai-2025020222510.jpg',
        vibrate: [200, 100, 200],
        requireInteraction: true,
        data: { url: data.url || '/admin' }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// Clic en la notificación (Abre el Admin)
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data.url || '/admin'));
});

// 🚨 EL TRUCO MAESTRO: Ignorar la caché por completo
self.addEventListener('fetch', (event) => {
    // Al no hacer un 'event.respondWith', el navegador va directo a internet.
    // Esto obliga a la página a buscar los productos/tiendas nuevos a Supabase.
    return; 
});