/* Unit definitions and distance formatting. Everything is metres internally. */

export const UNITS = [
  { id: 'mm', name: 'Millimetres',  symbol: 'mm', metres: 0.001 },
  { id: 'cm', name: 'Centimetres',  symbol: 'cm', metres: 0.01 },
  { id: 'm',  name: 'Metres',       symbol: 'm',  metres: 1 },
  { id: 'km', name: 'Kilometres',   symbol: 'km', metres: 1000 },
  { id: 'in', name: 'Inches',       symbol: 'in', metres: 0.0254 },
  { id: 'ft', name: 'Feet',         symbol: 'ft', metres: 0.3048 },
  { id: 'yd', name: 'Yards',        symbol: 'yd', metres: 0.9144 },
  { id: 'mi', name: 'Miles',        symbol: 'mi', metres: 1609.344 },
  { id: 'au', name: 'Astronomical units', symbol: 'AU', metres: 1.495978707e11 },
  { id: 'ly', name: 'Light years',  symbol: 'ly', metres: 9.4607304725808e15 },
];

export const UNIT_BY_ID = Object.fromEntries(UNITS.map(u => [u.id, u]));

/* Ladder used by "human units": the largest unit where the value is still >= 1. */
const HUMAN_LADDER = ['ly', 'au', 'km', 'm', 'cm', 'mm'];

export function pickHumanUnit(metres) {
  const abs = Math.abs(metres);
  if (abs === 0) return UNIT_BY_ID.m;
  for (const id of HUMAN_LADDER) {
    if (abs >= UNIT_BY_ID[id].metres) return UNIT_BY_ID[id];
  }
  return UNIT_BY_ID.mm;
}

const SUPERSCRIPTS = { '-': '\u207b', '+': '', '0': '\u2070', '1': '\u00b9', '2': '\u00b2', '3': '\u00b3',
  '4': '\u2074', '5': '\u2075', '6': '\u2076', '7': '\u2077', '8': '\u2078', '9': '\u2079' };

function superscript(exponent) {
  return String(exponent).replace(/^\+?0*(?=\d)/, '').split('').map(c => SUPERSCRIPTS[c] ?? c).join('');
}

function formatNumber(value) {
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e9 || abs < 1e-3)) {
    const [mantissa, exponent] = value.toExponential(2).split('e');
    return `${mantissa} × 10${superscript(exponent)}`;
  }
  let digits;
  if (abs >= 100) digits = 0;
  else if (abs >= 10) digits = 1;
  else if (abs >= 1) digits = 2;
  else digits = 3;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

/**
 * Format a distance for display.
 * @param {number} metres
 * @param {object} mode  { kind: 'human' } | { kind: 'unit', unitId } | { kind: 'place', name, metres }
 * @returns {{value: string, suffix: string}}
 */
export function formatDistance(metres, mode) {
  if (!isFinite(metres)) return { value: '—', suffix: '' };

  if (mode.kind === 'place') {
    if (!mode.metres || mode.metres < 1) return { value: '—', suffix: mode.name };
    const ratio = metres / mode.metres;
    return { value: formatNumber(ratio) + '×', suffix: mode.name };
  }

  const unit = mode.kind === 'unit' ? UNIT_BY_ID[mode.unitId] : pickHumanUnit(metres);
  return { value: formatNumber(metres / unit.metres), suffix: unit.symbol };
}

/** Short label shown on the bottom bar chip. */
export function modeLabel(mode) {
  if (mode.kind === 'human') return 'human units';
  if (mode.kind === 'unit') {
    const u = UNIT_BY_ID[mode.unitId];
    return `${u.name.toLowerCase()} (${u.symbol})`;
  }
  return `${mode.name} units`;
}

/** One-line example of a unit's size, for the picker. */
export function unitExample(unit) {
  const oneKm = 1000 / unit.metres;
  return `1 km = ${formatNumber(oneKm)} ${unit.symbol}`;
}
