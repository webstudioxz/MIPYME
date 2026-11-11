// ============================================================
// public/js/admin/app.js
// ============================================================

window.AdminApp = {
    tiendasDisponibles: [],
    currentStoreType: 'tienda',

    async init() {
        AdminAPI.init();
        AdminAPI.onUnauthorized = () => AdminAuth.showLogin();
        if ('serviceWorker' in navigator) { try { await navigator.serviceWorker.register('/sw.js'); } catch (e) {} }
        this.setupEventListeners();
        if (await AdminAuth.check()) { await this.loadInitialData(); }
    },

    setupEventListeners() {
        document.getElementById('loginForm')?.addEventListener('submit', (e) => AdminAuth.doLogin(e));
        document.getElementById('storeForm')?.addEventListener('submit', (e) => { e.preventDefault(); AdminStores.saveStore(e); });
        
        const tiendaSelect = document.getElementById('tiendaSelect');
        if (tiendaSelect) {
            tiendaSelect.addEventListener('change', async () => {
                this.updateStoreName();
                const t = tiendaSelect.value;
                
                // DETECTAR TIPO DE TIENDA AL CAMBIAR
                const storeInfo = this.tiendasDisponibles.find(x => x.id === t);
                this.currentStoreType = storeInfo?.configuracion?.tipo || 'tienda';
                this.adaptMenu();

                await AdminProducts.loadCategorias(t);
                const s = document.querySelector('.nav-item.active')?.dataset?.section;
                if (s === 'products') await AdminProducts.loadProducts();
                if (s === 'orders') await AdminOrders.loadOrders();
                if (s === 'bookings') await this.loadBookings();
            });
        }

        if (window.AdminNotifications) AdminNotifications.init().catch(()=>{});
        
        document.getElementById('searchOrderCode')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); AdminOrders.buscarPedidoPorCodigo(); }
        });
    },

    async loadInitialData() {
        // 1. Cargar el selector de tiendas
        await this.loadTiendaSelector();
        
        // 2. Actualizar el nombre de la tienda
        this.updateStoreName();
        
        const t = document.getElementById('tiendaSelect')?.value;
        
        if (t) {
            // 3. Detectar tipo de tienda
            const storeInfo = this.tiendasDisponibles.find(x => x.id === t);
            this.currentStoreType = storeInfo?.configuracion?.tipo || 'tienda';
            this.adaptMenu();

            // 4. Cargar categorías y productos de esa tienda
            await AdminProducts.loadCategorias(t);
            await AdminProducts.loadProducts();
            await AdminOrders.loadOrders();
        } else {
            // Si no hay tiendas, mostrar mensaje
            document.getElementById('productsList').innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No hay tiendas registradas. Ve a "Tiendas" para crear una.</td></tr>';
        }
        
        AdminOrders.startPolling();
    },

    // ADAPTAR EL MENÚ SEGÚN EL TIPO DE TIENDA
    adaptMenu() {
        const isBooking = this.currentStoreType === 'reserva';
        
        // Mostrar/Ocultar Pedidos
        const ordersBtn = document.querySelector('[data-section="orders"]');
        if (ordersBtn) ordersBtn.style.display = isBooking ? 'none' : 'block';
        
        // Mostrar/Ocultar Reservas
        const bookingsBtn = document.querySelector('[data-section="bookings"]');
        if (bookingsBtn) bookingsBtn.style.display = isBooking ? 'block' : 'none';

        // Cambiar nombre de "Productos" a "Servicios" si es reserva
        const productsBtnText = document.querySelector('[data-section="products"] span:last-child');
        if (productsBtnText) {
            productsBtnText.innerText = isBooking ? 'Servicios' : 'Productos';
        }
    },

    async loadTiendaSelector() {
        try {
            const tiendas = await AdminAPI.getTiendas();
            const select = document.getElementById('tiendaSelect');
            if (!select) return;
            
            if (!tiendas || tiendas.length === 0) { 
                select.innerHTML = '<option value="">⚠️ No hay tiendas</option>'; 
                return; 
            }
            
            this.tiendasDisponibles = tiendas;
            select.innerHTML = tiendas.map(t => `<option value="${t.id}">${t.icono || '🛒'} ${t.nombre}</option>`).join('');
            
            const saved = localStorage.getItem('adminSelectedStore');
            if (saved && tiendas.some(t => t.id === saved)) select.value = saved;
            else if (tiendas.length > 0) select.value = tiendas[0].id;
            
            this.updateStoreName();
        } catch (e) { 
            AdminUI.showToast('❌ Error cargando tiendas', 'error'); 
        }
    },

    updateStoreName() {
        const select = document.getElementById('tiendaSelect');
        if (!select || !select.options || select.options.length === 0) return;
        const name = select.options[select.selectedIndex]?.text || 'Tienda';
        
        const el1 = document.getElementById('currentStoreName');
        const el2 = document.getElementById('currentStoreNameOrders');
        if (el1) el1.innerText = name;
        if (el2) el2.innerText = name;
        
        localStorage.setItem('adminSelectedStore', select.value);
    },

    // 🚨 FUNCIÓN CORREGIDA PARA CAMBIAR DE SECCIÓN
    showSection(s, btnElement = null) {
        // Validar que no entre a una sección que no le corresponde
        if (this.currentStoreType === 'reserva' && s === 'orders') s = 'products';
        if (this.currentStoreType === 'tienda' && s === 'bookings') s = 'products';

        // Quitar la clase 'active' de todos los botones
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        
        // Poner la clase 'active' al botón que se clickeó o al que corresponde
        if (btnElement) {
            btnElement.classList.add('active');
        } else {
            document.querySelector(`[data-section="${s}"]`)?.classList.add('active');
        }
        
        // Ocultar todas las vistas
        document.querySelectorAll('[id^="view-"]').forEach(v => v.style.display = 'none');
        
        // Mostrar la vista seleccionada
        const view = document.getElementById(`view-${s}`);
        if (view) view.style.display = 'block';
        
        // Cargar los datos de esa sección
        if (s === 'products') AdminProducts.loadProducts();
        if (s === 'orders') { 
            AdminOrders.loadOrders(); 
            document.getElementById('newOrderIndicator')?.classList.remove('active'); 
        }
        if (s === 'bookings') this.loadBookings();
        if (s === 'stores') AdminStores.loadStores();
        if (s === 'settings') this.loadCurrencyConfig();
        
        // En móvil, cerrar el menú lateral
        if (window.innerWidth < 768) document.getElementById('sidebar')?.classList.remove('active');
    },

    // CARGAR RESERVAS FILTRADAS POR TIENDA
    async loadBookings() {
        const t = document.getElementById('tiendaSelect')?.value;
        const tbody = document.getElementById('bookingsList');
        if (!t || !tbody) return;

        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Cargando reservas...</td></tr>';

        try {
            const res = await fetch(`/api/admin/reservas?tienda=${t}`, {
                headers: { 'Authorization': `Bearer ${AdminAPI.token}` }
            });
            const data = await res.json();

            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No hay reservas para esta tienda</td></tr>';
                return;
            }

            tbody.innerHTML = data.map(b => {
                const servicio = b.producto?.nombre || 'Servicio';
                const precio = b.producto?.precio || 0;
                const precioFormateado = new Intl.NumberFormat('es-ES').format(precio) + ' CUP';
                const estadoBadge = b.estado === 'confirmado' 
                    ? '<span class="badge bg-success">Confirmada</span>' 
                    : '<span class="badge bg-warning text-dark">Pendiente</span>';
                
                const msg = encodeURIComponent(`Hola ${b.cliente_nombre}, su reserva para *${servicio}* el día *${b.fecha}* a las *${b.hora}* ha sido CONFIRMADA. ¡Le esperamos!`);

                return `
                <tr>
                    <td><strong>${b.fecha}</strong><br><small>${b.hora}</small></td>
                    <td>${b.cliente_nombre}<br><small class="text-muted">${b.cliente_telefono}</small></td>
                    <td>${servicio}</td>
                    <td><strong style="color:var(--primary);">${precioFormateado}</strong></td>
                    <td>${estadoBadge}</td>
                    <td style="text-align:right;">
                        <a href="https://wa.me/${b.cliente_telefono.replace(/\D/g, '')}?text=${msg}" target="_blank" class="btn btn-sm btn-success me-1" title="Confirmar por WhatsApp">
                            <i class="fab fa-whatsapp"></i>
                        </a>
                        <button class="btn btn-sm btn-danger" onclick="AdminApp.deleteBooking(${b.id})" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `}).join('');
        } catch (e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error al cargar reservas</td></tr>';
        }
    },

    async deleteBooking(id) {
        if (!confirm('¿Eliminar esta reserva?')) return;
        try {
            const res = await fetch(`/api/admin/reservas/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${AdminAPI.token}` }
            });
            if (res.ok) {
                AdminUI.showToast('🗑️ Reserva eliminada');
                await this.loadBookings();
            } else {
                AdminUI.showToast('❌ Error al eliminar', 'error');
            }
        } catch (e) { AdminUI.showToast('❌ Error de conexión', 'error'); }
    },

    async loadCurrencyConfig() {
        try {
            const c = await AdminAPI.getConfig();
            const usdRate = c.tasas?.USD ? (1 / c.tasas.USD) : 25;
            const eurRate = c.tasas?.EUR ? (1 / c.tasas.EUR) : 27;
            document.getElementById('rateUSD').value = usdRate.toFixed(2);
            document.getElementById('rateEUR').value = eurRate.toFixed(2);
        } catch (e) {
            document.getElementById('rateUSD').value = '25.00';
            document.getElementById('rateEUR').value = '27.00';
        }
    },

    async saveCurrencyConfig(e) {
        e.preventDefault();
        const usd = parseFloat(document.getElementById('rateUSD').value);
        const eur = parseFloat(document.getElementById('rateEUR').value);
        const btn = document.getElementById('currencySaveBtn');
        const originalText = btn.innerHTML;
        if (isNaN(usd) || isNaN(eur) || usd <= 0 || eur <= 0) { AdminUI.showToast('❌ Valores inválidos', 'error'); return; }
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        btn.disabled = true;
        try {
            const result = await AdminAPI.saveConfig('CUP', { CUP: 1, USD: 1/usd, EUR: 1/eur });
            if (result.ok && result.data.success) { AdminUI.showToast('✅ Configuración guardada'); await this.loadCurrencyConfig(); }
            else { AdminUI.showToast('❌ ' + (result.data.error || 'Error'), 'error'); }
        } catch (e) { AdminUI.showToast('❌ Error de conexión', 'error'); }
        finally { btn.innerHTML = originalText; btn.disabled = false; }
    }
};

// 🚨 IMPORTANTE: Pasar el botón clickeado para que se marque como activo
window.showSection = (s, btn) => AdminApp.showSection(s, btn);
window.saveCurrencyConfig = (e) => AdminApp.saveCurrencyConfig(e);
window.resetStoreForm = () => AdminStores.resetStoreForm();
window.saveStore = (e) => AdminStores.saveStore(e);

document.addEventListener('DOMContentLoaded', () => AdminApp.init());