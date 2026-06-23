import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker } from 'react-leaflet';
import L from 'leaflet';
import { ArrowLeft } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatDuration, formatDate } from '../lib/format.js';

// Fix iconos Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export default function TimeDetail() {
  const { id } = useParams();
  const [time,    setTime]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get(`/times/${id}`);
        setTime(data.time);
      } catch (err) {
        setError(err.response?.data?.error?.message || 'Error cargando tiempo');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return <div className="p-12 font-mono text-sm text-ink/40">Cargando…</div>;
  }

  if (error || !time) {
    return (
      <div className="p-12">
        <Link to="/times" className="text-sm text-ink/60 hover:text-rally inline-flex items-center gap-2">
          <ArrowLeft size={14} /> Volver
        </Link>
        <p className="mt-4 text-rally">{error || 'Tiempo no encontrado'}</p>
      </div>
    );
  }

  const track = time.track || [];
  const positions = track.map((p) => [p.lat, p.lng]);
  const center = positions.length
    ? positions[Math.floor(positions.length / 2)]
    : [40.0, -1.0];

  // Calcular splits con tiempos por sector
  const splits = time.splits || [];
  const sectorTimes = splits.map((s, i) => {
    if (i === 0) return null; // primer split = 0
    const sectorMs = s.ms - splits[i - 1].ms;
    return { ...s, sectorMs };
  }).filter(Boolean);

  return (
    <div className="p-8 lg:p-12 max-w-6xl">
      <Link to="/times" className="text-sm text-ink/60 hover:text-rally inline-flex items-center gap-2 mb-6 font-mono uppercase tracking-widest text-xs">
        <ArrowLeft size={14} /> Volver a tiempos
      </Link>

      {/* Header */}
      <header className="mb-8">
        <p className="eyebrow">{time.pseudonym || 'Anónimo'} · {formatDate(time.createdAt)}</p>
        <h1 className="text-4xl font-bold mt-1">{time.stageName || 'Tramo sin nombre'}</h1>
        <div className="flex items-baseline gap-6 mt-4">
          <p className="font-mono text-5xl font-bold text-rally">{formatDuration(time.durationMs)}</p>
          <div className="flex items-baseline gap-6 text-sm">
            <Metric label="Vel. máx" value={time.maxSpeed ? `${time.maxSpeed.toFixed(1)} km/h` : '—'} />
            <Metric label="Vel. media" value={time.avgSpeed ? `${time.avgSpeed.toFixed(1)} km/h` : '—'} />
            <Metric label="Puntos GPS" value={track.length} />
          </div>
        </div>
      </header>

      {/* Mapa */}
      <section className="mb-8 border border-ink/10">
        <div className="border-b border-ink/10 p-3 bg-ink/[0.02]">
          <p className="eyebrow">Recorrido GPS</p>
        </div>
        <div className="h-[500px] bg-ink relative">
          {positions.length > 0 ? (
            <MapContainer
              center={center}
              zoom={14}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Polyline positions={positions} color="#e63946" weight={4} opacity={0.85} />
              {positions[0] && (
                <CircleMarker center={positions[0]} radius={8} pathOptions={{ color: '#fcbf49', fillColor: '#fcbf49', fillOpacity: 1 }} />
              )}
              {positions[positions.length - 1] && (
                <CircleMarker center={positions[positions.length - 1]} radius={8} pathOptions={{ color: '#386641', fillColor: '#386641', fillOpacity: 1 }} />
              )}
            </MapContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-paper/40 font-mono text-sm">
              Sin datos GPS disponibles
            </div>
          )}
        </div>
      </section>

      {/* Splits */}
      {splits.length > 0 && (
        <section>
          <div className="mb-4">
            <p className="eyebrow">Sectores</p>
            <h2 className="text-2xl font-bold mt-1">Tiempos parciales</h2>
          </div>

          <div className="border border-ink/10">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink/10">
                  <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-ink/50 text-left w-20">CP</th>
                  <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-ink/50 text-right">Tiempo acumulado</th>
                  <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-ink/50 text-right">Sector</th>
                </tr>
              </thead>
              <tbody>
                {splits.map((s, i) => {
                  const prev = i > 0 ? splits[i - 1] : null;
                  const sectorMs = prev ? s.ms - prev.ms : 0;
                  return (
                    <tr key={s.checkpointIndex} className="border-b border-ink/5">
                      <td className="px-4 py-3 font-mono text-sm">
                        {i === 0 ? 'INICIO' : i === splits.length - 1 ? 'META' : `#${s.checkpointIndex}`}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-right">{formatDuration(s.ms)}</td>
                      <td className="px-4 py-3 font-mono text-sm text-right text-ink/60">
                        {i === 0 ? '—' : `+${formatDuration(sectorMs)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-ink/40">{label}</p>
      <p className="font-mono text-lg font-medium mt-0.5">{value}</p>
    </div>
  );
}
