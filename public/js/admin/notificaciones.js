window.AdminNotifications = {
    isSupported() {
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    },

    async registerServiceWorker() {
        if (!this.isSupported()) return null;
        try {
            const reg = await navigator.serviceWorker.register('/sw.js');
            return reg;
        } catch (e) {
            console.error('❌ Error registrando SW:', e);
            return null;
        }
    },

    async getExistingSubscription() {
        const reg = await navigator.serviceWorker.ready;
        return await reg.pushManager.getSubscription();
    },

    async requestPermission() {
        if (!this.isSupported()) return false;
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    },

    async subscribe() {
        try {
            const reg = await this.registerServiceWorker();
            if (!reg) return false;

            const granted = await this.requestPermission();
            if (!granted) {
                AdminUI.showToast('🔕 Permiso denegado', 'error');
                return false;
            }

            const res = await fetch('/api/push/public-key');
            const { publicKey } = await res.json();
            if (!publicKey) {
                AdminUI.showToast('❌ Error obteniendo clave', 'error');
                return false;
            }

            const convertedKey = this.urlBase64ToUint8Array(publicKey);

            let subscription = await reg.pushManager.getSubscription();
            if (!subscription) {
                subscription = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: convertedKey
                });
            }

            const subRes = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription)
            });

            if (subRes.ok) {
                AdminUI.showToast('🔔 Notificaciones activadas');
                this.updateButtonState(true);
                return true;
            } else {
                AdminUI.showToast('❌ Error al guardar suscripción', 'error');
                return false;
            }
        } catch (e) {
            console.error('Error suscribiendo:', e);
            AdminUI.showToast('❌ Error activando notificaciones', 'error');
            return false;
        }
    },

    async unsubscribe() {
        try {
            const sub = await this.getExistingSubscription();
            if (sub) await sub.unsubscribe();
            AdminUI.showToast('🔕 Notificaciones desactivadas');
            this.updateButtonState(false);
        } catch (e) {
            console.error(e);
        }
    },

    async init() {
        if (!this.isSupported()) {
            const btn = document.getElementById('notifBtn');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-bell-slash"></i> No soportado'; }
            return;
        }
        await this.registerServiceWorker();
        const sub = await this.getExistingSubscription();
        this.updateButtonState(!!sub);
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

    async toggle() {
        const sub = await this.getExistingSubscription();
        if (sub) {
            await this.unsubscribe();
        } else {
            await this.subscribe();
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