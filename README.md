# Nearabouts

A single-page app that keeps a list of places and shows how far each one is from you —
sorted by distance, in whatever unit you like, including units you invent yourself.

No build step, no server, no keys: plain ES modules that can be dropped on GitHub Pages.

## Features

- **Search for places** — free-text lookup via OpenStreetMap / Nominatim. You can also paste
  raw `lat, lon` coordinates.
- **Save where you are** — the *Save here* button pins your current GPS position, with a
  suggested name from reverse geocoding. Everything is stored locally in **IndexedDB**.
- **Ranked by closeness** — the list is ordered nearest-first; the app-bar arrow flips it to
  farthest-first.
- **Human units by default** — distances auto-scale through mm → cm → m → km → AU → light years.
- **Pick a unit** — tap the label at the bottom to switch to mm, cm, m, km, inches, feet,
  yards, miles, AU or light years.
- **Your own units** — drag a place by its handle onto the unit bar (or use *Use as unit* in
  the row menu). If you drop "Disneyland" there, Disneyland becomes `1×` and everything else
  is measured in Disneyland units.
- Material 3 styling, light and dark, safe-area aware, keyboard and screen-reader accessible.

## Running locally

ES modules need a real origin, so open it through a server rather than `file://`:

```sh
python3 -m http.server 8080
# then visit http://localhost:8080
```

Geolocation requires a secure context — `localhost` counts, as does any HTTPS host.

## Deploying to GitHub Pages

The repository root *is* the site. Push to GitHub, then in **Settings → Pages** choose
*Deploy from a branch* → `main` / `/ (root)`. The included `.nojekyll` file keeps Pages from
touching the assets.

## Layout

```
index.html      markup and dialogs
css/styles.css  Material 3 tokens and components
js/app.js       state, rendering, and wiring
js/db.js        IndexedDB store + settings
js/geo.js       distance maths, geolocation, Nominatim
js/units.js     unit table, human-unit ladder, formatting
js/drag.js      pointer drag from a row onto the unit bar
```

## Notes

- Distances are great-circle (haversine) on a spherical Earth, so they are line-of-sight
  distances, not travel distances.
- Nominatim is a free community service; searches are debounced and limited to 8 results.
  Heavy use should point at your own instance or another geocoder in `js/geo.js`.
