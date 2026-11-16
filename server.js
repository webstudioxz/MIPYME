// ============================================================
// server.js — Tienda-FG (v11 SEGURIDAD EMPRESARIAL Y FIX BUGS)
// ============================================================

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

import apiRoutes from './src/routes/apiRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';

const __filename = fileURLToPath(import.meta.url);
let __dirname = path.dirname(__filename);

const envPaths = [path.join(__dirname, '.env'), path.join(__dirname, '../.env'), path.join(process.cwd(), '.env')];
for (const p of envPaths) { if (fs.existsSync(p)) { dotenv.config({ path: p }); break; } }

let PROJECT_ROOT = __dirname.endsWith('/src') ? path.dirname(__dirname) : __dirname;
let PUBLIC_PATH = path.join(PROJECT_ROOT, 'public');
if (!fs.existsSync(PUBLIC_PATH)) PUBLIC_PATH = path.join(process.cwd(), 'public');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || 'https://tienda-fg.onrender.com';

app.set('trust proxy', 1);

const supabase = createClient(process.env.SUPABASE_URL || 'https://placeholder.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder');
const SUPERADMIN_EMAILS = (process.env.SUPERADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || req.path === '/admin' || req.path === '/admin-cliente') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
    next();
});
app.use(express.static(PUBLIC_PATH));

function sendHtml(res, filename) {
    const rutas = [path.join(PUBLIC_PATH, filename), path.join(PROJECT_ROOT, 'public', filename)];
    for (const p of rutas) { if (fs.existsSync(p)) return res.sendFile(p); }
    res.status(500).send(`Error: ${filename} no encontrado`);
}

function deepMerge(target = {}, source = {}) {
    const output = { ...target };
    Object.keys(source || {}).forEach(key => {
        const sv = source[key], tv = target[key];
        if (sv && typeof sv === 'object' && !Array.isArray(sv) && tv && typeof tv === 'object' && !Array.isArray(tv)) output[key] = deepMerge(tv, sv);
        else output[key] = sv;
    });
    return output;
}

function normalizeDias(dias) {
    if (!Array.isArray(dias)) return [1, 2, 3, 4, 5, 6];
    const mapa = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, 'miércoles': 3, jueves: 4, viernes: 5, sabado: 6, 'sábado': 6, dom: 0, lun: 1, mar: 2, mie: 3, mié: 3, jue: 4, vie: 5, sab: 6, sáb: 6 };
    const out = new Set();
    dias.forEach(d => {
        if (typeof d === 'number' && d >= 0 && d <= 6) out.add(d);
        else if (typeof d === 'string') {
            const k = d.trim().toLowerCase();
            if (/^\d$/.test(k)) out.add(parseInt(k));
            else if (mapa[k] !== undefined) out.add(mapa[k]);
        }
    });
    return out.size ? [...out].sort() : [1, 2, 3, 4, 5, 6];
}

function generarCodigoTienda() {
    return 'FG-' + Math.random().toString(36).substring(2, 6).toUpperCase();
}

// ============ PUBLIC CONFIG ============
app.get('/api/public-config', (req, res) => {
    if (!process.env.SUPABASE_URL) return res.status(500).json({ error: "Faltan credenciales" });
    res.json({ supabaseUrl: process.env.SUPABASE_URL, supabaseAnonKey: process.env.SUPABASE_ANON_KEY, appUrl: APP_URL });
});

app.get('/api/payment-methods', async (req, res) => {
    try {
        const { data } = await supabase.from('config').select('payment_settings').eq('id', 1).maybeSingle();
        res.json(data?.payment_settings || {});
    } catch (e) { res.json({}); }
});

// ============ SISTEMA DE PAGOS ============
app.post('/api/pagos/generar', async (req, res) => {
    try {
        const { nombre, telefono, plan, meses, user_id } = req.body;
        const precios = { 'basico': 1000, 'pro': 1500, 'premium': 2500 };
        const precioMensual = precios[plan] || 0;
        const total = precioMensual * parseInt(meses || 1);
        const codigo = 'PAY-' + crypto.randomBytes(3).toString('hex').toUpperCase();
        
        // Buscar si ya tiene tienda para vincular el pago
        let store_id = null;
        if (user_id) {
            const { data: t } = await supabase.from('stores').select('id').eq('owner_id', user_id).maybeSingle();
            if (t) store_id = t.id;
        }

        const { data, error } = await supabase.from('pagos_planes').insert({
            codigo, nombre_cliente: nombre, telefono, plan, meses: parseInt(meses || 1), total, estado: 'pendiente', store_id
        }).select().single();

        if (error) throw error;
        res.json({ success: true, codigo, total });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/admin/pagos', async (req, res) => {
    try {
        const { data, error } = await supabase.from('pagos_planes').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/admin/pagos/:id', async (req, res) => {
    try {
        await supabase.from('pagos_planes').delete().eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/admin/aprobar-pago/:id', async (req, res) => {
    try {
        const { data: pago, error: errPago } = await supabase.from('pagos_planes').select('*').eq('id', req.params.id).single();
        if (errPago || !pago) return res.status(404).json({ success: false, error: 'Pago no encontrado' });

        const { slug } = req.body;
        if (!slug) return res.status(400).json({ success: false, error: 'Falta el slug de la tienda' });

        let fechaVencimiento = new Date();
        fechaVencimiento.setMonth(fechaVencimiento.getMonth() + pago.meses);

        // Activar la tienda
        await supabase.from('stores').update({
            pausada: false,
            pausada_por: null,
            pausada_mensaje: null,
            estado_pago: 'activo',
            fecha_vencimiento: fechaVencimiento.toISOString(),
            plan: pago.plan,
            max_productos: pago.plan === 'premium' ? 100 : (pago.plan === 'pro' ? 20 : 10)
        }).eq('id', slug);

        // 🚨 BORRAR EL PAGO PARA NO ACUMULAR
        await supabase.from('pagos_planes').delete().eq('id', req.params.id);

        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ PUSH ============
app.get('/api/push/public-key', (req, res) => res.json({ publicKey: process.env.VAPID_PUBLIC_KEY }));
app.get('/api/push/check', async (req, res) => { try { const { tienda } = req.query; let q = supabase.from('push_subscriptions').select('id'); if (tienda) q = q.eq('tienda_id', tienda); else q = q.is('tienda_id', null); const { data } = await q.limit(1); res.json({ subscribed: !!(data && data.length > 0) }); } catch (e) { res.json({ subscribed: false }); } });
app.post('/api/push/subscribe', async (req, res) => { try { const { endpoint, keys, tienda_id } = req.body; if (!endpoint || !keys || !keys.p256dh || !keys.auth) return res.status(400).json({ success: false, error: 'Faltan datos' }); let del = supabase.from('push_subscriptions').delete().eq('endpoint', endpoint); if (tienda_id) del = del.eq('tienda_id', tienda_id); else del = del.is('tienda_id', null); await del; const { error } = await supabase.from('push_subscriptions').insert({ endpoint, p256dh: keys.p256dh, auth: keys.auth, tienda_id: tienda_id || null }); if (error) throw error; res.json({ success: true }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
app.post('/api/push/test', async (req, res) => { try { const { tienda } = req.body; const module = await import('./src/utils/pushNotifications.js'); await module.sendPushToAll({ title: `🧪 Prueba`, body: `Funcionan para ${tienda || 'Admin'}`, url: tienda ? `${APP_URL}/admin-cliente?tienda=${tienda}` : `${APP_URL}/admin`, tienda }); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });

// ============ MI-TIENDA ============
app.get('/api/mi-tienda', async (req, res) => { try { const { owner_id, slug } = req.query; if (!owner_id && !slug) return res.status(400).json({ success: false, error: 'Falta id' }); let q = supabase.from('stores').select('*'); if (slug) q = q.eq('id', slug); else if (owner_id) q = q.eq('owner_id', owner_id); const { data, error } = await q.maybeSingle(); if (error) throw error; if (!data) return res.status(404).json({ success: false, error: 'No encontrada' }); res.json({ success: true, store: data }); } catch (error) { res.status(500).json({ success: false, error: error.message }); } });
app.post('/api/mi-tienda/pausar', async (req, res) => { try { const { owner_id, slug, pausar, mensaje } = req.body; const { data: t } = await supabase.from('stores').select('id').eq('id', slug).eq('owner_id', owner_id).maybeSingle(); if (!t) return res.status(404).json({ success: false, error: 'No autorizado' }); const update = { pausada: pausar === true, updated_at: new Date() }; if (pausar === true) { update.pausada_por = 'owner'; update.pausada_mensaje = (mensaje || 'Volvemos mañana').toString().slice(0, 200); } else { update.pausada_por = null; update.pausada_mensaje = null; } await supabase.from('stores').update(update).eq('id', slug); res.json({ success: true }); } catch (error) { res.status(500).json({ success: false, error: error.message }); } });
app.delete('/api/mi-tienda/:slug', async (req, res) => { try { const { owner_id } = req.query; const { slug } = req.params; const { data: t } = await supabase.from('stores').select('id').eq('id', slug).eq('owner_id', owner_id).maybeSingle(); if (!t) return res.status(404).json({ success: false, error: 'No autorizado' }); await borrarTodoDeTienda(slug); res.json({ success: true }); } catch (error) { res.status(500).json({ success: false, error: error.message }); } });
app.put('/api/mi-tienda/config', async (req, res) => { try { const { owner_id, slug, configuracion } = req.body; if (!slug) return res.status(400).json({ success: false, error: 'Falta slug' }); if (owner_id) { const { data: t } = await supabase.from('stores').select('configuracion').eq('id', slug).eq('owner_id', owner_id).maybeSingle(); if (!t) return res.status(404).json({ success: false, error: 'No autorizado' }); } const { data: current } = await supabase.from('stores').select('configuracion').eq('id', slug).maybeSingle(); if (!current) return res.status(404).json({ success: false, error: 'No encontrada' }); const incoming = { ...(configuracion || {}) }; if (incoming.horario && incoming.horario.dias !== undefined) incoming.horario.dias = normalizeDias(incoming.horario.dias); const merged = deepMerge(current.configuracion || {}, incoming); if (!merged.horario) merged.horario = {}; if (!Array.isArray(merged.horario.dias)) merged.horario.dias = [1,2,3,4,5,6]; const { error } = await supabase.from('stores').update({ configuracion: merged, updated_at: new Date() }).eq('id', slug); if (error) throw error; res.json({ success: true, configuracion: merged }); } catch (error) { res.status(500).json({ success: false, error: error.message }); } });
app.put('/api/mi-tienda/categorias', async (req, res) => { try { const { owner_id, slug, categorias } = req.body; const { data: t } = await supabase.from('stores').select('id').eq('id', slug).eq('owner_id', owner_id).maybeSingle(); if (!t) return res.status(404).json({ success: false, error: 'No autorizado' }); await supabase.from('stores').update({ categorias }).eq('id', slug); res.json({ success: true }); } catch (error) { res.status(500).json({ success: false, error: error.message }); } });

// ============ PRODUCTOS ============
app.get('/api/mis-productos', async (req, res) => { try { const { data, error } = await supabase.from('products').select('*').eq('tienda', req.query.tienda).order('created_at', { ascending: false }); if (error) throw error; res.json(data || []); } catch (error) { res.status(500).json({ error: error.message }); } });
app.put('/api/mis-productos/:id', async (req, res) => { try { const { id } = req.params; const { tienda, owner_id, ...data } = req.body; const { data: store } = await supabase.from('stores').select('id').eq('id', tienda).eq('owner_id', owner_id).maybeSingle(); if (!store) return res.status(403).json({ error: 'No autorizado' }); delete data.created_at; delete data.id; data.updated_at = new Date(); const { error } = await supabase.from('products').update(data).eq('id', id).eq('tienda', tienda); if (error) throw error; res.json({ success: true }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.post('/api/mis-productos', async (req, res) => { try { const { data: tienda } = await supabase.from('stores').select('max_productos').eq('id', req.body.tienda).single(); const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('tienda', req.body.tienda); if (tienda && count >= (tienda.max_productos || 10)) return res.status(400).json({ error: 'Límite alcanzado' }); const payload = { tienda: req.body.tienda, nombre: req.body.nombre, descripcion: req.body.descripcion || '', precio: parseFloat(req.body.precio), descuento: parseInt(req.body.descuento) || 0, categoria: req.body.categoria || 'otros', imagen: req.body.imagen || 'https://via.placeholder.com/300', disponible: req.body.disponible === true || req.body.disponible === 'true', tamanio: req.body.tamanio || 'pequeno', created_at: new Date() }; if (req.body.imagen_proveedor !== undefined) payload.imagen_proveedor = req.body.imagen_proveedor; if (req.body.whatsapp_proveedor !== undefined) payload.whatsapp_proveedor = req.body.whatsapp_proveedor; if (req.body.contacto_nombre !== undefined) payload.contacto_nombre = (req.body.contacto_nombre || '').toString().trim() || null; if (req.body.requiere_carnet !== undefined) payload.requiere_carnet = req.body.requiere_carnet === true || req.body.requiere_carnet === 'true'; if (req.body.imagenes_servicio !== undefined) payload.imagenes_servicio = req.body.imagenes_servicio; const { error } = await supabase.from('products').insert(payload); if (error) throw error; res.json({ success: true }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.delete('/api/mis-productos/:id', async (req, res) => { try { await supabase.from('products').delete().eq('id', req.params.id); res.json({ success: true }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/mis-pedidos', async (req, res) => { try { const { data, error } = await supabase.from('orders').select('*').eq('tienda', req.query.tienda).order('created_at', { ascending: false }); if (error) throw error; res.json(data || []); } catch (error) { res.status(500).json({ error: error.message }); } });

// ============ RESERVAS ============
app.get('/api/reservas/disponibles', async (req, res) => { try { const { tienda, fecha } = req.query; if (!tienda || !fecha) return res.status(400).json({ success: false, error: 'Faltan datos' }); const { data: store } = await supabase.from('stores').select('configuracion').eq('id', tienda).single(); const cfg = store?.configuracion?.horario || {}; const apertura = cfg.apertura || '09:00'; const cierre = cfg.cierre || '18:00'; const diasLaborables = normalizeDias(cfg.dias); const intervalo = parseInt(cfg.intervalo) || 60; const fechaDate = new Date(fecha + 'T12:00:00'); const diaSemana = fechaDate.getDay(); if (!diasLaborables.includes(diaSemana)) return res.json({ success: true, slots: [], noLaborable: true }); const [hAp, mAp] = apertura.split(':').map(Number); const [hCi, mCi] = cierre.split(':').map(Number); const startMins = hAp * 60 + (mAp || 0); const endMins = hCi * 60 + (mCi || 0); const now = new Date(); const today = now.toISOString().split('T')[0]; const isToday = fecha === today; const currentMins = now.getHours() * 60 + now.getMinutes(); const { data: ocupados } = await supabase.from('bookings').select('hora').eq('tienda', tienda).eq('fecha', fecha); const ocupadasSet = new Set((ocupados || []).map(o => o.hora)); const slots = []; for (let m = startMins; m < endMins; m += intervalo) { const h = Math.floor(m / 60); const min = m % 60; const hora = `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`; const ocupado = ocupadasSet.has(hora); const pasado = isToday && m <= currentMins; slots.push({ hora, ocupado, pasado, disponible: !ocupado && !pasado }); } res.json({ success: true, slots, noLaborable: false }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
app.post('/api/reservas', async (req, res) => { try { const { tienda, producto_id, cliente_nombre, cliente_telefono, fecha, hora } = req.body; if (!tienda || !producto_id || !cliente_nombre || !cliente_telefono || !fecha || !hora) return res.status(400).json({ success: false, error: 'Faltan datos' }); const { data: ex } = await supabase.from('bookings').select('id').eq('tienda', tienda).eq('fecha', fecha).eq('hora', hora).maybeSingle(); if (ex) return res.status(400).json({ success: false, error: 'Turno ya ocupado' }); const ahora = new Date(); if (new Date(`${fecha}T${hora}:00`) < ahora) return res.status(400).json({ success: false, error: 'Turno pasado' }); const { error } = await supabase.from('bookings').insert({ tienda, producto_id, cliente_nombre, cliente_telefono, fecha, hora, estado: 'pendiente', created_at: new Date() }); if (error) throw error; import('./src/utils/pushNotifications.js').then(m => { m.sendPushToAll({ title: `📅 Nueva Reserva`, body: `${cliente_nombre} - ${fecha} ${hora}`, url: `${APP_URL}/admin-cliente?tienda=${tienda}`, tienda }).catch(console.error); }).catch(console.error); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
app.get('/api/reservas', async (req, res) => { try { const { tienda } = req.query; let q = supabase.from('bookings').select('*').order('fecha', { ascending: false }); if (tienda) q = q.eq('tienda', tienda); const { data } = await q; if (data && data.length > 0) { const ids = [...new Set(data.map(b => b.producto_id))]; const { data: prods } = await supabase.from('products').select('id, nombre, precio, imagen, imagenes_servicio, whatsapp_proveedor, contacto_nombre').in('id', ids); const map = {}; (prods || []).forEach(p => map[p.id] = p); data.forEach(b => { b.producto = map[b.producto_id] || null; }); } res.json(data || []); } catch (e) { res.json([]); } });
app.put('/api/reservas/:id/confirmar', async (req, res) => { try { await supabase.from('bookings').update({ estado: 'confirmado' }).eq('id', req.params.id); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/reservas/:id', async (req, res) => { try { await supabase.from('bookings').delete().eq('id', req.params.id); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// ============ CREAR/ACTUALIZAR TIENDA ============
app.post('/api/crear-tienda-cliente', async (req, res) => {
    try {
        const { user_id, email, nombre_negocio, tipo, telefono, plan, direccion, hora_apertura, hora_cierre, tasa_usd, metodos_pago, garantia, transporte, dias_laborables, notificaciones_modo } = req.body;
        if (!user_id || !nombre_negocio) return res.status(400).json({ success: false, error: 'Faltan datos' });
        
        const esSuperadmin = SUPERADMIN_EMAILS.includes((email || '').toLowerCase());
        const { data: exist } = await supabase.from('stores').select('*').eq('owner_id', user_id).maybeSingle();
        
        // 🚨 LÓGICA DE ACTUALIZACIÓN / BLOQUEO
        if (exist && !esSuperadmin) {
            if (plan === 'prueba') {
                return res.status(400).json({ success: false, error: 'Ya tienes una tienda. Para cambiar de plan, elige un plan de pago.', codigo: 'TIENDA_EXISTENTE' });
            } else {
                // Es una actualización de plan
                const newMaxProd = plan === 'premium' ? 100 : (plan === 'pro' ? 20 : 10);
                await supabase.from('stores').update({
                    plan: plan,
                    max_productos: newMaxProd,
                    pausada: true,
                    pausada_por: 'admin',
                    pausada_mensaje: 'Pago de actualización en revisión'
                }).eq('id', exist.id);
                return res.json({ success: true, slug: exist.id, isUpgrade: true });
            }
        }
        
        let slug = nombre_negocio.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        const { data: dup } = await supabase.from('stores').select('id').eq('id', slug).maybeSingle();
        if (dup) return res.status(400).json({ success: false, error: 'Nombre en uso', codigo: 'NOMBRE_DUPLICADO' });
        
        const maxProd = plan === 'premium' ? 100 : (plan === 'pro' ? 20 : (plan === 'basico' ? 10 : 5));
        const tasa = (parseFloat(tasa_usd) > 0) ? parseFloat(tasa_usd) : 25;
        const diasFinales = dias_laborables !== undefined ? normalizeDias(dias_laborables) : [1,2,3,4,5,6];
        const modoNotif = ['admin', 'whatsapp', 'ambos'].includes(notificaciones_modo) ? notificaciones_modo : 'admin';
        const esPago = plan !== 'prueba';
        const pausada = esPago;
        const pausada_por = esPago ? 'admin' : null;
        const pausada_mensaje = esPago ? 'Pago en revisión. Envía tu comprobante al WhatsApp.' : null;

        const { data, error } = await supabase.from('stores').insert({
            id: slug, nombre: nombre_negocio, descripcion: 'Bienvenido a ' + nombre_negocio, icono: '🛒', categorias: ['otros'],
            store_code: generarCodigoTienda(), // 🚨 CÓDIGO ÚNICO
            configuracion: {
                tipo, whatsapp_por_producto: false, notificaciones_modo: modoNotif,
                contacto: { telefono, email, ubicacion: direccion || 'Cuba' },
                horario: { apertura: hora_apertura || '09:00', cierre: hora_cierre || '18:00', dias: diasFinales, intervalo: 60 },
                envio: { disponible: transporte === true, costo: 0, tiempo_estimado: '24-48h' },
                garantia: { disponible: garantia === true, duracion: '12 meses', descripcion: 'Garantía del vendedor' },
                metodos_pago: Array.isArray(metodos_pago) && metodos_pago.length ? metodos_pago : ['Efectivo'],
                datos_bancarios: { numero_tarjeta: '', whatsapp_confirmacion: telefono },
                tasas: { CUP: 1, USD: 1 / tasa, EUR: 1 / (tasa * 1.1) }
            },
            owner_id: user_id, plan, fecha_vencimiento: null, estado_pago: esPago ? 'pendiente' : 'activo', max_productos: maxProd, activa: true, pausada, pausada_por, pausada_mensaje, es_superadmin: esSuperadmin, created_at: new Date(), updated_at: new Date()
        }).select();
        
        if (error) throw error;
        import('./src/utils/pushNotifications.js').then(m => { m.sendPushToAll({ title: esPago ? '💰 Nueva Tienda Pendiente' : '🏪 Nueva Tienda', body: `${nombre_negocio}`, url: `${APP_URL}/admin`, tienda: null }).catch(console.error); }).catch(console.error);
        res.json({ success: true, slug, store: data[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ SUPER-ADMIN ============
app.get('/api/superadmin/usuarios', async (req, res) => { try { const { data: userList } = await supabase.auth.admin.listUsers(); const users = await Promise.all((userList?.users || []).map(async (u) => { const { data: t } = await supabase.from('stores').select('id, nombre, plan, fecha_vencimiento, pausada, activa, pausada_por, pausada_mensaje, estado_pago, store_code').eq('owner_id', u.id).maybeSingle(); return { id: u.id, email: u.email, nombre: u.user_metadata?.full_name || 'Sin nombre', created_at: u.created_at, es_superadmin: SUPERADMIN_EMAILS.includes((u.email || '').toLowerCase()), tienda: t || null }; })); res.json(users); } catch (error) { res.status(500).json({ error: error.message }); } });
app.delete('/api/superadmin/usuarios/:id', async (req, res) => { try { const { data: uD } = await supabase.auth.admin.getUserById(req.params.id); if (SUPERADMIN_EMAILS.includes((uD.user.email || '').toLowerCase())) return res.status(403).json({ error: 'No puedes eliminar un superadmin' }); const { data: t } = await supabase.from('stores').select('id').eq('owner_id', req.params.id).maybeSingle(); if (t) await borrarTodoDeTienda(t.id); await supabase.auth.admin.deleteUser(req.params.id); res.json({ success: true }); } catch (error) { res.status(500).json({ success: false, error: error.message }); } });
app.get('/api/superadmin/tiendas', async (req, res) => { try { const { data } = await supabase.from('stores').select('*').order('created_at', { ascending: false }); const stores = await Promise.all((data || []).map(async (t) => { const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('tienda', t.id); let ownerEmail = null; if (t.owner_id) { try { const { data: u } = await supabase.auth.admin.getUserById(t.owner_id); if (u?.user) ownerEmail = u.user.email; } catch (e) {} } const esMia = t.es_superadmin === true || !t.owner_id || (ownerEmail && SUPERADMIN_EMAILS.includes(ownerEmail.toLowerCase())); return { ...t, productos_count: count || 0, owner_email: ownerEmail, es_mia: !!esMia }; })); res.json(stores); } catch (error) { res.status(500).json({ error: error.message }); } });
app.put('/api/superadmin/payment-methods', async (req, res) => { try { const { bank, qr, whatsapp } = req.body; const payment_settings = { bank, qr, whatsapp }; const { data: current } = await supabase.from('config').select('*').eq('id', 1).maybeSingle(); if (current) await supabase.from('config').update({ payment_settings }).eq('id', 1); else await supabase.from('config').insert({ id: 1, moneda_base: 'CUP', tasas: { CUP: 1, USD: 0.04, EUR: 0.037 }, payment_settings }); res.json({ success: true, payment_settings }); } catch (error) { res.status(500).json({ success: false, error: error.message }); } });
app.post('/api/superadmin/extender/:id', async (req, res) => { try { const d = new Date(); d.setDate(d.getDate() + 30); await supabase.from('stores').update({ fecha_vencimiento: d.toISOString(), estado_pago: 'activo' }).eq('id', req.params.id); res.json({ success: true }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.post('/api/superadmin/pausar/:id', async (req, res) => { try { const pausar = req.body.pausar === true; const up = { pausada: pausar, updated_at: new Date() }; if (pausar) { up.pausada_por = 'admin'; up.pausada_mensaje = (req.body.mensaje || 'Tienda pausada por administración').toString().slice(0, 200); } else { up.pausada_por = null; up.pausada_mensaje = null; } await supabase.from('stores').update(up).eq('id', req.params.id); res.json({ success: true }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.delete('/api/superadmin/tiendas/:id', async (req, res) => { try { await borrarTodoDeTienda(req.params.id); res.json({ success: true }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.post('/api/superadmin/tiendas/:id/tiempo', async (req, res) => { try { const { dias, horas } = req.body; const { data: t } = await supabase.from('stores').select('fecha_vencimiento').eq('id', req.params.id).single(); let base = new Date(); if (t?.fecha_vencimiento && new Date(t.fecha_vencimiento) > base && !t.fecha_vencimiento.startsWith('9999')) base = new Date(t.fecha_vencimiento); base.setDate(base.getDate() + parseInt(dias || 0)); base.setHours(base.getHours() + parseInt(horas || 0)); await supabase.from('stores').update({ fecha_vencimiento: base.toISOString(), estado_pago: 'activo' }).eq('id', req.params.id); res.json({ success: true, nuevaFecha: base.toISOString() }); } catch (error) { res.status(500).json({ success: false, error: error.message }); } });
app.post('/api/superadmin/tiendas/:id/cancelar', async (req, res) => { try { await supabase.from('stores').update({ fecha_vencimiento: new Date().toISOString(), estado_pago: 'cancelado' }).eq('id', req.params.id); res.json({ success: true }); } catch (error) { res.status(500).json({ success: false, error: error.message }); } });
app.post('/api/superadmin/crear-tienda', async (req, res) => { try { const { email, nombre_negocio, nombre, icono, descripcion, categorias, telefono, email_contacto, ubicacion, apertura, cierre, tasaUSD, tasaEUR, tarjeta, whatsapp, tipo, plan, permanente, dias_laborables, notificaciones_modo } = req.body; const finalNombre = (nombre || nombre_negocio || '').trim(); if (!email || !finalNombre) return res.status(400).json({ success: false, error: 'Email y nombre obligatorios' }); const { data: uL } = await supabase.auth.admin.listUsers(); const user = uL?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase()); if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' }); let slug = finalNombre.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, ''); if (!slug) slug = 'tienda-' + Date.now(); const { data: dup } = await supabase.from('stores').select('id').eq('id', slug).maybeSingle(); if (dup) slug = slug + '-' + Math.floor(Math.random() * 1000); const fv = new Date(); fv.setDate(fv.getDate() + 30); const usd = (parseFloat(tasaUSD) > 0) ? parseFloat(tasaUSD) : 25; const eur = (parseFloat(tasaEUR) > 0) ? parseFloat(tasaEUR) : 27; let cats = ['otros']; if (Array.isArray(categorias) && categorias.length) cats = categorias; else if (typeof categorias === 'string' && categorias.trim()) cats = categorias.split(',').map(c => c.trim()).filter(Boolean); const maxProd = plan === 'premium' ? 100 : (plan === 'pro' ? 20 : (plan === 'basico' ? 10 : 5)); const diasFinales = dias_laborables !== undefined ? normalizeDias(dias_laborables) : [1,2,3,4,5,6]; const modoNotif = ['admin', 'whatsapp', 'ambos'].includes(notificaciones_modo) ? notificaciones_modo : 'admin'; await supabase.from('stores').insert({ id: slug, nombre: finalNombre, descripcion: (descripcion || '').trim() || ('Bienvenido a ' + finalNombre), icono: (icono || '🛒').slice(0, 4), categorias: cats, store_code: generarCodigoTienda(), configuracion: { tipo: tipo || 'tienda', whatsapp_por_producto: false, notificaciones_modo: modoNotif, contacto: { telefono: telefono || '', email: email_contacto || email, ubicacion: ubicacion || '' }, horario: { apertura: apertura || '09:00', cierre: cierre || '18:00', dias: diasFinales, intervalo: 60 }, envio: { disponible: true, costo: 0, tiempo_estimado: '24-48h' }, garantia: { disponible: true, duracion: '12 meses', descripcion: 'Garantía del vendedor' }, metodos_pago: ['Efectivo', 'Transferencia'], datos_bancarios: { numero_tarjeta: tarjeta || '', whatsapp_confirmacion: whatsapp || telefono || '' }, tasas: { CUP: 1, USD: 1 / usd, EUR: 1 / eur } }, owner_id: user.id, plan: plan || 'basico', fecha_vencimiento: permanente ? '9999-12-31T23:59:59.000Z' : fv.toISOString(), estado_pago: 'activo', max_productos: maxProd, activa: true, pausada: false, es_superadmin: true, created_at: new Date(), updated_at: new Date() }); res.json({ success: true, slug }); } catch (error) { res.status(500).json({ success: false, error: error.message }); } });
app.post('/api/superadmin/crear-producto', async (req, res) => { try { const { tienda, nombre, descripcion, precio, descuento, categoria, imagen, disponible, garantia, transporte, whatsapp_proveedor, contacto_nombre, requiere_carnet } = req.body; if (!tienda || !nombre || !precio) return res.status(400).json({ success: false, error: 'Faltan datos' }); let descFinal = descripcion || ''; if (garantia || transporte) { descFinal += `\n\n--- Detalles ---\n`; if (garantia) descFinal += `🛡️ Garantía: ${garantia}\n`; if (transporte) descFinal += `🚚 Transporte: ${transporte}\n`; } const { data, error } = await supabase.from('products').insert({ tienda, nombre, descripcion: descFinal.trim(), precio: parseFloat(precio), descuento: parseInt(descuento) || 0, categoria: categoria || 'otros', imagen: imagen || 'https://via.placeholder.com/300', disponible: disponible === true || disponible === 'true', tamanio: 'pequeno', whatsapp_proveedor: (whatsapp_proveedor || '').trim() || null, contacto_nombre: (contacto_nombre || '').trim() || null, requiere_carnet: requiere_carnet === true || requiere_carnet === 'true', created_at: new Date(), updated_at: new Date() }).select(); if (error) throw error; res.json({ success: true, product: data[0] }); } catch (error) { res.status(500).json({ success: false, error: error.message }); } });
app.put('/api/superadmin/tiendas/:id/contexto', async (req, res) => { try { const { id } = req.params; const { tipo, whatsapp_por_producto, notificaciones_modo } = req.body; const { data: t } = await supabase.from('stores').select('configuracion').eq('id', id).single(); if (!t) return res.status(404).json({ success: false, error: 'Tienda no encontrada' }); const cfg = t.configuracion || {}; cfg.tipo = tipo === 'reserva' ? 'reserva' : 'tienda'; cfg.whatsapp_por_producto = whatsapp_por_producto === true; if (notificaciones_modo && ['admin', 'whatsapp', 'ambos'].includes(notificaciones_modo)) cfg.notificaciones_modo = notificaciones_modo; const { error } = await supabase.from('stores').update({ configuracion: cfg, updated_at: new Date() }).eq('id', id); if (error) throw error; res.json({ success: true, configuracion: cfg }); } catch (error) { res.status(500).json({ success: false, error: error.message }); } });

// ============ PLANES Y PRIVACIDAD ============
app.get('/api/planes', async (req, res) => { try { const { data } = await supabase.from('plans').select('*').eq('activo', true).order('precio', { ascending: true }); if (!data || data.length === 0) return res.json([{ id: 'prueba', nombre: 'Prueba', precio: 0, max_productos: 5, duracion_dias: 7, activo: true, caracteristicas: ['5 productos', '7 días', 'Soporte básico'] },{ id: 'basico', nombre: 'Básico', precio: 5, max_productos: 10, duracion_dias: 30, activo: true, caracteristicas: ['10 productos', '30 días', 'Notificaciones push'] },{ id: 'pro', nombre: 'Pro', precio: 10, max_productos: 20, duracion_dias: 30, activo: true, caracteristicas: ['20 productos', '30 días', 'Notificaciones push', 'Soporte prioritario'] },{ id: 'premium', nombre: 'Premium', precio: 20, max_productos: 100, duracion_dias: 30, activo: true, caracteristicas: ['100 productos', '30 días', 'Notificaciones push', 'Soporte prioritario', 'Tienda destacada'] }]); res.json(data); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/superadmin/planes', async (req, res) => { try { const { data } = await supabase.from('plans').select('*').order('precio', { ascending: true }); if (!data || data.length === 0) return res.json([{ id: 'prueba', nombre: 'Prueba', precio: 0, max_productos: 5, duracion_dias: 7, activo: true, caracteristicas: ['5 productos', '7 días', 'Soporte básico'] },{ id: 'basico', nombre: 'Básico', precio: 5, max_productos: 10, duracion_dias: 30, activo: true, caracteristicas: ['10 productos', '30 días', 'Notificaciones push'] },{ id: 'pro', nombre: 'Pro', precio: 10, max_productos: 20, duracion_dias: 30, activo: true, caracteristicas: ['20 productos', '30 días', 'Notificaciones push', 'Soporte prioritario'] },{ id: 'premium', nombre: 'Premium', precio: 20, max_productos: 100, duracion_dias: 30, activo: true, caracteristicas: ['100 productos', '30 días', 'Notificaciones push', 'Soporte prioritario', 'Tienda destacada'] }]); res.json(data); } catch (e) { res.status(500).json({ error: e.message }); } });
app.put('/api/superadmin/planes/:id', async (req, res) => { try { const { id } = req.params; const { nombre, precio, max_productos, duracion_dias, caracteristicas, activo } = req.body; const payload = { nombre: nombre || id, precio: parseFloat(precio) || 0, max_productos: parseInt(max_productos) || 5, duracion_dias: parseInt(duracion_dias) || 30, caracteristicas: Array.isArray(caracteristicas) ? caracteristicas : [], activo: activo !== false, updated_at: new Date() }; const { error } = await supabase.from('plans').upsert({ id, ...payload }); if (error) throw error; res.json({ success: true }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
app.get('/api/privacidad', async (req, res) => { try { const { data } = await supabase.from('config').select('*').eq('id', 1).maybeSingle(); const p = { titulo: 'Política de Privacidad', contenido: 'Bienvenido a Tienda-FG...', actualizado: new Date().toISOString() }; res.json(data?.privacidad || p); } catch (e) { res.status(500).json({ error: e.message }); } });
app.put('/api/superadmin/privacidad', async (req, res) => { try { const { titulo, contenido } = req.body; const { data: c } = await supabase.from('config').select('*').eq('id', 1).maybeSingle(); const p = { titulo: titulo || 'Política', contenido: contenido || '', actualizado: new Date().toISOString() }; if (c) await supabase.from('config').update({ privacidad: p }).eq('id', 1); else await supabase.from('config').insert({ id: 1, moneda_base: 'CUP', tasas: { CUP: 1, USD: 0.04, EUR: 0.037 }, privacidad: p }); res.json({ success: true, privacidad: p }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });

async function borrarTodoDeTienda(slug) { 
    try { 
        await supabase.from('products').delete().eq('tienda', slug); 
        await supabase.from('bookings').delete().eq('tienda', slug); 
        await supabase.from('orders').delete().eq('tienda', slug); 
        await supabase.from('push_subscriptions').delete().eq('tienda_id', slug); 
        await supabase.from('pagos_planes').delete().eq('store_id', slug); // 🚨 BORRAR PAGOS ASOCIADOS
        await supabase.from('stores').delete().eq('id', slug); 
        return true; 
    } catch (e) { console.error(e); return false; } 
}

app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

app.get('/admin-cliente', (req, res) => sendHtml(res, 'admin-cliente.html'));
app.get('/admin', (req, res) => sendHtml(res, 'admin.html'));
app.get('/', (req, res) => sendHtml(res, 'index.html'));

app.use((req, res) => { if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'Endpoint no encontrado' }); sendHtml(res, 'offline.html'); });
app.listen(PORT, '0.0.0.0', () => { console.log(`🚀 Puerto ${PORT}`); });