// ============================================
// STORE UTILS - Utilidades de la tienda
// ============================================
window.StoreUtils = {

    // Obtener parámetro de la URL
    getUrlParam(name) {
        const params = new URLSearchParams(window.location.search);
        return params.get(name);
    },

    // Formatear fecha
    formatDate(date) {
        const d = new Date(date);
        return d.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    // Debounce (para búsqueda en vivo)
    debounce(fn, wait = 300) {
        let t;
        return function(...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    },

    // Escapar HTML (seguridad)
    escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    },

    // Validar teléfono cubano (5XXXXXXXX)
    isValidCubanPhone(phone) {
        const clean = phone.replace(/[\s\-\(\)]/g, '');
        return /^[5]\d{7}$/.test(clean);
    },

    // Validar email
    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },

    // Copiar al portapapeles con feedback
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Fallback para navegadores antiguos
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                document.body.removeChild(ta);
                return true;
            } catch {
                document.body.removeChild(ta);
                return false;
            }
        }
    },

    // Detectar dispositivo móvil
    isMobile() {
        return window.matchMedia('(max-width: 767px)').matches;
    },

    // Detectar si es PWA instalada
    isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true;
    },

    // Scroll suave a elemento
    scrollTo(selector, offset = 0) {
        const el = document.querySelector(selector);
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top, behavior: 'smooth' });
    },

    // Truncar texto
    truncate(str, length = 100) {
        if (!str) return '';
        return str.length > length ? str.substring(0, length) + '…' : str;
    },

    // Formatear número con separadores de miles
    formatNumber(n) {
        return new Intl.NumberFormat('es-ES').format(n);
    },

    // Generar ID único (para uso en cliente)
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    },

    // Guardar preferencia de moneda
    saveCurrencyPreference(currency) {
        localStorage.setItem('tienda-fg_currency', currency);
    },

    // Cargar preferencia de moneda
    loadCurrencyPreference() {
        return localStorage.getItem('tienda-fg_currency') || 'CUP';
    }
};
