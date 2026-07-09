/**
 * Cifrado de mensajes de chat — AES-256-GCM con clave por grupo.
 *
 * La clave de cada grupo se deriva con HKDF-SHA256 a partir de una clave
 * maestra (CHAT_MASTER_KEY en env) usando el groupId como "info". Así:
 *   - No hay que guardar claves por grupo en la BD.
 *   - Comprometer la BD sin la env var no expone los mensajes.
 *   - Rotar CHAT_MASTER_KEY invalida el histórico (aviso: no rotar a la ligera).
 *
 * Formato almacenado (base64): [ iv (12B) | authTag (16B) | ciphertext ]
 * con el prefijo "v1:" para permitir migrar de esquema en el futuro.
 */
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const MASTER_KEY = process.env.CHAT_MASTER_KEY || process.env.JWT_SECRET;

if (!MASTER_KEY) {
  throw new Error('Falta CHAT_MASTER_KEY (o JWT_SECRET como fallback) en las variables de entorno');
}

// Cache de claves derivadas: derivar HKDF en cada mensaje sería un
// desperdicio; la clave de un grupo no cambia.
const keyCache = new Map();

function groupKey(groupId) {
  let key = keyCache.get(groupId);
  if (!key) {
    key = Buffer.from(
      crypto.hkdfSync('sha256', Buffer.from(MASTER_KEY), Buffer.alloc(0), `r4ce:group:${groupId}`, 32)
    );
    keyCache.set(groupId, key);
  }
  return key;
}

/** Cifra texto plano → string "v1:<base64>" para guardar en content_encrypted. */
export function encryptMessage(groupId, plaintext) {
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', groupKey(groupId), iv);
  const enc    = Buffer.concat([cipher.update(String(plaintext ?? ''), 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `v1:${Buffer.concat([iv, tag, enc]).toString('base64')}`;
}

/** Descifra content_encrypted → texto plano. Devuelve null si no se puede descifrar. */
export function decryptMessage(groupId, payload) {
  if (payload == null) return null;
  try {
    if (!payload.startsWith('v1:')) return payload; // mensajes antiguos sin cifrar
    const buf      = Buffer.from(payload.slice(3), 'base64');
    const iv       = buf.subarray(0, 12);
    const tag      = buf.subarray(12, 28);
    const enc      = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', groupKey(groupId), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    // Clave rotada o dato corrupto: no romper el listado del chat.
    return null;
  }
}
