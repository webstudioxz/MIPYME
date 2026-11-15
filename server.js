// ============================================================
// server.js — Punto de entrada limpio (Monolito Modular)
// ============================================================

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { env } from './src/config/env.js'; // Carga dotenv y valida vars

// Routers separados
import apiRoutes from './src/routes/apiRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';
import superadminRoutes from './src/routes/superadmin.routes.js';
import clientesRoutes from './src/routes/clientes.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_PATH = path.join(__dirname, 'public');

const app = express();
const PORT = env.port;

// 1. Configuración base
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(PUBLIC_PATH));

// 2. Cache control para HTML
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || req.path === '/admin' || req.path === '/admin-cliente') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

// 3. Montaje de Rutas de la API
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api', clientesRoutes);

// 4. Vistas HTML
function sendHtml(res, filename) {
    const filePath = path.join(PUBLIC_PATH, filename);
    if (!fs.existsSync(filePath)) return res.status(500).send(`Error: ${filename} no encontrado`);
    res.sendFile(filePath);
}

app.get('/admin-cliente', (req, res) => sendHtml(res, 'admin-cliente.html'));
app.get('/admin', (req, res) => sendHtml(res, 'admin.html'));
app.get('/', (req, res) => sendHtml(res, 'index.html'));

// 5. 404 y Manejo de Errores
app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'Endpoint no encontrado' });
    sendHtml(res, 'offline.html');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT} (${env.nodeEnv})`);
});