window.Cart = {
    items: [],
    storeId: '',
    MAX_POR_PRODUCTO: 3,

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
            return { success: false, message: 'Producto no disponible' };
        }
        const exist = this.items.find(i => i.id == product.id);
        const currentQty = exist ? exist.qty : 0;
        if (currentQty + qty > this.MAX_POR_PRODUCTO) {
            return { success: false, message: `Máximo ${this.MAX_POR_PRODUCTO} unidades.` };
        }
        const price = product.precio * (1 - (product.descuento || 0) / 100);
        if (exist) {
            exist.qty += qty;
        } else {
            this.items.push({
                id: product.id, nombre: product.nombre, precio: price,
                imagen: Array.isArray(product.imagen) ? product.imagen[0] : product.imagen || 'https://via.placeholder.com/60',
                qty: qty
            });
        }
        this.save();
        return { success: true };
    },

    modifyQty(idx, delta) {
        if (this.items[idx]) {
            const newQty = this.items[idx].qty + delta;
            if (delta > 0 && newQty > this.MAX_POR_PRODUCTO) {
                return { success: false, message: `Máximo ${this.MAX_POR_PRODUCTO} unidades.` };
            }
            this.items[idx].qty = newQty;
            if (this.items[idx].qty <= 0) this.items.splice(idx, 1);
            this.save();
            return { success: true };
        }
        return { success: false };
    },

    remove(idx) { this.items.splice(idx, 1); this.save(); },
    clear() { this.items = []; this.save(); },
    getTotal() { return this.items.reduce((s, i) => s + i.precio * i.qty, 0); },
    getCount() { return this.items.reduce((s, i) => s + i.qty, 0); }
};