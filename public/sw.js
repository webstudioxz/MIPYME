// ============================================================
// public/sw.js — Service Worker Tienda-FG
// ============================================================

const CACHE_NAME = 'tienda-fg-v5';
const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/admin.html',
    '/admin-cliente.html',
    '/manifest.json',
    '/manifest-admin.json',
    '/css/store.css',
    '/css/admin.css',
    '/js/store/app.js',
    '/js/store/api.js',
    '/js/store/cart.js',
    '/js/store/ui.js',
    '/js/store/utils.js',
    '/js/admin/app.js',
    '/js/admin/api.js',
    '/js/admin/auth.js',
    '/js/admin/ui.js',
    '/js/admin/notifications.js',
    '/js/admin/products.js',
    '/js/admin/orders.js',
    '/js/admin/plans.js',
    '/js/admin/cliente.js',      // 🆕 Añadido
    '/js/admin/superadmin.js'    // 🆕 Añadido
];

// INSTALL
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.allSettled(
                SHELL_ASSETS.map((url) => cache.add(url).catch(() => null))
            );
        })
    );
});

// ACTIVATE
self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            );
            await self.clients.claim();
        })()
    );
});

// FETCH
self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/')) return;

    if (request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request)
                .then((resp) => {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    return resp;
                })
                .catch(() => caches.match(request) || caches.match('/offline.html'))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request).then((resp) => {
                if (resp && resp.status === 200) {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
                }
                return resp;
            });
        })
    );
});

// PUSH
self.addEventListener('push', (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch (e) {
        payload = { title: 'Tienda-FG', body: event.data ? event.data.text() : 'Nueva notificación' };
    }

    const title = payload.title || 'Tienda-FG';
    const options = {
        body: payload.body || 'Tienes una nueva notificación',
        icon: payload.icon || '/icons/pacho-optica.png',
        badge: payload.badge || '/icons/pacho-optica.png',
        tag: payload.tag || `tienda-fg-${payload.tienda || 'admin'}`,
        renotify: true,
        requireInteraction: false,
        data: {
            url: payload.url || '/admin',
            tienda: payload.tienda || null,
            contacto_nombre: payload.contacto_nombre || null,
            extra: payload.extra || null,
            ts: Date.now()
        },
        vibrate: [120, 60, 120],
        actions: payload.actions || []
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// NOTIFICATION CLICK
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const data = event.notification.data || {};
    let targetUrl = data.url || '/admin';

    if (!data.url && data.tienda) {
        targetUrl = `/admin-cliente?tienda=${encodeURIComponent(data.tienda)}`;
    }

    const urlToOpen = new URL(targetUrl, self.location.origin).href;

    event.waitUntil(
        (async () => {
            const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
            for (const client of allClients) {
                if (client.url === urlToOpen && 'focus' in client) return client.focus();
            }
            for (const client of allClients) {
                if ((client.url.includes('/admin-cliente') || client.url.includes('/admin')) && 'focus' in client) {
                    try {
                        if ('navigate' in client) await client.navigate(urlToOpen);
                        return client.focus();
                    } catch (e) {}
                }
            }
            if (clients.openWindow) return clients.openWindow(urlToOpen);
        })()
    );
});