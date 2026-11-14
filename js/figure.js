/* Figure 1: a filter tracking a hidden quantity through changes of regime.
   Everything is simulated in the browser.

   Model. The hidden quantity x mean-reverts around the level of the current
   regime, x[t] = mu + 0.92 (x[t-1] - mu) + sd * noise, and we only observe
   y[t] = x[t] + 0.32 * noise. Three regimes: calm (mu 0.5, sd 0.07),
   volatile (mu -1.0, sd 0.20) and high (mu 1.8, sd 0.12). A shift moves the
   level part of the way at once and the rest through mean reversion.

   White line and band: a local-level Kalman filter that inflates its process
   noise when its own forecast errors run larger than it expects, so it widens
   its 95% band and re-learns after a change.
   Standard filter (optional): the same filter without that adaptation.
   Detector: a two-sided CUSUM (k = 0.5, h = 6) on the standardized forecast
   errors of a filter that knows how the current regime behaves. After a flag it
   adopts the new regime's model; that identification step is idealized here.

   The first 200 observations come from a fixed seed, so every visitor sees the
   same opening. */
(function () {
  "use strict";

  var fig = document.querySelector("[data-kf]");
  if (!fig) return;
  var canvas = fig.querySelector("canvas");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");

  var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var isStatic = fig.hasAttribute("data-static");
  var statusEl = fig.querySelector("[data-status]");
  var shiftBtn = fig.querySelector('[data-action="shift"]');
  var compareBtn = fig.querySelector('[data-action="compare"]');
  var resetBtn = fig.querySelector('[data-action="reset"]');
  var readout = fig.querySelector(".readout");
  var stdRow = readout ? readout.querySelector("[data-std]") : null;
  function field(k) { return readout ? readout.querySelector('[data-k="' + k + '"]') : null; }
  var out = { t: field("t"), y: field("y"), m: field("m"), x: field("x"), s: field("s") };

  // ---- randomness ---------------------------------------------------------------
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

  // ---- model ----------------------------------------------------------------------
  var OBS_SD = 0.32, PHI = 0.92, R = OBS_SD * OBS_SD;
  var REGIMES = [
    { mu: 0.5, sd: 0.07 },   // calm
    { mu: -1.0, sd: 0.2 },   // volatile
    { mu: 1.8, sd: 0.12 }    // high
  ];
  var JUMP = 0.35;                       // share of a level change that happens at once
  var Q0 = 0.004, LAMBDA = 0.9;          // filter process noise; memory of forecast errors
  var CUSUM_K = 0.5, CUSUM_H = 6;        // detector allowance and threshold
  var WIN = 200;                         // observations on screen

  var S;                                 // simulation state
  var offset = 0;                        // observations dropped from memory so far
  var silent = false;                    // no status messages while building the story

  function fresh(seed) {
    rand = mulberry32(seed);
    offset = 0;
    S = {
      regime: 0, x: REGIMES[0].mu,
      truth: [], obs: [], est: [], lo: [], hi: [], std: [],
      ad: { m: null, P: R, ratio: 1 },
      sf: { m: null, P: R },
      det: { r: 0, m: REGIMES[0].mu, P: REGIMES[0].sd * REGIMES[0].sd / (1 - PHI * PHI) },
      gp: 0, gn: 0,
      events: [],                        // {kind: "change" | "flag" | "false", t, delay}
      pending: null                      // index of a change not yet flagged
    };
  }

  function step() {
    var r = REGIMES[S.regime];
    S.x = r.mu + PHI * (S.x - r.mu) + r.sd * gauss();
    var y = S.x + OBS_SD * gauss();
    var t = S.obs.length;
    S.truth.push(S.x); S.obs.push(y);

    // adaptive filter
    var A = S.ad;
    if (A.m === null) A.m = y;
    var q = Q0 * Math.pow(Math.max(1, A.ratio), 4);
    var Pp = A.P + q, Sv = Pp + R, nu = y - A.m;
    A.ratio = LAMBDA * A.ratio + (1 - LAMBDA) * nu * nu / Sv;
    var K = Pp / Sv;
    A.m += K * nu; A.P = (1 - K) * Pp;
    var half = 1.96 * Math.sqrt(A.P);
    S.est.push(A.m); S.lo.push(A.m - half); S.hi.push(A.m + half);

    // standard filter
    var B = S.sf;
    if (B.m === null) B.m = y;
    var Pp2 = B.P + Q0, K2 = Pp2 / (Pp2 + R);
    B.m += K2 * (y - B.m); B.P = (1 - K2) * Pp2;
    S.std.push(B.m);

    // detector
    var D = S.det, M = REGIMES[D.r];
    var pred = M.mu + PHI * (D.m - M.mu);
    var Pd = PHI * PHI * D.P + M.sd * M.sd, Sd = Pd + R, e = y - pred, Kd = Pd / Sd;
    D.m = pred + Kd * e; D.P = (1 - Kd) * Pd;
    var z = e / Math.sqrt(Sd);
    S.gp = Math.max(0, S.gp + z - CUSUM_K);
    S.gn = Math.max(0, S.gn - z - CUSUM_K);
    if (S.gp > CUSUM_H || S.gn > CUSUM_H) {
      S.gp = S.gn = 0;
      if (S.pending !== null) {
        var delay = t - S.pending;
        S.events.push({ kind: "flag", t: t, delay: delay });
        S.pending = null;
        onFlag(delay);
      } else {
        S.events.push({ kind: "false", t: t });
        onFalseAlarm(t);
      }
      D.r = S.regime; D.m = y; D.P = R;
    }
  }

  function shiftTo(next) {
    var t = S.obs.length;
    S.x += JUMP * (REGIMES[next].mu - REGIMES[S.regime].mu);
    S.regime = next;
    S.pending = t;
    S.events.push({ kind: "change", t: t });
  }

  function trim() {                       // keep memory bounded on long visits
    var cut = S.obs.length - 1200;
    if (cut <= 0) return;
    ["truth", "obs", "est", "lo", "hi", "std"].forEach(function (k) { S[k] = S[k].slice(cut); });
    S.events = S.events.filter(function (ev) { return ev.t >= cut; }).map(function (ev) {
      return { kind: ev.kind, t: ev.t - cut, delay: ev.delay };
    });
    if (S.pending !== null) S.pending = Math.max(0, S.pending - cut);
    if (current) current.t -= cut;
    offset += cut;
  }

  // ---- the opening story ------------------------------------------------------------
  var STORY_CHANGE = 120;
  var storyFlag = null;
  function buildStory() {
    fresh(7);
    storyFlag = null;
    silent = true;
    for (var i = 0; i < WIN; i++) {
      if (i === STORY_CHANGE) shiftTo(1);
      step();
    }
    silent = false;
    S.events.forEach(function (e) { if (e.kind === "flag" && !storyFlag) storyFlag = e; });
  }

  // ---- status line --------------------------------------------------------------------
  var current = null;                    // the change being watched during a stream
  function say(msg) { if (statusEl) statusEl.textContent = msg; }
  function obsWord(n) { return n === 1 ? "observation" : "observations"; }
  function storyStatus() {
    if (storyFlag) say("The regime changed at observation " + STORY_CHANGE + ". The detector flagged it " + storyFlag.delay + " " + obsWord(storyFlag.delay) + " later.");
  }
  function onFlag(delay) {
    if (silent || !current) return;
    current.flagged = true;
    say("The regime shifted at observation " + (current.t + offset) + ". The detector flagged it " + delay + " " + obsWord(delay) + " later.");
  }
  function onFalseAlarm(t) {
    if (silent) return;
    say("False alarm at observation " + (t + offset) + ": the detector reacted to noise.");
  }

  // ---- drawing ------------------------------------------------------------------------
  var W = 0, H = 0, dpr = 1;
  var reveal = WIN;                      // how much of the opening is drawn
  var viewEnd = WIN - 1;                 // index at the right edge, fractional while streaming
  var yMin = 0, yMax = 1, ySet = false;
  var hoverX = null;
  var compare = false;
  var animating = false;
  var PAD = { l: 2, r: 10, t: 40, b: 24 };

  function colors() {
    var cs = getComputedStyle(fig);
    function v(n, f) { var x = cs.getPropertyValue(n); return (x && x.trim()) || f; }
    return {
      ink: v("--fig-ink", "#f2f6fa"),
      faint: v("--fig-faint", "rgba(242,246,250,.62)"),
      rule: v("--fig-rule", "rgba(242,246,250,.2)"),
      obs: v("--fig-obs", "rgba(242,246,250,.55)"),
      truth: v("--fig-truth", "rgba(242,246,250,.72)"),
      band: v("--fig-band", "rgba(150,196,242,.24)"),
      bandEdge: v("--fig-band-edge", "rgba(150,196,242,.42)"),
      est: v("--fig-est", "#ffffff"),
      glow: v("--fig-glow", "rgba(255,255,255,.35)"),
      std: v("--fig-std", "#7ee0c3"),
      amber: v("--fig-amber", "#f4b04a"),
      amberFill: v("--fig-amber-fill", "rgba(244,176,74,.1)"),
      font: v("--fig-font", "500 12px sans-serif")
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    draw(false);
  }

  function left() { return viewEnd - (WIN - 1); }
  function X(t) { return PAD.l + ((t - left()) / (WIN - 1)) * (W - PAD.l - PAD.r); }
  function Y(v) { return PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b); }

  function targetRange(i0, i1) {
    var lo = Infinity, hi = -Infinity;
    for (var i = i0; i <= i1; i++) {
      lo = Math.min(lo, S.obs[i], S.lo[i], S.truth[i]);
      hi = Math.max(hi, S.obs[i], S.hi[i], S.truth[i]);
      if (compare) { lo = Math.min(lo, S.std[i]); hi = Math.max(hi, S.std[i]); }
    }
    var pad = (hi - lo) * 0.08 + 0.05;
    return [lo - pad, hi + pad];
  }

  function fmt(v) { return (v < 0 ? "−" : "") + Math.abs(v).toFixed(2); }

  function path(arr, from, to) {
    ctx.beginPath();
    for (var i = from; i <= to; i++) {
      var px = X(i), py = Y(arr[i]);
      if (i === from) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  }

  function draw(ease) {
    if (!W || !H || !S) return;
    var c = colors();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var last = S.obs.length - 1;
    var i0 = Math.max(0, Math.floor(left()));
    var iView = Math.min(last, Math.ceil(viewEnd));
    var cap = reveal < WIN ? Math.max(0, Math.floor(reveal)) : last;
    var a1 = Math.min(iView, cap);
    if (iView < i0) return;

    var tr = targetRange(i0, iView);
    if (!ySet || !ease) { yMin = tr[0]; yMax = tr[1]; ySet = true; }
    else { yMin += (tr[0] - yMin) * 0.12; yMax += (tr[1] - yMax) * 0.12; }

    var top = PAD.t, bottom = H - PAD.b, right = W - PAD.r;

    // time axis
    ctx.strokeStyle = c.rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.l, bottom + 0.5); ctx.lineTo(right, bottom + 0.5); ctx.stroke();
    ctx.fillStyle = c.faint; ctx.font = c.font; ctx.textBaseline = "top"; ctx.textAlign = "center";
    var every = W < 480 ? 50 : 25;
    for (var tk = Math.ceil((left() + offset) / every) * every; tk - offset <= viewEnd; tk += every) {
      var tx = X(tk - offset);
      if (tx < PAD.l + 10 || tx > right - 10) continue;
      ctx.beginPath(); ctx.moveTo(Math.round(tx) + 0.5, bottom); ctx.lineTo(Math.round(tx) + 0.5, bottom + 4); ctx.stroke();
      ctx.fillText(String(tk), tx, bottom + 8);
    }

    // regime boundaries: dashed lines; the current regime is shaded
    var changes = S.events.filter(function (e) { return e.kind === "change" && e.t <= a1; });
    if (changes.length) {
      var lc = changes[changes.length - 1];
      var sx = Math.max(PAD.l, X(lc.t)), ex = X(a1);
      if (ex > sx) { ctx.fillStyle = c.amberFill; ctx.fillRect(sx, top - 12, ex - sx, bottom - top + 12); }
      ctx.strokeStyle = c.amber; ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]);
      changes.forEach(function (ch) {
        var x = Math.round(X(ch.t)) + 0.5;
        if (x < PAD.l || x > right) return;
        ctx.beginPath(); ctx.moveTo(x, top - 12); ctx.lineTo(x, bottom); ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    if (a1 > i0) {
      // 95% band
      ctx.beginPath();
      for (var b = i0; b <= a1; b++) { var bx = X(b), by = Y(S.hi[b]); if (b === i0) ctx.moveTo(bx, by); else ctx.lineTo(bx, by); }
      for (var d = a1; d >= i0; d--) ctx.lineTo(X(d), Y(S.lo[d]));
      ctx.closePath(); ctx.fillStyle = c.band; ctx.fill();
      ctx.strokeStyle = c.bandEdge; ctx.lineWidth = 0.8;
      path(S.hi, i0, a1); ctx.stroke();
      path(S.lo, i0, a1); ctx.stroke();

      // hidden quantity
      ctx.strokeStyle = c.truth; ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]);
      path(S.truth, i0, a1); ctx.stroke(); ctx.setLineDash([]);

      // observations
      ctx.fillStyle = c.obs;
      var rad = W < 480 ? 1.4 : 1.8;
      for (var o = i0; o <= a1; o++) { ctx.beginPath(); ctx.arc(X(o), Y(S.obs[o]), rad, 0, Math.PI * 2); ctx.fill(); }

      // standard filter
      if (compare) {
        ctx.strokeStyle = c.std; ctx.lineWidth = 1.8; ctx.setLineDash([2, 3]); ctx.lineJoin = "round";
        path(S.std, i0, a1); ctx.stroke(); ctx.setLineDash([]);
      }

      // the estimate, with a faint glow
      ctx.save();
      ctx.shadowColor = c.glow; ctx.shadowBlur = 10;
      ctx.strokeStyle = c.est; ctx.lineWidth = 2.2; ctx.lineJoin = "round"; ctx.lineCap = "round";
      path(S.est, i0, a1); ctx.stroke();
      ctx.restore();

      if (animating) {
        ctx.fillStyle = c.est;
        ctx.beginPath(); ctx.arc(X(a1), Y(S.est[a1]), 3.4, 0, Math.PI * 2); ctx.fill();
      }
    }

    // detector marks: filled for a flag, hollow for a false alarm
    var latestChange = null, latestMark = null;
    S.events.forEach(function (e) {
      if (e.t > a1 || e.t < i0) return;
      if (e.kind === "change") { latestChange = e; return; }
      latestMark = e;
      var x = Math.round(X(e.t)) + 0.5;
      ctx.strokeStyle = c.amber; ctx.fillStyle = c.amber; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, top - 3); ctx.lineTo(x, top + 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 5, top - 12); ctx.lineTo(x + 5, top - 12); ctx.lineTo(x, top - 4); ctx.closePath();
      if (e.kind === "flag") ctx.fill(); else ctx.stroke();
    });

    // label only the latest change and the latest mark after it
    ctx.font = c.font; ctx.textBaseline = "middle"; ctx.fillStyle = c.amber;
    var row1 = 12, row2 = 12, changeLeft = false;
    if (latestChange) {
      var lx = X(latestChange.t), txt = "Regime change", w = ctx.measureText(txt).width;
      if (lx - 8 - w < PAD.l) { ctx.textAlign = "left"; ctx.fillText(txt, Math.max(PAD.l, lx + 8), row1); changeLeft = true; }
      else { ctx.textAlign = "right"; ctx.fillText(txt, lx - 8, row1); }
    }
    if (latestMark && (!latestChange || latestMark.t >= latestChange.t)) {
      var mx = X(latestMark.t);
      var mt = latestMark.kind === "flag" ? "Flagged after " + latestMark.delay : "False alarm";
      var mw = ctx.measureText(mt).width;
      if (changeLeft) row2 = 12 + 15;
      if (mx + 9 + mw > right) { ctx.textAlign = "right"; ctx.fillText(mt, mx - 9, 12 + 15); }
      else { ctx.textAlign = "left"; ctx.fillText(mt, mx + 9, row2); }
    }

    // crosshair
    var hi = null;
    if (hoverX !== null && a1 >= i0) {
      var tt = Math.round(left() + ((hoverX - PAD.l) / (W - PAD.l - PAD.r)) * (WIN - 1));
      hi = Math.max(i0, Math.min(a1, tt));
      var hx = Math.round(X(hi)) + 0.5;
      ctx.strokeStyle = c.faint; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx, top - 12); ctx.lineTo(hx, bottom); ctx.stroke();
      ctx.strokeStyle = c.ink; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(hx, Y(S.obs[hi]), 3.6, 0, Math.PI * 2); ctx.stroke();
      if (compare) { ctx.fillStyle = c.std; ctx.beginPath(); ctx.arc(hx, Y(S.std[hi]), 3.2, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = c.est;
      ctx.beginPath(); ctx.arc(hx, Y(S.est[hi]), 3.8, 0, Math.PI * 2); ctx.fill();
    }
    updateReadout(hi !== null ? hi : a1);
  }

  function updateReadout(i) {
    if (!readout || i == null || i < 0 || i >= S.obs.length) return;
    if (out.t) out.t.textContent = String(i + offset);
    if (out.y) out.y.textContent = fmt(S.obs[i]);
    if (out.m) out.m.textContent = fmt(S.est[i]) + " ± " + ((S.hi[i] - S.lo[i]) / 2).toFixed(2);
    if (out.x) out.x.textContent = fmt(S.truth[i]);
    if (out.s) out.s.textContent = fmt(S.std[i]);
  }

  // ---- animation -----------------------------------------------------------------------
  var raf = null, mode = null, t0 = 0, streamFrom = 0;
  var STEP_MS = 60, INTRO_MS = 3600;

  function frame(now) {
    if (!t0) t0 = now;
    var el = now - t0;
    if (mode === "intro") {
      var p = Math.min(1, el / INTRO_MS);
      reveal = 1 + (1 - Math.pow(1 - p, 2.2)) * (WIN - 1);
      if (p >= 1) reveal = WIN;
      draw(false);
      if (p >= 1) { finish(); return; }
    } else if (mode === "stream") {
      var want = streamFrom + el / STEP_MS;
      while (S.obs.length - 1 < Math.ceil(want) && !streamDone()) step();
      viewEnd = Math.min(want, S.obs.length - 1);
      draw(true);
      if (streamDone() && viewEnd >= S.obs.length - 1) { finish(); return; }
    }
    raf = requestAnimationFrame(frame);
  }

  function streamDone() {
    var n = S.obs.length - 1 - streamFrom;
    if (n >= 110) return true;
    if (n < 48) return false;
    for (var i = S.events.length - 1; i >= 0; i--) {
      var e = S.events[i];
      if (e.kind === "flag" && current && e.t >= current.t) return S.obs.length - 1 - e.t >= 24;
    }
    return false;
  }

  function setBusy(b) {
    if (shiftBtn) shiftBtn.disabled = b;
    if (resetBtn) resetBtn.disabled = b;
    fig.classList.toggle("is-busy", b);
  }
  function start(m) {
    mode = m; animating = true; t0 = 0;
    if (raf) cancelAnimationFrame(raf);
    setBusy(true);
    raf = requestAnimationFrame(frame);
  }
  function finish() {
    var wasStream = mode === "stream";
    animating = false; raf = null; mode = null;
    if (wasStream) {
      if (current && !current.flagged) say("The regime shifted at observation " + (current.t + offset) + ". The detector has not flagged it yet.");
      trim();
      viewEnd = S.obs.length - 1;
    }
    setBusy(false);
    draw(false);
  }

  function pickNext() {
    var options = [];
    for (var i = 0; i < REGIMES.length; i++) if (i !== S.regime) options.push(i);
    return options[Math.floor(Math.random() * options.length)];
  }

  function doShift() {
    if (animating) return;
    rand = mulberry32((Math.random() * 4294967296) >>> 0);   // new noise after the opening
    shiftTo(pickNext());
    current = { t: S.obs.length, flagged: false };
    say("The regime shifted at observation " + (current.t + offset) + ". Watching for the detector.");
    streamFrom = S.obs.length - 1;
    reveal = WIN;
    if (reduceMotion) {
      while (!streamDone()) step();
      mode = "stream";
      finish();
      return;
    }
    start("stream");
  }

  function doReset() {
    if (animating) return;
    buildStory();
    current = null;
    viewEnd = WIN - 1; ySet = false;
    storyStatus();
    if (reduceMotion) { reveal = WIN; draw(false); return; }
    reveal = 1;
    start("intro");
  }

  // ---- wiring ------------------------------------------------------------------------------
  buildStory();
  storyStatus();

  if (shiftBtn) shiftBtn.addEventListener("click", doShift);
  if (resetBtn) resetBtn.addEventListener("click", doReset);
  if (compareBtn) compareBtn.addEventListener("click", function () {
    compare = !compare;
    compareBtn.setAttribute("aria-pressed", compare ? "true" : "false");
    if (stdRow) stdRow.classList.toggle("off", !compare);
    if (!animating) draw(false);
  });

  function pointer(e) {
    var r = canvas.getBoundingClientRect();
    hoverX = e.clientX - r.left;
    if (!animating) draw(false);
  }
  function unhover() { hoverX = null; if (!animating) draw(false); }
  canvas.addEventListener("pointermove", pointer);
  canvas.addEventListener("pointerdown", pointer);
  canvas.addEventListener("pointerleave", unhover);
  canvas.addEventListener("pointercancel", unhover);

  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener("resize", resize);
  document.addEventListener("themechange", function () { if (!animating) draw(false); });

  if (isStatic || reduceMotion) { reveal = WIN; resize(); return; }
  reveal = 1;
  resize();
  if ("IntersectionObserver" in window) {
    var begun = false;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && !begun) { begun = true; io.disconnect(); start("intro"); }
      });
    }, { threshold: 0.3 });
    io.observe(canvas);
  } else {
    start("intro");
  }
})();
