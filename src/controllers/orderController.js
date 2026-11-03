import { supabase } from '../config/supabase.js';
import { generarCodigoUnico } from '../utils/helpers.js';
import { rateLimitStore } from '../middlewares/rateLimit.js';
import { sendPushToAll } from '../utils/pushNotifications.js';

export const createOrder = async (req, res) => {
    try {
        const tienda = req.body.tienda || 'electro';
        const codigoCliente = generarCodigoUnico();
        const ip = req.ip || req.connection.remoteAddress;
        
        const record = req.rateLimitRecord;
        
        const { data: counterData } = await supabase
            .from('order_counters')
            .select('counter')
            .eq('tienda', tienda)
            .single();
        
        const nextId = (counterData?.counter || 0) + 1;
        
        const { error: insertError } = await supabase.from('orders').insert({
            id: nextId,
            codigo_cliente: codigoCliente,
            tienda: tienda,
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
        });
        
        if (insertError) throw insertError;
        
        await supabase
            .from('order_counters')
            .upsert({ tienda: tienda, counter: nextId });
        
        if (record) {
            record.count++;
            rateLimitStore.set(ip, record);
        }
        
        console.log(`✅ Pedido #${nextId} registrado con código: ${codigoCliente}`);
        
        // 🔔 ENVIAR NOTIFICACIÓN PUSH AL ADMIN
        sendPushToAll({
            title: `🛒 Nuevo Pedido #${nextId}`,
            body: `${req.body.nombre} - Total: $${parseFloat(req.body.total).toFixed(2)} ${req.body.moneda || 'CUP'}`,
            url: '/admin',
            tag: `order-${nextId}`
        }).catch(err => console.error('Error push:', err));
        
        res.json({ success: true, orderId: nextId, codigoCliente });
    } catch (error) {
        console.error('❌ Error en /api/pedidos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getOrders = async (req, res) => {
    try {
        let query = supabase.from('orders').select('*').order('created_at', { ascending: false });
        if (req.query.tienda) query = query.eq('tienda', req.query.tienda);
        
        const { data, error } = await query;
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        res.json([]);
    }
};

export const searchOrder = async (req, res) => {
    try {
        const { codigo, tienda } = req.query;
        if (!codigo) return res.status(400).json({ success: false, error: 'Se requiere un código' });
        
        let query = supabase.from('orders').select('*').eq('codigo_cliente', codigo.toUpperCase());
        if (tienda) query = query.eq('tienda', tienda);
        
        const { data, error } = await query;
        if (error) throw error;
        
        res.json({ success: true, data: data || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateOrderStatus = async (req, res) => {
    try {
        const { error } = await supabase
            .from('orders')
            .update({ estado: req.body.estado, updated_at: new Date() })
            .eq('id', req.params.id)
            .eq('tienda', req.body.tienda);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteOrder = async (req, res) => {
    try {
        const { error } = await supabase
            .from('orders')
            .delete()
            .eq('id', req.params.id)
            .eq('tienda', req.query.tienda);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteAllOrders = async (req, res) => {
    try {
        if (req.query.tienda) {
            await supabase.from('orders').delete().eq('tienda', req.query.tienda);
            await supabase.from('order_counters').upsert({ tienda: req.query.tienda, counter: 0 });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};