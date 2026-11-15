// ============================================================
// public/js/admin/cliente.js — Lógica del panel del dueño de tienda
// ============================================================

window.AdminCliente = {
    myStore: null,
    myProducts: [],
    pedidosGlobales: [],
    reservasGlobales: [],
    isReservaStore: false,
    currentUser: null,

    async init() {
        // 1. Verificar sesión con Supabase (igual que antes)
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session || !session.user) {
            document.getElementById('loader').innerHTML = '<p class="text-danger">Inicia sesión con Google.</p>';
            setTimeout(() => window.location.href = '/', 2000);
            return;
        }
        this.currentUser = session.user;

        const urlParams = new URLSearchParams(window.location.search);
        const tiendaSlug = urlParams.get('tienda');
        
        try {
            let storeData = null;
            if (tiendaSlug) {
                const res = await fetch(`/api/mi-tienda?slug=${tiendaSlug}`);
                const data = await res.json();
                if (data.success) storeData = data.store;
            } else {
                const res = await fetch(`/api/mi-tienda?owner_id=${this.currentUser.id}`);
                const data = await res.json();
                if (data.success) storeData = data.store;
            }
            if (!storeData) { alert('Sin acceso'); window.location.href = '/'; return; }
            
            this.myStore = storeData;
            this.isReservaStore = this.myStore.configuracion?.tipo === 'reserva';
            
            // Llenar datos en el DOM
            document.getElementById('nombreTiendaSidebar').innerText = this.myStore.nombre;
            document.getElementById('btnVerTienda').href = `/?tienda=${this.myStore.id}`;
            
            if (this.isReservaStore) {
                document.getElementById('navIconProductos').className = 'fas fa-concierge-bell';
                document.getElementById('navTextProductos').innerText = 'Servicios';
                document.getElementById('titleProductos').innerText = 'Mis Servicios';
                document.getElementById('btnNuevoProducto').innerText = 'Nuevo Servicio';
                document.getElementById('modalProductoTitleText').innerText = 'Nuevo Servicio';
                document.getElementById('cardGestorVenta').style.display = 'none';
                document.getElementById('navPedidos').style.display = 'none';
                document.getElementById('navReservas').style.display = 'flex';
                document.getElementById('divImagenesServicio').style.display = 'block';
                document.getElementById('cardHorario').style.display = 'block';
                document.getElementById('groupDescuento').style.display = 'none';
                document.getElementById('groupRequiereCarnet').style.display = 'none';
                this.cargarHorario();
            }

            const permitirWhatsApp = this.myStore.configuracion?.whatsapp_por_producto === true;
            document.getElementById('groupWhatsappProveedor').style.display = permitirWhatsApp ? 'block' : 'none';
            document.getElementById('groupImagenProveedor').style.display = permitirWhatsApp ? 'block' : 'none';

            const baseUrl = window.location.origin;
            document.getElementById('miUrlTienda').value = `${baseUrl}/?tienda=${this.myStore.id}`;
            document.getElementById('miUrlAdmin').value = `${baseUrl}/admin-cliente?tienda=${this.myStore.id}`;
            document.getElementById('badgePlan').innerText = (this.myStore.plan || 'prueba').toUpperCase();
            document.getElementById('maxProductos').innerText = `${this.myStore.max_productos || 10} productos`;
            document.getElementById('fechaVencimiento').innerText = this.myStore.fecha_vencimiento ? new Date(this.myStore.fecha_vencimiento).toLocaleDateString() : 'Sin fecha';

            this.actualizarEstadoPausa();
            this.actualizarBadgeEstado();
            this.cargarGestorDesdeStore();
            this.cargarConfiguracionTienda();
            this.cargarNotificaciones();

            if (this.myStore.pausada === true && this.myStore.pausada_por === 'admin') {
                const banner = document.getElementById('bannerAdminPaused');
                banner.style.display = 'flex';
                banner.className = 'banner-admin-paused';
                banner.innerHTML = `<i class="fas fa-exclamation-triangle"></i><div><strong>Tu tienda está pausada por el administrador</strong><small>Motivo: ${(this.myStore.pausada_mensaje || 'Contacta con soporte').replace(/</g,'&lt;')}</small></div>`;
            } else if (this.myStore.pausada === true && this.myStore.pausada_por === 'owner') {
                const banner = document.getElementById('bannerAdminPaused');
                banner.style.display = 'flex';
                banner.className = 'banner-admin-paused';
                banner.style.background = 'linear-gradient(135deg,#F59E0B,#D97706)';
                banner.innerHTML = `<i class="fas fa-pause-circle"></i><div><strong>Tu tienda está pausada</strong><small>Mensaje público: "${(this.myStore.pausada_mensaje || 'Volvemos pronto').replace(/</g,'&lt;')}"</small></div>`;
            }

            if (window.AdminNotifications) AdminNotifications.init().catch(console.error);
            
            document.getElementById('loader').style.display = 'none';
            document.getElementById('app').style.display = 'block';
            await this.cargarProductos();
            
            this.setupEventListeners();

        } catch (e) { console.error(e); window.location.href = '/'; }
    },

    setupEventListeners() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const mobileBtn = document.getElementById('mobileMenuBtn');

        mobileBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
            document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        });
    },

    cambiarSeccion(section, btn) {
        ['products', 'orders', 'reservas', 'settings'].forEach(s => {
            const el = document.getElementById(`view-${s}`);
            if (el) el.style.display = s === section ? 'block' : 'none';
        });
        
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        
        if (section === 'orders') this.cargarPedidos();
        if (section === 'reservas') this.cargarReservas();
        if (window.innerWidth < 992) {
            document.getElementById('sidebar').classList.remove('active');
            document.getElementById('sidebarOverlay').classList.remove('active');
            document.body.style.overflow = '';
        }
    },

    // --- Productos ---
    async cargarProductos() {
        const res = await fetch(`/api/mis-productos?tienda=${this.myStore.id}`);
        this.myProducts = await res.json();
        const tbody = document.getElementById('productsList');
        if (!this.myProducts.length) { tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No hay registros.</td></tr>'; return; }
        tbody.innerHTML = this.myProducts.map(p => `
            <tr>
                <td><img src="${p.imagen || 'https://via.placeholder.com/40'}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;"></td>
                <td class="fw-semibold">${p.nombre}</td>
                <td>$${parseFloat(p.precio).toFixed(2)}</td>
                <td><span class="badge bg-light text-dark">${p.categoria || 'otros'}</span></td>
                <td>${p.contacto_nombre ? `<span class="badge bg-info text-dark"><i class="fas fa-user"></i> ${p.contacto_nombre}</span>` : '<span class="text-muted small">—</span>'}</td>
                <td>${p.disponible ? '<span class="badge bg-success">OK</span>' : '<span class="badge bg-danger">Agotado</span>'}</td>
                <td style="text-align:right;">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="AdminCliente.abrirModalProducto(${p.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="AdminCliente.eliminarProducto(${p.id})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    },

    abrirModalProducto(id = null) {
        const modal = new bootstrap.Modal(document.getElementById('productoModal'));
        const titleText = document.getElementById('modalProductoTitleText');
        document.getElementById('prodId').value = '';
        document.getElementById('prodName').value = '';
        document.getElementById('prodDesc').value = '';
        document.getElementById('prodPrice').value = '';
        document.getElementById('prodDiscount').value = '0';
        document.getElementById('prodImage').value = '';
        document.getElementById('prodImageProveedor').value = '';
        document.getElementById('prodWhatsAppProveedor').value = '';
        document.getElementById('prodContactoNombre').value = '';
        document.getElementById('prodRequiereCarnet').checked = false;
        document.getElementById('prodImagenesServicio').value = '';

        const permitirWhatsApp = this.myStore.configuracion?.whatsapp_por_producto === true;
        document.getElementById('groupWhatsappProveedor').style.display = permitirWhatsApp ? 'block' : 'none';
        document.getElementById('groupImagenProveedor').style.display = permitirWhatsApp ? 'block' : 'none';

        const cats = this.myStore.categorias || ['otros'];
        document.getElementById('prodCategory').innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');

        if (id) {
            const p = this.myProducts.find(x => x.id == id);
            if (!p) return;
            titleText.innerText = this.isReservaStore ? 'Editar Servicio' : 'Editar Producto';
            document.getElementById('prodId').value = p.id;
            document.getElementById('prodName').value = p.nombre;
            document.getElementById('prodDesc').value = p.descripcion || '';
            document.getElementById('prodPrice').value = p.precio;
            document.getElementById('prodDiscount').value = p.descuento || 0;
            document.getElementById('prodImage').value = p.imagen || '';
            document.getElementById('prodImageProveedor').value = p.imagen_proveedor || '';
            document.getElementById('prodWhatsAppProveedor').value = p.whatsapp_proveedor || '';
            document.getElementById('prodContactoNombre').value = p.contacto_nombre || '';
            document.getElementById('prodRequiereCarnet').checked = p.requiere_carnet === true;
            document.getElementById('prodCategory').value = p.categoria || 'otros';
            if (this.isReservaStore && Array.isArray(p.imagenes_servicio) && p.imagenes_servicio.length > 0) {
                document.getElementById('prodImagenesServicio').value = p.imagenes_servicio.join('\n');
            }
        } else {
            const lim = this.myStore.max_productos || 10;
            if (this.myProducts.length >= lim) { alert(`Límite ${lim} alcanzado`); return; }
            titleText.innerText = this.isReservaStore ? 'Nuevo Servicio' : 'Nuevo Producto';
        }
        modal.show();
    },

    async guardarProducto() {
        const id = document.getElementById('prodId').value;
        const nombre = document.getElementById('prodName').value.trim();
        const precio = parseFloat(document.getElementById('prodPrice').value);
        if (!nombre || !precio || precio <= 0) { alert('Nombre y precio obligatorios'); return; }

        let imagenesServicio = [];
        if (this.isReservaStore) {
            const lineas = document.getElementById('prodImagenesServicio').value.split('\n');
            imagenesServicio = lineas.map(u => u.trim()).filter(u => u.length > 5);
            if (imagenesServicio.length > 0 && (imagenesServicio.length < 3 || imagenesServicio.length > 6)) {
                alert('Ingresa entre 3 y 6 imágenes');
                return;
            }
        }

        const permitirWhatsApp = this.myStore.configuracion?.whatsapp_por_producto === true;

        const payload = {
            tienda: this.myStore.id, owner_id: this.currentUser.id,
            nombre, descripcion: document.getElementById('prodDesc').value,
            precio,
            descuento: this.isReservaStore ? 0 : (parseInt(document.getElementById('prodDiscount').value) || 0),
            categoria: document.getElementById('prodCategory').value,
            imagen: document.getElementById('prodImage').value || 'https://via.placeholder.com/300',
            disponible: true,
            imagenes_servicio: this.isReservaStore ? imagenesServicio : [],
            contacto_nombre: document.getElementById('prodContactoNombre').value.trim() || null
        };

        if (permitirWhatsApp) {
            payload.whatsapp_proveedor = document.getElementById('prodWhatsAppProveedor').value.trim() || null;
            payload.imagen_proveedor = document.getElementById('prodImageProveedor').value.trim() || null;
            payload.requiere_carnet = document.getElementById('prodRequiereCarnet').checked;
        } else {
            payload.whatsapp_proveedor = null;
            payload.imagen_proveedor = null;
            payload.requiere_carnet = false;
        }

        try {
            let res;
            if (id) {
                const r = await fetch(`/api/mis-productos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                res = { ok: r.ok, data: await r.json() };
            } else {
                const r = await fetch('/api/mis-productos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                res = { ok: r.ok, data: await r.json() };
            }
            if (res.ok) {
                bootstrap.Modal.getInstance(document.getElementById('productoModal')).hide();
                await this.cargarProductos();
            } else {
                alert('❌ ' + (res.data?.error || 'Error'));
            }
        } catch { alert('❌ Error de conexión'); }
    },

    async eliminarProducto(id) {
        if (!confirm('¿Eliminar?')) return;
        await fetch(`/api/mis-productos/${id}`, { method: 'DELETE' });
        await this.cargarProductos();
    },

    async agregarCategoria() {
        const nueva = prompt('Nueva categoría:');
        if (!nueva || !nueva.trim()) return;
        const cat = nueva.trim().toLowerCase();
        if (this.myStore.categorias?.includes(cat)) { alert('Ya existe'); return; }
        const cats = this.myStore.categorias || ['otros'];
        cats.push(cat);
        try {
            const res = await fetch('/api/mi-tienda/categorias', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ owner_id: this.currentUser.id, slug: this.myStore.id, categorias: cats })
            });
            if (!res.ok) throw new Error();
            this.myStore.categorias = cats;
            document.getElementById('prodCategory').innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
            document.getElementById('prodCategory').value = cat;
            alert('✅ Agregada');
        } catch { alert('Error'); }
    },

    async eliminarCategoria() {
        const select = document.getElementById('prodCategory');
        const cat = select.value;
        if (!cat || cat === 'otros') { alert('No puedes eliminar "otros"'); return; }
        if (!confirm(`¿Eliminar "${cat}"?`)) return;
        const cats = this.myStore.categorias.filter(c => c !== cat);
        try {
            const res = await fetch('/api/mi-tienda/categorias', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ owner_id: this.currentUser.id, slug: this.myStore.id, categorias: cats })
            });
            if (!res.ok) throw new Error();
            await window.supabaseClient.from('products').update({ categoria: 'otros' }).eq('tienda', this.myStore.id).eq('categoria', cat);
            this.myStore.categorias = cats;
            select.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
            alert('✅ Eliminada');
            await this.cargarProductos();
        } catch { alert('Error'); }
    },

    // --- Reservas ---
    async cargarReservas() {
        const res = await fetch(`/api/reservas?tienda=${this.myStore.id}`);
        this.reservasGlobales = await res.json();
        this.filtrarReservas();
    },

    filtrarReservas() {
        const q = (document.getElementById('searchReserva')?.value || '').toLowerCase().trim();
        const filtradas = this.reservasGlobales.filter(r => {
            const n = (r.cliente_nombre || '').toLowerCase();
            const f = (r.fecha || '').toLowerCase();
            const s = (r.producto?.nombre || '').toLowerCase();
            return n.includes(q) || f.includes(q) || s.includes(q);
        });
        this.renderizarReservas(filtradas);
    },

    renderizarReservas(reservas) {
        const c = document.getElementById('reservasList');
        if (!reservas.length) { c.innerHTML = '<div class="alert alert-info text-center py-4">No hay reservas.</div>'; return; }
        c.innerHTML = reservas.map(r => {
            const prod = r.producto || {};
            const img = prod.imagen || (Array.isArray(prod.imagenes_servicio) && prod.imagenes_servicio[0]) || 'https://via.placeholder.com/90';
            const srv = prod.nombre || 'Servicio';
            const est = r.estado === 'confirmado';
            const fecha = r.fecha ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '—';
            return `
            <div class="reserva-card ${est ? 'confirmado' : ''}">
                <img src="${img}" class="reserva-img">
                <div style="flex:1;min-width:200px;">
                    <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
                        <div><h5 class="fw-bold m-0">${srv}</h5><small class="text-muted">Reserva #${r.id}</small></div>
                        <span class="badge ${est ? 'bg-success' : 'bg-warning text-dark'} text-uppercase">${r.estado}</span>
                    </div>
                    <div class="row g-2 small mb-2">
                        <div class="col-md-6"><i class="fas fa-user text-primary me-1"></i> <strong>${r.cliente_nombre}</strong></div>
                        <div class="col-md-6"><i class="fas fa-phone text-primary me-1"></i> ${r.cliente_telefono}</div>
                        <div class="col-md-6"><i class="fas fa-calendar text-primary me-1"></i> ${fecha}</div>
                        <div class="col-md-6"><i class="fas fa-clock text-primary me-1"></i> ${r.hora}</div>
                    </div>
                    <div class="d-flex gap-2 flex-wrap border-top pt-2">
                        ${!est ? `<button class="btn btn-sm btn-success" onclick="AdminCliente.confirmarReserva(${r.id})"><i class="fas fa-check"></i> Confirmar y Notificar</button>` : `<span class="text-success small fw-bold"><i class="fas fa-check-circle"></i> Confirmada</span>`}
                        <button class="btn btn-sm btn-outline-danger" onclick="AdminCliente.eliminarReserva(${r.id})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    async confirmarReserva(id) {
        if (!confirm('¿Confirmar y notificar al cliente?')) return;
        try {
            const res = await fetch(`/api/reservas/${id}/confirmar`, { method: 'PUT' });
            if (!res.ok) throw new Error();
            const r = this.reservasGlobales.find(x => x.id == id);
            if (r) {
                const prod = r.producto || {};
                const tienda = this.myStore.nombre || this.myStore.id;
                const tel = this.normalizePhone(r.cliente_telefono);
                const f = r.fecha ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : r.fecha;
                const msg = `✅ *Reserva Confirmada* — ${tienda}\n\n¡Hola ${r.cliente_nombre}! Su reserva ha sido CONFIRMADA:\n\n*📋 Servicio:* ${prod.nombre || 'Servicio'}\n*📅 Fecha:* ${f}\n*🕐 Hora:* ${r.hora}\n\n¡Le esperamos! 🙏`;
                if (tel) window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
            }
            await this.cargarReservas();
        } catch { alert('Error'); }
    },

    async eliminarReserva(id) {
        if (!confirm('¿Eliminar?')) return;
        try {
            await fetch(`/api/reservas/${id}`, { method: 'DELETE' });
            this.reservasGlobales = this.reservasGlobales.filter(r => r.id !== id);
            this.filtrarReservas();
        } catch { alert('Error'); }
    },

    // --- Pedidos ---
    async cargarPedidos() {
        const res = await fetch(`/api/mis-pedidos?tienda=${this.myStore.id}`);
        this.pedidosGlobales = await res.json();
        this.filtrarPedidos();
    },

    filtrarPedidos() {
        const q = (document.getElementById('searchOrderCode')?.value || '').toLowerCase().trim();
        const f = this.pedidosGlobales.filter(o => {
            const c = (o.codigo_cliente || '').toLowerCase();
            const i = o.id.toString();
            return c.includes(q) || i.includes(q);
        });
        this.renderizarPedidos(f);
    },

    renderizarPedidos(orders) {
        const c = document.getElementById('ordersList');
        if (!orders.length) { c.innerHTML = '<div class="alert alert-info text-center py-4">No se encontraron.</div>'; return; }
        c.innerHTML = orders.map(o => {
            const bc = o.estado === 'pendiente' ? 'warning' : (o.estado === 'entregado' ? 'success' : 'primary');
            const items = (o.items || []).map(i => `<div class="d-flex align-items-center gap-2 mb-2"><img src="${i.imagen || 'https://via.placeholder.com/50'}" class="order-img"><div><div class="fw-bold" style="font-size:0.85rem;">${i.qty}x ${i.nombre}</div><div class="text-muted" style="font-size:0.75rem;">$${(i.precio * i.qty).toFixed(2)}</div></div></div>`).join('');
            const contactoBadge = o.contacto_nombre ? `<span class="badge bg-info text-dark ms-1" style="font-size:0.7rem;"><i class="fas fa-user-tie"></i> ${o.contacto_nombre}</span>` : '';
            return `
            <div class="order-card">
                <div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
                    <div><h5 class="fw-bold m-0">Pedido #${o.id} ${contactoBadge}</h5><small class="text-muted">${new Date(o.created_at).toLocaleString('es-ES')}</small></div>
                    <div class="d-flex gap-2"><span class="badge bg-${bc} text-dark text-uppercase">${o.estado}</span><button class="btn btn-sm btn-outline-danger" onclick="AdminCliente.eliminarPedidoIndividual(${o.id})"><i class="fas fa-trash"></i></button></div>
                </div>
                <div class="row g-3 mb-3">
                    <div class="col-md-6"><div class="p-3 bg-light rounded-3">${items}</div></div>
                    <div class="col-md-6">
                        <div class="small">
                            <div class="mb-1"><i class="fas fa-user text-primary me-1"></i> <strong>${o.nombre}</strong></div>
                            <div class="mb-1"><i class="fas fa-phone text-primary me-1"></i> ${o.telefono}</div>
                            <div class="mb-1"><i class="fas fa-map-marker-alt text-primary me-1"></i> ${o.direccion}</div>
                            ${o.carnet ? `<div class="mb-1"><i class="fas fa-id-card text-primary me-1"></i> Carnet: ${o.carnet}</div>` : ''}
                            <div class="mt-2 fw-bold" style="color:var(--primary); font-size:1.1rem;">Total: $${parseFloat(o.total).toFixed(2)}</div>
                        </div>
                    </div>
                </div>
                <div class="d-flex gap-2 flex-wrap border-top pt-3">
                    <button class="btn btn-sm" style="background:#FFF3E0;color:#B45309;border:1.5px solid #FEE0B0;font-weight:700;" onclick="AdminCliente.enviarWhatsAppProveedor(${o.id})"><i class="fab fa-whatsapp"></i> Avisar Proveedor</button>
                    <button class="btn btn-sm btn-success" style="font-weight:700;" onclick="AdminCliente.enviarWhatsAppCliente(${o.id})"><i class="fab fa-whatsapp"></i> Confirmar Cliente</button>
                </div>
            </div>`;
        }).join('');
        window._pedidosCache = orders;
    },

    async eliminarPedidoIndividual(id) {
        if (!confirm('¿Eliminar?')) return;
        try {
            await window.supabaseClient.from('orders').delete().eq('id', id).eq('tienda', this.myStore.id);
            this.pedidosGlobales = this.pedidosGlobales.filter(o => o.id !== id);
            this.filtrarPedidos();
        } catch { alert('Error'); }
    },

    async eliminarTodosLosPedidos() {
        if (!confirm('⚠️ ¿Eliminar TODOS?')) return;
        if (!confirm('¿Seguro?')) return;
        try {
            await window.supabaseClient.from('orders').delete().eq('tienda', this.myStore.id);
            this.pedidosGlobales = [];
            this.filtrarPedidos();
        } catch { alert('Error'); }
    },

    enviarWhatsAppProveedor(id) {
        const o = (window._pedidosCache || []).find(x => x.id == id);
        if (!o) return;
        const it = (o.items && o.items[0]) || {};
        const pi = this.myProducts.find(p => String(p.id) === String(it.id)) || {};
        const wa = o.whatsapp_destino || pi.whatsapp_proveedor || this.myStore.configuracion?.datos_bancarios?.whatsapp_confirmacion;
        if (!wa) { alert('❌ Sin WhatsApp configurado'); return; }
        const g = this.myStore.configuracion?.gestor_venta || {};
        const tn = this.myStore.nombre || this.myStore.id;
        let pt = '';
        (o.items || []).forEach(i => {
            const p = this.myProducts.find(x => String(x.id) === String(i.id)) || {};
            const u = p.imagen_proveedor || i.imagen || 'No adjunta';
            pt += `• ${i.qty}x ${i.nombre}\n   📸 ${u}\n`;
        });
        const contacto = pi.contacto_nombre ? `*Atendido por:* ${pi.contacto_nombre}\n\n` : '';
        const msg = `🚚 *NUEVA VENTA — ${tn}*\n\n${contacto}*📦 Productos:*\n${pt}\n*💰 Total:* $${parseFloat(o.total).toFixed(2)}\n\n*👤 Cliente:* ${o.nombre}\n• Carnet: ${o.carnet || '—'}\n• Tel: ${o.telefono}\n• Dir: ${o.direccion}\n\n*🧑‍💼 Gestor:* ${g.nombre || '—'}\n\n*Pedido:* #${o.id}`;
        const n = this.normalizePhone(wa);
        if (!n) return;
        window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`, '_blank');
    },

    enviarWhatsAppCliente(id) {
        const o = (window._pedidosCache || []).find(x => x.id == id);
        if (!o) return;
        const tn = this.myStore.nombre || this.myStore.id;
        const it = (o.items || []).map(i => `• ${i.qty}x ${i.nombre} — $${(i.precio * i.qty).toFixed(2)}`).join('\n');
        const extra = o.contacto_nombre ? `\n*Contacto:* ${o.contacto_nombre}\n` : '';
        const msg = `¡Hola ${o.nombre}! 👋\n\nLe saludamos de *${tn}*.\n\n*🛒 Pedido:*\n${it}\n${extra}\n*💰 Total:* $${parseFloat(o.total).toFixed(2)}\n\n*📦 Envío:* ${o.direccion}\n\n*¿Confirma?* Responda *SÍ*.\n\n¡Gracias! 🙌`;
        const n = this.normalizePhone(o.telefono);
        if (!n) return;
        window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`, '_blank');
    },

    // --- Configuración ---
    cargarHorario() {
        const cfg = this.myStore.configuracion?.horario || {};
        const dias = Array.isArray(cfg.dias) ? cfg.dias : [1, 2, 3, 4, 5, 6];
        document.getElementById('horaApertura').value = cfg.apertura || '09:00';
        document.getElementById('horaCierre').value = cfg.cierre || '18:00';
        document.getElementById('intervaloTurnos').value = cfg.intervalo || '60';
        document.querySelectorAll('#diasLaborables .day-pill').forEach(pill => {
            const d = parseInt(pill.dataset.day);
            pill.classList.toggle('active', dias.includes(d));
        });
    },

    toggleDia(el) { el.classList.toggle('active'); },

    async guardarHorario() {
        const dias = Array.from(document.querySelectorAll('#diasLaborables .day-pill.active')).map(p => parseInt(p.dataset.day));
        if (dias.length === 0) { alert('Debes seleccionar al menos un día laborable'); return; }
        const apertura = document.getElementById('horaApertura').value;
        const cierre = document.getElementById('horaCierre').value;
        const intervalo = parseInt(document.getElementById('intervaloTurnos').value);
        if (apertura >= cierre) { alert('La hora de apertura debe ser antes que la de cierre'); return; }
        try {
            const res = await fetch('/api/mi-tienda/config', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ owner_id: this.currentUser.id, slug: this.myStore.id, configuracion: { horario: { apertura, cierre, dias, intervalo } } })
            });
            const data = await res.json();
            if (data.success) { this.myStore.configuracion = data.configuracion; alert('✅ Horario guardado'); }
        } catch { alert('Error'); }
    },

    cargarConfiguracionTienda() {
        const cfg = this.myStore.configuracion || {};
        const tasas = cfg.tasas || { USD: 0.04, EUR: 0.037 };
        const datos = cfg.datos_bancarios || {};
        document.getElementById('miRateUSD').value = tasas.USD ? (1 / tasas.USD).toFixed(2) : 25;
        document.getElementById('miRateEUR').value = tasas.EUR ? (1 / tasas.EUR).toFixed(2) : 27;
        const metodos = cfg.metodos_pago || [];
        document.getElementById('pagoEfectivo').checked = metodos.includes('Efectivo');
        document.getElementById('pagoTransferencia').checked = metodos.includes('Transferencia');
        document.getElementById('pagoTarjeta').checked = metodos.includes('Tarjeta');
        document.getElementById('numTarjeta').value = datos.numero_tarjeta || '';
        const qr = datos.qr_tarjeta || '';
        document.getElementById('urlQrTarjeta').value = qr;
        if (qr) { document.getElementById('qrPreviewImg').src = qr; document.getElementById('qrPreviewContainer').style.display = 'block'; }
    },

    cargarNotificaciones() {
        const cfg = this.myStore.configuracion || {};
        const modo = cfg.notificaciones_modo || 'admin';
        const sel = document.getElementById('notifModo');
        if (sel) sel.value = modo;
    },

    async guardarNotificaciones() {
        const modo = document.getElementById('notifModo').value;
        try {
            const res = await fetch('/api/mi-tienda/config', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    owner_id: this.currentUser.id,
                    slug: this.myStore.id,
                    configuracion: { notificaciones_modo: modo }
                })
            });
            const data = await res.json();
            if (data.success) { this.myStore.configuracion = data.configuracion; alert('✅ Guardado'); }
        } catch { alert('Error'); }
    },

    previewQrImage(event) {
        const file = event.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { alert('Máximo 2MB'); event.target.value = ''; return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('urlQrTarjeta').value = e.target.result;
            document.getElementById('qrPreviewImg').src = e.target.result;
            document.getElementById('qrPreviewContainer').style.display = 'block';
        };
        reader.readAsDataURL(file);
    },

    cargarGestorDesdeStore() {
        if (!this.myStore) return;
        const g = this.myStore.configuracion?.gestor_venta || {};
        document.getElementById('gestorNombre').value = g.nombre || '';
        document.getElementById('gestorCarnet').value = g.carnet || '';
        document.getElementById('gestorTelefono').value = g.telefono || '';
        document.getElementById('gestorDireccion').value = g.direccion || '';
    },

    async guardarConfiguracion() {
        const usd = parseFloat(document.getElementById('miRateUSD').value) || 25;
        const eur = parseFloat(document.getElementById('miRateEUR').value) || 27;
        const metodos = [];
        if (document.getElementById('pagoEfectivo').checked) metodos.push('Efectivo');
        if (document.getElementById('pagoTransferencia').checked) metodos.push('Transferencia');
        if (document.getElementById('pagoTarjeta').checked) metodos.push('Tarjeta');
        const datos_bancarios = { ...(this.myStore.configuracion?.datos_bancarios || {}), numero_tarjeta: document.getElementById('numTarjeta').value.trim(), qr_tarjeta: document.getElementById('urlQrTarjeta').value.trim() };
        try {
            const res = await fetch('/api/mi-tienda/config', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ owner_id: this.currentUser.id, slug: this.myStore.id, configuracion: { tasas: { CUP: 1, USD: 1 / usd, EUR: 1 / eur }, metodos_pago: metodos, datos_bancarios } })
            });
            const data = await res.json();
            if (data.success) { this.myStore.configuracion = data.configuracion; alert('✅ Guardado'); }
        } catch { alert('Error'); }
    },

    async guardarGestorVenta() {
        const gestor_venta = {
            nombre: document.getElementById('gestorNombre').value.trim(),
            carnet: document.getElementById('gestorCarnet').value.trim(),
            telefono: document.getElementById('gestorTelefono').value.trim(),
            direccion: document.getElementById('gestorDireccion').value.trim()
        };
        try {
            const res = await fetch('/api/mi-tienda/config', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ owner_id: this.currentUser.id, slug: this.myStore.id, configuracion: { gestor_venta } })
            });
            const data = await res.json();
            if (data.success) { this.myStore.configuracion = data.configuracion; alert('✅ Guardado'); }
        } catch { alert('Error'); }
    },

    actualizarBadgeEstado() {
        const el = document.getElementById('badgeEstado');
        if (!el) return;
        el.innerHTML = this.myStore.pausada ? '<span class="badge-pausada"><i class="fas fa-pause"></i>Pausada</span>' : '<span class="badge-activa"><i class="fas fa-check"></i>Activa</span>';
        const s = document.getElementById('estadoTiendaSidebar');
        if (s) {
            let extra = '';
            if (this.myStore.pausada && this.myStore.pausada_por === 'admin') extra = ' (admin)';
            else if (this.myStore.pausada && this.myStore.pausada_por === 'owner') extra = ' (tú)';
            s.innerHTML = this.myStore.pausada
                ? `<span class="badge-pausada" style="font-size:0.62rem;">Pausada${extra}</span>`
                : '<span class="badge-activa" style="font-size:0.62rem;">Activa</span>';
        }
    },

    actualizarEstadoPausa() {
        const btnPausar = document.getElementById('btnPausarConMensaje');
        const btnReactivar = document.getElementById('btnReactivarTienda');
        if (!btnPausar || !btnReactivar) return;
        if (this.myStore.pausada) {
            btnPausar.style.display = 'none';
            btnReactivar.style.display = 'inline-block';
        } else {
            btnPausar.style.display = 'inline-block';
            btnReactivar.style.display = 'none';
        }
    },

    copiarInput(id) {
        const i = document.getElementById(id);
        i.select();
        navigator.clipboard.writeText(i.value).then(() => alert('✅ Copiado'));
    },

    abrirPausaModal() {
        document.getElementById('pausaMsgSelect').value = 'Volvemos mañana';
        document.getElementById('pausaMsgCustom').style.display = 'none';
        document.getElementById('pausaMsgCustom').value = '';
        bootstrap.Modal.getOrCreateInstance(document.getElementById('pausaModal')).show();
    },

    onChangePausaMsg(sel) {
        const c = document.getElementById('pausaMsgCustom');
        if (sel.value === '__custom__') { c.style.display = 'block'; c.focus(); }
        else { c.style.display = 'none'; c.value = ''; }
    },

    async confirmarPausa() {
        const sel = document.getElementById('pausaMsgSelect');
        const custom = document.getElementById('pausaMsgCustom');
        let mensaje = sel.value;
        if (mensaje === '__custom__') {
            mensaje = (custom.value || '').trim();
            if (!mensaje) { alert('Escribe un mensaje'); return; }
        }
        try {
            const res = await fetch('/api/mi-tienda/pausar', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ owner_id: this.currentUser.id, slug: this.myStore.id, pausar: true, mensaje })
            });
            const d = await res.json();
            if (d.success) {
                this.myStore.pausada = true;
                this.myStore.pausada_por = 'owner';
                this.myStore.pausada_mensaje = mensaje;
                this.actualizarEstadoPausa();
                this.actualizarBadgeEstado();
                bootstrap.Modal.getInstance(document.getElementById('pausaModal')).hide();
                alert('✅ Tienda pausada');
                location.reload();
            }
        } catch { alert('Error'); }
    },

    async reactivarTienda() {
        if (!confirm('¿Reactivar tu tienda?')) return;
        try {
            const res = await fetch('/api/mi-tienda/pausar', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ owner_id: this.currentUser.id, slug: this.myStore.id, pausar: false })
            });
            const d = await res.json();
            if (d.success) {
                this.myStore.pausada = false;
                this.myStore.pausada_por = null;
                this.myStore.pausada_mensaje = null;
                this.actualizarEstadoPausa();
                this.actualizarBadgeEstado();
                alert('✅ Tienda reactivada');
                location.reload();
            }
        } catch { alert('Error'); }
    },

    async eliminarMiTienda() {
        if (!confirm('⚠️ ¿Eliminar?')) return;
        if (!confirm('¿Seguro?')) return;
        try {
            const res = await fetch(`/api/mi-tienda/${this.myStore.id}?owner_id=${this.currentUser.id}`, { method: 'DELETE' });
            const d = await res.json();
            if (d.success) { alert('✅ Eliminada'); await window.supabaseClient.auth.signOut(); window.location.href = '/'; }
        } catch { alert('Error'); }
    },

    normalizePhone(phone) {
        let n = String(phone || '').replace(/\D/g, '');
        if (n.length === 8 && n.startsWith('5')) n = '53' + n;
        return n;
    }
};

// Iniciar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar Supabase
    if (!window.supabaseClient) {
        const res = await fetch('/api/public-config');
        const config = await res.json();
        window.supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    }
    // Iniciar el panel
    await AdminCliente.init();
});