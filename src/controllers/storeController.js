// ============================================================
// src/controllers/storeController.js — CORREGIDO v3
// ============================================================

import { supabase } from '../config/supabase.js';

// 🚨 Merge profundo: preserva claves anidadas que no vengan en el payload
function mergeProfundo(target = {}, source = {}) {
    const output = { ...target };
    Object.keys(source || {}).forEach(key => {
        const sv = source[key];
        const tv = target[key];
        if (sv && typeof sv === 'object' && !Array.isArray(sv) &&
            tv && typeof tv === 'object' && !Array.isArray(tv)) {
            output[key] = mergeProfundo(tv, sv);
        } else {
            output[key] = sv;
        }
    });
    return output;
}

// 🚨 Normaliza días (acepta números, strings, nombres)
function normalizarDias(dias) {
    if (!Array.isArray(dias)) return [1, 2, 3, 4, 5, 6];
    const mapa = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, 'miércoles': 3, jueves: 4, viernes: 5, sabado: 6, 'sábado': 6, dom: 0, lun: 1, mar: 2, mie: 3, mié: 3, jue: 4, vie: 5, sab: 6, sáb: 6 };
    const out = new Set();
    dias.forEach(d => {
        if (typeof d === 'number' && d >= 0 && d <= 6) out.add(d);
        else if (typeof d === 'string') {
            const k = d.trim().toLowerCase();
            if (/^\d$/.test(k)) out.add(parseInt(k));
            else if (mapa[k] !== undefined) out.add(mapa[k]);
        }
    });
    return out.size ? [...out].sort() : [1, 2, 3, 4, 5, 6];
}

export const getStoresInfo = async (req, res) => {
    try {
        const { data } = await supabase.from('stores').select('*');
        res.json(data || []);
    } catch (error) { res.status(500).json({ error: error.message }); }
};

export const getStoreById = async (req, res) => {
    try {
        const { data } = await supabase.from('stores').select('*').eq('id', req.params.id).maybeSingle();
        if (!data) return res.status(404).json({ error: 'No encontrada' });
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
};

export const getStoreConfig = async (req, res) => {
    try {
        const { data } = await supabase.from('stores').select('configuracion').eq('id', req.params.id).maybeSingle();
        res.json(data?.configuracion || {});
    } catch (error) { res.json({}); }
};

export const createStore = async (req, res) => {
    try {
        const cfg = req.body.configuracion || {};
        if (cfg.horario && cfg.horario.dias !== undefined) {
            cfg.horario.dias = normalizarDias(cfg.horario.dias);
        }
        await supabase.from('stores').insert({
            id: req.body.id,
            nombre: req.body.nombre,
            icono: req.body.icono,
            descripcion: req.body.descripcion,
            configuracion: cfg,
            categorias: req.body.categorias,
            created_at: new Date(),
            updated_at: new Date()
        });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
};

// 🚨 UPDATE: merge profundo + preserva pausada_por / pausada_mensaje
export const updateStore = async (req, res) => {
    try {
        const slug = req.params.id;

        // 1. Leer configuración actual
        const { data: current, error: errGet } = await supabase
            .from('stores')
            .select('configuracion')
            .eq('id', slug)
            .maybeSingle();
        if (errGet) throw errGet;
        if (!current) return res.status(404).json({ error: 'Tienda no encontrada' });

        // 2. Preparar incoming
        const incoming = req.body.configuracion || {};
        if (incoming.horario && incoming.horario.dias !== undefined) {
            incoming.horario.dias = normalizarDias(incoming.horario.dias);
        }

        // 3. Merge profundo
        const merged = mergeProfundo(current.configuracion || {}, incoming);

        // 4. Garantizar estructura mínima
        if (!merged.horario) merged.horario = {};
        if (!Array.isArray(merged.horario.dias)) merged.horario.dias = [1, 2, 3, 4, 5, 6];

        // 5. Payload final
        const payload = {
            nombre: req.body.nombre,
            icono: req.body.icono,
            descripcion: req.body.descripcion,
            categorias: req.body.categorias,
            configuracion: merged,
            updated_at: new Date()
        };

        // 6. Campos opcionales (solo si vienen)
        if (req.body.pausada !== undefined) payload.pausada = req.body.pausada === true;
        if (req.body.pausada_por !== undefined) payload.pausada_por = req.body.pausada_por || null;
        if (req.body.pausada_mensaje !== undefined) payload.pausada_mensaje = req.body.pausada_mensaje || null;
        if (req.body.plan !== undefined) payload.plan = req.body.plan;
        if (req.body.fecha_vencimiento !== undefined) payload.fecha_vencimiento = req.body.fecha_vencimiento;

        const { error } = await supabase.from('stores').update(payload).eq('id', slug);
        if (error) throw error;

        res.json({ success: true, configuracion: merged });
    } catch (error) {
        console.error('❌ [updateStore]', error);
        res.status(500).json({ error: error.message });
    }
};

export const deleteStore = async (req, res) => {
    try {
        await supabase.from('stores').delete().eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
};