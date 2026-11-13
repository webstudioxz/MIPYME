// ============================================================
// public/js/admin/notifications.js
// ============================================================

window.AdminNotifications = {
    isSupported() {
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    },

    async isSubscribed() {
        try {
            if (!this.isSupported()) return false;
            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.getSubscription();
            return !!subscription;
        } catch (e) { return false; }
    },

    async subscribe() {
        try {
            if (!this.isSupported()) {
                AdminUI.showToast('❌ Tu navegador no soporta notificaciones.', 'error');
                return false;
            }

            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                AdminUI.showToast('❌ Permiso denegado. Actívalo en los ajustes.', 'error');
                return false;
            }

            // 🚨 FORZAR ACTUALIZACIÓN DEL SERVICE WORKER
            const reg = await navigator.serviceWorker.register('/sw.js');
            await reg.update(); // Fuerza a descargar la última versión
            await navigator.serviceWorker.ready;

            const res = await fetch('/api/push/public-key');
            const { publicKey } = await res.json();
            if (!publicKey) return false;

            const convertedKey = this.urlBase64ToUint8Array(publicKey);
            let subscription = await reg.pushManager.getSubscription();
            if (!subscription) {
                subscription = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: convertedKey
                });
            }

            let tiendaId = null;
            const urlParams = new URLSearchParams(window.location.search);
            tiendaId = urlParams.get('tienda');
            if (!tiendaId && window.AdminApp?.tiendaActual) tiendaId = window.AdminApp.tiendaActual;
            if (!tiendaId && window.AdminApp?.tiendasDisponibles?.length === 1) tiendaId = window.AdminApp.tiendasDisponibles[0].id;

            const subRes = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...subscription, tienda_id: tiendaId || null })
            });

            if (subRes.ok) {
                this.updateButtonState(true);
                AdminUI.showToast(`🔔 Notificaciones activadas para ${tiendaId}`, 'success');
                return true;
            }
            return false;
        } catch (e) {
            AdminUI.showToast('Error al activar: ' + e.message, 'error');
            return false;
        }
    },

    async unsubscribe() {
        try {
            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.getSubscription();
            if (subscription) await subscription.unsubscribe();
            this.updateButtonState(false);
            AdminUI.showToast('🔕 Notificaciones desactivadas', 'warning');
            return true;
        } catch (e) { return false; }
    },

    async toggle() {
        if (!this.isSupported()) return;
        if (await this.isSubscribed()) await this.unsubscribe();
        else await this.subscribe();
    },

    updateButtonState(subscribed) {
        const btn = document.getElementById('notifBtn');
        if (!btn) return;
        if (subscribed) {
            btn.innerHTML = '<i class="fas fa-bell"></i> Notificaciones ON (Desactivar)';
            btn.style.color = '#10B981';
            btn.style.fontWeight = '700';
        } else {
            btn.innerHTML = '<i class="fas fa-bell-slash"></i> Activar Notificaciones';
            btn.style.color = '#F59E0B';
        }
    },

    async init() {
        if (!this.isSupported()) return;
        try {
            const reg = await navigator.serviceWorker.register('/sw.js');
            reg.update();
            const subscribed = await this.isSubscribed();
            this.updateButtonState(subscribed);
        } catch (e) { console.warn('Error verificando notificaciones', e); }
    },

    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
        return outputArray;
    }
};