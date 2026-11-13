import webpush from 'web-push';
import { supabase } from '../config/supabase.js';

function configurarVapid() {
    try {
        const publicKey = process.env.VAPID_PUBLIC_KEY?.trim().replace(/\s/g, '');
        const privateKey = process.env.VAPID_PRIVATE_KEY?.trim().replace(/\s/g, '');
        const subject = process.env.VAPID_SUBJECT || 'mailto:webstudioxz@gmail.com';

        if (!publicKey || !privateKey) {
            console.error('❌ [PUSH FATAL] Las variables VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY no existen en Render.');
            return false;
        }
        
        webpush.setVapidDetails(subject, publicKey, privateKey);
        console.log('✅ [PUSH] Llaves VAPID configuradas correctamente.');
        return true;
    } catch (error) {
        console.error('❌ [PUSH FATAL] Error configurando VAPID:', error.message);
        return false;
    }
}

export async function sendPushToAll(payload) {
    try {
        if (!configurarVapid()) return;

        console.log(`\n🔍 [PUSH] Buscando dispositivos para: ${payload.tienda || 'ADMIN CENTRAL'}`);

        let query = supabase.from('push_subscriptions').select('*');
        
        if (payload.tienda) {
            query = query.eq('tienda_id', payload.tienda);
        } else {
            query = query.is('tienda_id', null);
        }

        const { data: subs, error } = await query;
        
        if (error) {
            console.error('❌ [PUSH] Error en la base de datos:', error.message);
            return;
        }

        if (!subs || subs.length === 0) {
            console.log(`⚠️ [PUSH] No se encontró ningún dispositivo suscrito para: ${payload.tienda || 'ADMIN CENTRAL'}.`);
            console.log(`👉 SOLUCIÓN: Entra al panel y haz clic en "Activar Notificaciones".`);
            return;
        }

        console.log(`✅ [PUSH] Se encontraron ${subs.length} dispositivo(s) suscritos.`);

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
                console.log(`📤 [PUSH] Notificación enviada a Google con éxito. Destino: ${sub.endpoint.slice(0, 40)}...`);
            } catch (err) {
                console.error(`❌ [PUSH] Google rechazó la notificación. Código: ${err.statusCode}`);
                if (err.statusCode === 410 || err.statusCode === 404) {
                    console.log(`🗑️ [PUSH] El dispositivo ya no existe, eliminando de la base de datos.`);
                    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
                }
                if (err.statusCode === 401 || err.statusCode === 403) {
                    console.error(`❌ [PUSH] ERROR DE LLAVES VAPID. Genera nuevas llaves y ponlas en Render.`);
                }
            }
        }
    } catch (error) {
        console.error('❌ [PUSH FATAL]', error.message);
    }
}