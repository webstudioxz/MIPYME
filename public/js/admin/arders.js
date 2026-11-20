// ============================================================
// public/js/admin/orders.js — COMPLETO v3
// ============================================================

window.AdminOrders = {
    lastOrderCount: 0,
    orderCheckInterval: null,
    pedidosCache: [],

    // ------------------------------------------------------------
    // Normaliza teléfonos cubanos para wa.me
    // ------------------------------------------------------------
    normalizePhone(phone) {
        let n = String(phone || '').replace(/\D/g, '');
        if (n.length === 8 && n.startsWith('5')) n = '53' + n;
        return n;
    },

    // ------------------------------------------------------------
    // Cargar pedidos de la tienda activa
    // ------------------------------------------------------------
    async loadOrders() {
        const searchContainer = document.getElementById('searchResultContainer');
        if (searchContainer) { searchContainer.style.display = 'none'; searchContainer.innerHTML = ''; }

        const t = document.getElementById('tiendaSelect')?.value;
        const ordersList = document.getElementById('ordersList');

        if (!t || !ordersList) {
            if (ordersList) ordersList.innerHTML = '<div class="alert alert-info text-center py-4">Selecciona una tienda</div>';
            const stats = document.getElementById('orderStats');
            if (stats) stats.style.display = 'none';
            return;
        }

        try {
            const orders = await AdminAPI.getPedidos(t);
            this.pedidosCache = orders || [];
            this.lastOrderCount = this.pedidosCache.length;

            const countEl = document.getElementById('orderCount');
            if (countEl) countEl.innerText = `${this.pedidosCache.length} pedidos`;

            const pendientes = this.pedidosCache.filter(o => o.estado === 'pendiente').length;
            const completados = this.pedidosCache.filter(o => ['enviado', 'entregado'].includes(o.estado)).length;

            if (document.getElementById('statTotal')) document.getElementById('statTotal').innerText = this.pedidosCache.length;
            if (document.getElementById('statPendientes')) document.getElementById('statPendientes').innerText = pendientes;
            if (document.getElementById('statCompletados')) document.getElementById('statCompletados').innerText = completados;
            if (document.getElementById('orderStats')) document.getElementById('orderStats').style.display = this.pedidosCache.length ? 'grid' : 'none';

            if (!this.pedidosCache.length) {
                ordersList.innerHTML = '<div class="alert alert-info text-center py-4">No hay pedidos registrados</div>';
                return;
            }

            ordersList.innerHTML = this.pedidosCache.map(p => this.renderOrderCard(p, false)).join('');
        } catch (e) {
            console.error(e);
            AdminUI.showToast('❌ Error cargando pedidos', 'error');
        }
    },

    // ------------------------------------------------------------
    // Render de tarjeta de pedido
    // ------------------------------------------------------------
    renderOrderCard(p, isSearchResult = false) {
        const tiendas = (window.AdminApp && AdminApp.tiendasDisponibles) || [];
        const tiendaInfo = tiendas.find(ti => ti.id === p.tienda);
        const telefonoTienda = tiendaInfo?.configuracion?.contacto?.telefono || '';
        const modoNotif = tiendaInfo?.configuracion?.notificaciones_modo || 'admin';

        const badgeClass = p.estado === 'pendiente' ? 'badge-pendiente'
            : p.estado === 'confirmado' ? 'badge-confirmado'
            : p.estado === 'enviado' ? 'badge-enviado'
            : 'badge-entregado';

        const itemsTotal = (p.items || []).length;

        // 🚨 Badge del modo de notificación
        const notifBadge = modoNotif === 'ambos'
            ? '<span class="badge bg-success" title="Admin + WhatsApp"><i class="fas fa-bell"></i> <i class="fab fa-whatsapp"></i> Ambos</span>'
            : modoNotif === 'whatsapp'
                ? '<span class="badge bg-success" title="Solo WhatsApp (sin confirmar)"><i class="fab fa-whatsapp"></i> Solo WhatsApp</span>'
                : '<span class="badge bg-secondary" title="Solo Admin (requiere confirmar)"><i class="fas fa-bell"></i> Solo Admin</span>';

        // 🚨 Badge del contacto (nombre del proveedor/producto)
        const contactoBadge = p.contacto_nombre
            ? `<span class="badge bg-info text-dark ms-1" title="Contacto que atendió el pedido"><i class="fas fa-user-tie"></i> ${this._escape(p.contacto_nombre)}</span>`
            : '';

        // 🚨 Detectar si hay proveedor con WhatsApp distinto al de la tienda
        const tieneProveedor = p.whatsapp_destino
            && p.whatsapp_destino !== telefonoTienda
            && (tiendaInfo?.configuracion?.whatsapp_por_producto === true || p.contacto_origen === 'producto');

        // Botón WhatsApp al cliente
        const waClienteBtn = `<button class="btn btn-whatsapp btn-sm" onclick="AdminOrders.notificarWhatsApp('${this._escape(p.telefono)}', '${this._escape(p.nombre)}', ${p.id}, '${this._escape(p.tienda)}', '${this._escape(p.codigo_cliente || '')}')">
            <i class="fab fa-whatsapp"></i> Cliente
        </button>`;

        // Botón WhatsApp al proveedor (solo si aplica)
        const waProveedorBtn = tieneProveedor
            ? `<button class="order-action-btn wa-prov btn-sm" onclick="AdminOrders.whatsappProveedor(${p.id})" title="Contactar al proveedor del producto">
                <i class="fab fa-whatsapp"></i> Proveedor
               </button>`
            : '';

        return `
        <div class="card order-card ${isSearchResult ? 'search-result-card' : ''}">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
                    <div>
                        <h5 class="fw-bold mb-0">Pedido #${p.id}</h5>
                        <small class="text-muted">${new Date(p.created_at).toLocaleString('es-ES')}</small>
                        ${p.codigo_cliente ? `<span class="codigo-cliente-badge ms-2"><i class="fas fa-qrcode"></i> ${this._escape(p.codigo_cliente)}</span>` : ''}
                    </div>
                    <div class="d-flex align-items-center gap-2 flex-wrap">
                        <span class="badge-status ${badgeClass}">${p.estado}</span>
                        <span class="badge bg-light text-dark">${itemsTotal} ${itemsTotal === 1 ? 'ítem' : 'ítems'}</span>
                        ${notifBadge}
                        ${contactoBadge}
                    </div>
                </div>
                <hr>
                <div class="row mb-3">
                    <div class="col-md-4"><i class="fas fa-user text-primary me-1"></i> <strong>${this._escape(p.nombre)}</strong></div>
                    <div class="col-md-4"><i class="fas fa-phone text-primary me-1"></i> ${this._escape(p.telefono)}</div>
                    <div class="col-md-4"><i class="fas fa-map-marker-alt text-primary me-1"></i> ${this._escape(p.direccion)}</div>
                </div>
                ${p.carnet ? `<div class="mb-2"><i class="fas fa-id-card text-info me-1"></i> Carnet: <strong>${this._escape(p.carnet)}</strong></div>` : ''}
                <div class="bg-light p-3 rounded-3">
                    ${(p.items || []).map(i => `
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <span>
                                <img src="${this._escape(i.imagen || 'https://via.placeholder.com/30')}" style="width:26px;height:26px;border-radius:6px;object-fit:cover;" onerror="this.src='https://via.placeholder.com/30'">
                                ${i.qty}x ${this._escape(i.nombre)}
                            </span>
                            <span class="fw-semibold">$${((i.precio || 0) * (i.qty || 0)).toFixed(2)}</span>
                        </div>
                    `).join('')}
                    <hr class="my-2">
                    <div class="d-flex justify-content-between fw-bold"><span>Total</span><span style="color:var(--primary);">$${parseFloat(p.total || 0).toFixed(2)} ${this._escape(p.moneda || 'CUP')}</span></div>
                    <small class="text-muted d-block mt-1">Pago: ${this._escape(p.metodo_pago || 'Efectivo')}</small>
                </div>
                <div class="d-flex flex-wrap gap-2 mt-3">
                    <select class="form-select form-select-sm w-auto" onchange="AdminOrders.updateOrderStatus(${p.id}, this.value)">
                        <option value="pendiente" ${p.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                        <option value="confirmado" ${p.estado === 'confirmado' ? 'selected' : ''}>Confirmado</option>
                        <option value="enviado" ${p.estado === 'enviado' ? 'selected' : ''}>Enviado</option>
                        <option value="entregado" ${p.estado === 'entregado' ? 'selected' : ''}>Entregado</option>
                    </select>
                    ${waProveedorBtn}
                    ${waClienteBtn}
                    <button class="btn btn-outline-danger btn-sm ms-auto" onclick="AdminOrders.deleteSingleOrder(${p.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>`;
    },

    // ------------------------------------------------------------
    // Buscar por código
    // ------------------------------------------------------------
    async buscarPedidoPorCodigo() {
        const codigoInput = document.getElementById('searchOrderCode');
        const container = document.getElementById('searchResultContainer');
        if (!codigoInput || !container) return;

        const codigo = codigoInput.value.trim().toUpperCase();
        if (!codigo) { AdminUI.showToast('⚠️ Ingresa un código de pedido', 'error'); return; }

        container.style.display = 'block';
        container.innerHTML = '<div class="text-center py-3"><i class="fas fa-spinner fa-spin" style="font-size:1.5rem;color:var(--primary);"></i><p class="mt-2 text-muted">Buscando...</p></div>';

        try {
            const t = document.getElementById('tiendaSelect').value;
            const result = await AdminAPI.buscarPedido(codigo, t);

            if (result.success && result.data && result.data.length > 0) {
                container.innerHTML = `
                    <div class="alert alert-success mb-2">
                        <i class="fas fa-check-circle"></i> <strong>${result.data.length} pedido(s) encontrado(s)</strong>
                        <button class="btn btn-sm btn-outline-secondary float-end" onclick="AdminOrders.limpiarBusquedaPedidos()"><i class="fas fa-times"></i> Cerrar</button>
                    </div>
                    ${result.data.map(p => this.renderOrderCard(p, true)).join('')}
                `;
                AdminUI.showToast(`✅ ${result.data.length} pedido(s) encontrado(s)`);
            } else {
                container.innerHTML = `
                    <div class="alert alert-warning mb-0">
                        <i class="fas fa-exclamation-triangle"></i> No se encontró pedido con código "<strong>${this._escape(codigo)}</strong>".
                        <button class="btn btn-sm btn-outline-secondary float-end" onclick="AdminOrders.limpiarBusquedaPedidos()"><i class="fas fa-times"></i> Cerrar</button>
                    </div>
                `;
                AdminUI.showToast('❌ No se encontró el pedido', 'error');
            }
        } catch (error) {
            container.innerHTML = `<div class="alert alert-danger">Error al buscar el pedido</div>`;
        }
    },

    limpiarBusquedaPedidos() {
        const searchInput = document.getElementById('searchOrderCode');
        const container = document.getElementById('searchResultContainer');
        if (searchInput) searchInput.value = '';
        if (container) { container.style.display = 'none'; container.innerHTML = ''; }
        this.loadOrders();
        AdminUI.showToast('🔍 Búsqueda limpiada');
    },

    // ------------------------------------------------------------
    // WhatsApp al cliente
    // ------------------------------------------------------------
    notificarWhatsApp(telefono, nombre, orderId, tienda, codigoCliente) {
        const tiendas = (window.AdminApp && AdminApp.tiendasDisponibles) || [];
        const tiendaInfo = tiendas.find(t => t.id === tienda);
        const tiendaNombre = tiendaInfo ? tiendaInfo.nombre : (tienda || 'la tienda');

        const numeroLimpio = this.normalizePhone(telefono);
        if (!numeroLimpio) {
            AdminUI.showToast('❌ Teléfono del cliente inválido', 'error');
            return;
        }

        let msg = `Hola ${nombre}, le saludamos de *${tiendaNombre}*. Su pedido *#${orderId}* está siendo procesado.`;
        if (codigoCliente) msg += ` Su código de seguimiento es: *${codigoCliente}*.`;
        msg += ` ¡Gracias por su compra!`;

        window.open(`https://wa.me/${numeroLimpio}?text=${encodeURIComponent(msg)}`, '_blank');
    },

    // ------------------------------------------------------------
    // WhatsApp al proveedor (multi-contacto)
    // ------------------------------------------------------------
    whatsappProveedor(orderId) {
        const o = this.pedidosCache.find(x => x.id == orderId);
        if (!o) {
            AdminUI.showToast('❌ Pedido no encontrado', 'error');
            return;
        }

        const tiendaInfo = (window.AdminApp?.tiendasDisponibles || []).find(t => t.id === o.tienda);
        const tiendaNombre = tiendaInfo?.nombre || o.tienda || 'la tienda';

        const destino = o.whatsapp_destino
            || tiendaInfo?.configuracion?.datos_bancarios?.whatsapp_confirmacion
            || tiendaInfo?.configuracion?.contacto?.telefono
            || '';

        const numeroLimpio = this.normalizePhone(destino);
        if (!numeroLimpio) {
            AdminUI.showToast('❌ Sin WhatsApp de proveedor configurado', 'error');
            return;
        }

        const productos = (o.items || []).map(i => `• ${i.qty}x ${i.nombre} — $${(i.precio * i.qty).toFixed(2)}`).join('\n');
        const contactoLine = o.contacto_nombre ? `\n*Atendido por:* ${o.contacto_nombre}\n` : '';

        const msg = `🚚 *NUEVA VENTA — ${tiendaNombre}*\n${contactoLine}\n*📦 Productos:*\n${productos}\n\n*💰 Total:* $${parseFloat(o.total || 0).toFixed(2)} ${o.moneda || 'CUP'}\n\n*👤 Cliente:* ${o.nombre}\n• Tel: ${o.telefono}\n• Dir: ${o.direccion}${o.carnet ? `\n• Carnet: ${o.carnet}` : ''}\n\n*Pedido:* #${o.id}${o.codigo_cliente ? ` (${o.codigo_cliente})` : ''}`;

        window.open(`https://wa.me/${numeroLimpio}?text=${encodeURIComponent(msg)}`, '_blank');
    },

    // ------------------------------------------------------------
    // Eliminar un pedido (vista por tienda)
    // ------------------------------------------------------------
    async deleteSingleOrder(id) {
        if (!confirm('¿Eliminar este pedido?')) return;
        const t = document.getElementById('tiendaSelect').value;
        try {
            const ok = await AdminAPI.eliminarPedido(id, t);
            if (ok) { await this.loadOrders(); AdminUI.showToast('🗑️ Pedido eliminado'); }
            else { AdminUI.showToast('❌ Error al eliminar', 'error'); }
        } catch (e) { AdminUI.showToast('❌ Error de conexión', 'error'); }
    },

    // ------------------------------------------------------------
    // Eliminar todos los pedidos de la tienda actual
    // ------------------------------------------------------------
    async deleteAllOrders() {
        const t = document.getElementById('tiendaSelect').value;
        if (!confirm('¿Eliminar TODOS los pedidos de esta tienda?')) return;
        if (!confirm('¿Estás completamente seguro? Esta acción no se puede deshacer.')) return;
        try {
            const ok = await AdminAPI.eliminarTodosPedidos(t);
            if (ok) { await this.loadOrders(); AdminUI.showToast('🗑️ Todos los pedidos eliminados'); }
            else { AdminUI.showToast('❌ Error al eliminar', 'error'); }
        } catch (e) { AdminUI.showToast('❌ Error de conexión', 'error'); }
    },

    // ------------------------------------------------------------
    // Actualizar estado del pedido
    // ------------------------------------------------------------
    async updateOrderStatus(id, estado) {
        const t = document.getElementById('tiendaSelect').value;
        try {
            const ok = await AdminAPI.actualizarEstadoPedido(id, t, estado);
            if (ok) {
                await this.loadOrders();
                AdminUI.showToast(`✅ Pedido #${id} actualizado a "${estado}"`);
            } else {
                AdminUI.showToast('❌ Error al actualizar', 'error');
            }
        } catch (e) { AdminUI.showToast('❌ Error de conexión', 'error'); }
    },

    // ------------------------------------------------------------
    // Eliminar un pedido (vista global del admin central)
    // ------------------------------------------------------------
    async eliminarPedidoGlobal(id, tienda, tiendaNombre) {
        if (!confirm(`¿Eliminar el pedido #${id} de "${tiendaNombre}"?`)) return;
        try {
            const ok = await AdminAPI.eliminarPedido(id, tienda);
            if (ok) {
                AdminUI.showToast(`🗑️ Pedido #${id} eliminado`);
                if (typeof loadPedidosGlobal === 'function') await loadPedidosGlobal();
            } else {
                AdminUI.showToast('❌ Error al eliminar', 'error');
            }
        } catch (e) {
            AdminUI.showToast('❌ Error de conexión', 'error');
        }
    },

    // ------------------------------------------------------------
    // Eliminar TODOS los pedidos de una tienda (vista global)
    // ------------------------------------------------------------
    async eliminarTodosPedidosTienda(tienda, tiendaNombre) {
        if (!confirm(`⚠️ ¿Eliminar TODOS los pedidos de "${tiendaNombre}"?\n\nEsta acción NO se puede deshacer.`)) return;
        if (!confirm('¿Estás completamente seguro?')) return;
        try {
            const ok = await AdminAPI.eliminarTodosPedidos(tienda);
            if (ok) {
                AdminUI.showToast(`🗑️ Pedidos de "${tiendaNombre}" eliminados`);
                if (typeof loadPedidosGlobal === 'function') await loadPedidosGlobal();
            } else {
                AdminUI.showToast('❌ Error al eliminar', 'error');
            }
        } catch (e) {
            AdminUI.showToast('❌ Error de conexión', 'error');
        }
    },

    // ------------------------------------------------------------
    // WhatsApp directo al cliente desde vista global (mensaje editable)
    // ------------------------------------------------------------
    whatsappCliente(telefono, nombre, tiendaNombre, orderId) {
        const numeroLimpio = this.normalizePhone(telefono);
        if (!numeroLimpio) {
            AdminUI.showToast('❌ Teléfono inválido', 'error');
            return;
        }
        const msgDefault = `Hola ${nombre}, le saludamos de *${tiendaNombre}*. Nos comunicamos con usted sobre su pedido *#${orderId}*. ¿En qué podemos ayudarle?`;
        const msg = prompt('✏️ Edita el mensaje antes de enviarlo:', msgDefault);
        if (msg === null) return;
        window.open(`https://wa.me/${numeroLimpio}?text=${encodeURIComponent(msg || '')}`, '_blank');
    },

    // ------------------------------------------------------------
    // Polling de nuevos pedidos
    // ------------------------------------------------------------
    startPolling() {
        this.checkForNewOrders();
        if (this.orderCheckInterval) clearInterval(this.orderCheckInterval);
        this.orderCheckInterval = setInterval(() => this.checkForNewOrders(), 10000);
    },

    async checkForNewOrders() {
        if (!AdminAPI.token) return;
        const currentSection = document.querySelector('.nav-item.active')?.dataset?.section;
        if (currentSection === 'orders') return;
        try {
            const t = document.getElementById('tiendaSelect')?.value;
            if (!t) return;
            const orders = await AdminAPI.getPedidos(t);
            if (orders.length > this.lastOrderCount && this.lastOrderCount > 0) {
                const newOrders = orders.length - this.lastOrderCount;
                const indicator = document.getElementById('newOrderIndicator');
                if (indicator) indicator.classList.add('active');
                AdminUI.showToast(`🔔 ${newOrders} nuevo(s) pedido(s) recibido(s)`, 'success');
            }
            this.lastOrderCount = orders.length;
        } catch (e) { /* silent */ }
    },

    // ------------------------------------------------------------
    // Helper: escapar HTML
    // ------------------------------------------------------------
    _escape(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
};