// ============================================================
// server.js — Tienda-FG (Buscador Dinámico de Rutas)
// ============================================================

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// 🚨 BUSCADOR INTELIGENTE DE ARCHIVOS
// ============================================================
function findFile(startPath, targetName) {
    if (!fs.existsSync(startPath)) return null;
    
    const files = fs.readdirSync(startPath, { withFileTypes: true });
    
    for (const file of files) {
        const fullPath = path.join(startPath, file.name);
        
        // Evitar buscar en node_modules o en la carpeta public
        if (file.isDirectory() && file.name !== 'node_modules' && file.name !== 'public' && file.name !== '.git') {
            if (file.name === targetName) {
                return fullPath;
            }
            const found = findFile(fullPath, targetName);
            if (found) return found;
        } else if (file.isFile() && file.name === targetName) {
            return fullPath;
        }
    }
    return null;
}

// ============================================================
// INICIO DEL SERVIDOR Y CARGA DE RUTAS
// ============================================================
async function startServer() {
    const app = express();
    const PORT = process.env.PORT || 3000;

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Buscar apiRoutes.js y adminRoutes.js en todo el proyecto
    console.log('🔍 Buscando archivos de rutas...');
    const apiRoutesPath = findFile(__dirname, 'apiRoutes.js');
    const adminRoutesPath = findFile(__dirname, 'adminRoutes.js');

    if (!apiRoutesPath || !adminRoutesPath) {
        console.error('❌ ERROR: No se encontraron los archivos de rutas.');
        console.error('Asegúrate de que apiRoutes.js y adminRoutes.js existan en alguna carpeta.');
        process.exit(1); // Detiene el servidor si no los encuentra
    }

    console.log(`✅ apiRoutes.js encontrado en: ${apiRoutesPath}`);
    console.log(`✅ adminRoutes.js encontrado en: ${adminRoutesPath}`);

    // Importar dinámicamente usando la URL del archivo
    const { default: apiRoutes } = await import(pathToFileURL(apiRoutesPath).href);
    const { default: adminRoutes } = await import(pathToFileURL(adminRoutesPath).href);

    // Configurar Web Push
    try {
        const publicKey = process.env.VAPID_PUBLIC_KEY ? process.env.VAPID_PUBLIC_KEY.trim().replace(/\s/g, '') : '';
        const privateKey = process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PRIVATE_KEY.trim().replace(/\s/g, '') : '';
        if (publicKey && privateKey) {
            webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@tienda-fg.com', publicKey, privateKey);
        }
    } catch (error) {
        console.warn('⚠️ VAPID no configurado:', error.message);
    }

    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Middleware de caché
    app.use((req, res, next) => {
        if (req.path.endsWith('.html') || req.path === '/' || req.path === '/admin') {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
        next();
    });

    // Carpeta pública (busca la carpeta public dinámicamente)
    const publicPath = findFile(__dirname, 'index.html')?.replace('index.html', '') || path.join(process.cwd(), 'public');
    console.log(`📁 Carpeta pública en: ${publicPath}`);
    app.use(express.static(publicPath));

    // ============================================
    // RUTAS DE LA API
    // ============================================
    app.get('/api/public-config', (req, res) => {
        res.json({
            supabaseUrl: process.env.SUPABASE_URL,
            supabaseAnonKey: process.env.SUPABASE_ANON_KEY
        });
    });

    // RESERVAS
    app.get('/api/reservas/disponibles', async (req, res) => {
        try {
            const { tienda, fecha } = req.query;
            const { data: store } = await supabase.from('stores').select('configuracion').eq('id', tienda).single();
            const apertura = store?.configuracion?.horario?.apertura || '09:00';
            const cierre = store?.configuracion?.horario?.cierre || '18:00';
            const slots = [];
            let [hApertura, mApertura] = apertura.split(':').map(Number);
            let [hCierre, mCierre] = cierre.split(':').map(Number);
            let current = new Date(); current.setHours(hApertura, mApertura, 0, 0);
            let end = new Date(); end.setHours(hCierre, mCierre, 0, 0);
            while (current < end) {
                slots.push({ hora: current.toTimeString().slice(0, 5), ocupado: false });
                current.setHours(current.getHours() + 1);
            }
            const { data: reservas } = await supabase.from('bookings').select('hora').eq('tienda', tienda).eq('fecha', fecha);
            if (reservas) reservas.forEach(r => { const s = slots.find(x => x.hora === r.hora); if (s) s.ocupado = true; });
            res.json({ slots });
        } catch (error) { res.status(500).json({ error: error.message }); }
    });

    app.post('/api/reservas', async (req, res) => {
        try {
            const { tienda, producto_id, cliente_nombre, cliente_telefono, fecha, hora } = req.body;
            const { error } = await supabase.from('bookings').insert({ tienda, producto_id, cliente_nombre, cliente_telefono, fecha, hora, estado: 'pendiente' });
            if (error) throw error;
            res.json({ success: true });
        } catch (error) { res.status(500).json({ success: false, error: error.message }); }
    });

    app.get('/api/admin/reservas', async (req, res) => {
        try {
            const { data, error } = await supabase.from('bookings').select('*').eq('tienda', req.query.tienda).order('fecha', { ascending: true }).order('hora', { ascending: true });
            if (error) throw error;
            const dataConProductos = await Promise.all((data || []).map(async (b) => {
                const { data: prod } = await supabase.from('products').select('nombre, precio').eq('id', b.producto_id).single();
                return { ...b, producto: prod || null };
            }));
            res.json(dataConProductos);
        } catch (error) { res.status(500).json({ error: error.message }); }
    });

    app.delete('/api/admin/reservas/:id', async (req, res) => {
        try { await supabase.from('bookings').delete().eq('id', req.params.id); res.json({ success: true }); } 
        catch (error) { res.status(500).json({ error: error.message }); }
    });

    // CREAR TIENDA CLIENTE
    app.post('/api/crear-tienda-cliente', async (req, res) => {
        try {
            const { user_id, email, nombre_negocio, tipo, telefono, plan, fecha_vencimiento } = req.body;
            if (!user_id || !nombre_negocio) return res.status(400).json({ success: false, error: 'Faltan datos' });
            const { data: existe } = await supabase.from('stores').select('id').eq('owner_id', user_id).maybeSingle();
            if (existe) return res.status(400).json({ success: false, error: 'Ya tienes tienda', codigo: 'TIENDA_EXISTENTE' });
            
            let slug = nombre_negocio.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
            if ((await supabase.from('stores').select('id').eq('id', slug).maybeSingle()).data) slug += '-' + Math.floor(Math.random() * 1000);
            
            const { data, error } = await supabase.from('stores').insert({
                id: slug, nombre: nombre_negocio, descripcion: 'Bienvenido a ' + nombre_negocio, icono: '🛒', categorias: ['otros'],
                configuracion: { tipo, contacto: { telefono, email }, horario: { apertura: '09:00', cierre: '18:00', dias: [1,2,3,4,5,6] } },
                owner_id: user_id, plan, fecha_vencimiento, estado_pago: 'prueba', max_productos: plan === 'pro' ? 20 : 10
            }).select();
            if (error) throw error;
            res.json({ success: true, slug, store: data[0] });
        } catch (error) { res.status(500).json({ success: false, error: error.message }); }
    });

    // PANEL CLIENTE
    app.get('/api/mi-tienda', async (req, res) => {
        try {
            let q = supabase.from('stores').select('*').eq('owner_id', req.query.owner_id);
            if (req.query.slug) q = q.eq('id', req.query.slug);
            const { data, error } = await q.maybeSingle();
            if (error) throw error;
            res.json({ success: true, store: data });
        } catch (error) { res.status(500).json({ success: false, error: error.message }); }
    });
    app.get('/api/mis-productos', async (req, res) => { try { res.json((await supabase.from('products').select('*').eq('tienda', req.query.tienda)).data || []); } catch (e) { res.status(500).json({ error: e.message }); } });
    app.post('/api/mis-productos', async (req, res) => { try { await supabase.from('products').insert(req.body); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
    app.delete('/api/mis-productos/:id', async (req, res) => { try { await supabase.from('products').delete().eq('id', req.params.id); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
    app.get('/api/mis-pedidos', async (req, res) => { try { res.json((await supabase.from('orders').select('*').eq('tienda', req.query.tienda)).data || []); } catch (e) { res.status(500).json({ error: e.message }); } });

    // SUPER ADMIN
    app.get('/api/superadmin/tiendas', async (req, res) => {
        try {
            const { data } = await supabase.from('stores').select('*').order('created_at', { ascending: false });
            res.json(await Promise.all((data || []).map(async (t) => {
                const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('tienda', t.id);
                let ownerEmail = 'Sin dueño';
                if (t.owner_id) { try { const u = await supabase.auth.admin.getUserById(t.owner_id); ownerEmail = u.data?.user?.email || ownerEmail; } catch (e) {} }
                return { ...t, productos_count: count || 0, owner_email: ownerEmail };
            })));
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    app.post('/api/superadmin/extender/:id', async (req, res) => {
        try { const f = new Date(); f.setDate(f.getDate() + 30); await supabase.from('stores').update({ fecha_vencimiento: f.toISOString().split('T')[0], estado_pago: 'activo' }).eq('id', req.params.id); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
    });
    app.post('/api/superadmin/cambiar-estado', async (req, res) => {
        try { await supabase.from('stores').update({ estado_pago: req.body.estado }).eq('id', req.body.id); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
    });
    app.delete('/api/superadmin/tiendas/:id', async (req, res) => {
        try { await supabase.from('products').delete().eq('tienda', req.params.id); await supabase.from('bookings').delete().eq('tienda', req.params.id); await supabase.from('orders').delete().eq('tienda', req.params.id); await supabase.from('stores').delete().eq('id', req.params.id); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
    });
    app.post('/api/superadmin/crear-tienda', async (req, res) => {
        try {
            const { email, nombre_negocio, tipo, plan } = req.body;
            const u = (await supabase.auth.admin.listUsers()).data?.users?.find(x => x.email === email);
            if (!u) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
            let slug = nombre_negocio.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '') + '-' + Math.floor(Math.random() * 1000);
            const f = new Date(); f.setDate(f.getDate() + 30);
            await supabase.from('stores').insert({ id: slug, nombre: nombre_negocio, descripcion: 'Bienvenido', icono: '🛒', categorias: ['otros'], configuracion: { tipo, horario: { apertura: '09:00', cierre: '18:00', dias: [1,2,3,4,5,6] } }, owner_id: u.id, plan, fecha_vencimiento: f.toISOString().split('T')[0], estado_pago: 'activo', max_productos: plan === 'pro' ? 20 : 10 });
            res.json({ success: true, slug });
        } catch (e) { res.status(500).json({ success: false, error: e.message }); }
    });

    // ============================================
    // USAR LAS RUTAS ENCONTRADAS
    // ============================================
    app.use('/api', apiRoutes);
    app.use('/api/admin', adminRoutes);

    // ============================================
    // RUTAS HTML
    // ============================================
    app.get('/', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));
    app.get('/admin', (req, res) => res.sendFile(path.join(publicPath, 'admin.html')));
    app.get('/admin.html', (req, res) => res.redirect('/admin'));
    app.get('/admin-cliente', (req, res) => res.sendFile(path.join(publicPath, 'admin-cliente.html')));
    app.get('/admin-global', (req, res) => res.sendFile(path.join(publicPath, 'admin-global.html')));
    app.get('/producto/:id', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

    // 404
    app.use((req, res) => {
        if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'API no encontrada' });
        res.status(404).sendFile(path.join(publicPath, 'offline.html'), (err) => { if (err) res.status(404).send('No encontrado'); });
    });

    // ============================================
    // INICIO DEL SERVIDOR
    // ============================================
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    });
}

// Ejecutar la función de inicio
startServer().catch(err => {
    console.error('❌ Error fatal al iniciar el servidor:', err);
});