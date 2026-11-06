window.StoreAPI = {
    async getConfig() {
        try {
            const res = await fetch('/api/config?_=' + Date.now());
            return await res.json();
        } catch (e) {
            return { tasas: { USD: 0.04, EUR: 0.037 } };
        }
    },
    
    async getProducts(tienda) {
        try {
            const res = await fetch(`/api/productos?tienda=${tienda}&_=${Date.now()}`);
            return await res.json();
        } catch (e) {
            return [];
        }
    },
    
    async getStoresInfo() {
        try {
            // ¡OJO! Esta ruta es /api/tiendas/info, no /api/tiendas
            const res = await fetch('/api/tiendas/info');
            return await res.json();
        } catch (e) {
            return [];
        }
    },
    
    async getStoreById(id) {
        try {
            const res = await fetch(`/api/tiendas/${id}`);
            return await res.json();
        } catch (e) {
            return null;
        }
    },
    
    async getStoreConfig(id) {
        try {
            const res = await fetch(`/api/tiendas/${id}/config`);
            return await res.json();
        } catch (e) {
            return {};
        }
    },
    
    async checkStatus() {
        try {
            const r = await fetch('/api/status?_=' + Date.now());
            return r.ok;
        } catch (e) {
            return false;
        }
    },
    
    async crearPedido(payload) {
        const r = await fetch('/api/pedidos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await r.json();
    }
};