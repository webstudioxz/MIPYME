// ============================================
// SERVICE WORKER - TIENDA-FG v5.0
// Caché offline para PWA
// ============================================

const CACHE_NAME = 'tienda-fg-v5';
const OFFLINE_URL = '/offline.html';

// ============================================
// RECURSOS A CACHEAR
// ============================================
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/admin.html',
    '/manifest.json',
    '/offline.html',
    '/icon-192.png',
    '/icon-512.png',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Poppins:wght@500;600;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// ============================================
// INSTALACIÓN - Cachear recursos estáticos
// ============================================
self.addEventListener('install', event => {
    console.log('[SW] Instalando Service Worker...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Cacheando recursos estáticos...');
                return cache.addAll(STATIC_ASSETS).catch(err => {
                    console.error('[SW] Error cacheando recursos:', err);
                    // Intentar cachear uno por uno
                    STATIC_ASSETS.forEach(url => {
                        fetch(url).then(res => {
                            if (res.ok) cache.put(url, res);
                        }).catch(() => {});
                    });
                });
            })
            .then(() => {
                console.log('[SW] Instalación completada');
                return self.skipWaiting();
            })
    );
});

// ============================================
// ACTIVACIÓN - Limpiar cachés viejos
// ============================================
self.addEventListener('activate', event => {
    console.log('[SW] Activando Service Worker...');
    
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Eliminando caché antiguo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
        .then(() => {
            console.log('[SW] Activación completada');
            return self.clients.claim();
        })
    );
});

// ============================================
// INTERCEPTAR PETICIONES - Estrategia Stale-While-Revalidate
// ============================================
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    
    // No interceptar peticiones a la API
    if (url.pathname.startsWith('/api/')) {
        return;
    }
    
    // No interceptar peticiones a admin
    if (url.pathname.startsWith('/admin')) {
        return;
    }
    
    // Estrategia: Stale-While-Revalidate
    event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
            return cache.match(request).then(cachedResponse => {
                const fetchPromise = fetch(request)
                    .then(networkResponse => {
                        // Actualizar caché con la respuesta de red
                        if (networkResponse && networkResponse.status === 200) {
                            cache.put(request, networkResponse.clone());
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // Si falla la red y no hay caché, devolver offline page
                        if (!cachedResponse) {
                            return caches.match('/offline.html');
                        }
                        return cachedResponse;
                    });
                
                // Devolver respuesta de caché si existe, sino esperar la red
                return cachedResponse || fetchPromise;
            });
        })
    );
});

// ============================================
// SINCERONIZACIÓN EN SEGUNDO PLANO (opcional)
// ============================================
self.addEventListener('sync', event => {
    if (event.tag === 'sync-orders') {
        event.waitUntil(syncOrders());
    }
});

async function syncOrders() {
    try {
        const cache = await caches.open('pending-orders');
        const requests = await cache.keys();
        
        for (const request of requests) {
            const response = await cache.match(request);
            if (response) {
                const data = await response.json();
                // Reintentar enviar el pedido
                const result = await fetch('/api/pedidos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                if (result.ok) {
                    await cache.delete(request);
                }
            }
        }
    } catch (error) {
        console.error('[SW] Error sincronizando pedidos:', error);
    }
}

// ============================================
// NOTIFICACIONES PUSH (opcional)
// ============================================
self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Tienda-fg';
    const options = {
        body: data.body || '¡Nuevo mensaje de Tienda-fg!',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200],
        data: data.url || '/'
    };
    
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// ============================================
// CLICK EN NOTIFICACIÓN
// ============================================
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    event.waitUntil(
        clients.openWindow(event.notification.data || '/')
    );
});

// ============================================
// MENSAJES DEL CLIENTE
// ============================================
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

console.log('[SW] Service Worker cargado correctamente');