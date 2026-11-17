import webpush from 'web-push';
import { supabase } from '../config/supabase.js';

function configurarVapid() {
    try {
        const publicKey = process.env.VAPID_PUBLIC_KEY?.trim().replace(/\s/g, '');
        const privateKey = process.env.VAPID_PRIVATE_KEY?.trim().replace(/\s/g, '');
        const subject = process.env.VAPID_SUBJECT || 'mailto:webstudioxz@gmail.com';

        if (!publicKey || !privateKey) {
            console.error('❌ [PUSH FATAL] Faltan llaves VAPID en Render.');
            return false;
        }
        
        webpush.setVapidDetails(subject, publicKey, privateKey);
        return true;
    } catch (error) {
        console.error('❌ [PUSH FATAL] Error VAPID:', error.message);
        return false;
    }
}

export async function sendPushToAll(payload) {
    try {
        if (!configurarVapid()) return;

        console.log(`\n🔍 [PUSH] Buscando dispositivos para: ${payload.tienda || 'ADMIN CENTRAL'}`);

        let query = supabase.from('push_subscriptions').select('*');
        
        // Si viene tienda, filtramos por esa tienda. Si es null, buscamos al Admin Central.
        if (payload.tienda) {
            query = query.eq('tienda_id', payload.tienda);
        } else {
            query = query.is('tienda_id', null);
        }

        const { data: subs, error } = await query;
        
        if (error) {
            console.error('❌ [PUSH] Error DB:', error.message);
            return;
        }

        if (!subs || subs.length === 0) {
            console.log(`⚠️ [PUSH] No hay dispositivos suscritos para: ${payload.tienda || 'ADMIN CENTRAL'}.`);
            return;
        }

        console.log(`✅ [PUSH] Enviando a ${subs.length} dispositivo(s).`);

        const notification = JSON.stringify({
            title: payload.title || 'Notificación 🛒',
            body: payload.body || 'Tienes una nueva alerta',
            url: payload.url || '/admin',
            tienda: payload.tienda || null
        });

        for (const sub of subs) {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, 
                    notification
                );
                console.log(`📤 [PUSH] Notificación enviada con éxito a: ${sub.endpoint.slice(0, 40)}...`);
            } catch (err) {
                console.error(`❌ [PUSH] Google rechazó envío. Código: ${err.statusCode}`);
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
                }
            }
        }
    } catch (error) {
        console.error('❌ [PUSH FATAL]', error.message);
    }
}