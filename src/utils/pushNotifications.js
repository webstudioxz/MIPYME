import webpush from 'web-push';
import { supabase } from '../config/supabase.js';

// Configurar VAPID solo si las claves existen
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@tienda-fg.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
    console.log('✅ VAPID configurado para push notifications');
} else {
    console.warn('⚠️ VAPID no configurado. Las notificaciones push no funcionarán.');
}

export async function saveSubscription(subscription, userAgent) {
    try {
        const { endpoint, keys } = subscription;
        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            throw new Error('Suscripción inválida');
        }

        const { error } = await supabase
            .from('push_subscriptions')
            .upsert({
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
                user_agent: userAgent || 'unknown'
            }, { onConflict: 'endpoint' });

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('❌ Error guardando suscripción:', error);
        return false;
    }
}

export async function sendPushToAll(payload) {
    try {
        if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
            console.warn('⚠️ Push no enviado: VAPID no configurado');
            return 0;
        }

        const { data: subs, error } = await supabase
            .from('push_subscriptions')
            .select('*');

        if (error) throw error;
        if (!subs || subs.length === 0) {
            console.log('⚠️ No hay dispositivos suscritos');
            return 0;
        }

        const notificationPayload = JSON.stringify({
            title: payload.title || 'Nuevo Pedido 🛒',
            body: payload.body || 'Tienes un nuevo pedido en tu tienda',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            url: payload.url || '/admin',
            tag: payload.tag || 'new-order',
            vibrate: [200, 100, 200, 100, 200],
            requireInteraction: true
        });

        const results = await Promise.allSettled(
            subs.map(sub => {
                const pushSubscription = {
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh, auth: sub.auth }
                };
                return webpush.sendNotification(pushSubscription, notificationPayload);
            })
        );

        const expiredEndpoints = [];
        results.forEach((result, idx) => {
            if (result.status === 'rejected') {
                const statusCode = result.reason?.statusCode;
                if (statusCode === 410 || statusCode === 404) {
                    expiredEndpoints.push(subs[idx].endpoint);
                }
            }
        });

        if (expiredEndpoints.length > 0) {
            await supabase.from('push_subscriptions').delete().in('endpoint', expiredEndpoints);
        }

        const successCount = results.filter(r => r.status === 'fulfilled').length;
        console.log(`✅ Notificación enviada a ${successCount}/${subs.length} dispositivos`);
        return successCount;
    } catch (error) {
        console.error('❌ Error enviando push:', error);
    }
}