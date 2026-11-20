// ============================================================
// CONFIGURACIÓN Y SESIÓN (DETECTA GOOGLE AUTOMÁTICAMENTE)
// ============================================================
const TIENDA_DATA_KEY = 'tiendaData';
let supabaseClient = null;

function getTiendaActual() {
    try { return JSON.parse(localStorage.getItem(TIENDA_DATA_KEY) || '{}'); }
    catch { return {}; }
}

function saveTiendaSession(tienda) {
    localStorage.setItem(TIENDA_DATA_KEY, JSON.stringify(tienda || {}));
}

function clearTiendaSession() {
    localStorage.removeItem(TIENDA_DATA_KEY);
}

async function initSupabase() {
    if (supabaseClient) return supabaseClient;
    try {
        const res = await fetch('/api/public-config');
        const config = await res.json();
        if (!config.supabaseUrl || !config.supabaseAnonKey) throw new Error("Faltan credenciales");
        supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
        return supabaseClient;
    } catch (e) { return null; }
}

// Wrapper de peticiones (ya no pide token, usa el owner_id que ya encontramos)
async function apiTienda(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return res;
    } catch (error) {
        clearTimeout(timeoutId);
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
    const icons  = { success: 'fas fa-check-circle', warning: 'fas fa-exclamation-triangle', error: 'fas fa-exclamation-circle', info: 'fas fa-info-circle' };
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
    loader.style.display = 'flex';
    loader.innerHTML = `
        <div class="text-center p-4" style="background:white; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.1); max-width:300px;">
            <i class="fas fa-exclamation-triangle text-danger mb-3" style="font-size: 2rem;"></i>
            <p class="text-dark mb-4" style="font-size: 0.9rem;">${mensajeError}</p>
            <a href="/" class="btn btn-primary w-100"><i class="fas fa-home"></i> Volver al Inicio</a>
        </div>`;
}

function showSection(section) {
    document.querySelectorAll('[id^="view-"]').forEach(v => v.style.display = 'none');
    const view = document.getElementById(`view-${section}`);
    if (view) view.style.display = 'block';

    document.querySelectorAll('.nav-item[data-section]').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-section="${section}"]`)?.classList.add('active');

    if (section === 'mensajes')      cargarHistorialMensajes();
    if (section === 'productos')     cargarProductosTienda();
    if (section === 'pedidos')       cargarPedidosTienda();
    if (section === 'dashboard')     cargarDashboardTienda();

    if (window.innerWidth < 768) document.getElementById('sidebar')?.classList.remove('active');
}

async function enviarMensajeAdmin(e) {
    if (e) e.preventDefault();
    const asunto = document.getElementById('msgAsunto').value.trim();
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
                tienda_id: tienda.id, owner_id: tienda.owner_id || null,
                email: tienda.owner_email || tienda.configuracion?.contacto?.email || '',
                tienda_nombre: tienda.nombre || tienda.id, remitente: 'tienda',
                encabezado: asunto, mensaje: contenido, mensaje_completo: contenido
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
    const contenedor = document.getElementById('historialMensajes');
    if (!contenedor) return;
    const tienda = getTiendaActual();
    if (!tienda?.id) return;

    contenedor.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin text-primary"></i></div>';

    try {
        const res = await apiTienda(`/api/mis-mensajes-admin?tienda_id=${tienda.id}`);
        const data = await res.json();
        const msgs = Array.isArray(data) ? data : (data.mensajes || []);

        if (!msgs.length) {
            contenedor.innerHTML = '<div class="text-center text-muted py-4">Aún no tienes mensajes.</div>';
            return;
        }

        msgs.sort((a, b) => new Date(a.fecha || a.created_at) - new Date(b.fecha || b.created_at));
        contenedor.parentElement.innerHTML = `<div id="chatClienteContainer" style="max-height: 500px; overflow-y: auto; padding: 15px; background: #f8f9fa; border-radius: 8px;"></div>`;
        const chatDiv = document.getElementById('chatClienteContainer');

        chatDiv.innerHTML = msgs.map(m => {
            const esTienda = m.remitente === 'tienda';
            const fecha = new Date(m.fecha || m.created_at).toLocaleString('es-ES');
            const noLeido = !esTienda && !m.leido ? '<span class="badge bg-danger ms-2">Nuevo</span>' : '';
            return `
                <div class="d-flex flex-column mb-3 ${esTienda ? 'align-items-end' : 'align-items-start'}">
                    <small class="text-muted mb-1">${esTienda ? 'Tú' : 'Super Admin'} - ${fecha} ${noLeido}</small>
                    <div class="p-3 rounded-3 shadow-sm" style="max-width: 85%; background: ${esTienda ? '#4F46E5' : '#ffffff'}; color: ${esTienda ? 'white' : 'black'}; border: ${esTienda ? 'none' : '1px solid #e5e7eb'};">
                        ${escapeHtml(m.mensaje)}
                    </div>
                </div>`;
        }).join('');
        chatDiv.scrollTop = chatDiv.scrollHeight;
    } catch (err) {
        contenedor.innerHTML = '<div class="text-center text-danger py-4">Error al cargar historial</div>';
    }
}

async function cargarDashboardTienda() {
    const tienda = getTiendaActual();
    if (!tienda?.id) return;
    try {
        const res = await apiTienda(`/api/mis-pedidos?tienda=${tienda.id}`);
        const pedidos = await res.json();
        document.getElementById('dashPedidos').innerText = Array.isArray(pedidos) ? pedidos.length : 0;
        
        const resP = await apiTienda(`/api/mis-productos?tienda=${tienda.id}`);
        const prods = await resP.json();
        document.getElementById('dashProductos').innerText = Array.isArray(prods) ? prods.length : 0;
    } catch { }
}

async function cargarProductosTienda() {
    const cont = document.getElementById('productosList');
    const tienda = getTiendaActual();
    if (!tienda?.id) return;
    cont.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const res = await apiTienda(`/api/mis-productos?tienda=${tienda.id}`);
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
    const tienda = getTiendaActual();
    if (!tienda?.id) return;
    cont.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const res = await apiTienda(`/api/mis-pedidos?tienda=${tienda.id}`);
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

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
}

// ============================================================
// INICIALIZACIÓN INTELIGENTE (DETECTA SESIÓN DE GOOGLE)
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const ta = document.getElementById('msgContenido');
    const cnt = document.getElementById('msgCharCount');
    ta?.addEventListener('input', () => { if (cnt) cnt.innerText = ta.value.length; });

    document.getElementById('formMensajeAdmin')?.addEventListener('submit', enviarMensajeAdmin);

    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('active');
        document.getElementById('sidebarOverlay')?.classList.toggle('active');
    });
    document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.remove('active');
        document.getElementById('sidebarOverlay')?.classList.remove('active');
    });

    const loader = document.getElementById('loader');
    const appDiv = document.getElementById('app');

    try {
        // 1. Iniciar Supabase y buscar sesión de Google
        const sb = await initSupabase();
        if (!sb) return mostrarBotonLogin('Error al conectar con el sistema.');

        const { data: { session }, error: sessionError } = await sb.auth.getSession();
        
        if (sessionError || !session || !session.user) {
            return mostrarBotonLogin('No has iniciado sesión. Por favor, regresa e inicia con Google.');
        }

        const userEmail = session.user.email;
        const userId = session.user.id;

        // 2. Buscamos la tienda asociada a este usuario (por email o por ID)
        // Usamos el email porque es el dato más seguro que nos da Google
        const res = await apiTienda(`/api/mi-tienda?owner_id=${userId}`);
        let data = await res.json();

        // Si no la encuentra por ID, intentamos buscarla en la lista general
        if (!data.success || !data.store) {
            const resAll = await apiTienda('/api/superadmin/tiendas'); // Nota: Usamos esta ruta pública temporalmente
            const todas = await resAll.json();
            const miTienda = todas.find(t => t.owner_email === userEmail || t.owner_id === userId);
            
            if (!miTienda) {
                return mostrarBotonLogin('Tu cuenta (' + userEmail + ') no tiene una tienda registrada aún.');
            }
            data = { success: true, store: miTienda };
        }

        // 3. Guardamos y abrimos el panel
        const tienda = data.store;
        tienda.owner_email = userEmail;
        saveTiendaSession(tienda);

        const nombre = document.getElementById('nombreTiendaSidebar');
        if (nombre) nombre.innerText = tienda.nombre || tienda.id;

        loader.style.display = 'none';
        appDiv.style.display = 'block';
        showSection('dashboard');

    } catch (err) {
        console.error("Error crítico:", err);
        mostrarBotonLogin('Ocurrió un error al cargar tu tienda. Intenta de nuevo.');
    }
});