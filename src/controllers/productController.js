// ============================================================
// src/controllers/productController.js — CORREGIDO v2
// ============================================================

import { supabase } from '../config/supabase.js';
import { uploadToSupabase, deleteFromSupabase } from '../utils/upload.js';

// Helper: parsea imagenes_servicio venga como array, JSON o string CSV
function parseImagenesServicio(input) {
    if (input === undefined || input === null) return undefined;
    if (Array.isArray(input)) return input.map(String).filter(Boolean);
    const s = String(input).trim();
    if (!s) return [];
    try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch (_) { /* no era JSON */ }
    return s.split(',').map(x => x.trim()).filter(Boolean);
}

// Helper: normaliza los campos opcionales del producto
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

// ============ GET ============
export const getProducts = async (req, res) => {
    try {
        const { data } = await supabase
            .from('products')
            .select('*')
            .eq('tienda', req.query.tienda || 'electro')
            .order('created_at', { ascending: false });
        res.json(data || []);
    } catch (error) { res.json([]); }
};

// ============ CREATE ============
export const createProduct = async (req, res) => {
    try {
        let imagen = req.body.imagen_url || 'https://via.placeholder.com/400';
        if (req.file) {
            const url = await uploadToSupabase(req.file);
            if (url) imagen = url;
        }

        const payload = {
            tienda: req.body.tienda,
            nombre: req.body.nombre,
            descripcion: req.body.descripcion,
            precio: parseFloat(req.body.precio),
            descuento: parseInt(req.body.descuento) || 0,
            imagen,
            disponible: req.body.disponible === 'true' || req.body.disponible === true,
            tamanio: req.body.tamanio,
            categoria: req.body.categoria,
            created_at: new Date(),
            updated_at: new Date(),
            ...buildOptionalFields(req.body)
        };

        const { data, error } = await supabase.from('products').insert(payload).select();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        console.error('❌ [createProduct]', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============ UPDATE ============
export const updateProduct = async (req, res) => {
    try {
        const { data: old } = await supabase
            .from('products')
            .select('imagen')
            .eq('id', req.params.id)
            .single();

        const upd = {
            nombre: req.body.nombre,
            descripcion: req.body.descripcion,
            precio: parseFloat(req.body.precio),
            descuento: parseInt(req.body.descuento) || 0,
            disponible: req.body.disponible === 'true' || req.body.disponible === true,
            tamanio: req.body.tamanio,
            categoria: req.body.categoria,
            updated_at: new Date()
        };

        // Gestión de imagen principal
        if (req.file) {
            if (old?.imagen) await deleteFromSupabase(old.imagen);
            const url = await uploadToSupabase(req.file);
            if (url) upd.imagen = url;
        } else if (req.body.imagen_url) {
            upd.imagen = req.body.imagen_url;
        }

        // Campos opcionales (solo si vienen)
        Object.assign(upd, buildOptionalFields(req.body));

        const { error } = await supabase.from('products').update(upd).eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('❌ [updateProduct]', error);
        res.status(500).json({ error: error.message });
    }
};

// ============ DELETE ============
export const deleteProduct = async (req, res) => {
    try {
        const { data: p } = await supabase
            .from('products')
            .select('imagen')
            .eq('id', req.params.id)
            .single();
        if (p?.imagen) await deleteFromSupabase(p.imagen);
        await supabase.from('products').delete().eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
};