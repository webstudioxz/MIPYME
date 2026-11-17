// ============================================================
// public/js/admin/plans.js — Gestión de planes (admin central)
// ============================================================

window.AdminPlans = {
    planes: [],

    // ------------------------------------------------------------
    // Cargar planes desde el endpoint admin (incluye inactivos)
    // ------------------------------------------------------------
    async load() {
        const cont = document.getElementById('plansList');
        if (cont) cont.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin fa-2x" style="color:var(--primary);"></i></div>';
        try {
            const data = await AdminAPI.getPlanes();
            this.planes = Array.isArray(data) ? data : [];
            this.render();
            return this.planes;
        } catch (e) {
            console.error('❌ [AdminPlans.load]', e);
            if (cont) cont.innerHTML = '<div class="alert alert-danger">Error cargando planes</div>';
            return [];
        }
    },

    // ------------------------------------------------------------
    // Render de la lista
    // ------------------------------------------------------------
    render() {
        const cont = document.getElementById('plansList');
        if (!cont) return;
        if (!this.planes.length) {
            cont.innerHTML = '<div class="alert alert-info">No hay planes configurados. Crea uno con el botón superior.</div>';
            return;
        }
        cont.innerHTML = this.planes.map(p => `
            <div class="plan-card-mini mb-2 ${p.activo === false ? 'inactivo' : ''}">
                <div>
                    <div class="plan-name">
                        ${p.nombre || p.id}
                        ${p.activo === false ? '<span class="badge bg-secondary" style="font-size:0.6rem;">Inactivo</span>' : ''}
                    </div>
                    <div class="plan-meta">
                        ID: <code>${p.id}</code> ·
                        Max ${p.max_productos || 0} prod ·
                        ${p.duracion_dias || 30} días ·
                        ${(p.caracteristicas || []).join(', ') || 'Sin características'}
                    </div>
                </div>
                <div class="d-flex align-items-center gap-3">
                    <div class="plan-price">$${parseFloat(p.precio || 0).toFixed(2)}</div>
                    <button class="btn btn-sm btn-outline-primary" onclick="AdminPlans.editar('${p.id}')" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </div>
        `).join('');
    },

    // ------------------------------------------------------------
    // Abrir modal para NUEVO plan
    // ------------------------------------------------------------
    abrirNuevo() {
        if (!document.getElementById('planModal')) {
            alert('No se encontró el modal de planes en el HTML.');
            return;
        }
        document.getElementById('planId').value = '';
        document.getElementById('planId').readOnly = false;
        document.getElementById('planNombre').value = '';
        document.getElementById('planPrecio').value = 0;
        document.getElementById('planMaxProd').value = 5;
        document.getElementById('planDuracion').value = 30;
        document.getElementById('planCaract').value = '';
        document.getElementById('planActivo').checked = true;
        document.getElementById('planModalTitle').innerText = 'Nuevo Plan';
        new bootstrap.Modal(document.getElementById('planModal')).show();
    },

    // ------------------------------------------------------------
    // Abrir modal para EDITAR plan
    // ------------------------------------------------------------
    editar(id) {
        if (!document.getElementById('planModal')) {
            alert('No se encontró el modal de planes en el HTML.');
            return;
        }
        const p = this.planes.find(x => x.id === id);
        if (!p) return;
        document.getElementById('planId').value = p.id;
        document.getElementById('planId').readOnly = true;
        document.getElementById('planNombre').value = p.nombre || '';
        document.getElementById('planPrecio').value = p.precio || 0;
        document.getElementById('planMaxProd').value = p.max_productos || 5;
        document.getElementById('planDuracion').value = p.duracion_dias || 30;
        document.getElementById('planCaract').value = (p.caracteristicas || []).join(', ');
        document.getElementById('planActivo').checked = p.activo !== false;
        document.getElementById('planModalTitle').innerText = 'Editar Plan';
        new bootstrap.Modal(document.getElementById('planModal')).show();
    },

    // ------------------------------------------------------------
    // Guardar (crear o actualizar)
    // ------------------------------------------------------------
    async guardar() {
        const id = document.getElementById('planId').value.trim();
        if (!id) { AdminUI.showToast('❌ El ID es obligatorio', 'error'); return; }
        const payload = {
            nombre: document.getElementById('planNombre').value.trim() || id,
            precio: parseFloat(document.getElementById('planPrecio').value) || 0,
            max_productos: parseInt(document.getElementById('planMaxProd').value) || 5,
            duracion_dias: parseInt(document.getElementById('planDuracion').value) || 30,
            caracteristicas: document.getElementById('planCaract').value.split(',').map(c => c.trim()).filter(Boolean),
            activo: document.getElementById('planActivo').checked
        };
        try {
            const r = await AdminAPI.guardarPlan(id, payload);
            if (r.ok) {
                bootstrap.Modal.getInstance(document.getElementById('planModal'))?.hide();
                AdminUI.showToast('✅ Plan guardado');
                await this.load();
            } else {
                AdminUI.showToast('❌ ' + (r.data?.error || 'Error'), 'error');
            }
        } catch (e) {
            AdminUI.showToast('❌ Error de conexión', 'error');
        }
    }
};

// Alias de compatibilidad con admin.html
window.abrirNuevoPlan = () => AdminPlans.abrirNuevo();
window.editarPlan = (id) => AdminPlans.editar(id);
window.guardarPlan = () => AdminPlans.guardar();