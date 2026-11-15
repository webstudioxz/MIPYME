// ============================================================
// src/config/env.js — Validación central de variables de entorno
// ============================================================

import dotenv from 'dotenv';
dotenv.config();

const REQUIRED = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ADMIN_PASSWORD',
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY'
];

const OPTIONAL = {
    VAPID_SUBJECT: 'mailto:webstudioxz@gmail.com',
    PORT: '3000',
    NODE_ENV: 'development'
};

function validateEnv() {
    const missing = REQUIRED.filter(k => !process.env[k] || !String(process.env[k]).trim());
    if (missing.length) {
        console.error('❌ ERROR FATAL: Faltan variables de entorno requeridas:');
        missing.forEach(k => console.error(`   - ${k}`));
        process.exit(1);
    }
}

validateEnv();

export const env = {
    // Supabase
    supabaseUrl: process.env.SUPABASE_URL.trim(),
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),

    // Auth
    adminPassword: process.env.ADMIN_PASSWORD,

    // VAPID / Push
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY.trim().replace(/\s/g, ''),
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY.trim().replace(/\s/g, ''),
    vapidSubject: (process.env.VAPID_SUBJECT || OPTIONAL.VAPID_SUBJECT).trim(),

    // Server
    port: parseInt(process.env.PORT || OPTIONAL.PORT, 10),
    nodeEnv: process.env.NODE_ENV || OPTIONAL.NODE_ENV,
    isProd: (process.env.NODE_ENV || OPTIONAL.NODE_ENV) === 'production'
};