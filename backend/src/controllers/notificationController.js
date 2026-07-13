/**
 * API de notificaciones del usuario.
 * La creación no pasa por aquí (la hacen los disparadores vía utils/notify.js);
 * esto es lectura, marcado de leídas y la difusión admin de noticias.
 */
import { query } from '../db/pool.js';
import { publicNotification, broadcastNews } from '../utils/notify.js';

// Autorización por rol de BD (los admins se gestionan en /admin o
// se bootstrapean desde ADMIN_USERNAMES al arrancar — ver app.js)
async function isAdmin(userId) {
  const result = await query(`SELECT role FROM users WHERE id = $1`, [userId]);
  return result.rows[0]?.role === 'admin';
}

// ─────────────────────────────────────────────
// GET /api/v1/notifications?page&limit
// Lista paginada + contador de no leídas.
// ─────────────────────────────────────────────
export async function listNotifications(req, res) {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(50, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  try {
    const [listRes, unreadRes] = await Promise.all([
      query(
        `SELECT * FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      ),
      query(
        `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
        [req.user.id]
      ),
    ]);

    return res.json({
      notifications: listRes.rows.map(publicNotification),
      unreadCount: parseInt(unreadRes.rows[0].count),
      hasMore: listRes.rows.length === limit,
    });
  } catch (err) {
    console.error('Error en listNotifications:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// POST /api/v1/notifications/read
// body: { ids: [uuid] } o { all: true }
// ─────────────────────────────────────────────
export async function markRead(req, res) {
  const { ids, all } = req.body || {};

  try {
    if (all === true) {
      await query(
        `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`,
        [req.user.id]
      );
    } else if (Array.isArray(ids) && ids.length > 0) {
      await query(
        `UPDATE notifications SET read_at = NOW()
         WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL`,
        [req.user.id, ids]
      );
    } else {
      return res.status(400).json({ error: { message: 'Indica ids o all: true', status: 400 } });
    }

    const unreadRes = await query(
      `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
      [req.user.id]
    );
    return res.json({ unreadCount: parseInt(unreadRes.rows[0].count) });
  } catch (err) {
    console.error('Error en markRead:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// POST /api/v1/notifications/broadcast   (solo ADMIN_USERNAMES)
// body: { title, body?, url? }
// Noticias de la app o del mundo del motor para todos los usuarios.
// ─────────────────────────────────────────────
export async function broadcast(req, res) {
  if (!(await isAdmin(req.user.id))) {
    return res.status(403).json({ error: { message: 'No autorizado', status: 403 } });
  }

  const { title, body, url } = req.body || {};
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: { message: 'title es obligatorio', status: 400 } });
  }

  try {
    const count = await broadcastNews({
      title: title.trim().slice(0, 200),
      body:  body?.trim() || null,
      url:   url?.trim() || null,
    });
    return res.status(201).json({ message: `Noticia enviada a ${count} usuarios` });
  } catch (err) {
    console.error('Error en broadcast:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}
