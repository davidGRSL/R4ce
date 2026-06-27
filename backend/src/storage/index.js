/**
 * Capa de almacenamiento abstracta.
 * Elige el driver según STORAGE_DRIVER (local | r2).
 *
 * Todos los drivers exponen la misma interfaz:
 *   save(buffer, key, contentType) → Promise<url>
 *   delete(key)                    → Promise<void>
 *   url(key)                       → string
 *
 * Migrar de local a producción = cambiar STORAGE_DRIVER=r2 y poner
 * las credenciales R2 en .env. No hay que tocar ningún controlador.
 */
import { localDriver } from './local.js';
import { r2Driver } from './r2.js';

const DRIVER = process.env.STORAGE_DRIVER === 'r2' ? r2Driver : localDriver;

console.log(`  [storage] driver activo: ${process.env.STORAGE_DRIVER === 'r2' ? 'r2' : 'local'}`);

export const storage = {
  save:   (buffer, key, contentType) => DRIVER.save(buffer, key, contentType),
  delete: (key) => DRIVER.delete(key),
  url:    (key) => DRIVER.url(key),
};
