let supabaseClient;
let currentUser;
let myStore = null;
let myProducts = [];
let pedidosGlobales = [];
let reservasGlobales = [];
let isReservaStore = false;

window.AdminApp = window.AdminApp || { tiendaActual: null, tiendasDisponibles: [] };
window.AdminUI = window.AdminUI || { showToast: function(msg) { alert(msg); } };

// ============================================================
// PLAN_FEATURES
// ============================================================
const PLAN_FEATURES = {
    prueba:  { nombre: 'Gratis',   precio: 0,    max_productos: 5,  features: { notificacion_nuevo_pedido: true,  agregar_productos: true, editar_productos: true, modificar_formas_pago: true, modificar_precio_monedas: true, envio_proveedor: true,  promocion_publicidad: true,  url_admin_notificaciones: true, url_tienda_individual: true, graficas: false, whatsapp_clientes_compradores: false } },
    basico:  { nombre: 'Básico',   precio: 1000, max_productos: 5,  features: { notificacion_nuevo_pedido: true,  agregar_productos: true, editar_productos: true, modificar_formas_pago: true, modificar_precio_monedas: true, envio_proveedor: false, promocion_publicidad: false, url_admin_notificaciones: true, url_tienda_individual: true, graficas: false, whatsapp_clientes_compradores: false } },
    pro:     { nombre: 'Pro',      precio: 2500, max_productos: 10, features: { notificacion_nuevo_pedido: true,  agregar_productos: true, editar_productos: true, modificar_formas_pago: true, modificar_precio_monedas: true, envio_proveedor: true,  promocion_publicidad: true,  url_admin_notificaciones: true, url_tienda_individual: true, graficas: true,  whatsapp_clientes_compradores: false } },
    premium: { nombre: 'Premium',  precio: 5000, max_productos: 50, features: { notificacion_nuevo_pedido: true,  agregar_productos: true, editar_productos: true, modificar_formas_pago: true, modificar_precio_monedas: true, envio_proveedor: true,  promocion_publicidad: true,  url_admin_notificaciones: true, url_tienda_individual: true, graficas: true,  whatsapp_clientes_compradores: true  } }
};

function getPlanDef(planId) {
    return PLAN_FEATURES[planId] || PLAN_FEATURES.prueba;
}

function getMyStoreFeatures() {
    if (!myStore) return PLAN_FEATURES.prueba.features;
    const planId = myStore.plan || 'prueba';
    const def = PLAN_FEATURES[planId];
    if (def) return def.features;
    const cfg = myStore.configuracion || {};
    if (cfg._plan_features && typeof cfg._plan_features === 'object') {
        return cfg._plan_features;
    }
    return PLAN_FEATURES.prueba.features;
}

function aplicarFeaturesPlan() {
    if (!myStore) return;
    const features = getMyStoreFeatures();
    window._planFeatures = features;
    document.body.dataset.planId = myStore.plan || 'prueba';
    document.body.dataset.planNombre = getPlanDef(myStore.plan).nombre;
    document.querySelectorAll('[data-feature]').forEach(el => {
        const feature = el.dataset.feature;
        const tieneFeature = features[feature] === true;
        el.style.display = tieneFeature ? '' : 'none';
    });
}

const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');
const mobileBtn = document.getElementById('mobileMenuBtn');

function abrirMenu() { sidebar.classList.add('active'); overlay.classList.add('active'); document.body.style.overflow = 'hidden'; }
function cerrarMenu() { sidebar.classList.remove('active'); overlay.classList.remove('active'); document.body.style.overflow = ''; }
if (mobileBtn) mobileBtn.addEventListener('click', () => { if (sidebar.classList.contains('active')) cerrarMenu(); else abrirMenu(); });
if (overlay) overlay.addEventListener('click', cerrarMenu);

function normalizePhone(phone) {
    let n = String(phone || '').replace(/\D/g, '');
    if (n.length === 8 && n.startsWith('5')) n = '53' + n;
    return n;
}

async function initSupabase() {
    const res = await fetch('/api/public-config');
    const config = await res.json();
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
}

async function checkAuth() {
    await initSupabase();
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session || !session.user) {
        document.getElementById('loader').innerHTML = '<p class="text-danger">Inicia sesión con Google.</p>';
        setTimeout(() => window.location.href = '/', 2000);
        return;
    }
    currentUser = session.user;
    const urlParams = new URLSearchParams(window.location.search);
    const tiendaSlug = urlParams.get('tienda');
    try {
        let storeData = null;
        if (tiendaSlug) {
            const res = await fetch(`/api/mi-tienda?slug=${tiendaSlug}`, { cache: 'no-store' });
            const data = await res.json();
            if (data.success) storeData = data.store;
        } else {
            const res = await fetch(`/api/mi-tienda?owner_id=${currentUser.id}`, { cache: 'no-store' });
            const data = await res.json();
            if (data.success) storeData = data.store;
        }
        if (!storeData) { alert('Sin acceso'); window.location.href = '/'; return; }
        myStore = storeData;
        isReservaStore = myStore.configuracion?.tipo === 'reserva';
        window.AdminApp.tiendaActual = myStore.id;
        window.AdminApp.tiendasDisponibles = [myStore];

        document.getElementById('nombreTiendaSidebar').innerText = myStore.nombre;
        document.getElementById('btnVerTienda').href = `/?tienda=${myStore.id}`;

        if (isReservaStore) {
            document.getElementById('navIconProductos').className = 'fas fa-concierge-bell';
            document.getElementById('navTextProductos').innerText = 'Servicios';
            document.getElementById('titleProductos').innerText = 'Mis Servicios';
            document.getElementById('btnNuevoProducto').innerText = 'Nuevo Servicio';
            document.getElementById('modalProductoTitleText').innerText = 'Nuevo Servicio';
            document.getElementById('cardGestorVenta').style.display = 'none';
            document.getElementById('navPedidos').style.display = 'none';
            document.getElementById('navReservas').style.display = 'flex';
            document.getElementById('divImagenesServicio').style.display = 'block';
            document.getElementById('cardHorario').style.display = 'block';
            document.getElementById('groupDescuento').style.display = 'none';
            document.getElementById('groupRequiereCarnet').style.display = 'none';
            cargarHorario();
        }

        const permitirWhatsApp = getMyStoreFeatures().envio_proveedor === true;
        document.getElementById('groupWhatsappProveedor').style.display = permitirWhatsApp ? 'block' : 'none';
        document.getElementById('groupImagenProveedor').style.display = permitirWhatsApp ? 'block' : 'none';

        const baseUrl = window.location.origin;
        document.getElementById('miUrlTienda').value = `${baseUrl}/?tienda=${myStore.id}`;
        document.getElementById('miUrlAdmin').value = `${baseUrl}/admin-cliente?tienda=${myStore.id}`;
        document.getElementById('badgePlan').innerText = getPlanDef(myStore.plan).nombre;
        document.getElementById('maxProductos').innerText = `${getPlanDef(myStore.plan).max_productos} productos`;
        document.getElementById('fechaVencimiento').innerText = myStore.fecha_vencimiento ? new Date(myStore.fecha_vencimiento).toLocaleDateString() : 'Sin fecha';
        aplicarFeaturesPlan();

        actualizarEstadoPausa();
        actualizarBadgeEstado();
        cargarGestorDesdeStore();
        cargarConfiguracionTienda();
        cargarNotificaciones();

        if (myStore.pausada === true && myStore.pausada_por === 'admin') {
            const banner = document.getElementById('bannerAdminPaused');
            banner.style.display = 'flex';
            banner.className = 'banner-admin-paused';
            banner.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <div>
                    <strong>Tu tienda está pausada por el administrador</strong>
                    <small>Motivo: ${(myStore.pausada_mensaje || 'Contacta con soporte para más información').replace(/</g,'&lt;')}</small>
                </div>
            `;
        } else if (myStore.pausada === true && myStore.pausada_por === 'owner') {
            const banner = document.getElementById('bannerAdminPaused');
            banner.style.display = 'flex';
            banner.className = 'banner-admin-paused';
            banner.style.background = 'linear-gradient(135deg,#F59E0B,#D97706)';
            banner.innerHTML = `
                <i class="fas fa-pause-circle"></i>
                <div>
                    <strong>Tu tienda está pausada</strong>
                    <small>Mensaje público: "${(myStore.pausada_mensaje || 'Volvemos pronto').replace(/</g,'&lt;')}"</small>
                </div>
            `;
        }

        if (window.AdminNotifications) AdminNotifications.init().catch(console.error);
        document.getElementById('loader').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        await cargarProductos();
    } catch (e) { console.error(e); window.location.href = '/'; }
}

function cargarHorario() {
    const cfg = myStore.configuracion?.horario || {};
    const dias = Array.isArray(cfg.dias) ? cfg.dias : [1, 2, 3, 4, 5, 6];
    document.getElementById('horaApertura').value = cfg.apertura || '09:00';
    document.getElementById('horaCierre').value = cfg.cierre || '18:00';
    document.getElementById('intervaloTurnos').value = cfg.intervalo || '60';
    document.querySelectorAll('#diasLaborables .day-pill').forEach(pill => {
        const d = parseInt(pill.dataset.day);
        pill.classList.toggle('active', dias.includes(d));
    });
}

function toggleDia(el) { el.classList.toggle('active'); }

async function guardarHorario() {
    if (!currentUser || !myStore) return;
    const dias = Array.from(document.querySelectorAll('#diasLaborables .day-pill.active')).map(p => parseInt(p.dataset.day));
    if (dias.length === 0) { alert('Debes seleccionar al menos un día laborable'); return; }
    const apertura = document.getElementById('horaApertura').value;
    const cierre = document.getElementById('horaCierre').value;
    const intervalo = parseInt(document.getElementById('intervaloTurnos').value);
    if (apertura >= cierre) { alert('La hora de apertura debe ser antes que la de cierre'); return; }
    try {
        const res = await fetch('/api/mi-tienda/config', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ owner_id: currentUser.id, slug: myStore.id, configuracion: { horario: { apertura, cierre, dias, intervalo } } })
        });
        const data = await res.json();
        if (data.success) { myStore.configuracion = data.configuracion; alert('✅ Horario guardado'); }
    } catch { alert('Error'); }
}

function cargarConfiguracionTienda() {
    const cfg = myStore.configuracion || {};
    const tasas = cfg.tasas || { USD: 0.04, EUR: 0.037 };
    const datos = cfg.datos_bancarios || {};
    document.getElementById('miRateUSD').value = tasas.USD ? (1 / tasas.USD).toFixed(2) : 25;
    document.getElementById('miRateEUR').value = tasas.EUR ? (1 / tasas.EUR).toFixed(2) : 27;
    const metodos = cfg.metodos_pago || [];
    document.getElementById('pagoEfectivo').checked = metodos.includes('Efectivo');
    document.getElementById('pagoTransferencia').checked = metodos.includes('Transferencia');
    document.getElementById('pagoTarjeta').checked = metodos.includes('Tarjeta');
    document.getElementById('numTarjeta').value = datos.numero_tarjeta || '';
    const qr = datos.qr_tarjeta || '';
    document.getElementById('urlQrTarjeta').value = qr;
    if (qr) { document.getElementById('qrPreviewImg').src = qr; document.getElementById('qrPreviewContainer').style.display = 'block'; }
}

function cargarNotificaciones() {
    const cfg = myStore.configuracion || {};
    const modo = cfg.notificaciones_modo || 'admin';
    const sel = document.getElementById('notifModo');
    if (sel) sel.value = modo;
}

async function guardarNotificaciones() {
    if (!currentUser || !myStore) return;
    const modo = document.getElementById('notifModo').value;
    try {
        const res = await fetch('/api/mi-tienda/config', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ owner_id: currentUser.id, slug: myStore.id, configuracion: { notificaciones_modo: modo } })
        });
        const data = await res.json();
        if (data.success) { myStore.configuracion = data.configuracion; alert('✅ Guardado'); }
    } catch { alert('Error'); }
}

function previewQrImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Máximo 2MB'); event.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('urlQrTarjeta').value = e.target.result;
        document.getElementById('qrPreviewImg').src = e.target.result;
        document.getElementById('qrPreviewContainer').style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function cargarGestorDesdeStore() {
    if (!myStore) return;
    const g = myStore.configuracion?.gestor_venta || {};
    document.getElementById('gestorNombre').value = g.nombre || '';
    document.getElementById('gestorCarnet').value = g.carnet || '';
    document.getElementById('gestorTelefono').value = g.telefono || '';
    document.getElementById('gestorDireccion').value = g.direccion || '';
}

async function guardarConfiguracion() {
    if (!currentUser || !myStore) return;
    const usd = parseFloat(document.getElementById('miRateUSD').value) || 25;
    const eur = parseFloat(document.getElementById('miRateEUR').value) || 27;
    const metodos = [];
    if (document.getElementById('pagoEfectivo').checked) metodos.push('Efectivo');
    if (document.getElementById('pagoTransferencia').checked) metodos.push('Transferencia');
    if (document.getElementById('pagoTarjeta').checked) metodos.push('Tarjeta');
    const datos_bancarios = { ...(myStore.configuracion?.datos_bancarios || {}), numero_tarjeta: document.getElementById('numTarjeta').value.trim(), qr_tarjeta: document.getElementById('urlQrTarjeta').value.trim() };
    try {
        const res = await fetch('/api/mi-tienda/config', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ owner_id: currentUser.id, slug: myStore.id, configuracion: { tasas: { CUP: 1, USD: 1 / usd, EUR: 1 / eur }, metodos_pago: metodos, datos_bancarios } })
        });
        const data = await res.json();
        if (data.success) { myStore.configuracion = data.configuracion; alert('✅ Guardado'); }
    } catch { alert('Error'); }
}

async function guardarGestorVenta() {
    if (!currentUser || !myStore) return;
    const gestor_venta = {
        nombre: document.getElementById('gestorNombre').value.trim(),
        carnet: document.getElementById('gestorCarnet').value.trim(),
        telefono: document.getElementById('gestorTelefono').value.trim(),
        direccion: document.getElementById('gestorDireccion').value.trim()
    };
    try {
        const res = await fetch('/api/mi-tienda/config', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ owner_id: currentUser.id, slug: myStore.id, configuracion: { gestor_venta } })
        });
        const data = await res.json();
        if (data.success) { myStore.configuracion = data.configuracion; alert('✅ Guardado'); }
    } catch { alert('Error'); }
}

function actualizarBadgeEstado() {
    const el = document.getElementById('badgeEstado');
    if (!el) return;
    el.innerHTML = myStore.pausada ? '<span class="badge-pausada"><i class="fas fa-pause"></i>Pausada</span>' : '<span class="badge-activa"><i class="fas fa-check"></i>Activa</span>';
    const s = document.getElementById('estadoTiendaSidebar');
    if (s) {
        let extra = '';
        if (myStore.pausada && myStore.pausada_por === 'admin') extra = ' (admin)';
        else if (myStore.pausada && myStore.pausada_por === 'owner') extra = ' (tú)';
        s.innerHTML = myStore.pausada
            ? `<span class="badge-pausada" style="font-size:0.62rem;">Pausada${extra}</span>`
            : '<span class="badge-activa" style="font-size:0.62rem;">Activa</span>';
    }
}

function actualizarEstadoPausa() {
    const btnPausar = document.getElementById('btnPausarConMensaje');
    const btnReactivar = document.getElementById('btnReactivarTienda');
    if (!btnPausar || !btnReactivar) return;
    if (myStore.pausada) {
        btnPausar.style.display = 'none';
        btnReactivar.style.display = 'inline-block';
    } else {
        btnPausar.style.display = 'inline-block';
        btnReactivar.style.display = 'none';
    }
}

function showSection(section, btn) {
    ['products', 'orders', 'reservas', 'settings', 'graficas', 'promocion', 'wa-clientes'].forEach(s => {
        const el = document.getElementById('view-' + s);
        if (el) el.style.display = section === s ? 'block' : 'none';
    });
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (section === 'orders') cargarPedidos();
    if (section === 'reservas') cargarReservas();
    if (section === 'graficas') cargarGraficas();
    if (window.innerWidth < 992) cerrarMenu();
}

// ============================================================
// SUBIDA Y VALIDACIÓN SEGURA DE IMÁGENES
// ============================================================
const IMG_TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const IMG_TAMANO_MAXIMO = 5 * 1024 * 1024;
const IMG_MAGIC_BYTES = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png':  [[0x89, 0x50, 0x4E, 0x47]],
    'image/gif':  [[0x47, 0x49, 0x46, 0x38]],
    'image/webp': [[0x52, 0x49, 0x46, 0x46]]
};

async function _verificarMagicBytes(file) {
    const buf = await file.slice(0, 12).arrayBuffer();
    const b = new Uint8Array(buf);
    const mime = file.type;
    if (mime === 'image/webp') {
        return b[0]===0x52 && b[1]===0x49 && b[2]===0x46 && b[3]===0x46
            && b[8]===0x57 && b[9]===0x45 && b[10]===0x42 && b[11]===0x50;
    }
    const pats = IMG_MAGIC_BYTES[mime] || [];
    return pats.some(p => p.every((v, i) => b[i] === v));
}

async function _verificarContenidoSospechoso(file) {
    const txt = await file.slice(0, 4096).text();
    const patrones = [
        /<script/i, /javascript:/i, /<iframe/i,
        /on(load|error|click|mouse)\s*=/i, /eval\s*\(/i,
        /<svg[^>]*onload/i, /data:text\/html/i
    ];
    for (const p of patrones) {
        if (p.test(txt)) throw new Error('El archivo contiene contenido sospechoso y fue rechazado.');
    }
}

async function validarImagenSegura(file) {
    if (!file) throw new Error('No se seleccionó ningún archivo');
    if (file.size < 100) throw new Error('Archivo inválido o vacío');
    if (file.size > IMG_TAMANO_MAXIMO) throw new Error('La imagen supera los 5MB permitidos');

    if (!IMG_TIPOS_PERMITIDOS.includes(file.type)) {
        throw new Error('Formato no permitido. Usa JPG, PNG, WEBP o GIF. (No se aceptan SVG ni ejecutables)');
    }

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const extMap = { 'image/jpeg':['jpg','jpeg'], 'image/png':['png'], 'image/webp':['webp'], 'image/gif':['gif'] };
    if (!extMap[file.type]?.includes(ext)) {
        throw new Error(`La extensión ".${ext}" no coincide con el tipo real (${file.type}).`);
    }

    const okMagic = await _verificarMagicBytes(file);
    if (!okMagic) throw new Error('El archivo no es una imagen válida (cabecera corrupta).');

    await _verificarContenidoSospechoso(file);
    return true;
}

function _reencodeImagen(file, maxAncho = 1000, calidad = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    let { width, height } = img;
                    if (width > maxAncho) {
                        height = Math.round(height * (maxAncho / width));
                        width = maxAncho;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', calidad));
                } catch { reject(new Error('No se pudo procesar la imagen.')); }
            };
            img.onerror = () => reject(new Error('Archivo de imagen corrupto o no decodificable.'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Error leyendo el archivo.'));
        reader.readAsDataURL(file);
    });
}

async function procesarImagenProducto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const preview = document.getElementById('prodImagePreview');
    const previewImg = document.getElementById('prodImagePreviewImg');
    const inputUrl = document.getElementById('prodImage');

    try {
        await validarImagenSegura(file);

        let dataUrl = await _reencodeImagen(file, 1000, 0.8);

        if (dataUrl.length > 400000) {
            dataUrl = await _reencodeImagen(file, 800, 0.65);
        }
        if (dataUrl.length > 700000) {
            throw new Error('La imagen sigue siendo muy pesada tras la compresión. Usa una imagen más pequeña.');
        }

        inputUrl.value = dataUrl;
        previewImg.src = dataUrl;
        preview.style.display = 'block';

    } catch (err) {
        alert('❌ ' + err.message);
        event.target.value = '';
        preview.style.display = 'none';
    }
}

// ============================================================
// PRODUCTOS
// ============================================================
async function cargarProductos() {
    const res = await fetch(`/api/mis-productos?tienda=${myStore.id}`);
    myProducts = await res.json();
    const tbody = document.getElementById('productsList');
    if (!myProducts.length) { tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No hay registros.</td></tr>'; return; }
    tbody.innerHTML = myProducts.map(p => `
        <tr>
            <td><img src="${p.imagen || 'https://via.placeholder.com/40'}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;"></td>
            <td class="fw-semibold">${p.nombre}</td>
            <td>$${parseFloat(p.precio).toFixed(2)}</td>
            <td><span class="badge bg-light text-dark">${p.categoria || 'otros'}</span></td>
            <td>${p.contacto_nombre ? `<span class="badge bg-info text-dark"><i class="fas fa-user"></i> ${p.contacto_nombre}</span>` : '<span class="text-muted small">—</span>'}</td>
            <td>${p.disponible ? '<span class="badge bg-success">OK</span>' : '<span class="badge bg-danger">Agotado</span>'}</td>
            <td style="text-align:right;">
                <button class="btn btn-sm btn-outline-primary me-1" onclick="abrirModalProducto(${p.id})"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarProducto(${p.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

async function abrirModalProducto(id = null) {
    const modal = new bootstrap.Modal(document.getElementById('productoModal'));
    const titleText = document.getElementById('modalProductoTitleText');
    document.getElementById('prodId').value = '';
    document.getElementById('prodName').value = '';
    document.getElementById('prodDesc').value = '';
    document.getElementById('prodPrice').value = '';
    document.getElementById('prodDiscount').value = '0';
    document.getElementById('prodImage').value = '';
    document.getElementById('prodImageProveedor').value = '';
    document.getElementById('prodWhatsAppProveedor').value = '';
    document.getElementById('prodContactoNombre').value = '';
    document.getElementById('prodRequiereCarnet').checked = false;
    document.getElementById('prodImagenesServicio').value = '';

    const fileInput = document.getElementById('prodImageFile');
    if (fileInput) fileInput.value = '';
    const previewBox = document.getElementById('prodImagePreview');
    const previewImg = document.getElementById('prodImagePreviewImg');
    if (previewBox) previewBox.style.display = 'none';
    if (previewImg) previewImg.src = '';

    const permitirWhatsApp = getMyStoreFeatures().envio_proveedor === true;
    document.getElementById('groupWhatsappProveedor').style.display = permitirWhatsApp ? 'block' : 'none';
    document.getElementById('groupImagenProveedor').style.display = permitirWhatsApp ? 'block' : 'none';

    const cats = myStore.categorias || ['otros'];
    document.getElementById('prodCategory').innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');

    if (id) {
        const p = myProducts.find(x => x.id == id);
        if (!p) return;
        titleText.innerText = isReservaStore ? 'Editar Servicio' : 'Editar Producto';
        document.getElementById('prodId').value = p.id;
        document.getElementById('prodName').value = p.nombre;
        document.getElementById('prodDesc').value = p.descripcion || '';
        document.getElementById('prodPrice').value = p.precio;
        document.getElementById('prodDiscount').value = p.descuento || 0;
        document.getElementById('prodImage').value = p.imagen || '';
        if (p.imagen) {
            document.getElementById('prodImagePreviewImg').src = p.imagen;
            document.getElementById('prodImagePreview').style.display = 'block';
        }
        document.getElementById('prodImageProveedor').value = p.imagen_proveedor || '';
        document.getElementById('prodWhatsAppProveedor').value = p.whatsapp_proveedor || '';
        document.getElementById('prodContactoNombre').value = p.contacto_nombre || '';
        document.getElementById('prodRequiereCarnet').checked = p.requiere_carnet === true;
        document.getElementById('prodCategory').value = p.categoria || 'otros';
        if (isReservaStore && Array.isArray(p.imagenes_servicio) && p.imagenes_servicio.length > 0) {
            document.getElementById('prodImagenesServicio').value = p.imagenes_servicio.join('\n');
        }
    } else {
        const lim = getPlanDef(myStore.plan).max_productos;
        if (myProducts.length >= lim) { alert(`Límite ${lim} alcanzado (plan ${getPlanDef(myStore.plan).nombre})`); return; }
        titleText.innerText = isReservaStore ? 'Nuevo Servicio' : 'Nuevo Producto';
    }
    modal.show();
}

async function guardarProducto() {
    const id = document.getElementById('prodId').value;
    const nombre = document.getElementById('prodName').value.trim();
    const precio = parseFloat(document.getElementById('prodPrice').value);
    if (!nombre || !precio || precio <= 0) { alert('Nombre y precio obligatorios'); return; }

    let imagenesServicio = [];
    if (isReservaStore) {
        const lineas = document.getElementById('prodImagenesServicio').value.split('\n');
        imagenesServicio = lineas.map(u => u.trim()).filter(u => u.length > 5);
        if (imagenesServicio.length > 0 && (imagenesServicio.length < 3 || imagenesServicio.length > 6)) {
            alert('Ingresa entre 3 y 6 imágenes');
            return;
        }
    }

    const permitirWhatsApp = getMyStoreFeatures().envio_proveedor === true;

    const payload = {
        tienda: myStore.id, owner_id: currentUser.id,
        nombre, descripcion: document.getElementById('prodDesc').value,
        precio,
        descuento: isReservaStore ? 0 : (parseInt(document.getElementById('prodDiscount').value) || 0),
        categoria: document.getElementById('prodCategory').value,
        imagen: document.getElementById('prodImage').value.trim() || 'https://via.placeholder.com/300',
        disponible: true,
        imagenes_servicio: isReservaStore ? imagenesServicio : [],
        contacto_nombre: document.getElementById('prodContactoNombre').value.trim() || null
    };

    if (permitirWhatsApp) {
        payload.whatsapp_proveedor = document.getElementById('prodWhatsAppProveedor').value.trim() || null;
        payload.imagen_proveedor = document.getElementById('prodImageProveedor').value.trim() || null;
        payload.requiere_carnet = document.getElementById('prodRequiereCarnet').checked;
    } else {
        payload.whatsapp_proveedor = null;
        payload.imagen_proveedor = null;
        payload.requiere_carnet = false;
    }

    try {
        let res;
        if (id) {
            const r = await fetch(`/api/mis-productos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            res = { ok: r.ok, data: await r.json() };
        } else {
            const r = await fetch('/api/mis-productos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            res = { ok: r.ok, data: await r.json() };
        }
        if (res.ok) {
            bootstrap.Modal.getInstance(document.getElementById('productoModal')).hide();
            await cargarProductos();
        } else {
            alert('❌ ' + (res.data?.error || 'Error'));
        }
    } catch { alert('❌ Error de conexión'); }
}

async function eliminarProducto(id) {
    if (!confirm('¿Eliminar?')) return;
    await fetch(`/api/mis-productos/${id}`, { method: 'DELETE' });
    await cargarProductos();
}

async function agregarCategoria() {
    const nueva = prompt('Nueva categoría:');
    if (!nueva || !nueva.trim()) return;
    const cat = nueva.trim().toLowerCase();
    if (myStore.categorias?.includes(cat)) { alert('Ya existe'); return; }
    const cats = myStore.categorias || ['otros'];
    cats.push(cat);
    try {
        const res = await fetch('/api/mi-tienda/categorias', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ owner_id: currentUser.id, slug: myStore.id, categorias: cats })
        });
        if (!res.ok) throw new Error();
        myStore.categorias = cats;
        document.getElementById('prodCategory').innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
        document.getElementById('prodCategory').value = cat;
        alert('✅ Agregada');
    } catch { alert('Error'); }
}

async function eliminarCategoria() {
    const select = document.getElementById('prodCategory');
    const cat = select.value;
    if (!cat || cat === 'otros') { alert('No puedes eliminar "otros"'); return; }
    if (!confirm(`¿Eliminar "${cat}"?`)) return;
    const cats = myStore.categorias.filter(c => c !== cat);
    try {
        const res = await fetch('/api/mi-tienda/categorias', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ owner_id: currentUser.id, slug: myStore.id, categorias: cats })
        });
        if (!res.ok) throw new Error();
        await supabaseClient.from('products').update({ categoria: 'otros' }).eq('tienda', myStore.id).eq('categoria', cat);
        myStore.categorias = cats;
        select.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
        alert('✅ Eliminada');
        await cargarProductos();
    } catch { alert('Error'); }
}

// ============================================================
// RESERVAS
// ============================================================
async function cargarReservas() {
    const res = await fetch(`/api/reservas?tienda=${myStore.id}`);
    reservasGlobales = await res.json();
    filtrarReservas();
}

function filtrarReservas() {
    const q = (document.getElementById('searchReserva')?.value || '').toLowerCase().trim();
    const filtradas = reservasGlobales.filter(r => {
        const n = (r.cliente_nombre || '').toLowerCase();
        const f = (r.fecha || '').toLowerCase();
        const s = (r.producto?.nombre || '').toLowerCase();
        return n.includes(q) || f.includes(q) || s.includes(q);
    });
    renderizarReservas(filtradas);
}

function renderizarReservas(reservas) {
    const c = document.getElementById('reservasList');
    if (!reservas.length) { c.innerHTML = '<div class="alert alert-info text-center py-4">No hay reservas.</div>'; return; }
    c.innerHTML = reservas.map(r => {
        const prod = r.producto || {};
        const img = prod.imagen || (Array.isArray(prod.imagenes_servicio) && prod.imagenes_servicio[0]) || 'https://via.placeholder.com/90';
        const srv = prod.nombre || 'Servicio';
        const est = r.estado === 'confirmado';
        const fecha = r.fecha ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '—';
        return `
        <div class="reserva-card ${est ? 'confirmado' : ''}">
            <img src="${img}" class="reserva-img">
            <div style="flex:1;min-width:200px;">
                <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
                    <div><h5 class="fw-bold m-0">${srv}</h5><small class="text-muted">Reserva #${r.id}</small></div>
                    <span class="badge ${est ? 'bg-success' : 'bg-warning text-dark'} text-uppercase">${r.estado}</span>
                </div>
                <div class="row g-2 small mb-2">
                    <div class="col-md-6"><i class="fas fa-user text-primary me-1"></i> <strong>${r.cliente_nombre}</strong></div>
                    <div class="col-md-6"><i class="fas fa-phone text-primary me-1"></i> ${r.cliente_telefono}</div>
                    <div class="col-md-6"><i class="fas fa-calendar text-primary me-1"></i> ${fecha}</div>
                    <div class="col-md-6"><i class="fas fa-clock text-primary me-1"></i> ${r.hora}</div>
                </div>
                <div class="d-flex gap-2 flex-wrap border-top pt-2">
                    ${!est ? `<button class="btn btn-sm btn-success" onclick="confirmarReserva(${r.id})"><i class="fas fa-check"></i> Confirmar y Notificar</button>` : `<span class="text-success small fw-bold"><i class="fas fa-check-circle"></i> Confirmada</span>`}
                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarReserva(${r.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>`;
    }).join('');
}

async function confirmarReserva(id) {
    if (!confirm('¿Confirmar y notificar al cliente?')) return;
    try {
        const res = await fetch(`/api/reservas/${id}/confirmar`, { method: 'PUT' });
        if (!res.ok) throw new Error();
        const r = reservasGlobales.find(x => x.id == id);
        if (r) {
            const prod = r.producto || {};
            const tienda = myStore.nombre || myStore.id;
            const tel = normalizePhone(r.cliente_telefono);
            const f = r.fecha ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : r.fecha;
            const msg = `✅ *Reserva Confirmada* — ${tienda}\n\n¡Hola ${r.cliente_nombre}! Su reserva ha sido CONFIRMADA:\n\n*📋 Servicio:* ${prod.nombre || 'Servicio'}\n*📅 Fecha:* ${f}\n*🕐 Hora:* ${r.hora}\n\n¡Le esperamos! 🙏`;
            if (tel) window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
        }
        await cargarReservas();
    } catch { alert('Error'); }
}

async function eliminarReserva(id) {
    if (!confirm('¿Eliminar?')) return;
    try {
        await fetch(`/api/reservas/${id}`, { method: 'DELETE' });
        reservasGlobales = reservasGlobales.filter(r => r.id !== id);
        filtrarReservas();
    } catch { alert('Error'); }
}

// ============================================================
// PEDIDOS
// ============================================================
async function cargarPedidos() {
    const res = await fetch(`/api/mis-pedidos?tienda=${myStore.id}`);
    pedidosGlobales = await res.json();
    filtrarPedidos();
}

function filtrarPedidos() {
    const q = (document.getElementById('searchOrderCode')?.value || '').toLowerCase().trim();
    const f = pedidosGlobales.filter(o => {
        const c = (o.codigo_cliente || '').toLowerCase();
        const i = o.id.toString();
        return c.includes(q) || i.includes(q);
    });
    renderizarPedidos(f);
}

function renderizarPedidos(orders) {
    const c = document.getElementById('ordersList');
    if (!orders.length) { c.innerHTML = '<div class="alert alert-info text-center py-4">No se encontraron.</div>'; return; }
    c.innerHTML = orders.map(o => {
        const bc = o.estado === 'pendiente' ? 'warning' : (o.estado === 'entregado' ? 'success' : 'primary');
        const items = (o.items || []).map(i => `<div class="d-flex align-items-center gap-2 mb-2"><img src="${i.imagen || 'https://via.placeholder.com/50'}" class="order-img"><div><div class="fw-bold" style="font-size:0.85rem;">${i.qty}x ${i.nombre}</div><div class="text-muted" style="font-size:0.75rem;">$${(i.precio * i.qty).toFixed(2)}</div></div></div>`).join('');
        const contactoBadge = o.contacto_nombre ? `<span class="badge bg-info text-dark ms-1" style="font-size:0.7rem;"><i class="fas fa-user-tie"></i> ${o.contacto_nombre}</span>` : '';
        return `
        <div class="order-card">
            <div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
                <div><h5 class="fw-bold m-0">Pedido #${o.id} ${contactoBadge}</h5><small class="text-muted">${new Date(o.created_at).toLocaleString('es-ES')}</small></div>
                <div class="d-flex gap-2"><span class="badge bg-${bc} text-dark text-uppercase">${o.estado}</span><button class="btn btn-sm btn-outline-danger" onclick="eliminarPedidoIndividual(${o.id})"><i class="fas fa-trash"></i></button></div>
            </div>
            <div class="row g-3 mb-3">
                <div class="col-md-6"><div class="p-3 bg-light rounded-3">${items}</div></div>
                <div class="col-md-6">
                    <div class="small">
                        <div class="mb-1"><i class="fas fa-user text-primary me-1"></i> <strong>${o.nombre}</strong></div>
                        <div class="mb-1"><i class="fas fa-phone text-primary me-1"></i> ${o.telefono}</div>
                        <div class="mb-1"><i class="fas fa-map-marker-alt text-primary me-1"></i> ${o.direccion}</div>
                        ${o.carnet ? `<div class="mb-1"><i class="fas fa-id-card text-primary me-1"></i> Carnet: ${o.carnet}</div>` : ''}
                        <div class="mt-2 fw-bold" style="color:var(--primary); font-size:1.1rem;">Total: $${parseFloat(o.total).toFixed(2)}</div>
                    </div>
                </div>
            </div>
            <div class="d-flex gap-2 flex-wrap border-top pt-3">
                ${(window._planFeatures && window._planFeatures.envio_proveedor === true)
                    ? `<button class="btn btn-sm" style="background:#FFF3E0;color:#B45309;border:1.5px solid #FEE0B0;font-weight:700;" onclick="enviarWhatsAppProveedor(${o.id})"><i class="fab fa-whatsapp"></i> Avisar Proveedor</button>`
                    : ''}
                <button class="btn btn-sm btn-success" style="font-weight:700;" onclick="enviarWhatsAppCliente(${o.id})"><i class="fab fa-whatsapp"></i> Confirmar Cliente</button>
                <button class="btn btn-sm btn-outline-primary" style="font-weight:700;" onclick="abrirChatAdmin(${o.id})"><i class="fas fa-comment-dots"></i> Consultar admin</button>
            </div>
        </div>
    `;
    }).join('');
    window._pedidosCache = orders;
}

async function eliminarPedidoIndividual(id) {
    if (!confirm('¿Eliminar?')) return;
    try {
        await supabaseClient.from('orders').delete().eq('id', id).eq('tienda', myStore.id);
        pedidosGlobales = pedidosGlobales.filter(o => o.id !== id);
        filtrarPedidos();
    } catch { alert('Error'); }
}

async function eliminarTodosLosPedidos() {
    if (!confirm('⚠️ ¿Eliminar TODOS?')) return;
    if (!confirm('¿Seguro?')) return;
    try {
        await supabaseClient.from('orders').delete().eq('tienda', myStore.id);
        pedidosGlobales = [];
        filtrarPedidos();
    } catch { alert('Error'); }
}

function enviarWhatsAppProveedor(id) {
    const o = (window._pedidosCache || []).find(x => x.id == id);
    if (!o) return;
    const it = (o.items && o.items[0]) || {};
    const pi = myProducts.find(p => String(p.id) === String(it.id)) || {};
    const wa = o.whatsapp_destino || pi.whatsapp_proveedor || myStore.configuracion?.datos_bancarios?.whatsapp_confirmacion;
    if (!wa) { alert('❌ Sin WhatsApp configurado'); return; }
    const g = myStore.configuracion?.gestor_venta || {};
    const tn = myStore.nombre || myStore.id;
    let pt = '';
    (o.items || []).forEach(i => {
        const p = myProducts.find(x => String(x.id) === String(i.id)) || {};
        const u = p.imagen_proveedor || i.imagen || 'No adjunta';
        pt += `• ${i.qty}x ${i.nombre}\n   📸 ${u}\n`;
    });
    const contacto = pi.contacto_nombre ? `*Atendido por:* ${pi.contacto_nombre}\n\n` : '';
    const msg = `🚚 *NUEVA VENTA — ${tn}*\n\n${contacto}*📦 Productos:*\n${pt}\n*💰 Total:* $${parseFloat(o.total).toFixed(2)}\n\n*👤 Cliente:* ${o.nombre}\n• Carnet: ${o.carnet || '—'}\n• Tel: ${o.telefono}\n• Dir: ${o.direccion}\n\n*🧑‍💼 Gestor:* ${g.nombre || '—'}\n\n*Pedido:* #${o.id}`;
    const n = normalizePhone(wa);
    if (!n) return;
    window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`, '_blank');
}

function enviarWhatsAppCliente(id) {
    const o = (window._pedidosCache || []).find(x => x.id == id);
    if (!o) return;
    const tn = myStore.nombre || myStore.id;
    const it = (o.items || []).map(i => `• ${i.qty}x ${i.nombre} — $${(i.precio * i.qty).toFixed(2)}`).join('\n');
    const extra = o.contacto_nombre ? `\n*Contacto:* ${o.contacto_nombre}\n` : '';
    const msg = `¡Hola ${o.nombre}! 👋\n\nLe saludamos de *${tn}*.\n\n*🛒 Pedido:*\n${it}\n${extra}\n*💰 Total:* $${parseFloat(o.total).toFixed(2)}\n\n*📦 Envío:* ${o.direccion}\n\n*¿Confirma?* Responda *SÍ*.\n\n¡Gracias! 🙌`;
    const n = normalizePhone(o.telefono);
    if (!n) return;
    window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ============================================================
// MENSAJERÍA CON ADMINISTRACIÓN
// ============================================================
let chatAdminPedidoActual = null;
let chatAdminCache = [];

function _encabezadoMensajeAdmin() {
    const codigo = myStore?.id || '—';
    const email  = currentUser?.email || '—';
    const tienda = myStore?.nombre || '—';
    const ctx    = chatAdminPedidoActual
        ? `📦 PEDIDO: #${chatAdminPedidoActual}`
        : `📢 CONSULTA GENERAL`;
    return [
        '━━━━━━━━━━━━━━━━━━━━━━',
        `📋 REGISTRO: ${codigo}`,
        `📧 EMAIL: ${email}`,
        `🏪 TIENDA: ${tienda}`,
        ctx,
        '━━━━━━━━━━━━━━━━━━━━━━',
        ''
    ].join('\n') + '\n';
}

async function abrirChatAdmin(pedidoId = null) {
    chatAdminPedidoActual = pedidoId || null;
    chatAdminCache = [];

    const headerEl = document.getElementById('chatAdminHeader');
    if (headerEl) {
        headerEl.innerHTML = `
            <div><strong><i class="fas fa-store me-1"></i> ${(myStore?.nombre || '—').replace(/</g,'&lt;')}</strong></div>
            <div class="text-muted mt-1">
                🔑 Código: <code>${myStore?.id || '—'}</code><br>
                📧 ${currentUser?.email || '—'}<br>
                ${pedidoId ? `📦 Contexto: <strong>Pedido #${pedidoId}</strong>` : '📢 Consulta general'}
            </div>
        `;
    }

    document.getElementById('chatAdminInput').value = '';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('chatAdminModal')).show();
    await cargarMensajesAdmin();
}

async function cargarMensajesAdmin() {
    const cont = document.getElementById('chatAdminMensajes');
    if (!cont) return;
    cont.innerHTML = '<p class="text-muted text-center py-4 small"><i class="fas fa-spinner fa-spin"></i> Cargando...</p>';

    try {
        const params = new URLSearchParams({
            tienda_id: myStore.id,
            owner_id: currentUser.id
        });
        if (chatAdminPedidoActual) params.append('pedido_id', chatAdminPedidoActual);

        const res = await fetch(`/api/mensajes-admin?${params}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('API no disponible');
        const data = await res.json();
        chatAdminCache = data.mensajes || data.data || [];

        if (!chatAdminCache.length) {
            cont.innerHTML = '<p class="text-muted text-center py-4 small">Aún no hay mensajes.<br>Escribe el primero 👇</p>';
            return;
        }

        cont.innerHTML = chatAdminCache.map(m => {
            const esMio = (m.remitente === 'tienda' || m.remitente === 'owner' || m.de === 'tienda');
            const hora  = m.created_at ? new Date(m.created_at).toLocaleString('es-ES') : '';
            const txt   = (m.mensaje || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `
                <div class="mb-3 d-flex ${esMio ? 'justify-content-end' : 'justify-content-start'}">
                    <div class="chat-bubble ${esMio ? 'mia' : 'admin'}">
                        <div class="chat-meta">
                            ${esMio ? '📤 Tú' : '👨‍💼 Administración'} · ${hora}
                        </div>
                        <div>${txt}</div>
                    </div>
                </div>
            `;
        }).join('');

        cont.scrollTop = cont.scrollHeight;
    } catch (e) {
        console.warn('Error cargando mensajes admin:', e);
        cont.innerHTML = '<p class="text-muted text-center py-4 small">No se pudo conectar con el servidor. Aun así puedes escribir y el mensaje se enviará al guardarlo.</p>';
    }
}

async function enviarMensajeAdmin() {
    const input = document.getElementById('chatAdminInput');
    const texto = (input?.value || '').trim();
    if (!texto) { alert('Escribe un mensaje antes de enviar.'); return; }

    const encabezado = _encabezadoMensajeAdmin();
    const mensajeCompleto = encabezado + texto;

    const payload = {
        tienda_id:      myStore.id,
        owner_id:       currentUser.id,
        email:          currentUser.email,
        tienda_nombre:  myStore.nombre,
        codigo_tienda:  myStore.id,
        pedido_id:      chatAdminPedidoActual || null,
        remitente:      'tienda',
        mensaje:        texto,
        encabezado:     encabezado,
        mensaje_completo: mensajeCompleto
    };

    try {
        const res = await fetch('/api/mensajes-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || `Error HTTP: ${res.status}`);
        }

        const data = await res.json();
        if (data.success === false) throw new Error(data.error || 'Error del servidor');

        input.value = '';
        await cargarMensajesAdmin();

    } catch (e) {
        console.error(e);
        alert('❌ Error real del servidor:\n\n' + e.message);
    }
}

// ============================================================
// UTILIDADES Y CONFIGURACIÓN
// ============================================================
function copiarInput(id) {
    const i = document.getElementById(id);
    i.select();
    navigator.clipboard.writeText(i.value).then(() => alert('✅ Copiado'));
}

function abrirPausaModal() {
    document.getElementById('pausaMsgSelect').value = 'Volvemos mañana';
    document.getElementById('pausaMsgCustom').style.display = 'none';
    document.getElementById('pausaMsgCustom').value = '';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('pausaModal')).show();
}

function onChangePausaMsg(sel) {
    const c = document.getElementById('pausaMsgCustom');
    if (sel.value === '__custom__') { c.style.display = 'block'; c.focus(); }
    else { c.style.display = 'none'; c.value = ''; }
}

async function confirmarPausa() {
    const sel = document.getElementById('pausaMsgSelect');
    const custom = document.getElementById('pausaMsgCustom');
    let mensaje = sel.value;
    if (mensaje === '__custom__') {
        mensaje = (custom.value || '').trim();
        if (!mensaje) { alert('Escribe un mensaje'); return; }
    }
    try {
        const res = await fetch('/api/mi-tienda/pausar', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ owner_id: currentUser.id, slug: myStore.id, pausar: true, mensaje })
        });
        const d = await res.json();
        if (d.success) {
            myStore.pausada = true;
            myStore.pausada_por = 'owner';
            myStore.pausada_mensaje = mensaje;
            actualizarEstadoPausa();
            actualizarBadgeEstado();
            bootstrap.Modal.getInstance(document.getElementById('pausaModal')).hide();
            alert('✅ Tienda pausada');
            location.reload();
        }
    } catch { alert('Error'); }
}

async function reactivarTienda() {
    if (!confirm('¿Reactivar tu tienda?')) return;
    try {
        const res = await fetch('/api/mi-tienda/pausar', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ owner_id: currentUser.id, slug: myStore.id, pausar: false })
        });
        const d = await res.json();
        if (d.success) {
            myStore.pausada = false;
            myStore.pausada_por = null;
            myStore.pausada_mensaje = null;
            actualizarEstadoPausa();
            actualizarBadgeEstado();
            alert('✅ Tienda reactivada');
            location.reload();
        }
    } catch { alert('Error'); }
}

async function eliminarMiTienda() {
    if (!confirm('⚠️ ¿Eliminar?')) return;
    if (!confirm('¿Seguro?')) return;
    try {
        const res = await fetch(`/api/mi-tienda/${myStore.id}?owner_id=${currentUser.id}`, { method: 'DELETE' });
        const d = await res.json();
        if (d.success) { alert('✅ Eliminada'); await supabaseClient.auth.signOut(); window.location.href = '/'; }
    } catch { alert('Error'); }
}

async function logout() {
    if (!confirm('¿Cerrar sesión?')) return;
    await supabaseClient.auth.signOut();
    window.location.href = '/';
}

// ============================================================
// VISTAS POR PLAN
// ============================================================
async function cargarGraficas() {
    const visitados = document.getElementById('graficaVisitados');
    const vendidos = document.getElementById('graficaVendidos');
    if (visitados) visitados.innerHTML = '<p class="text-muted text-center py-4"><i class="fas fa-spinner fa-spin"></i> Cargando...</p>';
    if (vendidos) vendidos.innerHTML = '<p class="text-muted text-center py-4"><i class="fas fa-spinner fa-spin"></i> Cargando...</p>';
    try {
        const res = await fetch(`/api/mis-pedidos?tienda=${myStore.id}`);
        const pedidos = await res.json();
        const conteo = {};
        (pedidos || []).forEach(p => {
            (p.items || []).forEach(it => {
                if (!conteo[it.id]) conteo[it.id] = { nombre: it.nombre, qty: 0, total: 0, imagen: it.imagen };
                conteo[it.id].qty += it.qty;
                conteo[it.id].total += it.precio * it.qty;
            });
        });
        const ranking = Object.values(conteo).sort((a, b) => b.qty - a.qty).slice(0, 10);
        if (vendidos) {
            if (!ranking.length) {
                vendidos.innerHTML = '<p class="text-muted text-center py-4">Aún no hay ventas registradas.</p>';
            } else {
                const maxQty = ranking[0].qty;
                vendidos.innerHTML = ranking.map((r, i) => `
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div style="width:32px;height:32px;border-radius:50%;background:var(--primary-gradient);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.8rem;flex-shrink:0;">${i + 1}</div>
                        <img src="${r.imagen || 'https://via.placeholder.com/40'}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;">
                        <div style="flex:1;min-width:0;">
                            <div class="fw-bold text-truncate">${r.nombre}</div>
                            <div class="text-muted" style="font-size:0.78rem;">${r.qty} vendidos · $${r.total.toFixed(2)}</div>
                        </div>
                        <div style="width:80px;height:8px;background:#E2E8F0;border-radius:4px;overflow:hidden;flex-shrink:0;">
                            <div style="width:${(r.qty / maxQty * 100).toFixed(0)}%;height:100%;background:var(--primary-gradient);"></div>
                        </div>
                    </div>
                `).join('');
            }
        }
        if (visitados) {
            visitados.innerHTML = `
                <div class="text-center py-4">
                    <i class="fas fa-chart-line fa-2x text-muted mb-2"></i>
                    <p class="text-muted small mb-1">Las estadísticas de visitas se actualizarán pronto.</p>
                    <p class="text-muted" style="font-size:0.75rem;">Mientras tanto, revisa tus productos más vendidos →</p>
                </div>
            `;
        }
    } catch (e) {
        if (visitados) visitados.innerHTML = '<p class="text-danger text-center py-4">Error cargando gráficas</p>';
        if (vendidos) vendidos.innerHTML = '<p class="text-danger text-center py-4">Error cargando gráficas</p>';
    }
}

async function solicitarPromocion() {
    if (!myStore) return;
    const motivo = prompt('Describe brevemente por qué quieres destacar tu tienda:');
    if (motivo === null) return;
    try {
        const res = await fetch('/api/solicitar-multi-tienda', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.id, email: currentUser.email,
                tienda_actual: myStore.id,
                motivo: `[PROMOCIÓN] ${motivo || 'Quiero destacar mi tienda'}`
            })
        });
        const data = await res.json();
        if (data.success) {
            alert('✅ Solicitud de promoción enviada al administrador.');
        } else {
            alert('❌ ' + (data.error || 'Error'));
        }
    } catch (e) { alert('❌ Error de conexión'); }
}

async function cargarClientesCompradores() {
    const cont = document.getElementById('listaClientesCompradores');
    if (!cont) return;
    cont.innerHTML = '<p class="text-muted text-center py-4"><i class="fas fa-spinner fa-spin"></i> Cargando clientes...</p>';
    try {
        const res = await fetch(`/api/mis-pedidos?tienda=${myStore.id}`);
        const pedidos = await res.json();
        const clientes = {};
        (pedidos || []).forEach(p => {
            const tel = normalizePhone(p.telefono);
            if (tel && !clientes[tel]) {
                clientes[tel] = { nombre: p.nombre, telefono: tel, pedidos: 0, total: 0 };
            }
            if (tel) {
                clientes[tel].pedidos++;
                clientes[tel].total += parseFloat(p.total || 0);
            }
        });
        const lista = Object.values(clientes);
        if (!lista.length) {
            cont.innerHTML = '<p class="text-muted text-center py-4">No hay clientes registrados todavía.</p>';
            return;
        }
        cont.innerHTML = `
            <div class="table-responsive">
                <table class="table table-sm mb-0">
                    <thead><tr><th>Cliente</th><th>Teléfono</th><th>Pedidos</th><th>Total</th><th></th></tr></thead>
                    <tbody>
                        ${lista.map(c => `
                            <tr>
                                <td class="fw-semibold">${c.nombre}</td>
                                <td><small>${c.telefono}</small></td>
                                <td>${c.pedidos}</td>
                                <td>$${c.total.toFixed(2)}</td>
                                <td><button class="btn btn-sm btn-success" onclick="enviarWhatsAppClienteEspecifico('${c.telefono}', '${c.nombre.replace(/'/g, "\\'")}')"><i class="fab fa-whatsapp"></i></button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <button class="btn btn-primary mt-3 w-100" onclick="enviarWhatsAppMasivo()"><i class="fab fa-whatsapp me-1"></i> Enviar mensaje a TODOS (${lista.length})</button>
        `;
        window._clientesCompradores = lista;
    } catch (e) {
        cont.innerHTML = '<p class="text-danger text-center py-4">Error cargando clientes</p>';
    }
}

function enviarWhatsAppClienteEspecifico(tel, nombre) {
    const mensaje = document.getElementById('waMensajeMasivo').value.trim();
    if (!mensaje) { alert('Escribe un mensaje primero'); return; }
    const msg = encodeURIComponent(`¡Hola ${nombre}! 👋\n\n${mensaje}\n\n— ${myStore.nombre}`);
    window.open(`https://wa.me/${tel}?text=${msg}`, '_blank');
}

function enviarWhatsAppMasivo() {
    const mensaje = document.getElementById('waMensajeMasivo').value.trim();
    if (!mensaje) { alert('Escribe un mensaje primero'); return; }
    const clientes = window._clientesCompradores || [];
    if (!clientes.length) { alert('No hay clientes'); return; }
    if (!confirm(`¿Enviar a ${clientes.length} clientes? Se abrirán ${clientes.length} pestañas de WhatsApp.`)) return;
    clientes.forEach((c, i) => {
        setTimeout(() => {
            const msg = encodeURIComponent(`¡Hola ${c.nombre}! 👋\n\n${mensaje}\n\n— ${myStore.nombre}`);
            window.open(`https://wa.me/${c.telefono}?text=${msg}`, '_blank');
        }, i * 1500);
    });
}

// Preview automático de URL en campo prodImage
document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('prodImage');
    if (!urlInput) return;
    urlInput.addEventListener('input', function () {
        const url = this.value.trim();
        const preview = document.getElementById('prodImagePreview');
        const img = document.getElementById('prodImagePreviewImg');
        if (url && (url.startsWith('http') || url.startsWith('data:image'))) {
            img.src = url;
            preview.style.display = 'block';
        } else if (!url) {
            preview.style.display = 'none';
        }
    });
});

window.addEventListener('load', checkAuth);