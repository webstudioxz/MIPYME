// ============================================================
// src/services/superadmin.service.js
  // aqui ba la logica de admin y creasiin de usuario
// ============================================================
import { supabaseAdmin } from '../config/supabaseClient.js';

export function deepMerge(target = {}, source = {}) {
    const output = { ...target };
    Object.keys(source || {}).forEach(key => {
        const sv = source[key];
        const tv = target[key];
        if (sv && typeof sv === 'object' && !Array.isArray(sv) &&
            tv && typeof tv === 'object' && !Array.isArray(tv)) {
            output[key] = deepMerge(tv, sv);
        } else {
            output[key] = sv;
        }
    });
    return output;
}

export function normalizeDias(dias) {
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

export async function borrarTodoDeTienda(slug) {
    try {
        await supabaseAdmin.from('products').delete().eq('tienda', slug);
        await supabaseAdmin.from('bookings').delete().eq('tienda', slug);
        await supabaseAdmin.from('orders').delete().eq('tienda', slug);
        await supabaseAdmin.from('push_subscriptions').delete().eq('tienda_id', slug);
        await supabaseAdmin.from('stores').delete().eq('id', slug);
        return true;
    } catch (e) { 
        console.error('Error borrando tienda:', e); 
        return false; 
    }
}

export async function getMiTienda(owner_id, slug) {
    let query = supabaseAdmin.from('stores').select('*');
    if (slug) query = query.eq('id', slug);
    else if (owner_id) query = query.eq('owner_id', owner_id);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data;
}

export async function pausarMiTienda(owner_id, slug, pausar, mensaje) {
    const { data: tienda } = await supabaseAdmin.from('stores').select('id').eq('id', slug).eq('owner_id', owner_id).maybeSingle();
    if (!tienda) throw new Error('No autorizado');
    
    const update = { pausada: pausar === true, updated_at: new Date() };
    if (pausar === true) {
        update.pausada_por = 'owner';
        update.pausada_mensaje = (mensaje || 'Volvemos mañana').toString().slice(0, 200);
    } else {
        update.pausada_por = null;
        update.pausada_mensaje = null;
    }
    await supabaseAdmin.from('stores').update(update).eq('id', slug);
}

export async function actualizarConfigMiTienda(owner_id, slug, configuracion) {
    if (owner_id) {
        const { data: tienda } = await supabaseAdmin.from('stores').select('configuracion').eq('id', slug).eq('owner_id', owner_id).maybeSingle();
        if (!tienda) throw new Error('No autorizado');
    }
    const { data: current } = await supabaseAdmin.from('stores').select('configuracion').eq('id', slug).maybeSingle();
    if (!current) throw new Error('Tienda no encontrada');

    const incoming = { ...(configuracion || {}) };
    if (incoming.horario && incoming.horario.dias !== undefined) {
        incoming.horario.dias = normalizeDias(incoming.horario.dias);
    }
    const merged = deepMerge(current.configuracion || {}, incoming);
    if (!merged.horario) merged.horario = {};
    if (!Array.isArray(merged.horario.dias)) merged.horario.dias = [1, 2, 3, 4, 5, 6];

    const { error } = await supabaseAdmin.from('stores').update({
        configuracion: merged,
        updated_at: new Date()
    }).eq('id', slug);
    if (error) throw error;
    return merged;
}

export async function crearTiendaCliente(payload, superadminEmails) {
    const { user_id, email, nombre_negocio, plan, telefono, fecha_vencimiento, direccion, hora_apertura, hora_cierre, tasa_usd, metodos_pago, garantia, transporte, dias_laborables, notificaciones_modo, tipo } = payload;
    const esSuperadmin = superadminEmails.includes((email || '').toLowerCase());
    
    if (!esSuperadmin) {
        const { data: exist } = await supabaseAdmin.from('stores').select('id').eq('owner_id', user_id).maybeSingle();
        if (exist) throw new Error('Ya tienes una tienda');
    }

    let slug = nombre_negocio.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
    const { data: dup } = await supabaseAdmin.from('stores').select('id').eq('id', slug).maybeSingle();
    if (dup) throw new Error('Nombre en uso');

    const maxProd = plan === 'premium' ? 100 : (plan === 'pro' ? 20 : (plan === 'basico' ? 10 : 5));
    const tasa = (parseFloat(tasa_usd) > 0) ? parseFloat(tasa_usd) : 25;
    const diasFinales = dias_laborables !== undefined ? normalizeDias(dias_laborables) : [1,2,3,4,5,6];
    const modoNotif = ['admin', 'whatsapp', 'ambos'].includes(notificaciones_modo) ? notificaciones_modo : 'admin';

    const { data, error } = await supabaseAdmin.from('stores').insert({
        id: slug, nombre: nombre_negocio, descripcion: 'Bienvenido a ' + nombre_negocio, icono: '🛒', categorias: ['otros'],
        configuracion: {
            tipo, whatsapp_por_producto: false, notificaciones_modo: modoNotif,
            contacto: { telefono, email, ubicacion: direccion || 'Cuba' },
            horario: { apertura: hora_apertura || '09:00', cierre: hora_cierre || '18:00', dias: diasFinales, intervalo: 60 },
            envio: { disponible: transporte === true, costo: 0, tiempo_estimado: '24-48h' },
            garantia: { disponible: garantia === true, duracion: '12 meses', descripcion: 'Garantía del vendedor' },
            metodos_pago: Array.isArray(metodos_pago) && metodos_pago.length ? metodos_pago : ['Efectivo'],
            datos_bancarios: { numero_tarjeta: '', whatsapp_confirmacion: telefono },
            tasas: { CUP: 1, USD: 1 / tasa, EUR: 1 / (tasa * 1.1) }
        },
        owner_id: user_id, plan, fecha_vencimiento, estado_pago: plan === 'prueba' ? 'prueba' : 'pendiente', 
        max_productos: maxProd, activa: true, pausada: false, es_superadmin: esSuperadmin, created_at: new Date(), updated_at: new Date()
    }).select();
    if (error) throw error;
    return data[0];
}

export async function crearTiendaSuperadmin(payload) {
    const { email, nombre_negocio, nombre, icono, descripcion, categorias, telefono, email_contacto, ubicacion, apertura, cierre, tasaUSD, tasaEUR, tarjeta, whatsapp, tipo, plan, permanente, dias_laborables, notificaciones_modo } = payload;
    const finalNombre = (nombre || nombre_negocio || '').trim();
    
    const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
    const user = userList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) throw new Error('Usuario no encontrado');
    
    let slug = finalNombre.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
    if (!slug) slug = 'tienda-' + Date.now();
    const { data: dup } = await supabaseAdmin.from('stores').select('id').eq('id', slug).maybeSingle();
    if (dup) slug = slug + '-' + Math.floor(Math.random() * 1000);
    
    const fv = new Date(); fv.setDate(fv.getDate() + 30);
    const usd = (parseFloat(tasaUSD) > 0) ? parseFloat(tasaUSD) : 25;
    const eur = (parseFloat(tasaEUR) > 0) ? parseFloat(tasaEUR) : 27;
    let cats = ['otros'];
    if (Array.isArray(categorias) && categorias.length) cats = categorias;
    else if (typeof categorias === 'string' && categorias.trim()) cats = categorias.split(',').map(c => c.trim()).filter(Boolean);
    
    const maxProd = plan === 'premium' ? 100 : (plan === 'pro' ? 20 : (plan === 'basico' ? 10 : 5));
    const diasFinales = dias_laborables !== undefined ? normalizeDias(dias_laborables) : [1,2,3,4,5,6];
    const modoNotif = ['admin', 'whatsapp', 'ambos'].includes(notificaciones_modo) ? notificaciones_modo : 'admin';

    await supabaseAdmin.from('stores').insert({
        id: slug, nombre: finalNombre, descripcion: (descripcion || '').trim() || ('Bienvenido a ' + finalNombre),
        icono: (icono || '🛒').slice(0, 4), categorias: cats,
        configuracion: {
            tipo: tipo || 'tienda', whatsapp_por_producto: false, notificaciones_modo: modoNotif,
            contacto: { telefono: telefono || '', email: email_contacto || email, ubicacion: ubicacion || '' },
            horario: { apertura: apertura || '09:00', cierre: cierre || '18:00', dias: diasFinales, intervalo: 60 },
            envio: { disponible: true, costo: 0, tiempo_estimado: '24-48h' },
            garantia: { disponible: true, duracion: '12 meses', descripcion: 'Garantía del vendedor' },
            metodos_pago: ['Efectivo', 'Transferencia'],
            datos_bancarios: { numero_tarjeta: tarjeta || '', whatsapp_confirmacion: whatsapp || telefono || '' },
            tasas: { CUP: 1, USD: 1 / usd, EUR: 1 / eur }
        },
        owner_id: user.id, plan: plan || 'basico', fecha_vencimiento: permanente ? '9999-12-31T23:59:59.000Z' : fv.toISOString(),
        estado_pago: 'activo', max_productos: maxProd, activa: true, pausada: false, es_superadmin: true, created_at: new Date(), updated_at: new Date()
    });
    return slug;
}

export async function extenderTiempoTienda(id, dias, horas = 0) {
    let base = new Date();
    const { data: tienda } = await supabaseAdmin.from('stores').select('fecha_vencimiento').eq('id', id).single();
    if (tienda?.fecha_vencimiento && new Date(tienda.fecha_vencimiento) > base && !tienda.fecha_vencimiento.startsWith('9999')) {
        base = new Date(tienda.fecha_vencimiento);
    }
    base.setDate(base.getDate() + parseInt(dias || 0));
    base.setHours(base.getHours() + parseInt(horas || 0));
    
    await supabaseAdmin.from('stores').update({ fecha_vencimiento: base.toISOString(), estado_pago: 'activo' }).eq('id', id);
    return base.toISOString();
}

export async function cambiarContextoTienda(id, payload) {
    const { tipo, whatsapp_por_producto, notificaciones_modo } = payload;
    const { data: tienda } = await supabaseAdmin.from('stores').select('configuracion').eq('id', id).single();
    if (!tienda) throw new Error('Tienda no encontrada');

    const cfg = tienda.configuracion || {};
    cfg.tipo = tipo === 'reserva' ? 'reserva' : 'tienda';
    cfg.whatsapp_por_producto = whatsapp_por_producto === true;
    if (notificaciones_modo && ['admin', 'whatsapp', 'ambos'].includes(notificaciones_modo)) {
        cfg.notificaciones_modo = notificaciones_modo;
    }

    const { error } = await supabaseAdmin.from('stores').update({ configuracion: cfg, updated_at: new Date() }).eq('id', id);
    if (error) throw error;
    return cfg;
}
