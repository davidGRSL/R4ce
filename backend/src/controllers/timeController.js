import { query } from '../db/pool.js';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function publicTime(row) {
  return {
    id:           row.id,
    userId:       row.user_id,
    pseudonym:    row.pseudonym ?? null,
    stageId:      row.stage_id,
    stageName:    row.stage_name ?? null,
    durationMs:   row.duration_ms,
    splits:       row.splits ?? [],
    track:        row.track ?? [],
    maxSpeed:     row.max_speed,
    avgSpeed:     row.avg_speed,
    visibility:   row.visibility,
    createdAt:    row.created_at,
  };
}

async function logAudit({ userId, action, resourceId, req }) {
  try {
    await query(
      `INSERT INTO audit_log (user_id, action, resource_type, resource_id, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, 'time', resourceId, req.ip]
    );
  } catch (err) {
    console.error('  [audit_log] no se pudo escribir:', err.message);
  }
}

function parseRouteGps(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') return JSON.parse(raw);
  return raw;
}

async function upsertRanking(userId, stageId, durationMs) {
  try {
    await query(
      `INSERT INTO time_rankings (stage_id, user_id, duration_ms)
       VALUES ($1, $2, $3)
       ON CONFLICT (stage_id, user_id)
       DO UPDATE SET
         duration_ms = LEAST(time_rankings.duration_ms, EXCLUDED.duration_ms),
         created_at  = CASE
           WHEN EXCLUDED.duration_ms < time_rankings.duration_ms THEN NOW()
           ELSE time_rankings.created_at
         END`,
      [stageId, userId, durationMs]
    );
    await query(
      `UPDATE time_rankings tr
       SET rank = sub.rank
       FROM (
         SELECT id, RANK() OVER (PARTITION BY stage_id ORDER BY duration_ms ASC) AS rank
         FROM time_rankings WHERE stage_id = $1
       ) sub
       WHERE tr.id = sub.id`,
      [stageId]
    );
  } catch (err) {
    console.error('  [ranking] no se pudo actualizar:', err.message);
  }
}

// ─────────────────────────────────────────────
// POST /api/v1/times
// body: { stageId, durationMs, visibility, groupIds?, splits, track, maxSpeed?, avgSpeed? }
// ─────────────────────────────────────────────
export async function recordTime(req, res) {
  const {
    stageId,
    durationMs,
    visibility = 'private',
    groupIds   = [],
    splits     = [],
    track      = [],
    maxSpeed,
    avgSpeed,
  } = req.body || {};

  if (!stageId || typeof stageId !== 'string') {
    return res.status(400).json({ error: { message: 'stageId es obligatorio', status: 400 } });
  }

  if (!Number.isInteger(durationMs) || durationMs <= 0) {
    return res.status(400).json({ error: { message: 'durationMs debe ser un entero positivo', status: 400 } });
  }

  if (!['private', 'public', 'group'].includes(visibility)) {
    return res.status(400).json({ error: { message: 'visibility debe ser private, public o group', status: 400 } });
  }

  if (visibility === 'group' && groupIds.length === 0) {
    return res.status(400).json({ error: { message: 'Debes indicar al menos un grupo cuando visibility es group', status: 400 } });
  }

  if (!Array.isArray(splits) || !Array.isArray(track)) {
    return res.status(400).json({ error: { message: 'splits y track deben ser arrays', status: 400 } });
  }

  try {
    const stageResult = await query(
      `SELECT id, visibility, is_published, creator_id FROM stages WHERE id = $1`,
      [stageId]
    );
    const stage = stageResult.rows[0];
    if (!stage) {
      return res.status(404).json({ error: { message: 'Tramo no encontrado', status: 404 } });
    }

    if (!stage.is_published && stage.creator_id !== req.user.id) {
      return res.status(403).json({ error: { message: 'No puedes registrar tiempos en un tramo no publicado', status: 403 } });
    }

    // Verificar membresía en grupos
    if (groupIds.length > 0) {
      const memberCheck = await query(
        `SELECT group_id FROM group_members WHERE user_id = $1 AND group_id = ANY($2::uuid[])`,
        [req.user.id, groupIds]
      );
      if (memberCheck.rows.length !== groupIds.length) {
        return res.status(403).json({ error: { message: 'Solo puedes compartir tiempos en grupos de los que eres miembro', status: 403 } });
      }
    }

    const routeGps = JSON.stringify({ splits, track });

    const result = await query(
      `INSERT INTO times (user_id, stage_id, duration_ms, route_gps, max_speed, avg_speed, visibility)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, stageId, durationMs, routeGps, maxSpeed ?? null, avgSpeed ?? null, visibility]
    );

    const time = result.rows[0];

    // Asignar grupos
    if (groupIds.length > 0) {
      const values = groupIds.map((gid, i) => `($1, $${i + 2})`).join(', ');
      await query(`INSERT INTO time_groups (time_id, group_id) VALUES ${values}`, [time.id, ...groupIds]);
    }

    if (visibility === 'public') {
      await upsertRanking(req.user.id, stageId, durationMs);
    }

    await logAudit({ userId: req.user.id, action: 'time.record', resourceId: time.id, req });

    const parsed = parseRouteGps(time.route_gps);
    return res.status(201).json({
      time: publicTime({ ...time, splits: parsed.splits ?? [], track: parsed.track ?? [], pseudonym: null, stage_name: null }),
    });
  } catch (err) {
    console.error('Error en recordTime:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// GET /api/v1/times/my
// ─────────────────────────────────────────────
export async function listMyTimes(req, res) {
  const page    = Math.max(1, parseInt(req.query.page)  || 1);
  const limit   = Math.min(50, parseInt(req.query.limit) || 20);
  const offset  = (page - 1) * limit;
  const stageId = req.query.stageId || null;

  try {
    const conditions = ['t.user_id = $1'];
    const params     = [req.user.id];
    let   pIdx       = 2;

    if (stageId) {
      conditions.push(`t.stage_id = $${pIdx++}`);
      params.push(stageId);
    }

    const where = conditions.join(' AND ');

    const countResult = await query(`SELECT COUNT(*) FROM times t WHERE ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT t.*, u.pseudonym, s.name AS stage_name
       FROM times t
       LEFT JOIN users  u ON u.id = t.user_id
       LEFT JOIN stages s ON s.id = t.stage_id
       WHERE ${where}
       ORDER BY t.created_at DESC
       LIMIT $${pIdx} OFFSET $${pIdx + 1}`,
      [...params, limit, offset]
    );

    const times = result.rows.map(row => {
      const parsed = parseRouteGps(row.route_gps);
      return publicTime({ ...row, splits: parsed.splits ?? [], track: parsed.track ?? [] });
    });

    return res.json({ times, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('Error en listMyTimes:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// GET /api/v1/times/:id
// ─────────────────────────────────────────────
export async function getTime(req, res) {
  const { id } = req.params;

  try {
    const result = await query(
      `SELECT t.*, u.pseudonym, s.name AS stage_name
       FROM times t
       LEFT JOIN users  u ON u.id = t.user_id
       LEFT JOIN stages s ON s.id = t.stage_id
       WHERE t.id = $1`,
      [id]
    );

    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ error: { message: 'Tiempo no encontrado', status: 404 } });
    }

    const isOwner = req.user?.id === row.user_id;
    if (row.visibility === 'private' && !isOwner) {
      return res.status(403).json({ error: { message: 'No tienes acceso a este tiempo', status: 403 } });
    }

    const parsed = parseRouteGps(row.route_gps);
    return res.json({ time: publicTime({ ...row, splits: parsed.splits ?? [], track: parsed.track ?? [] }) });
  } catch (err) {
    console.error('Error en getTime:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// GET /api/v1/times/stage/:stageId
// ─────────────────────────────────────────────
export async function listStageTimes(req, res) {
  const { stageId } = req.params;
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(50, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  try {
    const stageResult = await query(`SELECT id FROM stages WHERE id = $1`, [stageId]);
    if (!stageResult.rows[0]) {
      return res.status(404).json({ error: { message: 'Tramo no encontrado', status: 404 } });
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM times WHERE stage_id = $1 AND visibility = 'public'`,
      [stageId]
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT t.*, u.pseudonym, s.name AS stage_name
       FROM times t
       LEFT JOIN users  u ON u.id = t.user_id
       LEFT JOIN stages s ON s.id = t.stage_id
       WHERE t.stage_id = $1 AND t.visibility = 'public'
       ORDER BY t.duration_ms ASC
       LIMIT $2 OFFSET $3`,
      [stageId, limit, offset]
    );

    const times = result.rows.map(row => {
      const parsed = parseRouteGps(row.route_gps);
      return publicTime({ ...row, splits: parsed.splits ?? [], track: parsed.track ?? [] });
    });

    return res.json({ times, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('Error en listStageTimes:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// GET /api/v1/times/stage/:stageId/ranking
// ─────────────────────────────────────────────
export async function getStageRanking(req, res) {
  const { stageId } = req.params;
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(50, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  try {
    const stageResult = await query(`SELECT id, name FROM stages WHERE id = $1`, [stageId]);
    const stage = stageResult.rows[0];
    if (!stage) {
      return res.status(404).json({ error: { message: 'Tramo no encontrado', status: 404 } });
    }

    const countResult = await query(`SELECT COUNT(*) FROM time_rankings WHERE stage_id = $1`, [stageId]);
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT tr.rank, tr.duration_ms, tr.created_at, u.id AS user_id, u.pseudonym
       FROM time_rankings tr
       LEFT JOIN users u ON u.id = tr.user_id
       WHERE tr.stage_id = $1
       ORDER BY tr.rank ASC
       LIMIT $2 OFFSET $3`,
      [stageId, limit, offset]
    );

    return res.json({
      stageName: stage.name,
      ranking: result.rows.map(row => ({
        rank:       row.rank,
        userId:     row.user_id,
        pseudonym:  row.pseudonym ?? 'Anónimo',
        durationMs: row.duration_ms,
        createdAt:  row.created_at,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Error en getStageRanking:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// PATCH /api/v1/times/:id/visibility
// body: { visibility, groupIds? }
// ─────────────────────────────────────────────
export async function updateTimeVisibility(req, res) {
  const { id } = req.params;
  const { visibility, groupIds = [] } = req.body || {};

  if (!['private', 'public', 'group'].includes(visibility)) {
    return res.status(400).json({ error: { message: 'visibility debe ser private, public o group', status: 400 } });
  }

  if (visibility === 'group' && groupIds.length === 0) {
    return res.status(400).json({ error: { message: 'Debes indicar al menos un grupo cuando visibility es group', status: 400 } });
  }

  try {
    const existing = await query(`SELECT * FROM times WHERE id = $1`, [id]);
    const time = existing.rows[0];

    if (!time) {
      return res.status(404).json({ error: { message: 'Tiempo no encontrado', status: 404 } });
    }

    if (time.user_id !== req.user.id) {
      return res.status(403).json({ error: { message: 'No tienes permiso para modificar este tiempo', status: 403 } });
    }

    const result = await query(
      `UPDATE times SET visibility = $2 WHERE id = $1 RETURNING *`,
      [id, visibility]
    );
    const updated = result.rows[0];

    // Sincronizar grupos
    await query(`DELETE FROM time_groups WHERE time_id = $1`, [id]);
    if (groupIds.length > 0) {
      const values = groupIds.map((gid, i) => `($1, $${i + 2})`).join(', ');
      await query(`INSERT INTO time_groups (time_id, group_id) VALUES ${values}`, [id, ...groupIds]);
    }

    // Ranking
    if (visibility === 'public') {
      await upsertRanking(req.user.id, updated.stage_id, updated.duration_ms);
    } else if (time.visibility === 'public' && visibility !== 'public') {
      await query(`DELETE FROM time_rankings WHERE user_id = $1 AND stage_id = $2`, [req.user.id, updated.stage_id]);
      await query(
        `UPDATE time_rankings tr SET rank = sub.rank
         FROM (SELECT id, RANK() OVER (PARTITION BY stage_id ORDER BY duration_ms ASC) AS rank
               FROM time_rankings WHERE stage_id = $1) sub
         WHERE tr.id = sub.id`,
        [updated.stage_id]
      );
    }

    await logAudit({ userId: req.user.id, action: 'time.visibility_update', resourceId: id, req });

    const parsed = parseRouteGps(updated.route_gps);
    return res.json({
      time: publicTime({ ...updated, splits: parsed.splits ?? [], track: parsed.track ?? [], pseudonym: null, stage_name: null }),
    });
  } catch (err) {
    console.error('Error en updateTimeVisibility:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// POST /api/v1/times/:id/groups
// Asignar/sincronizar grupos a un tiempo
// body: { groupIds: string[] }
// ─────────────────────────────────────────────
export async function assignTimeGroups(req, res) {
  const { id } = req.params;
  const { groupIds } = req.body || {};

  if (!Array.isArray(groupIds)) {
    return res.status(400).json({ error: { message: 'groupIds debe ser un array', status: 400 } });
  }

  try {
    const existing = await query(`SELECT user_id, visibility FROM times WHERE id = $1`, [id]);
    const time = existing.rows[0];

    if (!time) {
      return res.status(404).json({ error: { message: 'Tiempo no encontrado', status: 404 } });
    }

    if (time.user_id !== req.user.id) {
      return res.status(403).json({ error: { message: 'No tienes permiso', status: 403 } });
    }

    if (groupIds.length > 0) {
      const memberCheck = await query(
        `SELECT group_id FROM group_members WHERE user_id = $1 AND group_id = ANY($2::uuid[])`,
        [req.user.id, groupIds]
      );
      if (memberCheck.rows.length !== groupIds.length) {
        return res.status(403).json({ error: { message: 'Solo puedes compartir tiempos en grupos de los que eres miembro', status: 403 } });
      }
    }

    await query(`DELETE FROM time_groups WHERE time_id = $1`, [id]);

    if (groupIds.length > 0) {
      const values = groupIds.map((gid, i) => `($1, $${i + 2})`).join(', ');
      await query(`INSERT INTO time_groups (time_id, group_id) VALUES ${values}`, [id, ...groupIds]);
      await query(`UPDATE times SET visibility = 'group' WHERE id = $1`, [id]);
    }

    await logAudit({ userId: req.user.id, action: 'time.groups_update', resourceId: id, req });

    return res.json({ timeId: id, groupIds });
  } catch (err) {
    console.error('Error en assignTimeGroups:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// DELETE /api/v1/times/:id
// ─────────────────────────────────────────────
export async function deleteTime(req, res) {
  const { id } = req.params;

  try {
    const existing = await query(`SELECT * FROM times WHERE id = $1`, [id]);
    const time = existing.rows[0];

    if (!time) {
      return res.status(404).json({ error: { message: 'Tiempo no encontrado', status: 404 } });
    }

    if (time.user_id !== req.user.id) {
      return res.status(403).json({ error: { message: 'No tienes permiso para borrar este tiempo', status: 403 } });
    }

    await query(`DELETE FROM times WHERE id = $1`, [id]);

    if (time.visibility === 'public') {
      await query(`DELETE FROM time_rankings WHERE user_id = $1 AND stage_id = $2`, [req.user.id, time.stage_id]);
    }

    await logAudit({ userId: req.user.id, action: 'time.delete', resourceId: id, req });

    return res.status(204).send();
  } catch (err) {
    console.error('Error en deleteTime:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}