// ============================================================
// public/js/admin/api.js — COMPLETO v3
// Cliente API del panel de administración (con Auth)
// ============================================================

window.AdminAPI = {
    token: null,
    expiry: null,
    onUnauthorized: null,

    // ------------------------------------------------------------
    // Inicialización / sesión
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // Fetch autenticado
    // ------------------------------------------------------------
    async fetch(url, options = {}) {
        if (!this.token) throw new Error('No autenticado');
        if (this.expiry && Date.now() > this.expiry) {
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

    // ============================================================
    // TIENDAS
    // ============================================================
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

    // 🚨 NUEVO: pausar con mensaje desde admin central
    async pausarTiendaConMensaje(slug, mensaje) {
        const r = await this.fetch(`/api/superadmin/pausar/${slug}`, {
            method: 'POST',
            body: JSON.stringify({ pausar: true, mensaje: mensaje || 'Tienda pausada por administración' })
        });
        return { ok: r.ok, data: await r.json().catch(() => ({})) };
    },

    // 🚨 NUEVO: reanudar tienda
    async reanudarTienda(slug) {
        const r = await this.fetch(`/api/superadmin/pausar/${slug}`, {
            method: 'POST',
            body: JSON.stringify({ pausar: false })
        });
        return { ok: r.ok, data: await r.json().catch(() => ({})) };
    },

    // 🚨 NUEVO: cambiar tipo / multi-contacto / notificaciones
    async actualizarContextoTienda(slug, contexto) {
        const r = await this.fetch(`/api/superadmin/tiendas/${slug}/contexto`, {
            method: 'PUT',
            body: JSON.stringify(contexto)
        });
        return { ok: r.ok, data: await r.json().catch(() => ({})) };
    },

    // 🚨 NUEVO: pausar mi propia tienda (owner)
    async pausarMiTienda(ownerId, slug, mensaje) {
        const r = await this.fetch('/api/mi-tienda/pausar', {
            method: 'POST',
            body: JSON.stringify({ owner_id: ownerId, slug, pausar: true, mensaje })
        });
        return { ok: r.ok, data: await r.json().catch(() => ({})) };
    },

    // 🚨 NUEVO: reactivar mi propia tienda (owner)
    async reactivarMiTienda(ownerId, slug) {
        const r = await this.fetch('/api/mi-tienda/pausar', {
            method: 'POST',
            body: JSON.stringify({ owner_id: ownerId, slug, pausar: false })
        });
        return { ok: r.ok, data: await r.json().catch(() => ({})) };
    },

    // ============================================================
    // CATEGORÍAS
    // ============================================================
    async getCategorias(tienda) {
        const r = await this.fetch(`/api/admin/categorias?tienda=${tienda}`);
        return await r.json();
    },
    async agregarCategoria(tienda, categoria) {
        const r = await this.fetch('/api/admin/categorias', {
            method: 'POST',
            body: JSON.stringify({ tienda, categoria })
        });
        return r.ok;
    },

    // ============================================================
    // PRODUCTOS
    // ============================================================
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

    // ============================================================
    // PEDIDOS
    // ============================================================
    async getPedidos(tienda) {
        const r = await this.fetch(`/api/admin/pedidos?tienda=${tienda}`);
        return await r.json();
    },
    async buscarPedido(codigo, tienda) {
        const r = await this.fetch(`/api/admin/pedidos/buscar?codigo=${encodeURIComponent(codigo)}&tienda=${tienda}`);
        return await r.json();
    },
    async actualizarEstadoPedido(id, tienda, estado) {
        const r = await this.fetch(`/api/admin/pedidos/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ tienda, estado })
        });
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

    // ============================================================
    // CONFIG MONEDA
    // ============================================================
    async getConfig() {
        const r = await this.fetch('/api/admin/config');
        return await r.json();
    },
    async saveConfig(monedaBase, tasas) {
        const r = await this.fetch('/api/admin/config', {
            method: 'PUT',
            body: JSON.stringify({ monedaBase, tasas })
        });
        return { ok: r.ok, data: await r.json() };
    },

    // ============================================================
    // 🚨 PLANES (nuevo)
    // ============================================================
    async getPlanes() {
        try {
            const r = await fetch('/api/superadmin/planes');
            return await r.json();
        } catch (e) {
            return [];
        }
    },
    async getPlanesPublicos() {
        try {
            const r = await fetch('/api/planes');
            return await r.json();
        } catch (e) {
            return [];
        }
    },
    async guardarPlan(id, data) {
        const r = await this.fetch(`/api/superadmin/planes/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        return { ok: r.ok, data: await r.json().catch(() => ({})) };
    },

    // ============================================================
    // 🚨 PRIVACIDAD (nuevo)
    // ============================================================
    async getPrivacidad() {
        try {
            const r = await fetch('/api/privacidad');
            return await r.json();
        } catch (e) {
            return { titulo: 'Política de Privacidad', contenido: '', actualizado: null };
        }
    },
    async guardarPrivacidad(data) {
        const r = await this.fetch('/api/superadmin/privacidad', {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        return { ok: r.ok, data: await r.json().catch(() => ({})) };
    },

    // ============================================================
    // 🚨 NOTIFICACIONES (nuevo)
    // ============================================================
    async actualizarNotificaciones(slug, modo, multiContacto) {
        const contexto = {};
        if (modo && ['admin', 'whatsapp', 'ambos'].includes(modo)) contexto.notificaciones_modo = modo;
        if (multiContacto !== undefined) contexto.whatsapp_por_producto = multiContacto === true;
        return await this.actualizarContextoTienda(slug, contexto);
    },

    // ============================================================
    // 🚨 MI TIENDA (owner) — helper completo
    // ============================================================
    async getMiTienda(ownerId) {
        try {
            const r = await fetch(`/api/mi-tienda?owner_id=${ownerId}`);
            return await r.json();
        } catch (e) {
            return { success: false };
        }
    },

    async getTiendaCompleta(slug) {
        try {
            const r = await fetch(`/api/mi-tienda?slug=${slug}`);
            return await r.json();
        } catch (e) {
            return { success: false };
        }
    },

    // 🚨 NUEVO: actualizar configuración (con merge profundo en backend)
    async actualizarConfig(slug, ownerId, configuracion) {
        const r = await this.fetch('/api/mi-tienda/config', {
            method: 'PUT',
            body: JSON.stringify({ owner_id: ownerId, slug, configuracion })
        });
        return { ok: r.ok, data: await r.json().catch(() => ({})) };
    },

    // ============================================================
    // 🚨 SUPERADMIN USUARIOS (nuevo)
    // ============================================================
    async getUsuarios() {
        try {
            const r = await fetch('/api/superadmin/usuarios');
            return await r.json();
        } catch (e) {
            return [];
        }
    },
    async eliminarUsuario(id) {
        const r = await this.fetch(`/api/superadmin/usuarios/${id}`, { method: 'DELETE' });
        return { ok: r.ok, data: await r.json().catch(() => ({})) };
    },

    // ============================================================
    // 🚨 SUPERADMIN TIENDAS (extendida)
    // ============================================================
    async getTodasTiendasAdmin() {
        try {
            const r = await fetch('/api/superadmin/tiendas');
            return await r.json();
        } catch (e) {
            return [];
        }
    },
    async extenderTienda(slug, dias, horas = 0) {
        const r = await this.fetch(`/api/superadmin/tiendas/${slug}/tiempo`, {
            method: 'POST',
            body: JSON.stringify({ dias, horas })
        });
        return { ok: r.ok, data: await r.json().catch(() => ({})) };
    },
    async cancelarTienda(slug) {
        const r = await this.fetch(`/api/superadmin/tiendas/${slug}/cancelar`, { method: 'POST' });
        return { ok: r.ok, data: await r.json().catch(() => ({})) };
    },
    async eliminarTiendaCompleta(slug) {
        const r = await this.fetch(`/api/superadmin/tiendas/${slug}`, { method: 'DELETE' });
        return { ok: r.ok, data: await r.json().catch(() => ({})) };
    },

    // ============================================================
    // 🚨 SUPERADMIN TIENDA CONTEXTO (ya existía en server.js)
    // ============================================================
    async cambiarContexto(slug, tipo, whatsappPorProducto, notificacionesModo) {
        const body = { tipo };
        if (whatsappPorProducto !== undefined) body.whatsapp_por_producto = whatsappPorProducto === true;
        if (notificacionesModo) body.notificaciones_modo = notificacionesModo;
        const r = await this.fetch(`/api/superadmin/tiendas/${slug}/contexto`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        return { ok: r.ok, data: await r.json().catch(() => ({})) };
    },

    // ============================================================
    // 🚨 PUSH — prueba
    // ============================================================
    async testPush(tienda) {
        try {
            const r = await fetch('/api/push/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tienda: tienda || null })
            });
            return await r.json();
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
};