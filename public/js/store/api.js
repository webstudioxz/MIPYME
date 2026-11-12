// ============================================================
// public/js/store/api.js
// ============================================================

window.StoreAPI = {
    storeId: '',
    baseUrl: '',

    init(storeId) {
        this.storeId = storeId || '';
    },

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

    async getStatus() {
        try { return await this.request('/api/status?_=' + Date.now()); } catch (e) { return { online: false }; }
    },

    async getConfig() {
        try {
            return await this.request('/api/config?_=' + Date.now());
        } catch (e) {
            return { moneda_base: 'CUP', tasas: { CUP: 1, USD: 0.04, EUR: 0.037 } };
        }
    },

    async getTiendasInfo() {
        try { return await this.request('/api/tiendas/info?_=' + Date.now()); } catch (e) { return []; }
    },

    async getTienda(id) {
        if (!id) throw new Error('ID de tienda requerido');
        return await this.request(`/api/tiendas/${encodeURIComponent(id)}`);
    },

    async getStoreConfig(id) {
        if (!id) throw new Error('ID de tienda requerido');
        try { return await this.request(`/api/tiendas/${encodeURIComponent(id)}/config`); } catch (e) { return {}; }
    },

    async getProductos(tienda) {
        const t = tienda || this.storeId;
        if (!t) return [];
        try { return await this.request(`/api/productos?tienda=${encodeURIComponent(t)}&_=${Date.now()}`); } catch (e) { return []; }
    },

    // 🚨 CREAR PEDIDO BLINDADO
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
            throw new Error('Error de comunicación con el servidor');
        }

        if (!res.ok || data.success === false) {
            throw new Error(data.error || data.message || 'Error al procesar el pedido en el servidor');
        }

        return data;
    }
};