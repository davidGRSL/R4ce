import { useEffect, useState } from 'react';
import { ShieldAlert, Users, Megaphone, Search, Trash2, AlertTriangle, Check } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/format.js';

/**
 * Panel de administración (rol admin).
 * Pestañas: Denuncias (cola UGC, compromiso de revisión 24h),
 * Usuarios (roles: admin/user/premium) y Noticias (difusión).
 */
export default function Admin() {
  const [tab, setTab] = useState('reports');

  return (
    <div className="p-4 md:p-8 lg:p-12 max-w-4xl">
      <header className="mb-8">
        <p className="eyebrow">Administración</p>
        <h1 className="text-4xl font-bold mt-1">Panel de control</h1>
      </header>

      <div className="flex border border-ink/20 w-fit mb-8">
        <TabBtn active={tab === 'reports'} onClick={() => setTab('reports')} icon={ShieldAlert}>Denuncias</TabBtn>
        <TabBtn active={tab === 'users'}   onClick={() => setTab('users')}   icon={Users}>Usuarios</TabBtn>
        <TabBtn active={tab === 'news'}    onClick={() => setTab('news')}    icon={Megaphone}>Noticias</TabBtn>
      </div>

      {tab === 'reports' && <ReportsTab />}
      {tab === 'users'   && <UsersTab />}
      {tab === 'news'    && <NewsTab />}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-mono uppercase tracking-widest transition-colors
                  ${active ? 'bg-ink text-paper' : 'text-ink/60 hover:text-ink'}`}
    >
      <Icon size={13} /> {children}
    </button>
  );
}

// ─────────────────────────────────────────────
// Denuncias
// ─────────────────────────────────────────────
function ReportsTab() {
  const [status,  setStatus]  = useState('pending');
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load(s = status) {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/reports?status=${s}`);
      setReports(data.reports || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(status); /* eslint-disable-next-line */ }, [status]);

  async function resolve(id, action) {
    const note = action === 'warn_user'
      ? window.prompt('Texto del aviso al usuario (opcional):') ?? undefined
      : undefined;
    try {
      await api.post(`/admin/reports/${id}/resolve`, { action, note });
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      alert(err.response?.data?.error?.message || 'No se pudo resolver');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-mono text-ink/50 uppercase tracking-widest">
          Compromiso: revisión en &lt;24h
        </p>
        <div className="flex border border-ink/20">
          {['pending', 'resolved', 'dismissed'].map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest
                          ${status === s ? 'bg-ink text-paper' : 'text-ink/50'}`}
            >
              {s === 'pending' ? 'Pendientes' : s === 'resolved' ? 'Resueltas' : 'Desestimadas'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="font-mono text-sm text-ink/40">Cargando…</p>
      ) : reports.length === 0 ? (
        <div className="border border-dashed border-ink/20 p-10 text-center">
          <Check size={28} className="mx-auto text-forest/40 mb-3" />
          <p className="text-ink/60">Sin denuncias {status === 'pending' ? 'pendientes' : 'en este estado'}.</p>
        </div>
      ) : (
        <div className="border border-ink/10 divide-y divide-ink/5">
          {reports.map((r) => (
            <div key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-rally">
                    {r.targetType === 'message' ? 'Mensaje' : r.targetType === 'stage' ? 'Tramo' : 'Usuario'}
                    <span className="text-ink/40"> · denunciado por {r.reporter} · {formatDate(r.createdAt)}</span>
                  </p>
                  {r.targetLabel && <p className="text-sm font-medium mt-1 truncate">{r.targetLabel}</p>}
                  <p className="text-sm text-ink/70 mt-1 border-l-2 border-ink/10 pl-3">{r.reason}</p>
                  {r.resolution && (
                    <p className="text-xs font-mono text-ink/40 mt-1">Resolución: {r.resolution}</p>
                  )}
                </div>

                {status === 'pending' && (
                  <div className="flex gap-1.5 shrink-0">
                    {r.targetType !== 'user' && (
                      <button
                        onClick={() => resolve(r.id, 'delete_content')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-widest
                                   bg-rally text-white hover:bg-rally/80"
                        title={r.targetType === 'message' ? 'Eliminar mensaje' : 'Despublicar tramo'}
                      >
                        <Trash2 size={12} /> Eliminar
                      </button>
                    )}
                    <button
                      onClick={() => resolve(r.id, 'warn_user')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-widest
                                 border border-signal/50 text-signal hover:bg-signal/5"
                    >
                      <AlertTriangle size={12} /> Avisar
                    </button>
                    <button
                      onClick={() => resolve(r.id, 'dismiss')}
                      className="px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-widest
                                 border border-ink/20 text-ink/50 hover:text-ink"
                    >
                      Desestimar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Usuarios y roles
// ─────────────────────────────────────────────
function UsersTab() {
  const [search, setSearch] = useState('');
  const [users,  setUsers]  = useState([]);

  async function load(q = '') {
    try {
      const { data } = await api.get(`/admin/users${q ? `?search=${encodeURIComponent(q)}` : ''}`);
      setUsers(data.users || []);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => { load(); }, []);

  async function setRole(user, role) {
    try {
      await api.patch(`/admin/users/${user.id}/role`, { role });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role } : u)));
    } catch (err) {
      alert(err.response?.data?.error?.message || 'No se pudo cambiar el rol');
    }
  }

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); load(search); }} className="relative mb-4 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por usuario o pseudónimo…"
          className="input pl-9"
        />
      </form>

      <div className="border border-ink/10 divide-y divide-ink/5">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 p-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {u.pseudonym || u.username}
                <span className="text-ink/40 font-mono text-xs"> @{u.username}</span>
              </p>
              <p className="text-[10px] font-mono text-ink/40">
                {formatDate(u.createdAt)} {u.emailVerified ? '· email verificado' : ''}
              </p>
            </div>
            <div className="flex border border-ink/20">
              {['user', 'premium', 'admin'].map((role) => (
                <button
                  key={role}
                  onClick={() => u.role !== role && setRole(u, role)}
                  className={`px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-widest
                              ${u.role === role
                                ? role === 'admin' ? 'bg-rally text-white'
                                  : role === 'premium' ? 'bg-signal text-carbon'
                                  : 'bg-ink text-paper'
                                : 'text-ink/50 hover:text-ink'}`}
                >
                  {role === 'user' ? 'Piloto' : role}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Difusión de noticias
// ─────────────────────────────────────────────
function NewsTab() {
  const [title, setTitle] = useState('');
  const [body,  setBody]  = useState('');
  const [url,   setUrl]   = useState('');
  const [msg,   setMsg]   = useState(null);
  const [busy,  setBusy]  = useState(false);

  async function send(e) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    if (!window.confirm('Esto enviará una notificación a TODOS los usuarios. ¿Continuar?')) return;
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await api.post('/notifications/broadcast', {
        title: title.trim(),
        body: body.trim() || undefined,
        url: url.trim() || undefined,
      });
      setMsg({ ok: true, text: data.message });
      setTitle(''); setBody(''); setUrl('');
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.error?.message || 'No se pudo enviar' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send} className="max-w-lg space-y-4">
      <p className="text-xs text-ink/50">
        Noticias de la app o del mundo del motor. Llegan como notificación a todos
        los usuarios (campana + tiempo real).
      </p>
      <div>
        <label className="label">Título</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="input" />
      </div>
      <div>
        <label className="label">Texto (opcional)</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="input resize-none" />
      </div>
      <div>
        <label className="label">Enlace (opcional)</label>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="input" />
      </div>
      {msg && <p className={`text-xs font-mono ${msg.ok ? 'text-forest' : 'text-rally'}`}>{msg.text}</p>}
      <button type="submit" disabled={!title.trim() || busy} className="btn px-6 py-3 disabled:opacity-40">
        <Megaphone size={15} /> {busy ? 'Enviando…' : 'Enviar a todos'}
      </button>
    </form>
  );
}
