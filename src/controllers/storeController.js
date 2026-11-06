import { supabase } from '../config/supabase.js';

export const getStoresInfo = async (req, res) => {
    try {
        const { data, error } = await supabase.from('stores').select('*');
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getStoreById = async (req, res) => {
    try {
        const { data, error } = await supabase.from('stores').select('*').eq('id', req.params.id).single();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Tienda no encontrada' });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getStoreConfig = async (req, res) => {
    try {
        const { data, error } = await supabase.from('stores').select('configuracion').eq('id', req.params.id).single();
        if (error) throw error;
        res.json(data?.configuracion || {});
    } catch (error) {
        res.json({});
    }
};

export const createStore = async (req, res) => {
    try {
        const { error } = await supabase.from('stores').insert({
            id: req.body.id?.toLowerCase().trim(),
            nombre: req.body.nombre?.trim(),
            icono: req.body.icono || '🛒',
            descripcion: req.body.descripcion || '',
            configuracion: req.body.configuracion || {},
            categorias: req.body.categorias || ['otros'],
            created_at: new Date(),
            updated_at: new Date()
        });
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const updateStore = async (req, res) => {
    try {
        const { error } = await supabase
            .from('stores')
            .update({
                nombre: req.body.nombre,
                icono: req.body.icono,
                descripcion: req.body.descripcion,
                configuracion: req.body.configuracion,
                categorias: req.body.categorias,
                updated_at: new Date()
            })
            .eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteStore = async (req, res) => {
    try {
        const { error } = await supabase.from('stores').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};