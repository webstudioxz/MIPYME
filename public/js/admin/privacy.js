// ============================================================
// public/js/admin/privacy.js — Editor de política de privacidad
// ============================================================

window.AdminPrivacy = {
    // ------------------------------------------------------------
    // Cargar privacidad
    // ------------------------------------------------------------
    async load() {
        try {
            const p = await AdminAPI.getPrivacidad();
            const titleEl = document.getElementById('privacyTitle');
            const contentEl = document.getElementById('privacyContent');
            const updatedEl = document.getElementById('privacyUpdated');
            if (titleEl) titleEl.value = p.titulo || 'Política de Privacidad';
            if (contentEl) contentEl.value = p.contenido || '';
            if (updatedEl && p.actualizado) {
                updatedEl.textContent = new Date(p.actualizado).toLocaleString('es-ES');
            } else if (updatedEl) {
                updatedEl.textContent = '—';
            }
            return p;
        } catch (e) {
            console.error('❌ [AdminPrivacy.load]', e);
            AdminUI.showToast('❌ Error cargando privacidad', 'error');
            return null;
        }
    },

    // ------------------------------------------------------------
    // Guardar privacidad
    // ------------------------------------------------------------
    async guardar() {
        const titleEl = document.getElementById('privacyTitle');
        const contentEl = document.getElementById('privacyContent');
        if (!titleEl || !contentEl) return;

        const titulo = titleEl.value.trim();
        const contenido = contentEl.value.trim();

        if (!titulo || !contenido) {
            AdminUI.showToast('❌ Completa todos los campos', 'error');
            return;
        }

        try {
            const r = await AdminAPI.guardarPrivacidad({ titulo, contenido });
            if (r.ok) {
                AdminUI.showToast('✅ Política actualizada');
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
window.loadPrivacidad = () => AdminPrivacy.load();
window.guardarPrivacidad = () => AdminPrivacy.guardar();