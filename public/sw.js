self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Solo dejamos pasar las peticiones, esto habilita la instalación
});

// Notificaciones Push (para que sigan funcionando)
self.addEventListener('push', function(event) {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { title: 'Tienda-fg', body: 'Nuevo pedido' };
    }

    const title = data.title || 'Nuevo Pedido 🛒';
    const options = {
        body: data.body || 'Tienes un nuevo pedido',
        icon: '/icons/pacho-optica.png',
        badge: '/icons/pacho-optica.png',
        vibrate: [500, 200, 500],
        requireInteraction: true,
        data: { url: data.url || '/admin' }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const url = event.notification.data?.url || '/admin';
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(windowClients => {
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