import webpush from 'web-push';
import { supabase } from '../config/supabase.js';

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        'mailto:admin@tienda-fg.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

export async function sendPushToAll(payload) {
    try {
        const { data: subs } = await supabase.from('push_subscriptions').select('*');
        if (!subs || subs.length === 0) return;

        const notification = JSON.stringify({
            title: payload.title || 'Nuevo Pedido 🛒',
            body: payload.body || 'Tienes un nuevo pedido',
            url: '/admin'
        });

        subs.forEach(sub => {
            webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, notification)
                .catch(err => {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint).then();
                    }
                });
        });
    } catch (error) {
        console.error('Error Push:', error);
    }
}