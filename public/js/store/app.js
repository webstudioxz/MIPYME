window.StoreApp = {
    products: [], categorias: [], currentCategory: 'todos', currentStore: '',
    storeConfig: null, storeInfo: null, serverOnline: false,
    isBookingMode: false, selectedTime: null, currentProductName: '', selectedFecha: '',
    tiendaPausada: false, pausadaInfo: null,

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
        this.updateNotificationBadge();
        await this.loadTiendasMenu();

        if (!this.currentStore) { this.showEmptyProducts('No hay tiendas disponibles'); return; }

        await this.updateUIForStore();
        if (this.tiendaPausada) return;

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
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { this.closeProductModal(); this.toggleMenu(false); this.toggleCart(false); } });
        document.getElementById('productModal')?.addEventListener('click', (e) => { if (e.target.id === 'productModal') this.closeProductModal(); });
    },

    setupCurrencyDropdown() {
        const btn = document.getElementById('currencyBtn');
        const menu = document.getElementById('currencyMenu');
        const dropdown = document.getElementById('currencyDropdown');
        if (!btn || !menu) return;
        btn.addEventListener('click', (e) => { e.stopPropagation(); dropdown?.classList.toggle('open'); menu.classList.toggle('active'); });
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
        document.addEventListener('click', () => { dropdown?.classList.remove('open'); menu.classList.remove('active'); });
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
        } catch (e) { this.serverOnline = false; this.loadCachedProducts(); }
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

    // 🚨 Banner de tienda pausada por owner (SOLO se llama si pausada_por === 'owner')
    showPausadaBanner(info) {
        this.tiendaPausada = true;
        this.pausadaInfo = info;

        // Cuerpo principal: cartel con mensaje + botón WhatsApp al owner
        const c = document.getElementById('dynamicContent');
        if (c) {
            c.innerHTML = `
                <div style="grid-column:1/-1; text-align:center; padding:60px 24px;">
                    <div style="width:96px;height:96px;margin:0 auto 20px;border-radius:50%;background:#FEF3C7;color:#B45309;display:flex;align-items:center;justify-content:center;font-size:2.5rem;">
                        <i class="fas fa-pause-circle"></i>
                    </div>
                    <h2 style="font-family:var(--font-display);font-weight:800;margin-bottom:10px;color:#B45309;">Tienda pausada</h2>
                    <p style="color:var(--text-secondary);max-width:520px;margin:0 auto 8px;font-size:1.05rem;font-weight:600;">
                        ${(info.pausada_mensaje || 'Volvemos pronto').replace(/</g,'&lt;')}
                    </p>
                    <p style="color:var(--text-muted);max-width:480px;margin:0 auto 24px;font-size:0.9rem;">
                        Vuelve pronto o contacta directamente con el proveedor para más información.
                    </p>
                    ${this._buildContactoPausadaHTML(info)}
                </div>
            `;
        }

        // Banner fijo superior
        let banner = document.getElementById('pausadaBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'pausadaBanner';
            banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:linear-gradient(135deg,#F59E0B,#D97706);color:#fff;text-align:center;padding:12px 16px;font-weight:700;font-family:var(--font-display);z-index:1050;box-shadow:0 4px 12px rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;gap:10px;font-size:0.9rem;';
            banner.innerHTML = `<i class="fas fa-pause-circle"></i> <span>TIENDA PAUSADA</span> — ${(info.pausada_mensaje || 'Volvemos pronto').replace(/</g,'&lt;')}`;
            document.body.appendChild(banner);
        }

        // Ocultar carrito
        const cb = document.getElementById('cartBtn'); if (cb) cb.style.display = 'none';
        const cbd = document.getElementById('cartBtnDesktop'); if (cbd) cbd.style.display = 'none';
        const main = document.querySelector('main'); if (main) main.style.paddingTop = '80px';
    },

    _buildContactoPausadaHTML(info) {
        if (!info) return '';
        const tel = info.whatsapp_confirmacion || info.contacto?.telefono || '';
        const numLimpio = String(tel).replace(/\D/g, '');
        const nombre = info.nombre || 'la tienda';
        if (!numLimpio) {
            return `<p style="color:var(--text-muted);font-size:0.9rem;">Contacto no disponible.</p>`;
        }
        const msg = encodeURIComponent(`Hola, quiero información sobre la tienda *${nombre}* que aparece pausada.`);
        return `<a href="https://wa.me/${numLimpio}?text=${msg}" target="_blank" style="display:inline-flex;align-items:center;gap:8px;padding:14px 24px;border-radius:12px;background:#25D366;color:#fff;text-decoration:none;font-weight:800;font-family:var(--font-display);">
            <i class="fab fa-whatsapp" style="font-size:1.2rem;"></i> Contactar con el proveedor
        </a>`;
    },

    filterByCategory(cat) {
        if (this.tiendaPausada) return;
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
        if (this.isBookingMode || this.tiendaPausada) return;
        const cart = document.getElementById('cartPanel');
        const overlay = document.getElementById('overlay');
        if (!cart || !overlay) return;
        const show = typeof force === 'boolean' ? force : !cart.classList.contains('active');
        cart.classList.toggle('mostrar', show);
        const menuActive = document.getElementById('sideMenu')?.classList.contains('mostrar');
        overlay.classList.toggle('mostrar', show || menuActive);
        document.body.style.overflow = (show || menuActive) ? 'hidden' : '';
        if (show) { document.getElementById('cartItemsView').style.display = 'flex'; document.getElementById('checkoutFormView').style.display = 'none'; }
    },

    openProductModal(id) {
        if (this.tiendaPausada) return;
        const p = this.products.find(x => x.id == id);
        if (!p) return;
        this.currentProductName = p.nombre;
        this.selectedTime = null; this.selectedFecha = '';
        const available = p.disponible === true || p.disponible === 'true';
        const finalPrice = p.precio * (1 - (p.descuento || 0) / 100);
        const img = Array.isArray(p.imagen) ? p.imagen[0] : p.imagen || 'https://via.placeholder.com/500';
        const modalBody = document.getElementById('modalBody');
        if (!modalBody) return;

        const cfg = this.storeConfig || {};
        const ratings = JSON.parse(localStorage.getItem('tienda-fg_ratings') || '{}');
        const pRating = ratings[p.id] || { sum: 0, count: 0, userVoted: false };
        const avg = pRating.count > 0 ? (pRating.sum / pRating.count).toFixed(1) : '0.0';
        const count = pRating.count;
        let starsHtml = '';
        for (let i = 1; i <= 5; i++) starsHtml += `<i class="fas fa-star" style="color: ${i <= Math.round(avg) ? '#FFB800' : '#E2E8F0'}" onclick="StoreApp.rateProduct(${p.id}, ${i})"></i>`;

        // Multi-contacto en AMBOS modos
        const multi = cfg.whatsapp_por_producto === true;
        const waProducto = multi && p.whatsapp_proveedor ? String(p.whatsapp_proveedor).trim() : '';
        const waTienda = cfg.datos_bancarios?.whatsapp_confirmacion || cfg.contacto?.telefono || '';
        const telefono = waProducto || waTienda;

        const contactoNombreHtml = p.contacto_nombre
            ? `<div class="modal-feature-row"><i class="fas fa-user-tie"></i> <span><strong>Atendido por:</strong> ${String(p.contacto_nombre).replace(/</g,'&lt;')}</span></div>`
            : '';

        let actionHTML = '';

        if (this.isBookingMode) {
            // ============================ RESERVA ============================
            const imagenesServicio = Array.isArray(p.imagenes_servicio) && p.imagenes_servicio.length > 0 ? p.imagenes_servicio : [img];
            const galeriaHtml = imagenesServicio.length > 1 ? `
                <div style="display:flex;gap:8px;overflow-x:auto;margin-bottom:20px;padding:4px 0;">
                    ${imagenesServicio.map((im, i) => `<img src="${im}" style="width:70px;height:70px;object-fit:cover;border-radius:10px;cursor:pointer;border:2px solid ${i === 0 ? '#1E64FF' : 'transparent'};flex-shrink:0;" onclick="document.querySelector('.modal-product-image img').src='${im}'; this.parentElement.querySelectorAll('img').forEach(x=>x.style.border='2px solid transparent'); this.style.border='2px solid #1E64FF';">`).join('')}
                </div>` : '';

            const hoy = new Date();
            const diasCfg = cfg.horario?.dias || [1,2,3,4,5,6];
            const mesesCortos = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
            const diasSemana = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
            let diasCalHtml = '';
            for (let i = 0; i < 14; i++) {
                const d = new Date(hoy); d.setDate(hoy.getDate() + i);
                const dow = d.getDay();
                const activo = diasCfg.includes(dow);
                const fechaStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                const isToday = i === 0;
                const borderColor = isToday ? 'transparent' : (activo ? '#E2E8F0' : '#F1F5F9');
                const bg = isToday ? 'linear-gradient(135deg,#1E64FF,#1248C7)' : (activo ? '#fff' : '#F8FAFC');
                const colorDow = isToday ? 'rgba(255,255,255,0.9)' : (activo ? '#94A3B8' : '#CBD5E1');
                const colorNum = isToday ? '#fff' : (activo ? '#1A2B4C' : '#CBD5E1');
                const colorMes = isToday ? 'rgba(255,255,255,0.7)' : (activo ? '#94A3B8' : '#CBD5E1');
                diasCalHtml += `
                    <button type="button" class="cal-day" data-fecha="${fechaStr}" ${!activo ? 'disabled' : ''} onclick="StoreApp.seleccionarFecha('${fechaStr}', this)" style="
                        min-width:66px;padding:12px 8px;border-radius:14px;border:1.5px solid ${borderColor};
                        background:${bg};display:flex;flex-direction:column;align-items:center;gap:2px;
                        cursor:${activo?'pointer':'not-allowed'};flex-shrink:0;transition:all 0.2s;
                        ${isToday ? 'box-shadow:0 6px 16px rgba(30,100,255,0.35);' : ''}
                        ${activo && !isToday ? 'box-shadow:0 1px 3px rgba(15,23,42,0.04);' : ''}
                        opacity:${activo?1:0.6};
                    ">
                        <span style="font-size:0.65rem;font-weight:800;color:${colorDow};text-transform:uppercase;letter-spacing:0.05em;">${diasSemana[dow]}</span>
                        <span style="font-size:1.15rem;font-weight:800;color:${colorNum};">${d.getDate()}</span>
                        <span style="font-size:0.65rem;font-weight:600;color:${colorMes};">${mesesCortos[d.getMonth()]}</span>
                    </button>
                `;
            }

            // WhatsApp informativo del producto (si tiene) — NO envía nada, solo abre chat
            const waLink = telefono ? `https://wa.me/${String(telefono).replace(/\D/g,'')}?text=${encodeURIComponent(`Hola, quiero reservar *${p.nombre}*.`)}` : null;

            actionHTML = `
                ${galeriaHtml}
                <div style="background:#F8FAFC;padding:20px;border-radius:16px;border:1.5px solid #E2E8F0;">
                    <h4 style="font-family:var(--font-display);font-weight:800;margin-bottom:16px;font-size:1.15rem;color:var(--ink);display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-calendar-check" style="color:var(--brand);"></i> Agenda tu Cita
                    </h4>
                    <div style="margin-bottom:16px;">
                        <div style="font-size:0.8rem;font-weight:700;color:var(--ink);margin-bottom:10px;">
                            <i class="fas fa-calendar-day" style="color:var(--brand);margin-right:4px;"></i> Selecciona el día
                        </div>
                        <div id="calendarioDias" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;scrollbar-width:thin;">
                            ${diasCalHtml}
                        </div>
                    </div>
                    <div style="margin-bottom:16px;">
                        <div style="font-size:0.8rem;font-weight:700;color:var(--ink);margin-bottom:10px;">
                            <i class="fas fa-clock" style="color:var(--brand);margin-right:4px;"></i> Horarios disponibles
                        </div>
                        <div id="slotsReserva" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:8px;background:#fff;padding:12px;border-radius:12px;border:1.5px solid #E2E8F0;min-height:70px;">
                            <div style="grid-column:1/-1;text-align:center;padding:16px;color:#94A3B8;font-size:0.85rem;">
                                <i class="fas fa-hand-pointer"></i> Selecciona un día primero
                            </div>
                        </div>
                    </div>
                    <div style="margin-bottom:14px;">
                        <div style="font-size:0.8rem;font-weight:700;color:var(--ink);margin-bottom:8px;">
                            <i class="fas fa-user" style="color:var(--brand);margin-right:4px;"></i> Tus datos
                        </div>
                        <input type="text" id="resNombre" placeholder="Tu nombre completo" style="width:100%;padding:11px 14px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:0.9rem;margin-bottom:8px;background:#fff;">
                        <input type="tel" id="resTelefono" placeholder="Tu WhatsApp" style="width:100%;padding:11px 14px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:0.9rem;background:#fff;">
                    </div>
                    <button class="modal-btn-add" onclick="StoreApp.enviarReserva(${p.id})" style="width:100%;height:50px;background:linear-gradient(135deg,#1E64FF,#1248C7);font-size:0.95rem;border-radius:12px;">
                        <i class="fas fa-check-circle"></i> Confirmar Reserva
                    </button>
                    ${contactoNombreHtml ? `<div class="modal-features-list" style="margin-top:14px;">${contactoNombreHtml}</div>` : ''}
                    ${waLink ? `<a href="${waLink}" target="_blank" style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:10px;padding:10px;border-radius:10px;background:#25D366;color:#fff;font-weight:700;font-size:0.85rem;text-decoration:none;"><i class="fab fa-whatsapp"></i> Preguntar por WhatsApp</a>` : ''}
                    <p style="text-align:center;margin-top:10px;font-size:0.75rem;color:#94A3B8;">
                        <i class="fas fa-info-circle"></i> El proveedor recibirá tu reserva en su panel.
                    </p>
                </div>
            `;
        } else {
            // ============================ TIENDA NORMAL ============================
            const garantia = cfg.garantia?.disponible ? (cfg.garantia.duracion || '12 meses') : 'Sin garantía';
            const envio = cfg.envio?.disponible ? `Sí, envío a domicilio (${cfg.envio.tiempo_estimado || '24-48h'})` : 'Solo retiro en tienda';
            const msgWa = encodeURIComponent(`Hola, estoy interesado en: *${p.nombre}*.`);
            const waLink = telefono ? `https://wa.me/${String(telefono).replace(/\D/g, '')}?text=${msgWa}` : null;

            actionHTML = `
                <div class="modal-features-list">
                    <div class="modal-feature-row"><i class="fas fa-truck"></i> <span><strong>Envío:</strong> ${envio}</span></div>
                    <div class="modal-feature-row"><i class="fas fa-shield-alt"></i> <span><strong>Garantía:</strong> ${garantia}</span></div>
                    ${p.requiere_carnet ? `<div class="modal-feature-row"><i class="fas fa-id-card"></i> <span><strong>Requisito:</strong> Carnet obligatorio</span></div>` : ''}
                    ${contactoNombreHtml}
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
            `;
        }

        modalBody.innerHTML = `
            <div class="modal-product-image"><img src="${img}" alt="${p.nombre}"></div>
            <div class="modal-product-info">
                <span class="modal-product-category">${p.categoria || 'General'}</span>
                <h2 class="modal-product-name">${p.nombre}</h2>
                <div class="d-flex align-items-center gap-2 mb-3">
                    <div class="modal-rating-stars">${starsHtml}</div>
                    <span class="text-muted small fw-bold">${avg} (${count} votos)</span>
                </div>
                <div class="modal-price-container mb-3">
                    <span class="modal-price-value">${StoreUI.formatPrice(finalPrice)}</span>
                    ${p.descuento ? `<span class="old-price" style="margin-left:10px;text-decoration:line-through;color:var(--muted);">${StoreUI.formatPrice(p.precio)}</span>` : ''}
                </div>
                <p class="modal-product-description">${p.descripcion || 'Sin descripción.'}</p>
                ${actionHTML}
            </div>
        `;
        document.getElementById('productModal').classList.add('active');
        document.body.style.overflow = 'hidden';

        if (this.isBookingMode) {
            setTimeout(() => {
                const primerDia = document.querySelector('.cal-day:not([disabled])');
                if (primerDia) this.seleccionarFecha(primerDia.dataset.fecha, primerDia);
            }, 100);
        }
    },

    seleccionarFecha(fechaStr, btn) {
        document.querySelectorAll('.cal-day').forEach(b => {
            const hoy = new Date();
            const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
            const esHoy = b.dataset.fecha === hoyStr;
            const activo = !b.disabled;
            if (esHoy) {
                b.style.background = 'linear-gradient(135deg,#1E64FF,#1248C7)';
                b.style.boxShadow = '0 6px 16px rgba(30,100,255,0.35)';
                const sp = b.querySelectorAll('span');
                if (sp[0]) sp[0].style.color = 'rgba(255,255,255,0.9)';
                if (sp[1]) sp[1].style.color = '#fff';
                if (sp[2]) sp[2].style.color = 'rgba(255,255,255,0.7)';
            } else if (activo) {
                b.style.background = '#fff';
                b.style.boxShadow = '0 1px 3px rgba(15,23,42,0.04)';
                const sp = b.querySelectorAll('span');
                if (sp[0]) sp[0].style.color = '#94A3B8';
                if (sp[1]) sp[1].style.color = '#1A2B4C';
                if (sp[2]) sp[2].style.color = '#94A3B8';
            }
        });
        btn.style.background = 'linear-gradient(135deg,#1E64FF,#1248C7)';
        btn.style.boxShadow = '0 6px 16px rgba(30,100,255,0.35)';
        const sp = btn.querySelectorAll('span');
        if (sp[0]) sp[0].style.color = 'rgba(255,255,255,0.9)';
        if (sp[1]) sp[1].style.color = '#fff';
        if (sp[2]) sp[2].style.color = 'rgba(255,255,255,0.7)';
        this.selectedFecha = fechaStr;
        this.selectedTime = null;
        this.cargarSlotsReserva(fechaStr);
    },

    async cargarSlotsReserva(fecha) {
        const cont = document.getElementById('slotsReserva');
        if (!cont) return;
        cont.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:16px;color:#94A3B8;font-size:0.85rem;"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
        try {
            const res = await fetch(`/api/reservas/disponibles?tienda=${this.currentStore}&fecha=${fecha}`);
            const data = await res.json();
            if (!data.success || !data.slots || data.slots.length === 0) {
                cont.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:16px;color:#94A3B8;font-size:0.85rem;"><i class="fas fa-info-circle"></i> Sin turnos este día.</div>';
                return;
            }
            cont.innerHTML = data.slots.map(slot => {
                const disabled = slot.ocupado || slot.pasado;
                let bg = '#E8F0FE', color = '#1E64FF', border = '1.5px solid #C7DBFF', label = slot.hora, cursor = 'pointer';
                if (slot.ocupado) { bg = '#FEE2E2'; color = '#B91C1C'; border = '1.5px solid #FECACA'; label = 'No disp.'; cursor = 'not-allowed'; }
                else if (slot.pasado) { bg = '#F1F5F9'; color = '#94A3B8'; border = '1.5px solid #E2E8F0'; cursor = 'not-allowed'; }
                return `<button type="button" ${disabled ? 'disabled' : ''} class="slot-btn" data-hora="${slot.hora}" onclick="StoreApp.seleccionarSlot(this,'${slot.hora}')" style="padding:10px 6px;border-radius:10px;background:${bg};color:${color};border:${border};font-weight:700;font-size:0.82rem;cursor:${cursor};transition:all 0.15s;">${label}</button>`;
            }).join('');
        } catch (e) {
            cont.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:16px;color:#B91C1C;font-size:0.85rem;"><i class="fas fa-exclamation-triangle"></i> Error</div>';
        }
    },

    seleccionarSlot(btn, hora) {
        document.querySelectorAll('.slot-btn').forEach(b => {
            if (b.disabled) return;
            b.style.background = '#E8F0FE'; b.style.color = '#1E64FF'; b.style.border = '1.5px solid #C7DBFF';
        });
        btn.style.background = '#1E64FF'; btn.style.color = '#FFFFFF'; btn.style.border = '1.5px solid #1248C7';
        btn.style.boxShadow = '0 4px 10px rgba(30,100,255,0.3)';
        this.selectedTime = hora;
    },

    // 🚨 RESERVA: NO abre WhatsApp de proveedores. Solo guarda y confirma.
    async enviarReserva(productoId) {
        const fecha = this.selectedFecha;
        const hora = this.selectedTime;
        const nombre = document.getElementById('resNombre')?.value?.trim();
        const telefono = document.getElementById('resTelefono')?.value?.trim();
        if (!fecha) return StoreUI.showToast('Selecciona una fecha', 'error');
        if (!hora) return StoreUI.showToast('Selecciona un horario', 'error');
        if (!nombre) return StoreUI.showToast('Ingresa tu nombre', 'error');
        if (!telefono) return StoreUI.showToast('Ingresa tu WhatsApp', 'error');

        const btn = document.querySelector('.modal-btn-add');
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        btn.disabled = true;

        try {
            const res = await fetch('/api/reservas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tienda: this.currentStore, producto_id: productoId, cliente_nombre: nombre, cliente_telefono: telefono, fecha, hora })
            });
            const data = await res.json();
            if (data.success) {
                StoreUI.showToast('✅ Reserva guardada. El proveedor te confirmará pronto.');
                this.selectedTime = null;
                this.selectedFecha = '';
                setTimeout(() => this.closeProductModal(), 1200);
            } else {
                StoreUI.showToast(data.error || 'Error al reservar', 'error');
                btn.innerHTML = orig; btn.disabled = false;
            }
        } catch (e) {
            StoreUI.showToast('Error de conexión', 'error');
            btn.innerHTML = orig; btn.disabled = false;
        }
    },

    rateProduct(id, stars) {
        const ratings = JSON.parse(localStorage.getItem('tienda-fg_ratings') || '{}');
        if (ratings[id] && ratings[id].userVoted) { StoreUI.showToast('Ya calificaste', 'warning'); return; }
        if (!ratings[id]) ratings[id] = { sum: 0, count: 0 };
        ratings[id].sum += stars; ratings[id].count += 1; ratings[id].userVoted = true;
        localStorage.setItem('tienda-fg_ratings', JSON.stringify(ratings));
        StoreUI.showToast(`¡Gracias!`);
        this.openProductModal(id);
        this.renderContent();
    },

    closeProductModal() {
        document.getElementById('productModal')?.classList.remove('active');
        document.body.style.overflow = '';
        this.selectedTime = null;
        this.selectedFecha = '';
    },

    updateNotificationBadge() {
        const hasNew = localStorage.getItem('fg_new_order') === 'true';
        const mb = document.getElementById('menuBadge');
        const ob = document.getElementById('ordersBadge');
        if (mb) mb.style.display = hasNew ? 'block' : 'none';
        if (ob) ob.style.display = hasNew ? 'block' : 'none';
    },

    abrirMisPedidos() {
        this.toggleMenu(false);
        localStorage.removeItem('fg_new_order');
        this.updateNotificationBadge();
        let saved = JSON.parse(localStorage.getItem('mis_pedidos_fg') || '[]');
        const modalBody = document.getElementById('modalBody');
        const now = Date.now(); const oneDay = 24 * 60 * 60 * 1000;
        saved = saved.filter(o => (now - o.date) < oneDay);
        localStorage.setItem('mis_pedidos_fg', JSON.stringify(saved));
        if (saved.length === 0) {
            modalBody.innerHTML = `<div style="padding:40px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:center;"><i class="fas fa-receipt" style="font-size:3rem;color:#cbd5e1;margin-bottom:16px;"></i><h3 style="font-family:var(--font-display);font-weight:800;margin-bottom:8px;">Sin pedidos recientes</h3><p style="color:var(--muted);">Tus compras aparecerán aquí.</p></div>`;
        } else {
            let html = '<div style="padding:24px;"><h2 style="font-family:var(--font-display);font-weight:800;margin-bottom:20px;color:var(--ink);">Mis Pedidos Recientes</h2>';
            saved.reverse().forEach(o => {
                const d = new Date(o.date);
                const h = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
                const f = d.toLocaleDateString();
                html += `<div style="background:#F8FAFC;padding:16px;border-radius:12px;margin-bottom:12px;border:1px solid var(--line-soft);display:flex;justify-content:space-between;align-items:center;"><div><div style="font-weight:700;color:var(--ink);">Pedido #${o.id}</div><div style="font-size:0.85rem;color:var(--muted);">${f} a las ${h}</div></div><div style="background:var(--brand-tint);color:var(--brand);padding:8px 16px;border-radius:8px;font-weight:800;font-family:monospace;font-size:1.2rem;letter-spacing:1px;">${o.code}</div></div>`;
            });
            html += '</div>';
            modalBody.innerHTML = html;
        }
        document.getElementById('productModal').classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    async abrirMiPerfil() {
        this.toggleMenu(false);
        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `<div style="padding:40px;text-align:center;"><i class="fas fa-spinner fa-spin fa-2x" style="color:var(--brand);"></i></div>`;
        document.getElementById('productModal').classList.add('active');
        document.body.style.overflow = 'hidden';
        try {
            if (!window.supabaseClient) {
                const res = await fetch('/api/public-config');
                const config = await res.json();
                window.supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
            }
            const { data: { user }, error } = await window.supabaseClient.auth.getUser();
            if (error) throw error;
            if (user) {
                const res = await fetch(`/api/mi-tienda?owner_id=${user.id}`);
                const sd = await res.json();
                let btn = '';
                if (sd.success && sd.store) {
                    const pausadaAviso = sd.store.pausada && sd.store.pausada_por === 'admin'
                        ? `<div style="margin:16px 0;padding:12px;border-radius:12px;background:#FEE2E2;border:1px solid #FECACA;color:#991B1B;font-size:0.85rem;font-weight:600;"><i class="fas fa-exclamation-triangle"></i> Tu tienda está pausada por el administrador. Contacta a soporte.</div>`
                        : '';
                    btn = `${pausadaAviso}<a href="/admin-cliente?tienda=${sd.store.id}" class="btn btn-primary w-100 mt-3" style="padding:12px;border-radius:12px;font-weight:700;">Ir a mi Panel</a>`;
                } else {
                    btn = `<button class="btn btn-outline-primary w-100 mt-3" onclick="document.getElementById('productModal').classList.remove('active'); openOverlay('plans')" style="padding:12px;border-radius:12px;font-weight:700;">Crear mi Tienda</button>`;
                }
                modalBody.innerHTML = `<div style="padding:32px 24px;text-align:center;display:flex;flex-direction:column;justify-content:center;height:100%;"><div style="width:80px;height:80px;border-radius:50%;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center;font-size:2rem;margin:0 auto 16px;"><i class="fas fa-user"></i></div><h2 style="font-family:var(--font-display);font-weight:800;margin-bottom:4px;color:var(--ink);">${user.email.split('@')[0]}</h2><p style="color:var(--muted);margin-bottom:24px;">${user.email}</p>${btn}</div>`;
            } else {
                modalBody.innerHTML = `<div style="padding:32px 24px;text-align:center;display:flex;flex-direction:column;justify-content:center;height:100%;"><div style="width:80px;height:80px;border-radius:50%;background:#EEF2F7;color:var(--muted);display:flex;align-items:center;justify-content:center;font-size:2rem;margin:0 auto 16px;"><i class="fas fa-user-lock"></i></div><h2 style="font-family:var(--font-display);font-weight:800;margin-bottom:16px;color:var(--ink);">Inicia sesión</h2><button onclick="loginConGoogle()" class="btn btn-primary" style="padding:14px;border-radius:12px;width:100%;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;"><img src="https://www.google.com/favicon.ico" style="width:20px;"> Entrar con Google</button></div>`;
            }
        } catch (e) { modalBody.innerHTML = `<div style="padding:32px;text-align:center;color:var(--danger);">Error al cargar</div>`; }
    },

    addToCartFromModal(id) {
        const qty = parseInt(document.getElementById('modalQty')?.innerText || 1);
        this.addToCart(id, qty); this.closeProductModal();
    },

    addToCartFromCard(id, btn) {
        const card = btn.closest('.producto-card');
        const qty = parseInt(card.querySelector('.qty-val')?.innerText || 1);
        this.addToCart(id, qty);
        const qv = card.querySelector('.qty-val'); if (qv) qv.innerText = '1';
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i><span>Añadido</span>';
        btn.style.background = 'var(--success)'; btn.style.color = 'white';
        setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; btn.style.color = ''; }, 1200);
    },

    addToCart(id, qty) {
        const p = this.products.find(x => x.id == id);
        if (!p) return;
        const r = Cart.add(p, qty);
        if (r.success) { StoreUI.updateCartUI(); StoreUI.showToast(`${p.nombre} agregado`); }
        else StoreUI.showToast(r.message, 'error');
    },

    modifyCartQty(idx, delta) {
        const r = Cart.modifyQty(idx, delta);
        if (r.success) StoreUI.updateCartUI();
        else StoreUI.showToast(r.message, 'error');
    },

    removeFromCart(idx) {
        Cart.remove(idx);
        StoreUI.updateCartUI();
        StoreUI.showToast('Eliminado');
    },

    showCheckoutForm() {
        if (!Cart.items.length) { StoreUI.showToast('Agrega productos', 'error'); return; }
        document.getElementById('cartItemsView').style.display = 'none';
        document.getElementById('checkoutFormView').style.display = 'block';
        const req = Cart.items.some(item => {
            const p = this.products.find(x => String(x.id) === String(item.id));
            return p && (p.requiere_carnet === true || p.requiere_carnet === 'true');
        });
        const cg = document.getElementById('cliCarnetGroup');
        if (cg) cg.style.display = req ? 'block' : 'none';
        if (!req) { const el = document.getElementById('cliCarnet'); if (el) el.value = ''; }
        const metodos = this.storeConfig?.metodos_pago || ['Efectivo'];
        const container = document.getElementById('paymentMethodsContainer');
        if (container) {
            container.innerHTML = metodos.map(m => `<label class="payment-option" style="display:flex;align-items:center;gap:6px;margin-bottom:8px;"><input type="radio" name="paymentMethod" value="${m}" onchange="StoreApp.updatePaymentDetails('${m}')" ${m === 'Efectivo' ? 'checked' : ''}> ${m}</label>`).join('');
            const def = metodos.includes('Efectivo') ? 'Efectivo' : metodos[0];
            if (def) this.updatePaymentDetails(def);
        }
    },

    updatePaymentDetails(metodo) {
        const box = document.getElementById('paymentDetailsBox');
        const ti = document.getElementById('transferInfo');
        const ci = document.getElementById('cardQrInfo');
        if (!box) return;
        if (ti) ti.style.display = 'none';
        if (ci) ci.style.display = 'none';
        if (metodo === 'Transferencia') {
            box.style.display = 'block';
            if (ti) ti.style.display = 'block';
            const el = document.getElementById('transferCardNumber');
            if (el) el.innerText = this.storeConfig?.datos_bancarios?.numero_tarjeta || 'No configurado';
        } else if (metodo === 'Tarjeta') {
            box.style.display = 'block';
            if (ci) ci.style.display = 'block';
            const el = document.getElementById('qrImage');
            if (el) el.src = this.storeConfig?.datos_bancarios?.qr_tarjeta || 'https://via.placeholder.com/150';
        } else { box.style.display = 'none'; }
    },

    cancelarCheckout() {
        document.getElementById('cartItemsView').style.display = 'flex';
        document.getElementById('checkoutFormView').style.display = 'none';
        ['cliName', 'cliPhone', 'cliCarnet', 'cliAddress'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    },

    async enviarPedido() {
        const nombre = document.getElementById('cliName')?.value?.trim() || '';
        const telefono = document.getElementById('cliPhone')?.value?.trim() || '';
        const direccion = document.getElementById('cliAddress')?.value?.trim() || '';
        const req = Cart.items.some(item => {
            const p = this.products.find(x => String(x.id) === String(item.id));
            return p && (p.requiere_carnet === true || p.requiere_carnet === 'true');
        });
        const carnet = req ? (document.getElementById('cliCarnet')?.value?.trim() || '') : '';
        if (!nombre || !telefono || !direccion) { StoreUI.showToast('Todos obligatorios', 'error'); return; }
        if (req && !carnet) { StoreUI.showToast('Carnet obligatorio', 'error'); return; }
        const metodoPago = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'Efectivo';
        const btn = document.getElementById('btnConfirmarPedido');
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
        btn.disabled = true;
        try {
            const total = Cart.getTotal();
            const payload = { tienda: this.currentStore, nombre, telefono, carnet: carnet || null, direccion, items: Cart.items.map(i => ({ id: i.id, nombre: i.nombre, precio: i.precio, qty: i.qty, imagen: i.imagen || '' })), total: parseFloat(total.toFixed(2)), moneda: StoreUI.currentCurrency, metodoPago };
            const data = await StoreAPI.crearPedido(payload);
            if (data.success) {
                const code5 = (data.codigoCliente || 'PEDIDO').toString().substring(0, 5).toUpperCase();
                let saved = JSON.parse(localStorage.getItem('mis_pedidos_fg') || '[]');
                saved.push({ id: data.orderId, code: code5, date: Date.now() });
                localStorage.setItem('mis_pedidos_fg', JSON.stringify(saved));
                localStorage.setItem('fg_new_order', 'true');
                this.updateNotificationBadge();
                StoreUI.showToast(`¡Pedido #${data.orderId}!`);
                alert(`✅ ¡Compra exitosa!\n\nCódigo: ${code5}\n\nGuárdalo para consultar tu pedido.`);

                // 🚨 notificaciones_modo
                const modo = this.storeConfig?.notificaciones_modo || 'admin';
                if ((modo === 'whatsapp' || modo === 'ambos') && data.whatsapp_destino) {
                    const msg = encodeURIComponent(
                        `Hola, acabo de hacer el pedido *#${data.orderId}* en *${this.storeInfo?.nombre || this.currentStore}* por un total de $${total.toFixed(2)} ${StoreUI.currentCurrency}.` +
                        (data.contacto_nombre ? `\nContacto: *${data.contacto_nombre}*` : '')
                    );
                    setTimeout(() => {
                        window.open(`https://wa.me/${String(data.whatsapp_destino).replace(/\D/g,'')}?text=${msg}`, '_blank');
                    }, 400);
                }

                Cart.clear(); Cart.items = [];
                localStorage.removeItem(`tienda-fg_cart_${this.currentStore}`);
                StoreUI.updateCartUI();
                ['cliName', 'cliPhone', 'cliCarnet', 'cliAddress'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
                setTimeout(() => {
                    btn.style.display = 'flex'; btn.innerHTML = orig; btn.disabled = false;
                    this.cancelarCheckout(); this.toggleCart(false); StoreUI.updateCartUI();
                }, 3000);
            } else throw new Error(data.error || 'Error');
        } catch (e) {
            StoreUI.showToast(e.message || 'Error', 'error');
            btn.style.display = 'flex'; btn.disabled = false; btn.innerHTML = orig;
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
            container.innerHTML = tiendas.map(t => `<a href="/?tienda=${t.id}" class="tienda-link ${t.id === this.currentStore ? 'active' : ''}"><i class="fas fa-store"></i><div><strong>${t.nombre}</strong><small>${t.descripcion || 'Bienvenido a ' + t.nombre}</small></div></a>`).join('');
        } catch (e) { console.error(e); }
    },

    async updateUIForStore() {
        if (!this.currentStore) return;
        try {
            // 🚨 Pedir tienda: si 403 con pausada → mostrar banner (owner) o bloquear (admin)
            let tiendaResp = null;
            try {
                const r = await fetch(`/api/tiendas/${encodeURIComponent(this.currentStore)}`);
                if (r.status === 403) {
                    const info = await r.json();
                    this.storeInfo = { nombre: info.nombre || this.currentStore, icono: info.icono || '🛒' };
                    this.storeConfig = null;
                    this.showPausadaBanner(info);
                    return;
                }
                if (r.status === 404) {
                    // Pausada por admin → 404 público → mostramos "no disponible" sin revelar
                    this.tiendaPausada = true;
                    this.storeInfo = { nombre: 'Tienda no disponible' };
                    const c = document.getElementById('dynamicContent');
                    if (c) c.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 24px;"><i class="fas fa-eye-slash" style="font-size:3rem;color:#cbd5e1;margin-bottom:16px;"></i><h2 style="font-family:var(--font-display);font-weight:800;color:var(--ink);margin-bottom:8px;">Tienda no disponible</h2><p style="color:var(--muted);">Esta tienda no está disponible temporalmente.</p></div>`;
                    return;
                }
                if (!r.ok) throw new Error('Error cargando tienda');
                tiendaResp = await r.json();
            } catch (e) { throw e; }

            this.storeInfo = tiendaResp;
            this.storeConfig = await StoreAPI.getStoreConfig(this.currentStore);
            this.isBookingMode = this.storeConfig?.tipo === 'reserva';
            StoreUI.isBookingMode = this.isBookingMode;
            if (this.isBookingMode) document.body.classList.add('modo-reserva');

            const hn = document.getElementById('headerStoreName');
            const ht = document.getElementById('heroTitle');
            const hd = document.getElementById('heroDescription');
            if (hn) hn.innerText = this.storeInfo.nombre || 'Tienda-fg';
            if (ht) ht.innerText = `${this.storeInfo.nombre || 'Tienda-fg'}`;
            if (hd) hd.innerText = this.storeInfo.descripcion || 'Encuentra los mejores productos.';
            const fn = document.getElementById('footerStoreName');
            const fu = document.getElementById('footerUbicacion');
            const ft = document.getElementById('footerTelefono');
            const fe = document.getElementById('footerEmail');
            if (fn) fn.innerText = this.storeInfo.nombre || 'Tienda-fg';
            if (this.storeConfig?.contacto) {
                if (fu) fu.innerText = this.storeConfig.contacto.ubicacion || 'La Habana, Cuba';
                if (ft) ft.innerText = this.storeConfig.contacto.telefono || '+53 5 000 0000';
                if (fe) fe.innerText = this.storeConfig.contacto.email || 'contacto@tienda-fg.com';
            }
        } catch (e) {
            console.error('Error UI:', e);
            this.showEmptyProducts('No se pudo cargar la tienda');
        }
    }
};

window.showToast = (msg, type) => StoreUI.showToast(msg, type);
document.addEventListener('DOMContentLoaded', () => StoreApp.init());