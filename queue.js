// ============================================================
// queue.js — Sistema de colas jerárquicas + Circuit Breaker
// ============================================================
// Diseñado para que el server NUNCA se sature ni se caiga por carga.
// Si llegan cientos de usuarios simultáneos, las peticiones se encolan
// por prioridad y se procesan en orden. Si una operación falla mucho,
// el circuit breaker abre y responde rápido en vez de saturar.
// ============================================================

import { EventEmitter } from 'events';

// ============ CONFIGURACIÓN ============
const QUEUE_CONFIG = {
    // Concurrencia máxima por worker (cuántas tareas se ejecutan a la vez)
    maxConcurrency: 20,
    // Tamaño máximo de cada cola (si se llena, se rechaza con 503)
    maxQueueSize: 500,
    // Timeout de tarea (ms) — si tarda más, se cancela
    taskTimeout: 30000,
    // Circuit Breaker
    circuitBreaker: {
        // Abre el circuito tras N fallos consecutivos
        failureThreshold: 5,
        // Tiempo que permanece abierto antes de probar de nuevo
        resetTimeout: 30000, // 30s
        // Tiempo que estuvo medio-abierto antes de cerrar
        halfOpenSuccessThreshold: 3
    },
    // Prioridades (menor número = mayor prioridad)
    priorities: {
        critical: 0,   // login, pagos, seguridad
        high: 1,       // reservas, crear tienda, crear producto
        normal: 2,     // configuración, pausa, pedidos
        low: 3,        // lecturas, listados, stats
        background: 4  // logs, push notifications
    }
};

// ============ CIRCUIT BREAKER ============
// Estado: CLOSED (todo fluye) | OPEN (todo falla rápido) | HALF_OPEN (probando)
class CircuitBreaker {
    constructor(name, config) {
        this.name = name;
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = null;
        this.openedAt = null;
        this.config = config;
        this.events = new EventEmitter();
    }

    async execute(fn) {
        if (this.state === 'OPEN') {
            // Verificar si ya pasó el resetTimeout
            if (Date.now() - this.openedAt > this.config.resetTimeout) {
                this.state = 'HALF_OPEN';
                this.successCount = 0;
                console.warn(`[CIRCUIT] ${this.name}: CLOSED → HALF_OPEN (probando)`);
            } else {
                // Aún abierto: fallar rápido sin intentar
                const err = new Error(`Circuit breaker ${this.name} OPEN — intente más tarde`);
                err.code = 'CIRCUIT_OPEN';
                throw err;
            }
        }

        try {
            const result = await fn();
            this._onSuccess();
            return result;
        } catch (err) {
            this._onFailure();
            throw err;
        }
    }

    _onSuccess() {
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= this.config.halfOpenSuccessThreshold) {
                this.state = 'CLOSED';
                this.failureCount = 0;
                console.log(`[CIRCUIT] ${this.name}: HALF_OPEN → CLOSED (recuperado)`);
                this.events.emit('recovered');
            }
        } else if (this.state === 'CLOSED') {
            this.failureCount = 0;
        }
    }

    _onFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.state === 'HALF_OPEN') {
            // Falló en half-open: vuelve a abrir
            this.state = 'OPEN';
            this.openedAt = Date.now();
            console.warn(`[CIRCUIT] ${this.name}: HALF_OPEN → OPEN (sigue fallando)`);
            this.events.emit('opened');
        } else if (this.state === 'CLOSED' && this.failureCount >= this.config.failureThreshold) {
            this.state = 'OPEN';
            this.openedAt = Date.now();
            console.warn(`[CIRCUIT] ${this.name}: CLOSED → OPEN (${this.failureCount} fallos consecutivos)`);
            this.events.emit('opened');
        }
    }

    getStatus() {
        return {
            name: this.name,
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            openedAt: this.openedAt,
            lastFailureTime: this.lastFailureTime
        };
    }
}

// ============ COLA JERÁRQUICA ============
// Una cola por worker que procesa por prioridad. Cada tarea tiene:
// { priority, fn, resolve, reject, enqueuedAt, timeout }
class PriorityQueue {
    constructor() {
        this.queues = {
            0: [], // critical
            1: [], // high
            2: [], // normal
            3: [], // low
            4: []  // background
        };
        this.running = 0;
        this.totalProcessed = 0;
        this.totalRejected = 0;
        this.totalTimeouts = 0;
        this.processing = false;
    }

    get size() {
        return Object.values(this.queues).reduce((sum, q) => sum + q.length, 0);
    }

    get totalInFlight() {
        return this.running;
    }

    // Encola una tarea
    enqueue(priority, fn, options = {}) {
        return new Promise((resolve, reject) => {
            const prio = QUEUE_CONFIG.priorities[priority] ?? QUEUE_CONFIG.priorities.normal;
            const totalInQueue = this.size;
            if (totalInQueue >= QUEUE_CONFIG.maxQueueSize) {
                this.totalRejected++;
                reject(Object.assign(new Error('Server saturado — intente más tarde'), { code: 'QUEUE_FULL' }));
                return;
            }
            const task = {
                priority: prio,
                fn,
                resolve,
                reject,
                enqueuedAt: Date.now(),
                timeout: options.timeout || QUEUE_CONFIG.taskTimeout,
                timeoutId: null
            };
            this.queues[prio].push(task);
            this._processNext();
        });
    }

    // Procesa la siguiente tarea según prioridad
    async _processNext() {
        if (this.processing) return;
        this.processing = true;

        while (this.running < QUEUE_CONFIG.maxConcurrency) {
            // Buscar la tarea de mayor prioridad disponible
            let task = null;
            for (let prio = 0; prio <= 4; prio++) {
                if (this.queues[prio].length > 0) {
                    task = this.queues[prio].shift();
                    break;
                }
            }
            if (!task) break;

            this.running++;
            this._executeTask(task);
        }
        this.processing = false;
    }

    _executeTask(task) {
        // Timeout: si la tarea tarda demasiado, se cancela
        task.timeoutId = setTimeout(() => {
            this.totalTimeouts++;
            task.reject(Object.assign(new Error('Timeout de tarea'), { code: 'TASK_TIMEOUT' }));
            this.running--;
            this._processNext();
        }, task.timeout);

        Promise.resolve()
            .then(() => task.fn())
            .then(result => {
                clearTimeout(task.timeoutId);
                this.totalProcessed++;
                task.resolve(result);
            })
            .catch(err => {
                clearTimeout(task.timeoutId);
                task.reject(err);
            })
            .finally(() => {
                this.running--;
                this._processNext();
            });
    }

    getStats() {
        const queueByPriority = {};
        for (let p = 0; p <= 4; p++) {
            const name = Object.keys(QUEUE_CONFIG.priorities).find(k => QUEUE_CONFIG.priorities[k] === p);
            queueByPriority[name] = this.queues[p].length;
        }
        return {
            inFlight: this.running,
            queued: this.size,
            queueByPriority,
            totalProcessed: this.totalProcessed,
            totalRejected: this.totalRejected,
            totalTimeouts: this.totalTimeouts,
            maxConcurrency: QUEUE_CONFIG.maxConcurrency
        };
    }
}

// ============ INSTANCIAS GLOBALES (una por worker) ============
const globalQueue = new PriorityQueue();

// Circuit breakers por servicio crítico
const circuitBreakers = {
    supabase: new CircuitBreaker('supabase', QUEUE_CONFIG.circuitBreaker),
    auth: new CircuitBreaker('auth', QUEUE_CONFIG.circuitBreaker),
    push: new CircuitBreaker('push', QUEUE_CONFIG.circuitBreaker),
    payments: new CircuitBreaker('payments', QUEUE_CONFIG.circuitBreaker)
};

// ============ API PÚBLICA ============

// Envuelve una función async para que pase por la cola con prioridad
export function enqueue(priority, fn, options) {
    return globalQueue.enqueue(priority, fn, options);
}

// Envuelve una llamada a Supabase con circuit breaker
export async function withSupabaseBreaker(fn) {
    return circuitBreakers.supabase.execute(fn);
}

// Envuelve auth
export async function withAuthBreaker(fn) {
    return circuitBreakers.auth.execute(fn);
}

// Envuelve push
export async function withPushBreaker(fn) {
    return circuitBreakers.push.execute(fn);
}

// Envuelve payments
export async function withPaymentsBreaker(fn) {
    return circuitBreakers.payments.execute(fn);
}

// Estadísticas para monitoreo
export function getQueueStats() {
    return {
        queue: globalQueue.getStats(),
        circuitBreakers: Object.fromEntries(
            Object.entries(circuitBreakers).map(([k, v]) => [k, v.getStatus()])
        )
    };
}

// Health check rápido: si hay problemas, retorna false
export function isHealthy() {
    const stats = getQueueStats();
    // Si más del 80% de la cola está llena, no saludable
    if (stats.queue.queued > QUEUE_CONFIG.maxQueueSize * 0.8) return false;
    // Si algún circuit breaker está abierto, no saludable
    for (const cb of Object.values(circuitBreakers)) {
        if (cb.state === 'OPEN') return false;
    }
    return true;
}

export { QUEUE_CONFIG };
