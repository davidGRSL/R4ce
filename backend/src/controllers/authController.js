import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { signAccessToken, generateRefreshToken, hashRefreshToken } from '../utils/jwt.js';
import { validateUsername, validatePassword, validatePseudonym } from '../utils/validators.js';
import { sendVerificationEmail } from '../utils/mailer.js';

const BCRYPT_ROUNDS = 12;

// Versión vigente de los términos de uso. Al cambiarla, los usuarios que
// aceptaron una versión anterior verán el aviso de re-aceptación.
export const TOS_VERSION = process.env.TOS_VERSION || '2026-07-11';

// Solo se guarda el hash del email (privacidad por diseño)
function hashEmail(email) {
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

// Crea el token de verificación y envía (o loguea) el enlace. Best-effort.
async function createAndSendVerification(userId, email) {
  const token     = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

  // Un token vigente por usuario: se invalidan los anteriores
  await query(`DELETE FROM email_verifications WHERE user_id = $1`, [userId]);
  await query(
    `INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );

  const base = process.env.WEB_URL || 'http://localhost:5173';
  await sendVerificationEmail(email, `${base}/verify?token=${token}`);
}

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
    role: row.role ?? 'user',
    emailVerified: row.email_verified_at != null,
    hasEmail: row.email_hash != null,
    // El cliente muestra re-aceptación de términos si la versión cambió
    needsTos: (row.tos_version ?? null) !== TOS_VERSION,
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
  const { username, password, pseudonym, email, tosAccepted } = req.body || {};

  const errors = [
    validateUsername(username),
    validatePassword(password),
    validatePseudonym(pseudonym),
  ].filter(Boolean);

  // Aceptación de términos obligatoria (requisito de stores)
  if (tosAccepted !== true) {
    errors.push('Debes aceptar los términos de uso y la política de privacidad');
  }
  if (email != null && email !== '' && !isValidEmail(email)) {
    errors.push('El email no es válido');
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: { message: errors.join('; '), status: 400 } });
  }

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const emailHash = isValidEmail(email) ? hashEmail(email) : null;

    const result = await query(
      `INSERT INTO users (username, password_hash, pseudonym, email_hash, is_active, tos_accepted_at, tos_version)
       VALUES ($1, $2, $3, $4, true, NOW(), $5)
       RETURNING id, username, pseudonym, role, email_hash, email_verified_at, tos_version, created_at`,
      [username, passwordHash, pseudonym || null, emailHash, TOS_VERSION]
    );

    const user = result.rows[0];

    // Verificación de email (best-effort: sin SMTP se loguea el enlace)
    if (emailHash) {
      createAndSendVerification(user.id, email)
        .catch((e) => console.error('  [verify] no se pudo enviar:', e.message));
    }

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
      // unique_violation — username o email ya existen
      return res.status(409).json({
        error: { message: 'Ese nombre de usuario o email ya está en uso', status: 409 },
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
      `SELECT id, username, password_hash, pseudonym, role, email_hash,
              email_verified_at, tos_version, created_at, is_active
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
      `SELECT id, username, pseudonym, role, email_hash, email_verified_at,
              tos_version, created_at, is_active
       FROM users WHERE id = $1`,
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

/**
 * POST /api/v1/auth/verify
 * body: { token }  — sin auth: el usuario puede abrir el enlace desde
 * cualquier dispositivo. Marca email_verified_at.
 */
export async function verifyEmail(req, res) {
  const { token } = req.body || {};
  if (typeof token !== 'string' || token.length === 0) {
    return res.status(400).json({ error: { message: 'token es obligatorio', status: 400 } });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    const result = await query(
      `SELECT user_id, expires_at FROM email_verifications WHERE token_hash = $1`,
      [tokenHash]
    );
    const row = result.rows[0];
    if (!row || new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: { message: 'Enlace inválido o caducado. Solicita uno nuevo desde tu perfil.', status: 400 } });
    }

    await query(`UPDATE users SET email_verified_at = NOW() WHERE id = $1`, [row.user_id]);
    await query(`DELETE FROM email_verifications WHERE user_id = $1`, [row.user_id]);
    await logAudit({ userId: row.user_id, action: 'user.email_verified', req });

    return res.json({ message: 'Email verificado' });
  } catch (err) {
    console.error('Error en verifyEmail:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

/**
 * POST /api/v1/auth/email   (requireAuth)
 * body: { email } — añade/cambia el email (solo se guarda el hash) y
 * reenvía el enlace de verificación.
 */
export async function requestVerification(req, res) {
  const { email } = req.body || {};
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: { message: 'El email no es válido', status: 400 } });
  }

  try {
    await query(
      `UPDATE users SET email_hash = $2, email_verified_at = NULL WHERE id = $1`,
      [req.user.id, hashEmail(email)]
    );
    await createAndSendVerification(req.user.id, email);
    await logAudit({ userId: req.user.id, action: 'user.email_change', req });

    return res.json({ message: 'Te hemos enviado un enlace de verificación' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: { message: 'Ese email ya está en uso', status: 409 } });
    }
    console.error('Error en requestVerification:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

/**
 * POST /api/v1/auth/accept-tos   (requireAuth)
 * Re-aceptación de los términos vigentes (tras un cambio de versión).
 */
export async function acceptTos(req, res) {
  try {
    await query(
      `UPDATE users SET tos_accepted_at = NOW(), tos_version = $2 WHERE id = $1`,
      [req.user.id, TOS_VERSION]
    );
    await logAudit({ userId: req.user.id, action: 'user.tos_accepted', req });
    return res.json({ tosVersion: TOS_VERSION });
  } catch (err) {
    console.error('Error en acceptTos:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}
