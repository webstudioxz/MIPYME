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
const BASE_URL = process.env.URL || 'https://tienda-fg.onrender.com';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================
// FIX DEFINITIVO PARA RENDER
// ============================================
// Si __dirname termina en '/src', significa que Render está ejecutando
// desde dentro de src. Por lo tanto, 'public' está un nivel arriba.
const PUBLIC_DIR = __dirname.endsWith('/src') || __dirname.endsWith('\\src')
    ? path.join(__dirname, '..', 'public')
    : path.join(__dirname, 'public');

console.log(`========================================`);
console.log(`📁 Directorio del servidor: ${__dirname}`);
console.log(`📁 Sirviendo frontend desde: ${PUBLIC_DIR}`);
console.log(`========================================`);

app.use(express.static(PUBLIC_DIR));

// Rutas de la API
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// ============================================
// RUTAS HTML
// ============================================
app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'), (err) => {
        if (err) {
            console.error("❌ Error cargando index.html:", err.message);
            res.status(500).send("Error interno: no se encontró index.html");
        }
    });
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'admin.html'), (err) => {
        if (err) {
            console.error("❌ Error cargando admin.html:", err.message);
            res.status(500).send("Error interno: no se encontró admin.html");
        }
    });
});

app.get('/admin.html', (req, res) => res.redirect('/admin'));

app.get('/producto/:id', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// ============================================
// 404
// ============================================
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ success: false, error: 'API endpoint no encontrado' });
    }
    res.status(404).sendFile(path.join(PUBLIC_DIR, 'offline.html'), (err) => {
        if (err) {
            res.status(404).send("Página no encontrada");
        }
    });
});

// ============================================
// MANEJO GLOBAL DE ERRORES
// ============================================
app.use((err, req, res, next) => {
    console.error('❌ Error no manejado:', err);
    if (req.path.startsWith('/api/')) {
        return res.status(500).json({ success: false, error: err.message || 'Error interno' });
    }
    res.status(500).send('Error interno del servidor');
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Tienda-FG corriendo en puerto ${PORT}`);
    console.log(`📋 Panel Admin: ${BASE_URL}/admin`);
    console.log(`🌐 Tienda: ${BASE_URL}`);
    console.log(`💚 Health check: ${BASE_URL}/health`);
});