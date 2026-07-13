import { query } from '../db/pool.js';
import { getRedis } from '../db/redis.js';

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
    // Señales sociales (0/false si la query no las incluye)
    likesCount:        row.likes_count ?? 0,
    favoritesCount:    row.favorites_count ?? 0,
    pilotsCount:       row.pilots_count ?? 0,
    viewCount:         row.view_count ?? 0,
    likedByMe:         row.liked_by_me ?? false,
    favoritedByMe:     row.favorited_by_me ?? false,
  };
}

// Subqueries de contadores sociales, reutilizadas en listados y detalle.
// Requieren el alias `s` para stages y un placeholder $N para el userId
// (null si no hay sesión → EXISTS devuelve false).
function socialCountsSQL(userParamIdx) {
  return `
    (SELECT COUNT(*)::int FROM stage_likes sl WHERE sl.stage_id = s.id)          AS likes_count,
    (SELECT COUNT(*)::int FROM favorites f   WHERE f.stage_id = s.id)            AS favorites_count,
    (SELECT COUNT(DISTINCT t.user_id)::int FROM times t WHERE t.stage_id = s.id) AS pilots_count,
    EXISTS(SELECT 1 FROM stage_likes sl2 WHERE sl2.stage_id = s.id AND sl2.user_id = $${userParamIdx}::uuid) AS liked_by_me,
    EXISTS(SELECT 1 FROM favorites f2   WHERE f2.stage_id = s.id AND f2.user_id  = $${userParamIdx}::uuid) AS favorited_by_me`;
}

// Comprueba que el usuario puede ver el tramo (público, propio o de grupo).
// Devuelve un mensaje de error o null si tiene acceso.
async function checkStageAccess(stage, userId) {
  const isOwner = stage.creator_id === userId;
  if (stage.visibility === 'private' && !isOwner) {
    return 'No tienes acceso a este tramo';
  }
  if (stage.visibility === 'group' && !isOwner) {
    const memberCheck = await query(
      `SELECT 1 FROM stage_groups sg
       JOIN group_members gm ON gm.group_id = sg.group_id
       WHERE sg.stage_id = $1 AND gm.user_id = $2 LIMIT 1`,
      [stage.id, userId]
    );
    if (memberCheck.rows.length === 0) return 'No tienes acceso a este tramo';
  }
  return null;
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
  // sort=popular ordena por señales sociales; por defecto, recientes
  const sort       = req.query.sort === 'popular' ? 'popular' : 'recent';

  try {
    const conditions = [`s.visibility = 'public'`, `s.is_published = true`];
    const params     = [];
    let   pIdx       = 1;

    // No mostrar tramos de usuarios bloqueados por el solicitante
    if (req.user?.id) {
      conditions.push(
        `NOT EXISTS (SELECT 1 FROM user_blocks ub
                     WHERE ub.blocker_id = $${pIdx++} AND ub.blocked_id = s.creator_id)`
      );
      params.push(req.user.id);
    }

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

    // Contadores simples, sin score ponderado (decisión fase 1, ver ROADMAP).
    // El SELECT exterior permite ordenar por los alias de los contadores.
    const orderBy = sort === 'popular'
      ? `(likes_count + favorites_count + pilots_count) DESC, view_count DESC, created_at DESC`
      : `created_at DESC`;

    const result = await query(
      `SELECT * FROM (
         SELECT s.*, u.pseudonym, ${socialCountsSQL(pIdx)}
         FROM stages s
         LEFT JOIN users u ON u.id = s.creator_id
         WHERE ${where}
       ) sub
       ORDER BY ${orderBy}
       LIMIT $${pIdx + 1} OFFSET $${pIdx + 2}`,
      [...params, req.user?.id ?? null, limit, offset]
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
// Incluye myBestTimeMs: mejor tiempo del usuario en cada tramo (o null)
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
      `SELECT s.*, u.pseudonym,
              bt.best_ms AS my_best_time_ms
       FROM stages s
       LEFT JOIN users u ON u.id = s.creator_id
       LEFT JOIN (
         SELECT stage_id, MIN(duration_ms) AS best_ms
         FROM times
         WHERE user_id = $1
         GROUP BY stage_id
       ) bt ON bt.stage_id = s.id
       WHERE s.creator_id = $1
       ORDER BY s.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    return res.json({
      stages: result.rows.map(row => ({
        ...publicStage(row),
        myBestTimeMs: row.my_best_time_ms ?? null,
      })),
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
         -- '' explícito = borrar la silueta; null = no tocarla
         silhouette_svg     = CASE WHEN $6::text = '' THEN NULL ELSE COALESCE($6, silhouette_svg) END,
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
// ─────────────────────────────────────────────
// Favoritos
// ─────────────────────────────────────────────

// POST /api/v1/stages/:id/favorite
export async function addFavorite(req, res) {
  const { id } = req.params;

  try {
    const stageResult = await query(`SELECT id, visibility, creator_id FROM stages WHERE id = $1`, [id]);
    const stage = stageResult.rows[0];

    if (!stage) {
      return res.status(404).json({ error: { message: 'Tramo no encontrado', status: 404 } });
    }

    // Verificar acceso: público, propio, o de un grupo del que es miembro
    const isOwner = stage.creator_id === req.user.id;
    if (stage.visibility === 'private' && !isOwner) {
      return res.status(403).json({ error: { message: 'No tienes acceso a este tramo', status: 403 } });
    }
    if (stage.visibility === 'group' && !isOwner) {
      const memberCheck = await query(
        `SELECT 1 FROM stage_groups sg
         JOIN group_members gm ON gm.group_id = sg.group_id
         WHERE sg.stage_id = $1 AND gm.user_id = $2 LIMIT 1`,
        [id, req.user.id]
      );
      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: { message: 'No tienes acceso a este tramo', status: 403 } });
      }
    }

    await query(
      `INSERT INTO favorites (user_id, stage_id) VALUES ($1, $2)
       ON CONFLICT (user_id, stage_id) DO NOTHING`,
      [req.user.id, id]
    );

    return res.status(201).json({ favorited: true, stageId: id });
  } catch (err) {
    console.error('Error en addFavorite:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// DELETE /api/v1/stages/:id/favorite
export async function removeFavorite(req, res) {
  const { id } = req.params;

  try {
    await query(`DELETE FROM favorites WHERE user_id = $1 AND stage_id = $2`, [req.user.id, id]);
    return res.status(204).send();
  } catch (err) {
    console.error('Error en removeFavorite:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// GET /api/v1/stages/favorites/list
export async function listFavorites(req, res) {
  try {
    const result = await query(
      `SELECT s.*, u.pseudonym, f.created_at AS favorited_at
       FROM favorites f
       JOIN stages s ON s.id = f.stage_id
       LEFT JOIN users u ON u.id = s.creator_id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );

    return res.json({
      stages: result.rows.map(row => ({
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
        favoritedAt:       row.favorited_at,
      })),
    });
  } catch (err) {
    console.error('Error en listFavorites:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// GET /api/v1/stages/near?lat=..&lng=..&radius=500
// Tramos cuya SALIDA está a menos de `radius` metros de la
// posición dada. Solo tramos visibles para el usuario:
// públicos+publicados, propios, o de grupos a los que pertenece.
// ─────────────────────────────────────────────
export async function listNearbyStages(req, res) {
  const lat    = parseFloat(req.query.lat);
  const lng    = parseFloat(req.query.lng);
  const radius = Math.min(10000, Math.max(50, parseInt(req.query.radius) || 500));

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: { message: 'lat y lng son obligatorios y deben ser coordenadas válidas', status: 400 } });
  }

  try {
    const result = await query(
      `SELECT s.*, u.pseudonym,
              ST_Distance(
                ST_StartPoint(s.route_line)::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
              ) AS distance_m
       FROM stages s
       LEFT JOIN users u ON u.id = s.creator_id
       WHERE s.route_line IS NOT NULL
         AND ST_DWithin(
               ST_StartPoint(s.route_line)::geography,
               ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
               $3
             )
         AND (
           (s.visibility = 'public' AND s.is_published = true)
           OR s.creator_id = $4
           OR EXISTS (
             SELECT 1 FROM stage_groups sg
             JOIN group_members gm ON gm.group_id = sg.group_id
             WHERE sg.stage_id = s.id AND gm.user_id = $4
           )
         )
       ORDER BY distance_m ASC
       LIMIT 10`,
      [lng, lat, radius, req.user?.id ?? null]
    );

    return res.json({
      stages: result.rows.map((row) => {
        const props = row.route_geojson?.properties || {};
        return {
          ...publicStage(row),
          distanceM:   Math.round(row.distance_m),
          start:       props.start ?? null,
          end:         props.end ?? null,
          checkpoints: props.checkpoints ?? [],
        };
      }),
    });
  } catch (err) {
    console.error('Error en listNearbyStages:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// GET /api/v1/stages/:id/detail
// Devuelve TODA la info del tramo: datos, creador, mi mejor tiempo
// con sus splits, y el ranking completo del tramo.
// ─────────────────────────────────────────────
export async function getStageDetail(req, res) {
  const { id } = req.params;

  try {
    // 1. Datos del tramo + creador + señales sociales
    const stageResult = await query(
      `SELECT s.*, u.pseudonym AS creator_pseudonym, u.username AS creator_username,
              ${socialCountsSQL(2)}
       FROM stages s
       LEFT JOIN users u ON u.id = s.creator_id
       WHERE s.id = $1`,
      [id, req.user?.id ?? null]
    );

    const stage = stageResult.rows[0];
    if (!stage) {
      return res.status(404).json({ error: { message: 'Tramo no encontrado', status: 404 } });
    }

    // Verificar acceso
    const isOwner = req.user?.id === stage.creator_id;
    if (stage.visibility === 'private' && !isOwner) {
      return res.status(403).json({ error: { message: 'No tienes acceso a este tramo', status: 403 } });
    }
    if (stage.visibility === 'group' && !isOwner) {
      const memberCheck = await query(
        `SELECT 1 FROM stage_groups sg
         JOIN group_members gm ON gm.group_id = sg.group_id
         WHERE sg.stage_id = $1 AND gm.user_id = $2 LIMIT 1`,
        [id, req.user?.id]
      );
      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: { message: 'No tienes acceso a este tramo', status: 403 } });
      }
    }

    // 1b. Contar la vista (dedupe por usuario/IP en Redis, ventana 6h).
    // Fail-open: sin Redis no se cuenta, nunca se rompe la petición.
    try {
      const redis = await getRedis();
      if (redis) {
        const viewer = req.user?.id || req.ip;
        const fresh = await redis.set(`view:${id}:${viewer}`, '1', { NX: true, EX: 21600 });
        if (fresh) {
          const vc = await query(
            `UPDATE stages SET view_count = view_count + 1 WHERE id = $1 RETURNING view_count`,
            [id]
          );
          stage.view_count = vc.rows[0]?.view_count ?? stage.view_count;
        }
      }
    } catch (err) {
      console.error('  [views] no se pudo contar la vista:', err.message);
    }

    // 2. Mi mejor tiempo en este tramo (con splits y track)
    let myBest = null;
    if (req.user?.id) {
      const myBestResult = await query(
        `SELECT id, duration_ms, route_gps, max_speed, avg_speed, visibility, created_at
         FROM times
         WHERE user_id = $1 AND stage_id = $2
         ORDER BY duration_ms ASC
         LIMIT 1`,
        [req.user.id, id]
      );
      if (myBestResult.rows[0]) {
        const row = myBestResult.rows[0];
        const parsed = typeof row.route_gps === 'string'
          ? JSON.parse(row.route_gps || '{}')
          : (row.route_gps || {});
        myBest = {
          id:         row.id,
          durationMs: row.duration_ms,
          maxSpeed:   row.max_speed,
          avgSpeed:   row.avg_speed,
          visibility: row.visibility,
          createdAt:  row.created_at,
          splits:     parsed.splits ?? [],
          track:      parsed.track ?? [],
        };
      }
    }

    // 2b. Mejor tiempo global del tramo (público, con splits) —
    // referencia para la comparativa en vivo del cronómetro.
    let globalBest = null;
    {
      const globalBestResult = await query(
        `SELECT t.id, t.duration_ms, t.route_gps, t.created_at, u.pseudonym
         FROM times t
         LEFT JOIN users u ON u.id = t.user_id
         WHERE t.stage_id = $1 AND t.visibility = 'public'
         ORDER BY t.duration_ms ASC
         LIMIT 1`,
        [id]
      );
      if (globalBestResult.rows[0]) {
        const row = globalBestResult.rows[0];
        const parsed = typeof row.route_gps === 'string'
          ? JSON.parse(row.route_gps || '{}')
          : (row.route_gps || {});
        globalBest = {
          id:         row.id,
          durationMs: row.duration_ms,
          pseudonym:  row.pseudonym ?? 'Anónimo',
          createdAt:  row.created_at,
          splits:     parsed.splits ?? [],
        };
      }
    }

    // 3. Ranking del tramo (mejor tiempo público por usuario)
    const rankingResult = await query(
      `SELECT tr.rank, tr.duration_ms, tr.created_at, u.id AS user_id, u.pseudonym
       FROM time_rankings tr
       LEFT JOIN users u ON u.id = tr.user_id
       WHERE tr.stage_id = $1
       ORDER BY tr.rank ASC
       LIMIT 50`,
      [id]
    );

    // Extraer checkpoints del routeGeojson
    const props = stage.route_geojson?.properties || {};

    return res.json({
      stage: {
        id:                stage.id,
        name:              stage.name,
        description:       stage.description,
        routeGeojson:      stage.route_geojson,
        silhouetteSvg:     stage.silhouette_svg ?? null,
        visibility:        stage.visibility,
        difficultyLevel:   stage.difficulty_level,
        estimatedDuration: stage.estimated_duration,
        isPublished:       stage.is_published,
        creatorId:         stage.creator_id,
        creatorPseudonym:  stage.creator_pseudonym ?? stage.creator_username ?? 'Anónimo',
        createdAt:         stage.created_at,
        start:             props.start ?? null,
        end:               props.end ?? null,
        checkpoints:       props.checkpoints ?? [],
        likesCount:        stage.likes_count ?? 0,
        favoritesCount:    stage.favorites_count ?? 0,
        pilotsCount:       stage.pilots_count ?? 0,
        viewCount:         stage.view_count ?? 0,
        likedByMe:         stage.liked_by_me ?? false,
        favoritedByMe:     stage.favorited_by_me ?? false,
      },
      myBest,
      globalBest,
      ranking: rankingResult.rows.map(row => ({
        rank:       row.rank,
        userId:     row.user_id,
        pseudonym:  row.pseudonym ?? 'Anónimo',
        durationMs: row.duration_ms,
        createdAt:  row.created_at,
      })),
    });
  } catch (err) {
    console.error('Error en getStageDetail:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// Likes — señal social simple, distinta de favoritos
// ─────────────────────────────────────────────

// POST /api/v1/stages/:id/like
export async function addLike(req, res) {
  const { id } = req.params;

  try {
    const stageResult = await query(`SELECT id, visibility, creator_id FROM stages WHERE id = $1`, [id]);
    const stage = stageResult.rows[0];

    if (!stage) {
      return res.status(404).json({ error: { message: 'Tramo no encontrado', status: 404 } });
    }

    const accessError = await checkStageAccess(stage, req.user.id);
    if (accessError) {
      return res.status(403).json({ error: { message: accessError, status: 403 } });
    }

    await query(
      `INSERT INTO stage_likes (user_id, stage_id) VALUES ($1, $2)
       ON CONFLICT (user_id, stage_id) DO NOTHING`,
      [req.user.id, id]
    );

    const count = await query(
      `SELECT COUNT(*)::int AS likes FROM stage_likes WHERE stage_id = $1`,
      [id]
    );

    return res.status(201).json({ liked: true, stageId: id, likesCount: count.rows[0].likes });
  } catch (err) {
    console.error('Error en addLike:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// DELETE /api/v1/stages/:id/like
export async function removeLike(req, res) {
  const { id } = req.params;

  try {
    await query(`DELETE FROM stage_likes WHERE user_id = $1 AND stage_id = $2`, [req.user.id, id]);

    const count = await query(
      `SELECT COUNT(*)::int AS likes FROM stage_likes WHERE stage_id = $1`,
      [id]
    );

    return res.json({ liked: false, stageId: id, likesCount: count.rows[0].likes });
  } catch (err) {
    console.error('Error en removeLike:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}
