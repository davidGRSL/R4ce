// Validación manual y ligera (sin librería externa) para los inputs de auth.
// Si el proyecto crece, esto es un buen candidato a migrar a "zod" o "joi".

const USERNAME_RE = /^[a-zA-Z0-9_]{3,50}$/;

/**
 * @param {string} username
 * @returns {string|null} mensaje de error, o null si es válido
 */
export function validateUsername(username) {
  if (typeof username !== 'string') return 'username es obligatorio';
  if (!USERNAME_RE.test(username)) {
    return 'username debe tener entre 3 y 50 caracteres: solo letras, números y guion bajo';
  }
  return null;
}

/**
 * @param {string} password
 * @returns {string|null} mensaje de error, o null si es válido
 */
export function validatePassword(password) {
  if (typeof password !== 'string') return 'password es obligatorio';
  if (password.length < 8) return 'password debe tener al menos 8 caracteres';
  if (password.length > 72) {
    // bcrypt ignora silenciosamente cualquier byte después del 72,
    // así que límite explícito para que el usuario no se confíe.
    return 'password no puede superar 72 caracteres';
  }
  return null;
}

/**
 * @param {string} pseudonym
 * @returns {string|null} mensaje de error, o null si es válido (campo opcional)
 */
export function validatePseudonym(pseudonym) {
  if (pseudonym === undefined || pseudonym === null || pseudonym === '') return null;
  if (typeof pseudonym !== 'string' || pseudonym.length > 50) {
    return 'pseudonym no puede superar 50 caracteres';
  }
  return null;
}
