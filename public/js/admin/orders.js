window.AdminOrders = {
    lastOrderCount: 0,
    orderCheckInterval: null,

    async loadOrders() {
        document.getElementById('searchResultContainer').style.display = 'none';
        document.getElementById('searchResultContainer').innerHTML = '';
        const t = document.getElementById('tiendaSelect').value;
        if (!t) {
            document.getElementById('ordersList').innerHTML = '<div class="alert alert-info text-center py-4">Selecciona una tienda</div>';
            document.getElementById('orderStats').style.display = 'none';
            return;
        }
        try {
            const orders = await AdminAPI.getPedidos(t);
            this.lastOrderCount = orders.length;
            document.getElementById('orderCount').innerText = `${orders.length} pedidos`;
            const pendientes = orders.filter(o => o.estado === 'pendiente').length;
            const completados = orders.filter(o => ['enviado', 'entregado'].includes(o.estado)).length;
            document.getElementById('statTotal').innerText = orders.length;
            document.getElementById('statPendientes').innerText = pendientes;
            document.getElementById('statCompletados').innerText = completados;
            document.getElementById('orderStats').style.display = orders.length ? 'grid' : 'none';
            if (!orders.length) {
                document.getElementById('ordersList').innerHTML = '<div class="alert alert-info text-center py-4">No hay pedidos registrados</div>';
                return;
            }
            document.getElementById('ordersList').innerHTML = orders.map(p => this.renderOrderCard(p, false)).join('');
        } catch (e) {
            AdminUI.showToast('❌ Error cargando pedidos', 'error');
        }
    },

    renderOrderCard(p, isSearchResult = false) {
        const tiendas = AdminApp.tiendasDisponibles;
        const tiendaInfo = tiendas.find(ti => ti.id === p.tienda);
        const telefonoTienda = tiendaInfo?.configuracion?.contacto?.telefono || '+53 5XXXXXXX';
        const badgeClass = p.estado === 'pendiente' ? 'badge-pendiente' :
                          p.estado === 'confirmado' ? 'badge-confirmado' :
                          p.estado === 'enviado' ? 'badge-enviado' : 'badge-entregado';
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
                    ${(p.items || []).map(i => `
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <span><img src="${i.imagen || 'https://via.placeholder.com/30'}" style="width:26px;height:26px;border-radius:6px;object-fit:cover;"> ${i.qty}x ${i.nombre}</span>
                            <span class="fw-semibold">$${((i.precio || 0) * (i.qty || 0)).toFixed(2)}</span>
                        </div>
                    `).join('')}
                    <hr class="my-2">
                    <div class="d-flex justify-content-between fw-bold">
                        <span>Total</span>
                        <span style="color:var(--primary);">$${parseFloat(p.total).toFixed(2)} ${p.moneda || 'CUP'}</span>
                    </div>
                    <small class="text-muted d-block mt-1">Pago: ${p.metodo_pago || 'Efectivo'}</small>
                </div>
                <div class="d-flex flex-wrap gap-2 mt-3">
                    <select class="form-select form-select-sm w-auto" onchange="AdminOrders.updateOrderStatus(${p.id}, this.value)">
                        <option value="pendiente" ${p.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                        <option value="confirmado" ${p.estado === 'confirmado' ? 'selected' : ''}>Confirmado</option>
                        <option value="enviado" ${p.estado === 'enviado' ? 'selected' : ''}>Enviado</option>
                        <option value="entregado" ${p.estado === 'entregado' ? 'selected' : ''}>Entregado</option>
                    </select>
                    <button class="btn btn-whatsapp btn-sm" onclick="AdminOrders.notificarWhatsApp('${telefonoTienda}', '${p.nombre}', ${p.id}, '${p.tienda}', '${p.codigo_cliente || ''}')">
                        <i class="fab fa-whatsapp"></i> Notificar
                    </button>
                    <button class="btn btn-outline-danger btn-sm ms-auto" onclick="AdminOrders.deleteSingleOrder(${p.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>`;
    },

    async buscarPedidoPorCodigo() {
        const codigo = document.getElementById('searchOrderCode').value.trim().toUpperCase();
        const container = document.getElementById('searchResultContainer');
        if (!codigo) { AdminUI.showToast('⚠️ Ingresa un código', 'error'); return; }
        container.style.display = 'block';
        container.innerHTML = '<div class="text-center py-3"><i class="fas fa-spinner fa-spin"></i> Buscando...</div>';
        try {
            const t = document.getElementById('tiendaSelect').value;
            const result = await AdminAPI.buscarPedido(codigo, t);
            if (result.success && result.data.length > 0) {
                container.innerHTML = `<div class="alert alert-success mb-2"><strong>${result.data.length} pedido(s) encontrado(s)</strong></div>` +
                    result.data.map(p => this.renderOrderCard(p, true)).join('');
                AdminUI.showToast(`✅ ${result.data.length} pedido(s) encontrado(s)`);
            } else {
                container.innerHTML = `<div class="alert alert-warning mb-0">No se encontró pedido con código "${codigo}"</div>`;
                AdminUI.showToast('❌ No se encontró el pedido', 'error');
            }
        } catch (error) {
            container.innerHTML = `<div class="alert alert-danger">Error al buscar</div>`;
        }
    },

    limpiarBusquedaPedidos() {
        document.getElementById('searchOrderCode').value = '';
        document.getElementById('searchResultContainer').style.display = 'none';
        this.loadOrders();
        AdminUI.showToast('🔍 Búsqueda limpiada');
    },

    notificarWhatsApp(telefono, nombre, orderId, tienda, codigoCliente) {
        const tiendaInfo = AdminApp.tiendasDisponibles.find(t => t.id === tienda);
        const tiendaNombre = tiendaInfo ? tiendaInfo.nombre : 'Tienda';
        let msg = `Hola ${nombre}, gracias por contactarnos. Usted ha realizado el pedido #${orderId} en ${tiendaNombre}.`;
        if (codigoCliente) msg += ` Su código es: ${codigoCliente}.`;
        msg += ` En breve recibirá su domicilio. ¡Gracias!`;
        window.open(`https://wa.me/${telefono.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
    },

    async updateOrderStatus(id, estado) {
        const t = document.getElementById('tiendaSelect').value;
        if (await AdminAPI.actualizarEstadoPedido(id, t, estado)) {
            await this.loadOrders();
            AdminUI.showToast(`✅ Pedido #${id} actualizado a "${estado}"`);
        } else {
            AdminUI.showToast('❌ Error al actualizar', 'error');
        }
    },

    async deleteSingleOrder(id) {
        if (!confirm('¿Eliminar este pedido?')) return;
        const t = document.getElementById('tiendaSelect').value;
        if (await AdminAPI.eliminarPedido(id, t)) {
            await this.loadOrders();
            AdminUI.showToast('🗑️ Pedido eliminado');
        } else {
            AdminUI.showToast('❌ Error al eliminar', 'error');
        }
    },

    async deleteAllOrders() {
        const t = document.getElementById('tiendaSelect').value;
        if (!confirm('¿Eliminar TODOS los pedidos?')) return;
        if (await AdminAPI.eliminarTodosPedidos(t)) {
            await this.loadOrders();
            AdminUI.showToast('🗑️ Todos los pedidos eliminados');
        } else {
            AdminUI.showToast('❌ Error al eliminar', 'error');
        }
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
            const t = document.getElementById('tiendaSelect').value;
            if (!t) return;
            const orders = await AdminAPI.getPedidos(t);
            if (orders.length > this.lastOrderCount && this.lastOrderCount > 0) {
                const n = orders.length - this.lastOrderCount;
                document.getElementById('newOrderIndicator').classList.add('active');
                AdminUI.showToast(`🔔 ${n} nuevo(s) pedido(s) recibido(s)`, 'success');
            }
            this.lastOrderCount = orders.length;
        } catch (e) {}
    }
};