// ============================================================
// public/js/admin/notifications.js
// ============================================================

window.AdminNotifications = {
    isSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; },

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
            if (!this.isSupported()) return AdminUI.showToast('❌ Navegador no soporta notificaciones', 'error');

            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return AdminUI.showToast('❌ Permiso denegado', 'error');

            const reg = await navigator.serviceWorker.register('/sw.js');
            await reg.update();
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
            const isTienda = window.location.pathname.includes('admin-cliente');
            
            if (isTienda) {
                const urlParams = new URLSearchParams(window.location.search);
                tiendaId = urlParams.get('tienda');
                if (!tiendaId && window.AdminApp?.tiendaActual) tiendaId = window.AdminApp.tiendaActual;
            }

            const subRes = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...subscription, tienda_id: tiendaId || null })
            });

            if (subRes.ok) {
                this.updateButtonState(true);
                AdminUI.showToast(tiendaId ? `🔔 Notificaciones activadas para ${tiendaId}` : `🔔 Notificaciones activadas para Admin Central`, 'success');
            }
        } catch (e) { 
            console.error(e);
            AdminUI.showToast('Error: ' + e.message, 'error'); 
        }
    },

    async unsubscribe() {
        try {
            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.getSubscription();
            if (subscription) await subscription.unsubscribe();
            this.updateButtonState(false);
            AdminUI.showToast('🔕 Desactivadas', 'warning');
        } catch (e) {}
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
            btn.innerHTML = '<span class="icon"><i class="fas fa-bell"></i></span> Notificaciones ON';
            btn.style.color = '#10B981';
            btn.style.fontWeight = '700';
        } else {
            btn.innerHTML = '<span class="icon"><i class="fas fa-bell-slash"></i></span> Activar Notificaciones';
            btn.style.color = '#F59E0B';
            btn.style.fontWeight = '500';
        }
    },

    async init() {
        if (!this.isSupported()) return;
        try {
            const subscribed = await this.isSubscribed();
            this.updateButtonState(subscribed);
        } catch (e) {}
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