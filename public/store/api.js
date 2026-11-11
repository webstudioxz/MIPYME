// ============================================================
// public/js/store/api.js
// Cliente API para la tienda pública (sin autenticación)
// ============================================================

window.StoreAPI = {
    storeId: '',
    baseUrl: '',

    init(storeId) {
        this.storeId = storeId || '';
    },

    // ------------------------------------------------------------
    // Helper genérico para hacer fetch con manejo de errores
    // ------------------------------------------------------------
    async request(url, options = {}) {
        try {
            const res = await fetch(url, {
                ...options,
                headers: {
                    'Accept': 'application/json',
                    ...(options.headers || {})
                }
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || err.message || `HTTP ${res.status}`);
            }
            return await res.json();
        } catch (e) {
            console.error(`❌ API Error [${url}]:`, e.message);
            throw e;
        }
    },

    // ------------------------------------------------------------
    // Estado del servidor
    // ------------------------------------------------------------
    async getStatus() {
        try {
            return await this.request('/api/status?_=' + Date.now());
        } catch (e) {
            return { online: false };
        }
    },

    // ------------------------------------------------------------
    // Configuración global (tasas de cambio)
    // ------------------------------------------------------------
    async getConfig() {
        try {
            return await this.request('/api/config?_=' + Date.now());
        } catch (e) {
            return {
                moneda_base: 'CUP',
                tasas: { CUP: 1, USD: 0.04, EUR: 0.037 }
            };
        }
    },

    // ------------------------------------------------------------
    // Tiendas
    // ------------------------------------------------------------
    async getTiendasInfo() {
        try {
            return await this.request('/api/tiendas/info?_=' + Date.now());
        } catch (e) {
            return [];
        }
    },

    async getTienda(id) {
        if (!id) throw new Error('ID de tienda requerido');
        return await this.request(`/api/tiendas/${encodeURIComponent(id)}`);
    },

    async getStoreConfig(id) {
        if (!id) throw new Error('ID de tienda requerido');
        try {
            return await this.request(`/api/tiendas/${encodeURIComponent(id)}/config`);
        } catch (e) {
            return {};
        }
    },

    // ------------------------------------------------------------
    // Productos (público)
    // ------------------------------------------------------------
    async getProductos(tienda) {
        const t = tienda || this.storeId;
        if (!t) return [];
        try {
            return await this.request(`/api/productos?tienda=${encodeURIComponent(t)}&_=${Date.now()}`);
        } catch (e) {
            return [];
        }
    },

    // ------------------------------------------------------------
    // Crear pedido (con validación de respuesta)
    // ------------------------------------------------------------
    async crearPedido(payload) {
        const res = await fetch('/api/pedidos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        let data;
        try {
            data = await res.json();
        } catch (e) {
            throw new Error('Respuesta inválida del servidor');
        }

        if (!res.ok) {
            throw new Error(data.error || data.message || 'Error al procesar el pedido');
        }

        return data;
    }
};