import { supabase } from '../config/supabase.js';
import { uploadToSupabase, deleteFromSupabase } from '../utils/upload.js';

export const getProducts = async (req, res) => {
    try {
        const { data } = await supabase.from('products').select('*').eq('tienda', req.query.tienda || 'electro').order('created_at', { ascending: false });
        res.json(data || []);
    } catch (error) { res.json([]); }
};

export const createProduct = async (req, res) => {
    try {
        let imagen = req.body.imagen_url || 'https://via.placeholder.com/400';
        if (req.file) {
            const url = await uploadToSupabase(req.file);
            if (url) imagen = url;
        }
        const { data, error } = await supabase.from('products').insert({
            tienda: req.body.tienda, nombre: req.body.nombre, descripcion: req.body.descripcion,
            precio: parseFloat(req.body.precio), descuento: parseInt(req.body.descuento) || 0,
            imagen, disponible: req.body.disponible === 'true', tamanio: req.body.tamanio,
            categoria: req.body.categoria, created_at: new Date(), updated_at: new Date()
        }).select();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};

export const updateProduct = async (req, res) => {
    try {
        const { data: old } = await supabase.from('products').select('imagen').eq('id', req.params.id).single();
        const upd = {
            nombre: req.body.nombre, descripcion: req.body.descripcion,
            precio: parseFloat(req.body.precio), descuento: parseInt(req.body.descuento) || 0,
            disponible: req.body.disponible === 'true', tamanio: req.body.tamanio,
            categoria: req.body.categoria, updated_at: new Date()
        };
        if (req.file) {
            if (old?.imagen) await deleteFromSupabase(old.imagen);
            const url = await uploadToSupabase(req.file);
            if (url) upd.imagen = url;
        } else if (req.body.imagen_url) {
            upd.imagen = req.body.imagen_url;
        }
        await supabase.from('products').update(upd).eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
};

export const deleteProduct = async (req, res) => {
    try {
        const { data: p } = await supabase.from('products').select('imagen').eq('id', req.params.id).single();
        if (p?.imagen) await deleteFromSupabase(p.imagen);
        await supabase.from('products').delete().eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
};