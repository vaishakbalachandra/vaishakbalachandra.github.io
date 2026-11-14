/* Small site behaviours: theme toggle, mobile menu, header rule, active nav,
   reveal on scroll, spam-resistant email links. No dependencies. */
(function () {
  "use strict";
  var root = document.documentElement;
  root.classList.add("js");

  // Theme toggle. The early inline script in <head> applies a saved choice before paint.
  function systemDark() { return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; }
  function currentTheme() {
    var t = root.getAttribute("data-theme");
    if (t === "light" || t === "dark") return t;
    return systemDark() ? "dark" : "light";
  }
  var toggle = document.querySelector(".theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) { /* storage unavailable: choice lasts this visit */ }
      var meta = document.querySelector('meta[name="theme-color"]:not([media])');
      if (meta) meta.setAttribute("content", next === "dark" ? "#0d1015" : "#faf9f6");
      document.dispatchEvent(new Event("themechange"));
    });
  }

  // Mobile menu
  var menuBtn = document.querySelector(".menu-btn");
  var links = document.querySelector(".nav-links");
  if (menuBtn && links) {
    menuBtn.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.addEventListener("click", function (e) {
      if (e.target.closest("a")) { links.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }
    });
  }

  // Header rule after scrolling
  var header = document.querySelector(".site-header");
  function onScroll() { if (header) header.classList.toggle("scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Active section in the nav
  var navAnchors = Array.prototype.slice.call(document.querySelectorAll('.nav-links a[href^="#"]'));
  if ("IntersectionObserver" in window && navAnchors.length) {
    var byId = {};
    navAnchors.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && byId[en.target.id]) {
          navAnchors.forEach(function (a) { a.classList.remove("active"); });
          byId[en.target.id].classList.add("active");
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(byId).forEach(function (id) { var el = document.getElementById(id); if (el) spy.observe(el); });
  }

  // Reveal on scroll
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var reveals = document.querySelectorAll(".reveal");
  if (!reduce && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // Email links are assembled here so the address is not sitting in the HTML for scrapers.
  document.querySelectorAll("[data-user][data-domain]").forEach(function (el) {
    var addr = el.getAttribute("data-user") + "@" + el.getAttribute("data-domain");
    if (el.tagName === "A") el.setAttribute("href", "mailto:" + addr);
    if (el.hasAttribute("data-show")) el.textContent = addr;
  });

  // Footer year
  var y = document.getElementById("year");
  if (y) y.textContent = String(new Date().getFullYear());
})();
