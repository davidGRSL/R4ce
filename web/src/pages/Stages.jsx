import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Plus, Star, MapPin, Gauge,
  Heart, Eye, Users, Flame, Clock, User,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { formatDuration } from '../lib/format.js';
import MyStagesPanel from '../components/MyStagesPanel.jsx';
import StageBadges from '../components/StageBadges.jsx';

export default function Stages() {
  const [favorites, setFavorites] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const carousel = useRef(null);

  // Descubrir: tramos públicos ordenados por popularidad o novedad
  const [discover,        setDiscover]        = useState([]);
  const [discoverLoading, setDiscoverLoading] = useState(true);
  const [sort,            setSort]            = useState('popular');

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

  useEffect(() => {
    let cancelled = false;
    async function loadDiscover() {
      setDiscoverLoading(true);
      try {
        const { data } = await api.get(`/stages?sort=${sort}&limit=12`);
        if (!cancelled) setDiscover(data.stages || []);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setDiscoverLoading(false);
      }
    }
    loadDiscover();
    return () => { cancelled = true; };
  }, [sort]);

  function scroll(dir) {
    if (!carousel.current) return;
    carousel.current.scrollBy({ left: dir * 320, behavior: 'smooth' });
  }

  return (
    <div className="p-4 md:p-8 lg:p-12 max-w-6xl">
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

      {/* Descubrir tramos de la comunidad */}
      <section className="mb-12 pt-12 border-t border-ink/10">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <div>
            <p className="eyebrow">Comunidad</p>
            <h2 className="text-xl font-bold mt-0.5">Descubrir tramos</h2>
          </div>
          <div className="flex border border-ink/20">
            <SortButton active={sort === 'popular'} onClick={() => setSort('popular')} icon={Flame}>
              Populares
            </SortButton>
            <SortButton active={sort === 'recent'} onClick={() => setSort('recent')} icon={Clock}>
              Recientes
            </SortButton>
          </div>
        </div>

        {discoverLoading ? (
          <p className="font-mono text-sm text-ink/40">Buscando tramos…</p>
        ) : discover.length === 0 ? (
          <div className="border border-dashed border-ink/20 p-10 text-center">
            <Users size={28} className="mx-auto text-ink/20 mb-3" strokeWidth={1.5} />
            <p className="text-ink/60">Todavía no hay tramos públicos.</p>
            <p className="text-xs font-mono text-ink/40 uppercase tracking-widest mt-1">
              Publica el tuyo y estrena la comunidad
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-ink/10">
            {discover.map((s) => (
              <DiscoverCard key={s.id} stage={s} />
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

function SortButton({ active, onClick, icon: Icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-widest transition-colors
                  ${active ? 'bg-ink text-paper' : 'text-ink/60 hover:text-ink'}`}
    >
      <Icon size={12} /> {children}
    </button>
  );
}

function DiscoverCard({ stage }) {
  return (
    <Link
      to={`/stages/${stage.id}`}
      className="bg-paper p-5 hover:bg-ink/[0.02] transition-colors group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-display text-lg font-bold leading-tight group-hover:text-rally transition-colors">
          {stage.name}
        </h3>
        {stage.likedByMe && <Heart size={14} className="text-rally fill-rally shrink-0 mt-1" />}
      </div>

      <div className="flex items-center gap-2 text-xs text-ink/50 mb-2">
        <User size={12} />
        <span>{stage.creatorPseudonym || 'Anónimo'}</span>
        <span className="font-mono">· Nv. {stage.difficultyLevel || '—'}</span>
      </div>

      <StageBadges stage={stage} />

      {stage.description && (
        <p className="text-xs text-ink/50 mt-2 line-clamp-2">{stage.description}</p>
      )}

      {/* Señales sociales */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-ink/10 font-mono text-xs text-ink/60">
        <span className="inline-flex items-center gap-1" title="Likes">
          <Heart size={13} className="text-rally" /> {stage.likesCount}
        </span>
        <span className="inline-flex items-center gap-1" title="Favoritos">
          <Star size={13} className="text-signal" /> {stage.favoritesCount}
        </span>
        <span className="inline-flex items-center gap-1" title="Pilotos con tiempo">
          <Users size={13} className="text-forest" /> {stage.pilotsCount}
        </span>
        <span className="inline-flex items-center gap-1 ml-auto text-ink/40" title="Vistas">
          <Eye size={13} /> {stage.viewCount}
        </span>
      </div>
    </Link>
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