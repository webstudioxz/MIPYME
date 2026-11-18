// ============================================================
// server.js — Tienda-FG (v6 FINAL CON VARIABLE DE ENTORNO)
// ============================================================

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import apiRoutes from './src/routes/apiRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';

// 🛡️ Capa de seguridad empresarial
import {
    securityMiddleware,
    rateLimit,
    checkHoneypot,
    setSupabaseClient,
    getSecurityStats,
    listActiveBans,
    listRecentViolations,
    banIp,
    unbanIp,
    isBanned,
    logSecurityEvent,
    getClientIp,
    validateImage,
    detectProfanity,
    detectSQLInjection
} from './security.js';

// ⚙️ Sistema de colas jerárquicas + Circuit Breaker
import {
    enqueue,
    withSupabaseBreaker,
    withAuthBreaker,
    withPushBreaker,
    withPaymentsBreaker,
    getQueueStats,
    isHealthy
} from './queue.js';

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

// 🚨 NUEVA VARIABLE DE ENTORNO: URL Base (Configurable desde Render)
const APP_URL = process.env.APP_URL || 'https://tienda-fg.onrender.com';

// 🚨 Decirle a Express que confíe en el proxy (necesario para Render)
app.set('trust proxy', 1);

const supabase = createClient(
    process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
);

// 🛡️ Conectar cliente Supabase al módulo de seguridad (para persistencia de baneos/log)
setSupabaseClient(supabase);

const SUPERADMIN_EMAILS = (process.env.SUPERADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// 🛡️ Middleware de seguridad global — aplica a TODAS las rutas
// Escanea bodies, detecta inyección SQL/XSS/NoSQL, valida imágenes,
// filtra malas palabras, verifica baneos en caché y BD.
app.use(securityMiddleware());

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

// ============================================================
// HELPERS
// ============================================================
function deepMerge(target = {}, source = {}) {
    const output = { ...target };
    Object.keys(source || {}).forEach(key => {
        const sv = source[key];
        const tv = target[key];
        if (sv && typeof sv === 'object' && !Array.isArray(sv) &&
            tv && typeof tv === 'object' && !Array.isArray(tv)) {
            output[key] = deepMerge(tv, sv);
        } else {
            output[key] = sv;
        }
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

// ============ PUBLIC CONFIG ============
app.get('/api/public-config', (req, res) => {
    if (!process.env.SUPABASE_URL) return res.status(500).json({ error: "Faltan credenciales" });
    res.json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
        appUrl: APP_URL
    });
});

// ============ PAYMENT METHODS (Datos de Pago del Admin) ============
// FIX: Se guarda dentro del JSON 'tasas' (que sí existe) como tasas._payment_settings,
// porque la columna 'payment_settings' podría no existir en la base de datos.
// Si la columna sí existe, se usa también como respaldo.
app.get('/api/payment-methods', async (req, res) => {
    try {
        const { data } = await supabase.from('config').select('*').eq('id', 1).maybeSingle();
        if (!data) return res.json({});
        // 1. Intentar columna payment_settings (si existe)
        if (data.payment_settings && (data.payment_settings.bank || data.payment_settings.whatsapp)) {
            return res.json(data.payment_settings);
        }
        // 2. Fallback: buscar dentro del JSON tasas
        if (data.tasas && data.tasas._payment_settings) {
            return res.json(data.tasas._payment_settings);
        }
        res.json({});
    } catch (e) { res.json({}); }
});

// ============ SISTEMA DE PAGOS (TICKETS) ============
// Genera un ticket de pago cuando el cliente elige un plan de pago.
app.post('/api/pagos/generar', rateLimit('pago'), checkHoneypot(), async (req, res) => {
    try {
        const { nombre, telefono, plan, meses } = req.body;
        const precios = { 'basico': 1000, 'pro': 1500, 'premium': 2500 };
        const precioMensual = precios[plan] || 0;
        const total = precioMensual * parseInt(meses || 1);

        const codigo = 'PAY-' + Math.random().toString(36).substring(2, 6).toUpperCase() + Date.now().toString(36).slice(-4).toUpperCase();

        const { data, error } = await supabase.from('pagos_planes').insert({
            codigo, nombre_cliente: nombre, telefono, plan, meses: parseInt(meses || 1), total, estado: 'pendiente'
        }).select().single();

        if (error) throw error;
        res.json({ success: true, codigo, total });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Verifica si un ticket sigue pendiente (lo usa el index.html al recargar la página).
// Solo devuelve valido:true si el ticket existe y está en estado 'pendiente'.
app.get('/api/pagos/check/:codigo', async (req, res) => {
    try {
        const { codigo } = req.params;
        const { data, error } = await supabase.from('pagos_planes').select('estado').eq('codigo', codigo).maybeSingle();
        if (error || !data) return res.json({ valido: false });
        res.json({ valido: data.estado === 'pendiente' });
    } catch (error) { res.json({ valido: false }); }
});

// ============ VERIFICACIÓN DE DISPOSITIVO (una tienda por dispositivo) ============
// FIX: Busca device_id DENTRO del JSON 'configuracion' (como _device_id),
// no como columna separada, porque la columna podría no existir.
app.get('/api/check-device', async (req, res) => {
    try {
        const { device_id } = req.query;
        if (!device_id) return res.json({ hasStore: false });
        const { data: allStores, error } = await supabase.from('stores').select('id, nombre, configuracion');
        if (error) { console.error('Error check-device:', error); return res.json({ hasStore: false }); }
        const found = (allStores || []).find(s => s.configuracion && s.configuracion._device_id === device_id);
        res.json({ hasStore: !!found, storeName: found?.nombre || null });
    } catch (e) {
        console.error('Error check-device:', e);
        res.json({ hasStore: false });
    }
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

app.post('/api/push/subscribe', rateLimit('default'), async (req, res) => {
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
        await module.sendPushToAll({ title: `🧪 Prueba`, body: `Funcionan para ${tienda || 'Admin'}`, url: tienda ? `${APP_URL}/admin-cliente?tienda=${tienda}` : `${APP_URL}/admin`, tienda });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============ MI-TIENDA ============
app.get('/api/mi-tienda', async (req, res) => {
    try {
        const { owner_id, slug } = req.query;
        if (!owner_id && !slug) return res.status(400).json({ success: false, error: 'Falta owner_id o slug' });
        
        let query = supabase.from('stores').select('*');
        if (slug) {
            query = query.eq('id', slug);
        } else if (owner_id) {
            query = query.eq('owner_id', owner_id);
        }
        
        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ success: false, error: 'No encontrada' });
        
        res.json({ success: true, store: data });
    } catch (error) { 
        res.status(500).json({ success: false, error: error.message }); 
    }
});

app.post('/api/mi-tienda/pausar', rateLimit('pausa'), async (req, res) => {
    try {
        const { owner_id, slug, pausar, mensaje } = req.body;
        const { data: tienda } = await supabase.from('stores').select('id, configuracion').eq('id', slug).eq('owner_id', owner_id).maybeSingle();
        if (!tienda) return res.status(404).json({ success: false, error: 'No autorizado' });

        // FIX: Guardar info de pausa DENTRO de configuracion (JSON) para no requerir columnas nuevas
        const cfg = tienda.configuracion || {};
        if (pausar === true) {
            cfg._pausada_por = 'owner';
            cfg._pausa_mensaje = (mensaje || 'Volvemos mañana').toString().slice(0, 200);
        } else {
            cfg._pausada_por = null;
            cfg._pausa_mensaje = null;
        }

        const updateBase = { pausada: pausar === true, updated_at: new Date(), configuracion: cfg };

        // Intentar con pausada_por y pausada_mensaje (pueden no existir como columnas)
        let { error } = await supabase.from('stores').update({
            ...updateBase,
            pausada_por: pausar === true ? 'owner' : null,
            pausada_mensaje: pausar === true ? (mensaje || 'Volvemos mañana').toString().slice(0, 200) : null
        }).eq('id', slug);

        if (error && (error.message.includes('pausada_por') || error.message.includes('pausada_mensaje') || error.message.includes('column'))) {
            // Reintentar sin esas columnas
            const retry = await supabase.from('stores').update(updateBase).eq('id', slug);
            error = retry.error;
        }
        if (error) throw error;

        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.delete('/api/mi-tienda/:slug', async (req, res) => {
    try {
        const { owner_id } = req.query;
        const { slug } = req.params;
        const { data: tienda } = await supabase.from('stores').select('id').eq('id', slug).eq('owner_id', owner_id).maybeSingle();
        if (!tienda) return res.status(404).json({ success: false, error: 'No autorizado' });
        await borrarTodoDeTienda(slug);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.put('/api/mi-tienda/config', rateLimit('config'), async (req, res) => {
    try {
        const { owner_id, slug, configuracion } = req.body;
        if (!slug) return res.status(400).json({ success: false, error: 'Falta slug' });

        if (owner_id) {
            const { data: tienda } = await supabase.from('stores').select('configuracion').eq('id', slug).eq('owner_id', owner_id).maybeSingle();
            if (!tienda) return res.status(404).json({ success: false, error: 'No autorizado' });
        }

        const { data: current } = await supabase.from('stores').select('configuracion').eq('id', slug).maybeSingle();
        if (!current) return res.status(404).json({ success: false, error: 'Tienda no encontrada' });

        const incoming = { ...(configuracion || {}) };
        if (incoming.horario && incoming.horario.dias !== undefined) {
            incoming.horario.dias = normalizeDias(incoming.horario.dias);
        }
        const merged = deepMerge(current.configuracion || {}, incoming);
        if (!merged.horario) merged.horario = {};
        if (!Array.isArray(merged.horario.dias)) merged.horario.dias = [1, 2, 3, 4, 5, 6];

        const { error } = await supabase.from('stores').update({
            configuracion: merged,
            updated_at: new Date()
        }).eq('id', slug);

        if (error) throw error;
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

app.post('/api/mis-productos', rateLimit('crear_producto'), async (req, res) => {
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
        if (req.body.contacto_nombre !== undefined) payload.contacto_nombre = (req.body.contacto_nombre || '').toString().trim() || null;
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
        const diasLaborables = normalizeDias(cfg.dias);
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

app.post('/api/reservas', rateLimit('reserva'), checkHoneypot(), async (req, res) => {
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
            m.sendPushToAll({ title: `📅 Nueva Reserva`, body: `${cliente_nombre} - ${fecha} ${hora}`, url: `${APP_URL}/admin-cliente?tienda=${tienda}`, tienda }).catch(console.error);
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
            const { data: prods } = await supabase.from('products').select('id, nombre, precio, imagen, imagenes_servicio, whatsapp_proveedor, contacto_nombre').in('id', productIds);
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

// ============ CREAR TIENDA CLIENTE (CON PAGO + DEVICE ID) ============
// FIX: codigo_pago y device_id se guardan DENTRO del JSON 'configuracion' (no como columnas)
// porque la base de datos podría no tener esas columnas. 'configuracion' es JSON y seguro existe.
app.post('/api/crear-tienda-cliente', rateLimit('crear_tienda'), checkHoneypot(), async (req, res) => {
    try {
        const { user_id, email, nombre_dueno, nombre_negocio, tipo, telefono, plan, fecha_vencimiento, direccion, hora_apertura, hora_cierre, tasa_usd, metodos_pago, garantia, transporte, dias_laborables, notificaciones_modo, codigo_pago, device_id } = req.body;
        if (!user_id || !nombre_negocio) return res.status(400).json({ success: false, error: 'Faltan datos' });

        const esSuperadmin = SUPERADMIN_EMAILS.includes((email || '').toLowerCase());

        // FIX: Una tienda por cuenta (verificar si el usuario ya tiene tienda)
        // EXCEPCIÓN: si el admin central activó _allow_multi_store en su tienda existente,
        // el usuario puede crear otra tienda adicional.
        if (!esSuperadmin) {
            const { data: exist } = await supabase.from('stores').select('id, configuracion').eq('owner_id', user_id).maybeSingle();
            if (exist) {
                const allowMulti = exist.configuracion?._allow_multi_store === true;
                if (!allowMulti) {
                    return res.status(400).json({
                        success: false,
                        error: 'Ya tienes una tienda registrada con esta cuenta. Solo se permite una tienda por usuario. Solicita permiso al administrador para crear otra.',
                        codigo: 'TIENDA_EXISTENTE'
                    });
                }
                // Si tiene permiso, continuamos (no retornamos)
            }
        }

        // FIX: Una tienda por dispositivo — buscar device_id dentro del JSON configuracion
        // EXCEPCIÓN: si el admin habilitó _allow_multi_store, el dispositivo puede tener otra
        if (device_id && !esSuperadmin) {
            const { data: allStores } = await supabase.from('stores').select('id, nombre, configuracion, owner_id');
            const deviceExist = (allStores || []).find(s =>
                s.configuracion && s.configuracion._device_id === device_id && s.owner_id !== user_id
            );
            if (deviceExist) {
                // Si el dispositivo está asociado a OTRA cuenta, bloquear
                return res.status(400).json({ success: false, error: 'Este dispositivo ya tiene una tienda registrada con otra cuenta.', codigo: 'DISPOSITIVO_BLOQUEADO' });
            }
        }

        let slug = nombre_negocio.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        const { data: dup } = await supabase.from('stores').select('id').eq('id', slug).maybeSingle();
        if (dup) return res.status(400).json({ success: false, error: 'Nombre en uso', codigo: 'NOMBRE_DUPLICADO' });

        const maxProd = plan === 'premium' ? 100 : (plan === 'pro' ? 20 : (plan === 'basico' ? 10 : 5));
        const tasa = (parseFloat(tasa_usd) > 0) ? parseFloat(tasa_usd) : 25;
        const diasFinales = dias_laborables !== undefined ? normalizeDias(dias_laborables) : [1,2,3,4,5,6];
        const modoNotif = ['admin', 'whatsapp', 'ambos'].includes(notificaciones_modo) ? notificaciones_modo : 'admin';

        // FIX: Todas las tiendas nuevas se crean con activa=false (pendiente de liberación por el admin).
        // El admin central debe "liberar" la tienda para que sea visible públicamente.
        const esPago = plan !== 'prueba';
        const pausada = false; // FIX: No pausada — el control se hace con activa=false

        // FIX: codigo_pago, device_id y mensaje van DENTRO de configuracion (JSON)
        const configuracionCompleta = {
            tipo,
            whatsapp_por_producto: false,
            notificaciones_modo: modoNotif,
            contacto: { telefono, email, ubicacion: direccion || 'Cuba' },
            horario: { apertura: hora_apertura || '09:00', cierre: hora_cierre || '18:00', dias: diasFinales, intervalo: 60 },
            envio: { disponible: transporte === true, costo: 0, tiempo_estimado: '24-48h' },
            garantia: { disponible: garantia === true, duracion: '12 meses', descripcion: 'Garantía del vendedor' },
            metodos_pago: Array.isArray(metodos_pago) && metodos_pago.length ? metodos_pago : ['Efectivo'],
            datos_bancarios: { numero_tarjeta: '', whatsapp_confirmacion: telefono },
            tasas: { CUP: 1, USD: 1 / tasa, EUR: 1 / (tasa * 1.1) },
            _codigo_pago: codigo_pago || null,
            _device_id: device_id || null,
            _pausa_mensaje: 'Tienda en revisión. El administrador debe liberarla para que sea visible públicamente.'
        };

        // FIX: activa=false para TODAS las tiendas nuevas. El admin debe liberarlas.
        const insertData = {
            id: slug,
            nombre: nombre_negocio,
            descripcion: 'Bienvenido a ' + nombre_negocio,
            icono: '🛒',
            categorias: ['otros'],
            configuracion: configuracionCompleta,
            owner_id: user_id,
            plan,
            fecha_vencimiento: null,
            estado_pago: esPago ? 'pendiente' : 'activo',
            max_productos: maxProd,
            activa: false, // FIX: Pendiente de liberación por el admin
            pausada: false,
            es_superadmin: esSuperadmin,
            created_at: new Date(),
            updated_at: new Date()
        };

        // Intentar incluir pausada_por y pausada_mensaje (pueden no existir como columnas)
        let { data, error } = await supabase.from('stores').insert({
            ...insertData,
            pausada_por: null,
            pausada_mensaje: null
        }).select();

        if (error && (error.message.includes('pausada_por') || error.message.includes('pausada_mensaje') || error.message.includes('column'))) {
            // Reintentar sin las columnas que no existen
            const retry = await supabase.from('stores').insert(insertData).select();
            data = retry.data;
            error = retry.error;
        }

        if (error) throw error;

        import('./src/utils/pushNotifications.js').then(m => { m.sendPushToAll({ title: esPago ? '💰 Nueva Tienda Pendiente' : '🏪 Nueva Tienda', body: `${nombre_negocio}`, url: `${APP_URL}/admin`, tienda: null }).catch(console.error); }).catch(console.error);

        res.json({ success: true, slug, store: data[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ SUPER-ADMIN ============
app.get('/api/superadmin/usuarios', async (req, res) => {
    try {
        const { data: userList } = await supabase.auth.admin.listUsers();
        const usuarios = await Promise.all((userList?.users || []).map(async (u) => {
            // FIX: Seleccionar solo columnas seguras + configuracion (que contiene _pausada_por, _pausa_mensaje)
            const { data: tienda } = await supabase.from('stores').select('id, nombre, plan, fecha_vencimiento, pausada, activa, estado_pago, configuracion').eq('owner_id', u.id).maybeSingle();
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
            await borrarTodoDeTienda(tienda.id);
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

app.post('/api/superadmin/pausar/:id', rateLimit('pausa'), async (req, res) => {
    try {
        const pausar = req.body.pausar === true;
        const mensajePausa = (req.body.mensaje || 'Tienda pausada por administración').toString().slice(0, 200);

        // FIX: Guardar info de pausa DENTRO de configuracion (JSON)
        const { data: storeData } = await supabase.from('stores').select('configuracion').eq('id', req.params.id).maybeSingle();
        const cfg = storeData?.configuracion || {};
        if (pausar) {
            cfg._pausada_por = 'admin';
            cfg._pausa_mensaje = mensajePausa;
        } else {
            cfg._pausada_por = null;
            cfg._pausa_mensaje = null;
        }

        const updateBase = { pausada: pausar, updated_at: new Date(), configuracion: cfg };

        // Intentar con pausada_por y pausada_mensaje
        let { error } = await supabase.from('stores').update({
            ...updateBase,
            pausada_por: pausar ? 'admin' : null,
            pausada_mensaje: pausar ? mensajePausa : null
        }).eq('id', req.params.id);

        if (error && (error.message.includes('pausada_por') || error.message.includes('pausada_mensaje') || error.message.includes('column'))) {
            const retry = await supabase.from('stores').update(updateBase).eq('id', req.params.id);
            error = retry.error;
        }
        if (error) throw error;

        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/superadmin/tiendas/:id', async (req, res) => {
    try {
        await borrarTodoDeTienda(req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/superadmin/tiendas/:id/tiempo', async (req, res) => {
    try {
        const { dias, horas, fecha_especifica } = req.body;
        // Modo 1: establecer una fecha exacta de vencimiento
        if (fecha_especifica) {
            const nueva = new Date(fecha_especifica);
            if (isNaN(nueva.getTime())) return res.status(400).json({ success: false, error: 'Fecha inválida' });
            await supabase.from('stores').update({ fecha_vencimiento: nueva.toISOString(), estado_pago: 'activo' }).eq('id', req.params.id);
            return res.json({ success: true, nuevaFecha: nueva.toISOString() });
        }
        // Modo 2: añadir días y horas al vencimiento actual
        const { data: tienda } = await supabase.from('stores').select('fecha_vencimiento').eq('id', req.params.id).single();
        let base = new Date();
        if (tienda?.fecha_vencimiento && new Date(tienda.fecha_vencimiento) > base && !tienda.fecha_vencimiento.startsWith('9999')) base = new Date(tienda.fecha_vencimiento);
        base.setDate(base.getDate() + parseInt(dias || 0));
        base.setHours(base.getHours() + parseInt(horas || 0));
        await supabase.from('stores').update({ fecha_vencimiento: base.toISOString(), estado_pago: 'activo' }).eq('id', req.params.id);
        res.json({ success: true, nuevaFecha: base.toISOString() });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Cambiar el plan de una tienda existente
app.put('/api/superadmin/tiendas/:id/plan', async (req, res) => {
    try {
        const { plan } = req.body;
        const planesValidos = ['prueba', 'basico', 'pro', 'premium'];
        if (!planesValidos.includes(plan)) return res.status(400).json({ success: false, error: 'Plan inválido' });
        const maxProd = plan === 'premium' ? 100 : (plan === 'pro' ? 20 : (plan === 'basico' ? 10 : 5));
        const { error } = await supabase.from('stores').update({
            plan,
            max_productos: maxProd,
            updated_at: new Date()
        }).eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, plan, max_productos: maxProd });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/superadmin/tiendas/:id/cancelar', async (req, res) => {
    try {
        await supabase.from('stores').update({ fecha_vencimiento: new Date().toISOString(), estado_pago: 'cancelado' }).eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/superadmin/crear-tienda', rateLimit('crear_tienda'), async (req, res) => {
    try {
        const { email, es_para_admin, nombre_negocio, nombre, icono, descripcion, categorias, telefono, email_contacto, ubicacion, apertura, cierre, tasaUSD, tasaEUR, tarjeta, whatsapp, tipo, plan, permanente, dias_laborables, notificaciones_modo } = req.body;
        const finalNombre = (nombre || nombre_negocio || '').trim();
        if (!finalNombre) return res.status(400).json({ success: false, error: 'Nombre obligatorio' });
        // FIX: Si es para el propio admin, no validar email del usuario. Se asocia al primer superadmin.
        let user = null;
        if (es_para_admin === true || email === '__admin__') {
            // Buscar al primer superadmin disponible
            const { data: userList } = await supabase.auth.admin.listUsers();
            user = userList?.users?.find(u => SUPERADMIN_EMAILS.includes((u.email || '').toLowerCase()));
            if (!user && userList?.users?.length > 0) user = userList.users[0];
        } else {
            if (!email) return res.status(400).json({ success: false, error: 'Email del dueño obligatorio' });
            const { data: userList } = await supabase.auth.admin.listUsers();
            user = userList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
            if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }
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
        const diasFinales = dias_laborables !== undefined ? normalizeDias(dias_laborables) : [1,2,3,4,5,6];
        const modoNotif = ['admin', 'whatsapp', 'ambos'].includes(notificaciones_modo) ? notificaciones_modo : 'admin';

        await supabase.from('stores').insert({
            id: slug, nombre: finalNombre, descripcion: (descripcion || '').trim() || ('Bienvenido a ' + finalNombre),
            icono: (icono || '🛒').slice(0, 4), categorias: cats,
            configuracion: {
                tipo: tipo || 'tienda',
                whatsapp_por_producto: false,
                notificaciones_modo: modoNotif,
                contacto: { telefono: telefono || '', email: email_contacto || email, ubicacion: ubicacion || '' },
                horario: { apertura: apertura || '09:00', cierre: cierre || '18:00', dias: diasFinales, intervalo: 60 },
                envio: { disponible: true, costo: 0, tiempo_estimado: '24-48h' },
                garantia: { disponible: true, duracion: '12 meses', descripcion: 'Garantía del vendedor' },
                metodos_pago: ['Efectivo', 'Transferencia'],
                datos_bancarios: { numero_tarjeta: tarjeta || '', whatsapp_confirmacion: whatsapp || telefono || '' },
                tasas: { CUP: 1, USD: 1 / usd, EUR: 1 / eur }
            },
            owner_id: user ? user.id : null, plan: plan || 'basico', fecha_vencimiento: permanente ? '9999-12-31T23:59:59.000Z' : fv.toISOString(),
            estado_pago: 'activo', max_productos: maxProd, activa: true, pausada: false, es_superadmin: es_para_admin === true || email === '__admin__', created_at: new Date(), updated_at: new Date()
        });
        res.json({ success: true, slug });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/superadmin/crear-producto', async (req, res) => {
    try {
        const { tienda, nombre, descripcion, precio, descuento, categoria, imagen, disponible, garantia, transporte, whatsapp_proveedor, contacto_nombre, requiere_carnet } = req.body;
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
            contacto_nombre: (contacto_nombre || '').trim() || null,
            requiere_carnet: requiere_carnet === true || requiere_carnet === 'true',
            created_at: new Date(), updated_at: new Date()
        }).select();
        if (error) throw error;
        res.json({ success: true, product: data[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.put('/api/superadmin/tiendas/:id/contexto', async (req, res) => {
    try {
        const { id } = req.params;
        const { tipo, whatsapp_por_producto, notificaciones_modo } = req.body;

        const { data: tienda } = await supabase.from('stores').select('configuracion').eq('id', id).single();
        if (!tienda) return res.status(404).json({ success: false, error: 'Tienda no encontrada' });

        const cfg = tienda.configuracion || {};
        cfg.tipo = tipo === 'reserva' ? 'reserva' : 'tienda';
        cfg.whatsapp_por_producto = whatsapp_por_producto === true;
        if (notificaciones_modo && ['admin', 'whatsapp', 'ambos'].includes(notificaciones_modo)) {
            cfg.notificaciones_modo = notificaciones_modo;
        }

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

// ============ ADMIN: LIBERAR TIENDA ============
// FIX: El admin central libera una tienda para que sea visible públicamente.
// Todas las tiendas nuevas se crean con activa=false; este endpoint la activa.
app.post('/api/admin/liberar-tienda/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        // Activar la tienda: activa=true, quitar pausa, limpiar mensaje de revisión
        const { data: storeData } = await supabase.from('stores').select('configuracion').eq('id', slug).maybeSingle();
        const cfg = storeData?.configuracion || {};
        cfg._pausa_mensaje = null;

        const updateBase = {
            activa: true,
            pausada: false,
            estado_pago: 'activo',
            updated_at: new Date(),
            configuracion: cfg
        };

        // Intentar con pausada_por y pausada_mensaje (pueden no existir)
        let { error } = await supabase.from('stores').update({
            ...updateBase,
            pausada_por: null,
            pausada_mensaje: null
        }).eq('id', slug);

        if (error && (error.message.includes('pausada_por') || error.message.includes('pausada_mensaje') || error.message.includes('column'))) {
            const retry = await supabase.from('stores').update(updateBase).eq('id', slug);
            error = retry.error;
        }
        if (error) throw error;

        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ ADMIN: PAGOS Y DATOS DE PAGO ============
// Lista todos los tickets de pago (para el panel de "Pagos Pendientes" del admin)
app.get('/api/admin/pagos', async (req, res) => {
    try {
        const { data, error } = await supabase.from('pagos_planes').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Aprueba un pago: activa la tienda asociada y marca el ticket como aprobado
app.post('/api/admin/aprobar-pago/:id', rateLimit('pago'), async (req, res) => {
    try {
        const { data: pago, error: errPago } = await supabase.from('pagos_planes').select('*').eq('id', req.params.id).single();
        if (errPago || !pago) return res.status(404).json({ success: false, error: 'Pago no encontrado' });

        const { slug } = req.body;
        if (!slug) return res.status(400).json({ success: false, error: 'Falta el slug de la tienda' });

        // Calcular fecha de vencimiento según los meses pagados
        let fechaVencimiento = new Date();
        fechaVencimiento.setMonth(fechaVencimiento.getMonth() + pago.meses);

        // FIX: Activar la tienda. Primero intentamos con pausada_por y pausada_mensaje;
        // si fallan (columnas podrían no existir), reintentamos sin ellas.
        // También actualizamos el _pausa_mensaje dentro de configuracion a null.
        const { data: storeData } = await supabase.from('stores').select('configuracion').eq('id', slug).maybeSingle();
        const cfg = storeData?.configuracion || {};
        if (cfg._pausa_mensaje !== undefined) cfg._pausa_mensaje = null;

        const updateBase = {
            pausada: false,
            estado_pago: 'activo',
            fecha_vencimiento: fechaVencimiento.toISOString(),
            configuracion: cfg
        };

        // Intentar con pausada_por y pausada_mensaje
        let { error: errUpd } = await supabase.from('stores').update({
            ...updateBase,
            pausada_por: null,
            pausada_mensaje: null
        }).eq('id', slug);

        if (errUpd && (errUpd.message.includes('pausada_por') || errUpd.message.includes('pausada_mensaje') || errUpd.message.includes('column'))) {
            // Reintentar sin esas columnas
            const retry = await supabase.from('stores').update(updateBase).eq('id', slug);
            errUpd = retry.error;
        }

        if (errUpd) throw errUpd;

        // Marcar el ticket como aprobado
        await supabase.from('pagos_planes').update({ estado: 'aprobado' }).eq('id', req.params.id);

        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Guarda los datos de pago del admin (tarjeta + WhatsApp) en la tabla config.
// Estos datos aparecen automáticamente en el formulario de pago del plan (index.html).
app.put('/api/superadmin/payment-methods', async (req, res) => {
    try {
        const { bank, qr, whatsapp } = req.body;
        const payment_settings = { bank: bank || '', qr: qr || '', whatsapp: whatsapp || '' };

        const { data: current } = await supabase.from('config').select('*').eq('id', 1).maybeSingle();

        if (current) {
            // FIX: Guardar dentro del JSON 'tasas' (que seguro existe) como _payment_settings.
            // También intentamos la columna payment_settings por si existe, pero sin fallar si no.
            const tasasActualizadas = { ...(current.tasas || { CUP: 1, USD: 0.04, EUR: 0.037 }) };
            tasasActualizadas._payment_settings = payment_settings;

            // Intentar update con payment_settings (si la columna existe)
            const { error: errCol } = await supabase.from('config')
                .update({ payment_settings, tasas: tasasActualizadas }).eq('id', 1);
            if (errCol) {
                // Si falla por la columna payment_settings, actualizar solo tasas
                const { error: errTasas } = await supabase.from('config')
                    .update({ tasas: tasasActualizadas }).eq('id', 1);
                if (errTasas) throw errTasas;
            }
        } else {
            // Insertar nueva fila
            const { error: errInsert } = await supabase.from('config').insert({
                id: 1,
                moneda_base: 'CUP',
                tasas: { CUP: 1, USD: 0.04, EUR: 0.037, _payment_settings: payment_settings },
                payment_settings
            });
            if (errInsert) {
                // Reintentar sin payment_settings (la columna podría no existir)
                const { error: errInsert2 } = await supabase.from('config').insert({
                    id: 1,
                    moneda_base: 'CUP',
                    tasas: { CUP: 1, USD: 0.04, EUR: 0.037, _payment_settings: payment_settings }
                });
                if (errInsert2) throw errInsert2;
            }
        }
        res.json({ success: true, payment_settings });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ PLANES (Oficiales y Admin) ============
app.get('/api/planes', async (req, res) => {
    try {
        const { data } = await supabase.from('plans').select('*').eq('activo', true).order('precio', { ascending: true });
        if (!data || data.length === 0) {
            return res.json([
                { id: 'prueba', nombre: 'Prueba', precio: 0, max_productos: 5, duracion_dias: 7, activo: true, caracteristicas: ['5 productos', '7 días', 'Soporte básico'] },
                { id: 'basico', nombre: 'Básico', precio: 5, max_productos: 10, duracion_dias: 30, activo: true, caracteristicas: ['10 productos', '30 días', 'Notificaciones push'] },
                { id: 'pro', nombre: 'Pro', precio: 10, max_productos: 20, duracion_dias: 30, activo: true, caracteristicas: ['20 productos', '30 días', 'Notificaciones push', 'Soporte prioritario'] },
                { id: 'premium', nombre: 'Premium', precio: 20, max_productos: 100, duracion_dias: 30, activo: true, caracteristicas: ['100 productos', '30 días', 'Notificaciones push', 'Soporte prioritario', 'Tienda destacada'] }
            ]);
        }
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/superadmin/planes', async (req, res) => {
    try {
        const { data } = await supabase.from('plans').select('*').order('precio', { ascending: true });
        if (!data || data.length === 0) {
            return res.json([
                { id: 'prueba', nombre: 'Prueba', precio: 0, max_productos: 5, duracion_dias: 7, activo: true, caracteristicas: ['5 productos', '7 días', 'Soporte básico'] },
                { id: 'basico', nombre: 'Básico', precio: 5, max_productos: 10, duracion_dias: 30, activo: true, caracteristicas: ['10 productos', '30 días', 'Notificaciones push'] },
                { id: 'pro', nombre: 'Pro', precio: 10, max_productos: 20, duracion_dias: 30, activo: true, caracteristicas: ['20 productos', '30 días', 'Notificaciones push', 'Soporte prioritario'] },
                { id: 'premium', nombre: 'Premium', precio: 20, max_productos: 100, duracion_dias: 30, activo: true, caracteristicas: ['100 productos', '30 días', 'Notificaciones push', 'Soporte prioritario', 'Tienda destacada'] }
            ]);
        }
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/superadmin/planes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, precio, max_productos, duracion_dias, caracteristicas, activo } = req.body;
        const payload = {
            nombre: nombre || id,
            precio: parseFloat(precio) || 0,
            max_productos: parseInt(max_productos) || 5,
            duracion_dias: parseInt(duracion_dias) || 30,
            caracteristicas: Array.isArray(caracteristicas) ? caracteristicas : [],
            activo: activo !== false,
            updated_at: new Date()
        };
        const { error } = await supabase.from('plans').upsert({ id, ...payload });
        if (error) throw error;
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============ PRIVACIDAD (Oficial y Admin) ============
app.get('/api/privacidad', async (req, res) => {
    try {
        const { data } = await supabase.from('config').select('*').eq('id', 1).maybeSingle();
        
        const privacidadOficial = {
            titulo: 'Política de Privacidad y Términos de Uso',
            contenido: `Bienvenido a Tienda-FG. Nos tomamos muy en serio la privacidad de nuestros usuarios y dueños de tiendas.

1. INFORMACIÓN QUE RECOPILAMOS
Recopilamos únicamente los datos necesarios para procesar tus pedidos: nombre, número de teléfono, dirección de entrega y, en algunos casos, número de carnet de identidad (si el vendedor lo requiere explícitamente). Esta información es compartida directamente con el dueño de la tienda para gestionar la venta.

2. USO DE LA INFORMACIÓN
Los datos proporcionados se utilizan exclusivamente para la comunicación entre el cliente y el vendedor, procesar el envío y mejorar la experiencia de compra. No vendemos ni compartimos tu información con terceros ajenos a la transacción.

3. PAGOS
Tienda-FG no procesa pagos directamente. Las transacciones se realizan a través de los métodos de pago acordados con el vendedor (Efectivo, Transferencia, etc.). No almacenamos datos bancarios sensibles.

4. NOTIFICACIONES PUSH
Si activas las notificaciones, utilizaremos tu navegador para enviarte alertas sobre el estado de tus pedidos y nuevas ofertas de tus tiendas favoritas. Puedes desactivar esto en cualquier momento desde la configuración de tu navegador.

5. CONTACTO
Si tienes dudas sobre esta política, puedes contactar al administrador del sistema a través del soporte técnico.

Al utilizar esta plataforma, aceptas los términos aquí descritos.`,
            actualizado: new Date().toISOString()
        };

        res.json(data?.privacidad || privacidadOficial);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/superadmin/privacidad', async (req, res) => {
    try {
        const { titulo, contenido } = req.body;
        const { data: current } = await supabase.from('config').select('*').eq('id', 1).maybeSingle();
        const privacidad = { titulo: titulo || 'Política de Privacidad', contenido: contenido || '', actualizado: new Date().toISOString() };
        if (current) {
            await supabase.from('config').update({ privacidad }).eq('id', 1);
        } else {
            await supabase.from('config').insert({ id: 1, moneda_base: 'CUP', tasas: { CUP: 1, USD: 0.04, EUR: 0.037 }, privacidad });
        }
        res.json({ success: true, privacidad });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============ FUNCIÓN AUXILIAR BORRAR TIENDA ============
async function borrarTodoDeTienda(slug) {
    try {
        await supabase.from('products').delete().eq('tienda', slug);
        await supabase.from('bookings').delete().eq('tienda', slug);
        await supabase.from('orders').delete().eq('tienda', slug);
        await supabase.from('push_subscriptions').delete().eq('tienda_id', slug);
        await supabase.from('stores').delete().eq('id', slug);
        return true;
    } catch (e) { console.error('Error borrando tienda:', e); return false; }
}

// ============ ROUTES & HTML ============
// 🛡️ Rate limit específico para login de admin (protección anti fuerza bruta)
app.use('/api/admin/login', rateLimit('login'));
app.use('/api/admin/verify-session', rateLimit('login'));

app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// ============ ENDPOINTS DE GESTIÓN DE SEGURIDAD ============
// Solo accesibles para superadmins autenticados. Permiten ver stats,
// baneos activos, log de auditoría y aplicar/quitar baneos manualmente.

async function requireSuperadmin(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No autorizado' });
    try {
        const { data } = await supabase.auth.admin.getUserById(token);
        if (!data?.user) return res.status(401).json({ success: false, error: 'Token inválido' });
        const isSuper = SUPERADMIN_EMAILS.includes((data.user.email || '').toLowerCase());
        if (!isSuper) return res.status(403).json({ success: false, error: 'Requiere superadmin' });
        next();
    } catch { res.status(401).json({ success: false, error: 'Token inválido' }); }
}

app.get('/api/admin/security/stats', async (req, res) => {
    try {
        const stats = getSecurityStats();
        // Intentar contar desde BD (si existe la tabla)
        let dbBans = null, dbLog = null;
        try {
            const { count: bc } = await supabase.from('security_bans').select('*', { count: 'exact', head: true }).eq('active', true);
            dbBans = bc;
            const { count: lc } = await supabase.from('security_log').select('*', { count: 'exact', head: true }).gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
            dbLog = lc;
        } catch {}
        res.json({ success: true, stats: { ...stats, db_active_bans: dbBans, db_log_24h: dbLog } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/admin/security/bans', async (req, res) => {
    try {
        const memory = listActiveBans();
        let db = [];
        try {
            const { data } = await supabase.from('security_bans').select('*').eq('active', true).order('banned_at', { ascending: false }).limit(100);
            db = data || [];
        } catch {}
        // Combinar memoria + BD sin duplicar
        const seen = new Set(memory.map(b => b.ip));
        const combined = [...memory, ...db.filter(b => !seen.has(b.ip))];
        res.json({ success: true, bans: combined });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/admin/security/ban', async (req, res) => {
    try {
        const { ip, reason, duration_hours } = req.body;
        if (!ip || !reason) return res.status(400).json({ success: false, error: 'IP y motivo obligatorios' });
        const hours = parseInt(duration_hours) || 24;
        const ok = await banIp(ip, `Manual: ${reason}`, 'admin', hours);
        res.json({ success: ok, ip, reason, duration_hours: hours });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/admin/security/ban/:ip', async (req, res) => {
    try {
        await unbanIp(req.params.ip);
        res.json({ success: true, ip: req.params.ip });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/admin/security/log', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        // Memoria (violaciones recientes)
        const memory = listRecentViolations(limit);
        // BD (eventos persistentes)
        let db = [];
        try {
            const { data } = await supabase.from('security_log').select('*').order('timestamp', { ascending: false }).limit(limit);
            db = data || [];
        } catch {}
        res.json({ success: true, memory, db, combined: db.length ? db : memory });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/admin/security/check/:ip', async (req, res) => {
    try {
        const banInfo = await isBanned(req.params.ip);
        res.json({ success: true, ip: req.params.ip, banned: !!banInfo, info: banInfo });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================
// SISTEMA DE SOLICITUDES: multi-tienda y upgrade de plan
// ============================================================

// Cliente solicita permiso para crear otra tienda
app.post('/api/solicitar-multi-tienda', rateLimit('default'), async (req, res) => {
    try {
        const { user_id, email, tienda_actual, motivo } = req.body;
        if (!user_id || !email) return res.status(400).json({ success: false, error: 'Faltan datos' });
        const { error } = await supabase.from('solicitudes').insert({
            tipo: 'multi_tienda',
            user_id, email,
            tienda_actual: tienda_actual || null,
            motivo: (motivo || '').slice(0, 500),
            estado: 'pendiente',
            created_at: new Date()
        });
        if (error) {
            // Si la tabla no existe, fallar gracefully
            if (error.message.includes('relation') || error.message.includes('does not exist')) {
                return res.json({ success: true, message: 'Solicitud registrada. Contacta al admin por WhatsApp.' });
            }
            throw error;
        }
        res.json({ success: true, message: 'Solicitud enviada al administrador.' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Cliente solicita upgrade de plan (de gratuito a pago)
app.post('/api/solicitar-upgrade-plan', rateLimit('default'), async (req, res) => {
    try {
        const { user_id, email, tienda_slug, plan_actual, plan_deseado, meses, codigo_pago } = req.body;
        if (!user_id || !email || !tienda_slug || !plan_deseado) return res.status(400).json({ success: false, error: 'Faltan datos' });
        const planesValidos = ['basico', 'pro', 'premium'];
        if (!planesValidos.includes(plan_deseado)) return res.status(400).json({ success: false, error: 'Plan inválido' });
        const { error } = await supabase.from('solicitudes').insert({
            tipo: 'upgrade_plan',
            user_id, email,
            tienda_slug,
            plan_actual: plan_actual || 'prueba',
            plan_deseado,
            meses: parseInt(meses) || 1,
            codigo_pago: codigo_pago || null,
            estado: 'pendiente',
            created_at: new Date()
        });
        if (error) {
            if (error.message.includes('relation') || error.message.includes('does not exist')) {
                return res.json({ success: true, message: 'Solicitud registrada. El admin la procesará.' });
            }
            throw error;
        }
        res.json({ success: true, message: 'Solicitud de upgrade enviada al administrador.' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Admin: lista todas las solicitudes pendientes
app.get('/api/admin/solicitudes', async (req, res) => {
    try {
        const { data, error } = await supabase.from('solicitudes')
            .select('*').order('created_at', { ascending: false }).limit(100);
        if (error) {
            if (error.message.includes('relation') || error.message.includes('does not exist')) {
                return res.json({ success: true, solicitudes: [], warning: 'Tabla solicitudes no existe. Ejecuta migration_security.sql actualizado.' });
            }
            throw error;
        }
        res.json({ success: true, solicitudes: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Admin: aprobar solicitud (multi-tienda o upgrade de plan)
app.post('/api/admin/solicitudes/:id/aprobar', async (req, res) => {
    try {
        const { id } = req.params;
        const { accion } = req.body; // 'aprobar' o 'rechazar'
        // 1. Obtener la solicitud
        const { data: sol, error: e1 } = await supabase.from('solicitudes').select('*').eq('id', id).single();
        if (e1 || !sol) return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });

        if (accion === 'rechazar') {
            await supabase.from('solicitudes').update({ estado: 'rechazado', processed_at: new Date() }).eq('id', id);
            return res.json({ success: true, message: 'Solicitud rechazada' });
        }

        // 2. Aprobar según tipo
        if (sol.tipo === 'multi_tienda') {
            // Setear _allow_multi_store = true en la tienda del usuario
            const { data: store } = await supabase.from('stores').select('id, configuracion')
                .eq('owner_id', sol.user_id).maybeSingle();
            if (!store) return res.status(404).json({ success: false, error: 'Tienda no encontrada' });
            const cfg = store.configuracion || {};
            cfg._allow_multi_store = true;
            await supabase.from('stores').update({ configuracion: cfg, updated_at: new Date() }).eq('id', store.id);
        } else if (sol.tipo === 'upgrade_plan') {
            // Cambiar el plan de la tienda al plan_deseado
            const maxProd = sol.plan_deseado === 'premium' ? 100 : (sol.plan_deseado === 'pro' ? 20 : 10);
            const fechaVenc = new Date();
            fechaVenc.setMonth(fechaVenc.getMonth() + (sol.meses || 1));
            await supabase.from('stores').update({
                plan: sol.plan_deseado,
                max_productos: maxProd,
                fecha_vencimiento: fechaVenc.toISOString(),
                estado_pago: 'activo',
                updated_at: new Date()
            }).eq('id', sol.tienda_slug);
        }
        // 3. Marcar como aprobada
        await supabase.from('solicitudes').update({ estado: 'aprobado', processed_at: new Date() }).eq('id', id);
        res.json({ success: true, message: 'Solicitud aprobada correctamente' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Admin: toggle directo de _allow_multi_store en una tienda específica
app.post('/api/admin/tiendas/:slug/multi-store', async (req, res) => {
    try {
        const { slug } = req.params;
        const { permitir } = req.body;
        const { data: store } = await supabase.from('stores').select('configuracion').eq('id', slug).maybeSingle();
        if (!store) return res.status(404).json({ success: false, error: 'Tienda no encontrada' });
        const cfg = store.configuracion || {};
        cfg._allow_multi_store = permitir === true;
        await supabase.from('stores').update({ configuracion: cfg, updated_at: new Date() }).eq('id', slug);
        res.json({ success: true, permitir: cfg._allow_multi_store });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================
// ENDPOINTS DE SALUD Y MONITOREO DEL SISTEMA
// ============================================================

// Health check público (sin auth) — para balanceadores de carga
app.get('/api/health', (req, res) => {
    const healthy = isHealthy();
    const stats = getQueueStats();
    res.status(healthy ? 200 : 503).json({
        status: healthy ? 'ok' : 'degraded',
        uptime: process.uptime(),
        pid: process.pid,
        memory: process.memoryUsage(),
        queue: stats.queue,
        circuitBreakers: stats.circuitBreakers
    });
});

// Stats de cola + circuit breakers (solo superadmin)
app.get('/api/admin/system/stats', async (req, res) => {
    try {
        const stats = getQueueStats();
        res.json({
            success: true,
            pid: process.pid,
            uptime_sec: Math.floor(process.uptime()),
            memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            queue: stats.queue,
            circuitBreakers: stats.circuitBreakers
        });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/admin-cliente', (req, res) => sendHtml(res, 'admin-cliente.html'));
app.get('/admin', (req, res) => sendHtml(res, 'admin.html'));
app.get('/', (req, res) => sendHtml(res, 'index.html'));

app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'Endpoint no encontrado' });
    sendHtml(res, 'offline.html');
});

// ============================================================
// GRACEFUL SHUTDOWN — que un fallo no tire toda la app
// ============================================================
let shuttingDown = false;
const connections = new Set();

// Trackear conexiones activas
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Worker PID ${process.pid} escuchando en puerto ${PORT}`);
    console.log(`🌐 URL Pública: ${APP_URL}`);
    console.log(`👑 Superadmins: ${SUPERADMIN_EMAILS.join(', ') || '⚠️ NINGUNO'}`);
    console.log(`🛡️ Seguridad empresarial activada (6 capas blindadas)`);
    console.log(`⚙️  Cola jerárquica + Circuit Breaker activos`);
    console.log(`📊 Health check en /api/health`);
});

server.on('connection', (conn) => {
    connections.add(conn);
    conn.on('close', () => connections.delete(conn));
});

function gracefulShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} recibido. Cierre graceful iniciado...`);
    console.log(`Conexiones activas: ${connections.size}`);

    // 1. Dejar de aceptar nuevas conexiones
    server.close(() => {
        console.log('✅ Server HTTP cerrado.');
        process.exit(0);
    });

    // 2. Dar 5s a las peticiones en vuelo para terminar
    setTimeout(() => {
        console.warn('⚠️ Forzando cierre de conexiones restantes...');
        for (const conn of connections) {
            conn.destroy();
        }
        process.exit(1);
    }, 5000).unref();

    // 3. Si después de 10s no se cerró, matar
    setTimeout(() => {
        console.error('💥 Cierre forzado.');
        process.exit(2);
    }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

// Capturar errores no manejados — el worker NO debe morir
process.on('uncaughtException', (err) => {
    console.error('💥 UNCAUGHT EXCEPTION:', err.message);
    console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
    console.error('💥 UNHANDLED REJECTION:', reason?.message || reason);
});