/**
 * Driver de almacenamiento local.
 * Guarda en el sistema de archivos (volumen Docker persistente).
 * Para desarrollo. Las imágenes se sirven como estáticos desde Express.
 */
import fs from 'fs/promises';
import path from 'path';

const UPLOAD_DIR  = process.env.UPLOAD_DIR  || '/app/uploads';
const PUBLIC_BASE = process.env.UPLOAD_PUBLIC_URL || '/uploads';

export const localDriver = {
  async save(buffer, key, _contentType) {
    const filePath = path.join(UPLOAD_DIR, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    return `${PUBLIC_BASE}/${key}`;
  },

  async delete(key) {
    try {
      await fs.unlink(path.join(UPLOAD_DIR, key));
    } catch {
      // Si no existe, ignorar
    }
  },

  url(key) {
    return `${PUBLIC_BASE}/${key}`;
  },
};
