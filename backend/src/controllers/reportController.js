/**
 * Denuncias de contenido (UGC) — requisito de stores (Apple 1.2 / Google UGC).
 * Cualquier usuario puede denunciar un mensaje, un tramo o a otro usuario.
 * La revisión la hace un admin desde /api/v1/admin/reports.
 */
import { query } from '../db/pool.js';

const TARGET_TYPES = ['message', 'stage', 'user'];
const MAX_REASON = 1000;

// Comprueba que el objetivo denunciado existe
async function targetExists(type, id) {
  const table = { message: 'group_messages', stage: 'stages', user: 'users' }[type];
  const result = await query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
  return result.rows.length > 0;
}

// ─────────────────────────────────────────────
// POST /api/v1/reports
// body: { targetType: 'message'|'stage'|'user', targetId, reason }
// ─────────────────────────────────────────────
export async function createReport(req, res) {
  const { targetType, targetId, reason } = req.body || {};

  if (!TARGET_TYPES.includes(targetType)) {
    return res.status(400).json({ error: { message: 'targetType debe ser message, stage o user', status: 400 } });
  }
  if (!targetId || typeof targetId !== 'string') {
    return res.status(400).json({ error: { message: 'targetId es obligatorio', status: 400 } });
  }
  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    return res.status(400).json({ error: { message: 'Describe el motivo (mínimo 5 caracteres)', status: 400 } });
  }

  try {
    if (!(await targetExists(targetType, targetId))) {
      return res.status(404).json({ error: { message: 'El contenido denunciado no existe', status: 404 } });
    }

    // Evitar denuncias duplicadas del mismo usuario sobre el mismo objetivo
    const dup = await query(
      `SELECT 1 FROM reports
       WHERE reporter_id = $1 AND target_type = $2 AND target_id = $3 AND status = 'pending'`,
      [req.user.id, targetType, targetId]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: { message: 'Ya has denunciado este contenido; está pendiente de revisión', status: 409 } });
    }

    await query(
      `INSERT INTO reports (reporter_id, target_type, target_id, reason)
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, targetType, targetId, reason.trim().slice(0, MAX_REASON)]
    );

    return res.status(201).json({
      message: 'Denuncia recibida. La revisaremos en un plazo máximo de 24 horas.',
    });
  } catch (err) {
    console.error('Error en createReport:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}
