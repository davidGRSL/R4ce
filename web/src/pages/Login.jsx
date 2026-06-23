import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { saveSession, isAuthenticated } from '../lib/auth.js';

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  if (isAuthenticated()) {
    navigate('/', { replace: true });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { username, password });
      saveSession(data);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Error al iniciar sesión');
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
          <div className="border-l-2 border-rally pl-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-paper/40">
              Tramo · Última actualización
            </p>
            <p className="font-display text-2xl font-semibold mt-1">El Pinar — Etapa 3</p>
            <p className="font-mono text-xs text-paper/60 mt-1">1:38.540 · Líder: Piloto1</p>
          </div>
          <p className="text-sm text-paper/60 max-w-sm">
            Gestiona tramos, revisa rankings y analiza recorridos GPS de tus carreras.
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
            <p className="eyebrow mb-2">Acceso</p>
            <h1 className="text-3xl font-bold">Inicia sesión</h1>
            <p className="text-sm text-ink/60 mt-2">
              Introduce tus credenciales para acceder al panel.
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
                placeholder="testuser"
                autoComplete="username"
                required
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
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          {error && (
            <div className="border border-rally bg-rally/5 p-3 text-sm text-rally font-mono">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn w-full justify-center disabled:opacity-50">
            {loading ? 'Verificando…' : 'Entrar'}
          </button>

          <p className="text-xs text-ink/50 font-mono">
            ¿Aún no tienes cuenta? Regístrate desde la app móvil.
          </p>
        </form>
      </div>
    </div>
  );
}
