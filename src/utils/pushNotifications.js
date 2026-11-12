import webpush from 'web-push';
import { supabase } from '../config/supabase.js';

function configurarVapid() {
    try {
        const publicKey = process.env.VAPID_PUBLIC_KEY ? process.env.VAPID_PUBLIC_KEY.trim().replace(/\s/g, '') : '';
        const privateKey = process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PRIVATE_KEY.trim().replace(/\s/g, '') : '';
        const subject = process.env.VAPID_SUBJECT || 'mailto:admin@tienda-fg.com';
        if (!publicKey || !privateKey) return false;
        webpush.setVapidDetails(subject, publicKey, privateKey);
        return true;
    } catch (error) { return false; }
}

export async function sendPushToAll(payload) {
    try {
        if (!configurarVapid()) return;

        let query = supabase.from('push_subscriptions').select('*');
        
        // 🚨 LÓGICA DE FILTRO CORREGIDA
        if (payload.tienda) {
            // Si viene tienda, buscar solo los dispositivos de esa tienda
            query = query.eq('tienda_id', payload.tienda);
        } else {
            // Si NO viene tienda, buscar los dispositivos del Admin General (tienda_id es null)
            query = query.is('tienda_id', null);
        }

        const { data: subs } = await query;
        if (!subs || subs.length === 0) return;

        const notification = JSON.stringify({
            title: payload.title || 'Notificación 🛒',
            body: payload.body || 'Tienes una nueva alerta',
            url: payload.url || '/admin',
            tienda: payload.tienda || null
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