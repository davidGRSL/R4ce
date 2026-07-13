import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { saveSession, isAuthenticated } from '../lib/auth.js';

// Mismas reglas que backend/src/utils/validators.js
const USERNAME_RE = /^[a-zA-Z0-9_]{3,50}$/;

export default function Register() {
  const navigate = useNavigate();
  const [username,   setUsername]   = useState('');
  const [pseudonym,  setPseudonym]  = useState('');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [confirm,    setConfirm]    = useState('');
  const [tosAccepted, setTosAccepted] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  if (isAuthenticated()) {
    navigate('/', { replace: true });
  }

  // Validación local espejo del backend: evita un viaje al servidor
  // para errores obvios. El servidor sigue siendo la autoridad final.
  function localError() {
    if (!USERNAME_RE.test(username)) {
      return 'El usuario debe tener entre 3 y 50 caracteres: solo letras, números y guion bajo.';
    }
    if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (password.length > 72) return 'La contraseña no puede superar 72 caracteres.';
    if (password !== confirm) return 'Las contraseñas no coinciden.';
    if (pseudonym.length > 50) return 'El nombre público no puede superar 50 caracteres.';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return 'El email no es válido.';
    if (!tosAccepted) return 'Debes aceptar los términos de uso y la política de privacidad.';
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const localErr = localError();
    if (localErr) {
      setError(localErr);
      return;
    }

    setLoading(true);
    try {
      const body = { username: username.trim(), password, tosAccepted };
      if (pseudonym.trim()) body.pseudonym = pseudonym.trim();
      if (email.trim())     body.email = email.trim();

      // El backend registra y auto-inicia sesión: devuelve
      // { user, accessToken, refreshToken } igual que /auth/login.
      const { data } = await api.post('/auth/register', body);
      saveSession(data);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'No se pudo crear la cuenta');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Lado izquierdo — branding */}
      <div className="hidden lg:flex bg-ink text-paper flex-col justify-between p-12">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-6xl font-bold tracking-tighter">R4ce</span>
          </div>
          <p className="font-mono text-xs text-paper/40 uppercase tracking-widest mt-2">
            Cronometraje de rally
          </p>
        </div>

        <div className="space-y-6">
          <div className="stripe-bar w-40" />
          <div className="border-l-2 border-rally pl-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-paper/40">
              Únete a la comunidad
            </p>
            <p className="font-display text-2xl font-semibold mt-1">Crea tu perfil de piloto</p>
            <p className="font-mono text-xs text-paper/60 mt-1">
              Corre tramos · registra tiempos · compite en rankings
            </p>
          </div>
          <p className="text-sm text-paper/60 max-w-sm">
            Crea tramos con rutas GPS, cronométrate contra el reloj y comparte
            tus mejores tiempos con tus grupos.
          </p>
        </div>

        <p className="font-mono text-[10px] text-paper/30 uppercase tracking-widest">
          v0.1 · build {new Date().getFullYear()}
        </p>
      </div>

      {/* Lado derecho — formulario */}
      <div className="flex items-center justify-center p-8">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6">
          <div>
            <p className="eyebrow mb-2">Registro</p>
            <h1 className="text-3xl font-bold">Crea tu cuenta</h1>
            <p className="text-sm text-ink/60 mt-2">
              Regístrate para crear tramos, guardar tiempos y competir.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="username">Usuario</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="tu_usuario"
                autoComplete="username"
                required
              />
              <p className="text-[11px] text-ink/40 font-mono mt-1">
                3–50 caracteres · letras, números y guion bajo.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="pseudonym">
                Nombre público <span className="text-ink/40 normal-case">(opcional)</span>
              </label>
              <input
                id="pseudonym"
                type="text"
                value={pseudonym}
                onChange={(e) => setPseudonym(e.target.value)}
                className="input"
                placeholder="Cómo apareces en el ranking"
                autoComplete="nickname"
                maxLength={50}
              />
            </div>

            <div>
              <label className="label" htmlFor="password">Contraseña</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
              <p className="text-[11px] text-ink/40 font-mono mt-1">
                Mínimo 8 caracteres.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="confirm">Confirmar contraseña</label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input"
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="email">
                Email <span className="text-ink/40 normal-case">(recomendado)</span>
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="tu@email.com"
                autoComplete="email"
              />
              <p className="text-[11px] text-ink/40 font-mono mt-1">
                Solo guardamos un hash, nunca tu dirección. Sirve para verificar
                la cuenta y publicar contenido público.
              </p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={tosAccepted}
                onChange={(e) => setTosAccepted(e.target.checked)}
                className="mt-0.5 accent-[#e63946]"
                required
              />
              <span className="text-xs text-ink/60">
                He leído y acepto los{' '}
                <Link to="/legal/terminos" target="_blank" className="text-rally hover:underline">términos de uso</Link>
                {' '}y la{' '}
                <Link to="/legal/privacidad" target="_blank" className="text-rally hover:underline">política de privacidad</Link>,
                incluida la tolerancia cero con el contenido abusivo.
              </span>
            </label>
          </div>

          {error && (
            <div className="border border-rally bg-rally/5 p-3 text-sm text-rally font-mono">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn w-full justify-center disabled:opacity-50">
            {loading ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>

          <p className="text-xs text-ink/50 font-mono">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="text-rally hover:underline">Inicia sesión</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
