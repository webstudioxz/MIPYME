// ============================================================
// server.js — Tienda-FG (v13 FINAL DEFINITIVO)
// ============================================================

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import * as sightengineModule from 'sightengine';
const sightengine = sightengineModule.default || sightengineModule;

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
const APP_URL = process.env.APP_URL || 'https://tienda-fg.onrender.com';
app.set('trust proxy', 1);

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
    if (!process.env.SUPABASE_URL) return res.status(500).json({ error: 'Faltan credenciales' });
    res.json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
        appUrl: APP_URL
    });
});

// ============================================================
// 🛡️ SISTEMA DE SEGURIDAD (SUBIDA DE IMÁGENES CON IA)
// ============================================================
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 } });

// Wrapper para manejar errores de multer como JSON (evita que Express devuelva HTML)
function uploadMiddleware(req, res, next) {
    upload.single('imagen')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ success: false, error: 'La imagen supera el límite de 500KB' });
            }
            return res.status(400).json({ success: false, error: err.message });
        }
        if (err) {
            return res.status(500).json({ success: false, error: 'Error al procesar archivo' });
        }
        next();
    });
}

app.post('/api/upload-seguro', uploadMiddleware, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No se envió imagen' });
        const userId = req.body.user_id;
        if (!userId) return res.status(401).json({ success: false, error: 'Usuario no identificado' });

        const bytes = req.file.buffer;

        // Detección robusta de firma de imagen (JPG, PNG, WEBP, GIF)
        if (bytes.length < 12) {
            return res.status(400).json({ success: false, error: 'Archivo demasiado pequeño o inválido' });
        }
        const firma = bytes.toString('hex', 0, 12).toUpperCase();
        const esJPG = firma.startsWith('FFD8FF');
        const esPNG = firma.startsWith('89504E47');
        const esWEBP = firma.startsWith('52494646') && firma.includes('57454250');
        const esGIF = firma.startsWith('47494638');

        if (!(esJPG || esPNG || esWEBP || esGIF)) {
            await supabase.from('usuarios_bloqueados').insert({ user_id: userId, motivo: 'Intento de inyección de código' });
            await supabase.from('stores').update({ pausada: true, activa: false }).eq('owner_id', userId);
            return res.status(403).json({ success: false, error: 'Archivo inválido. Cuenta bloqueada por seguridad.' });
        }

        const { data: bloqueado } = await supabase.from('usuarios_bloqueados').select('id').eq('user_id', userId).maybeSingle();
        if (bloqueado) return res.status(403).json({ success: false, error: 'Cuenta suspendida.' });

        const { data: config } = await supabase.from('config_seguridad').select('modo_automatico').eq('id', 1).maybeSingle();
        const modoAuto = config ? config.modo_automatico : false;
        let rutaBucket = 'Pendientes';

        if (modoAuto) {
            const sightengineClient = sightengine(process.env.SIGHTENGINE_USER, process.env.SIGHTENGINE_SECRET);
            const check = await sightengineClient.check('nudity-2.0,offensive,gore').setFileBuffer(req.file.buffer);
            const isSafe = check.status === 'success' &&
                check.nudity?.sexual_activity < 0.5 && check.nudity?.sexual_display < 0.5 &&
                check.nudity?.erotica < 0.5 && check.offensive?.prob < 0.5 && check.gore?.prob < 0.5;

            if (!isSafe) {
                await supabase.from('usuarios_bloqueados').insert({ user_id: userId, motivo: 'IA detectó contenido ilegal' });
                await supabase.from('stores').update({ pausada: true, activa: false }).eq('owner_id', userId);
                return res.status(403).json({ success: false, error: 'Contenido inapropiado detectado. Cuenta bloqueada permanentemente.' });
            }
            rutaBucket = 'Productos';
        }

        const fileExt = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
        const fileName = `${userId}-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage.from(rutaBucket).upload(fileName, req.file.buffer, { contentType: req.file.mimetype });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from(rutaBucket).getPublicUrl(fileName);

        res.json({ success: true, url: publicUrl, pendiente: rutaBucket === 'Pendientes' });
    } catch (error) {
        console.error('❌ [upload-seguro]', error);
        res.status(500).json({ success: false, error: 'Error al procesar la imagen. Revisa los logs del servidor.' });
    }
});

// Rutas del panel de seguridad
app.get('/api/admin/seguridad', async (req, res) => {
    const { data } = await supabase.from('config_seguridad').select('modo_automatico').eq('id', 1).maybeSingle();
    res.json({ modo_automatico: data?.modo_automatico || false });
});

app.post('/api/admin/seguridad', async (req, res) => {
    await supabase.from('config_seguridad').update({ modo_automatico: req.body.modo_automatico }).eq('id', 1);
    res.json({ success: true });
});

app.get('/api/admin/pendientes', async (req, res) => {
    try {
        const { data, error } = await supabase.storage.from('Pendientes').list();
        if (error) throw error;
        const fotos = (data || []).map(file => {
            const { data: { publicUrl } } = supabase.storage.from('Pendientes').getPublicUrl(file.name);
            return { name: file.name, url: publicUrl, user_id: file.name.split('-')[0] };
        });
        res.json(fotos);
    } catch (e) { res.json([]); }
});

app.post('/api/admin/aprobar-foto', async (req, res) => {
    try {
        const { name } = req.body;
        const { data: fileData, error: dlError } = await supabase.storage.from('Pendientes').download(name);
        if (dlError) throw dlError;
        const buffer = Buffer.from(await fileData.arrayBuffer());
        await supabase.storage.from('Productos').upload(name, buffer, { contentType: fileData.type });
        await supabase.storage.from('Pendientes').remove([name]);
        res.json({ success: true, url: supabase.storage.from('Productos').getPublicUrl(name).data.publicUrl });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/admin/rechazar-foto', async (req, res) => {
    try {
        const { name, user_id } = req.body;
        await supabase.storage.from('Pendientes').remove([name]);
        await supabase.from('usuarios_bloqueados').insert({ user_id: user_id, motivo: 'Rechazado manualmente por el administrador' });
        await supabase.from('stores').update({ pausada: true, activa: false, estado_pago: 'cancelado' }).eq('owner_id', user_id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/admin/baneados', async (req, res) => {
    try {
        const { data, error } = await supabase.from('usuarios_bloqueados').select('*').order('fecha_bloqueo', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (e) { res.json([]); }
});

// ============ PAYMENT METHODS ============
app.get('/api/payment-methods', async (req, res) => {
    try {
        const { data } = await supabase.from('config').select('*').eq('id', 1).maybeSingle();
        if (!data) return res.json({});
        if (data.payment_settings && (data.payment_settings.bank || data.payment_settings.whatsapp)) {
            return res.json(data.payment_settings);
        }
        if (data.tasas && data.tasas._payment_settings) {
            return res.json(data.tasas._payment_settings);
        }
        res.json({});
    } catch (e) { res.json({}); }
});

// ============ SISTEMA DE PAGOS (TICKETS) ============
app.post('/api/pagos/generar', async (req, res) => {
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

app.get('/api/pagos/check/:codigo', async (req, res) => {
    try {
        const { codigo } = req.params;
        const { data, error } = await supabase.from('pagos_planes').select('estado').eq('codigo', codigo).maybeSingle();
        if (error || !data) return res.json({ valido: false });
        res.json({ valido: data.estado === 'pendiente' });
    } catch (error) { res.json({ valido: false }); }
});

// ============ VERIFICACIÓN DE DISPOSITIVO ============
app.get('/api/check-device', async (req, res) => {
    try {
        const { device_id } = req.query;
        if (!device_id) return res.json({ hasStore: false });
        const { data: allStores, error } = await supabase.from('stores').select('id, nombre, configuracion');
        if (error) return res.json({ hasStore: false });
        const found = (allStores || []).find(s => s.configuracion && s.configuracion._device_id === device_id);
        res.json({ hasStore: !!found, storeName: found?.nombre || null });
    } catch (e) { res.json({ hasStore: false }); }
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

app.post('/api/mi-tienda/pausar', async (req, res) => {
    try {
        const { owner_id, slug, pausar, mensaje } = req.body;
        const { data: tienda } = await supabase.from('stores').select('id, configuracion').eq('id', slug).eq('owner_id', owner_id).maybeSingle();
        if (!tienda) return res.status(404).json({ success: false, error: 'No autorizado' });

        const cfg = tienda.configuracion || {};
        if (pausar === true) {
            cfg._pausada_por = 'owner';
            cfg._pausa_mensaje = (mensaje || 'Volvemos mañana').toString().slice(0, 200);
        } else {
            cfg._pausada_por = null;
            cfg._pausa_mensaje = null;
        }

        const updateBase = { pausada: pausar === true, updated_at: new Date(), configuracion: cfg };

        let { error } = await supabase.from('stores').update({
            ...updateBase,
            pausada_por: pausar === true ? 'owner' : null,
            pausada_mensaje: pausar === true ? (mensaje || 'Volvemos mañana').toString().slice(0, 200) : null
        }).eq('id', slug);

        if (error && (error.message.includes('pausada_por') || error.message.includes('pausada_mensaje') || error.message.includes('column'))) {
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

app.put('/api/mi-tienda/config', async (req, res) => {
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

// ============ CREAR TIENDA CLIENTE ============
app.post('/api/crear-tienda-cliente', async (req, res) => {
    try {
        const { user_id, email, nombre_dueno, nombre_negocio, tipo, telefono, plan, fecha_vencimiento, direccion, hora_apertura, hora_cierre, tasa_usd, metodos_pago, garantia, transporte, dias_laborables, notificaciones_modo, codigo_pago, device_id } = req.body;
        if (!user_id || !nombre_negocio) return res.status(400).json({ success: false, error: 'Faltan datos' });

        const esSuperadmin = SUPERADMIN_EMAILS.includes((email || '').toLowerCase());

        if (plan === 'prueba' && !esSuperadmin) {
            const mesActual = new Date().toISOString().slice(0, 7);
            let { data: control } = await supabase.from('control_sistema').select('*').eq('id', 1).maybeSingle();
            if (control?.mes_actual !== mesActual) {
                await supabase.from('control_sistema').update({ mes_actual: mesActual, tiendas_gratis_creadas: 0, limite_alcanzado: false }).eq('id', 1);
                control = { mes_actual: mesActual, tiendas_gratis_creadas: 0, limite_alcanzado: false };
            }
            if (control?.limite_alcanzado || (control?.tiendas_gratis_creadas || 0) >= 5) {
                return res.status(400).json({ success: false, error: 'El límite de 5 tiendas gratuitas este mes ha sido alcanzado.', codigo: 'LIMITE_PRUEBA' });
            }
            const nuevasCreadas = (control?.tiendas_gratis_creadas || 0) + 1;
            await supabase.from('control_sistema').update({ tiendas_gratis_creadas: nuevasCreadas, limite_alcanzado: nuevasCreadas >= 5 }).eq('id', 1);
        }

        if (!esSuperadmin) {
            const { data: exist } = await supabase.from('stores').select('id').eq('owner_id', user_id).maybeSingle();
            if (exist) return res.status(400).json({ success: false, error: 'Ya tienes una tienda registrada con esta cuenta.', codigo: 'TIENDA_EXISTENTE' });
        }

        if (device_id && !esSuperadmin) {
            const { data: allStores } = await supabase.from('stores').select('id, nombre, configuracion');
            const deviceExist = (allStores || []).find(s => s.configuracion && s.configuracion._device_id === device_id);
            if (deviceExist) return res.status(400).json({ success: false, error: 'Este dispositivo ya tiene una tienda registrada.', codigo: 'DISPOSITIVO_BLOQUEADO' });
        }

        let slug = nombre_negocio.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        const { data: dup } = await supabase.from('stores').select('id').eq('id', slug).maybeSingle();
        if (dup) return res.status(400).json({ success: false, error: 'Nombre en uso', codigo: 'NOMBRE_DUPLICADO' });

        const maxProd = plan === 'premium' ? 100 : (plan === 'pro' ? 20 : (plan === 'basico' ? 10 : 5));
        const tasa = (parseFloat(tasa_usd) > 0) ? parseFloat(tasa_usd) : 25;
        const diasFinales = dias_laborables !== undefined ? normalizeDias(dias_laborables) : [1,2,3,4,5,6];
        const modoNotif = ['admin', 'whatsapp', 'ambos'].includes(notificaciones_modo) ? notificaciones_modo : 'admin';
        const esPago = plan !== 'prueba';

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
            activa: false,
            pausada: false,
            es_superadmin: esSuperadmin,
            created_at: new Date(),
            updated_at: new Date()
        };

        let { data, error } = await supabase.from('stores').insert({
            ...insertData,
            pausada_por: null,
            pausada_mensaje: null
        }).select();

        if (error && (error.message.includes('pausada_por') || error.message.includes('pausada_mensaje') || error.message.includes('column'))) {
            const retry = await supabase.from('stores').insert(insertData).select();
            data = retry.data;
            error = retry.error;
        }

        if (error) throw error;

        import('./src/utils/pushNotifications.js').then(m => { m.sendPushToAll({ title: esPago ? '💰 Nueva Tienda Pendiente' : '🏪 Nueva Tienda', body: `${nombre_negocio}`, url: `${APP_URL}/admin`, tienda: null }).catch(console.error); }).catch(console.error);

        res.json({ success: true, slug, store: data[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ SUPER-ADMIN Y ADMIN CENTRAL ============
app.post('/api/admin/login', (req, res) => {
    if (req.body.password === process.env.ADMIN_PASSWORD) {
        const token = 'admin-token-' + Date.now();
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
    }
});

app.get('/api/admin/verify-session', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) return res.json({ valid: true });
    res.status(401).json({ valid: false });
});

app.get('/api/superadmin/tiendas', async (req, res) => {
    try {
        const { data } = await supabase.from('stores').select('*').order('created_at', { ascending: false });
        const tiendas = await Promise.all((data || []).map(async (t) => {
            let ownerEmail = null;
            if (t.owner_id) {
                try {
                    const { data: u } = await supabase.auth.admin.getUserById(t.owner_id);
                    if (u?.user) ownerEmail = u.user.email;
                } catch (e) {}
            }
            const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('tienda', t.id);
            return { ...t, owner_email: ownerEmail, productos_count: count || 0 };
        }));
        res.json(tiendas);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/superadmin/usuarios', async (req, res) => {
    try {
        const { data: userList } = await supabase.auth.admin.listUsers();
        const usuarios = await Promise.all((userList?.users || []).map(async (u) => {
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

app.post('/api/superadmin/extender/:id', async (req, res) => {
    try {
        const d = new Date(); d.setDate(d.getDate() + 30);
        await supabase.from('stores').update({ fecha_vencimiento: d.toISOString(), estado_pago: 'activo' }).eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/superadmin/pausar/:id', async (req, res) => {
    try {
        const pausar = req.body.pausar === true;
        const mensajePausa = (req.body.mensaje || 'Tienda pausada por administración').toString().slice(0, 200);

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
        const { email, nombre_negocio, nombre, icono, descripcion, categorias, telefono, email_contacto, ubicacion, apertura, cierre, tasaUSD, tasaEUR, tarjeta, whatsapp, tipo, plan, permanente, dias_laborables, notificaciones_modo } = req.body;
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
            owner_id: user.id, plan: plan || 'basico', fecha_vencimiento: permanente ? '9999-12-31T23:59:59.000Z' : fv.toISOString(),
            estado_pago: 'activo', max_productos: maxProd, activa: true, pausada: false, es_superadmin: true, created_at: new Date(), updated_at: new Date()
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

app.put('/api/superadmin/tiendas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, icono, descripcion, categorias, configuracion } = req.body;

        const { data: current } = await supabase.from('stores').select('configuracion').eq('id', id).single();
        if (!current) return res.status(404).json({ success: false, error: 'Tienda no encontrada' });

        const mergedConfig = deepMerge(current.configuracion || {}, configuracion || {});

        const { error } = await supabase.from('stores').update({
            nombre,
            icono,
            descripcion,
            categorias,
            configuracion: mergedConfig,
            updated_at: new Date()
        }).eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
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

app.get('/api/superadmin/pedidos', async (req, res) => {
    try {
        const { tienda } = req.query;
        let query = supabase.from('orders').select('*').order('created_at', { ascending: false });
        if (tienda) query = query.eq('tienda', tienda);
        const { data, error } = await query;
        if (error) throw error;
        res.json(data || []);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ============ ADMIN: LIBERAR TIENDA ============
app.post('/api/admin/liberar-tienda/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
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

// ============ ADMIN: PAGOS ============
app.get('/api/admin/pagos', async (req, res) => {
    try {
        const { data, error } = await supabase.from('pagos_planes').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/admin/aprobar-pago/:id', async (req, res) => {
    try {
        const { data: pago, error: errPago } = await supabase.from('pagos_planes').select('*').eq('id', req.params.id).single();
        if (errPago || !pago) return res.status(404).json({ success: false, error: 'Pago no encontrado' });

        const { slug } = req.body;
        if (!slug) return res.status(400).json({ success: false, error: 'Falta el slug de la tienda' });

        let fechaVencimiento = new Date();
        fechaVencimiento.setMonth(fechaVencimiento.getMonth() + pago.meses);

        const { data: storeData } = await supabase.from('stores').select('configuracion').eq('id', slug).maybeSingle();
        const cfg = storeData?.configuracion || {};
        if (cfg._pausa_mensaje !== undefined) cfg._pausa_mensaje = null;

        const updateBase = {
            pausada: false,
            estado_pago: 'activo',
            fecha_vencimiento: fechaVencimiento.toISOString(),
            configuracion: cfg
        };

        let { error: errUpd } = await supabase.from('stores').update({
            ...updateBase,
            pausada_por: null,
            pausada_mensaje: null
        }).eq('id', slug);

        if (errUpd && (errUpd.message.includes('pausada_por') || errUpd.message.includes('pausada_mensaje') || errUpd.message.includes('column'))) {
            const retry = await supabase.from('stores').update(updateBase).eq('id', slug);
            errUpd = retry.error;
        }

        if (errUpd) throw errUpd;

        await supabase.from('pagos_planes').update({ estado: 'aprobado' }).eq('id', req.params.id);

        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ ADMIN: DATOS DE PAGO DEL SISTEMA ============
app.put('/api/superadmin/payment-methods', async (req, res) => {
    try {
        const { bank, qr, whatsapp } = req.body;
        const payment_settings = { bank: bank || '', qr: qr || '', whatsapp: whatsapp || '' };

        const { data: current } = await supabase.from('config').select('*').eq('id', 1).maybeSingle();

        if (current) {
            const tasasActualizadas = { ...(current.tasas || { CUP: 1, USD: 0.04, EUR: 0.037 }) };
            tasasActualizadas._payment_settings = payment_settings;

            const { error: errCol } = await supabase.from('config')
                .update({ payment_settings, tasas: tasasActualizadas }).eq('id', 1);
            if (errCol) {
                const { error: errTasas } = await supabase.from('config')
                    .update({ tasas: tasasActualizadas }).eq('id', 1);
                if (errTasas) throw errTasas;
            }
        } else {
            const { error: errInsert } = await supabase.from('config').insert({
                id: 1,
                moneda_base: 'CUP',
                tasas: { CUP: 1, USD: 0.04, EUR: 0.037, _payment_settings: payment_settings },
                payment_settings
            });
            if (errInsert) {
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

// ============ PLANES ============
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

// ============ PRIVACIDAD ============
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
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`🌐 URL Pública: ${APP_URL}`);
    console.log(`👑 Superadmins: ${SUPERADMIN_EMAILS.join(', ') || '⚠️ NINGUNO'}`);
});