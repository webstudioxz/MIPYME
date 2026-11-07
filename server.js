import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.URL || 'https://tienda-fg.onrender.com';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const publicPath = path.join(process.cwd(), 'public');
app.use(express.static(publicPath));

// ============================================
// BUSCADOR INTELIGENTE DE ARCHIVOS
// ============================================
function findFile(filename, directory = process.cwd()) {
    try {
        const files = fs.readdirSync(directory);
        for (const file of files) {
            if (file === 'node_modules' || file === '.git' || file === 'public') continue;
            
            const fullPath = path.join(directory, file);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                const found = findFile(filename, fullPath);
                if (found) return found;
            } else if (file === filename) {
                return fullPath;
            }
        }
    } catch (e) {}
    return null;
}

async function startServer() {
    try {
        console.log('🔍 Buscando archivos del servidor...');
        
        // Buscar los archivos en cualquier parte del proyecto
        const apiRoutesPath = findFile('apiRoutes.js');
        const adminRoutesPath = findFile('adminRoutes.js');

        if (!apiRoutesPath || !adminRoutesPath) {
            console.error("❌ No se encontraron los archivos de rutas (apiRoutes.js o adminRoutes.js).");
            return;
        }

        console.log(`✅ API encontrada en: ${apiRoutesPath}`);
        console.log(`✅ Admin encontrado en: ${adminRoutesPath}`);

        // Importación dinámica usando la ruta absoluta encontrada
        const apiRoutes = (await import(`file://${apiRoutesPath}`)).default;
        const adminRoutes = (await import(`file://${adminRoutesPath}`)).default;

        app.use('/api', apiRoutes);
        app.use('/api/admin', adminRoutes);

        // ============================================
        // RUTAS HTML
        // ============================================
        app.get('/', (req, res) => {
            res.sendFile(path.join(publicPath, 'index.html'), (err) => {
                if (err) {
                    console.error("❌ Error cargando index.html:", err.message);
                    res.status(500).send("Error interno: no se encontró index.html.");
                }
            });
        });

        app.get('/admin', (req, res) => {
            res.sendFile(path.join(publicPath, 'admin.html'), (err) => {
                if (err) {
                    console.error("❌ Error cargando admin.html:", err.message);
                    res.status(500).send("Error interno: no se encontró admin.html.");
                }
            });
        });

        app.get('/admin.html', (req, res) => res.redirect('/admin'));

        app.get('/producto/:id', (req, res) => {
            res.sendFile(path.join(publicPath, 'index.html'));
        });

        app.use((req, res) => {
            if (req.path.startsWith('/api/')) {
                return res.status(404).json({ success: false, error: 'API endpoint no encontrado' });
            }
            res.status(404).sendFile(path.join(publicPath, 'offline.html'), (err) => {
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
            console.log(`📋 Panel Admin: ${BASE_URL}/admin`);
            console.log(`📁 Sirviendo archivos desde: ${publicPath}`);
        });

    } catch (error) {
        console.error("❌ Error crítico al cargar rutas:", error.message);
        console.error(error);
    }
}

startServer();