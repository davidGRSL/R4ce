import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import axios from 'axios';

/**
 * /verify?token=… — destino del enlace del email de verificación.
 * Pública (el usuario puede abrirla desde cualquier dispositivo), por eso
 * usa axios directo en vez del cliente autenticado.
 */
export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState('working'); // working | ok | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setState('error');
      setMessage('Falta el token de verificación en el enlace.');
      return;
    }
    axios.post('/api/v1/auth/verify', { token })
      .then(() => setState('ok'))
      .catch((err) => {
        setState('error');
        setMessage(err.response?.data?.error?.message || 'No se pudo verificar el email.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper p-6">
      <div className="max-w-sm w-full border border-ink/10 p-8 text-center space-y-4">
        <p className="font-display text-3xl font-bold tracking-tighter italic">R4ce</p>

        {state === 'working' && (
          <p className="font-mono text-sm text-ink/50">Verificando tu email…</p>
        )}

        {state === 'ok' && (
          <>
            <CheckCircle2 size={40} className="mx-auto text-forest" />
            <p className="font-bold text-xl">Email verificado</p>
            <p className="text-sm text-ink/60">
              Tu cuenta está verificada. Ya puedes publicar tramos y tiempos públicos.
            </p>
            <Link to="/" className="btn inline-flex justify-center px-6 py-3">Entrar en R4ce</Link>
          </>
        )}

        {state === 'error' && (
          <>
            <XCircle size={40} className="mx-auto text-rally" />
            <p className="font-bold text-xl">No se pudo verificar</p>
            <p className="text-sm text-ink/60">{message}</p>
            <Link to="/profile" className="text-xs font-mono uppercase tracking-widest text-rally underline">
              Solicitar un enlace nuevo desde el perfil
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
