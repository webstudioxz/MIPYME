window.AdminStores = {
    async loadStores() {
        try {
            const stores = await AdminAPI.getTiendas();
            const tbody = document.getElementById('storesList');
            if (!stores || !stores.length) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No hay tiendas registradas</td></tr>';
                return;
            }
            tbody.innerHTML = stores.map(s => `
                <tr>
                    <td><code class="bg-light px-2 py-1 rounded">${s.id}</code></td>
                    <td style="font-size:1.5rem;">${s.icono || '🛒'}</td>
                    <td><strong>${s.nombre}</strong></td>
                    <td>${s.descripcion?.substring(0, 50) || '-'}${s.descripcion?.length > 50 ? '...' : ''}</td>
                    <td>${(s.categorias || []).slice(0, 3).join(', ')}${(s.categorias || []).length > 3 ? '...' : ''}</td>
                    <td style="text-align:right;white-space:nowrap;">
                        <button class="btn btn-sm btn-outline-primary me-1" onclick="AdminStores.editStore('${s.id}')"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-outline-danger" onclick="AdminStores.deleteStore('${s.id}')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');
        } catch (e) {
            AdminUI.showToast('❌ Error cargando tiendas', 'error');
        }
    },

    async editStore(slug) {
        try {
            const store = await AdminAPI.getTienda(slug);
            document.getElementById('storeId').value = store.id;
            document.getElementById('storeSlug').value = store.id;
            document.getElementById('storeSlug').readOnly = true;
            document.getElementById('storeSlug').style.opacity = '0.6';
            document.getElementById('storeDisplayName').value = store.nombre;
            document.getElementById('storeIcon').value = store.icono || '🛒';
            document.getElementById('storeDescription').value = store.descripcion || '';
            document.getElementById('storeCategories').value = (store.categorias || []).join(', ');
            document.getElementById('storeSubmitText').innerText = 'Actualizar Tienda';
            document.getElementById('storeFormTitle').innerText = 'Editar Tienda';
            this.setConfigToForm(store.configuracion);
            document.querySelector('.store-form-card').scrollIntoView({ behavior: 'smooth' });
        } catch (e) {
            AdminUI.showToast('❌ Error cargando tienda', 'error');
        }
    },

    async saveStore(e) {
        if (e) e.preventDefault(); 

        const id = document.getElementById('storeId').value;
        
        // 🛑 VALIDACIÓN Y LIMPIEZA AUTOMÁTICA DEL SLUG
        let slugInput = document.getElementById('storeSlug').value.trim();
        // Convertir a minúsculas, reemplazar espacios por guiones, quitar caracteres no permitidos
        const slug = slugInput.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_]/g, '');
        
        const nombre = document.getElementById('storeDisplayName').value.trim();
        const icono = (document.getElementById('storeIcon').value.trim() || '🛒').slice(0, 4);
        const descripcion = document.getElementById('storeDescription').value.trim();
        const categorias = document.getElementById('storeCategories').value.split(',').map(c => c.trim()).filter(c => c);
        const configuracion = this.getConfigFromForm();

        if (!slug) {
            AdminUI.showToast('❌ El ID de la tienda no puede estar vacío', 'error'); 
            return;
        }
        if (!nombre) {
            AdminUI.showToast('❌ El nombre comercial es obligatorio', 'error'); 
            return;
        }

        // Si el slug fue corregido, actualizamos el input visualmente
        if (slugInput !== slug) {
            document.getElementById('storeSlug').value = slug;
            AdminUI.showToast('⚠️ El ID fue corregido automáticamente a: ' + slug, 'warning');
        }

        const payload = { id: slug, nombre, icono, descripcion, categorias, configuracion };

        try {
            const result = id ? await AdminAPI.actualizarTienda(id, payload) : await AdminAPI.crearTienda(payload);
            
            if (result.ok) {
                this.resetStoreForm();
                await AdminApp.loadTiendaSelector();
                await this.loadStores();
                AdminUI.showToast(id ? '✅ Tienda actualizada' : '✅ Tienda creada exitosamente');
            } else {
                // Mostrar error exacto del servidor
                alert('Error del Servidor:\n' + JSON.stringify(result.data, null, 2));
                AdminUI.showToast('❌ ' + (result.data.error || 'Error al guardar'), 'error');
            }
        } catch (e) {
            alert('Error de Código:\n' + e.message);
            AdminUI.showToast('❌ Error de conexión', 'error');
        }
    },

    async deleteStore(slug) {
        if (!confirm(`¿Eliminar tienda "${slug}"?`)) return;
        if (await AdminAPI.eliminarTienda(slug)) {
            await AdminApp.loadTiendaSelector();
            await this.loadStores();
            AdminUI.showToast('🗑️ Tienda eliminada');
        } else {
            AdminUI.showToast('❌ Error al eliminar', 'error');
        }
    },

    getConfigFromForm() {
        const metodos = [];
        if (document.getElementById('pagoEfectivo').checked) metodos.push('Efectivo');
        if (document.getElementById('pagoTransferencia').checked) metodos.push('Transferencia');
        return {
            envio: {
                disponible: document.getElementById('storeEnvioDisponible').value === 'true',
                costo: Number(document.getElementById('storeEnvioCosto').value) || 0,
                tiempo_estimado: document.getElementById('storeEnvioTiempo').value || '24-48 horas'
            },
            garantia: {
                disponible: document.getElementById('storeGarantiaDisponible').value === 'true',
                duracion: document.getElementById('storeGarantiaDuracion').value || '12 meses',
                descripcion: document.getElementById('storeGarantiaDesc').value || ''
            },
            metodos_pago: metodos,
            datos_bancarios: {
                numero_tarjeta: document.getElementById('storeNumeroTarjeta').value.trim(),
                whatsapp_confirmacion: document.getElementById('storeWhatsAppConfirmacion').value.trim()
            },
            contacto: {
                telefono: document.getElementById('storeTelefono').value || '',
                email: document.getElementById('storeEmail').value || ''
            }
        };
    },

    setConfigToForm(config) {
        if (!config) return;
        document.getElementById('storeEnvioDisponible').value = config.envio?.disponible ? 'true' : 'false';
        document.getElementById('storeEnvioCosto').value = config.envio?.costo || 0;
        document.getElementById('storeEnvioTiempo').value = config.envio?.tiempo_estimado || '24-48 horas';
        document.getElementById('storeGarantiaDisponible').value = config.garantia?.disponible ? 'true' : 'false';
        document.getElementById('storeGarantiaDuracion').value = config.garantia?.duracion || '12 meses';
        document.getElementById('storeGarantiaDesc').value = config.garantia?.descripcion || '';
        document.getElementById('pagoEfectivo').checked = config.metodos_pago?.includes('Efectivo') || false;
        document.getElementById('pagoTransferencia').checked = config.metodos_pago?.includes('Transferencia') || false;
        document.getElementById('storeTelefono').value = config.contacto?.telefono || '';
        document.getElementById('storeEmail').value = config.contacto?.email || '';
        document.getElementById('storeNumeroTarjeta').value = config.datos_bancarios?.numero_tarjeta || '';
        document.getElementById('storeWhatsAppConfirmacion').value = config.datos_bancarios?.whatsapp_confirmacion || '';
    },

    resetStoreForm() {
        document.getElementById('storeForm').reset();
        document.getElementById('storeId').value = '';
        document.getElementById('storeSubmitText').innerText = 'Crear Tienda';
        document.getElementById('storeFormTitle').innerText = 'Agregar Nueva Tienda';
        document.getElementById('storeEnvioDisponible').value = 'true';
        document.getElementById('storeEnvioCosto').value = '0';
        document.getElementById('storeEnvioTiempo').value = '24-48 horas';
        document.getElementById('storeGarantiaDisponible').value = 'true';
        document.getElementById('storeGarantiaDuracion').value = '12 meses';
        document.getElementById('storeGarantiaDesc').value = 'Garantía contra defectos';
        document.getElementById('pagoEfectivo').checked = true;
        document.getElementById('pagoTransferencia').checked = true;
        document.getElementById('storeTelefono').value = '+53 5XXXXXXX';
        document.getElementById('storeEmail').value = 'contacto@tienda.com';
        document.getElementById('storeNumeroTarjeta').value = '';
        document.getElementById('storeWhatsAppConfirmacion').value = '';
        document.getElementById('storeSlug').readOnly = false;
        document.getElementById('storeSlug').style.opacity = '1';
    }
};