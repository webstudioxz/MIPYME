// ============================================================
// server.js — Tienda-FG (TODO EN UNO, sin carpeta src/)
// ============================================================

import express from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.URL || 'https://geminis-r28w.onrender.com';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) { console.error('❌ ADMIN_PASSWORD no configurada'); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('❌ Faltan credenciales Supabase'); process.exit(1); }

console.log('🔍 SUPABASE:', SUPABASE_URL ? '✅' : '❌');
console.log('🔍 ADMIN_PASSWORD:', ADMIN_PASSWORD ? '✅' : '❌');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================
// SESIONES
// ============================================
const sessions = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of sessions) if (v.expiry < now) sessions.delete(k);
}, 300000);

// ============================================
// RATE LIMIT
// ============================================
const rateLimitStore = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of rateLimitStore) if (now > rec.resetTime) rateLimitStore.delete(ip);
}, 60000);

// ============================================
// MIDDLEWARE
// ============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Anti-caché para HTML
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || req.path === '/admin') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// RUTAS HTML
// ============================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) { console.error(err); res.status(500).send('Error: index.html no encontrado'); }
    });
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'), (err) => {
        if (err) { console.error(err); res.status(500).send('Error: admin.html no encontrado'); }
    });
});

app.get('/admin.html', (req, res) => res.redirect('/admin'));
app.get('/producto/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ============================================
// API PÚBLICA
// ============================================
app.get('/api/status', (req, res) => res.json({ online: true }));

app.get('/api/config', async (req, res) => {
    try {
        const { data, error } = await supabase.from('config').select('*').eq('id', 1).single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.json({ moneda_base: 'CUP', tasas: { CUP: 1, USD: 0.04, EUR: 0.037 } });
    }
});

app.get('/api/tiendas/info', async (req, res) => {
    try {
        const { data, error } = await supabase.from('stores').select('*');
        if (error) throw error;
        res.json(data || []);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/tiendas/:id', async (req, res) => {
    try {
        const { data, error } = await supabase.from('stores').select('*').eq('id', req.params.id).single();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Tienda no encontrada' });
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/tiendas/:id/config', async (req, res) => {
    try {
        const { data, error } = await supabase.from('stores').select('configuracion').eq('id', req.params.id).single();
        if (error) throw error;
        res.json(data?.configuracion || {});
    } catch (error) { res.json({}); }
});

app.get('/api/productos', async (req, res) => {
    try {
        const tienda = req.query.tienda || 'electro';
        const { data, error } = await supabase.from('products').select('*').eq('tienda', tienda).order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (error) { res.json([]); }
});

app.get('/api/categorias', async (req, res) => {
    try {
        const tienda = req.query.tienda || 'electro';
        const { data, error } = await supabase.from('stores').select('categorias').eq('id', tienda).single();
        if (error) throw error;
        res.json(data?.categorias || ['otros']);
    } catch (error) { res.json(['otros']); }
});

// ============================================
// PEDIDOS
// ============================================
function generarCodigoUnico() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return `${code}${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

app.post('/api/pedidos', async (req, res) => {
    try {
        const tienda = req.body.tienda || 'electro';
        const codigoCliente = generarCodigoUnico();
        const ip = req.ip || req.connection.remoteAddress;

        let record = rateLimitStore.get(ip);
        if (!record) { record = { count: 0, resetTime: Date.now() + RATE_LIMIT_WINDOW }; rateLimitStore.set(ip, record); }
        if (Date.now() > record.resetTime) { record.count = 0; record.resetTime = Date.now() + RATE_LIMIT_WINDOW; }
        if (record.count >= RATE_LIMIT_MAX) return res.status(429).json({ success: false, error: 'Demasiados pedidos.' });

        const { data: counterData } = await supabase.from('order_counters').select('counter').eq('tienda', tienda).single();
        const nextId = (counterData?.counter || 0) + 1;

        const { error: insertError } = await supabase.from('orders').insert({
            id: nextId, codigo_cliente: codigoCliente, tienda,
            nombre: req.body.nombre?.slice(0, 60),
            telefono: req.body.telefono?.slice(0, 20),
            direccion: req.body.direccion?.slice(0, 200),
            items: req.body.items || [],
            total: req.body.total || 0,
            moneda: req.body.moneda || 'CUP',
            metodo_pago: req.body.metodoPago || 'Efectivo',
            estado: 'pendiente',
            created_at: new Date(), updated_at: new Date()
        });

        if (insertError) throw insertError;
        await supabase.from('order_counters').upsert({ tienda, counter: nextId });

        record.count++;
        rateLimitStore.set(ip, record);

        console.log(`✅ Pedido #${nextId} - Código: ${codigoCliente}`);
        res.json({ success: true, orderId: nextId, codigoCliente });
    } catch (error) {
        console.error('❌ Error pedido:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// LOGIN ADMIN
// ============================================
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, error: 'Contraseña requerida' });
    if (password === ADMIN_PASSWORD) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = Date.now() + 3600000;
        sessions.set(token, { expiry, ip: req.ip, createdAt: Date.now() });
        console.log(`✅ Login OK desde ${req.ip}`);
        res.json({ success: true, token, expires: expiry });
    } else {
        console.log(`🔴 Login FALLIDO desde ${req.ip}`);
        res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
    }
});

app.get('/api/admin/verify-session', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ valid: false });
    const session = sessions.get(token);
    if (!session || session.expiry < Date.now()) { sessions.delete(token); return res.status(401).json({ valid: false }); }
    session.expiry = Date.now() + 3600000;
    sessions.set(token, session);
    res.json({ valid: true });
});

app.post('/api/admin/logout', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) sessions.delete(token);
    res.json({ success: true });
});

// ============================================
// AUTH MIDDLEWARE
// ============================================
const requireAuth = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token && sessions.has(token)) {
        const session = sessions.get(token);
        if (session.expiry > Date.now()) {
            session.expiry = Date.now() + 3600000;
            sessions.set(token, session);
            return next();
        }
        sessions.delete(token);
    }
    return res.status(401).json({ error: 'No autorizado' });
};

app.use('/api/admin', requireAuth);

// ============================================
// MULTER
// ============================================
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

async function uploadToSupabase(file, folder = 'Productos') {
    try {
        const ext = file.originalname.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        const filePath = `${folder}/${fileName}`;
        const { data, error } = await supabase.storage.from(folder).upload(filePath, file.buffer, {
            cacheControl: '3600', upsert: false, contentType: file.mimetype
        });
        if (error) return null;
        const { data: { publicUrl } } = supabase.storage.from(folder).getPublicUrl(filePath);
        return publicUrl;
    } catch (error) { return null; }
}

async function deleteFromSupabase(imageUrl) {
    try {
        if (!imageUrl || !imageUrl.includes('/storage/v1/object/public/')) return false;
        const parts = imageUrl.split('/Productos/');
        if (parts.length < 2) return false;
        await supabase.storage.from('Productos').remove([`Productos/${parts[1]}`]);
        return true;
    } catch (error) { return false; }
}

// ============================================
// ADMIN - TIENDAS
// ============================================
app.get('/api/admin/tiendas', async (req, res) => {
    try {
        const { data, error } = await supabase.from('stores').select('*');
        if (error) throw error;
        res.json(data || []);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/admin/tiendas/:id', async (req, res) => {
    try {
        const { data, error } = await supabase.from('stores').select('*').eq('id', req.params.id).single();
        if (error) throw error;
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/admin/tiendas', async (req, res) => {
    try {
        const { error } = await supabase.from('stores').insert({
            id: req.body.id?.toLowerCase().trim(),
            nombre: req.body.nombre?.trim(),
            icono: req.body.icono || '🛒',
            descripcion: req.body.descripcion || '',
            configuracion: req.body.configuracion || {},
            categorias: req.body.categorias || ['otros'],
            created_at: new Date(), updated_at: new Date()
        });
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/admin/tiendas/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('stores').update({
            nombre: req.body.nombre, icono: req.body.icono, descripcion: req.body.descripcion,
            configuracion: req.body.configuracion, categorias: req.body.categorias, updated_at: new Date()
        }).eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/admin/tiendas/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('stores').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ============================================
// ADMIN - CATEGORÍAS
// ============================================
app.get('/api/admin/categorias', async (req, res) => {
    try {
        const { data, error } = await supabase.from('stores').select('categorias').eq('id', req.query.tienda).single();
        if (error) throw error;
        res.json(data?.categorias || ['otros']);
    } catch (error) { res.json(['otros']); }
});

app.post('/api/admin/categorias', async (req, res) => {
    try {
        const { data: store } = await supabase.from('stores').select('categorias').eq('id', req.body.tienda).single();
        const cats = store?.categorias || [];
        if (!cats.includes(req.body.categoria)) cats.push(req.body.categoria);
        await supabase.from('stores').update({ categorias: cats, updated_at: new Date() }).eq('id', req.body.tienda);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ============================================
// ADMIN - PRODUCTOS
// ============================================
app.get('/api/admin/productos', async (req, res) => {
    try {
        const { data, error } = await supabase.from('products').select('*').eq('tienda', req.query.tienda).order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (error) { res.json([]); }
});

app.post('/api/admin/productos', upload.single('imagen'), async (req, res) => {
    try {
        let imagen = req.body.imagen_url || 'https://via.placeholder.com/400';
        if (req.file) {
            const url = await uploadToSupabase(req.file, 'Productos');
            if (url) imagen = url;
            else return res.status(500).json({ error: 'Error al subir imagen' });
        }
        const { data, error } = await supabase.from('products').insert({
            tienda: req.body.tienda, nombre: req.body.nombre,
            descripcion: req.body.descripcion || '',
            precio: parseFloat(req.body.precio),
            descuento: parseInt(req.body.descuento) || 0,
            imagen, disponible: req.body.disponible === 'true',
            tamanio: req.body.tamanio || 'pequeno',
            categoria: req.body.categoria || 'otros',
            created_at: new Date(), updated_at: new Date()
        }).select();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.put('/api/admin/productos/:id', upload.single('imagen'), async (req, res) => {
    try {
        const { data: old } = await supabase.from('products').select('imagen').eq('id', req.params.id).single();
        const upd = {
            nombre: req.body.nombre, descripcion: req.body.descripcion,
            precio: parseFloat(req.body.precio),
            descuento: parseInt(req.body.descuento) || 0,
            disponible: req.body.disponible === 'true',
            tamanio: req.body.tamanio, categoria: req.body.categoria, updated_at: new Date()
        };
        if (req.file) {
            if (old?.imagen && !old.imagen.includes('via.placeholder.com')) await deleteFromSupabase(old.imagen);
            const url = await uploadToSupabase(req.file, 'Productos');
            if (url) upd.imagen = url;
        } else if (req.body.imagen_url) {
            upd.imagen = req.body.imagen_url;
        }
        const { error } = await supabase.from('products').update(upd).eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/admin/productos/:id', async (req, res) => {
    try {
        const { data: p } = await supabase.from('products').select('imagen').eq('id', req.params.id).single();
        if (p?.imagen && !p.imagen.includes('via.placeholder.com')) await deleteFromSupabase(p.imagen);
        const { error } = await supabase.from('products').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ============================================
// ADMIN - PEDIDOS
// ============================================
app.get('/api/admin/pedidos', async (req, res) => {
    try {
        let q = supabase.from('orders').select('*').order('created_at', { ascending: false });
        if (req.query.tienda) q = q.eq('tienda', req.query.tienda);
        const { data, error } = await q;
        if (error) throw error;
        res.json(data || []);
    } catch (error) { res.json([]); }
});

app.get('/api/admin/pedidos/buscar', async (req, res) => {
    try {
        const { codigo, tienda } = req.query;
        if (!codigo) return res.status(400).json({ success: false, error: 'Código requerido' });
        let q = supabase.from('orders').select('*').eq('codigo_cliente', codigo.toUpperCase());
        if (tienda) q = q.eq('tienda', tienda);
        const { data, error } = await q;
        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.put('/api/admin/pedidos/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('orders').update({ estado: req.body.estado, updated_at: new Date() }).eq('id', req.params.id).eq('tienda', req.body.tienda);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/admin/pedidos/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('orders').delete().eq('id', req.params.id).eq('tienda', req.query.tienda);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/admin/pedidos', async (req, res) => {
    try {
        if (req.query.tienda) {
            await supabase.from('orders').delete().eq('tienda', req.query.tienda);
            await supabase.from('order_counters').upsert({ tienda: req.query.tienda, counter: 0 });
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ============================================
// ADMIN - CONFIG
// ============================================
app.get('/api/admin/config', async (req, res) => {
    try {
        const { data, error } = await supabase.from('config').select('*').eq('id', 1).single();
        if (error) {
            const defaultConfig = { id: 1, moneda_base: 'CUP', tasas: { CUP: 1, USD: 0.04, EUR: 0.037 }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
            await supabase.from('config').insert(defaultConfig);
            return res.json(defaultConfig);
        }
        res.json(data);
    } catch (error) { res.json({ moneda_base: 'CUP', tasas: { CUP: 1, USD: 0.04, EUR: 0.037 } }); }
});

app.put('/api/admin/config', async (req, res) => {
    try {
        const { monedaBase, tasas } = req.body;
        if (!tasas || tasas.USD <= 0 || tasas.EUR <= 0) return res.status(400).json({ success: false, error: 'Tasas inválidas' });
        const configData = { moneda_base: monedaBase || 'CUP', tasas: { CUP: 1, USD: parseFloat(tasas.USD), EUR: parseFloat(tasas.EUR) }, updated_at: new Date().toISOString() };
        const { data: ex } = await supabase.from('config').select('id').eq('id', 1).single();
        if (ex) await supabase.from('config').update(configData).eq('id', 1);
        else await supabase.from('config').insert({ id: 1, ...configData, created_at: new Date().toISOString() });
        res.json({ success: true, data: configData });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// PUSH
// ============================================
app.get('/api/push/public-key', (req, res) => res.json({ publicKey: process.env.VAPID_PUBLIC_KEY }));

app.post('/api/push/subscribe', async (req, res) => {
    try {
        const { endpoint, keys } = req.body;
        if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ success: false, error: 'Suscripción inválida' });
        await supabase.from('push_subscriptions').upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: req.headers['user-agent'] || 'unknown' }, { onConflict: 'endpoint' });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// 404
// ============================================
app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'API endpoint no encontrado' });
    res.status(404).sendFile(path.join(__dirname, 'public', 'offline.html'), (err) => {
        if (err) res.status(404).send('Página no encontrada');
    });
});

// ============================================
// INICIAR
// ============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Tienda-FG corriendo en puerto ${PORT}`);
    console.log(`🛒 Tienda: ${BASE_URL}/`);
    console.log(`📋 Admin: ${BASE_URL}/admin`);
    console.log(`✅ Servidor listo`);
});