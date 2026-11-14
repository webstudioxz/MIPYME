// ============================================================
// server.js — Tienda-FG (AUTOLOCALIZABLE Y BLINDADO)
// ============================================================

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import apiRoutes from './src/routes/apiRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';

// 🚨 1. AUTOLOCALIZADOR DE .ENV
const __filename = fileURLToPath(import.meta.url);
let __dirname = path.dirname(__filename);

const envPaths = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '../.env'),
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '../.env')
];
for (const p of envPaths) {
    if (fs.existsSync(p)) {
        dotenv.config({ path: p });
        console.log(`✅ [ENV] Archivo .env cargado desde: ${p}`);
        break;
    }
}

// 🚨 2. AUTOLOCALIZADOR DE CARPETAS
let PROJECT_ROOT = __dirname;
if (__dirname.endsWith('/src') || __dirname.endsWith('\\src')) {
    PROJECT_ROOT = path.dirname(__dirname);
}

let PUBLIC_PATH = path.join(PROJECT_ROOT, 'public');
if (!fs.existsSync(PUBLIC_PATH)) {
    const fallback = path.join(process.cwd(), 'public');
    if (fs.existsSync(fallback)) PUBLIC_PATH = fallback;
}

console.log(`📁 [AUTOLOCALIZADOR] Server.js detectado en: ${__dirname}`);
console.log(`📁 [AUTOLOCALIZADOR] Carpeta PÚBLICA detectada en: ${PUBLIC_PATH}`);

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
    const posiblesRutas = [ 
        path.join(PUBLIC_PATH, filename), 
        path.join(PROJECT_ROOT, 'public', filename), 
        path.join(process.cwd(), 'public', filename) 
    ];
    let foundPath = null;
    for (const p of posiblesRutas) { if (fs.existsSync(p)) { foundPath = p; break; } }
    if (!foundPath) return res.status(500).send(`<h1>Error 500</h1><p>Archivo no encontrado: ${filename}</p>`);
    res.sendFile(foundPath, (err) => { if (err && !res.headersSent) res.status(500).send('Error interno'); });
}

// ============================================
// ENDPOINT DE CONFIGURACIÓN
// ============================================
app.get('/api/public-config', (req, res) => {
    if (!process.env.SUPABASE_URL) return res.status(500).json({ error: "Faltan credenciales en el servidor" });
    res.json({ supabaseUrl: process.env.SUPABASE_URL, supabaseAnonKey: process.env.SUPABASE_ANON_KEY });
});

// ============================================
// NOTIFICACIONES PUSH
// ============================================
app.get('/api/push/public-key', (req, res) => res.json({ publicKey: process.env.VAPID_PUBLIC_KEY }));

app.get('/api/push/check', async (req, res) => {
    try {
        const { tienda } = req.query;
        let query = supabase.from('push_subscriptions').select('id');
        if (tienda) {
            query = query.eq('tienda_id', tienda);
        } else {
            query = query.is('tienda_id', null);
        }
        const { data } = await query.limit(1);
        res.json({ subscribed: !!(data && data.length > 0) });
    } catch (e) {
        res.json({ subscribed: false });
    }
});

app.post('/api/push/subscribe', async (req, res) => {
    try {
        const { endpoint, keys, tienda_id } = req.body;
        
        if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
            return res.status(400).json({ success: false, error: 'Faltan datos de suscripción' });
        }
        
        let deleteQuery = supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
        if (tienda_id) {
            deleteQuery = deleteQuery.eq('tienda_id', tienda_id);
        } else {
            deleteQuery = deleteQuery.is('tienda_id', null);
        }
        await deleteQuery;
        
        const { error } = await supabase.from('push_subscriptions').insert({ 
            endpoint, 
            p256dh: keys.p256dh, 
            auth: keys.auth, 
            tienda_id: tienda_id || null 
        });

        if (error) throw error;

        console.log(`✅ [PUSH] Dispositivo registrado para: ${tienda_id || 'ADMIN CENTRAL'}`);
        res.json({ success: true });
    } catch (e) {
        console.error('❌ [PUSH] Error guardando:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/push/test', async (req, res) => {
    try {
        const { tienda } = req.body;
        const module = await import('./src/utils/pushNotifications.js');
        await module.sendPushToAll({
            title: `🧪 Prueba de Notificación`,
            body: `Si ves esto, las notificaciones funcionan para ${tienda || 'Admin Central'}`,
            url: tienda ? `/admin-cliente?tienda=${tienda}` : '/admin',
            tienda: tienda
        });
        res.json({ success: true, message: 'Orden enviada al servidor.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================
// MI-TIENDA
// ============================================
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

app.get('/api/mis-productos', async (req, res) => {
    try {
        const { data, error } = await supabase.from('products').select('*').eq('tienda', req.query.tienda).order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// 🚨 Acepta whatsapp_proveedor y requiere_carnet
app.post('/api/mis-productos', async (req, res) => {
    try {
        const { data: tienda } = await supabase.from('stores').select('max_productos').eq('id', req.body.tienda).single();
        const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('tienda', req.body.tienda);
        if (tienda && count >= (tienda.max_productos || 10)) return res.status(400).json({ error: 'Límite de productos alcanzado' });
        const payload = {
            ...req.body,
            whatsapp_proveedor: (req.body.whatsapp_proveedor || '').trim() || null,
            requiere_carnet: req.body.requiere_carnet === true || req.body.requiere_carnet === 'true',
            created_at: new Date()
        };
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

// ============================================
// CREAR TIENDA DE CLIENTE
// ============================================
app.post('/api/crear-tienda-cliente', async (req, res) => {
    try {
        const { user_id, email, nombre_dueno, nombre_negocio, tipo, telefono, plan, fecha_vencimiento, direccion, hora_apertura, hora_cierre, tasa_usd, metodos_pago, garantia, transporte } = req.body;
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
            configuracion: { tipo: tipo, contacto: { telefono, email, ubicacion: direccion || 'Cuba' }, horario: { apertura: hora_apertura || '09:00', cierre: hora_cierre || '18:00', dias: [1,2,3,4,5,6] }, envio: { disponible: transporte === true, costo: 0, tiempo_estimado: '24-48h' }, garantia: { disponible: garantia === true, duracion: '12 meses', descripcion: 'Garantía del vendedor' }, metodos_pago: Array.isArray(metodos_pago) && metodos_pago.length ? metodos_pago : ['Efectivo'], datos_bancarios: { numero_tarjeta: '', whatsapp_confirmacion: telefono }, tasas: { CUP: 1, USD: 1 / tasaSegura, EUR: 1 / (tasaSegura * 1.1) } },
            owner_id: user_id, plan: plan, fecha_vencimiento: fecha_vencimiento, estado_pago: plan === 'prueba' ? 'prueba' : 'pendiente', max_productos: maxProductos, activa: true, pausada: false, es_superadmin: esSuperadmin, created_at: new Date(), updated_at: new Date()
        }).select();
        
        if (error) throw error;

        import('./src/utils/pushNotifications.js').then(m => {
            m.sendPushToAll({ 
                title: '🏪 Nueva Tienda Creada', 
                body: `${nombre_negocio} registrada por ${nombre_dueno}.`, 
                url: '/admin', 
                tienda: null 
            }).catch(console.error);
        }).catch(console.error);

        res.json({ success: true, slug: slug, store: data[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
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
        const tiendasConDatos = await Promise.all((data || []).map(async (t) => {
            const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('tienda', t.id);
            let ownerEmail = null;
            if (t.owner_id) {
                try {
                    const { data: u } = await supabase.auth.admin.getUserById(t.owner_id);
                    if (u?.user) ownerEmail = u.user.email;
                } catch (e) {}
            }
            const esMia = t.es_superadmin === true
                || !t.owner_id
                || (ownerEmail && SUPERADMIN_EMAILS.includes(ownerEmail.toLowerCase()));
            return {
                ...t,
                productos_count: count || 0,
                owner_email: ownerEmail,
                es_mia: !!esMia
            };
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
        await supabase.from('push_subscriptions').delete().eq('tienda_id', req.params.id);
        await supabase.from('stores').delete().eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/superadmin/tiendas/:id/tiempo', async (req, res) => {
    try {
        const { dias, horas } = req.body;
        const { data: tienda } = await supabase.from('stores').select('fecha_vencimiento').eq('id', req.params.id).single();
        let baseDate = new Date();
        if (tienda && tienda.fecha_vencimiento && new Date(tienda.fecha_vencimiento) > baseDate && !tienda.fecha_vencimiento.startsWith('9999')) { baseDate = new Date(tienda.fecha_vencimiento); }
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

// 🚨 CREAR TIENDA (formulario completo)
app.post('/api/superadmin/crear-tienda', async (req, res) => {
    try {
        const {
            email, nombre_negocio, nombre, icono, descripcion, categorias,
            telefono, email_contacto, ubicacion, apertura, cierre,
            tasaUSD, tasaEUR, tarjeta, whatsapp,
            tipo, plan, permanente
        } = req.body;

        const finalNombre = (nombre || nombre_negocio || '').trim();
        if (!email || !finalNombre) {
            return res.status(400).json({ success: false, error: 'Email y nombre del negocio son obligatorios' });
        }

        const { data: userList } = await supabase.auth.admin.listUsers();
        const user = userList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
        if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado con ese email' });

        let slug = finalNombre.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        if (!slug) slug = 'tienda-' + Date.now();
        const { data: existe } = await supabase.from('stores').select('id').eq('id', slug).maybeSingle();
        if (existe) slug = slug + '-' + Math.floor(Math.random() * 1000);

        const fechaVencimiento = new Date();
        fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);

        const usdRate = (parseFloat(tasaUSD) && parseFloat(tasaUSD) > 0) ? parseFloat(tasaUSD) : 25;
        const eurRate = (parseFloat(tasaEUR) && parseFloat(tasaEUR) > 0) ? parseFloat(tasaEUR) : 27;

        let catsFinal = ['otros'];
        if (Array.isArray(categorias) && categorias.length) {
            catsFinal = categorias.map(c => String(c).trim()).filter(Boolean);
        } else if (typeof categorias === 'string' && categorias.trim()) {
            catsFinal = categorias.split(',').map(c => c.trim()).filter(Boolean);
        }

        const { error: insertError } = await supabase.from('stores').insert({
            id: slug,
            nombre: finalNombre,
            descripcion: (descripcion || '').trim() || ('Bienvenido a ' + finalNombre),
            icono: (icono || '🛒').slice(0, 4),
            categorias: catsFinal,
            configuracion: {
                tipo: tipo || 'tienda',
                contacto: {
                    telefono: telefono || '',
                    email: email_contacto || email,
                    ubicacion: ubicacion || ''
                },
                horario: {
                    apertura: apertura || '09:00',
                    cierre: cierre || '18:00',
                    dias: [1, 2, 3, 4, 5, 6]
                },
                envio: { disponible: true, costo: 0, tiempo_estimado: '24-48h' },
                garantia: { disponible: true, duracion: '12 meses', descripcion: 'Garantía del vendedor' },
                metodos_pago: ['Efectivo', 'Transferencia'],
                datos_bancarios: {
                    numero_tarjeta: tarjeta || '',
                    whatsapp_confirmacion: whatsapp || telefono || ''
                },
                tasas: { CUP: 1, USD: 1 / usdRate, EUR: 1 / eurRate }
            },
            owner_id: user.id,
            plan: plan || 'basico',
            fecha_vencimiento: permanente ? '9999-12-31T23:59:59.000Z' : fechaVencimiento.toISOString(),
            estado_pago: 'activo',
            max_productos: plan === 'pro' ? 20 : 10,
            activa: true,
            pausada: false,
            es_superadmin: true,
            created_at: new Date(),
            updated_at: new Date()
        });

        if (insertError) throw insertError;

        import('./src/utils/pushNotifications.js').then(m => {
            m.sendPushToAll({
                title: '🏪 Nueva Tienda Creada',
                body: `${finalNombre} creada por Super Admin.`,
                url: '/admin',
                tienda: null
            }).catch(console.error);
        }).catch(console.error);

        res.json({ success: true, slug: slug });
    } catch (error) {
        console.error('❌ [crear-tienda] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🚨 CREAR PRODUCTO (acepta whatsapp_proveedor y requiere_carnet)
app.post('/api/superadmin/crear-producto', async (req, res) => {
    try {
        const { tienda, nombre, descripcion, precio, descuento, categoria, imagen, disponible, garantia, transporte, whatsapp_proveedor, requiere_carnet } = req.body;
        if (!tienda || !nombre || !precio) return res.status(400).json({ success: false, error: 'Faltan datos' });
        let descripcionFinal = descripcion || '';
        if (garantia || transporte) {
            descripcionFinal += `\n\n--- Detalles Adicionales ---\n`;
            if (garantia) descripcionFinal += `🛡️ Garantía: ${garantia}\n`;
            if (transporte) descripcionFinal += `🚚 Transporte: ${transporte}\n`;
        }
        const { data, error } = await supabase.from('products').insert({
            tienda,
            nombre,
            descripcion: descripcionFinal.trim(),
            precio: parseFloat(precio),
            descuento: parseInt(descuento) || 0,
            categoria: categoria || 'otros',
            imagen: imagen || 'https://via.placeholder.com/300',
            disponible: disponible === true || disponible === 'true',
            tamanio: 'pequeno',
            whatsapp_proveedor: (whatsapp_proveedor || '').trim() || null,
            requiere_carnet: requiere_carnet === true || requiere_carnet === 'true',
            created_at: new Date(),
            updated_at: new Date()
        }).select();
        if (error) throw error;
        res.json({ success: true, product: data[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// RUTAS IMPORTADAS
// ============================================
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// ============================================
// VISTAS HTML
// ============================================
app.get('/admin-cliente', (req, res) => sendHtml(res, 'admin-cliente.html'));
app.get('/admin', (req, res) => sendHtml(res, 'admin.html'));
app.get('/', (req, res) => sendHtml(res, 'index.html'));

app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'API endpoint no encontrado' });
    sendHtml(res, 'offline.html');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`👑 Superadmins: ${SUPERADMIN_EMAILS.length ? SUPERADMIN_EMAILS.join(', ') : '⚠️ NINGUNO'}`);
});