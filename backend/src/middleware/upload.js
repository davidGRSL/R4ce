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
