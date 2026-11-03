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
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('app').style.display = 'none';
    },

    showApp() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('app').style.display = 'block';
    },

    async doLogin(e) {
        e.preventDefault();
        if (this.loginLocked) {
            AdminUI.showToast('⛔ Demasiados intentos. Espera 5 minutos.', 'error');
            return;
        }
        const password = document.getElementById('passInput').value;
        const btn = document.getElementById('loginBtn');
        const errorEl = document.getElementById('loginError');
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
                this.loginAttempts = 0;
                AdminAPI.saveSession(data.token, data.expires);
                AdminUI.showToast('✅ Acceso concedido');
                this.showApp();
                await AdminApp.loadInitialData();
            } else {
                this.loginAttempts++;
                const remaining = 5 - this.loginAttempts;
                errorEl.textContent = `❌ ${data.error || 'Contraseña incorrecta'}. Intento ${this.loginAttempts}/5`;
                errorEl.style.color = remaining > 0 ? 'var(--warning)' : 'var(--danger)';
                if (this.loginAttempts >= 5) {
                    this.loginLocked = true;
                    errorEl.textContent = '⛔ Demasiados intentos. Espera 5 minutos.';
                    this.lockTimer = setTimeout(() => {
                        this.loginLocked = false;
                        this.loginAttempts = 0;
                        errorEl.textContent = '🔓 Puedes intentar nuevamente';
                        errorEl.style.color = 'var(--success)';
                    }, 300000);
                }
                document.getElementById('passInput').value = '';
                document.getElementById('passInput').focus();
            }
        } catch (error) {
            errorEl.textContent = '❌ Error de conexión con el servidor';
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
        if (AdminApp.orderCheckInterval) clearInterval(AdminApp.orderCheckInterval);
    }
};