import { supabase, handleSupabaseError } from '../config/supabase.js';
import { generarCodigoUnico } from '../utils/helpers.js';
import { sendPushToAll } from '../utils/pushNotifications.js';

// POST /api/pedidos  (público, con rate limit)
export const createOrder = async (req, res) => {
  const { tienda, nombre, telefono, direccion, metodoPago, moneda, total, items } = req.body;

  if (!tienda || !nombre || !telefono || !direccion || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'Faltan datos obligatorios' });
  }

  try {
    const codigoCliente = generarCodigoUnico();
    const { data, error } = await supabase
      .from('pedidos')
      .insert({
        tienda, nombre, telefono, direccion,
        metodo_pago: metodoPago || 'Efectivo',
        moneda: moneda || 'CUP',
        total: parseFloat(total) || 0,
        items,
        codigo_cliente: codigoCliente,
        estado: 'pendiente',
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    if (handleSupabaseError(error, 'createOrder')) throw error;

    // Notificar al admin vía push (no bloquea la respuesta)
    sendPushToAll({
      title: '🛒 Nuevo pedido recibido',
      body: `${nombre} · ${items.length} producto(s) · ${total} ${moneda || 'CUP'}`,
      url: '/admin',
      tag: 'new-order'
    }).catch(e => console.warn('Push falló:', e.message));

    res.json({ success: true, codigoCliente, pedido: data });
  } catch (e) {
    console.error('Error createOrder:', e);
    res.status(500).json({ success: false, error: 'Error al crear pedido' });
  }
};

// GET /api/admin/pedidos?tienda=xxx
export const getOrders = async (req, res) => {
  const tienda = req.query.tienda;
  if (!tienda) return res.json([]);
  try {
    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      .eq('tienda', tienda)
      .order('created_at', { ascending: false });
    if (handleSupabaseError(error, 'getOrders')) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('Error getOrders:', e);
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
};

// GET /api/admin/pedidos/buscar?codigo=xxx&tienda=yyy
export const searchOrder = async (req, res) => {
  const { codigo, tienda } = req.query;
  if (!codigo || !tienda) {
    return res.json({ success: false, data: [] });
  }
  try {
    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      .eq('tienda', tienda)
      .ilike('codigo_cliente', codigo)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (e) {
    console.error('Error searchOrder:', e);
    res.json({ success: false, data: [] });
  }
};

// PUT /api/admin/pedidos/:id  { tienda, estado }
export const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { tienda, estado } = req.body;
  if (!tienda || !estado) return res.status(400).json({ error: 'Tienda y estado requeridos' });

  const validStates = ['pendiente', 'confirmado', 'enviado', 'entregado', 'cancelado'];
  if (!validStates.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });

  try {
    const { error } = await supabase
      .from('pedidos')
      .update({ estado, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tienda', tienda);
    if (handleSupabaseError(error, 'updateOrderStatus')) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('Error updateOrderStatus:', e);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
};

// DELETE /api/admin/pedidos/:id?tienda=xxx
export const deleteOrder = async (req, res) => {
  const { id } = req.params;
  const tienda = req.query.tienda;
  try {
    const { error } = await supabase
      .from('pedidos')
      .delete()
      .eq('id', id)
      .eq('tienda', tienda);
    if (handleSupabaseError(error, 'deleteOrder')) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar pedido' });
  }
};

// DELETE /api/admin/pedidos?tienda=xxx  (borra todos)
export const deleteAllOrders = async (req, res) => {
  const tienda = req.query.tienda;
  if (!tienda) return res.status(400).json({ error: 'Tienda requerida' });
  try {
    const { error } = await supabase
      .from('pedidos')
      .delete()
      .eq('tienda', tienda);
    if (handleSupabaseError(error, 'deleteAllOrders')) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar pedidos' });
  }
};