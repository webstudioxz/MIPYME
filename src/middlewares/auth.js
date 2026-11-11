// src/middlewares/auth.js
import crypto from 'crypto';

// Almacén en memoria para las sesiones activas
export const sessions = new Map();

// Limpiar sesiones expiradas automáticamente cada 5 minutos
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of sessions) {
        if (value.expiry < now) sessions.delete(key);
    }
}, 300000);

export const requireAuth = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    // Verificar que el token exista y sea válido
    if (token && sessions.has(token)) {
        const session = sessions.get(token);
        if (session.expiry > Date.now()) {
            // Renovar tiempo de vida de la sesión
            session.expiry = Date.now() + 3600000;
            sessions.set(token, session);
            return next();
        }
        sessions.delete(token);
    }
    
    // Si no hay token o expiró, bloqueamos el paso
    return res.status(401).json({ error: 'No autorizado o sesión expirada. Vuelve a iniciar sesión.' });
};

// Opcional: Mantener la función login antigua por si algún archivo la busca aquí
export const login = (req, res) => {
    const { password } = req.body;
    if (password === process.env.ADMIN_PASSWORD) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = Date.now() + 3600000;
        sessions.set(token, { expiry, ip: req.ip });
        res.json({ success: true, token, expires: expiry });
    } else {
        res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
    }
};