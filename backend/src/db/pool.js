import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Pool de conexiones a PostgreSQL.
// En Docker, DB_HOST = "postgres" (nombre del servicio en docker-compose).
// En local sin Docker, DB_HOST = "localhost".
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'rally_user',
  password: process.env.DB_PASSWORD || 'rally_pass_dev',
  database: process.env.DB_NAME || 'rally_db',
  max: 20,                      // máximo de clientes simultáneos en el pool
  idleTimeoutMillis: 30000,     // cierra clientes inactivos tras 30s
  connectionTimeoutMillis: 5000 // falla si no conecta en 5s
});

// Log de errores inesperados en clientes ya entregados al pool
// (evita que un error tumbe el proceso completo de Node)
pool.on('error', (err) => {
  console.error('✗ Error inesperado en cliente PostgreSQL inactivo:', err);
});

/**
 * Helper de queries con logging en desarrollo.
 * Uso: const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
 */
export async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);

  if (process.env.NODE_ENV === 'development') {
    const duration = Date.now() - start;
    console.log('  [db]', { text, duration: `${duration}ms`, rows: result.rowCount });
  }

  return result;
}

/**
 * Para transacciones: entrega un cliente dedicado del pool.
 * Importante: el llamador SIEMPRE debe hacer client.release() en un finally.
 * Uso:
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     ...
 *     await client.query('COMMIT');
 *   } catch (e) {
 *     await client.query('ROLLBACK');
 *     throw e;
 *   } finally {
 *     client.release();
 *   }
 */
export async function getClient() {
  const client = await pool.connect();
  return client;
}

/**
 * Comprueba la conexión a la base de datos. Útil al arrancar el servidor
 * para fallar rápido si la BD no está disponible en lugar de descubrirlo
 * en la primera query de un usuario.
 */
export async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW() as now, version() as version');
    console.log(`✓ PostgreSQL conectado — ${result.rows[0].now.toISOString()}`);
    return true;
  } catch (err) {
    console.error('✗ No se pudo conectar a PostgreSQL:', err.message);
    return false;
  }
}

export default pool;
