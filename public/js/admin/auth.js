// ============================================================
// public/js/admin/auth.js
// Autenticación del panel de administración (Forzado de recarga)
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
        errorEl.textContent = '';

        try {
            const data = await AdminAPI.login(password);

            if (data.success) {
                // 1. Guardamos el token en el navegador
                AdminAPI.saveSession(data.token, data.expires);
                
                // 🚨 EL TRUCO: Recargar la página inmediatamente.
                // Al recargar, la función check() leerá el token, ocultará el login y mostrará el panel.
                window.location.reload(); 
                
            } else {
                this.loginAttempts++;
                const remaining = 5 - this.loginAttempts;
                
                errorEl.textContent = `❌ ${data.error || 'Contraseña incorrecta'}. Intento ${this.loginAttempts}/5`;
                errorEl.style.color = remaining > 0 ? 'var(--warning)' : 'var(--danger)';

                if (this.loginAttempts >= 5) {
                    this.loginLocked = true;
                    errorEl.textContent = '⛔ Demasiados intentos. Espera 5 minutos.';
                    errorEl.style.color = 'var(--danger)';
                    
                    this.lockTimer = setTimeout(() => {
                        this.loginLocked = false;
                        this.loginAttempts = 0;
                        errorEl.textContent = '🔓 Puedes intentar nuevamente';
                        errorEl.style.color = 'var(--success)';
                    }, 300000);
                }

                passwordInput.value = '';
                passwordInput.focus();
            }
        } catch (error) {
            console.error('Error en login:', error);
            errorEl.textContent = '❌ Error de red. Revisa tu conexión.';
            errorEl.style.color = 'var(--danger)';
        } finally {
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