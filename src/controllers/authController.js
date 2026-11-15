// ============================================================
// src/controllers/authController.js
// ============================================================

import crypto from 'crypto';
import { env } from '../config/env.js';
import { saveSession, deleteSession, refreshSession } from '../middlewares/auth.middleware.js';

export const login = async (req, res) => {
    const { password } = req.body;
    if (password === env.adminPassword) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = Date.now() + 3600000;
        await saveSession(token, expiry, req.ip);
        res.json({ success: true, token, expires: expiry });
    } else {
        res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
    }
};

export const verifySession = async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ valid: false });
    const valid = await refreshSession(token);
    if (!valid) return res.status(401).json({ valid: false });
    res.json({ valid: true });
};

export const logout = async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) await deleteSession(token);
    res.json({ success: true });
};