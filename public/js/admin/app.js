// ============================================================
// public/js/admin/app.js — Orquestador principal del panel Admin
// ============================================================

window.AdminApp = {
    tiendasDisponibles: [],
    tiendaActual: '',
    currentSection: 'dashboard',
    adminModal: null,
    charts: {},

    // ------------------------------------------------------------
    // Inicialización
    // ------------------------------------------------------------
    async init() {
        try {
            // 1. Verificar autenticación
            const isAuth = await AdminAuth.check();
            if (!isAuth) return;

            // 2. Inicializar UI
            this.setupEventListeners();
            await AdminNotifications.init();

            // 3. Cargar datos base
            await this.loadInitialData();

            // 4. Iniciar polling de notificaciones
            if (window.AdminOrders) AdminOrders.startPolling();

            console.log('✅ AdminApp inicializado correctamente');
        } catch (e) {
            console.error('❌ Error inicializando AdminApp:', e);
            AdminUI.showToast('Error al inicializar el panel', 'error');
        }
    },

    // ------------------------------------------------------------
    // Cargar datos iniciales (tiendas, selección, etc.)
    // ------------------------------------------------------------
    async loadInitialData() {
        try {
            // Cargar tiendas disponibles
            this.tiendasDisponibles = await AdminAPI.getTiendas();
            
            // Si no hay tiendas, mostrar alerta
            if (!this.tiendasDisponibles || this.tiendasDisponibles.length === 0) {
                console.warn('⚠️ No hay tiendas disponibles');
                return;
            }

            // Determinar tienda inicial
            const urlParams = new URLSearchParams(window.location.search);
            const tiendaParam = urlParams.get('tienda');
            
            if (tiendaParam && this.tiendasDisponibles.find(t => t.id === tiendaParam)) {
                this.tiendaActual = tiendaParam;
            } else {
                // Si no hay param o no existe, usar la primera tienda
                this.tiendaActual = this.tiendasDisponibles[0].id;
            }

            // Llenar selector de tiendas
            this.populateTiendasSelector();

            // Cargar categorías de la tienda seleccionada
            if (window.AdminProducts) {
                await AdminProducts.loadCategorias(this.tiendaActual);
            }

            // Cargar sección inicial (dashboard o la que esté en URL)
            this.navigateTo(this.currentSection);

        } catch (e) {
            console.error('❌ Error cargando datos iniciales:', e);
            AdminUI.showToast('Error cargando datos iniciales', 'error');
        }
    },

    // ------------------------------------------------------------
    // Llenar el selector de tiendas
    // ------------------------------------------------------------
    populateTiendasSelector() {
        const select = document.getElementById('tiendaSelect');
        if (!select) return;

        select.innerHTML = this.tiendasDisponibles.map(t => 
            `<option value="${t.id}" ${t.id === this.tiendaActual ? 'selected' : ''}>${t.nombre} (${t.id})</option>`
        ).join('');
    },

    // ------------------------------------------------------------
    // Setup de event listeners globales
    // ------------------------------------------------------------
    setupEventListeners() {
        // Cambio de tienda
        document.getElementById('tiendaSelect')?.addEventListener('change', (e) => {
            this.cambiarTienda(e.target.value);
        });

        // Navegación por el sidebar
        document.querySelectorAll('.nav-item[data-section]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                this.navigateTo(section);
            });
        });

        // Botón de logout
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            AdminAuth.logout();
        });

        // Botón de menú móvil
        document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
            AdminUI.toggleSidebar();
        });
    },

    // ------------------------------------------------------------
    // Cambiar de tienda activa
    // ------------------------------------------------------------
    async cambiarTienda(tiendaId) {
        if (!tiendaId || tiendaId === this.tiendaActual) return;

        this.tiendaActual = tiendaId;
        AdminUI.showToast(`Cambiando a: ${tiendaId}`);

        // Actualizar URL sin recargar
        const url = new URL(window.location);
        url.searchParams.set('tienda', tiendaId);
        window.history.pushState({}, '', url);

        try {
            // Recargar datos de la tienda
            await AdminProducts.loadCategorias(tiendaId);
            
            // Si la sección actual es products u orders, recargar
            if (this.currentSection === 'products' && window.AdminProducts) {
                await AdminProducts.loadProducts();
            } else if (this.currentSection === 'orders' && window.AdminOrders) {
                await AdminOrders.loadOrders();
            }
        } catch (e) {
            console.error('Error cambiando tienda:', e);
        }
    },

    // ------------------------------------------------------------
    // Navegar entre secciones
    // ------------------------------------------------------------
    async navigateTo(section) {
        this.currentSection = section;

        // Actualizar clase activa en el sidebar
        document.querySelectorAll('.nav-item[data-section]').forEach(item => {
            item.classList.toggle('active', item.dataset.section === section);
        });

        // Ocultar todas las secciones
        document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');

        // Mostrar la sección activa
        const targetSection = document.getElementById(`section-${section}`);
        if (targetSection) {
            targetSection.style.display = 'block';
        }

        // Cargar datos según la sección
        try {
            switch (section) {
                case 'dashboard':
                    await this.loadDashboard();
                    break;
                case 'products':
                    if (window.AdminProducts) await AdminProducts.loadProducts();
                    break;
                case 'orders':
                    if (window.AdminOrders) await AdminOrders.loadOrders();
                    break;
                case 'plans':
                    if (window.AdminPlans) await AdminPlans.load();
                    break;
                case 'config':
                    await this.loadConfig();
                    break;
                default:
                    break;
            }
        } catch (e) {
            console.error(`Error cargando sección ${section}:`, e);
        }
    },

    // ------------------------------------------------------------
    // Cargar Dashboard (estadísticas)
    // ------------------------------------------------------------
    async loadDashboard() {
        try {
            const productos = await AdminAPI.getProductos(this.tiendaActual) || [];
            const pedidos = await AdminAPI.getPedidos(this.tiendaActual) || [];
            
            // Actualizar stats del dashboard
            const statProducts = document.getElementById('dashStatProducts');
            const statOrders = document.getElementById('dashStatOrders');
            const statPending = document.getElementById('dashStatPending');
            const statRevenue = document.getElementById('dashStatRevenue');
            
            if (statProducts) statProducts.innerText = productos.length;
            if (statOrders) statOrders.innerText = pedidos.length;
            if (statPending) statPending.innerText = pedidos.filter(p => p.estado === 'pendiente').length;
            
            const revenue = pedidos.reduce((sum, p) => sum + (parseFloat(p.total) || 0), 0);
            if (statRevenue) statRevenue.innerText = `$${revenue.toFixed(2)}`;

        } catch (e) {
            console.error('Error cargando dashboard:', e);
        }
    },

    // ------------------------------------------------------------
    // Cargar configuración de la tienda
    // ------------------------------------------------------------
    async loadConfig() {
        try {
            const tienda = await AdminAPI.getTienda(this.tiendaActual);
            if (!tienda) return;
            
            // Aquí podrías llenar los campos del formulario de configuración
            console.log('Config tienda:', tienda);
        } catch (e) {
            console.error('Error cargando config:', e);
        }
    }
};

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    AdminApp.init();
});