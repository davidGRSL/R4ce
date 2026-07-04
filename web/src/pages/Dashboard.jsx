import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Activity, Clock, Trophy, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { getUser } from '../lib/auth.js';
import { formatDuration, formatDate } from '../lib/format.js';

export default function Dashboard() {
  const user = getUser();
  const [loading, setLoading] = useState(true);
  const [stats,   setStats]   = useState({
    stages:    0,
    times:     0,
    groups:    0,
    bestTime:  null,
  });
  const [recentTimes, setRecentTimes] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const [stagesRes, timesRes, groupsRes] = await Promise.all([
          api.get('/stages/my/stages?limit=1'),
          api.get('/times/my?limit=5'),
          api.get('/groups/my'),
        ]);

        const times = timesRes.data.times || [];
        const bestTime = times.length
          ? times.reduce((a, b) => (a.durationMs < b.durationMs ? a : b))
          : null;

        setStats({
          stages:   stagesRes.data.pagination.total,
          times:    timesRes.data.pagination.total,
          groups:   groupsRes.data.groups.length,
          bestTime,
        });
        setRecentTimes(times);
      } catch (err) {
        console.error('Error cargando dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="p-4 md:p-8 lg:p-12 max-w-6xl">
      {/* Header */}
      <header className="mb-8 md:mb-12">
        <p className="eyebrow">Panel de control</p>
        <h1 className="text-3xl md:text-5xl font-bold mt-1">
          Hola, <span className="text-rally">{user?.pseudonym || user?.username}</span>
        </h1>
        <p className="text-ink/60 mt-3 max-w-lg text-sm md:text-base">
          Resumen de tu actividad. Los datos se actualizan en tiempo real
          según tus carreras y las de tus grupos.
        </p>
      </header>

      {/* Stats grid */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-ink/10 mb-8 md:mb-12">
        <StatCard
          icon={Activity}
          label="Tramos creados"
          value={stats.stages}
          loading={loading}
        />
        <StatCard
          icon={Clock}
          label="Tiempos registrados"
          value={stats.times}
          loading={loading}
        />
        <StatCard
          icon={Users}
          label="Grupos"
          value={stats.groups}
          loading={loading}
        />
        <StatCard
          icon={Trophy}
          label="Mejor tiempo"
          value={stats.bestTime ? formatDuration(stats.bestTime.durationMs) : '—'}
          subtitle={stats.bestTime?.stageName}
          loading={loading}
          mono
        />
      </section>

      {/* Recent times */}
      <section>
        <div className="mb-6">
          <p className="eyebrow">Actividad reciente</p>
          <h2 className="text-2xl font-bold mt-1">Últimos tiempos</h2>
        </div>

        {loading ? (
          <p className="font-mono text-sm text-ink/40">Cargando…</p>
        ) : recentTimes.length === 0 ? (
          <div className="border border-ink/10 p-8 text-center">
            <p className="text-ink/60 mb-2">Aún no has registrado ningún tiempo.</p>
            <p className="text-xs font-mono text-ink/40 uppercase tracking-widest">
              Corre un tramo desde la app móvil
            </p>
          </div>
        ) : (
          <>
            {/* Móvil: tarjetas apiladas */}
            <div className="md:hidden border border-ink/10 divide-y divide-ink/5">
              {recentTimes.map((t) => (
                <Link
                  key={t.id}
                  to={`/times/${t.id}`}
                  className="block p-4 active:bg-ink/[0.03]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-sm truncate">{t.stageName || '—'}</p>
                    <p className="font-mono text-base font-semibold shrink-0">{formatDuration(t.durationMs)}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-1.5">
                    <p className="font-mono text-xs text-ink/50">
                      {t.maxSpeed ? `${t.maxSpeed.toFixed(1)} km/h · ` : ''}{formatDate(t.createdAt)}
                    </p>
                    <VisibilityBadge v={t.visibility} />
                  </div>
                </Link>
              ))}
            </div>

            {/* Escritorio: tabla */}
            <div className="hidden md:block border border-ink/10">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ink/10 text-left">
                    <Th>Tramo</Th>
                    <Th align="right">Tiempo</Th>
                    <Th align="right">Vel. máx</Th>
                    <Th align="right">Fecha</Th>
                    <Th align="right">Visibilidad</Th>
                  </tr>
                </thead>
                <tbody>
                  {recentTimes.map((t) => (
                    <tr key={t.id} className="border-b border-ink/5 hover:bg-ink/[0.02] transition-colors">
                      <Td>
                        <Link to={`/times/${t.id}`} className="hover:text-rally transition-colors">
                          {t.stageName || '—'}
                        </Link>
                      </Td>
                      <Td align="right" mono>{formatDuration(t.durationMs)}</Td>
                      <Td align="right" mono>{t.maxSpeed ? `${t.maxSpeed.toFixed(1)} km/h` : '—'}</Td>
                      <Td align="right" mono>{formatDate(t.createdAt)}</Td>
                      <Td align="right"><VisibilityBadge v={t.visibility} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subtitle, loading, mono }) {
  return (
    <div className="bg-paper p-4 md:p-6">
      <div className="flex items-start justify-between mb-3 md:mb-4 gap-2">
        <p className="eyebrow">{label}</p>
        <Icon size={16} className="text-ink/40 shrink-0" strokeWidth={2.5} />
      </div>
      <p className={`text-2xl md:text-4xl font-bold ${mono ? 'font-mono md:text-3xl' : 'font-display'} tracking-tight`}>
        {loading ? '…' : value}
      </p>
      {subtitle && (
        <p className="text-xs text-ink/50 mt-2 truncate">{subtitle}</p>
      )}
    </div>
  );
}

function Th({ children, align = 'left' }) {
  return (
    <th className={`px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-ink/50 text-${align}`}>
      {children}
    </th>
  );
}

function Td({ children, align = 'left', mono }) {
  return (
    <td className={`px-4 py-3 text-sm text-${align} ${mono ? 'font-mono' : ''}`}>
      {children}
    </td>
  );
}

function VisibilityBadge({ v }) {
  const styles = {
    public:  'border-forest text-forest',
    private: 'border-ink/30 text-ink/60',
    group:   'border-signal text-signal',
  };
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest border ${styles[v] || styles.private}`}>
      {v}
    </span>
  );
}
