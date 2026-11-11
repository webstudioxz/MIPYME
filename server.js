// ============================================================
// server.js — Tienda-FG (Corregido y con rutas absolutas)
// ============================================================

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Importación de rutas correctamente apuntadas a la carpeta src
import apiRoutes from './src/routes/apiRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Deshabilitar caché para desarrollo
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || req.path === '/admin') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

// Servir archivos estáticos desde la carpeta public
const PUBLIC_PATH = path.join(process.cwd(), 'public');
app.use(express.static(PUBLIC_PATH));

app.get('/api/public-config', (req, res) => {
    res.json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY
    });
});

// ============================================
// RUTAS DE CREACIÓN DE TIENDA CLIENTE
// ============================================
app.post('/api/crear-tienda-cliente', async (req, res) => {
    try {
        const { user_id, email, nombre_dueno, nombre_negocio, tipo, telefono, plan, fecha_vencimiento } = req.body;
        if (!user_id || !nombre_negocio) return res.status(400).json({ success: false, error: 'Faltan datos' });

        const { data: tiendaExistente } = await supabase.from('stores').select('id').eq('owner_id', user_id).maybeSingle();
        if (tiendaExistente) {
            return res.status(400).json({ 
                success: false, 
                error: 'Ya tienes una tienda creada. Solo puedes tener una por cuenta.',
                codigo: 'TIENDA_EXISTENTE'
            });
        }

        let slug = nombre_negocio.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        const { data: existe } = await supabase.from('stores').select('id').eq('id', slug).maybeSingle();
        if (existe) slug = slug + '-' + Math.floor(Math.random() * 1000);

        const maxProductos = plan === 'pro' ? 20 : 10;

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
            plan: plan,
            fecha_vencimiento: fecha_vencimiento,
            estado_pago: 'prueba',
            max_productos: maxProductos,
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
        const { owner_id, slug } = req.query;
        if (!owner_id) return res.status(400).json({ success: false, error: 'Falta owner_id' });

        let query = supabase.from('stores').select('*').eq('owner_id', owner_id);
        if (slug) query = query.eq('id', slug);

        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ success: false, error: 'Tienda no encontrada' });
        
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
// RUTAS DEL SUPER-ADMIN
// ============================================
app.get('/api/superadmin/tiendas', async (req, res) => {
    try {
        const { data, error } = await supabase.from('stores').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        
        const tiendasConDatos = await Promise.all((data || []).map(async (t) => {
            const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('tienda', t.id);
            let ownerEmail = 'Sin dueño';
            if (t.owner_id) {
                try {
                    const { data: userData } = await supabase.auth.admin.getUserById(t.owner_id);
                    if (userData?.user) ownerEmail = userData.user.email;
                } catch (e) { console.error(e); }
            }
            return { ...t, productos_count: count || 0, owner_email: ownerEmail };
        }));
        
        res.json(tiendasConDatos);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/superadmin/extender/:id', async (req, res) => {
    try {
        const nuevaFecha = new Date();
        nuevaFecha.setDate(nuevaFecha.getDate() + 30);
        const { error } = await supabase.from('stores').update({
            fecha_vencimiento: nuevaFecha.toISOString().split('T')[0],
            estado_pago: 'activo'
        }).eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/superadmin/tiendas/:id', async (req, res) => {
    try {
        await supabase.from('products').delete().eq('tienda', req.params.id);
        await supabase.from('bookings').delete().eq('tienda', req.params.id);
        await supabase.from('orders').delete().eq('tienda', req.params.id);
        const { error } = await supabase.from('stores').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/superadmin/crear-tienda', async (req, res) => {
    try {
        const { email, nombre_negocio, tipo, plan } = req.body;
        
        const { data: userList } = await supabase.auth.admin.listUsers();
        const user = userList?.users?.find(u => u.email === email);
        if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

        let slug = nombre_negocio.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        const { data: existe } = await supabase.from('stores').select('id').eq('id', slug).maybeSingle();
        if (existe) slug = slug + '-' + Math.floor(Math.random() * 1000);

        const fechaVencimiento = new Date();
        fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);

        const { error } = await supabase.from('stores').insert({
            id: slug,
            nombre: nombre_negocio,
            descripcion: 'Bienvenido a ' + nombre_negocio,
            icono: '🛒',
            categorias: ['otros'],
            configuracion: { tipo: tipo, horario: { apertura: '09:00', cierre: '18:00', dias: [1,2,3,4,5,6] } },
            owner_id: user.id,
            plan: plan,
            fecha_vencimiento: fechaVencimiento.toISOString().split('T')[0],
            estado_pago: 'activo',
            max_productos: plan === 'pro' ? 20 : 10,
            created_at: new Date(),
            updated_at: new Date()
        });

        if (error) throw error;
        res.json({ success: true, slug: slug });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// RUTAS HTML Y API PRINCIPALES
// ============================================
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_PATH, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_PATH, 'admin.html')));
app.get('/admin.html', (req, res) => res.redirect('/admin'));
app.get('/admin-cliente', (req, res) => res.sendFile(path.join(PUBLIC_PATH, 'admin-cliente.html')));
app.get('/admin-global', (req, res) => res.sendFile(path.join(PUBLIC_PATH, 'admin-global.html')));
app.get('/producto/:id', (req, res) => res.sendFile(path.join(PUBLIC_PATH, 'index.html')));

app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'API endpoint no encontrado' });
    res.status(404).sendFile(path.join(PUBLIC_PATH, 'offline.html'), (err) => {
        if (err) res.status(404).send('Página no encontrada');
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});