// ============================================================
// src/services/push.service.js — Envío de notificaciones push
// ============================================================

import { supabase } from '../config/supabase.js';
import { webpush, isVapidReady } from '../config/vapid.js';

/**
 * Envía una notificación push a todos los dispositivos suscritos.
 * @param {Object} payload
 * @param {string} payload.title
 * @param {string} payload.body
 * @param {string} [payload.url]
 * @param {string|null} [payload.tienda]  - null/undefined = Admin Central
 */
export async function sendPushToAll(payload = {}) {
    try {
        if (!isVapidReady()) {
            console.error('❌ [PUSH] VAPID no está listo. Omitiendo envío.');
            return;
        }

        const target = payload.tienda || 'ADMIN CENTRAL';
        console.log(`\n🔍 [PUSH] Buscando dispositivos para: ${target}`);

        let query = supabase.from('push_subscriptions').select('*');
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
            console.log(`⚠️ [PUSH] Sin suscriptores para: ${target}`);
            return;
        }

        console.log(`✅ [PUSH] Enviando a ${subs.length} dispositivo(s)`);

        const notification = JSON.stringify({
            title: payload.title || 'Notificación 🛒',
            body: payload.body || 'Tienes una nueva alerta',
            url: payload.url || '/admin',
            tienda: payload.tienda || null
        });

        const staleEndpoints = [];

        for (const sub of subs) {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: { p256dh: sub.p256dh, auth: sub.auth }
                    },
                    notification
                );
                console.log(`📤 [PUSH] OK → ${sub.endpoint.slice(0, 40)}...`);
            } catch (err) {
                console.error(`❌ [PUSH] Falló (${err.statusCode}): ${sub.endpoint.slice(0, 40)}...`);
                if (err.statusCode === 410 || err.statusCode === 404) {
                    staleEndpoints.push(sub.endpoint);
                }
            }
        }

        // Limpieza de suscripciones muertas
        if (staleEndpoints.length) {
            await supabase
                .from('push_subscriptions')
                .delete()
                .in('endpoint', staleEndpoints);
            console.log(`🧹 [PUSH] Eliminadas ${staleEndpoints.length} suscripción(es) muerta(s)`);
        }
    } catch (error) {
        console.error('❌ [PUSH FATAL]', error.message);
    }
}