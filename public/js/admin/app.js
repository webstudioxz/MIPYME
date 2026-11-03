window.AdminApp = {
    tiendasDisponibles: [],

    async init() {
        AdminAPI.init();
        AdminAPI.onUnauthorized = () => AdminAuth.showLogin();
        
        document.getElementById('loginForm').addEventListener('submit', (e) => AdminAuth.doLogin(e));
        document.getElementById('tiendaSelect').addEventListener('change', async () => {
            this.updateStoreName();
            const t = document.getElementById('tiendaSelect').value;
            await AdminProducts.loadCategorias(t);
            const s = document.querySelector('.nav-item.active')?.dataset?.section;
            if (s === 'products') await AdminProducts.loadProducts();
            if (s === 'orders') await AdminOrders.loadOrders();
        });
        
        // Inicializar notificaciones silenciosamente
        try {
            await AdminNotifications.init();
        } catch (e) {
            console.warn("Notificaciones no inicializadas:", e);
        }
        
        if (await AdminAuth.check()) {
            await this.loadInitialData();
        }
    },

    async loadInitialData() {
        await this.loadTiendaSelector();
        this.updateStoreName();
        const t = document.getElementById('tiendaSelect').value;
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
            if (!tiendas || tiendas.length === 0) {
                select.innerHTML = '<option value="">⚠️ No hay tiendas</option>';
                return;
            }
            this.tiendasDisponibles = tiendas;
            select.innerHTML = '';
            tiendas.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = `${t.icono || '🛒'} ${t.nombre}`;
                select.appendChild(opt);
            });
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
        if (s === 'orders') {
            AdminOrders.loadOrders();
            document.getElementById('newOrderIndicator').classList.remove('active');
        }
        if (s === 'stores') AdminStores.loadStores();
        if (s === 'settings') this.loadCurrencyConfig();
        
        if (window.innerWidth < 768) document.getElementById('sidebar').classList.remove('active');
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
        if (isNaN(usd) || isNaN(eur) || usd <= 0 || eur <= 0) {
            AdminUI.showToast('❌ Valores inválidos', 'error'); return;
        }
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        btn.disabled = true;
        try {
            const result = await AdminAPI.saveConfig('CUP', { CUP: 1, USD: 1/usd, EUR: 1/eur });
            if (result.ok && result.data.success) {
                AdminUI.showToast('✅ Configuración guardada');
                await this.loadCurrencyConfig();
            } else {
                AdminUI.showToast('❌ ' + (result.data.error || 'Error'), 'error');
            }
        } catch (e) {
            AdminUI.showToast('❌ Error de conexión', 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
};

// Funciones globales
window.showSection = (s) => AdminApp.showSection(s);
window.saveCurrencyConfig = (e) => AdminApp.saveCurrencyConfig(e);
window.resetStoreForm = () => AdminStores.resetStoreForm();
window.saveStore = (e) => AdminStores.saveStore(e);

document.addEventListener('DOMContentLoaded', () => AdminApp.init());