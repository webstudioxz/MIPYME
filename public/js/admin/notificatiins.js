// ============================================================
// public/js/admin/notifications.js
// ============================================================

window.AdminNotifications = {
    isSupported() {
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    },

    async subscribe() {
        try {
            if (!this.isSupported()) {
                AdminUI.showToast('❌ Tu navegador no soporta notificaciones.', 'error');
                return false;
            }

            // 1. Pedir permiso
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                AdminUI.showToast('❌ Permiso denegado. Actívalo en los ajustes del navegador.', 'error');
                return false;
            }

            // 2. Obtener el Service Worker
            const reg = await navigator.serviceWorker.ready;

            // 3. Pedir la clave pública VAPID
            const res = await fetch('/api/push/public-key');
            const { publicKey } = await res.json();
            
            if (!publicKey) {
                AdminUI.showToast('❌ Error de configuración en el servidor', 'error');
                return false;
            }

            const convertedKey = this.urlBase64ToUint8Array(publicKey);

            // 4. Suscribirse
            let subscription = await reg.pushManager.getSubscription();
            if (!subscription) {
                subscription = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: convertedKey
                });
            }

            // 🚨 OBTENER EL TIENDA_ID DESDE LA URL O DEL INPUT HIDDEN
            const urlParams = new URLSearchParams(window.location.search);
            let tiendaId = urlParams.get('tienda');

            // Si estamos en el panel del cliente y no hay URL, buscar el tienda actual
            if (!tiendaId && window.AdminApp && window.AdminApp.tiendaActual) {
                tiendaId = window.AdminApp.tiendaActual;
            }

            // Si aún no hay, buscar en los datos de la tienda cargados
            if (!tiendaId && window.AdminApp && window.AdminApp.tiendasDisponibles && window.AdminApp.tiendasDisponibles.length === 1) {
                tiendaId = window.AdminApp.tiendasDisponibles[0].id;
            }

            // 5. Enviar al backend CON el tienda_id
            const subRes = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...subscription,
                    tienda_id: tiendaId || null // 🚨 Aquí se guarda el ID
                })
            });

            if (subRes.ok) {
                this.updateButtonState(true);
                AdminUI.showToast(`🔔 Notificaciones activadas ${tiendaId ? 'para ' + tiendaId : ''}`, 'success');
                return true;
            } else {
                AdminUI.showToast('❌ Error al guardar suscripción', 'error');
                return false;
            }
        } catch (e) {
            console.error('Error al suscribir:', e);
            AdminUI.showToast('Error: ' + e.message, 'error');
            return false;
        }
    },

    async toggle() {
        if (!this.isSupported()) {
            AdminUI.showToast('❌ Tu navegador no soporta notificaciones push', 'error');
            return;
        }

        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        
        if (existing) {
            await existing.unsubscribe();
            this.updateButtonState(false);
            AdminUI.showToast('🔕 Notificaciones desactivadas', 'warning');
        } else {
            await this.subscribe();
        }
    },

    updateButtonState(subscribed) {
        const btn = document.getElementById('notifBtn');
        if (!btn) return;
        
        if (subscribed) {
            btn.innerHTML = '<i class="fas fa-bell"></i> Notificaciones ON';
            btn.className = 'btn btn-success btn-sm';
        } else {
            btn.innerHTML = '<i class="fas fa-bell-slash"></i> Activar Notificaciones';
            btn.className = 'btn btn-warning btn-sm';
        }
    },

    async init() {
        if (!this.isSupported()) return;
        try {
            // 🚨 FORZAR ACTUALIZACIÓN DEL SERVICE WORKER
            const reg = await navigator.serviceWorker.register('/sw.js');
            reg.update();
            
            // Si hay un SW nuevo esperando, activarlo inmediatamente
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        newWorker.postMessage({ type: 'SKIP_WAITING' });
                    }
                });
            });

            const subscription = await reg.pushManager.getSubscription();
            this.updateButtonState(!!subscription);
        } catch (e) {
            console.warn('No se pudo verificar el estado inicial de las notificaciones', e);
        }
    },

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