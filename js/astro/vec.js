/* Tiny 3-vector / rotation helpers. Vectors are plain [x, y, z] arrays in km. */

export const DEG = Math.PI / 180;

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = a => Math.hypot(a[0], a[1], a[2]);
export const normalize = a => scale(a, 1 / length(a));

export function rotX(v, angleRad) {
  const c = Math.cos(angleRad), s = Math.sin(angleRad);
  return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]];
}

export function rotZ(v, angleRad) {
  const c = Math.cos(angleRad), s = Math.sin(angleRad);
  return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]];
}

/** Spherical (deg, deg, radius) -> cartesian. */
export function sphericalToCartesian(lonDeg, latDeg, radius) {
  const lon = lonDeg * DEG, lat = latDeg * DEG;
  const cl = Math.cos(lat);
  return [radius * cl * Math.cos(lon), radius * cl * Math.sin(lon), radius * Math.sin(lat)];
}

/** Cartesian -> {lonDeg, latDeg, radius}; lon normalised to [0, 360). */
export function cartesianToSpherical(v) {
  const radius = length(v);
  const lon = Math.atan2(v[1], v[0]) / DEG;
  return {
    lonDeg: (lon + 360) % 360,
    latDeg: Math.asin(v[2] / radius) / DEG,
    radius,
  };
}

export function normalizeDegrees(deg) {
  return ((deg % 360) + 360) % 360;
}

/** Wrap to (-180, 180]. */
export function wrapDegrees(deg) {
  const d = normalizeDegrees(deg);
  return d > 180 ? d - 360 : d;
}
