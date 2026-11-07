// ============================================
// STORE UTILS - Funciones auxiliares de la tienda
// ============================================
window.StoreUtils = {
    formatDate(date) {
        return new Date(date).toLocaleString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    getUrlParam(name) {
        const params = new URLSearchParams(window.location.search);
        return params.get(name);
    }
};