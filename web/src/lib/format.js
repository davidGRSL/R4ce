/**
 * Formatea milisegundos a MM:SS.mmm
 */
export function formatDuration(ms) {
  if (!ms && ms !== 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const minutes  = Math.floor(totalSec / 60);
  const seconds  = totalSec % 60;
  const millis   = ms % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/**
 * Formatea fecha ISO a "21 Jun 2026"
 */
export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Diferencia entre dos tiempos en formato +X.XXX
 */
export function formatGap(ms, leaderMs) {
  if (ms === leaderMs) return '—';
  const diff = (ms - leaderMs) / 1000;
  return `+${diff.toFixed(3)}`;
}
