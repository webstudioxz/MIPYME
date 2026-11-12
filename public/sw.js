// ============================================
// Service Worker - Tienda-FG (Notificaciones Forzadas)
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

// 🚨 NOTIFICACIÓN PUSH (FORZADA)
self.addEventListener('push', function(event) {
    let data = {};
    try { 
        data = event.data ? event.data.json() : {}; 
    } catch (e) { 
        data = {}; 
    }

    const title = data.title || 'Nuevo Pedido 🛒';
    
    // Construir la URL de destino
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
        vibrate: [500, 200, 500, 200, 500],   // 🚨 Vibración fuerte
        requireInteraction: true,              // 🚨 No se cierra sola
        tag: 'pedido-nuevo',                   // 🚨 Reemplaza notificaciones antiguas
        renotify: true,                        // 🚨 Vuelve a sonar aunque haya otra igual
        silent: false,                         // 🚨 Asegura que suene
        data: { 
            url: targetUrl,
            tienda: data.tienda || null 
        }
    };

    // 🚨 FORZAR LA NOTIFICACIÓN
    event.waitUntil(
        self.registration.showNotification(title, options)
            .then(() => {
                console.log('✅ Notificación mostrada:', title);
            })
            .catch(err => {
                console.error('❌ Error mostrando notificación:', err);
            })
    );
});

// Clic en la notificación
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    const urlToOpen = event.notification.data.url || '/admin';
    
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

// Escuchar mensaje para activar nuevo SW inmediatamente
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// EL TRUCO MAESTRO: Ignorar la caché por completo
self.addEventListener('fetch', (event) => {
    return; 
});