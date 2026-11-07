window.Cart = {
    items: [],
    storeId: '',

    init(storeId) {
        this.storeId = storeId;
        const saved = localStorage.getItem(`tienda-fg_cart_${storeId}`);
        if (saved) {
            try { this.items = JSON.parse(saved); } catch { this.items = []; }
        }
    },

    save() {
        localStorage.setItem(`tienda-fg_cart_${this.storeId}`, JSON.stringify(this.items));
    },

    add(product, qty) {
        if (!product || !(product.disponible === true || product.disponible === 'true')) {
            return false;
        }
        const price = product.precio * (1 - (product.descuento || 0) / 100);
        const exist = this.items.find(i => i.id == product.id);
        if (exist) {
            exist.qty += qty;
        } else {
            this.items.push({
                id: product.id,
                nombre: product.nombre,
                precio: price,
                imagen: Array.isArray(product.imagen) ? product.imagen[0] : product.imagen || 'https://via.placeholder.com/60',
                qty: qty
            });
        }
        this.save();
        return true;
    },

    modifyQty(idx, delta) {
        if (this.items[idx]) {
            this.items[idx].qty += delta;
            if (this.items[idx].qty <= 0) this.items.splice(idx, 1);
            this.save();
        }
    },

    remove(idx) {
        this.items.splice(idx, 1);
        this.save();
    },

    clear() {
        this.items = [];
        this.save();
    },

    getTotal() {
        return this.items.reduce((s, i) => s + i.precio * i.qty, 0);
    },

    getCount() {
        return this.items.reduce((s, i) => s + i.qty, 0);
    }
};