import crypto from 'crypto';
import { sessions } from '../middlewares/auth.js';

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

export const verifySession = (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const session = sessions.get(token);
    if (!session || session.expiry < Date.now()) return res.status(401).json({ valid: false });
    session.expiry = Date.now() + 3600000;
    res.json({ valid: true });
};

export const logout = (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) sessions.delete(token);
    res.json({ success: true });
};