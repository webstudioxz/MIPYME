window.StoreUtils = {
    MALAS_PALABRAS: [
        'puta', 'puto', 'pendejo', 'pendeja', 'coño', 'cojones', 'verga', 'carajo', 'mierda', 'cabron',
        'cabrona', 'hijodeputa', 'hijo de puta', 'malparido', 'malparida', 'gonorrea', 'maricon', 'maricona',
        'bollo', 'bollera', 'trola', 'zorra', 'perra', 'perro', 'putamadre', 'chinga', 'chingar', 'joder',
        'jodido', 'jodida', 'culo', 'culero', 'culera', 'chucha', 'chupame', 'mamaguevo', 'mamagueva',
        'come mierda', 'soplapollas', 'cagada', 'cagado', 'gilipollas', 'gilipolla', 'capullo', 'capulla',
        'subnormal', 'retrasado', 'retrasada', 'mongolo', 'mongola', 'imbecil', 'imbécil', 'estupido',
        'estúpido', 'estupida', 'idiota', 'tarado', 'tarada', 'tonto', 'tonta'
    ],

    filtrarPalabrasOfensivas(texto) {
        if (!texto) return { limpio: '', ofensivo: false, palabras: [] };
        const palabras = texto.toLowerCase().split(/\s+/);
        const ofensivas = [];
        let textoLimpio = texto;
        palabras.forEach(palabra => {
            const limpia = palabra.replace(/[^a-zA-ZáéíóúñÑ]/g, '');
            if (limpia.length > 2) {
                this.MALAS_PALABRAS.forEach(mala => {
                    if (limpia.includes(mala) || limpia === mala) {
                        if (!ofensivas.includes(mala)) ofensivas.push(mala);
                        const regex = new RegExp(mala, 'gi');
                        textoLimpio = textoLimpio.replace(regex, '****');
                    }
                });
            }
        });
        return { limpio: textoLimpio, ofensivo: ofensivas.length > 0, palabras: ofensivas };
    },

    sanitizarTexto(texto) {
        if (!texto) return '';
        return texto.replace(/<[^>]*>/g, '').replace(/[<>{}()\[\]\/\\;'"`]/g, '').trim().slice(0, 200);
    },

    validarTelefonoCubano(telefono) {
        const limpio = telefono.replace(/[^0-9]/g, '');
        if (!limpio) return { valido: false, limpio: '', mensaje: 'El teléfono es obligatorio' };
        if (telefono.includes('+53')) {
            const sinMas = limpio.replace(/^53/, '');
            if (sinMas.length === 8 && sinMas.startsWith('5')) return { valido: true, limpio: sinMas, mensaje: 'Número válido' };
            return { valido: false, limpio: limpio, mensaje: 'Formato: +53 5XXXXXXX (8 dígitos después del +53)' };
        }
        if (limpio.length === 8 && limpio.startsWith('5')) {
            if (limpio.startsWith('53')) {
                const sinCodigo = limpio.substring(2);
                if (sinCodigo.startsWith('5')) return { valido: true, limpio: sinCodigo, mensaje: 'Número válido' };
            }
            return { valido: true, limpio: limpio, mensaje: 'Número válido' };
        }
        if (limpio.length === 10 && limpio.startsWith('53')) {
            const sinCodigo = limpio.substring(2);
            if (sinCodigo.length === 8 && sinCodigo.startsWith('5')) return { valido: true, limpio: sinCodigo, mensaje: 'Número válido' };
            return { valido: false, limpio: limpio, mensaje: 'Después de 53 deben haber 8 dígitos empezando con 5' };
        }
        if (limpio.length === 7 && limpio.startsWith('5')) return { valido: false, limpio: limpio, mensaje: 'El número debe tener 8 dígitos. Ej: 5XXXXXXX' };
        return { valido: false, limpio: limpio, mensaje: 'Formato cubano: 5XXXXXXX (8 dígitos) o +53 5XXXXXXX' };
    },

    validarDireccion(direccion) {
        const regex = /^[a-zA-Z0-9áéíóúñÑ\s#/.,\-]+$/;
        if (!regex.test(direccion)) {
            const invalidos = direccion.replace(/[a-zA-Z0-9áéíóúñÑ\s#/.,\-]/g, '');
            return { valido: false, mensaje: `Caracteres no permitidos: "${invalidos}". Solo se permiten: #, /, ., ,, -` };
        }
        if (!/[a-zA-Z0-9]/.test(direccion)) return { valido: false, mensaje: 'La dirección debe contener al menos un número o letra' };
        if (direccion.length < 5) return { valido: false, mensaje: 'La dirección debe tener al menos 5 caracteres' };
        if (direccion.length > 200) return { valido: false, mensaje: 'La dirección no puede exceder 200 caracteres' };
        return { valido: true, mensaje: 'Dirección válida' };
    }
};