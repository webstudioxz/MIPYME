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

        toast.classList.add('mostrar');
        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(() => toast.classList.remove('mostrar'), 2800);
    },

    renderCategorias(categorias) {
        const nav = document.getElementById('categoryNav');
        if (!nav) return;
        
        let html = `<a class="cat-link active" data-cat="todos" onclick="StoreApp.filterByCategory('todos')"><i class="fas fa-th-large"></i> Todos</a>`;
        categorias.forEach(c => {
            html += `<a class="cat-link" data-cat="${c}" onclick="StoreApp.filterByCategory('${c}')"><i class="fas fa-tag"></i> ${c.charAt(0).toUpperCase() + c.slice(1)}</a>`;
        });
        nav.innerHTML = html;
    },

    // 🚨 NUEVA LÓGICA DE RENDERIZADO POR CATEGORÍA Y CARRUSEL
    renderContent(products, categorias, currentCategory) {
        const container = document.getElementById('dynamicContent');
        const skeleton = document.getElementById('skeletonLoader');
        if (!container) return;
        if (skeleton) skeleton.style.display = 'none';

        if (!products || products.length === 0) {
            container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px;"><i class="fas fa-box-open" style="font-size:3rem;color:#cbd5e1;margin-bottom:15px;"></i><h3>No hay productos disponibles</h3></div>';
            return;
        }

        let html = '';
        const likes = JSON.parse(localStorage.getItem('tienda-fg_likes') || '{}');
        const catsToRender = currentCategory === 'todos' ? categorias : [currentCategory];

        catsToRender.forEach(cat => {
            let prodsCat = products.filter(p => (p.categoria || 'otros') === cat);
            if (prodsCat.length === 0) return;

            // Ordenar productos de la categoría por cantidad de "Me gusta" (los que tienen like van primero)
            prodsCat.sort((a, b) => (likes[b.id] ? 1 : 0) - (likes[a.id] ? 1 : 0));

            // Tomar máximo 3 imágenes para el carrusel
            const carouselProds = prodsCat.slice(0, 3);

            // Renderizar Título de la Categoría
            html += `<div class="category-section mt-4 mb-4" style="grid-column: 1 / -1;">
                        <h3 style="font-family:var(--font-display); font-weight:800; text-transform:uppercase; margin-bottom:16px; font-size:1.2rem; color:var(--ink);"><i class="fas fa-tags" style="color:var(--brand); margin-right:8px;"></i> ${cat}</h3>`;

            // Renderizar Carrusel (si hay imágenes)
            if (carouselProds.length > 0) {
                html += `<div class="category-carousel-container" id="carousel-${cat}">
                            <div class="category-carousel-slides" id="slides-${cat}">`;
                carouselProds.forEach(p => {
                    let img = Array.isArray(p.imagen) ? p.imagen[0] : p.imagen;
                    if (!img || img.includes('placeholder')) {
                        img = 'https://images.unsplash.com/photo-1560393464-5c69a73c5770?q=80&w=600&auto=format&fit=crop';
                    }
                    html += `<div class="category-carousel-slide"><img src="${img}" alt="${p.nombre}"></div>`;
                });
                html += `   </div>
                        </div>`;
            }

            // Renderizar Grilla de Productos de esta categoría
            html += `<div class="grid-productos">`;
            prodsCat.forEach(p => {
                html += this.renderProductCard(p);
            });
            html += `</div></div>`;
        });

        container.innerHTML = html;

        // Inicializar los intervalos de los carruseles
        catsToRender.forEach(cat => {
            let prodsCat = products.filter(p => (p.categoria || 'otros') === cat);
            if (prodsCat.length > 0) this.initCategoryCarousel(cat, prodsCat);
        });
    },

    initCategoryCarousel(cat, productos) {
        const slides = document.getElementById(`slides-${cat}`);
        if (!slides) return;
        
        const totalSlides = slides.children.length;
        if (totalSlides <= 1) return; // No hacer carrusel si solo hay 1 foto

        let current = 0;
        if (this.carouselIntervals[cat]) clearInterval(this.carouselIntervals[cat]);
        
        this.carouselIntervals[cat] = setInterval(() => {
            current = (current + 1) % totalSlides;
            slides.style.transform = `translateX(-${current * 100}%)`;
        }, 4000); // Cambia cada 4 segundos
    },

    renderProductCard(p) {
        const d = p.precio * (1 - (p.descuento || 0) / 100);
        const available = p.disponible === true || p.disponible === 'true';
        let img = Array.isArray(p.imagen) ? p.imagen[0] : p.imagen;
        
        if (!img || img.includes('placeholder')) {
            img = 'https://images.unsplash.com/photo-1560393464-5c69a73c5770?q=80&w=400&auto=format&fit=crop';
        }

        const likes = JSON.parse(localStorage.getItem('tienda-fg_likes') || '{}');
        const isLiked = !!likes[p.id];
        
        const ratings = JSON.parse(localStorage.getItem('tienda-fg_ratings') || '{}');
        const pRating = ratings[p.id] || { sum: 0, count: 0 };
        const avg = pRating.count > 0 ? (pRating.sum / pRating.count).toFixed(1) : '0.0';
        const count = pRating.count;
        const starsHtml = '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg));

        const heartStyle = isLiked ? 'background: var(--danger); color: #fff;' : '';
        const heartClass = isLiked ? 'active' : '';

        return `
            <article class="producto-card">
                <div class="card-img-wrapper" onclick="StoreApp.openProductModal(${p.id})">
                    <img src="${img}" alt="${p.nombre}" loading="lazy">
                    ${p.descuento > 0 ? `<span class="availability-badge badge-offer">Oferta</span>` : (available ? `<span class="availability-badge badge-available">Disponible</span>` : `<span class="availability-badge badge-soldout">Agotado</span>`)}
                    <button class="card-wishlist ${heartClass}" style="${heartStyle}" onclick="event.stopPropagation(); StoreUI.toggleWishlist(this, ${p.id})"><i class="fas fa-heart"></i></button>
                </div>
                <div class="card-body">
                    <span class="card-category">${p.categoria || 'otros'}</span>
                    <h3 class="card-title">${p.nombre}</h3>
                    <div class="card-rating">
                        <span class="stars" style="color:${avg > 0 ? '#FFB800' : '#E2E8F0'}">${starsHtml}</span>
                        <span>${avg} · ${count}</span>
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
                        <button class="btn-add" onclick="StoreApp.addToCartFromCard(${p.id},this)" ${!available ? 'disabled' : ''}>
                            <i class="fas fa-plus"></i><span>Añadir</span>
                        </button>
                    </div>
                </div>
            </article>
        `;
    },

    toggleWishlist(btn, productId) {
        const likes = JSON.parse(localStorage.getItem('tienda-fg_likes') || '{}');
        const isLiked = likes[productId];
        
        if (isLiked) {
            delete likes[productId];
            btn.classList.remove('active');
            btn.style.background = '';
            btn.style.color = '';
            this.showToast('Quitado de favoritos');
        } else {
            likes[productId] = true;
            btn.classList.add('active');
            btn.style.background = 'var(--danger)';
            btn.style.color = '#fff';
            this.showToast('Añadido a favoritos ♥');
            
            const ratings = JSON.parse(localStorage.getItem('tienda-fg_ratings') || '{}');
            if (!ratings[productId]) ratings[productId] = { sum: 0, count: 0, userVoted: false };
            if (!ratings[productId].userVoted) {
                ratings[productId].sum += 5;
                ratings[productId].count += 1;
                ratings[productId].userVoted = true;
                localStorage.setItem('tienda-fg_ratings', JSON.stringify(ratings));
            }
        }
        localStorage.setItem('tienda-fg_likes', JSON.stringify(likes));
        StoreApp.renderContent();
    },

    updateCardQty(btn, delta) {
        const val = btn.parentElement.querySelector('.qty-val');
        if (!val) return;
        let v = parseInt(val.innerText) + delta;
        if (v >= 1 && v <= 3) val.innerText = v;
    },

    updateModalQty(delta) {
        const val = document.getElementById('modalQty');
        if (!val) return;
        let v = parseInt(val.innerText) + delta;
        if (v >= 1 && v <= 3) val.innerText = v;
    },

    updateCartUI() {
        const cont = document.getElementById('cartItemsContainer');
        const totalSpan = document.getElementById('cartTotal');
        const countSpan = document.getElementById('cartCount');
        const countDesktop = document.getElementById('cartCountDesktop');
        if (!cont || !totalSpan || !countSpan) return;

        const total = Cart.getTotal();
        const count = Cart.getCount();
        countSpan.innerText = count;
        if (countDesktop) countDesktop.innerText = count;

        if (Cart.items.length === 0) {
            cont.innerHTML = `<div class="cart-empty-state"><div class="empty-icon"><i class="fas fa-shopping-basket"></i></div><h4>Tu carrito está vacío</h4><p>Agrega productos para empezar tu compra.</p></div>`;
            totalSpan.innerText = this.formatPrice(0);
            return;
        }

        cont.innerHTML = Cart.items.map((i, idx) => `
            <div class="cart-item" style="display:flex; gap:14px; margin-bottom:12px; align-items:center; background:#fff; padding:12px; border-radius:12px; border:1px solid var(--line-soft);">
                <img src="${i.imagen}" alt="${i.nombre}" style="width:64px; height:64px; border-radius:8px; object-fit:cover;">
                <div style="flex:1;">
                    <div style="font-family:var(--font-display); font-weight:700; font-size:0.9rem; margin-bottom:4px;">${i.nombre}</div>
                    <div style="color:var(--brand); font-weight:800; font-size:1rem;">${this.formatPrice(i.precio * i.qty)}</div>
                    <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
                        <button style="width:24px;height:24px;border-radius:50%;border:none;background:#EEF2F7;font-weight:800;cursor:pointer;" onclick="StoreApp.modifyCartQty(${idx},-1)">−</button>
                        <span style="font-weight:700;font-size:0.85rem;">${i.qty}</span>
                        <button style="width:24px;height:24px;border-radius:50%;border:none;background:#EEF2F7;font-weight:800;cursor:pointer;" onclick="StoreApp.modifyCartQty(${idx},1)">+</button>
                        <button style="margin-left:auto;background:none;border:none;color:var(--danger);cursor:pointer;" onclick="StoreApp.removeFromCart(${idx})"><i class="fas fa-trash-can"></i></button>
                    </div>
                </div>
            </div>
        `).join('');

        totalSpan.innerText = this.formatPrice(total);
    },

    toggleBankInfo() {}
};