import { supabase } from '../config/supabase.js';

export const getStoresInfo = async (req, res) => {
    try { const { data } = await supabase.from('stores').select('*'); res.json(data || []); } catch (error) { res.status(500).json({ error: error.message }); }
};

export const getStoreById = async (req, res) => {
    try { const { data } = await supabase.from('stores').select('*').eq('id', req.params.id).single(); res.json(data); } catch (error) { res.status(500).json({ error: error.message }); }
};

export const getStoreConfig = async (req, res) => {
    try { const { data } = await supabase.from('stores').select('configuracion').eq('id', req.params.id).single(); res.json(data?.configuracion || {}); } catch (error) { res.json({}); }
};

export const createStore = async (req, res) => {
    try { 
        await supabase.from('stores').insert({ 
            id: req.body.id, 
            nombre: req.body.nombre, 
            icono: req.body.icono, 
            descripcion: req.body.descripcion, 
            configuracion: req.body.configuracion, 
            categorias: req.body.categorias, 
            created_at: new Date(), 
            updated_at: new Date() 
        }); 
        res.json({ success: true }); 
    } catch (error) { res.status(500).json({ error: error.message }); }
};

export const updateStore = async (req, res) => {
    try { 
        await supabase.from('stores').update({ 
            nombre: req.body.nombre, 
            icono: req.body.icono, 
            descripcion: req.body.descripcion, 
            configuracion: req.body.configuracion, 
            categorias: req.body.categorias, 
            updated_at: new Date() 
        }).eq('id', req.params.id); 
        res.json({ success: true }); 
    } catch (error) { res.status(500).json({ error: error.message }); }
};

export const deleteStore = async (req, res) => {
    try { await supabase.from('stores').delete().eq('id', req.params.id); res.json({ success: true }); } catch (error) { res.status(500).json({ error: error.message }); }
};