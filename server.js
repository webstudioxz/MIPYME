// ============================================================
// server.js — Tienda-FG (Completo y Corregido)
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

// Servir estáticos usando process.cwd()
app.use(express.static(path.join(process.cwd(), 'public')));

// ============================================
// ENTREGAR CLAVES PÚBLICAS AL FRONTEND
// ============================================
app.get('/api/public-config', (req, res) => {
    res.json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY
    });
});

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

        const { data: existe } = await supabase.from('bookings').select('id').eq('tienda', tienda).eq('fecha', fecha).eq('hora', hora).maybeSingle();
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
// API DE RESERVAS (Admin)
// ============================================
app.get('/api/admin/reservas', async (req, res) => {
    try {
        const { tienda } = req.query;
        let query = supabase.from('bookings').select('*').order('fecha', { ascending: true }).order('hora', { ascending: true });
        if (tienda) query = query.eq('tienda', tienda);
        const { data, error } = await query;
        if (error) throw error;
        
        const bookingsWithProducts = await Promise.all((data || []).map(async (b) => {
            if (b.producto_id) {
                const { data: prod } = await supabase.from('products').select('nombre, precio').eq('id', b.producto_id).single();
                return { ...b, producto: prod || { nombre: 'Servicio', precio: 0 } };
            }
            return { ...b, producto: { nombre: 'Servicio', precio: 0 } };
        }));

        res.json(bookingsWithProducts);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/admin/reservas/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('bookings').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ============================================
// CREAR TIENDA DE CLIENTE
// ============================================
app.post('/api/crear-tienda-cliente', async (req, res) => {
    try {
        const { user_id, email, nombre_dueno, nombre_negocio, tipo, telefono, fecha_vencimiento } = req.body;

        if (!user_id || !nombre_negocio) {
            return res.status(400).json({ success: false, error: 'Faltan datos (user_id o nombre)' });
        }

        let slug = nombre_negocio.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        const { data: existe } = await supabase.from('stores').select('id').eq('id', slug).maybeSingle();
        if (existe) slug = slug + '-' + Math.floor(Math.random() * 1000);

        const { data, error } = await supabase.from('stores').insert({
            id: slug,
            nombre: nombre_negocio,
            descripcion: 'Bienvenido a ' + nombre_negocio,
            icono: '🛒',
            categorias: ['otros'],
            configuracion: {
                tipo: tipo,
                contacto: { telefono: telefono, email: email },
                horario: { apertura: '09:00', cierre: '18:00', dias: [1,2,3,4,5,6] }
            },
            owner_id: user_id,
            fecha_vencimiento: fecha_vencimiento,
            estado_pago: 'prueba',
            max_productos: 10,
            created_at: new Date(),
            updated_at: new Date()
        }).select();

        if (error) throw error;
        res.json({ success: true, slug: slug, store: data[0] });
    } catch (error) {
        console.error('❌ Error creando tienda:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// RUTAS DEL PANEL DEL CLIENTE
// ============================================
app.get('/api/mi-tienda', async (req, res) => {
    try {
        const { owner_id } = req.query;
        const { data, error } = await supabase.from('stores').select('*').eq('owner_id', owner_id).maybeSingle();
        
        if (error) throw error;
        if (!data) return res.status(404).json({ success: false, error: 'No se encontró tienda para este usuario' });
        
        res.json({ success: true, store: data });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/mis-productos', async (req, res) => {
    try {
        const { data, error } = await supabase.from('products').select('*').eq('tienda', req.query.tienda).order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/mis-productos', async (req, res) => {
    try {
        const { error } = await supabase.from('products').insert({ ...req.body, created_at: new Date() });
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/mis-productos/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('products').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/mis-pedidos', async (req, res) => {
    try {
        const { data, error } = await supabase.from('orders').select('*').eq('tienda', req.query.tienda).order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ============================================
// RUTAS HTML
// ============================================
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => res.sendFile(path.join(process.cwd(), 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(process.cwd(), 'public', 'admin.html')));
app.get('/admin.html', (req, res) => res.redirect('/admin'));
app.get('/admin-cliente', (req, res) => res.sendFile(path.join(process.cwd(), 'public', 'admin-cliente.html')));
app.get('/producto/:id', (req, res) => res.sendFile(path.join(process.cwd(), 'public', 'index.html')));

app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'API endpoint no encontrado' });
    res.status(404).sendFile(path.join(process.cwd(), 'public', 'offline.html'), (err) => {
        if (err) res.status(404).send('Página no encontrada');
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});