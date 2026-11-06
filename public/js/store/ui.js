window.StoreUI = {
    exchangeRates: { CUP: 1, USD: 25, EUR: 27 },
    currentCurrency: 'CUP',

    formatPrice(price) {
        const n = Number(price) || 0;
        if (this.currentCurrency === 'CUP') return `$${n.toFixed(0)} CUP`;
        return `${this.currentCurrency} ${(n / this.exchangeRates[this.currentCurrency]).toFixed(2)}`;
    },

    getImage(p) {
        if (!p) return 'https://via.placeholder.com/300';
        const img = Array.isArray(p.imagen) ? p.imagen[0] : p.imagen;
        return img && img.trim() !== '' ? img : 'https://via.placeholder.com/300';
    },

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const icon = toast.querySelector('i');
        document.getElementById('toastMsg').innerText = message;
        icon.style.color = type === 'success' ? 'var(--success)' : 'var(--danger)';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    },

    renderCategorias(categorias) {
        const nav = document.getElementById('categoryNav');
        let html = `<a class="cat-link active" data-cat="todos" onclick="event.preventDefault(); StoreApp.filterByCategory('todos');">Todos</a>`;
        categorias.forEach(c => {
            html += `<a class="cat-link" data-cat="${c}" onclick="event.preventDefault(); StoreApp.filterByCategory('${c}');">${c.toUpperCase()}</a>`;
        });
        nav.innerHTML = html;
    },

    renderContent(products, categorias, currentCategory) {
        document.getElementById('skeletonLoader').style.display = 'none';
        const container = document.getElementById('dynamicContent');
        let filtrados = currentCategory === 'todos' ? products : products.filter(p => (p.categoria || 'otros') === currentCategory);
        
        if (filtrados.length === 0) {
            container.innerHTML = '<p style="grid-column:1/-1; text-align:center; padding:40px;">No hay productos.</p>';
            return;
        }
        container.innerHTML = filtrados.map(p => this.renderProductCard(p)).join('');
    },

    renderProductCard(p) {
        const precio = Number(p.precio) || 0;
        const descuento = Number(p.descuento) || 0;
        const d = precio * (1 - descuento / 100);
        const available = p.disponible === true || p.disponible === 'true';
        
        let badge = available ? '<span class="availability-badge badge-available">Disponible</span>' : '<span class="availability-badge badge-soldout">Agotado</span>';
        if (descuento > 0 && available) badge = '<span class="availability-badge badge-offer">Oferta</span>';

        return `
            <article class="producto-card">
                <div class="card-img-wrapper">
                    ${badge}
                    <img src="${this.getImage(p)}" alt="${p.nombre}" loading="lazy">
                </div>
                <div class="card-body">
                    <span class="card-category">${p.categoria || 'General'}</span>
                    <h3 class="card-title">${p.nombre}</h3>
                    <div class="price-box">
                        ${descuento > 0 ? `<span class="old-price">${this.formatPrice(precio)}</span>` : ''}
                        <span class="new-price">${this.formatPrice(d)}</span>
                    </div>
                    <div class="card-footer">
                        <div class="qty-control">
                            <button class="qty-btn" onclick="this.parentElement.querySelector('.qty-val').innerText = Math.max(1, parseInt(this.parentElement.querySelector('.qty-val').innerText) - 1)">−</button>
                            <span class="qty-val">1</span>
                            <button class="qty-btn" onclick="this.parentElement.querySelector('.qty-val').innerText = Math.min(3, parseInt(this.parentElement.querySelector('.qty-val').innerText) + 1)">+</button>
                        </div>
                        <button class="btn-add" ${!available ? 'disabled' : ''} onclick="StoreApp.addToCartFromCard(${p.id}, this)">
                            <i class="fas fa-cart-plus"></i> Añadir
                        </button>
                    </div>
                </div>
            </article>
        `;
    },

    updateCartUI() {
        const cont = document.getElementById('cartItemsContainer');
        const count = Cart.getCount();
        document.getElementById('cartCount').innerText = count;
        const cd = document.getElementById('cartCountDesktop');
        if (cd) cd.innerText = count;

        if (Cart.items.length === 0) {
            cont.innerHTML = '<div style="text-align:center;padding:40px;">Vacío</div>';
            document.getElementById('cartTotal').innerText = '0 CUP';
            return;
        }
        cont.innerHTML = Cart.items.map((i, idx) => `
            <div class="cart-item">
                <img src="${i.imagen}" style="width:50px;height:50px;object-fit:cover;">
                <div style="flex:1;">
                    <div>${i.nombre}</div>
                    <div>${this.formatPrice(i.precio * i.qty)}</div>
                    <div style="display:flex;gap:10px;align-items:center;margin-top:5px;">
                        <button onclick="StoreApp.modifyCartQty(${idx}, -1)">−</button>
                        <span>${i.qty}</span>
                        <button onclick="StoreApp.modifyCartQty(${idx}, 1)">+</button>
                        <button onclick="StoreApp.removeFromCart(${idx})" style="color:red;background:none;border:none;">🗑️</button>
                    </div>
                </div>
            </div>
        `).join('');
        document.getElementById('cartTotal').innerText = this.formatPrice(Cart.getTotal());
    }
};