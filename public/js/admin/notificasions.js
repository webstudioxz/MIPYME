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

    async subscribe() {
        try {
            if (!this.isSupported()) {
                alert('❌ Tu navegador no soporta notificaciones push.');
                return false;
            }

            // Pedir permiso
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                alert('❌ Debes permitir las notificaciones en tu navegador.');
                return false;
            }

            const reg = await this.registerServiceWorker();
            if (!reg) {
                alert('❌ Error al registrar el Service Worker.');
                return false;
            }

            // Obtener clave VAPID del backend
            const res = await fetch('/api/push/public-key');
            const { publicKey } = await res.json();
            if (!publicKey) {
                alert('❌ Error obteniendo la clave pública del servidor.');
                return false;
            }

            const convertedKey = this.urlBase64ToUint8Array(publicKey);

            // Suscribirse
            let subscription = await reg.pushManager.getSubscription();
            if (!subscription) {
                subscription = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: convertedKey
                });
            }

            // Enviar al backend
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
                alert('❌ Error al guardar la suscripción en el servidor.');
                return false;
            }
        } catch (e) {
            console.error('Error suscribiendo:', e);
            alert('❌ Error: ' + e.message);
            return false;
        }
    },

    async init() {
        const btn = document.getElementById('notifBtn');
        if (!btn) return;

        if (!this.isSupported()) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-bell-slash"></i> No soportado';
            return;
        }
        
        await this.registerServiceWorker();
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
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
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
            await sub.unsubscribe();
            AdminUI.showToast('🔕 Notificaciones desactivadas');
            this.updateButtonState(false);
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