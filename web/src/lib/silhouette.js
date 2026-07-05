/**
 * Generador de siluetas de tramo, estilo diagrama de circuito de F1.
 *
 * Al pulsar "Generar silueta" se pide a OSRM (router público de
 * OpenStreetMap) la ruta REAL por carretera que pasa por
 * salida → referencias → meta, y la silueta se dibuja con esa
 * geometría (curvas incluidas). Si OSRM falla o no hay cobertura,
 * se dibuja el trazado recto entre puntos como plan B.
 *
 * Todo ocurre EN EL CLIENTE y solo bajo demanda: los tramos de
 * prueba no consumen almacenamiento. El SVG resultante pesa unos
 * pocos KB de texto.
 */

const W = 400;
const H = 280;
const PAD = 34;
const MAX_LINE_POINTS = 240; // límite de puntos del trazado en el SVG

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

/**
 * Genera la silueta siguiendo las carreteras reales (OSRM).
 * @param {Object} route - { start, end, checkpoints } con coord [lat, lng]
 * @returns {Promise<{svg: string, road: boolean}>}
 *          road=false → se usó el fallback de líneas rectas
 */
export async function generateSilhouette({ start, end, checkpoints = [] }) {
  if (!start?.coord || !end?.coord) return null;

  const waypoints = [start.coord, ...checkpoints.map((c) => c.coord), end.coord];

  try {
    const coordStr = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
    const res = await fetch(
      `${OSRM_URL}/${coordStr}?overview=full&geometries=geojson&steps=false`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json();

    if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates?.length >= 2) {
      // Geometría real de la carretera, en [lng, lat] → [lat, lng]
      const line = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      // Posición de cada parada ajustada ("snapped") a la carretera
      const snapped = (data.waypoints ?? []).map((w) => [w.location[1], w.location[0]]);
      const markers = snapped.length === waypoints.length ? snapped : waypoints;

      return { svg: buildSvg(decimate(line), markers, true), road: true };
    }
  } catch {
    /* sin red o sin ruta: caemos al trazado recto */
  }

  return { svg: buildSvg(waypoints, waypoints, false), road: false };
}

// ─────────────────────────────────────────────
// Construcción del SVG
// linePts: puntos del trazado; markerPts: salida + refs + meta
// smoothCorners: suavizar esquinas (solo para el fallback recto)
// ─────────────────────────────────────────────
function buildSvg(linePts, markerPts, isRoad) {
  const all = [...linePts, ...markerPts];

  // Proyección: corregir longitud por la latitud media
  const midLat = all.reduce((s, p) => s + p[0], 0) / all.length;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const proj = ([lat, lng]) => [lng * cosLat, lat];

  const pAll = all.map(proj);
  const xs = pAll.map((p) => p[0]);
  const ys = pAll.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
  const offX = (W - spanX * scale) / 2;
  const offY = (H - spanY * scale) / 2;

  const toSvg = (pt) => {
    const [x, y] = proj(pt);
    return [
      offX + (x - minX) * scale,
      H - (offY + (y - minY) * scale), // y invertida
    ];
  };

  const line = linePts.map(toSvg);
  const marks = markerPts.map(toSvg);

  // Carretera real: polilínea directa (ya trae las curvas).
  // Fallback recto: curvas cuadráticas para no clavar esquinas.
  const d = isRoad ? polyline(line) : smoothPath(line);

  const cpDots = marks
    .slice(1, -1)
    .map((p, i) => `
    <circle cx="${r(p[0])}" cy="${r(p[1])}" r="11" fill="#121212" stroke="#f2f1ec" stroke-width="2.5"/>
    <text x="${r(p[0])}" y="${r(p[1])}" text-anchor="middle" dominant-baseline="central"
          font-family="monospace" font-size="11" font-weight="bold" fill="#f2f1ec">${String(i + 1).padStart(2, '0')}</text>`)
    .join('');

  const s0 = marks[0];
  const sN = marks[marks.length - 1];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none">
  <path d="${d}" stroke="#f2f1ec" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${d}" stroke="#e63946" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${r(s0[0])}" cy="${r(s0[1])}" r="11" fill="#fcbf49" stroke="#121212" stroke-width="3"/>
  <circle cx="${r(sN[0])}" cy="${r(sN[1])}" r="11" fill="#386641" stroke="#121212" stroke-width="3"/>
  <text x="${r(sN[0])}" y="${r(sN[1])}" text-anchor="middle" dominant-baseline="central"
        font-family="monospace" font-size="10" font-weight="bold" fill="#f2f1ec">🏁</text>${cpDots}
</svg>`;
}

/** Reduce la densidad de puntos para que el SVG no engorde */
function decimate(pts) {
  if (pts.length <= MAX_LINE_POINTS) return pts;
  const step = (pts.length - 1) / (MAX_LINE_POINTS - 1);
  const out = [];
  for (let i = 0; i < MAX_LINE_POINTS; i++) {
    out.push(pts[Math.round(i * step)]);
  }
  return out;
}

function polyline(pts) {
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${r(p[0])} ${r(p[1])}`)
    .join(' ');
}

function smoothPath(pts) {
  if (pts.length === 2) {
    return `M ${r(pts[0][0])} ${r(pts[0][1])} L ${r(pts[1][0])} ${r(pts[1][1])}`;
  }
  let d = `M ${r(pts[0][0])} ${r(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i][0] + pts[i + 1][0]) / 2;
    const midY = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q ${r(pts[i][0])} ${r(pts[i][1])}, ${r(midX)} ${r(midY)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${r(last[0])} ${r(last[1])}`;
  return d;
}

function r(n) {
  return Math.round(n * 10) / 10;
}
