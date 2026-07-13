/**
 * Socket.io centralizado — auth JWT + rooms de grupo.
 *
 * Diseño: el envío de mensajes NO va por socket, va por REST
 * (POST /groups/:id/messages), que persiste y luego emite a la room.
 * El socket solo sirve para: unirse/salir de rooms, recibir eventos
 * en tiempo real y el indicador de "escribiendo".
 *
 * Eventos servidor → cliente:
 *   group:message          nuevo mensaje (payload público completo)
 *   group:message_deleted  { groupId, messageId }
 *   group:typing           { groupId, userId, pseudonym }
 *   group:member_change    { groupId } (join/kick/rol: recargar miembros)
 *
 * Eventos cliente → servidor:
 *   group:join   (groupId, ack)  — verifica membresía en BD
 *   group:leave  (groupId)
 *   group:typing (groupId)
 */
import { Server as SocketIOServer } from 'socket.io';
import { verifyAccessToken } from './utils/jwt.js';
import { query } from './db/pool.js';

let io = null;

export function initSocket(httpServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: [process.env.WEB_URL, process.env.MOBILE_URL].filter(Boolean),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 1e6, // 1MB: los archivos van por REST, no por socket
  });

  // Auth: el cliente manda el access token en handshake.auth.token
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Token requerido'));
      const payload = verifyAccessToken(token);
      socket.user = { id: payload.sub, username: payload.username };
      next();
    } catch {
      next(new Error('Token inválido o expirado'));
    }
  });

  io.on('connection', (socket) => {
    // Room personal: para notificaciones dirigidas a este usuario
    socket.join(`user_${socket.user.id}`);

    // Unirse a la room de un grupo (solo miembros)
    socket.on('group:join', async (groupId, ack) => {
      try {
        const result = await query(
          `SELECT role FROM group_members WHERE user_id = $1 AND group_id = $2`,
          [socket.user.id, groupId]
        );
        if (!result.rows[0]) {
          return typeof ack === 'function' && ack({ ok: false, error: 'No eres miembro de este grupo' });
        }
        socket.join(`group_${groupId}`);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        console.error('[socket] group:join error:', err.message);
        if (typeof ack === 'function') ack({ ok: false, error: 'Error interno' });
      }
    });

    socket.on('group:leave', (groupId) => {
      socket.leave(`group_${groupId}`);
    });

    // Indicador de escribiendo — passthrough, sin persistencia
    socket.on('group:typing', async (groupId, pseudonym) => {
      // Solo reemitir si está en la room (ya validado en join)
      if (socket.rooms.has(`group_${groupId}`)) {
        socket.to(`group_${groupId}`).emit('group:typing', {
          groupId,
          userId: socket.user.id,
          pseudonym: pseudonym || socket.user.username,
        });
      }
    });

    socket.on('error', (error) => {
      console.error(`[socket] error en ${socket.id}:`, error);
    });
  });

  return io;
}

/** Acceso al io desde controladores (emitir tras persistir). */
export function getIO() {
  return io;
}

/** Emite un evento a la room de un grupo. No falla si io no está listo. */
export function emitToGroup(groupId, event, payload) {
  if (io) io.to(`group_${groupId}`).emit(event, payload);
}

/** Emite un evento a todas las sesiones de un usuario concreto. */
export function emitToUser(userId, event, payload) {
  if (io) io.to(`user_${userId}`).emit(event, payload);
}
