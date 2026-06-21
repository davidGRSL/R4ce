import { verifyAccessToken } from '../utils/jwt.js';

/**
 * Middleware de protección de rutas: exige header
 * "Authorization: Bearer <accessToken>" válido y no expirado.
 * Si es correcto, añade req.user = { id, username }.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      error: { message: 'Falta token de autenticación', status: 401 },
    });
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Token expirado'
      : 'Token inválido';
    return res.status(401).json({ error: { message, status: 401 } });
  }
}
