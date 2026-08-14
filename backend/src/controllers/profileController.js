import bcrypt from 'bcrypt';
import { query } from '../db/pool.js';
import { processAndStore, keyFromUrl } from '../middleware/upload.js';
import { storage } from '../storage/index.js';

function publicProfile(row) {
  return {
    id:        row.id,
    username:  row.username,
    pseudonym: row.pseudonym,
    bio:       row.bio,
    location:  row.location,
    avatarUrl: row.avatar_url,
    role:      row.role ?? 'user',
    emailVerified:  row.email_verified_at != null,
    hasEmail:       row.email_hash != null,
    safetyAccepted: row.safety_accepted_at != null,
    createdAt: row.created_at,
  };
}

// ─────────────────────────────────────────────
// GET /api/v1/profile
// Perfil del usuario autenticado + estadísticas resumidas.
// ─────────────────────────────────────────────
export async function getProfile(req, res) {
  try {
    const userResult = await query(
      `SELECT id, username, pseudonym, bio, location, avatar_url, role,
              email_hash, email_verified_at, safety_accepted_at, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: { message: 'Usuario no encontrado', status: 404 } });
    }

    // Estadísticas en paralelo
    const [stagesC, timesC, vehiclesC, groupsC, bestRow] = await Promise.all([
      query(`SELECT COUNT(*) FROM stages WHERE creator_id = $1`, [req.user.id]),
      query(`SELECT COUNT(*) FROM times WHERE user_id = $1`, [req.user.id]),
      query(`SELECT COUNT(*) FROM vehicles WHERE user_id = $1`, [req.user.id]),
      query(`SELECT COUNT(*) FROM group_members WHERE user_id = $1`, [req.user.id]),
      query(`SELECT MIN(duration_ms) AS best FROM times WHERE user_id = $1`, [req.user.id]),
    ]);

    return res.json({
      profile: publicProfile(user),
      stats: {
        stages:   parseInt(stagesC.rows[0].count),
        times:    parseInt(timesC.rows[0].count),
        vehicles: parseInt(vehiclesC.rows[0].count),
        groups:   parseInt(groupsC.rows[0].count),
        bestTimeMs: bestRow.rows[0].best ?? null,
      },
    });
  } catch (err) {
    console.error('Error en getProfile:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// PATCH /api/v1/profile
// body: { pseudonym?, bio?, location? }
// ─────────────────────────────────────────────
export async function updateProfile(req, res) {
  const { pseudonym, bio, location } = req.body || {};

  if (pseudonym !== undefined && (typeof pseudonym !== 'string' || pseudonym.length > 50)) {
    return res.status(400).json({ error: { message: 'pseudonym inválido (máx 50)', status: 400 } });
  }
  if (bio !== undefined && bio !== null && bio.length > 500) {
    return res.status(400).json({ error: { message: 'bio demasiado larga (máx 500)', status: 400 } });
  }
  if (location !== undefined && location !== null && location.length > 100) {
    return res.status(400).json({ error: { message: 'location demasiado larga (máx 100)', status: 400 } });
  }

  try {
    const result = await query(
      `UPDATE users SET
         pseudonym = COALESCE($2, pseudonym),
         bio       = COALESCE($3, bio),
         location  = COALESCE($4, location),
         updated_at = NOW()
       WHERE id = $1
       RETURNING id, username, pseudonym, bio, location, avatar_url, created_at`,
      [req.user.id, pseudonym ?? null, bio ?? null, location ?? null]
    );

    return res.json({ profile: publicProfile(result.rows[0]) });
  } catch (err) {
    console.error('Error en updateProfile:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// POST /api/v1/profile/avatar  (multipart, campo "image")
// Sube y procesa el avatar (cuadrado 400x400 webp).
// ─────────────────────────────────────────────
export async function uploadAvatar(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: { message: 'No se recibió ninguna imagen', status: 400 } });
  }

  try {
    // Borrar avatar anterior si existía
    const prev = await query(`SELECT avatar_url FROM users WHERE id = $1`, [req.user.id]);
    const oldUrl = prev.rows[0]?.avatar_url;

    const { url } = await processAndStore(req.file.buffer, {
      folder: 'avatars',
      width: 400,
      height: 400,
    });

    await query(`UPDATE users SET avatar_url = $2, updated_at = NOW() WHERE id = $1`, [req.user.id, url]);

    if (oldUrl) {
      const oldKey = keyFromUrl(oldUrl);
      if (oldKey) await storage.delete(oldKey);
    }

    return res.json({ avatarUrl: url });
  } catch (err) {
    console.error('Error en uploadAvatar:', err);
    return res.status(500).json({ error: { message: 'Error procesando la imagen', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// DELETE /api/v1/profile/avatar
// ─────────────────────────────────────────────
export async function deleteAvatar(req, res) {
  try {
    const prev = await query(`SELECT avatar_url FROM users WHERE id = $1`, [req.user.id]);
    const oldUrl = prev.rows[0]?.avatar_url;

    await query(`UPDATE users SET avatar_url = NULL, updated_at = NOW() WHERE id = $1`, [req.user.id]);

    if (oldUrl) {
      const oldKey = keyFromUrl(oldUrl);
      if (oldKey) await storage.delete(oldKey);
    }

    return res.status(204).send();
  } catch (err) {
    console.error('Error en deleteAvatar:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// POST /api/v1/profile/accept-safety
// Registra la aceptación del aviso de seguridad vial de Live.
// ─────────────────────────────────────────────
export async function acceptSafety(req, res) {
  try {
    await query(`UPDATE users SET safety_accepted_at = NOW() WHERE id = $1`, [req.user.id]);
    return res.status(204).send();
  } catch (err) {
    console.error('Error en acceptSafety:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// POST /api/v1/profile/push-token
// body: { token, platform } — registra el dispositivo para push nativo.
// Si el token ya existía (reinstalación / cambio de cuenta), se reasigna.
// ─────────────────────────────────────────────
export async function registerPushToken(req, res) {
  const { token, platform } = req.body || {};

  if (typeof token !== 'string' || token.length < 10) {
    return res.status(400).json({ error: { message: 'token inválido', status: 400 } });
  }
  const plat = ['android', 'ios'].includes(platform) ? platform : 'android';

  try {
    await query(
      `INSERT INTO push_tokens (user_id, token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = $1, platform = $3`,
      [req.user.id, token, plat]
    );
    return res.status(204).send();
  } catch (err) {
    console.error('Error en registerPushToken:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// DELETE /api/v1/profile/push-token
// body: { token } — al cerrar sesión en el dispositivo.
// ─────────────────────────────────────────────
export async function removePushToken(req, res) {
  const { token } = req.body || {};
  if (typeof token === 'string' && token.length > 0) {
    try {
      await query(`DELETE FROM push_tokens WHERE token = $1 AND user_id = $2`, [token, req.user.id]);
    } catch (err) {
      console.error('Error en removePushToken:', err);
    }
  }
  return res.status(204).send();
}

// ─────────────────────────────────────────────
// DELETE /api/v1/profile
// body: { password } — borrado de cuenta (requisito de stores).
// Elimina la media del storage y luego la fila de users (el resto de
// tablas cae por ON DELETE CASCADE, incluidos los grupos que posee).
// ─────────────────────────────────────────────
export async function deleteAccount(req, res) {
  const { password } = req.body || {};

  if (typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ error: { message: 'La contraseña es obligatoria para borrar la cuenta', status: 400 } });
  }

  try {
    const userRes = await query(
      `SELECT password_hash, avatar_url FROM users WHERE id = $1`,
      [req.user.id]
    );
    const user = userRes.rows[0];
    if (!user) {
      return res.status(404).json({ error: { message: 'Usuario no encontrado', status: 404 } });
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      return res.status(403).json({ error: { message: 'Contraseña incorrecta', status: 403 } });
    }

    // Recopilar toda la media del usuario ANTES de borrar las filas
    const [vehiclesRes, chatMediaRes] = await Promise.all([
      query(`SELECT photo_url, model_url FROM vehicles WHERE user_id = $1`, [req.user.id]),
      query(`SELECT media_url FROM group_messages WHERE user_id = $1 AND media_url IS NOT NULL`, [req.user.id]),
    ]);

    const urls = [
      user.avatar_url,
      ...vehiclesRes.rows.flatMap((v) => [v.photo_url, v.model_url]),
      ...chatMediaRes.rows.map((m) => m.media_url),
    ].filter(Boolean);

    // Auditoría antes del borrado (después ya no existe el user_id)
    try {
      await query(
        `INSERT INTO audit_log (user_id, action, resource_type, resource_id, ip_address)
         VALUES ($1, 'user.delete_account', 'user', $1, $2)`,
        [req.user.id, req.ip]
      );
    } catch { /* best-effort */ }

    // Borrar la fila: cascada elimina tiempos, tramos, grupos propios,
    // mensajes, vehículos, sesiones (refresh_tokens), favoritos, etc.
    await query(`DELETE FROM users WHERE id = $1`, [req.user.id]);

    // Media del storage (best-effort, tras confirmar el borrado en BD)
    for (const url of urls) {
      const key = keyFromUrl(url);
      if (key) storage.delete(key).catch(() => {});
    }

    return res.status(204).send();
  } catch (err) {
    console.error('Error en deleteAccount:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}
