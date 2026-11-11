// ============================================================
// public/js/admin/stores.js
// ============================================================

window.AdminStores = {
    async loadStores() {
        try {
            const stores = await AdminAPI.getTiendas();
            const tbody = document.getElementById('storesList');
            if (!tbody) return;

            if (!stores || !stores.length) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No hay tiendas registradas</td></tr>';
                return;
            }

            tbody.innerHTML = stores.map(s => {
                const tipo = s.configuracion?.tipo === 'reserva' ? '<span class="badge bg-warning text-dark">📅 Reservas</span>' : '<span class="badge bg-primary">🛒 Tienda</span>';
                return `
                <tr>
                    <td><code class="bg-light px-2 py-1 rounded">${s.id}</code></td>
                    <td style="font-size:1.5rem;">${s.icono || '🛒'}</td>
                    <td><strong>${s.nombre}</strong><br>${tipo}</td>
                    <td>${s.descripcion?.substring(0, 30) || '-'}...</td>
                    <td>${(s.categorias || []).slice(0, 2).join(', ')}...</td>
                    <td style="text-align:right;white-space:nowrap;">
                        <button class="btn btn-sm btn-outline-primary me-1" onclick="AdminStores.editStore('${s.id}')"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-outline-danger" onclick="AdminStores.deleteStore('${s.id}')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `}).join('');
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
            document.querySelector('.store-form-card')?.scrollIntoView({ behavior: 'smooth' });
        } catch (e) {
            AdminUI.showToast('❌ Error cargando tienda', 'error');
        }
    },

    async saveStore(e) {
        if (e) e.preventDefault(); 
        const id = document.getElementById('storeId').value;
        let slugInput = document.getElementById('storeSlug').value.trim();
        const slug = slugInput.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_]/g, '');
        const nombre = document.getElementById('storeDisplayName').value.trim();
        const icono = (document.getElementById('storeIcon').value.trim() || '🛒').slice(0, 4);
        const descripcion = document.getElementById('storeDescription').value.trim();
        const categorias = document.getElementById('storeCategories').value.split(',').map(c => c.trim()).filter(c => c);
        const configuracion = this.getConfigFromForm();

        if (!slug || !nombre) { AdminUI.showToast('❌ Completa ID y Nombre', 'error'); return; }

        if (slugInput !== slug) {
            document.getElementById('storeSlug').value = slug;
            AdminUI.showToast('⚠️ ID corregido a: ' + slug, 'warning');
        }

        const payload = { id: slug, nombre, icono, descripcion, categorias, configuracion };

        try {
            const result = id ? await AdminAPI.actualizarTienda(id, payload) : await AdminAPI.crearTienda(payload);
            if (result.ok) {
                this.resetStoreForm();
                await AdminApp.loadTiendaSelector();
                await this.loadStores();
                AdminUI.showToast(id ? '✅ Tienda actualizada' : '✅ Tienda creada');
            } else {
                AdminUI.showToast('❌ ' + (result.data.error || 'Error'), 'error');
            }
        } catch (e) {
            AdminUI.showToast('❌ Error de conexión', 'error');
        }
    },

    async deleteStore(slug) {
        if (!confirm(`¿Eliminar tienda "${slug}"?`)) return;
        try {
            const ok = await AdminAPI.eliminarTienda(slug);
            if (ok) {
                await AdminApp.loadTiendaSelector();
                await this.loadStores();
                AdminUI.showToast('🗑️ Tienda eliminada');
            }
        } catch (e) { AdminUI.showToast('❌ Error', 'error'); }
    },

    getConfigFromForm() {
        const metodos = [];
        if (document.getElementById('pagoEfectivo')?.checked) metodos.push('Efectivo');
        if (document.getElementById('pagoTransferencia')?.checked) metodos.push('Transferencia');

        return {
            tipo: document.getElementById('storeTipo').value, // 🚨 GUARDAMOS EL TIPO
            envio: { disponible: document.getElementById('storeEnvioDisponible').value === 'true', costo: Number(document.getElementById('storeEnvioCosto').value) || 0, tiempo_estimado: document.getElementById('storeEnvioTiempo').value || '24-48h' },
            garantia: { disponible: document.getElementById('storeGarantiaDisponible').value === 'true', duracion: document.getElementById('storeGarantiaDuracion').value || '12 meses', descripcion: document.getElementById('storeGarantiaDesc').value || '' },
            metodos_pago: metodos,
            datos_bancarios: { numero_tarjeta: document.getElementById('storeNumeroTarjeta').value.trim(), whatsapp_confirmacion: document.getElementById('storeWhatsAppConfirmacion').value.trim() },
            contacto: { telefono: document.getElementById('storeTelefono').value || '', email: document.getElementById('storeEmail').value || '', ubicacion: document.getElementById('storeUbicacion').value || 'La Habana, Cuba' }
        };
    },

    setConfigToForm(config) {
        if (!config) return;
        document.getElementById('storeTipo').value = config.tipo || 'tienda'; // 🚨 CARGAMOS EL TIPO
        
        if (config.envio) {
            document.getElementById('storeEnvioDisponible').value = config.envio.disponible ? 'true' : 'false';
            document.getElementById('storeEnvioCosto').value = config.envio.costo || 0;
            document.getElementById('storeEnvioTiempo').value = config.envio.tiempo_estimado || '24-48 horas';
        }
        if (config.garantia) {
            document.getElementById('storeGarantiaDisponible').value = config.garantia.disponible ? 'true' : 'false';
            document.getElementById('storeGarantiaDuracion').value = config.garantia.duracion || '12 meses';
            document.getElementById('storeGarantiaDesc').value = config.garantia.descripcion || '';
        }
        document.getElementById('pagoEfectivo').checked = config.metodos_pago?.includes('Efectivo') || false;
        document.getElementById('pagoTransferencia').checked = config.metodos_pago?.includes('Transferencia') || false;
        
        if (config.contacto) {
            document.getElementById('storeTelefono').value = config.contacto.telefono || '';
            document.getElementById('storeEmail').value = config.contacto.email || '';
            document.getElementById('storeUbicacion').value = config.contacto.ubicacion || 'La Habana, Cuba';
        }
        if (config.datos_bancarios) {
            document.getElementById('storeNumeroTarjeta').value = config.datos_bancarios.numero_tarjeta || '';
            document.getElementById('storeWhatsAppConfirmacion').value = config.datos_bancarios.whatsapp_confirmacion || '';
        }
    },

    resetStoreForm() {
        document.getElementById('storeForm')?.reset();
        document.getElementById('storeId').value = '';
        document.getElementById('storeSubmitText').innerText = 'Crear Tienda';
        document.getElementById('storeFormTitle').innerText = 'Agregar Nueva Tienda';
        document.getElementById('storeTipo').value = 'tienda'; // Default
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
        document.getElementById('storeUbicacion').value = 'La Habana, Cuba';
        document.getElementById('storeNumeroTarjeta').value = '';
        document.getElementById('storeWhatsAppConfirmacion').value = '';
        document.getElementById('storeSlug').readOnly = false;
        document.getElementById('storeSlug').style.opacity = '1';
    }
};