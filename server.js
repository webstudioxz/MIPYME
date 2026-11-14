// ============================================================
// server.js — Tienda-FG
// ============================================================

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import apiRoutes from './src/routes/apiRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';

const __filename = fileURLToPath(import.meta.url);
let __dirname = path.dirname(__filename);

const envPaths = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '../.env'),
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '../.env')
];
for (const p of envPaths) {
    if (fs.existsSync(p)) { dotenv.config({ path: p }); console.log(`✅ [ENV] ${p}`); break; }
}

let PROJECT_ROOT = __dirname;
if (__dirname.endsWith('/src') || __dirname.endsWith('\\src')) PROJECT_ROOT = path.dirname(__dirname);
let PUBLIC_PATH = path.join(PROJECT_ROOT, 'public');
if (!fs.existsSync(PUBLIC_PATH)) {
    const fallback = path.join(process.cwd(), 'public');
    if (fs.existsSync(fallback)) PUBLIC_PATH = fallback;
}

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
    process.env.SUPABASE_URL || 'https://placeholder.supabase.co', 
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
);

const SUPERADMIN_EMAILS = (process.env.SUPERADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || req.path === '/admin' || req.path === '/admin-cliente') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

app.use(express.static(PUBLIC_PATH));

function sendHtml(res, filename) {
    const posiblesRutas = [path.join(PUBLIC_PATH, filename), path.join(PROJECT_ROOT, 'public', filename), path.join(process.cwd(), 'public', filename)];
    let foundPath = null;
    for (const p of posiblesRutas) { if (fs.existsSync(p)) { foundPath = p; break; } }
    if (!foundPath) return res.status(500).send(`<h1>Error 500</h1><p>No encontrado: ${filename}</p>`);
    res.sendFile(foundPath, (err) => { if (err && !res.headersSent) res.status(500).send('Error'); });
}

// ============ PUBLIC CONFIG ============
app.get('/api/public-config', (req, res) => {
    if (!process.env.SUPABASE_URL) return res.status(500).json({ error: "Faltan credenciales" });
    res.json({ supabaseUrl: process.env.SUPABASE_URL, supabaseAnonKey: process.env.SUPABASE_ANON_KEY });
});

// ============ PUSH ============
app.get('/api/push/public-key', (req, res) => res.json({ publicKey: process.env.VAPID_PUBLIC_KEY }));

app.get('/api/push/check', async (req, res) => {
    try {
        const { tienda } = req.query;
        let query = supabase.from('push_subscriptions').select('id');
        if (tienda) query = query.eq('tienda_id', tienda);
        else query = query.is('tienda_id', null);
        const { data } = await query.limit(1);
        res.json({ subscribed: !!(data && data.length > 0) });
    } catch (e) { res.json({ subscribed: false }); }
});

app.post('/api/push/subscribe', async (req, res) => {
    try {
        const { endpoint, keys, tienda_id } = req.body;
        if (!endpoint || !keys || !keys.p256dh || !keys.auth) return res.status(400).json({ success: false, error: 'Faltan datos' });
        let deleteQuery = supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
        if (tienda_id) deleteQuery = deleteQuery.eq('tienda_id', tienda_id);
        else deleteQuery = deleteQuery.is('tienda_id', null);
        await deleteQuery;
        const { error } = await supabase.from('push_subscriptions').insert({ endpoint, p256dh: keys.p256dh, auth: keys.auth, tienda_id: tienda_id || null });
        if (error) throw error;
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/push/test', async (req, res) => {
    try {
        const { tienda } = req.body;
        const module = await import('./src/utils/pushNotifications.js');
        await module.sendPushToAll({ title: `🧪 Prueba`, body: `Funcionan para ${tienda || 'Admin'}`, url: tienda ? `/admin-cliente?tienda=${tienda}` : '/admin', tienda });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============ MI-TIENDA ============
app.get('/api/mi-tienda', async (req, res) => {
    try {
        const { owner_id, slug } = req.query;
        if (!owner_id && !slug) return res.status(400).json({ success: false, error: 'Falta owner_id o slug' });
        let query = supabase.from('stores').select('*');
        if (slug) query = query.eq('id', slug);
        else if (owner_id) query = query.eq('owner_id', owner_id);
        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ success: false, error: 'No encontrada' });
        res.json({ success: true, store: data });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/mi-tienda/pausar', async (req, res) => {
    try {
        const { owner_id, slug, pausar } = req.body;
        const { data: tienda } = await supabase.from('stores').select('id').eq('id', slug).eq('owner_id', owner_id).maybeSingle();
        if (!tienda) return res.status(404).json({ success: false, error: 'No autorizado' });
        await supabase.from('stores').update({ pausada: pausar === true, updated_at: new Date() }).eq('id', slug);
        res.json({ success: true });
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
        await supabase.from('push_subscriptions').delete().eq('tienda_id', slug);
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

app.put('/api/mi-tienda/categorias', async (req, res) => {
    try {
        const { owner_id, slug, categorias } = req.body;
        const { data: tienda } = await supabase.from('stores').select('id').eq('id', slug).eq('owner_id', owner_id).maybeSingle();
        if (!tienda) return res.status(404).json({ success: false, error: 'No autorizado' });
        await supabase.from('stores').update({ categorias }).eq('id', slug);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ PRODUCTOS ============
app.get('/api/mis-productos', async (req, res) => {
    try {
        const { data, error } = await supabase.from('products').select('*').eq('tienda', req.query.tienda).order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/mis-productos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { tienda, owner_id, ...data } = req.body;
        const { data: store } = await supabase.from('stores').select('id').eq('id', tienda).eq('owner_id', owner_id).maybeSingle();
        if (!store) return res.status(403).json({ error: 'No autorizado' });
        delete data.created_at; delete data.id;
        data.updated_at = new Date();
        const { error } = await supabase.from('products').update(data).eq('id', id).eq('tienda', tienda);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/mis-productos', async (req, res) => {
    try {
        const { data: tienda } = await supabase.from('stores').select('max_productos').eq('id', req.body.tienda).single();
        const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('tienda', req.body.tienda);
        if (tienda && count >= (tienda.max_productos || 10)) return res.status(400).json({ error: 'Límite alcanzado' });
        const payload = {
            tienda: req.body.tienda, nombre: req.body.nombre, descripcion: req.body.descripcion || '',
            precio: parseFloat(req.body.precio), descuento: parseInt(req.body.descuento) || 0,
            categoria: req.body.categoria || 'otros', imagen: req.body.imagen || 'https://via.placeholder.com/300',
            disponible: req.body.disponible === true || req.body.disponible === 'true',
            tamanio: req.body.tamanio || 'pequeno', created_at: new Date()
        };
        if (req.body.imagen_proveedor !== undefined) payload.imagen_proveedor = req.body.imagen_proveedor;
        if (req.body.whatsapp_proveedor !== undefined) payload.whatsapp_proveedor = req.body.whatsapp_proveedor;
        if (req.body.requiere_carnet !== undefined) payload.requiere_carnet = req.body.requiere_carnet === true || req.body.requiere_carnet === 'true';
        if (req.body.imagenes_servicio !== undefined) payload.imagenes_servicio = req.body.imagenes_servicio;
        const { error } = await supabase.from('products').insert(payload);
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

// ============ RESERVAS ============
app.get('/api/reservas/disponibles', async (req, res) => {
    try {
        const { tienda, fecha } = req.query;
        if (!tienda || !fecha) return res.status(400).json({ success: false, error: 'Faltan datos' });

        const { data: store } = await supabase.from('stores').select('configuracion').eq('id', tienda).single();
        const cfg = store?.configuracion?.horario || {};
        const apertura = cfg.apertura || '09:00';
        const cierre = cfg.cierre || '18:00';
        const diasLaborables = Array.isArray(cfg.dias) ? cfg.dias : [1, 2, 3, 4, 5, 6];
        const intervalo = parseInt(cfg.intervalo) || 60;

        const fechaDate = new Date(fecha + 'T12:00:00');
        const diaSemana = fechaDate.getDay();

        if (!diasLaborables.includes(diaSemana)) {
            return res.json({ success: true, slots: [], noLaborable: true });
        }

        const [hAp, mAp] = apertura.split(':').map(Number);
        const [hCi, mCi] = cierre.split(':').map(Number);
        const startMins = hAp * 60 + (mAp || 0);
        const endMins = hCi * 60 + (mCi || 0);

        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const isToday = fecha === today;
        const currentMins = now.getHours() * 60 + now.getMinutes();

        const { data: ocupados } = await supabase.from('bookings')
            .select('hora').eq('tienda', tienda).eq('fecha', fecha);
        const ocupadasSet = new Set((ocupados || []).map(o => o.hora));

        const slots = [];
        for (let m = startMins; m < endMins; m += intervalo) {
            const h = Math.floor(m / 60);
            const min = m % 60;
            const hora = `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
            const ocupado = ocupadasSet.has(hora);
            const pasado = isToday && m <= currentMins;
            slots.push({ hora, ocupado, pasado, disponible: !ocupado && !pasado });
        }

        res.json({ success: true, slots, noLaborable: false });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/reservas', async (req, res) => {
    try {
        const { tienda, producto_id, cliente_nombre, cliente_telefono, fecha, hora } = req.body;
        if (!tienda || !producto_id || !cliente_nombre || !cliente_telefono || !fecha || !hora) {
            return res.status(400).json({ success: false, error: 'Faltan datos' });
        }
        const { data: existente } = await supabase.from('bookings').select('id').eq('tienda', tienda).eq('fecha', fecha).eq('hora', hora).maybeSingle();
        if (existente) return res.status(400).json({ success: false, error: 'Turno ya ocupado' });

        const ahora = new Date();
        if (new Date(`${fecha}T${hora}:00`) < ahora) {
            return res.status(400).json({ success: false, error: 'No puedes reservar un turno pasado' });
        }

        const { error } = await supabase.from('bookings').insert({
            tienda, producto_id, cliente_nombre, cliente_telefono, fecha, hora, estado: 'pendiente', created_at: new Date()
        });
        if (error) throw error;

        import('./src/utils/pushNotifications.js').then(m => {
            m.sendPushToAll({ title: `📅 Nueva Reserva`, body: `${cliente_nombre} - ${fecha} ${hora}`, url: `/admin-cliente?tienda=${tienda}`, tienda }).catch(console.error);
        }).catch(console.error);

        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/reservas', async (req, res) => {
    try {
        const { tienda } = req.query;
        let q = supabase.from('bookings').select('*').order('fecha', { ascending: false });
        if (tienda) q = q.eq('tienda', tienda);
        const { data } = await q;
        if (data && data.length > 0) {
            const productIds = [...new Set(data.map(b => b.producto_id))];
            const { data: prods } = await supabase.from('products').select('id, nombre, precio, imagen, imagenes_servicio, whatsapp_proveedor').in('id', productIds);
            const prodMap = {};
            (prods || []).forEach(p => prodMap[p.id] = p);
            data.forEach(b => { b.producto = prodMap[b.producto_id] || null; });
        }
        res.json(data || []);
    } catch (e) { res.json([]); }
});

app.put('/api/reservas/:id/confirmar', async (req, res) => {
    try {
        await supabase.from('bookings').update({ estado: 'confirmado' }).eq('id', req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/reservas/:id', async (req, res) => {
    try {
        await supabase.from('bookings').delete().eq('id', req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ CREAR TIENDA CLIENTE ============
app.post('/api/crear-tienda-cliente', async (req, res) => {
    try {
        const { user_id, email, nombre_dueno, nombre_negocio, tipo, telefono, plan, fecha_vencimiento, direccion, hora_apertura, hora_cierre, tasa_usd, metodos_pago, garantia, transporte } = req.body;
        if (!user_id || !nombre_negocio) return res.status(400).json({ success: false, error: 'Faltan datos' });
        const esSuperadmin = SUPERADMIN_EMAILS.includes((email || '').toLowerCase());
        if (!esSuperadmin) {
            const { data: exist } = await supabase.from('stores').select('id').eq('owner_id', user_id).maybeSingle();
            if (exist) return res.status(400).json({ success: false, error: 'Ya tienes una tienda', codigo: 'TIENDA_EXISTENTE' });
        }
        let slug = nombre_negocio.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        const { data: dup } = await supabase.from('stores').select('id').eq('id', slug).maybeSingle();
        if (dup) return res.status(400).json({ success: false, error: 'Nombre en uso', codigo: 'NOMBRE_DUPLICADO' });
        const maxProd = plan === 'premium' ? 100 : (plan === 'pro' ? 20 : (plan === 'basico' ? 10 : 5));
        const tasa = (parseFloat(tasa_usd) > 0) ? parseFloat(tasa_usd) : 25;
        const { data, error } = await supabase.from('stores').insert({
            id: slug, nombre: nombre_negocio, descripcion: 'Bienvenido a ' + nombre_negocio, icono: '🛒', categorias: ['otros'],
            configuracion: { tipo, whatsapp_por_producto: false, contacto: { telefono, email, ubicacion: direccion || 'Cuba' }, horario: { apertura: hora_apertura || '09:00', cierre: hora_cierre || '18:00', dias: [1,2,3,4,5,6], intervalo: 60 }, envio: { disponible: transporte === true, costo: 0, tiempo_estimado: '24-48h' }, garantia: { disponible: garantia === true, duracion: '12 meses', descripcion: 'Garantía del vendedor' }, metodos_pago: Array.isArray(metodos_pago) && metodos_pago.length ? metodos_pago : ['Efectivo'], datos_bancarios: { numero_tarjeta: '', whatsapp_confirmacion: telefono }, tasas: { CUP: 1, USD: 1 / tasa, EUR: 1 / (tasa * 1.1) } },
            owner_id: user_id, plan, fecha_vencimiento, estado_pago: plan === 'prueba' ? 'prueba' : 'pendiente', max_productos: maxProd, activa: true, pausada: false, es_superadmin: esSuperadmin, created_at: new Date(), updated_at: new Date()
        }).select();
        if (error) throw error;
        import('./src/utils/pushNotifications.js').then(m => { m.sendPushToAll({ title: '🏪 Nueva Tienda', body: `${nombre_negocio}`, url: '/admin', tienda: null }).catch(console.error); }).catch(console.error);
        res.json({ success: true, slug, store: data[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ SUPER-ADMIN ============
app.get('/api/superadmin/usuarios', async (req, res) => {
    try {
        const { data: userList } = await supabase.auth.admin.listUsers();
        const usuarios = await Promise.all((userList?.users || []).map(async (u) => {
            const { data: tienda } = await supabase.from('stores').select('id, nombre, plan, fecha_vencimiento, pausada, activa').eq('owner_id', u.id).maybeSingle();
            return { id: u.id, email: u.email, nombre: u.user_metadata?.full_name || 'Sin nombre', created_at: u.created_at, es_superadmin: SUPERADMIN_EMAILS.includes((u.email || '').toLowerCase()), tienda: tienda || null };
        }));
        res.json(usuarios);
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
            await supabase.from('push_subscriptions').delete().eq('tienda_id', tienda.id);
            await supabase.from('stores').delete().eq('id', tienda.id);
        }
        await supabase.auth.admin.deleteUser(req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/superadmin/tiendas', async (req, res) => {
    try {
        const { data } = await supabase.from('stores').select('*').order('created_at', { ascending: false });
        const tiendas = await Promise.all((data || []).map(async (t) => {
            const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('tienda', t.id);
            let ownerEmail = null;
            if (t.owner_id) { try { const { data: u } = await supabase.auth.admin.getUserById(t.owner_id); if (u?.user) ownerEmail = u.user.email; } catch (e) {} }
            const esMia = t.es_superadmin === true || !t.owner_id || (ownerEmail && SUPERADMIN_EMAILS.includes(ownerEmail.toLowerCase()));
            return { ...t, productos_count: count || 0, owner_email: ownerEmail, es_mia: !!esMia };
        }));
        res.json(tiendas);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/superadmin/extender/:id', async (req, res) => {
    try {
        const d = new Date(); d.setDate(d.getDate() + 30);
        await supabase.from('stores').update({ fecha_vencimiento: d.toISOString(), estado_pago: 'activo' }).eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/superadmin/pausar/:id', async (req, res) => {
    try {
        await supabase.from('stores').update({ pausada: req.body.pausar === true, updated_at: new Date() }).eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/superadmin/tiendas/:id', async (req, res) => {
    try {
        await supabase.from('products').delete().eq('tienda', req.params.id);
        await supabase.from('bookings').delete().eq('tienda', req.params.id);
        await supabase.from('orders').delete().eq('tienda', req.params.id);
        await supabase.from('push_subscriptions').delete().eq('tienda_id', req.params.id);
        await supabase.from('stores').delete().eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/superadmin/tiendas/:id/tiempo', async (req, res) => {
    try {
        const { dias, horas } = req.body;
        const { data: tienda } = await supabase.from('stores').select('fecha_vencimiento').eq('id', req.params.id).single();
        let base = new Date();
        if (tienda?.fecha_vencimiento && new Date(tienda.fecha_vencimiento) > base && !tienda.fecha_vencimiento.startsWith('9999')) base = new Date(tienda.fecha_vencimiento);
        base.setDate(base.getDate() + parseInt(dias || 0));
        base.setHours(base.getHours() + parseInt(horas || 0));
        await supabase.from('stores').update({ fecha_vencimiento: base.toISOString(), estado_pago: 'activo' }).eq('id', req.params.id);
        res.json({ success: true, nuevaFecha: base.toISOString() });
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
        const { email, nombre_negocio, nombre, icono, descripcion, categorias, telefono, email_contacto, ubicacion, apertura, cierre, tasaUSD, tasaEUR, tarjeta, whatsapp, tipo, plan, permanente } = req.body;
        const finalNombre = (nombre || nombre_negocio || '').trim();
        if (!email || !finalNombre) return res.status(400).json({ success: false, error: 'Email y nombre obligatorios' });
        const { data: userList } = await supabase.auth.admin.listUsers();
        const user = userList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
        if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        let slug = finalNombre.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        if (!slug) slug = 'tienda-' + Date.now();
        const { data: dup } = await supabase.from('stores').select('id').eq('id', slug).maybeSingle();
        if (dup) slug = slug + '-' + Math.floor(Math.random() * 1000);
        const fv = new Date(); fv.setDate(fv.getDate() + 30);
        const usd = (parseFloat(tasaUSD) > 0) ? parseFloat(tasaUSD) : 25;
        const eur = (parseFloat(tasaEUR) > 0) ? parseFloat(tasaEUR) : 27;
        let cats = ['otros'];
        if (Array.isArray(categorias) && categorias.length) cats = categorias;
        else if (typeof categorias === 'string' && categorias.trim()) cats = categorias.split(',').map(c => c.trim()).filter(Boolean);
        const maxProd = plan === 'premium' ? 100 : (plan === 'pro' ? 20 : (plan === 'basico' ? 10 : 5));
        await supabase.from('stores').insert({
            id: slug, nombre: finalNombre, descripcion: (descripcion || '').trim() || ('Bienvenido a ' + finalNombre),
            icono: (icono || '🛒').slice(0, 4), categorias: cats,
            configuracion: { tipo: tipo || 'tienda', whatsapp_por_producto: false, contacto: { telefono: telefono || '', email: email_contacto || email, ubicacion: ubicacion || '' }, horario: { apertura: apertura || '09:00', cierre: cierre || '18:00', dias: [1,2,3,4,5,6], intervalo: 60 }, envio: { disponible: true, costo: 0, tiempo_estimado: '24-48h' }, garantia: { disponible: true, duracion: '12 meses', descripcion: 'Garantía del vendedor' }, metodos_pago: ['Efectivo', 'Transferencia'], datos_bancarios: { numero_tarjeta: tarjeta || '', whatsapp_confirmacion: whatsapp || telefono || '' }, tasas: { CUP: 1, USD: 1 / usd, EUR: 1 / eur } },
            owner_id: user.id, plan: plan || 'basico', fecha_vencimiento: permanente ? '9999-12-31T23:59:59.000Z' : fv.toISOString(),
            estado_pago: 'activo', max_productos: maxProd, activa: true, pausada: false, es_superadmin: true, created_at: new Date(), updated_at: new Date()
        });
        res.json({ success: true, slug });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/superadmin/crear-producto', async (req, res) => {
    try {
        const { tienda, nombre, descripcion, precio, descuento, categoria, imagen, disponible, garantia, transporte, whatsapp_proveedor, requiere_carnet } = req.body;
        if (!tienda || !nombre || !precio) return res.status(400).json({ success: false, error: 'Faltan datos' });
        let descFinal = descripcion || '';
        if (garantia || transporte) {
            descFinal += `\n\n--- Detalles ---\n`;
            if (garantia) descFinal += `🛡️ Garantía: ${garantia}\n`;
            if (transporte) descFinal += `🚚 Transporte: ${transporte}\n`;
        }
        const { data, error } = await supabase.from('products').insert({
            tienda, nombre, descripcion: descFinal.trim(), precio: parseFloat(precio), descuento: parseInt(descuento) || 0,
            categoria: categoria || 'otros', imagen: imagen || 'https://via.placeholder.com/300',
            disponible: disponible === true || disponible === 'true', tamanio: 'pequeno',
            whatsapp_proveedor: (whatsapp_proveedor || '').trim() || null,
            requiere_carnet: requiere_carnet === true || requiere_carnet === 'true',
            created_at: new Date(), updated_at: new Date()
        }).select();
        if (error) throw error;
        res.json({ success: true, product: data[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// 🚨 NUEVA RUTA: Cambiar contexto de la tienda y activar WhatsApp por producto
app.put('/api/superadmin/tiendas/:id/contexto', async (req, res) => {
    try {
        const { id } = req.params;
        const { tipo, whatsapp_por_producto } = req.body;

        const { data: tienda } = await supabase.from('stores').select('configuracion').eq('id', id).single();
        if (!tienda) return res.status(404).json({ success: false, error: 'Tienda no encontrada' });

        const cfg = tienda.configuracion || {};
        cfg.tipo = tipo === 'reserva' ? 'reserva' : 'tienda';
        cfg.whatsapp_por_producto = whatsapp_por_producto === true;

        const { error } = await supabase.from('stores').update({
            configuracion: cfg,
            updated_at: new Date()
        }).eq('id', id);

        if (error) throw error;

        res.json({ success: true, configuracion: cfg });
    } catch (error) {
        console.error('❌ [cambiar contexto]', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

app.get('/admin-cliente', (req, res) => sendHtml(res, 'admin-cliente.html'));
app.get('/admin', (req, res) => sendHtml(res, 'admin.html'));
app.get('/', (req, res) => sendHtml(res, 'index.html'));

app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'Endpoint no encontrado' });
    sendHtml(res, 'offline.html');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Puerto ${PORT}`);
    console.log(`👑 Superadmins: ${SUPERADMIN_EMAILS.join(', ') || '⚠️ NINGUNO'}`);
});