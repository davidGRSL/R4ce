/**
 * Driver de almacenamiento Cloudflare R2 (compatible S3).
 * Para producción. Egress gratuito.
 *
 * Variables de entorno necesarias (en .env, NO commitear):
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET
 *   R2_PUBLIC_URL        (ej. https://media.tudominio.com)
 *
 * El cliente S3 solo se instancia si el driver se usa de verdad,
 * para no obligar a tener credenciales en desarrollo con driver local.
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

let _client = null;
function client() {
  if (!_client) {
    _client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:     process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return _client;
}

const BUCKET = () => process.env.R2_BUCKET;
const PUBLIC = () => process.env.R2_PUBLIC_URL;

export const r2Driver = {
  async save(buffer, key, contentType) {
    await client().send(new PutObjectCommand({
      Bucket:       BUCKET(),
      Key:          key,
      Body:         buffer,
      ContentType:  contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    return `${PUBLIC()}/${key}`;
  },

  async delete(key) {
    try {
      await client().send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }));
    } catch {
      // ignorar
    }
  },

  url(key) {
    return `${PUBLIC()}/${key}`;
  },
};
