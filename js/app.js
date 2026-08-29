/* Nearabouts — a static SPA that ranks places by how far they are from you. */

import { allPlaces, putPlace, removePlace, newId, loadSettings, saveSettings } from './db.js';
import { UNITS, UNIT_BY_ID, formatDistance, modeLabel, unitExample } from './units.js';
import { distanceMetres, currentPosition, searchPlaces, describePoint, formatCoords } from './geo.js';
import { initDragToTarget } from './drag.js';

const $ = id => document.getElementById(id);

const el = {
  appBar: document.querySelector('.app-bar'),
  sortBtn: $('sortBtn'), sortIcon: $('sortIcon'), locBtn: $('locBtn'),
  search: $('search'), searchSpinner: $('searchSpinner'), clearSearch: $('clearSearch'),
  results: $('results'), searchSupport: $('searchSupport'),
  banner: $('banner'),
  places: $('places'), emptyState: $('emptyState'),
  fab: $('fab'),
  unitBar: $('unitBar'), unitBtn: $('unitBtn'), unitLabel: $('unitLabel'),
  unitIcon: $('unitIcon'), unitHint: $('unitHint'),
  unitSheet: $('unitSheet'), unitList: $('unitList'),
  nameDialog: $('nameDialog'), nameForm: $('nameForm'), nameInput: $('nameInput'),
  nameDialogTitle: $('nameDialogTitle'), nameSubmit: $('nameSubmit'), nameSupport: $('nameSupport'),
  confirmDialog: $('confirmDialog'), confirmTitle: $('confirmTitle'),
  confirmText: $('confirmText'), confirmOk: $('confirmOk'),
  menu: $('menu'), snackbar: $('snackbar'), dragGhost: $('dragGhost'),
};

const DEFAULT_SETTINGS = {
  unitKind: 'human',   // 'human' | 'unit' | 'place'
  unitId: 'km',
  refPlaceId: null,
  sortAsc: true,
  manualOrigin: null,  // {lat, lon} chosen from a search result
  seeded: false,
};

const state = {
  settings: loadSettings(DEFAULT_SETTINGS),
  places: [],
  origin: null,        // {lat, lon, accuracy, source: 'gps' | 'manual'}
  originError: null,
  locating: false,
  results: [],
  searching: false,
  searchError: null,
};

/* Well-known places so a first run has something to compare against. */
const SEED_PLACES = [
  { name: 'Disneyland',           detail: 'Anaheim, California', lat: 33.8121,  lon: -117.9190 },
  { name: 'Statue of Liberty',    detail: 'New York, USA',       lat: 40.6892,  lon: -74.0445 },
  { name: 'Eiffel Tower',         detail: 'Paris, France',       lat: 48.8584,  lon: 2.2945 },
  { name: 'Mount Everest',        detail: 'Nepal / Tibet',       lat: 27.9881,  lon: 86.9250 },
  { name: 'Sydney Opera House',   detail: 'Sydney, Australia',   lat: -33.8568, lon: 151.2153 },
];

/* ---------------------------------------------------------------- state */

function persist() {
  saveSettings(state.settings);
}

function currentMode() {
  const s = state.settings;
  if (s.unitKind === 'place') {
    const ref = state.places.find(p => p.id === s.refPlaceId);
    if (ref && state.origin) {
      return { kind: 'place', name: ref.name, placeId: ref.id, metres: distanceMetres(state.origin, ref) };
    }
    if (ref) return { kind: 'place', name: ref.name, placeId: ref.id, metres: 0 };
    return { kind: 'human' };
  }
  if (s.unitKind === 'unit' && UNIT_BY_ID[s.unitId]) return { kind: 'unit', unitId: s.unitId };
  return { kind: 'human' };
}

function placeDistance(place) {
  return state.origin ? distanceMetres(state.origin, place) : NaN;
}

function sortedPlaces() {
  const withDistance = state.places.map(p => ({ place: p, metres: placeDistance(p) }));
  withDistance.sort((a, b) => {
    const aOk = isFinite(a.metres), bOk = isFinite(b.metres);
    if (!aOk && !bOk) return a.place.name.localeCompare(b.place.name);
    if (!aOk) return 1;
    if (!bOk) return -1;
    return state.settings.sortAsc ? a.metres - b.metres : b.metres - a.metres;
  });
  return withDistance;
}

/* ---------------------------------------------------------------- render */

function render() {
  renderPlaces();
  renderUnitBar();
  renderBanner();
  renderSort();
}

function renderSort() {
  const asc = state.settings.sortAsc;
  el.sortIcon.textContent = asc ? 'arrow_upward' : 'arrow_downward';
  el.sortBtn.setAttribute('aria-pressed', String(!asc));
  el.sortBtn.title = asc ? 'Nearest first' : 'Farthest first';
}

function renderPlaces() {
  const mode = currentMode();
  const rows = sortedPlaces();
  el.places.replaceChildren(...rows.map(({ place, metres }) => placeRow(place, metres, mode)));
  el.emptyState.hidden = rows.length > 0;
}

function placeRow(place, metres, mode) {
  const li = document.createElement('li');
  li.className = 'place';
  li.dataset.id = place.id;
  const isRef = mode.kind === 'place' && mode.placeId === place.id;
  if (isRef) li.classList.add('place--reference');

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'place__handle';
  handle.title = 'Drag onto the unit bar to measure in this place’s units';
  handle.innerHTML = '<span class="ms" aria-hidden="true">drag_indicator</span>';
  handle.append(srOnly(`Drag ${place.name} to use as unit`));

  const avatar = document.createElement('div');
  avatar.className = 'place__avatar';
  avatar.innerHTML = `<span class="ms" aria-hidden="true">${isRef ? 'straighten' : 'location_on'}</span>`;

  const text = document.createElement('div');
  text.className = 'place__text';
  const name = document.createElement('div');
  name.className = 'place__name';
  name.textContent = place.name;
  const meta = document.createElement('div');
  meta.className = 'place__meta';
  const parts = [];
  if (isRef) parts.push('unit reference');
  parts.push(place.detail || formatCoords(place));
  meta.textContent = parts.join(' · ');
  text.append(name, meta);

  const dist = document.createElement('div');
  dist.className = 'place__distance';
  if (!state.origin) {
    dist.innerHTML = '<span>—</span><small>need location</small>';
  } else {
    const { value, suffix } = formatDistance(metres, mode);
    dist.innerHTML = `<span></span><small></small>`;
    dist.firstChild.textContent = value;
    dist.lastChild.textContent = suffix;
  }

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'icon-button icon-button--small';
  more.dataset.menu = place.id;
  more.innerHTML = '<span class="ms" aria-hidden="true">more_vert</span>';
  more.append(srOnly(`Options for ${place.name}`));

  li.append(handle, avatar, text, dist, more);
  return li;
}

function srOnly(text) {
  const s = document.createElement('span');
  s.className = 'sr-only';
  s.textContent = text;
  return s;
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
    const li = document.createElement('li');
    li.className = 'result';
    li.setAttribute('role', 'option');

    const icon = document.createElement('span');
    icon.className = 'ms';
    icon.textContent = 'place';

    const text = document.createElement('div');
    text.className = 'result__text';
    const title = document.createElement('div');
    title.className = 'result__title';
    title.textContent = result.name;
    const sub = document.createElement('div');
    sub.className = 'result__sub';
    const distance = state.origin
      ? ` · ${describeDistance(distanceMetres(state.origin, result))}`
      : '';
    sub.textContent = (result.detail || formatCoords(result)) + distance;
    text.append(title, sub);

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

    const add = document.createElement('span');
    add.className = 'ms';
    add.textContent = 'add_circle';

    li.append(icon, text, here, add);
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

/* ---------------------------------------------------------------- location */

async function locate() {
  state.locating = true;
  state.originError = null;
  renderBanner();
  try {
    const pos = await currentPosition();
    state.origin = { ...pos, source: 'gps' };
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
  state.origin = { lat: point.lat, lon: point.lon, source: 'manual', label: point.name };
  state.originError = null;
  state.settings.manualOrigin = { lat: point.lat, lon: point.lon, label: point.name };
  persist();
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

  state.searching = true;
  el.searchSpinner.hidden = false;
  searchTimer = setTimeout(() => runSearch(query), 400);
}

async function runSearch(query) {
  searchController = new AbortController();
  try {
    const results = await searchPlaces(query, { signal: searchController.signal });
    state.results = results;
    state.searchError = null;
  } catch (err) {
    if (err.name === 'AbortError') return;
    state.results = [];
    state.searchError = 'Could not reach the place search. Check your connection and try again.';
  } finally {
    state.searching = false;
    el.searchSpinner.hidden = true;
    renderResults();
  }
}

function clearSearch() {
  el.search.value = '';
  state.results = [];
  state.searchError = null;
  el.clearSearch.hidden = true;
  el.searchSpinner.hidden = true;
  renderResults();
}

async function saveSearchResult(result) {
  const name = await promptName({
    title: 'Save place',
    value: result.name,
    support: result.detail || formatCoords(result),
  });
  if (!name) return;
  await addPlace({ name, detail: result.detail, lat: result.lat, lon: result.lon, source: 'search' });
  clearSearch();
  toast(`Saved “${name}”.`);
}

async function addPlace({ name, detail, lat, lon, source }) {
  const place = { id: newId(), name, detail: detail || '', lat, lon, source, createdAt: Date.now() };
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
      point = { ...(await currentPosition()), source: 'gps' };
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
    await addPlace({ name, detail: suggestion && suggestion !== name ? suggestion : '', lat: point.lat, lon: point.lon, source: 'gps' });
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
  const metres = state.origin ? distanceMetres(state.origin, place) : 0;
  if (state.origin && metres < 1) {
    toast(`You are standing at ${place.name} — pick a place further away.`);
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
    el.unitList.append(divider);

    const heading = document.createElement('li');
    heading.className = 'sheet__title';
    heading.textContent = 'Your own units — or drag a place onto the bar';
    el.unitList.append(heading);

    for (const place of state.places) {
      const metres = state.origin ? distanceMetres(state.origin, place) : NaN;
      el.unitList.append(unitOption({
        icon: 'straighten',
        title: `${place.name} units`,
        sub: isFinite(metres) ? `1× = ${formatDistance(metres, { kind: 'human' }).value} ${formatDistance(metres, { kind: 'human' }).suffix}` : 'Needs your location',
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
  button.addEventListener('click', () => {
    el.unitSheet.close();
    onSelect();
  });
  li.append(button);
  return li;
}

/* ---------------------------------------------------------------- row menu */

function openMenu(anchor, place) {
  closeMenu();
  const mode = currentMode();
  const isRef = mode.kind === 'place' && mode.placeId === place.id;

  const items = [
    { icon: 'straighten', label: isRef ? 'Stop using as unit' : 'Use as unit',
      run: () => isRef ? setMode({ unitKind: 'human', refPlaceId: null }) : useAsUnit(place) },
    { icon: 'edit', label: 'Rename', run: () => renamePlace(place) },
    { icon: 'person_pin_circle', label: 'Measure from here', run: () => setManualOrigin(place) },
    { icon: 'content_copy', label: 'Copy coordinates', run: () => copyCoords(place) },
    { icon: 'map', label: 'Open in maps', run: () => openInMaps(place) },
    { icon: 'delete', label: 'Remove', danger: true, run: () => deletePlace(place) },
  ];

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

function closeMenu() {
  el.menu.hidden = true;
}

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
  const url = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`;
  window.open(url, '_blank', 'noopener');
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
  el.search.addEventListener('keydown', event => {
    if (event.key === 'Escape') clearSearch();
  });

  el.unitBtn.addEventListener('click', openUnitSheet);

  el.places.addEventListener('click', event => {
    const button = event.target.closest('[data-menu]');
    if (!button) return;
    const place = state.places.find(p => p.id === button.dataset.menu);
    if (place) openMenu(button, place);
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

  /* Click the sheet backdrop to dismiss. */
  el.unitSheet.addEventListener('click', event => {
    if (event.target === el.unitSheet) el.unitSheet.close();
  });

  window.addEventListener('scroll', () => {
    el.appBar.classList.toggle('app-bar--scrolled', window.scrollY > 4);
  }, { passive: true });

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

async function boot() {
  wire();
  render();

  state.places = await allPlaces();
  if (!state.places.length && !state.settings.seeded) {
    for (const seed of SEED_PLACES) {
      const place = { id: newId(), ...seed, source: 'seed', createdAt: Date.now() };
      await putPlace(place);
      state.places.push(place);
    }
    state.settings.seeded = true;
    persist();
  }
  render();

  if (state.settings.manualOrigin) {
    const saved = state.settings.manualOrigin;
    state.origin = { lat: saved.lat, lon: saved.lon, source: 'manual', label: saved.label };
    render();
  } else {
    locate();
  }
}

boot();
