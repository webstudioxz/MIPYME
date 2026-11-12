// ============================================================
// public/js/store/ui.js
// ============================================================

window.StoreUI = {
    exchangeRates: { CUP: 1, USD: 25, EUR: 27 },
    currentCurrency: 'CUP',
    storeConfig: null,
    carouselIntervals: {},
    isBookingMode: false,

    formatPrice(priceCUP) {
        if (this.currentCurrency === 'CUP') return `$${Number(priceCUP).toFixed(0)}`;
        const v = priceCUP / this.exchangeRates[this.currentCurrency];
        return `${this.currentCurrency} ${v.toFixed(2)}`;
    },

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const icon = toast?.querySelector('i');
        const msg = document.getElementById('toastMsg');
        if (!toast || !icon || !msg) return;

        toast.style.borderLeftColor = type === 'success' ? 'var(--success)' : (type === 'warning' ? '#F59E0B' : 'var(--danger)');
        icon.style.color = type === 'success' ? 'var(--success)' : (type === 'warning' ? '#F59E0B' : 'var(--danger)');
        icon.className = type === 'success' ? 'fas fa-check-circle' : (type === 'warning' ? 'fas fa-exclamation-triangle' : 'fas fa-exclamation-circle');
        msg.innerHTML = message;

        toast.classList.add('show');
        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(() => toast.classList.remove('show'), 2800);
    },

    renderCategorias(categorias) {
        const nav = document.getElementById('categoryNav');
        if (!nav) return;
        
        if (this.isBookingMode) {
            let html = `
            <div class="gender-tabs mb-3">
                <button class="gender-tab active">Hombre</button>
                <button class="gender-tab">Mujer</button>
            </div>
            <div class="cat-pills">
                <a class="cat-pill active" data-cat="todos" onclick="StoreApp.filterByCategory('todos')">Todo</a>
            `;
            categorias.forEach(c => {
                html += `<a class="cat-pill" data-cat="${c}" onclick="StoreApp.filterByCategory('${c}')">${c.charAt(0).toUpperCase() + c.slice(1)}</a>`;
            });
            html += `</div>`;
            nav.innerHTML = html;
            
            nav.style.overflow = 'visible';
            nav.style.display = 'block';
            nav.style.background = 'transparent';
            nav.style.padding = '0 16px';
            nav.style.marginTop = '10px';
            return;
        }

        let html = `<a class="cat-link active" data-cat="todos" onclick="StoreApp.filterByCategory('todos')"><i class="fas fa-th-large"></i> Todos</a>`;
        categorias.forEach(c => {
            html += `<a class="cat-link" data-cat="${c}" onclick="StoreApp.filterByCategory('${c}')"><i class="fas fa-tag"></i> ${c.charAt(0).toUpperCase() + c.slice(1)}</a>`;
        });
        nav.innerHTML = html;
    },

    renderContent(products, categorias, currentCategory) {
        const container = document.getElementById('dynamicContent');
        const skeleton = document.getElementById('skeletonLoader');
        if (!container) return;
        if (skeleton) skeleton.style.display = 'none';

        if (!products || products.length === 0) {
            container.innerHTML = '<div class="empty-products"><i class="fas fa-leaf"></i><h3>No hay servicios disponibles</h3></div>';
            return;
        }

        let filtrados = currentCategory === 'todos' ? products : products.filter(p => (p.categoria || 'otros') === currentCategory);

        if (filtrados.length === 0) {
            container.innerHTML = '<div class="empty-products"><i class="fas fa-box-open"></i><h3>Categoría vacía</h3></div>';
            return;
        }

        if (this.isBookingMode) {
            let html = '';
            categorias.forEach(cat => {
                const prodsCat = products.filter(p => (p.categoria || 'otros') === cat);
                if (prodsCat.length === 0) return;
                
                html += `
                    <div class="category-section mt-4">
                        <div class="category-header d-flex justify-content-between align-items-center mb-3">
                            <h3 class="fw-bold m-0" style="color: var(--primary); font-family: var(--font-display); font-size: 1.2rem;">${cat.charAt(0).toUpperCase() + cat.slice(1)}</h3>
                            <i class="fas fa-angle-double-right" style="color: var(--primary); font-size: 1.2rem;"></i>
                        </div>
                        <div class="booking-list">${this.renderProductGrid(prodsCat, true)}</div>
                    </div>
                `;
            });
            container.innerHTML = html;
            return;
        }

        if (currentCategory === 'todos') {
            let html = '';
            categorias.forEach(cat => {
                const prodsCat = products.filter(p => (p.categoria || 'otros') === cat);
                if (prodsCat.length === 0) return;
                html += `
                    <div class="category-section">
                        <div class="category-header"><h3><i class="fas fa-tag"></i> ${cat.charAt(0).toUpperCase() + cat.slice(1)}</h3></div>
                        ${this.renderCategoryCarousel(cat, prodsCat)}
                        ${this.renderProductGrid(prodsCat, false)}
                    </div>
                `;
            });
            container.innerHTML = html || '<div class="empty-products"><h3>No hay productos</h3></div>';
            
            categorias.forEach(cat => {
                const prodsCat = products.filter(p => (p.categoria || 'otros') === cat);
                if (prodsCat.length > 0) this.initCategoryCarousel(cat, prodsCat);
            });
        } else {
            container.innerHTML = this.renderCategoryCarousel(currentCategory, filtrados) + this.renderProductGrid(filtrados, false);
            if (filtrados.length > 0) this.initCategoryCarousel(currentCategory, filtrados);
        }
    },

    renderCategoryCarousel(cat, productos) {
        if (this.isBookingMode) return '';
        const imagenes = productos.slice(0, 5).map(p => Array.isArray(p.imagen) ? p.imagen[0] : p.imagen).filter(img => img);
        if (imagenes.length === 0) return '';
        return `
            <div class="category-carousel-container" id="carousel-${cat}">
                <div class="category-carousel-slides" id="slides-${cat}">
                    ${imagenes.map(src => `<div class="category-carousel-slide"><img src="${src}" alt="Producto de ${cat}" loading="lazy"></div>`).join('')}
                </div>
                <div class="category-carousel-dots" id="dots-${cat}"></div>
            </div>
        `;
    },

    initCategoryCarousel(cat, productos) {
        if (this.isBookingMode) return;
        const container = document.getElementById(`carousel-${cat}`);
        const slides = document.getElementById(`slides-${cat}`);
        const dots = document.getElementById(`dots-${cat}`);
        if (!container || !slides || !dots) return;

        const imagenes = productos.slice(0, 5).map(p => Array.isArray(p.imagen) ? p.imagen[0] : p.imagen).filter(img => img);
        if (imagenes.length === 0) return;

        dots.innerHTML = imagenes.map((_, i) => `<div class="category-dot ${i === 0 ? 'active' : ''}" onclick="StoreUI.goToSlide('${cat}', ${i})"></div>`).join('');

        let currentSlide = 0;
        const goToSlide = (idx) => {
            currentSlide = idx;
            slides.style.transform = `translateX(-${currentSlide * 100}%)`;
            document.querySelectorAll(`#dots-${cat} .category-dot`).forEach((d, i) => d.classList.toggle('active', i === currentSlide));
        };

        window.StoreUI.goToSlide = (catName, idx) => { if (catName === cat) goToSlide(idx); };

        if (this.carouselIntervals[cat]) clearInterval(this.carouselIntervals[cat]);
        if (imagenes.length > 1) {
            this.carouselIntervals[cat] = setInterval(() => {
                currentSlide = (currentSlide + 1) % imagenes.length;
                goToSlide(currentSlide);
            }, 6000);
        }
    },

    renderProductGrid(productos, isBooking) {
        if (!productos || productos.length === 0) return '';
        const gridClass = isBooking ? 'grid-reservas' : 'grid-productos';
        return `<div class="${gridClass}">${productos.map(p => this.renderProductCard(p, isBooking)).join('')}</div>`;
    },

    renderProductCard(p, isBooking = false) {
        const d = p.precio * (1 - (p.descuento || 0) / 100);
        const available = p.disponible === true || p.disponible === 'true';
        const img = Array.isArray(p.imagen) ? p.imagen[0] : p.imagen;
        const imgSrc = img || 'https://via.placeholder.com/300';

        if (isBooking) {
            return `
            <article class="card-reserva" onclick="StoreApp.openProductModal(${p.id})">
                <div class="reserva-img">
                    <img src="${imgSrc}" alt="${p.nombre}" loading="lazy">
                    ${p.descuento > 0 ? `<span class="badge-oferta">Oferta</span>` : ''}
                </div>
                <div class="reserva-info">
                    <span class="reserva-cat">${p.categoria || 'Servicio'}</span>
                    <h3 class="reserva-title">${p.nombre}</h3>
                    <p class="reserva-desc">${p.descripcion ? p.descripcion.substring(0, 50) + '...' : 'Nuestros servicios de alta calidad.'}</p>
                    <div class="reserva-footer">
                        <span class="reserva-price">${this.formatPrice(d)}</span>
                        <span class="reserva-btn"><i class="fas fa-angle-double-right"></i></span>
                    </div>
                </div>
            </article>
            `;
        }

        const rating = 4.5 + (p.id % 5) * 0.1; 
        const reviews = 10 + (p.id * 7) % 90;
        return `
            <article class="producto-card">
                <div class="card-img-wrapper" onclick="StoreApp.openProductModal(${p.id})">
                    <img src="${imgSrc}" alt="${p.nombre}" loading="lazy">
                    ${p.descuento > 0 ? `<span class="availability-badge badge-offer"><i class="fas fa-tag"></i> Oferta</span>` : (available ? `<span class="availability-badge badge-available">Disponible</span>` : `<span class="availability-badge badge-soldout">Agotado</span>`)}
                    <button class="card-wishlist" onclick="event.stopPropagation(); StoreUI.toggleWishlist(this)"><i class="fas fa-heart"></i></button>
                    <button class="card-quickview" onclick="event.stopPropagation(); StoreApp.openProductModal(${p.id})"><i class="fas fa-eye"></i> Vista rápida</button>
                </div>
                <div class="card-body">
                    <span class="card-category">${p.categoria || 'otros'}</span>
                    <h3 class="card-title">${p.nombre}</h3>
                    <div class="card-rating">
                        <span class="stars">${'★'.repeat(Math.round(rating))}</span>
                        <span>${rating.toFixed(1)} · ${reviews}</span>
                    </div>
                    <div class="price-box">
                        ${p.descuento ? `<span class="old-price">${this.formatPrice(p.precio)}</span>` : ''}
                        <span class="new-price">${this.formatPrice(d)}</span>
                    </div>
                    <div class="card-footer">
                        <div class="qty-control">
                            <button class="qty-btn" onclick="StoreUI.updateCardQty(this,-1)" ${!available ? 'disabled' : ''}>−</button>
                            <span class="qty-val">1</span>
                            <button class="qty-btn" onclick="StoreUI.updateCardQty(this,1)" ${!available ? 'disabled' : ''}>+</button>
                        </div>
                        <button class="btn-add" onclick="StoreApp.addToCartFromCard(${p.id},this)" ${!available ? 'disabled' : ''}><i class="fas fa-plus"></i><span>Añadir</span></button>
                    </div>
                </div>
            </article>
        `;
    },

    toggleWishlist(btn) {
        btn.classList.toggle('active');
        this.showToast(btn.classList.contains('active') ? 'Añadido a favoritos ♥' : 'Quitado de favoritos');
    },

    updateCardQty(btn, delta) {
        const val = btn.parentElement.querySelector('.qty-val');
        if (!val) return;
        let v = parseInt(val.innerText) + delta;
        if (v >= 1 && v <= 3) val.innerText = v; // Límite de 3 unidades
    },

    updateModalQty(delta) {
        const val = document.getElementById('modalQty');
        if (!val) return;
        let v = parseInt(val.innerText) + delta;
        if (v >= 1 && v <= 3) val.innerText = v;
    },

    // 🚨 FUNCIÓN CLAVE: RENDERIZA EL CARRITO Y ACTUALIZA LOS CONTADORES
    updateCartUI() {
        const cont = document.getElementById('cartItemsContainer');
        const totalSpan = document.getElementById('cartTotal');
        const countSpan = document.getElementById('cartCount');
        const countDesktop = document.getElementById('cartCountDesktop');
        const floatBtn = document.getElementById('floatingCheckoutBtn');
        const checkoutTotal = document.getElementById('checkoutTotalAmount');
        
        if (!cont || !totalSpan || !countSpan) return;

        const total = Cart.getTotal();
        const count = Cart.getCount();

        // Actualizar contadores (bolita roja)
        countSpan.innerText = count;
        if (countDesktop) countDesktop.innerText = count;

        if (Cart.items.length === 0) {
            cont.innerHTML = `<div class="cart-empty-state"><div class="empty-icon"><i class="fas fa-shopping-basket"></i></div><h4>Tu carrito está vacío</h4><p>Agrega productos para empezar tu compra.</p></div>`;
            totalSpan.innerText = this.formatPrice(0);
            if (floatBtn) floatBtn.style.display = 'none';
            if (checkoutTotal) checkoutTotal.innerText = this.formatPrice(0);
            return;
        }

        if (floatBtn) floatBtn.style.display = 'flex';

        // Dibujar los productos en el carrito
        cont.innerHTML = Cart.items.map((i, idx) => `
            <div class="cart-item">
                <img src="${i.imagen}" alt="${i.nombre}" loading="lazy">
                <div class="item-details">
                    <div class="item-name">${i.nombre}</div>
                    <div class="item-price">${this.formatPrice(i.precio * i.qty)}</div>
                    <div class="item-actions">
                        <button class="cart-qty-btn" onclick="StoreApp.modifyCartQty(${idx},-1)">−</button>
                        <span class="cart-qty-val">${i.qty}</span>
                        <button class="cart-qty-btn" onclick="StoreApp.modifyCartQty(${idx},1)">+</button>
                        <button class="item-remove" onclick="StoreApp.removeFromCart(${idx})"><i class="fas fa-trash-can"></i></button>
                    </div>
                </div>
            </div>
        `).join('');

        const formattedTotal = this.formatPrice(total);
        totalSpan.innerText = formattedTotal;
        if (checkoutTotal) checkoutTotal.innerText = formattedTotal;
    },

    toggleBankInfo() {
        const metodo = document.querySelector('input[name="paymentMethod"]:checked')?.value;
        const bankBox = document.getElementById('bankInfoBox');
        const noCardWarning = document.getElementById('noCardWarning');
        const btnConfirmar = document.getElementById('btnConfirmarPedido');
        const codigoBox = document.getElementById('codigoClienteBox');
        if (codigoBox) codigoBox.style.display = 'none';

        if (metodo === 'Transferencia') {
            const numeroTarjeta = this.storeConfig?.datos_bancarios?.numero_tarjeta;
            const whatsapp = this.storeConfig?.datos_bancarios?.whatsapp_confirmacion;
            if (!numeroTarjeta || numeroTarjeta.trim() === '') {
                if (bankBox) bankBox.classList.remove('visible');
                if (noCardWarning) noCardWarning.style.display = 'block';
                if (btnConfirmar) { btnConfirmar.disabled = true; btnConfirmar.style.opacity = '0.5'; btnConfirmar.style.cursor = 'not-allowed'; }
            } else {
                if (noCardWarning) noCardWarning.style.display = 'none';
                if (btnConfirmar) { btnConfirmar.disabled = false; btnConfirmar.style.opacity = '1'; btnConfirmar.style.cursor = 'pointer'; }
                const cardNumberEl = document.getElementById('bankCardNumber');
                if (cardNumberEl) cardNumberEl.innerText = numeroTarjeta;
                if (whatsapp) {
                    const total = Cart.getTotal();
                    const mensaje = encodeURIComponent(`Hola, adjunto comprobante por ${this.formatPrice(total)}`);
                    const link = document.getElementById('whatsappBankLink');
                    if (link) { link.href = `https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${mensaje}`; link.style.display = 'flex'; }
                }
                if (bankBox) bankBox.classList.add('visible');
            }
        } else {
            if (bankBox) bankBox.classList.remove('visible');
            if (noCardWarning) noCardWarning.style.display = 'none';
            if (btnConfirmar) { btnConfirmar.disabled = false; btnConfirmar.style.opacity = '1'; btnConfirmar.style.cursor = 'pointer'; }
        }
    }
};