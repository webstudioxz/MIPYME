// ============================================================
// public/js/admin/login.js
// ============================================================

window.AdminAuth = {
    loginAttempts: 0,
    loginLocked: false,
    lockTimer: null,

    async check() {
        AdminAPI.init();
        if (await AdminAPI.verifySession()) {
            this.showApp();
            return true;
        }
        this.showLogin();
        return false;
    },

    showLogin() {
        const loginScreen = document.getElementById('loginScreen');
        const app = document.getElementById('app');
        if (loginScreen) loginScreen.style.display = 'flex';
        if (app) app.style.display = 'none';
    },

    showApp() {
        const loginScreen = document.getElementById('loginScreen');
        const app = document.getElementById('app');
        const sidebar = document.getElementById('sidebar');
        
        if (loginScreen) loginScreen.style.display = 'none';
        if (app) app.style.display = 'block';
        if (sidebar) sidebar.style.display = 'flex';
    },

    async doLogin(e) {
        if (e) e.preventDefault();

        if (this.loginLocked) {
            AdminUI.showToast('⛔ Demasiados intentos. Espera 5 minutos.', 'error');
            return;
        }

        const passwordInput = document.getElementById('passInput');
        const btn = document.getElementById('loginBtn');
        const errorEl = document.getElementById('loginError');
        
        if (!passwordInput || !btn || !errorEl) return;

        const password = passwordInput.value;
        const originalText = btn.innerHTML;

        if (!password) {
            errorEl.textContent = '⚠️ Ingresa la contraseña';
            errorEl.style.color = 'var(--warning)';
            return;
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
        btn.disabled = true;
        errorEl.textContent = 'Conectando...';
        errorEl.style.color = 'var(--text-secondary)';

        try {
            const data = await AdminAPI.login(password);

            if (data.success) {
                AdminAPI.saveSession(data.token, data.expires);
                errorEl.textContent = '¡Éxito! Entrando...';
                errorEl.style.color = 'var(--success)';
                
                // RECARGA FORZADA
                window.location.reload(); 
            } else {
                this.loginAttempts++;
                errorEl.textContent = `❌ ${data.error || 'Contraseña incorrecta'}`;
                errorEl.style.color = 'var(--danger)';
                btn.innerHTML = originalText;
                btn.disabled = false;
                passwordInput.value = '';
                passwordInput.focus();
            }
        } catch (error) {
            errorEl.textContent = `❌ Error: ${error.message}`;
            errorEl.style.color = 'var(--danger)';
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    async logout() {
        await AdminAPI.logout();
        this.showLogin();
        AdminUI.showToast('👋 Sesión cerrada');
        if (window.AdminOrders && AdminOrders.orderCheckInterval) {
            clearInterval(AdminOrders.orderCheckInterval);
        }
    }
};

window.logout = () => AdminAuth.logout();