Object.assign(UI, {
  _bindHourlyModal() {
    const scroll = this.$('hourlyScroll');
    const modal = this.$('hourlyModal');
    if (!scroll || !modal) return;

    scroll.addEventListener('click', (e) => {
      const card = e.target.closest('.hourly-strip__hour');
      if (card && !this._modalOpen) this.openHourlyDetail(parseInt(card.dataset.i, 10) || 0);
    });
    scroll.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.hourly-strip__hour');
      if (!card || this._modalOpen) return;
      e.preventDefault();
      this.openHourlyDetail(parseInt(card.dataset.i, 10) || 0);
    });

    const fScroll = this.$('forecastCards');
    if (fScroll) {
      fScroll.addEventListener('click', (e) => {
        const row = e.target.closest('.forecast-card__row');
        if (row && !this._modalOpen) this.openForecastDetail(parseInt(row.dataset.i, 10) || 0);
      });
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.classList.contains('hourly-modal__backdrop')) {
        this.closeHourlyDetail();
        return;
      }
      if (e.target.closest('.hourly-modal__close')) { this.closeHourlyDetail(); return; }
      if (e.target.closest('.hourly-modal__nav--prev')) { this._navModal(-1); return; }
      if (e.target.closest('.hourly-modal__nav--next')) { this._navModal(1); return; }
    });

    let startX = null, startY = null, dx = 0, dy = 0, peakX = 0, peakY = 0, down = false, axis = null;

    const trackEl = () => modal.querySelector('.hourly-modal__track');
    const setTrackX = (px, withTransition) => {
      const track = trackEl();
      if (!track) return;
      const tr = withTransition
        ? 'transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)'
        : 'none';
      Utils.dynCSS.set('modal-drag', `#hourlyModal{--modal-drag-x:${px}px;--modal-drag-tr:${tr}}`);
    };
    const settleTrack = (dir) => {
      const track = trackEl();
      if (!track) return;
      const can = dir < 0 ? this._modalIndex > 0 : this._modalIndex < this._modalCount - 1;
      if (!can || !dir) {
        setTrackX(0, true);
        return;
      }
      const target = dir > 0 ? -track.parentElement.clientWidth : track.parentElement.clientWidth;
      setTrackX(target, true);
      const id = this._modalAnimId = (this._modalAnimId || 0) + 1;
      let finished = false;
      const finish = (e) => {
        if (finished || id !== this._modalAnimId || !this._modalOpen) return;
        if (e && e.target && e.target !== track) return;
        finished = true;
        track.removeEventListener('transitionend', finish);
        this._modalIndex += dir;
        this._modalSlideDir = 0;
        this._renderHourlyModal();
      };
      track.addEventListener('transitionend', finish);
      setTimeout(() => finish({ target: track }), 450);
    };

    modal.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (!e.target.closest('.hourly-modal__body')) return;
      if (e.target.closest('button')) return;
      down = true; startX = e.clientX; startY = e.clientY; dx = 0; dy = 0; peakX = 0; peakY = 0; axis = null;
      setTrackX(0, false);
    });
    modal.addEventListener('pointermove', (e) => {
      if (!down || e.pointerType === 'touch') return;
      dx = e.clientX - startX; dy = e.clientY - startY;
      if (Math.abs(dx) > Math.abs(peakX)) peakX = dx;
      if (Math.abs(dy) > Math.abs(peakY)) peakY = dy;
      if (axis === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'x' : 'y';
      }
      if (axis === 'x') {
        e.preventDefault();
        const atStart = this._modalIndex <= 0 && dx > 0;
        const atEnd = this._modalIndex >= this._modalCount - 1 && dx < 0;
        const resist = (atStart || atEnd) ? 0.28 : 1;
        setTrackX(dx * resist, false);
      }
    });
    modal.addEventListener('pointerup', (e) => {
      if (!down || e.pointerType === 'touch') return;
      down = false;
      if (axis === 'x' && Math.abs(peakX) > 48) settleTrack(peakX < 0 ? 1 : -1);
      else if (axis === 'x') setTrackX(0, true);
      axis = null;
    });
    modal.addEventListener('pointercancel', () => { down = false; axis = null; setTrackX(0, true); });

    modal.addEventListener('touchstart', (e) => {
      if (!e.target.closest('.hourly-modal__body')) return;
      if (e.target.closest('button')) return;
      const t = e.touches[0];
      if (!t) return;
      down = true; startX = t.clientX; startY = t.clientY; dx = 0; dy = 0; peakX = 0; peakY = 0; axis = null;
      setTrackX(0, false);
    }, { passive: true });
    modal.addEventListener('touchmove', (e) => {
      if (!down) return;
      const t = e.touches[0];
      if (!t) return;
      dx = t.clientX - startX; dy = t.clientY - startY;
      if (Math.abs(dx) > Math.abs(peakX)) peakX = dx;
      if (Math.abs(dy) > Math.abs(peakY)) peakY = dy;
      if (axis === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'x' : 'y';
      }
      if (axis === 'x') {
        e.preventDefault();
        const atStart = this._modalIndex <= 0 && dx > 0;
        const atEnd = this._modalIndex >= this._modalCount - 1 && dx < 0;
        const resist = (atStart || atEnd) ? 0.28 : 1;
        setTrackX(dx * resist, false);
      }
    }, { passive: false });
    modal.addEventListener('touchend', () => {
      if (!down) return;
      down = false;
      if (axis === 'x' && Math.abs(peakX) > 48) settleTrack(peakX < 0 ? 1 : -1);
      else if (axis === 'x') setTrackX(0, true);
      axis = null;
    });
    modal.addEventListener('touchcancel', () => { down = false; axis = null; setTrackX(0, true); });

    this._addModalKeyHandler();
    this._hourlyModalBound = true;
  },

  _addModalKeyHandler() {
    if (this._modalKeyHandler) return;
    this._modalKeyHandler = (e) => {
      if (!this._modalOpen) return;
      if (e.key === 'Escape') this.closeHourlyDetail();
      else if (e.key === 'ArrowLeft') this._navModal(-1);
      else if (e.key === 'ArrowRight') this._navModal(1);
    };
    document.addEventListener('keydown', this._modalKeyHandler);
  },

  openHourlyDetail(i) {
    if (!this._hourly || !this._hourly.time || !this._hourlyCount) return;
    this._modalMode = 'hourly';
    this._modalPaneH = null;
    this._modalPaneHLocked = false;
    this._modalCount = this._hourlyCount;
    this._modalIndex = Math.max(0, Math.min(this._hourlyCount - 1, i));
    this._modalReturnFocus = document.activeElement;
    this._modalOpen = true;
    this._modalSlideDir = 0;
    this._addModalKeyHandler();
    this._renderHourlyModal();
  },

  openForecastDetail(i) {
    if (!this._forecastDaily || !this._forecastDaily.time) return;
    const total = Math.min(14, this._forecastDaily.time.length);
    if (!total) return;
    this._forecastCount = total;
    this._modalMode = 'forecast';
    this._modalPaneH = null;
    this._modalPaneHLocked = false;
    this._modalCount = total;
    this._modalIndex = Math.max(0, Math.min(total - 1, i));
    this._modalReturnFocus = document.activeElement;
    this._modalOpen = true;
    this._modalSlideDir = 0;
    this._addModalKeyHandler();
    this._renderHourlyModal();
  },

  _navModal(dir) {
    if (this._modalIndex == null || this._modalCount == null) return;
    const n = this._modalIndex + dir;
    if (n < 0 || n >= this._modalCount) return;
    const modal = this.$('hourlyModal');
    const track = modal && modal.querySelector('.hourly-modal__track');
    const viewport = track && track.parentElement;
    if (!track || !viewport) {
      this._modalIndex = n;
      this._modalSlideDir = dir;
      this._renderHourlyModal();
      return;
    }
    const target = dir > 0 ? -viewport.clientWidth : viewport.clientWidth;
    Utils.dynCSS.set('modal-drag', `#hourlyModal{--modal-drag-x:${target}px;--modal-drag-tr:transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)}`);
    const id = this._modalAnimId = (this._modalAnimId || 0) + 1;
    let finished = false;
    const finish = (e) => {
      if (finished || id !== this._modalAnimId || !this._modalOpen) return;
      if (e && e.target && e.target !== track) return;
      finished = true;
      track.removeEventListener('transitionend', finish);
      this._modalIndex = n;
      this._modalSlideDir = 0;
      this._renderHourlyModal();
    };
    track.addEventListener('transitionend', finish);
    setTimeout(() => finish({ target: track }), 450);
  },

  closeHourlyDetail() {
    const modal = this.$('hourlyModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.innerHTML = '';
    }
    this._modalOpen = false;
    this._modalAnimId = (this._modalAnimId || 0) + 1;
    this._modalPaneH = null;
    this._modalPaneHLocked = false;
    document.body.classList.remove('has-modal');
    if (this._modalKeyHandler) {
      document.removeEventListener('keydown', this._modalKeyHandler);
      this._modalKeyHandler = null;
    }
    if (this._modalResizeHandler) {
      window.removeEventListener('resize', this._modalResizeHandler);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', this._modalResizeHandler);
      }
      this._modalResizeHandler = null;
    }
    const back = this._modalReturnFocus;
    this._modalReturnFocus = null;
    if (back && typeof back.focus === 'function' && document.contains(back)) {
      try { back.focus(); } catch (e) { /* element may be gone */ }
    }
  },

  _ensureModalShell(prevLabel, nextLabel) {
    const modal = this.$('hourlyModal');
    if (!modal) return null;
    let card = modal.querySelector('.hourly-modal__card');
    if (!card) {
      modal.innerHTML = `
        <div class="hourly-modal__backdrop"></div>
        <div class="hourly-modal__card">
          <button type="button" class="hourly-modal__nav hourly-modal__nav--prev" aria-label="${prevLabel}">&lsaquo;</button>
          <div class="hourly-modal__body">
            <div class="hourly-modal__viewport">
              <div class="hourly-modal__track"></div>
            </div>
            <div class="hourly-modal__hint" id="hourlyModalHint" aria-live="polite"></div>
          </div>
          <button type="button" class="hourly-modal__close" aria-label="Close">&times;</button>
          <button type="button" class="hourly-modal__nav hourly-modal__nav--next" aria-label="${nextLabel}">&rsaquo;</button>
        </div>
      `;
      modal.classList.remove('hidden');
      document.body.classList.add('has-modal');
      if (!this._modalResizeHandler) {
        this._modalResizeHandler = Utils.debounce(() => {
          if (!this._modalOpen) return;
          this._modalPaneH = null;
          this._modalPaneHLocked = false;
          this._syncModalPaneHeight();
        }, 150);
        window.addEventListener('resize', this._modalResizeHandler);
        if (window.visualViewport) {
          window.visualViewport.addEventListener('resize', this._modalResizeHandler);
        }
      }
    } else {
      const prev = modal.querySelector('.hourly-modal__nav--prev');
      const next = modal.querySelector('.hourly-modal__nav--next');
      if (prev) prev.setAttribute('aria-label', prevLabel);
      if (next) next.setAttribute('aria-label', nextLabel);
    }
    modal.classList.toggle('hourly-modal--forecast', this._modalMode === 'forecast');
    modal.classList.toggle('hourly-modal--hourly', this._modalMode !== 'forecast');
    this._updateModalHint();
    return modal.querySelector('.hourly-modal__track');
  },

  _updateModalHint() {
    const hint = this.$('hourlyModalHint');
    if (!hint) return;
    if (this._modalMode === 'forecast') {
      const n = (this._modalIndex ?? 0) + 1;
      const total = this._modalCount || 0;
      hint.textContent = `Day ${n} of ${total} · swipe for more days`;
    } else {
      hint.textContent = 'Swipe for more hours';
    }
  },

  // Fixed layout (5-line summary + fixed list rows). Grow until settle, then lock for the session.
  _syncModalPaneHeight({ settle = false } = {}) {
    const modal = this.$('hourlyModal');
    const viewport = modal && modal.querySelector('.hourly-modal__viewport');
    const track = modal && modal.querySelector('.hourly-modal__track');
    if (!modal || !viewport || !track) return;
    const panes = [...track.querySelectorAll('.hourly-modal__pane')];
    const center = panes[1] || panes.find((p) => !p.classList.contains('hourly-modal__pane--empty'));
    if (!center) return;

    modal.classList.remove('hourly-modal--sized', 'hourly-modal--dense');
    Utils.dynCSS.del('modal-h');
    void center.offsetHeight;

    const vv = window.visualViewport;
    const avail = Math.floor((vv && vv.height) || window.innerHeight);
    const hintEl = modal.querySelector('.hourly-modal__hint');
    const hintH = hintEl ? Math.ceil(hintEl.getBoundingClientRect().height) : 0;
    const cap = Math.max(240, avail - 32 - hintH);

    let h = center.offsetHeight;
    if (!h) return;
    if (h > cap) {
      modal.classList.add('hourly-modal--dense');
      void center.offsetHeight;
      h = center.offsetHeight || h;
    }
    h = Math.min(Math.ceil(h), cap);

    // Grow through early remasures; lock after settle so mid-swipe never resizes.
    if (this._modalPaneH == null) this._modalPaneH = h;
    else if (!this._modalPaneHLocked) this._modalPaneH = Math.max(this._modalPaneH, h);
    if (settle) this._modalPaneHLocked = true;
    h = this._modalPaneH;

    Utils.dynCSS.set('modal-h', `#hourlyModal{--modal-pane-h:${h}px}`);
    modal.classList.add('hourly-modal--sized');
  },

  _statRow(label, value, { html = false } = {}) {
    const safeLabel = this._esc(label);
    const raw = value == null || value === '' ? '—' : value;
    // Opt-in HTML only (colored feels-like spans we build ourselves).
    const safeValue = html ? String(raw) : this._esc(String(raw));
    return `<div class="hourly-modal__row"><span class="hourly-modal__row-label">${safeLabel}</span><span class="hourly-modal__row-value">${safeValue}</span></div>`;
  },

  // Day blurb: sky + temps + rain chance (sun times stay in the list). Max ~5 lines in CSS.
  _dayStory({ weekday, desc, high, low, pop, rainLabel }) {
    const dayName = weekday === 'Today' ? 'Today' : weekday;
    const sky = (desc || 'mixed conditions').toLowerCase();
    const looksOk = /^(clear sky|mainly clear|partly cloudy|overcast)$/.test(sky);
    let open;
    if (high !== '—' && low !== '—') {
      open = looksOk
        ? `${dayName} looks ${sky}, warming to ${high} and cooling to ${low}.`
        : `${dayName} brings ${sky}, warming to ${high} and cooling to ${low}.`;
    } else if (high !== '—') {
      open = looksOk
        ? `${dayName} looks ${sky}, near ${high}.`
        : `${dayName} brings ${sky}, near ${high}.`;
    } else {
      open = looksOk ? `${dayName} looks ${sky}.` : `${dayName} brings ${sky}.`;
    }
    if (rainLabel && pop > 0) open += ` Expect about a ${Math.round(pop)}% chance of rain (~${rainLabel}).`;
    else if (rainLabel) open += ` Expect around ${rainLabel} of rain.`;
    else if (pop > 0) open += ` Rain chance about ${Math.round(pop)}%.`;
    return open;
  },

  _hourlyPaneHTML(modalIndex) {
    const h = this._hourly;
    if (!h || !h.time) return '';
    const idx = this._hourlyStart + modalIndex;
    const time = h.time[idx];
    if (time == null) return '';
    const units = this._modalUnits || 'metric';
    const nowIdx = this._hourlyNowIdx != null ? this._hourlyNowIdx : this._hourlyStartIdx(h);
    const isNow = idx === nowIdx;
    const nowVals = isNow ? this._nowFromCurrent(this._current, h, units) : null;
    const temp = nowVals && nowVals.temp != null ? nowVals.temp : (h.temperature_2m && h.temperature_2m[idx] != null ? Utils.formatTemp(h.temperature_2m[idx], units) : '—');
    const tempRaw = nowVals && nowVals.tempRaw != null ? nowVals.tempRaw : (h.temperature_2m && h.temperature_2m[idx]);
    const tempTone = tempRaw != null ? Utils.getTempTone(tempRaw, units) : null;
    const dewPoint = nowVals && nowVals.dew != null ? nowVals.dew : (h.dew_point_2m && h.dew_point_2m[idx] != null ? Utils.formatTemp(h.dew_point_2m[idx], units) : null);
    const feels = nowVals && nowVals.feels != null ? nowVals.feels : (h.apparent_temperature && h.apparent_temperature[idx] != null ? Utils.formatTemp(h.apparent_temperature[idx], units) : null);
    const feelsRaw = nowVals && nowVals.feelsRaw != null ? nowVals.feelsRaw : (h.apparent_temperature && h.apparent_temperature[idx]);
    const feelsVal = feels != null ? (feelsRaw != null ? `<span class="temp-tone-${Utils.getTempTone(feelsRaw, units)}">${this._esc(feels)}</span>` : feels) : null;
    const pop = isNow && nowVals ? nowVals.pop : this._meaningfulHourPop(h, idx);
    const precip = nowVals && nowVals.precip != null ? nowVals.precip : (h.precipitation ? h.precipitation[idx] : 0);
    const wind = nowVals && nowVals.wind != null ? nowVals.wind : (h.wind_speed_10m && h.wind_speed_10m[idx] != null ? Math.round(h.wind_speed_10m[idx]) : null);
    const windDir = nowVals && nowVals.windDir != null ? nowVals.windDir : (h.wind_direction_10m && h.wind_direction_10m[idx] != null ? Math.round(h.wind_direction_10m[idx]) : null);
    const humidity = nowVals && nowVals.humidity != null ? nowVals.humidity : (h.relative_humidity_2m && h.relative_humidity_2m[idx] != null ? `${Math.round(h.relative_humidity_2m[idx])}%` : null);
    const gust = (nowVals && nowVals.gust != null)
      ? nowVals.gust
      : (h.wind_gusts_10m && h.wind_gusts_10m[idx] != null ? Math.round(h.wind_gusts_10m[idx]) : null);
    const pressure = nowVals && nowVals.pressure != null ? nowVals.pressure : (h.pressure_msl && h.pressure_msl[idx] != null ? Utils.formatPressure(h.pressure_msl[idx], UI.pressUnit) : null);
    const cloud = nowVals && nowVals.cloud != null ? nowVals.cloud : (h.cloud_cover && h.cloud_cover[idx] != null ? `${Math.round(h.cloud_cover[idx])}%` : null);
    const visibility = nowVals && nowVals.visibility != null ? nowVals.visibility : (h.visibility && h.visibility[idx] != null ? Utils.formatVisibility(h.visibility[idx], UI.visUnit) : null);
    const windUnit = Utils.getWindUnit(UI.windUnit);
    const windVal = Utils.formatWind(wind, windDir, UI.windUnit);
    const clock = Utils.formatTime(time, this._tz);
    let endClock = clock;
    try {
      const end = new Date(Utils.parseLocal(time, this._tz).getTime() + 60 * 60 * 1000);
      endClock = Utils.formatTime(end, this._tz);
    } catch { /* keep start clock */ }
    const tLabel = isNow
      ? `Now · ${Utils.formatTime(new Date(), this._tz)}`
      : `${clock} – ${endClock}`;
    let dLabel = '';
    const dateKey = String(time).slice(0, 10);
    try {
      const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: this._tz, year: 'numeric', month: '2-digit', day: '2-digit' });
      const today = dtf.format(new Date());
      const [y, m, d] = today.split('-').map(Number);
      const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
      if (dateKey === today) dLabel = 'Today';
      else if (dateKey === tomorrow) dLabel = 'Tomorrow';
      else dLabel = Utils.parseLocal(time, this._tz).toLocaleDateString('en-US', { timeZone: this._tz || undefined, weekday: 'short', month: 'short', day: 'numeric' });
    } catch {
      dLabel = Utils.parseLocal(time, this._tz).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
    const row = (label, value, opts) => this._statRow(label, value, opts);
    const rainLabel = Utils.formatPrecip(precip, units) || (units === 'imperial' ? '0 in' : '0 mm');
    const feelsHtml = feels != null && feelsRaw != null;
    return `
      <div class="hourly-modal__pane">
        <div class="hourly-modal__head">${this._esc(dLabel)} · ${this._esc(tLabel)}</div>
        <div class="hourly-modal__temp${tempTone ? ` temp-tone-${tempTone}` : ''}">${this._esc(temp)}</div>
        <div class="hourly-modal__list">
          ${row('Feels like', feelsVal, { html: feelsHtml })}
          ${row('Chance', pop != null ? `${Math.round(pop)}%` : null)}
          ${row('Rainfall', rainLabel)}
          ${row('Humidity', humidity)}
          ${row('Wind', windVal)}
          ${row('Gusts', gust != null ? `${gust} ${windUnit}` : null)}
          ${row('Dew point', dewPoint)}
          ${row('Pressure', pressure)}
          ${row('Cloud cover', cloud)}
          ${row('Visibility', visibility)}
        </div>
      </div>`;
  },

  _forecastPaneHTML(modalIndex) {
    const d = this._forecastDaily;
    if (!d || !d.time) return '';
    const date = d.time[modalIndex];
    if (date == null) return '';
    const units = this._forecastUnits || 'metric';
    const high = d.temperature_2m_max && d.temperature_2m_max[modalIndex] != null ? Utils.formatTemp(d.temperature_2m_max[modalIndex], units) : '—';
    const low = d.temperature_2m_min && d.temperature_2m_min[modalIndex] != null ? Utils.formatTemp(d.temperature_2m_min[modalIndex], units) : '—';
    const feelsHigh = d.apparent_temperature_max && d.apparent_temperature_max[modalIndex] != null ? Utils.formatTemp(d.apparent_temperature_max[modalIndex], units) : null;
    const feelsLow = d.apparent_temperature_min && d.apparent_temperature_min[modalIndex] != null ? Utils.formatTemp(d.apparent_temperature_min[modalIndex], units) : null;
    const outlook = this.dayOutlook(date, d, this._forecastHourly, units);
    const pop = outlook && outlook.pop != null ? outlook.pop : 0;
    const rainSum = outlook ? outlook.rainSum : (d.rain_sum ? d.rain_sum[modalIndex] : null);
    const snowSum = outlook ? outlook.snowSum : (d.snowfall_sum ? d.snowfall_sum[modalIndex] : null);
    const sunshine = d.sunshine_duration && d.sunshine_duration[modalIndex] != null ? Utils.formatDuration(d.sunshine_duration[modalIndex]) : null;
    const daylight = d.daylight_duration && d.daylight_duration[modalIndex] != null ? Utils.formatDuration(d.daylight_duration[modalIndex]) : null;
    const sunrise = d.sunrise && d.sunrise[modalIndex] ? Utils.formatTime(d.sunrise[modalIndex], this._tz) : null;
    const sunset = d.sunset && d.sunset[modalIndex] ? Utils.formatTime(d.sunset[modalIndex], this._tz) : null;
    const tempMaxRaw = d.temperature_2m_max && d.temperature_2m_max[modalIndex];
    const tempTone = tempMaxRaw != null ? Utils.getTempTone(tempMaxRaw, units) : null;
    const iconCode = outlook
      ? outlook.iconCode
      : WeatherIcons.dailyIcon(
        WeatherIcons.dominantDayCode(date, this._forecastHourly, pop, rainSum ?? 0, snowSum ?? 0, units) ?? d.weather_code[modalIndex],
        pop, rainSum ?? 0, snowSum ?? 0, units
      );
    const desc = Utils.getWeatherDescription(iconCode);
    const feelsHighRaw = d.apparent_temperature_max && d.apparent_temperature_max[modalIndex];
    const feelsVal = feelsHigh != null && feelsLow != null
      ? (feelsHighRaw != null
          ? `<span class="temp-tone-${Utils.getTempTone(feelsHighRaw, units)}">${this._esc(feelsHigh)} / ${this._esc(feelsLow)}</span>`
          : `${feelsHigh} / ${feelsLow}`)
      : null;
    const parsed = Utils.parseLocal(date + 'T00:00:00', this._tz);
    const weekdayLong = modalIndex === 0 ? 'Today' : parsed.toLocaleDateString('en-US', { timeZone: this._tz || undefined, weekday: 'long' });
    const weekdayShort = modalIndex === 0 ? 'Today' : parsed.toLocaleDateString('en-US', { timeZone: this._tz || undefined, weekday: 'short' });
    const dateHeading = parsed.toLocaleDateString('en-US', { timeZone: this._tz || undefined, month: 'short', day: 'numeric' });
    const rainZero = units === 'imperial' ? '0 in' : '0 mm';
    const rainLabel = Utils.formatPrecip(rainSum, units) || rainZero;
    const storyRain = Utils.formatPrecip(rainSum, units);
    const summary = this._dayStory({
      weekday: weekdayLong, desc, high, low, pop, rainLabel: storyRain,
    });
    const row = (label, value, opts) => this._statRow(label, value, opts);
    const feelsHtml = feelsHigh != null && feelsLow != null && feelsHighRaw != null;
    return `
      <div class="hourly-modal__pane">
        <div class="hourly-modal__head">${this._esc(weekdayShort)} · ${this._esc(dateHeading)}</div>
        <div class="hourly-modal__temp${tempTone ? ` temp-tone-${tempTone}` : ''}">${this._esc(high)}<span class="hourly-modal__temp-low"> / ${this._esc(low)}</span></div>
        <div class="hourly-modal__summary">${summary ? this._esc(summary) : ''}</div>
        <div class="hourly-modal__list">
          ${row('Feels like', feelsVal, { html: feelsHtml })}
          ${row('Chance', pop > 0 ? `${Math.round(pop)}%` : null)}
          ${row('Rainfall', rainLabel)}
          ${row('Sunrise', sunrise)}
          ${row('Sunset', sunset)}
          ${row('Sunshine', sunshine)}
          ${row('Daylight', daylight)}
        </div>
      </div>`;
  },

  _paintModalTrack(paneFn) {
    const isForecast = this._modalMode === 'forecast';
    const track = this._ensureModalShell(
      isForecast ? 'Previous day' : 'Previous hour',
      isForecast ? 'Next day' : 'Next hour'
    );
    if (!track) return;
    const i = this._modalIndex;
    const prev = i > 0 ? paneFn.call(this, i - 1) : '<div class="hourly-modal__pane hourly-modal__pane--empty" aria-hidden="true"></div>';
    const cur = paneFn.call(this, i) || '<div class="hourly-modal__pane"><div class="hourly-modal__desc">No data</div></div>';
    const next = i < this._modalCount - 1 ? paneFn.call(this, i + 1) : '<div class="hourly-modal__pane hourly-modal__pane--empty" aria-hidden="true"></div>';
    Utils.dynCSS.set('modal-drag', '#hourlyModal{--modal-drag-x:0px;--modal-drag-tr:none}');
    track.innerHTML = `
      <div class="hourly-modal__slide">${prev}</div>
      <div class="hourly-modal__slide">${cur}</div>
      <div class="hourly-modal__slide">${next}</div>
    `;
    // Force layout so translate uses real widths
    void track.offsetWidth;
    Utils.dynCSS.set('modal-drag', '#hourlyModal{--modal-drag-x:0px;--modal-drag-tr:none}');
    this._updateModalHint();
    const sync = (settle = false) => { if (this._modalOpen) this._syncModalPaneHeight({ settle }); };
    sync(false);
    // After open animation + fonts, remasure and lock (early paint can undersize).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => sync(true));
    });
    const card = this.$('hourlyModal') && this.$('hourlyModal').querySelector('.hourly-modal__card');
    if (card) {
      card.addEventListener('animationend', () => sync(true), { once: true });
    }
    const focus = this.$('hourlyModal') && this.$('hourlyModal').querySelector('.hourly-modal__close');
    if (focus) focus.focus();
  },

  _renderHourlyModal() {
    if (this._modalMode === 'forecast') { this._renderForecastModal(); return; }
    const modal = this.$('hourlyModal');
    if (!modal || !this._hourly) return;
    const idx = this._hourlyStart + this._modalIndex;
    if (!this._hourly.time || this._hourly.time[idx] == null) { this.closeHourlyDetail(); return; }
    this._paintModalTrack(this._hourlyPaneHTML);
  },

  _renderForecastModal() {
    const modal = this.$('hourlyModal');
    if (!modal || !this._forecastDaily) return;
    const date = this._forecastDaily.time && this._forecastDaily.time[this._modalIndex];
    if (date == null) { this.closeHourlyDetail(); return; }
    this._paintModalTrack(this._forecastPaneHTML);
  },
});
