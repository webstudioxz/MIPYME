// ============================================================
// public/js/admin/superadmin.js
// Lógica del panel de Superadmin
// ============================================================

const TOKEN_KEY = 'superadminToken';
const EXPIRY_KEY = 'superadminExpiry';
let allTiendas = [];
let allUsuarios = [];
let currentImageMode = 'url';
let uploadedImageBase64 = null;

// --- Funciones de sesión ---
function getToken() { return localStorage.getItem(TOKEN_KEY); }
function getExpiry() { return localStorage.getItem(EXPIRY_KEY); }
function saveSession(t, e) { localStorage.setItem(TOKEN_KEY, t); localStorage.setItem(EXPIRY_KEY, e); }
function clearSession() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(EXPIRY_KEY); }
function isSessionValid() { return getToken() && getExpiry() && Date.now() < parseInt(getExpiry()); }

// --- Fetch helper ---
async function api(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (getToken()) headers['Authorization'] = `Bearer ${getToken()}`;
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) { clearSession(); document.getElementById('app').style.display = 'none'; document.getElementById('loginScreen').style.display = 'flex'; throw new Error('Sesión expirada'); }
    return res;
}

// --- Toast ---
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

// --- Login ---
document.getElementById('loginForm').addEventListener('submit', async (e) => {
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

// --- Navegación ---
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
    if (window.innerWidth < 768) document.getElementById('sidebar')?.classList.remove('active');
}

// ============================================================
// 🚨 AQUÍ DEBES PEGAR EL RESTO DE TUS FUNCIONES
// (loadDashboard, loadTiendas, renderTiendas, abrirCrearTienda, crearTienda,
//  abrirEditarTienda, guardarEdicionTienda, togglePausar, abrirPausaModal,
//  onChangePausaMensaje, confirmarPausa, abrirTiempoModal, guardarTiempo,
//  setImageMode, resizeImage, handleImageFile, removeUploadedImage,
//  abrirProductoModal, guardarProducto, verProductos, eliminarProductoAdmin,
//  abrirUrlsModal, copiarCampo, eliminarTienda, loadPedidosGlobal,
//  refreshPedidosGlobal, eliminarPedidoGlobal, eliminarTodosPedidosTienda,
//  normalizePhone, enviarWhatsAppClienteGlobal, loadPlanes, abrirNuevoPlan,
//  editarPlan, guardarPlan, loadPrivacidad, guardarPrivacidad)
// ============================================================

// ... (copia todas las funciones que tenías en tu <script> original aquí)

// --- Inicialización al cargar ---
window.addEventListener('load', async () => {
    if (await verifySession()) await showApp();
    else document.getElementById('loginScreen').style.display = 'flex';
});