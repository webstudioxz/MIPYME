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
const BASE_URL = process.env.URL || `http://localhost:${PORT}`;

// Confianza en proxy (necesario para req.ip correcto detrás de proxy: Render, Railway, etc.)
app.set('trust proxy', 1);

// Middlewares globales
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Log simple de peticiones (solo en desarrollo)
if (process.env.NODE_ENV !== 'production') {
    app.use((req, _res, next) => {
        console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
        next();
    });
}

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

// Servir la carpeta public (con cacheo en producción)
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    etag: true
}));

// Rutas de la API
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// ============================================
// RUTAS HTML
// ============================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            console.error('❌ Error cargando index.html:', err.message);
            res.status(500).send('Error interno: no se encontró index.html.');
        }
    });
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'), (err) => {
        if (err) {
            console.error('❌ Error cargando admin.html:', err.message);
            res.status(500).send('Error interno: no se encontró admin.html.');
        }
    });
});

app.get('/admin.html', (req, res) => res.redirect(301, '/admin'));

app.get('/producto/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// 404
// ============================================
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ success: false, error: 'API endpoint no encontrado' });
    }
    // Para rutas no API, servir offline.html con status 200 (para que la PWA funcione)
    res.status(200).sendFile(path.join(__dirname, 'public', 'offline.html'), (err) => {
        if (err) {
            res.status(404).send('Página no encontrada');
        }
    });
});

// ============================================
// MANEJADOR DE ERRORES GLOBAL
// ============================================
app.use((err, _req, res, _next) => {
    console.error('❌ Error no capturado:', err);
    if (res.headersSent) return;
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Error interno del servidor'
    });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log(`🚀 Tienda-FG corriendo en puerto ${PORT}`);
    console.log(`📋 Panel Admin: ${BASE_URL}/admin`);
    console.log(`🛒 Tienda:      ${BASE_URL}/`);
    console.log(`📊 Entorno:     ${process.env.NODE_ENV || 'development'}`);
    console.log('========================================');
});

// Capturar errores no manejados para que el proceso no crashee
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
});
