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

  try {
    var html = document.documentElement;
    var saved = readPref();

    if (saved) {
      html.setAttribute("data-theme", saved);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      html.setAttribute("data-theme", "dark");
    }
  } catch (err) {
    /* Storage blocked, or no matchMedia. The light default in the markup stands. */
  }
})();