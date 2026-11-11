// src/controllers/authController.js
import crypto from 'crypto';
import { sessions } from '../middlewares/auth.js';

export const login = (req, res) => {
    try {
        const { password } = req.body;
        
        console.log('🔑 Intento de login recibido');

        // 1. Validar que se envíe una contraseña
        if (!password) {
            return res.status(400).json({ success: false, error: 'La contraseña está vacía' });
        }

        // 2. Verificar la contraseña contra la variable de entorno de Render
        if (password === process.env.ADMIN_PASSWORD) {
            const token = crypto.randomBytes(32).toString('hex');
            const expiry = Date.now() + 3600000; // Expira en 1 hora
            sessions.set(token, { expiry, ip: req.ip });
            
            console.log('✅ Login exitoso - Token generado');
            return res.json({ success: true, token, expires: expiry });
        } else {
            console.log('❌ Intento fallido: Contraseña incorrecta');
            return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
        }
    } catch (error) {
        console.error('🔥 Error crítico en login:', error);
        res.status(500).json({ success: false, error: 'Error interno del servidor: ' + error.message });
    }
};

export const verifySession = (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        const session = sessions.get(token);
        
        if (!session || session.expiry < Date.now()) {
            return res.status(401).json({ valid: false });
        }
        
        // Renovar sesión por 1 hora más
        session.expiry = Date.now() + 3600000;
        sessions.set(token, session);
        
        res.json({ valid: true });
    } catch (error) {
        res.status(500).json({ valid: false, error: error.message });
    }
};

export const logout = (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (token) sessions.delete(token);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};