import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Star, MapPin, Gauge } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatDuration } from '../lib/format.js';
import MyStagesPanel from '../components/MyStagesPanel.jsx';

export default function Stages() {
  const [favorites, setFavorites] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const carousel = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/stages/favorites/list');
        setFavorites(data.stages || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function scroll(dir) {
    if (!carousel.current) return;
    carousel.current.scrollBy({ left: dir * 320, behavior: 'smooth' });
  }

  return (
    <div className="p-8 lg:p-12 max-w-6xl">
      {/* Header + Crea tu circuito lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 items-stretch">
        {/* Izquierda: header */}
        <header className="flex flex-col justify-center">
          <p className="eyebrow">Circuitos</p>
          <h1 className="text-4xl font-bold mt-1">Tramos</h1>
          <p className="text-ink/60 mt-2 text-sm max-w-lg">
            Tus tramos favoritos y tu taller de creación. Marca como favorito
            cualquier tramo público, de grupo o propio para tenerlo a mano.
          </p>
        </header>

        {/* Derecha: crea tu circuito */}
        <Link
          to="/stages/create"
          className="group flex flex-col justify-center border-2 border-ink bg-ink text-paper px-8 py-6 relative overflow-hidden
                     transition-all hover:bg-paper hover:text-ink"
        >
          <svg className="absolute right-0 top-0 h-full w-1/2 opacity-10 pointer-events-none"
               viewBox="0 0 200 200" fill="none">
            <path d="M0,180 Q60,160 80,100 T140,40 Q160,20 200,30"
                  stroke="currentColor" strokeWidth="2" fill="none" />
            <circle cx="0" cy="180" r="4" fill="currentColor" />
            <circle cx="200" cy="30" r="4" fill="currentColor" />
          </svg>

          <div className="relative">
            <div className="flex items-center gap-2 mb-1.5">
              <Plus size={16} strokeWidth={2.5} />
              <p className="font-mono text-[10px] uppercase tracking-[0.2em]">Taller de trazadas</p>
            </div>
            <h2 className="font-display text-2xl font-bold">
              Crea tu circuito
            </h2>
            <span className="inline-flex items-center gap-2 mt-3 font-medium text-sm border-b-2 border-current pb-0.5">
              Empezar a crear
              <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </span>
          </div>
        </Link>
      </div>

      {/* Carrusel de favoritos */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-5">
          <div className="flex items-center gap-2">
            <Star size={16} className="text-signal fill-signal" />
            <h2 className="text-xl font-bold">Favoritos</h2>
            {!loading && (
              <span className="font-mono text-xs text-ink/40">({favorites.length})</span>
            )}
          </div>
          {favorites.length > 0 && (
            <div className="flex gap-1">
              <button onClick={() => scroll(-1)} className="p-2 border border-ink/20 hover:border-ink transition-colors">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => scroll(1)} className="p-2 border border-ink/20 hover:border-ink transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <p className="font-mono text-sm text-ink/40">Cargando favoritos…</p>
        ) : favorites.length === 0 ? (
          <div className="border border-dashed border-ink/20 p-10 text-center">
            <Star size={28} className="mx-auto text-ink/20 mb-3" strokeWidth={1.5} />
            <p className="text-ink/60">Aún no tienes tramos favoritos.</p>
            <p className="text-xs font-mono text-ink/40 uppercase tracking-widest mt-1">
              Marca tramos con la estrella para verlos aquí
            </p>
          </div>
        ) : (
          <div
            ref={carousel}
            className="flex gap-px bg-ink/10 overflow-x-auto pb-1 snap-x"
            style={{ scrollbarWidth: 'thin' }}
          >
            {favorites.map((s) => (
              <FavoriteCard key={s.id} stage={s} />
            ))}
          </div>
        )}
      </section>

      {/* Mis tramos */}
      <div className="mt-12 pt-12 border-t border-ink/10">
        <MyStagesPanel />
      </div>
    </div>
  );
}

function FavoriteCard({ stage }) {
  const visStyles = {
    public:  'text-forest',
    private: 'text-ink/50',
    group:   'text-signal',
  };

  return (
    <Link
      to={`/stages/${stage.id}/edit`}
      className="snap-start shrink-0 w-72 bg-paper p-5 hover:bg-ink/[0.02] transition-colors group"
    >
      <div className="flex items-start justify-between mb-3">
        <span className={`text-[10px] font-mono uppercase tracking-widest ${visStyles[stage.visibility]}`}>
          {stage.visibility}
        </span>
        <Star size={14} className="text-signal fill-signal" />
      </div>

      <h3 className="font-display text-lg font-bold leading-tight group-hover:text-rally transition-colors">
        {stage.name}
      </h3>

      {stage.description && (
        <p className="text-xs text-ink/50 mt-2 line-clamp-2">{stage.description}</p>
      )}

      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-ink/10">
        <div className="flex items-center gap-1">
          <Gauge size={13} className="text-ink/40" />
          <span className="font-mono text-xs">Nv. {stage.difficultyLevel || '—'}</span>
        </div>
        <div className="flex items-center gap-1">
          <MapPin size={13} className="text-ink/40" />
          <span className="font-mono text-xs">
            {stage.estimatedDuration ? formatDuration(stage.estimatedDuration * 1000) : '—'}
          </span>
        </div>
      </div>
    </Link>
  );
}