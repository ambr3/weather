Object.assign(UI, {
  renderCurrentWeather(data, units) {
    if (!data || !data.current) return;
    const c = data.current;
    const d = data.daily || {};
    const nowStartIdx = this._hourlyStartIdx(data.hourly);
    const nowObs = this._nowFromCurrent(c, data.hourly, units);
    const nowPop = nowObs ? nowObs.pop : this._meaningfulNowPop(c, data.hourly, nowStartIdx);
    const iconCode = WeatherIcons.hourIcon(
      nowObs ? nowObs.code : c.weather_code,
      nowPop,
      nowObs ? nowObs.precip : 0,
      nowObs ? nowObs.snow : 0,
      nowObs ? nowObs.cloudCover : c.cloud_cover
    );
    const temp = Utils.formatTemp(c.temperature_2m, units);
    const feels = Utils.formatTemp(c.apparent_temperature, units);
    const desc = Utils.getWeatherDescription(iconCode);

    const sunrise = d.sunrise && d.sunrise[0] ? Utils.formatTimeCompact(d.sunrise[0], this._tz) : '—';
    const sunset = d.sunset && d.sunset[0] ? Utils.formatTimeCompact(d.sunset[0], this._tz) : '—';
    const moonrise = d.moonrise && d.moonrise[0] ? Utils.formatTimeCompact(d.moonrise[0], this._tz) : '—';
    const moonset = d.moonset && d.moonset[0] ? Utils.formatTimeCompact(d.moonset[0], this._tz) : '—';
    const phase = d.moon_phase && d.moon_phase[0] != null ? d.moon_phase[0] : null;
    const phaseName = phase != null ? Utils.getMoonPhaseName(phase) : '';
    const phaseIllum = phase != null ? `${Utils.getMoonIllumination(phase)}% lit` : '';

    const todayPair = Utils.dayNightTemps(d, data.hourly, 0, this._tz);
    const dayHigh = todayPair.high != null ? Utils.formatTemp(todayPair.high, units) : null;
    const dayLow = todayPair.low != null ? Utils.formatTemp(todayPair.low, units) : null;
    const todayKey = (d.time && d.time[0]) ? d.time[0] : this._todayDateKey();
    const outlook = this.dayOutlook(todayKey, d, data.hourly, units);
    const rain = Utils.rainTiming(todayKey, data.hourly, Date.now(), this._tz, nowObs ? {
      code: nowObs.code,
      precip: nowObs.precip,
      snow: nowObs.snow,
      cloud: nowObs ? nowObs.cloudCover : c.cloud_cover,
    } : null);
    const outlookText = outlook ? this._dayStory({
      weekday: 'Today',
      desc: Utils.getWeatherDescription(outlook.iconCode),
      high: dayHigh || '—',
      low: dayLow || '—',
      pop: rain.pop,
      rainLabel: Utils.formatPrecip(rain.precip, units),
      kind: WeatherIcons.kindFromHours(rain.hours),
      when: rain.when,
    }) : '';

    const SUN_R = 42;
    const MOON_R = 36;
    const sunOrb = this._orbitFor(d.sunrise && d.sunrise[0], d.sunset && d.sunset[0], this._tz, SUN_R);
    let moonRiseIso = d.moonrise && d.moonrise[0] ? d.moonrise[0] : null;
    let moonSetIso = d.moonset && d.moonset[0] ? d.moonset[0] : null;
    let nextMoonRiseIso = d.moonrise && d.moonrise[1] ? d.moonrise[1] : null;
    let moonOrb = this._orbitFor(moonRiseIso, moonSetIso, this._tz, MOON_R, nextMoonRiseIso);
    // Open-Meteo sometimes omits both of today's limbs; fall back to tomorrow's rise.
    if (!moonOrb && nextMoonRiseIso) {
      moonRiseIso = nextMoonRiseIso;
      moonSetIso = null;
      nextMoonRiseIso = null;
      moonOrb = this._orbitFor(moonRiseIso, moonSetIso, this._tz, MOON_R, nextMoonRiseIso);
    }
    // Night mode follows the sun horizon, not the stale API is_day snapshot.
    const sunUp = sunOrb ? !sunOrb.below : null;
    const isDay = sunUp == null ? (c.is_day === 0 ? 0 : 1) : (sunUp ? 1 : 0);
    const iconLive = WeatherIcons.get(iconCode, isDay);
    this._arc = {
      tz: this._tz,
      sunrise: d.sunrise && d.sunrise[0],
      sunset: d.sunset && d.sunset[0],
      moonrise: moonRiseIso,
      moonset: moonSetIso,
      nextMoonrise: nextMoonRiseIso,
      sunR: SUN_R,
      moonR: MOON_R,
      weatherCode: iconCode,
      isDay,
    };

    this.$('currentWeather').innerHTML = `
      <div class="current-weather__top">
        <div class="current-weather__heading">
          <div class="current-weather__updated" id="currentUpdated">Updated ${Utils.formatClock(new Date(Number.isFinite(this._dataUpdatedAt) ? this._dataUpdatedAt : Date.now()))}</div>
          <div class="current-weather__location">
            ${this._esc(data._cityName)}<span class="current-weather__country">${this._esc(data._country)}</span>
          </div>
          <div class="current-weather__desc">${this._esc(desc)}</div>
        </div>
        <div class="current-weather__icon${isDay === 0 ? ' is-night' : ''}">${iconLive}</div>
      </div>
      <div class="current-weather__temp-row">
        <div class="current-weather__temp">${this._esc(temp)}</div>
        ${(dayHigh || dayLow) ? `<div class="current-weather__range" aria-label="Today's high and low">
          ${dayHigh ? `<span class="current-weather__high">${this._esc(dayHigh)}</span>` : ''}
          ${dayLow ? `<span class="current-weather__low">${this._esc(dayLow)}</span>` : ''}
        </div>` : ''}
      </div>
      ${outlookText ? `<p class="current-weather__outlook">${this._esc(outlookText)}</p>` : ''}
      <div class="current-weather__meta">
        <div class="current-weather__feels">Feels like ${this._esc(feels)}</div>
      </div>
    `;

    const daylight = d.daylight_duration && d.daylight_duration[0] != null
      ? Utils.formatDuration(d.daylight_duration[0]) : null;
    const sunshine = d.sunshine_duration && d.sunshine_duration[0] != null
      ? Utils.formatDuration(d.sunshine_duration[0]) : null;
    const uvRaw = d.uv_index_max && d.uv_index_max[0] != null ? d.uv_index_max[0] : null;
    const uvInfo = uvRaw != null ? Utils.getUVLevel(uvRaw) : null;
    const uvLabel = uvRaw != null ? `${Math.round(uvRaw)}${uvInfo ? ` · ${uvInfo.label}` : ''}` : null;
    const solarSum = d.shortwave_radiation_sum && d.shortwave_radiation_sum[0] != null
      ? `${Math.round(d.shortwave_radiation_sum[0] * 10) / 10} MJ/m²` : null;
    const sunStatus = sunOrb ? (sunOrb.below ? 'Below horizon' : 'Above horizon') : null;
    const moonStatus = moonOrb ? (moonOrb.below ? 'Below horizon' : 'Above horizon') : null;
    const phaseLine = [phaseName, phaseIllum].filter(Boolean).join(' · ');
    const sunSpan = (sunrise !== '—' && sunset !== '—')
      ? `${sunrise} → ${sunset}`
      : (sunrise !== '—' ? sunrise : (sunset !== '—' ? sunset : null));
    const moonSpan = (moonrise !== '—' && moonset !== '—')
      ? `${moonrise} → ${moonset}`
      : (moonrise !== '—' ? moonrise : (moonset !== '—' ? moonset : null));

    const row = (label, value, tone = '') => (
      value
        ? `<div class="earth-arc__row${tone ? ` earth-arc__row--${tone}` : ''}"><dt>${this._esc(label)}</dt><dd>${this._esc(value)}</dd></div>`
        : ''
    );
    const panel = (title, rowsHtml, tone = '') => {
      if (!rowsHtml) return '';
      return `
        <section class="earth-arc__panel${tone ? ` earth-arc__panel--${tone}` : ''}">
          <h3 class="earth-arc__group-title">${this._esc(title)}</h3>
          <dl class="earth-arc__list">${rowsHtml}</dl>
        </section>`;
    };

    const sunPanel = panel('Sun', [
      row('Rise–set', sunSpan),
      row('Now', sunStatus),
      row('Daylight', daylight),
      row('Sunshine', sunshine),
      row('UV high', uvLabel),
      row('Solar', solarSum),
    ].join(''), 'sun');
    const moonPanel = panel('Moon', [
      row('Phase', phaseLine, 'phase'),
      row('Rise–set', moonSpan),
      row('Now', moonStatus),
    ].join(''), 'moon');

    const clockChanges = Utils.getClockChanges(this._tz);
    let clocksBar = '';
    if (clockChanges) {
      if (clockChanges.observes) {
        clocksBar = `
          <section class="earth-arc__clocks" aria-label="Clock changes for this location">
            <h3 class="earth-arc__group-title">Clocks</h3>
            <dl class="earth-arc__list">
              ${row('Summer', clockChanges.summer)}
              ${row('Winter', clockChanges.winter)}
            </dl>
          </section>`;
      } else {
        clocksBar = `
          <section class="earth-arc__clocks" aria-label="Clock changes for this location">
            <h3 class="earth-arc__group-title">Clocks</h3>
            <p class="earth-arc__clocks-note">No daylight-saving clock changes here.</p>
          </section>`;
      }
    }

    const arcHost = this.$('earthArc');
    const arcSec = this.$('earthArcSection');
    if (arcHost) {
      if (arcSec) arcSec.classList.remove('hidden');
      arcHost.innerHTML = `
      <div class="current-weather__arc" aria-hidden="true">
        <svg class="current-weather__arc-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="earthDayGlow" cx="50%" cy="28%" r="75%">
              <stop offset="0%" stop-color="#d4efff"/>
              <stop offset="28%" stop-color="#5bb4ef"/>
              <stop offset="65%" stop-color="#1a6fbf"/>
              <stop offset="100%" stop-color="#0a3a6e"/>
            </radialGradient>
            <radialGradient id="earthNightGlow" cx="50%" cy="72%" r="75%">
              <stop offset="0%" stop-color="#1a2744"/>
              <stop offset="55%" stop-color="#0a101c"/>
              <stop offset="100%" stop-color="#02050c"/>
            </radialGradient>
            <clipPath id="earthClip">
              <circle cx="50" cy="50" r="26"/>
            </clipPath>
          </defs>
          <circle class="current-weather__orbit current-weather__orbit--sun" cx="50" cy="50" r="${SUN_R}" fill="none"/>
          <circle class="current-weather__orbit current-weather__orbit--moon" cx="50" cy="50" r="${MOON_R}" fill="none"/>
          <g class="current-weather__earth" id="earthDisc">
            <circle cx="50" cy="50" r="28.4" class="current-weather__earth-glow" fill="rgba(110,190,255,0.18)"/>
            <circle cx="50" cy="50" r="27.2" class="current-weather__earth-atm"/>
            <circle cx="50" cy="50" r="26.6" class="current-weather__earth-rim"/>
            <!-- Day half on top by default; rotate 180° at night so dark (+stars) is on top. -->
            <g id="earthHemispheres" clip-path="url(#earthClip)">
              <circle cx="50" cy="50" r="26" fill="url(#earthNightGlow)"/>
              <g id="earthStars" class="current-weather__earth-stars">
                <circle cx="30" cy="62" r="0.42" fill="#fff" opacity="0.75"/>
                <circle cx="38" cy="70" r="0.32" fill="#fff" opacity="0.55"/>
                <circle cx="46" cy="58" r="0.28" fill="#fff" opacity="0.45"/>
                <circle cx="54" cy="74" r="0.38" fill="#fff" opacity="0.7"/>
                <circle cx="62" cy="64" r="0.3" fill="#fff" opacity="0.5"/>
                <circle cx="70" cy="72" r="0.35" fill="#fff" opacity="0.65"/>
                <circle cx="34" cy="78" r="0.25" fill="#fff" opacity="0.4"/>
                <circle cx="58" cy="82" r="0.28" fill="#fff" opacity="0.48"/>
                <circle cx="42" cy="86" r="0.22" fill="#fff" opacity="0.35"/>
                <circle cx="66" cy="56" r="0.26" fill="#fff" opacity="0.42"/>
              </g>
              <g id="earthLitHalf">
                <path d="M24,50 A26,26 0 0 1 76,50 Z" fill="url(#earthDayGlow)"/>
                <path d="M24,50 A26,26 0 0 1 76,50 Z" fill="rgba(255,255,255,0.10)"/>
              </g>
            </g>
            <circle cx="50" cy="50" r="26" class="current-weather__earth-edge" fill="none"/>
            <!-- Compass on the disc; positions swap with night flip (text stays upright). -->
            <text class="current-weather__compass" id="earthMarkN" x="50" y="72.2" text-anchor="middle" dominant-baseline="middle">N</text>
            <text class="current-weather__compass" id="earthMarkS" x="50" y="30.2" text-anchor="middle" dominant-baseline="middle">S</text>
            <text class="current-weather__compass" id="earthMarkE" x="29.2" y="51.2" text-anchor="middle" dominant-baseline="middle">E</text>
            <text class="current-weather__compass" id="earthMarkW" x="70.8" y="51.2" text-anchor="middle" dominant-baseline="middle">W</text>
          </g>
          <text class="current-weather__orbit-mark current-weather__orbit-mark--soft" id="orbitMarkNoon" x="50" y="9" text-anchor="middle"></text>
          <text class="current-weather__orbit-mark current-weather__orbit-mark--soft" id="orbitMarkNight" x="50" y="98" text-anchor="middle"></text>
        </svg>
        <div class="current-weather__arc-orb current-weather__arc-sun${sunOrb && sunOrb.below ? ' is-below' : ''}${sunOrb ? '' : ' is-hidden'}">${WeatherIcons._sun()}</div>
        <div class="current-weather__arc-orb current-weather__arc-moon${moonOrb && moonOrb.below ? ' is-below' : ''}${moonOrb ? '' : ' is-hidden'}">${WeatherIcons._moon()}</div>
      </div>
      ${(sunPanel || moonPanel || clocksBar) ? `
      <div class="earth-arc__facts">
        <div class="earth-arc__panels">
          ${sunPanel}${moonPanel}
        </div>
        ${clocksBar}
      </div>` : ''}`;
    }

    this._syncEarthOrientation(isDay === 0);
    this._setOrbPositions(sunOrb, moonOrb);
    this.startLiveClock();
  },
});
