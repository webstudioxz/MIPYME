// ============================================================
// server.js — Tienda-FG (v8 BLINDAJE DE PAGOS REALES)
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
    if (!process.env.SUPABASE_URL) return res.status(500).json({ error: "Faltan credenciales" });
    res.json({ supabaseUrl: process.env.SUPABASE_URL, supabaseAnonKey: process.env.SUPABASE_ANON_KEY, appUrl: APP_URL });
});

// ============ PUSH ============
app.get('/api/push/public-key', (req, res) => res.json({ publicKey: process.env.VAPID_PUBLIC_KEY }));
app.get('/api/push/check', async (req, res) => { /* ... sin cambios ... */ try { const { tienda } = req.query; let query = supabase.from('push_subscriptions').select('id'); if (tienda) query = query.eq('tienda_id', tienda); else query = query.is('tienda_id', null); const { data } = await query.limit(1); res.json({ subscribed: !!(data && data.length > 0) }); } catch (e) { res.json({ subscribed: false }); } });
app.post('/api/push/subscribe', async (req, res) => { /* ... sin cambios ... */ try { const { endpoint, keys, tienda_id } = req.body; if (!endpoint || !keys || !keys.p256dh || !keys.auth) return res.status(400).json({ success: false, error: 'Faltan datos' }); let deleteQuery = supabase.from('push_subscriptions').delete().eq('endpoint', endpoint); if (tienda_id) deleteQuery = deleteQuery.eq('tienda_id', tienda_id); else deleteQuery = deleteQuery.is('tienda_id', null); await deleteQuery; const { error } = await supabase.from('push_subscriptions').insert({ endpoint, p256dh: keys.p256dh, auth: keys.auth, tienda_id: tienda_id || null }); if (error) throw error; res.json({ success: true }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
app.post('/api/push/test', async (req, res) => { /* ... sin cambios ... */ try { const { tienda } = req.body; const module = await import('./src/utils/pushNotifications.js'); await module.sendPushToAll({ title: `🧪 Prueba`, body: `Funcionan para ${tienda || 'Admin'}`, url: tienda ? `${APP_URL}/admin-cliente?tienda=${tienda}` : `${APP_URL}/admin`, tienda }); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });

// ============ MI-TIENDA ============
app.get('/api/mi-tienda', async (req, res) => { /* ... sin cambios ... */ });
app.post('/api/mi-tienda/pausar', async (req, res) => { /* ... sin cambios ... */ });
app.delete('/api/mi-tienda/:slug', async (req, res) => { /* ... sin cambios ... */ });
app.put('/api/mi-tienda/config', async (req, res) => { /* ... sin cambios ... */ });
app.put('/api/mi-tienda/categorias', async (req, res) => { /* ... sin cambios ... */ });

// ============ PRODUCTOS ============
app.get('/api/mis-productos', async (req, res) => { /* ... sin cambios ... */ });
app.put('/api/mis-productos/:id', async (req, res) => { /* ... sin cambios ... */ });
app.post('/api/mis-productos', async (req, res) => { /* ... sin cambios ... */ });
app.delete('/api/mis-productos/:id', async (req, res) => { /* ... sin cambios ... */ });
app.get('/api/mis-pedidos', async (req, res) => { /* ... sin cambios ... */ });

// ============ RESERVAS ============
app.get('/api/reservas/disponibles', async (req, res) => { /* ... sin cambios ... */ });
app.post('/api/reservas', async (req, res) => { /* ... sin cambios ... */ });
app.get('/api/reservas', async (req, res) => { /* ... sin cambios ... */ });
app.put('/api/reservas/:id/confirmar', async (req, res) => { /* ... sin cambios ... */ });
app.delete('/api/reservas/:id', async (req, res) => { /* ... sin cambios ... */ });

// ============ CREAR TIENDA CLIENTE (PLAN GRATIS) ============
app.post('/api/crear-tienda-cliente', async (req, res) => {
    try {
        const { user_id, email, nombre_dueno, nombre_negocio, tipo, telefono, plan, fecha_vencimiento, direccion, hora_apertura, hora_cierre, tasa_usd, metodos_pago, garantia, transporte, dias_laborables, notificaciones_modo } = req.body;
        
        // 🚨 BLINDAJE: Solo el Superadmin puede crear tiendas de pago directo. Si no, rebota.
        const esSuperadmin = SUPERADMIN_EMAILS.includes((email || '').toLowerCase());
        if (plan !== 'prueba' && !esSuperadmin) {
            return res.status(403).json({ success: false, error: 'Para planes de pago, debes pagar y esperar aprobación.', codigo: 'PLAN_PAGO_REQUIERE_ADMIN' });
        }

        if (!user_id || !nombre_negocio) return res.status(400).json({ success: false, error: 'Faltan datos' });
        
        if (!esSuperadmin) {
            const { data: exist } = await supabase.from('stores').select('id').eq('owner_id', user_id).maybeSingle();
            if (exist) return res.status(400).json({ success: false, error: 'Ya tienes una tienda', codigo: 'TIENDA_EXISTENTE' });
        }
        
        let slug = nombre_negocio.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        const { data: dup } = await supabase.from('stores').select('id').eq('id', slug).maybeSingle();
        if (dup) return res.status(400).json({ success: false, error: 'Nombre en uso', codigo: 'NOMBRE_DUPLICADO' });
        
        const maxProd = plan === 'premium' ? 100 : (plan === 'pro' ? 20 : (plan === 'basico' ? 10 : 5));
        const tasa = (parseFloat(tasa_usd) > 0) ? parseFloat(tasa_usd) : 25;
        const diasFinales = dias_laborables !== undefined ? normalizeDias(dias_laborables) : [1,2,3,4,5,6];
        const modoNotif = ['admin', 'whatsapp', 'ambos'].includes(notificaciones_modo) ? notificaciones_modo : 'admin';

        const { data, error } = await supabase.from('stores').insert({
            id: slug, nombre: nombre_negocio, descripcion: 'Bienvenido a ' + nombre_negocio, icono: '🛒', categorias: ['otros'],
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
            owner_id: user_id, plan, fecha_vencimiento, estado_pago: plan === 'prueba' ? 'prueba' : 'pendiente', max_productos: maxProd, activa: true, pausada: false, es_superadmin: esSuperadmin, created_at: new Date(), updated_at: new Date()
        }).select();
        
        if (error) throw error;
        
        import('./src/utils/pushNotifications.js').then(m => { m.sendPushToAll({ title: '🏪 Nueva Tienda', body: `${nombre_negocio}`, url: `${APP_URL}/admin`, tienda: null }).catch(console.error); }).catch(console.error);
        res.json({ success: true, slug, store: data[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ SOLICITUDES DE TIENDAS DE PAGO ============
app.post('/api/solicitar-tienda', async (req, res) => {
    try {
        const { user_id, email, nombre_negocio, slug, plan, telefono, datos_extra } = req.body;
        const precios = { 'basico': 1000, 'pro': 1500, 'premium': 2500 };
        const precio = precios[plan] || 0;

        const { data, error } = await supabase.from('solicitudes_tiendas').insert({
            owner_id: user_id, email, nombre_negocio, slug, plan, precio, telefono, datos_extra, estado: 'pendiente', created_at: new Date()
        }).select().single();

        if (error) throw error;

        import('./src/utils/pushNotifications.js').then(m => { 
            m.sendPushToAll({ title: '💰 Nueva Solicitud de Pago', body: `${nombre_negocio} - Plan ${plan.toUpperCase()} (${precio} CUP)`, url: `${APP_URL}/admin`, tienda: null }).catch(console.error); 
        }).catch(console.error);

        res.json({ success: true, solicitudId: data.id });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/superadmin/solicitudes', async (req, res) => {
    try {
        const { data, error } = await supabase.from('solicitudes_tiendas').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/superadmin/aprobar-solicitud/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { data: sol, error: errSol } = await supabase.from('solicitudes_tiendas').select('*').eq('id', id).single();
        if (errSol || !sol) return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });
        if (sol.estado === 'aprobada') return res.status(400).json({ success: false, error: 'Ya fue aprobada' });

        const d = sol.datos_extra;
        const maxProd = sol.plan === 'premium' ? 100 : (sol.plan === 'pro' ? 20 : 10);
        const fv = new Date(); fv.setDate(fv.getDate() + 30);

        const { error: errInsert } = await supabase.from('stores').insert({
            id: sol.slug, nombre: sol.nombre_negocio, descripcion: 'Bienvenido a ' + sol.nombre_negocio, icono: '🛒', categorias: ['otros'],
            configuracion: {
                tipo: d.tipo || 'tienda', whatsapp_por_producto: false, notificaciones_modo: 'admin',
                contacto: { telefono: sol.telefono, email: sol.email, ubicacion: d.direccion || 'Cuba' },
                horario: { apertura: d.hora_apertura || '09:00', cierre: d.hora_cierre || '18:00', dias: [1,2,3,4,5,6], intervalo: 60 },
                envio: { disponible: d.transporte === true, costo: 0, tiempo_estimado: '24-48h' },
                garantia: { disponible: d.garantia === true, duracion: '12 meses', descripcion: 'Garantía del vendedor' },
                metodos_pago: d.metodos_pago || ['Efectivo'],
                datos_bancarios: { numero_tarjeta: '', whatsapp_confirmacion: sol.telefono },
                tasas: { CUP: 1, USD: 1 / (d.tasa_usd || 25), EUR: 1 / ((d.tasa_usd || 25) * 1.1) }
            },
            owner_id: sol.owner_id, plan: sol.plan, fecha_vencimiento: fv.toISOString(), estado_pago: 'activo', max_productos: maxProd, activa: true, pausada: false, es_superadmin: false, created_at: new Date(), updated_at: new Date()
        });

        if (errInsert) throw errInsert;
        await supabase.from('solicitudes_tiendas').update({ estado: 'aprobada' }).eq('id', id);
        res.json({ success: true, mensaje: 'Tienda creada y activada exitosamente' });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ SUPER-ADMIN ============
app.get('/api/superadmin/usuarios', async (req, res) => { /* ... sin cambios ... */ });
app.delete('/api/superadmin/usuarios/:id', async (req, res) => { /* ... sin cambios ... */ });
app.get('/api/superadmin/tiendas', async (req, res) => { /* ... sin cambios ... */ });
app.post('/api/superadmin/extender/:id', async (req, res) => { /* ... sin cambios ... */ });
app.post('/api/superadmin/pausar/:id', async (req, res) => { /* ... sin cambios ... */ });
app.delete('/api/superadmin/tiendas/:id', async (req, res) => { /* ... sin cambios ... */ });
app.post('/api/superadmin/tiendas/:id/tiempo', async (req, res) => { /* ... sin cambios ... */ });
app.post('/api/superadmin/tiendas/:id/cancelar', async (req, res) => { /* ... sin cambios ... */ });
app.post('/api/superadmin/crear-tienda', async (req, res) => { /* ... sin cambios ... */ });
app.post('/api/superadmin/crear-producto', async (req, res) => { /* ... sin cambios ... */ });
app.put('/api/superadmin/tiendas/:id/contexto', async (req, res) => { /* ... sin cambios ... */ });
app.get('/api/planes', async (req, res) => { /* ... sin cambios ... */ });
app.get('/api/superadmin/planes', async (req, res) => { /* ... sin cambios ... */ });
app.put('/api/superadmin/planes/:id', async (req, res) => { /* ... sin cambios ... */ });
app.get('/api/privacidad', async (req, res) => { /* ... sin cambios ... */ });
app.put('/api/superadmin/privacidad', async (req, res) => { /* ... sin cambios ... */ });

// ============ FUNCIÓN AUXILIAR BORRAR TIENDA ============
async function borrarTodoDeTienda(slug) { /* ... sin cambios ... */ }

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
    console.log(`🚀 Puerto ${PORT}`);
    console.log(`🌐 URL Pública: ${APP_URL}`);
    console.log(`👑 Superadmins: ${SUPERADMIN_EMAILS.join(', ') || '⚠️ NINGUNO'}`);
});