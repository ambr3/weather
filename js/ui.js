const UI = {
  $: (id) => document.getElementById(id),

  _chartMode: 'temp',
  _measureCanvas: null,
  _measureCtx: null,
  _hourly: null,
  _hourlyStart: 0,
  _hourlyCount: 0,
  _forecastDaily: null,
  _forecastCount: 0,
  _forecastUnits: 'metric',
  _forecastHourly: null,
  _modalUnits: 'metric',
  _modalMode: 'hourly',
  _modalCount: 0,
  _modalIndex: null,
  _modalOpen: false,
  _modalSlideDir: 0,
  _modalReturnFocus: null,
  _tz: null,
  _hourlyModalBound: false,
  _modalKeyHandler: null,
  _chartSwipeBound: false,
  _current: null,
  CHART_MODES: ['temp', 'rain', 'solar'],

  _getMeasureCtx() {
    if (!this._measureCanvas) {
      this._measureCanvas = document.createElement('canvas');
      this._measureCtx = this._measureCanvas.getContext('2d');
    }
    this._measureCtx.font = '600 18px system-ui, sans-serif';
    return this._measureCtx;
  },

  // Full-orbit around Earth. Rise = left, day = top, set = right, night = bottom.
  // Night only flips the disc paint (dark on top) — orb path direction stays the same.
  // Open-Meteo often nulls moonrise (rose yesterday) or moonset (sets tomorrow);
  // synthesise the missing limb so the orb still shows.
  _orbitFor(rise, set, tz, radius, nextRise) {
    if (!rise && !set) return null;
    const MEAN_UP_MS = 12.42 * 60 * 60 * 1000;
    const MEAN_CYCLE_MS = 24.84 * 60 * 60 * 1000;

    let r = rise ? Utils.parseLocal(rise, tz).getTime() : NaN;
    let s = set ? Utils.parseLocal(set, tz).getTime() : NaN;
    if (rise && isNaN(r)) return null;
    if (set && isNaN(s)) return null;

    if (!rise && set) r = s - MEAN_UP_MS;
    else if (rise && !set) s = r + MEAN_UP_MS;

    if (s <= r) {
      // Set falls on the next local day — advance by one local day so DST
      // transitions don't skew the path (offset delta between the two days).
      const offNow = Utils.tzOffsetMs(tz, s);
      const offNext = Utils.tzOffsetMs(tz, s + 24 * 60 * 60 * 1000);
      s += 24 * 60 * 60 * 1000 + (offNow - offNext);
    }
    const dayDur = s - r;
    if (dayDur > 26 * 60 * 60 * 1000 || dayDur <= 0) return null;

    let nextR = nextRise ? Utils.parseLocal(nextRise, tz).getTime() : NaN;
    if (!Number.isFinite(nextR) || nextR <= s) {
      if (rise) {
        const offRise = Utils.tzOffsetMs(tz, r);
        const offNext = Utils.tzOffsetMs(tz, r + 24 * 60 * 60 * 1000);
        nextR = r + 24 * 60 * 60 * 1000 + (offRise - offNext);
      } else {
        nextR = r + MEAN_CYCLE_MS;
      }
    }
    if (nextR <= s) nextR = s + Math.max(1, MEAN_CYCLE_MS - dayDur);

    const nightDur = Math.max(1, nextR - s);
    const cycle = nextR - r;

    let now = Date.now();
    if (now < r) now += Math.ceil((r - now) / cycle) * cycle;
    if (now >= nextR) now -= Math.floor((now - r) / cycle) * cycle;

    let angle;
    let below;
    if (now <= s) {
      const f = Math.max(0, Math.min(1, (now - r) / dayDur));
      angle = Math.PI * (1 - f);
      below = false;
    } else {
      const f = Math.max(0, Math.min(1, (now - s) / nightDur));
      angle = -Math.PI * f;
      below = true;
    }

    const cx = 50;
    const cy = 50;
    const rad = radius != null ? radius : 40;
    return {
      left: +(cx + rad * Math.cos(angle)).toFixed(2),
      top: +(cy - rad * Math.sin(angle)).toFixed(2),
      angle,
      deg: +((-angle * 180) / Math.PI).toFixed(2),
      below,
    };
  },


  _hourlyStartIdx(hourly) {
    if (!hourly || !hourly.time) return 0;
    const now = Date.now();
    for (let i = 0; i < hourly.time.length; i++) {
      if (Utils.parseLocal(hourly.time[i], this._tz).getTime() >= now) return i;
    }
    return hourly.time.length;
  },

  showLoading() {
    this.$('loading').classList.remove('hidden');
    this.$('errorMessage').classList.add('hidden');
    this.$('weatherContent').classList.add('hidden');
    const arcSec = this.$('earthArcSection');
    const arc = this.$('earthArc');
    if (arcSec) arcSec.classList.add('hidden');
    if (arc) arc.innerHTML = '';
  },

  hideLoading() {
    this.$('loading').classList.add('hidden');
  },

  showError(msg) {
    this.hideLoading();
    this.$('weatherContent').classList.add('hidden');
    const arcSec = this.$('earthArcSection');
    const arc = this.$('earthArc');
    if (arcSec) arcSec.classList.add('hidden');
    if (arc) arc.innerHTML = '';
    const el = this.$('errorMessage');
    el.textContent = msg;
    el.classList.remove('hidden');
  },

  hideError() {
    this.$('errorMessage').classList.add('hidden');
  },

  showEmptyStart() {
    this.hideLoading();
    this.$('weatherContent').classList.add('hidden');
    const arcSec = this.$('earthArcSection');
    const arc = this.$('earthArc');
    if (arcSec) arcSec.classList.add('hidden');
    if (arc) arc.innerHTML = '';
    const el = this.$('errorMessage');
    el.textContent = 'Search for a city or use your location to see the forecast.';
    el.classList.remove('hidden');
  },

  markOffline(show) {
    const el = this.$('offlineNotice');
    if (el) el.classList.toggle('hidden', !show);
  },

  markStale(show, message) {
    const el = this.$('staleNotice');
    if (el) {
      if (message) this.$('staleNoticeText').textContent = message;
      el.classList.toggle('hidden', !show);
    }
  },

  setUpdatedAt(ts) {
    const el = this.$('lastUpdated');
    const current = this.$('currentUpdated');
    if (!Number.isFinite(ts)) {
      if (el) el.classList.add('hidden');
      return;
    }
    this._dataUpdatedAt = ts;
    const diffMs = Date.now() - ts;
    const mins = Math.floor(diffMs / (60 * 1000));
    const d = new Date(ts);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let label;
    if (mins < 1) label = 'Updated just now';
    else if (mins < 60) label = `Updated ${mins} min ago`;
    else if (mins < 60 * 24) label = `Last refreshed at ${time}`;
    else label = `Last refreshed ${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} at ${time}`;
    if (el) {
      el.textContent = label;
      el.classList.remove('hidden');
    }
    if (current) current.textContent = `Updated ${Utils.formatClock(d)}`;
  },

  // Values for the "Now" tile/modal slot, preferring the live current-weather
  // observation so it stays consistent with the summary card. Rain % is the
  // current-hour probability (only shown when this hour actually has rain or
  // snow expected), never the whole-day maximum.
  _nowFromCurrent(cur, hourly, units) {
    if (!cur) return null;
    const startIdx = this._hourlyStartIdx(hourly);
    const pop = this._meaningfulNowPop(cur, hourly, startIdx);
    return {
      pop,
      temp: cur.temperature_2m != null ? Utils.formatTemp(cur.temperature_2m, units) : null,
      tempRaw: cur.temperature_2m != null ? cur.temperature_2m : null,
      feels: cur.apparent_temperature != null ? Utils.formatTemp(cur.apparent_temperature, units) : null,
      feelsRaw: cur.apparent_temperature != null ? cur.apparent_temperature : null,
      humidity: cur.relative_humidity_2m != null ? `${Math.round(cur.relative_humidity_2m)}%` : null,
      wind: cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) : null,
      windDir: cur.wind_direction_10m != null ? Math.round(cur.wind_direction_10m) : null,
      gust: cur.wind_gusts_10m != null ? Math.round(cur.wind_gusts_10m) : null,
      precip: cur.precipitation != null ? cur.precipitation : null,
      snow: cur.snowfall != null ? cur.snowfall : null,
      dew: cur.dew_point_2m != null ? Utils.formatTemp(cur.dew_point_2m, units) : null,
      pressure: cur.pressure_msl != null ? Utils.formatPressure(cur.pressure_msl, UI.pressUnit) : null,
      cloud: cur.cloud_cover != null ? `${Math.round(cur.cloud_cover)}%` : null,
      visibility: cur.visibility != null ? Utils.formatVisibility(cur.visibility, UI.visUnit) : null,
      cape: cur.cape != null ? cur.cape : null,
      code: cur.weather_code != null ? cur.weather_code : null,
      isDay: cur.is_day != null ? cur.is_day : null,
    };
  },

  // Night: rotate disc paint so dark (+stars) is on top. Orbit marks and orb
  // coords stay fixed (day top / night bottom) so sun & moon keep the same path.
  // Compass letters stay upright but swap places with the paint (N↔S, E↔W).
  _syncEarthOrientation(isNight) {
    const host = this.$('earthArcSection') || this.$('earthArc');
    if (host) host.classList.toggle('earth-arc--night', !!isNight);
    const sky = isNight ? 'night' : 'day';
    const root = document.documentElement;
    const skyChanged = root.getAttribute('data-sky') !== sky;
    root.setAttribute('data-sky', sky);
    if (skyChanged && window.Store && window.Store.setSkyPeriod) {
      window.Store.setSkyPeriod(sky);
    }
    const hemi = document.getElementById('earthHemispheres');
    if (hemi) hemi.setAttribute('transform', isNight ? 'rotate(180 50 50)' : '');
    // Day: S toward Day mark (top), N toward Night (bottom), E=rise (left), W=set (right).
    // Night: same relative to paint after the 180° disc flip.
    const pos = isNight
      ? { N: [50, 30.2], S: [50, 72.2], E: [70.8, 51.2], W: [29.2, 51.2] }
      : { N: [50, 72.2], S: [50, 30.2], E: [29.2, 51.2], W: [70.8, 51.2] };
    ['N', 'S', 'E', 'W'].forEach((k) => {
      const el = document.getElementById(`earthMark${k}`);
      if (!el) return;
      el.setAttribute('x', String(pos[k][0]));
      el.setAttribute('y', String(pos[k][1]));
    });
    this._paintActiveBackground();
  },

  _setOrbPositions(sun, moon) {
    const parts = [];
    if (sun) parts.push(`--sun-x:${sun.left}%`, `--sun-y:${sun.top}%`);
    if (moon) parts.push(`--moon-x:${moon.left}%`, `--moon-y:${moon.top}%`);
    if (parts.length) Utils.dynCSS.set('orbs', `:root{${parts.join(';')}}`);
  },

  startLiveClock() {
    if (this._liveClockTimer) clearInterval(this._liveClockTimer);
    this.updateLiveClock();
    this._liveClockTimer = setInterval(() => this.updateLiveClock(), 60000);
  },

  updateLiveClock() {
    if (!this._arc) return;
    const { tz, sunrise, sunset, moonrise, moonset, nextMoonrise, sunR, moonR, weatherCode } = this._arc;
    const sun = this._orbitFor(sunrise, sunset, tz, sunR);
    const moon = this._orbitFor(moonrise, moonset, tz, moonR, nextMoonrise);
    const sunEl = document.querySelector('.current-weather__arc-sun');
    const moonEl = document.querySelector('.current-weather__arc-moon');
    if (sunEl && sun) {
      sunEl.classList.remove('is-hidden');
      sunEl.classList.toggle('is-below', !!sun.below);
    } else if (sunEl) {
      sunEl.classList.add('is-hidden');
    }
    if (moonEl && moon) {
      moonEl.classList.remove('is-hidden');
      moonEl.classList.toggle('is-below', !!moon.below);
    } else if (moonEl) {
      moonEl.classList.add('is-hidden');
    }
    this._setOrbPositions(sun, moon);
    // Mirror renderCurrentWeather: when sun times are missing, keep API is_day
    // instead of treating a null orbit as daytime.
    const isNight = sun ? !!sun.below : this._arc.isDay === 0;
    this._syncEarthOrientation(isNight);
    // Swap the icon to its night version when the sun crosses the horizon.
    if (sun && weatherCode != null) {
      const isDay = sun.below ? 0 : 1;
      if (this._arc.isDay !== isDay) {
        this._arc.isDay = isDay;
        const iconEl = document.querySelector('.current-weather__icon');
        if (iconEl) {
          iconEl.classList.toggle('is-night', isDay === 0);
          iconEl.innerHTML = WeatherIcons.get(weatherCode, isDay);
        }
      }
    }
  },

  renderWeather(weatherData, aqData, units, cityName, country, lat, lon) {
    if (!weatherData) return;
    if (!window.__appRendered) {
      window.__appRendered = true;
      if (typeof window.__onFirstRender === 'function') window.__onFirstRender();
    }
    this.hideLoading();
    this.hideError();
    this._tz = weatherData.timezone ? weatherData.timezone : null;
    this._current = weatherData.current || null;
    weatherData._cityName = cityName;
    weatherData._country = country;
    this.$('weatherContent').classList.remove('hidden');
    this.$('weatherContent').classList.add('weather-content--visible');
    if (!this._weatherStaggered) {
      this._weatherStaggered = true;
      this.$('weatherContent').classList.add('weather-content--stagger');
    }
    this.renderCurrentWeather(weatherData, units);
    this.renderForecast(weatherData.daily, units, weatherData.hourly);
    this.renderHourly(weatherData.hourly, units);
    this.renderHourlyChart(weatherData.hourly, units);
    this.renderDetailBoxes(weatherData, aqData, units);
    const windUnit = Utils.getWindUnit(this.windUnit);
    const cur = weatherData.current;
    const windSpeed = cur && cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) : null;
    UI._compassWindLabel = windSpeed != null ? `${windSpeed} ${windUnit}` : '';
    UI._compassWindDir = cur && cur.wind_direction_10m != null
      ? Math.round(cur.wind_direction_10m)
      : null;
    const gust = cur && cur.wind_gusts_10m != null ? Math.round(cur.wind_gusts_10m) : null;
    UI._compassGustLabel = gust != null ? `${gust} ${windUnit}` : '';
    const todayWind = this._todayWindStats(weatherData.hourly, windUnit);
    UI._compassTodayWind = todayWind;
    UI._compassCityName = cityName;
    UI._compassCountry = country;
    if (lat != null && lon != null) {
      this.renderWindCompass(lat, lon, UI._compassWindLabel, UI._compassWindDir, UI._compassGustLabel, todayWind);
    } else {
      this.hideCompass();
    }
  },

  _todayDateKey() {
    try {
      const dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone: this._tz, year: 'numeric', month: '2-digit', day: '2-digit',
      });
      return dtf.format(new Date());
    } catch {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }
  },

  _dominantDir(dirs) {
    let sx = 0, sy = 0;
    for (const d of dirs) {
      const r = (d * Math.PI) / 180;
      sx += Math.cos(r);
      sy += Math.sin(r);
    }
    return (Math.round(Math.atan2(sy, sx) * 180 / Math.PI) % 360 + 360) % 360;
  },

  _todayWindStats(hourly, windUnit) {
    if (!hourly || !hourly.time || !hourly.wind_speed_10m) return null;
    const prefix = this._todayDateKey() + 'T';
    let maxWind = null;
    let maxGust = null;
    let minWind = null;
    const dirs = [];
    for (let k = 0; k < hourly.time.length; k++) {
      if (!String(hourly.time[k] || '').startsWith(prefix)) continue;
      const w = hourly.wind_speed_10m[k];
      if (w != null && Number.isFinite(w)) {
        if (maxWind == null || w > maxWind.v) maxWind = { v: w, k };
        if (minWind == null || w < minWind.v) minWind = { v: w, k };
      }
      const g = hourly.wind_gusts_10m ? hourly.wind_gusts_10m[k] : null;
      if (g != null && Number.isFinite(g) && (maxGust == null || g > maxGust.v)) maxGust = { v: g, k };
      const d = hourly.wind_direction_10m ? hourly.wind_direction_10m[k] : null;
      if (d != null && Number.isFinite(d)) dirs.push(d);
    }
    if (!maxWind && !maxGust) return null;
    const fmt = (t) => Utils.formatHourShort(hourly.time[t], this._tz);
    return {
      maxWind: maxWind ? `${Math.round(maxWind.v)} ${windUnit} at ${fmt(maxWind.k)}` : null,
      maxGust: maxGust ? `${Math.round(maxGust.v)} ${windUnit} at ${fmt(maxGust.k)}` : null,
      minWind: minWind ? `${Math.round(minWind.v)} ${windUnit} at ${fmt(minWind.k)}` : null,
      prevailing: dirs.length ? Utils.getWindDirection(this._dominantDir(dirs)) : null,
    };
  },

  setUnitLabel(units) {
    const label = units === 'imperial' ? '°F' : '°C';
    this.$('unitLabel').textContent = label;
    const el = this.$('unitMenuLabel');
    if (el) el.textContent = label;
  },

  setWindUnitLabel(code) {
    this.windUnit = code;
    const el = this.$('windLabel');
    if (el) el.textContent = Utils.getWindUnit(code);
  },

  setVisLabel(code) {
    this.visUnit = code;
    const el = this.$('visLabel');
    if (el) el.textContent = code === 'mi' ? 'mi' : 'km';
  },

  setPressUnit(code) {
    this.pressUnit = code === 'inHg' ? 'inHg' : 'hPa';
  },

  _themeIconSun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="M4.93 4.93l1.41 1.41"></path><path d="M17.66 17.66l1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="M6.34 17.66l-1.41 1.41"></path><path d="M19.07 4.93l-1.41 1.41"></path>',
  _themeIconMoon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>',

  _setThemeIcon(isDark) {
    const icon = this.$('themeIcon');
    if (icon) icon.innerHTML = isDark ? this._themeIconMoon : this._themeIconSun;
  },

  _paintTheme(mode) {
    const resolved = window.Theme.apply(mode);
    const label = this.$('themeLabel');
    if (label) label.textContent = 'Theme';
    this._setThemeIcon(resolved === 'dark');
    document.querySelectorAll('[data-theme-opt]').forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.getAttribute('data-theme-opt') === mode));
    });
  },

  _bgEditPeriod: 'day',

  initThemeToggle() {
    if (window.Store && window.Store.migrateBackgrounds) window.Store.migrateBackgrounds();
    this._paintTheme(window.Theme.current());
    this._paintActiveBackground();
  },

  setThemeMode(mode) {
    const next = mode === 'light' || mode === 'dark' ? mode : 'system';
    window.Theme.set(next);
    this._paintTheme(next);
  },

  _BG_OPTS: {
    grid: 1, blue: 1, lightblue: 1, green: 1, red: 1,
    yellow: 1, black: 1, white: 1, custom: 1
  },

  _skyPeriod() {
    return document.documentElement.getAttribute('data-sky') === 'night' ? 'night' : 'day';
  },

  _resolveBg(mode) {
    if (this._BG_OPTS[mode]) return mode;
    const legacy = {
      sky: 'lightblue', ocean: 'blue', slate: 'black', forest: 'green',
      sunset: 'red', violet: 'blue', rose: 'red', amber: 'yellow', plain: 'white'
    };
    return legacy[mode] || 'grid';
  },

  setBgEditPeriod(period) {
    this._bgEditPeriod = period === 'night' ? 'night' : 'day';
    this._previewEditBackground();
  },

  _paintBgPeriodChrome() {
    const period = this._bgEditPeriod === 'night' ? 'night' : 'day';
    const dayBtn = this.$('bgPeriodDay');
    const nightBtn = this.$('bgPeriodNight');
    if (dayBtn) dayBtn.setAttribute('aria-pressed', String(period === 'day'));
    if (nightBtn) nightBtn.setAttribute('aria-pressed', String(period === 'night'));
    const hint = this.$('bgPeriodHint');
    if (hint) {
      hint.textContent = period === 'night'
        ? 'Night colour — switches at sunrise/sunset (not Light/Dark)'
        : 'Day colour — switches at sunrise/sunset (not Light/Dark)';
    }
    const stored = this._resolveBg(window.Store && window.Store.getBackground
      ? window.Store.getBackground(period)
      : 'grid');
    const custom = window.Store && window.Store.getBgCustom
      ? window.Store.getBgCustom(period)
      : '#5faff0';
    const colour = /^#[0-9a-fA-F]{6}$/.test(custom) ? custom.toLowerCase() : '#5faff0';
    const picker = this.$('bgCustomPicker');
    if (picker) picker.value = colour;
    /* Face colour via dynCSS — never element.style (CSP / smoke). */
    if (window.Utils && window.Utils.dynCSS) {
      window.Utils.dynCSS.set(
        'bg-custom-swatch',
        `#bgCustomSwatch { --swatch: ${colour}; }`
      );
    }
    document.querySelectorAll('[data-bg-opt]').forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.getAttribute('data-bg-opt') === stored));
    });
  },

  _bgLuma(hex) {
    const m = /^#([0-9a-fA-F]{6})$/.exec(hex || '');
    if (!m) return 0.5;
    const n = parseInt(m[1], 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  },

  _bgToneFor(value, customHex) {
    if (value === 'grid') return null;
    if (value === 'black') return 'dark';
    if (value === 'white' || value === 'yellow' || value === 'lightblue'
      || value === 'blue' || value === 'green' || value === 'red') {
      return 'light';
    }
    /* custom: dark cards only on near-black; otherwise light frosted cards. */
    return this._bgLuma(customHex) < 0.18 ? 'dark' : 'light';
  },

  _applyBackground(mode, customHex) {
    const value = this._resolveBg(mode);
    const colour = /^#[0-9a-fA-F]{6}$/.test(customHex || '') ? customHex.toLowerCase() : '#5faff0';
    const root = document.documentElement;
    const tone = this._bgToneFor(value, colour);
    if (tone) root.setAttribute('data-bg-tone', tone);
    else root.removeAttribute('data-bg-tone');

    if (window.Utils && window.Utils.dynCSS) {
      /* Must beat theme-boot adopted sheet (same specificity, later in the list). */
      window.Utils.dynCSS.set('bg-custom', `html { --bg-custom: ${colour}; }`);
      if (value !== 'grid' && value !== 'custom') {
        const solids = {
          blue: '#3b82f6', lightblue: '#7dd3fc', green: '#22c55e', red: '#ef4444',
          yellow: '#facc15', black: '#0a0a0a', white: '#ffffff'
        };
        const solid = solids[value] || colour;
        window.Utils.dynCSS.set(
          'bg-solid-live',
          `html[data-bg="${value}"] { --bg-solid: ${solid}; --color-bg-start: ${solid}; background-color: ${solid}; }`
        );
        window.Utils.dynCSS.set(
          'bg-solid-body',
          `html[data-bg="${value}"] body, html[data-bg="${value}"] body::before { background-color: ${solid}; background-image: none; }`
        );
      } else if (value === 'custom') {
        window.Utils.dynCSS.set(
          'bg-solid-live',
          `html[data-bg="custom"] { --bg-solid: ${colour}; --color-bg-start: ${colour}; background-color: ${colour}; }`
        );
        window.Utils.dynCSS.set(
          'bg-solid-body',
          `html[data-bg="custom"] body, html[data-bg="custom"] body::before { background-color: ${colour}; background-image: none; }`
        );
      } else {
        window.Utils.dynCSS.del('bg-solid-live');
        window.Utils.dynCSS.del('bg-solid-body');
      }
    }
    root.setAttribute('data-bg', value);
  },

  _previewEditBackground() {
    const period = this._bgEditPeriod === 'night' ? 'night' : 'day';
    const mode = window.Store && window.Store.getBackground
      ? window.Store.getBackground(period)
      : 'grid';
    const custom = window.Store && window.Store.getBgCustom
      ? window.Store.getBgCustom(period)
      : '#5faff0';
    this._applyBackground(mode, custom);
    this._paintBgPeriodChrome();
  },

  _paintActiveBackground() {
    const sky = this._skyPeriod();
    const mode = window.Store && window.Store.getBackground
      ? window.Store.getBackground(sky)
      : 'grid';
    const custom = window.Store && window.Store.getBgCustom
      ? window.Store.getBgCustom(sky)
      : '#5faff0';
    this._applyBackground(mode, custom);
    this._paintBgPeriodChrome();
  },

  setBackgroundMode(mode) {
    const next = this._resolveBg(mode);
    const period = this._bgEditPeriod === 'night' ? 'night' : 'day';
    if (window.Store && window.Store.setBackground) window.Store.setBackground(next, period);
    /* Always preview the colour just picked so Day/Night edits are visible now. */
    this._previewEditBackground();
  },

  setCustomBackground(hex) {
    const period = this._bgEditPeriod === 'night' ? 'night' : 'day';
    const colour = window.Store && window.Store.setBgCustom
      ? window.Store.setBgCustom(hex, period)
      : '#5faff0';
    this._previewEditBackground();
    return colour;
  },

  _esc(str) {
    if (str == null) return '';
    const el = document.createElement('span');
    el.textContent = String(str);
    return el.innerHTML;
  },

  _metricIcon(name) {
    const icons = {
      precip: `<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>`,
      humidity: `<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>`,
      wind: `<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>`,
      uv: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/>`,
      visibility: `<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>`,
      pressure: `<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>`,
      bolt: `<path d="M13 2 3 14h7l-1 8 10-14h-7l1-8z"/>`,
      aqi: `<path d="M11 20A7 7 0 0 1 9.8 6.1C15.6 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>`,
      pollen: `<circle cx="12" cy="12" r="2.5"/><path d="M12 5v-2"/><path d="M12 21v-2"/><path d="M5 12H3"/><path d="M21 12h-2"/><path d="M6.8 6.8 5.4 5.4"/><path d="M18.6 18.6l-1.4-1.4"/><path d="M17.2 6.8l1.4-1.4"/><path d="M5.4 18.6l1.4-1.4"/>`,
      swap: `<path d="M7 3v14"/><path d="M4 14l3 3 3-3"/><path d="M17 21V7"/><path d="M14 10l-3-3-3 3"/>`,
    };
    const body = icons[name] || '';
    if (!body) return '';
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  },
};
