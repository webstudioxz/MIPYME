// ============================================================
// public/js/store/ui.js
// Renderizado y UI de la tienda pública
// ============================================================

window.StoreUI = {
    exchangeRates: { CUP: 1, USD: 25, EUR: 27 },
    currentCurrency: 'CUP',
    storeConfig: null,
    carouselIntervals: {},

    // ------------------------------------------------------------
    // Formateo de precios según moneda
    // ------------------------------------------------------------
    formatPrice(priceCUP) {
        if (this.currentCurrency === 'CUP') {
            return `$${Number(priceCUP).toFixed(0)}`;
        }
        const v = priceCUP / this.exchangeRates[this.currentCurrency];
        return `${this.currentCurrency} ${v.toFixed(2)}`;
    },

    // ------------------------------------------------------------
    // Toast de notificación
    // ------------------------------------------------------------
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const icon = toast?.querySelector('i');
        const msg = document.getElementById('toastMsg');
        if (!toast || !icon || !msg) return;

        toast.style.borderLeftColor = type === 'success' ? 'var(--success-color)' : (type === 'warning' ? '#F59E0B' : 'var(--danger-color)');
        icon.style.color = type === 'success' ? 'var(--success-color)' : (type === 'warning' ? '#F59E0B' : 'var(--danger-color)');
        icon.className = type === 'success' ? 'fas fa-check-circle' : (type === 'warning' ? 'fas fa-exclamation-triangle' : 'fas fa-exclamation-circle');
        msg.innerHTML = message;

        toast.classList.add('show');
        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(() => toast.classList.remove('show'), 2800);
    },

    // ------------------------------------------------------------
    // Categorías (nav superior)
    // ------------------------------------------------------------
    renderCategorias(categorias) {
        const nav = document.getElementById('categoryNav');
        if (!nav) return;
        let html = `<a class="cat-link active" data-cat="todos" onclick="StoreApp.filterByCategory('todos')"><i class="fas fa-th-large"></i> Todos</a>`;
        categorias.forEach(c => {
            html += `<a class="cat-link" data-cat="${c}" onclick="StoreApp.filterByCategory('${c}')"><i class="fas fa-tag"></i> ${c.charAt(0).toUpperCase() + c.slice(1)}</a>`;
        });
        nav.innerHTML = html;
    },

    // ------------------------------------------------------------
    // Renderizado principal de contenido
    // ------------------------------------------------------------
    renderContent(products, categorias, currentCategory) {
        const container = document.getElementById('dynamicContent');
        const skeleton = document.getElementById('skeletonLoader');
        if (!container) return;
        if (skeleton) skeleton.style.display = 'none';

        if (!products || products.length === 0) {
            container.innerHTML = '<div class="empty-products"><i class="fas fa-leaf"></i><h3>No hay productos disponibles</h3><p>Vuelve más tarde.</p></div>';
            return;
        }

        let filtrados = currentCategory === 'todos'
            ? products
            : products.filter(p => (p.categoria || 'otros') === currentCategory);

        if (filtrados.length === 0) {
            container.innerHTML = '<div class="empty-products"><i class="fas fa-box-open"></i><h3>Categoría vacía</h3></div>';
            return;
        }

        if (currentCategory === 'todos') {
            let html = '';
            categorias.forEach(cat => {
                const prodsCat = products.filter(p => (p.categoria || 'otros') === cat);
                if (prodsCat.length === 0) return;
                html += `
                    <div class="category-section">
                        <div class="category-header">
                            <h3><i class="fas fa-tag"></i> ${cat.charAt(0).toUpperCase() + cat.slice(1)}</h3>
                        </div>
                        ${this.renderCategoryCarousel(cat, prodsCat)}
                        ${this.renderProductGrid(prodsCat)}
                    </div>
                `;
            });
            const otros = products.filter(p => !p.categoria || !categorias.includes(p.categoria));
            if (otros.length > 0) {
                html += `
                    <div class="category-section">
                        <div class="category-header"><h3><i class="fas fa-box"></i> Otros</h3></div>
                        ${this.renderProductGrid(otros)}
                    </div>
                `;
            }
            container.innerHTML = html || '<div class="empty-products"><h3>No hay productos</h3></div>';

            categorias.forEach(cat => {
                const prodsCat = products.filter(p => (p.categoria || 'otros') === cat);
                if (prodsCat.length > 0) this.initCategoryCarousel(cat, prodsCat);
            });
        } else {
            let html = this.renderCategoryCarousel(currentCategory, filtrados);
            html += this.renderProductGrid(filtrados);
            container.innerHTML = html;
            if (filtrados.length > 0) this.initCategoryCarousel(currentCategory, filtrados);
        }
    },

    // ------------------------------------------------------------
    // Carrusel de imágenes por categoría
    // ------------------------------------------------------------
    renderCategoryCarousel(cat, productos) {
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
        const container = document.getElementById(`carousel-${cat}`);
        const slides = document.getElementById(`slides-${cat}`);
        const dots = document.getElementById(`dots-${cat}`);
        if (!container || !slides || !dots) return;

        const imagenes = productos.slice(0, 5).map(p => Array.isArray(p.imagen) ? p.imagen[0] : p.imagen).filter(img => img);
        if (imagenes.length === 0) return;

        dots.innerHTML = imagenes.map((_, i) =>
            `<div class="category-dot ${i === 0 ? 'active' : ''}" onclick="StoreUI.goToSlide('${cat}', ${i})"></div>`
        ).join('');

        let currentSlide = 0;

        const goToSlide = (idx) => {
            currentSlide = idx;
            slides.style.transform = `translateX(-${currentSlide * 100}%)`;
            document.querySelectorAll(`#dots-${cat} .category-dot`).forEach((d, i) => {
                d.classList.toggle('active', i === currentSlide);
            });
        };

        window.StoreUI.goToSlide = (catName, idx) => {
            if (catName === cat) goToSlide(idx);
        };

        if (this.carouselIntervals[cat]) clearInterval(this.carouselIntervals[cat]);
        if (imagenes.length > 1) {
            this.carouselIntervals[cat] = setInterval(() => {
                currentSlide = (currentSlide + 1) % imagenes.length;
                goToSlide(currentSlide);
            }, 6000);
        }
    },

    // ------------------------------------------------------------
    // Grid de productos
    // ------------------------------------------------------------
    renderProductGrid(productos) {
        if (!productos || productos.length === 0) return '';
        return `<div class="grid-productos">${productos.map(p => this.renderProductCard(p)).join('')}</div>`;
    },

    // ------------------------------------------------------------
    // Tarjeta individual
    // ------------------------------------------------------------
    renderProductCard(p) {
        const d = p.precio * (1 - (p.descuento || 0) / 100);
        const available = p.disponible === true || p.disponible === 'true';
        const img = Array.isArray(p.imagen) ? p.imagen[0] : p.imagen;
        const imgSrc = img || 'https://via.placeholder.com/300';
        const esGrande = p.tamanio === 'grande';

        if (esGrande) {
            return `
                <article class="producto-card producto-card-grande">
                    <div class="card-img-wrapper" onclick="StoreApp.openProductModal(${p.id})">
                        <img src="${imgSrc}" alt="${p.nombre}" loading="lazy">
                        <div class="availability-badge ${available ? 'badge-available' : 'badge-soldout'}">${available ? 'Disponible' : 'Agotado'}</div>
                    </div>
                    <div class="card-body-grande">
                        <div>
                            <span class="card-category">${p.categoria || 'otros'}</span>
                            <h3 class="card-title-grande">${p.nombre}</h3>
                            <div class="price-box-grande">
                                ${p.descuento ? `<span class="old-price">${this.formatPrice(p.precio)}</span>` : ''}
                                <span class="new-price-grande">${this.formatPrice(d)}</span>
                            </div>
                        </div>
                        <div class="card-actions-grande">
                            <div class="qty-control">
                                <button class="qty-btn" onclick="StoreUI.updateCardQty(this,-1)" ${!available ? 'disabled' : ''}>−</button>
                                <span class="qty-val">1</span>
                                <button class="qty-btn" onclick="StoreUI.updateCardQty(this,1)" ${!available ? 'disabled' : ''}>+</button>
                            </div>
                            <button class="btn-add" onclick="StoreApp.addToCartFromCard(${p.id},this)" ${!available ? 'disabled' : ''}>
                                <i class="fas fa-plus"></i><span>Añadir</span>
                            </button>
                        </div>
                    </div>
                </article>
            `;
        }

        return `
            <article class="producto-card producto-card-pequeno">
                <div class="card-img-wrapper" onclick="StoreApp.openProductModal(${p.id})">
                    <img src="${imgSrc}" alt="${p.nombre}" loading="lazy">
                    <div class="availability-badge ${available ? 'badge-available' : 'badge-soldout'}">${available ? 'Disponible' : 'Agotado'}</div>
                </div>
                <div class="card-body">
                    <span class="card-category">${p.categoria || 'otros'}</span>
                    <h3 class="card-title">${p.nombre}</h3>
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
                        <button class="btn-add" onclick="StoreApp.addToCartFromCard(${p.id},this)" ${!available ? 'disabled' : ''}>
                            <i class="fas fa-plus"></i><span>Añadir</span>
                        </button>
                    </div>
                </div>
            </article>
        `;
    },

    // ------------------------------------------------------------
    // Controles de cantidad
    // ------------------------------------------------------------
    updateCardQty(btn, delta) {
        const val = btn.parentElement.querySelector('.qty-val');
        if (!val) return;
        let v = parseInt(val.innerText) + delta;
        if (v >= 1) val.innerText = v;
    },

    updateModalQty(delta) {
        const val = document.getElementById('modalQty');
        if (!val) return;
        let v = parseInt(val.innerText) + delta;
        if (v >= 1) val.innerText = v;
    },

    // ------------------------------------------------------------
    // Render del carrito
    // ------------------------------------------------------------
    updateCartUI() {
        const cont = document.getElementById('cartItemsContainer');
        const totalSpan = document.getElementById('cartTotal');
        const subtotalSpan = document.getElementById('cartSubtotal');
        const countSpan = document.getElementById('cartCount');
        const countDesktop = document.getElementById('cartCountDesktop');
        const cartBtn = document.getElementById('floatingCartBtn');
        const floatBtn = document.getElementById('floatingCheckoutBtn');
        const checkoutTotal = document.getElementById('checkoutTotalAmount');
        if (!cont || !totalSpan || !subtotalSpan || !countSpan) return;

        const total = Cart.getTotal();
        const count = Cart.getCount();

        if (Cart.items.length === 0) {
            cont.innerHTML = `
                <div class="cart-empty-state">
                    <div class="empty-icon"><i class="fas fa-shopping-basket"></i></div>
                    <h4>Tu carrito está vacío</h4>
                    <p>Agrega productos para empezar tu compra.</p>
                </div>
            `;
            totalSpan.innerText = `0 ${this.currentCurrency}`;
            subtotalSpan.innerText = `0 ${this.currentCurrency}`;
            countSpan.innerText = '0';
            if (countDesktop) countDesktop.innerText = '0';
            if (cartBtn) cartBtn.classList.remove('has-items');
            if (floatBtn) floatBtn.style.display = 'none';
            if (checkoutTotal) checkoutTotal.innerText = `0 ${this.currentCurrency}`;
            return;
        }

        if (cartBtn) cartBtn.classList.add('has-items');
        if (floatBtn) floatBtn.style.display = 'flex';

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
        subtotalSpan.innerText = formattedTotal;
        countSpan.innerText = count;
        if (countDesktop) countDesktop.innerText = count;
        if (checkoutTotal) checkoutTotal.innerText = formattedTotal;
    },

    // ------------------------------------------------------------
    // Toggle del método de pago (transferencia vs efectivo)
    // ------------------------------------------------------------
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
                    const mensaje = encodeURIComponent(
                        `Hola, adjunto comprobante de transferencia por ${this.formatPrice(total)}. Nombre: [Escribe tu nombre aquí]`
                    );
                    const link = document.getElementById('whatsappBankLink');
                    if (link) {
                        link.href = `https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${mensaje}`;
                        link.style.display = 'flex';
                    }
                } else {
                    const link = document.getElementById('whatsappBankLink');
                    if (link) link.style.display = 'none';
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