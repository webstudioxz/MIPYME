// ============================================
// Service Worker - Tienda-FG
// ============================================

self.addEventListener('install', (event) => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(clients.claim()); });

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
        icon: 'https://i.ibb.co/LDG7Gf2d/fotor-ai-2025020222510.jpg', // Logo real de tu tienda
        badge: 'https://i.ibb.co/LDG7Gf2d/fotor-ai-2025020222510.jpg',
        image: 'https://i.ibb.co/LDG7Gf2d/fotor-ai-2025020222510.jpg', // Imagen grande (estilo SMS)
        vibrate: [200, 100, 200],
        requireInteraction: true,
        data: { url: data.url || '/admin' }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// Clic en la notificación
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data.url || '/admin'));
});

// Modo Offline
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return; 
    event.respondWith(caches.match(event.request).then(res => res || fetch(event.request)));
});