// ============================================================
// server.js — Tienda-FG (Reservas Completas)
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

app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// API DE RESERVAS (Tienda Pública)
// ============================================
app.get('/api/reservas/disponibles', async (req, res) => {
    try {
        const { tienda, fecha } = req.query;
        const { data: store } = await supabase.from('stores').select('configuracion').eq('id', tienda).single();
        
        const dateObj = new Date(fecha + 'T12:00:00Z');
        const diaSemana = dateObj.getUTCDay();
        const diasAbiertos = store?.configuracion?.horario?.dias || [1,2,3,4,5,6];
        
        if (!diasAbiertos.includes(diaSemana)) return res.json({ slots: [], cerrado: true });

        const apertura = store?.configuracion?.horario?.apertura || '09:00';
        const cierre = store?.configuracion?.horario?.cierre || '18:00';

        const slots = [];
        let [hA] = apertura.split(':').map(Number);
        let [hC] = cierre.split(':').map(Number);
        for (let h = hA; h < hC; h++) slots.push(`${h.toString().padStart(2, '0')}:00`);

        const { data: reservas } = await supabase.from('bookings').select('hora').eq('tienda', tienda).eq('fecha', fecha);
        const ocupadas = reservas?.map(r => r.hora) || [];

        const result = slots.map(s => ({ hora: s, ocupado: ocupadas.includes(s) }));
        res.json({ slots: result });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/reservas', async (req, res) => {
    try {
        const { tienda, producto_id, cliente_nombre, cliente_telefono, fecha, hora } = req.body;

        const { data: existe } = await supabase.from('bookings').select('id').eq('tienda', tienda).eq('fecha', fecha).eq('hora', hora).single();
        if (existe) return res.status(400).json({ success: false, error: 'Este turno ya fue reservado.' });

        const { error } = await supabase.from('bookings').insert({
            tienda, producto_id, cliente_nombre, cliente_telefono, fecha, hora,
            estado: 'pendiente', created_at: new Date()
        });

        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// API DE RESERVAS (Admin) — ANTES de adminRoutes
// ============================================
app.get('/api/admin/reservas', async (req, res) => {
    try {
        const { tienda } = req.query;
        let query = supabase.from('bookings').select('*, products(nombre, precio)').order('fecha', { ascending: true }).order('hora', { ascending: true });
        if (tienda) query = query.eq('tienda', tienda);
        const { data, error } = await query;
        if (error) throw error;
        res.json(data || []);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/admin/reservas/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('bookings').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/admin/reservas/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('bookings').update({ estado: 'confirmado' }).eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
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
});