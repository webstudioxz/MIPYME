// ============================================================
// public/js/admin/products.js
// Gestión de productos en el panel de administración
// ============================================================

window.AdminProducts = {
    categoriasActuales: [],
    productModal: null,

    // ------------------------------------------------------------
    // Cargar categorías de la tienda activa
    // ------------------------------------------------------------
    async loadCategorias(tienda) {
        try {
            this.categoriasActuales = await AdminAPI.getCategorias(tienda);
            this.updateCategoriaSelect();
        } catch (e) {
            console.error('Error cargando categorías:', e);
        }
    },

    // ------------------------------------------------------------
    // Actualizar el <select> de categorías en el modal
    // ------------------------------------------------------------
    updateCategoriaSelect() {
        const s = document.getElementById('prodCategory');
        if (!s) return;
        
        if (this.categoriasActuales.length) {
            s.innerHTML = this.categoriasActuales.map(c => 
                `<option value="${c}">${c}</option>`
            ).join('');
        } else {
            s.innerHTML = '<option value="otros">otros</option>';
        }
    },

    // ------------------------------------------------------------
    // Agregar categoría rápida desde el modal
    // ------------------------------------------------------------
    async quickAddCategory() {
        const n = prompt('Nombre de la nueva categoría:');
        if (!n || !n.trim()) return;

        const t = document.getElementById('tiendaSelect').value;
        const categoria = n.trim().toLowerCase();

        try {
            const ok = await AdminAPI.agregarCategoria(t, categoria);
            if (ok) {
                await this.loadCategorias(t);
                document.getElementById('prodCategory').value = categoria;
                AdminUI.showToast(`✅ Categoría "${categoria}" agregada`);
            } else {
                AdminUI.showToast('❌ Error al agregar categoría', 'error');
            }
        } catch (e) {
            AdminUI.showToast('❌ Error de conexión', 'error');
        }
    },

    // ------------------------------------------------------------
    // Cargar y renderizar lista de productos
    // ------------------------------------------------------------
    async loadProducts() {
        const t = document.getElementById('tiendaSelect')?.value;
        const list = document.getElementById('productsList');
        if (!list) return;

        if (!t) {
            list.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">Selecciona una tienda</td></tr>';
            return;
        }

        try {
            const p = await AdminAPI.getProductos(t);
            
            if (!p || !p.length) {
                list.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No hay productos registrados</td></tr>';
                return;
            }

            list.innerHTML = p.map(x => `
                <tr>
                    <td>
                        <img src="${x.imagen || 'https://via.placeholder.com/45'}" 
                             style="width:42px;height:42px;border-radius:10px;object-fit:cover;" 
                             onerror="this.src='https://via.placeholder.com/45'">
                    </td>
                    <td class="fw-semibold">${x.nombre}</td>
                    <td>$${parseFloat(x.precio).toFixed(2)}</td>
                    <td>${x.descuento || 0}%</td>
                    <td><span class="badge bg-light text-dark">${x.categoria || 'otros'}</span></td>
                    <td>${x.tamanio === 'grande' ? '📏 Grande' : '📐 Pequeño'}</td>
                    <td>${x.disponible ? '<span class="badge bg-success">Disponible</span>' : '<span class="badge bg-danger">Agotado</span>'}</td>
                    <td style="text-align:right;white-space:nowrap;">
                        <button class="btn btn-sm btn-outline-primary me-1" onclick="AdminProducts.editProduct(${x.id})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="AdminProducts.deleteProduct(${x.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('');
        } catch (e) {
            console.error('Error cargando productos:', e);
            AdminUI.showToast('❌ Error cargando productos', 'error');
        }
    },

    // ------------------------------------------------------------
    // Abrir modal para NUEVO producto
    // ------------------------------------------------------------
    openProductModal() {
        const form = document.getElementById('productFormData');
        if (form) form.reset();

        document.getElementById('productId').value = '';
        document.getElementById('prodSize').value = 'pequeno';
        document.getElementById('prodStock').value = 'true';
        document.getElementById('prodDiscount').value = '0';

        this.updateCategoriaSelect();

        this.productModal = new bootstrap.Modal(document.getElementById('productModal'));
        this.productModal.show();
    },

    // ------------------------------------------------------------
    // Abrir modal para EDITAR producto existente
    // ------------------------------------------------------------
    async editProduct(id) {
        const t = document.getElementById('tiendaSelect').value;
        try {
            const productos = await AdminAPI.getProductos(t);
            const p = productos.find(x => x.id == id);
            if (!p) return;

            document.getElementById('productId').value = p.id;
            document.getElementById('prodName').value = p.nombre;
            document.getElementById('prodDescription').value = p.descripcion || '';
            document.getElementById('prodPrice').value = p.precio;
            document.getElementById('prodDiscount').value = p.descuento || 0;
            document.getElementById('prodSize').value = p.tamanio || 'pequeno';
            document.getElementById('prodStock').value = p.disponible ? 'true' : 'false';
            document.getElementById('prodImage').value = p.imagen || '';

            this.updateCategoriaSelect();
            document.getElementById('prodCategory').value = p.categoria || 'otros';

            this.productModal = new bootstrap.Modal(document.getElementById('productModal'));
            this.productModal.show();
        } catch (e) {
            AdminUI.showToast('❌ Error cargando producto', 'error');
        }
    },

    // ------------------------------------------------------------
    // Guardar (crear o actualizar) producto
    // ------------------------------------------------------------
    async saveProduct() {
        const id = document.getElementById('productId').value;
        const t = document.getElementById('tiendaSelect').value;
        const btn = document.getElementById('productSaveBtn');
        const originalText = btn.innerHTML;

        if (!t) {
            AdminUI.showToast('❌ No hay tienda seleccionada', 'error');
            return;
        }

        const nombre = document.getElementById('prodName').value.trim();
        const precio = document.getElementById('prodPrice').value;

        if (!nombre || !precio || parseFloat(precio) <= 0) {
            AdminUI.showToast('❌ Nombre y precio válido son obligatorios', 'error');
            return;
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        btn.disabled = true;

        // Preparar datos (FormData para soportar imágenes)
        const formData = new FormData();
        formData.append('tienda', t);
        formData.append('nombre', nombre);
        formData.append('descripcion', document.getElementById('prodDescription').value.trim());
        formData.append('precio', parseFloat(precio));
        formData.append('descuento', parseInt(document.getElementById('prodDiscount').value) || 0);
        formData.append('tamanio', document.getElementById('prodSize').value);
        formData.append('categoria', document.getElementById('prodCategory').value);
        formData.append('disponible', document.getElementById('prodStock').value);
        formData.append('imagen_url', document.getElementById('prodImage').value.trim());

        // Archivo de imagen (si lo hay)
        const fileInput = document.getElementById('prodFile');
        if (fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            if (file.size > 5 * 1024 * 1024) {
                AdminUI.showToast('❌ La imagen excede 5MB', 'error');
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            }
            formData.append('imagen', file);
        }

        try {
            const result = id 
                ? await AdminAPI.actualizarProducto(id, formData) 
                : await AdminAPI.crearProducto(formData);

            if (result.ok && result.data.success) {
                if (this.productModal) this.productModal.hide();
                await this.loadProducts();
                AdminUI.showToast(id ? '✅ Producto actualizado' : '✅ Producto creado');
                
                // Limpiar input file
                if (fileInput) fileInput.value = '';
            } else {
                AdminUI.showToast('❌ ' + (result.data.error || 'Error al guardar'), 'error');
            }
        } catch (e) {
            console.error('Error guardando producto:', e);
            AdminUI.showToast('❌ Error de conexión', 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    // ------------------------------------------------------------
    // Eliminar producto
    // ------------------------------------------------------------
    async deleteProduct(id) {
        if (!confirm('¿Eliminar este producto?')) return;

        const t = document.getElementById('tiendaSelect').value;
        try {
            const ok = await AdminAPI.eliminarProducto(id, t);
            if (ok) {
                await this.loadProducts();
                AdminUI.showToast('🗑️ Producto eliminado');
            } else {
                AdminUI.showToast('❌ Error al eliminar', 'error');
            }
        } catch (e) {
            AdminUI.showToast('❌ Error de conexión', 'error');
        }
    }
};