import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import apiRoutes from './src/routes/apiRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================
// FIX: Evitar que el móvil guarde en caché versiones viejas
// ============================================
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    // Desregistrar el service worker viejo
    if (req.path === '/sw.js') {
        res.setHeader('Content-Type', 'application/javascript');
        return res.send(`
            self.addEventListener('install', e => self.skipWaiting());
            self.addEventListener('activate', e => {
                self.registration.unregister();
                return self.clients.claim();
            });
        `);
    }
    next();
});

// Detectar carpeta public
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR, { etag: false, maxAge: 0 }));

// API
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// Rutas HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

app.get('/admin.html', (req, res) => res.redirect('/admin'));

app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});