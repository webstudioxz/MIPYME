window.StoreUI = {
    exchangeRates: { CUP: 1, USD: 25, EUR: 27 },
    currentCurrency: 'CUP',
    storeConfig: null,
    carouselIntervals: {},

    formatPrice(priceCUP) {
        if (this.currentCurrency === 'CUP') return `$${priceCUP.toFixed(0)}`;
        const v = priceCUP / this.exchangeRates[this.currentCurrency];
        return `${this.currentCurrency} ${v.toFixed(2)}`;
    },

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const icon = toast?.querySelector('i');
        const msg = document.getElementById('toastMsg');
        if (!toast || !icon || !msg) return;
        toast.style.borderLeftColor = type === 'success' ? 'var(--success-color)' : 'var(--danger-color)';
        icon.style.color = type === 'success' ? 'var(--success-color)' : 'var(--danger-color)';
        icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
        msg.innerText = message;
        toast.classList.add('show');
        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(() => toast.classList.remove('show'), 2800);
    },

    renderCategorias(categorias) {
        const nav = document.getElementById('categoryNav');
        if (!nav) return;
        let html = `<a class="cat-link active" data-cat="todos" onclick="StoreApp.filterByCategory('todos')" role="tab" aria-selected="true">Todos</a>`;
        categorias.forEach(c => {
            html += `<a class="cat-link" data-cat="${c}" onclick="StoreApp.filterByCategory('${c}')" role="tab" aria-selected="false">${c.charAt(0).toUpperCase() + c.slice(1)}</a>`;
        });
        nav.innerHTML = html;
    },

    renderContent(products, categorias, currentCategory) {
        const container = document.getElementById('dynamicContent');
        const skeleton = document.getElementById('skeletonLoader');
        if (!container) return;
        if (skeleton) skeleton.style.display = 'none';
        if (!products || products.length === 0) {
            container.innerHTML = '<div class="empty-products"><i class="fas fa-leaf"></i><h3>No hay productos disponibles</h3><p>Actualmente no tenemos productos.</p></div>';
            return;
        }
        let productosFiltrados = currentCategory === 'todos' ? products : products.filter(p => (p.categoria || 'otros') === currentCategory);
        
        if (productosFiltrados.length === 0) {
            container.innerHTML = '<div class="empty-products"><i class="fas fa-box-open"></i><h3>Categoría vacía</h3><p>No hay productos en esta categoría.</p></div>';
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
                        ${this.renderProductGrid(prodsCat)}
                    </div>
                `;
            });
            const otros = products.filter(p => !p.categoria || !categorias.includes(p.categoria));
            if (otros.length > 0) {
                html += `<div class="category-section"><div class="category-header"><h3><i class="fas fa-box"></i> Otros</h3></div>${this.renderProductGrid(otros)}</div>`;
            }
            container.innerHTML = html || '<p style="text-align:center;padding:40px;">No hay productos</p>';
            categorias.forEach(cat => {
                const prodsCat = products.filter(p => (p.categoria || 'otros') === cat);
                if (prodsCat.length > 0) this.initCategoryCarousel(cat, prodsCat);
            });
        } else {
            let html = this.renderCategoryCarousel(currentCategory, productosFiltrados) + this.renderProductGrid(productosFiltrados);
            container.innerHTML = html;
            if (productosFiltrados.length > 0) this.initCategoryCarousel(currentCategory, productosFiltrados);
        }
    },

    renderCategoryCarousel(cat, productos) {
        const imagenes = productos.slice(0, 5).map(p => Array.isArray(p.imagen) ? p.imagen[0] : p.imagen).filter(img => img);
        if (imagenes.length === 0) return '';
        return `
            <div class="category-carousel-container" id="carousel-${cat}">
                <div class="category-carousel-slides" id="slides-${cat}">
                    ${imagenes.map(src => `<div class="category-carousel-slide"><img src="${src}" alt="Producto" loading="lazy"></div>`).join('')}
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
        dots.innerHTML = imagenes.map((_, i) => `<div class="category-dot ${i===0?'active':''}" onclick="StoreUI.goToSlide('${cat}',${i})"></div>`).join('');
        let currentSlide = 0;
        window.StoreUI.goToSlide = (catName, idx) => {
            if (catName !== cat) return;
            currentSlide = idx;
            slides.style.transform = `translateX(-${currentSlide * 100}%)`;
            document.querySelectorAll(`#dots-${cat} .category-dot`).forEach((d,i) => d.classList.toggle('active', i===currentSlide));
        };
        const nextSlide = () => {
            if (imagenes.length <= 1) return;
            currentSlide = (currentSlide + 1) % imagenes.length;
            slides.style.transform = `translateX(-${currentSlide * 100}%)`;
            document.querySelectorAll(`#dots-${cat} .category-dot`).forEach((d,i) => d.classList.toggle('active', i===currentSlide));
        };
        if (this.carouselIntervals[cat]) clearInterval(this.carouselIntervals[cat]);
        if (imagenes.length > 1) this.carouselIntervals[cat] = setInterval(nextSlide, 6000);
    },

    renderProductGrid(productos) {
        if (!productos || productos.length === 0) return '';
        return `<div class="grid-productos">${productos.map(p => this.renderProductCard(p)).join('')}</div>`;
    },

    renderProductCard(p) {
        const d = p.precio * (1 - (p.descuento || 0) / 100);
        const available = p.disponible === true || p.disponible === 'true';
        const img = Array.isArray(p.imagen) ? p.imagen[0] : p.imagen;
        const imgSrc = img || 'https://via.placeholder.com/300';
        
        // 🛑 DETECCIÓN DE TAMAÑO
        const esGrande = p.tamanio === 'grande';

        // ==========================================
        // DISEÑO 1: TARJETA GRANDE (Estilo Hero / Burger King)
        // ==========================================
        if (esGrande) {
            return `
                <article class="producto-card producto-card-grande">
                    <div class="card-img-wrapper" onclick="StoreApp.openProductModal(${p.id})" role="button" tabindex="0">
                        <img src="${imgSrc}" alt="${p.nombre}" loading="lazy">
                        <div class="availability-badge ${available ? 'badge-available' : 'badge-soldout'}">${available ? 'Disponible' : 'Agotado'}</div>
                    </div>
                    <div class="card-body-grande">
                        <div class="card-info-grande">
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
                            <button class="btn-add btn-add-grande" onclick="StoreApp.addToCartFromCard(${p.id},this)" ${!available ? 'disabled' : ''}>
                                <i class="fas fa-plus"></i><span>Añadir</span>
                            </button>
                        </div>
                    </div>
                </article>
            `;
        }

        // ==========================================
        // DISEÑO 2: TARJETA PEQUEÑA (Estilo Cuadrícula)
        // ==========================================
        return `
            <article class="producto-card producto-card-pequeno">
                <div class="card-img-wrapper" onclick="StoreApp.openProductModal(${p.id})" role="button" tabindex="0">
                    <img src="${imgSrc}" alt="${p.nombre}" loading="lazy">
                    <div class="availability-badge ${available ? 'badge-available' : 'badge-soldout'}">${available ? 'Disponible' : 'Agotado'}</div>
                </div>
                <div class="card-body">
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

    updateCardQty(btn, delta) {
        const val = btn.parentElement.querySelector('.qty-val');
        if (!val) return;
        let v = parseInt(val.innerText) + delta;
        if (v >= 1) val.innerText = v;
    },

    updateCartUI() {
        const cont = document.getElementById('cartItemsContainer');
        const totalSpan = document.getElementById('cartTotal');
        const subtotalSpan = document.getElementById('cartSubtotal');
        const countSpan = document.getElementById('cartCount');
        const cartBtn = document.getElementById('floatingCartBtn');
        const floatBtn = document.getElementById('floatingCheckoutBtn');
        const checkoutTotal = document.getElementById('checkoutTotalAmount');
        if (!cont || !totalSpan || !subtotalSpan || !countSpan) return;
        
        let total = Cart.getTotal();
        let count = Cart.getCount();

        if (Cart.items.length === 0) {
            cont.innerHTML = '<div class="cart-empty-state"><i class="fas fa-shopping-basket"></i><p>Tu carrito está vacío</p></div>';
            totalSpan.innerText = `0 ${this.currentCurrency}`;
            subtotalSpan.innerText = `0 ${this.currentCurrency}`;
            countSpan.innerText = '0';
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
                        <i class="fas fa-trash-alt item-remove" onclick="StoreApp.removeFromCart(${idx})"></i>
                    </div>
                </div>
            </div>
        `).join('');

        const formattedTotal = this.formatPrice(total);
        totalSpan.innerText = formattedTotal;
        subtotalSpan.innerText = formattedTotal;
        countSpan.innerText = count;
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
                if (btnConfirmar) { btnConfirmar.disabled = true; btnConfirmar.style.opacity = '0.5'; }
            } else {
                if (noCardWarning) noCardWarning.style.display = 'none';
                if (btnConfirmar) { btnConfirmar.disabled = false; btnConfirmar.style.opacity = '1'; }
                const cardNumberEl = document.getElementById('bankCardNumber');
                if (cardNumberEl) cardNumberEl.innerText = numeroTarjeta;
                if (whatsapp) {
                    const mensaje = encodeURIComponent(`Hola, adjunto comprobante por ${this.formatPrice(Cart.getTotal())}`);
                    const link = document.getElementById('whatsappBankLink');
                    if (link) { link.href = `https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${mensaje}`; link.style.display = 'block'; }
                }
                if (bankBox) bankBox.classList.add('visible');
            }
        } else {
            if (bankBox) bankBox.classList.remove('visible');
            if (noCardWarning) noCardWarning.style.display = 'none';
            if (btnConfirmar) { btnConfirmar.disabled = false; btnConfirmar.style.opacity = '1'; }
        }
    }
};