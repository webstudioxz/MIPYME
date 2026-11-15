// ============================================================
// src/routes/clientes.routes.js
// ============================================================
import express from 'express';
import { supabaseAdmin } from '../config/supabaseClient.js';
import * as SuperadminService from '../services/superadmin.service.js';
import { sendPushToAll } from '../services/push.service.js';
import { deepMerge, normalizeDias } from '../services/superadmin.service.js';

const router = express.Router();
const SUPERADMIN_EMAILS = (process.env.SUPERADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

// ============ MI-TIENDA ============
router.get('/mi-tienda', async (req, res) => {
    try {
        const store = await SuperadminService.getMiTienda(req.query.owner_id, req.query.slug);
        if (!store) return res.status(404).json({ success: false, error: 'No encontrada' });
        res.json({ success: true, store });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/mi-tienda/pausar', async (req, res) => {
    try {
        await SuperadminService.pausarMiTienda(req.body.owner_id, req.body.slug, req.body.pausar, req.body.mensaje);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/mi-tienda/:slug', async (req, res) => {
    try {
        const { data: tienda } = await supabaseAdmin.from('stores').select('id').eq('id', req.params.slug).eq('owner_id', req.query.owner_id).maybeSingle();
        if (!tienda) return res.status(404).json({ success: false, error: 'No autorizado' });
        await SuperadminService.borrarTodoDeTienda(req.params.slug);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/mi-tienda/config', async (req, res) => {
    try {
        const merged = await SuperadminService.actualizarConfigMiTienda(req.body.owner_id, req.body.slug, req.body.configuracion);
        res.json({ success: true, configuracion: merged });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/mi-tienda/categorias', async (req, res) => {
    try {
        const { owner_id, slug, categorias } = req.body;
        const { data: tienda } = await supabaseAdmin.from('stores').select('id').eq('id', slug).eq('owner_id', owner_id).maybeSingle();
        if (!tienda) return res.status(404).json({ success: false, error: 'No autorizado' });
        await supabaseAdmin.from('stores').update({ categorias }).eq('id', slug);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ PRODUCTOS ============
router.get('/mis-productos', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin.from('products').select('*').eq('tienda', req.query.tienda).order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.put('/mis-productos/:id', async (req, res) => {
    try {
        const { tienda, owner_id, ...data } = req.body;
        const { data: store } = await supabaseAdmin.from('stores').select('id').eq('id', tienda).eq('owner_id', owner_id).maybeSingle();
        if (!store) return res.status(403).json({ error: 'No autorizado' });
        delete data.created_at; delete data.id;
        data.updated_at = new Date();
        const { error } = await supabaseAdmin.from('products').update(data).eq('id', req.params.id).eq('tienda', tienda);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/mis-productos', async (req, res) => {
    try {
        const { data: tienda } = await supabaseAdmin.from('stores').select('max_productos').eq('id', req.body.tienda).single();
        const { count } = await supabaseAdmin.from('products').select('*', { count: 'exact', head: true }).eq('tienda', req.body.tienda);
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
        
        const { error } = await supabaseAdmin.from('products').insert(payload);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.delete('/mis-productos/:id', async (req, res) => {
    try {
        await supabaseAdmin.from('products').delete().eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ============ RESERVAS ============
router.get('/reservas/disponibles', async (req, res) => {
    try {
        const { tienda, fecha } = req.query;
        if (!tienda || !fecha) return res.status(400).json({ success: false, error: 'Faltan datos' });

        const { data: store } = await supabaseAdmin.from('stores').select('configuracion').eq('id', tienda).single();
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

        const { data: ocupados } = await supabaseAdmin.from('bookings').select('hora').eq('tienda', tienda).eq('fecha', fecha);
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

router.post('/reservas', async (req, res) => {
    try {
        const { tienda, producto_id, cliente_nombre, cliente_telefono, fecha, hora } = req.body;
        if (!tienda || !producto_id || !cliente_nombre || !cliente_telefono || !fecha || !hora) {
            return res.status(400).json({ success: false, error: 'Faltan datos' });
        }
        const { data: existente } = await supabaseAdmin.from('bookings').select('id').eq('tienda', tienda).eq('fecha', fecha).eq('hora', hora).maybeSingle();
        if (existente) return res.status(400).json({ success: false, error: 'Turno ya ocupado' });

        const ahora = new Date();
        if (new Date(`${fecha}T${hora}:00`) < ahora) {
            return res.status(400).json({ success: false, error: 'No puedes reservar un turno pasado' });
        }

        const { error } = await supabaseAdmin.from('bookings').insert({
            tienda, producto_id, cliente_nombre, cliente_telefono, fecha, hora, estado: 'pendiente', created_at: new Date()
        });
        if (error) throw error;

        sendPushToAll({ title: `📅 Nueva Reserva`, body: `${cliente_nombre} - ${fecha} ${hora}`, url: `/admin-cliente?tienda=${tienda}`, tienda }).catch(console.error);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/reservas', async (req, res) => {
    try {
        const { tienda } = req.query;
        let q = supabaseAdmin.from('bookings').select('*').order('fecha', { ascending: false });
        if (tienda) q = q.eq('tienda', tienda);
        const { data } = await q;
        if (data && data.length > 0) {
            const productIds = [...new Set(data.map(b => b.producto_id))];
            const { data: prods } = await supabaseAdmin.from('products').select('id, nombre, precio, imagen, imagenes_servicio, whatsapp_proveedor, contacto_nombre').in('id', productIds);
            const prodMap = {};
            (prods || []).forEach(p => prodMap[p.id] = p);
            data.forEach(b => { b.producto = prodMap[b.producto_id] || null; });
        }
        res.json(data || []);
    } catch (e) { res.json([]); }
});

router.put('/reservas/:id/confirmar', async (req, res) => {
    try {
        await supabaseAdmin.from('bookings').update({ estado: 'confirmado' }).eq('id', req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/reservas/:id', async (req, res) => {
    try {
        await supabaseAdmin.from('bookings').delete().eq('id', req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ CREAR TIENDA CLIENTE ============
router.post('/crear-tienda-cliente', async (req, res) => {
    try {
        const store = await SuperadminService.crearTiendaCliente(req.body, SUPERADMIN_EMAILS);
        sendPushToAll({ title: '🏪 Nueva Tienda', body: `${req.body.nombre_negocio}`, url: '/admin', tienda: null }).catch(console.error);
        res.json({ success: true, slug: store.id, store });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

export default router;