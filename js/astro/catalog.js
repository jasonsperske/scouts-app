/* The sky half of the place list: bodies, and named spots on their surfaces. */

/* accuracyKm / surfaceKm are MEASURED against JPL Horizons (DE441) over
   2026-2029: the worst distance error of the model, and the worst placement
   error of a point on the body's surface. They are shown in the app so nobody
   mistakes a millimetre readout for millimetre truth. */
export const BODIES = {
  sun:     { id: 'sun',     name: 'The Sun',  kind: 'star',   radiusKm: 695700,  icon: 'light_mode', accuracyKm: 8e3 },
  mercury: { id: 'mercury', name: 'Mercury',  kind: 'planet', radiusKm: 2439.7,  icon: 'planet', accuracyKm: 11e3, surfaceKm: 0.2 },
  venus:   { id: 'venus',   name: 'Venus',    kind: 'planet', radiusKm: 6051.8,  icon: 'planet', accuracyKm: 23e3, surfaceKm: 1 },
  moon:    { id: 'moon',    name: 'The Moon', kind: 'moon',   radiusKm: 1737.4,  icon: 'dark_mode', accuracyKm: 25, surfaceKm: 6 },
  mars:    { id: 'mars',    name: 'Mars',     kind: 'planet', radiusKm: 3396.19, icon: 'planet', accuracyKm: 35e3, surfaceKm: 0.5 },
  jupiter: { id: 'jupiter', name: 'Jupiter',  kind: 'planet', radiusKm: 71492,   icon: 'planet', accuracyKm: 420e3, surfaceKm: 10 },
  saturn:  { id: 'saturn',  name: 'Saturn',   kind: 'planet', radiusKm: 60268,   icon: 'planet', accuracyKm: 1.2e6, surfaceKm: 100 },
  uranus:  { id: 'uranus',  name: 'Uranus',   kind: 'planet', radiusKm: 25559,   icon: 'planet', accuracyKm: 1e6, surfaceKm: 10 },
  neptune: { id: 'neptune', name: 'Neptune',  kind: 'planet', radiusKm: 24764,   icon: 'planet', accuracyKm: 330e3, surfaceKm: 5 },
  pluto:   { id: 'pluto',   name: 'Pluto',    kind: 'planet', radiusKm: 1188.3,  icon: 'planet', accuracyKm: 620e3, surfaceKm: 0.2 },
};

/* Planetocentric latitude and EAST longitude, IAU body-fixed frames. */
export const FEATURES = [
  { id: 'tranquillitatis', body: 'moon', name: 'Sea of Tranquillity', lat: 8.5, lon: 31.4,
    detail: 'Mare Tranquillitatis, the Moon' },
  { id: 'apollo11', body: 'moon', name: 'Apollo 11 landing site', lat: 0.6741, lon: 23.4730,
    detail: 'Tranquility Base, the Moon' },
  { id: 'tycho', body: 'moon', name: 'Tycho crater', lat: -43.31, lon: 348.68,
    detail: 'Southern highlands, the Moon' },
  { id: 'copernicus', body: 'moon', name: 'Copernicus crater', lat: 9.62, lon: 339.92,
    detail: 'Mare Insularum, the Moon' },
  { id: 'olympus', body: 'mars', name: 'Olympus Mons', lat: 18.65, lon: 226.2,
    detail: 'Tharsis, Mars — 22 km tall' },
  { id: 'marineris', body: 'mars', name: 'Valles Marineris', lat: -14.0, lon: 301.4,
    detail: 'Equatorial canyon system, Mars' },
  { id: 'gale', body: 'mars', name: 'Gale Crater', lat: -4.5895, lon: 137.4417,
    detail: 'Curiosity landing site, Mars' },
  { id: 'jezero', body: 'mars', name: 'Jezero Crater', lat: 18.4447, lon: 77.4508,
    detail: 'Perseverance landing site, Mars' },
  { id: 'caloris', body: 'mercury', name: 'Caloris Planitia', lat: 30.5, lon: 170.0,
    detail: 'Impact basin, Mercury' },
  { id: 'maxwell', body: 'venus', name: 'Maxwell Montes', lat: 65.2, lon: 3.3,
    detail: 'Ishtar Terra, Venus' },
];

/** Everything the search box can offer from the sky, as place-shaped records. */
export function celestialCatalog() {
  const entries = Object.values(BODIES).map(body => ({
    id: `sky:${body.id}`,
    name: body.name,
    detail: body.kind === 'star' ? 'Star · centre'
      : body.kind === 'moon' ? "Earth's moon · centre"
      : 'Planet · centre',
    kind: 'sky',
    body: body.id,
  }));

  const features = FEATURES.map(feature => ({
    id: `sky:${feature.body}:${feature.id}`,
    name: feature.name,
    detail: feature.detail,
    kind: 'sky',
    body: feature.body,
    feature: { id: feature.id, lat: feature.lat, lon: feature.lon },
  }));

  return [...entries, ...features];
}

export function searchCelestial(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return celestialCatalog().filter(entry =>
    entry.name.toLowerCase().includes(q) || entry.detail.toLowerCase().includes(q)
  ).slice(0, 6);
}
