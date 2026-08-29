/* Reference frames.
   Working frame is the MEAN equator and equinox of date: the observer comes from
   ECEF via GMST, the Moon comes from a theory already referred to the mean equinox
   of date, and J2000 planet vectors are precessed forward. Nutation (< 17″) is
   deliberately left out — it is consistent across all three, and costs < 0.6 km. */

import { DEG, rotX, rotZ, cross, dot, normalize, scale, sub, length, cartesianToSpherical } from './vec.js';

const WGS84_A = 6378.137;               // km, equatorial radius
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);

/** Mean obliquity of the ecliptic, degrees (IAU 1980 / Meeus 22.2). */
export function meanObliquity(T) {
  return 23.439291111
    - 0.0130041667 * T
    - 1.638889e-7 * T * T
    + 5.036111e-7 * T * T * T;
}

/** Ecliptic -> equatorial, both of the same epoch. */
export function eclipticToEquatorial(v, T) {
  return rotX(v, meanObliquity(T) * DEG);
}

/** Equatorial -> ecliptic, both of the same epoch. */
export function equatorialToEcliptic(v, T) {
  return rotX(v, -meanObliquity(T) * DEG);
}

/* Precession of the equator, IAU 1976 (Lieske), J2000 -> mean equator of date.
   Angles in arcseconds. */
function precessionAngles(T) {
  const zeta  = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) / 3600;
  const z     = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) / 3600;
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) / 3600;
  return { zeta: zeta * DEG, z: z * DEG, theta: theta * DEG };
}

/** Precess an equatorial J2000 vector to the mean equator/equinox of date. */
export function precessToDate(v, T) {
  const { zeta, z, theta } = precessionAngles(T);
  return rotZ(rotX(rotZ(v, zeta), -theta), z);
}

/** Inverse of {@link precessToDate}. */
export function precessToJ2000(v, T) {
  const { zeta, z, theta } = precessionAngles(T);
  return rotZ(rotX(rotZ(v, -z), theta), -zeta);
}

/**
 * Observer position in the mean equator/equinox of date frame, km, geocentric.
 * @param {{lat:number, lon:number, height?:number}} site  geodetic degrees, height in metres
 */
export function observerVector(site, time) {
  const lat = site.lat * DEG;
  const lon = site.lon * DEG;
  const h = (site.height || 0) / 1000;
  const sinLat = Math.sin(lat);
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);

  // Earth-fixed (ITRF-ish, polar motion ignored: < 15 m).
  const ecef = [
    (n + h) * Math.cos(lat) * Math.cos(lon),
    (n + h) * Math.cos(lat) * Math.sin(lon),
    (n * (1 - WGS84_E2) + h) * sinLat,
  ];
  return rotZ(ecef, time.gmst * DEG);
}

/** Local geodetic "up" for a site, in the mean-of-date frame. */
export function observerZenith(site, time) {
  const lat = site.lat * DEG;
  const lon = (site.lon + time.gmst) * DEG;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

/**
 * Horizontal coordinates of a topocentric vector (target minus observer).
 * @returns {{altitude:number, azimuth:number, ra:number, dec:number, hourAngle:number}}
 *          degrees, plus hour angle in hours (-12..12, negative = still rising).
 */
export function horizontal(topocentric, site, time) {
  const { lonDeg: ra, latDeg: dec } = cartesianToSpherical(topocentric);

  let ha = time.gmst + site.lon - ra;           // degrees
  ha = ((ha % 360) + 360) % 360;
  if (ha > 180) ha -= 360;

  const latRad = site.lat * DEG;
  const decRad = dec * DEG;
  const haRad = ha * DEG;
  const sinAlt = Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt))) / DEG;
  const azimuth = (Math.atan2(
    Math.sin(haRad),
    Math.cos(haRad) * Math.sin(latRad) - Math.tan(decRad) * Math.cos(latRad)
  ) / DEG + 180) % 360;

  return { altitude, azimuth, ra, dec, hourAngle: ha / 15 };
}

export { WGS84_A };
