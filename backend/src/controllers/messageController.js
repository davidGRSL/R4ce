/**
 * Chat de grupos — mensajes persistidos y cifrados en reposo.
 *
 * El contenido se cifra con AES-256-GCM (utils/messageCrypto.js) antes de
 * tocar la BD. La media (imagen/vídeo/audio) se guarda vía storage y en el
 * mensaje solo viaja la URL (media_url / media_type).
 *
 * Tras persistir, se emite `group:message` / `group:message_deleted` a la
 * room Socket.io del grupo para el tiempo real.
 */
import { query } from '../db/pool.js';
import { encryptMessage, decryptMessage } from '../utils/messageCrypto.js';
import { processAndStoreChatMedia, keyFromUrl } from '../middleware/upload.js';
import { storage } from '../storage/index.js';
import { emitToGroup } from '../socket.js';
import { notifyGroupMessage } from '../utils/notify.js';
import { blockedIdsOf } from './blockController.js';

const MAX_CONTENT_LENGTH = 4000;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function getMembership(userId, groupId) {
  const result = await query(
    `SELECT role FROM group_members WHERE user_id = $1 AND group_id = $2`,
    [userId, groupId]
  );
  return result.rows[0] ?? null;
}

function publicMessage(row, groupId) {
  const deleted = row.deleted_at != null;
  return {
    id:          row.id,
    groupId:     row.group_id,
    userId:      row.user_id,
    pseudonym:   row.pseudonym ?? 'Anónimo',
    avatarUrl:   row.avatar_url ?? null,
    // Los mensajes borrados no exponen contenido ni media
    content:     deleted ? null : decryptMessage(groupId, row.content_encrypted),
    messageType: row.message_type,
    mediaUrl:    deleted ? null : row.media_url,
    mediaType:   deleted ? null : row.media_type,
    metadata:    deleted ? null : row.metadata,
    deleted,
    createdAt:   row.created_at,
  };
}

const MESSAGE_SELECT = `
  SELECT m.id, m.group_id, m.user_id, m.content_encrypted, m.message_type,
         m.media_url, m.media_type, m.metadata, m.created_at, m.deleted_at,
         u.pseudonym, u.avatar_url
  FROM group_messages m
  LEFT JOIN users u ON u.id = m.user_id`;

// ─────────────────────────────────────────────
// GET /api/v1/groups/:id/messages?before=<ISO>&limit=<n>
// Historial paginado por cursor (created_at descendente). Solo miembros.
// Devuelve los mensajes en orden cronológico ascendente (listos para pintar).
// ─────────────────────────────────────────────
export async function listMessages(req, res) {
  const { id } = req.params;
  const limit  = Math.min(100, parseInt(req.query.limit) || 50);
  const before = req.query.before ? new Date(req.query.before) : null;

  if (before && isNaN(before.getTime())) {
    return res.status(400).json({ error: { message: 'before debe ser una fecha ISO válida', status: 400 } });
  }

  try {
    const member = await getMembership(req.user.id, id);
    if (!member) {
      return res.status(403).json({ error: { message: 'No eres miembro de este grupo', status: 403 } });
    }

    const params = [id];
    let where = `WHERE m.group_id = $1`;
    if (before) {
      params.push(before);
      where += ` AND m.created_at < $2`;
    }
    params.push(limit);

    const result = await query(
      `${MESSAGE_SELECT} ${where} ORDER BY m.created_at DESC LIMIT $${params.length}`,
      params
    );

    // Atenuar mensajes de usuarios bloqueados por el solicitante:
    // se mantienen en el hilo (contexto) pero sin contenido ni media.
    const blocked = await blockedIdsOf(req.user.id);
    const messages = result.rows
      .map((r) => {
        const msg = publicMessage(r, id);
        if (blocked.has(msg.userId) && !msg.deleted) {
          return { ...msg, content: null, mediaUrl: null, mediaType: null, metadata: null, blocked: true };
        }
        return msg;
      })
      .reverse();

    return res.json({
      messages,
      hasMore: result.rows.length === limit,
      // Cursor para pedir la página anterior (mensajes más antiguos)
      nextBefore: result.rows.length ? result.rows[result.rows.length - 1].created_at : null,
    });
  } catch (err) {
    console.error('Error en listMessages:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// POST /api/v1/groups/:id/messages
// Mensaje de texto. body: { content, metadata? }
// ─────────────────────────────────────────────
export async function sendMessage(req, res) {
  const { id } = req.params;
  const { content, metadata } = req.body || {};

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: { message: 'content es obligatorio', status: 400 } });
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return res.status(400).json({ error: { message: `content supera el máximo de ${MAX_CONTENT_LENGTH} caracteres`, status: 400 } });
  }

  try {
    const member = await getMembership(req.user.id, id);
    if (!member) {
      return res.status(403).json({ error: { message: 'No eres miembro de este grupo', status: 403 } });
    }

    const encrypted = encryptMessage(id, content.trim());

    const result = await query(
      `INSERT INTO group_messages (group_id, user_id, content_encrypted, message_type, metadata)
       VALUES ($1, $2, $3, 'text', $4)
       RETURNING id, created_at`,
      [id, req.user.id, encrypted, metadata ?? null]
    );

    const full = await query(`${MESSAGE_SELECT} WHERE m.id = $1`, [result.rows[0].id]);
    const message = publicMessage(full.rows[0], id);

    emitToGroup(id, 'group:message', message);
    // Best-effort: sin contenido del mensaje (privacidad — va cifrado en BD)
    notifyGroupMessage({ groupId: id, senderId: req.user.id, senderPseudonym: message.pseudonym })
      .catch((e) => console.error('  [notify] group_message:', e.message));

    return res.status(201).json({ message });
  } catch (err) {
    console.error('Error en sendMessage:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// POST /api/v1/groups/:id/messages/media
// Mensaje con archivo. multipart: media=<file>, content?=<caption>
// message_type = image | video | audio según el mimetype.
// ─────────────────────────────────────────────
export async function sendMediaMessage(req, res) {
  const { id } = req.params;
  const caption = (req.body?.content || '').trim();

  if (!req.file) {
    return res.status(400).json({ error: { message: 'Falta el archivo (campo "media")', status: 400 } });
  }
  if (caption.length > MAX_CONTENT_LENGTH) {
    return res.status(400).json({ error: { message: `content supera el máximo de ${MAX_CONTENT_LENGTH} caracteres`, status: 400 } });
  }

  try {
    const member = await getMembership(req.user.id, id);
    if (!member) {
      return res.status(403).json({ error: { message: 'No eres miembro de este grupo', status: 403 } });
    }

    const { url, kind } = await processAndStoreChatMedia(req.file, id);
    const encrypted = encryptMessage(id, caption);

    const result = await query(
      `INSERT INTO group_messages (group_id, user_id, content_encrypted, message_type, media_url, media_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [id, req.user.id, encrypted, kind, url, req.file.mimetype]
    );

    const full = await query(`${MESSAGE_SELECT} WHERE m.id = $1`, [result.rows[0].id]);
    const message = publicMessage(full.rows[0], id);

    emitToGroup(id, 'group:message', message);
    notifyGroupMessage({ groupId: id, senderId: req.user.id, senderPseudonym: message.pseudonym })
      .catch((e) => console.error('  [notify] group_message:', e.message));

    return res.status(201).json({ message });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: { message: err.message, status: 400 } });
    }
    console.error('Error en sendMediaMessage:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}

// ─────────────────────────────────────────────
// DELETE /api/v1/groups/:id/messages/:messageId
// Soft delete. Puede: el autor, o un owner/moderator del grupo.
// La media asociada se borra del storage (ya no es accesible).
// ─────────────────────────────────────────────
export async function deleteMessage(req, res) {
  const { id, messageId } = req.params;

  try {
    const member = await getMembership(req.user.id, id);
    if (!member) {
      return res.status(403).json({ error: { message: 'No eres miembro de este grupo', status: 403 } });
    }

    const result = await query(
      `SELECT user_id, media_url, deleted_at FROM group_messages
       WHERE id = $1 AND group_id = $2`,
      [messageId, id]
    );
    const msg = result.rows[0];
    if (!msg) {
      return res.status(404).json({ error: { message: 'Mensaje no encontrado', status: 404 } });
    }
    if (msg.deleted_at) {
      return res.status(409).json({ error: { message: 'El mensaje ya está borrado', status: 409 } });
    }

    const isAuthor = msg.user_id === req.user.id;
    const isAdmin  = ['owner', 'moderator'].includes(member.role);
    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ error: { message: 'No puedes borrar este mensaje', status: 403 } });
    }

    await query(`UPDATE group_messages SET deleted_at = NOW() WHERE id = $1`, [messageId]);

    // Borrar la media del storage (best-effort)
    if (msg.media_url) {
      const key = keyFromUrl(msg.media_url);
      if (key) storage.delete(key).catch((e) => console.error('  [chat media] no se pudo borrar:', e.message));
    }

    emitToGroup(id, 'group:message_deleted', { groupId: id, messageId });

    return res.status(204).send();
  } catch (err) {
    console.error('Error en deleteMessage:', err);
    return res.status(500).json({ error: { message: 'Error interno', status: 500 } });
  }
}
