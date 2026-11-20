// ============================================================
// CONFIGURACIÓN Y SESIÓN (PANEL CLIENTE / DUEÑO DE TIENDA)
// ============================================================
const TOKEN_TIENDA_KEY = 'tiendaToken';
const TIENDA_DATA_KEY   = 'tiendaData';

function getTokenTienda()   { return localStorage.getItem(TOKEN_TIENDA_KEY); }
function getTiendaActual()  {
    try { return JSON.parse(localStorage.getItem(TIENDA_DATA_KEY) || '{}'); }
    catch { return {}; }
}
function saveTiendaSession(token, tienda) {
    localStorage.setItem(TOKEN_TIENDA_KEY, token);
    localStorage.setItem(TIENDA_DATA_KEY, JSON.stringify(tienda || {}));
}
function clearTiendaSession() {
    localStorage.removeItem(TOKEN_TIENDA_KEY);
    localStorage.removeItem(TIENDA_DATA_KEY);
}

// Wrapper fetch con token del dueño y protección contra cuelgues
async function apiTienda(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    const token = getTokenTienda();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // AbortController para evitar que la petición se quede colgada
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 segundos máximo

    try {
        const res = await fetch(url, { ...options, headers, signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.status === 401) {
            clearTiendaSession();
            document.getElementById('app').style.display = 'none';
            document.getElementById('loader').style.display = 'flex';
            mostrarBotonLogin('Sesión expirada, por favor vuelve a entrar.');
            throw new Error('Sesión expirada');
        }
        return res;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Tiempo de espera agotado (Timeout). Revisa tu conexión.');
        }
        throw error;
    }
}

// ============================================================
// UI: TOAST Y NAVEGACIÓN
// ============================================================
function showToast(msg, type = 'success') {
    const toast = document.getElementById('adminToast');
    if (!toast) { alert(msg); return; }
    const icon  = toast.querySelector('i');
    const span  = document.getElementById('adminToastMsg');
    const colors = { success: '#10B981', warning: '#F59E0B', error: '#EF4444', info: '#3B82F6' };
    const icons  = {
        success: 'fas fa-check-circle',
        warning: 'fas fa-exclamation-triangle',
        error:   'fas fa-exclamation-circle',
        info:    'fas fa-info-circle'
    };
    const color = colors[type] || colors.success;
    toast.style.borderLeftColor = color;
    toast.style.display = 'flex';
    icon.style.color = color;
    icon.className = icons[type] || icons.success;
    span.innerHTML = msg;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.display = 'none'; }, 3500);
}

function mostrarBotonLogin(mensajeError) {
    const loader = document.getElementById('loader');
    loader.style.display = 'flex'; // Asegurar que el loader esté visible
    loader.innerHTML = `
        <div class="text-center p-4" style="background:white; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
            <i class="fas fa-exclamation-circle text-danger mb-3" style="font-size: 2rem;"></i>
            <p class="text-dark mb-4">${mensajeError}</p>
            <a href="/login-tienda" class="btn btn-primary px-4 py-2">
                <i class="fas fa-sign-in-alt"></i> Ir al Login
            </a>
        </div>`;
}

function showSection(section) {
    document.querySelectorAll('[id^="view-"]').forEach(v => v.style.display = 'none');
    const view = document.getElementById(`view-${section}`);
    if (view) view.style.display = 'block';

    document.querySelectorAll('.nav-item[data-section]').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-section="${section}"]`)?.classList.add('active');

    // Cargar datos de la sección
    if (section === 'mensajes')      cargarHistorialMensajes();
    if (section === 'productos')     cargarProductosTienda();
    if (section === 'pedidos')       cargarPedidosTienda();
    if (section === 'dashboard')     cargarDashboardTienda();

    if (window.innerWidth < 768) document.getElementById('sidebar')?.classList.remove('active');
}


async function enviarMensajeAdmin(e) {
    if (e) e.preventDefault();

    const asunto    = document.getElementById('msgAsunto').value.trim();
    const contenido = document.getElementById('msgContenido').value.trim();
    if (!asunto || !contenido) { showToast('⚠️ Completa asunto y mensaje', 'warning'); return; }

    const tienda = getTiendaActual();
    if (!tienda?.id) { showToast('❌ Tienda no identificada', 'error'); return; }

    const btn = document.getElementById('btnEnviarMensaje');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    btn.disabled = true;

    try {
        const res = await apiTienda('/api/mensajes-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tienda_id:    tienda.id,
                owner_id:     tienda.owner_id || null,
                email:        tienda.owner_email || tienda.configuracion?.contacto?.email || '',
                tienda_nombre: tienda.nombre || tienda.id,
                remitente:    'tienda',
                encabezado:   asunto,
                mensaje:      contenido,
                mensaje_completo: contenido
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast('✅ Mensaje enviado al Super Admin');
            document.getElementById('formMensajeAdmin').reset();
            document.getElementById('msgCharCount').innerText = '0';
            cargarHistorialMensajes();
        } else {
            showToast('❌ ' + (data.error || 'No se pudo enviar'), 'error');
        }
    } catch (err) {
        showToast('❌ ' + err.message, 'error');
    } finally {
        btn.innerHTML = orig;
        btn.disabled = false;
    }
}

async function cargarHistorialMensajes() {
    const tbody = document.getElementById('historialMensajes');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4"><i class="fas fa-spinner fa-spin text-primary"></i></td></tr>';

    try {
        const res = await apiTienda('/api/tienda/mis-mensajes-admin');
        const data = await res.json();
        const msgs = Array.isArray(data) ? data : (data.mensajes || []);

        if (!msgs.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">Aún no has enviado mensajes</td></tr>';
            return;
        }

        tbody.innerHTML = msgs.map(m => `
            <tr>
                <td data-label="Fecha">${m.fecha ? new Date(m.fecha).toLocaleString('es-ES') : '—'}</td>
                <td data-label="Asunto" class="fw-bold">${escapeHtml(m.asunto || '(sin asunto)')}</td>
                <td data-label="Mensaje">${escapeHtml(m.mensaje || '')}</td>
                <td data-label="Estado">
                    <span class="badge bg-${m.leido ? 'success' : 'warning'}">
                        ${m.leido ? 'Leído' : 'Nuevo'}
                    </span>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('[cargarHistorialMensajes]', err);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-4">Error al cargar historial</td></tr>';
    }
}

// ============================================================
// RESTO DE SECCIONES
// ============================================================
async function cargarDashboardTienda() {
    try {
        const res = await apiTienda('/api/mi-tienda/dashboard');
        if (!res.ok) return;
        const data = await res.json();
        document.getElementById('dashProductos').innerText = data.productos || 0;
        document.getElementById('dashPedidos').innerText   = data.pedidos   || 0;
    } catch { /* silencioso */ }
}

async function cargarProductosTienda() {
    const cont = document.getElementById('productosList');
    cont.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const res = await apiTienda('/api/mi-tienda/productos');
        const prods = await res.json();
        if (!Array.isArray(prods) || !prods.length) {
            cont.innerHTML = '<div class="card"><div class="card-body text-center text-muted py-4">Sin productos</div></div>';
            return;
        }
        cont.innerHTML = `<div class="card card-table p-0"><div class="table-responsive"><table class="table mb-0">
            <thead><tr><th>Nombre</th><th>Precio</th><th>Estado</th></tr></thead>
            <tbody>${prods.map(p => `
                <tr>
                    <td>${escapeHtml(p.nombre || '')}</td>
                    <td>${p.precio || 0} CUP</td>
                    <td>${p.disponible ? '<span class="badge bg-success">Disponible</span>' : '<span class="badge bg-secondary">No disponible</span>'}</td>
                </tr>`).join('')}
            </tbody></table></div></div>`;
    } catch {
        cont.innerHTML = '<div class="alert alert-danger">Error al cargar productos</div>';
    }
}

async function cargarPedidosTienda() {
    const cont = document.getElementById('pedidosList');
    cont.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const res = await apiTienda('/api/mi-tienda/pedidos');
        const pedidos = await res.json();
        if (!Array.isArray(pedidos) || !pedidos.length) {
            cont.innerHTML = '<div class="card"><div class="card-body text-center text-muted py-4">Sin pedidos</div></div>';
            return;
        }
        cont.innerHTML = `<div class="card card-table p-0"><div class="table-responsive"><table class="table mb-0">
            <thead><tr><th>Fecha</th><th>Cliente</th><th>Producto</th><th>Total</th><th>Estado</th></tr></thead>
            <tbody>${pedidos.map(p => `
                <tr>
                    <td>${p.fecha ? new Date(p.fecha).toLocaleString('es-ES') : '—'}</td>
                    <td>${escapeHtml(p.cliente_nombre || '—')}</td>
                    <td>${escapeHtml(p.producto_nombre || '—')}</td>
                    <td><strong>${p.total || 0} ${p.moneda || 'CUP'}</strong></td>
                    <td><span class="badge bg-info">${p.estado || 'pendiente'}</span></td>
                </tr>`).join('')}
            </tbody></table></div></div>`;
    } catch {
        cont.innerHTML = '<div class="alert alert-danger">Error al cargar pedidos</div>';
    }
}

function logoutTienda() {
    if (!confirm('¿Cerrar sesión?')) return;
    clearTiendaSession();
    window.location.href = '/';
}

// ============================================================
// HELPERS
// ============================================================
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
}

// ============================================================
// INICIALIZACIÓN (CON TIMEOUT DE SEGURIDAD)
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Contador de caracteres
    const ta = document.getElementById('msgContenido');
    const cnt = document.getElementById('msgCharCount');
    ta?.addEventListener('input', () => { if (cnt) cnt.innerText = ta.value.length; });

    // Submit del formulario de mensajes
    document.getElementById('formMensajeAdmin')?.addEventListener('submit', enviarMensajeAdmin);

    // Botón menú móvil
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('active');
        document.getElementById('sidebarOverlay')?.classList.toggle('active');
    });
    document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.remove('active');
        document.getElementById('sidebarOverlay')?.classList.remove('active');
    });

    // Verificar sesión al arrancar
    const token = getTokenTienda();
    
    // Si no hay token, forzamos la vista del botón de login inmediatamente
    if (!token) {
        mostrarBotonLogin('No has iniciado sesión.');
        return;
    }

    // Timeout de seguridad: si en 10 segundos no se ha abierto la app, muestra el botón
    const safetyTimeout = setTimeout(() => {
        if (document.getElementById('app').style.display === 'none' || document.getElementById('app').style.display === '') {
            mostrarBotonLogin('El servidor tardó demasiado en responder. Vuelve a intentarlo.');
        }
    }, 10000);

    try {
        const res = await apiTienda('/api/tienda/verify-session');
        
        // Validamos que la respuesta sea JSON válido
        let data;
        try {
            data = await res.json();
        } catch (e) {
            throw new Error('Respuesta del servidor no válida');
        }

        if (!data.valid) {
            throw new Error('La sesión no es válida en el servidor.');
        }

        // Guardar datos de la tienda
        if (data.tienda) {
            saveTiendaSession(token, data.tienda);
            const nombre = document.getElementById('nombreTiendaSidebar');
            if (nombre) nombre.innerText = data.tienda.nombre || data.tienda.id;
        }

        // Detener el timeout de seguridad
        clearTimeout(safetyTimeout);

        // Mostrar el panel
        document.getElementById('loader').style.display = 'none';
        document.getElementById('app').style.display    = 'block';
        showSection('dashboard');
        
    } catch (err) {
        clearTimeout(safetyTimeout);
        console.error("Error en verificación:", err);
        
        // Limpiar el token viejo inmediatamente
        clearTiendaSession();
        mostrarBotonLogin('Sesión expirada o inválida. Por favor, ingresa de nuevo.');
    }
});