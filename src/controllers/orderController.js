import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from '../config/supabase.js';
import { generarCodigoUnico } from '../utils/helpers.js';
import { rateLimitStore } from '../middlewares/rateLimit.js';

// 🚨 BUSCADOR DINÁMICO DE MÓDULOS (A PRUEBA DE RENDER)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let sendPushToAll = async (payload) => {};

async function cargarModuloPush() {
    const possiblePaths = [
        path.join(__dirname, '../utils/pushNotifications.js'),
        path.join(__dirname, '../../src/utils/pushNotifications.js'),
        path.join(process.cwd(), 'src/utils/pushNotifications.js'),
        path.join(process.cwd(), 'src/src/utils/pushNotifications.js'),
        path.join(process.cwd(), 'public/../src/utils/pushNotifications.js') // Ruta extra de rescate
    ];

    for (const p of possiblePaths) {
        try {
            const fileUrl = new URL(`file://${p.replace(/\\/g, '/')}`).href;
            const module = await import(fileUrl);
            if (module && module.sendPushToAll) {
                sendPushToAll = module.sendPushToAll;
                console.log(`✅ [PUSH] Módulo de notificaciones cargado desde: ${p}`);
                return;
            }
        } catch (e) {
            // Ignorar y probar la siguiente
        }
    }
    console.warn(`⚠️ [PUSH] No se encontró pushNotifications.js en ninguna ruta. Las notificaciones no se enviarán.`);
}
cargarModuloPush();

// ============================================
// CONTROLADORES
// ============================================

export const createOrder = async (req, res) => {
    try {
        const tienda = req.body.tienda || 'electro';
        const codigoCliente = generarCodigoUnico();
        const ip = req.ip || req.connection.remoteAddress;
        const record = req.rateLimitRecord;

        const { data: lastOrder } = await supabase
            .from('orders')
            .select('id')
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();

        const nextId = lastOrder ? lastOrder.id + 1 : 1;

        const { data: orderData, error: insertError } = await supabase.from('orders').insert({
            id: nextId,
            codigo_cliente: codigoCliente, 
            tienda,
            nombre: req.body.nombre?.slice(0, 60), 
            telefono: req.body.telefono?.slice(0, 20),
            direccion: req.body.direccion?.slice(0, 200), 
            items: req.body.items || [],
            total: req.body.total || 0, 
            moneda: req.body.moneda || 'CUP',
            metodo_pago: req.body.metodoPago || 'Efectivo', 
            estado: 'pendiente',
            created_at: new Date(), 
            updated_at: new Date()
        }).select().single();

        if (insertError) throw insertError;

        if (record) { 
            record.count++; 
            rateLimitStore.set(ip, record); 
        }

        // Enviar notificación si el módulo cargó
        sendPushToAll({
            title: `🛒 ¡Nuevo Pedido en ${tienda.toUpperCase()}!`,
            body: `${req.body.nombre} - Total: $${parseFloat(req.body.total).toFixed(2)}`,
            url: `/admin-cliente?tienda=${tienda}`,
            tienda: tienda 
        }).catch(console.error);

        res.json({ success: true, orderId: orderData.id, codigoCliente });
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
        await supabase.from('orders').update({ estado: req.body.estado, updated_at: new Date() }).eq('id', req.params.id).eq('tienda', req.body.tienda); 
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