/* ============================================================
   BADSCANDAL — CRT wordmark (original, no libraries)
   "BADSCANDAL" drawn from live text to a 2D canvas, then put
   through a hand-rolled CRT/VHS pass every frame: scanlines,
   chromatic aberration that breathes, phosphor bloom, and grain
   quantised to whole seconds so it chunks like tape, not 60fps
   hiss. Runs at ~24fps and pauses off-screen. Monochrome
   discipline: the split fringe is the only colour that ever
   appears.

   MULTI-INSTANCE: every `.crt` block on the page gets its own
   canvas pipeline (own sizing, own visibility, own fallback),
   but ALL instances are driven from ONE ~24fps loop — two rAF
   chains for the same treatment would just burn battery.
   Markup pattern per instance:
     <div class="crt"><canvas></canvas>
       <h2 class="crt-fallback" hidden>BADSCANDAL</h2></div>
   (the hero instance uses <h1>; any heading level works).
   Fallbacks: no canvas / no 2D / reduced motion -> static text.
   ============================================================ */
(function () {
  "use strict";

  var mounts = document.querySelectorAll(".crt");
  if (!mounts.length) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var FONT_TAIL = 'px "Archivo", "Archivo Black", Arial, sans-serif';

  /* ------------------------------------------------------------------
     >>> TUNE HERE <<<
     ------------------------------------------------------------------ */
  var FPS = 40;          /* render cadence — smooth, but not 60 (cost)    */
  var GRAIN_FPS = 14;    /* how often the noise field jumps               */
  var CA_MIN = 0.7;      /* RGB fringe at its calmest, CSS px            */
  var CA_MAX = 1.8;      /* RGB fringe at its widest, CSS px             */
  var CA_PERIOD = 9;     /* seconds for the fringe to breathe once       */
  var BLOOM_ALPHA = 0.38;/* phosphor glow strength                       */
  var GRAIN_ALPHA = 0.07;/* tape noise strength                          */

  /* Motion and texture are throttled SEPARATELY, and that split is the
     whole trick: the fringe breathes at FPS so it reads as a live signal,
     while the grain jumps at GRAIN_FPS so it reads as tape. An earlier
     version pinned BOTH to 24fps and reseeded the noise only once per
     second, which is what made it look like a stuttering GIF.

     Cost note, learned the hard way: this ran at an unthrottled 60fps
     with a pattern fillRect for the grain and it FROZE the renderer —
     ~1.6M device px across two canvases, several passes each. Grain is
     now generated ONCE and animated by offset (drawImage tiles, which
     are cheap), and the render is capped by skipping rAF frames rather
     than by a setTimeout, so frames still align to the compositor. */

  /* ------------------------------------------------------------------
     NO TEAR. NO SLICE DISPLACEMENT. This is deliberate and permanent.

     The first version walked the canvas row by row and gave each row its
     own horizontal offset, driven by a drifting "tear band". Whenever
     that band was wide relative to the cap height, every row inside a
     letter shifted by a different amount and the glyph interiors turned
     into a venetian-blind scramble — the wordmark stopped being legible
     and read as a broken TV rather than a brand.

     The whole layer is now drawn ONCE per channel, so a letterform can
     never be sliced apart. The treatment is scanlines + phosphor bloom +
     tape grain + a gentle chromatic fringe. If you are tempted to add a
     roll bar, a sync tear or per-row jitter back in: don't. It was
     removed on purpose, and it is the one thing that made this look bad.
     ------------------------------------------------------------------ */

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

  /* grain: regenerated only when the seed (whole seconds) ticks over,
     the reference shader's rand(uv + floor(time)/20.) cadence — holding
     each noise field for a full second is what makes it read as tape.
     One plate is SHARED by every instance: same seed, same cadence. */
  /* Grain is a per-instance plate slightly LARGER than its canvas, built
     once per resize and then sampled through a moving window — so every
     frame is a single 1:1 drawImage, never a tile loop and never a
     pattern fill.

     Both of those were tried and both saturated the main thread: tiling
     a 512px plate across a 2304px canvas is ~12 blits of 262k px per
     instance per frame (~250M px/sec across two canvases), and a pattern
     fillRect over the same area is worse. One windowed blit costs the
     same as the original stretched draw, but at 1:1 so it actually looks
     like grain. */
  var GRAIN_PAD = 192;   /* how far the sample window can travel         */
  var grainSeed = -1;
  var grainOX = 0, grainOY = 0;

  function buildGrain(inst) {
    var gw = inst.W + GRAIN_PAD, gh = inst.H + GRAIN_PAD;
    inst.grainC = makeCanvas(gw, gh);
    var g = inst.grainC.getContext("2d");
    var img = g.createImageData(gw, gh);
    var d = img.data;
    var s = 1013904223;
    for (var i = 0; i < d.length; i += 4) {
      s = (s * 1664525 + 1013904223) | 0;
      var v = (s >>> 24);
      d[i] = v; d[i + 1] = v; d[i + 2] = v;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  /* crisp glyph layer + its derivatives (bloom, channel plates) -------- */
  function renderText(inst) {
    if (!inst.W || !inst.H) return;
    var W = inst.W, H = inst.H;
    var c = inst.textX;
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
    sx.drawImage(inst.textC, 0, 0, sw, sh);
    inst.bloomX.clearRect(0, 0, W, H);
    inst.bloomX.imageSmoothingEnabled = true;
    inst.bloomX.drawImage(small, 0, 0, W, H);

    /* channel plates: paper split into pure R/G/B at 242 each, so where
       the three land aligned under "lighter" they sum back to --paper
       and NO colour survives — colour only exists where the breathing
       split separates them */
    var fills = ["rgb(242,0,0)", "rgb(0,242,0)", "rgb(0,0,242)"];
    for (var i = 0; i < 3; i++) {
      var ch = inst.chanC[i].getContext("2d");
      ch.clearRect(0, 0, W, H);
      ch.globalCompositeOperation = "source-over";
      ch.drawImage(inst.textC, 0, 0);
      ch.globalCompositeOperation = "source-in";
      ch.fillStyle = fills[i];
      ch.fillRect(0, 0, W, H);
      ch.globalCompositeOperation = "source-over";
    }
  }

  function resize(inst) {
    var r = inst.canvas.getBoundingClientRect();
    var W = Math.max(2, Math.round(r.width * DPR));
    var H = Math.max(2, Math.round(r.height * DPR));
    inst.W = W; inst.H = H;
    inst.canvas.width = W; inst.canvas.height = H;
    inst.textC.width = W; inst.textC.height = H;
    inst.bloomC.width = W; inst.bloomC.height = H;
    for (var i = 0; i < 3; i++) { inst.chanC[i].width = W; inst.chanC[i].height = H; }

    /* scanlines: 2px dark bars every 4px, device space */
    var tile = makeCanvas(1, 4);
    var tc = tile.getContext("2d");
    tc.fillStyle = "rgba(0,0,0,0.1)";
    tc.fillRect(0, 0, 1, 2);
    inst.scanPat = inst.ctx.createPattern(tile, "repeat");

    buildGrain(inst);
    renderText(inst);
  }

  function frame(inst, t) {
    var ctx = inst.ctx, W = inst.W, H = inst.H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);

    /* one whole-layer pass per channel. The three plates carry 242 in a
       single channel each, so where they land on top of one another they
       re-sum to --paper and the wordmark reads as clean white; only the
       outer edges, where one plate overhangs the others, keep a colour
       fringe. Letterforms stay exactly intact because every plate is the
       SAME image drawn once — nothing is ever sliced. */
    var split = (CA_MIN + (CA_MAX - CA_MIN) *
                 (0.5 + 0.5 * Math.sin((t / CA_PERIOD) * Math.PI * 2))) * DPR;

    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(inst.chanC[0], split, 0);
    ctx.drawImage(inst.chanC[1], 0, 0);
    ctx.drawImage(inst.chanC[2], -split, 0);
    ctx.globalCompositeOperation = "source-over";

    /* phosphor bloom, additive */
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = BLOOM_ALPHA;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(inst.bloomC, 0, 0);

    /* grain + scanlines ride ON the glyphs (source-atop), never on the
       transparent ground — the section behind stays untouched.

       TILED 1:1, NEVER STRETCHED. Drawing the 160px plate scaled up to
       the full canvas (which an earlier version did) blew each noise
       texel into a ~23x4px block and filled the letterforms with coarse
       grey bricks — it read as a broken TV, not as film grain. A repeat
       pattern keeps one noise texel to one device pixel, which is the
       only size at which grain looks like grain. */
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = GRAIN_ALPHA;
    ctx.imageSmoothingEnabled = false;
    if (inst.grainC) {
      ctx.drawImage(inst.grainC, grainOX, grainOY, W, H, 0, 0, W, H);
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = inst.scanPat;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }

  /* ---------- build one instance per .crt block ------------------------ */
  function initInstance(mount) {
    var canvas = mount.querySelector("canvas");
    var fallback = mount.querySelector(".crt-fallback");
    function useFallback() {
      if (canvas) canvas.style.display = "none";
      if (fallback) fallback.hidden = false;
    }
    if (!canvas || reduced) { useFallback(); return null; }
    var ctx = canvas.getContext("2d");
    if (!ctx) { useFallback(); return null; }
    return {
      canvas: canvas,
      ctx: ctx,
      useFallback: useFallback,
      visible: true,   /* assume on-screen until the observer says otherwise */
      W: 0, H: 0,
      textC: makeCanvas(2, 2),
      bloomC: makeCanvas(2, 2),
      chanC: [makeCanvas(2, 2), makeCanvas(2, 2), makeCanvas(2, 2)],
      textX: null, bloomX: null,
      scanPat: null,
      grainC: null
    };
  }

  var instances = [];
  Array.prototype.forEach.call(mounts, function (mount) {
    var inst = initInstance(mount);
    if (!inst) return;
    inst.textX = inst.textC.getContext("2d");
    inst.bloomX = inst.bloomC.getContext("2d");
    instances.push(inst);
  });
  if (!instances.length) return;

  function dropInstance(inst) {
    var i = instances.indexOf(inst);
    if (i > -1) instances.splice(i, 1);
    inst.useFallback();
  }

  function anyVisible() {
    for (var i = 0; i < instances.length; i++) {
      if (instances[i].visible) return true;
    }
    return false;
  }

  /* full-rAF loop shared by every instance — only the grain is throttled.
     The noise field is reseeded GRAIN_FPS times a second and the pattern
     rebuilt for each instance (a CanvasPattern does not reliably track
     later edits to its source canvas, so it is recreated, not reused). */
  var running = false;
  var lastDraw = -1;
  function tick(now) {
    if (!anyVisible() || !instances.length) { running = false; return; }
    var t = (now || 0) / 1000;

    /* cap by SKIPPING rAF frames — never by setTimeout, which detaches
       the work from the compositor and reads as stutter */
    if (lastDraw < 0 || t - lastDraw >= 1 / FPS) {
      lastDraw = t;
      var seed = Math.floor(t * GRAIN_FPS);
      if (seed !== grainSeed) {
        grainSeed = seed;
        grainOX = (Math.random() * GRAIN_PAD) | 0;
        grainOY = (Math.random() * GRAIN_PAD) | 0;
      }
      for (var i = 0; i < instances.length; i++) {
        if (instances[i].visible) frame(instances[i], t);
      }
    }
    requestAnimationFrame(tick);
  }
  function start() {
    if (running || !anyVisible()) return;
    running = true;
    requestAnimationFrame(tick);
  }

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      for (var e = 0; e < es.length; e++) {
        for (var i = 0; i < instances.length; i++) {
          if (instances[i].canvas === es[e].target) {
            instances[i].visible = es[e].isIntersecting;
          }
        }
      }
      start();
    });
    instances.forEach(function (inst) { io.observe(inst.canvas); });
  }

  var rT;
  window.addEventListener("resize", function () {
    clearTimeout(rT);
    rT = setTimeout(function () {
      instances.forEach(function (inst) { resize(inst); });
      /* setting canvas.width resets the 2D context, so force the grain
         patterns to be rebuilt on the next tick */
      grainSeed = -1;
    }, 160);
  });

  instances.slice().forEach(function (inst) {
    try {
      resize(inst);
    } catch (e) {
      dropInstance(inst);
    }
  });
  start();

  /* Archivo arrives late: rasterising before it loads bakes in a
     fallback face, so re-render the glyph layers once fonts settle */
  function rerenderAll() {
    instances.forEach(function (inst) { renderText(inst); });
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(rerenderAll);
  }
  if (document.fonts && document.fonts.load) {
    document.fonts.load('900 100px "Archivo"').then(rerenderAll).catch(function () {});
  }
})();
