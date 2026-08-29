/* Geolocation, great-circle distance, and place lookup (OpenStreetMap / Nominatim). */

const EARTH_RADIUS_M = 6371008.8;      // IUGG mean radius, for the fallback only

/* WGS84 — the ellipsoid GPS itself reports against. */
const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_B = WGS84_A * (1 - WGS84_F);
const ANTIPODAL_METRES = 20003931.5;   // half the meridional circumference

const toRad = deg => deg * Math.PI / 180;

/** Great-circle distance on a sphere of mean radius — kept for comparison. */
export function greatCircleMetres(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Distance across the WGS84 ellipsoid — Vincenty's inverse solution, accurate to
 * well under a millimetre. It is the great-circle formula that is the crude one:
 * a sphere of mean radius is off by up to half a percent, which is 45 km on a
 * transatlantic hop.
 *
 * The iteration is known not to converge for very nearly antipodal points, so
 * that case falls back to the sphere and says so.
 * @returns {{metres:number, method:'geodesic'|'great-circle'}}
 */
export function surfaceDistance(a, b) {
  const L = toRad(b.lon - a.lon);
  const tanU1 = (1 - WGS84_F) * Math.tan(toRad(a.lat));
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
  const sinU1 = tanU1 * cosU1;
  const tanU2 = (1 - WGS84_F) * Math.tan(toRad(b.lat));
  const cosU2 = 1 / Math.sqrt(1 + tanU2 * tanU2);
  const sinU2 = tanU2 * cosU2;

  /* The geometry that hangs off a trial λ (the longitude difference on the
     auxiliary sphere). Vincenty's iteration is the fixed point of `next`. */
  const evaluate = lambda => {
    const sinLambda = Math.sin(lambda), cosLambda = Math.cos(lambda);
    const sinSigma = Math.hypot(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda);
    const cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    const sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = sinSigma === 0 ? 0 : cosU1 * cosU2 * sinLambda / sinSigma;
    const cosSqAlpha = 1 - sinAlpha * sinAlpha;
    // cosSqAlpha is 0 along the equator, where cos(2σm) is undefined.
    const cos2SigmaM = cosSqAlpha === 0 ? 0 : cosSigma - 2 * sinU1 * sinU2 / cosSqAlpha;
    const C = WGS84_F / 16 * cosSqAlpha * (4 + WGS84_F * (4 - 3 * cosSqAlpha));
    const next = L + (1 - C) * WGS84_F * sinAlpha
      * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    return { sinSigma, cosSigma, sigma, cosSqAlpha, cos2SigmaM, next };
  };

  const lengthOf = state => {
    const uSq = state.cosSqAlpha * (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_B * WGS84_B);
    const A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
    const B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
    const { sinSigma, cosSigma, cos2SigmaM, sigma } = state;
    const deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (
      cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)
      - B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)
    ));
    return WGS84_B * A * (sigma - deltaSigma);
  };

  /* Vincenty's iteration is undamped (step = 1). For nearly antipodal points it
     oscillates around the root instead of settling, so retry with progressively
     shorter steps, which converges on the same root without overshooting. */
  for (const [step, maxIterations] of [[1, 100], [0.5, 4000], [0.25, 8000], [0.1, 20000]]) {
    let lambda = L;
    for (let i = 0; i < maxIterations; i++) {
      const state = evaluate(lambda);
      if (state.sinSigma === 0) return { metres: 0, method: 'geodesic' };   // coincident
      const delta = state.next - lambda;
      if (Math.abs(delta) < 1e-12) return { metres: lengthOf(state), method: 'geodesic' };
      lambda += step * delta;
    }
  }

  /* Left over: points that are antipodal to within a whisker. There the shortest
     path is not unique — every route over a pole is equally short — and Vincenty's
     formulation cannot express it. Half the meridional circumference is the exact
     answer for a true antipode, and within ~25 km for its neighbourhood. */
  return { metres: ANTIPODAL_METRES, method: 'antipodal' };
}

/** Distance in metres between two {lat, lon} points on the Earth's surface. */
export function distanceMetres(a, b) {
  return surfaceDistance(a, b).metres;
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
