window.AdminProducts = {
    categoriasActuales: [],
    productModal: null,

    async loadCategorias(tienda) {
        try {
            this.categoriasActuales = await AdminAPI.getCategorias(tienda);
            this.updateCategoriaSelect();
        } catch (e) {
            console.error('Error categorías:', e);
        }
    },

    updateCategoriaSelect() {
        const s = document.getElementById('prodCategory');
        if (!s) return;
        if (this.categoriasActuales.length) {
            s.innerHTML = this.categoriasActuales.map(c => `<option value="${c}">${c}</option>`).join('');
        } else {
            s.innerHTML = '<option value="otros">otros</option>';
        }
    },

    async quickAddCategory() {
        const n = prompt('Nombre de la nueva categoría:');
        if (n && n.trim()) {
            const t = document.getElementById('tiendaSelect').value;
            const ok = await AdminAPI.agregarCategoria(t, n.trim().toLowerCase());
            if (ok) {
                await this.loadCategorias(t);
                AdminUI.showToast(`✅ Categoría "${n.trim()}" agregada`);
            } else {
                AdminUI.showToast('❌ Error al agregar categoría', 'error');
            }
        }
    },

    async loadProducts() {
        const t = document.getElementById('tiendaSelect').value;
        const list = document.getElementById('productsList');
        if (!t) { list.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">Selecciona una tienda</td></tr>'; return; }
        try {
            const p = await AdminAPI.getProductos(t);
            if (!p.length) { list.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No hay productos</td></tr>'; return; }
            list.innerHTML = p.map(x => `
                <tr>
                    <td><img src="${x.imagen || 'https://via.placeholder.com/45'}" style="width:42px;height:42px;border-radius:10px;object-fit:cover;" onerror="this.src='https://via.placeholder.com/45'"></td>
                    <td class="fw-semibold">${x.nombre}</td>
                    <td>$${parseFloat(x.precio).toFixed(2)}</td>
                    <td>${x.descuento || 0}%</td>
                    <td><span class="badge bg-light text-dark">${x.categoria || 'otros'}</span></td>
                    <td>${x.tamanio === 'grande' ? '📏 Grande' : '📐 Pequeño'}</td>
                    <td>${x.disponible ? '<span class="badge bg-success">Disponible</span>' : '<span class="badge bg-danger">Agotado</span>'}</td>
                    <td style="text-align:right;white-space:nowrap;">
                        <button class="btn btn-sm btn-outline-primary me-1" onclick="AdminProducts.editProduct(${x.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-outline-danger" onclick="AdminProducts.deleteProduct(${x.id})"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');
        } catch (e) {
            console.error('Error productos:', e);
        }
    },

    openProductModal() {
        document.getElementById('productFormData').reset();
        document.getElementById('productId').value = '';
        document.getElementById('prodSize').value = 'pequeno';
        document.getElementById('prodStock').value = 'true';
        document.getElementById('prodDiscount').value = '0';
        this.updateCategoriaSelect();
        this.productModal = new bootstrap.Modal(document.getElementById('productModal'));
        this.productModal.show();
    },

    async editProduct(id) {
        const t = document.getElementById('tiendaSelect').value;
        try {
            const p = (await AdminAPI.getProductos(t)).find(x => x.id == id);
            if (p) {
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
            }
        } catch (e) {
            AdminUI.showToast('❌ Error cargando producto', 'error');
        }
    },

    async saveProduct() {
        const id = document.getElementById('productId').value;
        const t = document.getElementById('tiendaSelect').value;
        const btn = document.getElementById('productSaveBtn');
        const originalText = btn.innerHTML;
        if (!t) { AdminUI.showToast('❌ No hay tienda seleccionada', 'error'); return; }
        const nombre = document.getElementById('prodName').value.trim();
        const precio = document.getElementById('prodPrice').value;
        if (!nombre || !precio || parseFloat(precio) <= 0) {
            AdminUI.showToast('❌ Nombre y precio válido son obligatorios', 'error'); return;
        }
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        btn.disabled = true;
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
        const file = document.getElementById('prodFile').files[0];
        if (file) formData.append('imagen', file);

        try {
            const result = id ? await AdminAPI.actualizarProducto(id, formData) : await AdminAPI.crearProducto(formData);
            if (result.ok && result.data.success) {
                if (this.productModal) this.productModal.hide();
                await this.loadProducts();
                AdminUI.showToast(id ? '✅ Producto actualizado' : '✅ Producto creado');
                document.getElementById('prodFile').value = '';
            } else {
                AdminUI.showToast('❌ ' + (result.data.error || 'Error al guardar'), 'error');
            }
        } catch (e) {
            AdminUI.showToast('❌ Error de conexión', 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    async deleteProduct(id) {
        if (!confirm('¿Eliminar este producto?')) return;
        const t = document.getElementById('tiendaSelect').value;
        if (await AdminAPI.eliminarProducto(id, t)) {
            await this.loadProducts();
            AdminUI.showToast('🗑️ Producto eliminado');
        } else {
            AdminUI.showToast('❌ Error al eliminar', 'error');
        }
    }
};