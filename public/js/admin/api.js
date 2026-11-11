// ============================================================
// public/js/admin/api.js
// Cliente API para el panel de administración (con Auth)
// ============================================================

window.AdminAPI = {
    token: null,
    expiry: null,
    onUnauthorized: null,

    init() {
        this.token = localStorage.getItem('adminToken');
        this.expiry = localStorage.getItem('adminExpiry');
    },

    saveSession(token, expiry) {
        this.token = token;
        this.expiry = expiry;
        localStorage.setItem('adminToken', token);
        localStorage.setItem('adminExpiry', expiry);
    },

    clearSession() {
        this.token = null;
        this.expiry = null;
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminExpiry');
    },

    async login(password) {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ password })
        });
        return await res.json();
    },

    async verifySession() {
        if (!this.token || !this.expiry || Date.now() > parseInt(this.expiry)) {
            return false;
        }
        try {
            const res = await fetch('/api/admin/verify-session', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (!res.ok) return false;
            const data = await res.json();
            return data.valid === true;
        } catch (e) {
            return false;
        }
    },

    async logout() {
        if (this.token) {
            try {
                await fetch('/api/admin/logout', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
            } catch (e) {}
        }
        this.clearSession();
    },

    // Helper principal para peticiones autenticadas
    async fetch(url, options = {}) {
        if (!this.token) throw new Error('No autenticado');
        if (Date.now() > this.expiry) {
            this.clearSession();
            if (this.onUnauthorized) this.onUnauthorized();
            throw new Error('Sesión expirada');
        }

        const isFormData = options.body instanceof FormData;
        const headers = { ...options.headers, 'Authorization': `Bearer ${this.token}` };
        if (!isFormData && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(url, { ...options, headers });

        if (response.status === 401) {
            this.clearSession();
            if (this.onUnauthorized) this.onUnauthorized();
            throw new Error('Sesión expirada');
        }

        return response;
    },

    // ---- TIENDAS ----
    async getTiendas() {
        const r = await this.fetch('/api/admin/tiendas');
        return await r.json();
    },
    async getTienda(id) {
        const r = await this.fetch(`/api/admin/tiendas/${id}`);
        return await r.json();
    },
    async crearTienda(data) {
        const r = await this.fetch('/api/admin/tiendas', { method: 'POST', body: JSON.stringify(data) });
        return { ok: r.ok, data: await r.json() };
    },
    async actualizarTienda(id, data) {
        const r = await this.fetch(`/api/admin/tiendas/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        return { ok: r.ok, data: await r.json() };
    },
    async eliminarTienda(id) {
        const r = await this.fetch(`/api/admin/tiendas/${id}`, { method: 'DELETE' });
        return r.ok;
    },

    // ---- CATEGORÍAS ----
    async getCategorias(tienda) {
        const r = await this.fetch(`/api/admin/categorias?tienda=${tienda}`);
        return await r.json();
    },
    async agregarCategoria(tienda, categoria) {
        const r = await this.fetch('/api/admin/categorias', { method: 'POST', body: JSON.stringify({ tienda, categoria }) });
        return r.ok;
    },

    // ---- PRODUCTOS ----
    async getProductos(tienda) {
        const r = await this.fetch(`/api/admin/productos?tienda=${tienda}`);
        return await r.json();
    },
    async crearProducto(formData) {
        const r = await this.fetch('/api/admin/productos', { method: 'POST', body: formData });
        return { ok: r.ok, data: await r.json() };
    },
    async actualizarProducto(id, formData) {
        const r = await this.fetch(`/api/admin/productos/${id}`, { method: 'PUT', body: formData });
        return { ok: r.ok, data: await r.json() };
    },
    async eliminarProducto(id, tienda) {
        const r = await this.fetch(`/api/admin/productos/${id}?tienda=${tienda}`, { method: 'DELETE' });
        return r.ok;
    },

    // ---- PEDIDOS ----
    async getPedidos(tienda) {
        const r = await this.fetch(`/api/admin/pedidos?tienda=${tienda}`);
        return await r.json();
    },
    async buscarPedido(codigo, tienda) {
        const r = await this.fetch(`/api/admin/pedidos/buscar?codigo=${encodeURIComponent(codigo)}&tienda=${tienda}`);
        return await r.json();
    },
    async actualizarEstadoPedido(id, tienda, estado) {
        const r = await this.fetch(`/api/admin/pedidos/${id}`, { method: 'PUT', body: JSON.stringify({ tienda, estado }) });
        return r.ok;
    },
    async eliminarPedido(id, tienda) {
        const r = await this.fetch(`/api/admin/pedidos/${id}?tienda=${tienda}`, { method: 'DELETE' });
        return r.ok;
    },
    async eliminarTodosPedidos(tienda) {
        const r = await this.fetch(`/api/admin/pedidos?tienda=${tienda}`, { method: 'DELETE' });
        return r.ok;
    },

    // ---- CONFIG MONEDA ----
    async getConfig() {
        const r = await this.fetch('/api/admin/config');
        return await r.json();
    },
    async saveConfig(monedaBase, tasas) {
        const r = await this.fetch('/api/admin/config', { method: 'PUT', body: JSON.stringify({ monedaBase, tasas }) });
        return { ok: r.ok, data: await r.json() };
    }
};