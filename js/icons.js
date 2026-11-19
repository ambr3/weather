const WeatherIcons = {
  _cache: {},

  get(code, isDay = true) {
    const n = isDay ? 'day' : 'night';
    const key = `${n}_${this._group(code)}`;
    if (key in this._cache) return this._cache[key];
    const icons = {
      day_clear: this._sun,
      night_clear: this._moon,
      day_clearsome: this._sunFewCloud,
      night_clearsome: this._moonFewCloud,
      day_clouds: this._cloudSun,
      night_clouds: this._cloudMoon,
      day_overcast: this._cloudOvercast,
      night_overcast: this._cloudOvercast,
      day_fog: this._fogDay,
      night_fog: this._fogNight,
      day_drizzle: this._drizzleDay,
      night_drizzle: this._drizzleNight,
      day_rain: this._rainDay,
      night_rain: this._rainNight,
      day_snow: this._snowDay,
      night_snow: this._snowNight,
      day_thunder: this._thunderDay,
      night_thunder: this._thunderNight,
    };
    this._cache[key] = (icons[key] || icons.day_clear)();
    return this._cache[key];
  },

  _group(code) {
    const n = Number(code);
    if (!Number.isFinite(n)) return 'clear';
    if (n === 0) return 'clear';
    if (n === 1) return 'clearsome';
    if (n === 2) return 'clouds';
    if (n === 3) return 'overcast';
    if (n >= 45 && n <= 48) return 'fog';
    if (n >= 51 && n <= 57) return 'drizzle';
    if ((n >= 61 && n <= 67) || (n >= 80 && n <= 82)) return 'rain';
    if ((n >= 71 && n <= 77) || (n >= 85 && n <= 86)) return 'snow';
    if (n >= 95) return 'thunder';
    return 'clear';
  },

  // Wet icon and wet words only when the chance is at least this and some
  // precipitation is forecast. Below that, keep the sky Open-Meteo sent.
  WET_POP: 50,

  _isWet(code) {
    const g = this._group(code);
    return g === 'drizzle' || g === 'rain' || g === 'snow' || g === 'thunder';
  },

  // Word on a chance line. Drizzle counts as rain.
  precipWord(code) {
    const g = this._group(code);
    if (g === 'snow') return 'snow';
    if (g === 'thunder') return 'thunder';
    return 'rain';
  },

  // Word for the Now sentence: precip type on the highest-chance wet hour
  // in the set that set the time phrase. No wet code in that set → rain.
  kindFromHours(hours) {
    let best = null;
    let bestPop = -1;
    const list = Array.isArray(hours) ? hours : [];
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      if (!h || !this._isWet(h.code)) continue;
      const pop = Number(h.pop);
      if (!Number.isFinite(pop) || pop <= bestPop) continue;
      bestPop = pop;
      best = this.precipWord(h.code);
    }
    return best || 'rain';
  },

  _nowKey(nowMs, tz) {
    if (nowMs == null || !Number.isFinite(Number(nowMs))) return '';
    if (typeof Utils === 'undefined' || !Utils.hourKey) return '';
    return Utils.hourKey(Number(nowMs), tz);
  },

  _inWindow(stamp, dateStr, nowKey) {
    if (typeof Utils !== 'undefined' && Utils.hourInWindow) {
      return Utils.hourInWindow(stamp, dateStr, nowKey);
    }
    return String(stamp || '').startsWith(String(dateStr) + 'T');
  },

  // Sky to show when a wet code is withheld. Same bands for every card.
  skyFromCover(cover) {
    const n = Number(cover);
    if (!Number.isFinite(n)) return 3;
    if (n >= 80) return 3;
    if (n >= 40) return 2;
    if (n >= 10) return 1;
    return 0;
  },

  // One rule for Now and every hour. A wet Open-Meteo code is kept only when
  // the chance is at least 50% and the amount is above zero. Otherwise the
  // sky code is kept, or cloud cover stands in for a withheld wet code.
  hourIcon(code, pop, precip, snow, cloudCover) {
    const rain = precip != null ? precip : 0;
    const sn = snow != null ? snow : 0;
    const chance = pop != null && Number(pop) >= this.WET_POP;
    if (this._isWet(code) && chance && (rain > 0 || sn > 0)) return Number(code);
    if (!this._isWet(code) && code != null) return Number(code);
    return this.skyFromCover(cloudCover);
  },

  // Day icon: the sky that covers the daylight hours, each hour judged by hourIcon.
  // One wet hour does not rename the day. Ties lean toward the clearer code.
  // nowMs (today only) keeps hours still ahead — the same window as the chance.
  // Daylight hours in that window win when any remain; otherwise the remaining
  // hours, including night. Omit nowMs for a later day's full daylight.
  dayIcon(dateStr, hourly, nowMs, tz) {
    if (!hourly || !hourly.time || !hourly.weather_code || dateStr == null) return 3;
    const nowKey = this._nowKey(nowMs, tz);
    const collect = (daylightOnly) => {
      const codes = [];
      for (let k = 0; k < hourly.time.length; k++) {
        if (!this._inWindow(hourly.time[k], dateStr, nowKey)) continue;
        if (daylightOnly && hourly.is_day && hourly.is_day[k] === 0) continue;
        const wc = hourly.weather_code[k];
        if (wc == null) continue;
        const pop = hourly.precipitation_probability ? hourly.precipitation_probability[k] : null;
        const precip = hourly.precipitation && hourly.precipitation[k] != null ? hourly.precipitation[k] : 0;
        const snow = hourly.snowfall && hourly.snowfall[k] != null ? hourly.snowfall[k] : 0;
        const cloud = hourly.cloud_cover ? hourly.cloud_cover[k] : null;
        codes.push(this.hourIcon(wc, pop, precip, snow, cloud));
      }
      return codes;
    };
    let codes = collect(true);
    if (!codes.length) codes = collect(false);
    if (!codes.length) return 3;
    const counts = new Map();
    codes.forEach((c) => counts.set(c, (counts.get(c) || 0) + 1));
    let best = null;
    let n = 0;
    counts.forEach((count, code) => {
      if (best == null || count > n) {
        n = count;
        best = code;
        return;
      }
      if (count !== n) return;
      const bestWet = this._isWet(best);
      const codeWet = this._isWet(code);
      if (bestWet && !codeWet) best = code;
      else if (bestWet === codeWet && Number(code) < Number(best)) best = code;
    });
    return best;
  },

  // Most common wet kind in the day's daylight hours, for the chance line.
  // nowMs limits today to hours still ahead, same window as dayIcon.
  dayPrecipWord(dateStr, hourly, nowMs, tz) {
    if (!hourly || !hourly.time || !hourly.weather_code || dateStr == null) return 'rain';
    const nowKey = this._nowKey(nowMs, tz);
    const counts = {};
    const add = (daylightOnly) => {
      for (let k = 0; k < hourly.time.length; k++) {
        if (!this._inWindow(hourly.time[k], dateStr, nowKey)) continue;
        if (daylightOnly && hourly.is_day && hourly.is_day[k] === 0) continue;
        const wc = hourly.weather_code[k];
        if (!this._isWet(wc)) continue;
        const word = this.precipWord(wc);
        counts[word] = (counts[word] || 0) + 1;
      }
    };
    add(true);
    if (!Object.keys(counts).length) add(false);
    let best = 'rain';
    let n = 0;
    Object.keys(counts).forEach((word) => {
      if (counts[word] > n) {
        n = counts[word];
        best = word;
      }
    });
    return best;
  },

  _svg(body, viewBox = '0 0 64 64') {
    return `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" aria-hidden="true">${body}</svg>`;
  },

  // Cloud silhouette: three separate puffs, each a different size and offset,
  // no connecting path or flat bottom.
  _cloud: (fill = '#FFFFFF') => `
    <g transform="translate(0,1.5)" opacity="0.65">
      <circle cx="17" cy="27" r="7.5" fill="#8FA6BB"/>
      <circle cx="31" cy="22" r="14"   fill="#8FA6BB"/>
      <circle cx="46" cy="26" r="9.5"  fill="#8FA6BB"/>
    </g>
    <circle cx="17" cy="27" r="7.5" fill="${fill}"/>
    <circle cx="31" cy="22" r="14"   fill="${fill}"/>
    <circle cx="46" cy="26" r="9.5"  fill="${fill}"/>
  `,

  // Small cloud used on "mainly clear" icons, tucked in the lower-right.
  _smallCloud: () => `
    <g transform="translate(0,1.5)" opacity="0.55">
      <circle cx="47" cy="40" r="8"   fill="#9FB3C4"/>
      <circle cx="60" cy="36" r="9.5" fill="#9FB3C4"/>
    </g>
    <circle cx="47" cy="40" r="8"   fill="#FFFFFF"/>
    <circle cx="60" cy="36" r="9.5" fill="#FFFFFF"/>
  `,

  // Sun with optional rays. Rays are omitted when the sun is peeking from
  // behind a cloud so only the disc shows.
  _sunBody: (cx = 32, cy = 32, r = 13, withRays = true) => {
    const ray = withRays ? 6 : 0;
    const s = Math.round(r * 0.7071);
    const e = Math.round((r + ray) * 0.7071);
    const rays = withRays ? `
      <line x1="${cx}" y1="${cy - r - ray}" x2="${cx}" y2="${cy - r}"/>
      <line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${cy + r + ray}"/>
      <line x1="${cx - r - ray}" y1="${cy}" x2="${cx - r}" y2="${cy}"/>
      <line x1="${cx + r}" y1="${cy}" x2="${cx + r + ray}" y2="${cy}"/>
      <line x1="${cx - e}" y1="${cy - e}" x2="${cx - s}" y2="${cy - s}"/>
      <line x1="${cx + e}" y1="${cy - e}" x2="${cx + s}" y2="${cy - s}"/>
      <line x1="${cx - e}" y1="${cy + e}" x2="${cx - s}" y2="${cy + s}"/>
      <line x1="${cx + e}" y1="${cy + e}" x2="${cx + s}" y2="${cy + s}"/>
    ` : '';
    return `
      <g stroke="#FFC93C" stroke-width="2.4" stroke-linecap="round">${rays}</g>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#FFD93D" stroke="#F0A520" stroke-width="1.4"/>
    `;
  },

  // True crescent moon: two arcs, no hand-drawn bezier wobble.
  _crescent: (s = 2.3, cx = 32, cy = 32) => {
    const off = 11.5 * s;
    return `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="#F6E78B" stroke="#D9B94A" stroke-width="0.7" transform="translate(${(cx - off).toFixed(1)}, ${(cy - off).toFixed(1)}) scale(${s})"/>`;
  },

  _sun: () => WeatherIcons._svg(`${WeatherIcons._sunBody(32, 32, 13, true)}`),

  _moon: () => WeatherIcons._svg(`${WeatherIcons._crescent(2.3, 32, 32)}`),

  // Code 1 - mainly clear: sun/moon prominent, small cloud in the corner.
  _sunFewCloud: () => WeatherIcons._svg(`
    ${WeatherIcons._sunBody(30, 30, 13, true)}
    ${WeatherIcons._smallCloud()}
  `),

  _moonFewCloud: () => WeatherIcons._svg(`
    ${WeatherIcons._crescent(1.6, 30, 30)}
    ${WeatherIcons._smallCloud()}
  `),

  // Code 2 - partly cloudy: sun/moon peeks from BEHIND the cloud.
  _cloudSun: () => WeatherIcons._svg(`
    ${WeatherIcons._sunBody(45, 16, 8, true)}
    ${WeatherIcons._cloud()}
  `),

  _cloudMoon: () => WeatherIcons._svg(`
    ${WeatherIcons._crescent(1.3, 24, 14)}
    ${WeatherIcons._cloud()}
  `),

  // Code 3 - overcast: a plain cloud with no sun/moon, clearly distinct from
  // the "partly cloudy" icons and visible on pale backgrounds.
  _cloudOvercast: () => WeatherIcons._svg(`${WeatherIcons._cloud()}`),

  // A single raindrop: teardrop path (pointed top, rounded bulb) with a small
  // gloss highlight, rotated along its fall direction. A pale white rim keeps
  // the drop readable on any card background.
  _drop: (x, y, angle = -16, r = 4.6) => `
    <g transform="translate(${x},${y}) rotate(${angle})">
      <path d="M0 ${(-r * 1.4).toFixed(1)} C ${(r * 0.9).toFixed(1)} ${(-r * 0.2).toFixed(1)} ${(r * 0.9).toFixed(1)} ${(r * 0.75).toFixed(1)} 0 ${(r * 1.05).toFixed(1)} C ${(-r * 0.9).toFixed(1)} ${(r * 0.75).toFixed(1)} ${(-r * 0.9).toFixed(1)} ${(-r * 0.2).toFixed(1)} 0 ${(-r * 1.4).toFixed(1)} Z" fill="#2E7FD4" stroke="#FFFFFF" stroke-width="0.8"/>
      <circle cx="${(-r * 0.3).toFixed(1)}" cy="${(r * 0.12).toFixed(1)}" r="${(r * 0.3).toFixed(1)}" fill="#C9E2FF" opacity="0.9"/>
    </g>
  `,

  // Heavy rain: a staggered pour of droplets tumbling out from under the cloud.
  _drops: () => `
    ${WeatherIcons._drop(22, 52, -16)}
    ${WeatherIcons._drop(32, 47, -16)}
    ${WeatherIcons._drop(42, 51, -16)}
  `,

  // Drizzle: a couple of fine teardrops in a staggered pair, angled like the
  // rain drops so all rain-icons share the same drop language.
  _drizzleDrops: () => `
    ${WeatherIcons._drop(27, 48, -16, 3.4)}
    ${WeatherIcons._drop(39, 51, -16, 3.4)}
  `,

  // Snowflakes peek from under the cloud; a pale blue outline keeps the white
  // flakes readable on bright cards.
  _snowDots: () => `
    <circle cx="22" cy="55" r="3" fill="#FFFFFF" stroke="#C9DFF2" stroke-width="1"/>
    <circle cx="33" cy="58" r="2.6" fill="#FFFFFF" stroke="#C9DFF2" stroke-width="1"/>
    <circle cx="43" cy="54" r="3.1" fill="#FFFFFF" stroke="#C9DFF2" stroke-width="1"/>
    <circle cx="52" cy="57.5" r="2.4" fill="#FFFFFF" stroke="#C9DFF2" stroke-width="1"/>
  `,

  _bolt: () => `
    <polygon points="33,47 26,57 31,57 28,62 42,54 36,54 39,47" fill="#FFC93C" stroke="#E8A10E" stroke-width="0.8"/>
  `,

  _moonPeek: () => `${WeatherIcons._crescent(1.2, 22, 15)}`,

  // Precipitation icons use a taller viewBox so long drops/dots are never clipped.
  _precipSvg: (body) => WeatherIcons._svg(body, '0 0 64 72'),

  _drizzleDay: () => WeatherIcons._precipSvg(`
    ${WeatherIcons._drizzleDrops()}
    ${WeatherIcons._cloud()}
  `),

  _drizzleNight: () => WeatherIcons._precipSvg(`
    ${WeatherIcons._moonPeek()}
    ${WeatherIcons._drizzleDrops()}
    ${WeatherIcons._cloud()}
  `),

  _rainDay: () => WeatherIcons._precipSvg(`
    ${WeatherIcons._drops()}
    ${WeatherIcons._cloud()}
  `),

  _rainNight: () => WeatherIcons._precipSvg(`
    ${WeatherIcons._moonPeek()}
    ${WeatherIcons._drops()}
    ${WeatherIcons._cloud()}
  `),

  _snowDay: () => WeatherIcons._precipSvg(`
    ${WeatherIcons._snowDots()}
    ${WeatherIcons._cloud()}
  `),

  _snowNight: () => WeatherIcons._precipSvg(`
    ${WeatherIcons._moonPeek()}
    ${WeatherIcons._snowDots()}
    ${WeatherIcons._cloud()}
  `),

  _thunderDay: () => WeatherIcons._precipSvg(`
    ${WeatherIcons._cloud()}
    ${WeatherIcons._drops()}
    ${WeatherIcons._bolt()}
  `),

  _thunderNight: () => WeatherIcons._precipSvg(`
    ${WeatherIcons._moonPeek()}
    ${WeatherIcons._cloud()}
    ${WeatherIcons._drops()}
    ${WeatherIcons._bolt()}
  `),

  _fogDay: () => WeatherIcons._svg(`
    <circle cx="32" cy="15" r="9" fill="#FFD93D" opacity="0.5"/>
    <line x1="10" y1="31" x2="54" y2="31" stroke="#D8E0EA" stroke-width="2.5" stroke-linecap="round" opacity="0.9"/>
    <line x1="14" y1="38" x2="50" y2="38" stroke="#D8E0EA" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>
    <line x1="10" y1="45" x2="54" y2="45" stroke="#D8E0EA" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/>
    <line x1="18" y1="52" x2="46" y2="52" stroke="#D8E0EA" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
  `),

  _fogNight: () => WeatherIcons._svg(`
    <line x1="10" y1="29" x2="54" y2="29" stroke="#D8E0EA" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
    <line x1="14" y1="36" x2="50" y2="36" stroke="#D8E0EA" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>
    <line x1="10" y1="43" x2="54" y2="43" stroke="#D8E0EA" stroke-width="2.5" stroke-linecap="round" opacity="0.45"/>
    <line x1="18" y1="50" x2="46" y2="50" stroke="#D8E0EA" stroke-width="2" stroke-linecap="round" opacity="0.35"/>
    <line x1="14" y1="56" x2="50" y2="56" stroke="#D8E0EA" stroke-width="2" stroke-linecap="round" opacity="0.25"/>
  `),
};