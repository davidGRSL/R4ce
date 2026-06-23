import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatDuration, formatDate } from '../lib/format.js';

export default function Times() {
  const [times,   setTimes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all'); // all | private | public | group

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/times/my?limit=50');
        setTimes(data.times || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = times.filter((t) => filter === 'all' || t.visibility === filter);

  return (
    <div className="p-8 lg:p-12 max-w-6xl">
      <header className="mb-10">
        <p className="eyebrow">Historial</p>
        <h1 className="text-5xl font-bold mt-1">Mis tiempos</h1>
        <p className="text-ink/60 mt-3 max-w-lg">
          Cada tiempo registrado en cualquier tramo. Pulsa sobre uno
          para ver el recorrido GPS detallado.
        </p>
      </header>

      {/* Filtros */}
      <div className="flex gap-2 mb-6">
        {['all', 'public', 'group', 'private'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest border transition-colors
              ${filter === f
                ? 'border-ink bg-ink text-paper'
                : 'border-ink/20 text-ink/60 hover:border-ink hover:text-ink'}`}
          >
            {f === 'all' ? 'Todos' : f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="font-mono text-sm text-ink/40">Cargando tiempos…</p>
      ) : filtered.length === 0 ? (
        <div className="border border-ink/10 p-12 text-center">
          <p className="text-ink/60 mb-2">No hay tiempos para mostrar.</p>
          <p className="text-xs font-mono text-ink/40 uppercase tracking-widest">
            {filter === 'all' ? 'Aún no has corrido ningún tramo' : `Ningún tiempo ${filter}`}
          </p>
        </div>
      ) : (
        <div className="border border-ink/10">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink/10">
                <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-ink/50 text-left">Tramo</th>
                <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-ink/50 text-right">Tiempo</th>
                <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-ink/50 text-right">Vel. máx</th>
                <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-ink/50 text-right">Vel. media</th>
                <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-ink/50 text-right">Fecha</th>
                <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-ink/50 text-right">Vis.</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-ink/5 hover:bg-ink/[0.02] transition-colors group">
                  <td className="px-4 py-3 text-sm">{t.stageName || '—'}</td>
                  <td className="px-4 py-3 text-sm font-mono text-right font-medium">{formatDuration(t.durationMs)}</td>
                  <td className="px-4 py-3 text-sm font-mono text-right text-ink/70">{t.maxSpeed ? `${t.maxSpeed.toFixed(1)}` : '—'}</td>
                  <td className="px-4 py-3 text-sm font-mono text-right text-ink/70">{t.avgSpeed ? `${t.avgSpeed.toFixed(1)}` : '—'}</td>
                  <td className="px-4 py-3 text-xs font-mono text-right text-ink/50">{formatDate(t.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <VisibilityBadge v={t.visibility} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/times/${t.id}`}
                      className="opacity-0 group-hover:opacity-100 text-ink/60 hover:text-rally transition-all inline-flex"
                    >
                      <ArrowUpRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
