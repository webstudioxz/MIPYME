// ============================================================
// CONFIGURACIÓN Y SESIÓN
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
            if (document.getElementById('view-dashboard').style.display !== 'none') loadDashboard();
        } else {
            showToast('❌ ' + (data.error || 'Error al liberar la tienda'), 'error');
        }
    } catch (e) { showToast('❌ Error de conexión: ' + e.message, 'error'); }
}

function abrirPausaModal(slug, nombre) {
    document.getElementById('pausaSlug').value = slug;
    document.getElementById('pausaNombre').innerText = nombre;
    document.getElementById('pausaMensajeSelect').value = 'Volvemos mañana';
    document.getElementById('pausaMensajeCustom').style.display = 'none';
    document.getElementById('pausaMensajeCustom').value = '';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('pausaTiendaModal')).show();
}

function onChangePausaMensaje(sel) {
    const custom = document.getElementById('pausaMensajeCustom');
    if (sel.value === '__custom__') { custom.style.display = 'block'; custom.focus(); }
    else { custom.style.display = 'none'; custom.value = ''; }
}

async function confirmarPausa() {
    const slug = document.getElementById('pausaSlug').value;
    const sel = document.getElementById('pausaMensajeSelect');
    const custom = document.getElementById('pausaMensajeCustom');
    let mensaje = sel.value;
    if (mensaje === '__custom__') {
        mensaje = (custom.value || '').trim();
        if (!mensaje) { showToast('⚠️ Escribe un mensaje', 'error'); return; }
    }
    try {
        const res = await api(`/api/superadmin/pausar/${slug}`, { method: 'POST', body: JSON.stringify({ pausar: true, mensaje }) });
        const data = await res.json();
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('pausaTiendaModal')).hide();
            showToast('⏸️ Tienda pausada');
            await loadTiendas();
        } else { showToast('❌ ' + (data.error || 'Error'), 'error'); }
    } catch { showToast('❌ Error de conexión', 'error'); }
}

function abrirTiempoModal(slug) {
    document.getElementById('tiempoSlug').value = slug;
    const t = allTiendas.find(x => x.id === slug);
    document.getElementById('tiempoFechaActual').innerText = t ? formatDate(t.fecha_vencimiento) : '—';
    document.getElementById('tiempoDias').value = 30;
    document.getElementById('tiempoHoras').value = 0;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('tiempoModal')).show();
}

async function guardarTiempo() {
    const slug = document.getElementById('tiempoSlug').value;
    const dias = parseInt(document.getElementById('tiempoDias').value) || 0;
    const horas = parseInt(document.getElementById('tiempoHoras').value) || 0;
    if (dias === 0 && horas === 0) { showToast('⚠️ Ingresa días u horas', 'warning'); return; }
    try {
        const res = await api(`/api/superadmin/tiendas/${slug}/tiempo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dias, horas }) });
        const data = await res.json();
        if (data.success) { bootstrap.Modal.getInstance(document.getElementById('tiempoModal')).hide(); showToast('✅ Tiempo añadido'); await loadTiendas(); }
        else { showToast('❌ ' + (data.error || 'Error'), 'error'); }
    } catch { showToast('❌ Error de conexión', 'error'); }
}

async function eliminarTienda(slug, nombre) {
    if (!confirm(`¿Eliminar la tienda "${nombre}"?\n\nEsta acción NO se puede deshacer. Se borrarán todos los productos y pedidos asociados.`)) return;
    if (!confirm('⚠️ ¿Estás completamente seguro?')) return;
    try {
        const res = await api(`/api/superadmin/tiendas/${slug}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) { showToast('🗑️ Tienda eliminada'); await loadTiendas(); }
        else { showToast('❌ ' + (data.error || 'Error'), 'error'); }
    } catch { showToast('❌ Error de conexión', 'error'); }
}

// ============================================================
// CAMBIAR PLAN
// ============================================================
function abrirCambiarPlanModal(slug, nombre, planActual) {
    document.getElementById('cambiarPlanSlug').value = slug;
    document.getElementById('cambiarPlanTiendaNombre').innerText = nombre;
    const planTexto = { prueba: 'Gratis', basico: 'Básico', pro: 'Pro', premium: 'Premium' };
    document.getElementById('cambiarPlanActual').innerText = planTexto[planActual] || planActual || 'Gratis';
    document.getElementById('cambiarPlanSeleccionado').value = planActual || 'prueba';

    const planes = [
        { id: 'prueba',  nombre: 'Gratis',   max: 5,  precio: 'Gratis',      desc: 'Válido gratis por 1 mes · 5 productos', features: ['Notificación nuevo pedido','Agregar/Editar productos','Formas de pago','Precio de monedas','Envío al proveedor','Promoción y publicidad','URL Admin y Tienda'] },
        { id: 'basico',  nombre: 'Básico',   max: 5,  precio: '1000 CUP/mes', desc: 'Pago 1000 pesos al mes · 5 productos', features: ['Notificación nuevo pedido','Agregar/Editar productos','Formas de pago','Precio de monedas','URL Admin y Tienda'] },
        { id: 'pro',     nombre: 'Pro',      max: 10, precio: '2500 CUP/mes', desc: 'Pago 2500 pesos al mes · 10 productos · Incluye gráficas', features: ['Notificación nuevo pedido','Agregar/Editar productos','Formas de pago','Precio de monedas','Envío al proveedor','Promoción y publicidad','URL Admin y Tienda','Gráficas: más visitados','Gráficas: más vendidos'] },
        { id: 'premium', nombre: 'Premium',  max: 50, precio: '5000 CUP/mes', desc: 'Pago 5000 pesos al mes · 50+ productos · Notificación por WhatsApp', features: ['Notificación nuevo pedido','Agregar/Editar productos','Formas de pago','Precio de monedas','Envío al proveedor','Promoción y publicidad','URL Admin y Tienda','Gráficas: más visitados','Gráficas: más vendidos','WhatsApp a clientes compradores'] }
    ];

    const cont = document.getElementById('cambiarPlanOpciones');
    cont.dataset.planActual = planActual || 'prueba';

    cont.innerHTML = planes.map(p => {
        const isCurrent = p.id === planActual;
        const classes = ['plan-option'];
        if (isCurrent) classes.push('is-current', 'selected');
        const featBadges = (p.features || []).map(f => `<span class="badge bg-light text-dark me-1 mb-1" style="font-size:0.6rem;font-weight:600;">${f}</span>`).join('');
        return `
        <div class="${classes.join(' ')}" data-plan="${p.id}" onclick="seleccionarPlan('${p.id}')">
            <div class="plan-radio"></div>
            <div class="plan-info">
                <div class="name">${p.nombre}${isCurrent ? ' <span class="badge bg-secondary ms-1" style="font-size:0.62rem;">Actual</span>' : ''}</div>
                <div class="meta">${p.desc}</div>
                <div style="margin-top:6px;">${featBadges}</div>
            </div>
            <div class="plan-price-tag">${p.precio}</div>
        </div>`;
    }).join('');

    bootstrap.Modal.getOrCreateInstance(document.getElementById('cambiarPlanModal')).show();
}

function seleccionarPlan(planId) {
    document.getElementById('cambiarPlanSeleccionado').value = planId;
    document.querySelectorAll('#cambiarPlanOpciones .plan-option').forEach(el => { el.classList.remove('selected'); });
    const target = document.querySelector(`#cambiarPlanOpciones .plan-option[data-plan="${planId}"]`);
    if (target) target.classList.add('selected');
}

async function guardarCambiarPlan() {
    const slug = document.getElementById('cambiarPlanSlug').value;
    const nuevoPlan = document.getElementById('cambiarPlanSeleccionado').value;
    if (!slug || !nuevoPlan) { showToast('⚠️ Selecciona un plan', 'warning'); return; }
    try {
        const res = await api(`/api/superadmin/tiendas/${slug}/plan`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: nuevoPlan })
        });
        const data = await res.json();
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('cambiarPlanModal')).hide();
            showToast('✅ Plan actualizado a ' + planNombreDisplay(nuevoPlan));
            await loadTiendas();
        } else { showToast('❌ ' + (data.error || 'Error al cambiar plan'), 'error'); }
    } catch { showToast('❌ Error de conexión', 'error'); }
}

// ============================================================
// PRODUCTOS
// ============================================================
function abrirUrlsModal(slug) {
    document.getElementById('urlPublica').value = `${window.location.origin}/${slug}`;
    document.getElementById('urlAdmin').value = `${window.location.origin}/admin-tienda/${slug}?tienda=${slug}`; 
    bootstrap.Modal.getOrCreateInstance(document.getElementById('urlsModal')).show();
}

function copiarCampo(id) {
    const input = document.getElementById(id);
    input.select();
    input.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(input.value).then(() => {
        showToast('📋 Copiado al portapapeles');
    }).catch(() => {
        document.execCommand('copy');
        showToast('📋 Copiado');
    });
}

function abrirProductoModal(slug) {
    document.getElementById('prodTienda').value = slug;
    document.getElementById('prodNombre').value = '';
    document.getElementById('prodCategoria').value = 'otros';
    document.getElementById('prodDescripcion').value = '';
    document.getElementById('prodPrecio').value = '';
    document.getElementById('prodDescuento').value = '0';
    document.getElementById('prodDisponible').checked = true;
    document.getElementById('prodGarantia').value = '';
    document.getElementById('prodTransporte').value = '';
    document.getElementById('prodContactoNombre').value = '';
    document.getElementById('prodWhatsAppProveedor').value = '';
    document.getElementById('prodRequiereCarnet').checked = false;
    document.getElementById('prodImagen').value = '';
    uploadedImageBase64 = null;
    document.getElementById('imagePreview').style.display = 'none';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('productoModal')).show();
}

function setImageMode(mode) {
    currentImageMode = mode;
    document.querySelectorAll('.image-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    document.getElementById('imageModeUrl').style.display = mode === 'url' ? 'block' : 'none';
    document.getElementById('imageModeFile').style.display = mode === 'file' ? 'block' : 'none';
}

function handleImageFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('⚠️ La imagen supera 2MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
        uploadedImageBase64 = e.target.result;
        const preview = document.getElementById('imagePreview');
        preview.innerHTML = `<img src="${e.target.result}"><button class="remove-img" onclick="removeImage()"><i class="fas fa-times"></i></button>`;
        preview.style.display = 'inline-block';
    };
    reader.readAsDataURL(file);
}

function removeImage() {
    uploadedImageBase64 = null;
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('prodImagenFile').value = '';
}

async function guardarProducto() {
    const slug = document.getElementById('prodTienda').value;
    const nombre = document.getElementById('prodNombre').value.trim();
    const precio = parseFloat(document.getElementById('prodPrecio').value) || 0;
    if (!nombre || precio <= 0) { showToast('❌ Nombre y precio son obligatorios', 'error'); return; }

    const payload = {
        nombre,
        categoria: document.getElementById('prodCategoria').value.trim() || 'otros',
        descripcion: document.getElementById('prodDescripcion').value.trim(),
        precio,
        descuento: parseFloat(document.getElementById('prodDescuento').value) || 0,
        disponible: document.getElementById('prodDisponible').checked,
        garantia: document.getElementById('prodGarantia').value,
        transporte: document.getElementById('prodTransporte').value,
        contacto_nombre: document.getElementById('prodContactoNombre').value.trim(),
        whatsapp_proveedor: document.getElementById('prodWhatsAppProveedor').value.trim(),
        requiere_carnet: document.getElementById('prodRequiereCarnet').checked,
        imagen: currentImageMode === 'file' ? uploadedImageBase64 : document.getElementById('prodImagen').value.trim()
    };

    try {
        const res = await api(`/api/superadmin/tiendas/${slug}/productos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('productoModal')).hide();
            showToast('✅ Producto añadido');
            await loadTiendas();
        } else { showToast('❌ ' + (data.error || 'Error al guardar'), 'error'); }
    } catch { showToast('❌ Error de conexión', 'error'); }
}

async function verProductos(slug) {
    const body = document.getElementById('productosListBody');
    body.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin fa-2x text-primary"></i></div>';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('productosListModal')).show();
    try {
        const res = await api(`/api/superadmin/tiendas/${slug}/productos`);
        const prods = await res.json();
        if (!prods.length) { body.innerHTML = '<p class="text-center text-muted py-4">Sin productos</p>'; return; }
        body.innerHTML = `
            <div class="table-responsive">
                <table class="table mb-0">
                    <thead><tr><th>Imagen</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Estado</th><th class="text-end">Acción</th></tr></thead>
                    <tbody>
                        ${prods.map(p => `
                            <tr>
                                <td>${p.imagen ? `<img src="${p.imagen}" style="width:40px;height:40px;object-fit:cover;border-radius:8px;">` : '—'}</td>
                                <td class="fw-bold">${p.nombre}</td>
                                <td>${p.categoria || '—'}</td>
                                <td>${p.precio} CUP</td>
                                <td>${p.disponible ? '<span class="badge bg-success">Disponible</span>' : '<span class="badge bg-secondary">No disponible</span>'}</td>
                                <td class="text-end"><button class="btn btn-sm btn-danger" onclick="eliminarProducto('${slug}','${p.id}')"><i class="fas fa-trash"></i></button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch { body.innerHTML = '<p class="text-center text-danger py-4">Error al cargar productos</p>'; }
}

async function eliminarProducto(slug, prodId) {
    if (!confirm('¿Eliminar este producto?')) return;
    try {
        const res = await api(`/api/superadmin/tiendas/${slug}/productos/${prodId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) { showToast('🗑️ Producto eliminado'); verProductos(slug); }
        else { showToast('❌ ' + (data.error || 'Error'), 'error'); }
    } catch { showToast('❌ Error de conexión', 'error'); }
}

// ============================================================
// PEDIDOS GLOBALES
// ============================================================
async function loadPedidosGlobal() {
    const container = document.getElementById('pedidosGlobalList');
    const tiendaId = document.getElementById('filterTiendaPedidos')?.value || '';
    container.innerHTML = '<div class="text-center py-5"><i class="fas fa-spinner fa-spin fa-2x text-primary"></i></div>';
    try {
        const url = tiendaId ? `/api/superadmin/pedidos?tienda=${tiendaId}` : '/api/superadmin/pedidos';
        const res = await api(url);
        const pedidos = await res.json();
        if (!pedidos.length) {
            container.innerHTML = '<div class="card"><div class="card-body text-center py-5 text-muted"><i class="fas fa-receipt fa-3x mb-3 d-block" style="opacity:0.3;"></i>No hay pedidos registrados</div></div>';
            return;
        }
        container.innerHTML = `
            <div class="card card-table p-0">
                <div class="table-responsive">
                    <table class="table mb-0">
                        <thead><tr><th>Fecha</th><th>Tienda</th><th>Cliente</th><th>Producto</th><th>Total</th><th>Estado</th><th class="text-end">Acciones</th></tr></thead>
                        <tbody>
                            ${pedidos.map(p => `
                                <tr>
                                    <td data-label="Fecha">${p.fecha ? new Date(p.fecha).toLocaleString('es-ES') : '—'}</td>
                                    <td data-label="Tienda">${p.tienda_nombre || p.tienda_id || '—'}</td>
                                    <td data-label="Cliente">${p.cliente_nombre || '—'}<br><small class="text-muted">${p.cliente_telefono || ''}</small></td>
                                    <td data-label="Producto">${p.producto_nombre || '—'}</td>
                                    <td data-label="Total"><strong>${p.total || 0} ${p.moneda || 'CUP'}</strong></td>
                                    <td data-label="Estado"><span class="badge bg-info">${p.estado || 'pendiente'}</span></td>
                                    <td data-label="Acciones" class="text-end">
                                        <button class="order-action-btn del" onclick="eliminarPedidoGlobal('${p.id}')"><i class="fas fa-trash"></i></button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch { container.innerHTML = '<div class="alert alert-danger">Error al cargar pedidos</div>'; }
}

function refreshPedidosGlobal() { loadPedidosGlobal(); }

async function eliminarPedidoGlobal(id) {
    if (!confirm('¿Eliminar este pedido?')) return;
    try {
        const res = await api(`/api/superadmin/pedidos/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) { showToast('🗑️ Pedido eliminado'); loadPedidosGlobal(); }
        else { showToast('❌ ' + (data.error || 'Error'), 'error'); }
    } catch { showToast('❌ Error de conexión', 'error'); }
}

// ============================================================
// PLANES
// ============================================================
async function loadPlanes() {
    const container = document.getElementById('planesList');
    container.innerHTML = '<div class="text-center py-5"><i class="fas fa-spinner fa-spin fa-2x text-primary"></i></div>';
    try {
        const res = await api('/api/superadmin/planes');
        allPlanes = await res.json();
        if (!allPlanes.length) { container.innerHTML = '<p class="text-muted">Sin planes</p>'; return; }
        container.innerHTML = allPlanes.map(p => `
            <div class="plan-card-mini ${p.activo === false ? 'inactivo' : ''} mb-2">
                <div>
                    <div class="plan-name">${p.nombre} ${p.activo === false ? '<span class="badge bg-secondary ms-1">Inactivo</span>' : ''}</div>
                    <div class="plan-meta">ID: ${p.id} · Max ${p.max_productos} productos · ${p.duracion_dias} días</div>
                </div>
                <div class="d-flex align-items-center gap-3">
                    <div class="plan-price">$${p.precio}</div>
                    <button class="btn btn-sm btn-outline-primary" onclick="editarPlan('${p.id}')"><i class="fas fa-pen"></i></button>
                </div>
            </div>
        `).join('');
    } catch { container.innerHTML = '<p class="text-danger">Error al cargar planes</p>'; }
}

function abrirNuevoPlan() {
    document.getElementById('planModalTitle').innerText = 'Nuevo Plan';
    document.getElementById('planId').value = '';
    document.getElementById('planId').disabled = false;
    document.getElementById('planNombre').value = '';
    document.getElementById('planPrecio').value = '';
    document.getElementById('planMaxProd').value = '';
    document.getElementById('planDuracion').value = '';
    document.getElementById('planCaract').value = '';
    document.getElementById('planActivo').checked = true;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('planModal')).show();
}

function editarPlan(id) {
    const p = allPlanes.find(x => x.id === id);
    if (!p) return;
    document.getElementById('planModalTitle').innerText = 'Editar Plan';
    document.getElementById('planId').value = p.id;
    document.getElementById('planId').disabled = true;
    document.getElementById('planNombre').value = p.nombre || '';
    document.getElementById('planPrecio').value = p.precio || '';
    document.getElementById('planMaxProd').value = p.max_productos || '';
    document.getElementById('planDuracion').value = p.duracion_dias || '';
    document.getElementById('planCaract').value = (p.caracteristicas || []).join(', ');
    document.getElementById('planActivo').checked = p.activo !== false;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('planModal')).show();
}

async function guardarPlan() {
    const id = document.getElementById('planId').value.trim();
    const payload = {
        id,
        nombre: document.getElementById('planNombre').value.trim(),
        precio: parseFloat(document.getElementById('planPrecio').value) || 0,
        max_productos: parseInt(document.getElementById('planMaxProd').value) || 5,
        duracion_dias: parseInt(document.getElementById('planDuracion').value) || 30,
        caracteristicas: document.getElementById('planCaract').value.split(',').map(c => c.trim()).filter(Boolean),
        activo: document.getElementById('planActivo').checked
    };
    if (!id || !payload.nombre) { showToast('❌ ID y nombre obligatorios', 'error'); return; }
    try {
        const res = await api('/api/superadmin/planes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) { bootstrap.Modal.getInstance(document.getElementById('planModal')).hide(); showToast('✅ Plan guardado'); loadPlanes(); }
        else { showToast('❌ ' + (data.error || 'Error'), 'error'); }
    } catch { showToast('❌ Error de conexión', 'error'); }
}

// ============================================================
// PRIVACIDAD
// ============================================================
async function loadPrivacidad() {
    try {
        const res = await api('/api/superadmin/privacidad');
        const data = await res.json();
        document.getElementById('privacyTitle').value = data.titulo || '';
        document.getElementById('privacyContent').value = data.contenido || '';
        document.getElementById('privacyUpdated').innerText = data.actualizado ? new Date(data.actualizado).toLocaleString('es-ES') : '—';
    } catch {}
}

async function guardarPrivacidad() {
    const payload = { titulo: document.getElementById('privacyTitle').value.trim(), contenido: document.getElementById('privacyContent').value.trim() };
    try {
        const res = await api('/api/superadmin/privacidad', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) { showToast('✅ Privacidad guardada'); loadPrivacidad(); }
        else { showToast('❌ ' + (data.error || 'Error'), 'error'); }
    } catch { showToast('❌ Error de conexión', 'error'); }
}

// ============================================================
// PAGOS
// ============================================================
async function loadPagos() {
    const tbody = document.getElementById('pagosList');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4"><i class="fas fa-spinner fa-spin text-primary"></i></td></tr>';
    try {
        const res = await api('/api/superadmin/pagos-pendientes');
        const pagos = await res.json();
        if (!pagos.length) { tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No hay pagos pendientes</td></tr>'; return; }
        tbody.innerHTML = pagos.map(p => `
            <tr>
                <td data-label="Ticket">${p.id_ticket || '—'}</td>
                <td data-label="Cliente">${p.cliente_nombre || '—'}<br><small class="text-muted">${p.cliente_email || ''}</small></td>
                <td data-label="Teléfono">${p.telefono || '—'}</td>
                <td data-label="Plan"><span class="badge bg-info">${p.plan || '—'}</span></td>
                <td data-label="Meses">${p.meses || 1}</td>
                <td data-label="Total"><strong>${p.total || 0} CUP</strong></td>
                <td data-label="Estado"><span class="badge bg-warning">${p.estado || 'pendiente'}</span></td>
                <td data-label="Acciones" class="text-end">
                    <button class="btn btn-sm btn-success me-1" onclick="aprobarPago('${p.id}')"><i class="fas fa-check"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="rechazarPago('${p.id}')"><i class="fas fa-times"></i></button>
                </td>
            </tr>
        `).join('');
    } catch { tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger py-4">Error</td></tr>'; }
}

async function aprobarPago(id) {
    if (!confirm('¿Aprobar este pago?')) return;
    try {
        const res = await api(`/api/superadmin/pagos/${id}/aprobar`, { method: 'POST' });
        const data = await res.json();
        if (data.success) { showToast('✅ Pago aprobado'); loadPagos(); }
        else { showToast('❌ ' + (data.error || 'Error'), 'error'); }
    } catch { showToast('❌ Error de conexión', 'error'); }
}

async function rechazarPago(id) {
    if (!confirm('¿Rechazar este pago?')) return;
    try {
        const res = await api(`/api/superadmin/pagos/${id}/rechazar`, { method: 'POST' });
        const data = await res.json();
        if (data.success) { showToast('🗑️ Pago rechazado'); loadPagos(); }
        else { showToast('❌ ' + (data.error || 'Error'), 'error'); }
    } catch { showToast('❌ Error de conexión', 'error'); }
}

// ============================================================
// SOLICITUDES
// ============================================================
async function loadSolicitudes() {
    const tbody = document.getElementById('solicitudesList');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><i class="fas fa-spinner fa-spin text-primary"></i></td></tr>';
    try {
        const res = await api('/api/superadmin/solicitudes');
        const sols = await res.json();
        if (!sols.length) { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No hay solicitudes</td></tr>'; return; }
        tbody.innerHTML = sols.map(s => `
            <tr>
                <td data-label="Fecha">${s.fecha ? new Date(s.fecha).toLocaleDateString('es-ES') : '—'}</td>
                <td data-label="Tipo"><span class="badge bg-info">${s.tipo || '—'}</span></td>
                <td data-label="Cliente">${s.cliente || '—'}</td>
                <td data-label="Detalle">${s.detalle || '—'}</td>
                <td data-label="Estado"><span class="badge bg-warning">${s.estado || 'pendiente'}</span></td>
                <td data-label="Acciones" class="text-end">
                    <button class="btn btn-sm btn-success me-1" onclick="resolverSolicitud('${s.id}', true)"><i class="fas fa-check"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="resolverSolicitud('${s.id}', false)"><i class="fas fa-times"></i></button>
                </td>
            </tr>
        `).join('');
    } catch { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-4">Error</td></tr>'; }
}

async function resolverSolicitud(id, aprobar) {
    try {
        const res = await api(`/api/superadmin/solicitudes/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aprobar })
        });
        const data = await res.json();
        if (data.success) { showToast(aprobar ? '✅ Solicitud aprobada' : '🗑️ Solicitud rechazada'); loadSolicitudes(); }
        else { showToast('❌ ' + (data.error || 'Error'), 'error'); }
    } catch { showToast('❌ Error de conexión', 'error'); }
}

// ============================================================
// SEGURIDAD
// ============================================================
async function loadSeguridad() {
    try {
        const [bansRes, logRes, dispRes] = await Promise.all([
            api('/api/superadmin/seguridad/bans').catch(() => ({ json: () => [] })),
            api('/api/superadmin/seguridad/log').catch(() => ({ json: () => [] })),
            api('/api/superadmin/seguridad/dispositivos').catch(() => ({ json: () => [] }))
        ]);
        const bans = await bansRes.json();
        const logs = await logRes.json();
        const disps = await dispRes.json();

        document.getElementById('secActiveBans').innerText = bans.length;
        document.getElementById('secViolations').innerText = logs.filter(l => l.severidad === 'alta').length;
        document.getElementById('secRateBuckets').innerText = '—';
        document.getElementById('secDbLog').innerText = logs.length;

        document.getElementById('secBansList').innerHTML = bans.length
            ? bans.map(b => `<tr><td data-label="IP">${b.ip}</td><td data-label="Motivo">${b.motivo || '—'}</td><td data-label="Baneado por">${b.baneado_por || 'sistema'}</td><td data-label="Expira">${b.expira ? new Date(b.expira).toLocaleString('es-ES') : 'Nunca'}</td><td data-label="Acción" class="text-end"><button class="btn btn-sm btn-outline-danger" onclick="desbanearIp('${b.ip}')"><i class="fas fa-unlock"></i></button></td></tr>`).join('')
            : '<tr><td colspan="5" class="text-center text-muted py-4">Sin IPs baneadas</td></tr>';

        document.getElementById('secLogList').innerHTML = logs.length
            ? logs.slice(0, 30).map(l => `<tr><td data-label="Fecha">${l.fecha ? new Date(l.fecha).toLocaleString('es-ES') : '—'}</td><td data-label="IP">${l.ip || '—'}</td><td data-label="Tipo">${l.tipo || '—'}</td><td data-label="Acción">${l.accion || '—'}</td><td data-label="Severidad"><span class="badge bg-${l.severidad === 'alta' ? 'danger' : l.severidad === 'media' ? 'warning' : 'secondary'}">${l.severidad || 'baja'}</span></td><td data-label="Detalles"><small>${l.detalles || '—'}</small></td></tr>`).join('')
            : '<tr><td colspan="6" class="text-center text-muted py-4">Sin eventos</td></tr>';

        document.getElementById('secDispositivosList').innerHTML = disps.length
            ? disps.map(d => `<tr><td data-label="Dispositivo">${d.dispositivo_id || '—'}</td><td data-label="IP solicitante">${d.ip || '—'}</td><td data-label="Motivo">${d.motivo || '—'}</td><td data-label="Estado"><span class="badge bg-${d.estado === 'pendiente' ? 'warning' : 'success'}">${d.estado || '—'}</span></td><td data-label="Fecha">${d.fecha ? new Date(d.fecha).toLocaleDateString('es-ES') : '—'}</td><td data-label="Acciones" class="text-end"><button class="btn btn-sm btn-success me-1" onclick="resolverDispositivo('${d.id}', true)"><i class="fas fa-check"></i></button><button class="btn btn-sm btn-danger" onclick="resolverDispositivo('${d.id}', false)"><i class="fas fa-times"></i></button></td></tr>`).join('')
            : '<tr><td colspan="6" class="text-center text-muted py-4">Sin dispositivos bloqueados</td></tr>';
    } catch (e) { console.error(e); }
}

function abrirBanModal() {
    document.getElementById('banIpInput').value = '';
    document.getElementById('banReasonInput').value = '';
    document.getElementById('banDurationInput').value = '24';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('banIpModal')).show();
}

async function confirmarBan() {
    const ip = document.getElementById('banIpInput').value.trim();
    const motivo = document.getElementById('banReasonInput').value.trim();
    const horas = parseInt(document.getElementById('banDurationInput').value) || 24;
    if (!ip || !motivo) { showToast('❌ IP y motivo obligatorios', 'error'); return; }
    try {
        const res = await api('/api/superadmin/seguridad/ban', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip, motivo, horas })
        });
        const data = await res.json();
        if (data.success) { bootstrap.Modal.getInstance(document.getElementById('banIpModal')).hide(); showToast('🚫 IP baneada'); loadSeguridad(); }
        else { showToast('❌ ' + (data.error || 'Error'), 'error'); }
    } catch { showToast('❌ Error de conexión', 'error'); }
}

async function desbanearIp(ip) {
    if (!confirm(`¿Desbanear la IP ${ip}?`)) return;
    try {
        const res = await api(`/api/superadmin/seguridad/ban/${ip}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) { showToast('✅ IP desbaneada'); loadSeguridad(); }
        else { showToast('❌ ' + (data.error || 'Error'), 'error'); }
    } catch { showToast('❌ Error de conexión', 'error'); }
}

async function verificarIp() {
    const ip = document.getElementById('secCheckIpInput').value.trim();
    if (!ip) return;
    const result = document.getElementById('secCheckResult');
    result.style.display = 'block';
    result.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
    try {
        const res = await api(`/api/superadmin/seguridad/verificar-ip/${ip}`);
        const data = await res.json();
        result.innerHTML = data.baneada
            ? `<div class="alert alert-danger py-2 mb-0"><i class="fas fa-ban"></i> IP baneada. Motivo: ${data.motivo}</div>`
            : `<div class="alert alert-success py-2 mb-0"><i class="fas fa-check"></i> IP limpia</div>`;
    } catch { result.innerHTML = '<div class="alert alert-warning py-2 mb-0">Error al verificar</div>'; }
}

async function loadDispositivosBloqueados() { loadSeguridad(); }

async function resolverDispositivo(id, aprobar) {
    try {
        const res = await api(`/api/superadmin/seguridad/dispositivos/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aprobar })
        });
        const data = await res.json();
        if (data.success) { showToast(aprobar ? '✅ Desbloqueado' : '🗑️ Rechazado'); loadSeguridad(); }
        else { showToast('❌ ' + (data.error || 'Error'), 'error'); }
    } catch { showToast('❌ Error de conexión', 'error'); }
}

// ============================================================
// DATOS DE PAGO
// ============================================================
async function loadConfigPagos() {
    try {
        const res = await api('/api/superadmin/config-pagos');
        const data = await res.json();
        document.getElementById('payBank').value = data.banco || '';
        document.getElementById('payWhatsApp').value = data.whatsapp || '';
        actualizarPreviewPago();
    } catch {}
}

function actualizarPreviewPago() {
    const banco = document.getElementById('payBank').value.trim();
    const whatsapp = document.getElementById('payWhatsApp').value.trim();
    document.getElementById('previewBankNumber').innerText = banco || '— Sin configurar —';
    document.getElementById('previewWhatsApp').innerHTML = whatsapp
        ? `<span style="background:#25D366; color:#fff; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fab fa-whatsapp"></i></span><span style="font-weight:700; color:var(--text-main);">${whatsapp}</span>`
        : `<span style="background:#25D366; color:#fff; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fab fa-whatsapp"></i></span><span style="font-weight:700; color:var(--text-main);">— Sin configurar —</span>`;
}

async function guardarConfigPagos() {
    const banco = document.getElementById('payBank').value.trim();
    const whatsapp = document.getElementById('payWhatsApp').value.trim();
    try {
        const res = await api('/api/superadmin/config-pagos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ banco, whatsapp })
        });
        const data = await res.json();
        if (data.success) { showToast('✅ Datos de pago guardados correctamente'); }
        else { showToast('❌ ' + (data.error || 'Error al guardar'), 'error'); }
    } catch (e) { showToast('❌ Error de conexión', 'error'); }
}

// ============================================================
// INICIALIZACIÓN SEGURA
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('passInput').value;
            const btn = document.getElementById('loginBtn');
            const err = document.getElementById('loginError');
            if (!password) { err.textContent = '⚠️ Ingresa la contraseña'; return; }
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
            btn.disabled = true;
            err.textContent = '';
            try {
                const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
                const data = await res.json();
                if (data.success) { saveSession(data.token, data.expires); showToast('✅ Acceso concedido'); await showApp(); }
                else { err.textContent = '❌ ' + (data.error || 'Contraseña incorrecta'); }
            } catch (e) { err.textContent = '❌ Error de conexión'; }
            finally { btn.innerHTML = '<i class="fas fa-arrow-right me-2"></i> Ingresar'; btn.disabled = false; }
        });
    }

    (async function init() {
        const valid = await verifySession();
        if (valid) await showApp();
    })();
});