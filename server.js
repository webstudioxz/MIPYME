// ============================================================
// server.js — Tienda-FG (AUTOLOCALIZABLE Y BLINDADO)
// ============================================================

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import apiRoutes from './src/routes/apiRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';

dotenv.config();

// 🚨 AUTOLOCALIZADOR: Encuentra la ruta real de este archivo
const __filename = fileURLToPath(import.meta.url);
let __dirname = path.dirname(__filename);

// Si Render nos metió en una carpeta "src", subimos un nivel
if (__dirname.endsWith('/src') || __dirname.endsWith('\\src')) {
    __dirname = path.dirname(__dirname);
}

const PROJECT_ROOT = __dirname;
let PUBLIC_PATH = path.join(PROJECT_ROOT, 'public');

if (!fs.existsSync(PUBLIC_PATH)) {
    const fallback = path.join(process.cwd(), 'public');
    if (fs.existsSync(fallback)) PUBLIC_PATH = fallback;
}

console.log(`📁 [AUTOLOCALIZADOR] Server.js detectado en: ${__dirname}`);
console.log(`📁 [AUTOLOCALIZADOR] Carpeta PÚBLICA detectada en: ${PUBLIC_PATH}`);

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SUPERADMIN_EMAILS = (process.env.SUPERADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Evitar caché en HTML
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || req.path === '/admin' || req.path === '/admin-cliente') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

app.use(express.static(PUBLIC_PATH));

// Helper para enviar HTML con búsqueda de rutas
function sendHtml(res, filename) {
    const posiblesRutas = [
        path.join(PUBLIC_PATH, filename),
        path.join(PROJECT_ROOT, 'public', filename),
        path.join(process.cwd(), 'public', filename)
    ];
    let foundPath = null;
    for (const p of posiblesRutas) {
        if (fs.existsSync(p)) { foundPath = p; break; }
    }
    if (!foundPath) {
        return res.status(500).send(`<h1>Error 500</h1><p>Archivo no encontrado: ${filename}</p>`);
    }
    res.sendFile(foundPath, (err) => {
        if (err && !res.headersSent) res.status(500).send('Error interno');
    });
}

// ... (Aquí van todas tus rutas API: /api/public-config, /api/crear-tienda-cliente, etc.)
// ⚠️ IMPORTANTE: No borres tus rutas API, solo asegúrate de que usen la variable supabase.

app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// Rutas HTML
app.get('/admin-cliente', (req, res) => sendHtml(res, 'admin-cliente.html'));
app.get('/admin', (req, res) => sendHtml(res, 'admin.html'));
app.get('/', (req, res) => sendHtml(res, 'index.html'));

// 404 Final
app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'API endpoint no encontrado' });
    sendHtml(res, 'offline.html');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`👑 Superadmins: ${SUPERADMIN_EMAILS.join(', ')}`);
});