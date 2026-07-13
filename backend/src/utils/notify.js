/**
 * Servicio de notificaciones.
 *
 * Crea filas en `notifications` y las emite en tiempo real por Socket.io
 * a la room personal del usuario (`user_<id>`, ver socket.js).
 *
 * Tipos:
 *   group_message — mensajes de grupo. Se COLAPSAN: una sola notificación
 *                   no leída por grupo, con contador. Por privacidad nunca
 *                   se incluye el contenido del mensaje (está cifrado en BD).
 *   record        — récord batido en un tramo en el que has participado.
 *   news          — noticias de la app / mundo del motor (difusión admin).
 *   system        — avisos internos.
 *
 * Todas las funciones son "best-effort": se llaman con .catch() desde los
 * controladores para no romper la operación principal si algo falla.
 */
import { query } from '../db/pool.js';
import { emitToUser } from '../socket.js';

export function publicNotification(row) {
  return {
    id:        row.id,
    type:      row.type,
    title:     row.title,
    body:      row.body,
    data:      row.data ?? {},
    read:      row.read_at != null,
    createdAt: row.created_at,
  };
}

/** Inserta una notificación y la emite al usuario. */
export async function createNotification({ userId, type, title, body = null, data = null }) {
  const result = await query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, type, title, body, data ? JSON.stringify(data) : null]
  );
  const notif = publicNotification(result.rows[0]);
  emitToUser(userId, 'notification:new', notif);
  return notif;
}

// ─────────────────────────────────────────────
// Mensaje nuevo en un grupo → miembros (menos el autor).
// Colapsa: si ya hay una no leída de ese grupo, incrementa el contador
// y la "sube" (created_at = NOW) en vez de crear otra.
// ─────────────────────────────────────────────
export async function notifyGroupMessage({ groupId, senderId, senderPseudonym }) {
  const [groupRes, membersRes] = await Promise.all([
    query(`SELECT name FROM groups WHERE id = $1`, [groupId]),
    query(`SELECT user_id FROM group_members WHERE group_id = $1 AND user_id <> $2`, [groupId, senderId]),
  ]);
  const groupName = groupRes.rows[0]?.name ?? 'un grupo';
  const sender    = senderPseudonym || 'Alguien';

  for (const { user_id } of membersRes.rows) {
    try {
      const updated = await query(
        `UPDATE notifications SET
           data       = jsonb_set(COALESCE(data, '{}'), '{count}',
                          to_jsonb(COALESCE((data->>'count')::int, 1) + 1)),
           body       = $3,
           created_at = NOW()
         WHERE user_id = $1 AND type = 'group_message'
           AND data->>'groupId' = $2 AND read_at IS NULL
         RETURNING *`,
        [user_id, groupId, `Último de ${sender}`]
      );

      let row = updated.rows[0];
      if (row) {
        // Título con contador actualizado
        const count = row.data?.count ?? 2;
        const titled = await query(
          `UPDATE notifications SET title = $2 WHERE id = $1 RETURNING *`,
          [row.id, `${count} mensajes nuevos en ${groupName}`]
        );
        row = titled.rows[0];
      } else {
        const inserted = await query(
          `INSERT INTO notifications (user_id, type, title, body, data)
           VALUES ($1, 'group_message', $2, $3, $4)
           RETURNING *`,
          [user_id, `Mensaje nuevo en ${groupName}`, `De ${sender}`,
           JSON.stringify({ groupId, count: 1 })]
        );
        row = inserted.rows[0];
      }

      emitToUser(user_id, 'notification:new', publicNotification(row));
    } catch (err) {
      console.error('  [notify] group_message falló para', user_id, err.message);
    }
  }
}

// ─────────────────────────────────────────────
// Récord batido en un tramo → todos los que tienen tiempo público en él
// (y el creador del tramo), menos quien lo ha batido.
// ─────────────────────────────────────────────
export async function notifyRecordIfBeaten({ stageId, timeId, durationMs, setterId }) {
  // Mejor tiempo público anterior (excluyendo el recién insertado)
  const prevRes = await query(
    `SELECT MIN(duration_ms) AS best FROM times
     WHERE stage_id = $1 AND visibility = 'public' AND id <> $2`,
    [stageId, timeId]
  );
  const prevBest = prevRes.rows[0]?.best;
  if (prevBest == null || durationMs >= prevBest) return; // no hay récord

  const [stageRes, setterRes, recipientsRes] = await Promise.all([
    query(`SELECT name, creator_id FROM stages WHERE id = $1`, [stageId]),
    query(`SELECT pseudonym, username FROM users WHERE id = $1`, [setterId]),
    query(
      `SELECT DISTINCT user_id FROM times
       WHERE stage_id = $1 AND visibility = 'public' AND user_id <> $2`,
      [stageId, setterId]
    ),
  ]);

  const stage  = stageRes.rows[0];
  if (!stage) return;
  const setter = setterRes.rows[0]?.pseudonym || setterRes.rows[0]?.username || 'Alguien';

  const recipients = new Set(recipientsRes.rows.map((r) => r.user_id));
  if (stage.creator_id && stage.creator_id !== setterId) recipients.add(stage.creator_id);

  const seconds = (durationMs / 1000).toFixed(3);
  for (const userId of recipients) {
    try {
      await createNotification({
        userId,
        type: 'record',
        title: `¡Récord batido en ${stage.name}!`,
        body: `${setter} ha marcado ${seconds}s`,
        data: { stageId },
      });
    } catch (err) {
      console.error('  [notify] record falló para', userId, err.message);
    }
  }
}

// ─────────────────────────────────────────────
// Difusión (noticias de la app / mundo del motor) → todos los usuarios.
// ─────────────────────────────────────────────
export async function broadcastNews({ title, body = null, url = null }) {
  const result = await query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     SELECT id, 'news', $1, $2, $3 FROM users
     RETURNING *`,
    [title, body, JSON.stringify({ url })]
  );
  for (const row of result.rows) {
    emitToUser(row.user_id, 'notification:new', publicNotification(row));
  }
  return result.rows.length;
}
