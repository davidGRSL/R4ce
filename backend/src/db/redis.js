/**
 * Cliente Redis compartido (lazy). Primer uso real de Redis en el proyecto:
 * rate limiting y dedupe de vistas.
 *
 * Filosofía fail-open: si Redis no está disponible, getRedis() devuelve null
 * y el llamador debe seguir funcionando sin él (nunca tumbar una petición
 * por culpa de Redis).
 */
import { createClient } from 'redis';

let client = null;
let connecting = null;

export async function getRedis() {
  if (client?.isReady) return client;

  if (!connecting) {
    client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: { connectTimeout: 3000 },
    });
    client.on('error', (err) => {
      console.error('  [redis] error:', err.message);
    });
    connecting = client.connect()
      .then(() => console.log('✓ Redis conectado'))
      .catch((err) => {
        console.error('✗ No se pudo conectar a Redis:', err.message);
        connecting = null; // permitir reintento en la siguiente llamada
      });
  }

  try {
    await connecting;
  } catch {
    // ya logueado arriba
  }

  return client?.isReady ? client : null;
}
