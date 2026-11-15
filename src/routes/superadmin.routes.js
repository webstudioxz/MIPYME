// ============================================================
// src/routes/superadmin.routes.js
// ============================================================
import express from 'express';
import { supabaseAdmin } from '../config/supabaseClient.js';
import { env } from '../config/env.js';
import * as SuperadminService from '../services/superadmin.service.js';

const router = express.Router();
const SUPERADMIN_EMAILS = (process.env.SUPERADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

router.get('/public-config', (req, res) => {
    if (!env.supabaseUrl) return res.status(500).json({ error: "Faltan credenciales" });
    res.json({ supabaseUrl: env.supabaseUrl, supabaseAnonKey: process.env.SUPABASE_ANON_KEY });
});

router.get('/usuarios', async (req, res) => {
    try {
        const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
        const usuarios = await Promise.all((userList?.users || []).map(async (u) => {
            const { data: tienda } = await supabaseAdmin.from('stores').select('id, nombre, plan, fecha_vencimiento, pausada, activa, pausada_por, pausada_mensaje').eq('owner_id', u.id).maybeSingle();
            return { id: u.id, email: u.email, nombre: u.user_metadata?.full_name || 'Sin nombre', created_at: u.created_at, es_superadmin: SUPERADMIN_EMAILS.includes((u.email || '').toLowerCase()), tienda: tienda || null };
        }));
        res.json(usuarios);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.delete('/usuarios/:id', async (req, res) => {
    try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(req.params.id);
        if (SUPERADMIN_EMAILS.includes((userData.user.email || '').toLowerCase())) return res.status(403).json({ error: 'No puedes eliminar un superadmin' });
        const { data: tienda } = await supabaseAdmin.from('stores').select('id').eq('owner_id', req.params.id).maybeSingle();
        if (tienda) await SuperadminService.borrarTodoDeTienda(tienda.id);
        await supabaseAdmin.auth.admin.deleteUser(req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/tiendas', async (req, res) => {
    try {
        const { data } = await supabaseAdmin.from('stores').select('*').order('created_at', { ascending: false });
        const tiendas = await Promise.all((data || []).map(async (t) => {
            const { count } = await supabaseAdmin.from('products').select('*', { count: 'exact', head: true }).eq('tienda', t.id);
            let ownerEmail = null;
            if (t.owner_id) { try { const { data: u } = await supabaseAdmin.auth.admin.getUserById(t.owner_id); if (u?.user) ownerEmail = u.user.email; } catch (e) {} }
            const esMia = t.es_superadmin === true || !t.owner_id || (ownerEmail && SUPERADMIN_EMAILS.includes(ownerEmail.toLowerCase()));
            return { ...t, productos_count: count || 0, owner_email: ownerEmail, es_mia: !!esMia };
        }));
        res.json(tiendas);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/extender/:id', async (req, res) => {
    try {
        await SuperadminService.extenderTiempoTienda(req.params.id, 30);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/pausar/:id', async (req, res) => {
    try {
        const pausar = req.body.pausar === true;
        const update = { pausada: pausar, updated_at: new Date() };
        if (pausar) {
            update.pausada_por = 'admin';
            update.pausada_mensaje = (req.body.mensaje || 'Tienda pausada por administración').toString().slice(0, 200);
        } else {
            update.pausada_por = null;
            update.pausada_mensaje = null;
        }
        await supabaseAdmin.from('stores').update(update).eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.delete('/tiendas/:id', async (req, res) => {
    try {
        await SuperadminService.borrarTodoDeTienda(req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/tiendas/:id/tiempo', async (req, res) => {
    try {
        const nuevaFecha = await SuperadminService.extenderTiempoTienda(req.params.id, req.body.dias, req.body.horas);
        res.json({ success: true, nuevaFecha });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/tiendas/:id/cancelar', async (req, res) => {
    try {
        await supabaseAdmin.from('stores').update({ fecha_vencimiento: new Date().toISOString(), estado_pago: 'cancelado' }).eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/crear-tienda', async (req, res) => {
    try {
        const slug = await SuperadminService.crearTiendaSuperadmin(req.body);
        res.json({ success: true, slug });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/crear-producto', async (req, res) => {
    try {
        const { tienda, nombre, descripcion, precio, descuento, categoria, imagen, disponible, garantia, transporte, whatsapp_proveedor, contacto_nombre, requiere_carnet } = req.body;
        let descFinal = descripcion || '';
        if (garantia || transporte) {
            descFinal += `\n\n--- Detalles ---\n`;
            if (garantia) descFinal += `🛡️ Garantía: ${garantia}\n`;
            if (transporte) descFinal += `🚚 Transporte: ${transporte}\n`;
        }
        const { data, error } = await supabaseAdmin.from('products').insert({
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

router.put('/tiendas/:id/contexto', async (req, res) => {
    try {
        const cfg = await SuperadminService.cambiarContextoTienda(req.params.id, req.body);
        res.json({ success: true, configuracion: cfg });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

export default router;