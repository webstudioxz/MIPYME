// ============================================================
// public/js/admin/orders.js
// ============================================================

window.AdminOrders = {
    lastOrderCount: 0,
    orderCheckInterval: null,

    async loadOrders() {
        const searchContainer = document.getElementById('searchResultContainer');
        if (searchContainer) { searchContainer.style.display = 'none'; searchContainer.innerHTML = ''; }
        const t = document.getElementById('tiendaSelect')?.value;
        const ordersList = document.getElementById('ordersList');
        
        if (!t || !ordersList) {
            if (ordersList) ordersList.innerHTML = '<div class="alert alert-info text-center py-4">Selecciona una tienda</div>';
            const stats = document.getElementById('orderStats'); if (stats) stats.style.display = 'none';
            return;
        }
        try {
            const orders = await AdminAPI.getPedidos(t);
            this.lastOrderCount = orders.length;
            const countEl = document.getElementById('orderCount'); if (countEl) countEl.innerText = `${orders.length} pedidos`;
            const pendientes = orders.filter(o => o.estado === 'pendiente').length;
            const completados = orders.filter(o => ['enviado', 'entregado'].includes(o.estado)).length;
            if (document.getElementById('statTotal')) document.getElementById('statTotal').innerText = orders.length;
            if (document.getElementById('statPendientes')) document.getElementById('statPendientes').innerText = pendientes;
            if (document.getElementById('statCompletados')) document.getElementById('statCompletados').innerText = completados;
            if (document.getElementById('orderStats')) document.getElementById('orderStats').style.display = orders.length ? 'grid' : 'none';
            if (!orders.length) { ordersList.innerHTML = '<div class="alert alert-info text-center py-4">No hay pedidos registrados</div>'; return; }
            ordersList.innerHTML = orders.map(p => this.renderOrderCard(p, false)).join('');
        } catch (e) { AdminUI.showToast('❌ Error cargando pedidos', 'error'); }
    },

    renderOrderCard(p, isSearchResult = false) {
        const tiendas = AdminApp.tiendasDisponibles || [];
        const tiendaInfo = tiendas.find(ti => ti.id === p.tienda);
        const telefonoTienda = tiendaInfo?.configuracion?.contacto?.telefono || '+53 5XXXXXXX';
        const badgeClass = p.estado === 'pendiente' ? 'badge-pendiente' : p.estado === 'confirmado' ? 'badge-confirmado' : p.estado === 'enviado' ? 'badge-enviado' : 'badge-entregado';
        const itemsTotal = (p.items || []).length;

        return `
        <div class="card order-card ${isSearchResult ? 'search-result-card' : ''}">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
                    <div>
                        <h5 class="fw-bold mb-0">Pedido #${p.id}</h5>
                        <small class="text-muted">${new Date(p.created_at).toLocaleString()}</small>
                        ${p.codigo_cliente ? `<span class="codigo-cliente-badge ms-2"><i class="fas fa-qrcode"></i> ${p.codigo_cliente}</span>` : ''}
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="badge-status ${badgeClass}">${p.estado}</span>
                        <span class="badge bg-light text-dark">${itemsTotal} ${itemsTotal === 1 ? 'ítem' : 'ítems'}</span>
                    </div>
                </div>
                <hr>
                <div class="row mb-3">
                    <div class="col-md-4"><i class="fas fa-user text-primary me-1"></i> <strong>${p.nombre}</strong></div>
                    <div class="col-md-4"><i class="fas fa-phone text-primary me-1"></i> ${p.telefono}</div>
                    <div class="col-md-4"><i class="fas fa-map-marker-alt text-primary me-1"></i> ${p.direccion}</div>
                </div>
                <div class="bg-light p-3 rounded-3">
                    ${(p.items || []).map(i => `<div class="d-flex justify-content-between align-items-center mb-1"><span><img src="${i.imagen || 'https://via.placeholder.com/30'}" style="width:26px;height:26px;border-radius:6px;object-fit:cover;"> ${i.qty}x ${i.nombre}</span><span class="fw-semibold">$${((i.precio || 0) * (i.qty || 0)).toFixed(2)}</span></div>`).join('')}
                    <hr class="my-2">
                    <div class="d-flex justify-content-between fw-bold"><span>Total</span><span style="color:var(--primary);">$${parseFloat(p.total).toFixed(2)} ${p.moneda || 'CUP'}</span></div>
                    <small class="text-muted d-block mt-1">Pago: ${p.metodo_pago || 'Efectivo'}</small>
                </div>
                <div class="d-flex flex-wrap gap-2 mt-3">
                    <select class="form-select form-select-sm w-auto" onchange="AdminOrders.updateOrderStatus(${p.id}, this.value)">
                        <option value="pendiente" ${p.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                        <option value="confirmado" ${p.estado === 'confirmado' ? 'selected' : ''}>Confirmado</option>
                        <option value="enviado" ${p.estado === 'enviado' ? 'selected' : ''}>Enviado</option>
                        <option value="entregado" ${p.estado === 'entregado' ? 'selected' : ''}>Entregado</option>
                    </select>
                    <button class="btn btn-whatsapp btn-sm" onclick="AdminOrders.notificarWhatsApp('${telefonoTienda}', '${p.nombre}', ${p.id}, '${p.tienda}', '${p.codigo_cliente || ''}')"><i class="fab fa-whatsapp"></i> Notificar</button>
                    <button class="btn btn-outline-danger btn-sm ms-auto" onclick="AdminOrders.deleteSingleOrder(${p.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>`;
    },

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
                container.innerHTML = `<div class="alert alert-success mb-2"><i class="fas fa-check-circle"></i> <strong>${result.data.length} pedido(s) encontrado(s)</strong><button class="btn btn-sm btn-outline-secondary float-end" onclick="AdminOrders.limpiarBusquedaPedidos()"><i class="fas fa-times"></i> Cerrar</button></div>${result.data.map(p => this.renderOrderCard(p, true)).join('')}`;
                AdminUI.showToast(`✅ ${result.data.length} pedido(s) encontrado(s)`);
            } else {
                container.innerHTML = `<div class="alert alert-warning mb-0"><i class="fas fa-exclamation-triangle"></i> No se encontró pedido con código "<strong>${codigo}</strong>".<button class="btn btn-sm btn-outline-secondary float-end" onclick="AdminOrders.limpiarBusquedaPedidos()"><i class="fas fa-times"></i> Cerrar</button></div>`;
                AdminUI.showToast('❌ No se encontró el pedido', 'error');
            }
        } catch (error) { container.innerHTML = `<div class="alert alert-danger">Error al buscar el pedido</div>`; }
    },

    limpiarBusquedaPedidos() {
        const searchInput = document.getElementById('searchOrderCode');
        const container = document.getElementById('searchResultContainer');
        if (searchInput) searchInput.value = '';
        if (container) { container.style.display = 'none'; container.innerHTML = ''; }
        this.loadOrders();
        AdminUI.showToast('🔍 Búsqueda limpiada');
    },

    // 🚨 MEJORADO: limpiar y formatear número cubano
    notificarWhatsApp(telefono, nombre, orderId, tienda, codigoCliente) {
        const tiendaInfo = (AdminApp.tiendasDisponibles || []).find(t => t.id === tienda);
        const tiendaNombre = tiendaInfo ? tiendaInfo.nombre : (tienda || 'la tienda');

        let numeroLimpio = String(telefono || '').replace(/\D/g, '');
        if (numeroLimpio.length === 8 && numeroLimpio.startsWith('5')) {
            numeroLimpio = '53' + numeroLimpio;
        } else if (numeroLimpio.length === 10 && numeroLimpio.startsWith('53')) {
            // ya tiene código país
        }

        let msg = `Hola ${nombre}, le saludamos de *${tiendaNombre}*. Su pedido *#${orderId}* está siendo procesado.`;
        if (codigoCliente) msg += ` Su código de seguimiento es: *${codigoCliente}*.`;
        msg += ` ¡Gracias por su compra!`;

        window.open(`https://wa.me/${numeroLimpio}?text=${encodeURIComponent(msg)}`, '_blank');
    },

    // 🚨 NUEVO: elimina un pedido desde la vista global
    async eliminarPedidoGlobal(id, tienda, tiendaNombre) {
        if (!confirm(`¿Eliminar el pedido #${id} de "${tiendaNombre}"?`)) return;
        try {
            const ok = await AdminAPI.eliminarPedido(id, tienda);
            if (ok) {
                AdminUI.showToast(`🗑️ Pedido #${id} eliminado`);
                await loadPedidosGlobal();
            } else {
                AdminUI.showToast('❌ Error al eliminar', 'error');
            }
        } catch (e) {
            AdminUI.showToast('❌ Error de conexión', 'error');
        }
    },

    // 🚨 NUEVO: elimina TODOS los pedidos de una tienda desde la vista global
    async eliminarTodosPedidosTienda(tienda, tiendaNombre) {
        if (!confirm(`⚠️ ¿Eliminar TODOS los pedidos de "${tiendaNombre}"?\n\nEsta acción NO se puede deshacer.`)) return;
        if (!confirm('¿Estás completamente seguro?')) return;
        try {
            const ok = await AdminAPI.eliminarTodosPedidos(tienda);
            if (ok) {
                AdminUI.showToast(`🗑️ Pedidos de "${tiendaNombre}" eliminados`);
                await loadPedidosGlobal();
            } else {
                AdminUI.showToast('❌ Error al eliminar', 'error');
            }
        } catch (e) {
            AdminUI.showToast('❌ Error de conexión', 'error');
        }
    },

    // 🚨 NUEVO: WhatsApp directo al cliente (con mensaje editable)
    whatsappCliente(telefono, nombre, tiendaNombre, orderId) {
        let numeroLimpio = String(telefono || '').replace(/\D/g, '');
        if (numeroLimpio.length === 8 && numeroLimpio.startsWith('5')) {
            numeroLimpio = '53' + numeroLimpio;
        } else if (numeroLimpio.length === 10 && numeroLimpio.startsWith('53')) {
            // ya tiene código país
        }
        const msgDefault = `Hola ${nombre}, le saludamos de *${tiendaNombre}*. Nos comunicamos con usted sobre su pedido *#${orderId}*. ¿En qué podemos ayudarle?`;
        const msg = prompt('✏️ Edita el mensaje antes de enviarlo:', msgDefault);
        if (msg === null) return; // cancelado
        window.open(`https://wa.me/${numeroLimpio}?text=${encodeURIComponent(msg || '')}`, '_blank');
    },

    async updateOrderStatus(id, estado) {
        const t = document.getElementById('tiendaSelect').value;
        try {
            const ok = await AdminAPI.actualizarEstadoPedido(id, t, estado);
            if (ok) { await this.loadOrders(); AdminUI.showToast(`✅ Pedido #${id} actualizado a "${estado}"`); }
            else { AdminUI.showToast('❌ Error al actualizar', 'error'); }
        } catch (e) { AdminUI.showToast('❌ Error de conexión', 'error'); }
    },

    async deleteSingleOrder(id) {
        if (!confirm('¿Eliminar este pedido?')) return;
        const t = document.getElementById('tiendaSelect').value;
        try {
            const ok = await AdminAPI.eliminarPedido(id, t);
            if (ok) { await this.loadOrders(); AdminUI.showToast('🗑️ Pedido eliminado'); }
            else { AdminUI.showToast('❌ Error al eliminar', 'error'); }
        } catch (e) { AdminUI.showToast('❌ Error de conexión', 'error'); }
    },

    async deleteAllOrders() {
        const t = document.getElementById('tiendaSelect').value;
        if (!confirm('¿Eliminar TODOS los pedidos de esta tienda?')) return;
        try {
            const ok = await AdminAPI.eliminarTodosPedidos(t);
            if (ok) { await this.loadOrders(); AdminUI.showToast('🗑️ Todos los pedidos eliminados'); }
            else { AdminUI.showToast('❌ Error al eliminar', 'error'); }
        } catch (e) { AdminUI.showToast('❌ Error de conexión', 'error'); }
    },

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
        } catch (e) {}
    }
};