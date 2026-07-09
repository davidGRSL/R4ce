/**
 * Subida y procesamiento de imágenes.
 *   multer (memoria) → sharp (resize + webp) → storage.save()
 *
 * No escribe nada a disco temporal: el archivo vive en memoria hasta que
 * sharp lo procesa y storage lo guarda. Límite 8MB de entrada.
 */
import multer from 'multer';
import sharp from 'sharp';
import crypto from 'crypto';
import { storage } from '../storage/index.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp)$/i.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato no soportado. Usa JPG, PNG o WEBP.'));
    }
  },
});

// Espera un campo de formulario llamado "image"
export const uploadSingle = upload.single('image');

// ── Modelos 3D (.glb) ─────────────────────────
// Se guardan tal cual (sin procesar). Límite 30MB.
const uploadModel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isGlb =
      /\.glb$/i.test(file.originalname) ||
      /^model\/gltf-binary$/i.test(file.mimetype);
    if (isGlb) cb(null, true);
    else cb(new Error('Formato no soportado. Sube un modelo 3D en formato .glb'));
  },
});

// Espera un campo de formulario llamado "model"
export const uploadModelSingle = uploadModel.single('model');

/** Guarda un modelo 3D .glb sin procesar. @returns { url, key } */
export async function storeModel(buffer) {
  const key = `models/${crypto.randomUUID()}.glb`;
  const url = await storage.save(buffer, key, 'model/gltf-binary');
  return { url, key };
}

/**
 * Procesa el buffer con sharp y lo guarda.
 * @param buffer  - req.file.buffer
 * @param opts    - { folder, width, height }
 * @returns { url, key }
 */
export async function processAndStore(buffer, { folder, width, height }) {
  const out = await sharp(buffer)
    .rotate()                                       // respeta orientación EXIF
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .webp({ quality: 82 })
    .toBuffer();

  const key = `${folder}/${crypto.randomUUID()}.webp`;
  const url = await storage.save(out, key, 'image/webp');
  return { url, key };
}

// ── Media de chat (imagen / vídeo / audio) ───
// Imágenes: se procesan con sharp (webp, máx 1600px de lado).
// Vídeo y audio: se guardan tal cual (transcodificar requeriría ffmpeg).
const CHAT_MEDIA_TYPES = {
  image: /^image\/(jpeg|jpg|png|webp|gif)$/i,
  video: /^video\/(mp4|webm|quicktime)$/i,
  audio: /^audio\/(webm|ogg|mpeg|mp3|mp4|m4a|x-m4a|wav|aac)$/i,
};

const CHAT_MEDIA_LIMITS = {
  image: 8  * 1024 * 1024,   //  8MB
  video: 50 * 1024 * 1024,   // 50MB
  audio: 15 * 1024 * 1024,   // 15MB
};

export function chatMediaKind(mimetype) {
  for (const [kind, re] of Object.entries(CHAT_MEDIA_TYPES)) {
    if (re.test(mimetype)) return kind;
  }
  return null;
}

const uploadChatMedia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // techo global; por tipo se valida después
  fileFilter: (_req, file, cb) => {
    if (chatMediaKind(file.mimetype)) cb(null, true);
    else cb(new Error('Formato no soportado. Imagen (JPG/PNG/WEBP/GIF), vídeo (MP4/WEBM) o audio (WEBM/OGG/MP3/M4A/WAV).'));
  },
});

// Espera un campo de formulario llamado "media"
export const uploadChatMediaSingle = uploadChatMedia.single('media');

const CHAT_MEDIA_EXT = {
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
  'audio/mp4': 'm4a', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/aac': 'aac',
};

/**
 * Guarda media de chat. Imágenes → sharp webp; vídeo/audio → tal cual.
 * @returns { url, key, kind }  — kind: image|video|audio
 * @throws Error con .status=400 si supera el límite por tipo
 */
export async function processAndStoreChatMedia(file, groupId) {
  const kind = chatMediaKind(file.mimetype);
  if (!kind) {
    const err = new Error('Formato no soportado');
    err.status = 400;
    throw err;
  }
  if (file.size > CHAT_MEDIA_LIMITS[kind]) {
    const err = new Error(`El archivo supera el límite de ${Math.round(CHAT_MEDIA_LIMITS[kind] / 1024 / 1024)}MB para ${kind}`);
    err.status = 400;
    throw err;
  }

  if (kind === 'image') {
    const out = await sharp(file.buffer, { animated: /gif/i.test(file.mimetype) })
      .rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    const key = `chat/${groupId}/${crypto.randomUUID()}.webp`;
    const url = await storage.save(out, key, 'image/webp');
    return { url, key, kind };
  }

  const ext = CHAT_MEDIA_EXT[file.mimetype.toLowerCase()] || 'bin';
  const key = `chat/${groupId}/${crypto.randomUUID()}.${ext}`;
  const url = await storage.save(file.buffer, key, file.mimetype);
  return { url, key, kind };
}

// Extrae la "key" de una URL guardada (para poder borrar el archivo viejo)
export function keyFromUrl(url) {
  if (!url) return null;
  // local: /uploads/avatars/uuid.webp  → avatars/uuid.webp
  // r2:    https://media.x.com/avatars/uuid.webp → avatars/uuid.webp
  const marker = '/uploads/';
  if (url.includes(marker)) return url.split(marker)[1];
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, '');
  } catch {
    return null;
  }
}
