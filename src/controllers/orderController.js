// ============================================================
// src/controllers/orderController.js — CORREGIDO v4 (BLINDADO)
// ============================================================

import { supabase } from '../config/supabase.js';
import { generarCodigoUnico } from '../utils/helpers.js';
import { rateLimitStore } from '../middlewares/rateLimit.js';
import { sendPushToAll } from '../utils/pushNotifications.js';

// 🚨 Resuelve el WhatsApp al que debe ir el pedido.
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

        // 🚨 Resolver contacto (multi-contacto o tienda)
        const contacto = await resolverContacto(tienda, items);

        // 1. Preparamos los datos base
        const orderDataToInsert = {
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
            whatsapp_destino: contacto.whatsapp || null,
            contacto_nombre: contacto.contacto_nombre || null,
            estado: 'pendiente',
            created_at: new Date(),
            updated_at: new Date()
        };

        // 2. Intentamos insertar. Si falla porque falta una columna, la borramos y reintentamos.
        let insertError = null;
        let orderData = null;
        let intentos = 0;
        const maxIntentos = 4; // Evita un bucle infinito

        while (intentos < maxIntentos) {
            const { data, error } = await supabase.from('orders').insert(orderDataToInsert).select().single();
            
            if (error) {
                // Detectamos si el error es por falta de columna
                if (error.message.includes('Could not find the') && error.message.includes('column')) {
                    const match = error.message.match(/the '([^']+)' column/);
                    if (match && match[1]) {
                        const missingColumn = match[1];
                        console.warn(`⚠️ [Supabase] Falta la columna "${missingColumn}". Eliminándola y reintentando...`);
                        delete orderDataToInsert[missingColumn];
                        intentos++;
                        continue; // Reintentamos el bucle sin esa columna
                    }
                }
                // Si es otro tipo de error, guardamos y salimos
                insertError = error;
                break;
            } else {
                // ¡Éxito!
                orderData = data;
                insertError = null;
                break;
            }
        }

        if (insertError) {
            console.error('❌ [Supabase Insert Error Fatal]:', insertError);
            throw insertError;
        }

        if (!orderData) {
            throw new Error("No se pudo guardar el pedido después de varios intentos.");
        }

        if (record) {
            record.count++;
            rateLimitStore.set(ip, record);
        }

        // Push SOLO al admin de la tienda
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