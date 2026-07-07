/**
 * Rate limiting con Redis (INCR + EXPIRE), sin dependencias nuevas.
 * Fail-open: si Redis no responde, la petición pasa (se loguea el fallo).
 *
 * Uso:
 *   router.post('/login', rateLimit({ prefix: 'login', windowSec: 300, max: 10 }), login);
 *
 * La clave es por IP (req.ip — app.js activa trust proxy para que funcione
 * detrás del proxy de Vite / un reverse proxy).
 */
import { getRedis } from '../db/redis.js';

export function rateLimit({ prefix, windowSec = 60, max = 10 }) {
  return async (req, res, next) => {
    try {
      const redis = await getRedis();
      if (!redis) return next(); // fail-open

      const key = `rl:${prefix}:${req.ip}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSec);
      }

      if (count > max) {
        const ttl = await redis.ttl(key);
        res.set('Retry-After', String(Math.max(1, ttl)));
        return res.status(429).json({
          error: { message: 'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.', status: 429 },
        });
      }

      return next();
    } catch (err) {
      console.error('  [rateLimit] fail-open:', err.message);
      return next();
    }
  };
}
