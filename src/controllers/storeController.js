// ============================================================
// src/controllers/storeController.js — Delgado
// ============================================================

import {
    getAllStores,
    getStoreById as getStoreByIdService,
    getStoreConfigById,
    insertStore,
    updateStoreRecord,
    removeStore
} from '../services/store.service.js';

export const getStoresInfo = async (req, res) => {
    try {
        const data = await getAllStores();
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
};

export const getStoreById = async (req, res) => {
    try {
        const data = await getStoreByIdService(req.params.id);
        if (!data) return res.status(404).json({ error: 'No encontrada' });
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
};

export const getStoreConfig = async (req, res) => {
    try {
        const data = await getStoreConfigById(req.params.id);
        res.json(data);
    } catch (error) { res.json({}); }
};

export const createStore = async (req, res) => {
    try {
        await insertStore(req.body);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
};

export const updateStore = async (req, res) => {
    try {
        const merged = await updateStoreRecord(req.params.id, req.body);
        res.json({ success: true, configuracion: merged });
    } catch (error) {
        if (error.message === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Tienda no encontrada' });
        }
        console.error('❌ [updateStore]', error);
        res.status(500).json({ error: error.message });
    }
};

export const deleteStore = async (req, res) => {
    try {
        await removeStore(req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
};