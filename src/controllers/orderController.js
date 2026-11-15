// ============================================================
// src/controllers/orderController.js — Delgado
// ============================================================

import {
    createOrderRecord,
    getOrdersByTienda,
    searchOrderByCodigo,
    updateOrderState,
    deleteOrderById,
    deleteOrdersByTienda
} from '../services/order.service.js';
import { rateLimitStore } from '../middlewares/rateLimit.middleware.js';
import { sendPushToAll } from '../services/push.service.js';

export const createOrder = async (req, res) => {
    try {
        const tienda = req.body.tienda || 'electro';
        const record = req.rateLimitRecord;

        const { order, contacto, codigoCliente } = await createOrderRecord({
            ...req.body,
            tienda
        });

        if (record) {
            record.count++;
            rateLimitStore.set(req.rateLimitIp || req.ip, record);
        }

        sendPushToAll({
            title: `🛒 ¡Nuevo Pedido en ${tienda.toUpperCase()}!`,
            body: `${req.body.nombre} - Total: $${parseFloat(req.body.total).toFixed(2)}`,
            url: `/admin-cliente?tienda=${tienda}`,
            tienda
        }).catch(console.error);

        res.json({
            success: true,
            orderId: order.id,
            codigoCliente,
            whatsapp_destino: contacto.whatsapp || null,
            contacto_nombre: contacto.contacto_nombre || null
        });
    } catch (error) {
        console.error('❌ Error creando pedido:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getOrders = async (req, res) => {
    try {
        const data = await getOrdersByTienda(req.query.tienda);
        res.json(data);
    } catch (error) {
        res.json([]);
    }
};

export const searchOrder = async (req, res) => {
    try {
        const data = await searchOrderByCodigo(req.query.codigo, req.query.tienda);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateOrderStatus = async (req, res) => {
    try {
        await updateOrderState(req.params.id, req.body.tienda, req.body.estado);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteOrder = async (req, res) => {
    try {
        await deleteOrderById(req.params.id, req.query.tienda);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteAllOrders = async (req, res) => {
    try {
        await deleteOrdersByTienda(req.query.tienda);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};