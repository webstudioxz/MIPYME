// ============================================================
// public/js/admin/stores.js — CORREGIDO v3
// ============================================================

window.AdminStores = {
    // 🚨 Mensajes prefijados para pausar tienda desde admin
    MENSAJES_PAUSA: [
        'Volvemos mañana',
        'Estamos en inventario',
        'En 1 hora abrimos',
        'Cerrado temporalmente por mantenimiento',
        'Tienda pausada por administración'
    ],

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
                const tipo = s.configuracion?.tipo === 'reserva'
                    ? '<span class="badge bg-warning text-dark">📅 Reservas</span>'
                    : '<span class="badge bg-primary">🛒 Tienda</span>';

                const multi = s.configuracion?.whatsapp_por_producto
                    ? '<span class="badge bg-info text-dark ms-1" title="Multi-contacto activo">📞 Multi</span>'
                    : '';

                const modoNotif = s.configuracion?.notificaciones_modo || 'admin';
                const notifBadge = modoNotif === 'ambos'
                    ? '<span class="badge bg-success ms-1" title="Admin + WhatsApp">🔔+📱</span>'
                    : modoNotif === 'whatsapp'
                        ? '<span class="badge bg-success ms-1" title="Solo WhatsApp">📱</span>'
                        : '<span class="badge bg-secondary ms-1" title="Solo Admin">🔔</span>';

                const pausada = s.pausada
                    ? `<div style="font-size:0.75rem;color:#B45309;margin-top:3px;">
                           <i class="fas fa-pause-circle"></i>
                           Pausada por <strong>${s.pausada_por === 'admin' ? 'admin' : 'dueño'}</strong>
                       </div>`
                    : '';

                const pausadaBadge = s.pausada
                    ? `<span class="badge bg-warning text-dark ms-1"><i class="fas fa-pause"></i> Pausada</span>`
                    : '';

                const botonPausa = s.pausada
                    ? `<button class="btn btn-sm btn-outline-success me-1" onclick="AdminStores.reanudarTienda('${s.id}')" title="Reanudar tienda"><i class="fas fa-play"></i></button>`
                    : `<button class="btn btn-sm btn-outline-warning me-1" onclick="AdminStores.abrirModalPausa('${s.id}','${(s.nombre || '').replace(/'/g,'&#39;')}')" title="Pausar con mensaje"><i class="fas fa-pause"></i></button>`;

                return `
                <tr>
                    <td><code class="bg-light px-2 py-1 rounded">${s.id}</code></td>
                    <td style="font-size:1.5rem;">${s.icono || '🛒'}</td>
                    <td>
                        <strong>${s.nombre}</strong>
                        <div style="margin-top:3px;">${tipo}${multi}${notifBadge}${pausadaBadge}</div>
                        ${pausada}
                    </td>
                    <td>${(s.descripcion || '-').substring(0, 30)}...</td>
                    <td>${(s.categorias || []).slice(0, 2).join(', ')}...</td>
                    <td style="text-align:right;white-space:nowrap;">
                        ${botonPausa}
                        <button class="btn btn-sm btn-outline-primary me-1" onclick="AdminStores.editStore('${s.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-outline-danger" onclick="AdminStores.deleteStore('${s.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `}).join('');
        } catch (e) {
            console.error(e);
            AdminUI.showToast('❌ Error cargando tiendas', 'error');
        }
    },

    // ============================================================
    // MODAL DE PAUSA CON MENSAJE
    // ============================================================
    abrirModalPausa(slug, nombre) {
        // Si ya existe el modal, lo eliminamos para regenerarlo
        document.getElementById('modalPausaTienda')?.remove();

        const opciones = this.MENSAJES_PAUSA.map((m, i) =>
            `<option value="${m}">${m}</option>`
        ).join('');

        const html = `
            <div class="modal fade" id="modalPausaTienda" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title"><i class="fas fa-pause-circle text-warning"></i> Pausar tienda</h5>
                            <button class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p class="mb-3">Vas a pausar <strong>${nombre}</strong>.<br>
                            <small class="text-muted">La tienda dejará de mostrarse públicamente. El dueño sí podrá verla en su panel.</small></p>

                            <label class="form-label"><strong>Mensaje público</strong></label>
                            <select class="form-select mb-2" id="pausaMensajeSelect" onchange="AdminStores._onSelectMensaje(this)">
                                ${opciones}
                                <option value="__custom__">✏️ Escribir mensaje personalizado…</option>
                            </select>

                            <input type="text" class="form-control" id="pausaMensajeCustom" placeholder="Escribe el mensaje que verá el público" style="display:none;" maxlength="200">

                            <div class="alert alert-info mt-3 mb-0" style="font-size:0.8rem;">
                                <i class="fas fa-info-circle"></i>
                                El mensaje se mostrará en el index como banner superior mientras la tienda esté pausada.
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                            <button class="btn btn-warning" onclick="AdminStores.confirmarPausa('${slug}')">
                                <i class="fas fa-pause"></i> Pausar tienda
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);
        new bootstrap.Modal(document.getElementById('modalPausaTienda')).show();
    },

    _onSelectMensaje(sel) {
        const custom = document.getElementById('pausaMensajeCustom');
        if (!custom) return;
        if (sel.value === '__custom__') {
            custom.style.display = 'block';
            custom.focus();
        } else {
            custom.style.display = 'none';
            custom.value = '';
        }
    },

    async confirmarPausa(slug) {
        const sel = document.getElementById('pausaMensajeSelect');
        const custom = document.getElementById('pausaMensajeCustom');
        let mensaje = sel?.value;
        if (mensaje === '__custom__') {
            mensaje = (custom?.value || '').trim();
            if (!mensaje) {
                AdminUI.showToast('⚠️ Escribe un mensaje', 'error');
                return;
            }
        }
        try {
            const r = await AdminAPI.fetch(`/api/superadmin/pausar/${slug}`, {
                method: 'POST',
                body: JSON.stringify({ pausar: true, mensaje })
            });
            if (r.ok) {
                bootstrap.Modal.getInstance(document.getElementById('modalPausaTienda'))?.hide();
                document.getElementById('modalPausaTienda')?.remove();
                await this.loadStores();
                AdminUI.showToast('⏸️ Tienda pausada');
            } else {
                const data = await r.json().catch(() => ({}));
                AdminUI.showToast('❌ ' + (data.error || 'Error'), 'error');
            }
        } catch (e) {
            AdminUI.showToast('❌ Error de conexión', 'error');
        }
    },

    async reanudarTienda(slug) {
        if (!confirm('¿Reanudar esta tienda? Volverá a mostrarse públicamente.')) return;
        try {
            const r = await AdminAPI.fetch(`/api/superadmin/pausar/${slug}`, {
                method: 'POST',
                body: JSON.stringify({ pausar: false })
            });
            if (r.ok) {
                await this.loadStores();
                AdminUI.showToast('▶️ Tienda reanudada');
            } else {
                AdminUI.showToast('❌ Error al reanudar', 'error');
            }
        } catch (e) {
            AdminUI.showToast('❌ Error de conexión', 'error');
        }
    },

    // ============================================================
    // EDITAR TIENDA
    // ============================================================
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
        const slugInput = document.getElementById('storeSlug').value.trim();
        const slug = slugInput.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_]/g, '');
        const nombre = document.getElementById('storeDisplayName').value.trim();
        const icono = (document.getElementById('storeIcon').value.trim() || '🛒').slice(0, 4);
        const descripcion = document.getElementById('storeDescription').value.trim();
        const categorias = document.getElementById('storeCategories').value.split(',').map(c => c.trim()).filter(c => c);
        const configuracion = this.getConfigFromForm();

        if (!slug || !nombre) { AdminUI.showToast('❌ Completa ID y Nombre', 'error'); return; }
        if (slugInput !== slug) document.getElementById('storeSlug').value = slug;

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
        if (!confirm(`¿Eliminar tienda "${slug}"?\n\nEsto BORRARÁ todos sus productos, pedidos, reservas y suscripciones.`)) return;
        if (!confirm('¿Estás completamente seguro? No se puede deshacer.')) return;
        try {
            const ok = await AdminAPI.eliminarTienda(slug);
            if (ok) {
                await AdminApp.loadTiendaSelector();
                await this.loadStores();
                AdminUI.showToast('🗑️ Tienda eliminada completamente');
            }
        } catch (e) {
            AdminUI.showToast('❌ Error', 'error');
        }
    },

    // ============================================================
    // CONFIG ↔ FORM
    // ============================================================
    getConfigFromForm() {
        const metodos = [];
        if (document.getElementById('pagoEfectivo')?.checked) metodos.push('Efectivo');
        if (document.getElementById('pagoTransferencia')?.checked) metodos.push('Transferencia');

        const dias = [];
        document.querySelectorAll('.dia-checkbox:checked').forEach(cb => {
            const v = parseInt(cb.value);
            if (!isNaN(v)) dias.push(v);
        });
        const diasFinales = dias.length ? dias : [1, 2, 3, 4, 5, 6];

        const notifModo = document.getElementById('storeNotifModo')?.value || 'admin';

        return {
            tipo: document.getElementById('storeTipo').value,
            whatsapp_por_producto: document.getElementById('storeMultiContacto')?.checked === true,
            notificaciones_modo: ['admin', 'whatsapp', 'ambos'].includes(notifModo) ? notifModo : 'admin',
            horario: {
                apertura: document.getElementById('storeHorarioApertura').value || '09:00',
                cierre: document.getElementById('storeHorarioCierre').value || '18:00',
                dias: diasFinales,
                intervalo: parseInt(document.getElementById('storeIntervalo')?.value || 60)
            },
            envio: {
                disponible: document.getElementById('storeEnvioDisponible').value === 'true',
                costo: Number(document.getElementById('storeEnvioCosto').value) || 0,
                tiempo_estimado: document.getElementById('storeEnvioTiempo').value || '24-48h'
            },
            garantia: {
                disponible: document.getElementById('storeGarantiaDisponible').value === 'true',
                duracion: document.getElementById('storeGarantiaDuracion').value || '12 meses',
                descripcion: document.getElementById('storeGarantiaDesc').value || ''
            },
            metodos_pago: metodos,
            datos_bancarios: {
                numero_tarjeta: document.getElementById('storeNumeroTarjeta').value.trim(),
                whatsapp_confirmacion: document.getElementById('storeWhatsAppConfirmacion').value.trim(),
                qr_tarjeta: document.getElementById('storeQrTarjeta')?.value.trim() || ''
            },
            contacto: {
                telefono: document.getElementById('storeTelefono').value || '',
                email: document.getElementById('storeEmail').value || '',
                ubicacion: document.getElementById('storeUbicacion').value || 'La Habana, Cuba'
            }
        };
    },

    setConfigToForm(config) {
        if (!config) return;
        document.getElementById('storeTipo').value = config.tipo || 'tienda';
        document.getElementById('storeHorarioApertura').value = config.horario?.apertura || '09:00';
        document.getElementById('storeHorarioCierre').value = config.horario?.cierre || '18:00';

        const dias = Array.isArray(config.horario?.dias) ? config.horario.dias : [1, 2, 3, 4, 5, 6];
        document.querySelectorAll('.dia-checkbox').forEach(cb => {
            cb.checked = dias.includes(parseInt(cb.value));
        });

        if (document.getElementById('storeIntervalo')) {
            document.getElementById('storeIntervalo').value = config.horario?.intervalo || 60;
        }
        if (document.getElementById('storeMultiContacto')) {
            document.getElementById('storeMultiContacto').checked = config.whatsapp_por_producto === true;
        }
        if (document.getElementById('storeNotifModo')) {
            document.getElementById('storeNotifModo').value = config.notificaciones_modo || 'admin';
        }

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
            if (document.getElementById('storeQrTarjeta')) {
                document.getElementById('storeQrTarjeta').value = config.datos_bancarios.qr_tarjeta || '';
            }
        }

        const isReserva = config.tipo === 'reserva';
        document.getElementById('divHorarioApertura').style.display = isReserva ? 'block' : 'none';
        document.getElementById('divHorarioCierre').style.display = isReserva ? 'block' : 'none';
        const divDias = document.getElementById('divDiasLaborables');
        if (divDias) divDias.style.display = isReserva ? 'block' : 'none';
    },

    resetStoreForm() {
        document.getElementById('storeForm')?.reset();
        document.getElementById('storeId').value = '';
        document.getElementById('storeSubmitText').innerText = 'Crear Tienda';
        document.getElementById('storeFormTitle').innerText = 'Agregar Nueva Tienda';
        document.getElementById('storeTipo').value = 'tienda';
        document.getElementById('storeHorarioApertura').value = '09:00';
        document.getElementById('storeHorarioCierre').value = '18:00';
        document.getElementById('divHorarioApertura').style.display = 'none';
        document.getElementById('divHorarioCierre').style.display = 'none';
        const divDias = document.getElementById('divDiasLaborables');
        if (divDias) divDias.style.display = 'none';
        document.querySelectorAll('.dia-checkbox').forEach(cb => { cb.checked = parseInt(cb.value) !== 0; });
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
        const qr = document.getElementById('storeQrTarjeta'); if (qr) qr.value = '';
        const mc = document.getElementById('storeMultiContacto'); if (mc) mc.checked = false;
        const nm = document.getElementById('storeNotifModo'); if (nm) nm.value = 'admin';
        document.getElementById('storeSlug').readOnly = false;
        document.getElementById('storeSlug').style.opacity = '1';
    }
};