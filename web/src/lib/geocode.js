/**
 * Geocoding con Nominatim (OpenStreetMap).
 * Gratis, sin API key. Límite: 1 req/segundo — respetarlo.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org';

let lastCall = 0;

async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, 1000 - (now - lastCall));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

/**
 * Busca un lugar por nombre y devuelve resultados con coordenadas.
 * @returns {Promise<Array<{ name, lat, lng }>>}
 */
export async function searchPlace(queryText) {
  if (!queryText || queryText.trim().length < 3) return [];

  await throttle();

  const params = new URLSearchParams({
    q: queryText,
    format: 'json',
    limit: '5',
    countrycodes: 'es', // sesgar a España
    'accept-language': 'es',
  });

  try {
    const res = await fetch(`${NOMINATIM}/search?${params}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((d) => ({
      name: d.display_name,
      shortName: d.name || d.display_name.split(',')[0],
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
    }));
  } catch (err) {
    console.error('Error en geocoding:', err);
    return [];
  }
}

/**
 * Geocoding inverso: coordenadas → nombre de lugar.
 */
export async function reverseGeocode(lat, lng) {
  await throttle();

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'json',
    'accept-language': 'es',
  });

  try {
    const res = await fetch(`${NOMINATIM}/reverse?${params}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.name || data.display_name?.split(',')[0] || null;
  } catch {
    return null;
  }
}
