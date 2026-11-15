// ============================================================
// src/services/order.service.js — Lógica de negocio de pedidos
// ============================================================

import { supabase } from '../config/supabase.js';
import { generarCodigoUnico } from '../utils/helpers.js';

/**
 * Resuelve a qué WhatsApp debe ir el pedido y quién lo atiende.
 * - Modo RESERVA → siempre WhatsApp de la tienda.
 * - Multi-contacto activo → WhatsApp del primer ítem que tenga whatsapp_proveedor.
 * - Por defecto → WhatsApp de la tienda.
 */
export async function resolverContacto(tienda, items) {
    try {
        const { data: store } = await supabase
            .from('stores')
            .select('configuracion')
            .eq('id', tienda)
            .maybeSingle();

        const cfg = store?.configuracion || {};
        const esReserva = cfg.tipo === 'reserva';
        const defaultWa = cfg.datos_bancarios?.whatsapp_confirmacion || cfg.contacto?.telefono || '';

        if (esReserva) {
            return { whatsapp: defaultWa, contacto_nombre: null, origen: 'tienda_reserva' };
        }

        if (cfg.whatsapp_por_producto !== true) {
            return { whatsapp: defaultWa, contacto_nombre: null, origen: 'tienda' };
        }

        const ids = (items || []).map(i => i.id).filter(Boolean);
        if (!ids.length) return { whatsapp: defaultWa, contacto_nombre: null, origen: 'tienda' };

        const { data: prods } = await supabase
            .from('products')
            .select('id, whatsapp_proveedor, contacto_nombre')
            .in('id', ids);

        const map = {};
        (prods || []).forEach(p => { map[p.id] = p; });

        for (const it of items) {
            const p = map[it.id];
            if (p && p.whatsapp_proveedor && String(p.whatsapp_proveedor).trim()) {
                return {
                    whatsapp: String(p.whatsapp_proveedor).trim(),
                    contacto_nombre: p.contacto_nombre ? String(p.contacto_nombre).trim() : null,
                    origen: 'producto'
                };
            }
        }

        return { whatsapp: defaultWa, contacto_nombre: null, origen: 'tienda' };
    } catch (e) {
        console.error('❌ [resolverContacto]', e);
        return { whatsapp: '', contacto_nombre: null, origen: 'error' };
    }
}

/**
 * Genera un ID único para el pedido usando la secuencia de Postgres.
 * (Fix B8: evita race condition del "lastOrder.id + 1")
 */
async function getNextOrderId() {
    const { data, error } = await supabase.rpc('nextval_order_id');
    if (error || !data) {
        // Fallback: si la función no existe, usa timestamp como fallback temporal
        console.warn('⚠️ [order] nextval_order_id no existe, usando fallback');
        return Date.now();
    }
    return data;
}

/**
 * Crea un pedido. Devuelve { order, contacto }.
 */
export async function createOrderRecord(payload) {
    const tienda = payload.tienda || 'electro';
    const items = payload.items || [];
    const codigoCliente = generarCodigoUnico();
    const contacto = await resolverContacto(tienda, items);
    const nextId = await getNextOrderId();

    const { data: orderData, error: insertError } = await supabase
        .from('orders')
        .insert({
            id: nextId,
            codigo_cliente: codigoCliente,
            tienda,
            nombre: payload.nombre?.slice(0, 60),
            telefono: payload.telefono?.slice(0, 20),
            carnet: payload.carnet?.slice(0, 30) || null,
            direccion: payload.direccion?.slice(0, 200),
            items: items,
            total: payload.total || 0,
            moneda: payload.moneda || 'CUP',
            metodo_pago: payload.metodoPago || 'Efectivo',
            whatsapp_destino: contacto.whatsapp || null,
            contacto_nombre: contacto.contacto_nombre || null,
            contacto_origen: contacto.origen || null,
            estado: 'pendiente',
            created_at: new Date(),
            updated_at: new Date()
        })
        .select()
        .single();

    if (insertError) throw insertError;

    return { order: orderData, contacto, codigoCliente };
}

export async function getOrdersByTienda(tienda) {
    let q = supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (tienda) q = q.eq('tienda', tienda);
    const { data } = await q;
    return data || [];
}

export async function searchOrderByCodigo(codigo, tienda) {
    let q = supabase.from('orders').select('*').eq('codigo_cliente', codigo);
    if (tienda) q = q.eq('tienda', tienda);
    const { data } = await q;
    return data || [];
}

export async function updateOrderState(id, tienda, estado) {
    const { error } = await supabase
        .from('orders')
        .update({ estado, updated_at: new Date() })
        .eq('id', id)
        .eq('tienda', tienda);
    if (error) throw error;
}

export async function deleteOrderById(id, tienda) {
    const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', id)
        .eq('tienda', tienda);
    if (error) throw error;
}

export async function deleteOrdersByTienda(tienda) {
    if (!tienda) return;
    const { error } = await supabase.from('orders').delete().eq('tienda', tienda);
    if (error) throw error;
}