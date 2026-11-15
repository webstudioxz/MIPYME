// ============================================================
// src/services/store.service.js — Lógica de negocio de tiendas
// ============================================================

import { supabase } from '../config/supabase.js';

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

export async function getAllStores() {
    const { data } = await supabase.from('stores').select('*');
    return data || [];
}

export async function getStoreById(id) {
    const { data } = await supabase.from('stores').select('*').eq('id', id).maybeSingle();
    return data;
}

export async function getStoreConfigById(id) {
    const { data } = await supabase.from('stores').select('configuracion').eq('id', id).maybeSingle();
    return data?.configuracion || {};
}

export async function insertStore(payload) {
    const cfg = payload.configuracion || {};
    if (cfg.horario && cfg.horario.dias !== undefined) {
        cfg.horario.dias = normalizarDias(cfg.horario.dias);
    }
    const { error } = await supabase.from('stores').insert({
        id: payload.id,
        nombre: payload.nombre,
        icono: payload.icono,
        descripcion: payload.descripcion,
        configuracion: cfg,
        categorias: payload.categorias,
        created_at: new Date(),
        updated_at: new Date()
    });
    if (error) throw error;
}

export async function updateStoreRecord(slug, payload) {
    const { data: current, error: errGet } = await supabase
        .from('stores')
        .select('configuracion')
        .eq('id', slug)
        .maybeSingle();
    if (errGet) throw errGet;
    if (!current) throw new Error('NOT_FOUND');

    const incoming = payload.configuracion || {};
    if (incoming.horario && incoming.horario.dias !== undefined) {
        incoming.horario.dias = normalizarDias(incoming.horario.dias);
    }

    const merged = mergeProfundo(current.configuracion || {}, incoming);

    if (!merged.horario) merged.horario = {};
    if (!Array.isArray(merged.horario.dias)) merged.horario.dias = [1, 2, 3, 4, 5, 6];

    const updatePayload = {
        nombre: payload.nombre,
        icono: payload.icono,
        descripcion: payload.descripcion,
        categorias: payload.categorias,
        configuracion: merged,
        updated_at: new Date()
    };

    if (payload.pausada !== undefined) updatePayload.pausada = payload.pausada === true;
    if (payload.pausada_por !== undefined) updatePayload.pausada_por = payload.pausada_por || null;
    if (payload.pausada_mensaje !== undefined) updatePayload.pausada_mensaje = payload.pausada_mensaje || null;
    if (payload.plan !== undefined) updatePayload.plan = payload.plan;
    if (payload.fecha_vencimiento !== undefined) updatePayload.fecha_vencimiento = payload.fecha_vencimiento;

    const { error } = await supabase.from('stores').update(updatePayload).eq('id', slug);
    if (error) throw error;

    return merged;
}

export async function removeStore(id) {
    const { error } = await supabase.from('stores').delete().eq('id', id);
    if (error) throw error;
}