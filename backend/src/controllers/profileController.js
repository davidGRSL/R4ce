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
      `SELECT id, username, pseudonym, bio, location, avatar_url, created_at
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
