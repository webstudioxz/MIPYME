// src/routes/adminRoutes.js
import express from 'express';
import multer from 'multer';

// Controladores
import { login, verifySession, logout } from '../controllers/authController.js';
import { createProduct, updateProduct, deleteProduct, getProducts } from '../controllers/productController.js';
import { getOrders, searchOrder, updateOrderStatus, deleteOrder, deleteAllOrders } from '../controllers/orderController.js';
import { createStore, updateStore, deleteStore, getStoresInfo, getStoreById } from '../controllers/storeController.js';

// Middlewares
import { requireAuth } from '../middlewares/auth.js';
import { supabase } from '../config/supabase.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ==========================================
// 🔓 RUTAS PÚBLICAS (Login)
// ==========================================
router.post('/login', login);
router.get('/verify-session', verifySession);
router.post('/logout', logout);

// ==========================================
// 🔒 MIDDLEWARE DE SEGURIDAD (A partir de aquí se requiere Token)
// ==========================================
router.use(requireAuth);

// ==========================================
// RUTAS DE TIENDAS
// ==========================================
router.get('/tiendas', getStoresInfo);
router.get('/tiendas/:id', getStoreById);
router.post('/tiendas', createStore);
router.put('/tiendas/:id', updateStore);
router.delete('/tiendas/:id', deleteStore);

// ==========================================
// RUTAS DE CATEGORÍAS
// ==========================================
router.get('/categorias', async (req, res) => {
    try { 
        const { data } = await supabase.from('stores').select('categorias').eq('id', req.query.tienda).single(); 
        res.json(data?.categorias || ['otros']); 
    } catch (e) { 
        res.json(['otros']); 
    }
});

router.post('/categorias', async (req, res) => {
    try { 
        const { data: s } = await supabase.from('stores').select('categorias').eq('id', req.body.tienda).single(); 
        let cats = s?.categorias || []; 
        if (!cats.includes(req.body.categoria)) cats.push(req.body.categoria); 
        await supabase.from('stores').update({ categorias: cats }).eq('id', req.body.tienda); 
        res.json({ success: true }); 
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

// ==========================================
// RUTAS DE PRODUCTOS
// ==========================================
router.get('/productos', getProducts);
router.post('/productos', upload.single('imagen'), createProduct);
router.put('/productos/:id', upload.single('imagen'), updateProduct);
router.delete('/productos/:id', deleteProduct);

// ==========================================
// RUTAS DE PEDIDOS
// ==========================================
router.get('/pedidos', getOrders);
router.get('/pedidos/buscar', searchOrder);
router.put('/pedidos/:id', updateOrderStatus);
router.delete('/pedidos/:id', deleteOrder);
router.delete('/pedidos', deleteAllOrders);

// ==========================================
// RUTAS DE CONFIGURACIÓN GLOBAL (Monedas)
// ==========================================
router.get('/config', async (req, res) => {
    try { 
        const { data } = await supabase.from('config').select('*').eq('id', 1).single(); 
        res.json(data || { moneda_base: 'CUP', tasas: { CUP: 1, USD: 0.04, EUR: 0.037 } }); 
    } catch (e) { 
        res.json({ moneda_base: 'CUP', tasas: { CUP: 1, USD: 0.04, EUR: 0.037 } }); 
    }
});

router.put('/config', async (req, res) => {
    try { 
        const { monedaBase, tasas } = req.body; 
        await supabase.from('config').upsert({ id: 1, moneda_base: monedaBase, tasas, updated_at: new Date().toISOString() }); 
        res.json({ success: true }); 
    } catch (e) { 
        res.status(500).json({ success: false, error: e.message }); 
    }
});

export default router;