import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, MessageSquare, Trophy, Newspaper, Info, ExternalLink, ChevronDown } from 'lucide-react';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { formatDate } from '../lib/format.js';

const TYPE_META = {
  group_message: { icon: MessageSquare, color: 'text-forest' },
  record:        { icon: Trophy,        color: 'text-signal' },
  news:          { icon: Newspaper,     color: 'text-rally' },
  system:        { icon: Info,          color: 'text-ink/50' },
};

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return formatDate(iso);
}

export default function Notifications() {
  const navigate = useNavigate();
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page,    setPage]    = useState(1);

  // Carga inicial + marcar todo como leído (el resaltado visual se
  // conserva en esta visita para distinguir qué era nuevo).
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data } = await api.get('/notifications?limit=20');
        if (!active) return;
        setItems(data.notifications || []);
        setHasMore(data.hasMore);
        if (data.unreadCount > 0) {
          await api.post('/notifications/read', { all: true });
        }
        // Avisar al Layout para apagar el badge
        window.dispatchEvent(new CustomEvent('r4ce:notif-count', { detail: 0 }));
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();

    // Pedir permiso de notificaciones del navegador si aún no se decidió
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    return () => { active = false; };
  }, []);

  // Tiempo real: nuevas notificaciones entran arriba (ya marcadas al estar aquí)
  useEffect(() => {
    const socket = getSocket();
    function onNew(n) {
      setItems((prev) => {
        const rest = prev.filter((p) => p.id !== n.id);
        return [{ ...n, read: false }, ...rest];
      });
      api.post('/notifications/read', { ids: [n.id] }).catch(() => {});
      window.dispatchEvent(new CustomEvent('r4ce:notif-count', { detail: 0 }));
    }
    socket.on('notification:new', onNew);
    return () => socket.off('notification:new', onNew);
  }, []);

  async function loadMore() {
    const next = page + 1;
    try {
      const { data } = await api.get(`/notifications?limit=20&page=${next}`);
      setItems((prev) => {
        const known = new Set(prev.map((p) => p.id));
        return [...prev, ...(data.notifications || []).filter((n) => !known.has(n.id))];
      });
      setHasMore(data.hasMore);
      setPage(next);
    } catch (err) {
      console.error(err);
    }
  }

  function open(n) {
    if (n.type === 'group_message' && n.data?.groupId) {
      navigate(`/groups/${n.data.groupId}`);
    } else if (n.type === 'record' && n.data?.stageId) {
      navigate(`/stages/${n.data.stageId}`);
    } else if (n.data?.url) {
      window.open(n.data.url, '_blank', 'noopener');
    }
  }

  return (
    <div className="p-4 md:p-8 lg:p-12 max-w-3xl">
      <header className="mb-8">
        <p className="eyebrow">Actividad</p>
        <h1 className="text-4xl font-bold mt-1">Avisos</h1>
        <p className="text-ink/60 mt-2 text-sm max-w-lg">
          Mensajes nuevos en tus grupos, récords en tramos donde has
          participado y noticias de R4ce y del mundo del motor.
        </p>
      </header>

      {loading ? (
        <p className="font-mono text-sm text-ink/40">Cargando avisos…</p>
      ) : items.length === 0 ? (
        <div className="border border-dashed border-ink/20 p-10 text-center">
          <Bell size={28} className="mx-auto text-ink/20 mb-3" strokeWidth={1.5} />
          <p className="text-ink/60">No tienes avisos todavía.</p>
          <p className="text-xs font-mono text-ink/40 uppercase tracking-widest mt-1">
            Aquí aparecerá la actividad de tus grupos y tramos
          </p>
        </div>
      ) : (
        <>
          <div className="border border-ink/10 divide-y divide-ink/5">
            {items.map((n) => {
              const meta = TYPE_META[n.type] ?? TYPE_META.system;
              const Icon = meta.icon;
              const clickable = (n.type === 'group_message' && n.data?.groupId)
                || (n.type === 'record' && n.data?.stageId)
                || !!n.data?.url;
              return (
                <button
                  key={n.id}
                  onClick={() => clickable && open(n)}
                  disabled={!clickable}
                  className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors
                              ${clickable ? 'hover:bg-ink/[0.03]' : 'cursor-default'}
                              ${!n.read ? 'bg-signal/[0.06]' : ''}`}
                >
                  <span className={`mt-0.5 shrink-0 ${meta.color}`}><Icon size={17} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={`text-sm truncate ${!n.read ? 'font-semibold' : 'font-medium'}`}>
                        {n.title}
                      </span>
                      <span className="font-mono text-[10px] text-ink/40 shrink-0">
                        {timeAgo(n.createdAt)}
                      </span>
                    </span>
                    {n.body && <span className="block text-xs text-ink/50 mt-0.5 truncate">{n.body}</span>}
                  </span>
                  {n.data?.url && <ExternalLink size={13} className="text-ink/30 shrink-0 mt-1" />}
                  {!n.read && <span className="w-2 h-2 rounded-full bg-signal shrink-0 mt-1.5" />}
                </button>
              );
            })}
          </div>

          {hasMore && (
            <button
              onClick={loadMore}
              className="mt-4 mx-auto flex items-center gap-1.5 px-4 py-2 text-[11px] font-mono uppercase tracking-widest
                         border border-ink/20 text-ink/50 hover:text-ink hover:border-ink transition-colors"
            >
              <ChevronDown size={12} /> Ver más antiguos
            </button>
          )}
        </>
      )}
    </div>
  );
}
