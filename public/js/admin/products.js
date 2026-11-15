// ============================================================
// public/js/admin/products.js — CORREGIDO v3
// ============================================================

window.AdminProducts = {
    categoriasActuales: [],
    productModal: null,
    currentImageMode: 'url',
    uploadedImageBase64: null,
    uploadedImageFile: null,

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
            list.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-muted">Selecciona una tienda</td></tr>';
            return;
        }

        try {
            const p = await AdminAPI.getProductos(t);
            if (!p || !p.length) {
                list.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-muted">No hay productos registrados</td></tr>';
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
                    <td>
                        ${x.contacto_nombre
                            ? `<span class="badge bg-info text-dark" title="Nombre del contacto"><i class="fas fa-user"></i> ${x.contacto_nombre}</span>`
                            : '<span class="text-muted small">—</span>'}
                    </td>
                    <td>
                        ${x.whatsapp_proveedor
                            ? `<span class="badge bg-warning text-dark" title="WhatsApp del proveedor"><i class="fab fa-whatsapp"></i> ${x.whatsapp_proveedor}</span>`
                            : '<span class="text-muted small">—</span>'}
                    </td>
                    <td>${x.requiere_carnet ? '<span class="badge bg-info text-dark">🪪 Sí</span>' : '<span class="text-muted small">No</span>'}</td>
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
    // Tabs de imagen (URL / Archivo)
    // ------------------------------------------------------------
    setImageMode(mode) {
        this.currentImageMode = mode;
        document.querySelectorAll('.image-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
        const urlBox = document.getElementById('imageModeUrl');
        const fileBox = document.getElementById('imageModeFile');
        if (urlBox) urlBox.style.display = mode === 'url' ? 'block' : 'none';
        if (fileBox) fileBox.style.display = mode === 'file' ? 'block' : 'none';
    },

    async handleImageFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            AdminUI.showToast('❌ La imagen excede 5MB', 'error');
            return;
        }
        this.uploadedImageFile = file;
        const preview = document.getElementById('imagePreview');
        if (!preview) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.innerHTML = `<img src="${e.target.result}" alt="Preview"><button type="button" class="remove-img" onclick="AdminProducts.removeUploadedImage()"><i class="fas fa-times"></i></button>`;
            preview.style.display = 'inline-block';
        };
        reader.readAsDataURL(file);
    },

    removeUploadedImage() {
        this.uploadedImageBase64 = null;
        this.uploadedImageFile = null;
        const preview = document.getElementById('imagePreview');
        const fileInput = document.getElementById('prodFile');
        if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
        if (fileInput) fileInput.value = '';
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

        // 🚨 Campos nuevos
        if (document.getElementById('prodContactoNombre')) document.getElementById('prodContactoNombre').value = '';
        if (document.getElementById('prodWhatsAppProveedor')) document.getElementById('prodWhatsAppProveedor').value = '';
        if (document.getElementById('prodImagenProveedor')) document.getElementById('prodImagenProveedor').value = '';
        if (document.getElementById('prodRequiereCarnet')) document.getElementById('prodRequiereCarnet').checked = false;
        if (document.getElementById('prodImagenesServicio')) document.getElementById('prodImagenesServicio').value = '';

        // Limpiar preview de imagen
        this.removeUploadedImage();
        this.currentImageMode = 'url';
        this.setImageMode('url');

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

            // 🚨 Campos nuevos
            if (document.getElementById('prodContactoNombre')) document.getElementById('prodContactoNombre').value = p.contacto_nombre || '';
            if (document.getElementById('prodWhatsAppProveedor')) document.getElementById('prodWhatsAppProveedor').value = p.whatsapp_proveedor || '';
            if (document.getElementById('prodImagenProveedor')) document.getElementById('prodImagenProveedor').value = p.imagen_proveedor || '';
            if (document.getElementById('prodRequiereCarnet')) document.getElementById('prodRequiereCarnet').checked = p.requiere_carnet === true || p.requiere_carnet === 'true';
            if (document.getElementById('prodImagenesServicio')) {
                const arr = Array.isArray(p.imagenes_servicio) ? p.imagenes_servicio : [];
                document.getElementById('prodImagenesServicio').value = arr.join('\n');
            }

            // Limpiar preview y archivo
            this.removeUploadedImage();
            this.setImageMode('url');

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

        // Preparar FormData
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

        // 🚨 Campos nuevos
        const contactoNombre = document.getElementById('prodContactoNombre')?.value?.trim() || '';
        const whatsappProv = document.getElementById('prodWhatsAppProveedor')?.value?.trim() || '';
        const imagenProv = document.getElementById('prodImagenProveedor')?.value?.trim() || '';
        const requiereCarnet = document.getElementById('prodRequiereCarnet')?.checked === true;
        const imagenesServicioRaw = document.getElementById('prodImagenesServicio')?.value || '';

        if (contactoNombre) formData.append('contacto_nombre', contactoNombre);
        if (whatsappProv) formData.append('whatsapp_proveedor', whatsappProv);
        if (imagenProv) formData.append('imagen_proveedor', imagenProv);
        formData.append('requiere_carnet', requiereCarnet ? 'true' : 'false');

        // imagenes_servicio: una por línea → array
        const imagenesServicio = imagenesServicioRaw.split('\n').map(s => s.trim()).filter(Boolean);
        if (imagenesServicio.length) {
            formData.append('imagenes_servicio', JSON.stringify(imagenesServicio));
        }

        // Archivo de imagen (si lo hay)
        if (this.uploadedImageFile) {
            formData.append('imagen', this.uploadedImageFile);
        } else {
            const fileInput = document.getElementById('prodFile');
            if (fileInput?.files && fileInput.files[0]) {
                formData.append('imagen', fileInput.files[0]);
            }
        }

        try {
            const result = id
                ? await AdminAPI.actualizarProducto(id, formData)
                : await AdminAPI.crearProducto(formData);

            if (result.ok && result.data.success) {
                if (this.productModal) this.productModal.hide();
                await this.loadProducts();
                AdminUI.showToast(id ? '✅ Producto actualizado' : '✅ Producto creado');

                // Limpiar
                this.removeUploadedImage();
                const fileInput = document.getElementById('prodFile');
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