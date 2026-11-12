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
import { sendPushToAll } from './src/utils/pushNotifications.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUPERADMIN_EMAILS = (process.env.SUPERADMIN_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || req.path === '/admin') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

const PUBLIC_PATH = path.join(process.cwd(), 'public');
app.use(express.static(PUBLIC_PATH));

app.get('/api/public-config', (req, res) => {
    res.json({ supabaseUrl: process.env.SUPABASE_URL, supabaseAnonKey: process.env.SUPABASE_ANON_KEY });
});

// ============================================
// CREAR TIENDA DE CLIENTE
// ============================================
app.post('/api/crear-tienda-cliente', async (req, res) => {
    try {
        const { user_id, email, nombre_dueno, nombre_negocio, tipo, telefono, plan, fecha_vencimiento,
            direccion, hora_apertura, hora_cierre, tasa_usd, metodos_pago, garantia, transporte } = req.body;
        
        if (!user_id || !nombre_negocio) return res.status(400).json({ success: false, error: 'Faltan datos' });

        const esSuperadmin = SUPERADMIN_EMAILS.includes((email || '').toLowerCase());

        if (!esSuperadmin) {
            const { data: tiendaExistente } = await supabase.from('stores').select('id').eq('owner_id', user_id).maybeSingle();
            if (tiendaExistente) return res.status(400).json({ success: false, error: 'Ya tienes una tienda creada.', codigo: 'TIENDA_EXISTENTE' });
        }

        let slug = nombre_negocio.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        const { data: existe } = await supabase.from('stores').select('id').eq('id', slug).maybeSingle();
        if (existe) return res.status(400).json({ success: false, error: `El nombre "${nombre_negocio}" ya está en uso.`, codigo: 'NOMBRE_DUPLICADO' });

        const maxProductos = plan === 'pro' ? 20 : 10;
        const tasaSegura = (parseFloat(tasa_usd) && parseFloat(tasa_usd) > 0) ? parseFloat(tasa_usd) : 25;

        const { data, error } = await supabase.from('stores').insert({
            id: slug, nombre: nombre_negocio, descripcion: 'Bienvenido a ' + nombre_negocio, icono: '🛒', categorias: ['otros'],
            configuracion: {
                tipo: tipo,
                contacto: { telefono, email, ubicacion: direccion || 'Cuba' },
                horario: { apertura: hora_apertura || '09:00', cierre: hora_cierre || '18:00', dias: [1,2,3,4,5,6] },
                envio: { disponible: transporte === true, costo: 0, tiempo_estimado: '24-48h' },
                garantia: { disponible: garantia === true, duracion: '12 meses', descripcion: 'Garantía del vendedor' },
                metodos_pago: Array.isArray(metodos_pago) && metodos_pago.length ? metodos_pago : ['Efectivo'],
                datos_bancarios: { numero_tarjeta: '', whatsapp_confirmacion: telefono },
                tasas: { CUP: 1, USD: 1 / tasaSegura, EUR: 1 / (tasaSegura * 1.1) }
            },
            owner_id: user_id, plan: plan, fecha_vencimiento: fecha_vencimiento,
            estado_pago: plan === 'prueba' ? 'prueba' : 'pendiente', max_productos: maxProductos,
            activa: true, pausada: false, es_superadmin: esSuperadmin,
            created_at: new Date(), updated_at: new Date()
        }).select();

        if (error) throw error;

        // 🚨 NOTIFICACIÓN AL ADMIN CENTRAL
        sendPushToAll({
            title: '🏪 Nueva Tienda Creada',
            body: `${nombre_negocio} ha sido registrada por ${nombre_dueno}.`,
            url: '/admin',
            tienda: null // 🚨 null = Enviar a todos (Admin General)
        }).catch(console.error);

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

app.post('/api/mi-tienda/pausar', async (req, res) => {
    try {
        const { owner_id, slug, pausar } = req.body;
        const { data: tienda } = await supabase.from('stores').select('id').eq('id', slug).eq('owner_id', owner_id).maybeSingle();
        if (!tienda) return res.status(404).json({ success: false, error: 'No autorizado' });
        await supabase.from('stores').update({ pausada: pausar === true, updated_at: new Date() }).eq('id', slug);
        res.json({ success: true, pausada: pausar === true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.delete('/api/mi-tienda/:slug', async (req, res) => {
    try {
        const { owner_id } = req.query;
        const { slug } = req.params;
        const { data: tienda } = await supabase.from('stores').select('id').eq('id', slug).eq('owner_id', owner_id).maybeSingle();
        if (!tienda) return res.status(404).json({ success: false, error: 'No autorizado' });
        await supabase.from('products').delete().eq('tienda', slug);
        await supabase.from('bookings').delete().eq('tienda', slug);
        await supabase.from('orders').delete().eq('tienda', slug);
        await supabase.from('stores').delete().eq('id', slug);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.put('/api/mi-tienda/config', async (req, res) => {
    try {
        const { owner_id, slug, configuracion } = req.body;
        const { data: tienda } = await supabase.from('stores').select('configuracion').eq('id', slug).eq('owner_id', owner_id).maybeSingle();
        if (!tienda) return res.status(404).json({ success: false, error: 'No autorizado' });
        const merged = { ...(tienda.configuracion || {}), ...configuracion };
        await supabase.from('stores').update({ configuracion: merged, updated_at: new Date() }).eq('id', slug);
        res.json({ success: true, configuracion: merged });
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
        const { data: tienda } = await supabase.from('stores').select('max_productos').eq('id', req.body.tienda).single();
        const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('tienda', req.body.tienda);
        if (tienda && count >= (tienda.max_productos || 10)) return res.status(400).json({ error: 'Límite de productos alcanzado' });
        const { error } = await supabase.from('products').insert({ ...req.body, created_at: new Date() });
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/mis-productos/:id', async (req, res) => {
    try {
        await supabase.from('products').delete().eq('id', req.params.id);
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
app.get('/api/superadmin/usuarios', async (req, res) => {
    try {
        const { data: userList } = await supabase.auth.admin.listUsers();
        const usuariosConTienda = await Promise.all((userList?.users || []).map(async (u) => {
            const { data: tienda } = await supabase.from('stores').select('id, nombre, plan, fecha_vencimiento, pausada, activa').eq('owner_id', u.id).maybeSingle();
            return { id: u.id, email: u.email, nombre: u.user_metadata?.full_name || 'Sin nombre', created_at: u.created_at, es_superadmin: SUPERADMIN_EMAILS.includes((u.email || '').toLowerCase()), tienda: tienda || null };
        }));
        res.json(usuariosConTienda);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/superadmin/usuarios/:id', async (req, res) => {
    try {
        const { data: userData } = await supabase.auth.admin.getUserById(req.params.id);
        if (SUPERADMIN_EMAILS.includes((userData.user.email || '').toLowerCase())) return res.status(403).json({ error: 'No puedes eliminar un superadmin' });
        const { data: tienda } = await supabase.from('stores').select('id').eq('owner_id', req.params.id).maybeSingle();
        if (tienda) {
            await supabase.from('products').delete().eq('tienda', tienda.id);
            await supabase.from('bookings').delete().eq('tienda', tienda.id);
            await supabase.from('orders').delete().eq('tienda', tienda.id);
            await supabase.from('stores').delete().eq('id', tienda.id);
        }
        await supabase.auth.admin.deleteUser(req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/superadmin/tiendas', async (req, res) => {
    try {
        const { data } = await supabase.from('stores').select('*').order('created_at', { ascending: false });
        const tiendasConDatos = await Promise.all((data || []).map(async (t) => {
            const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('tienda', t.id);
            let ownerEmail = 'Sin dueño';
            if (t.owner_id) {
                try { const { data: u } = await supabase.auth.admin.getUserById(t.owner_id); if (u?.user) ownerEmail = u.user.email; } catch (e) {}
            }
            return { ...t, productos_count: count || 0, owner_email: ownerEmail };
        }));
        res.json(tiendasConDatos);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/superadmin/extender/:id', async (req, res) => {
    try {
        const nuevaFecha = new Date(); nuevaFecha.setDate(nuevaFecha.getDate() + 30);
        await supabase.from('stores').update({ fecha_vencimiento: nuevaFecha.toISOString(), estado_pago: 'activo' }).eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/superadmin/pausar/:id', async (req, res) => {
    try {
        await supabase.from('stores').update({ pausada: req.body.pausar === true, updated_at: new Date() }).eq('id', req.params.id);
        res.json({ success: true, pausada: req.body.pausar === true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/superadmin/tiendas/:id', async (req, res) => {
    try {
        await supabase.from('products').delete().eq('tienda', req.params.id);
        await supabase.from('bookings').delete().eq('tienda', req.params.id);
        await supabase.from('orders').delete().eq('tienda', req.params.id);
        await supabase.from('stores').delete().eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/superadmin/tiendas/:id/tiempo', async (req, res) => {
    try {
        const { dias, horas } = req.body;
        const { data: tienda } = await supabase.from('stores').select('fecha_vencimiento').eq('id', req.params.id).single();
        let baseDate = new Date();
        if (tienda && tienda.fecha_vencimiento && new Date(tienda.fecha_vencimiento) > baseDate && !tienda.fecha_vencimiento.startsWith('9999')) {
            baseDate = new Date(tienda.fecha_vencimiento);
        }
        baseDate.setDate(baseDate.getDate() + parseInt(dias || 0));
        baseDate.setHours(baseDate.getHours() + parseInt(horas || 0));
        await supabase.from('stores').update({ fecha_vencimiento: baseDate.toISOString(), estado_pago: 'activo' }).eq('id', req.params.id);
        res.json({ success: true, nuevaFecha: baseDate.toISOString() });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/superadmin/tiendas/:id/cancelar', async (req, res) => {
    try {
        await supabase.from('stores').update({ fecha_vencimiento: new Date().toISOString(), estado_pago: 'cancelado' }).eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/superadmin/crear-tienda', async (req, res) => {
    try {
        const { email, nombre_negocio, tipo, plan, permanente } = req.body;
        const { data: userList } = await supabase.auth.admin.listUsers();
        const user = userList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
        if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        let slug = nombre_negocio.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        const { data: existe } = await supabase.from('stores').select('id').eq('id', slug).maybeSingle();
        if (existe) slug = slug + '-' + Math.floor(Math.random() * 1000);
        const fechaVencimiento = new Date(); fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);
        await supabase.from('stores').insert({
            id: slug, nombre: nombre_negocio, descripcion: 'Bienvenido a ' + nombre_negocio, icono: '🛒', categorias: ['otros'],
            configuracion: { tipo: tipo, horario: { apertura: '09:00', cierre: '18:00', dias: [1,2,3,4,5,6] }, envio: { disponible: true }, garantia: { disponible: true }, metodos_pago: ['Efectivo', 'Transferencia'], contacto: { email }, tasas: { CUP: 1, USD: 0.04, EUR: 0.037 } },
            owner_id: user.id, plan: plan, fecha_vencimiento: permanente ? '9999-12-31T23:59:59.000Z' : fechaVencimiento.toISOString(),
            estado_pago: 'activo', max_productos: plan === 'pro' ? 20 : 10, activa: true, pausada: false, es_superadmin: true,
            created_at: new Date(), updated_at: new Date()
        });
        res.json({ success: true, slug: slug });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/superadmin/crear-producto', async (req, res) => {
    try {
        const { tienda, nombre, descripcion, precio, descuento, categoria, imagen, disponible, garantia, transporte } = req.body;
        if (!tienda || !nombre || !precio) return res.status(400).json({ success: false, error: 'Faltan datos' });
        let descripcionFinal = descripcion || '';
        if (garantia || transporte) {
            descripcionFinal += `\n\n--- Detalles Adicionales ---\n`;
            if (garantia) descripcionFinal += `🛡️ Garantía: ${garantia}\n`;
            if (transporte) descripcionFinal += `🚚 Transporte: ${transporte}\n`;
        }
        const { data, error } = await supabase.from('products').insert({
            tienda, nombre, descripcion: descripcionFinal.trim(), precio: parseFloat(precio),
            descuento: parseInt(descuento) || 0, categoria: categoria || 'otros',
            imagen: imagen || 'https://via.placeholder.com/300', disponible: disponible === true || disponible === 'true',
            tamanio: 'pequeno', created_at: new Date(), updated_at: new Date()
        }).select();
        if (error) throw error;
        res.json({ success: true, product: data[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// RUTAS HTML (ORDEN CRUCIAL)
// ============================================
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

app.get('/admin-cliente', (req, res) => res.sendFile(path.join(PUBLIC_PATH, 'admin-cliente.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_PATH, 'admin.html')));
app.get('/admin.html', (req, res) => res.redirect('/admin'));
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_PATH, 'index.html')));
app.get('/producto/:id', (req, res) => res.sendFile(path.join(PUBLIC_PATH, 'index.html')));
app.get('/admin-global', (req, res) => res.redirect('/admin'));

app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'API endpoint no encontrado' });
    res.status(404).sendFile(path.join(PUBLIC_PATH, 'offline.html'), (err) => { if (err) res.status(404).send('Página no encontrada'); });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`👑 Superadmins: ${SUPERADMIN_EMAILS.length ? SUPERADMIN_EMAILS.join(', ') : '⚠️ NINGUNO'}`);
});