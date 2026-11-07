import express from 'express';
import { getProducts } from '../controllers/productController.js';
import { createOrder } from '../controllers/orderController.js';
import { getStoresInfo, getStoreById, getStoreConfig } from '../controllers/storeController.js';
import { checkRateLimit } from '../middlewares/rateLimit.js';
import { supabase } from '../config/supabase.js';
import { saveSubscription } from '../utils/pushNotifications.js';

const router = express.Router();

// Status
router.get('/status', (req, res) => res.json({ online: true }));

// Configuración global (Monedas)
router.get('/config', async (req, res) => {
    try {
        const { data, error } = await supabase.from('config').select('*').eq('id', 1).single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.json({ moneda_base: 'CUP', tasas: { CUP: 1, USD: 0.04, EUR: 0.037 } });
    }
});

// Tiendas
router.get('/tiendas/info', getStoresInfo);
router.get('/tiendas/:id', getStoreById);
router.get('/tiendas/:id/config', getStoreConfig);

// Productos (público)
router.get('/productos', getProducts);

// Pedidos (público, con límite de tasa)
router.post('/pedidos', checkRateLimit, createOrder);

// ============================================
// NOTIFICACIONES PUSH
// ============================================
router.get('/push/public-key', (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

router.post('/push/subscribe', async (req, res) => {
    try {
        const success = await saveSubscription(req.body, req.headers['user-agent']);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(500).json({ success: false, error: 'No se pudo guardar la suscripción' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;