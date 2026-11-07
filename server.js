import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

// ⚠️ IMPORTANTE: los imports de rutas van DESPUÉS de dotenv.config()
// para que Supabase/Push lean bien las variables de entorno.
const { default: apiRoutes } = await import('./src/routes/apiRoutes.js');
const { default: adminRoutes } = await import('./src/routes/adminRoutes.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.URL || `http://localhost:${PORT}`;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir la carpeta public
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
// 404
// ============================================
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ success: false, error: 'API endpoint no encontrado' });
    }
    res.status(404).sendFile(path.join(__dirname, 'public', 'offline.html'), (err) => {
        if (err) res.status(404).send("Página no encontrada");
    });
});

// ============================================
// MANEJO GLOBAL DE ERRORES (para que nunca tumbe el server)
// ============================================
app.use((err, req, res, next) => {
    console.error('💥 Error no controlado:', err);
    if (req.path.startsWith('/api/')) {
        return res.status(500).json({ success: false, error: err.message || 'Error interno' });
    }
    res.status(500).send('Error interno del servidor');
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Tienda-FG corriendo en puerto ${PORT}`);
    console.log(`📋 Panel Admin: ${BASE_URL}/admin`);
});

// Capturar errores no manejados para que no maten el proceso en producción
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err);
});