import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';

// Iconos de colores para los distintos tipos de punto
function makeIcon(color) {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width: 18px; height: 18px; border-radius: 50%;
      background: ${color}; border: 3px solid #fafaf7;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

const startIcon = makeIcon('#fcbf49'); // amarillo
const endIcon   = makeIcon('#386641'); // verde
const cpIcon    = makeIcon('#e63946'); // rojo

// Captura clics en el mapa
function ClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Recentra el mapa cuando cambian las coordenadas externamente (geocoding)
function Recenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

/**
 * MapPicker
 * props:
 *   start, end: { coord: [lat, lng], name } | null
 *   checkpoints: [{ coord: [lat,lng], name }]
 *   mode: 'start' | 'end' | 'checkpoint' — qué punto coloca el siguiente clic
 *   onMapClick(lat, lng)
 *   recenterTo: [lat, lng] | null
 */
export default function MapPicker({ start, end, checkpoints = [], onMapClick, recenterTo }) {
  const defaultCenter = start?.coord || [40.55, -1.10]; // Teruel aprox

  // Construir la línea: inicio → checkpoints → fin
  const linePoints = [];
  if (start?.coord) linePoints.push(start.coord);
  checkpoints.forEach((cp) => cp.coord && linePoints.push(cp.coord));
  if (end?.coord) linePoints.push(end.coord);

  return (
    <div className="h-[420px] border border-ink/10">
      <MapContainer
        center={defaultCenter}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onMapClick={onMapClick} />
        <Recenter center={recenterTo} />

        {linePoints.length >= 2 && (
          <Polyline positions={linePoints} color="#e63946" weight={3} opacity={0.6} dashArray="6 8" />
        )}

        {start?.coord && <Marker position={start.coord} icon={startIcon} />}
        {end?.coord   && <Marker position={end.coord}   icon={endIcon} />}
        {checkpoints.map((cp, i) =>
          cp.coord ? <Marker key={i} position={cp.coord} icon={cpIcon} /> : null
        )}
      </MapContainer>
    </div>
  );
}
