// ============================================================
// public/sw.js — Service Worker Tienda-FG
// Maneja notificaciones push del panel (admin + admin-cliente)
// ============================================================

const CACHE_NAME = 'tienda-fg-v4';
const SHELL_ASSETS = [
    '/manifest-admin.json',
    '/css/admin.css',
    '/js/admin/api.js',
    '/js/admin/ui.js',
    '/js/admin/notifications.js'
];

// ============================================================
// INSTALL — prepara cache mínimo y activa de inmediato
// ============================================================
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Intentar precachear; si un asset falla, no bloquear
            return Promise.allSettled(
                SHELL_ASSETS.map((url) => cache.add(url).catch(() => null))
            );
        })
    );
});

// ============================================================
// ACTIVATE — limpia caches antiguas y toma control
// ============================================================
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

// ============================================================
// FETCH — solo cachea GET de shell; ignora /api/ y POST/PUT/DELETE
// ============================================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // No cachear API
    if (url.pathname.startsWith('/api/')) return;

    // Network-first para HTML (para no servir versiones viejas)
    if (request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request).catch(() => caches.match(request))
        );
        return;
    }

    // Cache-first para shell
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

// ============================================================
// PUSH — recibe notificaciones del servidor
// ============================================================
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
        icon: payload.icon || '/img/icon-192.png',
        badge: payload.badge || '/img/icon-72.png',
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

// ============================================================
// NOTIFICATION CLICK — abre la URL correcta
// ============================================================
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const data = event.notification.data || {};
    let targetUrl = data.url || '/admin';

    // Si viene tienda y no viene URL explícita, armamos la URL del admin-cliente
    if (!data.url && data.tienda) {
        targetUrl = `/admin-cliente?tienda=${encodeURIComponent(data.tienda)}`;
    }

    // Normalizar URL a absoluta
    const urlToOpen = new URL(targetUrl, self.location.origin).href;

    event.waitUntil(
        (async () => {
            const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });

            // Buscar cliente abierto con la misma URL
            for (const client of allClients) {
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }

            // Buscar cualquier cliente abierto del panel
            for (const client of allClients) {
                if (
                    (client.url.includes('/admin-cliente') || client.url.includes('/admin')) &&
                    'focus' in client
                ) {
                    try {
                        if ('navigate' in client) await client.navigate(urlToOpen);
                        return client.focus();
                    } catch (e) { /* continue */ }
                }
            }

            // Si no hay ninguno, abrir ventana nueva
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })()
    );
});

// ============================================================
// NOTIFICATION CLOSE
// ============================================================
self.addEventListener('notificationclose', (event) => {
    // No hacemos nada especial; podemos dejar el hook para analytics futuros
});
