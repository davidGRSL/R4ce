import jwt from 'jsonwebtoken';

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
