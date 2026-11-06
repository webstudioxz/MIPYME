window.StoreApp = {
    currentStore: null,
    allProducts: [],
    categorias: [],
    currentCategory: 'todos',

    async init() {
        const loader = document.getElementById('globalLoader');
        if (loader) loader.classList.add('hidden');

        try {
            this.currentStore = StoreUtils.getUrlParam('tienda');
            if (!this.currentStore) {
                const stores = await StoreAPI.getStoresInfo();
                if (stores && stores.length > 0) this.currentStore = stores[0].id;
                else return this.showEmptyState('No hay tiendas creadas.');
            }

            Cart.init(this.currentStore);
            await this.loadStoreConfig();
            await this.loadSideMenuStores();
            await this.loadProducts();
            this.setupEventListeners();
            StoreUI.updateCartUI();
        } catch (error) {
            console.error(error);
            this.showEmptyState('Error al cargar la tienda.');
        }
    },

    setupEventListeners() {
        document.getElementById('menuToggle')?.addEventListener('click', () => this.toggleSideMenu(true));
        document.getElementById('menuToggleBottom')?.addEventListener('click', () => this.toggleSideMenu(true));
        document.getElementById('closeMenu')?.addEventListener('click', () => this.toggleSideMenu(false));
        document.getElementById('overlay')?.addEventListener('click', () => { this.toggleSideMenu(false); this.toggleCart(false); });

        document.getElementById('cartBtn')?.addEventListener('click', () => this.toggleCart(true));
        document.getElementById('cartBtnDesktop')?.addEventListener('click', () => this.toggleCart(true));
        document.getElementById('closeCart')?.addEventListener('click', () => this.toggleCart(false));

        document.getElementById('currencyBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('currencyMenu').classList.toggle('active');
        });

        document.querySelectorAll('.currency-option').forEach(opt => {
            opt.addEventListener('click', () => {
                StoreUI.currentCurrency = opt.dataset.currency;
                document.getElementById('selectedCurrencyText').innerText = opt.dataset.currency;
                document.querySelectorAll('.currency-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                document.getElementById('currencyMenu').classList.remove('active');
                StoreUI.updateCartUI();
                StoreUI.renderContent(this.allProducts, this.categorias, this.currentCategory);
            });
        });
    },

    async loadStoreConfig() {
        try {
            const [config, tiendaInfo] = await Promise.all([StoreAPI.getConfig(), StoreAPI.getStoreById(this.currentStore)]);
            if (config?.tasas) {
                StoreUI.exchangeRates = {
                    CUP: 1,
                    USD: config.tasas.USD ? 1 / config.tasas.USD : 25,
                    EUR: config.tasas.EUR ? 1 / config.tasas.EUR : 27
                };
            }
            if (tiendaInfo && tiendaInfo.nombre) {
                document.getElementById('headerStoreName').innerText = tiendaInfo.nombre;
                document.getElementById('heroTitle').innerText = `Bienvenido a ${tiendaInfo.nombre}`;
            }
        } catch (e) { console.warn(e); }
    },

    async loadSideMenuStores() {
        try {
            const stores = await StoreAPI.getStoresInfo();
            const container = document.getElementById('tiendasList');
            if (!container || !stores) return;
            container.innerHTML = stores.map(s => `
                <a href="?tienda=${s.id}" class="tienda-link ${s.id === this.currentStore ? 'active' : ''}">
                    <i class="fas fa-shop"></i> <div><strong>${s.nombre}</strong></div>
                </a>
            `).join('');
        } catch (e) { console.warn(e); }
    },

    async loadProducts() {
        try {
            const products = await StoreAPI.getProducts(this.currentStore);
            this.allProducts = Array.isArray(products) ? products : [];
            if (this.allProducts.length === 0) return this.showEmptyState('Esta tienda no tiene productos.');
            
            const catSet = new Set(this.allProducts.map(p => p.categoria || 'otros'));
            this.categorias = Array.from(catSet);
            StoreUI.renderCategorias(this.categorias);
            StoreUI.renderContent(this.allProducts, this.categorias, this.currentCategory);
        } catch (e) { console.warn(e); }
    },

    filterByCategory(cat) {
        this.currentCategory = cat;
        document.querySelectorAll('.cat-link').forEach(l => l.classList.remove('active'));
        document.querySelector(`.cat-link[data-cat="${cat}"]`)?.classList.add('active');
        document.getElementById('categoryTitle').innerText = cat === 'todos' ? 'Todos los Productos' : cat.toUpperCase();
        StoreUI.renderContent(this.allProducts, this.categorias, cat);
    },

    toggleSideMenu(open) {
        document.getElementById('sideMenu').classList.toggle('mostrar', open);
        document.getElementById('overlay').classList.toggle('mostrar', open);
        document.body.style.overflow = open ? 'hidden' : '';
    },

    toggleCart(open) {
        document.getElementById('cartPanel').classList.toggle('active', open);
        document.getElementById('overlay').classList.toggle('mostrar', open);
        document.body.style.overflow = open ? 'hidden' : '';
        if (open) StoreUI.updateCartUI();
    },

    showEmptyState(msg) {
        const sk = document.getElementById('skeletonLoader');
        if (sk) sk.style.display = 'none';
        document.getElementById('dynamicContent').innerHTML = `<div style="text-align:center;padding:40px;grid-column:1/-1;"><h3>${msg}</h3></div>`;
    },

    addToCartFromCard(productId, btn) {
        const p = this.allProducts.find(x => x.id == productId);
        if (!p) return;
        const qty = parseInt(btn.closest('.card-footer').querySelector('.qty-val').innerText) || 1;
        if (Cart.add(p, qty).success) {
            StoreUI.updateCartUI();
            StoreUI.showToast('Añadido al carrito');
            btn.closest('.card-footer').querySelector('.qty-val').innerText = '1';
        }
    },

    modifyCartQty(idx, delta) {
        if (Cart.modifyQty(idx, delta).success) StoreUI.updateCartUI();
    },

    removeFromCart(idx) {
        Cart.remove(idx);
        StoreUI.updateCartUI();
    },

    openProductModal(id) {
        const p = this.allProducts.find(x => x.id == id);
        if (!p) return;
        const d = p.precio * (1 - (p.descuento || 0) / 100);
        document.getElementById('modalBody').innerHTML = `
            <div class="modal-product-image"><img src="${StoreUI.getImage(p)}"></div>
            <div class="modal-product-info">
                <h2 class="modal-product-name">${p.nombre}</h2>
                <span class="modal-product-category">${p.categoria || 'otros'}</span>
                <p class="modal-product-description">${p.descripcion || 'Sin descripción.'}</p>
                <div class="modal-product-price"><span class="modal-price-value">${StoreUI.formatPrice(d)}</span></div>
                <button class="modal-btn-add" onclick="StoreApp.addToCartFromModal(${p.id})"><i class="fas fa-cart-plus"></i> Añadir al Carrito</button>
            </div>
        `;
        document.getElementById('productModal').classList.add('active');
    },

    closeProductModal() {
        document.getElementById('productModal').classList.remove('active');
    },

    addToCartFromModal(id) {
        const p = this.allProducts.find(x => x.id == id);
        if (Cart.add(p, 1).success) {
            StoreUI.updateCartUI();
            this.closeProductModal();
            StoreUI.showToast('Añadido al carrito');
        }
    },

    showCheckoutForm() {
        StoreUI.showToast('Función de checkout en mantenimiento', 'info');
    }
};

document.addEventListener('DOMContentLoaded', () => StoreApp.init());