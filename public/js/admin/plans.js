// ============================================================
// public/js/admin/plans.js — Gestión de planes (admin central)
// ============================================================

window.AdminPlans = {
    planes: [],
    planModal: null,

    // ------------------------------------------------------------
    // Cargar planes desde el endpoint admin (incluye inactivos)
    // ------------------------------------------------------------
    async load() {
        const cont = document.getElementById('plansList');
        if (cont) {
            cont.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin fa-2x" style="color:var(--primary);"></i></div>';
        }
        
        try {
            const data = await AdminAPI.getPlanes();
            this.planes = Array.isArray(data) ? data : [];
            
            if (!cont) return;
            
            if (this.planes.length === 0) {
                cont.innerHTML = '<div class="alert alert-info text-center">No hay planes configurados.</div>';
                return;
            }

            cont.innerHTML = this.planes.map(p => this.renderPlanCard(p)).join('');
        } catch (e) {
            console.error('Error cargando planes:', e);
            if (cont) cont.innerHTML = '<div class="alert alert-danger text-center">Error al cargar los planes.</div>';
            AdminUI.showToast('❌ Error cargando planes', 'error');
        }
    },

    // ------------------------------------------------------------
    // Renderizar tarjeta de plan
    // ------------------------------------------------------------
    renderPlanCard(plan) {
        const isActive = plan.activo !== false;
        const statusBadge = isActive 
            ? '<span class="badge bg-success mb-2">Activo</span>' 
            : '<span class="badge bg-secondary mb-2">Inactivo</span>';
            
        const caracteristicas = Array.isArray(plan.caracteristicas) 
            ? plan.caracteristicas.map(c => `<li><i class="fas fa-check text-success me-1"></i> ${c}</li>`).join('')
            : '<li class="text-muted">Sin características</li>';

        return `
            <div class="col-md-6 col-lg-3 mb-4">
                <div class="card h-100 shadow-sm" style="border-radius: 16px; overflow: hidden; border: 1px solid var(--border-soft);">
                    <div class="card-body d-flex flex-column">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h5 class="card-title fw-bold mb-0">${plan.nombre || plan.id}</h5>
                            ${statusBadge}
                        </div>
                        <h3 class="text-primary fw-bold mb-3">$${parseFloat(plan.precio || 0).toFixed(2)}</h3>
                        
                        <ul class="list-unstyled mb-4 flex-grow-1" style="font-size: 0.85rem;">
                            <li class="mb-1"><i class="fas fa-box text-muted me-1"></i> ${plan.max_productos || 5} productos</li>
                            <li class="mb-1"><i class="fas fa-calendar-alt text-muted me-1"></i> ${plan.duracion_dias || 30} días</li>
                            <hr class="my-2">
                            ${caracteristicas}
                        </ul>
                        
                        <button class="btn btn-outline-primary w-100 mt-auto" onclick="AdminPlans.editPlan('${plan.id}')">
                            <i class="fas fa-edit"></i> Editar Plan
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    // ------------------------------------------------------------
    // Abrir modal para editar un plan
    // ------------------------------------------------------------
    editPlan(id) {
        const plan = this.planes.find(p => p.id === id);
        if (!plan) return;

        // Llenar los campos del modal (asumimos que existen en el HTML del admin)
        const idInput = document.getElementById('planId');
        if (idInput) idInput.value = plan.id;
        
        if (document.getElementById('planNombre')) document.getElementById('planNombre').value = plan.nombre || plan.id;
        if (document.getElementById('planPrecio')) document.getElementById('planPrecio').value = plan.precio || 0;
        if (document.getElementById('planMaxProd')) document.getElementById('planMaxProd').value = plan.max_productos || 5;
        if (document.getElementById('planDias')) document.getElementById('planDias').value = plan.duracion_dias || 30;
        
        if (document.getElementById('planCaracteristicas')) {
            const caracts = Array.isArray(plan.caracteristicas) ? plan.caracteristicas.join('\n') : '';
            document.getElementById('planCaracteristicas').value = caracts;
        }
        
        if (document.getElementById('planActivo')) {
            document.getElementById('planActivo').checked = plan.activo !== false;
        }

        // Abrir el modal con Bootstrap o con la clase active si usas uno custom
        const modalEl = document.getElementById('planModal');
        if (modalEl) {
            this.planModal = new bootstrap.Modal(modalEl);
            this.planModal.show();
        }
    },

    // ------------------------------------------------------------
    // Guardar cambios del plan
    // ------------------------------------------------------------
    async savePlan() {
        const id = document.getElementById('planId').value;
        const btn = document.getElementById('planSaveBtn');
        const origText = btn.innerHTML;
        
        const nombre = document.getElementById('planNombre').value.trim();
        const precio = parseFloat(document.getElementById('planPrecio').value) || 0;
        const max_productos = parseInt(document.getElementById('planMaxProd').value) || 5;
        const duracion_dias = parseInt(document.getElementById('planDias').value) || 30;
        const activo = document.getElementById('planActivo').checked;
        
        const caractRaw = document.getElementById('planCaracteristicas').value;
        const caracteristicas = caractRaw.split('\n').map(c => c.trim()).filter(Boolean);

        if (!nombre) {
            AdminUI.showToast('⚠️ El nombre del plan es obligatorio', 'warning');
            return;
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        btn.disabled = true;

        try {
            const data = {
                nombre,
                precio,
                max_productos,
                duracion_dias,
                activo,
                caracteristicas
            };

            const res = await AdminAPI.guardarPlan(id, data);
            
            if (res.ok && res.data.success) {
                AdminUI.showToast('✅ Plan actualizado');
                if (this.planModal) this.planModal.hide();
                await this.load(); // Recargar la lista
            } else {
                AdminUI.showToast('❌ ' + (res.data.error || 'Error al guardar'), 'error');
            }
        } catch (e) {
            console.error('Error guardando plan:', e);
            AdminUI.showToast('❌ Error de conexión', 'error');
        } finally {
            btn.innerHTML = origText;
            btn.disabled = false;
        }
    }
};