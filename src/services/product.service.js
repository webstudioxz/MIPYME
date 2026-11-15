// ============================================================
// src/services/product.service.js — Lógica de negocio de productos
// ============================================================

import { supabase } from '../config/supabase.js';
import { uploadToSupabase, deleteFromSupabase } from '../utils/upload.js';

function parseImagenesServicio(input) {
    if (input === undefined || input === null) return undefined;
    if (Array.isArray(input)) return input.map(String).filter(Boolean);
    const s = String(input).trim();
    if (!s) return [];
    try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch (_) { }
    return s.split(',').map(x => x.trim()).filter(Boolean);
}

function buildOptionalFields(body) {
    const out = {};
    if (body.whatsapp_proveedor !== undefined) {
        const v = String(body.whatsapp_proveedor || '').trim();
        out.whatsapp_proveedor = v || null;
    }
    if (body.contacto_nombre !== undefined) {
        const v = String(body.contacto_nombre || '').trim();
        out.contacto_nombre = v || null;
    }
    if (body.imagen_proveedor !== undefined) {
        const v = String(body.imagen_proveedor || '').trim();
        out.imagen_proveedor = v || null;
    }
    if (body.requiere_carnet !== undefined) {
        out.requiere_carnet = body.requiere_carnet === true || body.requiere_carnet === 'true';
    }
    if (body.imagenes_servicio !== undefined) {
        const arr = parseImagenesServicio(body.imagenes_servicio);
        if (arr !== undefined) out.imagenes_servicio = arr;
    }
    return out;
}

export async function getProductsByTienda(tienda) {
    const { data } = await supabase
        .from('products')
        .select('*')
        .eq('tienda', tienda || 'electro')
        .order('created_at', { ascending: false });
    return data || [];
}

export async function insertProduct(body, file) {
    let imagen = body.imagen_url || 'https://via.placeholder.com/400';
    if (file) {
        const url = await uploadToSupabase(file);
        if (url) imagen = url;
    }

    const payload = {
        tienda: body.tienda,
        nombre: body.nombre,
        descripcion: body.descripcion,
        precio: parseFloat(body.precio),
        descuento: parseInt(body.descuento) || 0,
        imagen,
        disponible: body.disponible === 'true' || body.disponible === true,
        tamanio: body.tamanio,
        categoria: body.categoria,
        created_at: new Date(),
        updated_at: new Date(),
        ...buildOptionalFields(body)
    };

    const { data, error } = await supabase.from('products').insert(payload).select();
    if (error) throw error;
    return data;
}

export async function updateProductRecord(id, body, file) {
    const { data: old } = await supabase
        .from('products')
        .select('imagen')
        .eq('id', id)
        .single();

    const upd = {
        nombre: body.nombre,
        descripcion: body.descripcion,
        precio: parseFloat(body.precio),
        descuento: parseInt(body.descuento) || 0,
        disponible: body.disponible === 'true' || body.disponible === true,
        tamanio: body.tamanio,
        categoria: body.categoria,
        updated_at: new Date()
    };

    if (file) {
        if (old?.imagen) await deleteFromSupabase(old.imagen);
        const url = await uploadToSupabase(file);
        if (url) upd.imagen = url;
    } else if (body.imagen_url) {
        upd.imagen = body.imagen_url;
    }

    Object.assign(upd, buildOptionalFields(body));

    const { error } = await supabase.from('products').update(upd).eq('id', id);
    if (error) throw error;
}

export async function removeProduct(id) {
    const { data: p } = await supabase
        .from('products')
        .select('imagen')
        .eq('id', id)
        .single();
    if (p?.imagen) await deleteFromSupabase(p.imagen);
    
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
}