/* IndexedDB storage for saved places. */

const DB_NAME = 'nearabouts';
const DB_VERSION = 1;
const STORE = 'places';

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    try { result = fn(store); } catch (err) { reject(err); return; }
    t.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export function newId() {
  return (crypto.randomUUID ? crypto.randomUUID() : 'p' + Date.now() + Math.random().toString(16).slice(2));
}

export function allPlaces() {
  return tx('readonly', store => store.getAll());
}

export function putPlace(place) {
  return tx('readwrite', store => store.put(place)).then(() => place);
}

export function removePlace(id) {
  return tx('readwrite', store => store.delete(id));
}

export function getPlace(id) {
  return tx('readonly', store => store.get(id));
}

/* Small key/value settings live in localStorage — they are per-device UI prefs,
   not user data worth an object store. */
const SETTINGS_KEY = 'nearabouts:settings';

export function loadSettings(defaults) {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
}
