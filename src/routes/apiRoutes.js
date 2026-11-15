// ============================================================
// src/routes/apiRoutes.js
// ============================================================

import express from 'express';
import { getProducts } from '../controllers/productController.js';
import { createOrder } from '../controllers/orderController.js';
import { getStoreConfig } from '../controllers/storeController.js';
import { checkRateLimit } from '../middlewares/rateLimit.middleware.js';
import { supabase } from '../config/supabase.js';

const router = express.Router();

router.get('/status', (req, res) => res.json({ online: true }));

router.get('/config', async (req, res) => {
    try {
        const { data } = await supabase.from('config').select('*').eq('id', 1).single();
        res.json(data);
    } catch (e) {
        res.json({ moneda_base: 'CUP', tasas: { CUP: 1, USD: 0.04, EUR: 0.037 } });
    }
});

router.get('/tiendas/info', async (req, res) => {
    try {
        const { data } = await supabase.from('stores').select('*');
        const ahora = new Date();
        const visibles = (data || []).filter(t => {
            if (t.pausada === true) return false;
            if (t.activa === false) return false;
            if (t.estado_pago === 'cancelado') return false;
            if (t.fecha_vencimiento && !String(t.fecha_vencimiento).startsWith('9999') && new Date(t.fecha_vencimiento) < ahora) return false;
            return true;
        });
        res.json(visibles);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/tiendas/:id', async (req, res) => {
    try {
        const { data } = await supabase.from('stores').select('*').eq('id', req.params.id).maybeSingle();
        if (!data) return res.status(404).json({ error: 'Tienda no encontrada' });

        const ahora = new Date();
        const vencida = data.fecha_vencimiento &&
            !String(data.fecha_vencimiento).startsWith('9999') &&
            new Date(data.fecha_vencimiento) < ahora;

        if (data.pausada === true || data.activa === false || data.estado_pago === 'cancelado' || vencida) {
            return res.status(403).json({
                error: 'Tienda no disponible temporalmente',
                pausada: data.pausada === true,
                inactiva: data.activa === false,
                cancelada: data.estado_pago === 'cancelado',
                vencida,
                nombre: data.nombre,
                icono: data.icono,
                contacto: data.configuracion?.contacto || null,
                whatsapp_confirmacion: data.configuracion?.datos_bancarios?.whatsapp_confirmacion || null
            });
        }
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/tiendas/:id/config', getStoreConfig);
router.get('/productos', getProducts);

router.get('/categorias', async (req, res) => {
    try {
        const { data } = await supabase.from('stores').select('categorias').eq('id', req.query.tienda).single();
        res.json(data?.categorias || ['otros']);
    } catch (e) { res.json(['otros']); }
});

router.post('/pedidos', checkRateLimit, createOrder);

router.get('/push/public-key', (req, res) => res.json({ publicKey: process.env.VAPID_PUBLIC_KEY }));

router.post('/push/subscribe', async (req, res) => {
    try {
        const { endpoint, keys, tienda_id } = req.body;
        await supabase.from('push_subscriptions').upsert(
            { endpoint, p256dh: keys.p256dh, auth: keys.auth, tienda_id: tienda_id || null },
            { onConflict: 'endpoint' }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

export default router;