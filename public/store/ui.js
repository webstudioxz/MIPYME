// ============================================
// STORE UI - Componentes visuales de la tienda
// ============================================
window.StoreUI = {
    exchangeRates: { CUP: 1, USD: 25, EUR: 27 },
    currentCurrency: 'CUP',
    storeConfig: null,

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
        let html = `<a class="cat-link active" data-cat="todos" onclick="StoreApp.filterByCategory('todos')">Todos</a>`;
        categorias.forEach(c => {
            html += `<a class="cat-link" data-cat="${c}" onclick="StoreApp.filterByCategory('${c}')">${c.charAt(0).toUpperCase() + c.slice(1)}</a>`;
        });
        nav.innerHTML = html;
    },

    // NUEVA FUNCIÓN: Para el carrusel automático
    renderCarrusel(productos) {
        // Tomamos hasta 3 imágenes de los productos que tengan foto
        const conImagenes = productos.filter(p => p.imagen && p.imagen !== 'https://via.placeholder.com/400');
        if (conImagenes.length === 0) return '';

        const slides = conImagenes.slice(0, 3).map((p, i) => `
            <div class="category-carousel-slide ${i === 0 ? 'active' : ''}">
                <img src="${p.imagen}" alt="${p.nombre}">
                <div class="carousel-caption-custom">
                    <h3>${p.nombre}</h3>
                    <p>${this.formatPrice(p.precio * (1 - (p.descuento || 0) / 100))}</p>
                </div>
            </div>
        `).join('');

        return `
            <div class="category-carousel-container" id="mainCarrusel">
                <div class="category-carousel-slides">
                    ${slides}
                </div>
                <div class="category-carousel-dots">
                    ${conImagenes.slice(0, 3).map((_, i) => `<div class="category-dot ${i === 0 ? 'active' : ''}" onclick="StoreApp.goToSlide(${i})"></div>`).join('')}
                </div>
            </div>
        `;
    },

    renderContent(products, categorias, currentCategory) {
        const container = document.getElementById('dynamicContent');
        const skeleton = document.getElementById('skeletonLoader');
        
        if (skeleton) skeleton.style.display = 'none';
        if (!container) return;
        
        if (!products || products.length === 0) {
            container.innerHTML = '<div class="empty-products"><i class="fas fa-leaf"></i><h3>No hay productos</h3><p>Esta tienda aún no tiene productos en su catálogo.</p></div>';
            return;
        }
        
        let filtrados = currentCategory === 'todos' ? products : products.filter(p => (p.categoria || 'otros') === currentCategory);
        
        if (filtrados.length === 0) {
            container.innerHTML = '<div class="empty-products"><i class="fas fa-box-open"></i><h3>Categoría vacía</h3><p>No hay productos en esta categoría.</p></div>';
            return;
        }

        if (currentCategory === 'todos') {
            let html = this.renderCarrusel(products); // <-- Insertamos el carrusel aquí
            
            categorias.forEach(cat => {
                const prodsCat = products.filter(p => (p.categoria || 'otros') === cat);
                if (prodsCat.length === 0) return;
                html += `<div class="category-section"><div class="category-header"><h3><i class="fas fa-tag"></i> ${cat.charAt(0).toUpperCase() + cat.slice(1)}</h3></div>${this.renderProductGrid(prodsCat)}</div>`;
            });
            container.innerHTML = html || '<p style="text-align:center;padding:40px;">No hay productos</p>';
            
            // Iniciar el auto-slide del carrusel
            if (window.StoreApp) window.StoreApp.startCarousel();
        } else {
            container.innerHTML = this.renderProductGrid(filtrados);
        }
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
        const esGrande = p.tamanio === 'grande';

        // 🛑 CORRECCIÓN DEL PRODUCTO GRANDE (Imagen arriba, info abajo)
        if (esGrande) {
            return `
                <article class="producto-card producto-card-grande">
                    <div class="card-img-wrapper" onclick="StoreApp.openProductModal(${p.id})">
                        <img src="${imgSrc}" alt="${p.nombre}" loading="lazy">
                        <div class="availability-badge ${available ? 'badge-available' : 'badge-soldout'}">${available ? 'Disponible' : 'Agotado'}</div>
                    </div>
                    <div class="card-body-grande" style="width: 100%; padding: 16px;">
                        <div class="card-info-grande">
                            <h3 class="card-title-grande">${p.nombre}</h3>
                            <div class="price-box-grande">
                                ${p.descuento ? `<span class="old-price">${this.formatPrice(p.precio)}</span>` : ''}
                                <span class="new-price-grande">${this.formatPrice(d)}</span>
                            </div>
                        </div>
                        <div class="card-actions-grande" style="margin-top: 15px;">
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

        // Producto normal (pequeño)
        return `
            <article class="producto-card producto-card-pequeno">
                <div class="card-img-wrapper" onclick="StoreApp.openProductModal(${p.id})">
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
        if (v >= 1 && v <= 3) val.innerText = v;
        else if (v > 3) this.showToast('Máximo 3 unidades por producto', 'error');
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