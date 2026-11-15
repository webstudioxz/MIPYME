// ============================================================
// public/js/admin/auth.js
// Autenticación del panel de administración
// ============================================================

window.AdminAuth = {
    loginAttempts: 0,
    loginLocked: false,
    lockTimer: null,

    // ------------------------------------------------------------
    // Verificar si hay sesión activa al cargar la página
    // ------------------------------------------------------------
    async check() {
        AdminAPI.init();
        if (await AdminAPI.verifySession()) {
            this.showApp();
            return true;
        }
        this.showLogin();
        return false;
    },

    // ------------------------------------------------------------
    // Mostrar pantalla de login
    // ------------------------------------------------------------
    showLogin() {
        const loginScreen = document.getElementById('loginScreen');
        const app = document.getElementById('app');
        if (loginScreen) loginScreen.style.display = 'flex';
        if (app) app.style.display = 'none';
    },

    // ------------------------------------------------------------
    // Mostrar panel de administración
    // ------------------------------------------------------------
    showApp() {
        const loginScreen = document.getElementById('loginScreen');
        const app = document.getElementById('app');
        if (loginScreen) loginScreen.style.display = 'none';
        if (app) app.style.display = 'block';
    },

    // ------------------------------------------------------------
    // Procesar el formulario de login
    // ------------------------------------------------------------
    async doLogin(e) {
        if (e) e.preventDefault();

        // Verificar bloqueo por intentos fallidos
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
                // Login exitoso
                this.loginAttempts = 0;
                AdminAPI.saveSession(data.token, data.expires);
                AdminUI.showToast('✅ Acceso concedido');
                this.showApp();
                
                // Cargar datos iniciales (desde app.js)
                if (window.AdminApp && AdminApp.loadInitialData) {
                    await AdminApp.loadInitialData();
                }
            } else {
                // Login fallido
                this.loginAttempts++;
                const remaining = 5 - this.loginAttempts;
                
                errorEl.textContent = `❌ ${data.error || 'Contraseña incorrecta'}. Intento ${this.loginAttempts}/5`;
                errorEl.style.color = remaining > 0 ? 'var(--warning)' : 'var(--danger)';

                // Bloqueo tras 5 intentos
                if (this.loginAttempts >= 5) {
                    this.loginLocked = true;
                    errorEl.textContent = '⛔ Demasiados intentos. Espera 5 minutos.';
                    errorEl.style.color = 'var(--danger)';
                    
                    this.lockTimer = setTimeout(() => {
                        this.loginLocked = false;
                        this.loginAttempts = 0;
                        errorEl.textContent = '🔓 Puedes intentar nuevamente';
                        errorEl.style.color = 'var(--success)';
                    }, 300000); // 5 minutos
                }

                // Limpiar input
                passwordInput.value = '';
                passwordInput.focus();
            }
        } catch (error) {
            console.error('Error en login:', error);
            errorEl.textContent = '❌ Error de conexión con el servidor';
            errorEl.style.color = 'var(--danger)';
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    // ------------------------------------------------------------
    // Cerrar sesión
    // ------------------------------------------------------------
    async logout() {
        await AdminAPI.logout();
        this.showLogin();
        AdminUI.showToast('👋 Sesión cerrada');
        
        // Detener polling de pedidos si existe
        if (window.AdminOrders && AdminOrders.orderCheckInterval) {
            clearInterval(AdminOrders.orderCheckInterval);
        }
    }
};

// Función global para el onclick del HTML
window.logout = () => AdminAuth.logout();