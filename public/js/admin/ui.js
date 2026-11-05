// ============================================
// ADMIN UI - Utilidades de interfaz del panel admin
// ============================================
window.AdminUI = {

    // Toast premium
    showToast(msg, type = 'success') {
        const toast = document.getElementById('adminToast');
        const toastMsg = document.getElementById('adminToastMsg');
        const icon = toast.querySelector('i');
        if (!toast || !toastMsg) return;

        toastMsg.innerHTML = msg;
        toast.classList.remove('error', 'warning');

        if (type === 'error') {
            toast.classList.add('error');
            icon.className = 'fas fa-circle-exclamation';
        } else if (type === 'warning') {
            toast.classList.add('warning');
            icon.className = 'fas fa-triangle-exclamation';
        } else {
            icon.className = 'fas fa-check-circle';
        }

        toast.classList.add('show');
        clearTimeout(this._toastT);
        this._toastT = setTimeout(() => toast.classList.remove('show'), 3500);
    },

    // Escapar HTML
    escape(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    },

    // Formatear precio
    formatPrice(n) {
        if (typeof n !== 'number' || isNaN(n)) n = 0;
        return new Intl.NumberFormat('es-ES').format(n) + ' CUP';
    },

    // Formatear fecha
    formatDate(date) {
        const d = new Date(date);
        return d.toLocaleString('es-ES', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    },

    // Inicial de nombre (para avatar)
    getInitials(name) {
        if (!name) return '?';
        return name.trim().charAt(0).toUpperCase();
    },

    // Truncar texto
    truncate(str, length = 80) {
        if (!str) return '';
        return str.length > length ? str.substring(0, length) + '…' : str;
    },

    // Confirmar acción
    async confirm(message, title = '¿Confirmar?') {
        return window.confirm(message);
    },

    // Estado vacío para tablas
    emptyRow(colspan, message = 'No hay datos') {
        return `<tr><td colspan="${colspan}" style="text-align:center;padding:40px 20px;color:var(--text-muted);">
            <i class="fas fa-inbox" style="font-size:2rem;opacity:0.3;display:block;margin-bottom:8px;"></i>
            ${message}
        </td></tr>`;
    }
};
