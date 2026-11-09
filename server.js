// ============================================================
// server.js — Tienda-FG (Modular con Reservas)
// ============================================================

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import apiRoutes from './src/routes/apiRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.URL || 'https://geminis-r28w.onrender.com';

// Cliente Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Anti-caché HTML
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || req.path === '/admin') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// API DE RESERVAS
// ============================================
app.get('/api/reservas/disponibles', async (req, res) => {
    try {
        const { tienda, fecha } = req.query;
        
        const { data: store } = await supabase.from('stores').select('configuracion').eq('id', tienda).single();
        const apertura = store?.configuracion?.horario?.apertura || '09:00';
        const cierre = store?.configuracion?.horario?.cierre || '18:00';

        const slots = [];
        let [hA] = apertura.split(':').map(Number);
        let [hC] = cierre.split(':').map(Number);
        
        for (let h = hA; h < hC; h++) {
            slots.push(`${h.toString().padStart(2, '0')}:00`);
        }

        const { data: reservas } = await supabase.from('bookings').select('hora').eq('tienda', tienda).eq('fecha', fecha);

        const ocupadas = reservas?.map(r => r.hora) || [];
        const result = slots.map(s => ({
            hora: s,
            ocupado: ocupadas.includes(s)
        }));

        res.json({ slots: result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/reservas', async (req, res) => {
    try {
        const { tienda, producto_id, cliente_nombre, cliente_telefono, fecha, hora } = req.body;

        // Validar si ya está ocupado
        const { data: existe } = await supabase.from('bookings').select('id').eq('tienda', tienda).eq('fecha', fecha).eq('hora', hora).single();
        if (existe) return res.status(400).json({ success: false, error: 'Este turno ya fue reservado' });

        const { error } = await supabase.from('bookings').insert({
            tienda, producto_id, cliente_nombre, cliente_telefono, fecha, hora,
            estado: 'pendiente', created_at: new Date()
        });

        if (error) throw error;
        res.json({ success: true, message: 'Reserva creada exitosamente' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// RUTAS EXISTENTES
// ============================================
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin.html', (req, res) => res.redirect('/admin'));
app.get('/producto/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'API endpoint no encontrado' });
    res.status(404).sendFile(path.join(__dirname, 'public', 'offline.html'), (err) => {
        if (err) res.status(404).send('Página no encontrada');
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`🛒 Tienda: ${BASE_URL}/`);
    console.log(`📋 Admin: ${BASE_URL}/admin`);
});