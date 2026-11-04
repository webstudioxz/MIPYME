// ============================================
// ADMIN UI - Componentes visuales del panel (Toasts, Sidebar)
// ============================================
window.AdminUI = {
    toastTimeout: null,

    /**
     * Muestra una notificación flotante (Toast)
     * @param {string} message - El mensaje a mostrar
     * @param {string} type - 'success', 'warning' o 'error'
     */
    showToast(message, type = 'success') {
        const toast = document.getElementById('adminToast');
        if (!toast) return; // Prevención de errores si el HTML no está cargado

        const icon = toast.querySelector('i');
        const msgSpan = document.getElementById('adminToastMsg');
        
        // Limpiar el temporizador anterior si existe
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        
        // Definir colores y clases según el tipo
        let color, iconClass;
        if (type === 'success') {
            color = '#10b981'; // Verde
            iconClass = 'fas fa-check-circle';
        } else if (type === 'warning') {
            color = '#f59e0b'; // Ámbar
            iconClass = 'fas fa-exclamation-triangle';
        } else {
            color = '#ef4444'; // Rojo
            iconClass = 'fas fa-exclamation-circle';
        }

        // Aplicar estilos
        toast.style.borderLeftColor = color;
        if (icon) {
            icon.style.color = color;
            icon.className = iconClass;
        }
        
        if (msgSpan) msgSpan.innerText = message;
        
        // Mostrar toast
        toast.classList.add('show');
        
        // Ocultar automáticamente después de 3.5 segundos
        this.toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);
    },

    /**
     * Abre o cierra el menú lateral en dispositivos móviles
     */
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.toggle('active');
        }
    }
};

// ============================================
// EXPONER FUNCIONES AL ÁMBITO GLOBAL
// (Necesario para los onclick="..." en admin.html)
// ============================================
window.showAdminToast = (m, t) => AdminUI.showToast(m, t);
window.toggleSidebar = () => AdminUI.toggleSidebar();