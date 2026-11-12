// ============================================
// Service Worker - Tienda-FG
// ============================================

self.addEventListener('install', (event) => { 
    self.skipWaiting(); 
});

self.addEventListener('activate', (event) => { 
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
        }).then(() => clients.claim())
    );
});

// Notificaciones Push
self.addEventListener('push', function(event) {
    let data = {};
    try { 
        data = event.data ? event.data.json() : {}; 
    } catch (e) { 
        data = {}; 
    }

    const title = data.title || 'Nuevo Pedido 🛒';
    
    // 🚨 LÓGICA CORREGIDA: Construye la URL del panel del cliente
    // Si viene data.url, se usa. Si no, se arma con el data.tienda
    let targetUrl = '/admin';
    if (data.url) {
        targetUrl = data.url;
    } else if (data.tienda) {
        targetUrl = `/admin-cliente?tienda=${data.tienda}`;
    }

    const options = {
        body: data.body || 'Tienes una nueva alerta',
        icon: 'https://i.ibb.co/LDG7Gf2d/fotor-ai-2025020222510.jpg',
        badge: 'https://i.ibb.co/LDG7Gf2d/fotor-ai-2025020222510.jpg',
        vibrate: [200, 100, 200],
        requireInteraction: true,
        data: { 
            url: targetUrl,
            tienda: data.tienda || null 
        }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// Clic en la notificación
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    // Abre la URL del panel del cliente (o admin general si no hay tienda)
    const urlToOpen = event.notification.data.url || '/admin';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // Si ya hay una pestaña abierta con esa URL, enfocarla
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Si no, abrir una nueva
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// EL TRUCO MAESTRO: Ignorar la caché por completo
self.addEventListener('fetch', (event) => {
    return; 
});