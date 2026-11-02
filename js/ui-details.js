Object.assign(UI, {
  renderDetailBoxes(data, aq, units) {
    this._lastWeather = data;
    this._lastAQ = aq;
    this._lastUnits = units;
    const container = this.$('detailGrid');
    if (!container || !data || !data.current) return;

    const c = data.current;
    const d = data.daily || {};

    const boxes = [];

    const precipNow = Utils.formatPrecip(c.precipitation, units) || (units === 'imperial' ? '0 in' : '0 mm');
    const popToday = (d.time && d.time[0])
      ? (this.dayOutlook(d.time[0], d, data.hourly, units)?.pop ?? null)
      : null;
    const rainToday = d.rain_sum && d.rain_sum[0] != null ? Math.round(d.rain_sum[0] * 10) / 10 : null;
    const snowToday = d.snowfall_sum && d.snowfall_sum[0] != null ? d.snowfall_sum[0] : null;
    const precipSub = [];
    if (popToday != null) precipSub.push(`${popToday}% chance today`);
    const snowLabel = Utils.formatSnow(snowToday, units);
    if (snowLabel) precipSub.push(`${snowLabel} snow`);
    if (rainToday > 0) precipSub.push(`${Utils.formatPrecip(rainToday, units)} rain`);

    const uv = d.uv_index_max && d.uv_index_max[0] != null ? d.uv_index_max[0] : null;
    const uvClear = d.uv_index_clear_sky_max && d.uv_index_clear_sky_max[0] != null ? d.uv_index_clear_sky_max[0] : null;
    const uvInfo = uv != null ? Utils.getUVLevel(uv) : null;

    const humidity = c.relative_humidity_2m != null ? Math.round(c.relative_humidity_2m) : null;
    const pressure = c.surface_pressure != null ? Math.round(c.surface_pressure) : null;
    const pressureMsl = c.pressure_msl != null ? Math.round(c.pressure_msl) : null;
    const dewPoint = c.dew_point_2m != null ? Utils.formatTemp(c.dew_point_2m, units) : '—';

    const conditions = [
      { label: 'Precip', icon: this._metricIcon('precip'), value: precipNow, sub: precipSub.length ? precipSub.join(' · ') : 'Dry today' },
      { label: 'Humidity', icon: this._metricIcon('humidity'), value: humidity != null ? `${humidity}%` : '—', sub: `Dew point ${dewPoint}` },
      { label: 'UV Index', icon: this._metricIcon('uv'), value: uv != null ? `<span class="uv-badge tone-${uvInfo.tone}">${Math.round(uv)}</span>` : '—', sub: uv != null ? `${uvInfo.label}${uvClear != null ? ` · clear sky ${Math.round(uvClear)}` : ''}` : 'Not available' },
      { label: 'Visibility', icon: this._metricIcon('visibility'), value: Utils.formatVisibility(c.visibility, UI.visUnit), sub: 'Current visibility' },
      { label: 'Pressure', icon: this._metricIcon('pressure'), value: pressureMsl != null ? Utils.formatPressure(pressureMsl, UI.pressUnit) : pressure != null ? Utils.formatPressure(pressure, UI.pressUnit) : '—', sub: pressureMsl != null && pressure != null ? `MSL ${Utils.formatPressure(pressureMsl, UI.pressUnit)} · Surface ${Utils.formatPressure(pressure, UI.pressUnit)}` : 'Atmospheric pressure · tap to toggle', id: 'pressureBox' },
    ];

    const cape = c.cape != null ? Math.round(c.cape) : null;
    if (cape != null) {
      let capeInfo;
      if (cape < 300) capeInfo = { label: 'None', tone: 'good', desc: 'Stable air, no thunderstorms' };
      else if (cape < 1000) capeInfo = { label: 'Low', tone: 'good', desc: 'Weak thunderstorm potential' };
      else if (cape < 2000) capeInfo = { label: 'Moderate', tone: 'moderate', desc: 'Thunderstorms possible' };
      else if (cape < 3000) capeInfo = { label: 'High', tone: 'high', desc: 'Strong storms likely' };
      else capeInfo = { label: 'Extreme', tone: 'extreme', desc: 'Severe storms expected' };
      conditions.push({ label: 'Thunderstorm risk', icon: this._metricIcon('bolt'), value: `<span class="tone-${capeInfo.tone}">${capeInfo.label}</span>`, sub: capeInfo.desc });
    }

    const aqC = aq && aq.current;
    let aqiBlock = `
      <div class="conditions-item conditions-item--wide conditions-item--empty">
        <span class="conditions-item__label"><span class="conditions-item__icon">${this._metricIcon('aqi')}</span>Air Quality</span>
        <span class="conditions-item__sub">Not available</span>
      </div>
    `;
    if (aqC) {
      const isEU = aqC.european_aqi != null;
      const rawAqi = isEU ? aqC.european_aqi : aqC.us_aqi;
      const aqi = rawAqi != null ? Math.round(Number(rawAqi)) : null;
      const aqLevel = aqi != null && Number.isFinite(aqi) ? Utils.getAQILevel(aqi, isEU ? 'eu' : 'us') : null;
      const chips = [
        ['PM2.5', aqC.pm2_5], ['PM10', aqC.pm10], ['NO₂', aqC.nitrogen_dioxide],
        ['O₃', aqC.ozone], ['SO₂', aqC.sulphur_dioxide], ['CO', aqC.carbon_monoxide],
      ].filter(([, v]) => v != null).map(([label, v]) =>
        `<span class="detail-box__chip">${label} ${Math.round(v)}</span>`
      ).join('');
      aqiBlock = `
        <div class="conditions-item conditions-item--wide">
          <span class="conditions-item__label"><span class="conditions-item__icon">${this._metricIcon('aqi')}</span>Air Quality · ${isEU ? 'European' : 'US'} AQI</span>
          <span class="conditions-item__value">${aqLevel ? `<span class="uv-badge tone-${aqLevel.tone}">${aqi}</span> <span class="tone-${aqLevel.tone}">${aqLevel.label}</span>` : '<span class="uv-badge">—</span>'}</span>
          <div class="conditions-item__chips">${chips}</div>
        </div>
      `;
    }

    const pollenTypes = aqC ? [
      ['Alder', aqC.alder_pollen], ['Birch', aqC.birch_pollen], ['Grass', aqC.grass_pollen],
      ['Mugwort', aqC.mugwort_pollen], ['Olive', aqC.olive_pollen], ['Ragweed', aqC.ragweed_pollen],
    ] : [];
    const pollenPresent = pollenTypes.filter(([, v]) => v != null);
    let pollenBlock = `
      <div class="conditions-item conditions-item--wide conditions-item--empty">
        <span class="conditions-item__label"><span class="conditions-item__icon">${this._metricIcon('pollen')}</span>Pollen</span>
        <span class="conditions-item__sub">Not available</span>
      </div>
    `;
    if (pollenPresent.length && !pollenPresent.some(([, v]) => v > 0)) {
      pollenBlock = `
      <div class="conditions-item conditions-item--wide">
        <span class="conditions-item__label"><span class="conditions-item__icon">${this._metricIcon('pollen')}</span>Pollen</span>
        <span class="conditions-item__value"><span class="tone-good">Low</span></span>
        <span class="conditions-item__sub">Little to no pollen</span>
      </div>
    `;
    } else if (pollenPresent.length && pollenPresent.some(([, v]) => v > 0)) {
      const top = [...pollenPresent].sort((a, b) => b[1] - a[1]);
      const pLevel = Utils.getPollenLevel(top[0][1]);
      const bars = top.slice(0, 3).map(([label, v]) => {
        const pct = Math.max(2, Math.min(100, Math.round(v)));
        const w = Math.round(pct / 5) * 5;
        return `
          <div class="pollen-row">
            <span class="pollen-row__label">${label}</span>
            <span class="pollen-row__bar"><span class="pollen-row__fill pollen-w-${w} tone-${pLevel.tone}"></span></span>
            <span class="pollen-row__value">${Math.round(v)}</span>
          </div>
        `;
      }).join('');
      pollenBlock = `
        <div class="conditions-item conditions-item--wide">
          <span class="conditions-item__label"><span class="conditions-item__icon">${this._metricIcon('pollen')}</span>Pollen</span>
          <span class="conditions-item__value"><span class="tone-${pLevel.tone}">${pLevel.label}</span></span>
          <span class="conditions-item__sub">${top[0][0]} is highest · grains/m³</span>
          <div class="pollen-bars">${bars}</div>
          <div class="pollen-legend">Low &lt;5 · Moderate 5–30 · High 30–99 · Very High 100+</div>
        </div>
      `;
    }

    const conditionsGrid = conditions.map((s) => `
      <div class="conditions-item${s.id ? ` conditions-item--press` : ''}${s.wide ? ` conditions-item--wide` : ''}"${s.id ? ` id="${s.id}"` : ''}>
        <span class="conditions-item__label">${s.icon ? `<span class="conditions-item__icon">${s.icon}</span>` : ''}${s.label}</span>
        <span class="conditions-item__value">${s.value}</span>
        <span class="conditions-item__sub">${s.sub || ''}${s.id ? `<span class="conditions-item__swap" title="Tap to toggle pressure units">${this._metricIcon('swap')}</span>` : ''}</span>
      </div>
    `).join('');

    boxes.push(`
      <div class="detail-box detail-box--conditions">
        <div class="conditions-grid">
          ${conditionsGrid}
          ${aqiBlock}
          ${pollenBlock}
        </div>
      </div>
    `);

    container.innerHTML = `<div class="detail-grid">${boxes.join('')}</div>`;
    const detailSec = this.$('detailSection');
    if (detailSec) detailSec.classList.remove('hidden');
    container.classList.remove('hidden');
    const windSec = this.$('windSection');
    if (windSec) windSec.classList.remove('hidden');
    const compassSec = this.$('compassSection');
    if (compassSec) compassSec.classList.remove('hidden');

    const pressBox = document.getElementById('pressureBox');
    if (pressBox) {
      pressBox.addEventListener('click', () => {
        UI.pressUnit = UI.pressUnit === 'inHg' ? 'hPa' : 'inHg';
        Utils.safeSet('pressUnit', UI.pressUnit);
        UI.renderDetailBoxes(UI._lastWeather, UI._lastAQ, UI._lastUnits);
        if (UI._lastWeather && UI._lastWeather.hourly) {
          UI.renderHourlyChart(UI._lastWeather.hourly, UI._lastUnits);
        }
      });
    }
  },

  renderWindCompass(lat, lon, windLabel, windDir, gustLabel, todayWind) {
    const container = this.$('compassContainer');
    const section = this.$('compassSection');
    const windSec = this.$('windSection');
    if (!container || !section) return;

    if (windSec) windSec.classList.remove('hidden');
    section.classList.remove('hidden');

    const cityName = UI._compassCityName ? this._esc(UI._compassCityName) : '';
    const country = UI._compassCountry ? this._esc(UI._compassCountry) : '';

    const dirDeg = windDir != null ? Math.round(((windDir % 360) + 360) % 360) : null;
    const fromDir = dirDeg != null ? Utils.getWindDirection(dirDeg) : null;
    const toDeg = dirDeg != null ? (dirDeg + 180) % 360 : null;
    const toDir = toDeg != null ? Utils.getWindDirection(toDeg) : null;

    const ticks = [];
    for (let d = 0; d < 360; d += 15) {
      const r = (d * Math.PI) / 180;
      const major = d % 45 === 0;
      const len = major ? 7 : 3;
      ticks.push(
        `<line x1="${(50 + Math.sin(r) * 42).toFixed(2)}" y1="${(50 - Math.cos(r) * 42).toFixed(2)}"` +
        ` x2="${(50 + Math.sin(r) * (42 - len)).toFixed(2)}" y2="${(50 - Math.cos(r) * (42 - len)).toFixed(2)}"` +
        ` stroke="currentColor" stroke-opacity="${major ? 0.55 : 0.28}" stroke-width="${major ? 2.4 : 1.2}"/>`
      );
    }

    const cardinals = [0, 45, 90, 135, 180, 225, 270, 315].map((d) => {
      const r = (d * Math.PI) / 180;
      const major = d % 90 === 0;
      const label = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][d / 45];
      const x = 50 + Math.sin(r) * 29;
      const y = 50 - Math.cos(r) * 29;
      return `<text x="${x.toFixed(2)}" y="${(y + 3.4).toFixed(2)}" text-anchor="middle"` +
        ` font-size="${major ? 10 : 7}" font-weight="${major ? 800 : 600}" fill="currentColor" opacity="${major ? 0.95 : 0.6}">${label}</text>`;
    }).join('');

    const arrow = dirDeg != null
      ? `<g transform="rotate(${toDeg} 50 50)">
           <line x1="50" y1="52" x2="50" y2="18" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/>
           <polygon points="50,7 58,25 42,25" fill="currentColor"/>
           <polygon points="50,52 57,45 43,45" fill="currentColor" opacity="0.35"/>
        </g>`
      : '';

    const safeWind = this._esc(windLabel || 'Wind —');
    const safeGust = gustLabel ? this._esc(gustLabel) : '';
    const safeToday = todayWind ? {
      maxGust: todayWind.maxGust ? this._esc(todayWind.maxGust) : '',
      maxWind: todayWind.maxWind ? this._esc(todayWind.maxWind) : '',
      minWind: todayWind.minWind ? this._esc(todayWind.minWind) : '',
      prevailing: todayWind.prevailing ? this._esc(todayWind.prevailing) : '',
    } : null;

    container.innerHTML = `
      <div class="weather-compass">
        <div class="weather-compass__wind">
          <span class="weather-compass__now-label">Wind now</span>
          <span class="weather-compass__wind-speed">${safeWind}${safeGust ? `<span class="weather-compass__gust"> &middot; gusts ${safeGust}</span>` : ''}</span>
          ${dirDeg != null ? `<span class="weather-compass__wind-dir">blowing ${this._esc(toDir)} &middot; from ${this._esc(fromDir)}</span>` : ''}
        </div>
        <div class="weather-compass__rose">
          <svg viewBox="0 0 100 100" class="weather-compass__svg" role="img"
               aria-label="${dirDeg != null ? this._esc(`Wind from ${fromDir}, blowing toward ${toDir}`) : 'Wind direction not available'}">
            <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-opacity="0.18" stroke-width="1.5"/>
            <circle cx="50" cy="50" r="37" fill="none" stroke="currentColor" stroke-opacity="0.1" stroke-width="1" stroke-dasharray="2 3"/>
            ${ticks}
            ${cardinals}
            ${arrow}
            <circle cx="50" cy="50" r="3.4" fill="currentColor" opacity="0.6"/>
          </svg>
        </div>
        ${safeToday ? `
        <div class="weather-compass__today" aria-label="Today's wind detail">
          <span class="weather-compass__today-title">Today's wind</span>
          ${safeToday.maxGust ? `<span class="weather-compass__today-row"><b>Gustiest</b> ${safeToday.maxGust}</span>` : ''}
          ${safeToday.maxWind ? `<span class="weather-compass__today-row"><b>Strongest</b> ${safeToday.maxWind}</span>` : ''}
          ${safeToday.minWind ? `<span class="weather-compass__today-row"><b>Calmest</b> ${safeToday.minWind}</span>` : ''}
          ${safeToday.prevailing ? `<span class="weather-compass__today-row"><b>Prevailing</b> from ${safeToday.prevailing}</span>` : ''}
        </div>` : ''}
        <div class="weather-compass__location">
          <div class="weather-compass__city">${cityName}${country ? `<span class="weather-compass__country">${country}</span>` : ''}</div>
          <div class="weather-compass__coords">${Number(lat).toFixed(2)}&deg;, ${Number(lon).toFixed(2)}&deg;</div>
        </div>
      </div>
    `;
  },

  hideCompass() {
    const section = this.$('compassSection');
    const windSec = this.$('windSection');
    if (section) section.classList.add('hidden');
    if (windSec) windSec.classList.add('hidden');
  },

  // Max precipitation probability across daytime hours (is_day === 1) for a date.
  daytimeMaxPop(dateStr, hourly) {
    if (!hourly || !hourly.time || !hourly.precipitation_probability || !hourly.is_day) return null;
    const prefix = dateStr + 'T';
    let max = null;
    for (let k = 0; k < hourly.time.length; k++) {
      if (!String(hourly.time[k] || '').startsWith(prefix)) continue;
      if (hourly.is_day[k] !== 1) continue;
      const p = hourly.precipitation_probability[k];
      if (p != null && (max == null || p > max)) max = p;
    }
    return max;
  },

  // Rain chance that should actually be advertised for a day. A nonzero max
  // hourly probability alone is too noisy on clear days (open-meteo can report
  // e.g. 60% while rain_sum stays 0.0), so it only surfaces when the forecast
  // actually includes precipitation. Mirrors the icon logic in
  // WeatherIcons.dailyIcon.
  meaningfulDayPop(dateStr, daily, hourly) {
    if (!daily || !daily.time) return null;
    const idx = daily.time.indexOf(String(dateStr));
    const dailyMax = idx >= 0 && daily.precipitation_probability_max
      ? daily.precipitation_probability_max[idx]
      : null;
    const pop = this.daytimeMaxPop(dateStr, hourly) ?? dailyMax;
    if (pop == null || pop <= 0) return null;
    const pick = (key) => idx >= 0 && daily[key] && daily[key][idx] != null ? daily[key][idx] : 0;
    if (pick('rain_sum') > 0 || pick('snowfall_sum') > 0 || pick('precipitation_sum') > 0) return pop;
    return null;
  },

  // Rain chance for the "Now" slot: the current hour's probability is only
  // surfaced when precipitation is actually happening or expected this hour —
  // the model often reports a large chance for the current hour while the sky
  // stays clear and dry, which must never read as "X% rain now".
  _meaningfulNowPop(cur, hourly, startIdx) {
    if (!cur) return null;
    const prob = hourly && hourly.precipitation_probability
      ? hourly.precipitation_probability[startIdx]
      : null;
    if (prob == null || prob <= 0) return null;
    const hourPrecip = hourly && hourly.precipitation && hourly.precipitation[startIdx] != null ? hourly.precipitation[startIdx] : 0;
    const hourSnow = hourly && hourly.snowfall && hourly.snowfall[startIdx] != null ? hourly.snowfall[startIdx] : 0;
    const curPrecip = cur.precipitation != null ? cur.precipitation : 0;
    const curSnow = cur.snowfall != null ? cur.snowfall : 0;
    if (curPrecip > 0 || curSnow > 0 || hourPrecip > 0 || hourSnow > 0) return prob;
    return null;
  },

  // Same gate for any hourly slot: probability alone is too noisy when the
  // hour's precip/snow amounts are zero.
  _meaningfulHourPop(hourly, idx) {
    if (!hourly || idx == null || idx < 0) return null;
    const prob = hourly.precipitation_probability ? hourly.precipitation_probability[idx] : null;
    if (prob == null || prob <= 0) return null;
    const precip = hourly.precipitation && hourly.precipitation[idx] != null ? hourly.precipitation[idx] : 0;
    const snow = hourly.snowfall && hourly.snowfall[idx] != null ? hourly.snowfall[idx] : 0;
    if (precip > 0 || snow > 0) return prob;
    return null;
  },

  // Unified day outlook (icon + rain %) — summary, forecast rows, and forecast
  // modal all read from this so Open-Meteo daily/hourly never disagree.
  dayOutlook(dateStr, daily, hourly, units) {
    if (!daily || !daily.time || dateStr == null) return null;
    const idx = daily.time.indexOf(String(dateStr));
    if (idx < 0) return null;
    const pop = this.meaningfulDayPop(dateStr, daily, hourly);
    const rainSum = daily.rain_sum && daily.rain_sum[idx] != null ? daily.rain_sum[idx] : 0;
    const snowSum = daily.snowfall_sum && daily.snowfall_sum[idx] != null ? daily.snowfall_sum[idx] : 0;
    const raw = WeatherIcons.dominantDayCode(dateStr, hourly, pop ?? 0, rainSum, snowSum, units)
      ?? daily.weather_code[idx];
    let iconCode = WeatherIcons.dailyIcon(raw, pop ?? 0, rainSum, snowSum, units);

    // Today while it's wet now: don't paint a dry day icon beside a wet summary.
    if (String(dateStr) === this._todayDateKey() && this._current) {
      const c = this._current;
      const nowIdx = this._hourlyStartIdx(hourly);
      const nowPop = this._meaningfulNowPop(c, hourly, nowIdx);
      const nowIcon = WeatherIcons.hourIcon(
        c.weather_code, nowPop, c.precipitation ?? 0, c.snowfall ?? 0
      );
      const wet = (g) => g === 'drizzle' || g === 'rain' || g === 'snow' || g === 'thunder';
      if (wet(WeatherIcons._group(nowIcon)) && !wet(WeatherIcons._group(iconCode))) {
        iconCode = nowIcon;
      }
    }

    return { idx, pop, rainSum, snowSum, iconCode };
  },

  // Min/max across the 24 hours of a date for a given hourly key (e.g. dew point).
  dayMinMax(dateStr, hourly, key) {
    if (!hourly || !hourly.time || !hourly[key]) return null;
    const prefix = dateStr + 'T';
    let min = null;
    let max = null;
    for (let k = 0; k < hourly.time.length; k++) {
      if (!String(hourly.time[k] || '').startsWith(prefix)) continue;
      const v = hourly[key][k];
      if (v == null || !Number.isFinite(Number(v))) continue;
      if (min == null || v < min) min = v;
      if (max == null || v > max) max = v;
    }
    return min == null ? null : { min, max };
  },
});
