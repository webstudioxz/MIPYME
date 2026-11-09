// ============================================================
// public/js/admin/app.js
// ============================================================

window.AdminApp = {
    tiendasDisponibles: [],

    async init() {
        AdminAPI.init();
        AdminAPI.onUnauthorized = () => AdminAuth.showLogin();
        
        if ('serviceWorker' in navigator) {
            try { await navigator.serviceWorker.register('/sw.js'); } catch (e) { console.warn(e); }
        }

        this.setupEventListeners();

        if (await AdminAuth.check()) {
            await this.loadInitialData();
        }
    },

    setupEventListeners() {
        const loginForm = document.getElementById('loginForm');
        if (loginForm) loginForm.addEventListener('submit', (e) => AdminAuth.doLogin(e));

        const storeForm = document.getElementById('storeForm');
        if (storeForm) {
            storeForm.addEventListener('submit', (e) => { e.preventDefault(); AdminStores.saveStore(e); });
        }

        const tiendaSelect = document.getElementById('tiendaSelect');
        if (tiendaSelect) {
            tiendaSelect.addEventListener('change', async () => {
                this.updateStoreName();
                const t = tiendaSelect.value;
                await AdminProducts.loadCategorias(t);
                const s = document.querySelector('.nav-item.active')?.dataset?.section;
                if (s === 'products') await AdminProducts.loadProducts();
                if (s === 'orders') await AdminOrders.loadOrders();
                if (s === 'bookings') await this.loadBookings();
            });
        }

        if (window.AdminNotifications) AdminNotifications.init().catch(console.warn);

        const searchInput = document.getElementById('searchOrderCode');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); AdminOrders.buscarPedidoPorCodigo(); }
            });
        }
    },

    async loadInitialData() {
        await this.loadTiendaSelector();
        this.updateStoreName();
        const t = document.getElementById('tiendaSelect')?.value;
        if (t) {
            await AdminProducts.loadCategorias(t);
            await AdminProducts.loadProducts();
            await AdminOrders.loadOrders();
        }
        AdminOrders.startPolling();
    },

    async loadTiendaSelector() {
        try {
            const tiendas = await AdminAPI.getTiendas();
            const select = document.getElementById('tiendaSelect');
            if (!select) return;
            if (!tiendas || tiendas.length === 0) { select.innerHTML = '<option value="">⚠️ No hay tiendas</option>'; return; }
            this.tiendasDisponibles = tiendas;
            select.innerHTML = tiendas.map(t => `<option value="${t.id}">${t.icono || '🛒'} ${t.nombre}</option>`).join('');
            const saved = localStorage.getItem('adminSelectedStore');
            if (saved && tiendas.some(t => t.id === saved)) select.value = saved;
            else if (tiendas.length > 0) select.value = tiendas[0].id;
            this.updateStoreName();
        } catch (e) { AdminUI.showToast('❌ Error cargando tiendas', 'error'); }
    },

    updateStoreName() {
        const select = document.getElementById('tiendaSelect');
        if (!select || !select.options || select.options.length === 0) return;
        const name = select.options[select.selectedIndex]?.text || 'Tienda';
        document.getElementById('currentStoreName').innerText = name;
        document.getElementById('currentStoreNameOrders').innerText = name;
        localStorage.setItem('adminSelectedStore', select.value);
    },

    showSection(s) {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        const navItem = document.querySelector(`[data-section="${s}"]`);
        if (navItem) navItem.classList.add('active');
        document.querySelectorAll('[id^="view-"]').forEach(v => v.style.display = 'none');
        document.getElementById(`view-${s}`).style.display = 'block';
        
        if (s === 'products') AdminProducts.loadProducts();
        if (s === 'orders') { AdminOrders.loadOrders(); document.getElementById('newOrderIndicator')?.classList.remove('active'); }
        
        if (s === 'bookings') this.loadBookings(); // 🚨 NUEVA CARGA

        if (s === 'stores') AdminStores.loadStores();
        if (s === 'settings') this.loadCurrencyConfig();
        
        if (window.innerWidth < 768) document.getElementById('sidebar')?.classList.remove('active');
    },

    // 🚨 NUEVA FUNCIÓN
    async loadBookings() {
        const t = document.getElementById('tiendaSelect')?.value;
        const tbody = document.getElementById('bookingsList');
        if (!t || !tbody) return;

        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Cargando reservas...</td></tr>';

        try {
            const res = await AdminAPI.fetch(`/api/admin/reservas?tienda=${t}`);
            const data = await res.json();

            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No hay reservas confirmadas</td></tr>';
                return;
            }

            tbody.innerHTML = data.map(b => `
                <tr>
                    <td><strong>${b.fecha}</strong></td>
                    <td><span class="badge bg-primary">${b.hora}</span></td>
                    <td>${b.cliente_nombre}</td>
                    <td>${b.cliente_telefono}</td>
                    <td>${b.products?.nombre || 'Servicio'}</td>
                    <td style="text-align:right;">
                        <a href="https://wa.me/${b.cliente_telefono.replace(/\D/g, '')}" target="_blank" class="btn btn-sm btn-whatsapp" style="background:#25D366; color:white; border:none; border-radius:8px;">
                            <i class="fab fa-whatsapp"></i>
                        </a>
                    </td>
                </tr>
            `).join('');
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error al cargar reservas</td></tr>';
        }
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

window.showSection = (s) => AdminApp.showSection(s);
window.saveCurrencyConfig = (e) => AdminApp.saveCurrencyConfig(e);
window.resetStoreForm = () => AdminStores.resetStoreForm();
window.saveStore = (e) => AdminStores.saveStore(e);

document.addEventListener('DOMContentLoaded', () => AdminApp.init());