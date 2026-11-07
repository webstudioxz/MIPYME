// ============================================================
// public/js/admin/notifications.js
// Notificaciones Push del navegador (Web Push)
// ============================================================

window.AdminNotifications = {
    // ------------------------------------------------------------
    // Verificar si el navegador soporta notificaciones push
    // ------------------------------------------------------------
    isSupported() {
        return 'serviceWorker' in navigator && 
               'PushManager' in window && 
               'Notification' in window;
    },

    // ------------------------------------------------------------
    // Pedir permiso y suscribir al usuario
    // ------------------------------------------------------------
    async subscribe() {
        try {
            if (!this.isSupported()) {
                console.warn('❌ Navegador no soporta notificaciones push.');
                AdminUI.showToast('Tu navegador no soporta notificaciones', 'warning');
                return false;
            }

            // 1. Pedir permiso
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.warn('❌ Permiso de notificaciones denegado.');
                AdminUI.showToast('Permiso de notificaciones denegado', 'warning');
                return false;
            }

            // 2. Obtener el Service Worker
            const reg = await navigator.serviceWorker.ready;

            // 3. Pedir la clave pública VAPID al servidor
            const res = await fetch('/api/push/public-key');
            const { publicKey } = await res.json();
            
            if (!publicKey) {
                console.error('❌ Error: No hay VAPID_PUBLIC_KEY en el servidor');
                AdminUI.showToast('Error de configuración en el servidor', 'error');
                return false;
            }

            const convertedKey = this.urlBase64ToUint8Array(publicKey);

            // 4. Suscribirse (si no lo está ya)
            let subscription = await reg.pushManager.getSubscription();
            if (!subscription) {
                subscription = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: convertedKey
                });
            }

            // 5. Enviar la suscripción al backend
            const subRes = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription)
            });

            if (subRes.ok) {
                console.log('🔔 Suscripción guardada en el servidor.');
                this.updateButtonState(true);
                AdminUI.showToast('🔔 Notificaciones activadas', 'success');
                return true;
            } else {
                console.error('❌ Error guardando suscripción en el servidor.');
                AdminUI.showToast('Error al guardar suscripción', 'error');
                return false;
            }
        } catch (e) {
            console.error('Error al suscribir a notificaciones:', e);
            AdminUI.showToast('Error al activar notificaciones', 'error');
            return false;
        }
    },

    // ------------------------------------------------------------
    // Botón para activar/desactivar
    // ------------------------------------------------------------
    async toggle() {
        if (!this.isSupported()) {
            AdminUI.showToast('Tu navegador no soporta notificaciones', 'warning');
            return;
        }

        // Si ya tiene permiso, revisar si está suscrito
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        
        if (existing) {
            // Ya está suscrito: cancelar
            await existing.unsubscribe();
            this.updateButtonState(false);
            AdminUI.showToast('🔕 Notificaciones desactivadas', 'warning');
        } else {
            // No está suscrito: activar
            await this.subscribe();
        }
    },

    // ------------------------------------------------------------
    // Actualizar el aspecto del botón
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // Inicializar al cargar la página
    // ------------------------------------------------------------
    async init() {
        if (!this.isSupported()) return;

        // Revisar si ya está suscrito para actualizar el botón
        try {
            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.getSubscription();
            this.updateButtonState(!!subscription);
        } catch (e) {
            // Silencioso
        }
    },

    // ------------------------------------------------------------
    // Utilidad: convertir clave VAPID base64 a Uint8Array
    // ------------------------------------------------------------
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