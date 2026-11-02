/*
 * Seclusa app — theme switching.
 *
 * The shared template already decides the theme before the first paint
 * (theme-boot.js, in <head>). This file does the other half: it applies the
 * three-way choice the user makes — system, light or dark — and keeps the
 * browser's own chrome in step with it.
 *
 * The key is the one the template uses, so the pre-paint script and this file
 * agree on a single value. "system" is stored as the absence of a value: the
 * pre-paint script then follows the operating system, which is what system
 * mode means.
 */

(function () {
  "use strict";

  var LIGHT = "#ffffff";
  var DARK = "#0a0a0a";

  function prefersDark() {
    try {
      return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    } catch (err) {
      return false;
    }
  }

  /** The theme that a mode resolves to right now. */
  function resolve(mode) {
    if (mode === "dark") return "dark";
    if (mode === "light") return "light";
    return prefersDark() ? "dark" : "light";
  }

  /**
   * Paints the theme.
   *
   * The browser bar is told about it too. There are two theme-color meta tags
   * and the browser is free to pick either, so both are given the same value
   * — whichever one it chooses, it is right.
   */
  function apply(mode) {
    var theme = resolve(mode);
    var root = document.documentElement;
    if (root.getAttribute("data-theme") !== theme) {
      root.setAttribute("data-theme", theme);
    }
    var colour = theme === "dark" ? DARK : LIGHT;
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) {
      metas[i].setAttribute("content", colour);
    }
    return theme;
  }

  /** The mode the user chose, which may be "system". */
  function current() {
    if (window.Store && window.Store.getTheme) return window.Store.getTheme();
    return "system";
  }

  function set(mode) {
    if (window.Store && window.Store.setTheme) window.Store.setTheme(mode);
    return apply(mode);
  }

  // Follow the operating system while the choice is "system".
  if (window.matchMedia) {
    var query = window.matchMedia("(prefers-color-scheme: dark)");
    var onChange = function () {
      if (current() === "system") apply("system");
    };
    if (query.addEventListener) query.addEventListener("change", onChange);
    else if (query.addListener) query.addListener(onChange);
  }

  window.Theme = {
    apply: apply,
    resolve: resolve,
    current: current,
    set: set,
    prefersDark: prefersDark
  };
})();