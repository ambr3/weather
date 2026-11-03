const App = {
  units: (() => {
    const u = Utils.safeGet('units', null);
    return u === 'imperial' || u === 'metric' ? u : CONFIG.DEFAULT_UNITS;
  })(),
  windUnit: (() => {
    const allowed = ['kmh', 'mph', 'kn', 'ms'];
    const w = Utils.safeGet('windUnit', null);
    if (allowed.includes(w)) return w;
    return CONFIG.DEFAULT_WIND_UNIT;
  })(),
  visUnit: Utils.safeGet('visUnit', null) === 'km' ? 'km' : CONFIG.DEFAULT_VIS_UNIT,
  pressUnit: Utils.safeGet('pressUnit', null) === 'inHg' ? 'inHg' : 'hPa',
  chartMode: (() => {
    const m = Utils.safeGet('chartMode', 'temp');
    return ['temp', 'rain', 'solar'].includes(m) ? m : 'temp';
  })(),
  lastCity: (() => {
    const c = Utils.safeGet('lastCity', null);
    return c == null ? null : String(c).slice(0, 80);
  })(),
  lastCountry: String(Utils.safeGet('lastCountry', '') || '').slice(0, 8),
  lastLat: (() => {
    const la = parseFloat(Utils.safeGet('lastLat', ''));
    return Number.isFinite(la) && la >= -90 && la <= 90 ? la : NaN;
  })(),
  lastLon: (() => {
    const lo = parseFloat(Utils.safeGet('lastLon', ''));
    return Number.isFinite(lo) && lo >= -180 && lo <= 180 ? lo : NaN;
  })(),
  deferredPrompt: null,
  dropdownResults: [],
  dropdownIndex: -1,
  _weatherSeq: 0,
  _searchSeq: 0,
  _suggestSeq: 0,
  _locSeq: 0,
  _userBusy: 0,
  _blurTimer: null,
  _last: null,

  _placeExpired() {
    const at = parseInt(Utils.safeGet('lastPlaceAt', ''), 10);
    if (!Number.isFinite(at)) {
      // One-time migrate: stamp existing installs so they aren't wiped on upgrade
      if (Number.isFinite(this.lastLat) && Number.isFinite(this.lastLon)) {
        Utils.safeSet('lastPlaceAt', Date.now());
        return false;
      }
      return true;
    }
    return Date.now() - at > Utils.WEATHER_CACHE_TTL_MS;
  },

  _clearSavedPlace() {
    this.lastCity = null;
    this.lastCountry = '';
    this.lastLat = NaN;
    this.lastLon = NaN;
    try {
      localStorage.removeItem('lastCity');
      localStorage.removeItem('lastCountry');
      localStorage.removeItem('lastLat');
      localStorage.removeItem('lastLon');
      localStorage.removeItem('lastPlaceAt');
      localStorage.removeItem('weatherCache');
    } catch (e) { /* ignore */ }
    try {
      if (window.Store && window.Store.patchData) window.Store.patchData({ weatherCache: undefined });
    } catch (e) { /* ignore */ }
  },


  init() {
    // Best-effort anti-framing for hosts that ignore frame-ancestors in <meta>
    // (e.g. GitHub Pages). Real protection still needs the HTTP header samples.
    try {
      if (window.top !== window.self) {
        window.top.location.replace(window.self.location.href);
      }
    } catch (e) { /* cross-origin frame — leave blank */ }

    if ((Number.isFinite(this.lastLat) || Number.isFinite(this.lastLon)) && this._placeExpired()) {
      this._clearSavedPlace();
    }

    UI.setUnitLabel(this.units);
    UI.setWindUnitLabel(this.windUnit);
    UI.setVisLabel(this.visUnit);
    UI.setPressUnit(this.pressUnit);
    UI.initThemeToggle();

    window.__onFirstRender = () => this.dismissSplash();
    setTimeout(() => this.dismissSplash(), 3200);

    this.$('searchForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const city = this.$('searchInput').value.trim();
      if (city) this.searchCity(city);
    });

    const debouncedSearch = Utils.debounce((q) => this.showDropdown(q), 280);
    this.$('searchInput').addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (q.length < 2) { this.hideDropdown(); return; }
      debouncedSearch(q);
    });

    this.$('searchInput').addEventListener('keydown', (e) => this.handleDropdownKeys(e));
    this.$('searchInput').addEventListener('blur', () => {
      if (this._blurTimer) clearTimeout(this._blurTimer);
      this._blurTimer = setTimeout(() => this.hideDropdown(), 150);
    });
    this.$('searchInput').addEventListener('focus', () => {
      if (this._blurTimer) { clearTimeout(this._blurTimer); this._blurTimer = null; }
      const q = this.$('searchInput').value.trim();
      if (q.length >= 2 && this.dropdownResults.length) this.showDropdownList();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-form') && !e.target.closest('.search-dropdown')) {
        this.hideDropdown();
      }
      if (!e.target.closest('#unitsMenu')) this.closeUnitsMenu();
      /* Native colour dialog clicks land outside the menu — do not dismiss mid-pick. */
      if (!e.target.closest('#themeMenu') && !this._bgColourPicking) this.closeThemeMenu();
    });

    this.$('unitToggle').addEventListener('click', () => {
      const prev = this.units;
      this.units = this.units === 'metric' ? 'imperial' : 'metric';
      Utils.safeSet('units', this.units);
      UI.setUnitLabel(this.units);
      this.applyUnitChange(prev, this.units, this.windUnit, this.windUnit);
    });

    this.$('windToggle').addEventListener('click', () => {
      const cycle = ['kmh', 'mph', 'kn', 'ms'];
      const prev = this.windUnit;
      this.windUnit = cycle[(cycle.indexOf(this.windUnit) + 1) % cycle.length];
      Utils.safeSet('windUnit', this.windUnit);
      UI.setWindUnitLabel(this.windUnit);
      this.applyUnitChange(this.units, this.units, prev, this.windUnit);
    });

    this.$('visToggle').addEventListener('click', () => {
      this.visUnit = this.visUnit === 'km' ? 'mi' : 'km';
      Utils.safeSet('visUnit', this.visUnit);
      UI.setVisLabel(this.visUnit);
      this.rerenderLocal();
    });

    this.$('unitMenuBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeThemeMenu();
      this.toggleUnitsMenu();
    });

    this.$('themeMenuBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeUnitsMenu();
      this.toggleThemeMenu();
    });

    document.querySelectorAll('[data-theme-opt]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        UI.setThemeMode(btn.getAttribute('data-theme-opt'));
      });
    });

    document.querySelectorAll('[data-bg-period]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        UI.setBgEditPeriod(btn.getAttribute('data-bg-period'));
      });
    });

    document.querySelectorAll('[data-bg-opt]').forEach((btn) => {
      if (btn.id === 'bgCustomSwatch') return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        UI.setBackgroundMode(btn.getAttribute('data-bg-opt'));
      });
    });

    const customPicker = this.$('bgCustomPicker');
    const customSwatch = this.$('bgCustomSwatch');
    if (customPicker) {
      const applyCustom = (e) => {
        if (e) e.stopPropagation();
        UI.setCustomBackground(customPicker.value);
      };
      customPicker.addEventListener('input', applyCustom);
      customPicker.addEventListener('change', applyCustom);
      /* Keep Theme menu open while the OS colour dialog is up. */
      customPicker.addEventListener('click', (e) => {
        e.stopPropagation();
        this._bgColourPicking = true;
      });
      customPicker.addEventListener('blur', () => {
        this._bgColourPicking = false;
        applyCustom();
      });
    }
    if (customSwatch) {
      customSwatch.addEventListener('click', (e) => {
        e.stopPropagation();
        this._bgColourPicking = true;
        /* Activate custom with the current picker value even if the hue does not change. */
        if (customPicker) UI.setCustomBackground(customPicker.value);
      });
    }

    document.addEventListener('pointerdown', (e) => {
      if (this._bgColourPicking && e.target && e.target.id === 'bgCustomPicker') {
        e.stopPropagation();
      }
    }, true);

    UI.setChartMode(this.chartMode);

    this.$('locationBtn').addEventListener('click', () => this.useLocation());

    this.$('helpToggle').addEventListener('click', () => this.toggleInstructions(true));
    this.$('helpClose').addEventListener('click', () => this.toggleInstructions(false));

    this.$('installDismiss').addEventListener('click', () => {
      this.$('installBanner').classList.add('hidden');
    });

    this.$('clearDataBtn').addEventListener('click', async () => {
      if (!window.confirm('Erase all local data and cached forecasts?')) return;
      const keys = ['units', 'windUnit', 'visUnit', 'pressUnit', 'chartMode', 'rememberPlace', 'lastCity', 'lastCountry', 'lastLat', 'lastLon', 'lastPlaceAt', 'weatherCache', 'ssc.pref_key_night_mode', 'seclusa.settings'];
      keys.forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
      try { if (window.Store && window.Store.clearAll) window.Store.clearAll(); } catch (e) {}
      this._last = null;
      this.lastCity = null;
      this.lastCountry = '';
      this.lastLat = NaN;
      this.lastLon = NaN;
      if (window.caches) {
        try {
          const cacheKeys = await window.caches.keys();
          await Promise.all(
            cacheKeys
              .filter((k) => k.startsWith('seclusaweather-'))
              .map((k) => window.caches.delete(k))
          );
        } catch (e) {
          UI.showError('Could not clear all cached data. Try again.');
          return;
        }
      }
      window.location.reload();
    });

    this.$('installBtn').addEventListener('click', () => {
      if (this.deferredPrompt) {
        this.deferredPrompt.prompt().catch(() => {});
        this.deferredPrompt.userChoice
          .then(() => {
            this.deferredPrompt = null;
            this.$('installBanner').classList.add('hidden');
          })
          .catch((e) => { console.debug('Install prompt failed:', e); });
      }
    });

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.$('installBanner').classList.remove('hidden');
    });

    window.addEventListener('online', () => {
      UI.markOffline(false);
      this.startAutoRefresh();
      this.refreshSilently();
    });
    window.addEventListener('offline', () => UI.markOffline(true));

    this.$('staleNotice').addEventListener('click', () => {
      if (navigator.onLine) this.reloadCurrent({ soft: true });
    });
    this.$('offlineNotice').addEventListener('click', () => {
      if (navigator.onLine) this.reloadCurrent({ soft: true });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideDropdown();
        this.closeUnitsMenu();
        this.closeThemeMenu();
        this.toggleInstructions(false);
      }
    });

    window.addEventListener('resize', Utils.debounce(() => {
      if (!this._last) return;
      UI.renderHourlyChart(this._last.weather.hourly, this._last.units);
      UI._updateHourlyScroll();
      if (this._last.lat != null && this._last.lon != null) {
        UI.renderWindCompass(this._last.lat, this._last.lon, UI._compassWindLabel || '', UI._compassWindDir, UI._compassGustLabel || '', UI._compassTodayWind || '');
      }
    }, 250));

    const cached = Utils.loadWeatherCache();
    if (cached && cached.weather) {
      const lat = Number.isFinite(this.lastLat) ? this.lastLat : (Number.isFinite(cached.lat) ? cached.lat : null);
      const lon = Number.isFinite(this.lastLon) ? this.lastLon : (Number.isFinite(cached.lon) ? cached.lon : null);
      const name = this.lastCity || cached.name || 'Location';
      const country = this.lastCountry || cached.country || '';
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        this.lastLat = lat;
        this.lastLon = lon;
      }
      if (name) this.lastCity = name;
      if (country) this.lastCountry = country;
      /* Keep prefs (°C/mph/mi defaults). Rescale cache — do not adopt stale cache units. */
      let weather = cached.weather;
      const cacheUnits = cached.units || this.units;
      const cacheWind = cached.windUnit || this.windUnit;
      if (cacheUnits !== this.units || cacheWind !== this.windUnit) {
        weather = Utils.convertWeatherUnits(weather, cacheUnits, this.units, cacheWind, this.windUnit);
      }
      UI.setUnitLabel(this.units);
      UI.setWindUnitLabel(this.windUnit);
      UI.setVisLabel(this.visUnit);
      UI.renderWeather(weather, cached.aq || null, this.units, name, country, lat, lon);
      this._last = { weather, aq: cached.aq || null, units: this.units, name, country, lat, lon };
      UI.setUpdatedAt(cached.savedAt);
      UI.markOffline(!navigator.onLine);
    }

    // No silent default location — wait for search, locate, or a restored cache.
    if (navigator.onLine) {
      this.startAutoRefresh();
      if (Number.isFinite(this.lastLat) && Number.isFinite(this.lastLon)) {
        this.refreshSilently();
      }
    }

    if (!this._last) {
      this.dismissSplash();
      UI.showEmptyStart();
    }

    if ('serviceWorker' in navigator) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
      navigator.serviceWorker.register('./sw.js').catch((e) => { console.debug('SW registration failed:', e); });
    }

    this._bindPullToRefresh();
  },

  dismissSplash() {
    const el = this.$('splash');
    if (!el || el.classList.contains('is-leaving')) return;
    el.classList.add('is-leaving');
    setTimeout(() => { el.classList.add('hidden'); }, 520);
  },

  startAutoRefresh() {
    if (this._refreshTimer) return;
    this._refreshTimer = setInterval(() => this.refreshSilently(), 30 * 60 * 1000);
  },

  _bindPullToRefresh() {
    if (!('ontouchstart' in window)) return;
    const PULL_DIST_PROGRESS = 80;
    const PULL_DIST_MAX = 130;
    const TRIGGER = 70;
    const start = { y: null, x: null };
    let pulling = false;
    let dist = 0;

    const resetTracking = () => { start.y = null; start.x = null; pulling = false; dist = 0; };

    document.addEventListener('touchstart', (e) => {
      if (document.body.classList.contains('has-modal')) return;
      if (window.scrollY > 0) return;
      const t = e.touches[0];
      if (!t) return;
      start.y = t.clientY;
      start.x = t.clientX;
      pulling = false;
      dist = 0;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (start.y == null) return;
      const t = e.touches[0];
      if (!t) return;
      if (window.scrollY > 0) { resetTracking(); return; }
      const dy = t.clientY - start.y;
      const dx = t.clientX - start.x;
      if (!pulling) {
        if (dy <= 6) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.2) { resetTracking(); return; }
        pulling = true;
      }
      e.preventDefault();
      dist = Math.min(PULL_DIST_MAX, PULL_DIST_PROGRESS * (1 - Math.exp(-dy / PULL_DIST_PROGRESS)));
      this._updatePullIndicator(dist, TRIGGER);
    }, { passive: false });

    const finish = () => {
      if (start.y == null) return;
      const triggered = pulling && dist >= TRIGGER;
      resetTracking();
      this._resetPullIndicator();
      if (!triggered) return;
      if (navigator.onLine) {
        this.reloadCurrent({ soft: true });
      } else {
        UI.showError('You are offline — check your connection to refresh.');
      }
    };

    document.addEventListener('touchend', finish, { passive: true });
    document.addEventListener('touchcancel', finish, { passive: true });
  },

  _updatePullIndicator(dist, triggerAt) {
    const el = this.$('ptrIndicator');
    if (!el) return;
    Utils.dynCSS.set('ptr', `:root{--ptr-y:${Math.max(0, dist - 44)}px}`);
    const label = el.querySelector('.ptr-indicator__label');
    if (label) label.textContent = dist >= triggerAt ? 'Release to refresh' : 'Pull to refresh';
  },

  _resetPullIndicator() {
    const el = this.$('ptrIndicator');
    if (!el) return;
    Utils.dynCSS.del('ptr');
    const label = el.querySelector('.ptr-indicator__label');
    if (label) label.textContent = 'Pull to refresh';
  },

  async refreshSilently() {
    if (!Number.isFinite(this.lastLat) || !Number.isFinite(this.lastLon)) return;
    if (!navigator.onLine) return;
    if (this._userBusy > 0 || UI._modalOpen) return;
    const snap = this._weatherSeq;
    const lat = this.lastLat;
    const lon = this.lastLon;
    const units = this.units;
    const windUnit = this.windUnit;
    const city = this.lastCity || 'Current Location';
    const country = this.lastCountry || '';
    try {
      const [weather, aq] = await Promise.all([
        API.getWeather(lat, lon, units, windUnit),
        API.getAirQuality(lat, lon).catch(() => null),
      ]);
      if (this._userBusy > 0 || UI._modalOpen || snap !== this._weatherSeq) return;
      if (!weather) return;
      UI.markStale(false);
      UI.markOffline(false);
      UI.renderWeather(weather, aq, units, city, country, lat, lon);
      this._last = { weather, aq, units, name: city, country, lat, lon };
      UI.setUpdatedAt(Date.now());
      Utils.saveWeatherCache({ savedAt: Date.now(), units, windUnit, name: city, country, lat, lon, weather, aq });
      Utils.safeSet('lastPlaceAt', Date.now());
    } catch (e) {
      /* silent background refresh; keep existing data on failure */
    }
  },

  rerenderLocal() {
    if (!this._last || !this._last.weather) return;
    const { weather, aq, name, country, lat, lon } = this._last;
    UI.renderWeather(weather, aq, this.units, name || this.lastCity, country || this.lastCountry || '', lat, lon);
    this._last.units = this.units;
  },

  applyUnitChange(fromUnits, toUnits, fromWind, toWind) {
    if (navigator.onLine && Number.isFinite(this.lastLat) && Number.isFinite(this.lastLon)) {
      this.reloadCurrent({ soft: true });
      return;
    }
    if (!this._last || !this._last.weather) return;
    this._last.weather = Utils.convertWeatherUnits(this._last.weather, fromUnits, toUnits, fromWind, toWind);
    this._last.units = toUnits;
    this.rerenderLocal();
    const cached = Utils.loadWeatherCache() || {};
    Utils.saveWeatherCache({
      ...cached,
      savedAt: cached.savedAt || Date.now(),
      units: toUnits,
      windUnit: toWind,
      name: this._last.name || this.lastCity,
      country: this._last.country || this.lastCountry || '',
      lat: this._last.lat,
      lon: this._last.lon,
      weather: this._last.weather,
      aq: this._last.aq || null,
    });
  },

  async showDropdown(query) {
    const seq = ++this._suggestSeq;
    try {
      const results = await API.searchCities(query);
      if (seq !== this._suggestSeq) return;
      this.dropdownResults = results;
      this.dropdownIndex = -1;
      if (this.dropdownResults.length) {
        this.showDropdownList();
      } else {
        this.hideDropdown();
      }
    } catch {
      if (seq === this._suggestSeq) this.hideDropdown();
    }
  },

  showDropdownList() {
    const dd = this.$('searchDropdown');
    dd.innerHTML = this.dropdownResults.map((r, i) => {
      const region = [r.admin1, r.country].filter(Boolean).join(', ');
      const active = i === this.dropdownIndex;
      return `<div class="search-dropdown__item${active ? ' search-dropdown__item--active' : ''}"
                   role="option" id="suggest-${i}" data-index="${i}"
                   aria-selected="${active}">
        <span class="search-dropdown__item-name">${UI._esc(r.name)}</span>
        <span class="search-dropdown__item-region">${UI._esc(region)}</span>
      </div>`;
    }).join('');

    dd.querySelectorAll('.search-dropdown__item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const idx = parseInt(el.dataset.index);
        this.selectDropdown(idx);
      });
    });

    dd.classList.remove('hidden');
    this.setComboboxState();
  },

  setComboboxState() {
    const input = this.$('searchInput');
    const dd = this.$('searchDropdown');
    const open = !dd.classList.contains('hidden') && this.dropdownResults.length > 0;
    input.setAttribute('aria-expanded', open);
    if (this.dropdownIndex >= 0 && this.dropdownResults[this.dropdownIndex]) {
      input.setAttribute('aria-activedescendant', `suggest-${this.dropdownIndex}`);
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  },

  selectDropdown(idx) {
    const r = this.dropdownResults[idx];
    if (!r) return;
    const displayName = r.name || 'Location';
    this.$('searchInput').value = displayName;
    this.hideDropdown();
    this.loadWeather(r.lat, r.lon, displayName, r.country, displayName).catch((e) => { console.debug('Background load failed:', e); });
  },

  hideDropdown() {
    if (this._blurTimer) { clearTimeout(this._blurTimer); this._blurTimer = null; }
    this.$('searchDropdown').classList.add('hidden');
    this.dropdownResults = [];
    this.dropdownIndex = -1;
    this.setComboboxState();
  },

  handleDropdownKeys(e) {
    const dd = this.$('searchDropdown');
    if (dd.classList.contains('hidden')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.dropdownIndex = Math.min(this.dropdownIndex + 1, this.dropdownResults.length - 1);
      this.updateDropdownHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.dropdownIndex = Math.max(this.dropdownIndex - 1, -1);
      this.updateDropdownHighlight();
    } else if (e.key === 'Enter' && this.dropdownIndex >= 0) {
      e.preventDefault();
      this.selectDropdown(this.dropdownIndex);
    } else if (e.key === 'Escape') {
      this.hideDropdown();
    }
  },

  updateDropdownHighlight() {
    const items = this.$('searchDropdown').querySelectorAll('.search-dropdown__item');
    items.forEach((el, i) => {
      const active = i === this.dropdownIndex;
      el.classList.toggle('search-dropdown__item--active', active);
      el.setAttribute('aria-selected', active);
      if (active) el.scrollIntoView({ block: 'nearest' });
    });
    this.setComboboxState();
  },

  async searchCity(city) {
    const searchId = ++this._searchSeq;
    this._locSeq += 1; /* drop stale locate errors so they cannot wipe this search */
    UI.showLoading();
    try {
      const results = await API.searchCities(city);
      if (searchId !== this._searchSeq) return;
      if (!results.length) throw new Error('City not found. Check the spelling.');
      const geo = results[0];
      await this.loadWeather(geo.lat, geo.lon, geo.name, geo.country, geo.name);
    } catch (err) {
      if (searchId !== this._searchSeq) return;
      if (!navigator.onLine) {
        UI.showError('You are offline — search needs a connection.');
      } else {
        UI.showError(err && err.message ? err.message : 'Something went wrong.');
      }
    }
  },

  reloadCurrent(opts) {
    let lat = this.lastLat;
    let lon = this.lastLon;
    let name = this.lastCity;
    let country = this.lastCountry || '';
    if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && this._last) {
      lat = this._last.lat;
      lon = this._last.lon;
      name = name || this._last.name;
      country = country || this._last.country || '';
    }
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const label = name || 'Current Location';
      this.loadWeather(lat, lon, label, country, label, opts)
        .catch((e) => { console.debug('Background load failed:', e); });
    } else if (name) {
      this.searchCity(name)
        .catch((e) => { console.debug('Background load failed:', e); });
    } else {
      UI.showError('Search for a city or use your location to refresh.');
    }
  },

  async loadWeather(lat, lon, name, country, cityKey, opts) {
    lat = Math.round(lat * 100) / 100;
    lon = Math.round(lon * 100) / 100;
    this._userBusy++;
    this._locSeq += 1; /* locate error must not wipe a newer successful load */
    const seq = ++this._weatherSeq;
    name = String(name || '').slice(0, 80);
    country = String(country || '').slice(0, 8);
    cityKey = String(cityKey || name || '').slice(0, 80);
    const soft = !!(opts && opts.soft);
    const content = this.$('weatherContent');
    const alreadyShowing = content && !content.classList.contains('hidden');
    if (!(soft && alreadyShowing)) UI.showLoading();
    let weather;
    let aq = null;
    try {
      try {
        [weather, aq] = await Promise.all([
          API.getWeather(lat, lon, this.units, this.windUnit),
          API.getAirQuality(lat, lon).catch(() => null),
        ]);
      } catch (err) {
        if (seq !== this._weatherSeq) return;
        const cached = Utils.loadWeatherCache();
        const sameSpot = !!(cached && cached.weather)
          && Math.abs(Number(cached.lat) - lat) < 0.0001
          && Math.abs(Number(cached.lon) - lon) < 0.0001;
        if (sameSpot) {
          weather = cached.weather;
          aq = cached.aq || null;
          name = cached.name || name;
          country = cached.country || country;
          UI.markOffline(!navigator.onLine);
          const ageMs = cached.savedAt ? Date.now() - cached.savedAt : 0;
          const ageHrs = Math.floor(ageMs / (60 * 60 * 1000));
          if (navigator.onLine) UI.markStale(true, 'Could not refresh the forecast. Showing the last saved one.');
          else if (ageHrs >= 6) UI.markStale(true, `Forecast data is ${ageHrs}h old.`);

          try {
            // Keep the user's current unit preference; rescale the cached payload
            // so the toggle is not silently undone while offline.
            let cacheUnits = cached.units || this.units;
            let cacheWind = cached.windUnit || this.windUnit;
            if (cacheUnits !== this.units || cacheWind !== this.windUnit) {
              weather = Utils.convertWeatherUnits(weather, cacheUnits, this.units, cacheWind, this.windUnit);
              cacheUnits = this.units;
              cacheWind = this.windUnit;
            }
            UI.setUnitLabel(cacheUnits);
            UI.setWindUnitLabel(cacheWind);
            UI.renderWeather(weather, aq, cacheUnits, name, country, cached.lat, cached.lon);
            this._last = { weather, aq, units: cacheUnits, name, country, lat: cached.lat, lon: cached.lon };
            UI.setUpdatedAt(cached.savedAt);
            if (Number.isFinite(cached.lat) && Number.isFinite(cached.lon)) {
              this.lastCity = name;
              this.lastCountry = country;
              this.lastLat = cached.lat;
              this.lastLon = cached.lon;
              Utils.safeSet('lastCity', name);
              Utils.safeSet('lastCountry', country);
              Utils.safeSet('lastLat', cached.lat);
              Utils.safeSet('lastLon', cached.lon);
              Utils.safeSet('lastPlaceAt', Date.now());
            }
          } catch (renderErr) {
            UI.showError('Something went wrong.');
          }
          return;
        }
        if (!navigator.onLine) {
          UI.showError('You are offline — this place is not saved on this device.');
        } else {
          UI.showError(err && err.message ? err.message : 'Something went wrong.');
        }
        return;
      }

      if (seq !== this._weatherSeq) return;

      try {
        UI.markStale(false);
        UI.markOffline(false);
        UI.renderWeather(weather, aq, this.units, name, country, lat, lon);
        this._last = { weather, aq, units: this.units, name, country, lat, lon };
        this.lastCity = cityKey;
        this.lastCountry = country;
        this.lastLat = lat;
        this.lastLon = lon;
        UI.setUpdatedAt(Date.now());
        Utils.safeSet('lastCity', cityKey);
        Utils.safeSet('lastCountry', country);
        Utils.safeSet('lastLat', lat);
        Utils.safeSet('lastLon', lon);
        Utils.safeSet('lastPlaceAt', Date.now());
        Utils.saveWeatherCache({ savedAt: Date.now(), units: this.units, windUnit: this.windUnit, name, country, lat, lon, weather, aq });
        this.startAutoRefresh();
      } catch (renderErr) {
        UI.showError('Something went wrong.');
      }
    } finally {
      this._userBusy = Math.max(0, this._userBusy - 1);
    }
  },

  async useLocation() {
    const locId = ++this._locSeq;
    if (!navigator.geolocation) {
      UI.showError('Geolocation is not supported by your browser.');
      return;
    }

    UI.showLoading();
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lon } = pos.coords;
          if (locId !== this._locSeq) return;
          await this.loadWeather(lat, lon, 'Current Location', '', 'Current Location');
        } catch (err) {
          if (locId === this._locSeq) UI.showError(err && err.message ? err.message : 'Something went wrong.');
        }
      },
      (err) => {
        if (locId !== this._locSeq) return;
        const timedOut = err && err.code === 3;
        const denied = err && err.code === 1;
        UI.showError(timedOut
          ? 'Location request timed out. Please search for a city.'
          : denied
            ? 'Location access denied. Please search for a city.'
            : 'Your location is unavailable. Please search for a city.');
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  },

  $(id) {
    return document.getElementById(id);
  },

  toggleInstructions(show) {
    const panel = this.$('instructions');
    const btn = this.$('helpToggle');
    if (!panel) return;
    const open = show != null ? show : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !open);
    if (btn) btn.setAttribute('aria-expanded', String(open));
  },

  _toggleMenu(ddId, btnId) {
    const dd = this.$(ddId);
    const btn = this.$(btnId);
    if (!dd) return;
    const open = dd.classList.contains('hidden');
    dd.classList.toggle('hidden', !open);
    if (btn) btn.setAttribute('aria-expanded', String(open));
  },

  _closeMenu(ddId, btnId) {
    const dd = this.$(ddId);
    const btn = this.$(btnId);
    if (dd) dd.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  },

  toggleThemeMenu() {
    const dd = this.$('themeDropdown');
    const opening = dd && dd.classList.contains('hidden');
    this._toggleMenu('themeDropdown', 'themeMenuBtn');
    if (opening && window.UI) {
      /* Edit the sky period that is live now, so picks match what you see. */
      const sky = document.documentElement.getAttribute('data-sky') === 'night' ? 'night' : 'day';
      UI.setBgEditPeriod(sky);
    }
    if (!opening && window.UI) UI._paintActiveBackground();
  },
  closeThemeMenu() {
    this._closeMenu('themeDropdown', 'themeMenuBtn');
    if (window.UI) UI._paintActiveBackground();
  },
  toggleUnitsMenu() { this._toggleMenu('unitsDropdown', 'unitMenuBtn'); },
  closeUnitsMenu() { this._closeMenu('unitsDropdown', 'unitMenuBtn'); },
};

document.addEventListener('DOMContentLoaded', () => {
  try {
    App.init();
  } catch (e) {
    console.debug('Init failed:', e);
  }
});
