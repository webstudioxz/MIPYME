// Límite de pedidos por IP para evitar spam
export const rateLimitStore = new Map();
export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hora

// Limpiar registros viejos
setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of rateLimitStore) {
        if (now > record.resetTime) {
            rateLimitStore.delete(ip);
        }
    }
    if (rateLimitStore.size > 10000) {
        const keys = Array.from(rateLimitStore.keys());
        for (let i = 0; i < keys.length - 10000; i++) {
            rateLimitStore.delete(keys[i]);
        }
    }
}, 60000);

// Middleware para verificar el límite
export const checkRateLimit = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    let record = rateLimitStore.get(ip);
    if (!record) {
        record = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
        rateLimitStore.set(ip, record);
    }

    if (now > record.resetTime) {
        record.count = 0;
        record.resetTime = now + RATE_LIMIT_WINDOW;
    }

    if (record.count >= RATE_LIMIT_MAX) {
        return res.status(429).json({
            success: false,
            error: 'Demasiados pedidos. Espera unos minutos.'
        });
    }

    req.rateLimitRecord = record;
    next();
};