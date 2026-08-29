/* Geolocation, great-circle distance, and place lookup (OpenStreetMap / Nominatim). */

const EARTH_RADIUS_M = 6371008.8; // IUGG mean radius

const toRad = deg => deg * Math.PI / 180;

/** Great-circle distance in metres between two {lat, lon} points. */
export function distanceMetres(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function currentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This browser has no geolocation support.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        at: pos.timestamp,
      }),
      err => reject(new Error(geolocationMessage(err))),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000, ...options }
    );
  });
}

function geolocationMessage(err) {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Location permission denied. Search for a place and set it as your location instead.';
    case err.POSITION_UNAVAILABLE:
      return 'Your position is not available right now.';
    case err.TIMEOUT:
      return 'Timed out waiting for your position.';
    default:
      return err.message || 'Could not read your location.';
  }
}

const COORD_RE = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/** Accept a raw "lat, lon" string as a result without hitting the network. */
export function parseCoordinates(text) {
  const m = COORD_RE.exec(text);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lon = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return {
    id: `coord:${lat},${lon}`,
    name: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    detail: 'Coordinates',
    lat, lon,
  };
}

const NOMINATIM = 'https://nominatim.openstreetmap.org';

/** Free-text place search. Returns [{id, name, detail, lat, lon}]. */
export async function searchPlaces(query, { signal } = {}) {
  const coords = parseCoordinates(query);
  if (coords) return [coords];

  const url = new URL('/search', NOMINATIM);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '8');
  url.searchParams.set('addressdetails', '0');

  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = await res.json();

  return data.map(r => {
    const full = r.display_name || '';
    const name = r.name && r.name.trim() ? r.name : full.split(',')[0];
    const detail = full.startsWith(name) ? full.slice(name.length).replace(/^,\s*/, '') : full;
    return {
      id: `osm:${r.osm_type || 'x'}:${r.osm_id || r.place_id}`,
      name,
      detail: detail || 'Place',
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
    };
  }).filter(p => isFinite(p.lat) && isFinite(p.lon));
}

/** Best-effort label for a coordinate, used to pre-fill "Save here". */
export async function describePoint({ lat, lon }, { signal } = {}) {
  const url = new URL('/reverse', NOMINATIM);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('zoom', '18');
  try {
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.name && data.name.trim()) return data.name.trim();
    if (data.display_name) return data.display_name.split(',').slice(0, 2).join(',').trim();
    return null;
  } catch {
    return null;
  }
}

export function formatCoords({ lat, lon }) {
  return `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
}
