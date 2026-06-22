import { query } from '../db/pool.js';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function publicStage(row) {
  return {
    id:                row.id,
    name:              row.name,
    description:       row.description,
    routeGeojson:      row.route_geojson,
    silhouetteSvg:     row.silhouette_svg,
    visibility:        row.visibility,
    difficultyLevel:   row.difficulty_level,
    estimatedDuration: row.estimated_duration,
    isPublished:       row.is_published,
    creatorId:         row.creator_id,
    creatorPseudonym:  row.pseudonym ?? null,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  };
}

async function logAudit({ userId, action, resourceId, req }) {
  try {
    await query(
      `INSERT INTO audit_log (user_id, action, resource_type, resource_id, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, 'stage', resourceId, req.ip]
    );
  } catch (err) {
    console.error('  [audit_log] no se pudo escribir:', err.message);
  }
}

function geojsonLineToWKT(geojson) {
  if (!geojson || geojson.type !== 'LineString' || !Array.isArray(geojson.coordinates)) {
    return null;
  }
  const coords = geojson.coordinates.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  return `LINESTRING(${coords})`;
}

// ─────────────────────────────────────────────
// POST /api/v1/stages
// ─────────────────────────────────────────────
export async function createStage(req, res) {
  const {
    name,
    description,
    routeGeojson,
    silhouetteSvg,
    visibility = 'private',
    difficultyLevel,
    estimatedDuration,
    groupIds = [],
  } = req.body || {};

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: { message: 'name es obligatorio', status: 400 } });
  }

  if (!['private', 'public', 'group'].includes(visibility)) {
    return res.status(400).json({ error: { message: 'visibility debe ser private, public o group', status: 400 } });
  }

  if (difficultyLevel !== undefined && (difficultyLevel < 1 || difficultyLevel > 5)) {
    return res.status(400).json({ error: { message: 'difficultyLevel debe estar entre 1 y 5', status: 400 } });
  }

  if (visibility === 'group' && groupIds.length === 0) {
    return res.status(400).json({ error: { message: 'Debes indicar al menos un grupo cuando visibility es group', status: 400 } });
  }

  const routeLine = routeGeojson ? geojsonLineToWKT(routeGeojson) : null;

  try {
    // Verificar membresía en grupos indicados
    if (groupIds.length > 0) {
      const memberCheck = await query(
        `SELECT group_id FROM group_members WHERE user_id = $1 AND group_id = ANY($2::uuid[])`,
        [req.user.id, groupIds]
      );
      if (memberCheck.rows.length !== groupIds.length) {
        return res.status(403).json({ error: { message: 'Solo puedes asignar tramos a grupos de los que eres miembro', status: 403 } });
      }
    }

    const result = await query(
      `INSERT INTO stages
         (creator_id, name, description, route_geojson, route_line,
          silhouette_svg, visibility, difficulty_level, estimated_duration)
       VALUES ($1, $2, $3, $4, $5::geometry, $6, $7, $8, $9)
       RETURNING *`,
      [
        req.user.id,
        name.trim(),
        description ?? null,
        routeGeojson ? JSON.stringify(routeGeojson) : null,
        routeLine,
        silhouetteSvg ?? null,
        visibility,
        difficultyLevel ?? null,
        estimatedDuration ?? null,
      ]
    );

    const stage = result.rows[0];

    // Asignar grupos si los hay
    if (groupIds.length > 0) {
      const values = groupIds.map((gid, i) => `($1, $${i + 2})`).join(', ');
      await query(
        `INSERT INTO stage_groups (stage_id, group_id) VALUES ${values}`,
        [stage.id, ...groupIds]
      );
    }

    await logAudit({ userId: req.user.id, action: 'stage.create', resourceId: stage.id, req });

    return res.status(201).json({ stage: publicStage(stage) });
  } catch (err) {
    console.error('Error en createStage:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// GET /api/v1/stages
// ─────────────────────────────────────────────
export async function listPublicStages(req, res) {
  const page       = Math.max(1, parseInt(req.query.page)  || 1);
  const limit      = Math.min(50, parseInt(req.query.limit) || 20);
  const offset     = (page - 1) * limit;
  const difficulty = parseInt(req.query.difficulty) || null;
  const search     = req.query.search?.trim() || null;

  try {
    const conditions = [`s.visibility = 'public'`, `s.is_published = true`];
    const params     = [];
    let   pIdx       = 1;

    if (difficulty) {
      conditions.push(`s.difficulty_level = $${pIdx++}`);
      params.push(difficulty);
    }

    if (search) {
      conditions.push(`(s.name ILIKE $${pIdx} OR s.description ILIKE $${pIdx})`);
      params.push(`%${search}%`);
      pIdx++;
    }

    const where = conditions.join(' AND ');

    const countResult = await query(`SELECT COUNT(*) FROM stages s WHERE ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT s.*, u.pseudonym
       FROM stages s
       LEFT JOIN users u ON u.id = s.creator_id
       WHERE ${where}
       ORDER BY s.created_at DESC
       LIMIT $${pIdx} OFFSET $${pIdx + 1}`,
      [...params, limit, offset]
    );

    return res.json({
      stages: result.rows.map(publicStage),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Error en listPublicStages:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// GET /api/v1/stages/my/stages
// ─────────────────────────────────────────────
export async function listMyStages(req, res) {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(50, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  try {
    const countResult = await query(
      `SELECT COUNT(*) FROM stages WHERE creator_id = $1`,
      [req.user.id]
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT s.*, u.pseudonym
       FROM stages s
       LEFT JOIN users u ON u.id = s.creator_id
       WHERE s.creator_id = $1
       ORDER BY s.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    return res.json({
      stages: result.rows.map(publicStage),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Error en listMyStages:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// GET /api/v1/stages/:id
// ─────────────────────────────────────────────
export async function getStage(req, res) {
  const { id } = req.params;

  try {
    const result = await query(
      `SELECT s.*, u.pseudonym
       FROM stages s
       LEFT JOIN users u ON u.id = s.creator_id
       WHERE s.id = $1`,
      [id]
    );

    const stage = result.rows[0];
    if (!stage) {
      return res.status(404).json({ error: { message: 'Tramo no encontrado', status: 404 } });
    }

    const isOwner = req.user?.id === stage.creator_id;

    if (stage.visibility === 'private' && !isOwner) {
      return res.status(403).json({ error: { message: 'No tienes acceso a este tramo', status: 403 } });
    }

    // Para tramos de grupo: verificar membresía
    if (stage.visibility === 'group' && !isOwner) {
      const memberCheck = await query(
        `SELECT 1 FROM stage_groups sg
         JOIN group_members gm ON gm.group_id = sg.group_id
         WHERE sg.stage_id = $1 AND gm.user_id = $2
         LIMIT 1`,
        [id, req.user?.id]
      );
      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: { message: 'No tienes acceso a este tramo', status: 403 } });
      }
    }

    return res.json({ stage: publicStage(stage) });
  } catch (err) {
    console.error('Error en getStage:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// PUT /api/v1/stages/:id
// ─────────────────────────────────────────────
export async function updateStage(req, res) {
  const { id } = req.params;
  const {
    name,
    description,
    routeGeojson,
    silhouetteSvg,
    visibility,
    difficultyLevel,
    estimatedDuration,
  } = req.body || {};

  try {
    const existing = await query(`SELECT * FROM stages WHERE id = $1`, [id]);
    const stage = existing.rows[0];

    if (!stage) {
      return res.status(404).json({ error: { message: 'Tramo no encontrado', status: 404 } });
    }

    if (stage.creator_id !== req.user.id) {
      return res.status(403).json({ error: { message: 'No tienes permiso para editar este tramo', status: 403 } });
    }

    if (stage.is_published) {
      return res.status(409).json({ error: { message: 'No puedes editar un tramo publicado. Despublícalo primero.', status: 409 } });
    }

    if (visibility && !['private', 'public', 'group'].includes(visibility)) {
      return res.status(400).json({ error: { message: 'visibility debe ser private, public o group', status: 400 } });
    }

    if (difficultyLevel !== undefined && (difficultyLevel < 1 || difficultyLevel > 5)) {
      return res.status(400).json({ error: { message: 'difficultyLevel debe estar entre 1 y 5', status: 400 } });
    }

    const routeLine = routeGeojson ? geojsonLineToWKT(routeGeojson) : undefined;

    const result = await query(
      `UPDATE stages SET
         name               = COALESCE($2, name),
         description        = COALESCE($3, description),
         route_geojson      = COALESCE($4, route_geojson),
         route_line         = COALESCE($5::geometry, route_line),
         silhouette_svg     = COALESCE($6, silhouette_svg),
         visibility         = COALESCE($7, visibility),
         difficulty_level   = COALESCE($8, difficulty_level),
         estimated_duration = COALESCE($9, estimated_duration),
         updated_at         = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        name?.trim() ?? null,
        description ?? null,
        routeGeojson ? JSON.stringify(routeGeojson) : null,
        routeLine ?? null,
        silhouetteSvg ?? null,
        visibility ?? null,
        difficultyLevel ?? null,
        estimatedDuration ?? null,
      ]
    );

    await logAudit({ userId: req.user.id, action: 'stage.update', resourceId: id, req });

    return res.json({ stage: publicStage(result.rows[0]) });
  } catch (err) {
    console.error('Error en updateStage:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// DELETE /api/v1/stages/:id
// ─────────────────────────────────────────────
export async function deleteStage(req, res) {
  const { id } = req.params;

  try {
    const existing = await query(`SELECT creator_id FROM stages WHERE id = $1`, [id]);
    const stage = existing.rows[0];

    if (!stage) {
      return res.status(404).json({ error: { message: 'Tramo no encontrado', status: 404 } });
    }

    if (stage.creator_id !== req.user.id) {
      return res.status(403).json({ error: { message: 'No tienes permiso para borrar este tramo', status: 403 } });
    }

    await query(`DELETE FROM stages WHERE id = $1`, [id]);
    await logAudit({ userId: req.user.id, action: 'stage.delete', resourceId: id, req });

    return res.status(204).send();
  } catch (err) {
    console.error('Error en deleteStage:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// POST /api/v1/stages/:id/publish
// ─────────────────────────────────────────────
export async function togglePublish(req, res) {
  const { id } = req.params;
  const { publish } = req.body || {};

  if (typeof publish !== 'boolean') {
    return res.status(400).json({ error: { message: 'publish (boolean) es obligatorio', status: 400 } });
  }

  try {
    const existing = await query(`SELECT * FROM stages WHERE id = $1`, [id]);
    const stage = existing.rows[0];

    if (!stage) {
      return res.status(404).json({ error: { message: 'Tramo no encontrado', status: 404 } });
    }

    if (stage.creator_id !== req.user.id) {
      return res.status(403).json({ error: { message: 'No tienes permiso', status: 403 } });
    }

    if (publish && !stage.route_geojson) {
      return res.status(400).json({ error: { message: 'No puedes publicar un tramo sin ruta GPS', status: 400 } });
    }

    const result = await query(
      `UPDATE stages SET
         is_published = $2,
         visibility   = CASE WHEN $2 = true AND visibility = 'private' THEN 'public' ELSE visibility END,
         updated_at   = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, publish]
    );

    const action = publish ? 'stage.publish' : 'stage.unpublish';
    await logAudit({ userId: req.user.id, action, resourceId: id, req });

    return res.json({ stage: publicStage(result.rows[0]) });
  } catch (err) {
    console.error('Error en togglePublish:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// POST /api/v1/stages/:id/groups
// Asignar/sincronizar grupos a un tramo
// body: { groupIds: string[] }
// ─────────────────────────────────────────────
export async function assignStageGroups(req, res) {
  const { id } = req.params;
  const { groupIds } = req.body || {};

  if (!Array.isArray(groupIds)) {
    return res.status(400).json({ error: { message: 'groupIds debe ser un array', status: 400 } });
  }

  try {
    const existing = await query(`SELECT creator_id, visibility FROM stages WHERE id = $1`, [id]);
    const stage = existing.rows[0];

    if (!stage) {
      return res.status(404).json({ error: { message: 'Tramo no encontrado', status: 404 } });
    }

    if (stage.creator_id !== req.user.id) {
      return res.status(403).json({ error: { message: 'No tienes permiso', status: 403 } });
    }

    if (groupIds.length > 0) {
      const memberCheck = await query(
        `SELECT group_id FROM group_members WHERE user_id = $1 AND group_id = ANY($2::uuid[])`,
        [req.user.id, groupIds]
      );
      if (memberCheck.rows.length !== groupIds.length) {
        return res.status(403).json({ error: { message: 'Solo puedes asignar tramos a grupos de los que eres miembro', status: 403 } });
      }
    }

    await query(`DELETE FROM stage_groups WHERE stage_id = $1`, [id]);

    if (groupIds.length > 0) {
      const values = groupIds.map((gid, i) => `($1, $${i + 2})`).join(', ');
      await query(`INSERT INTO stage_groups (stage_id, group_id) VALUES ${values}`, [id, ...groupIds]);
    }

    await logAudit({ userId: req.user.id, action: 'stage.groups_update', resourceId: id, req });

    return res.json({ stageId: id, groupIds });
  } catch (err) {
    console.error('Error en assignStageGroups:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}