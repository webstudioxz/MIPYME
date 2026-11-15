// ============================================================
// src/middlewares/auth.middleware.js — Sesiones con persistencia en Supabase
// ============================================================

import { supabase } from '../config/supabase.js';

const SESSION_DURATION = 3600000;

export const sessions = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [token, s] of sessions) {
        if (s.expiry < now) sessions.delete(token);
    }
}, 300000);

export async function loadSessionsFromDB() {
    try {
        const { data, error } = await supabase
            .from('admin_sessions')
            .select('token, expiry, ip')
            .gt('expiry', new Date().toISOString());
        if (error) throw error;
        (data || []).forEach(s => {
            sessions.set(s.token, {
                expiry: new Date(s.expiry).getTime(),
                ip: s.ip
            });
        });
        console.log(`✅ [SESSIONS] ${sessions.size} sesión(es) restaurada(s)`);
    } catch (e) {
        console.error('❌ [SESSIONS] Error al restaurar:', e.message);
    }
}

export async function saveSession(token, expiry, ip) {
    sessions.set(token, { expiry, ip });
    try {
        await supabase.from('admin_sessions').upsert({
            token,
            expiry: new Date(expiry).toISOString(),
            ip
        });
    } catch (e) {
        console.error('⚠️ [SESSIONS] No se pudo persistir sesión:', e.message);
    }
}

export async function deleteSession(token) {
    sessions.delete(token);
    try {
        await supabase.from('admin_sessions').delete().eq('token', token);
    } catch (e) {
        console.error('⚠️ [SESSIONS] No se pudo eliminar sesión DB:', e.message);
    }
}

export async function refreshSession(token) {
    const s = sessions.get(token);
    if (!s || s.expiry < Date.now()) {
        if (s) sessions.delete(token);
        return false;
    }
    s.expiry = Date.now() + SESSION_DURATION;
    try {
        await supabase.from('admin_sessions')
            .update({ expiry: new Date(s.expiry).toISOString() })
            .eq('token', token);
    } catch (e) {}
    return true;
}

export const requireAuth = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No autorizado' });

    const s = sessions.get(token);
    if (!s || s.expiry < Date.now()) {
        if (s) sessions.delete(token);
        return res.status(401).json({ error: 'No autorizado' });
    }

    s.expiry = Date.now() + SESSION_DURATION;
    sessions.set(token, s);

    supabase.from('admin_sessions')
        .update({ expiry: new Date(s.expiry).toISOString() })
        .eq('token', token)
        .then(() => {})
        .catch(() => {});

    next();
};
