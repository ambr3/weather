#!/usr/bin/env bash
# Seclusa Weather — committed smoke checks (no network, no install).
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
pass() { echo "PASS: $*"; }
bad()  { echo "FAIL: $*"; fail=1; }

echo "→ smoke @ $PWD"

# --- syntax ---
for f in js/*.js sw.js; do
  node --check "$f" || bad "syntax $f"
done
pass "JS syntax"

# --- version alignment ---
sw_ver=$(grep -m1 "const VERSION" sw.js | grep -oE "'v[0-9]+\.[0-9]+\.[0-9]+'" | tr -d "'")
sw_ass=$(grep -m1 "const ASSET_VER" sw.js | grep -oE "[0-9]+\.[0-9]+\.[0-9]+")
[ "$sw_ver" = "v$sw_ass" ] || bad "VERSION ($sw_ver) vs ASSET_VER ($sw_ass)"
grep -q "const CACHE_NAME = CACHE_PREFIX + VERSION;" sw.js || bad "CACHE_NAME must derive from VERSION"
grep -q "const CACHE_PREFIX = 'seclusaweather-';" sw.js || bad "CACHE_PREFIX changed"
footer=$(grep -oE 'Seclusa Weather v[0-9]+\.[0-9]+\.[0-9]+' index.html | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
[ "$footer" = "$sw_ass" ] || bad "footer version ($footer) vs ASSET_VER ($sw_ass)"
mani_ver=$(grep -oE '"version": "[^"]+"' manifest.json | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
[ "$mani_ver" = "$sw_ass" ] || bad "manifest version ($mani_ver) vs ASSET_VER ($sw_ass)"
while read -r stamp; do
  [ "$stamp" = "$sw_ass" ] || bad "page ?v=$stamp != $sw_ass"
done < <(grep -hoE '\?v=[0-9]+\.[0-9]+\.[0-9]+' index.html offline.html | sed 's/?v=//' | sort -u)
unstamped=$(grep -oE '(src|href)="[^"?]+\.(css|js)"' index.html offline.html || true)
[ -z "$unstamped" ] || bad "unstamped asset links: $unstamped"
pass "version $sw_ver aligned"

# --- referenced files exist ---
missing=0
while read -r a; do
  path="${a#./}"
  path="${path%%\?*}"
  [ -f "$path" ] || { echo "MISSING (sw): $path"; missing=1; }
done < <(grep -oE "[\`'\"][.]/[^\`'\"]+[\`'\"]" sw.js | tr -d "\`'\"")
for f in $(grep -oE '(src|href)="[^"]+\.(css|js|json|png|svg)"' index.html offline.html | sed -E 's/.*(src|href)="//;s/"$//;s/\?v=.*//'); do
  [ -f "$f" ] || { echo "MISSING (page): $f"; missing=1; }
done
for f in $(grep -oE '"src": "[^"]+"' manifest.json | sed -E 's/.*"src": "//;s/"$//'); do
  [ -f "$f" ] || { echo "MISSING (manifest): $f"; missing=1; }
done
[ "$missing" -eq 0 ] || bad "missing assets"
pass "assets present"

# --- no plain http resources in app surface ---
http_hits=$(grep -RInE --include='*.html' --include='*.js' --include='*.css' --include='*.json' 'http://' . \
  --exclude-dir=.git --exclude-dir=scripts 2>/dev/null \
  | grep -v 'xmlns="http://www.w3.org' \
  | grep -v 'README.md' \
  | grep -v 'LICENSE' || true)
[ -z "$http_hits" ] || bad "plain http:// references:\n$http_hits"
pass "no mixed-content http://"

# --- CSP / connect-src parity with config + SW ---
# Real HTTP headers help on Cloudflare Pages (_headers) and Apache (.htaccess).
# GitHub Pages serves neither — a scan of *.github.io stays around B/75 even
# when these files are correct; that grade is accepted (no A+ chase).
[ -f _headers ] || bad "_headers missing (Cloudflare Pages / Netlify)"
[ -f .htaccess ] || bad ".htaccess missing (Apache parity)"
for host in api.open-meteo.com air-quality-api.open-meteo.com geocoding-api.open-meteo.com; do
  grep -q "$host" index.html || bad "CSP meta missing $host"
  grep -q "$host" _headers || bad "_headers missing $host"
  grep -q "$host" .htaccess || bad ".htaccess missing $host"
  grep -q "$host" sw.js || bad "sw.js missing $host"
  grep -q "$host" js/config.js || bad "config.js missing $host"
done
grep -q 'geocoding-api.open-meteo.com' sw.js || bad "sw geocoding host missing"
grep -q 'isOpenMeteoRequest' sw.js || bad "sw Open-Meteo pass-through guard missing"
grep -q 'Never intercept Open-Meteo' sw.js || bad "sw must not intercept Open-Meteo"
! grep -q 'API_CACHEABLE_ORIGINS' sw.js || bad "legacy API_CACHEABLE_ORIGINS should be gone"
! grep -qE 'JSON\.stringify\(\{[^}]*error[^}]*offline' sw.js || bad "sw must not synthesize offline JSON for APIs"
! grep -q '<style>' offline.html || bad "offline.html inline style block should be gone"
grep -q 'offline-box' css/style.css || bad "offline-box CSS missing from style.css"
grep -q '_userBusy' js/app.js || bad "user-busy guard for silent refresh missing"
! grep -q 'preconnect' index.html || bad "preconnect should be removed (privacy)"
grep -q "frame-ancestors 'none'" _headers .htaccess || bad "frame-ancestors missing from headers"
grep -q 'X-Frame-Options' _headers .htaccess || bad "X-Frame-Options missing from headers"
grep -q 'X-Content-Type-Options' _headers .htaccess || bad "X-Content-Type-Options missing (Observatory −5)"
grep -q 'Cross-Origin-Opener-Policy' _headers .htaccess || bad "COOP missing from headers"
grep -q 'Cross-Origin-Resource-Policy' _headers .htaccess || bad "CORP missing from headers"
grep -q "default-src 'none'" _headers .htaccess index.html offline.html || bad "default-src 'none' missing"
grep -q 'upgrade-insecure-requests' _headers .htaccess index.html offline.html || bad "upgrade-insecure-requests missing"
grep -q 'browsing-topics=()' _headers .htaccess index.html offline.html || bad "browsing-topics missing from Permissions-Policy"
grep -q 'Strict-Transport-Security' _headers .htaccess || bad "HSTS missing from headers"
! grep -qE 'preload' _headers .htaccess || bad "HSTS must not use preload (irreversible footgun)"
grep -q "font-src 'self'" index.html offline.html _headers .htaccess || bad "font-src 'self' missing from CSP samples"
! grep -q "'unsafe-inline'" index.html offline.html _headers .htaccess || bad "CSP still allows unsafe-inline"
grep -q "dynCSS" js/utils.js || bad "dynCSS helper missing"
grep -q 'window.Utils = Utils' js/utils.js || bad "window.Utils export missing (custom bg dynCSS guard needs it)"
inline_hits=$(grep -nE ' style=|\.style\.[a-zA-Z]' js/ui.js js/ui-*.js js/app.js index.html offline.html 2>/dev/null || true)
[ -z "$inline_hits" ] || bad "inline style sinks remain:\n$inline_hits"
pass "CSP / header host allowlist"

# --- privacy / XSS guardrails present ---
grep -q '_esc(' js/ui.js js/ui-*.js || bad "UI._esc missing"
grep -q '_validCoords' js/api.js || bad "API._validCoords missing"
grep -q 'safeGet' js/utils.js || bad "Utils.safeGet missing"
grep -q 'loadWeatherCache' js/utils.js || bad "loadWeatherCache missing"
grep -q 'Erase my data' index.html || bad "clear-data affordance missing"
grep -q 'rel="noopener noreferrer"' index.html || bad "noopener noreferrer missing"
grep -q 'content="no-referrer"' index.html || bad "referrer meta missing"
grep -q 'window.top !== window.self' js/app.js || bad "frame-bust missing"
pass "privacy / XSS guards"

# --- unit helpers (node, no DOM) ---
node <<'NODE' || bad "coord / cache unit checks"
const fs = require('fs');
const apiSrc = fs.readFileSync('js/api.js', 'utf8');
const utilsSrc = fs.readFileSync('js/utils.js', 'utf8');
global.CONFIG = {
  WEATHER_BASE: 'https://api.open-meteo.com',
  AIR_QUALITY_BASE: 'https://air-quality-api.open-meteo.com',
  GEOCODING_BASE: 'https://geocoding-api.open-meteo.com',
};
eval(apiSrc.replace(/^const API =/, 'global.API ='));
const ok = [
  [51.5, -0.1, true],
  [90, 180, true],
  [-90, -180, true],
  [91, 0, false],
  [0, 181, false],
  [NaN, 0, false],
  ['x', 'y', false],
];
for (const [lat, lon, expect] of ok) {
  const got = API._validCoords(lat, lon);
  if (got !== expect) {
    console.error('coord', lat, lon, 'got', got, 'want', expect);
    process.exit(1);
  }
}
eval(utilsSrc.replace(/^const Utils =/, 'global.Utils ='));
const good = Utils.formatTemp(0, 'metric');
if (good !== '0°C') { console.error('formatTemp 0 failed', good); process.exit(1); }
if (Utils.formatPrecip(0, 'metric') != null) { console.error('formatPrecip 0 should be null'); process.exit(1); }
if (Utils.getWindDirection(0) !== 'N') { console.error('wind dir'); process.exit(1); }
if (Utils.getMoonPhaseName(0) !== 'New Moon') { console.error('moon new'); process.exit(1); }
if (Utils.getMoonPhaseName(0.5) !== 'Full Moon') { console.error('moon full'); process.exit(1); }
if (Utils.getMoonIllumination(0.5) !== 100) { console.error('illum full'); process.exit(1); }
if (Utils.getMoonIllumination(0) !== 0) { console.error('illum new'); process.exit(1); }
const londonClocks = Utils.getClockChanges('Europe/London', 2026);
if (!londonClocks || !londonClocks.observes || !londonClocks.summer || !londonClocks.winter) {
  console.error('London clock changes missing', londonClocks); process.exit(1);
}
if (!/Mar/.test(londonClocks.summer) || !/Oct/.test(londonClocks.winter)) {
  console.error('London clock change months wrong', londonClocks); process.exit(1);
}
const tokyoClocks = Utils.getClockChanges('Asia/Tokyo', 2026);
if (!tokyoClocks || tokyoClocks.observes) {
  console.error('Tokyo should not observe DST', tokyoClocks); process.exit(1);
}
if (Utils.nextDateKey('2026-11-17') !== '2026-11-18') {
  console.error('nextDateKey failed', Utils.nextDateKey('2026-11-17')); process.exit(1);
}
// Coming overnight low (not calendar-day morning min).
const pairDaily = {
  time: ['2026-11-17', '2026-11-18'],
  sunrise: ['2026-11-17T07:00', '2026-11-18T07:00'],
  sunset: ['2026-11-17T17:00', '2026-11-18T17:00'],
  temperature_2m_max: [20, 18],
  temperature_2m_min: [2, 5], // calendar mins — ignored when hourly pair commits
  apparent_temperature_max: [19, 17],
  apparent_temperature_min: [1, 4],
};
const pairHourly = {
  time: [
    '2026-11-17T05:00', // before sunrise (not day high window)
    '2026-11-17T08:00', // day
    '2026-11-17T14:00', // day peak
    '2026-11-17T18:00', // night
    '2026-11-17T23:00', // night
    '2026-11-18T04:00', // night low
    '2026-11-18T08:00', // after next sunrise
  ],
  temperature_2m: [1, 12, 21, 10, 7, 3, 9],
  apparent_temperature: [0, 11, 20, 9, 6, 2, 8],
};
const pair = Utils.dayNightTemps(pairDaily, pairHourly, 0, 'UTC');
if (pair.high !== 21) { console.error('dayNight high', pair); process.exit(1); }
if (pair.low !== 3) { console.error('dayNight low should be coming night (3), got', pair); process.exit(1); }
if (pair.feelsHigh !== 20 || pair.feelsLow !== 2) {
  console.error('dayNight feels', pair); process.exit(1);
}
// Truncated overnight (evening only) → keep calendar pair, do not mix.
const truncHourly = {
  time: [
    '2026-11-17T08:00',
    '2026-11-17T14:00',
    '2026-11-17T18:00',
    '2026-11-17T23:00',
  ],
  temperature_2m: [12, 21, 10, 7],
  apparent_temperature: [11, 20, 9, 6],
};
const trunc = Utils.dayNightTemps(pairDaily, truncHourly, 0, 'UTC');
if (trunc.high !== 20 || trunc.low !== 2) {
  console.error('truncated overnight should keep API pair', trunc); process.exit(1);
}
// Empty hourly → API fallback.
const empty = Utils.dayNightTemps(pairDaily, { time: [], temperature_2m: [] }, 0, 'UTC');
if (empty.high !== 20 || empty.low !== 2) {
  console.error('empty hourly should keep API pair', empty); process.exit(1);
}
// Missing sun times → 06:00–18:00 / 18:00–next 06:00 windows.
const noSunDaily = {
  time: ['2026-11-17', '2026-11-18'],
  temperature_2m_max: [99],
  temperature_2m_min: [0],
};
const noSunHourly = {
  time: [
    '2026-11-17T05:00',
    '2026-11-17T07:00',
    '2026-11-17T12:00',
    '2026-11-17T19:00',
    '2026-11-18T05:00',
    '2026-11-18T07:00',
  ],
  temperature_2m: [1, 8, 22, 11, 4, 9],
};
const noSun = Utils.dayNightTemps(noSunDaily, noSunHourly, 0, 'UTC');
if (noSun.high !== 22 || noSun.low !== 4) {
  console.error('no-sun 06–18 windows failed', noSun); process.exit(1);
}
const iconsSrc = fs.readFileSync('js/icons.js', 'utf8');
eval(iconsSrc.replace(/^const WeatherIcons =/, 'global.WeatherIcons ='));
if (WeatherIcons.hourIcon(51, 27, 0.2, 0, 90) !== 3) {
  console.error('drizzle under 50% should stay overcast'); process.exit(1);
}
if (WeatherIcons.hourIcon(51, 60, 0.4, 0, 90) !== 51) {
  console.error('drizzle at 60% with amount should stay drizzle'); process.exit(1);
}
if (WeatherIcons.hourIcon(2, 80, 1, 0, 40) !== 2) {
  console.error('sky code must not be rewritten to rain'); process.exit(1);
}
if (WeatherIcons.precipWord(71) !== 'snow' || WeatherIcons.precipWord(95) !== 'thunder') {
  console.error('precip word'); process.exit(1);
}
const fri = {
  time: ['2026-11-20T08:00', '2026-11-20T12:00', '2026-11-20T15:00'],
  is_day: [1, 1, 1],
  weather_code: [51, 51, 3],
  precipitation_probability: [27, 12, 4],
  precipitation: [0.2, 0, 0],
  snowfall: [0, 0, 0],
  cloud_cover: [90, 80, 100],
};
const rainHours = {
  time: ['2026-11-19T09:00', '2026-11-19T15:00', '2026-11-19T21:00'],
  weather_code: [3, 61, 3],
  precipitation_probability: [10, 100, 5],
  precipitation: [0, 2, 0],
  cloud_cover: [100, 90, 40],
};
const afternoon = Utils.rainTiming('2026-11-19', rainHours, null, 'UTC');
if (afternoon.when !== 'this afternoon' || afternoon.pop !== 100) {
  console.error('rain timing afternoon', afternoon); process.exit(1);
}
const eveningChance = Utils.chanceWhen('2026-11-30', {
  time: ['2026-11-30T09:00', '2026-11-30T15:00', '2026-11-30T19:00'],
  precipitation_probability: [10, 20, 67],
}, null, 'UTC');
if (eveningChance.when !== 'in the evening') {
  console.error('day chance should name the evening peak, not the small hours', eveningChance); process.exit(1);
}
const todayEvening = Utils.chanceWhen('2026-11-30', {
  time: ['2026-11-30T09:00', '2026-11-30T19:00'],
  precipitation_probability: [80, 67],
}, Utils.parseLocal('2026-11-30T12:00', 'UTC').getTime(), 'UTC');
if (todayEvening.when !== 'this evening') {
  console.error('past morning chance must not set today\'s phrase', todayEvening); process.exit(1);
}
const overnightPeak = Utils.chanceWhen('2026-11-27', {
  time: ['2026-11-27T04:00', '2026-11-27T09:00', '2026-11-27T12:00', '2026-11-27T18:00'],
  precipitation_probability: [91, 70, 51, 20],
}, null, 'UTC');
if (overnightPeak.when !== 'from the early morning until midday') {
  console.error('early-morning peak must stay in clock order', overnightPeak); process.exit(1);
}
const allDayHours = {
  time: ['2026-11-19T08:00', '2026-11-19T14:00', '2026-11-19T20:00'],
  weather_code: [61, 61, 61],
  precipitation_probability: [80, 90, 70],
  precipitation: [1, 2, 1],
  cloud_cover: [90, 90, 90],
};
const allDay = Utils.rainTiming('2026-11-19', allDayHours, null, 'UTC');
if (allDay.when !== 'through the day' || allDay.pop !== 90) {
  console.error('rain timing all day', allDay); process.exit(1);
}
const tonight = Utils.rainTiming('2026-11-19', {
  time: ['2026-11-19T16:00', '2026-11-19T22:00', '2026-11-19T23:00'],
  weather_code: [3, 3, 3],
  precipitation_probability: [10, 29, 27],
  precipitation: [0, 0.4, 0.2],
  cloud_cover: [100, 90, 80],
}, null, 'UTC');
if (tonight.when || tonight.pop != null) {
  console.error('sky hours under 50% must not become a rain sentence', tonight); process.exit(1);
}
// Past 02:00 at 100% must not set the phrase. The 60% rain hour does.
// Overcast hours, even with a higher chance, do not.
const pastNow = Utils.parseLocal('2026-11-19T15:00', 'UTC').getTime();
const pastHundred = Utils.rainTiming('2026-11-19', {
  time: [
    '2026-11-19T02:00',
    '2026-11-19T20:00',
    '2026-11-19T22:00',
    '2026-11-19T23:00',
  ],
  weather_code: [61, 3, 61, 3],
  precipitation_probability: [100, 80, 60, 29],
  precipitation: [5.7, 0, 1.1, 1.3],
  cloud_cover: [90, 100, 90, 80],
}, pastNow, 'UTC');
if (pastHundred.pop === 100 || pastHundred.when !== 'this evening' || pastHundred.pop !== 60) {
  console.error('past 100% and a cloudy 80% must not set the rain sentence', pastHundred); process.exit(1);
}
if (Math.round(pastHundred.precip * 10) / 10 !== 1.1) {
  console.error('precip must sum only the wet-icon hour', pastHundred);
  process.exit(1);
}
// From 21:00, tonight includes the next date's 00–05 and skips 06:00.
// Peak is 60% at 02:00 (rain); 08:00 snow is already past.
const eveningMs = Utils.parseLocal('2026-11-19T21:00', 'UTC').getTime();
const overnight = Utils.rainTiming('2026-11-19', {
  time: [
    '2026-11-19T08:00',
    '2026-11-19T21:00',
    '2026-11-19T23:00',
    '2026-11-20T02:00',
    '2026-11-20T05:00',
    '2026-11-20T06:00',
  ],
  precipitation_probability: [90, 30, 40, 60, 55, 95],
  precipitation: [4, 0.2, 0.3, 1.1, 0.4, 8],
  weather_code: [71, 61, 61, 61, 3, 95],
}, eveningMs, 'UTC');
if (overnight.when !== 'tonight' || overnight.pop !== 60) {
  console.error('tonight must include next-day 00–05 and not 06:00', overnight); process.exit(1);
}
if (Math.round(overnight.precip * 10) / 10 !== 1.1) {
  console.error('overnight precip must sum the wet-icon hour only', overnight); process.exit(1);
}
if (WeatherIcons.kindFromHours(overnight.hours) !== 'rain') {
  console.error('Now sentence word must follow the upcoming peak, not past snow', overnight);
  process.exit(1);
}
if (WeatherIcons.kindFromHours([{ pop: 80, code: 71, snow: 1 }, { pop: 55, code: 51, precip: 0.4 }]) !== 'snow') {
  console.error('highest-chance wet icon wins; drizzle counts as rain'); process.exit(1);
}
if (WeatherIcons.kindFromHours([{ pop: 70, code: 3, cloud: 100 }]) !== '') {
  console.error('a cloud hour must not be called rain'); process.exit(1);
}
if (WeatherIcons.kindFromHours([{ pop: 70, code: 3, cloud: 90 }, { pop: 60, code: 71, snow: 0.5 }]) !== 'snow') {
  console.error('snow icon beats a dry higher chance'); process.exit(1);
}
if (Utils.resolveDayPop({ max: null, hasHours: true }, true, 90) !== null) {
  console.error('today with null hourly chances must not use the daily max'); process.exit(1);
}
if (Utils.resolveDayPop({ max: null, hasHours: false }, true, 90) !== 90) {
  console.error('today with no hourly stamps may use the daily max'); process.exit(1);
}
if (Utils.resolveDayPop({ max: 60, hasHours: true }, true, 90) !== 60) {
  console.error('today uses the forward-window chance'); process.exit(1);
}
if (Utils.resolveDayPop({ max: null, hasHours: true }, false, 80) !== null) {
  console.error('later day with hourly stamps must not use the daily max'); process.exit(1);
}
if (Utils.resolveDayPop({ max: 0, hasHours: true }, false, 70) !== null) {
  console.error('later day with zero hourly chances must not use the daily max'); process.exit(1);
}
if (WeatherIcons.kindFromHours([{ pop: 90, code: 95, precip: 1 }]) !== 'thunder') {
  console.error('thunder word'); process.exit(1);
}
const overnightPop = Utils.windowMaxPop('2026-11-19', {
  time: ['2026-11-19T15:00', '2026-11-19T21:00', '2026-11-20T02:00', '2026-11-20T06:00'],
  precipitation_probability: [80, 20, 60, 95],
}, Utils.parseLocal('2026-11-19T18:00', 'UTC').getTime(), 'UTC');
if (overnightPop.max !== 20) {
  console.error('day chance stays on that date and skips past hours', overnightPop);
  process.exit(1);
}
const nullWindow = Utils.windowMaxPop('2026-11-19', {
  time: ['2026-11-19T21:00', '2026-11-20T02:00', '2026-11-20T08:00'],
  precipitation_probability: [null, null, 90],
}, eveningMs, 'UTC');
if (!nullWindow.hasHours || nullWindow.max != null) {
  console.error('null chances in the forward window must not invent a max', nullWindow);
  process.exit(1);
}
const noStamps = Utils.windowMaxPop('2026-11-19', {
  time: ['2026-11-18T12:00'],
  precipitation_probability: [70],
}, null, 'UTC');
if (noStamps.hasHours || noStamps.max != null) {
  console.error('window with no stamps', noStamps); process.exit(1);
}
const laterDay = Utils.windowMaxPop('2026-11-20', {
  time: ['2026-11-20T02:00', '2026-11-20T14:00', '2026-11-21T02:00'],
  precipitation_probability: [10, 40, 99],
}, null, 'UTC');
if (laterDay.max !== 40) {
  console.error('later day must use only its own hours', laterDay); process.exit(1);
}
if (Utils.rollHour24('2026', '11', '19', '24') !== '2026-11-20T00') {
  console.error('hour 24 must roll to next midnight', Utils.rollHour24('2026', '11', '19', '24'));
  process.exit(1);
}
if (Utils.rollHour24('2026', '12', '31', '24') !== '2027-01-01T00') {
  console.error('hour 24 must roll the year', Utils.rollHour24('2026', '12', '31', '24'));
  process.exit(1);
}
if (Utils.rollHour24('2026', '11', '19', '23') !== '2026-11-19T23') {
  console.error('hour 23 must not roll', Utils.rollHour24('2026', '11', '19', '23'));
  process.exit(1);
}
const realDtf = Utils._dtf;
Utils._dtf = function () {
  return { formatToParts() {
    return [
      { type: 'year', value: '2026' },
      { type: 'month', value: '11' },
      { type: 'day', value: '19' },
      { type: 'hour', value: '24' },
    ];
  } };
};
const rolledKey = Utils.hourKey(Date.UTC(2026, 10, 19, 0, 0), 'UTC');
Utils._dtf = realDtf;
if (rolledKey !== '2026-11-20T00') {
  console.error('hourKey must roll hour 24 onto the next date', rolledKey); process.exit(1);
}
const skyAhead = {
  time: ['2026-11-19T08:00', '2026-11-19T10:00', '2026-11-19T12:00', '2026-11-19T15:00', '2026-11-19T21:00'],
  is_day: [1, 1, 1, 1, 0],
  weather_code: [3, 3, 3, 1, 0],
  precipitation_probability: [0, 0, 0, 0, 0],
  precipitation: [0, 0, 0, 0, 0],
  snowfall: [0, 0, 0, 0, 0],
  cloud_cover: [90, 90, 90, 20, 0],
};
if (WeatherIcons.dayIcon('2026-11-19', skyAhead) !== 3) {
  console.error('full day sky should stay overcast', WeatherIcons.dayIcon('2026-11-19', skyAhead));
  process.exit(1);
}
const at1500 = Utils.parseLocal('2026-11-19T15:00', 'UTC').getTime();
if (WeatherIcons.dayIcon('2026-11-19', skyAhead, at1500, 'UTC') !== 0) {
  console.error('remaining hours vote together, including the night hour', WeatherIcons.dayIcon('2026-11-19', skyAhead, at1500, 'UTC'));
  process.exit(1);
}
const at2100 = Utils.parseLocal('2026-11-19T21:00', 'UTC').getTime();
if (WeatherIcons.dayIcon('2026-11-19', skyAhead, at2100, 'UTC') !== 0) {
  console.error('after dark, sky uses the remaining hours', WeatherIcons.dayIcon('2026-11-19', skyAhead, at2100, 'UTC'));
  process.exit(1);
}
if (WeatherIcons.dayIcon('2026-11-20', fri) !== 3) {
  console.error('low-chance drizzle day should stay overcast', WeatherIcons.dayIcon('2026-11-20', fri));
  process.exit(1);
}
if (WeatherIcons.dayPrecipWord('2026-11-20', fri) !== '') {
  console.error('sky day must not say rain', WeatherIcons.dayPrecipWord('2026-11-20', fri));
  process.exit(1);
}
// Most hours overcast, fewer hours drizzle before sunrise. The day follows
// the larger set. The word matches the icon, so it does not say rain.
const mostlyCloud = {
  time: [
    '2026-11-27T00:00', '2026-11-27T01:00', '2026-11-27T02:00', '2026-11-27T03:00',
    '2026-11-27T04:00', '2026-11-27T05:00', '2026-11-27T06:00', '2026-11-27T07:00', '2026-11-27T08:00', '2026-11-27T09:00',
    '2026-11-27T14:00', '2026-11-27T15:00', '2026-11-27T16:00', '2026-11-27T17:00', '2026-11-27T18:00',
  ],
  is_day: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0],
  weather_code: [3, 3, 3, 3, 51, 51, 51, 51, 51, 51, 3, 3, 3, 3, 3],
  precipitation_probability: [20, 30, 40, 63, 70, 75, 78, 79, 78, 75, 50, 49, 46, 42, 39],
  precipitation: [0, 0, 0, 0, 0.3, 0.3, 0.3, 0.4, 0.4, 0.4, 0, 0, 0, 0, 0],
  snowfall: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  cloud_cover: [100, 100, 100, 100, 100, 100, 98, 91, 82, 73, 83, 100, 100, 100, 100],
};
if (WeatherIcons.dayIcon('2026-11-27', mostlyCloud) !== 3) {
  console.error('day icon must be the picture on the most hours', WeatherIcons.dayIcon('2026-11-27', mostlyCloud));
  process.exit(1);
}
if (WeatherIcons.dayPrecipWord('2026-11-27', mostlyCloud) !== '') {
  console.error('cloud day must not say rain', WeatherIcons.dayPrecipWord('2026-11-27', mostlyCloud));
  process.exit(1);
}
// Pre-sunrise hours are part of the same vote. Drizzle here is the most
// common picture only because those night hours count.
const morningDrizzle = {
  time: ['2026-11-27T04:00', '2026-11-27T05:00', '2026-11-27T06:00', '2026-11-27T07:00', '2026-11-27T08:00', '2026-11-27T09:00', '2026-11-27T12:00', '2026-11-27T13:00'],
  is_day: [0, 0, 0, 0, 0, 1, 1, 1],
  weather_code: [51, 53, 51, 55, 51, 51, 1, 1],
  precipitation_probability: [70, 72, 74, 79, 76, 70, 20, 10],
  precipitation: [0.2, 0.3, 0.3, 0.4, 0.3, 0.2, 0, 0],
  snowfall: [0, 0, 0, 0, 0, 0, 0, 0],
  cloud_cover: [90, 90, 90, 90, 80, 70, 20, 15],
};
if (WeatherIcons.dayIcon('2026-11-27', morningDrizzle) !== 51) {
  console.error('pre-sunrise hours must vote with the rest of the day', WeatherIcons.dayIcon('2026-11-27', morningDrizzle));
  process.exit(1);
}
if (WeatherIcons.dayPrecipWord('2026-11-27', morningDrizzle) !== 'rain') {
  console.error('drizzle icon says rain', WeatherIcons.dayPrecipWord('2026-11-27', morningDrizzle));
  process.exit(1);
}
const oneShower = {
  time: ['2026-11-27T09:00', '2026-11-27T12:00', '2026-11-27T15:00'],
  is_day: [1, 1, 1],
  weather_code: [0, 61, 1],
  precipitation_probability: [10, 80, 5],
  precipitation: [0, 1, 0],
  snowfall: [0, 0, 0],
  cloud_cover: [0, 40, 20],
};
if (WeatherIcons.dayIcon('2026-11-27', oneShower) !== 0) {
  console.error('one wet hour must not rename the day', WeatherIcons.dayIcon('2026-11-27', oneShower));
  process.exit(1);
}
if (WeatherIcons.dayPrecipWord('2026-11-27', oneShower) !== '') {
  console.error('one wet hour must not say rain', WeatherIcons.dayPrecipWord('2026-11-27', oneShower));
  process.exit(1);
}
const twoSnow = {
  time: ['2026-11-27T10:00', '2026-11-27T11:00', '2026-11-27T15:00'],
  is_day: [1, 1, 1],
  weather_code: [71, 73, 1],
  precipitation_probability: [60, 55, 0],
  precipitation: [0, 0, 0],
  snowfall: [0.4, 0.3, 0],
  cloud_cover: [90, 90, 20],
};
if (WeatherIcons.dayIcon('2026-11-27', twoSnow) !== 71) {
  console.error('two snow hours should set the day icon', WeatherIcons.dayIcon('2026-11-27', twoSnow));
  process.exit(1);
}
if (WeatherIcons.dayPrecipWord('2026-11-27', twoSnow) !== 'snow') {
  console.error('snow day word', WeatherIcons.dayPrecipWord('2026-11-27', twoSnow));
  process.exit(1);
}
const spills = {
  time: [
    '2026-11-19T20:00', '2026-11-19T21:00', '2026-11-19T22:00', '2026-11-19T23:00',
    '2026-11-20T01:00', '2026-11-20T02:00', '2026-11-20T03:00', '2026-11-20T04:00',
  ],
  weather_code: [3, 3, 3, 3, 51, 51, 51, 51],
  precipitation_probability: [10, 10, 10, 10, 80, 80, 80, 80],
  precipitation: [0, 0, 0, 0, 0.4, 0.4, 0.4, 0.4],
  snowfall: [0, 0, 0, 0, 0, 0, 0, 0],
  cloud_cover: [100, 100, 100, 100, 90, 90, 90, 90],
};
const spillNow = Utils.parseLocal('2026-11-19T18:00', 'UTC').getTime();
if (WeatherIcons.dayIcon('2026-11-19', spills, spillNow, 'UTC') !== 3) {
  console.error('tomorrow morning must not set today', WeatherIcons.dayIcon('2026-11-19', spills, spillNow, 'UTC'));
  process.exit(1);
}
if (WeatherIcons.dayIcon('2026-11-20', spills) !== 51) {
  console.error('next morning belongs to the next day', WeatherIcons.dayIcon('2026-11-20', spills));
  process.exit(1);
}
if (Utils.windowMaxPop('2026-11-19', spills, spillNow, 'UTC').max !== 10) {
  console.error('today chance must not take tomorrow morning', Utils.windowMaxPop('2026-11-19', spills, spillNow, 'UTC'));
  process.exit(1);
}
const shownSky = WeatherIcons.dayShownAmount('2026-11-20', fri);
if (shownSky.word !== '' || shownSky.precip !== 0) {
  console.error('a sky day must not report rain amount', shownSky); process.exit(1);
}
const shownRain = WeatherIcons.dayShownAmount('2026-11-19', allDayHours);
if (shownRain.word !== 'rain' || shownRain.precip !== 4) {
  console.error('rain amount must sum the hours that show rain', shownRain); process.exit(1);
}
const nowHour = Utils.parseLocal('2026-11-19T15:00', 'UTC').getTime();
const overridden = Utils.rainTiming('2026-11-19', {
  time: ['2026-11-19T15:00'],
  weather_code: [61],
  precipitation_probability: [80],
  precipitation: [1.2],
  cloud_cover: [40],
}, nowHour, 'UTC', { code: 61, precip: 0, snow: 0, cloud: 40 });
if (overridden.pop != null || overridden.when) {
  console.error('current dry hour must not be called rain from the hourly amount', overridden);
  process.exit(1);
}
console.log('unit helpers ok');
NODE
pass "node unit helpers"

# --- empty start (no silent London default) ---
grep -q 'showEmptyStart' js/ui.js js/ui-*.js js/app.js || bad "empty-start UI missing"
! grep -q '_ensureDefaultLocation' js/app.js || bad "silent London ensure should be gone"
! grep -q 'DEFAULT_LOCATION' js/config.js || bad "DEFAULT_LOCATION should be gone"
! grep -q "built-in \*\*London\*\* default" README.md || bad "README London default note should be updated"
grep -q 'Search for a city or use your location' js/ui.js || bad "empty-start copy missing"
# --- modal/earth review guards ---
grep -q '_modalPaneHLocked' js/ui.js js/ui-*.js || bad "modal height settle lock missing"
grep -q 'settle = false' js/ui.js js/ui-*.js || bad "modal settle remasure missing"
grep -q '{ html = false }' js/ui.js js/ui-*.js || bad "_statRow html opt-in missing"
# Moon phase + sun/moon/clocks live in the earth-arc pill
grep -q 'earth-arc__facts' js/ui.js js/ui-*.js || bad "earth-arc facts missing"
grep -q 'earth-arc__panels' js/ui.js js/ui-*.js css/style.css || bad "earth panels missing"
grep -q 'earth-arc__clocks' js/ui.js js/ui-*.js css/style.css || bad "clocks bar missing"
grep -qE "row\('UV( high)?'" js/ui.js js/ui-*.js || bad "UV label missing"
grep -q "UV today" js/ui-details.js || bad "UV today label missing"
grep -q "row('Solar'" js/ui.js js/ui-*.js || bad "solar label missing"
grep -q "row('Summer'" js/ui.js js/ui-*.js || bad "summer label missing"
grep -q 'getClockChanges' js/utils.js js/ui.js js/ui-*.js || bad "getClockChanges missing"
grep -q 'hourly-modal__list' js/ui.js js/ui-*.js || bad "enlarge list missing"
grep -q '_statRow' js/ui.js js/ui-*.js || bad "enlarge list rows missing"
! grep -q 'hourly-modal__stats' js/ui.js js/ui-*.js || bad "enlarge chips should stay removed"
grep -q "align-items: flex-start" css/style.css || bad "celestial columns not top-aligned"
grep -q 'Theme.apply' js/ui.js js/ui-*.js || bad "UI must paint the theme through Theme.apply"
! grep -q 'id="rememberToggle"' index.html || bad "remember toggle should be removed"
grep -q '3&nbsp;days\|3 days' index.html || bad "help should mention 3-day place memory"
grep -q 'PLACE_KEYS' js/utils.js || bad "place-key guard missing"
! grep -q 'theme-clear\|light-mode\|dark-mode\|dynamic-text' js/ui.js js/ui-*.js js/app.js js/utils.js css/style.css index.html offline.html || bad "dead weather-theme hooks are back"
grep -q 'sun.below ? 0 : 1' js/ui.js js/ui-*.js || bad "sunset→night theme flip missing"
! grep -q 'celestial__phase' js/ui.js js/ui-*.js || bad "phase should not be under Moon column"
# Fixed earth day/night orientation (flips at night so dark is on top)
grep -q 'rotate(180 50 50)' js/ui.js js/ui-*.js || bad "earth night flip missing"
grep -q 'earthStars\|earth-stars' js/ui.js js/ui-*.js || bad "earth stars missing"
grep -q 'orbitMarkNoon' js/ui.js js/ui-*.js || bad "Noon label id missing"
grep -q 'earthMarkN' js/ui.js js/ui-*.js || bad "earth compass N missing"
grep -q 'earthMarkE' js/ui.js js/ui-*.js || bad "earth compass E missing"
grep -q 'earthMarkS' js/ui.js js/ui-*.js || bad "earth compass S missing"
grep -q 'earthMarkW' js/ui.js js/ui-*.js || bad "earth compass W missing"
grep -q 'current-weather__compass' css/style.css || bad "earth compass CSS missing"
! grep -q '>Rise</text>\|>Set</text>' js/ui.js js/ui-*.js || bad "Rise/Set labels should be removed"
grep -q 'dayOutlook' js/ui.js js/ui-*.js || bad "shared dayOutlook missing"
grep -q 'dayNightTemps' js/utils.js || bad "Utils.dayNightTemps missing"
grep -q 'dayNightTemps' js/ui-forecast.js || bad "forecast must use dayNightTemps"
grep -q 'dayNightTemps' js/ui-current.js || bad "current High/Low must use dayNightTemps"
grep -q 'dayNightTemps' js/ui-modal.js || bad "day modal must use dayNightTemps"
grep -q 'hourly-modal__summary' js/ui-modal.js css/style.css || bad "day modal summary missing"
grep -q 'chanceWhen' js/utils.js js/ui-modal.js || bad "day chance timing missing"
grep -q 'hourIcon' js/icons.js || bad "hourIcon consistency helper missing"
grep -q 'dayIcon' js/icons.js js/ui-details.js || bad "dayIcon missing"
! grep -q 'leadPrecipCode\|dailyIcon\|dominantDayCode' js/icons.js js/ui.js js/ui-*.js || bad "old day-icon shortcuts are back"
grep -q '_hourlyNowIdx' js/ui.js js/ui-*.js || bad "hourly now-index for modal missing"
grep -q 'hourly-strip' js/ui.js js/ui-*.js css/style.css || bad "hourly strip missing"
grep -q 'hourly-strip__hour--now' js/ui.js js/ui-*.js css/style.css || bad "hourly Now column missing"
grep -q 'hourly-strip__day' js/ui.js js/ui-*.js css/style.css || bad "hourly day markers missing"
grep -q 'hourly-strip__tab' js/ui.js js/ui-*.js css/style.css || bad "hourly day tabs missing"
grep -q '_bindHourlyDayNav' js/ui.js js/ui-*.js || bad "hourly day tab/swipe sync missing"
grep -q 'Now → forward only' js/ui.js js/ui-*.js || bad "hourly Now-start comment missing"
grep -q 'forecast-card__pagerlead' js/ui-forecast.js || bad "forecast swipe mark missing"
grep -q 'Tap a day for more' js/ui-forecast.js || bad "forecast tap-for-more hint missing"
grep -q 'hourly-strip__hint-hours' js/ui-forecast.js || bad "hourly swipe mark missing"
grep -q 'Swipe to change chart' js/ui-chart.js || bad "chart swipe mark missing"
grep -A2 'No data available for this chart' js/ui-chart.js | grep -q 'Swipe to change chart' || bad "empty chart swipe mark missing"
! grep -q 'current-weather__extra' css/style.css css/responsive.css js/ui.js js/ui-*.js || bad "removed Now extra row is back"
! grep -q 'open-meteo.com/license"' index.html || bad "Open-Meteo licence link 404s; use /en/licence"
grep -q 'open-meteo.com/en/licence' index.html || bad "Open-Meteo licence link missing"
grep -q 'forecast-card__pager--stack' js/ui.js js/ui-*.js css/style.css || bad "stacked pager missing"
! grep -q 'hoursPerPage' js/ui.js js/ui-*.js || bad "hourly equal-height day pad should be gone"
! grep -q 'hourly-card__row--empty' js/ui.js js/ui-*.js css/style.css || bad "hourly empty pad cells should be gone"
! grep -q 'h24Btn\|hAllBtn' index.html || bad "24h/All tabs should be removed"
! grep -q 'pill-title' css/style.css js/ui.js js/ui-*.js index.html || bad "pill-title should be gone (titles outside)"
grep -q 'id="hourlyChartHead"' index.html || bad "chart section-head missing"
grep -q '>Graphs</h2>' index.html || bad "Graphs section title missing"
grep -q 'id="earthArcSection"' index.html || bad "earth section-head missing"
grep -q 'id="detailSection"' index.html || bad "detail section-head missing"
grep -q 'id="windSection"' index.html || bad "wind section-head missing"
! grep -qE 'earth-arc__title|hourly-chart__title|class="pill-title|detail-box__title">Wind' js/ui.js js/ui-*.js || bad "in-pill titles still rendered"
grep -q 'hourly-modal__head">${this._esc' js/ui.js js/ui-*.js || bad "modal head not escaped"
pass "empty start / modal / earth guards"

# --- local fonts (no CDN) ---
grep -q "@font-face" css/style.css || bad "@font-face missing"
grep -qF -- "--font-body: 'DM Sans'" css/style.css || bad "DM Sans body missing"
grep -qF -- "--font-heading: 'Sora'" css/style.css || bad "Sora heading missing"
grep -qE 'fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net/npm/@fontsource' css/style.css index.html && bad "external font CDN reference" || true
for f in \
  assets/fonts/dm-sans-latin-400-normal.woff2 \
  assets/fonts/dm-sans-latin-600-normal.woff2 \
  assets/fonts/dm-sans-latin-700-normal.woff2 \
  assets/fonts/sora-latin-600-normal.woff2 \
  assets/fonts/sora-latin-700-normal.woff2 \
  assets/fonts/sora-latin-800-normal.woff2
do
  [ -f "$f" ] || bad "missing font $f"
  grep -q "'./$f'" sw.js || bad "sw.js missing $f"
  grep -q "$f" css/style.css || bad "style.css missing url for $f"
done
grep -q 'weather-content--stagger' js/ui.js js/ui-*.js || bad "stagger class missing in ui.js"
grep -q 'weather-content--stagger' css/style.css || bad "stagger styles missing"
pass "local fonts + stagger"

# --- regression guards ---
grep -q '_suggestSeq' js/app.js || bad "typeahead must have its own sequence counter"
grep -q 'sameSpot' js/app.js || bad "offline fallback must match the requested place"
grep -q '_modalAnimId' js/ui.js js/ui-*.js || bad "modal slide must ignore stale timers"
grep -qF "timeZone: this._tz || undefined, weekday: 'short' })" js/ui.js js/ui-*.js || bad "hourly weekday labels must use the place timezone"
pass "regression guards"


grep -q 'seclusa-base.css' sw.js || bad "sw.js missing seclusa-base.css precache"
grep -q 'ui-current.js' sw.js index.html || bad "ui-current.js not wired"
grep -q 'ui-modal.js' sw.js index.html || bad "ui-modal.js not wired"
grep -q 'id="locationBtn"' index.html || bad "search location button id missing"
grep -q 'data-bg-opt="grid"' index.html || bad "theme lines/grid swatch missing"
grep -q 'data-bg-opt="lightblue"' index.html || bad "theme light blue swatch missing"
grep -q 'data-bg-opt="teal"' index.html || bad "theme teal swatch missing"
grep -q 'data-bg-opt="orange"' index.html || bad "theme orange swatch missing"
grep -q 'data-bg-opt="purple"' index.html || bad "theme purple swatch missing"
grep -q 'data-bg-opt="black"' index.html || bad "theme black swatch missing"
grep -q 'teal: 1' js/store.js || bad "store teal palette missing"
grep -q 'html\[data-bg="teal"\]' css/style.css || bad "teal solid fill CSS missing"
grep -q 'id="bgCustomPicker"' index.html || bad "custom colour picker missing"
grep -q 'setBgCustom' js/store.js js/ui.js || bad "custom colour store/ui missing"
grep -q 'data-bg-period="day"' index.html || bad "day sky background period missing"
grep -q 'backgroundNight' js/store.js || bad "night background setting missing"
grep -q '_paintActiveBackground' js/ui.js || bad "active sky background paint missing"
grep -q 'toolbar__dropdown--theme' index.html css/style.css || bad "unified theme dropdown missing"
! grep -q 'refreshBtn\|bgMenuBtn\|locationBtnSettings' index.html || bad "removed toolbar controls still in html"
grep -q '_modalReturnFocus' js/ui.js js/ui-*.js || bad "modal focus restore missing"
grep -q 'patchData' js/store.js || bad "Store.patchData missing"
grep -q 'PREF_KEYS' js/utils.js || bad "Utils.PREF_KEYS missing"
grep -q 'href="https://github.com/ambr3/weather"' index.html || bad "GitHub open-source link missing"

if [ "$fail" -ne 0 ]; then
  echo "SMOKE FAILED"
  exit 1
fi
echo "SMOKE OK ($sw_ver)"
