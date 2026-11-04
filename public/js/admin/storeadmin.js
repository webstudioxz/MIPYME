window.AdminUI = {
    toastTimeout: null,

    showToast(message, type = 'success') {
        const toast = document.getElementById('adminToast');
        const icon = toast.querySelector('i');
        const msgSpan = document.getElementById('adminToastMsg');
        
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        
        toast.style.borderLeftColor = type === 'success' ? '#10b981' : (type === 'warning' ? '#f59e0b' : '#ef4444');
        icon.style.color = type === 'success' ? '#10b981' : (type === 'warning' ? '#f59e0b' : '#ef4444');
        icon.className = type === 'success' ? 'fas fa-check-circle' : (type === 'warning' ? 'fas fa-exclamation-triangle' : 'fas fa-exclamation-circle');
        
        msgSpan.innerText = message;
        toast.classList.add('show');
        
        this.toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);
    },

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.toggle('active');
        }
    }
};

// Exponer las funciones al ámbito global para que funcionen los onclick del HTML
window.showAdminToast = (m, t) => AdminUI.showToast(m, t);
window.toggleSidebar = () => AdminUI.toggleSidebar();