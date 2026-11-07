import express from 'express';
import multer from 'multer';
import { login, verifySession, logout } from '../controllers/authController.js';
import { createProduct, updateProduct, deleteProduct, getProducts } from '../controllers/productController.js';
import { getOrders, searchOrder, updateOrderStatus, deleteOrder, deleteAllOrders } from '../controllers/orderController.js';
import { createStore, updateStore, deleteStore, getStoresInfo, getStoreById } from '../controllers/storeController.js';
import { requireAuth } from '../middlewares/auth.js';
import { supabase } from '../config/supabase.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// --- RUTAS PÚBLICAS DE ADMIN (Login) ---
router.post('/login', login);
router.get('/verify-session', verifySession);
router.post('/logout', logout);

// --- MIDDLEWARE DE AUTENTICACIÓN ---
// A partir de aquí, todo requiere token
router.use(requireAuth);

// --- RUTAS PROTEGIDAS (Tiendas) ---
router.get('/tiendas', getStoresInfo);
router.get('/tiendas/:id', getStoreById);
router.post('/tiendas', createStore);
router.put('/tiendas/:id', updateStore);
router.delete('/tiendas/:id', deleteStore);

// --- RUTAS PROTEGIDAS (Categorías) ---
router.get('/categorias', async (req, res) => {
    try {
        const { data, error } = await supabase.from('stores').select('categorias').eq('id', req.query.tienda).single();
        if (error) throw error;
        res.json(data?.categorias || ['otros']);
    } catch (e) { res.json(['otros']); }
});

router.post('/categorias', async (req, res) => {
    try {
        const { data: store } = await supabase.from('stores').select('categorias').eq('id', req.body.tienda).single();
        const currentCats = store?.categorias || [];
        if (!currentCats.includes(req.body.categoria)) currentCats.push(req.body.categoria);
        
        await supabase.from('stores').update({ categorias: currentCats, updated_at: new Date() }).eq('id', req.body.tienda);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- RUTAS PROTEGIDAS (Productos) ---
router.get('/productos', getProducts);
router.post('/productos', upload.single('imagen'), createProduct);
router.put('/productos/:id', upload.single('imagen'), updateProduct);
router.delete('/productos/:id', deleteProduct);

// --- RUTAS PROTEGIDAS (Pedidos) ---
router.get('/pedidos', getOrders);
router.get('/pedidos/buscar', searchOrder);
router.put('/pedidos/:id', updateOrderStatus);
router.delete('/pedidos/:id', deleteOrder);
router.delete('/pedidos', deleteAllOrders);

// --- RUTAS PROTEGIDAS (Configuración Moneda) ---
router.get('/config', async (req, res) => {
    try {
        const { data, error } = await supabase.from('config').select('*').eq('id', 1).single();
        if (error) throw error;
        res.json(data);
    } catch (e) {
        res.json({ moneda_base: 'CUP', tasas: { CUP: 1, USD: 0.04, EUR: 0.037 } });
    }
});

router.put('/config', async (req, res) => {
    try {
        const { monedaBase, tasas } = req.body;
        if (!tasas || tasas.USD <= 0 || tasas.EUR <= 0) {
            return res.status(400).json({ success: false, error: 'Las tasas deben ser mayores a 0' });
        }
        
        const configData = {
            moneda_base: monedaBase || 'CUP',
            tasas: { CUP: 1, USD: parseFloat(tasas.USD), EUR: parseFloat(tasas.EUR) },
            updated_at: new Date().toISOString()
        };
        
        const { data: existing } = await supabase.from('config').select('id').eq('id', 1).single();
        
        if (existing) {
            await supabase.from('config').update(configData).eq('id', 1);
        } else {
            await supabase.from('config').insert({ id: 1, ...configData, created_at: new Date().toISOString() });
        }
        
        res.json({ success: true, data: configData });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

export default router;