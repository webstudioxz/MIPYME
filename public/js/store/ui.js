// ============================================
// STORE UI - Renderizado y UI de la tienda
// ============================================
window.StoreUI = {
    currentCurrency: 'CUP',
    exchangeRates: { CUP: 1, USD: 25, EUR: 27 },
    storeConfig: {},

    // ==========================================
    // FORMATO DE PRECIOS
    // ==========================================
    formatPrice(priceCUP) {
        if (typeof priceCUP !== 'number' || isNaN(priceCUP)) priceCUP = 0;
        const rate = this.exchangeRates[this.currentCurrency] || 1;
        const converted = priceCUP * rate;
        const symbol = this.currentCurrency;

        if (this.currentCurrency === 'CUP') {
            return Math.round(converted).toLocaleString('es-ES') + ' ' + symbol;
        }
        return converted.toFixed(2) + ' ' + symbol;
    },

    // ==========================================
    // RENDERIZADO DE CATEGORÍAS (sticky nav)
    // ==========================================
    renderCategorias(categorias) {
        const nav = document.getElementById('categoryNav');
        if (!nav) return;

        const iconos = {
            'todos': 'fa-th-large',
            'alimentos': 'fa-utensils',
            'bebidas': 'fa-mug-hot',
            'higiene': 'fa-pump-soap',
            'limpieza': 'fa-spray-can-sparkles',
            'hogar': 'fa-house-chimney',
            'tecnologia': 'fa-laptop',
            'ofertas': 'fa-tags',
            'cuidado-personal': 'fa-heart-pulse',
            'otros': 'fa-box'
        };

        let html = `<a href="#" class="cat-link active" data-cat="todos" onclick="StoreApp.filterByCategory('todos')">
            <i class="fas ${iconos['todos'] || 'fa-th-large'}"></i> Todos
        </a>`;

        categorias.forEach(cat => {
            const safeCat = (cat || 'otros').toLowerCase().replace(/\s+/g, '-');
            const icon = iconos[safeCat] || iconos[cat?.toLowerCase()] || 'fa-tag';
            const label = cat ? (cat.charAt(0).toUpperCase() + cat.slice(1)) : 'Otros';
            html += `<a href="#" class="cat-link" data-cat="${cat}" onclick="StoreApp.filterByCategory('${cat}')">
                <i class="fas ${icon}"></i> ${label}
            </a>`;
        });

        nav.innerHTML = html;
    },

    // ==========================================
    // RENDERIZADO DE PRODUCTOS
    // ==========================================
    renderContent(products, categorias, currentCat) {
        const container = document.getElementById('dynamicContent');
        const skeleton = document.getElementById('skeletonLoader');
        if (skeleton) skeleton.style.display = 'none';

        let filtered = products;
        if (currentCat && currentCat !== 'todos') {
            filtered = products.filter(p => p.categoria === currentCat);
        }

        if (!filtered || filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-products" style="text-align:center;padding:60px 20px;color:var(--text-muted);">
                    <i class="fas fa-box-open" style="font-size:3rem;opacity:0.3;margin-bottom:16px;display:block;"></i>
                    <h3 style="color:var(--text-main);margin-bottom:8px;">Sin productos</h3>
                    <p>No hay productos en esta categoría aún.</p>
                </div>`;
            return;
        }

        // Ordenar: grandes primero, luego pequeños
        const grandes = filtered.filter(p => p.tamano === 'grande');
        const pequenos = filtered.filter(p => p.tamano !== 'grande');

        let html = '<div class="grid-productos">';

        // Tarjeta grande promocional (solo si hay)
        if (grandes.length > 0 && currentCat === 'todos') {
            const p = grandes[0];
            html += this.renderBigCard(p);
        }

        // Tarjetas normales
        const lista = (grandes.length > 0 && currentCat === 'todos')
            ? [...grandes.slice(1), ...pequenos]
            : filtered;

        lista.forEach(p => { html += this.renderCard(p); });

        html += '</div>';
        container.innerHTML = html;
    },

    // ==========================================
    // TARJETA DE PRODUCTO NORMAL
    // ==========================================
    renderCard(p) {
        const precioFinal = p.precio * (1 - (p.descuento || 0) / 100);
        const disponible = p.disponible === true || p.disponible === 'true';
        const img = Array.isArray(p.imagen) ? p.imagen[0] : p.imagen;
        const imgSrc = img || 'https://via.placeholder.com/400x400?text=Sin+imagen';
        const tieneDesc = p.descuento && p.descuento > 0;

        return `
        <article class="producto-card" data-id="${p.id}">
            <div class="card-img-wrapper" onclick="StoreApp.openProductModal('${p.id}')">
                ${tieneDesc ? `<span class="availability-badge badge-offer"><i class="fas fa-tag"></i> -${p.descuento}%</span>` : ''}
                ${!disponible ? `<span class="availability-badge badge-soldout"><i class="fas fa-ban"></i> Agotado</span>` : ''}
                ${disponible && !tieneDesc ? `<span class="availability-badge badge-available"><i class="fas fa-circle-check"></i> Disponible</span>` : ''}
                <button class="card-wishlist" onclick="event.stopPropagation();StoreUI.toggleWishlist('${p.id}', this)" aria-label="Favorito">
                    <i class="fas fa-heart"></i>
                </button>
                <img src="${imgSrc}" alt="${this.escape(p.nombre)}" loading="lazy">
                <button class="card-quickview" onclick="event.stopPropagation();StoreApp.openProductModal('${p.id}')">
                    <i class="fas fa-eye"></i> Vista rápida
                </button>
            </div>
            <div class="card-body">
                <span class="card-category">${this.escape(p.categoria || 'Otros')}</span>
                <h3 class="card-title">${this.escape(p.nombre)}</h3>
                <div class="price-box">
                    ${tieneDesc ? `<span class="old-price">${this.formatPrice(p.precio)}</span>` : ''}
                    <span class="new-price">${this.formatPrice(precioFinal)}</span>
                </div>
                <div class="card-footer">
                    <div class="qty-control">
                        <button class="qty-btn" onclick="StoreUI.changeQty(this,-1)" aria-label="Restar">−</button>
                        <span class="qty-val">1</span>
                        <button class="qty-btn" onclick="StoreUI.changeQty(this,1)" aria-label="Sumar">+</button>
                    </div>
                    <button class="btn-add" ${!disponible ? 'disabled' : ''} onclick="StoreApp.addToCartFromCard('${p.id}', this)">
                        <i class="fas fa-${disponible ? 'cart-plus' : 'ban'}"></i> ${disponible ? 'Añadir' : 'Agotado'}
                    </button>
                </div>
            </div>
        </article>`;
    },

    // ==========================================
    // TARJETA GRANDE (producto destacado)
    // ==========================================
    renderBigCard(p) {
        const precioFinal = p.precio * (1 - (p.descuento || 0) / 100);
        const disponible = p.disponible === true || p.disponible === 'true';
        const img = Array.isArray(p.imagen) ? p.imagen[0] : p.imagen;
        const imgSrc = img || 'https://via.placeholder.com/600x400?text=Sin+imagen';

        return `
        <article class="producto-card producto-card-grande" data-id="${p.id}">
            <div class="card-img-wrapper" onclick="StoreApp.openProductModal('${p.id}')">
                ${p.descuento ? `<span class="availability-badge badge-offer"><i class="fas fa-fire"></i> Oferta -${p.descuento}%</span>` : ''}
                <img src="${imgSrc}" alt="${this.escape(p.nombre)}" loading="lazy">
            </div>
            <div class="card-body-grande">
                <span class="card-category">${this.escape(p.categoria || 'Destacado')}</span>
                <h3 class="card-title-grande">${this.escape(p.nombre)}</h3>
                ${p.descripcion ? `<p class="card-desc-grande">${this.escape(p.descripcion)}</p>` : ''}
                <div class="price-box-grande">
                    ${p.descuento ? `<span class="old-price">${this.formatPrice(p.precio)}</span>` : ''}
                    <span class="new-price-grande">${this.formatPrice(precioFinal)}</span>
                </div>
                <div class="card-actions-grande">
                    <div class="qty-control">
                        <button class="qty-btn" onclick="StoreUI.changeQty(this,-1)">−</button>
                        <span class="qty-val">1</span>
                        <button class="qty-btn" onclick="StoreUI.changeQty(this,1)">+</button>
                    </div>
                    <button class="btn-add" ${!disponible ? 'disabled' : ''} onclick="StoreApp.addToCartFromCard('${p.id}', this)">
                        <i class="fas fa-${disponible ? 'cart-plus' : 'ban'}"></i> ${disponible ? 'Añadir al carrito' : 'Agotado'}
                    </button>
                </div>
            </div>
        </article>`;
    },

    // ==========================================
    // HELPERS DE UI
    // ==========================================
    changeQty(btn, delta) {
        const span = btn.parentElement.querySelector('.qty-val');
        let v = parseInt(span.textContent) + delta;
        if (v < 1) v = 1;
        if (v > 3) {
            this.showToast('Máximo 3 unidades por producto', 'error');
            return;
        }
        span.textContent = v;
    },

    toggleWishlist(id, btn) {
        let favs = JSON.parse(localStorage.getItem('tienda-fg_favoritos') || '[]');
        if (favs.includes(id)) {
            favs = favs.filter(f => f !== id);
            btn.classList.remove('active');
            this.showToast('Quitado de favoritos', 'info');
        } else {
            favs.push(id);
            btn.classList.add('active');
            this.showToast('♥ Añadido a favoritos');
        }
        localStorage.setItem('tienda-fg_favoritos', JSON.stringify(favs));
    },

    escape(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    },

    // ==========================================
    // RENDERIZADO DEL CARRITO
    // ==========================================
    updateCartUI() {
        const container = document.getElementById('cartItemsContainer');
        const subtotalEl = document.getElementById('cartSubtotal');
        const totalEl = document.getElementById('cartTotal');
        const cartCount = document.getElementById('cartCount');
        const cartCountDesktop = document.getElementById('cartCountDesktop');
        const checkoutTotal = document.getElementById('checkoutTotalAmount');

        const total = Cart.getTotal();
        const count = Cart.getCount();

        // Badge de cantidad
        if (cartCount) cartCount.textContent = count;
        if (cartCountDesktop) cartCountDesktop.textContent = count;

        // Totales
        if (subtotalEl) subtotalEl.textContent = this.formatPrice(total);
        if (totalEl) totalEl.textContent = this.formatPrice(total);
        if (checkoutTotal) checkoutTotal.textContent = this.formatPrice(total);

        // Lista de items
        if (!container) return;

        if (Cart.items.length === 0) {
            container.innerHTML = `
                <div class="cart-empty-state">
                    <div class="empty-icon"><i class="fas fa-shopping-basket"></i></div>
                    <h4>Tu carrito está vacío</h4>
                    <p>Agrega productos para empezar tu compra.</p>
                </div>`;
            return;
        }

        container.innerHTML = Cart.items.map((item, idx) => `
            <div class="cart-item">
                <img src="${item.imagen || 'https://via.placeholder.com/64'}" alt="${this.escape(item.nombre)}">
                <div class="item-details">
                    <div class="item-name">${this.escape(item.nombre)}</div>
                    <div class="item-price">${this.formatPrice(item.precio * item.qty)}</div>
                    <div class="item-actions">
                        <button class="cart-qty-btn" onclick="StoreApp.modifyCartQty(${idx}, -1)" aria-label="Restar">−</button>
                        <span class="cart-qty-val">${item.qty}</span>
                        <button class="cart-qty-btn" onclick="StoreApp.modifyCartQty(${idx}, 1)" aria-label="Sumar">+</button>
                        <button class="item-remove" onclick="StoreApp.removeFromCart(${idx})" aria-label="Eliminar">
                            <i class="fas fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    },

    // ==========================================
    // TOGGLE INFO BANCARIA (en checkout)
    // ==========================================
    toggleBankInfo() {
        const metodo = document.querySelector('input[name="paymentMethod"]:checked')?.value;
        const bankBox = document.getElementById('bankInfoBox');
        const noCardWarning = document.getElementById('noCardWarning');

        if (metodo === 'Transferencia') {
            const cardNumber = this.storeConfig?.pago?.numero_tarjeta;
            const whatsappConf = this.storeConfig?.pago?.whatsapp_confirmacion;

            if (cardNumber) {
                if (bankBox) {
                    bankBox.classList.add('visible');
                    const cardEl = document.getElementById('bankCardNumber');
                    if (cardEl) cardEl.textContent = cardNumber;
                }
                const waLink = document.getElementById('whatsappBankLink');
                if (waLink && whatsappConf) {
                    const phone = whatsappConf.replace(/[^0-9]/g, '');
                    waLink.href = `https://wa.me/${phone}?text=${encodeURIComponent('Hola, envío comprobante de transferencia para mi pedido.')}`;
                }
                if (noCardWarning) noCardWarning.style.display = 'none';
            } else {
                if (bankBox) bankBox.classList.remove('visible');
                if (noCardWarning) noCardWarning.style.display = 'block';
            }
        } else {
            if (bankBox) bankBox.classList.remove('visible');
            if (noCardWarning) noCardWarning.style.display = 'none';
        }
    },

    // ==========================================
    // TOAST (notificaciones flotantes)
    // ==========================================
    showToast(msg, type = 'success') {
        const toast = document.getElementById('toast');
        const toastMsg = document.getElementById('toastMsg');
        const icon = toast.querySelector('i');
        if (!toast || !toastMsg) return;

        toastMsg.innerHTML = msg;
        toast.classList.remove('error', 'info');

        if (type === 'error') {
            icon.className = 'fas fa-circle-exclamation';
            icon.style.color = 'var(--danger)';
        } else if (type === 'info') {
            icon.className = 'fas fa-circle-info';
            icon.style.color = 'var(--primary)';
        } else {
            icon.className = 'fas fa-check-circle';
            icon.style.color = 'var(--success)';
        }

        toast.classList.add('show');
        clearTimeout(this._toastT);
        this._toastT = setTimeout(() => toast.classList.remove('show'), 3000);
    }
};

window.StoreUI = window.StoreUI;
