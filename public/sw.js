// ============================================
// SERVICE WORKER - TIENDA-FG (VERSIÓN ANTI-CACHÉ)
// ============================================

// 1. Forzar la instalación y activación inmediata
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// 2. Tomar el control de las páginas abiertas inmediatamente
self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// 3. INTERCEPTAR PETICIONES
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 🛑 REGLA DE ORO: 
    // Si Chrome pide el manifest, el service worker, los íconos o la API,
    // lo dejamos pasar directo a internet SIN GUARDAR EN CACHÉ.
    if (
        url.pathname === '/manifest.json' || 
        url.pathname === '/manifest-admin.json' ||
        url.pathname === '/sw.js' || 
        url.pathname.startsWith('/icons/') ||
        url.pathname.startsWith('/api/')
    ) {
        return; 
    }

    // 4. ESTRATEGIA: Network First (Red primero, Caché después)
    // Esto significa que SIEMPRE intentará buscar la versión más nueva en internet.
    // Solo si no hay internet, usará la copia guardada.
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Si la respuesta es exitosa, la clonamos y la guardamos en caché
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseClone = response.clone();
                    caches.open('tienda-fg-v2').then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Si falla la red (estás offline), buscamos en la caché
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Si no está en caché y no hay internet, mostramos la pantalla offline
                    if (event.request.mode === 'navigate') {
                        return caches.match('/offline.html');
                    }
                });
            })
    );
});

// ============================================
// NOTIFICACIONES PUSH
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
// CLIC EN LA NOTIFICACIÓN
// ============================================
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