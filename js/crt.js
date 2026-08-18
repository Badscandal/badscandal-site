/* ============================================================
   BADSCANDAL — CRT footer wordmark (original, no libraries)
   "BADSCANDAL" drawn from live text to a 2D canvas, then put
   through a hand-rolled CRT/VHS pass every frame: scanlines,
   even-row jitter, a drifting slice-tear band, chromatic
   aberration that exists ONLY inside the tear (scaled by the
   local displacement — a global RGB split reads as fake),
   phosphor bloom, and grain quantised to whole seconds so it
   chunks like tape, not 60fps hiss. Runs at ~24fps and pauses
   off-screen. Monochrome discipline: the split fringe in the
   tear is the only colour that ever appears.
   Fallbacks: no canvas / no 2D / reduced motion -> static <h2>.
   ============================================================ */
(function () {
  "use strict";

  var canvas = document.getElementById("crt-canvas");
  if (!canvas) return;
  var mount = canvas.parentElement;
  var fallback = mount ? mount.querySelector(".crt-fallback") : null;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var FONT_TAIL = 'px "Archivo", "Archivo Black", Arial, sans-serif';

  function useFallback() {
    canvas.style.display = "none";
    if (fallback) fallback.hidden = false;
  }
  if (reduced) { useFallback(); return; }

  var ctx = canvas.getContext("2d");
  if (!ctx) { useFallback(); return; }

  /* ------------------------------------------------------------------
     >>> TUNE HERE <<<
     ------------------------------------------------------------------ */
  var FPS = 24;          /* the whole point — do not run this at 60      */
  var JITTER = 1.2;      /* even-row horizontal shiver, CSS px           */
  var TEAR_MAX = 14;     /* peak sideways slice displacement, CSS px     */
  var TEAR_BAND = 22;    /* tear band half-height, CSS px                */
  var TEAR_PERIOD = 6.5; /* seconds for the band to drift down once      */
  var CA_SPLIT = 0.5;    /* RGB fringe as a fraction of local tear       */
  var BLOOM_ALPHA = 0.38;/* phosphor glow strength                       */
  var GRAIN_ALPHA = 0.06;/* tape noise strength                          */

  var ROW = 2;           /* device px per rendered scanline row          */
  var WORD = "BADSCANDAL";
  var PAPER = "#F2F2F2"; /* --paper */

  function makeCanvas(w, h) {
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }

  /* Archivo wdth 125: the canvas font shorthand only takes font-stretch
     KEYWORDS, and "expanded" is exactly 125% — same face the wordmark
     uses in CSS via font-variation-settings. Set the plain weight first
     so an engine that rejects the stretch form still lands on Archivo. */
  function setWordFont(c, px) {
    c.font = "900 " + px + FONT_TAIL;
    c.font = "900 expanded " + px + FONT_TAIL;
  }

  var W = 0, H = 0;
  var textC = makeCanvas(2, 2), textX = textC.getContext("2d");
  var bloomC = makeCanvas(2, 2), bloomX = bloomC.getContext("2d");
  var chanC = [makeCanvas(2, 2), makeCanvas(2, 2), makeCanvas(2, 2)];
  var scanPat = null;

  /* crisp glyph layer + its derivatives (bloom, channel plates) -------- */
  function renderText() {
    if (!W || !H) return;
    var c = textX;
    c.clearRect(0, 0, W, H);
    c.fillStyle = PAPER;
    c.textAlign = "center";
    c.textBaseline = "middle";
    var probe = 100;
    setWordFont(c, probe);
    var w100 = c.measureText(WORD).width || 1;
    var fs = Math.floor(probe * (W * 0.92) / w100);
    fs = Math.min(fs, Math.floor(H * 0.82));
    setWordFont(c, fs);
    c.fillText(WORD, W / 2, H / 2 + fs * 0.03);

    /* phosphor bloom: downsample 1/8 then upsample — the two bilinear
       passes are a cheap gaussian, no ctx.filter dependency */
    var sw = Math.max(2, Math.round(W / 8));
    var sh = Math.max(2, Math.round(H / 8));
    var small = makeCanvas(sw, sh);
    var sx = small.getContext("2d");
    sx.drawImage(textC, 0, 0, sw, sh);
    bloomX.clearRect(0, 0, W, H);
    bloomX.imageSmoothingEnabled = true;
    bloomX.drawImage(small, 0, 0, W, H);

    /* channel plates: paper split into pure R/G/B at 242 each, so where
       the three land aligned under "lighter" they sum back to --paper
       and NO colour survives — colour only exists where the tear
       separates them */
    var fills = ["rgb(242,0,0)", "rgb(0,242,0)", "rgb(0,0,242)"];
    for (var i = 0; i < 3; i++) {
      var ch = chanC[i].getContext("2d");
      ch.clearRect(0, 0, W, H);
      ch.globalCompositeOperation = "source-over";
      ch.drawImage(textC, 0, 0);
      ch.globalCompositeOperation = "source-in";
      ch.fillStyle = fills[i];
      ch.fillRect(0, 0, W, H);
      ch.globalCompositeOperation = "source-over";
    }
  }

  /* grain: regenerated only when the seed (whole seconds) ticks over,
     the reference shader's rand(uv + floor(time)/20.) cadence — holding
     each noise field for a full second is what makes it read as tape */
  var GRAIN_SIZE = 96;
  var grainC = makeCanvas(GRAIN_SIZE, GRAIN_SIZE);
  var grainSeed = -1;
  function renderGrain(seed) {
    var g = grainC.getContext("2d");
    var img = g.createImageData(GRAIN_SIZE, GRAIN_SIZE);
    var d = img.data;
    var s = (seed * 747796405 + 2891336453) | 0;
    for (var i = 0; i < d.length; i += 4) {
      s = (s * 1664525 + 1013904223) | 0;
      var v = (s >>> 24);
      d[i] = v; d[i + 1] = v; d[i + 2] = v;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  function resize() {
    var r = canvas.getBoundingClientRect();
    W = Math.max(2, Math.round(r.width * DPR));
    H = Math.max(2, Math.round(r.height * DPR));
    canvas.width = W; canvas.height = H;
    textC.width = W; textC.height = H;
    bloomC.width = W; bloomC.height = H;
    for (var i = 0; i < 3; i++) { chanC[i].width = W; chanC[i].height = H; }

    /* scanlines: 2px dark bars every 4px, device space */
    var tile = makeCanvas(1, 4);
    var tc = tile.getContext("2d");
    tc.fillStyle = "rgba(0,0,0,0.1)";
    tc.fillRect(0, 0, 1, 2);
    scanPat = ctx.createPattern(tile, "repeat");

    renderText();
  }

  function frame(now) {
    var t = now / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);

    /* tear band centre drifts top-to-bottom over TEAR_PERIOD seconds,
       entering and leaving fully off-canvas; its amplitude breathes on
       an unrelated period so successive passes tear differently */
    var band = TEAR_BAND * DPR;
    var span = H + band * 6;
    var bandY = ((t % TEAR_PERIOD) / TEAR_PERIOD) * span - band * 3;
    var amp = TEAR_MAX * DPR * Math.sin(t * 0.7);

    var jit = JITTER * DPR;
    for (var i = 0, y = 0; y < H; i++, y += ROW) {
      var dy = (y + ROW * 0.5 - bandY) / band;
      var tear = amp * Math.exp(-dy * dy);
      var dx = tear;
      if ((i & 1) === 0) dx += (Math.random() - 0.5) * jit;

      if (Math.abs(tear) > 0.75) {
        /* inside the tear: the three plates land offset by a fringe
           PROPORTIONAL to the local displacement — this is the entire
           trick; anywhere else they'd re-sum to grey anyway, so the
           plain grey layer is drawn instead and stays colour-free */
        var split = tear * CA_SPLIT;
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(chanC[0], 0, y, W, ROW, dx + split, y, W, ROW);
        ctx.drawImage(chanC[1], 0, y, W, ROW, dx, y, W, ROW);
        ctx.drawImage(chanC[2], 0, y, W, ROW, dx - split, y, W, ROW);
        ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.drawImage(textC, 0, y, W, ROW, dx, y, W, ROW);
      }
    }

    /* phosphor bloom, additive */
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = BLOOM_ALPHA;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bloomC, 0, 0);

    /* grain + scanlines ride ON the glyphs (source-atop), never on the
       transparent ground — the section behind stays untouched */
    var seed = Math.floor(t);
    if (seed !== grainSeed) { grainSeed = seed; renderGrain(seed); }
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = GRAIN_ALPHA;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(grainC, 0, 0, GRAIN_SIZE, GRAIN_SIZE, 0, 0, W, H);

    ctx.globalAlpha = 1;
    ctx.fillStyle = scanPat;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }

  /* ~24fps loop: setTimeout throttle inside the rAF chain, so frames
     still align to the compositor but only fire at tape cadence */
  var visible = true, running = false;
  function tick(now) {
    if (!visible) { running = false; return; }
    frame(now || 0);
    setTimeout(function () { requestAnimationFrame(tick); }, 1000 / FPS);
  }
  function start() {
    if (running) return;
    running = true;
    requestAnimationFrame(tick);
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible) start();
    }).observe(canvas);
  }

  var rT;
  window.addEventListener("resize", function () {
    clearTimeout(rT); rT = setTimeout(resize, 160);
  });

  try {
    resize();
    start();
    /* Archivo arrives late: rasterising before it loads bakes in a
       fallback face, so re-render the glyph layer once fonts settle */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { renderText(); });
    }
    if (document.fonts && document.fonts.load) {
      document.fonts.load('900 100px "Archivo"').then(function () { renderText(); }).catch(function () {});
    }
  } catch (e) { useFallback(); }
})();
