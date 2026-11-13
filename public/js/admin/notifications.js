window.AdminNotifications = {
    isSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; },

    // 🚨 Detecta la tienda actual desde la URL o desde AdminApp
    getTiendaId() {
        const isTienda = window.location.pathname.includes('admin-cliente');
        if (!isTienda) return null;
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('tienda') || window.AdminApp?.tiendaActual || null;
    },

    // 🚨 Usa getRegistration() en vez de ready para no colgarse si no hay SW
    async isSubscribed() {
        try {
            if (!this.isSupported()) return false;
            const reg = await navigator.serviceWorker.getRegistration();
            if (!reg) return false;
            const subscription = await reg.pushManager.getSubscription();
            return !!subscription;
        } catch (e) { return false; }
    },

    // 🚨 Pregunta al servidor si hay suscripción para esta tienda
    async isRegisteredForTienda(tiendaId) {
        try {
            const res = await fetch(`/api/push/check?tienda=${encodeURIComponent(tiendaId || '')}`);
            const data = await res.json();
            return !!data.subscribed;
        } catch (e) { return false; }
    },

    // 🚨 Re-sincroniza la suscripción del navegador con el servidor
    // para la tienda actual sin volver a pedir permiso
    async syncSubscription(tiendaId) {
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            if (!reg) return false;
            const subscription = await reg.pushManager.getSubscription();
            if (!subscription) return false;
            const subJSON = subscription.toJSON();
            if (!subJSON.keys || !subJSON.keys.p256dh) return false;
            
            const subRes = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endpoint: subscription.endpoint,
                    keys: { p256dh: subJSON.keys.p256dh, auth: subJSON.keys.auth },
                    tienda_id: tiendaId || null
                })
            });
            return subRes.ok;
        } catch (e) { 
            console.error('Error sync:', e);
            return false; 
        }
    },

    async subscribe() {
        try {
            if (!this.isSupported()) return AdminUI.showToast('❌ Navegador no soporta notificaciones', 'error');

            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return AdminUI.showToast('❌ Permiso denegado', 'error');

            // 1. Registrar SW (forzando actualización)
            const reg = await navigator.serviceWorker.register('/sw.js');
            await reg.update();
            await navigator.serviceWorker.ready;

            // 2. Eliminar suscripción vieja del navegador (para evitar error p256dh)
            let subscription = await reg.pushManager.getSubscription();
            if (subscription) {
                console.log('🗑️ Eliminando suscripción vieja...');
                await subscription.unsubscribe();
            }

            // 3. Obtener llave VAPID
            const res = await fetch('/api/push/public-key');
            const { publicKey } = await res.json();
            if (!publicKey) return AdminUI.showToast('❌ Error VAPID', 'error');

            const convertedKey = this.urlBase64ToUint8Array(publicKey);
            
            // 4. Crear nueva suscripción
            console.log('🔄 Creando nueva suscripción...');
            subscription = await reg.pushManager.subscribe({ 
                userVisibleOnly: true, 
                applicationServerKey: convertedKey 
            });

            const subJSON = subscription.toJSON();
            console.log('📦 Datos:', subJSON);

            if (!subJSON.keys || !subJSON.keys.p256dh) {
                throw new Error('El navegador no generó las llaves (p256dh)');
            }

            // 5. Obtener tienda_id (null para Admin Central, slug para tienda)
            const tiendaId = this.getTiendaId();
            console.log(`🎯 [PUSH] Registrando para: ${tiendaId || 'ADMIN CENTRAL'}`);

            // 6. Enviar al servidor
            const subRes = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    endpoint: subscription.endpoint,
                    keys: {
                        p256dh: subJSON.keys.p256dh,
                        auth: subJSON.keys.auth
                    },
                    tienda_id: tiendaId || null 
                })
            });

            if (subRes.ok) {
                this.updateButtonState(true);
                AdminUI.showToast(tiendaId ? `🔔 Notificaciones activadas para ${tiendaId}` : `🔔 Notificaciones activadas para Admin Central`, 'success');
            } else {
                const errorData = await subRes.json();
                throw new Error(errorData.error || 'Error del servidor');
            }
        } catch (e) { 
            console.error('❌ Error:', e);
            AdminUI.showToast('Error: ' + e.message, 'error'); 
        }
    },

    async unsubscribe() {
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            if (!reg) {
                this.updateButtonState(false);
                AdminUI.showToast('🔕 Desactivadas', 'warning');
                return;
            }
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

    // 🚨 Verifica navegador Y servidor, y auto-sincroniza si falta
    async init() {
        if (!this.isSupported()) return;
        try {
            const browserSubscribed = await this.isSubscribed();
            if (!browserSubscribed) {
                this.updateButtonState(false);
                return;
            }
            const tiendaId = this.getTiendaId();
            const registeredForTienda = await this.isRegisteredForTienda(tiendaId);
            if (registeredForTienda) {
                this.updateButtonState(true);
            } else {
                // El navegador tiene suscripción pero NO está en el servidor para esta tienda
                // → re-sincronizar automáticamente sin pedir permiso
                console.log(`🔄 Re-sincronizando suscripción para: ${tiendaId || 'ADMIN CENTRAL'}`);
                const ok = await this.syncSubscription(tiendaId);
                this.updateButtonState(ok);
                if (ok) {
                    AdminUI.showToast(tiendaId ? `🔔 Suscripción sincronizada para ${tiendaId}` : `🔔 Suscripción sincronizada para Admin Central`, 'success');
                }
            }
        } catch (e) {
            this.updateButtonState(false);
        }
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