/* Body orientation: IAU/WGCCRE rotation models, used to put a named surface
   feature (a crater, a mare, a landing site) where it actually is right now.

   Each model gives the north pole direction (ra0, dec0) in the ICRF/J2000 frame
   and W, the angle of the body's prime meridian measured from the ascending node
   of its equator on the ICRF equator, increasing in the direction of rotation. */

import { DEG, cross, scale, add, normalize } from './vec.js';

const sinDeg = deg => Math.sin(deg * DEG);
const cosDeg = deg => Math.cos(deg * DEG);

/* Moon libration arguments E1..E13, degrees, d = days from J2000 TT. */
function moonE(d) {
  return [
    125.045 - 0.0529921 * d,
    250.089 - 0.1059842 * d,
    260.008 + 13.0120009 * d,
    176.625 + 13.3407154 * d,
    357.529 + 0.9856003 * d,
    311.589 + 26.4057084 * d,
    134.963 + 13.0649930 * d,
    276.617 + 0.3287146 * d,
    34.226 + 1.7484877 * d,
    15.134 - 0.1589763 * d,
    119.743 + 0.0036096 * d,
    239.961 + 0.1643573 * d,
    25.053 + 12.9590088 * d,
  ];
}

export const ROTATION = {
  sun: (d, T) => ({ ra0: 286.13, dec0: 63.87, w: 84.176 + 14.1844000 * d }),

  mercury: (d, T) => ({
    ra0: 281.0103 - 0.0328 * T,
    dec0: 61.4155 - 0.0049 * T,
    w: 329.5988 + 6.1385108 * d,
  }),

  venus: (d, T) => ({ ra0: 272.76, dec0: 67.16, w: 160.20 - 1.4813688 * d }),

  moon: (d, T) => {
    const E = moonE(d);
    const s = i => sinDeg(E[i - 1]);
    const c = i => cosDeg(E[i - 1]);
    return {
      ra0: 269.9949 + 0.0031 * T
        - 3.8787 * s(1) - 0.1204 * s(2) + 0.0700 * s(3) - 0.0172 * s(4)
        + 0.0072 * s(6) - 0.0052 * s(10) + 0.0043 * s(13),
      dec0: 66.5392 + 0.0130 * T
        + 1.5419 * c(1) + 0.0239 * c(2) - 0.0278 * c(3) + 0.0068 * c(4)
        - 0.0029 * c(6) + 0.0009 * c(7) + 0.0008 * c(10) - 0.0009 * c(13),
      w: 38.3213 + 13.17635815 * d - 1.4e-12 * d * d
        + 3.5610 * s(1) + 0.1208 * s(2) - 0.0642 * s(3) + 0.0158 * s(4)
        + 0.0252 * s(5) - 0.0066 * s(6) - 0.0047 * s(7) - 0.0046 * s(8)
        + 0.0028 * s(9) + 0.0052 * s(10) + 0.0040 * s(11) + 0.0019 * s(12)
        - 0.0044 * s(13),
    };
  },

  mars: (d, T) => ({
    ra0: 317.68143 - 0.1061 * T,
    dec0: 52.88650 - 0.0609 * T,
    w: 176.630 + 350.89198226 * d,
  }),

  jupiter: (d, T) => ({
    ra0: 268.056595 - 0.006499 * T,
    dec0: 64.495303 + 0.002413 * T,
    w: 284.95 + 870.5360000 * d,      // System III (radio)
  }),

  saturn: (d, T) => ({
    ra0: 40.589 - 0.036 * T,
    dec0: 83.537 - 0.004 * T,
    w: 38.90 + 810.7939024 * d,
  }),

  uranus: (d, T) => ({ ra0: 257.311, dec0: -15.175, w: 203.81 - 501.1600928 * d }),

  neptune: (d, T) => {
    const N = 357.85 + 52.316 * T;
    return {
      ra0: 299.36 + 0.70 * sinDeg(N),
      dec0: 43.46 - 0.51 * cosDeg(N),
      w: 249.978 + 541.1397757 * d - 0.48 * sinDeg(N),
    };
  },

  pluto: (d, T) => ({ ra0: 132.993, dec0: -6.163, w: 302.695 + 56.3625225 * d }),
};

/**
 * Unit vector, in equatorial J2000, pointing from a body's centre to a point at
 * planetocentric latitude `lat` and east longitude `lon` on its surface.
 */
export function surfaceDirection(bodyId, latDeg, lonDeg, d, T) {
  const model = ROTATION[bodyId];
  if (!model) return null;
  const { ra0, dec0, w } = model(d, T);

  // Pole, and the node of the body's equator on the ICRF equator (at ra0 + 90°).
  const pole = [
    cosDeg(dec0) * cosDeg(ra0),
    cosDeg(dec0) * sinDeg(ra0),
    sinDeg(dec0),
  ];
  const node = [-sinDeg(ra0), cosDeg(ra0), 0];

  // Prime meridian: the node rotated about the pole by W.
  const perp = cross(pole, node);
  const primeX = add(scale(node, cosDeg(w)), scale(perp, sinDeg(w)));
  const primeY = cross(pole, primeX);      // 90° east of the prime meridian

  return normalize(add(
    add(scale(primeX, cosDeg(latDeg) * cosDeg(lonDeg)), scale(primeY, cosDeg(latDeg) * sinDeg(lonDeg))),
    scale(pole, sinDeg(latDeg))
  ));
}

/**
 * Sub-observer point: where on the body the observer is directly overhead.
 * `toObserver` is the body-centre → observer vector in equatorial J2000.
 */
export function subObserverPoint(bodyId, toObserver, d, T) {
  const model = ROTATION[bodyId];
  if (!model) return null;
  const { ra0, dec0, w } = model(d, T);

  const pole = [cosDeg(dec0) * cosDeg(ra0), cosDeg(dec0) * sinDeg(ra0), sinDeg(dec0)];
  const node = [-sinDeg(ra0), cosDeg(ra0), 0];
  const perp = cross(pole, node);
  const primeX = add(scale(node, cosDeg(w)), scale(perp, sinDeg(w)));
  const primeY = cross(pole, primeX);

  const u = normalize(toObserver);
  const x = u[0] * primeX[0] + u[1] * primeX[1] + u[2] * primeX[2];
  const y = u[0] * primeY[0] + u[1] * primeY[1] + u[2] * primeY[2];
  const z = u[0] * pole[0] + u[1] * pole[1] + u[2] * pole[2];

  return {
    lonDeg: ((Math.atan2(y, x) / DEG) + 360) % 360,
    latDeg: Math.asin(Math.max(-1, Math.min(1, z))) / DEG,
  };
}
