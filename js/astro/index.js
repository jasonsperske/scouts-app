/* High-level sky API used by the app.

   Everything is evaluated in the mean equator and equinox of date:
     observer   ECEF -> GMST rotation (Earth's rotation carries you along)
     Moon       Meeus truncated ELP, already of date
     planets    Keplerian elements (J2000), precessed to date
     features   IAU body-fixed frame -> J2000 -> precessed to date

   So the distance to a body is observer-to-centre, and the distance to a named
   feature is observer-to-that-actual-point: both the Earth's spin and the target
   body's spin move the number, which is the whole point of the exercise.

   Validated against JPL Horizons (DE441) — see README for the measured errors. */

import { timeContext } from './time.js';
import { add, sub, scale, length, sphericalToCartesian } from './vec.js';
import { eclipticToEquatorial, precessToDate, precessToJ2000, observerVector, horizontal } from './frames.js';
import { heliocentricEcliptic, AU_KM } from './planets.js';
import { moonEcliptic } from './moon.js';
import { surfaceDirection, subObserverPoint } from './rotation.js';
import { BODIES } from './catalog.js';

const MOON_MASS_RATIO = 0.0121505856;    // m_moon / (m_earth + m_moon)
const OBLIQUITY_J2000 = 23.439291111 * Math.PI / 180;

/* One instant of the solar system, memoised: a 10 Hz refresh asks for the same
   three instants over and over, once per row. */
const CACHE_LIMIT = 96;
const cache = new Map();

export function ephemerisAt(when) {
  const key = when.getTime();
  const hit = cache.get(key);
  if (hit) return hit;

  const time = timeContext(when);
  const { lonDeg, latDeg, distanceKm } = moonEcliptic(time.T);
  const moon = eclipticToEquatorial(sphericalToCartesian(lonDeg, latDeg, distanceKm), time.T);

  // Earth itself, not the Earth-Moon barycentre that the elements describe.
  const moonEclipticJ2000 = equatorialToEclipticJ2000(precessToJ2000(moon, time.T));
  const earth = sub(heliocentricEcliptic('embary', time.T), scale(moonEclipticJ2000, MOON_MASS_RATIO));

  const entry = { time, moon, earth, centres: new Map() };
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, entry);
  return entry;
}

function equatorialToEclipticJ2000(v) {
  const c = Math.cos(OBLIQUITY_J2000), s = Math.sin(OBLIQUITY_J2000);
  return [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]];
}

/** Geocentric position of a body centre, equatorial mean-of-date, km. */
export function bodyGeocentric(bodyId, eph) {
  if (bodyId === 'moon') return eph.moon;
  const cached = eph.centres.get(bodyId);
  if (cached) return cached;

  const helio = bodyId === 'sun' ? [0, 0, 0] : heliocentricEcliptic(bodyId, eph.time.T);
  const vec = precessToDate(eclipticToEquatorial(sub(helio, eph.earth), 0), eph.time.T);
  eph.centres.set(bodyId, vec);
  return vec;
}

/** Geocentric position of a body centre, or of a named point on its surface. */
export function targetGeocentric(place, eph) {
  const centre = bodyGeocentric(place.body, eph);
  if (!place.feature) return centre;
  const direction = surfaceDirection(place.body, place.feature.lat, place.feature.lon, eph.time.d, eph.time.T);
  if (!direction) return centre;
  return add(centre, precessToDate(scale(direction, BODIES[place.body].radiusKm), eph.time.T));
}

/** Straight-line observer-to-target distance in metres. The hot path. */
export function rangeMetres(place, site, when = new Date()) {
  const eph = ephemerisAt(when);
  const topocentric = sub(targetGeocentric(place, eph), observerVector(site, eph.time));
  return length(topocentric) * 1000;
}

/**
 * Full observation: distance, how fast it is changing, and where to look.
 * @param {{body:string, feature?:{lat:number, lon:number}}} place
 * @param {{lat:number, lon:number, height?:number}} site
 */
export function observe(place, site, when = new Date()) {
  const eph = ephemerisAt(when);
  const observer = observerVector(site, eph.time);
  const target = targetGeocentric(place, eph);
  const topocentric = sub(target, observer);
  const distanceKm = length(topocentric);

  // Central difference over 2 s: this is the number that makes the low-order
  // digits spin, so it is worth showing next to them.
  const step = 1000;
  const rangeRateKmS = (
    rangeMetres(place, site, new Date(when.getTime() + step))
    - rangeMetres(place, site, new Date(when.getTime() - step))
  ) / 1000 / (2 * step / 1000);

  return {
    distanceKm,
    distanceMetres: distanceKm * 1000,
    rangeRateKmS,
    ...horizontal(topocentric, site, eph.time),
    time: eph.time,
  };
}

/** Direction only — no range rate. Used by the per-tick row readout. */
export function look(place, site, when = new Date()) {
  const eph = ephemerisAt(when);
  const topocentric = sub(targetGeocentric(place, eph), observerVector(site, eph.time));
  return horizontal(topocentric, site, eph.time);
}

/** Where on the target body the observer is currently overhead. */
export function subEarthPoint(bodyId, site, when = new Date()) {
  const eph = ephemerisAt(when);
  const toObserver = precessToJ2000(
    sub(observerVector(site, eph.time), bodyGeocentric(bodyId, eph)),
    eph.time.T
  );
  return subObserverPoint(bodyId, toObserver, eph.time.d, eph.time.T);
}

function hourAngleAt(place, site, when) {
  const eph = ephemerisAt(when);
  const topocentric = sub(targetGeocentric(place, eph), observerVector(site, eph.time));
  return horizontal(topocentric, site, eph.time).hourAngle;
}

/**
 * Time until the target next crosses the observer's meridian.
 * Climbing towards the meridian (hour angle negative) counts down to the zenith
 * crossing; past it, the countdown runs to the nadir crossing under your feet.
 * @returns {{type:'zenith'|'nadir', at:Date, seconds:number}}
 */
export function nextCulmination(place, site, when = new Date()) {
  const start = hourAngleAt(place, site, when);
  const rising = start < 0;
  const goal = rising ? 0 : 12;

  // ~1.0027 hours of hour angle per hour of clock; the Moon's own eastward
  // motion slows that to ~0.97, so refine with a couple of secant steps.
  let rate = 1.0027;
  let seconds = ((goal - start) / rate) * 3600;

  for (let i = 0; i < 4; i++) {
    const probe = new Date(when.getTime() + seconds * 1000);
    let ha = hourAngleAt(place, site, probe);
    if (!rising && ha < 0) ha += 24;
    const error = ha - goal;
    if (Math.abs(error) < 1e-7) break;

    const delta = 300;
    const probe2 = new Date(probe.getTime() + delta * 1000);
    let ha2 = hourAngleAt(place, site, probe2);
    if (!rising && ha2 < 0) ha2 += 24;
    rate = (ha2 - ha) / (delta / 3600);
    if (!isFinite(rate) || Math.abs(rate) < 1e-6) break;
    seconds -= (error / rate) * 3600;
  }

  seconds = Math.max(0, seconds);
  return { type: rising ? 'zenith' : 'nadir', seconds, at: new Date(when.getTime() + seconds * 1000) };
}

export { AU_KM };
