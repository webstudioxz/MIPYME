window.AdminNotifications = {
    initialized: false,
    subscribed: false,

    isSupported() {
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    },

    /**
     * Inicializa el sistema de notificaciones.
     * Verifica soporte y estado de suscripción existente.
     */
    async init() {
        if (!this.isSupported()) {
            console.warn('ℹ️ Navegador no soporta notificaciones push.');
            return false;
        }

        // Verificar si ya hay una suscripción activa
        try {
            const reg = await navigator.serviceWorker.ready;
            const existing = await reg.pushManager.getSubscription();
            if (existing) {
                this.subscribed = true;
                this.updateButtonState(true);
            }
        } catch (e) {
            console.warn('No se pudo verificar suscripción existente:', e);
        }

        this.initialized = true;
        return true;
    },

    async subscribe() {
        try {
            if (!this.isSupported()) {
                AdminUI.showToast('❌ Navegador no soporta notificaciones', 'error');
                return false;
            }

            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                AdminUI.showToast('❌ Permiso de notificaciones denegado', 'error');
                return false;
            }

            const reg = await navigator.serviceWorker.ready;

            // Obtener clave pública VAPID
            const res = await fetch('/api/push/public-key');
            const { publicKey } = await res.json();
            if (!publicKey) {
                AdminUI.showToast('❌ Clave pública VAPID no configurada en el servidor', 'error');
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

            // Enviar al backend
            const subRes = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription)
            });

            if (subRes.ok) {
                console.log('🔔 Suscripción guardada en el servidor.');
                this.subscribed = true;
                this.updateButtonState(true);
                AdminUI.showToast('🔔 Notificaciones activadas');
                return true;
            } else {
                AdminUI.showToast('❌ Error guardando suscripción en el servidor', 'error');
                return false;
            }
        } catch (e) {
            console.error('Error al suscribir:', e);
            AdminUI.showToast('❌ Error: ' + e.message, 'error');
            return false;
        }
    },

    async toggle() {
        if (!this.initialized) {
            await this.init();
        }
        if (this.subscribed) {
            AdminUI.showToast('ℹ️ Las notificaciones ya están activadas', 'warning');
            return;
        }
        await this.subscribe();
    },

    updateButtonState(subscribed) {
        const btn = document.getElementById('notifBtn');
        if (!btn) return;
        if (subscribed) {
            btn.innerHTML = '<i class="fas fa-bell"></i> Notificaciones ON';
            btn.className = 'nav-item';
            btn.style.color = '#10B981';
        } else {
            btn.innerHTML = '<i class="fas fa-bell-slash"></i> Activar Push';
            btn.className = 'nav-item';
            btn.style.color = '';
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
