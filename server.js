import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Importar Rutas
import apiRoutes from './src/routes/apiRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.URL || 'https://tienda-fg.onrender.com';

// ============================================
// MIDDLEWARE BASE
// ============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir archivos estáticos desde la carpeta 'public'
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
        } else if (filePath.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000');
        }
    }
}));

// ============================================
// 🛡️ BLOQUEO DE RUTAS SOSPECHOSAS
// ============================================
app.use((req, res, next) => {
    const blockedPaths = ['/wp-admin', '/cpanel', '/phpmyadmin', '/.env', '/.git', '/backup', '/shell'];
    const requestPath = req.path.toLowerCase();
    if (blockedPaths.some(p => requestPath.startsWith(p))) {
        return res.status(404).send('Not Found');
    }
    next();
});

// ============================================
// RUTAS DE LA API (Delegadas a src/routes)
// ============================================
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// ============================================
// RUTAS ESTÁTICAS (HTML)
// ============================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin.html', (req, res) => res.redirect('/admin'));

app.get('/producto/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// 🗺️ SITEMAP.XML y ROBOTS.TXT
// ============================================
app.get('/sitemap.xml', async (req, res) => {
    try {
        const { supabase } = await import('./src/config/supabase.js');
        const { data: stores } = await supabase.from('stores').select('id, updated_at');
        
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
        xml += `\n<url><loc>${BASE_URL}/</loc><priority>1.0</priority></url>`;
        
        stores?.forEach(store => {
            xml += `\n<url><loc>${BASE_URL}/?tienda=${store.id}</loc><priority>0.8</priority></url>`;
        });
        
        xml += `\n</urlset>`;
        res.header('Content-Type', 'application/xml').send(xml);
    } catch (error) {
        res.status(500).send('Error generando sitemap');
    }
});

app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nSitemap: ${BASE_URL}/sitemap.xml`);
});

// ============================================
// MANEJO DE RUTAS NO ENCONTRADAS (404)
// ============================================
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ success: false, error: 'API endpoint no encontrado' });
    }
    res.status(404).sendFile(path.join(__dirname, 'public', 'offline.html'));
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Tienda-FG corriendo en puerto ${PORT}`);
    console.log(`📋 Panel Admin: ${BASE_URL}/admin`);
    console.log('========================================');
});