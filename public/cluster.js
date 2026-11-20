// ============================================================
// cluster.js — Multi-server con Node.js cluster
// ============================================================
// Ejecuta un worker por CPU core. Si llega un pico de cientos de
// usuarios, las peticiones se distribuyen entre todos los cores.
// Si un worker se cae, el master lo reinicia automáticamente. La
// app NUNCA se queda sin servicio.
//
// Para producción con PM2:
//   pm2 start cluster.js -i max --name tienda-fg
//   pm2 scale tienda-fg +2    (sube 2 workers más en caliente)
//
// O directamente con Node:
//   node cluster.js
// ============================================================

import cluster from 'cluster';
import os from 'os';
import process from 'process';

const CPUS = os.cpus().length;
const MAX_WORKERS = Math.min(CPUS, 8); // Máximo 8 workers para no saturar

// Si PM2 maneja el clustering, este script solo arranca un worker.
// PM2 manda variable de entorno pm_id y exec_mode fork.
const isPM2 = process.env.pm_id !== undefined && process.env.exec_mode === 'cluster_mode';

if (cluster.isPrimary && !isPM2) {
    // ============ MASTER ============
    console.log(`🚀 Master ${process.pid} arrancando ${MAX_WORKERS} workers (${CPUS} CPUs detectadas)`);

    const workers = new Map();

    for (let i = 0; i < MAX_WORKERS; i++) {
        const worker = cluster.fork();
        workers.set(worker.process.pid, worker);
    }

    cluster.on('online', (worker) => {
        console.log(`✅ Worker ${worker.process.pid} online`);
    });

    cluster.on('exit', (worker, code, signal) => {
        console.warn(`⚠️ Worker ${worker.process.pid} murió (code=${code}, signal=${signal}). Reiniciando...`);
        workers.delete(worker.process.pid);
        const newWorker = cluster.fork();
        workers.set(newWorker.process.pid, newWorker);
    });

    // Graceful shutdown del master
    let shuttingDown = false;
    function shutdownMaster(signal) {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`\n${signal} recibido. Cerrando workers gracefully...`);
        for (const worker of workers.values()) {
            worker.send('shutdown');
            worker.process.kill('SIGTERM');
        }
        let closed = 0;
        const total = workers.size;
        const checkInterval = setInterval(() => {
            closed = total - workers.size;
            if (workers.size === 0) {
                clearInterval(checkInterval);
                console.log('✅ Todos los workers cerrados. Master saliendo.');
                process.exit(0);
            } else if (closed >= total) {
                clearInterval(checkInterval);
                process.exit(0);
            }
        }, 200);
        // Forzar salida después de 10s
        setTimeout(() => {
            console.warn('⚠️ Forzando cierre después de 10s');
            process.exit(1);
        }, 10000).unref();
    }

    process.on('SIGTERM', () => shutdownMaster('SIGTERM'));
    process.on('SIGINT', () => shutdownMaster('SIGINT'));
    process.on('SIGQUIT', () => shutdownMaster('SIGQUIT'));

    // Health check del master cada 30s
    setInterval(() => {
        const alive = workers.size;
        if (alive < MAX_WORKERS) {
            console.warn(`⚠️ Workers vivos: ${alive}/${MAX_WORKERS}. Reiniciando faltantes...`);
            for (let i = alive; i < MAX_WORKERS; i++) {
                const w = cluster.fork();
                workers.set(w.process.pid, w);
            }
        }
    }, 30000).unref();

} else {
    // ============ WORKER ============
    // Cada worker importa y arranca el server.js
    // El worker es independiente: tiene su propia cola, su propio caché de
    // rate-limit y de baneos en memoria. El circuit breaker también es local.

    process.on('message', (msg) => {
        if (msg === 'shutdown') {
            console.log(`Worker ${process.pid}: shutdown recibido, cerrando gracefully...`);
            // El server.js debe escuchar este evento para cerrar conexiones
            process.emit('SIGTERM');
        }
    });

    // Capturar errores no manejados — NUNCA deben tirar el worker
    process.on('uncaughtException', (err) => {
        console.error(`💥 Worker ${process.pid} UNCAUGHT:`, err.message);
        // No salir inmediatamente, dejar que termine las peticiones en vuelo
        setTimeout(() => process.exit(1), 1000);
    });

    process.on('unhandledRejection', (reason) => {
        console.error(`💥 Worker ${process.pid} UNHANDLED REJECTION:`, reason?.message || reason);
        // No matar el worker, solo loguear
    });

    // Importar y arrancar el server
    await import('./server.js');
}
