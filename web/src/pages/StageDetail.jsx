import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker } from 'react-leaflet';
import L from 'leaflet';
import {
  ArrowLeft, Pencil, Trophy, Gauge, Clock, User, MapPin, Flag,
  Crosshair, Eye, Medal
} from 'lucide-react';
import { api } from '../lib/api.js';
import { formatDuration, formatDate, formatGap } from '../lib/format.js';
import { getUser } from '../lib/auth.js';

// Iconos Leaflet
function makeIcon(color) {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #fafaf7;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}
const startIcon = makeIcon('#fcbf49');
const endIcon   = makeIcon('#386641');
const cpIcon    = makeIcon('#e63946');

const visLabel = { public: 'Público', private: 'Privado', group: 'Grupo' };
const visStyles = {
  public:  'border-forest text-forest',
  private: 'border-ink/30 text-ink/60',
  group:   'border-signal text-signal',
};

export default function StageDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const me = getUser();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get(`/stages/${id}/detail`);
        setData(data);
      } catch (err) {
        setError(err.response?.data?.error?.message || 'Error cargando el tramo');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <div className="p-12 font-mono text-sm text-ink/40">Cargando…</div>;

  if (error || !data) {
    return (
      <div className="p-12">
        <button onClick={() => navigate('/stages')} className="text-sm text-ink/60 hover:text-rally inline-flex items-center gap-2">
          <ArrowLeft size={14} /> Volver
        </button>
        <p className="mt-4 text-rally">{error || 'Tramo no encontrado'}</p>
      </div>
    );
  }

  const { stage, myBest, ranking } = data;
  const isOwner = me?.id === stage.creatorId;

  // Construir geometría del mapa desde routeGeojson (coords en [lng,lat])
  const coords = stage.routeGeojson?.coordinates || [];
  const positions = coords.map(([lng, lat]) => [lat, lng]);
  const center = positions.length ? positions[Math.floor(positions.length / 2)] : [40.55, -1.10];

  const startCoord = stage.start?.coord ? [stage.start.coord[1], stage.start.coord[0]] : positions[0];
  const endCoord   = stage.end?.coord ? [stage.end.coord[1], stage.end.coord[0]] : positions[positions.length - 1];
  const cpCoords   = (stage.checkpoints || []).map((cp) => [cp.coord[1], cp.coord[0]]);

  const leaderMs = ranking[0]?.durationMs;

  return (
    <div className="p-8 lg:p-12 max-w-6xl">
      <button
        onClick={() => navigate('/stages')}
        className="text-sm text-ink/60 hover:text-rally inline-flex items-center gap-2 mb-6 font-mono uppercase tracking-widest text-xs"
      >
        <ArrowLeft size={14} /> Volver a tramos
      </button>

      {/* Header */}
      <header className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest border ${visStyles[stage.visibility]}`}>
              {visLabel[stage.visibility]}
            </span>
            {stage.isPublished && (
              <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest border border-ink/20 text-ink/50">
                Publicado
              </span>
            )}
          </div>
          <h1 className="text-4xl font-bold">{stage.name}</h1>
          <div className="flex items-center gap-4 mt-3 text-sm text-ink/60">
            <span className="inline-flex items-center gap-1.5">
              <User size={14} /> {stage.creatorPseudonym}
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-xs">
              {formatDate(stage.createdAt)}
            </span>
          </div>
        </div>

        {isOwner && (
          <button onClick={() => navigate(`/stages/${id}/edit`)} className="btn-ghost shrink-0">
            <Pencil size={14} /> Editar
          </button>
        )}
      </header>

      {/* Métricas del tramo */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink/10 mb-8">
        <InfoCard icon={Gauge} label="Dificultad" value={`${stage.difficultyLevel || '—'}/5`} />
        <InfoCard icon={Clock} label="Duración est." value={stage.estimatedDuration ? `${stage.estimatedDuration}s` : '—'} mono />
        <InfoCard icon={Crosshair} label="Puntos ref." value={stage.checkpoints?.length || 0} mono />
        <InfoCard icon={Trophy} label="Pilotos" value={ranking.length} mono />
      </section>

      {/* Mi mejor tiempo */}
      <section className="mb-8">
        <p className="eyebrow mb-3">Tu marca</p>
        {myBest ? (
          <div className="border border-ink bg-ink text-paper p-6">
            <div className="flex items-end justify-between flex-wrap gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-paper/40 mb-1">
                  Tu mejor tiempo
                </p>
                <p className="font-mono text-5xl font-bold">{formatDuration(myBest.durationMs)}</p>
                <div className="flex items-center gap-6 mt-3 text-xs font-mono text-paper/60">
                  <span>Máx {myBest.maxSpeed ? `${myBest.maxSpeed.toFixed(1)} km/h` : '—'}</span>
                  <span>Media {myBest.avgSpeed ? `${myBest.avgSpeed.toFixed(1)} km/h` : '—'}</span>
                  <span>{formatDate(myBest.createdAt)}</span>
                </div>
              </div>
              <button
                onClick={() => navigate(`/times/${myBest.id}`)}
                className="inline-flex items-center gap-2 px-4 py-2 border border-paper/30 text-paper text-sm
                           hover:bg-paper hover:text-ink transition-colors"
              >
                <Eye size={15} /> Ver recorrido completo
              </button>
            </div>
          </div>
        ) : (
          <div className="border-2 border-dashed border-rally/40 p-8 text-center">
            <Flag size={28} className="mx-auto text-rally/60 mb-3" strokeWidth={1.5} />
            <p className="font-display text-2xl font-bold text-rally">Acércate y ponte al límite</p>
            <p className="text-sm text-ink/50 mt-2 font-mono uppercase tracking-widest">
              Aún no tienes ningún tiempo en este tramo
            </p>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Mapa con trazada */}
        <section>
          <p className="eyebrow mb-3">Trazada</p>
          <div className="border border-ink/10 h-[360px]">
            {positions.length > 0 ? (
              <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
                <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Polyline positions={positions} color="#e63946" weight={4} opacity={0.85} />
                {startCoord && <Marker position={startCoord} icon={startIcon} />}
                {endCoord && <Marker position={endCoord} icon={endIcon} />}
                {cpCoords.map((c, i) => <Marker key={i} position={c} icon={cpIcon} />)}
              </MapContainer>
            ) : (
              <div className="h-full flex items-center justify-center bg-ink text-paper/40 font-mono text-sm">
                Sin trazada GPS
              </div>
            )}
          </div>

          {/* Inicio / Meta / Checkpoints */}
          <div className="mt-4 space-y-2">
            {stage.start && (
              <PointRow icon={Flag} color="text-signal" label="Inicio" name={stage.start.name} />
            )}
            {(stage.checkpoints || []).map((cp, i) => (
              <PointRow key={i} icon={Crosshair} color="text-rally" label={`Ref. ${i + 1}`} name={cp.name} />
            ))}
            {stage.end && (
              <PointRow icon={MapPin} color="text-forest" label="Meta" name={stage.end.name} />
            )}
          </div>

          {/* Descripción */}
          {stage.description && (
            <div className="mt-4 border-l-2 border-ink/20 pl-4">
              <p className="eyebrow mb-1">Notas</p>
              <p className="text-sm text-ink/70">{stage.description}</p>
            </div>
          )}
        </section>

        {/* Ranking + mis sectores */}
        <section>
          {/* Mis sectores */}
          {myBest && myBest.splits.length > 0 && (
            <div className="mb-8">
              <p className="eyebrow mb-3">Tus sectores</p>
              <div className="border border-ink/10">
                {myBest.splits.map((s, i) => {
                  const sectorMs = i > 0 ? s.ms - myBest.splits[i - 1].ms : 0;
                  return (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-ink/5 last:border-0">
                      <span className="font-mono text-sm">
                        {i === 0 ? 'INICIO' : i === myBest.splits.length - 1 ? 'META' : `CP #${i}`}
                      </span>
                      <div className="flex items-center gap-6">
                        <span className="font-mono text-sm">{formatDuration(s.ms)}</span>
                        <span className="font-mono text-xs text-ink/50 w-20 text-right">
                          {i === 0 ? '—' : `+${formatDuration(sectorMs)}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ranking */}
          <p className="eyebrow mb-3">Clasificación</p>
          {ranking.length === 0 ? (
            <div className="border border-ink/10 p-8 text-center">
              <Trophy size={28} className="mx-auto text-ink/20 mb-3" strokeWidth={1.5} />
              <p className="text-ink/60">Aún no hay tiempos públicos.</p>
            </div>
          ) : (
            <div className="border border-ink/10">
              {ranking.map((p) => {
                const isMe = p.userId === me?.id;
                return (
                  <div
                    key={p.userId}
                    className={`flex items-center px-4 py-3 border-b border-ink/5 last:border-0 ${isMe ? 'bg-signal/10' : ''}`}
                  >
                    <div className="w-8 flex justify-center">
                      {p.rank <= 3 ? (
                        <Medal size={16} className={
                          p.rank === 1 ? 'text-signal' : p.rank === 2 ? 'text-ink/40' : 'text-rally/60'
                        } />
                      ) : (
                        <span className="font-mono text-sm text-ink/60">{p.rank}</span>
                      )}
                    </div>
                    <span className={`flex-1 text-sm ${isMe ? 'font-semibold' : ''}`}>
                      {p.pseudonym}{isMe && <span className="text-xs text-ink/40 ml-1">(tú)</span>}
                    </span>
                    <span className="font-mono text-sm mr-4">{formatDuration(p.durationMs)}</span>
                    <span className="font-mono text-xs text-ink/50 w-16 text-right">
                      {formatGap(p.durationMs, leaderMs)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value, mono }) {
  return (
    <div className="bg-paper p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="eyebrow">{label}</p>
        <Icon size={14} className="text-ink/40" strokeWidth={2.5} />
      </div>
      <p className={`text-2xl font-bold ${mono ? 'font-mono' : 'font-display'}`}>{value}</p>
    </div>
  );
}

function PointRow({ icon: Icon, color, label, name }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon size={14} className={color} />
      <span className="font-mono text-[10px] uppercase tracking-widest text-ink/40 w-16">{label}</span>
      <span className="truncate">{name}</span>
    </div>
  );
}
