window.StoreUI = {
    currentCurrency: 'CUP',
    exchangeRates: { CUP: 1, USD: 25, EUR: 27 },
    storeConfig: {},

    formatPrice(priceCUP) {
        if (typeof priceCUP !== 'number' || isNaN(priceCUP)) priceCUP = 0;
        const rate = this.exchangeRates[this.currentCurrency] || 1;
        const converted = priceCUP * rate;
        if (this.currentCurrency === 'CUP') {
            return Math.round(converted).toLocaleString('es-ES') + ' CUP';
        }
        return converted.toFixed(2) + ' ' + this.currentCurrency;
    },

    renderCategorias(categorias) {
        const nav = document.getElementById('categoryNav');
        if (!nav) return;
        const iconos = { 'todos': 'fa-th-large', 'alimentos': 'fa-utensils', 'bebidas': 'fa-mug-hot', 'otros': 'fa-box' };
        let html = `<a href="#" class="cat-link active" data-cat="todos" onclick="StoreApp.filterByCategory('todos')"><i class="fas fa-th-large"></i> Todos</a>`;
        categorias.forEach(cat => {
            const safeCat = (cat || 'otros').toLowerCase().replace(/\s+/g, '-');
            const icon = iconos[safeCat] || 'fa-tag';
            const label = cat ? (cat.charAt(0).toUpperCase() + cat.slice(1)) : 'Otros';
            html += `<a href="#" class="cat-link" data-cat="${cat}" onclick="StoreApp.filterByCategory('${cat}')"><i class="fas ${icon}"></i> ${label}</a>`;
        });
        nav.innerHTML = html;
    },

    renderContent(products, categorias, currentCat) {
        const container = document.getElementById('dynamicContent');
        const skeleton = document.getElementById('skeletonLoader');
        if (skeleton) skeleton.style.display = 'none';

        let filtered = products;
        if (currentCat && currentCat !== 'todos') {
            filtered = products.filter(p => p.categoria === currentCat);
        }

        if (!filtered || filtered.length === 0) {
            container.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-muted);"><i class="fas fa-box-open" style="font-size:3rem;opacity:0.3;"></i><h3>Sin productos</h3></div>`;
            return;
        }

        let html = '<div class="grid-productos">';
        filtered.forEach(p => { html += this.renderCard(p); });
        html += '</div>';
        container.innerHTML = html;
    },

    renderCard(p) {
        const precioFinal = p.precio * (1 - (p.descuento || 0) / 100);
        const disponible = p.disponible === true || p.disponible === 'true';
        const img = Array.isArray(p.imagen) ? p.imagen[0] : p.imagen;
        const imgSrc = img || 'https://via.placeholder.com/400x400?text=Sin+imagen';
        const tieneDesc = p.descuento && p.descuento > 0;

        // Generar estrellas ficticias o reales (si tienes campo rating en tu BD)
        const rating = p.rating || 4.8; 
        const reviews = p.reviews || 124;
        const stars = '★'.repeat(Math.round(rating));

        return `
        <article class="producto-card" data-id="${p.id}">
            <div class="card-img-wrapper" onclick="StoreApp.openProductModal('${p.id}')">
                ${tieneDesc ? `<span class="availability-badge badge-offer"><i class="fas fa-tag"></i> Oferta</span>` : ''}
                ${!disponible ? `<span class="availability-badge" style="background:#FEE2E2;color:#EF4444"><i class="fas fa-ban"></i> Agotado</span>` : ''}
                ${disponible && !tieneDesc ? `<span class="availability-badge badge-available"><i class="fas fa-circle-check"></i> Disponible</span>` : ''}
                <button class="card-wishlist" onclick="event.stopPropagation();"><i class="fas fa-heart"></i></button>
                <img src="${imgSrc}" alt="${p.nombre}" loading="lazy">
            </div>
            <div class="card-body">
                <span class="card-category">${p.categoria || 'Otros'}</span>
                <h3 class="card-title">${p.nombre}</h3>
                <div class="card-rating"><span class="stars">${stars}</span><span>${rating} · ${reviews} reseñas</span></div>
                <div class="price-box">
                    ${tieneDesc ? `<span class="old-price">${this.formatPrice(p.precio)}</span>` : ''}
                    <span class="new-price">${this.formatPrice(precioFinal)}</span>
                </div>
                <div class="card-footer">
                    <div class="qty-control">
                        <button class="qty-btn" onclick="StoreUI.changeQty(this,-1)">−</button>
                        <span class="qty-val">1</span>
                        <button class="qty-btn" onclick="StoreUI.changeQty(this,1)">+</button>
                    </div>
                    <button class="btn-add" ${!disponible ? 'disabled' : ''} onclick="StoreApp.addToCartFromCard('${p.id}', this)">
                        <i class="fas fa-cart-plus"></i> Añadir
                    </button>
                </div>
            </div>
        </article>`;
    },

    changeQty(btn, delta) {
        const span = btn.parentElement.querySelector('.qty-val');
        let v = parseInt(span.textContent) + delta;
        if (v < 1) v = 1;
        if (v > 3) { this.showToast('Máximo 3 unidades', 'error'); return; }
        span.textContent = v;
    },

    updateCartUI() {
        const cartCount = document.getElementById('cartCount');
        const cartCountDesktop = document.getElementById('cartCountDesktop');
        const total = Cart.getTotal();
        const count = Cart.getCount();
        if (cartCount) cartCount.textContent = count;
        if (cartCountDesktop) cartCountDesktop.textContent = count;
        
        const cartTotalEl = document.getElementById('cartTotal');
        if (cartTotalEl) cartTotalEl.textContent = this.formatPrice(total);
    },

    showToast(msg, type = 'success') {
        const toast = document.getElementById('toast');
        const toastMsg = document.getElementById('toastMsg');
        if (!toast || !toastMsg) return;
        toastMsg.innerHTML = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
};