// ============================================================
// public/js/admin/notifications.js — CORREGIDO Y BLINDADO
// ============================================================

window.AdminNotifications = {
    isSupported() {
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    },

    // Verificar si el usuario ya tiene las notificaciones activas
    async isSubscribed() {
        try {
            if (!this.isSupported()) return false;
            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.getSubscription();
            return !!subscription;
        } catch (e) {
            console.error('Error al verificar suscripción:', e);
            return false;
        }
    },

    // Activar notificaciones
    async subscribe() {
        try {
            if (!this.isSupported()) {
                AdminUI.showToast('❌ Tu navegador no soporta notificaciones push.', 'error');
                return false;
            }

            // 1. Pedir permiso al usuario (Chrome pide confirmación)
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                AdminUI.showToast('❌ Permiso denegado. Actívalo en los ajustes del navegador.', 'error');
                return false;
            }

            // 2. Obtener el Service Worker (y forzar actualización)
            const reg = await navigator.serviceWorker.register('/sw.js');
            await reg.update();
            await navigator.serviceWorker.ready;

            // 3. Pedir la clave pública VAPID al servidor
            const res = await fetch('/api/push/public-key');
            const { publicKey } = await res.json();
            
            if (!publicKey) {
                AdminUI.showToast('❌ Error de configuración en el servidor (Falta VAPID)', 'error');
                return false;
            }

            const convertedKey = this.urlBase64ToUint8Array(publicKey);

            // 4. Suscribirse al servicio de Push de Google/Chrome
            let subscription = await reg.pushManager.getSubscription();
            if (!subscription) {
                subscription = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: convertedKey
                });
            }

            // 🚨 5. OBTENER EL TIENDA_ID (Búsqueda en cascada a prueba de fallos)
            let tiendaId = null;

            // A. Intentar desde la URL (?tienda=corta-pelos)
            const urlParams = new URLSearchParams(window.location.search);
            tiendaId = urlParams.get('tienda');

            // B. Si no está en la URL, buscar en AdminApp (global)
            if (!tiendaId && window.AdminApp && window.AdminApp.tiendaActual) {
                tiendaId = window.AdminApp.tiendaActual;
            }

            // C. Si sigue sin estar, buscar en las tiendas disponibles
            if (!tiendaId && window.AdminApp && window.AdminApp.tiendasDisponibles && window.AdminApp.tiendasDisponibles.length === 1) {
                tiendaId = window.AdminApp.tiendasDisponibles[0].id;
            }

            // D. Si de plano no se encuentra, avisar en consola
            if (!tiendaId) {
                console.warn('⚠️ No se pudo determinar el ID de la tienda. La notificación se enviará al Admin General.');
            }

            // 6. Enviar la suscripción al backend con el tienda_id
            const subRes = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...subscription,
                    tienda_id: tiendaId || null
                })
            });

            if (subRes.ok) {
                this.updateButtonState(true);
                AdminUI.showToast(`🔔 Notificaciones activadas ${tiendaId ? 'para ' + tiendaId : ''}`, 'success');
                return true;
            } else {
                AdminUI.showToast('❌ Error al guardar la suscripción en el servidor', 'error');
                return false;
            }
        } catch (e) {
            console.error('Error al suscribir:', e);
            AdminUI.showToast('Error al activar: ' + e.message, 'error');
            return false;
        }
    },

    // Desactivar notificaciones
    async unsubscribe() {
        try {
            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.getSubscription();
            if (subscription) {
                await subscription.unsubscribe();
            }
            this.updateButtonState(false);
            AdminUI.showToast('🔕 Notificaciones desactivadas', 'warning');
            return true;
        } catch (e) {
            console.error('Error al desuscribir:', e);
            AdminUI.showToast('Error al desactivar: ' + e.message, 'error');
            return false;
        }
    },

    // Alternar entre activar/desactivar
    async toggle() {
        if (!this.isSupported()) {
            AdminUI.showToast('❌ Tu navegador no soporta notificaciones push', 'error');
            return;
        }

        const subscribed = await this.isSubscribed();
        
        if (subscribed) {
            await this.unsubscribe();
        } else {
            await this.subscribe();
        }
    },

    // Actualizar el diseño del botón en el menú lateral
    updateButtonState(subscribed) {
        const btn = document.getElementById('notifBtn');
        if (!btn) return;
        
        if (subscribed) {
            btn.innerHTML = '<i class="fas fa-bell"></i> Notificaciones ON (Desactivar)';
            btn.style.color = '#10B981'; // Verde
            btn.style.fontWeight = '700';
        } else {
            btn.innerHTML = '<i class="fas fa-bell-slash"></i> Activar Notificaciones';
            btn.style.color = '#F59E0B'; // Naranja
            btn.style.fontWeight = '500';
        }
    },

    // Inicializar el módulo al cargar el panel
    async init() {
        if (!this.isSupported()) return;
        try {
            // Forzar actualización del Service Worker
            const reg = await navigator.serviceWorker.register('/sw.js');
            reg.update();
            
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        newWorker.postMessage({ type: 'SKIP_WAITING' });
                    }
                });
            });

            // Verificar si ya estaba suscrito para pintar el botón correctamente
            const subscribed = await this.isSubscribed();
            this.updateButtonState(subscribed);
        } catch (e) {
            console.warn('No se pudo verificar el estado inicial de las notificaciones', e);
        }
    },

    // Convertir la clave VAPID Base64 a formato aceptado por el navegador
    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
};