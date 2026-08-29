/* Nearabouts — a static SPA that ranks places by how far they are from you,
   whether they are down the road or on another planet. */

import { allPlaces, putPlace, removePlace, newId, loadSettings, saveSettings } from './db.js';
import { UNITS, UNIT_BY_ID, formatDistance, modeLabel, unitExample } from './units.js';
import { distanceMetres, currentPosition, searchPlaces, describePoint, formatCoords } from './geo.js';
import { initDragToTarget } from './drag.js';
import { BODIES, searchCelestial } from './astro/catalog.js';
import { rangeMetres, look, observe, nextCulmination, subEarthPoint } from './astro/index.js';

const $ = id => document.getElementById(id);

const el = {
  appBar: document.querySelector('.app-bar'),
  sortBtn: $('sortBtn'), sortIcon: $('sortIcon'), locBtn: $('locBtn'),
  search: $('search'), searchSpinner: $('searchSpinner'), clearSearch: $('clearSearch'),
  results: $('results'),
  banner: $('banner'),
  places: $('places'), emptyState: $('emptyState'),
  fab: $('fab'),
  unitBar: $('unitBar'), unitBtn: $('unitBtn'), unitLabel: $('unitLabel'),
  unitIcon: $('unitIcon'), unitHint: $('unitHint'),
  unitSheet: $('unitSheet'), unitList: $('unitList'),
  skySheet: $('skySheet'), skyBody: $('skyBody'), skyTitle: $('skySheetTitle'),
  nameDialog: $('nameDialog'), nameForm: $('nameForm'), nameInput: $('nameInput'),
  nameDialogTitle: $('nameDialogTitle'), nameSubmit: $('nameSubmit'), nameSupport: $('nameSupport'),
  confirmDialog: $('confirmDialog'), confirmText: $('confirmText'), confirmOk: $('confirmOk'),
  menu: $('menu'), snackbar: $('snackbar'), dragGhost: $('dragGhost'),
};

const DEFAULT_SETTINGS = {
  unitKind: 'human',   // 'human' | 'unit' | 'place'
  unitId: 'km',
  refPlaceId: null,
  sortAsc: true,
  manualOrigin: null,
  seeded: false,
  seededSky: false,
};

const state = {
  settings: loadSettings(DEFAULT_SETTINGS),
  places: [],
  origin: null,          // {lat, lon, height, source: 'gps' | 'manual'}
  originError: null,
  locating: false,
  results: [],
  searching: false,
  searchError: null,
  now: new Date(),
  order: [],             // place ids, in display order
  rows: new Map(),       // place id -> {li, distance, meta}
  culminations: new Map(),
};

const SEED_PLACES = [
  { name: 'Disneyland',         detail: 'Anaheim, California', lat: 33.8121,  lon: -117.9190 },
  { name: 'Statue of Liberty',  detail: 'New York, USA',       lat: 40.6892,  lon: -74.0445 },
  { name: 'Eiffel Tower',       detail: 'Paris, France',       lat: 48.8584,  lon: 2.2945 },
  { name: 'Mount Everest',      detail: 'Nepal / Tibet',       lat: 27.9881,  lon: 86.9250 },
  { name: 'Sydney Opera House', detail: 'Sydney, Australia',   lat: -33.8568, lon: 151.2153 },
];

const SEED_SKY = [
  { name: 'The Moon', detail: "Earth's moon · centre", body: 'moon' },
  { name: 'Sea of Tranquillity', detail: 'Mare Tranquillitatis, the Moon', body: 'moon',
    feature: { id: 'tranquillitatis', lat: 8.5, lon: 31.4 } },
  { name: 'Mars', detail: 'Planet · centre', body: 'mars' },
  { name: 'Olympus Mons', detail: 'Tharsis, Mars — 22 km tall', body: 'mars',
    feature: { id: 'olympus', lat: 18.65, lon: 226.2 } },
  { name: 'Jupiter', detail: 'Planet · centre', body: 'jupiter' },
  { name: 'The Sun', detail: 'Star · centre', body: 'sun' },
];

/* ---------------------------------------------------------------- state */

const persist = () => saveSettings(state.settings);

const isSky = place => place.kind === 'sky';

function site() {
  return state.origin && { lat: state.origin.lat, lon: state.origin.lon, height: state.origin.height || 0 };
}

/** Distance from the observer to a place, in metres. NaN when we have no fix. */
function placeMetres(place, when = state.now) {
  if (!state.origin) return NaN;
  if (isSky(place)) return rangeMetres(place, site(), when);
  return distanceMetres(state.origin, place);
}

function currentMode() {
  const s = state.settings;
  if (s.unitKind === 'place') {
    const ref = state.places.find(p => p.id === s.refPlaceId);
    if (ref) {
      return { kind: 'place', name: ref.name, placeId: ref.id, metres: placeMetres(ref) || 0 };
    }
    return { kind: 'human' };
  }
  if (s.unitKind === 'unit' && UNIT_BY_ID[s.unitId]) return { kind: 'unit', unitId: s.unitId };
  return { kind: 'human' };
}

function orderedIds() {
  const measured = state.places.map(p => ({ id: p.id, name: p.name, metres: placeMetres(p) }));
  measured.sort((a, b) => {
    const aOk = isFinite(a.metres), bOk = isFinite(b.metres);
    if (!aOk && !bOk) return a.name.localeCompare(b.name);
    if (!aOk) return 1;
    if (!bOk) return -1;
    return state.settings.sortAsc ? a.metres - b.metres : b.metres - a.metres;
  });
  return measured.map(m => m.id);
}

/* ---------------------------------------------------------------- format */

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

function formatSigned(value, digits, unit) {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}${unit}`;
}

/** Cached because solving for the meridian crossing is far heavier than a tick. */
function culminationFor(place) {
  if (!isSky(place) || !state.origin) return null;
  const cached = state.culminations.get(place.id);
  if (cached && state.now - cached.computedAt < 30000 && cached.at > state.now) return cached;

  const next = nextCulmination(place, site(), state.now);
  const entry = { ...next, computedAt: state.now };
  state.culminations.set(place.id, entry);
  return entry;
}

/** The live line under a sky place: where it is now, and when it crosses. */
function skyTelemetry(place) {
  const view = look(place, site(), state.now);
  const culmination = culminationFor(place);
  const parts = [`${formatSigned(view.altitude, 0, '°')} altitude`];
  if (culmination) {
    const remaining = (culmination.at - state.now) / 1000;
    parts.push(`${culmination.type === 'zenith' ? '↑ zenith' : '↓ nadir'} in ${formatDuration(remaining)}`);
  }
  return parts.join(' · ');
}

/* ---------------------------------------------------------------- render */

function render() {
  renderPlaces();
  renderUnitBar();
  renderBanner();
  renderSort();
  restartClock();
}

function renderSort() {
  const asc = state.settings.sortAsc;
  el.sortIcon.textContent = asc ? 'arrow_upward' : 'arrow_downward';
  el.sortBtn.setAttribute('aria-pressed', String(!asc));
  el.sortBtn.title = asc ? 'Nearest first' : 'Farthest first';
}

function renderPlaces() {
  state.rows.clear();
  state.order = orderedIds();
  const byId = new Map(state.places.map(p => [p.id, p]));
  el.places.replaceChildren(...state.order.map(id => placeRow(byId.get(id))));
  el.emptyState.hidden = state.places.length > 0;
}

function placeRow(place) {
  const mode = currentMode();
  const isRef = mode.kind === 'place' && mode.placeId === place.id;
  const sky = isSky(place);

  const li = document.createElement('li');
  li.className = 'place';
  li.dataset.id = place.id;
  if (isRef) li.classList.add('place--reference');
  if (sky) li.classList.add('place--sky');

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'place__handle';
  handle.title = 'Drag onto the unit bar to measure in this place’s units';
  handle.innerHTML = '<span class="ms" aria-hidden="true">drag_indicator</span>';
  handle.append(srOnly(`Drag ${place.name} to use as unit`));

  const avatar = document.createElement('div');
  avatar.className = 'place__avatar';
  const icon = isRef ? 'straighten' : sky ? (BODIES[place.body]?.icon || 'planet') : 'location_on';
  avatar.innerHTML = `<span class="ms" aria-hidden="true">${icon}</span>`;

  const text = document.createElement('div');
  text.className = 'place__text';
  const name = document.createElement('div');
  name.className = 'place__name';
  name.textContent = place.name;
  const meta = document.createElement('div');
  meta.className = 'place__meta';
  text.append(name, meta);

  let telemetry = null;
  if (sky) {
    telemetry = document.createElement('div');
    telemetry.className = 'place__telemetry';
    text.append(telemetry);
  }

  const distance = document.createElement('div');
  distance.className = 'place__distance';
  distance.innerHTML = '<span></span><small></small>';

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'icon-button icon-button--small';
  more.dataset.menu = place.id;
  more.innerHTML = '<span class="ms" aria-hidden="true">more_vert</span>';
  more.append(srOnly(`Options for ${place.name}`));

  li.append(handle, avatar, text, distance, more);
  const row = { li, distance, meta, telemetry };
  state.rows.set(place.id, row);
  paintRow(place, row, mode, isRef);
  return li;
}

function paintRow(place, row, mode, isRef) {
  const metres = placeMetres(place);

  const parts = [];
  if (isRef) parts.push('unit reference');
  parts.push(place.detail || (isSky(place) ? BODIES[place.body].name : formatCoords(place)));
  row.meta.textContent = parts.filter(Boolean).join(' · ');
  if (row.telemetry) row.telemetry.textContent = state.origin ? skyTelemetry(place) : '';

  const value = row.distance.firstChild;
  const suffix = row.distance.lastChild;
  if (!isFinite(metres)) {
    value.textContent = '—';
    suffix.textContent = 'need location';
  } else {
    const formatted = formatDistance(metres, mode);
    value.textContent = formatted.value;
    suffix.textContent = formatted.suffix;
  }
  row.distance.classList.toggle('place__distance--long', value.textContent.length > 13);
}

function srOnly(text) {
  const span = document.createElement('span');
  span.className = 'sr-only';
  span.textContent = text;
  return span;
}

function renderUnitBar() {
  const mode = currentMode();
  el.unitLabel.textContent = modeLabel(mode);
  const custom = mode.kind === 'place';
  el.unitBtn.classList.toggle('unit-chip--custom', custom);
  el.unitIcon.textContent = custom ? 'straighten' : (mode.kind === 'human' ? 'auto_awesome' : 'square_foot');
  el.unitHint.textContent = custom
    ? `1× = your distance to ${mode.name}. Tap to change.`
    : 'Drag a place here to measure in its units';
}

function renderBanner() {
  if (state.origin && !state.originError) {
    el.banner.hidden = true;
    return;
  }
  el.banner.hidden = false;
  el.banner.replaceChildren();
  const icon = document.createElement('span');
  icon.className = 'ms';
  icon.textContent = state.locating ? 'my_location' : 'location_disabled';
  const text = document.createElement('div');
  text.className = 'banner__text';
  text.textContent = state.locating
    ? 'Finding your location…'
    : (state.originError || 'Your location is needed to rank places by distance.');
  el.banner.append(icon, text);
  if (!state.locating) {
    const retry = document.createElement('button');
    retry.className = 'button button--text';
    retry.type = 'button';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => locate());
    el.banner.append(retry);
  }
}

/* ---------------------------------------------------------------- the clock */

let clockId = null;

/** How often the readout can visibly change decides how often we recompute. */
function tickInterval() {
  const mode = currentMode();
  if (mode.kind === 'unit') {
    return UNIT_BY_ID[mode.unitId].metres <= 1609.344 ? 100 : 1000;
  }
  return mode.kind === 'place' ? 250 : 100;
}

function restartClock() {
  clearInterval(clockId);
  clockId = null;
  if (document.hidden || !state.origin) return;
  if (!state.places.some(isSky)) return;      // nothing on Earth moves on its own
  clockId = setInterval(tick, tickInterval());
}

function tick() {
  state.now = new Date();
  const mode = currentMode();
  const byId = new Map(state.places.map(p => [p.id, p]));

  for (const [id, row] of state.rows) {
    const place = byId.get(id);
    if (!place) continue;
    if (!isSky(place) && mode.kind !== 'place') continue;   // fixed number, fixed unit
    paintRow(place, row, mode, mode.kind === 'place' && mode.placeId === id);
  }

  const order = orderedIds();
  if (order.join() !== state.order.join()) {
    state.order = order;
    for (const id of order) {
      const row = state.rows.get(id);
      if (row) el.places.append(row.li);
    }
  }
}

/* ---------------------------------------------------------------- location */

async function locate() {
  state.locating = true;
  state.originError = null;
  renderBanner();
  try {
    const pos = await currentPosition();
    state.origin = { ...pos, height: pos.altitude || 0, source: 'gps' };
    state.settings.manualOrigin = null;
    persist();
    state.locating = false;
    render();
    renderResults();
    toast('Location updated.');
  } catch (err) {
    state.locating = false;
    state.originError = err.message;
    render();
  }
}

function setManualOrigin(point) {
  state.origin = { lat: point.lat, lon: point.lon, height: 0, source: 'manual', label: point.name };
  state.originError = null;
  state.settings.manualOrigin = { lat: point.lat, lon: point.lon, label: point.name };
  persist();
  state.culminations.clear();
  render();
  renderResults();
  toast(`Measuring from ${point.name}.`);
}

/* ---------------------------------------------------------------- search */

let searchTimer = null;
let searchController = null;

function onSearchInput() {
  const query = el.search.value.trim();
  el.clearSearch.hidden = !query;
  clearTimeout(searchTimer);
  if (searchController) searchController.abort();

  if (query.length < 2) {
    state.results = [];
    state.searching = false;
    state.searchError = null;
    el.searchSpinner.hidden = true;
    renderResults();
    return;
  }

  // The sky catalogue is local, so those matches can appear immediately.
  state.results = searchCelestial(query);
  state.searching = true;
  el.searchSpinner.hidden = false;
  renderResults();
  searchTimer = setTimeout(() => runSearch(query), 400);
}

async function runSearch(query) {
  searchController = new AbortController();
  const celestial = searchCelestial(query);
  try {
    const found = await searchPlaces(query, { signal: searchController.signal });
    state.results = [...celestial, ...found];
    state.searchError = null;
  } catch (err) {
    if (err.name === 'AbortError') return;
    state.results = celestial;
    state.searchError = celestial.length ? null
      : 'Could not reach the place search. Check your connection and try again.';
  } finally {
    state.searching = false;
    el.searchSpinner.hidden = true;
    renderResults();
  }
}

function renderResults() {
  if (!state.results.length && !state.searchError && !el.search.value.trim()) {
    el.results.hidden = true;
    el.search.setAttribute('aria-expanded', 'false');
    return;
  }
  el.results.hidden = false;
  el.search.setAttribute('aria-expanded', 'true');
  el.results.replaceChildren();

  if (state.searchError) {
    el.results.append(messageRow(state.searchError));
    return;
  }
  if (!state.results.length) {
    el.results.append(messageRow(state.searching ? 'Searching…' : 'No matches found.'));
    return;
  }

  for (const result of state.results) {
    const sky = result.kind === 'sky';
    const li = document.createElement('li');
    li.className = 'result';
    li.setAttribute('role', 'option');

    const icon = document.createElement('span');
    icon.className = 'ms';
    icon.textContent = sky ? (BODIES[result.body]?.icon || 'planet') : 'place';

    const text = document.createElement('div');
    text.className = 'result__text';
    const title = document.createElement('div');
    title.className = 'result__title';
    title.textContent = result.name;
    const sub = document.createElement('div');
    sub.className = 'result__sub';
    const metres = state.origin ? placeMetres(result) : NaN;
    sub.textContent = (result.detail || formatCoords(result))
      + (isFinite(metres) ? ` · ${describeDistance(metres)}` : '');
    text.append(title, sub);

    li.append(icon, text);

    if (!sky) {
      const here = document.createElement('button');
      here.type = 'button';
      here.className = 'icon-button icon-button--small';
      here.title = 'Use as my location';
      here.innerHTML = '<span class="ms" aria-hidden="true">person_pin_circle</span>';
      here.append(srOnly(`Use ${result.name} as my location`));
      here.addEventListener('click', event => {
        event.stopPropagation();
        setManualOrigin(result);
      });
      li.append(here);
    }

    const add = document.createElement('span');
    add.className = 'ms';
    add.textContent = 'add_circle';
    li.append(add);

    li.addEventListener('click', () => saveSearchResult(result));
    el.results.append(li);
  }
}

function messageRow(message) {
  const li = document.createElement('li');
  li.className = 'results__empty';
  li.textContent = message;
  return li;
}

function describeDistance(metres) {
  const { value, suffix } = formatDistance(metres, currentMode());
  return `${value} ${suffix}`.trim();
}

async function saveSearchResult(result) {
  const name = await promptName({
    title: 'Save place',
    value: result.name,
    support: result.detail || formatCoords(result),
  });
  if (!name) return;
  await addPlace(result.kind === 'sky'
    ? { name, detail: result.detail, kind: 'sky', body: result.body, feature: result.feature, source: 'sky' }
    : { name, detail: result.detail, lat: result.lat, lon: result.lon, source: 'search' });
  clearSearch();
  toast(`Saved “${name}”.`);
}

function clearSearch() {
  el.search.value = '';
  state.results = [];
  state.searchError = null;
  el.clearSearch.hidden = true;
  el.searchSpinner.hidden = true;
  renderResults();
}

async function addPlace(fields) {
  const place = { id: newId(), detail: '', createdAt: Date.now(), ...fields };
  await putPlace(place);
  state.places.push(place);
  render();
  return place;
}

/* ---------------------------------------------------------------- save here */

async function saveCurrentLocation() {
  el.fab.disabled = true;
  try {
    let point = state.origin;
    if (!point || point.source !== 'gps') {
      const pos = await currentPosition();
      point = { ...pos, height: pos.altitude || 0, source: 'gps' };
      state.origin = point;
      state.originError = null;
      state.settings.manualOrigin = null;
      persist();
      render();
    }
    const suggestion = await describePoint(point);
    const name = await promptName({
      title: 'Save this spot',
      value: suggestion || '',
      support: `${formatCoords(point)}${point.accuracy ? ` · ±${Math.round(point.accuracy)} m` : ''}`,
    });
    if (!name) return;
    await addPlace({
      name,
      detail: suggestion && suggestion !== name ? suggestion : '',
      lat: point.lat, lon: point.lon, source: 'gps',
    });
    toast(`Saved “${name}” here.`);
  } catch (err) {
    state.originError = err.message;
    render();
    toast(err.message);
  } finally {
    el.fab.disabled = false;
  }
}

/* ---------------------------------------------------------------- units */

function setMode(next) {
  Object.assign(state.settings, next);
  persist();
  render();
  renderResults();
}

function useAsUnit(place) {
  const metres = placeMetres(place);
  if (isFinite(metres) && metres < 1) {
    toast(`You are standing at ${place.name} — pick something further away.`);
    return;
  }
  setMode({ unitKind: 'place', refPlaceId: place.id });
  toast(`Distances now shown in ${place.name} units.`);
}

function openUnitSheet() {
  const mode = currentMode();
  el.unitList.replaceChildren();

  el.unitList.append(unitOption({
    icon: 'auto_awesome',
    title: 'Human units',
    sub: 'Automatically pick a sensible unit',
    selected: mode.kind === 'human',
    onSelect: () => setMode({ unitKind: 'human', refPlaceId: null }),
  }));

  for (const unit of UNITS) {
    el.unitList.append(unitOption({
      icon: 'square_foot',
      title: `${unit.name} (${unit.symbol})`,
      sub: unitExample(unit),
      selected: mode.kind === 'unit' && mode.unitId === unit.id,
      onSelect: () => setMode({ unitKind: 'unit', unitId: unit.id, refPlaceId: null }),
    }));
  }

  if (state.places.length) {
    const divider = document.createElement('li');
    divider.className = 'unit-list__divider';
    const heading = document.createElement('li');
    heading.className = 'sheet__title';
    heading.textContent = 'Your own units — or drag a place onto the bar';
    el.unitList.append(divider, heading);

    for (const place of state.places) {
      const metres = placeMetres(place);
      const human = isFinite(metres) ? formatDistance(metres, { kind: 'human' }) : null;
      el.unitList.append(unitOption({
        icon: isSky(place) ? (BODIES[place.body]?.icon || 'planet') : 'straighten',
        title: `${place.name} units`,
        sub: human ? `1× = ${human.value} ${human.suffix}` : 'Needs your location',
        selected: mode.kind === 'place' && mode.placeId === place.id,
        onSelect: () => useAsUnit(place),
      }));
    }
  }

  el.unitSheet.showModal();
}

function unitOption({ icon, title, sub, selected, onSelect }) {
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'unit-option';
  button.setAttribute('aria-selected', String(Boolean(selected)));

  const leading = document.createElement('span');
  leading.className = 'ms';
  leading.textContent = icon;

  const text = document.createElement('span');
  text.className = 'unit-option__text';
  const t = document.createElement('div');
  t.textContent = title;
  const s = document.createElement('div');
  s.className = 'unit-option__sub';
  s.textContent = sub;
  text.append(t, s);

  const check = document.createElement('span');
  check.className = 'ms';
  check.textContent = selected ? 'check' : '';

  button.append(leading, text, check);
  button.addEventListener('click', () => { el.unitSheet.close(); onSelect(); });
  li.append(button);
  return li;
}

/* ---------------------------------------------------------------- sky detail */

let skyTimer = null;

function openSkySheet(place) {
  el.skyTitle.textContent = place.name;
  el.skySheet.showModal();
  paintSkySheet(place);
  clearInterval(skyTimer);
  skyTimer = setInterval(() => paintSkySheet(place), 200);
  el.skySheet.addEventListener('close', () => clearInterval(skyTimer), { once: true });
}

function paintSkySheet(place) {
  if (!state.origin) return;
  const now = new Date();
  state.now = now;
  const view = observe(place, site(), now);
  const body = BODIES[place.body];
  const culmination = culminationFor(place);
  const sub = subEarthPoint(place.body, site(), now);
  const mode = currentMode();
  const shown = formatDistance(view.distanceMetres, mode);
  const lightSeconds = view.distanceKm / 299792.458;

  const rows = [
    ['Distance', `${shown.value} ${shown.suffix}`.trim()],
    ['Changing at', `${formatSigned(view.rangeRateKmS, 3, ' km/s')} (${view.rangeRateKmS >= 0 ? 'receding' : 'closing'})`],
    ['Light delay', formatDuration(lightSeconds) + (lightSeconds < 60 ? '' : ` (${lightSeconds.toFixed(0)} s)`)],
    ['In your sky', `${formatSigned(view.altitude, 1, '°')} altitude · ${view.azimuth.toFixed(1)}° azimuth`],
  ];
  if (culmination) {
    const remaining = (culmination.at - now) / 1000;
    rows.push([
      culmination.type === 'zenith' ? 'Zenith crossing' : 'Nadir crossing',
      `in ${formatDuration(remaining)} · ${culmination.at.toLocaleTimeString()}`,
    ]);
  }
  if (sub) {
    rows.push(['You are over', `${sub.latDeg.toFixed(2)}° ${sub.latDeg >= 0 ? 'N' : 'S'}, ${sub.lonDeg.toFixed(2)}°E of ${body.name}`]);
  }
  if (place.feature) {
    rows.push(['Surface point', `${place.feature.lat.toFixed(2)}°, ${place.feature.lon.toFixed(2)}°E on a sphere of r = ${body.radiusKm.toLocaleString()} km`]);
  }
  rows.push(['Model error', `±${body.accuracyKm.toLocaleString()} km${place.feature ? ` · ±${body.surfaceKm} km surface placement` : ''}`]);

  el.skyBody.replaceChildren(...rows.map(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'sky-row';
    const l = document.createElement('span');
    l.className = 'sky-row__label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'sky-row__value';
    v.textContent = value;
    row.append(l, v);
    return row;
  }));
}

/* ---------------------------------------------------------------- row menu */

function openMenu(anchor, place) {
  closeMenu();
  const mode = currentMode();
  const isRef = mode.kind === 'place' && mode.placeId === place.id;

  const items = [
    { icon: 'straighten', label: isRef ? 'Stop using as unit' : 'Use as unit',
      run: () => isRef ? setMode({ unitKind: 'human', refPlaceId: null }) : useAsUnit(place) },
    isSky(place)
      ? { icon: 'travel_explore', label: 'Sky details', run: () => openSkySheet(place) }
      : { icon: 'person_pin_circle', label: 'Measure from here', run: () => setManualOrigin(place) },
    { icon: 'edit', label: 'Rename', run: () => renamePlace(place) },
    !isSky(place) && { icon: 'content_copy', label: 'Copy coordinates', run: () => copyCoords(place) },
    !isSky(place) && { icon: 'map', label: 'Open in maps', run: () => openInMaps(place) },
    { icon: 'delete', label: 'Remove', danger: true, run: () => deletePlace(place) },
  ].filter(Boolean);

  el.menu.replaceChildren(...items.map(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    if (item.danger) button.classList.add('danger');
    button.innerHTML = `<span class="ms" aria-hidden="true">${item.icon}</span>`;
    const label = document.createElement('span');
    label.textContent = item.label;
    button.append(label);
    button.addEventListener('click', () => { closeMenu(); item.run(); });
    return button;
  }));

  el.menu.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const menuRect = el.menu.getBoundingClientRect();
  const left = Math.min(rect.right - menuRect.width, window.innerWidth - menuRect.width - 8);
  const top = rect.bottom + menuRect.height > window.innerHeight - 8
    ? Math.max(8, rect.top - menuRect.height)
    : rect.bottom + 4;
  el.menu.style.left = `${Math.max(8, left)}px`;
  el.menu.style.top = `${top}px`;
  el.menu.querySelector('button')?.focus();
}

const closeMenu = () => { el.menu.hidden = true; };

async function renamePlace(place) {
  const name = await promptName({ title: 'Rename place', value: place.name, submitLabel: 'Rename' });
  if (!name || name === place.name) return;
  place.name = name;
  await putPlace(place);
  render();
}

async function deletePlace(place) {
  const ok = await confirmAction(`“${place.name}” will be removed from this device.`);
  if (!ok) return;
  await removePlace(place.id);
  state.places = state.places.filter(p => p.id !== place.id);
  state.culminations.delete(place.id);
  if (state.settings.refPlaceId === place.id) {
    state.settings.unitKind = 'human';
    state.settings.refPlaceId = null;
    persist();
  }
  render();
  toast(`Removed “${place.name}”.`);
}

async function copyCoords(place) {
  const text = `${place.lat}, ${place.lon}`;
  try {
    await navigator.clipboard.writeText(text);
    toast('Coordinates copied.');
  } catch {
    toast(text);
  }
}

function openInMaps(place) {
  window.open(`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`, '_blank', 'noopener');
}

/* ---------------------------------------------------------------- dialogs */

function promptName({ title, value = '', submitLabel = 'Save', support = '' }) {
  return new Promise(resolve => {
    el.nameDialogTitle.textContent = title;
    el.nameInput.value = value;
    el.nameSubmit.textContent = submitLabel;
    el.nameSupport.textContent = support;
    el.nameSupport.hidden = !support;

    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      el.nameForm.removeEventListener('submit', onSubmit);
      el.nameDialog.removeEventListener('close', onClose);
      resolve(result);
    };
    const onSubmit = event => {
      event.preventDefault();
      const name = el.nameInput.value.trim();
      if (!name) return;
      finish(name);
      el.nameDialog.close();
    };
    const onClose = () => finish(null);

    el.nameForm.addEventListener('submit', onSubmit);
    el.nameDialog.addEventListener('close', onClose);
    el.nameDialog.showModal();
    requestAnimationFrame(() => { el.nameInput.focus(); el.nameInput.select(); });
  });
}

function confirmAction(message) {
  return new Promise(resolve => {
    el.confirmText.textContent = message;
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      el.confirmOk.removeEventListener('click', onOk);
      el.confirmDialog.removeEventListener('close', onClose);
      resolve(result);
    };
    const onOk = () => { finish(true); el.confirmDialog.close(); };
    const onClose = () => finish(false);
    el.confirmOk.addEventListener('click', onOk);
    el.confirmDialog.addEventListener('close', onClose);
    el.confirmDialog.showModal();
  });
}

let toastTimer = null;
function toast(message) {
  el.snackbar.textContent = message;
  el.snackbar.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.snackbar.hidden = true; }, 3500);
}

/* ---------------------------------------------------------------- wiring */

function wire() {
  el.sortBtn.addEventListener('click', () => {
    state.settings.sortAsc = !state.settings.sortAsc;
    persist();
    render();
  });

  el.locBtn.addEventListener('click', () => locate());
  el.fab.addEventListener('click', () => saveCurrentLocation());

  el.search.addEventListener('input', onSearchInput);
  el.clearSearch.addEventListener('click', () => { clearSearch(); el.search.focus(); });
  el.search.addEventListener('keydown', event => { if (event.key === 'Escape') clearSearch(); });

  el.unitBtn.addEventListener('click', openUnitSheet);

  el.places.addEventListener('click', event => {
    const menuButton = event.target.closest('[data-menu]');
    if (menuButton) {
      const place = state.places.find(p => p.id === menuButton.dataset.menu);
      if (place) openMenu(menuButton, place);
      return;
    }
    const row = event.target.closest('.place');
    if (!row || event.target.closest('.place__handle')) return;
    const place = state.places.find(p => p.id === row.dataset.id);
    if (place && isSky(place) && state.origin) openSkySheet(place);
  });

  document.addEventListener('click', event => {
    if (el.menu.hidden) return;
    if (!el.menu.contains(event.target) && !event.target.closest('[data-menu]')) closeMenu();
  }, true);
  window.addEventListener('resize', closeMenu);
  window.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });

  document.querySelectorAll('dialog [data-close]').forEach(button => {
    button.addEventListener('click', () => button.closest('dialog').close());
  });

  for (const sheet of [el.unitSheet, el.skySheet]) {
    sheet.addEventListener('click', event => { if (event.target === sheet) sheet.close(); });
  }

  window.addEventListener('scroll', () => {
    el.appBar.classList.toggle('app-bar--scrolled', window.scrollY > 4);
  }, { passive: true });

  document.addEventListener('visibilitychange', restartClock);

  initDragToTarget({
    container: el.places,
    handleSelector: '.place__handle',
    rowSelector: '.place',
    target: el.unitBar,
    ghost: el.dragGhost,
    getItem: row => state.places.find(p => p.id === row.dataset.id) || null,
    onDrop: place => useAsUnit(place),
  });
}

/* ---------------------------------------------------------------- boot */

async function seedIfEmpty() {
  if (!state.places.length && !state.settings.seeded) {
    for (const seed of SEED_PLACES) {
      const place = { id: newId(), ...seed, source: 'seed', createdAt: Date.now() };
      await putPlace(place);
      state.places.push(place);
    }
    state.settings.seeded = true;
  }
  if (!state.settings.seededSky) {
    for (const seed of SEED_SKY) {
      const place = { id: newId(), kind: 'sky', ...seed, source: 'seed', createdAt: Date.now() };
      await putPlace(place);
      state.places.push(place);
    }
    state.settings.seededSky = true;
  }
  persist();
}

async function boot() {
  wire();
  render();

  state.places = await allPlaces();
  await seedIfEmpty();
  render();

  if (state.settings.manualOrigin) {
    const saved = state.settings.manualOrigin;
    state.origin = { lat: saved.lat, lon: saved.lon, height: 0, source: 'manual', label: saved.label };
    render();
  } else {
    locate();
  }
}

boot();
