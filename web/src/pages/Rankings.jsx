import { useEffect, useState } from 'react';
import { Trophy, Search } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatDuration, formatDate, formatGap } from '../lib/format.js';

export default function Rankings() {
  const [stages,         setStages]         = useState([]);
  const [selectedStage,  setSelectedStage]  = useState(null);
  const [ranking,        setRanking]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [loadingRanking, setLoadingRanking] = useState(false);
  const [search,         setSearch]         = useState('');

  useEffect(() => {
    async function loadStages() {
      try {
        const { data } = await api.get('/stages?limit=50');
        setStages(data.stages || []);
        if (data.stages?.length) {
          setSelectedStage(data.stages[0]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadStages();
  }, []);

  useEffect(() => {
    if (!selectedStage) return;
    async function loadRanking() {
      setLoadingRanking(true);
      try {
        const { data } = await api.get(`/times/stage/${selectedStage.id}/ranking`);
        setRanking(data.ranking || []);
      } catch (err) {
        console.error(err);
        setRanking([]);
      } finally {
        setLoadingRanking(false);
      }
    }
    loadRanking();
  }, [selectedStage]);

  const filteredStages = stages.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const leaderMs = ranking[0]?.durationMs;
  const podio    = ranking.slice(0, 3);
  const resto    = ranking.slice(3);

  return (
    <div className="p-8 lg:p-12 max-w-6xl">
      <header className="mb-10">
        <p className="eyebrow">Clasificaciones</p>
        <h1 className="text-5xl font-bold mt-1">Rankings</h1>
        <p className="text-ink/60 mt-3 max-w-lg">
          Tiempos oficiales por tramo. Solo se incluyen tiempos públicos —
          el mejor tiempo de cada piloto cuenta para el ranking.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
        {/* Lista de tramos */}
        <aside>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tramo…"
              className="input pl-9"
            />
          </div>

          <div className="border border-ink/10 max-h-[calc(100vh-280px)] overflow-y-auto">
            {loading ? (
              <p className="p-4 font-mono text-xs text-ink/40">Cargando tramos…</p>
            ) : filteredStages.length === 0 ? (
              <p className="p-4 font-mono text-xs text-ink/40">No hay tramos publicados.</p>
            ) : (
              filteredStages.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStage(s)}
                  className={`w-full text-left p-4 border-b border-ink/5 transition-colors
                    ${selectedStage?.id === s.id
                      ? 'bg-ink text-paper'
                      : 'hover:bg-ink/[0.02]'}`}
                >
                  <p className="font-medium text-sm">{s.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className={`text-[10px] font-mono uppercase tracking-widest
                      ${selectedStage?.id === s.id ? 'text-paper/40' : 'text-ink/40'}`}>
                      Nv. {s.difficultyLevel || '—'}
                    </span>
                    <span className={`text-[10px] font-mono
                      ${selectedStage?.id === s.id ? 'text-paper/40' : 'text-ink/40'}`}>
                      {s.estimatedDuration ? `${s.estimatedDuration}s` : '—'}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Ranking */}
        <section>
          {!selectedStage ? (
            <div className="border border-ink/10 p-12 text-center">
              <p className="text-ink/40">Selecciona un tramo para ver su ranking.</p>
            </div>
          ) : loadingRanking ? (
            <p className="font-mono text-sm text-ink/40">Cargando ranking…</p>
          ) : ranking.length === 0 ? (
            <div className="border border-ink/10 p-12 text-center">
              <Trophy size={32} className="mx-auto text-ink/20 mb-4" strokeWidth={1.5} />
              <p className="text-ink/60 mb-2">Aún no hay tiempos públicos en este tramo.</p>
              <p className="text-xs font-mono text-ink/40 uppercase tracking-widest">
                {selectedStage.name}
              </p>
            </div>
          ) : (
            <>
              {/* Stage header */}
              <div className="border border-ink/10 p-6 mb-6 bg-ink text-paper">
                <p className="font-mono text-[10px] uppercase tracking-widest text-paper/40">
                  Tramo activo
                </p>
                <h2 className="font-display text-3xl font-bold mt-1">{selectedStage.name}</h2>
                <div className="flex items-center gap-6 mt-3 text-xs font-mono text-paper/60">
                  <span>Dif. {selectedStage.difficultyLevel || '—'}/5</span>
                  <span>Est. {selectedStage.estimatedDuration ? `${selectedStage.estimatedDuration}s` : '—'}</span>
                  <span>{ranking.length} pilotos</span>
                </div>
              </div>

              {/* Podio */}
              {podio.length > 0 && (
                <div className="grid grid-cols-3 gap-px bg-ink/10 mb-px">
                  {[1, 0, 2].map((idx) => {
                    const p = podio[idx];
                    if (!p) return <div key={idx} className="bg-paper p-6" />;
                    const heights = { 0: 'h-44', 1: 'h-32', 2: 'h-28' };
                    const accents = { 0: 'border-signal', 1: 'border-ink/30', 2: 'border-rally/60' };
                    return (
                      <div key={p.userId} className={`bg-paper p-6 flex flex-col justify-end ${heights[idx]} border-b-4 ${accents[idx]}`}>
                        <p className="font-mono text-[10px] uppercase tracking-widest text-ink/40 mb-1">
                          Pos. {p.rank}
                        </p>
                        <p className="font-display text-xl font-bold truncate">{p.pseudonym}</p>
                        <p className="font-mono text-sm text-ink/70 mt-1">{formatDuration(p.durationMs)}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Resto */}
              {resto.length > 0 && (
                <div className="border border-ink/10 border-t-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-ink/10">
                        <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-ink/50 text-left w-16">Pos</th>
                        <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-ink/50 text-left">Piloto</th>
                        <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-ink/50 text-right">Tiempo</th>
                        <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-ink/50 text-right">Dif.</th>
                        <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-ink/50 text-right">Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resto.map((p) => (
                        <tr key={p.userId} className="border-b border-ink/5 hover:bg-ink/[0.02] transition-colors">
                          <td className="px-4 py-3 font-mono text-sm text-ink/60">{p.rank}</td>
                          <td className="px-4 py-3 text-sm">{p.pseudonym}</td>
                          <td className="px-4 py-3 text-sm font-mono text-right">{formatDuration(p.durationMs)}</td>
                          <td className="px-4 py-3 text-xs font-mono text-right text-ink/50">
                            {formatGap(p.durationMs, leaderMs)}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-right text-ink/50">{formatDate(p.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
