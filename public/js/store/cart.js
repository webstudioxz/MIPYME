// ============================================================
// public/js/store/cart.js
// Gestión del carrito con límite de 3 unidades por producto
// ============================================================

window.Cart = {
    items: [],
    storeId: '',
    MAX_POR_PRODUCTO: 3, // 🛑 Límite por producto

    // ------------------------------------------------------------
    // Inicializar carrito para una tienda específica
    // ------------------------------------------------------------
    init(storeId) {
        this.storeId = storeId || '';
        const saved = localStorage.getItem(`tienda-fg_cart_${this.storeId}`);
        if (saved) {
            try {
                this.items = JSON.parse(saved);
                if (!Array.isArray(this.items)) this.items = [];
            } catch (e) {
                this.items = [];
            }
        } else {
            this.items = [];
        }
    },

    // ------------------------------------------------------------
    // Persistir en localStorage
    // ------------------------------------------------------------
    save() {
        try {
            localStorage.setItem(`tienda-fg_cart_${this.storeId}`, JSON.stringify(this.items));
        } catch (e) {
            console.error('Error guardando carrito:', e);
        }
    },

    // ------------------------------------------------------------
    // Añadir producto
    // ------------------------------------------------------------
    add(product, qty) {
        if (!product) {
            return { success: false, message: 'Producto inválido' };
        }

        if (!(product.disponible === true || product.disponible === 'true')) {
            return { success: false, message: 'Producto no disponible' };
        }

        const exist = this.items.find(i => i.id == product.id);
        const currentQty = exist ? exist.qty : 0;

        // 🛑 Validación: no superar el límite
        if (currentQty + qty > this.MAX_POR_PRODUCTO) {
            return {
                success: false,
                message: `Solo puedes comprar un máximo de ${this.MAX_POR_PRODUCTO} unidades de este producto.`
            };
        }

        const price = product.precio * (1 - (product.descuento || 0) / 100);

        if (exist) {
            exist.qty += qty;
        } else {
            this.items.push({
                id: product.id,
                nombre: product.nombre,
                precio: price,
                imagen: Array.isArray(product.imagen)
                    ? product.imagen[0]
                    : product.imagen || 'https://via.placeholder.com/60',
                qty: qty
            });
        }

        this.save();
        return { success: true };
    },

    // ------------------------------------------------------------
    // Modificar cantidad (+1 / -1)
    // ------------------------------------------------------------
    modifyQty(idx, delta) {
        if (!this.items[idx]) {
            return { success: false, message: 'Producto no encontrado' };
        }

        const newQty = this.items[idx].qty + delta;

        // 🛑 Validación: no superar el límite
        if (delta > 0 && newQty > this.MAX_POR_PRODUCTO) {
            return {
                success: false,
                message: `El límite es de ${this.MAX_POR_PRODUCTO} unidades por producto.`
            };
        }

        this.items[idx].qty = newQty;
        if (this.items[idx].qty <= 0) {
            this.items.splice(idx, 1);
        }

        this.save();
        return { success: true };
    },

    // ------------------------------------------------------------
    // Eliminar producto
    // ------------------------------------------------------------
    remove(idx) {
        if (this.items[idx]) {
            this.items.splice(idx, 1);
            this.save();
        }
    },

    // ------------------------------------------------------------
    // Vaciar carrito
    // ------------------------------------------------------------
    clear() {
        this.items = [];
        this.save();
    },

    // ------------------------------------------------------------
    // Total en CUP
    // ------------------------------------------------------------
    getTotal() {
        return this.items.reduce((s, i) => s + i.precio * i.qty, 0);
    },

    // ------------------------------------------------------------
    // Cantidad total de items
    // ------------------------------------------------------------
    getCount() {
        return this.items.reduce((s, i) => s + i.qty, 0);
    }
};