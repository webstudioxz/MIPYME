window.StoreApp = {
    products: [],
    categorias: [],
    currentStore: '',
    currentCategory: 'todos',
    storeInfo: null,
    primeraCarga: true,

    async init() {
        console.log('Iniciando Tienda-fg...');
        this.currentStore = new URLSearchParams(window.location.search).get('tienda') || '';
        
        Cart.init(this.currentStore);
        
        await this.loadTiendasMenu();
        
        if (!this.currentStore) {
            const container = document.getElementById('dynamicContent');
            if (container) container.innerHTML = '<div class="empty-products"><h3>No hay tiendas disponibles</h3></div>';
            document.getElementById('globalLoader')?.classList.add('hidden');
            return;
        }
        
        await this.updateUIForStore();
        await this.checkServerAndReload();
        
        document.getElementById('globalLoader')?.classList.add('hidden');
        this.initEventListeners();
        StoreUI.updateCartUI();
        console.log(`Tienda inicializada: ${this.currentStore}`);
    },

    async checkServerAndReload() {
        const statusEl = document.getElementById('footerStatus');
        const offlineScreen = document.getElementById('offlineScreen');
        const online = await StoreAPI.checkStatus();
        
        if (online) {
            if (offlineScreen) offlineScreen.classList.remove('active');
            if (statusEl) { statusEl.innerHTML = '<i class="fas fa-circle"></i> Tienda Abierta'; statusEl.className = 'footer-status online'; }
            await this.refreshAllData();
        } else {
            if (offlineScreen) offlineScreen.classList.add('active');
            if (statusEl) { statusEl.innerHTML = '<i class="fas fa-circle"></i> Fuera de Línea'; statusEl.className = 'footer-status offline'; }
            this.loadCachedProducts();
        }
        return online;
    },

    async refreshAllData() {
        try {
            const config = await StoreAPI.getConfig();
            if (config?.tasas) {
                StoreUI.exchangeRates.USD = 1 / config.tasas.USD;
                StoreUI.exchangeRates.EUR = 1 / config.tasas.EUR;
            }
            this.products = await StoreAPI.getProducts(this.currentStore);
            localStorage.setItem(`tienda-fg_products_${this.currentStore}`, JSON.stringify(this.products));
            this.categorias = [...new Set(this.products.map(p => p.categoria || 'otros'))];
            StoreUI.renderCategorias(this.categorias);
            StoreUI.renderContent(this.products, this.categorias, this.currentCategory);
        } catch (e) {
            console.error('Error refrescando datos:', e);
        }
    },

    loadCachedProducts() {
        const cached = localStorage.getItem(`tienda-fg_products_${this.currentStore}`);
        if (cached) {
            try {
                this.products = JSON.parse(cached);
                this.categorias = [...new Set(this.products.map(p => p.categoria || 'otros'))];
                StoreUI.renderCategorias(this.categorias);
                StoreUI.renderContent(this.products, this.categorias, this.currentCategory);
            } catch (e) {}
        }
    },

    filterByCategory(cat) {
        this.currentCategory = cat;
        document.querySelectorAll('.cat-link').forEach(l => l.classList.toggle('active', l.dataset.cat === cat));
        const titleSpan = document.querySelector('#categoryTitle span');
        if (titleSpan) titleSpan.innerText = cat === 'todos' ? 'Todos los Productos' : (cat.charAt(0).toUpperCase() + cat.slice(1));
        StoreUI.renderContent(this.products, this.categorias, cat);
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
            <div class="modal-product-image"><img src="${img}" alt="${p.nombre}"></div>
            <div class="modal-product-info">
                <h2 class="modal-product-name">${p.nombre}</h2>
                <span class="modal-product-category">${p.categoria || 'General'}</span>
                <p class="modal-product-description">${p.descripcion || 'Producto de alta calidad.'}</p>
                <div class="modal-product-features">
                    ${StoreUI.storeConfig?.envio?.disponible ? `<div class="feature-item"><i class="fas fa-truck"></i><span>Envío <small>${StoreUI.storeConfig.envio.tiempo_estimado || '24-48h'}</small></span></div>` : ''}
                    ${StoreUI.storeConfig?.garantia?.disponible ? `<div class="feature-item"><i class="fas fa-shield-alt"></i><span>Garantía <small>${StoreUI.storeConfig.garantia.duracion || '12 meses'}</small></span></div>` : ''}
                </div>
                <div class="modal-product-price">
                    <div class="modal-price-label">Precio</div>
                    <div><span class="modal-price-value">${StoreUI.formatPrice(finalPrice)}</span>${p.descuento ? `<span class="modal-old-price">${StoreUI.formatPrice(p.precio)}</span>` : ''}</div>
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
        const modal = document.getElementById('productModal');
        if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
    },

    closeProductModal() {
        const modal = document.getElementById('productModal');
        if (modal) { modal.classList.remove('active'); document.body.style.overflow = ''; }
    },

    addToCartFromModal(id) {
        const qty = parseInt(document.getElementById('modalQty')?.innerText || 1);
        const product = this.products.find(x => x.id == id);
        if (Cart.add(product, qty)) {
            StoreUI.showToast(`${product.nombre} agregado`);
            StoreUI.updateCartUI();
            this.closeProductModal();
        } else {
            StoreUI.showToast('Producto no disponible', 'error');
        }
    },

    addToCartFromCard(id, btn) {
        if (!btn) return;
        const card = btn.closest('.producto-card');
        if (!card) return;
        const qty = parseInt(card.querySelector('.qty-val')?.innerText || 1);
        const product = this.products.find(x => x.id == id);
        if (Cart.add(product, qty)) {
            StoreUI.updateCartUI();
            StoreUI.showToast(`${product.nombre} agregado`);
            const qtyVal = card.querySelector('.qty-val');
            if (qtyVal) qtyVal.innerText = '1';
            btn.innerHTML = '<i class="fas fa-check"></i><span>Añadido</span>';
            btn.style.background = 'var(--sage-deep)';
            setTimeout(() => { btn.innerHTML = '<i class="fas fa-plus"></i><span>Añadir</span>'; btn.style.background = ''; }, 1200);
        } else {
            StoreUI.showToast('Producto no disponible', 'error');
        }
    },

    modifyCartQty(idx, delta) {
        Cart.modifyQty(idx, delta);
        StoreUI.updateCartUI();
    },

    removeFromCart(idx) {
        Cart.remove(idx);
        StoreUI.updateCartUI();
        StoreUI.showToast('Producto eliminado');
    },

    showCheckoutForm() {
        if (Cart.items.length === 0) { StoreUI.showToast('Agrega productos primero', 'error'); return; }
        document.getElementById('cartItemsView').style.display = 'none';
        document.getElementById('checkoutFormView').style.display = 'block';
        document.getElementById('floatingCheckoutBtn').style.display = 'none';
        document.getElementById('checkoutTotalAmount').innerText = StoreUI.formatPrice(Cart.getTotal());
        document.querySelector('input[name="paymentMethod"][value="Efectivo"]').checked = true;
        StoreUI.toggleBankInfo();
    },

    cancelarCheckout() {
        document.getElementById('cartItemsView').style.display = 'flex';
        document.getElementById('checkoutFormView').style.display = 'none';
        ['cliName', 'cliPhone', 'cliAddress'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        document.getElementById('codigoClienteBox').style.display = 'none';
        if (Cart.items.length) document.getElementById('floatingCheckoutBtn').style.display = 'flex';
    },

    async enviarPedido() {
        const nombre = document.getElementById('cliName')?.value?.trim() || '';
        const telefono = document.getElementById('cliPhone')?.value?.trim() || '';
        const direccion = document.getElementById('cliAddress')?.value?.trim() || '';
        
        if (!nombre) { StoreUI.showToast('El nombre es obligatorio', 'error'); return; }
        if (!telefono) { StoreUI.showToast('El teléfono es obligatorio', 'error'); return; }
        if (!direccion) { StoreUI.showToast('La dirección es obligatoria', 'error'); return; }
        
        const telVal = StoreUtils.validarTelefonoCubano(telefono);
        if (!telVal.valido) { StoreUI.showToast(telVal.mensaje, 'error'); return; }
        
        const dirVal = StoreUtils.validarDireccion(direccion);
        if (!dirVal.valido) { StoreUI.showToast(dirVal.mensaje, 'error'); return; }
        
        const nombreFiltrado = StoreUtils.filtrarPalabrasOfensivas(nombre);
        if (nombreFiltrado.ofensivo) { StoreUI.showToast('El nombre contiene palabras inapropiadas', 'error'); return; }
        
        const dirFiltrada = StoreUtils.filtrarPalabrasOfensivas(direccion);
        if (dirFiltrada.ofensivo) { StoreUI.showToast('La dirección contiene palabras inapropiadas', 'error'); return; }

        const metodoPago = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'Efectivo';
        
        const btn = document.getElementById('btnConfirmarPedido');
        if (!btn) return;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
        btn.disabled = true;

        try {
            const payload = {
                tienda: this.currentStore,
                nombre: StoreUtils.sanitizarTexto(nombreFiltrado.limpio || nombre),
                telefono: telefono.replace(/[^0-9]/g, ''),
                direccion: StoreUtils.sanitizarTexto(dirFiltrada.limpio || direccion),
                items: Cart.items.map(item => ({ id: item.id, nombre: StoreUtils.sanitizarTexto(item.nombre), precio: item.precio, qty: item.qty, imagen: item.imagen || '' })),
                total: parseFloat(Cart.getTotal().toFixed(2)),
                moneda: StoreUI.currentCurrency,
                metodoPago: metodoPago
            };
            
            const data = await StoreAPI.crearPedido(payload);
            
            if (data.success) {
                document.getElementById('codigoClienteDisplay').innerText = data.codigoCliente;
                document.getElementById('codigoClienteBox').style.display = 'block';
                btn.style.display = 'none';
                StoreUI.showToast(`¡Pedido #${data.orderId} registrado! Su código: ${data.codigoCliente}`);
                Cart.clear();
                StoreUI.updateCartUI();
                ['cliName', 'cliPhone', 'cliAddress'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            } else {
                StoreUI.showToast(data.error || 'Error al procesar el pedido', 'error');
            }
        } catch (e) {
            console.error('Error al enviar pedido:', e);
            StoreUI.showToast('Error de conexión. Verifica tu internet.', 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    async updateUIForStore() {
        if (!this.currentStore) return;
        try {
            this.storeInfo = await StoreAPI.getStoreById(this.currentStore);
            StoreUI.storeConfig = await StoreAPI.getStoreConfig(this.currentStore);
            
            document.getElementById('headerStoreName').innerText = this.storeInfo.nombre || 'Tienda-fg';
            document.getElementById('dynamicTitle').innerText = this.storeInfo.nombre || 'Tienda-fg';
            document.getElementById('heroTitle').innerText = `Bienvenido a ${this.storeInfo.nombre || 'Tienda-fg'}`;
            document.getElementById('heroDescription').innerText = this.storeInfo.descripcion || 'Encuentra los mejores productos.';
        } catch (e) {
            console.error('Error updating UI:', e);
        }
    },

    async loadTiendasMenu() {
        try {
            const tiendas = await StoreAPI.getStoresInfo();
            const container = document.getElementById('tiendasList');
            if (!container) return;
            if (!tiendas || tiendas.length === 0) {
                container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">No hay tiendas disponibles</p>';
                return;
            }
            if (this.primeraCarga && (!this.currentStore || this.currentStore === '')) {
                this.currentStore = tiendas[0].id;
                const url = new URL(window.location);
                url.searchParams.set('tienda', this.currentStore);
                window.history.pushState({}, '', url);
                this.primeraCarga = false;
            }
            const existe = tiendas.some(t => t.id === this.currentStore);
            if (!existe && tiendas.length > 0) {
                this.currentStore = tiendas[0].id;
                const url = new URL(window.location);
                url.searchParams.set('tienda', this.currentStore);
                window.history.pushState({}, '', url);
            }
            container.innerHTML = tiendas.map(t => `
                <a href="/?tienda=${t.id}" class="tienda-link ${t.id === this.currentStore ? 'active' : ''}">
                    <i class="fas fa-store"></i> ${t.nombre || t.id}
                </a>
            `).join('');
        } catch (e) {
            console.error('Error loading tiendas menu:', e);
        }
    },

    initEventListeners() {
        // Menu
        const menuToggle = document.getElementById('menuToggle');
        const menuToggleBottom = document.getElementById('menuToggleBottom');
        const closeMenu = document.getElementById('closeMenu');
        const overlay = document.getElementById('overlay');
        const sideMenu = document.getElementById('sideMenu');
        const openMenu = () => { if (sideMenu) sideMenu.classList.add('mostrar'); if (overlay) overlay.classList.add('mostrar'); };
        const closeMenuFn = () => { if (sideMenu) sideMenu.classList.remove('mostrar'); if (overlay) overlay.classList.remove('mostrar'); };
        if (menuToggle) menuToggle.addEventListener('click', openMenu);
        if (menuToggleBottom) menuToggleBottom.addEventListener('click', openMenu);
        if (closeMenu) closeMenu.addEventListener('click', closeMenuFn);
        if (overlay) overlay.addEventListener('click', closeMenuFn);

        // Carrito
        const cartBtn = document.getElementById('cartBtn');
        const closeCart = document.getElementById('closeCart');
        const cartPanel = document.getElementById('cartPanel');
        const floatingCheckoutBtn = document.getElementById('floatingCheckoutBtn');
        const floatingCartBtn = document.getElementById('floatingCartBtn');
        const openCart = () => {
            if (cartPanel) cartPanel.classList.add('active');
            if (floatingCheckoutBtn) floatingCheckoutBtn.style.display = 'none';
            document.getElementById('cartItemsView').style.display = 'flex';
            document.getElementById('checkoutFormView').style.display = 'none';
        };
        if (cartBtn) cartBtn.addEventListener('click', openCart);
        if (floatingCartBtn) floatingCartBtn.addEventListener('click', openCart);
        if (closeCart) closeCart.addEventListener('click', () => {
            if (cartPanel) cartPanel.classList.remove('active');
            if (Cart.items.length && floatingCheckoutBtn) floatingCheckoutBtn.style.display = 'flex';
        });

        // Currency
        const currencyBtn = document.getElementById('currencyBtn');
        const currencyMenu = document.getElementById('currencyMenu');
        if (currencyBtn && currencyMenu) {
            currencyBtn.addEventListener('click', (e) => { e.stopPropagation(); currencyMenu.classList.toggle('active'); });
            document.addEventListener('click', () => currencyMenu.classList.remove('active'));
            document.querySelectorAll('.currency-option').forEach(opt => {
                opt.addEventListener('click', () => {
                    StoreUI.currentCurrency = opt.dataset.currency;
                    document.getElementById('selectedCurrencyText').textContent = StoreUI.currentCurrency;
                    document.querySelectorAll('.currency-option').forEach(o => o.classList.remove('active'));
                    opt.classList.add('active');
                    currencyMenu.classList.remove('active');
                    StoreUI.renderContent(StoreApp.products, StoreApp.categorias, StoreApp.currentCategory);
                    StoreUI.updateCartUI();
                });
            });
        }

        // Validaciones
        ['cliName', 'cliPhone', 'cliAddress'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => { el.classList.remove('error'); });
        });

        // Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (sideMenu) sideMenu.classList.remove('mostrar');
                if (overlay) overlay.classList.remove('mostrar');
                if (cartPanel) cartPanel.classList.remove('active');
                this.closeProductModal();
            }
        });

        // Polling de conexión
        setInterval(() => this.checkServerAndReload(), 30000);
    }
};

document.addEventListener('DOMContentLoaded', () => StoreApp.init());