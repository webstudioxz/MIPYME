// ============================================================
// src/middlewares/errorHandler.middleware.js — Manejo central de errores
// ============================================================

import { env } from '../config/env.js';

export const notFound = (req, res) => {
    res.status(404).json({ success: false, error: 'Recurso no encontrado' });
};

export const errorHandler = (err, req, res, next) => {
    console.error('❌ [ERROR]', err.stack || err.message || err);
    if (res.headersSent) return next(err);
    const status = err.status || err.statusCode || 500;
    const message = env.isProd ? 'Error interno del servidor' : (err.message || 'Error');
    res.status(status).json({ success: false, error: message });
};