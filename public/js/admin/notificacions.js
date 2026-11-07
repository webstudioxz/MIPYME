window.AdminNotifications = {
    isSupported() {
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    },

    async subscribe() {
        try {
            if (!this.isSupported()) {
                console.warn('❌ Navegador no soporta notificaciones.');
                return false;
            }

            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.warn('❌ Permiso denegado.');
                return false;
            }

            const reg = await navigator.serviceWorker.ready;
            
            const res = await fetch('/api/push/public-key');
            const { publicKey } = await res.json();
            if (!publicKey) {
                console.error('❌ Error obteniendo clave pública.');
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
                console.log('🔔 Suscripción guardada en el servidor.');
                this.updateButtonState(true);
                return true;
            } else {
                console.error('❌ Error guardando suscripción en el servidor.');
                return false;
            }
        } catch (e) {
            console.error('Error al suscribir:', e);
            return false;
        }
    },

    async toggle() {
        await this.subscribe();
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