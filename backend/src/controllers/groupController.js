import { query } from '../db/pool.js';
import crypto from 'crypto';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function publicGroup(row) {
  return {
    id:                  row.id,
    name:                row.name,
    description:         row.description,
    ownerId:             row.owner_id,
    ownerPseudonym:      row.owner_pseudonym ?? null,
    inviteCode:          row.invite_code,
    inviteCodeActive:    row.invite_code_active,
    inviteCodeExpiresAt: row.invite_code_expires_at,
    memberCount:         row.member_count ?? null,
    myRole:              row.my_role ?? null,
    createdAt:           row.created_at,
    updatedAt:           row.updated_at,
  };
}

function publicMember(row) {
  return {
    userId:    row.user_id,
    pseudonym: row.pseudonym ?? 'Anónimo',
    role:      row.role,
    joinedAt:  row.joined_at,
  };
}

async function logAudit({ userId, action, resourceId, req }) {
  try {
    await query(
      `INSERT INTO audit_log (user_id, action, resource_type, resource_id, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, 'group', resourceId, req.ip]
    );
  } catch (err) {
    console.error('  [audit_log] no se pudo escribir:', err.message);
  }
}

function generateInviteCode() {
  return crypto.randomBytes(6).toString('hex').toUpperCase(); // 12 chars
}

// Verifica que el usuario es miembro del grupo
async function assertMember(userId, groupId) {
  const result = await query(
    `SELECT role FROM group_members WHERE user_id = $1 AND group_id = $2`,
    [userId, groupId]
  );
  return result.rows[0] ?? null;
}

// ─────────────────────────────────────────────
// POST /api/v1/groups
// Crear grupo. El creador queda como owner.
// ─────────────────────────────────────────────
export async function createGroup(req, res) {
  const { name, description } = req.body || {};

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: { message: 'name es obligatorio', status: 400 } });
  }

  const inviteCode = generateInviteCode();

  try {
    const result = await query(
      `INSERT INTO groups (owner_id, name, description, invite_code)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, name.trim(), description ?? null, inviteCode]
    );

    const group = result.rows[0];

    // El owner se añade automáticamente como miembro con rol 'owner'
    await query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [group.id, req.user.id]
    );

    await logAudit({ userId: req.user.id, action: 'group.create', resourceId: group.id, req });

    return res.status(201).json({ group: publicGroup({ ...group, member_count: 1, my_role: 'owner' }) });
  } catch (err) {
    console.error('Error en createGroup:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// GET /api/v1/groups/my
// Grupos a los que pertenece el usuario autenticado.
// ─────────────────────────────────────────────
export async function listMyGroups(req, res) {
  try {
    const result = await query(
      `SELECT g.*, u.pseudonym AS owner_pseudonym,
              gm.role AS my_role,
              COUNT(gm2.user_id) AS member_count
       FROM groups g
       JOIN group_members gm  ON gm.group_id = g.id AND gm.user_id = $1
       JOIN group_members gm2 ON gm2.group_id = g.id
       LEFT JOIN users u ON u.id = g.owner_id
       GROUP BY g.id, u.pseudonym, gm.role
       ORDER BY g.created_at DESC`,
      [req.user.id]
    );

    return res.json({ groups: result.rows.map(publicGroup) });
  } catch (err) {
    console.error('Error en listMyGroups:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// GET /api/v1/groups/:id
// Ver grupo. Solo miembros.
// ─────────────────────────────────────────────
export async function getGroup(req, res) {
  const { id } = req.params;

  try {
    const member = await assertMember(req.user.id, id);
    if (!member) {
      return res.status(403).json({ error: { message: 'No eres miembro de este grupo', status: 403 } });
    }

    const result = await query(
      `SELECT g.*, u.pseudonym AS owner_pseudonym,
              COUNT(gm.user_id) AS member_count
       FROM groups g
       LEFT JOIN users u ON u.id = g.owner_id
       LEFT JOIN group_members gm ON gm.group_id = g.id
       WHERE g.id = $1
       GROUP BY g.id, u.pseudonym`,
      [id]
    );

    const group = result.rows[0];
    if (!group) {
      return res.status(404).json({ error: { message: 'Grupo no encontrado', status: 404 } });
    }

    return res.json({ group: publicGroup({ ...group, my_role: member.role }) });
  } catch (err) {
    console.error('Error en getGroup:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// PUT /api/v1/groups/:id
// Editar grupo. Solo owner.
// ─────────────────────────────────────────────
export async function updateGroup(req, res) {
  const { id } = req.params;
  const { name, description } = req.body || {};

  try {
    const member = await assertMember(req.user.id, id);
    if (!member || member.role !== 'owner') {
      return res.status(403).json({ error: { message: 'Solo el owner puede editar el grupo', status: 403 } });
    }

    const result = await query(
      `UPDATE groups SET
         name        = COALESCE($2, name),
         description = COALESCE($3, description),
         updated_at  = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, name?.trim() ?? null, description ?? null]
    );

    await logAudit({ userId: req.user.id, action: 'group.update', resourceId: id, req });

    return res.json({ group: publicGroup({ ...result.rows[0], my_role: 'owner' }) });
  } catch (err) {
    console.error('Error en updateGroup:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// DELETE /api/v1/groups/:id
// Borrar grupo. Solo owner.
// ─────────────────────────────────────────────
export async function deleteGroup(req, res) {
  const { id } = req.params;

  try {
    const member = await assertMember(req.user.id, id);
    if (!member || member.role !== 'owner') {
      return res.status(403).json({ error: { message: 'Solo el owner puede borrar el grupo', status: 403 } });
    }

    await query(`DELETE FROM groups WHERE id = $1`, [id]);
    await logAudit({ userId: req.user.id, action: 'group.delete', resourceId: id, req });

    return res.status(204).send();
  } catch (err) {
    console.error('Error en deleteGroup:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// POST /api/v1/groups/join
// Unirse a un grupo con invite_code.
// body: { inviteCode }
// ─────────────────────────────────────────────
export async function joinGroup(req, res) {
  const { inviteCode } = req.body || {};

  if (!inviteCode || typeof inviteCode !== 'string') {
    return res.status(400).json({ error: { message: 'inviteCode es obligatorio', status: 400 } });
  }

  try {
    const groupResult = await query(
      `SELECT * FROM groups WHERE invite_code = $1`,
      [inviteCode.toUpperCase()]
    );

    const group = groupResult.rows[0];
    if (!group) {
      return res.status(404).json({ error: { message: 'Código de invitación inválido', status: 404 } });
    }

    if (!group.invite_code_active) {
      return res.status(403).json({ error: { message: 'Este código de invitación está desactivado', status: 403 } });
    }

    if (group.invite_code_expires_at && new Date(group.invite_code_expires_at) < new Date()) {
      return res.status(403).json({ error: { message: 'Este código de invitación ha expirado', status: 403 } });
    }

    // Verificar que no es ya miembro
    const existing = await assertMember(req.user.id, group.id);
    if (existing) {
      return res.status(409).json({ error: { message: 'Ya eres miembro de este grupo', status: 409 } });
    }

    await query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member')`,
      [group.id, req.user.id]
    );

    await logAudit({ userId: req.user.id, action: 'group.join', resourceId: group.id, req });

    return res.status(201).json({ message: `Te has unido a "${group.name}"`, groupId: group.id });
  } catch (err) {
    console.error('Error en joinGroup:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// POST /api/v1/groups/:id/leave
// Abandonar grupo. El owner no puede salir sin transferir o borrar.
// ─────────────────────────────────────────────
export async function leaveGroup(req, res) {
  const { id } = req.params;

  try {
    const member = await assertMember(req.user.id, id);
    if (!member) {
      return res.status(403).json({ error: { message: 'No eres miembro de este grupo', status: 403 } });
    }

    if (member.role === 'owner') {
      return res.status(400).json({
        error: { message: 'El owner no puede abandonar el grupo. Transfiere la propiedad o borra el grupo.', status: 400 },
      });
    }

    await query(
      `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    await logAudit({ userId: req.user.id, action: 'group.leave', resourceId: id, req });

    return res.status(204).send();
  } catch (err) {
    console.error('Error en leaveGroup:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// DELETE /api/v1/groups/:id/members/:userId
// Expulsar miembro. Solo owner o moderator (no pueden expulsar al owner).
// ─────────────────────────────────────────────
export async function kickMember(req, res) {
  const { id, userId } = req.params;

  try {
    const myMember = await assertMember(req.user.id, id);
    if (!myMember || !['owner', 'moderator'].includes(myMember.role)) {
      return res.status(403).json({ error: { message: 'No tienes permiso para expulsar miembros', status: 403 } });
    }

    const targetMember = await assertMember(userId, id);
    if (!targetMember) {
      return res.status(404).json({ error: { message: 'El usuario no es miembro de este grupo', status: 404 } });
    }

    if (targetMember.role === 'owner') {
      return res.status(403).json({ error: { message: 'No puedes expulsar al owner', status: 403 } });
    }

    // Moderador no puede expulsar a otro moderador
    if (myMember.role === 'moderator' && targetMember.role === 'moderator') {
      return res.status(403).json({ error: { message: 'Un moderador no puede expulsar a otro moderador', status: 403 } });
    }

    await query(
      `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [id, userId]
    );

    await logAudit({ userId: req.user.id, action: 'group.kick', resourceId: id, req });

    return res.status(204).send();
  } catch (err) {
    console.error('Error en kickMember:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// GET /api/v1/groups/:id/members
// Listar miembros. Solo miembros del grupo.
// ─────────────────────────────────────────────
export async function listMembers(req, res) {
  const { id } = req.params;

  try {
    const member = await assertMember(req.user.id, id);
    if (!member) {
      return res.status(403).json({ error: { message: 'No eres miembro de este grupo', status: 403 } });
    }

    const result = await query(
      `SELECT gm.user_id, gm.role, gm.joined_at, u.pseudonym
       FROM group_members gm
       LEFT JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1
       ORDER BY
         CASE gm.role WHEN 'owner' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END,
         gm.joined_at ASC`,
      [id]
    );

    return res.json({ members: result.rows.map(publicMember) });
  } catch (err) {
    console.error('Error en listMembers:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// PATCH /api/v1/groups/:id/members/:userId/role
// Cambiar rol de un miembro. Solo owner.
// body: { role: 'moderator' | 'member' }
// ─────────────────────────────────────────────
export async function updateMemberRole(req, res) {
  const { id, userId } = req.params;
  const { role } = req.body || {};

  if (!['moderator', 'member'].includes(role)) {
    return res.status(400).json({ error: { message: 'role debe ser moderator o member', status: 400 } });
  }

  try {
    const myMember = await assertMember(req.user.id, id);
    if (!myMember || myMember.role !== 'owner') {
      return res.status(403).json({ error: { message: 'Solo el owner puede cambiar roles', status: 403 } });
    }

    const targetMember = await assertMember(userId, id);
    if (!targetMember) {
      return res.status(404).json({ error: { message: 'El usuario no es miembro de este grupo', status: 404 } });
    }

    if (targetMember.role === 'owner') {
      return res.status(403).json({ error: { message: 'No puedes cambiar el rol del owner', status: 403 } });
    }

    await query(
      `UPDATE group_members SET role = $3 WHERE group_id = $1 AND user_id = $2`,
      [id, userId, role]
    );

    await logAudit({ userId: req.user.id, action: 'group.role_update', resourceId: id, req });

    return res.json({ message: `Rol actualizado a ${role}` });
  } catch (err) {
    console.error('Error en updateMemberRole:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// POST /api/v1/groups/:id/invite/regenerate
// Regenerar invite_code. Solo owner o moderator.
// body: { expiresInHours? }  — null = sin expiración
// ─────────────────────────────────────────────
export async function regenerateInviteCode(req, res) {
  const { id } = req.params;
  const { expiresInHours } = req.body || {};

  try {
    const member = await assertMember(req.user.id, id);
    if (!member || !['owner', 'moderator'].includes(member.role)) {
      return res.status(403).json({ error: { message: 'No tienes permiso para regenerar el código', status: 403 } });
    }

    const newCode      = generateInviteCode();
    const expiresAt    = expiresInHours
      ? new Date(Date.now() + expiresInHours * 3600 * 1000)
      : null;

    const result = await query(
      `UPDATE groups SET
         invite_code            = $2,
         invite_code_active     = true,
         invite_code_expires_at = $3,
         updated_at             = NOW()
       WHERE id = $1
       RETURNING invite_code, invite_code_expires_at`,
      [id, newCode, expiresAt]
    );

    await logAudit({ userId: req.user.id, action: 'group.invite_regenerate', resourceId: id, req });

    return res.json({
      inviteCode:          result.rows[0].invite_code,
      inviteCodeExpiresAt: result.rows[0].invite_code_expires_at,
    });
  } catch (err) {
    console.error('Error en regenerateInviteCode:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// GET /api/v1/groups/:id/stages
// Tramos visibles para el grupo (visibility='group' + asignados a este grupo).
// ─────────────────────────────────────────────
export async function listGroupStages(req, res) {
  const { id } = req.params;

  try {
    const member = await assertMember(req.user.id, id);
    if (!member) {
      return res.status(403).json({ error: { message: 'No eres miembro de este grupo', status: 403 } });
    }

    const result = await query(
      `SELECT s.id, s.name, s.description, s.visibility, s.difficulty_level,
              s.estimated_duration, s.is_published, s.created_at, u.pseudonym
       FROM stages s
       JOIN stage_groups sg ON sg.stage_id = s.id AND sg.group_id = $1
       LEFT JOIN users u ON u.id = s.creator_id
       WHERE s.is_published = true
       ORDER BY s.created_at DESC`,
      [id]
    );

    return res.json({ stages: result.rows });
  } catch (err) {
    console.error('Error en listGroupStages:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// GET /api/v1/groups/:id/times
// Tiempos visibles para el grupo.
// ─────────────────────────────────────────────
export async function listGroupTimes(req, res) {
  const { id } = req.params;
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(50, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  try {
    const member = await assertMember(req.user.id, id);
    if (!member) {
      return res.status(403).json({ error: { message: 'No eres miembro de este grupo', status: 403 } });
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM times t
       JOIN time_groups tg ON tg.time_id = t.id AND tg.group_id = $1`,
      [id]
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT t.id, t.user_id, t.stage_id, t.duration_ms, t.max_speed,
              t.avg_speed, t.visibility, t.created_at,
              u.pseudonym, s.name AS stage_name
       FROM times t
       JOIN time_groups tg ON tg.time_id = t.id AND tg.group_id = $1
       LEFT JOIN users  u ON u.id = t.user_id
       LEFT JOIN stages s ON s.id = t.stage_id
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    return res.json({
      times: result.rows.map(row => ({
        id:         row.id,
        userId:     row.user_id,
        pseudonym:  row.pseudonym ?? 'Anónimo',
        stageId:    row.stage_id,
        stageName:  row.stage_name,
        durationMs: row.duration_ms,
        maxSpeed:   row.max_speed,
        avgSpeed:   row.avg_speed,
        createdAt:  row.created_at,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Error en listGroupTimes:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}