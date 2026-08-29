# Nearabouts

A single-page app that keeps a list of places — some down the road, some on other
planets — and shows how far each one is from you right now, sorted by distance,
in whatever unit you like, including units you invent yourself.

No build step, no server, no API keys: plain ES modules that can be dropped on
GitHub Pages.

## Features

- **Search for places** — free-text lookup via OpenStreetMap / Nominatim, or paste
  raw `lat, lon`. The sky catalogue is searched locally, so "Tycho" offers the
  lunar crater instantly alongside the streets named after him.
- **Save where you are** — *Save here* pins your GPS position with a name suggested
  by reverse geocoding. Everything lives in **IndexedDB** on your device.
- **Planets, moons and landmarks on them** — the Sun, all eight planets, Pluto, the
  Moon, and named surface features: the Sea of Tranquillity, Olympus Mons, Tycho,
  Gale and Jezero craters, Caloris Planitia, Maxwell Montes, the Apollo 11 site.
- **Ranked by closeness** — nearest first; the app-bar arrow flips it.
- **Human units by default** — distances auto-scale mm → cm → m → km → AU → light years.
- **Pick a unit** — tap the label at the bottom for mm, cm, m, km, inches, feet,
  yards, miles, AU or light years.
- **Your own units** — drag a place by its handle onto the unit bar (or *Use as unit*
  in its menu). Drop "Disneyland" there and Disneyland becomes `1×`, Mars becomes
  715,000×. Drop the Moon there and the Sun is 388 Moons away.
- **Live distances** — pick a fine enough unit and celestial distances update ten
  times a second, because they are genuinely changing that fast.
- **Zenith / nadir countdown** — every sky row shows its altitude and a countdown to
  its next meridian crossing: to the **zenith** while it is still climbing, to the
  **nadir** once it has started to fall.
- Material 3 styling, light and dark, safe-area aware, keyboard and screen-reader paths.

## How the distances are computed

Terrestrial places use a great-circle (haversine) distance — the number you expect
when you ask how far away Paris is. Celestial places use real 3D geometry:

- **You** are placed on the WGS84 ellipsoid from your latitude, longitude and
  altitude, then carried around by the Earth's rotation via Greenwich mean sidereal
  time. Standing on the near side versus the far side of the planet is a 12,700 km
  difference, and the app tracks it continuously.
- **Bodies** come from JPL's approximate Keplerian elements (1800–2050); the Moon
  from the truncated ELP-2000 series in Meeus, chapter 47.
- **Surface features** are rotated into place with the IAU/WGCCRE model for each
  body — pole direction plus prime-meridian angle W — so the Sea of Tranquillity
  swings towards and away from you as the Moon turns, and Olympus Mons circles Mars
  every 24h 37m. The Moon's physical librations are included.
- Everything is evaluated in the mean equator and equinox of date, so the observer,
  the Moon and the precessed planet vectors all share one frame.

The Sea of Tranquillity is about 1,360 km closer than the Moon's centre when it
faces you, and about 1,700 km further when it doesn't. That difference is the
feature working.

### Accuracy, measured

Model output was compared against **JPL Horizons (DE441)** for a site on Earth,
geometric (light-time-uncorrected) ranges, every 14 days from 2026 to 2029 (the
Moon every 29 hours). Worst-case distance error over that span:

| Body | Worst error | Body | Worst error |
|---|---|---|---|
| Moon | 10 km | Jupiter | 420,000 km |
| Sun | 7,300 km | Saturn | 1,160,000 km |
| Mercury | 10,300 km | Uranus | 1,000,000 km |
| Venus | 22,400 km | Neptune | 330,000 km |
| Mars | 34,800 km | Pluto | 615,000 km |

Surface-feature placement was checked against Horizons' sub-observer longitude and
latitude: within 0.006° for Mercury, Mars, Jupiter, Neptune and Pluto, 0.01° for
Venus, and 0.18° for the Moon (≈ 6 km on its surface, the IAU_MOON vs MOON_ME frame
difference plus the truncated libration series). Meridian-crossing times were checked
by confirming the solver lands on hour angle 0 or 12 h at a true altitude extremum,
over 96 cases across four targets.

Each sky row shows its own error bar — tap it. So yes, you can watch a planet's
distance tick over in millimetres, and the app will tell you the last eleven digits
are decoration. Other caveats: your clock is assumed correct (the Moon moves ~1 km/s),
UT1−UTC is ignored (< 0.9 s), nutation is left out (< 0.6 km), bodies are treated as
spheres of their equatorial radius, and no light-time correction is applied — these
are *geometric* distances at the instant shown, not what you would see.

## Running locally

ES modules need a real origin, so serve rather than opening `file://`:

```sh
python3 -m http.server 8080
# then visit http://localhost:8080
```

Geolocation requires a secure context — `localhost` counts, as does any HTTPS host.
Without a fix you can still use the app: search for a place and tap the
person-pin icon to measure from there.

## Deploying to GitHub Pages

The repository root *is* the site. Push, then in **Settings → Pages** choose
*Deploy from a branch* → `main` / `/ (root)`. The `.nojekyll` file keeps Pages from
touching the assets.

## Layout

```
index.html          markup, sheets and dialogs
css/styles.css      Material 3 tokens and components
js/app.js           state, rendering, the live clock, wiring
js/db.js            IndexedDB store + settings
js/geo.js           haversine, geolocation, Nominatim
js/units.js         unit table, human-unit ladder, formatting
js/drag.js          pointer drag from a row onto the unit bar
js/astro/
  time.js           UTC → TT, Julian dates, sidereal time
  vec.js            3-vector and rotation helpers
  frames.js         obliquity, precession, observer position, alt/az
  planets.js        JPL approximate Keplerian elements
  moon.js           Meeus truncated ELP-2000 series
  rotation.js       IAU/WGCCRE body orientation, sub-observer point
  catalog.js        bodies, surface features, measured error bars
  index.js          cached ephemeris, ranges, culmination solver
```
