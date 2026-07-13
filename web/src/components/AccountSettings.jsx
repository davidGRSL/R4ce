import { useEffect, useState } from 'react';
import { Mail, ShieldOff, Trash2, CheckCircle2, X, Crown } from 'lucide-react';
import { api } from '../lib/api.js';
import { clearTokens, getUser } from '../lib/auth.js';
import { disconnectSocket } from '../lib/socket.js';

const ROLE_LABEL = { admin: 'Administrador', premium: 'Premium', user: 'Piloto' };

/**
 * Sección "Cuenta" del perfil: verificación de email, usuarios bloqueados
 * y zona de peligro (borrado de cuenta). Requisitos de stores A2/A3/A5.
 * props: profile — respuesta de GET /profile (incluye role, emailVerified, hasEmail)
 */
export default function AccountSettings({ profile }) {
  // ── Email / verificación ──
  const [email,     setEmail]     = useState('');
  const [emailMsg,  setEmailMsg]  = useState(null);
  const [emailBusy, setEmailBusy] = useState(false);

  // ── Bloqueados ──
  const [blocked, setBlocked] = useState([]);

  // ── Borrado de cuenta ──
  const [showDelete,  setShowDelete]  = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [password,    setPassword]    = useState('');
  const [deleteError, setDeleteError] = useState(null);
  const [deleting,    setDeleting]    = useState(false);

  const username = getUser()?.username || profile?.username;

  useEffect(() => {
    api.get('/users/blocked')
      .then(({ data }) => setBlocked(data.blocked || []))
      .catch(() => {});
  }, []);

  async function sendVerification(e) {
    e.preventDefault();
    if (!email.trim() || emailBusy) return;
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      const { data } = await api.post('/auth/email', { email: email.trim() });
      setEmailMsg({ ok: true, text: data.message });
      setEmail('');
    } catch (err) {
      setEmailMsg({ ok: false, text: err.response?.data?.error?.message || 'No se pudo enviar' });
    } finally {
      setEmailBusy(false);
    }
  }

  async function unblock(userId) {
    try {
      await api.delete(`/users/${userId}/block`);
      setBlocked((prev) => prev.filter((b) => b.userId !== userId));
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteAccount(e) {
    e.preventDefault();
    if (confirmName !== username || !password || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete('/profile', { data: { password } });
      disconnectSocket();
      clearTokens();
      window.location.href = '/login';
    } catch (err) {
      setDeleteError(err.response?.data?.error?.message || 'No se pudo borrar la cuenta');
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Rol */}
      <div className="border border-ink/10 p-4 flex items-center gap-3">
        <Crown size={16} className={profile?.role === 'premium' ? 'text-signal' : profile?.role === 'admin' ? 'text-rally' : 'text-ink/30'} />
        <div className="flex-1">
          <p className="text-[10px] font-mono uppercase tracking-widest text-ink/40">Tipo de cuenta</p>
          <p className="text-sm font-medium">{ROLE_LABEL[profile?.role] || 'Piloto'}</p>
        </div>
      </div>

      {/* Verificación de email */}
      <div className="border border-ink/10 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Mail size={15} className="text-ink/50" />
          <p className="text-[10px] font-mono uppercase tracking-widest text-ink/40">Email</p>
          {profile?.emailVerified && (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-forest ml-auto">
              <CheckCircle2 size={12} /> VERIFICADO
            </span>
          )}
        </div>

        {profile?.emailVerified ? (
          <p className="text-xs text-ink/50">
            Tu cuenta está verificada. Solo guardamos un hash de tu dirección, nunca el email.
          </p>
        ) : (
          <>
            <p className="text-xs text-ink/50 mb-3">
              {profile?.hasEmail
                ? 'Tienes un email pendiente de verificar. Revisa tu bandeja o solicita un enlace nuevo.'
                : 'Añade un email para verificar tu cuenta. Solo guardamos un hash, nunca la dirección.'}
            </p>
            <form onSubmit={sendVerification} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="input flex-1"
              />
              <button
                type="submit"
                disabled={!email.trim() || emailBusy}
                className="px-4 py-2 bg-ink text-paper text-xs font-mono uppercase tracking-widest disabled:opacity-40 shrink-0"
              >
                {emailBusy ? 'Enviando…' : 'Verificar'}
              </button>
            </form>
            {emailMsg && (
              <p className={`text-xs font-mono mt-2 ${emailMsg.ok ? 'text-forest' : 'text-rally'}`}>
                {emailMsg.text}
              </p>
            )}
          </>
        )}
      </div>

      {/* Usuarios bloqueados */}
      <div className="border border-ink/10 p-4">
        <div className="flex items-center gap-2 mb-2">
          <ShieldOff size={15} className="text-ink/50" />
          <p className="text-[10px] font-mono uppercase tracking-widest text-ink/40">
            Usuarios bloqueados ({blocked.length})
          </p>
        </div>
        {blocked.length === 0 ? (
          <p className="text-xs text-ink/50">No has bloqueado a nadie.</p>
        ) : (
          <ul className="divide-y divide-ink/5">
            {blocked.map((b) => (
              <li key={b.userId} className="flex items-center gap-2 py-2">
                <span className="text-sm flex-1 truncate">{b.pseudonym}</span>
                <button
                  onClick={() => unblock(b.userId)}
                  className="text-[10px] font-mono uppercase tracking-widest text-ink/50 hover:text-ink border border-ink/15 hover:border-ink px-2 py-1 transition-colors"
                >
                  Desbloquear
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Zona de peligro */}
      <div className="border border-rally/30 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Trash2 size={15} className="text-rally" />
          <p className="text-[10px] font-mono uppercase tracking-widest text-rally/70">Zona de peligro</p>
        </div>

        {!showDelete ? (
          <>
            <p className="text-xs text-ink/50 mb-3">
              Borra tu cuenta y todos tus datos: tiempos, tramos, vehículos, mensajes
              y los grupos que hayas creado. Esta acción no se puede deshacer.
            </p>
            <button
              onClick={() => setShowDelete(true)}
              className="text-xs font-mono uppercase tracking-widest text-rally border border-rally/40 hover:bg-rally/5 px-3 py-2 transition-colors"
            >
              Borrar mi cuenta
            </button>
          </>
        ) : (
          <form onSubmit={deleteAccount} className="space-y-3">
            <p className="text-xs text-ink/60">
              Escribe tu usuario (<code className="font-mono">{username}</code>) y tu
              contraseña para confirmar el borrado definitivo.
            </p>
            <input
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={username}
              className="input"
              autoComplete="off"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              className="input"
              autoComplete="current-password"
            />
            {deleteError && <p className="text-rally text-xs font-mono">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={confirmName !== username || !password || deleting}
                className="flex-1 py-2.5 bg-rally text-white text-xs font-mono uppercase tracking-widest disabled:opacity-40"
              >
                {deleting ? 'Borrando…' : 'Borrar definitivamente'}
              </button>
              <button
                type="button"
                onClick={() => { setShowDelete(false); setPassword(''); setConfirmName(''); setDeleteError(null); }}
                className="px-3 border border-ink/20 text-ink/60"
              >
                <X size={14} />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
