// ============================================================
// src/utils/helpers.js — Helpers generales
// ============================================================

import crypto from 'crypto';

/**
 * Genera un código de cliente único de 12 caracteres (8 aleatorios + 4 timestamp).
 * Usa crypto.randomInt para evitar colisiones débiles de Math.random.
 */
export function generarCodigoUnico() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(crypto.randomInt(0, chars.length));
    }
    return `${code}${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

/**
 * Normaliza un teléfono cubano para wa.me
 *   - "55512345"      → "5355512345"
 *   - "+53 55512345"  → "5355512345"
 *   - "5355512345"    → "5355512345"
 * Devuelve null si no es válido.
 */
export function normalizePhone(phone) {
    if (!phone) return null;
    let n = String(phone).replace(/\D/g, '');
    if (!n) return null;
    if (n.length === 8 && n.startsWith('5')) n = '53' + n;
    if (n.length === 10 && n.startsWith('53')) return n;
    if (n.length === 11 && n.startsWith('535')) return n;
    return n.length >= 10 ? n : null;
}

/**
 * Escapa HTML básico para evitar XSS al inyectar strings en templates.
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Trunca un string a N caracteres de forma segura.
 */
export function safeSlice(value, maxLen) {
    if (value === null || value === undefined) return null;
    return String(value).slice(0, maxLen);
}

/**
 * Timestamp ISO actual.
 */
export function nowISO() {
    return new Date().toISOString();
}