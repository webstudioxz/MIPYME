import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// 🚨 CAMBIO: Quitamos el './src/' de las rutas para que Render lo encuentre
import apiRoutes from './routes/apiRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.URL || 'https://geminis-r28w.onrender.com';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================
// 🚨 CONFIGURACIÓN DE CACHÉ PARA RENDER
// Esto obliga al navegador a pedir siempre el HTML nuevo
// ============================================
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || req.path === '/admin') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

// Servir la carpeta public (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Rutas de la API
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// ============================================
// RUTAS HTML
// ============================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            console.error("❌ Error cargando index.html:", err.message);
            res.status(500).send("Error interno: no se encontró index.html en la carpeta public.");
        }
    });
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'), (err) => {
        if (err) {
            console.error("❌ Error cargando admin.html:", err.message);
            res.status(500).send("Error interno: no se encontró admin.html en la carpeta public.");
        }
    });
});

app.get('/admin.html', (req, res) => res.redirect('/admin'));

app.get('/producto/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// 404 (Manejo de rutas no encontradas)
// ============================================
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ success: false, error: 'API endpoint no encontrado' });
    }
    res.status(404).sendFile(path.join(__dirname, 'public', 'offline.html'), (err) => {
        if (err) {
            res.status(404).send("Página no encontrada");
        }
    });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Tienda-FG corriendo en puerto ${PORT}`);
    console.log(`🛒 Tienda: ${BASE_URL}`);
    console.log(`📋 Admin: ${BASE_URL}/admin`);
});