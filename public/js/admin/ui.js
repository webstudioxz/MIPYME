// ============================================================
// public/js/admin/ui.js
// Utilidades visuales del panel de administración
// ============================================================

window.AdminUI = {
    toastTimeout: null,

    // ------------------------------------------------------------
    // Mostrar mensaje toast flotante
    // ------------------------------------------------------------
    showToast(message, type = 'success') {
        const toast = document.getElementById('adminToast');
        const icon = toast?.querySelector('i');
        const msgSpan = document.getElementById('adminToastMsg');
        
        if (!toast || !icon || !msgSpan) return;

        if (this.toastTimeout) clearTimeout(this.toastTimeout);

        // Colores según tipo
        const colors = {
            success: '#10b981',
            warning: '#f59e0b',
            error: '#ef4444'
        };
        const color = colors[type] || colors.success;

        // Iconos según tipo
        const icons = {
            success: 'fas fa-check-circle',
            warning: 'fas fa-exclamation-triangle',
            error: 'fas fa-exclamation-circle'
        };

        toast.style.borderLeftColor = color;
        icon.style.color = color;
        icon.className = icons[type] || icons.success;

        msgSpan.innerHTML = message;
        toast.classList.add('show');

        this.toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);
    },

    // ------------------------------------------------------------
    // Toggle del menú lateral (móvil)
    // ------------------------------------------------------------
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.toggle('active');
    }
};

// Funciones globales para los onclick del HTML
window.showAdminToast = (m, t) => AdminUI.showToast(m, t);
window.toggleSidebar = () => AdminUI.toggleSidebar();