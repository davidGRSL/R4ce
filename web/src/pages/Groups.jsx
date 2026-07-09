import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UsersRound, Plus, KeyRound, Crown, Shield, ChevronRight } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/format.js';

const ROLE_LABEL = { owner: 'Admin', moderator: 'Moderador', member: 'Miembro' };
const ROLE_ICON  = { owner: Crown, moderator: Shield };

export default function Groups() {
  const navigate = useNavigate();
  const [groups,  setGroups]  = useState([]);
  const [loading, setLoading] = useState(true);

  // Crear grupo
  const [showCreate, setShowCreate] = useState(false);
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState(null);

  // Unirse por código
  const [inviteCode, setInviteCode] = useState('');
  const [joining,    setJoining]    = useState(false);
  const [joinError,  setJoinError]  = useState(null);

  useEffect(() => { loadGroups(); }, []);

  async function loadGroups() {
    try {
      const { data } = await api.get('/groups/my');
      setGroups(data.groups || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const { data } = await api.post('/groups', {
        name: name.trim(),
        description: description.trim() || null,
      });
      navigate(`/groups/${data.group.id}`);
    } catch (err) {
      setCreateError(err.response?.data?.error?.message || 'No se pudo crear el grupo');
      setCreating(false);
    }
  }

  async function handleJoin(e) {
    e.preventDefault();
    if (!inviteCode.trim() || joining) return;
    setJoining(true);
    setJoinError(null);
    try {
      const { data } = await api.post('/groups/join', { inviteCode: inviteCode.trim() });
      navigate(`/groups/${data.groupId}`);
    } catch (err) {
      setJoinError(err.response?.data?.error?.message || 'No se pudo unir al grupo');
      setJoining(false);
    }
  }

  return (
    <div className="p-4 md:p-8 lg:p-12 max-w-6xl">
      <header className="mb-8">
        <p className="eyebrow">Comunidad</p>
        <h1 className="text-4xl font-bold mt-1">Grupos</h1>
        <p className="text-ink/60 mt-2 text-sm max-w-lg">
          Crea grupos privados con tus compañeros de equipo: chat con fotos,
          vídeos y notas de voz, tramos y tiempos compartidos solo con ellos.
        </p>
      </header>

      {/* Crear / unirse */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12 items-stretch">
        {/* Crear grupo */}
        <div className="border-2 border-ink bg-ink text-paper p-6 flex flex-col justify-center">
          {!showCreate ? (
            <button onClick={() => setShowCreate(true)} className="text-left group w-full">
              <div className="flex items-center gap-2 mb-1.5">
                <Plus size={16} strokeWidth={2.5} />
                <p className="font-mono text-[10px] uppercase tracking-[0.2em]">Nuevo equipo</p>
              </div>
              <h2 className="font-display text-2xl font-bold">Crea tu grupo</h2>
              <span className="inline-flex items-center gap-2 mt-3 font-medium text-sm border-b-2 border-current pb-0.5">
                Empezar
                <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
          ) : (
            <form onSubmit={handleCreate} className="space-y-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em]">Nuevo grupo</p>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre del grupo"
                maxLength={80}
                autoFocus
                className="w-full bg-transparent border border-paper/30 px-3 py-2 text-sm placeholder:text-paper/40
                           focus:outline-none focus:border-paper"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripción (opcional)"
                rows={2}
                maxLength={300}
                className="w-full bg-transparent border border-paper/30 px-3 py-2 text-sm placeholder:text-paper/40
                           focus:outline-none focus:border-paper resize-none"
              />
              {createError && <p className="text-rally text-xs font-mono">{createError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!name.trim() || creating}
                  className="px-4 py-2 bg-paper text-ink text-xs font-mono uppercase tracking-widest
                             disabled:opacity-40 hover:bg-paper/90 transition-colors"
                >
                  {creating ? 'Creando…' : 'Crear grupo'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setCreateError(null); }}
                  className="px-4 py-2 text-xs font-mono uppercase tracking-widest text-paper/60 hover:text-paper"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Unirse por código */}
        <div className="border border-ink/15 p-6 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-1.5">
            <KeyRound size={16} className="text-signal" />
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/50">Invitación</p>
          </div>
          <h2 className="font-display text-2xl font-bold mb-3">Únete a un grupo</h2>
          <form onSubmit={handleJoin} className="flex gap-2">
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="CÓDIGO DE INVITACIÓN"
              maxLength={20}
              className="input flex-1 font-mono tracking-widest uppercase"
            />
            <button
              type="submit"
              disabled={!inviteCode.trim() || joining}
              className="px-4 py-2 bg-ink text-paper text-xs font-mono uppercase tracking-widest
                         disabled:opacity-40 hover:bg-ink/80 transition-colors shrink-0"
            >
              {joining ? 'Uniendo…' : 'Unirme'}
            </button>
          </form>
          {joinError && <p className="text-rally text-xs font-mono mt-2">{joinError}</p>}
        </div>
      </div>

      {/* Mis grupos */}
      <section>
        <div className="flex items-center gap-2 mb-5">
          <UsersRound size={16} className="text-forest" />
          <h2 className="text-xl font-bold">Mis grupos</h2>
          {!loading && <span className="font-mono text-xs text-ink/40">({groups.length})</span>}
        </div>

        {loading ? (
          <p className="font-mono text-sm text-ink/40">Cargando grupos…</p>
        ) : groups.length === 0 ? (
          <div className="border border-dashed border-ink/20 p-10 text-center">
            <UsersRound size={28} className="mx-auto text-ink/20 mb-3" strokeWidth={1.5} />
            <p className="text-ink/60">Todavía no perteneces a ningún grupo.</p>
            <p className="text-xs font-mono text-ink/40 uppercase tracking-widest mt-1">
              Crea uno o únete con un código de invitación
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-ink/10">
            {groups.map((g) => <GroupCard key={g.id} group={g} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function GroupCard({ group }) {
  const navigate = useNavigate();
  const RoleIcon = ROLE_ICON[group.myRole];

  return (
    <button
      onClick={() => navigate(`/groups/${group.id}`)}
      className="bg-paper p-5 text-left hover:bg-ink/[0.02] transition-colors group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-display text-lg font-bold leading-tight group-hover:text-rally transition-colors">
          {group.name}
        </h3>
        <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-ink/50 shrink-0 mt-1">
          {RoleIcon && <RoleIcon size={12} className={group.myRole === 'owner' ? 'text-signal' : 'text-forest'} />}
          {ROLE_LABEL[group.myRole] || group.myRole}
        </span>
      </div>

      {group.description && (
        <p className="text-xs text-ink/50 line-clamp-2">{group.description}</p>
      )}

      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-ink/10 font-mono text-xs text-ink/60">
        <span className="inline-flex items-center gap-1">
          <UsersRound size={13} className="text-forest" /> {group.memberCount}
        </span>
        <span className="ml-auto text-ink/40">{formatDate(group.createdAt)}</span>
      </div>
    </button>
  );
}
