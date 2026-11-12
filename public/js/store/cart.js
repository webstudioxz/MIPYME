// ============================================================
// public/js/store/cart.js
// ============================================================

window.Cart = {
    items: [],
    storeId: '',
    MAX_POR_PRODUCTO: 3,

    init(storeId) {
        this.storeId = storeId || '';
        const saved = localStorage.getItem(`tienda-fg_cart_${this.storeId}`);
        if (saved) {
            try {
                this.items = JSON.parse(saved);
                if (!Array.isArray(this.items)) this.items = [];
            } catch (e) { this.items = []; }
        } else { this.items = []; }
    },

    save() {
        try { localStorage.setItem(`tienda-fg_cart_${this.storeId}`, JSON.stringify(this.items)); } catch (e) {}
    },

    add(product, qty) {
        if (!product) return { success: false, message: 'Producto inválido' };
        if (!(product.disponible === true || product.disponible === 'true')) return { success: false, message: 'Producto no disponible' };

        const exist = this.items.find(i => i.id == product.id);
        const currentQty = exist ? exist.qty : 0;

        if (currentQty + qty > this.MAX_POR_PRODUCTO) {
            return { success: false, message: `Solo puedes comprar un máximo de ${this.MAX_POR_PRODUCTO} unidades.` };
        }

        const precioBase = parseFloat(product.precio) || 0;
        const descuento = parseFloat(product.descuento) || 0;
        const precioFinal = precioBase * (1 - (descuento / 100));

        if (exist) {
            exist.qty += qty;
        } else {
            this.items.push({
                id: product.id,
                nombre: product.nombre,
                precio: precioFinal,
                imagen: Array.isArray(product.imagen) ? product.imagen[0] : (product.imagen || 'https://via.placeholder.com/60'),
                qty: qty
            });
        }

        this.save();
        return { success: true };
    },

    modifyQty(idx, delta) {
        if (!this.items[idx]) return { success: false, message: 'Producto no encontrado' };
        const newQty = this.items[idx].qty + delta;
        if (delta > 0 && newQty > this.MAX_POR_PRODUCTO) return { success: false, message: `El límite es de ${this.MAX_POR_PRODUCTO} unidades.` };

        this.items[idx].qty = newQty;
        if (this.items[idx].qty <= 0) this.items.splice(idx, 1);

        this.save();
        return { success: true };
    },

    remove(idx) {
        if (this.items[idx]) {
            this.items.splice(idx, 1);
            this.save();
        }
    },

    clear() {
        this.items = [];
        this.save();
    },

    getTotal() {
        return this.items.reduce((s, i) => s + (i.precio * i.qty), 0);
    },

    getCount() {
        return this.items.reduce((s, i) => s + i.qty, 0);
    }
};