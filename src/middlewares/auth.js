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
    return res.status(401).json({ error: 'No autorizado' });
};

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