/* Hero figure: a Kalman filter tracking a hidden state through a regime change.
   The hidden state x_t mean-reverts around a level (an AR(1) process); we only
   see y_t = x_t + noise. At t = 120 the level drops and the volatility more than triples,
   with nothing in the data to announce it. The filter assumes a calm local-level
   model and widens its uncertainty when its own forecast errors grow larger than
   it expects (innovation-based adaptation), then re-learns.
   The data come from a fixed seed, so every visitor sees the same picture. */
(function () {
  "use strict";
  var canvas = document.getElementById("kf-canvas");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isStatic = canvas.hasAttribute("data-static");

  // ---- deterministic data -------------------------------------------------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rand = mulberry32(7);
  function gauss() {
    var u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Hidden state: mean-reverting around a level. At CHANGE the level drops and
  // volatility rises (a new regime), and nothing in the data announces it.
  var N = 200, CHANGE = 120;
  var OBS_SD = 0.32, PHI = 0.92;
  var MU_A = 0.5, SD_A = 0.07, MU_B = -1.0, SD_B = 0.24;
  var truth = [], obs = [];
  var s = MU_A;
  for (var t = 0; t < N; t++) {
    var b = t >= CHANGE;
    var mu = b ? MU_B : MU_A, sd = b ? SD_B : SD_A;
    s = mu + PHI * (s - mu) + sd * gauss();
    truth.push(s);
    obs.push(s + OBS_SD * gauss());
  }

  // ---- adaptive Kalman filter (local level) ----------------------------------
  // The filter assumes a calm random walk. When its own forecast errors grow
  // larger than it expects, it inflates its process noise and so its band.
  var r = OBS_SD * OBS_SD, q0 = 0.004;
  var m = obs[0], P = r, ratio = 1, lambda = 0.9;
  var est = [], lo = [], hi = [];
  for (var k = 0; k < N; k++) {
    var q = q0 * Math.pow(Math.max(1, ratio), 4);
    var Pp = P + q;
    var S = Pp + r;
    var nu = obs[k] - m;
    ratio = lambda * ratio + (1 - lambda) * (nu * nu) / S;
    var K = Pp / S;
    m = m + K * nu;
    P = (1 - K) * Pp;
    var half = 1.96 * Math.sqrt(P);
    est.push(m); lo.push(m - half); hi.push(m + half);
  }

  var yMin = Infinity, yMax = -Infinity;
  for (var i = 0; i < N; i++) {
    yMin = Math.min(yMin, obs[i], lo[i], truth[i]);
    yMax = Math.max(yMax, obs[i], hi[i], truth[i]);
  }
  var pad = (yMax - yMin) * 0.08;
  yMin -= pad; yMax += pad;

  // ---- drawing --------------------------------------------------------------
  var progress = isStatic || reduceMotion ? N : 0;
  var raf = null, startTime = 0, DURATION = 3800;
  var W = 0, H = 0, dpr = 1;

  function css(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    draw();
  }

  function X(t) { var l = 6, rr = 8; return l + (t / (N - 1)) * (W - l - rr); }
  function Y(v) { var top = 22, bot = 10; return top + (1 - (v - yMin) / (yMax - yMin)) * (H - top - bot); }

  function draw() {
    if (!W || !H) return;
    var col = {
      accent: css("--accent", "#1f4fa3"),
      band: css("--fig-band", "rgba(31,79,163,.14)"),
      obs: css("--fig-obs", "rgba(70,78,95,.55)"),
      truth: css("--fig-truth", "rgba(70,78,95,.55)"),
      regime: css("--fig-regime", "rgba(214,138,46,.10)"),
      regimeInk: css("--fig-regime-ink", "#a35f17"),
      rule: css("--rule", "#e3e0d8")
    };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var n = Math.max(1, Math.min(N, Math.floor(progress)));

    // regime shading (appears once the animation reaches the change)
    if (n > CHANGE) {
      var x0 = X(CHANGE);
      ctx.fillStyle = col.regime;
      ctx.fillRect(x0, 0, X(n - 1) - x0, H);
      ctx.strokeStyle = col.regimeInk;
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(x0 + 0.5, 0); ctx.lineTo(x0 + 0.5, H); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = col.regimeInk;
      ctx.font = "600 10.5px Inter, system-ui, sans-serif";
      ctx.textBaseline = "top";
      ctx.fillText("REGIME CHANGE", x0 + 7, 6);
    }

    // baseline rule
    ctx.strokeStyle = col.rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H - 0.5); ctx.lineTo(W, H - 0.5); ctx.stroke();

    // uncertainty band
    ctx.fillStyle = col.band;
    ctx.beginPath();
    for (var a = 0; a < n; a++) { var px = X(a), py = Y(hi[a]); a ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    for (var c = n - 1; c >= 0; c--) ctx.lineTo(X(c), Y(lo[c]));
    ctx.closePath(); ctx.fill();

    // true hidden state (dashed)
    ctx.strokeStyle = col.truth; ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (var d = 0; d < n; d++) { var tx = X(d), ty = Y(truth[d]); d ? ctx.lineTo(tx, ty) : ctx.moveTo(tx, ty); }
    ctx.stroke(); ctx.setLineDash([]);

    // observations
    ctx.fillStyle = col.obs;
    var rad = W < 420 ? 1.5 : 1.8;
    for (var e = 0; e < n; e++) { ctx.beginPath(); ctx.arc(X(e), Y(obs[e]), rad, 0, Math.PI * 2); ctx.fill(); }

    // filtered estimate
    ctx.strokeStyle = col.accent; ctx.lineWidth = 2.1; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    for (var f = 0; f < n; f++) { var ex = X(f), ey = Y(est[f]); f ? ctx.lineTo(ex, ey) : ctx.moveTo(ex, ey); }
    ctx.stroke();

    // leading point
    if (n < N) {
      ctx.fillStyle = col.accent;
      ctx.beginPath(); ctx.arc(X(n - 1), Y(est[n - 1]), 3.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  function step(ts) {
    if (!startTime) startTime = ts;
    var p = Math.min(1, (ts - startTime) / DURATION);
    var eased = 1 - Math.pow(1 - p, 2.2);
    progress = 1 + eased * (N - 1);
    draw();
    if (p < 1) raf = requestAnimationFrame(step); else raf = null;
  }

  function play() {
    if (reduceMotion || isStatic) { progress = N; draw(); return; }
    if (raf) cancelAnimationFrame(raf);
    startTime = 0; progress = 1;
    raf = requestAnimationFrame(step);
  }

  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener("resize", resize);
  resize();

  var replay = document.getElementById("kf-replay");
  if (replay) {
    if (reduceMotion) replay.hidden = true;
    replay.addEventListener("click", play);
  }
  document.addEventListener("themechange", draw);
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", draw);
  }

  if (isStatic || reduceMotion) { draw(); return; }
  if ("IntersectionObserver" in window) {
    var started = false;
    new IntersectionObserver(function (entries, obs2) {
      entries.forEach(function (en) {
        if (en.isIntersecting && !started) { started = true; play(); obs2.disconnect(); }
      });
    }, { threshold: 0.35 }).observe(canvas);
  } else {
    play();
  }
})();
