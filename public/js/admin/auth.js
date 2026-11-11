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
            this.loginAttempts = 0;
            AdminAPI.saveSession(data.token, data.expires);
            
            // 🚨 ESTO ES LO QUE FALTABA: Forzamos la entrada al panel
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('app').style.display = 'block';
            document.getElementById('sidebar').style.display = 'flex';
            
            AdminUI.showToast('✅ Acceso concedido');
            
            // Cargar los datos del panel
            if (window.AdminApp && AdminApp.loadInitialData) {
                await AdminApp.loadInitialData();
            }
        } else {
            // Si el servidor dice que la contraseña está mal, mostramos el error real
            errorEl.textContent = `❌ ${data.error || 'Contraseña incorrecta'}`;
            errorEl.style.color = 'var(--danger)';
            passwordInput.value = '';
            passwordInput.focus();
        }
    } catch (error) {
        console.error('Error en login:', error);
        // Si hay un fallo de red, avisamos y dejamos intentar de nuevo
        errorEl.textContent = '❌ Error de red. Revisa tu conexión e intenta de nuevo.';
        errorEl.style.color = 'var(--danger)';
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
},