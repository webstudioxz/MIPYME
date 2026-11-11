// ============================================================
// server.js — Tienda-FG (Modular)
// ============================================================

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Importamos las rutas modulares
import apiRoutes from './src/routes/apiRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.URL || 'https://geminis-r28w.onrender.com';

// Middlewares base
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Anti-caché para HTML
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || req.path === '/admin') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

// Servir estáticos
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// RUTAS API EXISTENTES
// ============================================
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// ============================================
// 🚨 NUEVA RUTA: API DE RESERVAS
// ============================================
import { createClient } from '@supabase/supabase-js';

// Creamos un cliente local solo para la ruta de reservas
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
}

app.post('/api/reservas', async (req, res) => {
    try {
        const { tienda, producto_id, cliente_nombre, cliente_telefono, fecha, hora } = req.body;
        
        if (!supabase) {
            return res.status(500).json({ success: false, error: 'Supabase no configurado' });
        }

        const { error } = await supabase.from('bookings').insert({
            tienda: tienda,
            producto_id: producto_id,
            cliente_nombre: cliente_nombre,
            cliente_telefono: cliente_telefono,
            fecha: fecha,
            hora: hora,
            estado: 'pendiente',
            created_at: new Date()
        });

        if (error) throw error;
        res.json({ success: true, message: 'Reserva creada exitosamente' });
    } catch (error) {
        console.error('❌ Error en /api/reservas:', error);
        res.status(500).json({ success: false, error: error.message || 'Error al crear la reserva' });
    }
});

// ============================================
// RUTAS HTML
// ============================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin.html', (req, res) => res.redirect('/admin'));
app.get('/producto/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Manejo de 404
app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'API endpoint no encontrado' });
    res.status(404).sendFile(path.join(__dirname, 'public', 'offline.html'), (err) => {
        if (err) res.status(404).send('Página no encontrada');
    });
});

// Arrancar
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor Modular corriendo en puerto ${PORT}`);
    console.log(`🛒 Tienda: ${BASE_URL}/`);
    console.log(`📋 Admin: ${BASE_URL}/admin`);
});