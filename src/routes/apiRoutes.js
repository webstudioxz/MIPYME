// ============================================================
// src/routes/apiRoutes.js — CORREGIDO v2
// ============================================================

import express from 'express';
import { getProducts } from '../controllers/productController.js';
import { createOrder } from '../controllers/orderController.js';
import { getStoreConfig } from '../controllers/storeController.js';
import { checkRateLimit } from '../middlewares/rateLimit.js';
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

// 🚨 PÚBLICO: solo tiendas visibles (no pausadas, no canceladas, no vencidas)
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

// 🚨 PÚBLICO: devuelve la tienda, o 403 si no está disponible.
//     El index usa esta señal para mostrar el banner correspondiente:
//       - inactiva:true  → "Tienda en revisión" (pendiente de liberación por el admin)
//       - pausada:true   → "Tienda pausada" (pausa manual del owner/admin)
//       - vencida        → "Tienda no disponible"
//       - cancelada      → "Tienda no disponible"
router.get('/tiendas/:id', async (req, res) => {
    try {
        const { data } = await supabase.from('stores').select('*').eq('id', req.params.id).maybeSingle();
        if (!data) return res.status(404).json({ error: 'Tienda no encontrada' });

        const ahora = new Date();
        const vencida = data.fecha_vencimiento &&
            !String(data.fecha_vencimiento).startsWith('9999') &&
            new Date(data.fecha_vencimiento) < ahora;

        if (data.pausada === true || data.activa === false || data.estado_pago === 'cancelado' || vencida) {
            // 🚨 FIX: Calcular pausada_mensaje según el motivo real de indisponibilidad.
            // Cuando activa===false la tienda está pendiente de liberación por el admin,
            // NO está "pausada" por el dueño. El mensaje debe reflejar eso para que el
            // storefront no muestre "Volvemos pronto" cuando en realidad está "en revisión".
            let pausada_mensaje = null;
            if (data.activa === false && !data.pausada) {
                pausada_mensaje = 'Tienda en revisión. Pronto estará disponible.';
            } else if (data.pausada === true) {
                // Mensaje de pausa guardado en configuracion._pausa_mensaje o en pausada_mensaje
                pausada_mensaje = data.configuracion?._pausa_mensaje || data.pausada_mensaje || 'Volvemos pronto';
            } else if (vencida) {
                pausada_mensaje = 'Suscripción vencida. Contacta con el proveedor.';
            } else if (data.estado_pago === 'cancelado') {
                pausada_mensaje = 'Tienda no disponible.';
            }
            return res.status(403).json({
                error: 'Tienda no disponible temporalmente',
                pausada: data.pausada === true,
                inactiva: data.activa === false,
                cancelada: data.estado_pago === 'cancelado',
                vencida,
                pausada_mensaje,
                // Datos mínimos para que el index muestre el banner
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