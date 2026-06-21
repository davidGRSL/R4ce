import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';

// Carga propia de dotenv: con ES modules, los imports estáticos de app.js
// (que arrastran este archivo) se evalúan ANTES que el dotenv.config()
// del propio app.js. Sin esta línea, JWT_SECRET llegaría undefined cuando
// se ejecuta sin Docker (en Docker no pasa porque las env vars las inyecta
// el contenedor directamente, sin depender de dotenv).
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES || '1h';
const REFRESH_TOKEN_EXPIRES_DAYS = Number(process.env.JWT_REFRESH_EXPIRES_DAYS) || 30;

if (!JWT_SECRET) {
  // Fallar rápido en arranque: mejor un crash claro ahora que tokens
  // firmados con "undefined" más tarde.
  throw new Error('Falta JWT_SECRET en las variables de entorno');
}

/**
 * Firma un access token de corta duración (1h por defecto).
 * Va en el header Authorization: Bearer <token> de cada request protegida.
 */
export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
}

/**
 * Verifica un access token. Lanza si no es válido o ha expirado.
 * @returns {{sub: string, username: string, iat: number, exp: number}}
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Genera un refresh token opaco (NO es un JWT): un string aleatorio de alta
 * entropía. Se guarda en BD solo su hash SHA-256 (rápido y determinista,
 * a diferencia de bcrypt — aquí no hace falta lento porque el token ya
 * tiene entropía suficiente, no es una contraseña elegida por un humano).
 *
 * @returns {{ token: string, tokenHash: string, expiresAt: Date }}
 */
export function generateRefreshToken() {
  const token = crypto.randomBytes(64).toString('hex');
  const tokenHash = hashRefreshToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  return { token, tokenHash, expiresAt };
}

/**
 * Hashea un refresh token para guardarlo/buscarlo en BD sin guardar el
 * token en claro (igual que nunca se guarda una contraseña en claro).
 */
export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
