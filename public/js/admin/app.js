window.StoreApp = {
    products: [], categorias: [], currentCategory: 'todos', currentStore: '',
    storeConfig: null, storeInfo: null, serverOnline: false,
    isBookingMode: false, selectedTime: null, currentProductName: '',

    async init() {
        this.currentStore = new URLSearchParams(window.location.search).get('tienda') || '';
        const lastStore = localStorage.getItem('tienda-fg_last_store');
        if (lastStore && lastStore !== this.currentStore) {
            localStorage.removeItem(`tienda-fg_products_${lastStore}`);
            localStorage.removeItem(`tienda-fg_cart_${lastStore}`);
        }
        if (this.currentStore) localStorage.setItem('tienda-fg_last_store', this.currentStore);

        StoreAPI.init(this.currentStore);
        Cart.init(this.currentStore);
        this.setupEventListeners();
        await this.loadTiendasMenu();

        if (!this.currentStore) {
            this.showEmptyProducts('No hay tiendas disponibles');
            return;
        }

        await this.updateUIForStore();
        await this.cargarDatosIniciales();
        StoreUI.updateCartUI();
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
                this.renderContent();
                StoreUI.updateCartUI();
            });
        });

        document.addEventListener('click', () => {
            dropdown?.classList.remove('open');
            menu.classList.remove('active');
        });
    },

    async cargarDatosIniciales() {
        try {
            const [conf, prods] = await Promise.all([StoreAPI.getConfig(), StoreAPI.getProductos(this.currentStore)]);
            if (conf?.tasas) { StoreUI.exchangeRates.USD = 1 / conf.tasas.USD; StoreUI.exchangeRates.EUR = 1 / conf.tasas.EUR; }
            
            this.products = prods || [];
            localStorage.setItem(`tienda-fg_products_${this.currentStore}`, JSON.stringify(this.products));
            this.categorias = [...new Set(this.products.map(p => p.categoria || 'otros'))];
            
            StoreUI.renderCategorias(this.categorias);
            this.renderContent();
            this.serverOnline = true;
        } catch (e) { 
            this.serverOnline = false;
            this.loadCachedProducts(); 
        }
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
        if (c) c.innerHTML = `<div class="empty-products" style="grid-column:1/-1; text-align:center; padding:40px;"><i class="fas fa-leaf" style="font-size:3rem;color:#cbd5e1;margin-bottom:15px;"></i><h3>${msg}</h3></div>`;
    },

    filterByCategory(cat) {
        this.currentCategory = cat;
        document.querySelectorAll('.cat-pill, .cat-link').forEach(l => l.classList.toggle('active', l.dataset.cat === cat));
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
        if (this.isBookingMode) return;
        const cart = document.getElementById('cartPanel');
        const overlay = document.getElementById('overlay');
        if (!cart || !overlay) return;
        const show = typeof force === 'boolean' ? force : !cart.classList.contains('active');
        cart.classList.toggle('mostrar', show);
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
        this.currentProductName = p.nombre;
        const available = p.disponible === true || p.disponible === 'true';
        const finalPrice = p.precio * (1 - (p.descuento || 0) / 100);
        const img = Array.isArray(p.imagen) ? p.imagen[0] : p.imagen || 'https://via.placeholder.com/500';
        const modalBody = document.getElementById('modalBody');
        if (!modalBody) return;

        const cfg = this.storeConfig || {};
        const envio = cfg.envio?.disponible ? `Sí, envío a domicilio (${cfg.envio.tiempo_estimado || '24-48h'})` : 'Solo retiro en tienda';
        const garantia = cfg.garantia?.disponible ? (cfg.garantia.duracion || '12 meses') : 'Sin garantía';
        // Prioridad al WhatsApp de confirmación
        const telefono = cfg.datos_bancarios?.whatsapp_confirmacion || cfg.contacto?.telefono || '';
        const msgWa = encodeURIComponent(`Hola, estoy interesado en el producto: *${p.nombre}*. ¿Me pueden dar más información?`);
        const waLink = telefono ? `https://wa.me/${telefono.replace(/\D/g, '')}?text=${msgWa}` : null;

        const ratings = JSON.parse(localStorage.getItem('tienda-fg_ratings') || '{}');
        const pRating = ratings[p.id] || { sum: 0, count: 0, userVoted: false };
        const avg = pRating.count > 0 ? (pRating.sum / pRating.count).toFixed(1) : '0.0';
        const count = pRating.count;

        let starsHtml = '';
        for (let i = 1; i <= 5; i++) {
            starsHtml += `<i class="fas fa-star" style="color: ${i <= Math.round(avg) ? '#FFB800' : '#E2E8F0'}" onclick="StoreApp.rateProduct(${p.id}, ${i})"></i>`;
        }

        modalBody.innerHTML = `
            <div class="modal-product-image"><img src="${img}" alt="${p.nombre}"></div>
            <div class="modal-product-info">
                <span class="modal-product-category">${p.categoria || 'General'}</span>
                <h2 class="modal-product-name">${p.nombre}</h2>
                
                <div class="d-flex align-items-center gap-2 mb-3">
                    <div class="modal-rating-stars">${starsHtml}</div>
                    <span class="text-muted small fw-bold" id="modalRatingText">${avg} (${count} votos)</span>
                </div>

                <div class="modal-price-container mb-3">
                    <span class="modal-price-value">${StoreUI.formatPrice(finalPrice)}</span>
                    ${p.descuento ? `<span class="old-price" style="margin-left:10px; text-decoration:line-through; color:var(--muted);">${StoreUI.formatPrice(p.precio)}</span>` : ''}
                </div>
                
                <p class="modal-product-description">${p.descripcion || 'Sin descripción detallada.'}</p>
                
                <div class="modal-features-list">
                    <div class="modal-feature-row"><i class="fas fa-truck"></i> <span><strong>Envío:</strong> ${envio}</span></div>
                    <div class="modal-feature-row"><i class="fas fa-shield-alt"></i> <span><strong>Garantía:</strong> ${garantia}</span></div>
                    ${p.requiere_carnet ? `<div class="modal-feature-row"><i class="fas fa-id-card"></i> <span><strong>Requisito:</strong> Carnet de identidad obligatorio</span></div>` : ''}
                </div>
                
                <div class="modal-product-actions">
                    <div class="modal-qty-control">
                        <button class="modal-qty-btn" onclick="StoreUI.updateModalQty(-1)" ${!available ? 'disabled' : ''}>−</button>
                        <span class="modal-qty-val" id="modalQty">1</span>
                        <button class="modal-qty-btn" onclick="StoreUI.updateModalQty(1)" ${!available ? 'disabled' : ''}>+</button>
                    </div>
                    <button class="modal-btn-add" onclick="StoreApp.addToCartFromModal(${p.id})" ${!available ? 'disabled' : ''}>
                        <i class="fas fa-cart-plus"></i> Añadir
                    </button>
                    ${waLink ? `<a href="${waLink}" target="_blank" class="modal-btn-wa"><i class="fab fa-whatsapp"></i></a>` : ''}
                </div>
            </div>
        `;
        
        document.getElementById('productModal').classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    rateProduct(id, stars) {
        const ratings = JSON.parse(localStorage.getItem('tienda-fg_ratings') || '{}');
        if (ratings[id] && ratings[id].userVoted) {
            StoreUI.showToast('Ya has calificado este producto', 'warning');
            return;
        }

        if (!ratings[id]) ratings[id] = { sum: 0, count: 0 };
        ratings[id].sum += stars;
        ratings[id].count += 1;
        ratings[id].userVoted = true;
        localStorage.setItem('tienda-fg_ratings', JSON.stringify(ratings));

        StoreUI.showToast(`¡Gracias! Has calificado con ${stars} estrellas`);
        
        this.openProductModal(id);
        this.renderContent();
    },

    closeProductModal() {
        document.getElementById('productModal')?.classList.remove('active');
        document.body.style.overflow = '';
    },

    // 🚨 NUEVO: Abrir Mis Pedidos
    abrirMisPedidos() {
        this.toggleMenu(false);
        let savedOrders = JSON.parse(localStorage.getItem('mis_pedidos_fg') || '[]');
        const modalBody = document.getElementById('modalBody');
        
        if (savedOrders.length === 0) {
            modalBody.innerHTML = `
                <div style="padding:40px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:center;">
                    <i class="fas fa-receipt" style="font-size:3rem;color:#cbd5e1;margin-bottom:16px;"></i>
                    <h3 style="font-family:var(--font-display);font-weight:800;margin-bottom:8px;">No tienes pedidos pendientes</h3>
                    <p style="color:var(--muted);">Tus compras aparecerán aquí una vez que realices un pedido.</p>
                </div>`;
        } else {
            let html = '<div style="padding: 24px;">';
            html += '<h2 style="font-family:var(--font-display);font-weight:800;margin-bottom:20px;color:var(--ink);">Mis Pedidos</h2>';
            savedOrders.reverse().forEach(o => {
                html += `
                <div style="background:#F8FAFC;padding:16px;border-radius:12px;margin-bottom:12px;border:1px solid var(--line-soft);display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <div style="font-weight:700;color:var(--ink);">Pedido #${o.id}</div>
                        <div style="font-size:0.85rem;color:var(--muted);">${new Date(o.date).toLocaleDateString()}</div>
                    </div>
                    <div style="background:var(--brand-tint);color:var(--brand);padding:8px 16px;border-radius:8px;font-weight:800;font-family:monospace;font-size:1.2rem;letter-spacing:1px;">${o.code}</div>
                </div>`;
            });
            html += '</div>';
            modalBody.innerHTML = html;
        }
        document.getElementById('productModal').classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    // 🚨 NUEVO: Abrir Mi Perfil
    async abrirMiPerfil() {
        this.toggleMenu(false);
        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `<div style="padding:40px;text-align:center;"><i class="fas fa-spinner fa-spin fa-2x" style="color:var(--brand);"></i></div>`;
        document.getElementById('productModal').classList.add('active');
        document.body.style.overflow = 'hidden';

        try {
            const { data: { user } } = await window.supabaseClient.auth.getUser();
            if (user) {
                const res = await fetch(`/api/mi-tienda?owner_id=${user.id}`);
                const storeData = await res.json();
                
                let storeBtn = '';
                if (storeData.success && storeData.store) {
                    storeBtn = `<a href="/admin-cliente?tienda=${storeData.store.id}" class="btn btn-primary w-100 mt-3" style="padding:12px;border-radius:12px;font-weight:700;">Ir a mi Panel de Administración</a>`;
                } else {
                    storeBtn = `<button class="btn btn-outline-primary w-100 mt-3" onclick="document.getElementById('productModal').classList.remove('active'); openOverlay('plans')" style="padding:12px;border-radius:12px;font-weight:700;">Crear mi Tienda</button>`;
                }

                modalBody.innerHTML = `
                    <div style="padding: 32px 24px; text-align: center; display:flex;flex-direction:column;justify-content:center;height:100%;">
                        <div style="width:80px;height:80px;border-radius:50%;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center;font-size:2rem;margin:0 auto 16px;"><i class="fas fa-user"></i></div>
                        <h2 style="font-family:var(--font-display);font-weight:800;margin-bottom:4px;color:var(--ink);">${user.email.split('@')[0]}</h2>
                        <p style="color:var(--muted);margin-bottom:24px;">${user.email}</p>
                        ${storeBtn}
                    </div>
                `;
            } else {
                modalBody.innerHTML = `
                    <div style="padding: 32px 24px; text-align: center; display:flex;flex-direction:column;justify-content:center;height:100%;">
                        <div style="width:80px;height:80px;border-radius:50%;background:#EEF2F7;color:var(--muted);display:flex;align-items:center;justify-content:center;font-size:2rem;margin:0 auto 16px;"><i class="fas fa-user-lock"></i></div>
                        <h2 style="font-family:var(--font-display);font-weight:800;margin-bottom:16px;color:var(--ink);">Inicia sesión</h2>
                        <button onclick="loginConGoogle()" class="btn btn-primary" style="padding:14px;border-radius:12px;width:100%;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;"><img src="https://www.google.com/favicon.ico" style="width:20px;"> Entrar con Google</button>
                    </div>
                `;
            }
        } catch (e) {
            modalBody.innerHTML = `<div style="padding:32px;text-align:center;">Error al cargar perfil</div>`;
        }
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
        btn.style.color = 'white';
        
        setTimeout(() => { 
            btn.innerHTML = originalHTML; 
            btn.style.background = ''; 
            btn.style.color = '';
        }, 1200); 
    },

    addToCart(id, qty) { 
        const p = this.products.find(x => x.id == id); 
        if (!p) return; 
        const result = Cart.add(p, qty); 
        if (result.success) { 
            StoreUI.updateCartUI(); 
            StoreUI.showToast(`${p.nombre} agregado al carrito`); 
        } else { 
            StoreUI.showToast(result.message, 'error'); 
        } 
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

        const requiereCarnet = Cart.items.some(item => {
            const p = this.products.find(x => String(x.id) === String(item.id));
            return p && (p.requiere_carnet === true || p.requiere_carnet === 'true');
        });
        const carnetGroup = document.getElementById('cliCarnetGroup');
        if (carnetGroup) carnetGroup.style.display = requiereCarnet ? 'block' : 'none';
        if (!requiereCarnet) {
            const el = document.getElementById('cliCarnet');
            if (el) el.value = '';
        }
    },

    cancelarCheckout() {
        document.getElementById('cartItemsView').style.display = 'flex';
        document.getElementById('checkoutFormView').style.display = 'none';
        ['cliName', 'cliPhone', 'cliCarnet', 'cliAddress'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    },

    async enviarPedido() {
        const nombre = document.getElementById('cliName')?.value?.trim() || '';
        const telefono = document.getElementById('cliPhone')?.value?.trim() || '';
        const direccion = document.getElementById('cliAddress')?.value?.trim() || '';

        const requiereCarnet = Cart.items.some(item => {
            const p = this.products.find(x => String(x.id) === String(item.id));
            return p && (p.requiere_carnet === true || p.requiere_carnet === 'true');
        });
        const carnet = requiereCarnet ? (document.getElementById('cliCarnet')?.value?.trim() || '') : '';

        if (!nombre || !telefono || !direccion) { StoreUI.showToast('Todos los campos son obligatorios', 'error'); return; }
        if (requiereCarnet && !carnet) { StoreUI.showToast('El carnet de identidad es obligatorio', 'error'); return; }

        const metodoPago = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'Efectivo';
        const btn = document.getElementById('btnConfirmarPedido');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
        btn.disabled = true;

        try {
            const total = Cart.getTotal();
            const payload = {
                tienda: this.currentStore, nombre, telefono, carnet: carnet || null, direccion,
                items: Cart.items.map(item => ({ id: item.id, nombre: item.nombre, precio: item.precio, qty: item.qty, imagen: item.imagen || '' })),
                total: parseFloat(total.toFixed(2)), moneda: StoreUI.currentCurrency, metodoPago
            };

            const data = await StoreAPI.crearPedido(payload);

            if (data.success) {
                // 🚨 Generar código de 5 caracteres
                let code5 = (data.codigoCliente || 'PEDIDO').toString().substring(0, 5).toUpperCase();
                let savedOrders = JSON.parse(localStorage.getItem('mis_pedidos_fg') || '[]');
                savedOrders.push({ id: data.orderId, code: code5, date: new Date().toISOString() });
                localStorage.setItem('mis_pedidos_fg', JSON.stringify(savedOrders));

                StoreUI.showToast(`¡Pedido #${data.orderId} registrado!`);
                
                // Mostrar alerta con el código
                alert(`✅ ¡Compra exitosa!\n\nTu código de pedido es: ${code5}\n\nGuarda este código para consultar el estado de tu compra en el menú.`);

                Cart.clear(); Cart.items = [];
                localStorage.removeItem(`tienda-fg_cart_${this.currentStore}`);
                StoreUI.updateCartUI();

                ['cliName', 'cliPhone', 'cliCarnet', 'cliAddress'].forEach(id => {
                    const el = document.getElementById(id); if (el) el.value = '';
                });

                setTimeout(() => {
                    btn.style.display = 'flex'; btn.innerHTML = originalText; btn.disabled = false;
                    this.cancelarCheckout(); this.toggleCart(false); StoreUI.updateCartUI();
                }, 3000);

            } else { throw new Error(data.error || 'Error'); }
        } catch (e) {
            StoreUI.showToast(e.message || 'Error de conexión.', 'error');
            btn.style.display = 'flex'; btn.disabled = false; btn.innerHTML = originalText;
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
                const url = new URL(window.location); 
                url.searchParams.set('tienda', this.currentStore); 
                window.history.pushState({}, '', url); 
            } 
            
            container.innerHTML = tiendas.map(t => `
                <a href="/?tienda=${t.id}" class="tienda-link ${t.id === this.currentStore ? 'active' : ''}">
                    <i class="fas fa-store"></i>
                    <div>
                        <strong>${t.nombre}</strong>
                        <small>${t.descripcion || 'Bienvenido a ' + t.nombre}</small>
                    </div>
                </a>
            `).join(''); 
        } catch (e) { console.error(e); } 
    },

    async updateUIForStore() { 
        if (!this.currentStore) return; 
        try { 
            this.storeInfo = await StoreAPI.getTienda(this.currentStore); 
            this.storeConfig = await StoreAPI.getStoreConfig(this.currentStore); 
            this.isBookingMode = this.storeConfig?.tipo === 'reserva'; 
            StoreUI.isBookingMode = this.isBookingMode; 
            if (this.isBookingMode) document.body.classList.add('modo-reserva'); 
            
            const headerName = document.getElementById('headerStoreName'); 
            const heroTitle = document.getElementById('heroTitle'); 
            const heroDesc = document.getElementById('heroDescription'); 
            if (headerName) headerName.innerText = this.storeInfo.nombre || 'Tienda-fg'; 
            if (heroTitle) heroTitle.innerText = `${this.storeInfo.nombre || 'Tienda-fg'}`; 
            if (heroDesc) heroDesc.innerText = this.storeInfo.descripcion || 'Encuentra los mejores productos.'; 
            
            const fName = document.getElementById('footerStoreName');
            const fUbi = document.getElementById('footerUbicacion');
            const fTel = document.getElementById('footerTelefono');
            const fEmail = document.getElementById('footerEmail');
            
            if (fName) fName.innerText = this.storeInfo.nombre || 'Tienda-fg';
            if (this.storeConfig?.contacto) {
                if (fUbi) fUbi.innerText = this.storeConfig.contacto.ubicacion || 'La Habana, Cuba';
                if (fTel) fTel.innerText = this.storeConfig.contacto.telefono || '+53 5 000 0000';
                if (fEmail) fEmail.innerText = this.storeConfig.contacto.email || 'contacto@tienda-fg.com';
            }
        } catch (e) { console.error('Error UI store:', e); } 
    }
};

window.showToast = (msg, type) => StoreUI.showToast(msg, type);
document.addEventListener('DOMContentLoaded', () => StoreApp.init());