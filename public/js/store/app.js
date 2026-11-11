// ============================================================
// public/js/store/app.js
// ============================================================

window.StoreApp = {
    products: [], categorias: [], currentCategory: 'todos', currentStore: '',
    storeConfig: null, storeInfo: null, serverOnline: false,
    isBookingMode: false, selectedTime: null, currentProductName: '',

    async init() {
        this.currentStore = new URLSearchParams(window.location.search).get('tienda') || '';
        StoreAPI.init(this.currentStore);
        Cart.init(this.currentStore);
        this.setupEventListeners();
        this.initRealtimeValidations();
        await this.loadTiendasMenu();

        if (!this.currentStore) {
            this.showEmptyProducts('No hay tiendas disponibles');
            document.getElementById('globalLoader')?.classList.add('hidden');
            return;
        }

        await this.updateUIForStore();
        await this.cargarDatosIniciales();
        
        StoreUI.updateCartUI();
        document.getElementById('globalLoader')?.classList.add('hidden');
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
        const statusEl = document.getElementById('footerStatus');
        try {
            const [conf, prods] = await Promise.all([StoreAPI.getConfig(), StoreAPI.getProductos(this.currentStore)]);
            if (conf?.tasas) { StoreUI.exchangeRates.USD = 1 / conf.tasas.USD; StoreUI.exchangeRates.EUR = 1 / conf.tasas.EUR; }
            
            this.products = prods || [];
            localStorage.setItem(`tienda-fg_products_${this.currentStore}`, JSON.stringify(this.products));
            this.categorias = [...new Set(this.products.map(p => p.categoria || 'otros'))];
            
            StoreUI.renderCategorias(this.categorias);
            this.renderContent();

            this.serverOnline = true;
            document.getElementById('offlineScreen')?.classList.remove('active');
            if (statusEl) { statusEl.innerHTML = '<i class="fas fa-circle"></i> Tienda Abierta'; statusEl.className = 'footer-status online'; }
        } catch (e) { 
            this.serverOnline = false;
            if (statusEl) { statusEl.innerHTML = '<i class="fas fa-circle"></i> Fuera de Línea'; statusEl.className = 'footer-status offline'; }
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
        if (c) c.innerHTML = `<div class="empty-products"><i class="fas fa-leaf"></i><h3>${msg}</h3></div>`;
    },

    filterByCategory(cat) {
        this.currentCategory = cat;
        document.querySelectorAll('.cat-pill, .cat-link').forEach(l => l.classList.toggle('active', l.dataset.cat === cat));
        const title = document.querySelector('#categoryTitle span');
        if (title) title.textContent = cat === 'todos' ? (this.isBookingMode ? 'Todos los Servicios' : 'Todos los Productos') : cat.charAt(0).toUpperCase() + cat.slice(1);
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
        this.currentProductName = p.nombre;
        const available = p.disponible === true || p.disponible === 'true';
        const finalPrice = p.precio * (1 - (p.descuento || 0) / 100);
        const img = Array.isArray(p.imagen) ? p.imagen[0] : p.imagen || 'https://via.placeholder.com/500';
        const modalBody = document.getElementById('modalBody');
        if (!modalBody) return;

        const rating = 4.5 + (p.id % 5) * 0.1; 
        const reviews = 10 + (p.id * 7) % 90;

        let actionHTML = '';
        if (this.isBookingMode) {
            actionHTML = `
                <div class="booking-section mt-4">
                    <h4 class="fw-bold mb-3" style="font-size: 1.1rem; color: var(--text-main);"><i class="fas fa-calendar-alt text-primary"></i> Agenda tu cita</h4>
                    <div class="mb-3">
                        <label class="form-label small fw-bold">1. Selecciona el día</label>
                        <div id="calendarContainer" class="calendar-grid"></div>
                        <input type="hidden" id="bookingDate" value="">
                    </div>
                    <div class="mb-3">
                        <label class="form-label small fw-bold">2. Selecciona la hora</label>
                        <div id="timeSlotsGrid" class="time-slots">
                            <p class="text-muted small mb-0">Selecciona un día primero.</p>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label small fw-bold">3. Tus datos</label>
                        <input type="text" id="resNombre" class="form-control mb-2" placeholder="Tu nombre completo">
                        <input type="tel" id="resTelefono" class="form-control" placeholder="Tu WhatsApp (ej: 535...)">
                    </div>
                    <button class="modal-btn-add w-100 mt-2" onclick="StoreApp.confirmarReserva(${p.id})">
                        <i class="fab fa-whatsapp"></i> Confirmar por WhatsApp
                    </button>
                </div>
            `;
            setTimeout(() => this.renderCalendar(), 50);
        } else {
            actionHTML = `
                <div class="modal-product-actions">
                    <div class="modal-qty-control">
                        <button class="modal-qty-btn" onclick="StoreUI.updateModalQty(-1)" ${!available ? 'disabled' : ''}>−</button>
                        <span class="modal-qty-val" id="modalQty">1</span>
                        <button class="modal-qty-btn" onclick="StoreUI.updateModalQty(1)" ${!available ? 'disabled' : ''}>+</button>
                    </div>
                    <button class="modal-btn-add" onclick="StoreApp.addToCartFromModal(${p.id})" ${!available ? 'disabled' : ''}>
                        <i class="fas fa-cart-plus"></i> Añadir
                    </button>
                </div>
            `;
        }

        modalBody.innerHTML = `
            <div class="modal-product-image"><img src="${img}" alt="${p.nombre}"></div>
            <div class="modal-product-info">
                <span class="modal-product-category">${p.categoria || 'General'}</span>
                <h2 class="modal-product-name">${p.nombre}</h2>
                <div class="modal-price-container">
                    <span class="modal-price-value">${StoreUI.formatPrice(finalPrice)}</span>
                    ${p.descuento ? `<span class="modal-old-price">${StoreUI.formatPrice(p.precio)}</span>` : ''}
                </div>
                <div class="modal-product-rating">
                    <span class="stars">${'★'.repeat(Math.round(rating))}</span>
                    <span>${rating.toFixed(1)} (${reviews} reseñas)</span>
                </div>
                <p class="modal-product-description">${p.descripcion || 'Servicio de alta calidad.'}</p>
                <div class="modal-product-features">
                    <div class="feature-item"><i class="fas fa-clock"></i><span>Duración 1h</span></div>
                    <div class="feature-item"><i class="fas fa-user-check"></i><span>Personal calificado</span></div>
                </div>
                ${actionHTML}
            </div>
        `;
        document.getElementById('productModal').classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    closeProductModal() {
        document.getElementById('productModal')?.classList.remove('active');
        document.body.style.overflow = '';
    },

    renderCalendar() {
        const container = document.getElementById('calendarContainer');
        if (!container) return;
        const today = new Date();
        let html = '';
        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            const dayName = date.toLocaleDateString('es-ES', { weekday: 'short' }).toUpperCase();
            const dayNum = date.getDate();
            html += `<div class="calendar-day" onclick="StoreApp.selectDate('${dateStr}', this)"><span class="day-name">${dayName}</span><span class="day-num">${dayNum}</span></div>`;
        }
        container.innerHTML = html;
    },

    selectDate(dateStr, element) {
        document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
        document.getElementById('bookingDate').value = dateStr;
        this.loadAvailableSlots(dateStr);
    },

    async loadAvailableSlots(fecha) {
        const grid = document.getElementById('timeSlotsGrid');
        grid.innerHTML = '<div class="spinner-border spinner-border-sm text-primary"></div>';
        try {
            const res = await fetch(`/api/reservas/disponibles?tienda=${this.currentStore}&fecha=${fecha}`);
            const data = await res.json();
            if (data.slots && data.slots.length > 0) {
                grid.innerHTML = data.slots.map(slot => {
                    const disabled = slot.ocupado ? 'disabled style="opacity:0.4; cursor:not-allowed; background:#eee; text-decoration: line-through;"' : '';
                    const label = slot.ocupado ? 'Ocupado' : slot.hora;
                    return `<button class="time-slot" ${disabled} onclick="StoreApp.selectTime(this, '${slot.hora}')">${label}</button>`;
                }).join('');
            } else {
                grid.innerHTML = '<p class="text-muted small mb-0">No hay turnos disponibles.</p>';
            }
        } catch (e) { grid.innerHTML = '<p class="text-danger small mb-0">Error al cargar.</p>'; }
    },

    selectTime(btn, hora) {
        document.querySelectorAll('.time-slot').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedTime = hora;
    },

    async confirmarReserva(productoId) {
        const fecha = document.getElementById('bookingDate').value;
        const nombre = document.getElementById('resNombre').value.trim();
        const telefono = document.getElementById('resTelefono').value.trim();

        if (!fecha) return StoreUI.showToast('Selecciona un día en el calendario', 'error');
        if (!this.selectedTime) return StoreUI.showToast('Selecciona una hora', 'error');
        if (!nombre) return StoreUI.showToast('Ingresa tu nombre', 'error');
        if (!telefono) return StoreUI.showToast('Ingresa tu teléfono', 'error');

        const btn = document.querySelector('.modal-btn-add');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando reserva...';
        btn.disabled = true;

        const payload = { tienda: this.currentStore, producto_id: productoId, cliente_nombre: nombre, cliente_telefono: telefono, fecha: fecha, hora: this.selectedTime };

        try {
            const res = await fetch('/api/reservas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json();
            
            if (data.success) {
                StoreUI.showToast('✅ ¡Reserva guardada! Abriendo WhatsApp...');
                setTimeout(() => {
                    const whatsappTienda = this.storeConfig?.datos_bancarios?.whatsapp_confirmacion || '+5350000000';
                    const msg = encodeURIComponent(`Hola, acabo de reservar: *${this.currentProductName}* para el día *${fecha}* a las *${this.selectedTime}* a nombre de *${nombre}*.`);
                    window.open(`https://wa.me/${whatsappTienda.replace(/\D/g, '')}?text=${msg}`, '_blank');
                    this.closeProductModal();
                }, 800);
            } else {
                StoreUI.showToast(data.error || 'Turno ocupado', 'error');
                btn.innerHTML = originalHTML;
                btn.disabled = false;
            }
        } catch (e) {
            StoreUI.showToast('Error de conexión al guardar', 'error');
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    },

    addToCartFromModal(id) { const qty = parseInt(document.getElementById('modalQty')?.innerText || 1); this.addToCart(id, qty); this.closeProductModal(); },
    addToCartFromCard(id, btn) { const card = btn.closest('.producto-card'); const qty = parseInt(card.querySelector('.qty-val')?.innerText || 1); this.addToCart(id, qty); const qtyVal = card.querySelector('.qty-val'); if (qtyVal) qtyVal.innerText = '1'; const originalHTML = btn.innerHTML; btn.innerHTML = '<i class="fas fa-check"></i><span>Añadido</span>'; btn.style.background = 'var(--success)'; setTimeout(() => { btn.innerHTML = originalHTML; btn.style.background = ''; }, 1200); },
    addToCart(id, qty) { const p = this.products.find(x => x.id == id); if (!p) return; const result = Cart.add(p, qty); if (result.success) { StoreUI.updateCartUI(); StoreUI.showToast(`${p.nombre} agregado`); } else { StoreUI.showToast(result.message, 'error'); } },
    modifyCartQty(idx, delta) { const result = Cart.modifyQty(idx, delta); if (result.success) { StoreUI.updateCartUI(); } else { StoreUI.showToast(result.message, 'error'); } },
    removeFromCart(idx) { Cart.remove(idx); StoreUI.updateCartUI(); StoreUI.showToast('Producto eliminado'); },
    showCheckoutForm() { if (!Cart.items.length) { StoreUI.showToast('Agrega productos primero', 'error'); return; } document.getElementById('cartItemsView').style.display = 'none'; document.getElementById('checkoutFormView').style.display = 'block'; document.getElementById('floatingCheckoutBtn').style.display = 'none'; const total = Cart.getTotal(); const el = document.getElementById('checkoutTotalAmount'); if (el) el.innerText = StoreUI.formatPrice(total); const efectivoRadio = document.querySelector('input[name="paymentMethod"][value="Efectivo"]'); if (efectivoRadio) efectivoRadio.checked = true; const codigoBox = document.getElementById('codigoClienteBox'); if (codigoBox) codigoBox.style.display = 'none'; StoreUI.toggleBankInfo(); },
    cancelarCheckout() { document.getElementById('cartItemsView').style.display = 'flex'; document.getElementById('checkoutFormView').style.display = 'none'; ['cliName', 'cliPhone', 'cliAddress'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; const warningId = id === 'cliName' ? 'nameWarning' : id === 'cliPhone' ? 'phoneWarning' : 'addressWarning'; const warning = document.getElementById(warningId); if (warning) warning.style.display = 'none'; }); const codigoBox = document.getElementById('codigoClienteBox'); if (codigoBox) codigoBox.style.display = 'none'; if (Cart.items.length) { document.getElementById('floatingCheckoutBtn').style.display = 'flex'; } },
    async enviarPedido() { const nombre = document.getElementById('cliName')?.value?.trim() || ''; const telefono = document.getElementById('cliPhone')?.value?.trim() || ''; const direccion = document.getElementById('cliAddress')?.value?.trim() || ''; if (!nombre || !telefono || !direccion) { StoreUI.showToast('Todos los campos son obligatorios', 'error'); return; } const telVal = StoreUtils.validarTelefonoCubano(telefono); if (!telVal.valido) { StoreUI.showToast(telVal.mensaje, 'error'); return; } const dirVal = StoreUtils.validarDireccion(direccion); if (!dirVal.valido) { StoreUI.showToast(dirVal.mensaje, 'error'); return; } if (!Cart.items.length) { StoreUI.showToast('Carrito vacío', 'error'); return; } const metodoPago = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'Efectivo'; const btn = document.getElementById('btnConfirmarPedido'); const originalText = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...'; btn.disabled = true; try { const total = Cart.getTotal(); const payload = { tienda: this.currentStore, nombre: StoreUtils.sanitizarTexto(nombre), telefono: telVal.limpio, direccion: StoreUtils.sanitizarTexto(direccion), items: Cart.items.map(item => ({ id: item.id, nombre: StoreUtils.sanitizarTexto(item.nombre), precio: item.precio, qty: item.qty, imagen: item.imagen || '' })), total: parseFloat(total.toFixed(2)), moneda: StoreUI.currentCurrency, metodoPago }; const data = await StoreAPI.crearPedido(payload); if (data.success) { document.getElementById('codigoClienteDisplay').innerText = data.codigoCliente; document.getElementById('codigoClienteBox').style.display = 'block'; btn.style.display = 'none'; StoreUI.showToast(`¡Pedido #${data.orderId} registrado! Código: ${data.codigoCliente}`); Cart.clear(); StoreUI.updateCartUI(); ['cliName', 'cliPhone', 'cliAddress'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); } else { throw new Error(data.error || 'Error'); } } catch (e) { StoreUI.showToast(e.message || 'Error de conexión.', 'error'); btn.style.display = 'flex'; } finally { btn.innerHTML = originalText; btn.disabled = false; } },
    async loadTiendasMenu() { try { const tiendas = await StoreAPI.getTiendasInfo(); const container = document.getElementById('tiendasList'); if (!container) return; if (!tiendas || tiendas.length === 0) { container.innerHTML = '<p style="text-align:center;">No hay tiendas</p>'; return; } if (!this.currentStore) { this.currentStore = tiendas[0].id; StoreAPI.init(this.currentStore); Cart.init(this.currentStore); const url = new URL(window.location); url.searchParams.set('tienda', this.currentStore); window.history.pushState({}, '', url); } container.innerHTML = tiendas.map(t => `<a href="/?tienda=${t.id}" class="tienda-link ${t.id === this.currentStore ? 'active' : ''}"><i class="fas fa-store"></i><div><strong>${t.nombre}</strong><small>${t.descripcion || ''}</small></div></a>`).join(''); } catch (e) { console.error(e); } },
    
    // 🚨 VERIFICACIÓN DE TIENDA VENCIDA
    async updateUIForStore() {
        if (!this.currentStore) return;
        try {
            this.storeInfo = await StoreAPI.getTienda(this.currentStore);
            this.storeConfig = await StoreAPI.getStoreConfig(this.currentStore);

            if (this.storeInfo.estado_pago === 'vencido' || (this.storeInfo.fecha_vencimiento && new Date(this.storeInfo.fecha_vencimiento) < new Date())) {
                document.body.innerHTML = `
                    <div style="display:flex; align-items:center; justify-content:center; min-height:100vh; background:#F4F7FE; text-align:center; padding:20px;">
                        <div style="background:white; padding:40px; border-radius:20px; box-shadow:0 10px 30px rgba(0,0,0,0.1);">
                            <i class="fas fa-store-slash" style="font-size:4rem; color:#EF4444; margin-bottom:20px;"></i>
                            <h2 style="font-family:'Plus Jakarta Sans',sans-serif; color:#1A2B4C; font-weight:800;">Tienda Suspendida</h2>
                            <p style="color:#6B7A99; margin-top:10px;">Esta tienda ha pausado sus servicios temporalmente.<br>Por favor, contacta al administrador.</p>
                        </div>
                    </div>
                `;
                return;
            }

            this.isBookingMode = this.storeConfig?.tipo === 'reserva';
            StoreUI.isBookingMode = this.isBookingMode;
            if (this.isBookingMode) document.body.classList.add('modo-reserva');

            const headerName = document.getElementById('headerStoreName');
            const heroTitle = document.getElementById('heroTitle');
            const heroDesc = document.getElementById('heroDescription');
            
            if (headerName) headerName.innerText = this.storeInfo.nombre || 'Tienda-fg';
            if (heroTitle) heroTitle.innerText = `Bienvenido a ${this.storeInfo.nombre || 'Tienda-fg'}`;
            if (heroDesc) heroDesc.innerText = this.storeInfo.descripcion || 'Encuentra los mejores productos.';

            const footerContact = document.querySelector('.footer-contact');
            if (footerContact && this.storeConfig?.contacto) {
                const tel = this.storeConfig.contacto.telefono || '+53 5 000 0000';
                const email = this.storeConfig.contacto.email || 'hola@tienda-fg.com';
                const ubicacion = this.storeConfig.contacto.ubicacion || 'La Habana, Cuba';
                footerContact.innerHTML = `<li><i class="fas fa-location-dot"></i> ${ubicacion}</li><li><i class="fas fa-phone"></i> ${tel}</li><li><i class="fas fa-envelope"></i> ${email}</li><li><i class="fas fa-clock"></i> Lun–Dom · 8:00–20:00</li>`;
            }
        } catch (e) { console.error('Error UI store:', e); }
    },
    
    initRealtimeValidations() { const nameInput = document.getElementById('cliName'); const nameWarning = document.getElementById('nameWarning'); const nameWarningText = document.getElementById('nameWarningText'); if (nameInput && nameWarning) { nameInput.addEventListener('input', function() { const result = StoreUtils.filtrarPalabrasOfensivas(this.value); if (result.ofensivo) { this.classList.add('error'); nameWarning.style.display = 'block'; nameWarningText.innerHTML = `Palabras inapropiadas: <strong>${result.palabras.join(', ')}</strong>`; this.value = result.limpio; } else { this.classList.remove('error'); nameWarning.style.display = 'none'; } }); } const phoneInput = document.getElementById('cliPhone'); const phoneWarning = document.getElementById('phoneWarning'); const phoneWarningText = document.getElementById('phoneWarningText'); if (phoneInput && phoneWarning) { phoneInput.addEventListener('input', function() { this.value = this.value.replace(/[^0-9]/g, ''); const v = this.value.trim(); this.classList.remove('error'); phoneWarning.style.display = 'none'; if (v.length > 0) { const result = StoreUtils.validarTelefonoCubano(v); if (!result.valido) { this.classList.add('error'); phoneWarning.style.display = 'block'; phoneWarningText.innerHTML = result.mensaje; } } }); } const addressInput = document.getElementById('cliAddress'); const addressWarning = document.getElementById('addressWarning'); const addressWarningText = document.getElementById('addressWarningText'); if (addressInput && addressWarning) { addressInput.addEventListener('input', function() { const v = this.value; this.classList.remove('error'); addressWarning.style.display = 'none'; if (v.length > 0) { const result = StoreUtils.validarDireccion(v); if (!result.valido) { this.classList.add('error'); addressWarning.style.display = 'block'; addressWarningText.innerHTML = result.mensaje; } } }); } }
};

window.showToast = (msg, type) => StoreUI.showToast(msg, type);
document.addEventListener('DOMContentLoaded', () => StoreApp.init());