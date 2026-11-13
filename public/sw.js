// ============================================
// Service Worker - Tienda-FG (Notificaciones a prueba de balas)
// ============================================

self.addEventListener('install', (event) => { 
    self.skipWaiting(); // Fuerza al SW a instalarse de inmediato
});

self.addEventListener('activate', (event) => { 
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
        }).then(() => clients.claim()) // Toma el control de las pestañas abiertas
    );
});

// 🚨 NOTIFICACIÓN PUSH EXCLUSIVA
self.addEventListener('push', function(event) {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }

    const title = data.title || '🛒 Nuevo Pedido';
    let targetUrl = '/admin-cliente';
    if (data.tienda) targetUrl = `/admin-cliente?tienda=${data.tienda}`;

    const options = {
        body: data.body || 'Tienes un nuevo pedido',
        icon: 'https://i.ibb.co/LDG7Gf2d/fotor-ai-2025020222510.jpg',
        badge: 'https://i.ibb.co/LDG7Gf2d/fotor-ai-2025020222510.jpg',
        vibrate: [500, 200, 500, 200, 500],   // 🚨 Vibración fuerte
        requireInteraction: true,             // 🚨 No se cierra hasta que la toquen
        tag: 'pedido-nuevo-' + (data.tienda || 'global'),
        renotify: true,                       // 🚨 Vuelve a sonar aunque haya otra igual
        silent: false,                        // 🚨 Asegura que suene
        data: { url: targetUrl, tienda: data.tienda || null }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
            .then(() => console.log('✅ Notificación mostrada:', title))
            .catch(err => console.error('❌ Error mostrando notificación:', err))
    );
});

// Clic en la notificación
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const urlToOpen = event.notification.data.url || '/admin-cliente';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Ignorar caché
self.addEventListener('fetch', (event) => { return; });