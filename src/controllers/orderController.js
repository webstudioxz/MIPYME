import { supabase } from '../config/supabase.js';
import { generarCodigoUnico } from '../utils/helpers.js';
import { sendPushToAll } from '../utils/pushNotifications.js';

// ============================================
// CREAR PEDIDO (público)
// ============================================
export const createOrder = async (req, res) => {
    try {
        const {
            tienda, nombre, telefono, direccion,
            metodoPago, moneda, total, items
        } = req.body;

        if (!tienda || !nombre || !telefono || !direccion || !items?.length) {
            return res.status(400).json({
                success: false,
                error: 'Faltan datos obligatorios del pedido'
            });
        }

        const codigoCliente = generarCodigoUnico();

        const orderData = {
            tienda,
            nombre: nombre.trim(),
            telefono: telefono.trim(),
            direccion: direccion.trim(),
            metodo_pago: metodoPago || 'Efectivo',
            moneda: moneda || 'CUP',
            total: parseFloat(total) || 0,
            items,
            estado: 'pendiente',
            codigo_cliente: codigoCliente,
            created_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('orders')
            .insert(orderData)
            .select()
            .single();

        if (error) throw error;

        // Actualizar contador de rate limit
        if (req.rateLimitRecord) req.rateLimitRecord.count++;

        // Notificación push (no bloquea la respuesta)
        sendPushToAll({
            title: '🛒 Nuevo Pedido',
            body: `${nombre} - ${items.length} ítem(s) - ${total} ${moneda || 'CUP'}`,
            url: '/admin'
        }).catch(e => console.warn('Push falló:', e.message));

        return res.json({
            success: true,
            orderId: data.id,
            codigoCliente
        });
    } catch (error) {
        console.error('❌ Error creando pedido:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Error al crear el pedido'
        });
    }
};

// ============================================
// OBTENER PEDIDOS (admin)
// ============================================
export const getOrders = async (req, res) => {
    try {
        const tienda = req.query.tienda;
        let query = supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (tienda) query = query.eq('tienda', tienda);

        const { data, error } = await query;
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('Error en getOrders:', error);
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// BUSCAR PEDIDO POR CÓDIGO (admin)
// ============================================
export const searchOrder = async (req, res) => {
    try {
        const { codigo, tienda } = req.query;
        if (!codigo) {
            return res.json({ success: false, data: [], error: 'Código requerido' });
        }

        let query = supabase
            .from('orders')
            .select('*')
            .ilike('codigo_cliente', `%${codigo}%`);

        if (tienda) query = query.eq('tienda', tienda);

        const { data, error } = await query;
        if (error) throw error;

        res.json({ success: true, data: data || [] });
    } catch (error) {
        console.error('Error en searchOrder:', error);
        res.status(500).json({ success: false, data: [], error: error.message });
    }
};

// ============================================
// ACTUALIZAR ESTADO (admin)
// ============================================
export const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        const validStates = ['pendiente', 'confirmado', 'enviado', 'entregado'];
        if (!validStates.includes(estado)) {
            return res.status(400).json({ error: 'Estado inválido' });
        }

        const { error } = await supabase
            .from('orders')
            .update({ estado, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error en updateOrderStatus:', error);
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// ELIMINAR PEDIDO (admin)
// ============================================
export const deleteOrder = async (req, res) => {
    try {
        const { error } = await supabase
            .from('orders')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error en deleteOrder:', error);
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// ELIMINAR TODOS LOS PEDIDOS DE UNA TIENDA (admin)
// ============================================
export const deleteAllOrders = async (req, res) => {
    try {
        const tienda = req.query.tienda;
        if (!tienda) {
            return res.status(400).json({ error: 'tienda requerida' });
        }

        const { error } = await supabase
            .from('orders')
            .delete()
            .eq('tienda', tienda);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error en deleteAllOrders:', error);
        res.status(500).json({ error: error.message });
    }
};