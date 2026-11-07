window.AdminUI = {
    toastTimeout: null,

    showToast(message, type = 'success') {
        const toast = document.getElementById('adminToast');
        const icon = toast.querySelector('i');
        const msgSpan = document.getElementById('adminToastMsg');
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        toast.style.borderLeftColor = type === 'success' ? '#10b981' : '#ef4444';
        icon.style.color = type === 'success' ? '#10b981' : '#ef4444';
        icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
        msgSpan.innerText = message;
        toast.classList.add('show');
        this.toastTimeout = setTimeout(() => toast.classList.remove('show'), 3500);
    },

    toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('active');
    }
};

// Exponer al ámbito global para onclick
window.showAdminToast = (m, t) => AdminUI.showToast(m, t);
window.toggleSidebar = () => AdminUI.toggleSidebar();