// ============================================================
// cliente-profanity-filter.js — Capa 1: Blindaje en tiempo real
// ============================================================
// Bloquea INMEDIATAMENTE la escritura de malas palabras u ofensas
// en CUALQUIER campo de texto del sitio (input, textarea, contenteditable).
// Funciona a nivel keypress: la letra nunca llega al campo si forma parte
// de una mala palabra. Cero tolerancia.
// ============================================================

(function() {
    'use strict';

    // Lista de malas palabras (debe ser idéntica a la del server)
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
        'polla','pollas','cono','hijoputa','hijueputa','hijueputas',
        'malparido','malparida','malparidos','malparidas',
        'gonorrea','gonorreas',
        // Inglés
        'fuck','fucker','fucking','fucked','fucks','shit','shitty','shits',
        'bitch','bitches','bitching','asshole','assholes','dick','dicks','dickhead',
        'pussy','pussies','bastard','bastards','cunt','cunts','motherfucker',
        'motherfuckers','wanker','wankers','twat','twats','prick','pricks',
        'slut','sluts','slutty','whore','whores','douche','douchebag'
    ];

    // Compilar regex UNA sola vez (performance)
    const profanityRegex = new RegExp(
        '\\b(' + PROFANITY.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b',
        'gi'
    );

    // Patrones de ataques que TAMBIÉN se bloquean en tiempo real
    const ATTACK_PATTERNS = [
        /<script[^>]*>/i, /<\/script>/i, /javascript:/i,
        /\bon(load|error|click|mouseover|focus)\s*=/i,
        /<iframe[^>]*>/i, /<embed[^>]*>/i, /<object[^>]*>/i,
        /(\bunion\b\s+\bselect\b)/i, /(\bdrop\b\s+\btable\b)/i,
        /(\bselect\b\s+.*\bfrom\b)/i, /(\binsert\b\s+\binto\b)/i,
        /(\bdelete\b\s+\bfrom\b)/i, /(\balter\b\s+\btable\b)/i,
        /(\bor\s+1\s*=\s*1\b)/i, /(\band\s+1\s*=\s*1\b)/i,
        /('\s*(or|and)\s+.*'=)/i, /(\bxp_cmdshell\b)/i,
        /(\.\.[\/\\]){2,}/, /(\/etc\/passwd)/i
    ];

    // ============================================================
    // FUNCIÓN PRINCIPAL: filtra un texto y devuelve { clean, blocked, words }
    // ============================================================
    function filterText(text) {
        if (!text || typeof text !== 'string') return { clean: text, blocked: false, words: [], attacks: 0 };
        let blocked = false;
        const wordsFound = [];
        // Detectar malas palabras
        const matches = text.match(profanityRegex) || [];
        if (matches.length > 0) {
            blocked = true;
            wordsFound.push(...new Set(matches.map(m => m.toLowerCase())));
        }
        // Detectar patrones de ataque
        let attacks = 0;
        for (const p of ATTACK_PATTERNS) {
            if (p.test(text)) attacks++;
        }
        if (attacks > 0) blocked = true;
        // Limpiar: reemplazar mala palabra por asteriscos
        const clean = text.replace(profanityRegex, '***');
        return { clean, blocked, words: wordsFound, attacks };
    }

    // ============================================================
    // MONITOREO EN TIEMPO REAL DE TODOS LOS INPUTS
    // ============================================================
    let warningElement = null;

    function getOrCreateWarning() {
        if (warningElement && document.body.contains(warningElement)) return warningElement;
        warningElement = document.createElement('div');
        warningElement.id = 'profanity-warning';
        warningElement.style.cssText = `
            position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
            background: linear-gradient(135deg, #EF4444, #B91C1C);
            color: white; padding: 12px 22px; border-radius: 12px;
            font-family: 'Inter', -apple-system, sans-serif; font-weight: 700;
            font-size: 0.88rem; box-shadow: 0 10px 30px rgba(239,68,68,0.4);
            z-index: 99999; display: none; pointer-events: none;
            animation: profanityPulse 0.4s ease;
        `;
        const style = document.createElement('style');
        style.textContent = `@keyframes profanityPulse {
            0% { transform: translateX(-50%) scale(0.8); opacity: 0; }
            100% { transform: translateX(-50%) scale(1); opacity: 1; }
        }`;
        document.head.appendChild(style);
        document.body.appendChild(warningElement);
        return warningElement;
    }

    let warningTimeout = null;
    function showWarning(message) {
        const el = getOrCreateWarning();
        el.textContent = '🚫 ' + message;
        el.style.display = 'block';
        if (warningTimeout) clearTimeout(warningTimeout);
        warningTimeout = setTimeout(() => { el.style.display = 'none'; }, 3000);
    }

    // Procesa un campo: bloquea entrada, sanitiza valor
    function protectField(field) {
        if (!field || field.dataset.profanityProtected === '1') return;
        field.dataset.profanityProtected = '1';

        // Antes de cada tecla: pre-validación
        field.addEventListener('keypress', function(e) {
            // Solo texto, no combos
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const char = String.fromCharCode(e.which || e.keyCode);
            // Construir el texto resultante si se permite la tecla
            const start = field.selectionStart || 0;
            const end = field.selectionEnd || 0;
            const futureText = (field.value || '').slice(0, start) + char + (field.value || '').slice(end);
            const result = filterText(futureText);
            if (result.blocked && result.words.length > 0) {
                e.preventDefault();
                showWarning('No se permiten palabras ofensivas: ' + result.words.join(', '));
                return false;
            }
        });

        // Al pegar (paste): validar contenido pegado
        field.addEventListener('paste', function(e) {
            const pasted = (e.clipboardData || window.clipboardData).getData('text') || '';
            const futureText = (field.value || '') + pasted;
            const result = filterText(futureText);
            if (result.blocked) {
                e.preventDefault();
                if (result.words.length > 0) {
                    showWarning('No se permiten palabras ofensivas: ' + result.words.join(', '));
                } else {
                    showWarning('Contenido bloqueado por seguridad');
                }
                // Permitir solo la versión limpia
                const cleanResult = filterText(futureText);
                if (cleanResult.clean !== futureText) {
                    // Insertar versión sanitada
                    field.value = cleanResult.clean;
                }
                return false;
            }
        });

        // Al soltar tecla: sanitizar lo que ya está (por si se burló el keypress)
        field.addEventListener('input', function(e) {
            const result = filterText(field.value);
            if (result.blocked) {
                const before = field.value;
                field.value = result.clean;
                if (result.words.length > 0 && before !== result.clean) {
                    showWarning('Palabras ofensivas filtradas automáticamente');
                }
                // Disparar evento input para que frameworks lo noten
                field.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        // Al perder foco: doble check
        field.addEventListener('blur', function() {
            const result = filterText(field.value);
            if (result.blocked) {
                field.value = result.clean;
            }
        });
    }

    // ============================================================
    // ESCANEAR Y PROTEGER TODOS LOS CAMPOS EXISTENTES + FUTUROS
    // ============================================================
    function protectAllFields() {
        // Inputs y textareas existentes
        document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="search"], input[type="url"], textarea, [contenteditable="true"]').forEach(protectField);
    }

    // MutationObserver: proteger campos que se agreguen dinámicamente
    function startObserver() {
        if (!window.MutationObserver) return;
        const observer = new MutationObserver(function(mutations) {
            for (const mut of mutations) {
                for (const node of mut.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    if (node.matches && node.matches('input[type="text"], input[type="email"], input[type="tel"], input[type="search"], input[type="url"], textarea, [contenteditable="true"]')) {
                        protectField(node);
                    }
                    if (node.querySelectorAll) {
                        node.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="search"], input[type="url"], textarea, [contenteditable="true"]').forEach(protectField);
                    }
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // Inicializar cuando el DOM esté listo
    function init() {
        protectAllFields();
        startObserver();
        // Re-escanear cada 2 segundos por si el observer falla
        setInterval(protectAllFields, 2000);
        console.log('🛡️ Filtro anti-profanidad en tiempo real activo');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // API pública
    window.ProfanityFilter = {
        filter: filterText,
        isClean: function(text) { return !filterText(text).blocked; },
        sanitize: function(text) { return filterText(text).clean; },
        protect: protectField,
        protectAll: protectAllFields
    };
})();
