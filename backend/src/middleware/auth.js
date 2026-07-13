import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_change_in_production';

/**
 * requireAuth — rechaza la petición si no hay token válido.
 * Usado en rutas que siempre requieren estar autenticado.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: { message: 'Token requerido', status: 401 } });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch (err) {
    return res.status(401).json({ error: { message: 'Token inválido o expirado', status: 401 } });
  }
}

/**
 * optionalAuth — no rechaza si no hay token, pero si hay uno válido
 * lo decodifica y pone req.user. Útil para rutas públicas que muestran
 * contenido adicional al usuario autenticado (ej: ver sus propios tramos privados).
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, username: payload.username };
  } catch {
    req.user = null;
  }

  next();
}

/**
 * requireRole('admin') / requireRole('admin', 'premium') — usar DESPUÉS de
 * requireAuth. Lee el rol de la BD en cada petición (no del JWT) para que
 * un cambio de rol surta efecto inmediato y una revocación no dependa de
 * la caducidad del token. Añade req.user.role.
 */
export function requireRole(...roles) {
  return async (req, res, next) => {
    try {
      const result = await query(`SELECT role FROM users WHERE id = $1`, [req.user.id]);
      const role = result.rows[0]?.role ?? 'user';
      req.user.role = role;
      if (!roles.includes(role)) {
        return res.status(403).json({ error: { message: 'No tienes permisos para esta acción', status: 403 } });
      }
      next();
    } catch (err) {
      console.error('Error en requireRole:', err);
      return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
    }
  };
}

/**
 * Gate de verificación de email para publicar contenido público.
 * Solo se aplica si REQUIRE_EMAIL_VERIFICATION=true (así el entorno de
 * desarrollo y el seed no se rompen). Usar tras requireAuth.
 */
export function requireVerifiedForPublic(req, res, next) {
  if (process.env.REQUIRE_EMAIL_VERIFICATION !== 'true') return next();

  // Para POST /times solo aplica si el tiempo va a ser público
  if (req.body && 'visibility' in req.body && req.body.visibility !== 'public') {
    return next();
  }

  query(`SELECT email_verified_at FROM users WHERE id = $1`, [req.user.id])
    .then((result) => {
      if (!result.rows[0]?.email_verified_at) {
        return res.status(403).json({
          error: { message: 'Verifica tu email para publicar contenido público', status: 403, code: 'EMAIL_NOT_VERIFIED' },
        });
      }
      next();
    })
    .catch((err) => {
      console.error('Error en requireVerifiedForPublic:', err);
      return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
    });
}
