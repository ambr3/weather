Object.assign(UI, {
  renderForecast(daily, units, hourly) {
    if (!daily || !daily.time || !daily.time.length) return;
    if (this._modalOpen) this.closeHourlyDetail();
    const count = Math.min(14, daily.time.length);
    const pageSize = 7;
    this._forecastDaily = daily;
    this._forecastCount = count;
    this._forecastUnits = units;
    this._forecastHourly = hourly;

    const rowMarkup = (date, i) => {
      const max = daily.temperature_2m_max && daily.temperature_2m_max[i] != null ? Math.round(daily.temperature_2m_max[i]) : '—';
      const min = daily.temperature_2m_min && daily.temperature_2m_min[i] != null ? Math.round(daily.temperature_2m_min[i]) : '—';
      const outlook = this.dayOutlook(date, daily, hourly, units);
      const pop = outlook && outlook.pop != null ? outlook.pop : 0;
      const iconCode = outlook ? outlook.iconCode : (daily.weather_code ? daily.weather_code[i] : 0);
      const icon = WeatherIcons.get(iconCode, true);

      const d = Utils.parseLocal(date + 'T00:00:00', this._tz);
      const weekday = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { timeZone: this._tz || undefined, weekday: 'short' });
      const dateLabel = d.toLocaleDateString('en-US', { timeZone: this._tz || undefined, month: 'short', day: 'numeric' });
      const label = Utils.getWeatherDescription(iconCode);
      const chance = pop > 0 ? `<span class="forecast-card__row-chance">${pop}% rain</span>` : '';

      return `
        <div class="forecast-card__row${i === 0 ? ' forecast-card__row--today' : ''}" role="listitem" data-i="${i}">
          <div class="forecast-card__day">
            <span class="forecast-card__weekday">${weekday}</span>
            <span class="forecast-card__date">${dateLabel}</span>
          </div>
          <div class="forecast-card__row-icon">${icon}</div>
          <div class="forecast-card__row-info">
            <span class="forecast-card__row-label">${this._esc(label)}</span>
            ${chance}
          </div>
          <div class="forecast-card__row-temps">
            <span class="forecast-card__high">${max === '—' ? '' : max}${max === '—' ? '' : '°'}</span>
            <span class="forecast-card__low">${min === '—' ? '' : min}${min === '—' ? '' : '°'}</span>
          </div>
        </div>
      `;
    };

    const pages = [];
    for (let start = 0; start < count; start += pageSize) {
      const rows = daily.time.slice(start, Math.min(start + pageSize, count))
        .map((date, j) => rowMarkup(date, start + j)).join('');
      pages.push(`<div class="forecast-card__page" role="group">${rows}</div>`);
    }
    const dots = pages.map((_, p) => `
      <button type="button" class="forecast-card__pagerdot${p === 0 ? ' is-active' : ''}" data-page="${p}"
              aria-label="Days ${p * pageSize + 1} to ${Math.min((p + 1) * pageSize, count)}"></button>`).join('');

    this.$('forecastCards').innerHTML = `
      <div class="forecast-card forecast-card--pager">
        <div class="forecast-card__pages" role="list">${pages.join('')}</div>
        <div class="forecast-card__pager forecast-card__pager--stack" role="tablist" aria-label="Forecast days">
          <div class="forecast-card__pagerdots">${dots}</div>
          <span class="forecast-card__pagerlabel">
            <svg class="forecast-card__pagericon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/><path d="M15 6l6 6-6 6"/></svg>
            <span class="forecast-card__pagerlead">Swipe</span>
            <span class="forecast-card__pagerrange">days 1–7</span>
          </span>
          <span class="forecast-card__pagertap">Tap any day for more info</span>
        </div>
      </div>
    `;

    const pagerEl = this.$('forecastCards').querySelector('.forecast-card__pager');
    const pagesEl = this.$('forecastCards').querySelector('.forecast-card__pages');
    if (pagesEl) {
      requestAnimationFrame(() => {
        const pageNodes = pagesEl.querySelectorAll('.forecast-card__page');
        let maxH = 0;
        Utils.dynCSS.del('forecast-h');
        pageNodes.forEach((p) => { maxH = Math.max(maxH, p.offsetHeight); });
        if (maxH > 0) Utils.dynCSS.set('forecast-h', `:root{--forecast-page-h:${maxH}px}`);
      });
    }
    if (pages.length > 1 && pagerEl && pagesEl) {
      const dotsEl = pagerEl.querySelectorAll('.forecast-card__pagerdot');
      const labelEl = pagerEl.querySelector('.forecast-card__pagerlabel');
      const rangeEl = pagerEl.querySelector('.forecast-card__pagerrange');
      const syncDots = () => {
        const page = Math.round(pagesEl.scrollLeft / pagesEl.clientWidth) || 0;
        dotsEl.forEach((dot, p) => dot.classList.toggle('is-active', p === page));
        const other = page === 0 ? 1 : 0;
        const first = other * pageSize + 1;
        const last = Math.min((other + 1) * pageSize, count);
        if (labelEl) labelEl.classList.toggle('is-back', page === 1);
        if (rangeEl) rangeEl.textContent = `days ${first}–${last}`;
      };
      pagesEl.addEventListener('scroll', syncDots, { passive: true });
      pagerEl.addEventListener('click', (e) => {
        const dot = e.target.closest('.forecast-card__pagerdot');
        if (!dot) return;
        const page = parseInt(dot.dataset.page, 10) || 0;
        pagesEl.scrollTo({ left: page * pagesEl.clientWidth, behavior: 'smooth' });
      });
      syncDots();
    }
  },

  renderHourly(hourly, units) {
    if (!hourly || !hourly.time || !hourly.time.length) return;
    if (this._modalOpen) this.closeHourlyDetail();
    const nowIdx = this._hourlyStartIdx(hourly);
    this._modalUnits = units;

    let todayKey = null;
    let tomorrowKey = null;
    const advanceDay = (dateStr) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    };
    try {
      const dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone: this._tz, year: 'numeric', month: '2-digit', day: '2-digit',
      });
      todayKey = dtf.format(new Date());
      tomorrowKey = advanceDay(todayKey);
    } catch {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      tomorrowKey = advanceDay(todayKey);
    }

    // Now → forward only (no past hours).
    const listStart = nowIdx;
    this._hourly = hourly;
    this._hourlyStart = listStart;
    this._hourlyCount = Math.max(0, hourly.time.length - listStart);
    this._hourlyNowIdx = nowIdx;

    const dayLabelFor = (dateKey) => {
      if (dateKey === todayKey) return 'Today';
      if (dateKey === tomorrowKey) return 'Tomorrow';
      return Utils.parseLocal(dateKey + 'T00:00:00', this._tz)
        .toLocaleDateString('en-US', { timeZone: this._tz || undefined, weekday: 'short' });
    };

    const dayGroups = [];
    let cur = null;
    for (let idx = listStart; idx < hourly.time.length; idx++) {
      const dateKey = String(hourly.time[idx]).slice(0, 10);
      if (!cur || cur.key !== dateKey) {
        cur = { key: dateKey, indices: [] };
        dayGroups.push(cur);
      }
      cur.indices.push(idx);
    }

    const hourFor = (idx) => {
      const time = hourly.time[idx];
      const isNow = idx === nowIdx;
      const nowVals = isNow ? this._nowFromCurrent(this._current, hourly, units) : null;
      let tempRaw = hourly.temperature_2m && hourly.temperature_2m[idx] != null
        ? hourly.temperature_2m[idx]
        : null;
      let temp = tempRaw != null ? `${Math.round(tempRaw)}°` : '—';
      const timeLabel = isNow ? 'Now' : Utils.formatHourShort(time, this._tz);
      let pop = isNow ? null : this._meaningfulHourPop(hourly, idx);
      let precipNow = hourly.precipitation && hourly.precipitation[idx] != null ? hourly.precipitation[idx] : 0;
      let snowNow = hourly.snowfall && hourly.snowfall[idx] != null ? hourly.snowfall[idx] : 0;
      if (nowVals) {
        pop = nowVals.pop;
        if (nowVals.tempRaw != null) {
          tempRaw = nowVals.tempRaw;
          temp = `${Math.round(tempRaw)}°`;
        } else if (nowVals.temp != null) {
          temp = String(nowVals.temp).replace(/\s/g, '');
        }
        if (nowVals.precip != null) precipNow = nowVals.precip;
        if (nowVals.snow != null) snowNow = nowVals.snow;
      }
      const iconCode = WeatherIcons.hourIcon(
        nowVals && nowVals.code != null ? nowVals.code : hourly.weather_code[idx],
        pop, precipNow, snowNow
      );
      const icon = WeatherIcons.get(
        iconCode,
        nowVals && nowVals.isDay != null ? nowVals.isDay
          : (hourly.is_day && hourly.is_day[idx] != null ? hourly.is_day[idx] : 1)
      );
      const rain = pop != null && pop > 0 ? `${Math.round(pop)}%` : '';
      const modalI = idx - listStart;
      return `
        <div class="hourly-strip__hour${isNow ? ' hourly-strip__hour--now' : ''}"
             role="listitem" data-i="${modalI}" tabindex="0"
             aria-label="${this._esc(`${timeLabel}, ${temp}${rain ? `, ${rain} rain` : ''}`)}">
          <span class="hourly-strip__time">${this._esc(timeLabel)}</span>
          <span class="hourly-strip__icon">${icon}</span>
          <span class="hourly-strip__temp">${this._esc(temp)}</span>
          ${rain ? `<span class="hourly-strip__rain">${this._esc(rain)}</span>` : '<span class="hourly-strip__rain hourly-strip__rain--empty" aria-hidden="true"></span>'}
        </div>
      `;
    };

    const parts = [];
    dayGroups.forEach((g, dayIdx) => {
      if (dayIdx > 0) {
        parts.push(`
          <button type="button" class="hourly-strip__day" data-day="${dayIdx}"
                  aria-label="${this._esc(`Jump to ${dayLabelFor(g.key)}`)}">
            <span class="hourly-strip__day-label">${this._esc(dayLabelFor(g.key))}</span>
          </button>`);
      }
      g.indices.forEach((idx) => parts.push(hourFor(idx)));
    });

    const multiDay = dayGroups.length > 1;
    const tabs = multiDay
      ? dayGroups.map((g, i) => `
          <button type="button" class="hourly-strip__tab${i === 0 ? ' is-active' : ''}"
                  role="tab" data-day="${i}" aria-selected="${i === 0}"
                  aria-label="${this._esc(dayLabelFor(g.key))}">${this._esc(dayLabelFor(g.key))}</button>`).join('')
      : '';

    Utils.dynCSS.del('hourly-h');
    this.$('hourlyScroll').innerHTML = `
      <div class="hourly-card forecast-card">
        <div class="hourly-strip" role="list" aria-label="Hourly forecast from now">
          ${parts.join('')}
        </div>
        ${multiDay ? `
        <div class="hourly-strip__pager forecast-card__pager forecast-card__pager--stack" role="tablist" aria-label="Hourly days">
          <span class="forecast-card__pagerlabel hourly-strip__hint-hours">
            <svg class="forecast-card__pagericon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/><path d="M15 6l6 6-6 6"/></svg>
            <span class="forecast-card__pagerlead">Swipe</span>
            <span class="forecast-card__pagerrange">hours</span>
          </span>
          <div class="hourly-strip__tabs">${tabs}</div>
          <span class="forecast-card__pagerlabel hourly-strip__hint-days">
            <svg class="forecast-card__pagericon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/><path d="M15 6l6 6-6 6"/></svg>
            <span class="forecast-card__pagerlead">Swipe</span>
            <span class="forecast-card__pagerrange">days</span>
          </span>
          <span class="forecast-card__pagertap">Tap any hour for more info</span>
        </div>` : ''}
      </div>
    `;

    const stripEl = this.$('hourlyScroll').querySelector('.hourly-strip');
    const pagerEl = this.$('hourlyScroll').querySelector('.hourly-strip__pager');
    if (stripEl && multiDay && pagerEl) {
      this._bindHourlyDayNav(stripEl, pagerEl, dayGroups);
    }

    if (!this._hourlyModalBound) this._bindHourlyModal();
  },

  _bindHourlyDayNav(stripEl, pagerEl, dayGroups) {
    const tabs = pagerEl.querySelectorAll('.hourly-strip__tab');

    const hourAnchor = (dayIdx) => {
      const g = dayGroups[dayIdx];
      if (!g || !g.indices.length) return null;
      const modalI = g.indices[0] - this._hourlyStart;
      return stripEl.querySelector(`.hourly-strip__hour[data-i="${modalI}"]`);
    };

    const scrollToDay = (dayIdx) => {
      const el = hourAnchor(dayIdx);
      if (!el) return;
      const left = el.offsetLeft - 8;
      stripEl.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    };

    const activeDayFromScroll = () => {
      const x = stripEl.scrollLeft + 12;
      let active = 0;
      for (let i = 0; i < dayGroups.length; i++) {
        const el = hourAnchor(i);
        if (!el) continue;
        if (el.offsetLeft <= x) active = i;
        else break;
      }
      return active;
    };

    const syncTabs = () => {
      const page = activeDayFromScroll();
      tabs.forEach((tab, i) => {
        const on = i === page;
        tab.classList.toggle('is-active', on);
        tab.setAttribute('aria-selected', String(on));
      });
    };

    stripEl.addEventListener('scroll', syncTabs, { passive: true });
    pagerEl.addEventListener('click', (e) => {
      const tab = e.target.closest('.hourly-strip__tab');
      if (!tab) return;
      scrollToDay(parseInt(tab.dataset.day, 10) || 0);
    });
    stripEl.addEventListener('click', (e) => {
      const dayBtn = e.target.closest('.hourly-strip__day');
      if (!dayBtn) return;
      e.preventDefault();
      scrollToDay(parseInt(dayBtn.dataset.day, 10) || 0);
    });
    syncTabs();
  },

  _updateHourlyScroll() {
    // Strip scrolls horizontally; no equal-height page sync.
    Utils.dynCSS.del('hourly-h');
  },
});
