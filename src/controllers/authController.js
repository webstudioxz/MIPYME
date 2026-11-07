import crypto from 'crypto';
import { sessions } from '../middlewares/auth.js';

export const login = (req, res) => {
    const { password } = req.body;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    
    console.log('🔐 Intento de login desde IP:', req.ip);
    
    if (!password) {
        return res.status(400).json({ success: false, error: 'Contraseña requerida' });
    }
    
    if (password === ADMIN_PASSWORD) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = Date.now() + 3600000;
        
        sessions.set(token, { expiry, ip: req.ip, createdAt: Date.now() });
        
        console.log(`✅ Login exitoso desde ${req.ip}`);
        res.json({ success: true, token, expires: expiry });
    } else {
        console.log(`🔴 Login fallido desde ${req.ip}`);
        res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
    }
};

export const verifySession = (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) return res.status(401).json({ valid: false });
    
    const session = sessions.get(token);
    if (!session || session.expiry < Date.now()) {
        sessions.delete(token);
        return res.status(401).json({ valid: false });
    }
    
    session.expiry = Date.now() + 3600000;
    sessions.set(token, session);
    res.json({ valid: true });
};

export const logout = (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
        sessions.delete(token);
        console.log(`👋 Logout desde ${req.ip}`);
    }
    res.json({ success: true });
};