<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mi Panel - Tienda-fg</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #1E64FF;
            --primary-dark: #1248C7;
            --primary-light: #E8F0FE;
            --primary-gradient: linear-gradient(135deg, #1E64FF, #1248C7);
            --success: #10B981;
            --danger: #EF4444;
            --warning: #F59E0B;
            --bg-body: #F4F7FE;
            --bg-card: #FFFFFF;
            --bg-sidebar: #0F172A;
            --text-main: #1A2B4C;
            --text-secondary: #6B7A99;
            --text-muted: #9CA3AF;
            --border-soft: #EEF2F7;
            --shadow-sm: 0 2px 8px rgba(30,100,255,0.05);
            --shadow-md: 0 8px 24px rgba(30,100,255,0.08);
            --shadow-lg: 0 16px 40px rgba(30,100,255,0.12);
            --radius: 16px;
            --radius-sm: 10px;
            --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            --font-display: 'Plus Jakarta Sans', sans-serif;
            --font-body: 'Inter', sans-serif;
            --sidebar-width: 260px;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: var(--font-body);
            background: var(--bg-body);
            color: var(--text-main);
            font-size: 14px;
            line-height: 1.6;
            -webkit-font-smoothing: antialiased;
            overflow-x: hidden;
        }

        .sidebar {
            width: var(--sidebar-width);
            background: var(--bg-sidebar);
            height: 100vh;
            position: fixed;
            left: 0;
            top: 0;
            padding: 24px 16px;
            display: flex;
            flex-direction: column;
            transition: transform 0.3s ease;
            z-index: 1040;
            overflow-y: auto;
            border-right: 1px solid rgba(255,255,255,0.05);
        }

        .sidebar-brand {
            display: flex;
            align-items: center;
            gap: 12px;
            color: white;
            text-decoration: none;
            margin-bottom: 24px;
            padding: 8px 12px;
        }

        .sidebar-brand .brand-icon {
            width: 42px;
            height: 42px;
            background: var(--primary-gradient);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
            color: white;
            flex-shrink: 0;
            box-shadow: 0 4px 12px rgba(30,100,255,0.4);
        }

        .sidebar-brand span {
            font-family: var(--font-display);
            font-weight: 800;
            font-size: 1.15rem;
        }

        .tienda-info-box {
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            padding: 14px;
            margin-bottom: 20px;
            border: 1px solid rgba(255,255,255,0.06);
        }

        .tienda-info-box small {
            color: #64748b;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.65rem;
            letter-spacing: 0.5px;
            display: block;
            margin-bottom: 4px;
        }

        .tienda-info-box .nombre {
            color: white;
            font-weight: 700;
            font-size: 0.95rem;
            margin-bottom: 8px;
            word-break: break-word;
        }

        .nav-item {
            padding: 11px 14px;
            border-radius: 10px;
            color: #94a3b8;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 3px;
            transition: var(--transition);
            border: none;
            background: transparent;
            width: 100%;
            text-align: left;
            font-weight: 500;
            font-size: 0.88rem;
            font-family: var(--font-body);
        }

        .nav-item:hover {
            background: rgba(30,100,255,0.1);
            color: white;
        }

        .nav-item.active {
            background: var(--primary-gradient);
            color: white;
            box-shadow: 0 4px 15px rgba(30,100,255,0.3);
        }

        .nav-item i { width: 20px; text-align: center; font-size: 1rem; flex-shrink: 0; }

        .nav-item.logout {
            margin-top: auto;
            color: #f87171;
        }

        .nav-item.logout:hover {
            background: rgba(239, 68, 68, 0.15);
            color: #f87171;
        }

        .sidebar-overlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(15,23,42,0.5);
            backdrop-filter: blur(4px);
            z-index: 1035;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .sidebar-overlay.active {
            display: block;
            opacity: 1;
        }

        .mobile-menu-btn {
            display: none;
            position: fixed;
            top: 16px;
            left: 16px;
            z-index: 1030;
            background: var(--primary-gradient);
            color: white;
            border: none;
            width: 44px;
            height: 44px;
            border-radius: 12px;
            font-size: 1.1rem;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(30,100,255,0.35);
            align-items: center;
            justify-content: center;
            transition: var(--transition);
        }

        .mobile-menu-btn:active { transform: scale(0.95); }

        .main-content {
            margin-left: var(--sidebar-width);
            padding: 30px 35px;
            min-height: 100vh;
            transition: var(--transition);
        }

        .page-header {
            margin-bottom: 24px;
        }

        .page-header h1 {
            font-family: var(--font-display);
            font-weight: 800;
            font-size: 1.5rem;
            color: var(--text-main);
            margin: 0 0 4px;
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }

        .page-header h1 i { color: var(--primary); }

        .page-header .subtitle {
            color: var(--text-secondary);
            font-size: 0.85rem;
        }

        .card {
            background: var(--bg-card);
            border-radius: var(--radius);
            border: none;
            box-shadow: var(--shadow-sm);
            margin-bottom: 20px;
            overflow: hidden;
            transition: var(--transition);
        }

        .card:hover { box-shadow: var(--shadow-md); }

        .card-header {
            background: transparent;
            border-bottom: 1px solid var(--border-soft);
            padding: 18px 22px;
            font-weight: 700;
            font-family: var(--font-display);
            font-size: 0.95rem;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .card-body { padding: 22px; }

        .table-responsive { overflow-x: auto; -webkit-overflow-scrolling: touch; }

        .table { font-size: 0.85rem; margin-bottom: 0; }

        .table th {
            background: #F8FAFF;
            font-size: 0.7rem;
            text-transform: uppercase;
            color: var(--text-secondary);
            font-weight: 700;
            letter-spacing: 0.5px;
            padding: 12px 14px;
            border-bottom: 2px solid #E2E8F0;
            white-space: nowrap;
        }

        .table td {
            padding: 12px 14px;
            vertical-align: middle;
            border-bottom: 1px solid var(--border-soft);
        }

        .table tr:hover td { background: #F8FAFF; }

        .badge-plan {
            background: #E0F2FE;
            color: #0369A1;
            padding: 5px 12px;
            border-radius: 20px;
            font-weight: 700;
            font-size: 0.7rem;
            text-transform: uppercase;
            display: inline-block;
        }

        .badge-pausada {
            background: #FEF3C7;
            color: #92400E;
            padding: 4px 10px;
            border-radius: 20px;
            font-weight: 700;
            font-size: 0.7rem;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .badge-activa {
            background: #D1FAE5;
            color: #065F46;
            padding: 4px 10px;
            border-radius: 20px;
            font-weight: 700;
            font-size: 0.7rem;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .form-label {
            font-family: var(--font-display);
            font-weight: 600;
            color: var(--text-main);
            margin-bottom: 6px;
            font-size: 0.82rem;
        }

        .form-control, .form-select {
            border-radius: var(--radius-sm);
            border: 1.5px solid #E2E8F0;
            padding: 10px 14px;
            font-size: 0.9rem;
        }

        .form-control:focus, .form-select:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(30,100,255,0.12);
        }

        .btn {
            border-radius: var(--radius-sm);
            font-family: var(--font-display);
            font-weight: 700;
            transition: var(--transition);
            font-size: 0.85rem;
            padding: 10px 18px;
        }

        .btn-primary {
            background: var(--primary-gradient);
            border: none;
            color: white;
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(30,100,255,0.3);
            color: white;
        }

        .btn-sm { padding: 6px 12px; font-size: 0.75rem; }

        #loader {
            position: fixed;
            inset: 0;
            background: white;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
        }

        .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid #E2E8F0;
            border-top-color: var(--primary);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin { 100% { transform: rotate(360deg); } }

        .info-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px dashed var(--border-soft);
            gap: 12px;
            flex-wrap: wrap;
        }

        .info-row:last-child { border-bottom: none; }

        .info-row .label {
            color: var(--text-secondary);
            font-size: 0.85rem;
            font-weight: 500;
        }

        .info-row .value {
            font-weight: 700;
            color: var(--text-main);
            text-align: right;
        }

        .danger-card {
            border: 2px solid #FEE2E2 !important;
        }

        .danger-card .card-header {
            background: #FEF2F2;
            color: #991B1B;
            border-bottom-color: #FECACA;
        }

        .danger-action {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            gap: 12px;
            flex-wrap: wrap;
        }

        .danger-action h6 {
            font-weight: 700;
            margin: 0 0 4px;
            color: var(--text-main);
        }

        .danger-action small {
            color: var(--text-secondary);
            font-size: 0.8rem;
        }

        .modal-content {
            border-radius: var(--radius);
            border: none;
        }

        .modal-header {
            border-bottom: 1px solid var(--border-soft);
            padding: 18px 22px;
        }

        .modal-body { padding: 22px; }

        .modal-footer {
            border-top: 1px solid var(--border-soft);
            padding: 16px 22px;
        }

        .order-card {
            border-left: 4px solid var(--primary);
            padding: 16px 20px;
            background: white;
            border-radius: var(--radius);
            margin-bottom: 12px;
            box-shadow: var(--shadow-sm);
        }

        @media (max-width: 991px) {
            .sidebar {
                transform: translateX(-100%);
                box-shadow: var(--shadow-lg);
            }

            .sidebar.active { transform: translateX(0); }

            .main-content {
                margin-left: 0;
                padding: 76px 16px 30px;
            }

            .mobile-menu-btn { display: flex; }

            .page-header h1 { font-size: 1.25rem; }
        }

        @media (max-width: 575px) {
            .main-content { padding: 72px 12px 24px; }

            .card-body { padding: 16px; }

            .card-header { padding: 14px 16px; font-size: 0.88rem; }

            .page-header h1 { font-size: 1.15rem; }

            .btn { font-size: 0.8rem; padding: 9px 14px; }

            .table th, .table td { padding: 10px 10px; font-size: 0.78rem; }

            .modal-body { padding: 16px; }

            .modal-header, .modal-footer { padding: 14px 16px; }

            .info-row {
                flex-direction: column;
                align-items: flex-start;
            }

            .info-row .value { text-align: left; }
        }

        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
    </style>
</head>
<body>

<div id="loader">
    <div class="spinner"></div>
    <p class="mt-3 text-muted">Verificando acceso...</p>
</div>

<button class="mobile-menu-btn" id="mobileMenuBtn" aria-label="Abrir menú">
    <i class="fas fa-bars"></i>
</button>

<div class="sidebar-overlay" id="sidebarOverlay"></div>

<div class="sidebar" id="sidebar">
    <a href="#" class="sidebar-brand">
        <div class="brand-icon"><i class="fas fa-store"></i></div>
        <span>Mi Tienda</span>
    </a>

    <div class="tienda-info-box">
        <small>Mi Negocio</small>
        <div class="nombre" id="nombreTiendaSidebar">Cargando...</div>
        <div id="estadoTiendaSidebar"></div>
    </div>

    <button class="nav-item active" data-section="products" onclick="showSection('products', this)">
        <i class="fas fa-box"></i> Productos
    </button>
    <button class="nav-item" data-section="orders" onclick="showSection('orders', this)">
        <i class="fas fa-shopping-cart"></i> Pedidos
    </button>
    <button class="nav-item" data-section="settings" onclick="showSection('settings', this)">
        <i class="fas fa-cog"></i> Mi Tienda
    </button>
    
    <button class="nav-item" id="notifBtn" onclick="AdminNotifications.toggle()" style="color: #F59E0B;">
        <i class="fas fa-bell-slash"></i> Activar Notificaciones
    </button>

    <button class="nav-item logout" onclick="logout()">
        <i class="fas fa-sign-out-alt"></i> Cerrar Sesión
    </button>
</div>

<div class="main-content" id="app" style="display:none;">

    <div id="view-products">
        <div class="page-header d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div>
                <h1><i class="fas fa-box"></i> Mis Productos</h1>
                <div class="subtitle">Gestiona tu catálogo</div>
            </div>
            <button class="btn btn-primary" onclick="abrirModalProducto()">
                <i class="fas fa-plus me-1"></i> Nuevo Producto
            </button>
        </div>
        <div class="card p-0">
            <div class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead>
                        <tr>
                            <th>Img</th>
                            <th>Nombre</th>
                            <th>Precio</th>
                            <th>Stock</th>
                            <th style="text-align:right;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="productsList"></tbody>
                </table>
            </div>
        </div>
    </div>

    <div id="view-orders" style="display:none;">
        <div class="page-header">
            <h1><i class="fas fa-shopping-cart"></i> Pedidos Recibidos</h1>
            <div class="subtitle">Tus pedidos en tiempo real</div>
        </div>
        <div id="ordersList"></div>
    </div>

    <div id="view-settings" style="display:none;">
        <div class="page-header">
            <h1><i class="fas fa-cog"></i> Mi Tienda</h1>
            <div class="subtitle">Configuración y datos de tu negocio</div>
        </div>

        <div class="card">
            <div class="card-header"><i class="fas fa-info-circle"></i> Información</div>
            <div class="card-body">
                <div class="info-row">
                    <span class="label">Plan actual</span>
                    <span class="value"><span class="badge-plan" id="badgePlan">-</span></span>
                </div>
                <div class="info-row">
                    <span class="label">Estado</span>
                    <span class="value" id="badgeEstado">-</span>
                </div>
                <div class="info-row">
                    <span class="label">Fecha de vencimiento</span>
                    <span class="value" id="fechaVencimiento">-</span>
                </div>
                <div class="info-row">
                    <span class="label">Productos permitidos</span>
                    <span class="value" id="maxProductos">-</span>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header"><i class="fas fa-link"></i> Enlaces de mi Tienda</div>
            <div class="card-body">
                <div class="mb-3">
                    <label class="form-label">🌐 URL Pública (para tus clientes)</label>
                    <div class="d-flex gap-2 flex-wrap">
                        <input type="text" id="miUrlTienda" class="form-control flex-grow-1" readonly>
                        <button class="btn btn-outline-primary" onclick="copiarInput('miUrlTienda')" title="Copiar">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                    <small class="text-muted">Comparte este enlace con tus clientes.</small>
                </div>
                <div class="mb-0">
                    <label class="form-label">🔒 URL de mi Panel (privada)</label>
                    <div class="d-flex gap-2 flex-wrap">
                        <input type="text" id="miUrlAdmin" class="form-control flex-grow-1" readonly>
                        <button class="btn btn-outline-primary" onclick="copiarInput('miUrlAdmin')" title="Copiar">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                    <small class="text-muted">Solo tú puedes acceder aquí.</small>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header"><i class="fas fa-coins"></i> Tasa de Cambio de mi Tienda</div>
            <div class="card-body">
                <p class="text-muted small mb-3">
                    Define cuántos CUP vale 1 USD y 1 EUR en tu tienda.
                    Tus clientes verán los precios convertidos automáticamente.
                </p>
                <div class="row g-3">
                    <div class="col-md-6">
                        <label class="form-label">1 USD = CUP</label>
                        <div class="input-group">
                            <span class="input-group-text">$</span>
                            <input type="number" step="0.01" id="miRateUSD" class="form-control">
                            <span class="input-group-text">CUP</span>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">1 EUR = CUP</label>
                        <div class="input-group">
                            <span class="input-group-text">€</span>
                            <input type="number" step="0.01" id="miRateEUR" class="form-control">
                            <span class="input-group-text">CUP</span>
                        </div>
                    </div>
                </div>
                <button class="btn btn-primary mt-3" onclick="guardarTasasMiTienda()">
                    <i class="fas fa-save me-1"></i> Guardar Tasas
                </button>
            </div>
        </div>

        <div class="card danger-card">
            <div class="card-header"><i class="fas fa-exclamation-triangle"></i> Zona de Peligro</div>
            <div class="card-body">
                <div class="danger-action">
                    <div>
                        <h6>Pausar Tienda</h6>
                        <small>Los clientes no podrán acceder a tu tienda temporalmente.</small>
                    </div>
                    <button class="btn btn-warning" id="btnPausarTienda" onclick="togglePausarTienda()">
                        <i class="fas fa-pause"></i> Pausar
                    </button>
                </div>
                <hr class="my-3">
                <div class="danger-action">
                    <div>
                        <h6>Eliminar Tienda</h6>
                        <small>Irreversible. Se borrarán productos, pedidos y reservas.</small>
                    </div>
                    <button class="btn btn-danger" onclick="eliminarMiTienda()">
                        <i class="fas fa-trash"></i> Eliminar Tienda
                    </button>
                </div>
            </div>
        </div>
    </div>

</div>

<div class="modal fade" id="productoModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="fw-bold m-0"><i class="fas fa-box me-2" style="color:var(--primary);"></i> Producto</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" id="prodId">
                <div class="mb-3">
                    <label class="form-label">Nombre *</label>
                    <input type="text" id="prodName" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Descripción</label>
                    <textarea id="prodDesc" class="form-control" rows="2"></textarea>
                </div>
                <div class="row">
                    <div class="col-6 mb-3">
                        <label class="form-label">Precio (CUP) *</label>
                        <input type="number" id="prodPrice" class="form-control" required min="0" step="0.01">
                    </div>
                    <div class="col-6 mb-3">
                        <label class="form-label">Descuento (%)</label>
                        <input type="number" id="prodDiscount" class="form-control" value="0" min="0" max="100">
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Categoría</label>
                    <select id="prodCategory" class="form-select"></select>
                </div>
                <div class="mb-0">
                    <label class="form-label">URL Imagen</label>
                    <input type="text" id="prodImage" class="form-control" placeholder="https://...">
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button class="btn btn-primary" onclick="guardarProducto()">
                    <i class="fas fa-save me-1"></i> Guardar
                </button>
            </div>
        </div>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<!-- 🚨 CRÍTICO: Cargar notificaciones.js ANTES del script principal -->
<script src="/js/admin/notifications.js?v=21"></script>
<script>
    let supabaseClient;
    let currentUser;
    let myStore = null;
    let myProducts = [];

    // 🚨 DEFINIR AdminApp GLOBAL PARA QUE notifications.js LO ENCUENTRE
    window.AdminApp = window.AdminApp || {
        tiendaActual: null,
        tiendasDisponibles: []
    };

    // ========== MENÚ RESPONSIVE ==========
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const mobileBtn = document.getElementById('mobileMenuBtn');

    function abrirMenu() {
        sidebar.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function cerrarMenu() {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    mobileBtn.addEventListener('click', () => {
        if (sidebar.classList.contains('active')) cerrarMenu();
        else abrirMenu();
    });

    overlay.addEventListener('click', cerrarMenu);

    // ========== SUPABASE ==========
    async function initSupabase() {
        const res = await fetch('/api/public-config');
        const config = await res.json();
        supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    }

    // ========== AUTH ==========
    async function checkAuth() {
        await initSupabase();
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (!session || !session.user) {
            window.location.href = '/';
            return;
        }

        currentUser = session.user;

        const urlParams = new URLSearchParams(window.location.search);
        const tiendaSlug = urlParams.get('tienda');

        try {
            let storeData = null;

            if (tiendaSlug) {
                const res = await fetch(`/api/mi-tienda?owner_id=${currentUser.id}&slug=${tiendaSlug}`);
                const data = await res.json();
                if (data.success) storeData = data.store;
            } else {
                const res = await fetch(`/api/mi-tienda?owner_id=${currentUser.id}`);
                const data = await res.json();
                if (data.success) storeData = data.store;
            }

            if (!storeData) {
                alert('No tienes acceso a esta tienda.');
                window.location.href = '/';
                return;
            }

            myStore = storeData;
            
            // 🚨 GUARDAR EN AdminApp PARA NOTIFICACIONES PUSH
            window.AdminApp.tiendaActual = myStore.id;
            window.AdminApp.tiendasDisponibles = [myStore];

            document.getElementById('nombreTiendaSidebar').innerText = myStore.nombre;

            const baseUrl = window.location.origin;
            document.getElementById('miUrlTienda').value = `${baseUrl}/?tienda=${myStore.id}`;
            document.getElementById('miUrlAdmin').value = `${baseUrl}/admin-cliente?tienda=${myStore.id}`;

            document.getElementById('badgePlan').innerText = (myStore.plan || 'prueba').toUpperCase();
            document.getElementById('maxProductos').innerText = `${myStore.max_productos || 10} productos`;
            document.getElementById('fechaVencimiento').innerText = myStore.fecha_vencimiento
                ? new Date(myStore.fecha_vencimiento).toLocaleDateString('es-ES')
                : 'Sin fecha';

            actualizarEstadoPausa();
            actualizarBadgeEstado();

            const tasas = myStore.configuracion?.tasas || { USD: 0.04, EUR: 0.037 };
            const usdRate = tasas.USD ? 1 / tasas.USD : 25;
            const eurRate = tasas.EUR ? 1 / tasas.EUR : 27;
            document.getElementById('miRateUSD').value = usdRate.toFixed(2);
            document.getElementById('miRateEUR').value = eurRate.toFixed(2);

            // 🚨 INICIALIZAR NOTIFICACIONES (AHORA SÍ FUNCIONA)
            if (window.AdminNotifications) {
                AdminNotifications.init().catch(console.error);
            }

            document.getElementById('loader').style.display = 'none';
            document.getElementById('app').style.display = 'block';

            await cargarProductos();
        } catch (e) {
            console.error(e);
            window.location.href = '/';
        }
    }

    // ========== ESTADO VISUAL ==========
    function actualizarBadgeEstado() {
        const el = document.getElementById('badgeEstado');
        if (!el) return;
        if (myStore.pausada) {
            el.innerHTML = '<span class="badge-pausada"><i class="fas fa-pause"></i>Pausada</span>';
        } else {
            el.innerHTML = '<span class="badge-activa"><i class="fas fa-check"></i>Activa</span>';
        }
        const sidebarEstado = document.getElementById('estadoTiendaSidebar');
        if (sidebarEstado) {
            sidebarEstado.innerHTML = myStore.pausada
                ? '<span class="badge-pausada" style="font-size:0.62rem;">Pausada</span>'
                : '<span class="badge-activa" style="font-size:0.62rem;">Activa</span>';
        }
    }

    function actualizarEstadoPausa() {
        const btn = document.getElementById('btnPausarTienda');
        if (!btn) return;
        if (myStore.pausada) {
            btn.innerHTML = '<i class="fas fa-play"></i> Reactivar';
            btn.className = 'btn btn-success';
        } else {
            btn.innerHTML = '<i class="fas fa-pause"></i> Pausar';
            btn.className = 'btn btn-warning';
        }
    }

    // ========== NAVEGACIÓN ==========
    function showSection(section, btn) {
        document.getElementById('view-products').style.display = section === 'products' ? 'block' : 'none';
        document.getElementById('view-orders').style.display = section === 'orders' ? 'block' : 'none';
        document.getElementById('view-settings').style.display = section === 'settings' ? 'block' : 'none';

        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');

        if (section === 'orders') cargarPedidos();

        if (window.innerWidth < 992) cerrarMenu();
    }

    // ========== PRODUCTOS ==========
    async function cargarProductos() {
        const res = await fetch(`/api/mis-productos?tienda=${myStore.id}`);
        myProducts = await res.json();
        const tbody = document.getElementById('productsList');

        if (!myProducts.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No hay productos. Agrega uno nuevo.</td></tr>';
            return;
        }

        tbody.innerHTML = myProducts.map(p => `
            <tr>
                <td>
                    <img src="${p.imagen || 'https://via.placeholder.com/40'}"
                         style="width:40px;height:40px;border-radius:8px;object-fit:cover;"
                         onerror="this.src='https://via.placeholder.com/40'">
                </td>
                <td class="fw-semibold">${p.nombre}</td>
                <td>$${parseFloat(p.precio).toFixed(2)}</td>
                <td>${p.disponible ? '<span class="badge bg-success">Disponible</span>' : '<span class="badge bg-danger">Agotado</span>'}</td>
                <td style="text-align:right;">
                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarProducto(${p.id})" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    async function abrirModalProducto() {
        const limite = myStore.max_productos || 10;
        if (myProducts.length >= limite) {
            alert(`Has alcanzado el límite de ${limite} productos de tu plan.`);
            return;
        }

        document.getElementById('prodId').value = '';
        document.getElementById('prodName').value = '';
        document.getElementById('prodDesc').value = '';
        document.getElementById('prodPrice').value = '';
        document.getElementById('prodDiscount').value = '0';
        document.getElementById('prodImage').value = '';

        const cats = myStore.categorias || ['otros'];
        document.getElementById('prodCategory').innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');

        new bootstrap.Modal(document.getElementById('productoModal')).show();
    }

    async function guardarProducto() {
        const nombre = document.getElementById('prodName').value.trim();
        const precio = parseFloat(document.getElementById('prodPrice').value);

        if (!nombre || !precio || precio <= 0) {
            alert('Nombre y precio válido son obligatorios');
            return;
        }

        const payload = {
            tienda: myStore.id,
            nombre: nombre,
            descripcion: document.getElementById('prodDesc').value,
            precio: precio,
            descuento: parseInt(document.getElementById('prodDiscount').value) || 0,
            categoria: document.getElementById('prodCategory').value,
            imagen: document.getElementById('prodImage').value || 'https://via.placeholder.com/300',
            disponible: true
        };

        const res = await fetch('/api/mis-productos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            bootstrap.Modal.getInstance(document.getElementById('productoModal')).hide();
            await cargarProductos();
        } else {
            const data = await res.json().catch(() => ({}));
            alert('Error al guardar: ' + (data.error || 'Desconocido'));
        }
    }

    async function eliminarProducto(id) {
        if (!confirm('¿Eliminar este producto?')) return;
        await fetch(`/api/mis-productos/${id}`, { method: 'DELETE' });
        await cargarProductos();
    }

    // ========== PEDIDOS ==========
    async function cargarPedidos() {
        const res = await fetch(`/api/mis-pedidos?tienda=${myStore.id}`);
        const orders = await res.json();
        const container = document.getElementById('ordersList');

        if (!orders.length) {
            container.innerHTML = '<div class="alert alert-info">Aún no tienes pedidos.</div>';
            return;
        }

        container.innerHTML = orders.map(o => `
            <div class="order-card">
                <div class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
                    <h5 class="fw-bold m-0">Pedido #${o.id}</h5>
                    <span class="badge bg-primary">${o.estado}</span>
                </div>
                <p class="mb-1"><strong>Cliente:</strong> ${o.nombre} - ${o.telefono}</p>
                <p class="mb-1"><strong>Dirección:</strong> ${o.direccion}</p>
                <p class="mb-0"><strong>Total:</strong> $${parseFloat(o.total).toFixed(2)} ${o.moneda || 'CUP'}</p>
            </div>
        `).join('');
    }

    // ========== UTILIDADES ==========
    function copiarInput(id) {
        const input = document.getElementById(id);
        input.select();
        navigator.clipboard.writeText(input.value).then(() => alert('✅ URL copiada'));
    }

    // ========== TASAS DE CAMBIO ==========
    async function guardarTasasMiTienda() {
        const usd = parseFloat(document.getElementById('miRateUSD').value);
        const eur = parseFloat(document.getElementById('miRateEUR').value);

        if (isNaN(usd) || isNaN(eur) || usd <= 0 || eur <= 0) {
            alert('❌ Ingresa valores válidos (mayores a 0)');
            return;
        }

        try {
            const res = await fetch('/api/mi-tienda/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    owner_id: currentUser.id,
                    slug: myStore.id,
                    configuracion: {
                        tasas: { CUP: 1, USD: 1 / usd, EUR: 1 / eur }
                    }
                })
            });
            const data = await res.json();
            if (data.success) {
                alert('✅ Tasas guardadas correctamente');
                myStore.configuracion = data.configuracion;
            } else {
                alert('Error: ' + (data.error || 'Desconocido'));
            }
        } catch {
            alert('Error de conexión');
        }
    }

    // ========== PAUSAR / REANUDAR ==========
    async function togglePausarTienda() {
        const pausar = !myStore.pausada;
        const accion = pausar ? 'pausar' : 'reactivar';

        if (!confirm(`¿Estás seguro de ${accion} tu tienda?`)) return;

        try {
            const res = await fetch('/api/mi-tienda/pausar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    owner_id: currentUser.id,
                    slug: myStore.id,
                    pausar: pausar
                })
            });

            const data = await res.json();
            if (data.success) {
                myStore.pausada = data.pausada;
                actualizarEstadoPausa();
                actualizarBadgeEstado();
                alert(pausar ? '✅ Tienda pausada' : '✅ Tienda reactivada');
            } else {
                alert('Error: ' + (data.error || 'Desconocido'));
            }
        } catch {
            alert('Error de conexión');
        }
    }

    // ========== ELIMINAR TIENDA ==========
    async function eliminarMiTienda() {
        if (!confirm('⚠️ ¿ELIMINAR tu tienda? Se borrarán TODOS los productos, pedidos y reservas. Esta acción NO se puede deshacer.')) return;
        if (!confirm('¿Estás COMPLETAMENTE seguro? Esta es tu última oportunidad de cancelar.')) return;

        try {
            const res = await fetch(`/api/mi-tienda/${myStore.id}?owner_id=${currentUser.id}`, {
                method: 'DELETE'
            });

            const data = await res.json();
            if (data.success) {
                alert('✅ Tu tienda ha sido eliminada. Serás redirigido.');
                await supabaseClient.auth.signOut();
                window.location.href = '/';
            } else {
                alert('Error: ' + (data.error || 'Desconocido'));
            }
        } catch {
            alert('Error de conexión');
        }
    }

    // ========== LOGOUT ==========
    async function logout() {
        if (!confirm('¿Cerrar sesión?')) return;
        await supabaseClient.auth.signOut();
        window.location.href = '/';
    }

    // ========== INIT ==========
    window.addEventListener('load', checkAuth);
</script>
</body>
</html>