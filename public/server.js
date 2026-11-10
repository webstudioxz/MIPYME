import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// 🚨 IMPORTANTE: Como este archivo está dentro de src/, las rutas cambian (../)
import apiRoutes from './routes/apiRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// La carpeta public está un nivel arriba de src (../public)
const PUBLIC_PATH = path.join(__dirname, '..', 'public');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || req.path === '/admin') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

app.use(express.static(PUBLIC_PATH));

app.get('/api/public-config', (req, res) => {
    res.json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY
    });
});

// Rutas API existentes
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// Rutas HTML
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_PATH, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_PATH, 'admin.html')));
app.get('/admin.html', (req, res) => res.redirect('/admin'));
app.get('/admin-cliente', (req, res) => res.sendFile(path.join(PUBLIC_PATH, 'admin-cliente.html')));

app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'API endpoint no encontrado' });
    res.status(404).sendFile(path.join(PUBLIC_PATH, 'offline.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});