import express from 'express';
import { getProducts } from '../controllers/productController.js';
import { createOrder } from '../controllers/orderController.js';
import { getStoresInfo, getStoreById, getStoreConfig } from '../controllers/storeController.js';
import { checkRateLimit } from '../middlewares/rateLimit.js';
import { supabase } from '../config/supabase.js';

const router = express.Router();

router.get('/status', (req, res) => res.json({ online: true }));

router.get('/config', async (req, res) => {
    try { const { data } = await supabase.from('config').select('*').eq('id', 1).single(); res.json(data); } catch (e) { res.json({ moneda_base: 'CUP', tasas: { CUP: 1, USD: 0.04, EUR: 0.037 } }); }
});

router.get('/tiendas/info', getStoresInfo);
router.get('/tiendas/:id', getStoreById);
router.get('/tiendas/:id/config', getStoreConfig);
router.get('/productos', getProducts);
router.get('/categorias', async (req, res) => {
    try { const { data } = await supabase.from('stores').select('categorias').eq('id', req.query.tienda).single(); res.json(data?.categorias || ['otros']); } catch (e) { res.json(['otros']); }
});
router.post('/pedidos', checkRateLimit, createOrder);

router.get('/push/public-key', (req, res) => res.json({ publicKey: process.env.VAPID_PUBLIC_KEY }));
router.post('/push/subscribe', async (req, res) => {
    try { const { endpoint, keys } = req.body; await supabase.from('push_subscriptions').upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'endpoint' }); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

export default router;