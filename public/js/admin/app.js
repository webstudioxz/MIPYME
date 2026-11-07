// ============================================================
// public/js/admin/app.js
// Orquestador principal del panel de administración
// ============================================================

window.AdminApp = {
    tiendasDisponibles: [],

    // ------------------------------------------------------------
    // INIT
    // ------------------------------------------------------------
    async init() {
        console.log('⚙️ Iniciando Admin...');
        
        // 1. Iniciar API
        AdminAPI.init();
        AdminAPI.onUnauthorized = () => AdminAuth.showLogin();

        // 2. Registrar Service Worker (para notificaciones)
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('/sw.js');
            } catch (e) {
                console.warn('⚠️ Error registrando Service Worker:', e);
            }
        }

        // 3. Configurar eventos
        this.setupEventListeners();

        // 4. Verificar si ya hay sesión activa
        const isLoggedIn = await AdminAuth.check();
        
        if (isLoggedIn) {
            await this.loadInitialData();
        }
    },

    // ------------------------------------------------------------
    // CONFIGURAR EVENTOS
    // ------------------------------------------------------------
    setupEventListeners() {
        // Login
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => AdminAuth.doLogin(e));
        }

        // Formulario de Tiendas (evita recarga)
        const storeForm = document.getElementById('storeForm');
        if (storeForm) {
            storeForm.addEventListener('submit', (e) => {
                e.preventDefault();
                AdminStores.saveStore(e);
            });
        }

        // Cambio de tienda en el selector
        const tiendaSelect = document.getElementById('tiendaSelect');
        if (tiendaSelect) {
            tiendaSelect.addEventListener('change', async () => {
                this.updateStoreName();
                const t = tiendaSelect.value;
                
                // Recargar categorías y datos de la tienda activa
                await AdminProducts.loadCategorias(t);
                
                // Recargar vista actual
                const currentSection = document.querySelector('.nav-item.active')?.dataset?.section;
                if (currentSection === 'products') await AdminProducts.loadProducts();
                if (currentSection === 'orders') await AdminOrders.loadOrders();
            });
        }

        // Inicializar notificaciones (si el navegador lo soporta)
        if (window.AdminNotifications) {
            AdminNotifications.init().catch(err => console.warn('Notif:', err));
        }

        // Búsqueda de pedidos con Enter
        const searchInput = document.getElementById('searchOrderCode');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    AdminOrders.buscarPedidoPorCodigo();
                }
            });
        }
    },

    // ------------------------------------------------------------
    // CARGAR DATOS INICIALES (al hacer login)
    // ------------------------------------------------------------
    async loadInitialData() {
        await this.loadTiendaSelector();
        this.updateStoreName();
        
        const t = document.getElementById('tiendaSelect')?.value;
        if (t) {
            await AdminProducts.loadCategorias(t);
            await AdminProducts.loadProducts();
            await AdminOrders.loadOrders();
        }

        // Iniciar polling de pedidos
        AdminOrders.startPolling();
        
        console.log('✅ Admin listo');
    },

    // ------------------------------------------------------------
    // CARGAR SELECTOR DE TIENDAS
    // ------------------------------------------------------------
    async loadTiendaSelector() {
        try {
            const tiendas = await AdminAPI.getTiendas();
            const select = document.getElementById('tiendaSelect');
            if (!select) return;

            if (!tiendas || tiendas.length === 0) {
                select.innerHTML = '<option value="">⚠️ No hay tiendas - Crea una primero</option>';
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

            // Restaurar tienda previamente seleccionada
            const saved = localStorage.getItem('adminSelectedStore');
            if (saved && tiendas.some(t => t.id === saved)) {
                select.value = saved;
            } else if (tiendas.length > 0) {
                select.value = tiendas[0].id;
            }

            this.updateStoreName();
        } catch (e) {
            console.error('Error cargando tiendas:', e);
            AdminUI.showToast('❌ Error cargando tiendas', 'error');
        }
    },

    // ------------------------------------------------------------
    // ACTUALIZAR NOMBRE DE LA TIENDA EN EL HEADER
    // ------------------------------------------------------------
    updateStoreName() {
        const select = document.getElementById('tiendaSelect');
        if (!select || !select.options || select.options.length === 0) return;

        const name = select.options[select.selectedIndex]?.text || 'Tienda';

        const nameEl = document.getElementById('currentStoreName');
        const nameOrdersEl = document.getElementById('currentStoreNameOrders');
        
        if (nameEl) nameEl.innerText = name;
        if (nameOrdersEl) nameOrdersEl.innerText = name;

        localStorage.setItem('adminSelectedStore', select.value);
    },

    // ------------------------------------------------------------
    // CAMBIAR DE SECCIÓN (Productos, Pedidos, etc.)
    // ------------------------------------------------------------
    showSection(s) {
        // Quitar active de todos los items del menú
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        
        // Poner active al que corresponde
        const navItem = document.querySelector(`[data-section="${s}"]`);
        if (navItem) navItem.classList.add('active');

        // Ocultar todas las vistas
        document.querySelectorAll('[id^="view-"]').forEach(v => v.style.display = 'none');
        
        // Mostrar la vista actual
        const view = document.getElementById(`view-${s}`);
        if (view) view.style.display = 'block';

        // Cargar datos según la sección
        if (s === 'products') AdminProducts.loadProducts();
        if (s === 'orders') {
            AdminOrders.loadOrders();
            const indicator = document.getElementById('newOrderIndicator');
            if (indicator) indicator.classList.remove('active');
        }
        if (s === 'stores') AdminStores.loadStores();
        if (s === 'settings') this.loadCurrencyConfig();

        // Cerrar menú en móvil
        if (window.innerWidth < 768) {
            document.getElementById('sidebar')?.classList.remove('active');
        }
    },

    // ------------------------------------------------------------
    // CARGAR CONFIGURACIÓN DE MONEDA
    // ------------------------------------------------------------
    async loadCurrencyConfig() {
        try {
            const c = await AdminAPI.getConfig();
            
            // La BD guarda el valor invertido (cuántos USD hay en 1 CUP)
            // Pero el admin necesita ver cuántos CUP hay en 1 USD
            const usdRate = c.tasas?.USD ? (1 / c.tasas.USD) : 25;
            const eurRate = c.tasas?.EUR ? (1 / c.tasas.EUR) : 27;
            
            document.getElementById('rateUSD').value = usdRate.toFixed(2);
            document.getElementById('rateEUR').value = eurRate.toFixed(2);
        } catch (e) {
            console.error('Error cargando config:', e);
            document.getElementById('rateUSD').value = '25.00';
            document.getElementById('rateEUR').value = '27.00';
        }
    },

    // ------------------------------------------------------------
    // GUARDAR CONFIGURACIÓN DE MONEDA
    // ------------------------------------------------------------
    async saveCurrencyConfig(e) {
        if (e) e.preventDefault();

        const usd = parseFloat(document.getElementById('rateUSD').value);
        const eur = parseFloat(document.getElementById('rateEUR').value);
        const btn = document.getElementById('currencySaveBtn');
        const originalText = btn.innerHTML;

        if (isNaN(usd) || isNaN(eur) || usd <= 0 || eur <= 0) {
            AdminUI.showToast('❌ Valores inválidos', 'error');
            return;
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        btn.disabled = true;

        try {
            // Guardamos invertido (1 USD = X CUP -> guardar cuántos USD en 1 CUP)
            const result = await AdminAPI.saveConfig('CUP', { 
                CUP: 1, 
                USD: 1 / usd, 
                EUR: 1 / eur 
            });

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

// ============================================================
// FUNCIONES GLOBALES (para los onclick del HTML)
// ============================================================
window.showSection = (s) => AdminApp.showSection(s);
window.saveCurrencyConfig = (e) => AdminApp.saveCurrencyConfig(e);
window.resetStoreForm = () => AdminStores.resetStoreForm();
window.saveStore = (e) => AdminStores.saveStore(e);

// ============================================================
// INICIALIZAR AL CARGAR EL DOM
// ============================================================
document.addEventListener('DOMContentLoaded', () => AdminApp.init());