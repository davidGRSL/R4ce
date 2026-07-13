/**
 * Panel de administración (rol 'admin').
 * Cola de denuncias UGC + gestión de roles de usuario.
 * Las noticias (broadcast) siguen en notificationController.
 */
import { query } from '../db/pool.js';
import { storage } from '../storage/index.js';
import { keyFromUrl } from '../middleware/upload.js';
import { emitToGroup } from '../socket.js';
import { createNotification } from '../utils/notify.js';

function publicReport(row) {
  return {
    id:          row.id,
    targetType:  row.target_type,
    targetId:    row.target_id,
    reason:      row.reason,
    status:      row.status,
    resolution:  row.resolution,
    reporter:    row.reporter_pseudonym ?? 'Anónimo',
    // Contexto del objetivo (para no revisar a ciegas)
    targetLabel: row.target_label ?? null,
    targetOwnerId: row.target_owner_id ?? null,
    createdAt:   row.created_at,
    resolvedAt:  row.resolved_at,
  };
}

// ─────────────────────────────────────────────
// GET /api/v1/admin/reports?status=pending
// ─────────────────────────────────────────────
export async function listReports(req, res) {
  const status = ['pending', 'resolved', 'dismissed'].includes(req.query.status)
    ? req.query.status : 'pending';
  const limit = Math.min(100, parseInt(req.query.limit) || 50);

  try {
    const result = await query(
      `SELECT r.*, rep.pseudonym AS reporter_pseudonym,
        CASE r.target_type
          WHEN 'message' THEN (SELECT COALESCE(u.pseudonym, u.username) || ' — mensaje en ' || g.name
                               FROM group_messages m
                               LEFT JOIN users u ON u.id = m.user_id
                               LEFT JOIN groups g ON g.id = m.group_id
                               WHERE m.id = r.target_id)
          WHEN 'stage'   THEN (SELECT 'Tramo: ' || s.name FROM stages s WHERE s.id = r.target_id)
          WHEN 'user'    THEN (SELECT 'Usuario: ' || COALESCE(u.pseudonym, u.username) FROM users u WHERE u.id = r.target_id)
        END AS target_label,
        CASE r.target_type
          WHEN 'message' THEN (SELECT m.user_id FROM group_messages m WHERE m.id = r.target_id)
          WHEN 'stage'   THEN (SELECT s.creator_id FROM stages s WHERE s.id = r.target_id)
          WHEN 'user'    THEN r.target_id
        END AS target_owner_id
       FROM reports r
       LEFT JOIN users rep ON rep.id = r.reporter_id
       WHERE r.status = $1
       ORDER BY r.created_at ASC
       LIMIT $2`,
      [status, limit]
    );

    return res.json({ reports: result.rows.map(publicReport) });
  } catch (err) {
    console.error('Error en listReports:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// POST /api/v1/admin/reports/:id/resolve
// body: { action: 'dismiss' | 'delete_content' | 'warn_user', note? }
//   dismiss        → sin infracción
//   delete_content → mensaje: soft delete + borrar media; tramo: despublicar
//   warn_user      → notificación de aviso al dueño del contenido
// ─────────────────────────────────────────────
export async function resolveReport(req, res) {
  const { id } = req.params;
  const { action, note } = req.body || {};

  if (!['dismiss', 'delete_content', 'warn_user'].includes(action)) {
    return res.status(400).json({ error: { message: 'action debe ser dismiss, delete_content o warn_user', status: 400 } });
  }

  try {
    const reportRes = await query(`SELECT * FROM reports WHERE id = $1`, [id]);
    const report = reportRes.rows[0];
    if (!report) {
      return res.status(404).json({ error: { message: 'Denuncia no encontrada', status: 404 } });
    }
    if (report.status !== 'pending') {
      return res.status(409).json({ error: { message: 'La denuncia ya está resuelta', status: 409 } });
    }

    let resolution = note?.trim() || null;

    if (action === 'delete_content') {
      if (report.target_type === 'message') {
        const msgRes = await query(
          `SELECT group_id, media_url, deleted_at FROM group_messages WHERE id = $1`,
          [report.target_id]
        );
        const msg = msgRes.rows[0];
        if (msg && !msg.deleted_at) {
          await query(`UPDATE group_messages SET deleted_at = NOW() WHERE id = $1`, [report.target_id]);
          if (msg.media_url) {
            const key = keyFromUrl(msg.media_url);
            if (key) storage.delete(key).catch(() => {});
          }
          emitToGroup(msg.group_id, 'group:message_deleted', { groupId: msg.group_id, messageId: report.target_id });
        }
        resolution = resolution ?? 'Mensaje eliminado por moderación';
      } else if (report.target_type === 'stage') {
        await query(`UPDATE stages SET is_published = false WHERE id = $1`, [report.target_id]);
        resolution = resolution ?? 'Tramo despublicado por moderación';
      } else {
        return res.status(400).json({ error: { message: 'delete_content no aplica a usuarios; usa warn_user o gestiona el rol', status: 400 } });
      }
    }

    if (action === 'warn_user') {
      const ownerRes = await query(
        report.target_type === 'message'
          ? `SELECT user_id AS owner FROM group_messages WHERE id = $1`
          : report.target_type === 'stage'
            ? `SELECT creator_id AS owner FROM stages WHERE id = $1`
            : `SELECT id AS owner FROM users WHERE id = $1`,
        [report.target_id]
      );
      const owner = ownerRes.rows[0]?.owner;
      if (owner) {
        await createNotification({
          userId: owner,
          type: 'system',
          title: 'Aviso de moderación',
          body: note?.trim() || 'Tu contenido ha sido denunciado y revisado. Revisa los términos de uso; nuevas infracciones pueden suponer la expulsión.',
        });
      }
      resolution = resolution ?? 'Usuario avisado';
    }

    const status = action === 'dismiss' ? 'dismissed' : 'resolved';
    await query(
      `UPDATE reports SET status = $2, resolution = $3, resolved_by = $4, resolved_at = NOW()
       WHERE id = $1`,
      [id, status, resolution ?? 'Sin infracción', req.user.id]
    );

    return res.json({ message: 'Denuncia resuelta' });
  } catch (err) {
    console.error('Error en resolveReport:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// GET /api/v1/admin/users?search=
// ─────────────────────────────────────────────
export async function listUsers(req, res) {
  const search = req.query.search?.trim() || null;
  const limit  = Math.min(50, parseInt(req.query.limit) || 20);

  try {
    const params = [limit];
    let where = '';
    if (search) {
      where = `WHERE username ILIKE $2 OR pseudonym ILIKE $2`;
      params.push(`%${search}%`);
    }

    const result = await query(
      `SELECT id, username, pseudonym, role, is_active, email_verified_at, created_at
       FROM users ${where}
       ORDER BY created_at DESC
       LIMIT $1`,
      params
    );

    return res.json({
      users: result.rows.map((u) => ({
        id: u.id,
        username: u.username,
        pseudonym: u.pseudonym,
        role: u.role,
        isActive: u.is_active,
        emailVerified: u.email_verified_at != null,
        createdAt: u.created_at,
      })),
    });
  } catch (err) {
    console.error('Error en listUsers:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// PATCH /api/v1/admin/users/:id/role
// body: { role: 'admin' | 'user' | 'premium' }
// Aquí es donde se asigna premium manualmente (sin pasarela de pago aún).
// ─────────────────────────────────────────────
export async function setUserRole(req, res) {
  const { id } = req.params;
  const { role } = req.body || {};

  if (!['admin', 'user', 'premium'].includes(role)) {
    return res.status(400).json({ error: { message: 'role debe ser admin, user o premium', status: 400 } });
  }
  if (id === req.user.id && role !== 'admin') {
    return res.status(400).json({ error: { message: 'No puedes quitarte el rol de admin a ti mismo', status: 400 } });
  }

  try {
    const result = await query(
      `UPDATE users SET role = $2 WHERE id = $1 RETURNING id, username, role`,
      [id, role]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: { message: 'Usuario no encontrado', status: 404 } });
    }

    // Avisar al usuario si pasa a premium
    if (role === 'premium') {
      createNotification({
        userId: id,
        type: 'system',
        title: '¡Ya eres Premium!',
        body: 'Tu cuenta ha sido actualizada a R4ce Premium.',
      }).catch(() => {});
    }

    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Error en setUserRole:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}
