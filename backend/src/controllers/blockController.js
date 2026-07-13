/**
 * Bloqueo entre usuarios — requisito de stores para apps con UGC.
 * El bloqueado no desaparece de los grupos (eso es cosa del admin del
 * grupo), pero su contenido se atenúa/oculta para quien lo bloquea:
 * mensajes de chat, rankings y descubrimiento de tramos.
 */
import { query } from '../db/pool.js';

// ─────────────────────────────────────────────
// POST /api/v1/users/:id/block
// ─────────────────────────────────────────────
export async function blockUser(req, res) {
  const { id } = req.params;

  if (id === req.user.id) {
    return res.status(400).json({ error: { message: 'No puedes bloquearte a ti mismo', status: 400 } });
  }

  try {
    const target = await query(`SELECT id FROM users WHERE id = $1`, [id]);
    if (!target.rows[0]) {
      return res.status(404).json({ error: { message: 'Usuario no encontrado', status: 404 } });
    }

    await query(
      `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [req.user.id, id]
    );

    return res.status(201).json({ message: 'Usuario bloqueado' });
  } catch (err) {
    console.error('Error en blockUser:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// DELETE /api/v1/users/:id/block
// ─────────────────────────────────────────────
export async function unblockUser(req, res) {
  const { id } = req.params;

  try {
    await query(
      `DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`,
      [req.user.id, id]
    );
    return res.status(204).send();
  } catch (err) {
    console.error('Error en unblockUser:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// GET /api/v1/users/blocked
// Lista de usuarios bloqueados por el solicitante.
// ─────────────────────────────────────────────
export async function listBlocked(req, res) {
  try {
    const result = await query(
      `SELECT ub.blocked_id, ub.created_at, u.pseudonym, u.username
       FROM user_blocks ub
       LEFT JOIN users u ON u.id = ub.blocked_id
       WHERE ub.blocker_id = $1
       ORDER BY ub.created_at DESC`,
      [req.user.id]
    );

    return res.json({
      blocked: result.rows.map((r) => ({
        userId:    r.blocked_id,
        pseudonym: r.pseudonym || r.username || 'Anónimo',
        blockedAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error('Error en listBlocked:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

/** Ids bloqueados por un usuario — helper para filtrar en otros controladores. */
export async function blockedIdsOf(userId) {
  if (!userId) return new Set();
  const result = await query(`SELECT blocked_id FROM user_blocks WHERE blocker_id = $1`, [userId]);
  return new Set(result.rows.map((r) => r.blocked_id));
}
