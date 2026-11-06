// ============================================
// AUTH MIDDLEWARE (BACKEND) - Verificación de sesiones admin
// ⚠️ Archivo del servidor. NO confundir con public/js/admin/auth.js
// ============================================
import crypto from 'crypto';

// Sesiones en memoria (para producción escalable usar Redis o DB)
export const sessions = new Map();

// Limpiar sesiones expiradas cada 5 minutos
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of sessions) {
        if (value.expiry < now) sessions.delete(key);
    }
}, 300000);

// Middleware para verificar que el admin esté logueado
export const requireAuth = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token && sessions.has(token)) {
        const session = sessions.get(token);
        if (session.expiry > Date.now()) {
            // Extender la sesión 1 hora más si está activo
            session.expiry = Date.now() + 3600000;
            sessions.set(token, session);
            return next();
        }
        sessions.delete(token);
    }

    console.log(`🔴 Intento no autorizado a ${req.path} desde ${req.ip}`);
    return res.status(401).json({
        error: 'No autorizado',
        message: 'Debes iniciar sesión para acceder a esta sección'
    });
};