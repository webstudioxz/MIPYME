// ============================================================
// src/config/vapid.js — Inicialización VAPID (una sola vez)
// ============================================================

import webpush from 'web-push';
import { env } from './env.js';

let ready = false;

try {
    webpush.setVapidDetails(
        env.vapidSubject,
        env.vapidPublicKey,
        env.vapidPrivateKey
    );
    ready = true;
    console.log('✅ [VAPID] Configurado correctamente');
} catch (error) {
    console.error('❌ [VAPID] Error de configuración:', error.message);
}

export function isVapidReady() {
    return ready;
}

export { webpush };