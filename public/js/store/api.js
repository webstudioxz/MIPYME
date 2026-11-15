// ============================================================
// public/js/store/api.js — Cliente API para la tienda pública
// ============================================================

window.StoreAPI = {
    storeId: '',
    baseUrl: '',

    init(storeId) { 
        this.storeId = storeId || ''; 
    },

    /**
     * Helper central para peticiones HTTP con manejo de errores estandarizado.
     */
    async request(url, options = {}) {
        try {
            const res = await fetch(url, {
                ...options,
                headers: { 
                    'Accept': 'application/json', 
                    ...(options.headers || {}) 
                }
            });
            
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                const errMsg = data?.error || data?.message || `HTTP ${res.status}`;
                throw new Error(errMsg);
            }
            return data;
        } catch (e) {
            console.error(`❌ API Error [${url}]:`, e.message);
            throw e;
        }
    },

    async getStatus() { 
        try { return await this.request('/api/status?_=' + Date.now()); } 
        catch (e) { return { online: false }; } 
    },

    async getConfig() { 
        try { return await this.request('/api/config?_=' + Date.now()); } 
        catch (e) { 
            console.warn('⚠️ No se pudo cargar /api/config, usando valores por defecto.');
            return { moneda_base: 'CUP', tasas: { CUP: 1, USD: 0.04, EUR: 0.037 } }; 
        } 
    },

    async getTiendasInfo() { 
        try { return await this.request('/api/tiendas/info?_=' + Date.now()); } 
        catch (e) { return []; } 
    },

    async getTienda(id) { 
        if (!id) throw new Error('ID de tienda requerido'); 
        return await this.request(`/api/tiendas/${encodeURIComponent(id)}`); 
    },

    async getStoreConfig(id) { 
        if (!id) throw new Error('ID de tienda requerido'); 
        try { return await this.request(`/api/tiendas/${encodeURIComponent(id)}/config`); } 
        catch (e) { return {}; } 
    },

    async getProductos(tienda) { 
        const t = tienda || this.storeId; 
        if (!t) return []; 
        try { return await this.request(`/api/productos?tienda=${encodeURIComponent(t)}&_=${Date.now()}`); } 
        catch (e) { return []; } 
    },

    async getPlanes() {
        try { return await this.request('/api/planes?_=' + Date.now()); } 
        catch (e) { 
            console.error('Error cargando planes:', e);
            return [];
        }
    },

    async getPrivacidad() {
        try { return await this.request('/api/privacidad?_=' + Date.now()); } 
        catch (e) {
            console.error('Error cargando privacidad:', e);
            return { titulo: 'Privacidad', contenido: 'No disponible.' };
        }
    },

    /**
     * Crea un pedido.
     * Fix B14: Ahora usa el helper `request()` para mantener consistencia en headers y manejo de errores.
     */
    async crearPedido(payload) {
        return await this.request('/api/pedidos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    }
};