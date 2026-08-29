/* Heliocentric planet positions from JPL's "Approximate Positions of the Major
   Planets" Keplerian elements (Standish), the 1800 AD – 2050 AD set.
   Elements: a (au), e, I (deg), L (deg), longPeri (deg), longNode (deg), plus
   per-century rates. Good to roughly an arcminute of angle over the valid range. */

import { DEG } from './vec.js';

const AU_KM = 149597870.7;

const ELEMENTS = {
  mercury: {
    a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], i: [7.00497902, -0.00594749],
    L: [252.25032350, 149472.67411175], peri: [77.45779628, 0.16047689], node: [48.33076593, -0.12534081],
  },
  venus: {
    a: [0.72333566, 0.00000390], e: [0.00677672, -0.00004107], i: [3.39467605, -0.00078890],
    L: [181.97909950, 58517.81538729], peri: [131.60246718, 0.00268329], node: [76.67984255, -0.27769418],
  },
  embary: {
    a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], i: [-0.00001531, -0.01294668],
    L: [100.46457166, 35999.37244981], peri: [102.93768193, 0.32327364], node: [0.0, 0.0],
  },
  mars: {
    a: [1.52371034, 0.00001847], e: [0.09339410, 0.00007882], i: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499], peri: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343],
  },
  jupiter: {
    a: [5.20288700, -0.00011607], e: [0.04838624, -0.00013253], i: [1.30439695, -0.00183714],
    L: [34.39644051, 3034.74612775], peri: [14.72847983, 0.21252668], node: [100.47390909, 0.20469106],
  },
  saturn: {
    a: [9.53667594, -0.00125060], e: [0.05386179, -0.00050991], i: [2.48599187, 0.00193609],
    L: [49.95424423, 1222.49362201], peri: [92.59887831, -0.41897216], node: [113.66242448, -0.28867794],
  },
  uranus: {
    a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], i: [0.77263783, -0.00242939],
    L: [313.23810451, 428.48202785], peri: [170.95427630, 0.40805281], node: [74.01692503, 0.04240589],
  },
  neptune: {
    a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105], i: [1.77004347, 0.00035372],
    L: [-55.12002969, 218.45945325], peri: [44.96476227, -0.32241464], node: [131.78422574, -0.00508664],
  },
  pluto: {
    a: [39.48211675, -0.00031596], e: [0.24882730, 0.00005170], i: [17.14001206, 0.00004818],
    L: [238.92903833, 145.20780515], peri: [224.06891629, -0.04062942], node: [110.30393684, -0.01183482],
  },
};

export const PLANET_IDS = Object.keys(ELEMENTS).filter(id => id !== 'embary');

function solveKepler(M, e) {
  // M in radians; Newton-Raphson converges in a handful of steps for e < 0.25.
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 12; i++) {
    const dM = M - (E - e * Math.sin(E));
    const dE = dM / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/** Heliocentric ecliptic J2000 position in km. */
export function heliocentricEcliptic(id, T) {
  const el = ELEMENTS[id];
  if (!el) throw new Error(`Unknown planet: ${id}`);

  const a = el.a[0] + el.a[1] * T;
  const e = el.e[0] + el.e[1] * T;
  const i = (el.i[0] + el.i[1] * T) * DEG;
  const L = el.L[0] + el.L[1] * T;
  const peri = el.peri[0] + el.peri[1] * T;
  const node = (el.node[0] + el.node[1] * T) * DEG;

  const argPeri = (peri * DEG) - node;
  let M = (L - peri) % 360;
  if (M > 180) M -= 360;
  if (M < -180) M += 360;

  const E = solveKepler(M * DEG, e);
  // Position in the orbital plane, then rotate into the ecliptic.
  const xv = a * (Math.cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const cosO = Math.cos(node), sinO = Math.sin(node);
  const cosW = Math.cos(argPeri), sinW = Math.sin(argPeri);
  const cosI = Math.cos(i), sinI = Math.sin(i);

  const x = (cosW * cosO - sinW * sinO * cosI) * xv + (-sinW * cosO - cosW * sinO * cosI) * yv;
  const y = (cosW * sinO + sinW * cosO * cosI) * xv + (-sinW * sinO + cosW * cosO * cosI) * yv;
  const z = (sinW * sinI) * xv + (cosW * sinI) * yv;

  return [x * AU_KM, y * AU_KM, z * AU_KM];
}

export { AU_KM };
