/*
 * Seclusa app theme boot — sets the saved appearance before the first paint.
 *
 * Copy this file as-is. It is the one piece of a Seclusa app that genuinely has to
 * run before anything else, and getting it wrong is visible rather than theoretical.
 *
 * The document above declares `data-theme="light"`, because that is the right answer
 * for a browser with no JavaScript. It is the wrong answer for everyone else: the real
 * preference is in localStorage and only a script can read it. So on every load the
 * page painted light, then corrected itself a moment later. On a desktop that is a
 * flicker; on a phone, where parsing two stylesheets takes a beat, it is a full white
 * flash on a dark-mode device, and it reads as "the theme is broken".
 *
 * This runs instead. It is deliberately tiny, synchronous, and in <head> ahead of the
 * stylesheets. That is the whole trick: by the time any rule that reads `data-theme`
 * can apply, the attribute is already correct.
 *
 * Two rules it follows, both of which have been learned the hard way:
 *
 *   1. Never throw. This is the first script on the page; an exception here stops
 *      later scripts loading and can leave the page unstyled entirely.
 *   2. Never assume storage exists. Private browsing and blocked-storage modes throw
 *      on *access*, not just on use, so even the existence check is inside the try.
 */

(function () {
  var KEY_THEME = "ssc.pref_key_night_mode";
  var KEY_SETTINGS = "seclusa.settings";
  var BG = {
    grid: 1, blue: 1, lightblue: 1, teal: 1, green: 1, yellow: 1,
    orange: 1, red: 1, purple: 1, black: 1, white: 1, custom: 1
  };
  var BG_LEGACY = {
    sky: "lightblue", ocean: "blue", slate: "black", forest: "green",
    sunset: "orange", violet: "purple", rose: "red", amber: "orange", plain: "white"
  };

  /** Read the saved preference. Anything unrecognised means "follow the system". */
  function readPref() {
    try {
      var v = localStorage.getItem(KEY_THEME);
      // Only these two values are honoured. Anything else in storage is either
      // corrupt or from a newer version, and guessing from it could paint the app
      // a colour nobody chose.
      return v === "light" || v === "dark" ? v : null;
    } catch (err) {
      return null;
    }
  }

  function readHex(v) {
    return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
  }

  function readSettingsBg() {
    try {
      var raw = localStorage.getItem(KEY_SETTINGS);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      /* Last live sun period so night slot paints before weather reloads. */
      var sky = parsed.skyPeriod === "night" ? "night" : "day";
      var rawBg = sky === "night"
        ? (parsed.backgroundNight || parsed.background)
        : (parsed.backgroundDay || parsed.background);
      var bg = BG[rawBg] ? rawBg : (BG_LEGACY[rawBg] || null);
      var custom = sky === "night"
        ? (readHex(parsed.bgCustomNight) || readHex(parsed.bgCustomDay) || readHex(parsed.bgCustom))
        : (readHex(parsed.bgCustomDay) || readHex(parsed.bgCustom));
      return {
        sky: sky,
        bg: bg,
        custom: custom
      };
    } catch (err) {
      return null;
    }
  }

  try {
    var html = document.documentElement;
    var saved = readPref();

    if (saved) {
      html.setAttribute("data-theme", saved);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      html.setAttribute("data-theme", "dark");
    }

    var bgInfo = readSettingsBg();
    html.setAttribute("data-sky", bgInfo && bgInfo.sky === "night" ? "night" : "day");

    /*
     * Custom colour via adopted stylesheet — not element.style.
     * Older boots set inline --bg-custom, which beat live dynCSS and trapped picks on blue.
     * Drop any leftover style attribute, then paint through a sheet ui.js can override.
     */
    try { html.removeAttribute("style"); } catch (err) { /* ignore */ }
    if (bgInfo && bgInfo.custom) {
      try {
        var sheet = new CSSStyleSheet();
        sheet.insertRule("html { --bg-custom: " + bgInfo.custom + "; }", 0);
        document.adoptedStyleSheets = [].concat(document.adoptedStyleSheets, sheet);
      } catch (err) {
        /* adoptedStyleSheets unavailable — first paint uses CSS fallback #5faff0. */
      }
    }
    if (bgInfo && bgInfo.bg) {
      html.setAttribute("data-bg", bgInfo.bg);
      /* Match ui.js: light frosted cards on colour/light pages; dark cards on near-black. */
      var tone = "light";
      if (bgInfo.bg === "black") {
        tone = "dark";
      } else if (bgInfo.bg === "custom" && bgInfo.custom) {
        var n = parseInt(bgInfo.custom.slice(1), 16);
        var r = ((n >> 16) & 255) / 255;
        var g = ((n >> 8) & 255) / 255;
        var b = (n & 255) / 255;
        var luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        tone = luma < 0.18 ? "dark" : "light";
      } else if (bgInfo.bg === "grid") {
        tone = null;
      }
      if (tone) html.setAttribute("data-bg-tone", tone);
      else html.removeAttribute("data-bg-tone");
    }
  } catch (err) {
    /* Storage blocked, or no matchMedia. The light default in the markup stands. */
  }
})();