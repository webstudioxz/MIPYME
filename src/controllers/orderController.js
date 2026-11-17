// ============================================================
// src/controllers/orderController.js — CORREGIDO v3 (FIX COMPRA)
// ============================================================

import { supabase } from '../config/supabase.js';
import { generarCodigoUnico } from '../utils/helpers.js';
import { rateLimitStore } from '../middlewares/rateLimit.js';
import { sendPushToAll } from '../utils/pushNotifications.js';

// 🚨 Resuelve el WhatsApp al que debe ir el pedido.
//    - Si la tienda está en modo RESERVA → siempre el WhatsApp de la tienda (confirmación).
//    - Si la tienda tiene multi-contacto activo → usa el whatsapp_proveedor del PRIMER ítem que lo tenga.
//    - Si no → el WhatsApp de la tienda (datos_bancarios.whatsapp_confirmacion || contacto.telefono).
//    - Siempre devuelve también el nombre del contacto, para mostrarlo en el admin.
async function resolverContacto(tienda, items) {
    try {
        const { data: store } = await supabase
            .from('stores')
            .select('configuracion')
            .eq('id', tienda)
            .maybeSingle();

        const cfg = store?.configuracion || {};
        const esReserva = cfg.tipo === 'reserva';
        const defaultWa = cfg.datos_bancarios?.whatsapp_confirmacion || cfg.contacto?.telefono || '';

        // 🔴 MODO RESERVA: nunca usa proveedor
        if (esReserva) {
            return { whatsapp: defaultWa, contacto_nombre: null };
        }

        // Si no está activado el multi-contacto, va al WhatsApp de la tienda
        if (cfg.whatsapp_por_producto !== true) {
            return { whatsapp: defaultWa, contacto_nombre: null };
        }

        // Multi-contacto activo: buscar el primer ítem con whatsapp_proveedor
        const ids = (items || []).map(i => i.id).filter(Boolean);
        if (!ids.length) return { whatsapp: defaultWa, contacto_nombre: null };

        const { data: prods } = await supabase
            .from('products')
            .select('id, whatsapp_proveedor, contacto_nombre')
            .in('id', ids);

        const map = {};
        (prods || []).forEach(p => { map[p.id] = p; });

        // Recorrer en el orden de los items del carrito
        for (const it of items) {
            const p = map[it.id];
            if (p && p.whatsapp_proveedor && String(p.whatsapp_proveedor).trim()) {
                return {
                    whatsapp: String(p.whatsapp_proveedor).trim(),
                    contacto_nombre: p.contacto_nombre ? String(p.contacto_nombre).trim() : null
                };
            }
        }

        // Si nadie tiene whatsapp_proveedor, cae al de la tienda
        return { whatsapp: defaultWa, contacto_nombre: null };
    } catch (e) {
        console.error('❌ [resolverContacto]', e);
        return { whatsapp: '', contacto_nombre: null };
    }
}

export const createOrder = async (req, res) => {
    try {
        const tienda = req.body.tienda || 'electro';
        const codigoCliente = generarCodigoUnico();
        const ip = req.ip || req.connection.remoteAddress;
        const record = req.rateLimitRecord;

        const items = req.body.items || [];

        // 🚨 Resolver contacto (multi-contacto o tienda, NUNCA proveedor en reserva)
        const contacto = await resolverContacto(tienda, items);

        // 🚨 FIX 1: Se eliminó "id: nextId" (Supabase lo genera solo)
        // 🚨 FIX 2: Se eliminó "contacto_origen" (la columna no existe en la BD)
        const { data: orderData, error: insertError } = await supabase.from('orders').insert({
            codigo_cliente: codigoCliente,
            tienda,
            nombre: req.body.nombre?.slice(0, 60),
            telefono: req.body.telefono?.slice(0, 20),
            carnet: req.body.carnet?.slice(0, 30) || null,
            direccion: req.body.direccion?.slice(0, 200),
            items: items,
            total: req.body.total || 0,
            moneda: req.body.moneda || 'CUP',
            metodo_pago: req.body.metodoPago || 'Efectivo',
            
            // 🚨 El pedido SIEMPRE pertenece a la tienda del admin.
            whatsapp_destino: contacto.whatsapp || null,
            contacto_nombre: contacto.contacto_nombre || null,
            
            estado: 'pendiente',
            created_at: new Date(),
            updated_at: new Date()
        }).select().single();

        if (insertError) {
            console.error('❌ [Supabase Insert Error]:', insertError);
            throw insertError;
        }

        if (record) {
            record.count++;
            rateLimitStore.set(ip, record);
        }

        // Push SOLO al admin de la tienda (nunca al proveedor)
        sendPushToAll({
            title: `🛒 ¡Nuevo Pedido en ${tienda.toUpperCase()}!`,
            body: `${req.body.nombre} - Total: $${parseFloat(req.body.total).toFixed(2)}`,
            url: `/admin-cliente?tienda=${tienda}`,
            tienda: tienda
        }).catch(console.error);

        res.json({
            success: true,
            orderId: orderData.id,
            codigoCliente,
            whatsapp_destino: contacto.whatsapp || null,
            contacto_nombre: contacto.contacto_nombre || null
        });
    } catch (error) {
        console.error('❌ Error creando pedido:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getOrders = async (req, res) => {
    try {
        let q = supabase.from('orders').select('*').order('created_at', { ascending: false });
        if (req.query.tienda) q = q.eq('tienda', req.query.tienda);
        const { data } = await q;
        res.json(data || []);
    } catch (error) { res.json([]); }
};

export const searchOrder = async (req, res) => {
    try {
        let q = supabase.from('orders').select('*').eq('codigo_cliente', req.query.codigo);
        if (req.query.tienda) q = q.eq('tienda', req.query.tienda);
        const { data } = await q;
        res.json({ success: true, data: data || [] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};

export const updateOrderStatus = async (req, res) => {
    try {
        await supabase.from('orders')
            .update({ estado: req.body.estado, updated_at: new Date() })
            .eq('id', req.params.id)
            .eq('tienda', req.body.tienda);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
};

export const deleteOrder = async (req, res) => {
    try {
        await supabase.from('orders').delete().eq('id', req.params.id).eq('tienda', req.query.tienda);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
};

export const deleteAllOrders = async (req, res) => {
    try {
        if (req.query.tienda) {
            await supabase.from('orders').delete().eq('tienda', req.query.tienda);
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
};