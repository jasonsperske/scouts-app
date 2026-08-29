/* Time scales and sidereal time.
   Clock input is UTC (the device clock). TT = UTC + 69.184 s, which has been
   exact since the last leap second (2017) and stays exact until the next one.
   UT1 - UTC is ignored (< 0.9 s, i.e. < 0.5 km of Earth rotation). */

export const TT_MINUS_UTC = 69.184;           // seconds
export const J2000 = 2451545.0;               // JD of 2000-01-01T12:00 TT
export const DAY_MS = 86400000;

/** Julian Date on the UTC scale. */
export function julianDateUTC(date) {
  return date.getTime() / DAY_MS + 2440587.5;
}

/** Everything downstream needs the same handful of numbers, so build them once. */
export function timeContext(date) {
  const jdUT = julianDateUTC(date);
  const jdTT = jdUT + TT_MINUS_UTC / 86400;
  return {
    date,
    jdUT,
    jdTT,
    d: jdTT - J2000,                 // days from J2000 (TT ≈ TDB here)
    T: (jdTT - J2000) / 36525,       // Julian centuries TT
    gmst: gmstDegrees(jdUT),
  };
}

/** Greenwich mean sidereal time in degrees (Meeus 12.4). */
export function gmstDegrees(jdUT) {
  const t = (jdUT - J2000) / 36525;
  const theta = 280.46061837
    + 360.98564736629 * (jdUT - J2000)
    + 0.000387933 * t * t
    - (t * t * t) / 38710000;
  return ((theta % 360) + 360) % 360;
}
