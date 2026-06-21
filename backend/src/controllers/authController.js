import bcrypt from 'bcrypt';
import { query } from '../db/pool.js';
import { signAccessToken, generateRefreshToken, hashRefreshToken } from '../utils/jwt.js';
import { validateUsername, validatePassword, validatePseudonym } from '../utils/validators.js';

const BCRYPT_ROUNDS = 12;

// Inserta una fila en audit_log sin bloquear ni romper la respuesta si falla.
async function logAudit({ userId, action, req }) {
  try {
    await query(
      `INSERT INTO audit_log (user_id, action, resource_type, resource_id, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, 'user', userId, req.ip]
    );
  } catch (err) {
    console.error('  [audit_log] no se pudo escribir:', err.message);
  }
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    pseudonym: row.pseudonym,
    createdAt: row.created_at,
  };
}

/**
 * POST /api/v1/auth/register
 * body: { username, password, pseudonym? }
 *
 * MVP sin verificación de email: la cuenta queda activa al instante
 * (is_active = true). Cuando se añada verificación de email, esto
 * cambiará a is_active = false + envío de link de confirmación.
 */
export async function register(req, res) {
  const { username, password, pseudonym } = req.body || {};

  const errors = [
    validateUsername(username),
    validatePassword(password),
    validatePseudonym(pseudonym),
  ].filter(Boolean);

  if (errors.length > 0) {
    return res.status(400).json({ error: { message: errors.join('; '), status: 400 } });
  }

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const result = await query(
      `INSERT INTO users (username, password_hash, pseudonym, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id, username, pseudonym, created_at`,
      [username, passwordHash, pseudonym || null]
    );

    const user = result.rows[0];

    // Auto-login tras registrarse: como la cuenta ya está activa,
    // no tiene sentido obligar a un segundo paso de login manual.
    const accessToken = signAccessToken(user);
    const { token: refreshToken, tokenHash, expiresAt } = generateRefreshToken();

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    await logAudit({ userId: user.id, action: 'user.register', req });

    return res.status(201).json({
      user: publicUser(user),
      accessToken,
      refreshToken,
    });
  } catch (err) {
    if (err.code === '23505') {
      // unique_violation — username ya existe
      return res.status(409).json({
        error: { message: 'Ese nombre de usuario ya está en uso', status: 409 },
      });
    }
    console.error('Error en register:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

/**
 * POST /api/v1/auth/login
 * body: { username, password }
 */
export async function login(req, res) {
  const { username, password } = req.body || {};

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({
      error: { message: 'username y password son obligatorios', status: 400 },
    });
  }

  // Mensaje de error genérico a propósito: no revelar si falló por
  // usuario inexistente o por contraseña incorrecta (evita enumeración).
  const invalidCredentials = () =>
    res.status(401).json({ error: { message: 'Credenciales inválidas', status: 401 } });

  try {
    const result = await query(
      `SELECT id, username, password_hash, pseudonym, created_at, is_active
       FROM users WHERE username = $1`,
      [username]
    );

    const user = result.rows[0];
    if (!user) return invalidCredentials();
    if (!user.is_active) return invalidCredentials();

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) return invalidCredentials();

    const accessToken = signAccessToken(user);
    const { token: refreshToken, tokenHash, expiresAt } = generateRefreshToken();

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    await logAudit({ userId: user.id, action: 'user.login', req });

    return res.json({
      user: publicUser(user),
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Error en login:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

/**
 * POST /api/v1/auth/refresh
 * body: { refreshToken }
 *
 * Rota el refresh token en cada uso: el viejo se revoca y se entrega uno
 * nuevo. Si alguien presenta un refresh token YA revocado (reuso), es señal
 * de robo de token — se revocan todas las sesiones de ese usuario.
 */
export async function refresh(req, res) {
  const { refreshToken } = req.body || {};

  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    return res.status(400).json({ error: { message: 'refreshToken es obligatorio', status: 400 } });
  }

  const tokenHash = hashRefreshToken(refreshToken);

  try {
    const result = await query(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.is_revoked, rt.replaced_by_token_id,
              u.username, u.pseudonym, u.created_at, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1`,
      [tokenHash]
    );

    const row = result.rows[0];
    const invalidToken = () =>
      res.status(401).json({ error: { message: 'Refresh token inválido', status: 401 } });

    if (!row) return invalidToken();

    if (row.is_revoked) {
      if (row.replaced_by_token_id) {
        // Este token YA fue canjeado por uno nuevo (rotación) y alguien
        // vuelve a presentarlo: señal fuerte de robo. Cerrar todo.
        await query(`UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1`, [row.user_id]);
        await logAudit({ userId: row.user_id, action: 'auth.refresh_reuse_detected', req });
        return res.status(401).json({
          error: { message: 'Token reutilizado: todas las sesiones se han cerrado por seguridad', status: 401 },
        });
      }
      // Revocado por logout (no por rotación): simplemente inválido, sin
      // tratarlo como sospechoso ni tocar las demás sesiones del usuario.
      return invalidToken();
    }

    if (new Date(row.expires_at) < new Date() || !row.is_active) {
      return invalidToken();
    }

    const user = { id: row.user_id, username: row.username };
    const accessToken = signAccessToken(user);
    const { token: newRefreshToken, tokenHash: newHash, expiresAt } = generateRefreshToken();

    const inserted = await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id`,
      [row.user_id, newHash, expiresAt]
    );
    const newTokenId = inserted.rows[0].id;

    // Rotación: revocar el actual marcando explícitamente por qué token
    // fue reemplazado (eso es lo que habilita la detección de reuso de arriba).
    await query(
      `UPDATE refresh_tokens SET is_revoked = true, replaced_by_token_id = $2 WHERE id = $1`,
      [row.id, newTokenId]
    );

    return res.json({
      user: publicUser({
        id: row.user_id,
        username: row.username,
        pseudonym: row.pseudonym,
        created_at: row.created_at,
      }),
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    console.error('Error en refresh:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

/**
 * POST /api/v1/auth/logout
 * body: { refreshToken }
 *
 * Idempotente a propósito: responde 204 exista o no el token, para no
 * dar pistas a un atacante sobre qué tokens son válidos.
 */
export async function logout(req, res) {
  const { refreshToken } = req.body || {};

  if (typeof refreshToken === 'string' && refreshToken.length > 0) {
    const tokenHash = hashRefreshToken(refreshToken);
    try {
      await query(`UPDATE refresh_tokens SET is_revoked = true WHERE token_hash = $1`, [tokenHash]);
    } catch (err) {
      console.error('Error en logout:', err);
    }
  }

  return res.status(204).send();
}

/**
 * GET /api/v1/auth/me
 * Requiere requireAuth. Devuelve el usuario autenticado actual.
 */
export async function me(req, res) {
  try {
    const result = await query(
      `SELECT id, username, pseudonym, created_at, is_active FROM users WHERE id = $1`,
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: { message: 'Usuario no encontrado', status: 404 } });
    }
    return res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('Error en me:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}
