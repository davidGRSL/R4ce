/**
 * Persistencia del modo Live en el dispositivo (localStorage).
 *
 * Resuelve tres fallos reales en carrera:
 *   1. Recarga o cierre accidental de la web → la participación se guarda
 *      de forma continua y se puede REANUDAR. El crono no se desincroniza
 *      porque se basa en timestamps absolutos (Date.now), no en contadores.
 *   2. Sin cobertura al cruzar meta → el tiempo se ENCOLA y se reenvía
 *      automáticamente cuando vuelve la conexión.
 *   3. (La pantalla apagada se mitiga con Wake Lock en Live.jsx.)
 *
 * Nota: localStorage, no cookies — las cookies viajan en cada request y
 * tienen límite de 4KB; aquí guardamos el track GPS completo.
 */
import { api } from './api.js';

const RUN_KEY   = 'r4ce:liveRun:v1';
const QUEUE_KEY = 'r4ce:pendingTimes:v1';
const RUN_MAX_AGE_MS = 6 * 3600 * 1000; // una carrera de hace >6h no se reanuda

// ─────────────────────────────────────────────
// Participación en curso
// ─────────────────────────────────────────────

/** Guarda el estado de la carrera. Silencioso si localStorage falla (cuota). */
export function saveRun(run) {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify({ ...run, savedAt: Date.now() }));
  } catch { /* cuota llena o modo privado: seguimos sin persistencia */ }
}

/** Devuelve la carrera guardada o null si no hay o está caducada. */
export function loadRun() {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw);
    if (!run?.stage || !run?.phase) return null;
    if (Date.now() - (run.savedAt ?? 0) > RUN_MAX_AGE_MS) {
      clearRun();
      return null;
    }
    return run;
  } catch {
    return null;
  }
}

export function clearRun() {
  try { localStorage.removeItem(RUN_KEY); } catch { /* — */ }
}

// ─────────────────────────────────────────────
// Cola de tiempos pendientes de enviar (sin cobertura)
// ─────────────────────────────────────────────

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY)) ?? [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch { /* — */ }
}

/** Encola un payload de POST /times para reenviarlo cuando haya red. */
export function queueTime(payload) {
  const queue = readQueue();
  queue.push({ id: crypto.randomUUID(), payload, queuedAt: Date.now() });
  writeQueue(queue);
}

export function pendingTimesCount() {
  return readQueue().length;
}

let flushing = false;

/**
 * Intenta enviar todos los tiempos encolados. Los que fallen por red se
 * conservan; los rechazados por el servidor (4xx) se descartan para no
 * reintentar eternamente algo inválido.
 * @returns {Promise<{sent: number, remaining: number}>}
 */
export async function flushPendingTimes() {
  if (flushing) return { sent: 0, remaining: pendingTimesCount() };
  flushing = true;

  try {
    const queue = readQueue();
    if (queue.length === 0) return { sent: 0, remaining: 0 };

    const remaining = [];
    let sent = 0;

    for (const item of queue) {
      try {
        await api.post('/times', item.payload);
        sent++;
      } catch (err) {
        if (err.response && err.response.status >= 400 && err.response.status < 500) {
          // El servidor lo rechaza (datos inválidos, tramo borrado…): descartar
          console.warn('[liveSession] tiempo encolado rechazado, se descarta:', err.response.status);
        } else {
          // Sin red o error 5xx: conservar y reintentar más tarde
          remaining.push(item);
        }
      }
    }

    writeQueue(remaining);
    return { sent, remaining: remaining.length };
  } finally {
    flushing = false;
  }
}
