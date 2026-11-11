export const rateLimitStore = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of rateLimitStore) {
        if (now > record.resetTime) rateLimitStore.delete(ip);
    }
}, 60000);

export const checkRateLimit = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    let record = rateLimitStore.get(ip);
    
    if (!record) { 
        record = { count: 0, resetTime: Date.now() + RATE_LIMIT_WINDOW }; 
        rateLimitStore.set(ip, record); 
    }
    if (Date.now() > record.resetTime) { 
        record.count = 0; 
        record.resetTime = Date.now() + RATE_LIMIT_WINDOW; 
    }
    if (record.count >= RATE_LIMIT_MAX) {
        return res.status(429).json({ success: false, error: 'Demasiados pedidos. Espera unos minutos.' });
    }
    
    req.rateLimitRecord = record;
    next();
};