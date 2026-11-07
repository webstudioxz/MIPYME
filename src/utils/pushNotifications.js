import webpush from 'web-push';
import { supabase } from '../config/supabase.js';

// Función blindada: solo se ejecuta cuando se va a enviar una notificación
// Si las claves fallan, el servidor no se cae, solo no envía el push.
function configurarVapid() {
    try {
        const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
        const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
        const subject = process.env.VAPID_SUBJECT || 'mailto:admin@tienda-fg.com';

        if (!publicKey || !privateKey) {
            console.warn('⚠️ Faltan claves VAPID. Notificaciones Push desactivadas.');
            return false;
        }

        webpush.setVapidDetails(subject, publicKey, privateKey);
        return true;
    } catch (error) {
        console.error('⚠️ Error configurando VAPID:', error.message);
        return false;
    }
}

export async function sendPushToAll(payload) {
    try {
        if (!configurarVapid()) return;

        const { data: subs } = await supabase.from('push_subscriptions').select('*');
        if (!subs || subs.length === 0) return;

        const notification = JSON.stringify({
            title: payload.title || 'Nuevo Pedido 🛒',
            body: payload.body || 'Tienes un nuevo pedido',
            url: '/admin'
        });

        subs.forEach(sub => {
            webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, 
                notification
            ).catch(err => {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint).then();
                }
            });
        });
    } catch (error) {
        console.error('Error enviando Push:', error.message);
    }
}