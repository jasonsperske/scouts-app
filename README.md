# Scout

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
- **Real geodesics on Earth** — WGS84 ellipsoid distances, not spherical approximations.
- **Works offline** — installable to a home screen, and everything except searching for
  new places keeps working with no connection.
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
- **Tap any row for the caveats** — a detail sheet with what the number is made of
  (range rate, light delay, alt/az, sub-observer point, bearing) and an honest error
  budget: how far off it could be, what share of the distance that is, the same error
  expressed in your own units (±0.09 Moons, ±872 Disneylands), and a plain-language
  list of every reason — ephemeris model, rotation model, your GPS fix, your clock,
  and the physics deliberately left out.
- Material 3 styling, light and dark, safe-area aware, keyboard and screen-reader paths.

## How the distances are computed

Places on Earth use the **WGS84 geodesic** — the true shortest path across the
ellipsoid GPS itself reports against, solved with Vincenty's inverse method. The
great-circle-on-a-sphere shortcut that most apps use is off by up to half a percent:
22 km on Los Angeles to Paris. Celestial places use real 3D geometry:

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

The Moon figure is the worst of 3,505 samples at 5-hour steps across 2026–2027
(RMS 3 km); the app quotes a slightly conservative ±12 km.

Earth-side distances were checked against **GeographicLib** (Karney) over 469 point
pairs — 400 random, 60 deliberately near-antipodal, plus equatorial, polar, meridional,
coincident and sub-metre cases. Worst error on the 467 that solve: **0.07 mm**.

Vincenty's iteration famously oscillates instead of converging for nearly antipodal
points, so it retries with progressively shorter steps, which settles on the same root
without overshooting; that recovers every near-antipodal case tested. What remains is
the true degeneracy — points antipodal to within a whisker, where the shortest path is
not unique because every route over a pole is the same length. Those return half the
meridional circumference, which is exact for a true antipode and within ~25 km around
it, and the app says so on the row.

Surface-feature placement was checked against Horizons' sub-observer longitude and
latitude: within 0.006° for Mercury, Mars, Jupiter, Neptune and Pluto, 0.01° for
Venus, and 0.18° for the Moon (≈ 6 km on its surface, the IAU_MOON vs MOON_ME frame
difference plus the truncated libration series). Meridian-crossing times were checked
by confirming the solver lands on hour angle 0 or 12 h at a true altitude extremum,
over 96 cases across four targets.

Each row shows its own error bar — tap it. So yes, you can watch a planet's
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

## Publishing to GitHub Pages

The repository root *is* the site — no build step, no bundler, nothing to install —
and `.github/workflows/deploy.yml` publishes it on every push to `main`.

**One-time setup, once the repository is on GitHub:**

1. Open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main` (or run the workflow by hand from the **Actions** tab →
   *Deploy to GitHub Pages* → **Run workflow**).

That is the whole setup. There are no secrets or tokens to create: the workflow
requests the `pages: write` and `id-token: write` permissions it needs in its own
file, and GitHub issues the credentials for the duration of the run.

The site lands at `https://<your-username>.github.io/<repository-name>/`, or at
`https://<your-username>.github.io/` if the repository is named
`<your-username>.github.io`. The **Actions** tab shows each run, and the finished
deploy links to the live URL.

**What the workflow does**

| Job | Step |
|---|---|
| `check` | Parses every ES module with Node, so a syntax error never reaches the site |
| `check` | Verifies every file `index.html` references and every module import resolves |
| `deploy` | Uploads the repository root and publishes it — only if `check` passed |

Deploys are serialised (`concurrency: pages`), and a run in flight is allowed to
finish rather than being cancelled halfway through publishing.

**Worth knowing**

- Pages serves over HTTPS, which the browser requires before it will hand out your
  location. The app works on `localhost` for the same reason.
- Nothing is stored server-side: saved places live in your own browser's IndexedDB,
  so each visitor gets their own list, and clearing site data clears it.
- The app calls OpenStreetMap's Nominatim from the browser. That is fine for personal
  use; a busy site should run its own instance or another geocoder — one file,
  `js/geo.js`.
- Deploying from a branch instead works too (**Settings → Pages → Deploy from a
  branch** → `main` / `/ (root)`); the included `.nojekyll` keeps Jekyll's hands off
  the assets. The Actions workflow is the better route, since it runs the checks.

## Adding it to a phone's home screen

Open the site in the phone's browser, then:

- **iOS / iPadOS** — Safari → **Share** → **Add to Home Screen**. iOS uses
  `icons/apple-touch-icon.png` and the `apple-mobile-web-app-title` tag, so the icon
  arrives with square corners already trimmed and the label reads "Scout".
- **Android** — Chrome → **⋮** → **Add to Home screen** (offered as *Install app* on
  some builds). Chrome reads `site.webmanifest` and picks the maskable icon, so the
  launcher can crop it to whatever shape the device uses — circle, squircle, rounded
  square — without clipping the artwork.

Either way it opens without browser chrome (`"display": "standalone"`), which is why
it feels like an app rather than a bookmark — and thanks to the service worker it
opens with no connection at all. Chrome also offers a proper **Install** prompt now
that there is a manifest and a fetch handler.

### Offline

`sw.js` precaches the whole app on first visit, so after that it runs with no network
whatsoever. That is not a trick: once loaded, almost nothing here needs a server. Your
places are in IndexedDB, the distances are arithmetic, and the planets come from
series expansions running in your browser — Mars keeps ticking over in millimetres on
a plane at 38,000 feet.

| Works offline | Needs the network |
|---|---|
| The saved list, sorted, in every unit | Searching for a new place (Nominatim) |
| Planets, moons and surface features | The name suggested by *Save here* |
| Zenith / nadir countdowns, live distances | The very first visit |
| Saving your current position (GPS is a device sensor, not a network call) | |

Place search is deliberately never cached: a stale geocode that looks fresh is worse
than an honest "could not reach the place search", which is what you get offline.

**Updates.** A new deploy is picked up on the next visit and installs quietly in the
background. Because a waiting worker cannot take over while a tab is still controlled
by the old one — reloading is *not* enough, a detail that bites most first attempts at
this — the app shows a snackbar with a **Reload** button that performs the handover
and reloads once the new worker is actually in charge. Stale caches are deleted on
activation.

**Changing what is cached.** Add the file to the `PRECACHE` array in `sw.js` and bump
`VERSION`. The deploy workflow fails if the two ever drift apart, in either direction,
and also if the Google Fonts URL in `sw.js` stops matching the one in `index.html`
(the fonts are fetched at install time, so the icon font is there on a first offline
launch rather than only after a second visit).

**During development**, an old worker can serve you stale files. Chrome DevTools →
**Application** → **Service Workers** → *Update on reload*, or *Unregister*.

### The icon

A map pin inside an orbit — the two halves of what the app measures.

| File | Used by |
|---|---|
| `icons/icon.svg` | the vector master, and the browser tab on modern browsers |
| `icons/icon-maskable.svg` | same art, scaled to sit inside Android's 80% safe circle |
| `icons/apple-touch-icon.png` | 180×180, opaque, iOS home screen |
| `icons/icon-192.png`, `icons/icon-512.png` | manifest, `purpose: any` |
| `icons/icon-maskable-192.png`, `icons/icon-maskable-512.png` | manifest, `purpose: maskable` |
| `icons/favicon-32.png` | fallback tab icon |

To change the artwork, edit **`icons/icon.svg`**, mirror the change in
`icons/icon-maskable.svg` (identical except for the `scale()` on the art group), then
regenerate every PNG:

```sh
./icons/build.sh          # needs Inkscape and ImageMagick
```

Two rules the design has to keep: the background must reach all four edges, because
iOS composites transparency onto black and Android crops the corners; and everything
that matters must stay inside the middle 80% of the maskable version, because that is
all a circular launcher mask will show.

## Layout

```
.github/workflows/
  deploy.yml        checks the sources, then publishes to GitHub Pages
.github/scripts/
  check-precache.cjs  fails the build if sw.js and the repo drift apart
index.html          markup, sheets and dialogs
sw.js               service worker: precaching, offline, update handover
site.webmanifest    name, colours and icons for installing to a home screen
icons/              icon sources, generated PNGs, and build.sh to regenerate them
css/styles.css      Material 3 tokens and components
js/app.js           state, rendering, the live clock, wiring
js/db.js            IndexedDB store + settings
js/geo.js           WGS84 geodesic (Vincenty), geolocation, Nominatim
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
