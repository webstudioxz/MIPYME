import crypto from 'crypto';

export const sessions = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [key, value] of sessions) {
        if (value.expiry < now) sessions.delete(key);
    }
}, 300000);

export const requireAuth = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token && sessions.has(token)) {
        const session = sessions.get(token);
        if (session.expiry > Date.now()) {
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