/* Site behaviours: theme switch, mobile menu, masthead over the blue field,
   current section in the nav, email links, copy address. No dependencies. */
(function () {
  "use strict";
  var root = document.documentElement;
  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // ---- Theme. The inline script in <head> applies a saved choice before paint.
  function systemDark() { return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches); }
  function currentTheme() {
    var t = root.getAttribute("data-theme");
    if (t === "light" || t === "dark") return t;
    return systemDark() ? "dark" : "light";
  }
  function applyTheme(next) {
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) { /* storage unavailable: the choice lasts this visit */ }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "dark" ? "#0b2b48" : "#0e3557");
    document.dispatchEvent(new Event("themechange"));
  }
  var toggle = document.querySelector(".theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function (e) {
      var next = currentTheme() === "dark" ? "light" : "dark";
      if (!document.startViewTransition || reduce) { applyTheme(next); return; }
      var x = e.clientX || window.innerWidth - 40, y = e.clientY || 34;
      var r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      var vt = document.startViewTransition(function () { applyTheme(next); });
      vt.ready.then(function () {
        root.animate(
          { clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + r + "px at " + x + "px " + y + "px)"] },
          { duration: 520, easing: "cubic-bezier(.2,.7,.2,1)", pseudoElement: "::view-transition-new(root)" }
        );
      }).catch(function () {});
    });
  }

  // ---- Masthead: light text over the blue field, solid paper after it.
  var masthead = document.querySelector(".masthead");
  var hero = document.querySelector(".hero");
  if (masthead && hero && "IntersectionObserver" in window) {
    var headH = function () { return masthead.offsetHeight || 68; };
    var heroObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { masthead.classList.toggle("is-solid", !en.isIntersecting); });
    }, { rootMargin: "-" + headH() + "px 0px 0px 0px", threshold: 0 });
    heroObs.observe(hero);
  } else if (masthead) {
    masthead.classList.add("is-solid");
  }

  // ---- Mobile menu
  var menuBtn = document.querySelector(".menu-btn");
  var links = document.querySelector(".nav-links");
  function closeMenu() {
    if (!links || !menuBtn) return;
    links.classList.remove("open");
    masthead && masthead.classList.remove("menu-open");
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.setAttribute("aria-label", "Open menu");
  }
  if (menuBtn && links) {
    menuBtn.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      masthead && masthead.classList.toggle("menu-open", open);
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    links.addEventListener("click", function (e) { if (e.target.closest("a")) closeMenu(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
  }

  // ---- Current section in the nav
  var navAnchors = Array.prototype.slice.call(document.querySelectorAll('.nav-links a[href^="#"]'));
  if ("IntersectionObserver" in window && navAnchors.length) {
    var byId = {};
    navAnchors.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        navAnchors.forEach(function (a) { a.classList.remove("active"); a.removeAttribute("aria-current"); });
        var a = byId[en.target.id];
        if (a) { a.classList.add("active"); a.setAttribute("aria-current", "true"); }
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    Object.keys(byId).forEach(function (id) { var el = document.getElementById(id); if (el) spy.observe(el); });
    var heroEl = document.getElementById("top");
    if (heroEl) new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) navAnchors.forEach(function (a) { a.classList.remove("active"); a.removeAttribute("aria-current"); }); });
    }, { rootMargin: "-40% 0px -55% 0px" }).observe(heroEl);
  }

  // ---- Email: assembled here so the address is not sitting in the HTML for scrapers.
  var address = "";
  document.querySelectorAll("[data-user][data-domain]").forEach(function (el) {
    address = el.getAttribute("data-user") + "@" + el.getAttribute("data-domain");
    if (el.tagName === "A") el.setAttribute("href", "mailto:" + address);
    if (el.hasAttribute("data-show")) el.textContent = address;
  });

  // ---- Copy the address
  var copyBtn = document.querySelector("[data-copy]");
  if (copyBtn && address) {
    var label = copyBtn.textContent;
    var timer = null;
    copyBtn.addEventListener("click", function () {
      function done(ok) {
        copyBtn.textContent = ok ? "Copied" : "Press Ctrl+C to copy";
        copyBtn.setAttribute("data-done", "");
        clearTimeout(timer);
        timer = setTimeout(function () { copyBtn.textContent = label; copyBtn.removeAttribute("data-done"); }, 2000);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(address).then(function () { done(true); }, function () { selectEmail(); done(false); });
      } else { selectEmail(); done(false); }
    });
  }
  function selectEmail() {
    var el = document.querySelector(".email");
    if (!el || !window.getSelection) return;
    var range = document.createRange(); range.selectNodeContents(el);
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }

  // ---- Footer year
  var y = document.getElementById("year");
  if (y) y.textContent = String(new Date().getFullYear());
})();
