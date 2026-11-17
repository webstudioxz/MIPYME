// ============================================================
// src/routes/adminRoutes.js — CORREGIDO v3 (CON SOPORTE DE IMÁGENES)
// ============================================================

import express from 'express';
import multer from 'multer';
import { login, verifySession, logout } from '../controllers/authController.js';
import { createProduct, updateProduct, deleteProduct, getProducts } from '../controllers/productController.js';
import { getOrders, searchOrder, updateOrderStatus, deleteOrder, deleteAllOrders } from '../controllers/orderController.js';
import { createStore, updateStore, deleteStore, getStoresInfo, getStoreById } from '../controllers/storeController.js';
import { requireAuth } from '../middlewares/auth.js';
import { supabase } from '../config/supabase.js';

const router = express.Router();

// 🚨 CONFIGURACIÓN DE MULTER PARA SUBIDA DE IMÁGENES
// Guarda el archivo temporalmente en memoria RAM antes de enviarlo a Supabase Storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { 
        fileSize: 5 * 1024 * 1024 // Límite de 5MB por imagen
    },
    fileFilter: (req, file, cb) => {
        // Validar que sea una imagen
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de imagen (JPG, PNG, WEBP, etc.)'), false);
        }
    }
});

// ============ AUTENTICACIÓN ============
router.post('/login', login);
router.get('/verify-session', verifySession);
router.post('/logout', logout);

// ============ RUTAS PROTEGIDAS (Requieren Token) ============
router.use(requireAuth);

// ---- Tiendas ----
router.get('/tiendas', getStoresInfo);
router.get('/tiendas/:id', getStoreById);
router.post('/tiendas', createStore);
router.put('/tiendas/:id', updateStore); // Hace merge profundo
router.delete('/tiendas/:id', deleteStore);

// ---- Categorías ----
router.get('/categorias', async (req, res) => {
    try {
        const { data } = await supabase.from('stores').select('categorias').eq('id', req.query.tienda).maybeSingle();
        res.json(data?.categorias || ['otros']);
    } catch (e) {
        res.json(['otros']);
    }
});

router.post('/categorias', async (req, res) => {
    try {
        const { data: s } = await supabase.from('stores').select('categorias').eq('id', req.body.tienda).maybeSingle();
        let cats = Array.isArray(s?.categorias) ? [...s.categorias] : [];
        const nueva = (req.body.categoria || '').toString().trim().toLowerCase();
        if (nueva && !cats.includes(nueva)) cats.push(nueva);
        await supabase.from('stores').update({ categorias: cats }).eq('id', req.body.tienda);
        res.json({ success: true, categorias: cats });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ---- Productos (CON SUBIDA DE IMAGEN) ----
// 🚨 'upload.single('imagen')' intercepta el archivo enviado en el FormData
router.get('/productos', getProducts);
router.post('/productos', upload.single('imagen'), createProduct);
router.put('/productos/:id', upload.single('imagen'), updateProduct);
router.delete('/productos/:id', deleteProduct);

// ---- Pedidos ----
router.get('/pedidos', getOrders);
router.get('/pedidos/buscar', searchOrder);
router.put('/pedidos/:id', updateOrderStatus);
router.delete('/pedidos/:id', deleteOrder);
router.delete('/pedidos', deleteAllOrders);

// ---- Config global (moneda) ----
router.get('/config', async (req, res) => {
    try {
        const { data } = await supabase.from('config').select('*').eq('id', 1).maybeSingle();
        res.json(data || { moneda_base: 'CUP', tasas: { CUP: 1, USD: 0.04, EUR: 0.037 } });
    } catch (e) {
        res.json({ moneda_base: 'CUP', tasas: { CUP: 1, USD: 0.04, EUR: 0.037 } });
    }
});

router.put('/config', async (req, res) => {
    try {
        const { monedaBase, tasas } = req.body;
        await supabase.from('config').upsert({
            id: 1,
            moneda_base: monedaBase,
            tasas,
            updated_at: new Date().toISOString()
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

export default router;