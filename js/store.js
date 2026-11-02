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
 * stay on their own keys (see Utils.PLACE_KEYS) so the Remember switch can
 * clear them without wiping theme/units.
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

    return {
      theme: stored.theme === "light" || stored.theme === "dark" ? stored.theme : "system",
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
    clearAll: clearAll,
    isPersistent: function () {
      return !!store;
    }
  };
})();
