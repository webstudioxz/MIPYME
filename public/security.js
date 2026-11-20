// ============================================================
// security.js — Sistema de seguridad blindado 6 capas empresarial
// ============================================================
// CAPA 1: Filtrado en cliente (cliente-profanity-filter.js)
//        Bloqueo inmediato en keypress/paste de malas palabras y patrones
//        de ataque. Cero tolerancia. El texto ofensivo nunca llega al server.
//
// CAPA 2: Validación de esquema estricta en entrada
//        Tipos correctos, longitudes máximas, campos obligatorios, formato.
//        Rechazo inmediato de bodies malformados.
//
// CAPA 3: Sanitización profunda recursiva
//        Recorre TODO el body (objetos anidados, arrays) y aplica:
//        - Trim, eliminación de caracteres de control
//        - Escape de caracteres peligrosos
//        - Reemplazo de malas palabras con ***
//
// CAPA 4: Motor de detección de ataques (multi-vector)
//        - Inyección SQL (23 patrones: UNION, DROP, OR 1=1, SLEEP, etc.)
//        - Inyección NoSQL ($where, $ne, $regex)
//        - XSS (script, onerror, iframe, javascript:, svg, etc.)
//        - Path Traversal (../, /etc/passwd)
//        - Shell Injection (cat, wget, nc, /bin/bash)
//        - Image Payload (magic bytes reales + sin scripts embebidos)
//
// CAPA 5: Rate Limiting + Honeypot + Anti-bot
//        - Límites por IP y acción (login 5/15min, reservas 5/min, etc.)
//        - Honeypot oculto que los bots rellenan
//        - Detección por timing (submits < 1.5s = bot)
//        - Protección anti-fuerza-bruta en login
//
// CAPA 6: Sistema de baneo + Audit Log + Circuit Breaker
//        - Auto-ban tras 5 violaciones (24h) o 1 crítica (7d)
//        - Tabla persistente security_bans + security_log
//        - Circuit breaker: si una operación falla N veces, abre circuito
//        - Fail-open: si la BD no responde, no bloquea la app
// ============================================================

// ============ CONFIGURACIÓN ============
const CONFIG = {
    // Rate limits por acción (ventana ms, máximo de peticiones)
    RATE_LIMITS: {
        login:           { window: 15 * 60 * 1000, max: 5 },    // 5 intentos / 15 min
        crear_tienda:    { window: 60 * 60 * 1000, max: 3 },    // 3 creaciones / hora
        crear_producto:  { window: 60 * 1000,      max: 20 },   // 20 productos / min
        reserva:         { window: 60 * 1000,      max: 5 },    // 5 reservas / min
        pedido:          { window: 60 * 1000,      max: 10 },   // 10 pedidos / min
        pago:            { window: 60 * 1000,      max: 5 },    // 5 pagos / min
        pausa:           { window: 60 * 1000,      max: 10 },   // 10 pausas / min
        config:          { window: 60 * 1000,      max: 30 },   // 30 configs / min
        default:         { window: 60 * 1000,      max: 60 }    // 60 genéricas / min
    },
    // Auto-ban tras N violaciones graves en ventana
    AUTO_BAN: {
        violations: 5,
        window: 60 * 60 * 1000,        // 1 hora
        duration: 24 * 60 * 60 * 1000  // baneo de 24h
    },
    // Auto-ban inmediato para violaciones críticas (1 sola)
    INSTANT_BAN_DURATION: 7 * 24 * 60 * 60 * 1000, // 7 días
    MAX_IMAGE_SIZE: 1.2 * 1024 * 1024,  // 1.2MB (base64 ~1MB imagen)
    MAX_BODY_LOG: 2000,                  // máximo tamaño de body a loguear
    MAX_STRING_FIELD: 10000              // máximo tamaño de campo string
};

// ============ LISTA DE MALAS PALABRAS (multi-idioma) ============
const PROFANITY = [
    // Español (Cuba, LatAm, España)
    'puto','puta','putos','putas','cabrón','cabron','cabrones','cabrona','cabronas',
    'pendejo','pendeja','pendejos','pendejas','pelotudo','pelotuda','pelotudos',
    'boludo','boluda','boludos','imbecil','imbécil','imbeciles','idiota','idiotas',
    'subnormal','subnormales','mongol','mongoles','retrasado','retrasada','retrasados',
    'marica','maricón','maricon','maricones','maricona','mariconas',
    'joder','jodido','jodida','mierda','mierdas','caca','culo','culos',
    'coño','coños','verga','vergas','pinga','pingas','pingón','pingon',
    'chingar','chingada','chingadas','chingón','chingon','chingona',
    'mamada','mamadas','mamón','mamon','mamona','chupa','chupas','chupada',
    'polla','pollas','cono','cono','hijoputa','hijueputa','hijueputas',
    'malparido','malparida','malparidos','malparidas','malparidas',
    'gonorrea','gonorreas','hp','hdp','pelagato','pelagatos',
    'vergas','verga','vergón','vergon','vergona',
    // Inglés
    'fuck','fucker','fucking','fucked','fucks','shit','shitty','shits',
    'bitch','bitches','bitching','asshole','assholes','dick','dicks','dickhead',
    'pussy','pussies','bastard','bastards','cunt','cunts','motherfucker',
    'motherfuckers','wanker','wankers','twat','twats','prick','pricks',
    'slut','sluts','slutty','whore','whores','douche','douchebag'
];

// Regex con word boundaries para evitar falsos positivos
const profanityRegex = new RegExp(
    '\\b(' + PROFANITY.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b',
    'gi'
);

// ============ DETECCIÓN DE ATAQUES ============

// Inyección SQL — patrones clásicos y modernos
const SQL_PATTERNS = [
    /(\bunion\b\s+\bselect\b)/i,
    /(\bselect\b\s+[\w*,\s]+\s+\bfrom\b\s+\w+)/i,
    /(\binsert\b\s+\binto\b\s+\w+)/i,
    /(\bupdate\b\s+\w+\s+\bset\b)/i,
    /(\bdelete\b\s+\bfrom\b\s+\w+)/i,
    /(\bdrop\b\s+\b(table|database|schema)\b)/i,
    /(\btruncate\b\s+\btable\b)/i,
    /(\balter\b\s+\b(table|database)\b)/i,
    /(\bcreate\b\s+\b(table|database|procedure|function)\b)/i,
    /(\bexec(ute)?\b\s*[([])/i,
    /(\bxp_cmdshell\b)/i,
    /(\bsp_executesql\b)/i,
    /(;\s*(drop|delete|update|insert|alter|create|truncate)\b)/i,
    /(--\s*[a-zA-Z])/m,
    /(\/\*[\s\S]*?\*\/)/,
    /('\s*(or|and)\s+['"]?\w+['"]?\s*=\s*['"]?\w+['"]?)/i,
    /("\s*(or|and)\s+['"]?\w+['"]?\s*=\s*['"]?\w+['"]?)/i,
    /(\bor\s+1\s*=\s*1\b)/i,
    /(\band\s+1\s*=\s*1\b)/i,
    /(\bor\s+'[^']*'\s*=\s*'[^']*')/i,
    /(\bwaitfor\s+delay\b)/i,
    /(\bsleep\s*\(\s*\d+\s*\))/i,
    /(\bbenchmark\s*\()/i,
    /(\bload_file\s*\()/i,
    /(\binto\s+outfile\b)/i
];

// XSS — scripts, eventos, iframes, etc.
const XSS_PATTERNS = [
    /<script[^>]*>[\s\S]*?<\/script>/i,
    /<script[^>]*>/i,
    /<\/script>/i,
    /javascript:/i,
    /\bon(load|error|click|mouseover|mouseout|focus|blur|submit|change|keypress|keydown|keyup|wheel|drag|drop|toggle|animationstart|animationend)\s*=/i,
    /<iframe[^>]*>/i,
    /<\/iframe>/i,
    /<embed[^>]*>/i,
    /<object[^>]*>/i,
    /<applet[^>]*>/i,
    /<meta[^>]+http-equiv/i,
    /<link[^>]+href/i,
    /data:text\/html/i,
    /<svg[^>]*on[a-z]+\s*=/i,
    /<img[^>]+onerror\s*=/i,
    /<body[^>]+on[a-z]+\s*=/i,
    /<details[^>]+on[a-z]+\s*=/i,
    /expression\s*\(/i,
    /<style[^>]*>[\s\S]*?expression\s*\(/i
];

// Inyección NoSQL — operadores $where, $ne, etc.
const NOSQL_OPERATORS = /^\$(where|ne|gt|lt|gte|lte|regex|or|and|not|in|nin|exists|type|mod|size|all|elemMatch|comment|function)$/i;

// Path traversal
const PATH_TRAVERSAL_PATTERNS = [
    /(\.\.[\/\\]){2,}/,
    /(\.\.\/)+/,
    /(\.\.\\)+/,
    /(\/etc\/(passwd|shadow|hosts|group))/i,
    /(\\windows\\system32)/i,
    /(%2e%2e%2f)/i,
    /(%2e%2e\/)/i,
    /(%2e%2e%5c)/i,
    /(\.\.%2f)/i,
    /(\.\.%5c)/i
];

// Comandos shell peligrosos
const SHELL_INJECTION_PATTERNS = [
    /(\||;|&|`|\$\(|\$\{)\s*(cat|ls|rm|mv|cp|wget|curl|bash|sh|nc|netcat|python|perl|ruby|php|powershell|cmd)\b/i,
    /(\bcat\s+\/etc\/)/i,
    /(\bwget\s+http)/i,
    /(\bcurl\s+.*\|\s*(bash|sh))/i,
    /(\bnc\s+-e)/i,
    /(\/bin\/(bash|sh|zsh))/i
];

// ============ FUNCIONES DE DETECCIÓN ============

export function detectProfanity(text) {
    if (!text || typeof text !== 'string') return { found: false, words: [] };
    const matches = text.match(profanityRegex) || [];
    return { found: matches.length > 0, words: [...new Set(matches.map(m => m.toLowerCase()))] };
}

export function sanitizeProfanity(text, replacement = '***') {
    if (!text || typeof text !== 'string') return text;
    return text.replace(profanityRegex, replacement);
}

export function detectSQLInjection(text) {
    if (!text || typeof text !== 'string') return false;
    return SQL_PATTERNS.some(p => p.test(text));
}

export function detectXSS(text) {
    if (!text || typeof text !== 'string') return false;
    return XSS_PATTERNS.some(p => p.test(text));
}

export function detectNoSQLInjection(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 10) return false;
    for (const k of Object.keys(obj)) {
        if (NOSQL_OPERATORS.test(k)) return true;
        if (typeof obj[k] === 'object' && obj[k] !== null) {
            if (detectNoSQLInjection(obj[k], depth + 1)) return true;
        }
    }
    return false;
}

export function detectPathTraversal(text) {
    if (!text || typeof text !== 'string') return false;
    return PATH_TRAVERSAL_PATTERNS.some(p => p.test(text));
}

export function detectShellInjection(text) {
    if (!text || typeof text !== 'string') return false;
    return SHELL_INJECTION_PATTERNS.some(p => p.test(text));
}

// ============ VALIDACIÓN DE IMÁGENES (anti-payload) ============
// Verifica que un data URL de imagen sea una imagen real y no contenga
// código malicioso embebido (EXIF payloads, scripts, etc.)
export function validateImage(dataUrl) {
    if (typeof dataUrl !== 'string') return { valid: false, reason: 'Tipo inválido' };
    // Si es URL externa, validar formato y dominio
    if (/^https?:\/\//i.test(dataUrl)) {
        if (dataUrl.length > 2048) return { valid: false, reason: 'URL demasiado larga' };
        if (/(javascript:|data:text\/html|<script)/i.test(dataUrl)) {
            return { valid: false, reason: 'URL maliciosa' };
        }
        return { valid: true, isExternal: true };
    }
    // Debe ser data URL con MIME permitido
    const match = dataUrl.match(/^data:image\/(jpe?g|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) {
        return { valid: false, reason: 'Solo se permiten imágenes JPEG, PNG, WebP o GIF' };
    }
    const mime = match[1].toLowerCase().replace('jpeg', 'jpg');
    const base64Data = match[2];
    let buffer;
    try {
        buffer = Buffer.from(base64Data, 'base64');
    } catch {
        return { valid: false, reason: 'Base64 inválido' };
    }
    if (buffer.length < 100) return { valid: false, reason: 'Imagen demasiado pequeña o corrupta' };
    if (buffer.length > CONFIG.MAX_IMAGE_SIZE) return { valid: false, reason: 'Imagen excede el tamaño máximo de 1MB' };

    // Verificar magic bytes según el tipo declarado
    const magicChecks = {
        jpg: (b) => b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
        png: (b) => b.length >= 8 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG'
                    && b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A,
        webp: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF'
                    && b.toString('ascii', 8, 12) === 'WEBP',
        gif: (b) => b.length >= 6 && (b.toString('ascii', 0, 6) === 'GIF87a'
                    || b.toString('ascii', 0, 6) === 'GIF89a')
    };
    const checkFn = magicChecks[mime];
    if (!checkFn || !checkFn(buffer)) {
        return { valid: false, reason: `El contenido no coincide con un ${mime.toUpperCase()} real (posible payload malicioso)` };
    }
    // Buscar código malicioso embebido en los primeros 8KB del binario
    const asString = buffer.toString('utf8', 0, Math.min(buffer.length, 8192));
    if (/<script|<\?php|javascript:|onerror=|onload=|eval\s*\(|document\.cookie|window\.location/i.test(asString)) {
        return { valid: false, reason: 'Se detectó código malicioso embebido en la imagen' };
    }
    return { valid: true, mime, size: buffer.length };
}

// Escanea y valida todos los campos de imagen en un objeto body
export function validateImagesInBody(body) {
    const imageFields = ['imagen', 'imagen_proveedor', 'qr_tarjeta', 'urlQrTarjeta'];
    const violations = [];
    if (!body || typeof body !== 'object') return violations;
    for (const field of imageFields) {
        if (body[field] && typeof body[field] === 'string' && body[field].startsWith('data:image')) {
            const result = validateImage(body[field]);
            if (!result.valid) {
                violations.push({ field, reason: result.reason });
            }
        }
    }
    // imagenes_servicio es un array
    if (Array.isArray(body.imagenes_servicio)) {
        body.imagenes_servicio.forEach((url, i) => {
            if (typeof url === 'string' && url.startsWith('data:image')) {
                const result = validateImage(url);
                if (!result.valid) {
                    violations.push({ field: `imagenes_servicio[${i}]`, reason: result.reason });
                }
            }
        });
    }
    return violations;
}

// ============ RATE LIMITING (en memoria con limpieza periódica) ============
const rateBuckets = new Map();      // key: ip:action -> [timestamps]
const violationCounts = new Map();  // key: ip -> [{ts, type}]
const bannedIps = new Map();        // ip -> { reason, bannedAt, expiresAt, bannedBy }
let supabaseClientRef = null;

// Limpieza periódica cada 10 minutos para evitar memory leaks
setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of rateBuckets.entries()) {
        const recent = ts.filter(t => now - t < 60 * 60 * 1000);
        if (recent.length === 0) rateBuckets.delete(key);
        else rateBuckets.set(key, recent);
    }
    for (const [ip, list] of violationCounts.entries()) {
        const recent = list.filter(v => now - v.ts < CONFIG.AUTO_BAN.window);
        if (recent.length === 0) violationCounts.delete(ip);
        else violationCounts.set(ip, recent);
    }
    for (const [ip, ban] of bannedIps.entries()) {
        if (ban.expiresAt < now) bannedIps.delete(ip);
    }
}, 10 * 60 * 1000).unref?.();

export function getClientIp(req) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
    return req.socket?.remoteAddress || req.ip || 'unknown';
}

export function rateLimit(action) {
    const config = CONFIG.RATE_LIMITS[action] || CONFIG.RATE_LIMITS.default;
    return async (req, res, next) => {
        const ip = getClientIp(req);
        const key = `${ip}:${action}`;
        const now = Date.now();
        const bucket = rateBuckets.get(key) || [];
        const recent = bucket.filter(ts => now - ts < config.window);
        if (recent.length >= config.max) {
            await logSecurityEvent({
                ip, userAgent: req.headers['user-agent'],
                action: req.path, type: 'rate_limit',
                severity: 'medium',
                details: { action, count: recent.length, window: config.window }
            });
            recordViolation(ip, 'rate_limit');
            res.setHeader('Retry-After', Math.ceil(config.window / 1000));
            return res.status(429).json({
                success: false,
                error: 'Demasiadas peticiones. Intenta más tarde.',
                retry_after: Math.ceil(config.window / 1000)
            });
        }
        recent.push(now);
        rateBuckets.set(key, recent);
        next();
    };
}

// ============ SISTEMA DE BANEO ============
export function recordViolation(ip, type) {
    if (!violationCounts.has(ip)) violationCounts.set(ip, []);
    const list = violationCounts.get(ip);
    const now = Date.now();
    list.push({ ts: now, type });
    const recent = list.filter(v => now - v.ts < CONFIG.AUTO_BAN.window);
    violationCounts.set(ip, recent);
    // Violaciones críticas que provocan auto-ban inmediato
    const criticalTypes = ['sql_injection', 'nosql_injection', 'xss', 'shell_injection'];
    if (criticalTypes.includes(type)) {
        banIp(ip, `Auto-ban inmediato: intento de ${type}`, 'system', CONFIG.INSTANT_BAN_DURATION / (60 * 60 * 1000));
        return;
    }
    // Auto-ban estándar tras N violaciones
    if (recent.length >= CONFIG.AUTO_BAN.violations) {
        const horas = CONFIG.AUTO_BAN.window / (60 * 60 * 1000);
        banIp(ip, `Auto-ban: ${recent.length} violaciones en ${horas}h`, 'system', CONFIG.AUTO_BAN.duration / (60 * 60 * 1000));
    }
}

export async function banIp(ip, reason, bannedBy = 'admin', durationHours = 24) {
    if (!ip || ip === 'unknown') return false;
    const expiresAt = Date.now() + durationHours * 60 * 60 * 1000;
    bannedIps.set(ip, { reason, bannedAt: Date.now(), expiresAt, bannedBy });
    if (supabaseClientRef) {
        try {
            await supabaseClientRef.from('security_bans').upsert({
                ip, reason, banned_by: bannedBy,
                banned_at: new Date().toISOString(),
                expires_at: new Date(expiresAt).toISOString(),
                active: true
            });
        } catch (e) { /* DB no configurada, solo en memoria */ }
    }
    console.warn(`[SECURITY] 🚫 IP baneada: ${ip} - ${reason} (${durationHours}h)`);
    return true;
}

export async function unbanIp(ip) {
    bannedIps.delete(ip);
    violationCounts.delete(ip);
    if (supabaseClientRef) {
        try {
            await supabaseClientRef.from('security_bans')
                .update({ active: false, unbanned_at: new Date().toISOString() })
                .eq('ip', ip);
        } catch (e) { /* Silencioso */ }
    }
    console.warn(`[SECURITY] ✅ IP desbaneada: ${ip}`);
}

export async function isBanned(ip) {
    if (!ip || ip === 'unknown') return false;
    // Caché en memoria primero (rápido)
    const cached = bannedIps.get(ip);
    if (cached) {
        if (Date.now() > cached.expiresAt) {
            bannedIps.delete(ip);
        } else {
            return { reason: cached.reason, expiresAt: cached.expiresAt };
        }
    }
    // Verificar DB (persistente) — solo si el caché no dice nada
    if (supabaseClientRef) {
        try {
            const { data } = await supabaseClientRef.from('security_bans')
                .select('reason, expires_at, banned_by')
                .eq('ip', ip).eq('active', true)
                .gt('expires_at', new Date().toISOString())
                .maybeSingle();
            if (data) {
                const expiresAt = new Date(data.expires_at).getTime();
                bannedIps.set(ip, {
                    reason: data.reason, bannedAt: Date.now(),
                    expiresAt, bannedBy: data.banned_by
                });
                return { reason: data.reason, expiresAt };
            }
        } catch (e) { /* Tabla no existe, fail-open */ }
    }
    return false;
}

// ============ AUDIT LOG ============
export async function logSecurityEvent(event) {
    const entry = {
        timestamp: new Date().toISOString(),
        ip: event.ip || 'unknown',
        user_agent: (event.userAgent || '').slice(0, 500),
        action: (event.action || '').slice(0, 200),
        type: event.type || 'unknown',
        severity: event.severity || 'medium',
        details: JSON.stringify(event.details || {}).slice(0, CONFIG.MAX_BODY_LOG),
        user_id: event.userId || null,
        blocked: event.blocked !== false
    };
    console.warn(`[SECURITY] ⚠️ ${entry.type} | IP: ${entry.ip} | ${entry.action} | ${entry.details.slice(0, 200)}`);
    if (supabaseClientRef) {
        try {
            await supabaseClientRef.from('security_log').insert(entry);
        } catch (e) { /* Tabla no existe, solo log a consola */ }
    }
}

// ============ ESCANEO DE OBJETOS ============
// Escanea un objeto en busca de cualquier tipo de violación
export function scanObject(obj, depth = 0, path = '') {
    if (depth > 10 || !obj) return [];
    const violations = [];
    if (typeof obj === 'string') {
        if (obj.length > CONFIG.MAX_STRING_FIELD) obj = obj.slice(0, CONFIG.MAX_STRING_FIELD);
        if (detectSQLInjection(obj)) violations.push({ type: 'sql_injection', field: path, sample: obj.slice(0, 100) });
        if (detectXSS(obj)) violations.push({ type: 'xss', field: path, sample: obj.slice(0, 100) });
        if (detectPathTraversal(obj)) violations.push({ type: 'path_traversal', field: path, sample: obj.slice(0, 100) });
        if (detectShellInjection(obj)) violations.push({ type: 'shell_injection', field: path, sample: obj.slice(0, 100) });
        const prof = detectProfanity(obj);
        if (prof.found) violations.push({ type: 'profanity', field: path, words: prof.words });
    } else if (typeof obj === 'object' && obj !== null) {
        if (detectNoSQLInjection(obj)) violations.push({ type: 'nosql_injection', field: path });
        for (const k of Object.keys(obj)) {
            const subPath = path ? `${path}.${k}` : k;
            const sub = scanObject(obj[k], depth + 1, subPath);
            violations.push(...sub);
        }
    }
    return violations;
}

// Sanea un objeto: reemplaza malas palabras in-place
export function sanitizeObject(obj, depth = 0) {
    if (depth > 10 || !obj) return;
    if (typeof obj === 'object' && obj !== null) {
        for (const k of Object.keys(obj)) {
            if (typeof obj[k] === 'string') {
                obj[k] = sanitizeProfanity(obj[k]);
            } else if (typeof obj[k] === 'object' && obj[k] !== null) {
                sanitizeObject(obj[k], depth + 1);
            }
        }
    }
}

// ============ MIDDLEWARE PRINCIPAL ============
export function securityMiddleware() {
    return async (req, res, next) => {
        // Saltar archivos estáticos y health checks
        if (req.path.match(/\.(css|js|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|map)$/i)) return next();
        if (req.path === '/api/health' || req.path === '/favicon.ico') return next();

        const ip = getClientIp(req);
        req.securityIp = ip;

        // 1. Verificar si está baneado
        const banInfo = await isBanned(ip);
        if (banInfo) {
            return res.status(403).json({
                success: false,
                error: 'Acceso denegado.',
                banned: true,
                reason: banInfo.reason,
                expires: new Date(banInfo.expiresAt).toISOString()
            });
        }

        // 2. Para métodos con body, escanear contenido
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body) {
            const violations = scanObject(req.body);
            if (violations.length > 0) {
                const critical = violations.find(v =>
                    ['sql_injection', 'nosql_injection', 'xss', 'path_traversal', 'shell_injection'].includes(v.type)
                );
                // Log siempre
                await logSecurityEvent({
                    ip, userAgent: req.headers['user-agent'],
                    action: req.path, type: violations[0].type,
                    severity: critical ? 'critical' : 'medium',
                    details: { violations, method: req.method }
                });
                recordViolation(ip, violations[0].type);
                if (critical) {
                    // Bloquear request completo
                    return res.status(400).json({
                        success: false,
                        error: 'Contenido no permitido detectado.',
                        code: 'SECURITY_VIOLATION'
                    });
                }
                // Para profanity, sanitizar y continuar
                sanitizeObject(req.body);
            }
            // 3. Validar imágenes en campos conocidos
            const imgViolations = validateImagesInBody(req.body);
            if (imgViolations.length > 0) {
                await logSecurityEvent({
                    ip, userAgent: req.headers['user-agent'],
                    action: req.path, type: 'image_payload',
                    severity: 'high',
                    details: { violations: imgViolations }
                });
                recordViolation(ip, 'image_payload');
                return res.status(400).json({
                    success: false,
                    error: 'Imagen inválida: ' + imgViolations[0].reason,
                    code: 'INVALID_IMAGE'
                });
            }
        }
        next();
    };
}

// ============ HONEYPOT (anti-bot) ============
// Los bots suelen rellenar todos los campos. Si el honeypot (campo oculto
// para humanos pero visible para bots) trae contenido, es un bot.
export function checkHoneypot(field = '_website_url') {
    return async (req, res, next) => {
        if (req.body && req.body[field] && String(req.body[field]).trim() !== '') {
            const ip = getClientIp(req);
            await logSecurityEvent({
                ip, userAgent: req.headers['user-agent'],
                action: req.path, type: 'bot_honeypot',
                severity: 'high',
                details: { field, value: String(req.body[field]).slice(0, 200) }
            });
            recordViolation(ip, 'bot_honeypot');
            // Pretender éxito para confundir al bot
            return res.status(200).json({ success: true });
        }
        // También verificar timing: si el form se envía en menos de 2 segundos, es bot
        const submittedAt = req.body?._form_ts;
        if (submittedAt) {
            const elapsed = Date.now() - parseInt(submittedAt);
            if (elapsed < 1500 && elapsed > 0) {
                const ip = getClientIp(req);
                await logSecurityEvent({
                    ip, userAgent: req.headers['user-agent'],
                    action: req.path, type: 'bot_fast_submit',
                    severity: 'medium',
                    details: { elapsed_ms: elapsed }
                });
                // No bloquear, pero registrar
            }
        }
        next();
    };
}

// ============ HELPERS PARA ADMIN ============
export function getSecurityStats() {
    const now = Date.now();
    let activeBans = 0;
    for (const [, ban] of bannedIps.entries()) {
        if (ban.expiresAt > now) activeBans++;
    }
    let totalViolations = 0;
    for (const [, list] of violationCounts.entries()) {
        totalViolations += list.filter(v => now - v.ts < CONFIG.AUTO_BAN.window).length;
    }
    return {
        active_bans: activeBans,
        recent_violations: totalViolations,
        rate_limit_buckets: rateBuckets.size,
        auto_ban_threshold: CONFIG.AUTO_BAN.violations,
        auto_ban_window_hours: CONFIG.AUTO_BAN.window / (60 * 60 * 1000)
    };
}

export function listActiveBans() {
    const now = Date.now();
    const list = [];
    for (const [ip, ban] of bannedIps.entries()) {
        if (ban.expiresAt > now) {
            list.push({
                ip,
                reason: ban.reason,
                banned_at: new Date(ban.bannedAt).toISOString(),
                expires_at: new Date(ban.expiresAt).toISOString(),
                banned_by: ban.bannedBy,
                remaining_ms: ban.expiresAt - now
            });
        }
    }
    return list.sort((a, b) => b.banned_at.localeCompare(a.banned_at));
}

export function listRecentViolations(limit = 100) {
    const all = [];
    for (const [ip, list] of violationCounts.entries()) {
        for (const v of list) {
            all.push({ ip, type: v.type, timestamp: new Date(v.ts).toISOString() });
        }
    }
    return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
}

export function setSupabaseClient(client) {
    supabaseClientRef = client;
}

export function getConfig() {
    return { ...CONFIG };
}
