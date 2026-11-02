Object.assign(UI, {
  renderHourlyChart(hourly, units) {
    const container = this.$('hourlyChart');
    if (!container || !hourly || !hourly.time) return;

    const mode = this._chartMode;
    const modeLabel = this._chartModeLabel(mode);
    container.classList.remove('hidden');
    const chartHead = this.$('hourlyChartHead');
    if (chartHead) chartHead.classList.remove('hidden');
    this._bindChartSwipe(container);

    const W = Math.max(320, container.clientWidth || 600);
    const H = 320;
    const padR = 16, padT = 30, padB = 48;
    const ih = H - padT - padB;
    let padL = 58;

    const startIdx = this._hourlyStartIdx(hourly);
    const count = 24;
    const times = hourly.time.slice(startIdx, startIdx + count);
    const modePillsMarkup = this.CHART_MODES.map((m) =>
      `<button type="button" class="hourly-chart__mode hourly-chart__mode--${m}${m === mode ? ' is-active' : ''}" role="tab" aria-selected="${m === mode}" data-mode="${m}">${this._chartModeShort(m)}</button>`
    ).join('');
    const empty = () => {
      container.innerHTML = `
        <div class="hourly-chart__modes" role="tablist" aria-label="Chart type">${modePillsMarkup}</div>
        <div class="hourly-chart__empty">No data available for this chart.</div>`;
    };
    if (!times.length) { empty(); return; }
    const slice = (key) => hourly[key] ? hourly[key].slice(startIdx, startIdx + count) : null;

    const pops = slice('precipitation_probability');
    const precipSlice = slice('precipitation');
    const snowSlice = slice('snowfall');

    let cfg;
    if (mode === 'rain') {
      if (!pops) { empty(); return; }
      // Same gate as hourly list: probability alone is noise when amount is 0.
      const gated = pops.map((p, i) => {
        if (p == null || p <= 0) return 0;
        const r = precipSlice && precipSlice[i] != null ? precipSlice[i] : 0;
        const s = snowSlice && snowSlice[i] != null ? snowSlice[i] : 0;
        return (r > 0 || s > 0) ? p : 0;
      });
      cfg = {
        min: 0, max: 100, suffix: '%',
        values: gated, color: '#38BDF8', cells: true,
        legend: [{ label: 'chance of rain', swatch: 'rain' }],
      };
    } else if (mode === 'solar') {
      const raw = slice('shortwave_radiation');
      if (!raw) { empty(); return; }
      const fullSun = 1000;
      const vals = raw.map((v) => v == null ? null : Math.max(0, Math.min(100, Math.round((v / fullSun) * 100))));
      cfg = {
        min: 0, max: 100, values: vals, color: '#FACC15', suffix: '%',
        legend: [{ label: 'Solar radiation (%)', swatch: 'solar' }],
      };
    } else {
      const vals = slice('temperature_2m');
      if (!vals) { empty(); return; }
      const suffix = units === 'imperial' ? '°F' : '°C';
      cfg = {
        values: vals, suffix: '°', tempGrad: true,
        second: slice('dew_point_2m') || [],
        legend: [
          { label: `Temperature (${suffix})`, swatch: 'temp' },
          { label: `Dew point (${suffix})`, swatch: 'dew' },
        ],
      };
    }

    const finite = (arr) => arr.filter((v) => Number.isFinite(v));
    const primary = finite(cfg.values || []);
    const secondary = cfg.second ? finite(cfg.second) : [];
    if (!primary.length && !secondary.length) { empty(); return; }
    const minT = cfg.min != null ? cfg.min : Math.min(...primary, ...secondary);
    const maxT = cfg.max != null ? cfg.max : Math.max(...primary, ...secondary);
    const span = Math.max(1, maxT - minT);

    // Grow left padding so the widest y-axis label (e.g. "1013 hPa") isn't clipped.
    if (cfg.values) {
      try {
        const ctx = this._getMeasureCtx();
        const ticks = 4;
        for (let i = 0; i <= ticks; i++) {
          const t = Math.round(minT + (span * i) / ticks);
          padL = Math.max(padL, ctx.measureText(`${t}${cfg.suffix}`).width + 16);
        }
      } catch (e) { /* measurement is best-effort */ }
    }
    const iw = W - padL - padR;

    const y = (t) => padT + ih - ((t - minT) / span) * ih;
    const x = (i) => padL + (i / times.length) * iw;

    // For the bar ("cells") view the band indents by half a bar width on each
    // side so the first/last bars sit full-size and never touch the y-axis.
    let cellsPos = null;
    if (cfg.cells) {
      const cw = iw / times.length;
      const gap = Math.min(7, cw * 0.22);
      const bw = Math.max(2, cw - gap);
      cellsPos = {
        bw,
        rx: Math.min(8, bw / 2),
        pos: (i) => padL + bw / 2 + (i / times.length) * (iw - bw),
      };
    }
    const pos = (i) => (cellsPos ? cellsPos.pos(i) : x(i));

    let grid = '';
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const t = minT + (span * i) / ticks;
      const yy = y(t).toFixed(1);
      grid += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="currentColor" stroke-opacity="0.12"/>
               <text x="${padL - 12}" y="${+yy + 6}" text-anchor="end" font-size="18" font-weight="600" fill="currentColor" fill-opacity="0.9">${Math.round(t)}${cfg.suffix}</text>`;
    }

    let xlabels = '';
    const minGap = 76;
    const labelStep = [6, 8, 12, 24].find((s) => (iw * s) / times.length >= minGap) || 24;
    for (let i = 0; i < times.length; i += labelStep) {
      xlabels += `<text x="${pos(i).toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="18" font-weight="600" fill="currentColor" fill-opacity="0.9">${this._esc(Utils.formatHourShort(times[i], this._tz))}</text>`;
    }
    if (labelStep < 24) {
      const parts = times[0].slice(0, 10).split('-').map(Number);
      const next = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1)).toISOString().slice(0, 10) + 'T00:00:00';
      const dayEnd = Utils.parseLocal(next, this._tz);
      xlabels += `<text x="${pos(times.length).toFixed(1)}" y="${H - 12}" text-anchor="end" font-size="18" font-weight="600" fill="currentColor" fill-opacity="0.9">${this._esc(Utils.formatHourShort(dayEnd, this._tz))}</text>`;
    }

    let line = '', dots = '', cells = '', defs = '';
    if (cfg.cells) {
      const baseY = padT + ih;
      const scale = (t) => (t - minT) / span;
      defs = `<linearGradient id="chartBarGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${cfg.color}" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="${cfg.color}" stop-opacity="0.35"/>
        </linearGradient>
        <filter id="chartBarGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>`;
      cfg.values.forEach((t, i) => {
        if (!Number.isFinite(t)) return;
        const h = Math.max(2, scale(t) * ih);
        const x0 = (cellsPos.pos(i) - cellsPos.bw / 2).toFixed(1);
        const y0 = (baseY - h).toFixed(1);
        cells += `<rect x="${x0}" y="${y0}" width="${cellsPos.bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${cellsPos.rx}" fill="url(#chartBarGrad)" stroke="rgba(255,255,255,0.55)" stroke-width="1.1"/>`;
      });
      cells += `<rect x="${padL}" y="${(baseY - 1).toFixed(1)}" width="${iw.toFixed(1)}" height="1" fill="currentColor" fill-opacity="0.15"/>`;
    } else if (cfg.values) {
      // Sparse series may contain null/NaN entries; drop them so paths never get invalid coords.
      const seriesPts = (arr) => arr
        .map((t, i) => (Number.isFinite(t) ? [x(i), y(t)] : null))
        .filter(Boolean);
      const smoothD = (pts) => {
        if (!pts.length) return '';
        if (pts.length === 1) return `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
        let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i - 1] || pts[i];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[i + 2] || p2;
          const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
          const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
          const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
          const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
          d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
        }
        return d;
      };
      const mainPts = seriesPts(cfg.values);
      const mainD = smoothD(mainPts);
      const baseY = (padT + ih).toFixed(1);
      const areaD = mainPts.length
        ? `${mainD} L ${mainPts[mainPts.length - 1][0].toFixed(1)} ${baseY} L ${mainPts[0][0].toFixed(1)} ${baseY} Z`
        : '';
      const stroke = cfg.tempGrad ? 'url(#tempGrad)' : cfg.color;
      const fillId = cfg.tempGrad ? 'tempAreaGrad' : 'chartAreaGrad';
      if (cfg.tempGrad) {
        const gradStops = [1, 0.75, 0.5, 0.25, 0].map((f) => {
          const t = minT + span * f;
          return `<stop offset="${Math.round(f * 100)}%" stop-color="${Utils.getTempColor(t, units)}"/>`;
        }).join('');
        defs = `<linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">${gradStops}</linearGradient>
          <linearGradient id="tempAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${Utils.getTempColor(maxT, units)}" stop-opacity="0.38"/>
            <stop offset="55%" stop-color="${Utils.getTempColor(minT + span * 0.45, units)}" stop-opacity="0.14"/>
            <stop offset="100%" stop-color="${Utils.getTempColor(minT, units)}" stop-opacity="0"/>
          </linearGradient>`;
      } else {
        defs = `<linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${cfg.color}" stop-opacity="0.42"/>
            <stop offset="70%" stop-color="${cfg.color}" stop-opacity="0.12"/>
            <stop offset="100%" stop-color="${cfg.color}" stop-opacity="0"/>
          </linearGradient>`;
      }
      defs += `
        <filter id="chartLineGlow" x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="3.2" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id="chartDotGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.6" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>`;
      if (mainD) {
        line = `
          ${areaD ? `<path d="${areaD}" fill="url(#${fillId})"/>` : ''}
          <path d="${mainD}" fill="none" stroke="${stroke}" stroke-width="12" stroke-opacity="0.18" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="${mainD}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="${mainD}" fill="none" stroke="${stroke}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      if (cfg.gusts) {
        const gustD = smoothD(seriesPts(cfg.gusts));
        if (gustD) {
          line += `
            <path d="${gustD}" fill="none" stroke="${cfg.gustColor}" stroke-width="7" stroke-opacity="0.22" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="${gustD}" fill="none" stroke="${cfg.gustColor}" stroke-width="2.8" stroke-dasharray="7 5" stroke-linecap="round" stroke-linejoin="round"/>`;
        }
      }
      dots = cfg.values.map((t, i) => {
        if (!Number.isFinite(t)) return '';
        const fill = cfg.tempGrad ? Utils.getTempColor(t, units) : cfg.color;
        const cx = x(i).toFixed(1);
        const cy = y(t).toFixed(1);
        return `<circle cx="${cx}" cy="${cy}" r="6.2" fill="${fill}" fill-opacity="0.22"/>
                <circle cx="${cx}" cy="${cy}" r="4.2" fill="${fill}" stroke="rgba(255,255,255,0.95)" stroke-width="1.6"/>
                <circle cx="${cx}" cy="${cy}" r="1.5" fill="rgba(255,255,255,0.95)"/>`;
      }).join('');
      if (cfg.second && cfg.second.length) {
        const dpPts = seriesPts(cfg.second);
        const dpD = smoothD(dpPts);
        if (dpD) {
          line += `
            <path d="${dpD}" fill="none" stroke="#26C6DA" stroke-width="7" stroke-opacity="0.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="${dpD}" fill="none" stroke="#26C6DA" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="6 4"/>`;
        }
        dots += cfg.second.map((t, i) => {
          if (!Number.isFinite(t)) return '';
          const cx = x(i).toFixed(1);
          const cy = y(t).toFixed(1);
          return `<circle cx="${cx}" cy="${cy}" r="3.4" fill="#26C6DA" stroke="rgba(255,255,255,0.92)" stroke-width="1.2"/>
                  <circle cx="${cx}" cy="${cy}" r="1.1" fill="rgba(255,255,255,0.95)"/>`;
        }).join('');
      }
    }

    container.innerHTML = `
      <div class="hourly-chart__modes" role="tablist" aria-label="Chart type">${modePillsMarkup}</div>
      <svg viewBox="0 0 ${W} ${H}" class="hourly-chart__svg" role="img"
           aria-label="24-hour ${modeLabel} chart">
        <defs>${defs}</defs>
        ${grid}
        ${xlabels}
        ${cells}
        ${line}
        ${dots}
      </svg>
      ${cfg.legend && cfg.legend.length ? `
        <div class="hourly-chart__legend">
          ${cfg.legend.map((l) => `<span class="hourly-chart__legend-item"><span class="hourly-chart__legend-swatch hourly-chart__legend-swatch--${l.swatch}"></span>${l.label}</span>`).join('')}
        </div>` : ''}
      <div class="hourly-chart__hint"><svg class="hourly-card__hinticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/><path d="M15 6l6 6-6 6"/></svg><span>Swipe to change chart</span></div>`;

    const modes = container.querySelector('.hourly-chart__modes');
    const activeMode = container.querySelector('.hourly-chart__mode.is-active');
    if (modes && activeMode && modes.scrollWidth > modes.clientWidth) {
      const mr = modes.getBoundingClientRect();
      const cr = activeMode.getBoundingClientRect();
      if (cr.left < mr.left || cr.right > mr.right) {
        modes.scrollLeft += (cr.left - mr.left) - (mr.width - cr.width) / 2;
      }
    }
  },

  setChartMode(mode) {
    if (mode === 'dew') mode = 'temp';
    this._chartMode = this.CHART_MODES.includes(mode) ? mode : 'temp';
  },

  _chartModeShort(mode) {
    return mode === 'temp' ? 'Temp'
      : mode === 'rain' ? 'Rain'
      : 'Solar';
  },

  _chartModeLabel(mode) {
    return mode === 'rain' ? 'Chance of rain'
      : mode === 'solar' ? 'Solar'
      : 'Temperature & dew point';
  },

  _setMode(mode) {
    this.setChartMode(mode);
    Utils.safeSet('chartMode', mode);
    if (this._lastWeather && this._lastWeather.hourly) {
      this.renderHourlyChart(this._lastWeather.hourly, this._lastUnits);
    }
  },

  _cycleChart(dir) {
    const order = this.CHART_MODES;
    const i = order.indexOf(this._chartMode);
    this._setMode(order[(i + dir + order.length) % order.length]);
  },

  _bindChartSwipe(container) {
    if (this._chartSwipeBound || !container) return;
    this._chartSwipeBound = true;

    container.tabIndex = 0;
    container.setAttribute('aria-label', 'Hourly chart — swipe or use arrow keys to change metric');

    container.addEventListener('click', (e) => {
      if (this._chartDragged) { this._chartDragged = false; return; }
      const modeBtn = e.target.closest('.hourly-chart__mode[data-mode]');
      if (modeBtn) this._setMode(modeBtn.getAttribute('data-mode'));
    });

    let startX = null, startY = null, dx = 0, dy = 0, peakX = 0, peakY = 0, down = false, axis = null;

    container.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.target.closest('.hourly-chart__modes')) return;
      down = true; startX = e.clientX; startY = e.clientY; dx = 0; dy = 0; peakX = 0; peakY = 0; axis = null; this._chartDragged = false;
    });
    container.addEventListener('pointermove', (e) => {
      if (!down || e.pointerType === 'touch') return;
      dx = e.clientX - startX; dy = e.clientY - startY;
      if (Math.abs(dx) > Math.abs(peakX)) peakX = dx;
      if (Math.abs(dy) > Math.abs(peakY)) peakY = dy;
      if (axis === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      }
      if (axis === 'x') e.preventDefault();
    });
    container.addEventListener('pointerup', (e) => {
      if (!down || e.pointerType === 'touch') return;
      down = false;
      if (axis === 'x' && Math.abs(peakX) > 55) { this._cycleChart(peakX < 0 ? 1 : -1); this._chartDragged = true; }
      axis = null;
    });
    container.addEventListener('pointercancel', () => { down = false; axis = null; });

    container.addEventListener('touchstart', (e) => {
      if (e.target.closest('.hourly-chart__modes')) return;
      const t = e.touches[0];
      if (!t) return;
      down = true; startX = t.clientX; startY = t.clientY; dx = 0; dy = 0; peakX = 0; peakY = 0; axis = null; this._chartDragged = false;
    }, { passive: true });
    container.addEventListener('touchmove', (e) => {
      if (!down) return;
      const t = e.touches[0];
      if (!t) return;
      dx = t.clientX - startX; dy = t.clientY - startY;
      if (Math.abs(dx) > Math.abs(peakX)) peakX = dx;
      if (Math.abs(dy) > Math.abs(peakY)) peakY = dy;
      if (axis === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      }
      if (axis === 'x') e.preventDefault();
    }, { passive: false });
    container.addEventListener('touchend', () => {
      if (!down) return;
      down = false;
      if (axis === 'x' && Math.abs(peakX) > 55) { this._cycleChart(peakX < 0 ? 1 : -1); this._chartDragged = true; }
      axis = null;
    });
    container.addEventListener('touchcancel', () => { down = false; axis = null; });

    container.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); this._cycleChart(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this._cycleChart(1); }
    });
  },
});
