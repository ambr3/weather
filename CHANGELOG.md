# Changelog

All notable changes to **Seclusa Weather**.

## Unreleased

## 0.7.9 — 2026-11-02

- Align `Permissions-Policy` metas with header samples (`browsing-topics=()`).
- Drop HSTS `preload` from `_headers` / `.htaccess` (keep long `max-age` + `includeSubDomains`).
- Fold phantom 0.7.7 notes into 0.7.8; smoke guards Permissions-Policy parity and no-HSTS-preload.

## 0.7.8 — 2026-11-02

- README: accept Observatory **B** on GitHub Pages (missing XFO/XCTO are server-header limits, not app holes); link the scan PDF.
- Harden HTTP header files and CSP metas (`default-src 'none'`, XCTO, XFO, COOP/CORP, HSTS). Keep `_headers` / `.htaccess` for hosts that honour them; no Cloudflare / A+ chase. GitHub Pages still cannot emit them, so live Observatory stays ~B.

## 0.7.6 — 2026-11-02

- Background grid: blue in light mode, cool grey in dark mode (replaces the warm orange lines). Cache bump so installs pick up the new colours.

## 0.7.5 — 2026-11-02

- First pass at blue/grey grid colours (superseded by 0.7.6 cache bump).

## 0.7.4 — 2026-11-02

- Fixed search-bar location button (duplicate `locationBtn` id left it unbound).
- Restored Cloudflare `_headers` (CSP with Open-Meteo hosts, `frame-ancestors`, `X-Frame-Options`).
- Aligned service-worker cache/version with the app (`v0.7.4`); precache now includes `seclusa-base.css` and the split UI scripts.
- Forecast detail modal restores focus to the control that opened it.
- Unit/prefs and forecast snapshot now live in `Store` (`seclusa.settings` / `seclusa.data`), with one-time migrate from the old flat keys.
- Split `ui.js` into `ui.js` + `ui-current` / `ui-details` / `ui-forecast` / `ui-modal` / `ui-chart`.
- Footer open-source link points at `LICENSE` (works when this folder is its own Pages site).
- `test.sh` sources the shared toolchain so `node` is on `PATH`.

## 0.7.3 — 2026-10-27

- Incomplete version stamp: footer/manifest/`?v=` moved to 0.7.3 while the service worker stayed on 0.7.2. Superseded by 0.7.4.

## 0.7.1 — 2026-10-27

- New black-and-white theme shared with the other Seclusa apps. Light, dark or system.
- Privacy: coordinates are rounded to about 1 km, and the saved place and forecast last 3 days.
- New "Remember" switch in settings. Turning it off stops the app saving your last place and clears it.
- Stricter security headers and service-worker caching.
- Help text and README updated for the above.

## 0.6.18 — 2026-10-26

### Changed
- UI rewrite: adopted seclusa-base.css theme (black and white with orange accent). Simplified colors, kept layout and all working engines.

### Version / SW cache **0.6.18**

## 0.6.17 — 2026-10-26

### Changed
- Minor: slightly more visible settings pill background.

### Version / SW cache **0.6.17**

## 0.6.16 — 2026-10-26

### Changed
- Performance: removed backdrop-filter, text-shadow, box-shadow blur, SVG glow filters, and entrance animations that caused checkerboarding on Android Chrome during fast scroll. Added compositor layer promotion (translateZ) to cards.
- Visual: larger and bolder settings bar icons (20px, 2.5 stroke), bolder base font weight, theme toggle now shows sun/moon icon.
- Polish: subtle linear gradient background restored, moderate shadow depth.

### Version / SW cache **0.6.16**

## 0.6.15 — 2026-10-26

### Changed
- Bug fixes: search no longer hangs on "Fetching weather..."; failed requests no longer show the previous city's forecast; detail modal no longer reopens itself; auto-refresh no longer closes an open modal; dates and times use the place's timezone; night theme matches day; auto-refresh restarts when coming back online; location errors report the right cause.
- Test scripts: precache check now covers every entry; http:// scan now covers real files; added regression guards.

### Version / SW cache **0.6.15**

## 0.6.14 — 2026-10-26

### Changed
- Version bump for site ship.

### Version / SW cache **0.6.14**

## 0.6.13 — 2026-10-26

### Changed
- Service worker: cache misses now return a real error response instead of undefined/null; added 4s network timeout for faster offline fallback
- Service worker: CACHE_NAME derived from VERSION; manifest.json versioned in precache list; skipWaiting moved into install chain
- Manifest: added lang and screenshots entries
- Smoke checks: verify manifest version and derived CACHE_NAME

### Version / SW cache **0.6.13**

## 0.6.12 — 2026-10-24

### Changed
- Settings pill: theme now shows Light/Dark; pill font and pop animation
- Version / SW cache **0.6.12**

## 0.6.11 — 2026-10-24

### Changed
- Current weather card: added humidity, wind, gusts, visibility, pressure, dew
  point, UV and cloud cover; removed sun/moon rise and set times
- Settings pill: combined header controls into one pill with pill-style items;
  fixed mobile alignment
- Scroll flicker fixed; rain description adjusted

### Changed
- Version / SW cache **0.6.11**

## 0.6.10 — 2026-10-24

### Fixed
- Scroll: no more brief black/white flash when scrolling (page background now
  matches the app background)
- Earth arc: removed the “Day” / “Night” wording from the orbit marks
- Forecast icons: drizzle-coded slots with real precipitation (or a high rain
  chance) now show the rain icon instead of drizzle

### Changed
- Version / SW cache **0.6.10**

## 0.6.9 — 2026-10-17

### Fixed
- Forecast refresh: no silent no-op when coords only live on the current view; refresh button spins while loading
- Service worker: network-first for app assets (cache-first could stick Refresh / deploys on stale shell)

### Changed
- Version / SW cache **0.6.9**

## 0.6.8 — 2026-10-16

### Fixed
- PWA install icon: manifest uses only opaque sheet PNGs (`pwa-*.png`); removed SVG icon entries that rendered black on install
- Install splash `background_color` set to white to match sheet icons

### Changed
- Version / SW cache **0.6.8**

## 0.6.7 — 2026-10-16

### Changed
- Splash and header logo use the white+black sheet icon (no old yellow sun SVG)
- CSP meta: drop ignored `frame-ancestors` (headers keep clickjacking defense)
- SW activate / erase-data only touch `seclusaweather-*` caches; fetch uses scoped match
- Version / SW cache **0.6.7**

### Added
- README screenshots from the live site (phone light/dark + desktop)

### Changed
- Shortened README to match Seclusa Solitaire style
- Cropped README screenshots; show on one row with no gaps between images
- README “A note from me” links to the Seclusa about page
- CSP meta aligned with `_headers` (`connect-src 'self'`, `worker-src`, `manifest-src`)
- Version **0.6.5**

### Fixed
- Saved place (`lastLat`/`lastLon`) now expires with the same 7-day TTL as weatherCache

### Added
- Hourly day tabs (Today / Tomorrow / weekday) with swipe sync; “Swipe hours” above the tabs, “Swipe days” below; tap a tab or in-strip day marker to jump.
- Earth arc N / E / S / W marks; they swap places with the night disc flip (text stays upright).

### Fixed
- On-device `weatherCache` now expires after 7 days and rejects oversized / malformed AQ payloads (matches privacy claim).
- Service worker same-origin cache write uses `URL.origin` (not string prefix).
- Stored units / wind / chart / city / lat-lon preferences validated on load.
- `getUVLevel` / `getAQILevel` / `formatVisibility` reject null/NaN instead of treating them as valid.
- README self-cleaning cache row corrected (no SW API cache; localStorage TTL).

## 0.6.4 — 2026-09-29

### Fixed
- Service worker no longer intercepts Open-Meteo requests (was synthesizing 503 offline JSON and breaking search/refresh on the hosted site). Offline forecasts stay in `localStorage` only.

### Changed
- Shipping version / SW cache **0.6.4**.

## 0.6.3 — 2026-09-29

### Fixed
- Silent refresh no longer cancels in-flight search/locate (`_userBusy` + no shared seq bump).
- Service worker: geocoding is network-only (no search-history cache); prune clears legacy geocode entries; activate prune timer is not duplicated.
- Offline page styles moved out of inline `<style>` (CSP `style-src 'self'`).
- Weather cache load validates `current` / hourly+daily `time[]` shapes before use.

### Changed
- Fresh install / after erase: no silent London default — empty start until search or locate.
- Dropped Open-Meteo `preconnect` on first paint (contact only when fetching).
- Escape more summary/celestial/hourly text sinks into `innerHTML`.
- Hourly forecast is a Now→forward horizontal strip (time, icon, temp, rain%) with in-flow day markers.
- Night earth flip only rotates the disc paint; sun/moon keep the same orbit path.
- Shipping version / SW cache **0.6.3**.

## 0.6.2 — 2026-09-28

### Added
- Local summer/winter clock-change dates under Sun & Moon (browser `Intl` tzdata only; no network).

### Changed
- Sun / Moon / Clocks in mobile-first stacked panels with soft squircles; 2-col Sun/Moon from 640px.
- Clearer Rise–set / UV / Solar / Summer / Winter labels; orbit mark Noon → Day.
- Open-source footer link points at the same-origin OSS page.

## 0.6.1 — 2026-09-28

### Changed
- Hourly day pages (swipe L/R), full Today, compact cells, equal-height pages, stacked mobile pager.
- Section titles outside pills (Forecast, Hourly, Graphs, Details, Wind, Sun & Moon).
- Shared Open-Meteo `dayOutlook` / `hourIcon`; rain % and icons gated on real precip.
- Earth night flip (dark + stars on top); Wind as its own section.

### Removed
- 24h / All hourly tabs.

## 0.6.0 — 2026-09-27

### Changed
- Local fonts (DM Sans / Sora); UI polish; CSP without `unsafe-inline`.
