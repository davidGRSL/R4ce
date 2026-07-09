/**
 * Cliente Socket.io — singleton perezoso.
 *
 * Conecta al mismo origen (Vite proxy /socket.io → backend) mandando el
 * access token en handshake.auth. Si el token caduca, socket.io reintenta
 * la conexión y volvemos a leer el token vigente en cada intento.
 */
import { io } from 'socket.io-client';
import { getAccessToken } from './auth.js';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io('/', {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: getAccessToken() }),
    });
  }
  if (!socket.connected) socket.connect();
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
