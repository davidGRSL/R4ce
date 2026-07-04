/**
 * Utilidades geográficas para el modo Live.
 * Coordenadas siempre como [lat, lng] (formato Leaflet, igual que
 * los checkpoints guardados en routeGeojson.properties).
 */

const R = 6371000; // radio de la Tierra en metros

/** Distancia haversine en metros entre dos [lat, lng] */
export function distanceM([lat1, lng1], [lat2, lng2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Formatea metros a "230 m" o "1,2 km" */
export function formatDistance(m) {
  if (m == null) return '—';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Velocidad en km/h a partir de una GeolocationPosition (o null) */
export function speedKmh(position) {
  const s = position?.coords?.speed;
  if (s == null || Number.isNaN(s) || s < 0) return null;
  return s * 3.6;
}
