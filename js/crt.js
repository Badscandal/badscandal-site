/* ============================================================
   BADSCANDAL — CRT wordmark (original, no libraries)
   "BADSCANDAL" drawn from live text to a 2D canvas, then put
   through a hand-rolled CRT/VHS pass every frame: scanlines,
   phosphor bloom, tape grain, and a refresh bar that occasionally
   sweeps the canvas, dragging a band-local tear + convergence wave
   with it. AT REST the geometry is perfectly still — only grain
   and scanlines move. Renders at ~40fps while the grain jumps at
   ~14fps, and pauses off-screen. Monochrome discipline: the split
   fringe is the only colour that ever appears.

   MULTI-INSTANCE: every `.crt` block on the page gets its own
   canvas pipeline (own sizing, own visibility, own fallback),
   but ALL instances are driven from ONE loop — two rAF chains
   for the same treatment would just burn battery.
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
  /* Read LIVE, never cached. Browser zoom changes devicePixelRatio, and
     an earlier version captured it once at load — after a zoom the
     backing store no longer matched the CSS box, so the browser rescaled
     the canvas and the 1:1 grain got magnified into heavy static that
     filled the letters. Anything measured in device pixels must ask for
     the ratio at the moment it measures. */
  function dpr() { return Math.min(window.devicePixelRatio || 1, 2); }
  var DPR = dpr();
  var FONT_TAIL = 'px "Archivo", "Archivo Black", Arial, sans-serif';

  /* ------------------------------------------------------------------
     >>> TUNE HERE <<<
     ------------------------------------------------------------------ */
  var FPS = 40;          /* render cadence — smooth, but not 60 (cost)    */
  var GRAIN_FPS = 14;    /* how often the noise field jumps               */
  var CA_MIN = 0.7;      /* resting RGB fringe — STATIC, CSS px          */
  var CA_MAX = 3.2;      /* fringe at the crest of a bar pass, CSS px    */
  var WAVE_COLS = 44;    /* slices the wave is sampled across            */
  var WAVE_CYCLES = 1.7; /* wave crests visible across the word at once  */
  var WAVE_TRAVEL = 4.2; /* seconds for one crest to cross the word
                            (the wave only EXISTS during a bar pass)     */
  var SWEEP_PERIOD = 5.5;/* seconds from one bar pass to the next        */
  var SWEEP_TRAVEL = 1.9;/* seconds the bar takes to actually cross —
                            the rest of the period it is parked
                            off-canvas and the picture is at rest        */
  var SWEEP_BAND = 0.30; /* bar height as a fraction of the canvas       */
  var SWEEP_SHADE = 0.12;/* how much the bar DARKENS the glyphs. It used
                            to be a white "lift", which was invisible:
                            the glyphs already sit at ~252/255, so white
                            painted over them changed nothing. A shade
                            is the only luminance cue that can show.    */
  var ROLL_AMP = 4;      /* peak sideways tear INSIDE the bar, CSS px    */
  var ROLL_CYCLES = 1.35;/* tear-wave crests down the canvas at once     */
  var ROLL_SPEED = 5.5;  /* seconds for the tear wave to travel down once*/
  var ROLL_BAND = 6;     /* CEILING on blit-band height, device px. The
                            band height actually used tracks the bar
                            (sweepH/16, min 1) so the gaussian stays
                            finely sampled at the 64px mobile canvas
                            floor, not just at desktop heights.         */
  var SCAN_PERIOD = 3;   /* device px between scanlines (1 dark, rest clear) */
  var SCAN_ALPHA = 0.30; /* scanline darkness                            */
  var SCAN_DRIFT = 11;   /* seconds for the scanlines to crawl one tile  */
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
     THE TEAR IS BAND-LOCAL AND SMOOTH. QUIET EVERYWHERE ELSE.

     The first version walked the canvas row by row and gave each row its
     own RANDOM horizontal offset, driven by a drifting "tear band".
     Every row inside a letter shifted by a different amount and the
     glyph interiors turned into a venetian-blind scramble — the wordmark
     stopped being legible and read as a broken TV rather than a brand.
     A later version swung the whole picture and the RGB split
     continuously, which read as the wordmark waving forever.

     The rules that keep it safe now, each learned from a regression:
     - AT REST the geometry is STILL: no roll, no wave, the R/B split
       parked at exactly CA_MIN. Only grain and scanlines animate.
     - Displacement AND the split swell exist ONLY near the refresh bar:
       both are shaped by a gaussian of distance from the bar centre
       (sigma = half the bar height). An earlier version gated the split
       on the bar's position alone — no y term — so the WHOLE wordmark
       shimmered into colour whenever the bar was anywhere on the
       canvas. The swell is now blended in per row-slice, so rows away
       from the bar keep the untouched resting image, literally.
     - The tear offset is a smooth long-wavelength sine x that gaussian,
       NEVER random per row, capped at ROLL_AMP (~2.5 CSS px). The blit
       band height follows the bar (sweepH/16, capped at ROLL_BAND) so
       the gaussian is finely sampled at EVERY canvas size — at the 64px
       mobile floor the fixed 6px band degenerated into 2-3 slabs
       sliding ~1.8 CSS px against each other. Neighbouring bands now
       differ by at most ~0.4 CSS px, and the visible blit interpolates
       (smoothing ON during a pass — nearest-neighbour snapped every
       offset to whole device px and notched the stems), so that
       difference renders as a slope, not a step.
     - The GREEN plate is always drawn WHOLE (the readable core).
     - R/B column strips keep the overlap + source-over buffer
       composition (the seam fix).
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
    DPR = dpr();
    var W = Math.max(2, Math.round(r.width * DPR));
    var H = Math.max(2, Math.round(r.height * DPR));
    inst.W = W; inst.H = H;
    inst.canvas.width = W; inst.canvas.height = H;
    inst.textC.width = W; inst.textC.height = H;
    inst.bloomC.width = W; inst.bloomC.height = H;
    for (var i = 0; i < 3; i++) { inst.chanC[i].width = W; inst.chanC[i].height = H; }
    if (!inst.waveC) {
      inst.waveC = [makeCanvas(2, 2), makeCanvas(2, 2)];
      inst.waveX = [inst.waveC[0].getContext("2d"),
                    inst.waveC[1].getContext("2d")];
    }
    for (i = 0; i < 2; i++) { inst.waveC[i].width = W; inst.waveC[i].height = H; }
    if (!inst.compC) {
      inst.compC = makeCanvas(2, 2);
      inst.compX = inst.compC.getContext("2d");
    }
    inst.compC.width = W; inst.compC.height = H;
    /* scratch for the swelled split during a bar pass (see frame()) */
    if (!inst.tempC) {
      inst.tempC = makeCanvas(2, 2);
      inst.tempX = inst.tempC.getContext("2d");
    }
    inst.tempC.width = W; inst.tempC.height = H;

    /* Scanlines: ONE dark row every SCAN_PERIOD device px.
       An earlier version used 2 dark of every 4, which at DPR 2 is a dark
       band a whole CSS pixel tall — that reads as banding, not as a
       raster. A single row on a short period is finer and denser, and it
       is the difference between "lines drawn on it" and "a tube".

       Created from compX, not ctx: since the roll was added, the picture
       is composed in the offscreen buffer and only blitted to the visible
       canvas, so a pattern made from the visible context was being used
       on a different one. */
    var tile = makeCanvas(1, SCAN_PERIOD);
    var tc = tile.getContext("2d");
    tc.fillStyle = "rgba(0,0,0," + SCAN_ALPHA + ")";
    tc.fillRect(0, 0, 1, 1);
    inst.scanPat = inst.compX.createPattern(tile, "repeat");

    buildGrain(inst);
    renderText(inst);
  }

  function frame(inst, t) {
    var ctx = inst.compX, W = inst.W, H = inst.H;
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
    /* A WAVE only while the bar crosses — and only WHERE it crosses.
       At rest both plates are drawn WHOLE at exactly CA_MIN, one
       drawImage each: a static convergence error, zero motion. During a
       pass, a swelled x-wavy copy of the plate is composed in a temp
       buffer and blended over the resting one in horizontal slices
       whose alpha is a gaussian of distance from the bar centre — so
       the fringe widens ONLY in the rows the bar is passing through.
       (An earlier version gated the swell on the bar's position alone,
       with no y term, and the whole word shimmered during every pass.)

       The GREEN plate is always drawn WHOLE. That is the rule that keeps
       this safe — green carries the readable core, so the letterforms can
       never break no matter what red and blue do. Only the fringe moves.

       In the temp buffer, red and blue are drawn as WAVE_COLS vertical
       strips. Column slicing is fine where row slicing was not: adjacent
       strips differ by a fraction of a pixel, so the seam is invisible,
       and the core is green's job anyway. */
    var phase = (t / WAVE_TRAVEL) * Math.PI * 2;

    /* the refresh bar: a soft band that OCCASIONALLY travels top to
       bottom — it crosses in SWEEP_TRAVEL seconds, then parks fully
       off-canvas for the rest of SWEEP_PERIOD, so the picture spends
       most of its time at rest (like the reference wordmark). While it
       crosses it shades the glyphs, swells the convergence fringe, and
       drags the band-local tear — each shaped by the same gaussian of
       distance from the bar centre. Parked 1.5 bar-heights off each
       edge, so a pass starts and ends with the gaussian at ~exp(-4):
       no pop on the top row the instant the bar appears. */
    var sweepH = H * SWEEP_BAND;
    var run = Math.min(1, (((t / SWEEP_PERIOD) % 1) * SWEEP_PERIOD) / SWEEP_TRAVEL);
    var sweepY = run * (H + sweepH * 3) - sweepH * 1.5;
    var sweepOn = run < 1; /* false = parked off-canvas, picture at rest */
    var barC = sweepY + sweepH * 0.5;   /* bar centre, device px */
    var sigma = sweepH * 0.5;           /* gaussian width: half the bar */
    /* Blit/slice band height: tracks the bar so the gaussian is finely
       sampled at every canvas size. A fixed 6 CSS px band undersampled
       it at the 64px mobile canvas floor — the "smooth" shear was 2-3
       slabs sliding ~1.8 CSS px against each other. sigma/8 keeps
       adjacent bands within ~0.4 CSS px of each other at the peak. */
    var bh = Math.max(1, Math.min(ROLL_BAND * DPR, Math.floor(sigma / 8)));

    var sMin = CA_MIN * DPR;
    var ch, buf, k;
    for (k = 0; k < 2; k++) {
      ch = k === 0 ? 0 : 2;            /* red, then blue */
      var sgn = k === 0 ? 1 : -1;
      buf = inst.waveX[k];
      buf.setTransform(1, 0, 0, 1, 0, 0);
      buf.globalAlpha = 1;
      buf.globalCompositeOperation = "source-over";
      buf.clearRect(0, 0, W, H);
      /* the resting picture: the WHOLE plate at a constant CA_MIN
         offset. At rest this single draw is all that ever happens —
         nothing here is a function of t, so the geometry cannot move. */
      buf.drawImage(inst.chanC[ch], sgn * sMin, 0);

      if (sweepOn) {
        /* the swelled split, composed in the temp buffer with the
           source columns OVERLAPPING and drawn source-over.

           Compositing columns under "lighter" left a visible hairline
           down the wordmark: neighbouring columns carry slightly
           different offsets, so a sub-pixel GAP opens between them
           where that channel is simply absent, and the white core shows
           through as its complement — a yellow line where blue dropped
           out. Overlapping the reads closes the gap; source-over stops
           the overlap double-adding and making a bright line instead. */
        var tb = inst.tempX;
        tb.setTransform(1, 0, 0, 1, 0, 0);
        tb.globalAlpha = 1;
        tb.globalCompositeOperation = "source-over";
        tb.clearRect(0, 0, W, H);
        var colW = Math.ceil(W / WAVE_COLS);
        var pad = Math.ceil(CA_MAX * DPR) + 2;
        for (var cx = 0; cx < W; cx += colW) {
          var cw = Math.min(colW, W - cx);
          var u = (cx + cw * 0.5) / W;
          var wv = Math.sin(u * WAVE_CYCLES * Math.PI * 2 - phase);
          var s = sgn * (CA_MIN + (CA_MAX - CA_MIN) * (0.5 + 0.5 * wv)) * DPR;
          var sx = Math.max(0, cx - pad);
          var sw = Math.min(W - sx, cw + (cx - sx) + pad);
          tb.drawImage(inst.chanC[ch], sx, 0, sw, H, sx + s, 0, sw, H);
        }
        /* blend it over the resting plate in horizontal slices, alpha =
           gaussian of the slice's distance from the bar centre. Rows
           away from the bar are SKIPPED and keep the resting image
           untouched; rows under it crossfade toward the swelled split.
           The crossfade of two sub-pixel-offset copies of the same
           plate reads as the fringe widening, and adjacent slices
           differ by a sliver of alpha, so there is no seam. */
        for (var sy = 0; sy < H; sy += bh) {
          var sh2 = Math.min(bh, H - sy);
          var gS = Math.exp(-Math.pow((sy + sh2 * 0.5 - barC) / sigma, 2));
          if (gS <= 0.004) continue;
          buf.globalAlpha = gS;
          buf.drawImage(inst.tempC, 0, sy, W, sh2, 0, sy, W, sh2);
        }
        buf.globalAlpha = 1;
      }
    }

    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(inst.chanC[1], 0, 0);   /* green whole — the readable core */
    ctx.drawImage(inst.waveC[0], 0, 0);
    ctx.drawImage(inst.waveC[1], 0, 0);
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
    /* the scanlines CRAWL. A static comb reads as a texture laid over a
       picture; a slowly drifting one reads as a raster being redrawn. */
    var scanShift = ((t / SCAN_DRIFT) % 1) * SCAN_PERIOD;
    ctx.save();
    ctx.translate(0, scanShift - SCAN_PERIOD);
    ctx.fillStyle = inst.scanPat;
    ctx.fillRect(0, 0, W, H + SCAN_PERIOD);
    ctx.restore();

    /* refresh bar, painted last so it rides everything under it. Still
       source-atop, so it marks the glyphs and never the transparent
       ground behind the wordmark. Skipped entirely while parked.

       It DARKENS. The first version painted a white lift, which was a
       no-op: the glyph body already sits at ~252/255, so white at 0.16
       alpha changed nothing and the bar was invisible — the only cues
       left were the fringe and the tear. On a near-white wordmark the
       only luminance signal with headroom is a shade, and a dark smear
       is what a tape tear leaves anyway (see the reference band). */
    if (sweepOn) {
      var gr = ctx.createLinearGradient(0, sweepY, 0, sweepY + sweepH);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(0.45, "rgba(0,0,0," + SWEEP_SHADE + ")");
      gr.addColorStop(0.55, "rgba(0,0,0," + (SWEEP_SHADE * 0.82) + ")");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, sweepY, W, sweepH);
    }

    ctx.globalCompositeOperation = "source-over";

    /* ---- and NOW the tear, band-local ---------------------------------
       The finished picture is blitted to the visible canvas in horizontal
       bands. Each band's sideways offset is a smooth long-wavelength sine
       MULTIPLIED BY A GAUSSIAN of its distance from the bar centre
       (sigma = half the bar height), so rows inside the bar displace up
       to ROLL_AMP CSS px and rows away from it get essentially zero.
       Between passes the bar is parked off-canvas, every offset is zero,
       and the picture is blitted whole — perfectly steady. Because the
       scanlines are already IN the picture, they ride the tear too: the
       raster bends inside the band, rather than a comb sitting flat over
       a displaced image.

       This is row slicing, which wrecked the wordmark once before. The
       difference is discipline, and it matters: the offset is a SMOOTH
       function of y (gaussian x long-wave sine, never random per row)
       capped at ROLL_AMP CSS px. The band height tracks the bar (bh,
       computed above) so neighbouring bands differ by at most ~0.4 CSS
       px even at the 64px mobile canvas floor, and smoothing is ON for
       the pass so the fractional offsets render sub-pixel — with
       nearest-neighbour, every offset snapped to a whole device pixel
       and the stems grew 1px staircase notches. The old version used
       per-row random jitter, which is why it scrambled. Keep the
       amplitude small and the function smooth and this stays safe. */
    var out = inst.ctx;
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.globalAlpha = 1;
    out.globalCompositeOperation = "source-over";
    out.clearRect(0, 0, W, H);

    if (!sweepOn) {
      /* at rest: one whole pixel-exact blit, zero displacement anywhere */
      out.imageSmoothingEnabled = false;
      out.drawImage(inst.compC, 0, 0);
    } else {
      /* smoothing ON: dx is fractional and must render sub-pixel. The
         source rects stay integer-aligned vertically, so the only
         interpolation is the horizontal one the tear actually needs. */
      out.imageSmoothingEnabled = true;
      var rollPh = (t / ROLL_SPEED) * Math.PI * 2;
      var amp = ROLL_AMP * DPR;
      for (var by = 0; by < H; by += bh) {
        var bhh = Math.min(bh, H - by);
        var yc = by + bhh * 0.5;
        var g = Math.exp(-Math.pow((yc - barC) / sigma, 2));
        var dx = 0;
        if (g > 0.002) {
          dx = Math.sin((yc / H) * ROLL_CYCLES * Math.PI * 2 - rollPh) * amp * g;
        }
        out.drawImage(inst.compC, 0, by, W, bhh, dx, by, W, bhh);
      }
    }
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
      grainC: null,
      waveC: null,
      waveX: null,
      compC: null,
      compX: null,
      tempC: null,
      tempX: null
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

  /* No discrete glitch. A sudden hard separation read as a strobe rather
     than a signal; the refresh-bar pass in frame() carries the whole
     effect now — deterministic in t, smooth on the way in and out. */
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
  function scheduleResize() {
    clearTimeout(rT);
    rT = setTimeout(function () {
      instances.forEach(function (inst) { resize(inst); });
      /* setting canvas.width resets the 2D context, so force the grain
         window to be re-rolled on the next tick */
      grainSeed = -1;
    }, 160);
  }
  window.addEventListener("resize", scheduleResize);

  /* A zoom can change devicePixelRatio WITHOUT changing the CSS viewport
     size, in which case no resize event fires and the canvas is left at
     the wrong backing-store scale. Watch the ratio itself: the query
     stops matching the moment it changes, so re-arm it each time. */
  function watchDPR() {
    if (!window.matchMedia) return;
    var mq = window.matchMedia("(resolution: " + window.devicePixelRatio + "dppx)");
    var onChange = function () {
      scheduleResize();
      watchDPR();
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange, { once: true });
    else if (mq.addListener) mq.addListener(onChange);
  }
  watchDPR();

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
