/**
 * Push nativo (FCM — cubre Android y, con el certificado APNs subido a
 * Firebase, también iOS). Fail-soft:
 *   - Sin FIREBASE_SERVICE_ACCOUNT en env → no-op silencioso (la app web
 *     y las notificaciones por socket siguen funcionando igual).
 *   - Con credenciales → envía a todos los dispositivos del usuario y
 *     poda los tokens inválidos (app desinstalada).
 *
 * FIREBASE_SERVICE_ACCOUNT = JSON del service account (una sola línea)
 * o ruta a un archivo .json montado en el contenedor.
 */
import { query } from '../db/pool.js';

let messaging = null;
let initTried = false;

async function getMessaging() {
  if (initTried) return messaging;
  initTried = true;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.log('  [push] FIREBASE_SERVICE_ACCOUNT no configurado — push nativo desactivado');
    return null;
  }

  try {
    // Import dinámico: firebase-admin solo se carga si hay credenciales
    const admin = (await import('firebase-admin')).default;
    const credential = raw.trim().startsWith('{')
      ? admin.credential.cert(JSON.parse(raw))
      : admin.credential.cert(raw); // ruta a archivo

    admin.initializeApp({ credential });
    messaging = admin.messaging();
    console.log('  [push] Firebase inicializado — push nativo activo');
  } catch (err) {
    console.error('  [push] no se pudo inicializar Firebase:', err.message);
  }
  return messaging;
}

/**
 * Envía una notificación push a todos los dispositivos de un usuario.
 * data.route permite que al tocarla la app navegue a la pantalla correcta.
 */
export async function sendPushToUser(userId, { title, body, route }) {
  const fcm = await getMessaging();
  if (!fcm) return;

  try {
    const result = await query(`SELECT token FROM push_tokens WHERE user_id = $1`, [userId]);
    const tokens = result.rows.map((r) => r.token);
    if (tokens.length === 0) return;

    const responses = await fcm.sendEachForMulticast({
      tokens,
      notification: { title, body: body || undefined },
      data: route ? { route } : {},
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });

    // Podar tokens muertos (dispositivo desinstalado / token rotado)
    const dead = [];
    responses.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token') {
        dead.push(tokens[i]);
      }
    });
    if (dead.length > 0) {
      await query(`DELETE FROM push_tokens WHERE token = ANY($1)`, [dead]);
    }
  } catch (err) {
    console.error('  [push] envío falló:', err.message);
  }
}
