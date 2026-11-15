// ============================================================
// src/controllers/productController.js — Delgado
// ============================================================

import {
    getProductsByTienda,
    insertProduct,
    updateProductRecord,
    removeProduct
} from '../services/product.service.js';

export const getProducts = async (req, res) => {
    try {
        const data = await getProductsByTienda(req.query.tienda);
        res.json(data);
    } catch (error) { res.json([]); }
};

export const createProduct = async (req, res) => {
    try {
        const data = await insertProduct(req.body, req.file);
        res.json({ success: true, data });
    } catch (error) {
        console.error('❌ [createProduct]', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateProduct = async (req, res) => {
    try {
        await updateProductRecord(req.params.id, req.body, req.file);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ [updateProduct]', error);
        res.status(500).json({ error: error.message });
    }
};

export const deleteProduct = async (req, res) => {
    try {
        await removeProduct(req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
};