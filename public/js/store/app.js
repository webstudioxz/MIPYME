// ============================================
// STORE APP - Controlador principal de la tienda
// ============================================
window.StoreApp = {
    currentStore: null,
    allProducts: [],
    categorias: [],
    currentCategory: 'todos',
    currentProduct: null,
    modalQty: 1,

    carouselIndex: 0,
    carouselInterval: null,

    async init() {
        console.log('🚀 Iniciando StoreApp...');

        // 🛑 LO PRIMERO: ocultar el loader SIEMPRE, pase lo que pase
        const loader = document.getElementById('globalLoader');
        if (loader) loader.classList.add('hidden');

        try {
            // Verificar dependencias críticas
            if (typeof StoreAPI === 'undefined') {
                throw new Error('StoreAPI no está cargado (falta /js/store/api.js)');
            }
            if (typeof StoreUI === 'undefined') {
                throw new Error('StoreUI no está cargado (falta /js/store/ui.js)');
            }
            if (typeof StoreUtils === 'undefined') {
                throw new Error('StoreUtils no está cargado (falta /js/store/utils.js)');
            }
            if (typeof Cart === 'undefined') {
                throw new Error('Cart no está cargado (falta /js/store/cart.js)');
            }

            // 1. Detectar tienda
            this.currentStore = StoreUtils.getUrlParam('tienda');
            console.log('🏪 Tienda por URL:', this.currentStore);

            if (!this.currentStore) {
                try {
                    const stores = await StoreAPI.getStoresInfo();
                    if (stores && Array.isArray(stores) && stores.length > 0) {
                        this.currentStore = stores[0].id;
                        console.log('🏪 Tienda por defecto:', this.currentStore);
                    } else {
                        this.showEmptyState('No hay tiendas creadas en el sistema.');
                        return;
                    }
                } catch (e) {
                    console.error('Error obteniendo tiendas:', e);
                    this.showEmptyState('Error de conexión con el servidor.');
                    return;
                }
            }

            // 2. Inicializar carrito
            Cart.init(this.currentStore);

            // 3. Cargar datos
            await this.loadStoreConfig();
            await this.loadSideMenuStores();
            await this.loadProducts();

            // 4. Configurar eventos y UI
            this.setupEventListeners();
            StoreUI.updateCartUI();
            this.checkServerStatus();

            console.log('✅ StoreApp inicializada correctamente');
        } catch (error) {
            console.error('❌ Error fatal en StoreApp.init:', error);
            this.showEmptyState('Error al iniciar la tienda: ' + (error.message || 'desconocido'));
        }
    },

    showEmptyState(msg) {
        const skeleton = document.getElementById('skeletonLoader');
        if (skeleton) skeleton.style.display = 'none';

        const container = document.getElementById('dynamicContent');
        if (container) {
            container.innerHTML = `
                <div class="empty-products" style="text-align:center;padding:60px 20px;">
                    <i class="fas fa-box-open" style="font-size:3rem;opacity:0.3;margin-bottom:16px;display:block;"></i>
                    <h3 style="margin-bottom:8px;">Tienda vacía</h3>
                    <p style="color:#6B7A99;">${msg}</p>
                    <button onclick="window.location.reload()" style="margin-top:20px;background:#1E64FF;color:#fff;border:none;padding:12px 24px;border-radius:999px;font-weight:700;cursor:pointer;">
                        <i class="fas fa-rotate-right"></i> Reintentar
                    </button>
                </div>`;
        }
    },

    async loadStoreConfig() {
        try {
            const [config, tiendaInfo] = await Promise.all([
                StoreAPI.getConfig(),
                StoreAPI.getStoreById(this.currentStore)
            ]);

            if (config?.tasas) {
                const usd = Number(config.tasas.USD);
                const eur = Number(config.tasas.EUR);
                StoreUI.exchangeRates = {
                    CUP: 1,
                    USD: (isFinite(usd) && usd > 0) ? 1 / usd : 25,
                    EUR: (isFinite(eur) && eur > 0) ? 1 / eur : 27
                };
            }

            if (tiendaInfo && tiendaInfo.nombre) {
                StoreUI.storeConfig = tiendaInfo.configuracion || {};
                const headerName = document.getElementById('headerStoreName');
                if (headerName) headerName.innerText = tiendaInfo.nombre;
                document.title = `${tiendaInfo.nombre} - Tienda-fg`;
                const heroTitle = document.getElementById('heroTitle');
                if (heroTitle) heroTitle.innerText = `Bienvenido a ${tiendaInfo.nombre}`;
                const heroDesc = document.getElementById('heroDescription');
                if (tiendaInfo.descripcion && heroDesc) heroDesc.innerText = tiendaInfo.descripcion;
            } else {
                const headerName = document.getElementById('headerStoreName');
                if (headerName) headerName.innerText = this.currentStore;
            }
        } catch (e) {
            console.warn('⚠️ No se pudo cargar la config:', e);
        }
    },

    async loadSideMenuStores() {
        try {
            const stores = await StoreAPI.getStoresInfo();
            const container = document.getElementById('tiendasList');
            if (!container) return;

            if (!stores || stores.length === 0) {
                container.innerHTML = '<p class="text-muted" style="font-size:0.85rem;padding:10px;">No hay otras tiendas</p>';
                return;
            }

            container.innerHTML = stores.map(s => `
                <a href="?tienda=${encodeURIComponent(s.id)}" class="tienda-link ${s.id === this.currentStore ? 'active' : ''}">
                    <span>${s.icono || '🛒'}</span>
                    <span>${s.nombre}</span>
                </a>
            `).join('');
        } catch (e) {
            console.error('Error cargando menú de tiendas:', e);
        }
    },

    async loadProducts() {
        try {
            const products = await StoreAPI.getProducts(this.currentStore);
            this.allProducts = Array.isArray(products) ? products : [];

            if (this.allProducts.length === 0) {
                this.showEmptyState('Esta tienda aún no tiene productos agregados.');
                return;
            }

            this.allProducts = this.allProducts.filter(p => p && p.id != null && p.nombre);

            const catSet = new Set(this.allProducts.map(p => p.categoria || 'otros'));
            this.categorias = Array.from(catSet);

            StoreUI.renderCategorias(this.categorias);
            StoreUI.renderContent(this.allProducts, this.categorias, this.currentCategory);
        } catch (e) {
            console.error('Error cargando productos:', e);
            this.showEmptyState('Error al cargar los productos.');
        }
    },

    filterByCategory(cat) {
        this.currentCategory = cat;
        document.querySelectorAll('.cat-link').forEach(l => l.classList.remove('active'));
        document.querySelector(`.cat-link[data-cat="${cat}"]`)?.classList.add('active');

        const titleEl = document.getElementById('categoryTitle');
        if (titleEl) {
            if (cat === 'todos') {
                titleEl.innerHTML = '<span class="section-icon"><i class="fas fa-leaf"></i></span><span>Todos los Productos</span>';
            } else {
                const label = cat.charAt(0).toUpperCase() + cat.slice(1);
                titleEl.innerHTML = `<span class="section-icon"><i class="fas fa-tag"></i></span><span>${StoreUI.escapeAttr(label)}</span>`;
            }
        }
        StoreUI.renderContent(this.allProducts, this.categorias, cat);
    },

    startCarousel() {
        if (this.carouselInterval) clearInterval(this.carouselInterval);
        const slides = document.querySelectorAll('.category-carousel-slide');
        if (slides.length <= 1) return;

        this.carouselIndex = 0;
        const container = document.querySelector('.category-carousel-slides');
        if (container) container.style.transform = 'translateX(0)';

        this.carouselInterval = setInterval(() => {
            const currentSlides = document.querySelectorAll('.category-carousel-slide');
            if (currentSlides.length <= 1) return;
            this.goToSlide((this.carouselIndex + 1) % currentSlides.length);
        }, 4000);
    },

    goToSlide(index) {
        const slides = document.querySelectorAll('.category-carousel-slide');
        const dots = document.querySelectorAll('.category-dot');
        const container = document.querySelector('.category-carousel-slides');
        if (!container || slides.length === 0) return;

        this.carouselIndex = index;
        container.style.transform = `translateX(-${index * 100}%)`;
        slides.forEach((s, i) => s.classList.toggle('active', i === index));
        dots.forEach((d, i) => d.classList.toggle('active', i === index));
    },

    openProductModal(id) {
        const product = this.allProducts.find(p => p.id == id);
        if (!product) return;
        this.currentProduct = product;
        this.modalQty = 1;

        const precio = Number(product.precio) || 0;
        const descuento = Number(product.descuento) || 0;
        const d = precio * (1 - descuento / 100);
        const available = product.disponible === true || product.disponible === 'true';
        const imgSrc = StoreUI.getImage(product).replace('300', '400');

        document.getElementById('modalBody').innerHTML = `
            <div class="modal-product-image">
                <img src="${imgSrc}" alt="${StoreUI.escapeAttr(product.nombre)}" onerror="this.src='https://via.placeholder.com/400'">
            </div>
            <div class="modal-product-info">
                <h2 class="modal-product-name">${StoreUI.escapeAttr(product.nombre)}</h2>
                <span class="modal-product-category">${StoreUI.escapeAttr(product.categoria || 'otros')}</span>
                <p class="modal-product-description">${StoreUI.escapeAttr(product.descripcion || 'Sin descripción disponible.')}</p>
                <div class="modal-product-price">
                    <span class="modal-price-label">Precio</span>
                    <span class="modal-price-value">${StoreUI.formatPrice(d)}</span>
                    ${descuento ? `<span class="modal-old-price" style="text-decoration:line-through;color:var(--text-muted);font-size:1rem;margin-left:14px;">${StoreUI.formatPrice(precio)}</span>` : ''}
                </div>
                <div class="modal-product-actions">
                    <div class="modal-qty-control">
                        <button class="modal-qty-btn" onclick="StoreApp.changeModalQty(-1)">−</button>
                        <span class="modal-qty-val" id="modalQtyVal">1</span>
                        <button class="modal-qty-btn" onclick="StoreApp.changeModalQty(1)">+</button>
                    </div>
                    <button class="modal-btn-add" onclick="StoreApp.addToCartFromModal()" ${!available ? 'disabled' : ''}>
                        <i class="fas fa-shopping-bag"></i> ${available ? 'Añadir al carrito' : 'Agotado'}
                    </button>
                </div>
            </div>
        `;
        document.getElementById('productModal').classList.add('active');
    },

    closeProductModal() {
        document.getElementById('productModal').classList.remove('active');
    },

    changeModalQty(delta) {
        const newQty = this.modalQty + delta;
        if (newQty >= 1 && newQty <= 3) {
            this.modalQty = newQty;
            document.getElementById('modalQtyVal').innerText = newQty;
        } else if (newQty > 3) {
            StoreUI.showToast('Máximo 3 unidades por producto', 'error');
        }
    },

    addToCartFromModal() {
        if (!this.currentProduct) return;
        const result = Cart.add(this.currentProduct, this.modalQty);
        if (result.success) {
            StoreUI.showToast(`${this.modalQty}x ${this.currentProduct.nombre} añadido`);
            StoreUI.updateCartUI();
            this.closeProductModal();
        } else {
            StoreUI.showToast(result.message, 'error');
        }
    },

    addToCartFromCard(productId, btn) {
        const product = this.allProducts.find(p => p.id == productId);
        if (!product) return;
        const qtyEl = btn.closest('.card-body, .card-body-grande')?.querySelector('.qty-val');
        const qty = qtyEl ? parseInt(qtyEl.innerText) : 1;
        const result = Cart.add(product, qty);
        if (result.success) {
            StoreUI.showToast(`${qty}x ${product.nombre} añadido`);
            StoreUI.updateCartUI();
            if (qtyEl) qtyEl.innerText = '1';
        } else {
            StoreUI.showToast(result.message, 'error');
        }
    },

    modifyCartQty(idx, delta) {
        const result = Cart.modifyQty(idx, delta);
        if (result.success) StoreUI.updateCartUI();
        else if (result.message) StoreUI.showToast(result.message, 'error');
    },

    removeFromCart(idx) {
        Cart.remove(idx);
        StoreUI.updateCartUI();
        StoreUI.showToast('Producto eliminado');
    },

    showCheckoutForm() {
        if (Cart.items.length === 0) {
            StoreUI.showToast('Tu carrito está vacío', 'error');
            return;
        }
        document.getElementById('cartItemsView').style.display = 'none';
        document.getElementById('checkoutFormView').style.display = 'block';
        document.getElementById('cartPanel').classList.add('active');
        StoreUI.toggleBankInfo();
        document.getElementById('checkoutTotalAmount').innerText = StoreUI.formatPrice(Cart.getTotal());
    },

    cancelarCheckout() {
        document.getElementById('checkoutFormView').style.display = 'none';
        document.getElementById('cartItemsView').style.display = 'flex';
    },

    async enviarPedido() {
        const nombre = document.getElementById('cliName').value.trim();
        const telefono = document.getElementById('cliPhone').value.trim();
        const direccion = document.getElementById('cliAddress').value.trim();
        const metodoPago = document.querySelector('input[name="paymentMethod"]:checked')?.value;

        if (!nombre || !telefono || !direccion) {
            StoreUI.showToast('Completa todos los campos obligatorios', 'error');
            return;
        }

        const btn = document.getElementById('btnConfirmarPedido');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        btn.disabled = true;

        try {
            const payload = {
                tienda: this.currentStore,
                nombre, telefono, direccion,
                metodoPago: metodoPago || 'Efectivo',
                moneda: StoreUI.currentCurrency,
                total: Cart.getTotal(),
                items: Cart.items.map(i => ({
                    id: i.id, nombre: i.nombre, precio: i.precio, qty: i.qty, imagen: i.imagen
                }))
            };

            const result = await StoreAPI.crearPedido(payload);

            if (result.success) {
                const codigoBox = document.getElementById('codigoClienteBox');
                const codigoDisplay = document.getElementById('codigoClienteDisplay');
                if (codigoBox && codigoDisplay) {
                    codigoDisplay.innerText = result.codigoCliente || '—';
                    codigoBox.style.display = 'block';
                }
                Cart.clear();
                StoreUI.updateCartUI();
                StoreUI.showToast('✅ Pedido enviado correctamente');
            } else {
                StoreUI.showToast(result.error || 'Error al enviar pedido', 'error');
            }
        } catch (e) {
            console.error('Error enviando pedido:', e);
            StoreUI.showToast('Error de conexión', 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    setupEventListeners() {
        document.getElementById('menuToggle')?.addEventListener('click', () => this.toggleSideMenu(true));
        document.getElementById('menuToggleBottom')?.addEventListener('click', () => this.toggleSideMenu(true));
        document.getElementById('closeMenu')?.addEventListener('click', () => this.toggleSideMenu(false));
        document.getElementById('overlay')?.addEventListener('click', () => this.toggleSideMenu(false));

        document.getElementById('cartBtn')?.addEventListener('click', () => this.toggleCart(true));
        document.getElementById('cartBtnDesktop')?.addEventListener('click', () => this.toggleCart(true));
        document.getElementById('floatingCartBtn')?.addEventListener('click', () => this.toggleCart(true));
        document.getElementById('closeCart')?.addEventListener('click', () => this.toggleCart(false));

        document.getElementById('currencyBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('currencyMenu').classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            const menu = document.getElementById('currencyMenu');
            const btn = document.getElementById('currencyBtn');
            if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
                menu.classList.remove('active');
            }
        });

        document.querySelectorAll('.currency-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const currency = opt.dataset.currency;
                StoreUI.currentCurrency = currency;
                document.getElementById('selectedCurrencyText').innerText = currency;
                document.querySelectorAll('.currency-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                document.getElementById('currencyMenu').classList.remove('active');
                StoreUI.updateCartUI();
                StoreUI.renderContent(this.allProducts, this.categorias, this.currentCategory);
            });
        });
    },

    toggleSideMenu(open) {
        document.getElementById('sideMenu').classList.toggle('mostrar', open);
        document.getElementById('overlay').classList.toggle('mostrar', open);
    },

    toggleCart(open) {
        document.getElementById('cartPanel').classList.toggle('active', open);
        if (open) StoreUI.updateCartUI();
    },

    async checkServerStatus() {
        const status = document.getElementById('footerStatus');
        if (!status) return;
        try {
            const online = await StoreAPI.checkStatus();
            if (online) {
                status.innerHTML = '<i class="fas fa-circle"></i> Sistema En Línea';
                status.className = 'footer-status online';
            } else {
                throw new Error('offline');
            }
        } catch (e) {
            status.innerHTML = '<i class="fas fa-circle"></i> Sin conexión';
            status.className = 'footer-status offline';
        }
    },

    checkServerAndReload() {
        if (navigator.onLine) window.location.reload();
    }
};

document.addEventListener('DOMContentLoaded', () => StoreApp.init());