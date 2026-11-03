/*
 * Seclusa app — local storage.
 *
 * Everything the app knows lives on this device. There is no account, no
 * server and no network call anywhere in this file or in the app that uses it.
 *
 * STORAGE CAN BE BLOCKED, AND NOTHING BREAKS
 *
 * Private browsing and "block all cookies" modes throw on *access* to
 * localStorage, not just on use, so even the existence check has to be inside
 * the try. When storage is unavailable the app falls back to an in-memory map:
 * the session still works, the data just does not survive a reload. That is a
 * far better failure than a blank screen, and it is why every read and write
 * below is wrapped.
 *
 * The namespaced keys below are the ones the app owns. "Clear all data" in the
 * app's settings removes exactly these, and nothing else. Place coordinates
 * stay on their own keys (see Utils.PLACE_KEYS) so place data can expire or be
 * erased without wiping theme/units.
 */

(function () {
  "use strict";

  var KEY_DATA = "seclusa.data";
  var KEY_SETTINGS = "seclusa.settings";

  /*
   * The theme key is the one the shared template already uses, so the
   * pre-paint script (theme-boot.js) and this file agree on one value.
   * "system" is deliberately not a value theme-boot.js honours: it falls
   * through to the OS preference, which is exactly what "system" means.
   */
  var KEY_THEME = "ssc.pref_key_night_mode";

  /* Flat keys used before prefs lived in seclusa.settings — migrated once. */
  var LEGACY_PREF_KEYS = [
    "units",
    "windUnit",
    "visUnit",
    "pressUnit",
    "chartMode",
    "rememberPlace"
  ];

  /*
   * Fallback for blocked storage. Same shape as localStorage, so the rest of
   * the file does not need to know which one it is talking to.
   */
  var memory = Object.create(null);

  function backing() {
    try {
      // Touching localStorage at all is enough to throw in blocked modes.
      var ls = window.localStorage;
      var probe = "__seclusa_probe__";
      ls.setItem(probe, "1");
      ls.removeItem(probe);
      return ls;
    } catch (err) {
      return null;
    }
  }

  var store = backing();

  function readRaw(key) {
    try {
      if (store) return store.getItem(key);
      return key in memory ? memory[key] : null;
    } catch (err) {
      return key in memory ? memory[key] : null;
    }
  }

  function writeRaw(key, value) {
    try {
      if (store) {
        store.setItem(key, value);
        return true;
      }
    } catch (err) {
      /* Falls through to the in-memory copy below. */
    }
    memory[key] = value;
    return false;
  }

  function removeRaw(key) {
    try {
      if (store) store.removeItem(key);
    } catch (err) {
      /* Nothing to do; the in-memory copy is cleared either way. */
    }
    delete memory[key];
  }

  function readJSON(key, fallback) {
    var raw = readRaw(key);
    if (raw === null || raw === "") return fallback;
    try {
      var parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (err) {
      // Corrupt data must not take the app down. The bad value is dropped so
      // the next write replaces it with something readable.
      removeRaw(key);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      return writeRaw(key, JSON.stringify(value));
    } catch (err) {
      return false;
    }
  }

  // ---------------------------------------------------------------- settings

  function migrateLegacyPrefs(stored) {
    var changed = false;
    for (var i = 0; i < LEGACY_PREF_KEYS.length; i++) {
      var key = LEGACY_PREF_KEYS[i];
      if (stored[key] != null && stored[key] !== "") continue;
      var legacy = readRaw(key);
      if (legacy == null || legacy === "") continue;
      stored[key] = legacy;
      removeRaw(key);
      changed = true;
    }
    return changed;
  }

  function getSettings() {
    var stored = readJSON(KEY_SETTINGS, {});
    if (!stored || typeof stored !== "object") stored = {};
    if (migrateLegacyPrefs(stored)) writeJSON(KEY_SETTINGS, stored);

    var units = stored.units === "imperial" || stored.units === "metric" ? stored.units : null;
    var wind = ["kmh", "mph", "kn", "ms"].indexOf(stored.windUnit) >= 0 ? stored.windUnit : null;
    var vis = stored.visUnit === "mi" || stored.visUnit === "km" ? stored.visUnit : null;
    var press = stored.pressUnit === "inHg" || stored.pressUnit === "hPa" ? stored.pressUnit : null;
    var chart = ["temp", "rain", "solar"].indexOf(stored.chartMode) >= 0 ? stored.chartMode : null;
    var remember = stored.rememberPlace === "on" || stored.rememberPlace === "off"
      ? stored.rememberPlace
      : null;

    /* Migrate single background → day/night slots. */
    var legacyBg = normalizeBackground(stored.background);
    var legacyCustom = normalizeHex(stored.bgCustom) || "#5faff0";
    var backgroundDay = stored.backgroundDay != null
      ? normalizeBackground(stored.backgroundDay)
      : legacyBg;
    /* Night follows day until the user edits Night (avoids factory black hiding Day picks). */
    var backgroundNight = stored.backgroundNight != null
      ? normalizeBackground(stored.backgroundNight)
      : (stored.background != null ? legacyBg : backgroundDay);
    var bgCustomDay = normalizeHex(stored.bgCustomDay) || legacyCustom;
    var bgCustomNight = normalizeHex(stored.bgCustomNight) || legacyCustom;
    var bgNightTouched = stored.bgNightTouched === true;

    return {
      theme: stored.theme === "light" || stored.theme === "dark" ? stored.theme : "system",
      background: backgroundDay,
      backgroundDay: backgroundDay,
      backgroundNight: backgroundNight,
      bgCustom: bgCustomDay,
      bgCustomDay: bgCustomDay,
      bgCustomNight: bgCustomNight,
      bgNightTouched: bgNightTouched,
      /* Last live sun period — theme-boot uses this so night skies paint before weather. */
      skyPeriod: stored.skyPeriod === "night" ? "night" : "day",
      units: units,
      windUnit: wind,
      visUnit: vis,
      pressUnit: press,
      chartMode: chart,
      rememberPlace: remember
    };
  }

  function setSettings(patch) {
    var stored = readJSON(KEY_SETTINGS, {});
    if (!stored || typeof stored !== "object") stored = {};
    for (var k in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, k) && patch[k] != null) {
        stored[k] = patch[k];
      }
    }
    writeJSON(KEY_SETTINGS, stored);
    return getSettings();
  }

  function getTheme() {
    try {
      var v = window.localStorage.getItem(KEY_THEME);
      if (v === "light" || v === "dark") return v;
    } catch (err) {
      /* Fall through. */
    }
    return getSettings().theme;
  }

  /**
   * Writes the theme in two places on purpose.
   *
   * The key the template's pre-paint script reads has to hold "light" or
   * "dark" for that script to act on it; when the choice is "system" we store
   * that separately and clear the pre-paint key, so the script follows the OS.
   */
  function setTheme(theme) {
    var value = theme === "light" || theme === "dark" ? theme : "system";
    setSettings({ theme: value });
    try {
      if (value === "system") window.localStorage.removeItem(KEY_THEME);
      else window.localStorage.setItem(KEY_THEME, value);
    } catch (err) {
      writeRaw(KEY_THEME, value);
    }
    return value;
  }

  /** grid = orange lines; named colours / custom = solid fills. */
  var BG_PALETTE = {
    grid: 1,
    blue: 1,
    lightblue: 1,
    green: 1,
    red: 1,
    yellow: 1,
    black: 1,
    white: 1,
    custom: 1
  };

  /* Older swatch names → nearest new option. */
  var BG_LEGACY = {
    sky: "lightblue",
    ocean: "blue",
    slate: "black",
    forest: "green",
    sunset: "red",
    violet: "blue",
    rose: "red",
    amber: "yellow",
    plain: "white"
  };

  function normalizeHex(hex) {
    if (typeof hex !== "string") return null;
    var m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
    return m ? "#" + m[1].toLowerCase() : null;
  }

  function normalizeBackground(background) {
    if (BG_PALETTE[background]) return background;
    if (BG_LEGACY[background]) return BG_LEGACY[background];
    return "grid";
  }

  function getBackgroundDay() {
    return normalizeBackground(getSettings().backgroundDay);
  }

  function getBackgroundNight() {
    return normalizeBackground(getSettings().backgroundNight);
  }

  /** Active slot from sun period: "day" | "night". */
  function getBackground(period) {
    return period === "night" ? getBackgroundNight() : getBackgroundDay();
  }

  function getSkyPeriod() {
    return getSettings().skyPeriod === "night" ? "night" : "day";
  }

  function setSkyPeriod(period) {
    var value = period === "night" ? "night" : "day";
    setSettings({ skyPeriod: value });
    return value;
  }

  /** True when Day/Night still share one colour (or factory grid+black split). */
  function backgroundsLinked(day, night, nightTouched) {
    if (day === night) return true;
    if (nightTouched) return false;
    return day === "grid" && night === "black";
  }

  function setBackground(background, period) {
    var value = normalizeBackground(background);
    var s = getSettings();
    var linked = backgroundsLinked(s.backgroundDay, s.backgroundNight, s.bgNightTouched);
    var patch = { background: value };
    if (period === "night") {
      patch.backgroundNight = value;
      patch.bgNightTouched = true;
      if (linked) patch.backgroundDay = value;
    } else {
      patch.backgroundDay = value;
      if (linked) patch.backgroundNight = value;
    }
    setSettings(patch);
    return value;
  }

  function getBgCustom(period) {
    var s = getSettings();
    return period === "night" ? s.bgCustomNight : s.bgCustomDay;
  }

  function setBgCustom(hex, period) {
    var value = normalizeHex(hex) || "#5faff0";
    var s = getSettings();
    var linked = backgroundsLinked(s.backgroundDay, s.backgroundNight, s.bgNightTouched);
    var patch = { background: "custom", bgCustom: value };
    if (period === "night") {
      patch.bgCustomNight = value;
      patch.backgroundNight = "custom";
      patch.bgNightTouched = true;
      if (linked) {
        patch.bgCustomDay = value;
        patch.backgroundDay = "custom";
      }
    } else {
      patch.bgCustomDay = value;
      patch.backgroundDay = "custom";
      if (linked) {
        patch.bgCustomNight = value;
        patch.backgroundNight = "custom";
      }
    }
    setSettings(patch);
    return value;
  }

  /** Rewrite legacy swatch names in storage so paint + boot stay in sync. */
  function migrateBackgrounds() {
    var stored = readJSON(KEY_SETTINGS, {});
    if (!stored || typeof stored !== "object") stored = {};
    var dayRaw = stored.backgroundDay != null ? stored.backgroundDay : stored.background;
    var nightRaw = stored.backgroundNight != null ? stored.backgroundNight : stored.background;
    var day = normalizeBackground(dayRaw);
    var night = normalizeBackground(nightRaw != null ? nightRaw : day);
    var nightTouched = stored.bgNightTouched === true;
    /* Older builds persisted factory night=black against day=grid / a Day pick. */
    if (!nightTouched && night === "black" && day !== "black") {
      night = day;
    }
    if (
      stored.backgroundDay !== day
      || stored.backgroundNight !== night
      || stored.background !== day
    ) {
      setSettings({
        backgroundDay: day,
        backgroundNight: night,
        background: day
      });
    }
    return { day: day, night: night };
  }

  // -------------------------------------------------------------------- data

  function getData() {
    var value = readJSON(KEY_DATA, {});
    return value && typeof value === "object" ? value : {};
  }

  function setData(value) {
    writeJSON(KEY_DATA, value && typeof value === "object" ? value : {});
    return getData();
  }

  function patchData(patch) {
    var next = getData();
    for (var k in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, k)) {
        if (patch[k] === undefined) delete next[k];
        else next[k] = patch[k];
      }
    }
    return setData(next);
  }

  /** Removes everything the app owns via Store keys, and nothing else. */
  function clearAll() {
    removeRaw(KEY_DATA);
    removeRaw(KEY_SETTINGS);
    removeRaw(KEY_THEME);
    for (var i = 0; i < LEGACY_PREF_KEYS.length; i++) removeRaw(LEGACY_PREF_KEYS[i]);
    removeRaw("weatherCache");
  }

  window.Store = {
    getData: getData,
    setData: setData,
    patchData: patchData,
    getSettings: getSettings,
    setSettings: setSettings,
    getTheme: getTheme,
    setTheme: setTheme,
    getBackground: getBackground,
    setBackground: setBackground,
    getBgCustom: getBgCustom,
    setBgCustom: setBgCustom,
    getSkyPeriod: getSkyPeriod,
    setSkyPeriod: setSkyPeriod,
    migrateBackgrounds: migrateBackgrounds,
    clearAll: clearAll,
    isPersistent: function () {
      return !!store;
    }
  };
})();
