// ============================================================
// public/js/store/app.js
// App principal de la tienda pública
// ============================================================

window.StoreApp = {
    products: [],
    categorias: [],
    currentCategory: 'todos',
    currentStore: '',
    storeConfig: null,
    storeInfo: null,
    serverOnline: false,

    async init() {
        console.log('🛒 Inicializando tienda...');
        this.currentStore = new URLSearchParams(window.location.search).get('tienda') || '';
        StoreAPI.init(this.currentStore);
        Cart.init(this.currentStore);
        this.setupEventListeners();
        this.initRealtimeValidations();
        await this.loadTiendasMenu();

        if (!this.currentStore) {
            this.showEmptyProducts('No hay tiendas disponibles');
            const loader = document.getElementById('globalLoader');
            if (loader) loader.classList.add('hidden');
            return;
        }

        await this.updateUIForStore();
        await this.checkServerAndReload();
        await this.loadTiendasMenu();
        StoreUI.updateCartUI();
        const loader = document.getElementById('globalLoader');
        if (loader) loader.classList.add('hidden');
        console.log(`✅ Tienda inicializada: ${this.currentStore}`);
    },

    setupEventListeners() {
        document.getElementById('menuToggle')?.addEventListener('click', () => this.toggleMenu());
        document.getElementById('menuToggleBottom')?.addEventListener('click', () => this.toggleMenu());
        document.getElementById('closeMenu')?.addEventListener('click', () => this.toggleMenu(false));
        document.getElementById('overlay')?.addEventListener('click', () => { this.toggleMenu(false); this.toggleCart(false); });
        document.getElementById('cartBtn')?.addEventListener('click', () => this.toggleCart());
        document.getElementById('cartBtnDesktop')?.addEventListener('click', () => this.toggleCart());
        document.getElementById('closeCart')?.addEventListener('click', () => this.toggleCart(false));
        this.setupCurrencyDropdown();

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { this.closeProductModal(); this.toggleMenu(false); this.toggleCart(false); }
        });

        document.getElementById('productModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'productModal') this.closeProductModal();
        });

        setInterval(() => this.checkServerAndReload(), 30000);
    },

    setupCurrencyDropdown() {
        const btn = document.getElementById('currencyBtn');
        const menu = document.getElementById('currencyMenu');
        const dropdown = document.getElementById('currencyDropdown');
        if (!btn || !menu) return;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown?.classList.toggle('open');
            menu.classList.toggle('active');
            btn.setAttribute('aria-expanded', menu.classList.contains('active'));
        });

        document.querySelectorAll('.currency-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.currency-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                StoreUI.currentCurrency = opt.dataset.currency;
                const txt = document.getElementById('selectedCurrencyText');
                if (txt) txt.textContent = StoreUI.currentCurrency;
                dropdown?.classList.remove('open');
                menu.classList.remove('active');
                btn.setAttribute('aria-expanded', 'false');
                this.renderContent();
                StoreUI.updateCartUI();
            });
        });

        document.addEventListener('click', () => {
            dropdown?.classList.remove('open');
            menu.classList.remove('active');
            btn.setAttribute('aria-expanded', 'false');
        });
    },

    async checkServerAndReload() {
        const statusEl = document.getElementById('footerStatus');
        const offlineScreen = document.getElementById('offlineScreen');
        try {
            const r = await fetch('/api/status?_=' + Date.now());
            if (r.ok) {
                this.serverOnline = true;
                offlineScreen?.classList.remove('active');
                if (statusEl) { statusEl.innerHTML = '<i class="fas fa-circle"></i> Tienda Abierta'; statusEl.className = 'footer-status online'; }
                await this.refreshAllData();
                return true;
            }
        } catch (e) { /* offline */ }
        this.serverOnline = false;
        offlineScreen?.classList.add('active');
        if (statusEl) { statusEl.innerHTML = '<i class="fas fa-circle"></i> Fuera de Línea'; statusEl.className = 'footer-status offline'; }
        this.loadCachedProducts();
        return false;
    },

    async refreshAllData() {
        try {
            const [conf, prods] = await Promise.all([StoreAPI.getConfig(), StoreAPI.getProductos(this.currentStore)]);
            if (conf?.tasas) { StoreUI.exchangeRates.USD = 1 / conf.tasas.USD; StoreUI.exchangeRates.EUR = 1 / conf.tasas.EUR; }
            this.products = prods || [];
            localStorage.setItem(`tienda-fg_products_${this.currentStore}`, JSON.stringify(this.products));
            this.categorias = [...new Set(this.products.map(p => p.categoria || 'otros'))];
            StoreUI.renderCategorias(this.categorias);
            this.renderContent();
            return true;
        } catch (e) { this.loadCachedProducts(); return false; }
    },

    loadCachedProducts() {
        const cached = localStorage.getItem(`tienda-fg_products_${this.currentStore}`);
        if (cached) {
            try {
                this.products = JSON.parse(cached);
                this.categorias = [...new Set(this.products.map(p => p.categoria || 'otros'))];
                StoreUI.renderCategorias(this.categorias);
                this.renderContent();
            } catch (e) { this.showEmptyProducts(); }
        } else { this.showEmptyProducts(); }
    },

    renderContent() { StoreUI.renderContent(this.products, this.categorias, this.currentCategory); },

    showEmptyProducts(msg = 'No hay productos disponibles') {
        const c = document.getElementById('dynamicContent');
        const skeleton = document.getElementById('skeletonLoader');
        if (skeleton) skeleton.style.display = 'none';
        if (c) c.innerHTML = `<div class="empty-products"><i class="fas fa-leaf"></i><h3>${msg}</h3></div>`;
    },

    filterByCategory(cat) {
        this.currentCategory = cat;
        document.querySelectorAll('.cat-link').forEach(l => l.classList.toggle('active', l.dataset.cat === cat));
        const title = document.querySelector('#categoryTitle span');
        if (title) title.textContent = cat === 'todos' ? 'Todos los Productos' : cat.charAt(0).toUpperCase() + cat.slice(1);
        this.renderContent();
        document.getElementById('productosSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    toggleMenu(force) {
        const menu = document.getElementById('sideMenu');
        const overlay = document.getElementById('overlay');
        if (!menu || !overlay) return;
        const show = typeof force === 'boolean' ? force : !menu.classList.contains('mostrar');
        menu.classList.toggle('mostrar', show);
        const cartActive = document.getElementById('cartPanel')?.classList.contains('active');
        overlay.classList.toggle('mostrar', show || cartActive);
        document.body.style.overflow = (show || cartActive) ? 'hidden' : '';
    },

    toggleCart(force) {
        const cart = document.getElementById('cartPanel');
        const overlay = document.getElementById('overlay');
        if (!cart || !overlay) return;
        const show = typeof force === 'boolean' ? force : !cart.classList.contains('active');
        cart.classList.toggle('active', show);
        const menuActive = document.getElementById('sideMenu')?.classList.contains('mostrar');
        overlay.classList.toggle('mostrar', show || menuActive);
        document.body.style.overflow = (show || menuActive) ? 'hidden' : '';
        if (show) {
            document.getElementById('cartItemsView').style.display = 'flex';
            document.getElementById('checkoutFormView').style.display = 'none';
        }
    },

    openProductModal(id) {
        const p = this.products.find(x => x.id == id);
        if (!p) return;
        const available = p.disponible === true || p.disponible === 'true';
        const finalPrice = p.precio * (1 - (p.descuento || 0) / 100);
        const img = Array.isArray(p.imagen) ? p.imagen[0] : p.imagen || 'https://via.placeholder.com/500';
        const modalBody = document.getElementById('modalBody');
        if (!modalBody) return;

        modalBody.innerHTML = `
            <div class="modal-product-image"><img src="${img}" alt="${p.nombre}" loading="lazy"></div>
            <div class="modal-product-info">
                <span class="modal-product-category">${p.categoria || 'General'}</span>
                <h2 class="modal-product-name">${p.nombre}</h2>
                <p class="modal-product-description">${p.descripcion || 'Producto de alta calidad.'}</p>
                <div class="modal-product-features">
                    ${this.storeConfig?.envio?.disponible ? `<div class="feature-item"><i class="fas fa-truck"></i><span>Envío <small>${this.storeConfig.envio.tiempo_estimado || '24-48h'}</small></span></div>` : ''}
                    ${this.storeConfig?.garantia?.disponible ? `<div class="feature-item"><i class="fas fa-shield-alt"></i><span>Garantía <small>${this.storeConfig.garantia.duracion || '12 meses'}</small></span></div>` : ''}
                </div>
                <div class="modal-product-price">
                    <span class="modal-price-label">Precio</span>
                    <span class="modal-price-value">${StoreUI.formatPrice(finalPrice)}</span>
                    ${p.descuento ? `<span class="modal-old-price">${StoreUI.formatPrice(p.precio)}</span>` : ''}
                </div>
                <div class="modal-product-actions">
                    <div class="modal-qty-control">
                        <button class="modal-qty-btn" onclick="StoreUI.updateModalQty(-1)" ${!available ? 'disabled' : ''}>−</button>
                        <span class="modal-qty-val" id="modalQty">1</span>
                        <button class="modal-qty-btn" onclick="StoreUI.updateModalQty(1)" ${!available ? 'disabled' : ''}>+</button>
                    </div>
                    <button class="modal-btn-add" onclick="StoreApp.addToCartFromModal(${p.id})" ${!available ? 'disabled' : ''}>
                        <i class="fas fa-cart-plus"></i> ${available ? 'Añadir al Carrito' : 'Agotado'}
                    </button>
                </div>
            </div>
        `;
        document.getElementById('productModal').classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    closeProductModal() {
        document.getElementById('productModal')?.classList.remove('active');
        document.body.style.overflow = '';
    },

    addToCartFromModal(id) {
        const qty = parseInt(document.getElementById('modalQty')?.innerText || 1);
        this.addToCart(id, qty);
        this.closeProductModal();
    },

    addToCartFromCard(id, btn) {
        const card = btn.closest('.producto-card');
        const qty = parseInt(card.querySelector('.qty-val')?.innerText || 1);
        this.addToCart(id, qty);
        const qtyVal = card.querySelector('.qty-val');
        if (qtyVal) qtyVal.innerText = '1';
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i><span>Añadido</span>';
        btn.style.background = 'var(--success)';
        setTimeout(() => { btn.innerHTML = originalHTML; btn.style.background = ''; }, 1200);
    },

    addToCart(id, qty) {
        const p = this.products.find(x => x.id == id);
        if (!p) return;
        const result = Cart.add(p, qty);
        if (result.success) { StoreUI.updateCartUI(); StoreUI.showToast(`${p.nombre} agregado`); }
        else { StoreUI.showToast(result.message, 'error'); }
    },

    modifyCartQty(idx, delta) {
        const result = Cart.modifyQty(idx, delta);
        if (result.success) { StoreUI.updateCartUI(); }
        else { StoreUI.showToast(result.message, 'error'); }
    },

    removeFromCart(idx) {
        Cart.remove(idx);
        StoreUI.updateCartUI();
        StoreUI.showToast('Producto eliminado');
    },

    showCheckoutForm() {
        if (!Cart.items.length) { StoreUI.showToast('Agrega productos primero', 'error'); return; }
        document.getElementById('cartItemsView').style.display = 'none';
        document.getElementById('checkoutFormView').style.display = 'block';
        document.getElementById('floatingCheckoutBtn').style.display = 'none';
        const total = Cart.getTotal();
        const el = document.getElementById('checkoutTotalAmount');
        if (el) el.innerText = StoreUI.formatPrice(total);
        const efectivoRadio = document.querySelector('input[name="paymentMethod"][value="Efectivo"]');
        if (efectivoRadio) efectivoRadio.checked = true;
        const codigoBox = document.getElementById('codigoClienteBox');
        if (codigoBox) codigoBox.style.display = 'none';
        StoreUI.toggleBankInfo();
    },

    cancelarCheckout() {
        document.getElementById('cartItemsView').style.display = 'flex';
        document.getElementById('checkoutFormView').style.display = 'none';
        ['cliName', 'cliPhone', 'cliAddress'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
            const warningId = id === 'cliName' ? 'nameWarning' : id === 'cliPhone' ? 'phoneWarning' : 'addressWarning';
            const warning = document.getElementById(warningId);
            if (warning) warning.style.display = 'none';
        });
        const codigoBox = document.getElementById('codigoClienteBox');
        if (codigoBox) codigoBox.style.display = 'none';
        if (Cart.items.length) { document.getElementById('floatingCheckoutBtn').style.display = 'flex'; }
    },

    async enviarPedido() {
        const nombre = document.getElementById('cliName')?.value?.trim() || '';
        const telefono = document.getElementById('cliPhone')?.value?.trim() || '';
        const direccion = document.getElementById('cliAddress')?.value?.trim() || '';

        if (!nombre || !telefono || !direccion) { StoreUI.showToast('Todos los campos son obligatorios', 'error'); return; }
        const telVal = StoreUtils.validarTelefonoCubano(telefono);
        if (!telVal.valido) { StoreUI.showToast(telVal.mensaje, 'error'); return; }
        const dirVal = StoreUtils.validarDireccion(direccion);
        if (!dirVal.valido) { StoreUI.showToast(dirVal.mensaje, 'error'); return; }
        if (!Cart.items.length) { StoreUI.showToast('Carrito vacío', 'error'); return; }

        const metodoPago = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'Efectivo';
        const btn = document.getElementById('btnConfirmarPedido');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
        btn.disabled = true;

        try {
            const total = Cart.getTotal();
            const payload = {
                tienda: this.currentStore,
                nombre: StoreUtils.sanitizarTexto(nombre),
                telefono: telVal.limpio,
                direccion: StoreUtils.sanitizarTexto(direccion),
                items: Cart.items.map(item => ({
                    id: item.id, nombre: StoreUtils.sanitizarTexto(item.nombre),
                    precio: item.precio, qty: item.qty, imagen: item.imagen || ''
                })),
                total: parseFloat(total.toFixed(2)),
                moneda: StoreUI.currentCurrency,
                metodoPago
            };
            const data = await StoreAPI.crearPedido(payload);
            if (data.success) {
                document.getElementById('codigoClienteDisplay').innerText = data.codigoCliente;
                document.getElementById('codigoClienteBox').style.display = 'block';
                btn.style.display = 'none';
                StoreUI.showToast(`¡Pedido #${data.orderId} registrado! Código: ${data.codigoCliente}`);
                Cart.clear();
                StoreUI.updateCartUI();
                ['cliName', 'cliPhone', 'cliAddress'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            } else { throw new Error(data.error || 'Error al procesar'); }
        } catch (e) {
            console.error("Error en pedido:", e);
            StoreUI.showToast(e.message || 'Error de conexión.', 'error');
            btn.style.display = 'flex';
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    async loadTiendasMenu() {
        try {
            const tiendas = await StoreAPI.getTiendasInfo();
            const container = document.getElementById('tiendasList');
            if (!container) return;
            if (!tiendas || tiendas.length === 0) { container.innerHTML = '<p style="text-align:center;">No hay tiendas</p>'; return; }
            if (!this.currentStore) {
                this.currentStore = tiendas[0].id;
                StoreAPI.init(this.currentStore);
                Cart.init(this.currentStore);
                const url = new URL(window.location); url.searchParams.set('tienda', this.currentStore); window.history.pushState({}, '', url);
            }
            container.innerHTML = tiendas.map(t => `<a href="/?tienda=${t.id}" class="tienda-link ${t.id === this.currentStore ? 'active' : ''}"><i class="fas fa-store"></i><div><strong>${t.nombre}</strong><small>${t.descripcion || ''}</small></div></a>`).join('');
        } catch (e) { console.error(e); }
    },

    async updateUIForStore() {
        if (!this.currentStore) return;
        try {
            this.storeInfo = await StoreAPI.getTienda(this.currentStore);
            this.storeConfig = await StoreAPI.getStoreConfig(this.currentStore);
            const headerName = document.getElementById('headerStoreName');
            const heroTitle = document.getElementById('heroTitle');
            const heroDesc = document.getElementById('heroDescription');
            if (headerName) headerName.innerText = this.storeInfo.nombre || 'Tienda-fg';
            if (heroTitle) heroTitle.innerText = `Bienvenido a ${this.storeInfo.nombre || 'Tienda-fg'}`;
            if (heroDesc) heroDesc.innerText = this.storeInfo.descripcion || 'Encuentra los mejores productos.';
        } catch (e) { console.error(e); }
    },

    initRealtimeValidations() {
        const nameInput = document.getElementById('cliName');
        const nameWarning = document.getElementById('nameWarning');
        const nameWarningText = document.getElementById('nameWarningText');
        if (nameInput && nameWarning) {
            nameInput.addEventListener('input', function() {
                const result = StoreUtils.filtrarPalabrasOfensivas(this.value);
                if (result.ofensivo) {
                    this.classList.add('error'); nameWarning.style.display = 'block';
                    nameWarningText.innerHTML = `Palabras inapropiadas: <strong>${result.palabras.join(', ')}</strong>`;
                    this.value = result.limpio;
                } else { this.classList.remove('error'); nameWarning.style.display = 'none'; }
            });
        }
        const phoneInput = document.getElementById('cliPhone');
        const phoneWarning = document.getElementById('phoneWarning');
        const phoneWarningText = document.getElementById('phoneWarningText');
        if (phoneInput && phoneWarning) {
            phoneInput.addEventListener('input', function() {
                this.value = this.value.replace(/[^0-9]/g, '');
                const v = this.value.trim();
                this.classList.remove('error'); phoneWarning.style.display = 'none';
                if (v.length > 0) {
                    const result = StoreUtils.validarTelefonoCubano(v);
                    if (!result.valido) { this.classList.add('error'); phoneWarning.style.display = 'block'; phoneWarningText.innerHTML = result.mensaje; }
                }
            });
        }
        const addressInput = document.getElementById('cliAddress');
        const addressWarning = document.getElementById('addressWarning');
        const addressWarningText = document.getElementById('addressWarningText');
        if (addressInput && addressWarning) {
            addressInput.addEventListener('input', function() {
                const v = this.value;
                this.classList.remove('error'); addressWarning.style.display = 'none';
                if (v.length > 0) {
                    const result = StoreUtils.validarDireccion(v);
                    if (!result.valido) { this.classList.add('error'); addressWarning.style.display = 'block'; addressWarningText.innerHTML = result.mensaje; }
                }
            });
        }
    }
};

window.showToast = (msg, type) => StoreUI.showToast(msg, type);
document.addEventListener('DOMContentLoaded', () => StoreApp.init());