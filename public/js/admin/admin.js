// ============================================================
// CONFIGURACIÓN Y SESIÓN (SUPERADMIN)
// ============================================================
const TOKEN_KEY = 'superadminToken';
const EXPIRY_KEY = 'superadminExpiry';
let allTiendas = [];
let allUsuarios = [];
let currentImageMode = 'url';
let uploadedImageBase64 = null;
let allPlanes = [];

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function getExpiry() { return localStorage.getItem(EXPIRY_KEY); }
function saveSession(t, e) { localStorage.setItem(TOKEN_KEY, t); localStorage.setItem(EXPIRY_KEY, e); }
function clearSession() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(EXPIRY_KEY); }
function isSessionValid() { return getToken() && getExpiry() && Date.now() < parseInt(getExpiry()); }

async function api(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (getToken()) headers['Authorization'] = `Bearer ${getToken()}`;
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) { 
        clearSession(); 
        document.getElementById('app').style.display = 'none'; 
        document.getElementById('loginScreen').style.display = 'flex'; 
        throw new Error('Sesión expirada'); 
    }
    return res;
}

// ============================================================
// UI Y TOASTS
// ============================================================
function showToast(msg, type = 'success') {
    const toast = document.getElementById('adminToast');
    const icon = toast.querySelector('i');
    const span = document.getElementById('adminToastMsg');
    const colors = { success: '#10B981', warning: '#F59E0B', error: '#EF4444' };
    const icons = { success: 'fas fa-check-circle', warning: 'fas fa-exclamation-triangle', error: 'fas fa-exclamation-circle' };
    toast.style.borderLeftColor = colors[type] || colors.success;
    icon.style.color = colors[type] || colors.success;
    icon.className = icons[type] || icons.success;
    span.innerHTML = msg;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), 3500);
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('active'); }

// ============================================================
// HELPERS DE FECHAS Y ESTADOS
// ============================================================
function formatDate(d) {
    if (!d) return '—';
    if (typeof d === 'string' && d.startsWith('9999')) return 'Permanente';
    return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function vencimientoBadge(fecha) {
    if (!fecha) return '<span class="text-muted small">—</span>';
    if (typeof fecha === 'string' && fecha.startsWith('9999')) return '<span class="badge-venc ok">∞ Permanente</span>';
    const diff = Math.ceil((new Date(fecha) - new Date()) / (1000 * 60 * 60 * 24));
    if (diff <= 0) return '<span class="badge-venc danger">Vencida</span>';
    if (diff <= 7) return `<span class="badge-venc danger">${diff} días</span>`;
    if (diff <= 30) return `<span class="badge-venc warning">${diff} días</span>`;
    return `<span class="badge-venc ok">${diff} días</span>`;
}

function isVencida(t) {
    if (!t.fecha_vencimiento) return false;
    if (typeof t.fecha_vencimiento === 'string' && t.fecha_vencimiento.startsWith('9999')) return false;
    return new Date(t.fecha_vencimiento) < new Date();
}

function isPendienteLiberacion(t) {
    return t.activa === false && !t.pausada;
}

function estadoBadgeTienda(t) {
    if (isPendienteLiberacion(t)) {
        return '<span class="badge-pendiente"><i class="fas fa-hourglass-half"></i> Pendiente Liberación</span>';
    }
    if (t.pausada) {
        return '<span class="badge-pausada"><i class="fas fa-pause"></i> Pausada</span>';
    }
    if (isVencida(t)) {
        return '<span class="badge-venc danger">Vencida</span>';
    }
    return '<span class="badge-activa"><i class="fas fa-check"></i> Activa</span>';
}

// ============================================================
// AUTENTICACIÓN
// ============================================================
async function verifySession() {
    if (!isSessionValid()) return false;
    try {
        const res = await api('/api/admin/verify-session');
        if (!res.ok) return false;
        const data = await res.json();
        return data.valid === true;
    } catch { return false; }
}

async function showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    await refreshAllData();
    showSection('dashboard');
    if (window.AdminNotifications) AdminNotifications.init().catch(console.error);
}

function logout() {
    clearSession();
    document.getElementById('app').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('passInput').value = '';
    showToast('👋 Sesión cerrada');
}

// ============================================================
// NAVEGACIÓN PRINCIPAL
// ============================================================
function showSection(section) {
    document.querySelectorAll('[id^="view-"]').forEach(v => v.style.display = 'none');
    const view = document.getElementById(`view-${section}`);
    if (view) view.style.display = 'block';
    document.querySelectorAll('.nav-item[data-section]').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-section="${section}"]`)?.classList.add('active');
    
    if (section === 'dashboard') loadDashboard();
    if (section === 'tiendas') loadTiendas();
    if (section === 'pedidos') loadPedidosGlobal();
    if (section === 'planes') loadPlanes();
    if (section === 'privacidad') loadPrivacidad();
    if (section === 'pagos') loadPagos();
    if (section === 'solicitudes') loadSolicitudes();
    if (section === 'mensajes') loadMensajesAdmin();
    if (section === 'seguridad') loadSeguridad();
    if (section === 'configpagos') loadConfigPagos();
    
    if (window.innerWidth < 768) document.getElementById('sidebar')?.classList.remove('active');
}

async function refreshAllData() {
    await Promise.all([loadTiendasData(), loadUsuariosData()]);
}

async function loadTiendasData() {
    try {
        const res = await api('/api/superadmin/tiendas');
        allTiendas = await res.json();
        const sel = document.getElementById('filterTiendaPedidos');
        if (sel) sel.innerHTML = '<option value="">Todas las tiendas</option>' + allTiendas.map(t => `<option value="${t.id}">${t.nombre}</option>`).join('');
        return allTiendas;
    } catch { allTiendas = []; return []; }
}

async function loadUsuariosData() {
    try {
        const res = await api('/api/superadmin/usuarios');
        allUsuarios = await res.json();
        return allUsuarios;
    } catch { allUsuarios = []; return []; }
}

// ============================================================
// DASHBOARD Y LISTADO DE TIENDAS
// ============================================================
function loadDashboard() {
    const pendientes = allTiendas.filter(t => isPendienteLiberacion(t)).length;
    const activas = allTiendas.filter(t => !isPendienteLiberacion(t) && !t.pausada && !isVencida(t)).length;
    const pausadas = allTiendas.filter(t => t.pausada).length;
    const vencidas = allTiendas.filter(t => isVencida(t)).length;
    
    document.getElementById('dashTiendas').innerText = allTiendas.length;
    document.getElementById('dashActivas').innerText = activas;
    document.getElementById('dashPausadas').innerText = pausadas;
    document.getElementById('dashVencidas').innerText = vencidas;
    const dashPend = document.getElementById('dashPendientes');
    if (dashPend) dashPend.innerText = pendientes;

    const recientes = [...allTiendas].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
    const tbody = document.getElementById('dashRecentTiendas');
    if (!recientes.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Sin tiendas</td></tr>'; return; }
    
    tbody.innerHTML = recientes.map(t => `
        <tr>
            <td data-label="Tienda"><div class="d-flex align-items-center gap-2"><span class="store-icon">${t.icono || '🛒'}</span><div><div class="fw-bold">${t.nombre} ${t.configuracion?.tipo === 'reserva' ? '<span class="badge bg-warning text-dark ms-1" style="font-size:0.6rem;">RESERVA</span>' : ''}</div><small class="text-muted">${t.id}</small></div></div></td>
            <td data-label="Dueño">${t.es_mia ? '<span class="badge-mia"><i class="fas fa-crown"></i> Mía</span>' : (t.owner_email || '<span class="text-muted">Sin cuenta</span>')}</td>
            <td data-label="Plan"><span class="plan-name-pill ${t.plan || 'prueba'}"><i class="fas fa-crown"></i> ${planNombreDisplay(t.plan)}</span></td>
            <td data-label="Vence">${formatDate(t.fecha_vencimiento)}</td>
            <td data-label="Estado">${estadoBadgeTienda(t)}</td>
        </tr>
    `).join('');
}

function planNombreDisplay(planId) {
    const nombres = { prueba: 'Gratis', basico: 'Básico', pro: 'Pro', premium: 'Premium' };
    return nombres[planId] || 'Gratis';
}

async function loadTiendas() {
    await loadTiendasData();
    document.getElementById('kpiTotal').innerText = allTiendas.length;
    document.getElementById('kpiActivas').innerText = allTiendas.filter(t => !isPendienteLiberacion(t) && !t.pausada && !isVencida(t)).length;
    const kpiPend = document.getElementById('kpiPendientes');
    if (kpiPend) kpiPend.innerText = allTiendas.filter(t => isPendienteLiberacion(t)).length;
    document.getElementById('kpiPausadas').innerText = allTiendas.filter(t => t.pausada).length;
    document.getElementById('kpiVencidas').innerText = allTiendas.filter(t => isVencida(t)).length;
    renderTiendas();
}

function renderTiendas() {
    const q = (document.getElementById('searchTiendas')?.value || '').toLowerCase().trim();
    const filtro = document.getElementById('filterEstado')?.value || 'todas';
    let list = [...allTiendas];
    if (q) list = list.filter(t => t.nombre?.toLowerCase().includes(q) || t.id?.toLowerCase().includes(q) || (t.owner_email || '').toLowerCase().includes(q));
    if (filtro === 'activas') list = list.filter(t => !isPendienteLiberacion(t) && !t.pausada && !isVencida(t));
    if (filtro === 'pendientes') list = list.filter(t => isPendienteLiberacion(t));
    if (filtro === 'pausadas') list = list.filter(t => t.pausada);
    if (filtro === 'vencidas') list = list.filter(t => isVencida(t));

    const tbody = document.getElementById('tiendasList');
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-5"><i class="fas fa-store-slash fa-2x mb-2 d-block"></i> No hay tiendas que coincidan</td></tr>'; return; }

    tbody.innerHTML = list.map(t => {
        const modoNotif = t.configuracion?.notificaciones_modo || 'admin';
        const notifBadge = modoNotif === 'ambos' ? '<span class="badge bg-success" style="font-size:0.55rem;">🔔📱</span>'
            : modoNotif === 'whatsapp' ? '<span class="badge bg-success" style="font-size:0.55rem;">📱</span>'
            : '<span class="badge bg-secondary" style="font-size:0.55rem;">🔔</span>';
        const pausadaPor = t.pausada_por || (t.configuracion && t.configuracion._pausada_por) || 'dueño';
        const pausadaInfo = t.pausada ? `<div style="font-size:0.72rem;color:#B45309;margin-top:2px;"><i class="fas fa-pause-circle"></i> Pausada por <strong>${pausadaPor === 'admin' ? 'admin' : 'dueño'}</strong></div>` : '';
        const pendienteInfo = isPendienteLiberacion(t) ? `<div style="font-size:0.72rem;color:#1E40AF;margin-top:2px;"><i class="fas fa-hourglass-half"></i> <strong>Pendiente liberación</strong> · Creada por cliente</div>` : '';
        const rowClass = isPendienteLiberacion(t) ? 'row-pendiente' : '';
        
        return `
        <tr class="${rowClass}">
            <td data-label="Tienda">
                <div class="d-flex align-items-center gap-2">
                    <span class="store-icon">${t.icono || '🛒'}</span>
                    <div>
                        <div class="fw-bold">${t.nombre} ${t.configuracion?.tipo === 'reserva' ? '<span class="badge bg-warning text-dark ms-1" style="font-size:0.6rem;">RESERVA</span>' : ''}</div>
                        <small class="text-muted">${t.id}</small>
                        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px;">
                            ${t.configuracion?.whatsapp_por_producto ? '<span class="badge bg-info text-dark" style="font-size:0.55rem;">📞 Multi</span>' : ''}
                            ${notifBadge}
                        </div>
                        ${pausadaInfo}
                        ${pendienteInfo}
                    </div>
                </div>
            </td>
            <td data-label="Dueño / Cuenta">${t.es_mia ? '<span class="badge-mia"><i class="fas fa-crown"></i> Mía</span>' : (t.owner_email ? `<span class="small">${t.owner_email}</span>` : '<span class="text-muted small">Sin cuenta</span>')}</td>
            <td data-label="Plan"><span class="plan-name-pill ${t.plan || 'prueba'}"><i class="fas fa-crown"></i> ${planNombreDisplay(t.plan)}</span></td>
            <td data-label="Vence"><div class="small">${formatDate(t.fecha_vencimiento)}</div>${vencimientoBadge(t.fecha_vencimiento)}</td>
            <td data-label="Productos" class="text-center"><span class="fw-bold">${t.productos_count || 0}</span></td>
            <td data-label="Estado">${estadoBadgeTienda(t)}</td>
            <td data-label="Acciones" class="text-end">
                <div class="dropdown">
                    <button class="btn-icon dropdown-toggle" type="button" data-bs-toggle="dropdown" data-bs-strategy="fixed" data-bs-boundary="viewport" aria-expanded="false" title="Acciones">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end admin-dropdown">
                        <li><h6 class="dropdown-header">Editar</h6></li>
                        <li><a class="dropdown-item" onclick="abrirEditarTienda('${t.id}')"><i class="fas fa-pen"></i> Editar tienda</a></li>
                        <li><a class="dropdown-item" onclick="abrirCambiarPlanModal('${t.id}', '${t.nombre.replace(/'/g, "\\'")}', '${t.plan || 'prueba'}')"><i class="fas fa-crown"></i> Ajustar plan de pago</a></li>
                        <li><hr class="dropdown-divider"></li>
                        ${isPendienteLiberacion(t) ? `
                        <li><h6 class="dropdown-header" style="color:#1E40AF;">🚨 Liberación</h6></li>
                        <li><a class="dropdown-item" style="color:#1E40AF;font-weight:700;" onclick="liberarTienda('${t.id}', '${t.nombre.replace(/'/g, "\\'")}')"><i class="fas fa-unlock-alt"></i> ✅ Liberar tienda</a></li>
                        <li><a class="dropdown-item text-danger" onclick="eliminarTienda('${t.id}', '${t.nombre.replace(/'/g, "\\'")}')"><i class="fas fa-ban"></i> Rechazar / Eliminar</a></li>
                        <li><hr class="dropdown-divider"></li>
                        ` : ''}
                        <li><h6 class="dropdown-header">Gestión</h6></li>
                        <li><a class="dropdown-item" onclick="${t.pausada ? `togglePausar('${t.id}', false)` : `abrirPausaModal('${t.id}', '${t.nombre.replace(/'/g, "\\'")}')`}"><i class="fas fa-${t.pausada ? 'play' : 'pause'}"></i> ${t.pausada ? 'Reactivar' : 'Pausar con mensaje'}</a></li>
                        <li><a class="dropdown-item" onclick="abrirTiempoModal('${t.id}')"><i class="fas fa-clock"></i> Ajustar tiempo de uso</a></li>
                        <li><a class="dropdown-item" onclick="abrirUrlsModal('${t.id}')"><i class="fas fa-link"></i> Copiar URLs de acceso</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><h6 class="dropdown-header">Productos</h6></li>
                        <li><a class="dropdown-item" onclick="abrirProductoModal('${t.id}')"><i class="fas fa-plus-circle"></i> Añadir producto</a></li>
                        <li><a class="dropdown-item" onclick="verProductos('${t.id}')"><i class="fas fa-box"></i> Ver productos (${t.productos_count || 0})</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item text-danger" onclick="eliminarTienda('${t.id}', '${t.nombre.replace(/'/g, "\\'")}')"><i class="fas fa-trash"></i> Eliminar tienda</a></li>
                    </ul>
                </div>
            </td>
        </tr>
        `;
    }).join('');
}


// ============================================================
// 🆕 MENSAJES DE TIENDAS → SUPER ADMIN (MODO CHAT)
// ============================================================
let chatTiendaActual = null;
let mensajesDeTiendaActual = [];

async function loadMensajesAdmin() {
    const tbody = document.getElementById('mensajesAdminList');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><i class="fas fa-spinner fa-spin text-primary"></i></td></tr>';

    try {
        const res = await api('/api/superadmin/mensajes');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const msgs = await res.json();

        if (!Array.isArray(msgs) || msgs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Sin mensajes</td></tr>';
            return;
        }

        // 🧠 AGRUPAR POR TIENDA
        const chats = {};
        msgs.forEach(m => {
            const tId = m.tienda_id || 'desconocida';
            if (!chats[tId]) {
                chats[tId] = {
                    tienda_id: tId,
                    tienda_nombre: m.tienda || m.tienda_nombre || tId,
                    email: m.email || '—',
                    mensajes: [],
                    no_leidos: 0,
                    ultima_fecha: m.fecha || m.created_at
                };
            }
            chats[tId].mensajes.push(m);
            if (m.remitente === 'tienda' && !m.leido) chats[tId].no_leidos++;
            const f = m.fecha || m.created_at;
            if (new Date(f) > new Date(chats[tId].ultima_fecha)) chats[tId].ultima_fecha = f;
        });

        const chatsArray = Object.values(chats).sort((a, b) => new Date(b.ultima_fecha) - new Date(a.ultima_fecha));

        tbody.innerHTML = chatsArray.map(c => {
            const tieneNoLeidos = c.no_leidos > 0;
            const ultimoMsg = c.mensajes[c.mensajes.length - 1];
            const preview = ultimoMsg.mensaje.substring(0, 40) + (ultimoMsg.mensaje.length > 40 ? '...' : '');
            const fechaStr = new Date(c.ultima_fecha).toLocaleString('es-ES');

            return `
                <tr class="${tieneNoLeidos ? 'fw-bold' : ''}" style="cursor:pointer;" onclick="abrirChatAdmin('${c.tienda_id}')">
                    <td data-label="Fecha">${fechaStr}</td>
                    <td data-label="Tienda">
                        <div class="d-flex align-items-center gap-2">
                            <i class="fas fa-store text-primary"></i>
                            <span>${escapeHtml(c.tienda_nombre)}</span>
                            ${tieneNoLeidos ? `<span class="badge bg-danger rounded-pill">${c.no_leidos}</span>` : ''}
                        </div>
                    </td>
                    <td data-label="Email">${escapeHtml(c.email)}</td>
                    <td data-label="Último Mensaje">
                        <div class="text-muted small">${escapeHtml(preview)}</div>
                    </td>
                    <td data-label="Acciones" class="text-end">
                        <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); abrirChatAdmin('${c.tienda_id}')">
                            <i class="fas fa-comments"></i> Abrir Chat
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (e) {
        console.error('[loadMensajesAdmin]', e);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-4">Error al cargar mensajes</td></tr>';
    }
}

// 🆕 ABRIR EL CHAT DE UNA TIENDA
async function abrirChatAdmin(tiendaId) {
    chatTiendaActual = tiendaId;
    const modalEl = document.getElementById('chatAdminModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    
    document.getElementById('chatAdminTiendaNombre').innerText = 'Cargando...';
    document.getElementById('chatAdminHistorial').innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i></div>';
    
    modal.show();

    try {
        const res = await api('/api/superadmin/mensajes');
        const todos = await res.json();
        mensajesDeTiendaActual = todos.filter(m => m.tienda_id === tiendaId).reverse();

        document.getElementById('chatAdminTiendaNombre').innerText = mensajesDeTiendaActual[0]?.tienda || tiendaId;
        
        renderChatAdmin();

        await api(`/api/superadmin/mensajes/${tiendaId}/leer-todo`, { method: 'PUT' });
        loadMensajesAdmin();

    } catch (e) {
        document.getElementById('chatAdminHistorial').innerHTML = '<p class="text-danger text-center">Error al cargar chat</p>';
    }
}

function renderChatAdmin() {
    const cont = document.getElementById('chatAdminHistorial');
    if (!mensajesDeTiendaActual.length) {
        cont.innerHTML = '<p class="text-muted text-center">No hay mensajes.</p>';
        return;
    }

    cont.innerHTML = mensajesDeTiendaActual.map(m => {
        const esAdmin = m.remitente === 'admin';
        const fecha = new Date(m.fecha || m.created_at).toLocaleString('es-ES');
        return `
            <div class="d-flex flex-column mb-3 ${esAdmin ? 'align-items-end' : 'align-items-start'}">
                <small class="text-muted mb-1">${esAdmin ? 'Tú (Admin)' : 'La Tienda'} - ${fecha}</small>
                <div class="p-3 rounded-3" style="max-width: 85%; background: ${esAdmin ? '#4F46E5' : '#F3F4F6'}; color: ${esAdmin ? 'white' : 'black'};">
                    ${escapeHtml(m.mensaje)}
                </div>
            </div>
        `;
    }).join('');

    cont.scrollTop = cont.scrollHeight;
}

async function enviarRespuestaAdmin() {
    const input = document.getElementById('chatAdminInput');
    const btn = document.getElementById('btnEnviarChatAdmin');
    const texto = input.value.trim();
    
    if (!texto || !chatTiendaActual) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const res = await api(`/api/superadmin/mensajes/${chatTiendaActual}/responder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mensaje: texto })
        });
        
        if (res.ok) {
            input.value = '';
            await abrirChatAdmin(chatTiendaActual);
        } else {
            showToast('Error al enviar respuesta', 'error');
        }
    } catch {
        showToast('Error de conexión', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
    }
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ============================================================
// CREAR Y EDITAR TIENDAS
// ============================================================
function setOwnerType(tipo) {
    const isAdmin = tipo === 'admin';
    document.getElementById('ownerTypeAdmin').checked = isAdmin;
    document.getElementById('ownerTypeCliente').checked = !isAdmin;
    document.getElementById('ownerOptionAdmin').classList.toggle('selected', isAdmin);
    document.getElementById('ownerOptionCliente').classList.toggle('selected', !isAdmin);
    document.getElementById('ownerEmailSection').style.display = isAdmin ? 'none' : 'block';
    document.getElementById('permanenteAdminSection').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('planSelectContainer').style.display = isAdmin ? 'none' : 'block';
    document.getElementById('planAdminInfo').style.display = isAdmin ? 'block' : 'none';
    if (isAdmin) document.getElementById('newEmail').value = '';
}

function getOwnerType() {
    return document.getElementById('ownerTypeCliente').checked ? 'cliente' : 'admin';
}

function abrirCrearTienda() {
    document.getElementById('newEmail').value = '';
    document.getElementById('newPermanente').checked = true;
    document.getElementById('newPermanenteAdmin').checked = true;
    document.getElementById('newNombre').value = '';
    document.getElementById('newIcono').value = '🛒';
    document.getElementById('newDescripcion').value = '';
    document.getElementById('newCategorias').value = '';
    document.getElementById('newTipo').value = 'tienda';
    document.getElementById('newTelefono').value = '';
    document.getElementById('newEmailContacto').value = '';
    document.getElementById('newUbicacion').value = '';
    document.getElementById('newApertura').value = '09:00';
    document.getElementById('newCierre').value = '18:00';
    document.getElementById('newTasaUSD').value = '25';
    document.getElementById('newTasaEUR').value = '27';
    document.getElementById('newTarjeta').value = '';
    document.getElementById('newWhatsApp').value = '';
    document.getElementById('newPlan').value = 'pro';
    document.getElementById('newNotifModo').value = 'admin';
    document.getElementById('newMultiContacto').checked = false;
    setOwnerType('admin');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('crearTiendaModal')).show();
}

async function crearTienda() {
    const ownerType = getOwnerType();
    let email = document.getElementById('newEmail').value.trim();
    const nombre = document.getElementById('newNombre').value.trim();

    if (ownerType === 'cliente' && !email) {
        showToast('❌ Email del dueño obligatorio para tiendas de cliente', 'error');
        return;
    }
    if (!nombre) {
        showToast('❌ El nombre del negocio es obligatorio', 'error');
        return;
    }

    const permanente = ownerType === 'admin'
        ? document.getElementById('newPermanenteAdmin').checked
        : document.getElementById('newPermanente').checked;

    const payload = {
        nombre,
        nombre_negocio: nombre,
        icono: document.getElementById('newIcono').value.trim() || '🛒',
        descripcion: document.getElementById('newDescripcion').value.trim(),
        categorias: document.getElementById('newCategorias').value.split(',').map(c => c.trim()).filter(Boolean),
        tipo: document.getElementById('newTipo').value,
        telefono: document.getElementById('newTelefono').value.trim(),
        email_contacto: document.getElementById('newEmailContacto').value.trim(),
        ubicacion: document.getElementById('newUbicacion').value.trim(),
        apertura: document.getElementById('newApertura').value || '09:00',
        cierre: document.getElementById('newCierre').value || '18:00',
        tasaUSD: parseFloat(document.getElementById('newTasaUSD').value) || 25,
        tasaEUR: parseFloat(document.getElementById('newTasaEUR').value) || 27,
        tarjeta: document.getElementById('newTarjeta').value.trim(),
        whatsapp: document.getElementById('newWhatsApp').value.trim(),
        plan: ownerType === 'admin' ? 'premium' : document.getElementById('newPlan').value,
        permanente,
        notificaciones_modo: document.getElementById('newNotifModo').value
    };

    if (ownerType === 'admin') {
        payload.es_mia = true;
    } else {
        payload.es_mia = false;
        payload.email = email;
    }

    const btn = document.getElementById('btnCrearTienda');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';
    btn.disabled = true;

    try {
        const res = await api('/api/superadmin/crear-tienda', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        if (data.success) {
            if (document.getElementById('newMultiContacto').checked) {
                await api(`/api/superadmin/tiendas/${data.slug}/contexto`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tipo: payload.tipo, whatsapp_por_producto: true, notificaciones_modo: payload.notificaciones_modo })
                });
            }
            bootstrap.Modal.getInstance(document.getElementById('crearTiendaModal')).hide();
            showToast(ownerType === 'admin' ? '👑 ¡Tu tienda de Admin fue creada con privilegios Premium!' : '✅ Tienda del cliente creada correctamente');
            await loadTiendas();
        } else {
            showToast('❌ ' + (data.error || 'Error al crear la tienda'), 'error');
        }
    } catch (e) {
        showToast('❌ Error de conexión: ' + e.message, 'error');
    } finally {
        btn.innerHTML = orig;
        btn.disabled = false;
    }
}

async function abrirEditarTienda(slug) {
    try {
        const res = await api(`/api/mi-tienda?slug=${slug}`);
        const data = await res.json();
        if (!data.success) { showToast('❌ Tienda no encontrada', 'error'); return; }
        const s = data.store;
        const cfg = s.configuracion || {};
        
        document.getElementById('editSlug').value = s.id;
        document.getElementById('editNombre').value = s.nombre || '';
        document.getElementById('editIcono').value = s.icono || '🛒';
        document.getElementById('editDescripcion').value = s.descripcion || '';
        document.getElementById('editCategorias').value = (s.categorias || []).join(', ');
        document.getElementById('editTelefono').value = cfg.contacto?.telefono || '';
        document.getElementById('editEmail').value = cfg.contacto?.email || '';
        document.getElementById('editUbicacion').value = cfg.contacto?.ubicacion || '';
        document.getElementById('editApertura').value = cfg.horario?.apertura || '09:00';
        document.getElementById('editCierre').value = cfg.horario?.cierre || '18:00';
        document.getElementById('editIntervalo').value = cfg.horario?.intervalo || 60;
        document.getElementById('editTasaUSD').value = cfg.tasas?.USD ? (1 / cfg.tasas.USD).toFixed(2) : '25';
        document.getElementById('editTasaEUR').value = cfg.tasas?.EUR ? (1 / cfg.tasas.EUR).toFixed(2) : '27';
        document.getElementById('editTarjeta').value = cfg.datos_bancarios?.numero_tarjeta || '';
        document.getElementById('editWhatsApp').value = cfg.datos_bancarios?.whatsapp_confirmacion || '';
        document.getElementById('editQrTarjeta').value = cfg.datos_bancarios?.qr_tarjeta || '';
        
        document.getElementById('editTipo').value = cfg.tipo || 'tienda';
        document.getElementById('editWhatsappPorProducto').checked = cfg.whatsapp_por_producto === true;
        document.getElementById('editNotifModo').value = cfg.notificaciones_modo || 'admin';
        const allowMulti = document.getElementById('editAllowMultiStore');
        if (allowMulti) allowMulti.checked = cfg._allow_multi_store === true;

        const dias = Array.isArray(cfg.horario?.dias) ? cfg.horario.dias : [1,2,3,4,5,6];
        document.querySelectorAll('#editarTiendaModal .dia-checkbox').forEach(cb => {
            cb.checked = dias.includes(parseInt(cb.value));
        });

        bootstrap.Modal.getOrCreateInstance(document.getElementById('editarTiendaModal')).show();
    } catch { showToast('❌ Error cargando tienda', 'error'); }
}

async function guardarEdicionTienda() {
    const slug = document.getElementById('editSlug').value;
    const nombre = document.getElementById('editNombre').value.trim();
    if (!nombre) { showToast('❌ El nombre es obligatorio', 'error'); return; }
    
    const btn = document.getElementById('btnGuardarTienda');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    btn.disabled = true;

    const usd = parseFloat(document.getElementById('editTasaUSD').value) || 25;
    const eur = parseFloat(document.getElementById('editTasaEUR').value) || 27;
    const dias = [];
    document.querySelectorAll('#editarTiendaModal .dia-checkbox:checked').forEach(cb => {
        const v = parseInt(cb.value); if (!isNaN(v)) dias.push(v);
    });

    const payload = {
        nombre,
        icono: document.getElementById('editIcono').value.trim() || '🛒',
        descripcion: document.getElementById('editDescripcion').value.trim(),
        categorias: document.getElementById('editCategorias').value.split(',').map(c => c.trim()).filter(Boolean),
        configuracion: {
            tipo: document.getElementById('editTipo').value,
            whatsapp_por_producto: document.getElementById('editWhatsappPorProducto').checked,
            notificaciones_modo: document.getElementById('editNotifModo').value,
            contacto: {
                telefono: document.getElementById('editTelefono').value.trim(),
                email: document.getElementById('editEmail').value.trim(),
                ubicacion: document.getElementById('editUbicacion').value.trim()
            },
            horario: {
                apertura: document.getElementById('editApertura').value || '09:00',
                cierre: document.getElementById('editCierre').value || '18:00',
                dias: dias.length ? dias : [1,2,3,4,5,6],
                intervalo: parseInt(document.getElementById('editIntervalo').value) || 60
            },
            tasas: { CUP: 1, USD: 1 / usd, EUR: 1 / eur },
            datos_bancarios: {
                numero_tarjeta: document.getElementById('editTarjeta').value.trim(),
                whatsapp_confirmacion: document.getElementById('editWhatsApp').value.trim(),
                qr_tarjeta: document.getElementById('editQrTarjeta').value.trim()
            },
            _allow_multi_store: document.getElementById('editAllowMultiStore')?.checked === true
        }
    };

    const tipo = document.getElementById('editTipo').value;
    const whatsappProd = document.getElementById('editWhatsappPorProducto').checked;
    const notifModo = document.getElementById('editNotifModo').value;

    try {
        const res = await api(`/api/admin/tiendas/${slug}`, { 
            method: 'PUT', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        
        if (res.ok) {
            await api(`/api/superadmin/tiendas/${slug}/contexto`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipo, whatsapp_por_producto: whatsappProd, notificaciones_modo: notifModo })
            });

            bootstrap.Modal.getInstance(document.getElementById('editarTiendaModal')).hide();
            showToast('✅ Tienda actualizada');
            await loadTiendas();
        } else {
            const err = await res.json().catch(() => ({}));
            showToast('❌ ' + (err.error || 'Error al guardar'), 'error');
        }
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
    finally { btn.innerHTML = orig; btn.disabled = false; }
}

// ============================================================
// ACCIONES DE TIENDAS (PAUSAR, LIBERAR, ELIMINAR, TIEMPO)
// ============================================================
async function togglePausar(slug, pausar) {
    try {
        const res = await api(`/api/superadmin/pausar/${slug}`, { method: 'POST', body: JSON.stringify({ pausar }) });
        const data = await res.json();
        if (data.success) { showToast(pausar ? '⏸️ Tienda pausada' : '▶️ Tienda reactivada'); await loadTiendas(); }
        else { showToast('❌ ' + (data.error || 'Error'), 'error'); }
    } catch { showToast('❌ Error de conexión', 'error'); }
}

async function liberarTienda(slug, nombre) {
    if (!confirm(`¿Liberar la tienda "${nombre}"?\n\nEsto la hará VISIBLE PÚBLICAMENTE en el index.\nAsegúrate de haber verificado que el pago fue exitoso antes de liberarla.`)) return;
    if (!confirm('⚠️ Última confirmación: ¿Estás completamente seguro de liberar esta tienda ahora?')) return;
    try {
        const res = await api(`/api/admin/liberar-tienda/${slug}`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast(`✅ Tienda "${nombre}" liberada y visible públicamente`);
            await loadTiendas();
        } else {
            showToast('❌ ' + (data.error || 'Error al liberar'), 'error');
        }
    } catch { showToast('❌ Error de conexión', 'error'); }
}

async function eliminarTienda(slug, nombre) {
    if (!confirm(`¿Eliminar la tienda "${nombre}"?\n\nEsta acción borrará TODOS sus productos, pedidos y configuraciones. No se puede deshacer.`)) return;
    try {
        const res = await api(`/api/superadmin/tiendas/${slug}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast(`🗑️ Tienda "${nombre}" eliminada`);
            await loadTiendas();
        } else {
            showToast('❌ ' + (data.error || 'Error al eliminar'), 'error');
        }
    } catch { showToast('❌ Error de conexión', 'error'); }
}