// FIX: Detectar ?registro=1 lo antes posible para ocultar la tienda
(function() {
    try {
        var urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('registro') === '1') {
            document.documentElement.classList.add('registro-mode');
        }
    } catch (e) {}
})();

window.supabaseClient = null;
let globalConfig = null;
let pagoDataTemporal = null;
let metodosAdminGlobal = {};

async function initSupabase() {
    if(window.supabaseClient) return;
    const res = await fetch('/api/public-config');
    globalConfig = await res.json();
    window.supabaseClient = window.supabase.createClient(globalConfig.supabaseUrl, globalConfig.supabaseAnonKey);
}

function openOverlay(type) { const id = 'overlay' + type.charAt(0).toUpperCase() + type.slice(1); const el = document.getElementById(id); if (el) { el.classList.add('active'); document.body.style.overflow = 'hidden'; } }
function closeOverlay(type) { const id = 'overlay' + type.charAt(0).toUpperCase() + type.slice(1); const el = document.getElementById(id); if (el) { el.classList.remove('active'); document.body.style.overflow = ''; } }
function closeAllOverlays() { document.querySelectorAll('.fullscreen-overlay').forEach(el => el.classList.remove('active')); document.body.style.overflow = ''; }

let currentUser;
let planElegido = 'prueba';
let planTexto = 'Prueba Gratis';
let totalPago = 0;
let codigoPago = null;

const preciosPlanes = { 'basico': 1000, 'pro': 1500, 'premium': 2500 };

function obtenerMetodosCacheados() {
    try {
        const cached = localStorage.getItem('fg_metodos_pago_cache');
        if (cached) return JSON.parse(cached);
    } catch (e) {}
    return {};
}
function guardarMetodosCacheados(data) {
    try {
        if (data && (data.bank || data.whatsapp)) {
            localStorage.setItem('fg_metodos_pago_cache', JSON.stringify(data));
        }
    } catch (e) {}
}

async function asegurarMetodosPagoCargados() {
    if (metodosAdminGlobal && metodosAdminGlobal.bank) return metodosAdminGlobal;
    const cached = obtenerMetodosCacheados();
    if (cached && cached.bank) metodosAdminGlobal = cached;
    try {
        const res = await fetch('/api/payment-methods');
        if (res.ok) {
            const data = await res.json();
            if (data && (data.bank || data.whatsapp)) {
                metodosAdminGlobal = data;
                guardarMetodosCacheados(data);
            }
        }
    } catch (e) { console.error('Error cargando métodos de pago:', e); }
    return metodosAdminGlobal;
}

function getDeviceId() {
    let deviceId = localStorage.getItem('fg_device_id');
    if (!deviceId) {
        deviceId = 'DEV-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10).toUpperCase();
        localStorage.setItem('fg_device_id', deviceId);
    }
    return deviceId;
}

async function verificarDispositivoBloqueado() {
    const deviceId = getDeviceId();
    try {
        const res = await fetch(`/api/check-device-block/${encodeURIComponent(deviceId)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.blocked) {
                localStorage.setItem('fg_dispositivo_bloqueado', '1');
                return { hasStore: !!data.tienda_existente, blocked: true, reason: data.reason, permanent: data.permanent === true };
            } else {
                localStorage.removeItem('fg_dispositivo_bloqueado');
                localStorage.removeItem('fg_registro_abandonado');
                return { hasStore: false, blocked: false, reason: '' };
            }
        }
    } catch (e) { console.error('Error consultando bloqueo en server:', e); }
    const abandonado = localStorage.getItem('fg_registro_abandonado');
    if (abandonado) {
        const timestamp = parseInt(abandonado);
        const horasPasadas = (Date.now() - timestamp) / (1000 * 60 * 60);
        if (horasPasadas >= 24) {
            localStorage.setItem('fg_dispositivo_bloqueado', '1');
            return { hasStore: false, blocked: true, reason: 'El plazo de 24 horas ha expirado. La opción de crear una tienda ha sido desactivada para este dispositivo.' };
        }
    }
    if (localStorage.getItem('fg_dispositivo_bloqueado') === '1') {
        return { hasStore: false, blocked: true, reason: 'Este dispositivo ha sido bloqueado para crear nuevas tiendas.' };
    }
    return { hasStore: false, blocked: false, reason: '' };
}

function mostrarModalBloqueo(motivo) {
    const deviceId = getDeviceId();
    const modalHtml = `
        <div class="modal fade" id="bloqueoModal" tabindex="-1" data-bs-backdrop="static">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content" style="border-radius: 24px; border: none; overflow: hidden;">
                    <div class="modal-body" style="padding: 40px 30px; text-align: center;">
                        <div style="width: 80px; height: 80px; background: #FEE2E2; color: #EF4444; border-radius: 50%; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center; font-size: 2.5rem;"><i class="fas fa-ban"></i></div>
                        <h2 style="font-weight: 800; color: #1A2B4C; margin-bottom: 12px;">Acceso restringido</h2>
                        <p style="color: #6B7A99; margin-bottom: 16px; line-height: 1.6;">${motivo}</p>
                        <p style="font-size: 0.78rem; color: #9CA3AF; margin-bottom: 20px;">Dispositivo: <code style="background:#F1F5F9;padding:2px 6px;border-radius:4px;font-size:0.7rem;">${deviceId}</code></p>
                        <button onclick="solicitarDesbloqueoDispositivo('${deviceId}')" class="btn btn-primary w-100" style="padding: 14px; border-radius: 12px; font-weight: 700; margin-bottom: 8px; background: linear-gradient(135deg, #1E64FF, #1248C7); border: none;"><i class="fas fa-paper-plane me-2"></i> Solicitar desbloqueo al admin</button>
                        <a href="https://wa.me/5353571569?text=Hola,%20mi%20dispositivo%20${encodeURIComponent(deviceId)}%20fue%20bloqueado%20al%20intentar%20crear%20una%20tienda" target="_blank" rel="noopener" class="btn btn-outline-primary w-100" style="padding: 14px; border-radius: 12px; font-weight: 700; margin-bottom: 8px;"><i class="fab fa-whatsapp me-2"></i> Contactar por WhatsApp</a>
                        <button class="btn btn-outline-secondary w-100" onclick="cerrarModalBloqueo()" style="padding: 14px; border-radius: 12px; font-weight: 700;">Entendido</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    const old = document.getElementById('bloqueoModal');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    new bootstrap.Modal(document.getElementById('bloqueoModal')).show();
}

async function solicitarDesbloqueoDispositivo(deviceId) {
    if (!deviceId) return;
    const motivo = prompt('Explica brevemente por qué necesitas desbloqueo (opcional):') || '';
    try {
        const res = await fetch('/api/solicitar-desbloqueo', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: deviceId, motivo })
        });
        const data = await res.json();
        if (data.success) {
            alert('✅ Solicitud enviada al administrador.\n\nTe contactará para procesar tu desbloqueo.');
            cerrarModalBloqueo();
        } else {
            alert('❌ ' + (data.error || 'Error al enviar la solicitud'));
        }
    } catch (e) { alert('❌ Error de conexión'); }
}
function cerrarModalBloqueo() {
    const modalEl = document.getElementById('bloqueoModal');
    if (modalEl) {
        const inst = bootstrap.Modal.getInstance(modalEl);
        if (inst) inst.hide();
        setTimeout(() => modalEl.remove(), 300);
    }
}

function mostrarModalContinuarRegistro(onSi, onNo) {
    const modalHtml = `
        <div class="modal fade" id="continuarRegistroModal" tabindex="-1" data-bs-backdrop="static">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content" style="border-radius: 24px; border: none; overflow: hidden;">
                    <div class="modal-body" style="padding: 40px 30px; text-align: center;">
                        <div style="width: 80px; height: 80px; background: #FEF3C7; color: #F59E0B; border-radius: 50%; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center; font-size: 2.5rem;"><i class="fas fa-user-check"></i></div>
                        <h2 style="font-weight: 800; color: #1A2B4C; margin-bottom: 12px;">Ya se registró</h2>
                        <p style="color: #6B7A99; margin-bottom: 24px; line-height: 1.6;">Detectamos que ya inició sesión con Google pero aún no crea su tienda. ¿Desea continuar con la creación de su proyecto?</p>
                        <button id="btnContinuarSi" class="btn btn-primary w-100" style="padding: 14px; border-radius: 12px; font-weight: 700; margin-bottom: 8px; background: linear-gradient(135deg, #1E64FF, #1248C7); border: none;"><i class="fas fa-arrow-right me-2"></i> Sí, continuar</button>
                        <button id="btnContinuarNo" class="btn btn-outline-secondary w-100" style="padding: 14px; border-radius: 12px; font-weight: 700;">No, más tarde</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    const old = document.getElementById('continuarRegistroModal');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('continuarRegistroModal');
    const modal = new bootstrap.Modal(modalEl);
    document.getElementById('btnContinuarSi').onclick = function() {
        modal.hide();
        setTimeout(() => modalEl.remove(), 300);
        if (onSi) onSi();
    };
    document.getElementById('btnContinuarNo').onclick = function() {
        modal.hide();
        setTimeout(() => modalEl.remove(), 300);
        if (onNo) onNo();
    };
    modal.show();
}

function iniciarCuentaRegresivaAbandono() {
    localStorage.setItem('fg_registro_abandonado', Date.now().toString());
}

function mostrarAdvertenciaCuentaRegresivaSiAplica() {
    const abandonado = localStorage.getItem('fg_registro_abandonado');
    if (!abandonado) return false;
    const timestamp = parseInt(abandonado);
    const horasPasadas = (Date.now() - timestamp) / (1000 * 60 * 60);
    if (horasPasadas >= 24) return false;
    const horasRestantes = Math.ceil(24 - horasPasadas);
    const msg = `Tienes ${horasRestantes} hora(s) restante(s) para crear tu tienda. Si no la creas en 24 horas, la opción de crear será eliminada para este dispositivo.`;
    setTimeout(() => {
        const toast = document.getElementById('toast');
        if (toast) {
            const toastMsg = document.getElementById('toastMsg');
            if (toastMsg) toastMsg.innerText = msg;
            toast.classList.add('mostrar');
            setTimeout(() => toast.classList.remove('mostrar'), 6000);
        }
    }, 1500);
    return true;
}

function mostrarPagoModal() {
    var modalEl = document.getElementById('pagoPlanModal');
    if (!modalEl) return;
    try {
        var inst = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
        inst.show();
    } catch (e) {
        modalEl.style.display = 'block';
        modalEl.classList.add('show');
    }
}
function cerrarPagoModal() {
    var modalEl = document.getElementById('pagoPlanModal');
    if (!modalEl) return;
    try {
        var inst = bootstrap.Modal.getInstance(modalEl);
        if (inst) { inst.hide(); }
        else { modalEl.style.display = 'none'; modalEl.classList.remove('show'); }
    } catch (e) {
        modalEl.style.display = 'none';
        modalEl.classList.remove('show');
    }
    document.querySelectorAll('.modal-backdrop').forEach(function(b){ b.remove(); });
    document.body.classList.remove('modal-open');
}

function mostrarBannerPendiente() {
    var banner = document.getElementById('resumePaymentBanner');
    if (banner) banner.style.display = 'flex';
}
function ocultarBannerPendiente() {
    var banner = document.getElementById('resumePaymentBanner');
    if (banner) banner.style.display = 'none';
}

async function checkPendingPaymentValidity() {
    ocultarBannerPendiente();
    const savedPayment = localStorage.getItem('fg_pago_pendiente');
    if (!savedPayment || savedPayment === 'null' || savedPayment === 'undefined') {
        pagoDataTemporal = null;
        return;
    }
    let data;
    try { data = JSON.parse(savedPayment); } catch (e) { localStorage.removeItem('fg_pago_pendiente'); pagoDataTemporal = null; return; }
    if (!data || !data.codigo || !data.plan) { localStorage.removeItem('fg_pago_pendiente'); pagoDataTemporal = null; return; }
    try {
        const res = await fetch(`/api/pagos/check/${encodeURIComponent(data.codigo)}`);
        if (!res.ok) { throw new Error('Respuesta no OK'); }
        const status = await res.json();
        if (status && status.valido === true) {
            pagoDataTemporal = data;
            mostrarBannerPendiente();
        } else {
            localStorage.removeItem('fg_pago_pendiente');
            pagoDataTemporal = null;
            codigoPago = null;
        }
    } catch (e) { pagoDataTemporal = null; }
}

window.addEventListener('load', async () => {
    checkSession();
    await checkPendingPaymentValidity();
    await asegurarMetodosPagoCargados();
});

function discardPendingPayment() {
    if (!confirm('¿Estás seguro de que deseas cancelar este pago? Se perderá el ticket generado.')) return;
    localStorage.removeItem('fg_pago_pendiente');
    ocultarBannerPendiente();
    pagoDataTemporal = null;
    codigoPago = null;
}

async function resumePayment() {
    if (!pagoDataTemporal) {
        const savedPayment = localStorage.getItem('fg_pago_pendiente');
        if (savedPayment) { try { pagoDataTemporal = JSON.parse(savedPayment); } catch (e) { pagoDataTemporal = null; } }
    }
    if (!pagoDataTemporal) return;
    planElegido = pagoDataTemporal.plan;
    codigoPago = pagoDataTemporal.codigo;
    totalPago = pagoDataTemporal.total;
    ocultarBannerPendiente();
    await asegurarMetodosPagoCargados();
    mostrarInstruccionesPago();
}

async function elegirPlan(plan) {
    planElegido = plan;
    const nombres = { 'prueba': 'Prueba Gratis', 'basico': 'Plan Básico (1000 CUP/mes)', 'pro': 'Plan Pro (1500 CUP/mes)', 'premium': 'Plan Premium (2500 CUP/mes)' };
    planTexto = nombres[plan] || 'Prueba Gratis';
    const verificacion = await verificarDispositivoBloqueado();
    if (verificacion.blocked) { mostrarModalBloqueo(verificacion.reason); return; }
    if (plan === 'prueba') {
        document.getElementById('planSeleccionadoTexto').innerText = planTexto;
        document.getElementById('regPlan').value = plan;
        closeAllOverlays();
        abrirRegistroModal();
        return;
    }
    await asegurarMetodosPagoCargados();
    const bankNumber = metodosAdminGlobal.bank || '⚠️ Tarjeta no configurada por el Admin';
    const esTarjetaValida = !bankNumber.includes('no configurada');
    document.getElementById('pagoModalBody').innerHTML = `
        <div style="width: 70px; height: 70px; background: #FEF3C7; color: #D97706; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; font-size: 2rem;"><i class="fas fa-credit-card"></i></div>
        <h3 style="font-weight: 800; color: #1A2B4C; margin-bottom: 8px;">Pago de Suscripción</h3>
        <p style="color: #6B7A99; margin-bottom: 20px;">Estás a un paso de activar el <strong>${planTexto}</strong>.</p>
        <div style="background: #F8FAFF; border: 1.5px dashed #1E64FF; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
            <p style="font-size: 0.85rem; color: #6B7A99; margin-bottom: 8px;">Transfiere a esta tarjeta:</p>
            <div style="display:flex; align-items:center; justify-content:center; gap:10px;">
                <div style="font-family: monospace; font-size: 1.2rem; font-weight: 800; color: #1A2B4C;" id="bankCardText">${bankNumber}</div>
                ${esTarjetaValida ? `<button onclick="copiarTarjeta('${bankNumber}')" class="btn btn-sm btn-outline-primary" style="border-radius:8px; padding:4px 10px;" title="Copiar tarjeta"><i class="fas fa-copy"></i></button>` : ''}
            </div>
        </div>
        <div class="text-start mb-3">
            <label class="form-label fw-bold">Nombre Completo</label>
            <input type="text" id="pagoNombre" class="form-control mb-2" placeholder="Tu nombre">
            <label class="form-label fw-bold">Teléfono / WhatsApp</label>
            <input type="text" id="pagoTelefono" class="form-control mb-2" placeholder="+53 5XXXXXXX">
            <label class="form-label fw-bold">Meses a pagar</label>
            <select id="pagoMeses" class="form-select mb-2" onchange="actualizarTotalPago()">
                <option value="1">1 Mes</option>
                <option value="2">2 Meses</option>
                <option value="3">3 Meses</option>
                <option value="6">6 Meses</option>
                <option value="12">12 Meses</option>
            </select>
        </div>
        <div style="background: #F8FAFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
            <div style="font-size: 0.85rem; color: #6B7A99;">Total a Pagar:</div>
            <div style="font-size: 1.8rem; font-weight: 800; color: #1E64FF;" id="pagoTotal">1000 CUP</div>
        </div>
        <div aria-hidden="true" style="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;">
            <label>Website (leave empty)<input type="text" id="honeypotPago" tabindex="-1" autocomplete="off"></label>
        </div>
        <input type="hidden" id="formTsPago" value="">
        <button class="btn btn-primary w-100 mb-2" id="btnGenerarPago" onclick="generarPago()" style="padding: 14px; border-radius: 12px; font-weight: 700;">Generar Ticket de Pago</button>
        <button class="btn btn-outline-secondary w-100" onclick="cerrarPagoModal()" style="padding: 12px; border-radius: 12px;">Cancelar</button>
    `;
    closeAllOverlays();
    mostrarPagoModal();
    actualizarTotalPago();
    const tsPago = document.getElementById('formTsPago');
    if (tsPago) tsPago.value = Date.now();
    const hpPago = document.getElementById('honeypotPago');
    if (hpPago) hpPago.value = '';
}

function actualizarTotalPago() {
    const meses = parseInt(document.getElementById('pagoMeses').value);
    const precioMensual = preciosPlanes[planElegido] || 0;
    totalPago = precioMensual * meses;
    document.getElementById('pagoTotal').innerText = `${totalPago} CUP`;
}

async function generarPago() {
    const nombre = document.getElementById('pagoNombre').value.trim();
    const telefono = document.getElementById('pagoTelefono').value.trim();
    const meses = parseInt(document.getElementById('pagoMeses').value);
    if (!nombre || !telefono) { alert('Completa tu nombre y teléfono por favor'); return; }
    const btn = document.getElementById('btnGenerarPago');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
    btn.disabled = true;
    try {
        const res = await fetch('/api/pagos/generar', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, telefono, plan: planElegido, meses,
                _website_url: document.getElementById('honeypotPago')?.value || '',
                _form_ts: document.getElementById('formTsPago')?.value || Date.now() })
        });
        const data = await res.json();
        if (data.success) {
            codigoPago = data.codigo;
            pagoDataTemporal = { plan: planElegido, codigo: codigoPago, total: totalPago };
            localStorage.setItem('fg_pago_pendiente', JSON.stringify(pagoDataTemporal));
            mostrarInstruccionesPago();
        } else { throw new Error(data.error); }
    } catch (e) { 
        alert('Error: ' + e.message); 
        btn.innerHTML = 'Generar Ticket de Pago'; btn.disabled = false; 
    }
}

function mostrarInstruccionesPago() {
    const waAdmin = metodosAdminGlobal.whatsapp || '5353571569';
    const bankNumber = metodosAdminGlobal.bank || '⚠️ Tarjeta no configurada';
    const esTarjetaValida = !bankNumber.includes('no configurada');
    const msg = encodeURIComponent(`Hola, he generado el ticket *${codigoPago}* para el plan *${planElegido.toUpperCase()}* por un total de *${totalPago} CUP*. Adjunto mi comprobante.`);
    const waLink = `https://wa.me/${waAdmin}?text=${msg}`;
    document.getElementById('pagoModalBody').innerHTML = `
        <div style="width: 72px; height: 72px; background: linear-gradient(135deg, #E6F9F0, #D1FAE5); color: #10B981; border-radius: 50%; margin: 0 auto 18px; display: flex; align-items: center; justify-content: center; font-size: 2.1rem; box-shadow: 0 8px 20px rgba(16,185,129,0.25);"><i class="fas fa-check-circle"></i></div>
        <h3 style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; color: #1A2B4C; margin-bottom: 6px; font-size: 1.5rem;">¡Ticket Generado!</h3>
        <p style="color: #6B7A99; margin-bottom: 18px; font-size: 0.92rem;">Tu código de pago es:</p>
        <div style="background: linear-gradient(135deg, #1E64FF, #1248C7); color: #fff; border-radius: 14px; padding: 14px 18px; margin: 0 auto 22px; max-width: 260px; text-align: center; box-shadow: 0 10px 28px rgba(30,100,255,0.35);">
            <div style="font-family: monospace; font-size: 1.5rem; font-weight: 800; letter-spacing: 2px;">${codigoPago}</div>
        </div>
        <div style="background: #F8FAFF; border: 1.5px solid #E2E8F0; border-radius: 14px; padding: 18px; margin-bottom: 18px;">
            <div style="font-size: 0.78rem; color: #6B7A99; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; margin-bottom: 10px;">Datos para tu transferencia</div>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; background: #fff; border-radius: 10px; padding: 12px 14px; border: 1px solid #E2E8F0;">
                <div style="text-align:left;">
                    <div style="font-size: 0.7rem; color: #6B7A99; margin-bottom: 2px;">Tarjeta / Cuenta</div>
                    <div style="font-family: monospace; font-size: 1.05rem; font-weight: 800; color: #1A2B4C;">${bankNumber}</div>
                </div>
                ${esTarjetaValida ? `<button onclick="copiarTarjeta('${bankNumber}')" class="btn btn-sm" style="border-radius:8px; padding:8px 12px; background: var(--brand-tint, #EAF1FF); color: #1E64FF; border: 1px solid #1E64FF; font-weight:700;" title="Copiar tarjeta"><i class="fas fa-copy me-1"></i> Copiar</button>` : ''}
            </div>
            <div style="margin-top: 10px; font-size: 0.82rem; color: #1A2B4C; font-weight: 700;">Total a transferir: <span style="color: #1E64FF;">${totalPago} CUP</span></div>
        </div>
        <div style="background: #FFF7ED; border: 1.5px solid #FED7AA; border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; text-align: left;">
            <div style="display: flex; gap: 10px; align-items: flex-start;">
                <i class="fas fa-info-circle" style="color: #F59E0B; font-size: 1.1rem; margin-top: 2px;"></i>
                <div>
                    <div style="font-weight: 800; color: #92400E; font-size: 0.88rem; margin-bottom: 4px;">Verificación de tu pago</div>
                    <div style="color: #78350F; font-size: 0.82rem; line-height: 1.5;">Para verificar tu pago y activar tu tienda, debes enviar la <strong>factura o comprobante de tu transferencia</strong> por WhatsApp. Sin el comprobante no podremos activar tu suscripción.</div>
                </div>
            </div>
        </div>
        <a href="${waLink}" target="_blank" rel="noopener" id="btnEnviarWhatsApp" class="btn w-100 mb-3" style="padding: 16px; border-radius: 14px; font-weight: 800; background: linear-gradient(135deg, #25D366, #128C7E); border: none; color: #fff; font-size: 1rem; box-shadow: 0 10px 28px rgba(37,211,102,0.4); display: flex; align-items: center; justify-content: center; gap: 10px;"><i class="fab fa-whatsapp" style="font-size: 1.3rem;"></i> Enviar factura por WhatsApp</a>
        <button class="btn w-100" onclick="continuarRegistro()" style="padding: 14px; border-radius: 14px; font-weight: 700; background: transparent; border: 2px solid #E2E8F0; color: #1A2B4C; font-size: 0.95rem; transition: all 0.2s;">Continuar <i class="fas fa-arrow-right ms-1"></i></button>
        <p style="margin-top: 14px; font-size: 0.76rem; color: #9CA3AF; text-align: center;">Al continuar aceptas nuestros términos. Tu tienda se activará cuando verifiquemos tu comprobante.</p>
    `;
    mostrarPagoModal();
}

function mostrarBotonGoogleRegistro() {
    var wsStep = document.getElementById('whatsappStep');
    var gStep = document.getElementById('googleStep');
    if (wsStep) wsStep.style.display = 'none';
    if (gStep) gStep.style.display = 'block';
}

function copiarTarjeta(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('✅ Número de tarjeta copiado al portapapeles');
    }).catch(() => {
        alert('❌ No se pudo copiar automáticamente. Por favor, hazlo manualmente.');
    });
}

function continuarRegistro() {
    cerrarPagoModal();
    document.getElementById('planSeleccionadoTexto').innerText = planTexto;
    document.getElementById('regPlan').value = planElegido;
    abrirRegistroModal();
}

async function abrirRegistroModal() {
    if (currentUser) {
        try {
            const res = await fetch(`/api/mi-tienda?owner_id=${currentUser.id}`);
            const data = await res.json();
            if (data.success && data.store) { new bootstrap.Modal(document.getElementById('limiteModal')).show(); return; }
        } catch (e) { console.error(e); }
    }
    if (!currentUser) {
        document.getElementById('regStep1').style.display = 'block';
        document.getElementById('regStep2').style.display = 'none';
        document.getElementById('regStep3').style.display = 'none';
    }
    const tsReg = document.getElementById('formTsReg');
    if (tsReg) tsReg.value = Date.now();
    const hpReg = document.getElementById('honeypotReg');
    if (hpReg) hpReg.value = '';
    new bootstrap.Modal(document.getElementById('registroModal')).show();
}

async function loginConGoogle() {
    try {
        await initSupabase();
        const { error } = await window.supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/?registro=1` } });
        if (error) throw error;
    } catch (e) { alert('Error: ' + e.message); }
}

async function checkSession() {
    try {
        await initSupabase();
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        const urlParams = new URLSearchParams(window.location.search);
        const vieneDeOAuth = urlParams.get('registro') === '1';

        if (session && session.user) {
            currentUser = session.user;
            let tieneTienda = false;
            try {
                const res = await fetch(`/api/mi-tienda?owner_id=${currentUser.id}`);
                const data = await res.json();
                if (data.success && data.store) { tieneTienda = true; }
            } catch (e) { console.error(e); }

            if (tieneTienda) {
                if (vieneDeOAuth) {
                    new bootstrap.Modal(document.getElementById('limiteModal')).show();
                    window.history.replaceState({}, document.title, "/");
                }
                document.documentElement.classList.remove('registro-mode');
                return;
            }

            if (!tieneTienda) {
                if (vieneDeOAuth) {
                    abrirRegistroModal();
                    document.getElementById('regStep1').style.display = 'none';
                    document.getElementById('regStep2').style.display = 'block';
                    document.getElementById('regStep3').style.display = 'none';
                    window.history.replaceState({}, document.title, "/");
                    var regModalEl = document.getElementById('registroModal');
                    regModalEl.addEventListener('hidden.bs.modal', function onceHidden() {
                        regModalEl.removeEventListener('hidden.bs.modal', onceHidden);
                        var step3 = document.getElementById('regStep3');
                        if (step3 && step3.style.display !== 'block') {
                            document.documentElement.classList.remove('registro-mode');
                            iniciarCuentaRegresivaAbandono();
                            mostrarAdvertenciaCuentaRegresivaSiAplica();
                        }
                    });
                } else {
                    const pagoPendiente = localStorage.getItem('fg_pago_pendiente');
                    const registroAbandonado = localStorage.getItem('fg_registro_abandonado');
                    if (pagoPendiente || registroAbandonado) {
                        const verif = await verificarDispositivoBloqueado();
                        if (verif.blocked) {
                            mostrarModalBloqueo(verif.reason);
                            document.documentElement.classList.remove('registro-mode');
                            return;
                        }
                        mostrarModalContinuarRegistro(
                            function onSi() {
                                abrirRegistroModal();
                                document.getElementById('regStep1').style.display = 'none';
                                document.getElementById('regStep2').style.display = 'block';
                                document.getElementById('regStep3').style.display = 'none';
                                localStorage.removeItem('fg_registro_abandonado');
                                var regModalEl2 = document.getElementById('registroModal');
                                regModalEl2.addEventListener('hidden.bs.modal', function onceHidden2() {
                                    regModalEl2.removeEventListener('hidden.bs.modal', onceHidden2);
                                    var step3 = document.getElementById('regStep3');
                                    if (step3 && step3.style.display !== 'block') {
                                        iniciarCuentaRegresivaAbandono();
                                        mostrarAdvertenciaCuentaRegresivaSiAplica();
                                    }
                                });
                            },
                            function onNo() {
                                iniciarCuentaRegresivaAbandono();
                                mostrarAdvertenciaCuentaRegresivaSiAplica();
                                document.documentElement.classList.remove('registro-mode');
                            }
                        );
                    } else {
                        document.documentElement.classList.remove('registro-mode');
                    }
                }
            }
        } else {
            document.documentElement.classList.remove('registro-mode');
            mostrarAdvertenciaCuentaRegresivaSiAplica();
        }
    } catch (e) {
        console.error('Error al verificar sesión:', e);
        document.documentElement.classList.remove('registro-mode');
    }
}

async function crearTiendaCliente() {
    if (!currentUser) { alert('Inicia sesión primero.'); return; }
    const nombre = document.getElementById('regNombreNegocio').value.trim();
    const tipo = document.getElementById('regTipoNegocio').value;
    const telefono = document.getElementById('regTelefono').value.trim();
    const plan = document.getElementById('regPlan').value;
    const direccion = document.getElementById('regDireccion').value.trim();
    const horaApertura = document.getElementById('regHoraApertura').value;
    const horaCierre = document.getElementById('regHoraCierre').value;
    const tasaUSD = parseFloat(document.getElementById('regTasaUSD').value) || 25;
    const pagoFisico = document.getElementById('pagoFisico').checked;
    const pagoTransferencia = document.getElementById('pagoTransferencia').checked;
    const garantia = document.getElementById('regGarantia').value === 'true';
    const transporte = document.getElementById('regTransporte').value === 'true';

    if (!nombre || !telefono) { alert('Completa los campos obligatorios (*)'); return; }
    if (!pagoFisico && !pagoTransferencia) { alert('Selecciona al menos un método de pago'); return; }

    const btn = document.getElementById('btnCrearTienda');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';
    btn.disabled = true;

    const slug = nombre.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
    const metodosPago = []; if (pagoFisico) metodosPago.push('Efectivo'); if (pagoTransferencia) metodosPago.push('Transferencia');
    
    const codigo_pago = localStorage.getItem('fg_pago_pendiente') ? JSON.parse(localStorage.getItem('fg_pago_pendiente')).codigo : null;
    const device_id = getDeviceId();

    try {
        const res = await fetch('/api/crear-tienda-cliente', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.id, email: currentUser.email, nombre_dueno: currentUser.user_metadata?.full_name || 'Sin nombre',
                nombre_negocio: nombre, tipo, telefono, plan, fecha_vencimiento: null, direccion, hora_apertura: horaApertura,
                hora_cierre: horaCierre, tasa_usd: tasaUSD, metodos_pago: metodosPago, garantia, transporte, codigo_pago, device_id,
                _website_url: document.getElementById('honeypotReg')?.value || '',
                _form_ts: document.getElementById('formTsReg')?.value || Date.now()
            })
        });
        const data = await res.json();
        if (data.success) {
            localStorage.removeItem('fg_pago_pendiente');
            localStorage.removeItem('fg_registro_abandonado');
            ocultarBannerPendiente();
            pagoDataTemporal = null;
            codigoPago = null;
            
            const baseUrl = (globalConfig && globalConfig.appUrl) ? globalConfig.appUrl : window.location.origin;
            document.getElementById('regStep2').style.display = 'none';
            document.getElementById('regStep3').style.display = 'block';
            
            let htmlStep3 = '';
            if (plan === 'prueba') {
                htmlStep3 = `
                    <div style="width: 80px; height: 80px; background: #E6F9F0; color: #10B981; border-radius: 50%; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center; font-size: 2.5rem;"><i class="fas fa-check-circle"></i></div>
                    <h2 style="font-weight: 800; color: #1A2B4C; margin-bottom: 8px;">¡Tienda Creada!</h2>
                    <p style="color: #6B7A99; margin-bottom: 24px;">Tu tienda está activa. Guarda estas URLs.</p>
                    <div style="background: #F8FAFF; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 16px; text-align: left; margin-bottom: 12px;"><label style="font-size: 0.75rem; font-weight: 700; color: #1E64FF;">🌐 Tu Tienda</label><div class="d-flex gap-2 mt-1"><input type="text" id="urlTienda" class="form-control" readonly value="${baseUrl}/?tienda=${data.slug}" style="font-size: 0.8rem;"><button class="btn btn-sm btn-outline-primary" onclick="copiarUrl('urlTienda')"><i class="fas fa-copy"></i></button></div></div>
                    <div style="background: #F8FAFF; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 16px; text-align: left; margin-bottom: 24px;"><label style="font-size: 0.75rem; font-weight: 700; color: #1E64FF;">🔒 Tu Panel</label><div class="d-flex gap-2 mt-1"><input type="text" id="urlAdmin" class="form-control" readonly value="${baseUrl}/admin-cliente?tienda=${data.slug}" style="font-size: 0.8rem;"><button class="btn btn-sm btn-outline-primary" onclick="copiarUrl('urlAdmin')"><i class="fas fa-copy"></i></button></div></div>
                    <a href="/admin-cliente?tienda=${data.slug}" class="btn btn-primary w-100" style="padding: 14px; border-radius: 12px; font-weight: 700;">Ir a mi Panel</a>
                `;
            } else {
                htmlStep3 = `
                    <div style="width: 80px; height: 80px; background: #FEF3C7; color: #D97706; border-radius: 50%; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center; font-size: 2.5rem;"><i class="fas fa-clock"></i></div>
                    <h2 style="font-weight: 800; color: #1A2B4C; margin-bottom: 8px;">¡Tienda en Revisión!</h2>
                    <p style="color: #6B7A99; margin-bottom: 24px;">Tu pago está siendo verificado por el administrador. Mientras tanto, puedes acceder a tu panel y subir tus productos.</p>
                    <div style="background: #F8FAFF; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 16px; text-align: left; margin-bottom: 24px;"><label style="font-size: 0.75rem; font-weight: 700; color: #1E64FF;">🔒 Tu Panel (Acceso anticipado)</label><div class="d-flex gap-2 mt-1"><input type="text" id="urlAdmin" class="form-control" readonly value="${baseUrl}/admin-cliente?tienda=${data.slug}" style="font-size: 0.8rem;"><button class="btn btn-sm btn-outline-primary" onclick="copiarUrl('urlAdmin')"><i class="fas fa-copy"></i></button></div></div>
                    <a href="/admin-cliente?tienda=${data.slug}" class="btn btn-primary w-100" style="padding: 14px; border-radius: 12px; font-weight: 700;">Entrar a mi Panel</a>
                `;
            }
            document.getElementById('regStep3').innerHTML = htmlStep3;
        } else {
            if (data.codigo === 'DISPOSITIVO_BLOQUEADO' || data.codigo === 'TIENDA_EXISTENTE') {
                localStorage.setItem('fg_dispositivo_bloqueado', '1');
                var regModal = bootstrap.Modal.getInstance(document.getElementById('registroModal'));
                if (regModal) regModal.hide();
                mostrarModalBloqueo(data.error || 'No se permite crear más tiendas en este dispositivo.');
            } else {
                throw new Error(data.error);
            }
        }
    } catch (e) {
        alert('Error: ' + e.message);
        btn.innerHTML = 'Crear mi Tienda';
        btn.disabled = false;
    }
}

function copiarUrl(id) { const input = document.getElementById(id); input.select(); navigator.clipboard.writeText(input.value).then(() => alert('✅ URL copiada')); }

async function solicitarPermisoMultiTienda() {
    if (!currentUser) { alert('Inicia sesión primero.'); return; }
    let tiendaActual = null;
    try {
        const res = await fetch(`/api/mi-tienda?owner_id=${currentUser.id}`);
        const data = await res.json();
        if (data.success && data.store) tiendaActual = data.store.id;
    } catch (e) {}
    const motivo = prompt('¿Por qué necesitas otra tienda? (opcional)') || '';
    try {
        const res = await fetch('/api/solicitar-multi-tienda', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.id,
                email: currentUser.email,
                tienda_actual: tiendaActual,
                motivo: motivo
            })
        });
        const data = await res.json();
        if (data.success) {
            alert('✅ Solicitud enviada. El administrador revisará tu petición.');
            bootstrap.Modal.getInstance(document.getElementById('limiteModal'))?.hide();
        } else {
            alert('❌ ' + (data.error || 'Error'));
        }
    } catch (e) { alert('❌ Error de conexión'); }
}

function abrirUpgradePlanModal() {
    if (!currentUser) { alert('Inicia sesión primero.'); return; }
    fetch(`/api/mi-tienda?owner_id=${currentUser.id}`).then(r => r.json()).then(data => {
        if (!data.success || !data.store) {
            alert('Necesitas tener una tienda creada para solicitar upgrade.');
            return;
        }
        new bootstrap.Modal(document.getElementById('upgradePlanModal')).show();
    });
}

async function enviarSolicitudUpgrade() {
    if (!currentUser) { alert('Inicia sesión primero.'); return; }
    const planDeseado = document.getElementById('upgradePlanSelect').value;
    const meses = parseInt(document.getElementById('upgradeMesesSelect').value);
    const codigoPago = document.getElementById('upgradeCodigoPago').value.trim();
    if (!planDeseado) { alert('Selecciona un plan'); return; }
    let tiendaSlug = null, planActual = 'prueba';
    try {
        const res = await fetch(`/api/mi-tienda?owner_id=${currentUser.id}`);
        const data = await res.json();
        if (data.success && data.store) {
            tiendaSlug = data.store.id;
            planActual = data.store.plan || 'prueba';
        }
    } catch (e) {}
    if (!tiendaSlug) { alert('No se encontró tu tienda.'); return; }
    try {
        const res = await fetch('/api/solicitar-upgrade-plan', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.id,
                email: currentUser.email,
                tienda_slug: tiendaSlug,
                plan_actual: planActual,
                plan_deseado: planDeseado,
                meses,
                codigo_pago: codigoPago || null
            })
        });
        const data = await res.json();
        if (data.success) {
            alert('✅ Solicitud enviada. El administrador la procesará.');
            bootstrap.Modal.getInstance(document.getElementById('upgradePlanModal'))?.hide();
        } else {
            alert('❌ ' + (data.error || 'Error'));
        }
    } catch (e) { alert('❌ Error de conexión'); }
}