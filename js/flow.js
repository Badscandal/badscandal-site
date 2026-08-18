/* ============================================================
   BADSCANDAL — kinetic wordmark · QUALITY BUILD
   Giant "BADSCANDAL" as a WebGL texture. A pointer writes velocity
   into a ping-pong flowmap; on phones, where there is no pointer,
   SCROLL drives it instead (see "scroll slosh" below) and a tap
   splashes it; a dedicated blur pass smooths the flow
   every frame (this is what makes it read as liquid, not stepped);
   the display shader displaces the type by the smoothed flow and
   splits the colour channels (chromatic aberration) with a warm
   brand fringe. Tuned for quality over battery: full-res sim,
   heavy display face, slow luscious decay, wide ripple.
   Fallbacks: no WebGL / reduced motion -> static HTML heading.
   No libraries.
   ============================================================ */
(function () {
  "use strict";

  var canvas = document.getElementById("flow");
  var fallback = document.getElementById("flow-fallback");
  if (!canvas) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var FONT = '"Archivo", Helvetica, Arial, sans-serif';

  function useFallback() {
    canvas.style.display = "none";
    if (fallback) fallback.hidden = false;
  }
  if (reduced) { useFallback(); return; }

  var opts = { alpha: true, antialias: false, premultipliedAlpha: true,
               powerPreference: "high-performance", preserveDrawingBuffer: false };
  var gl = canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts);
  if (!gl) { useFallback(); return; }

  /* float-precision flow (this is why theirs returns to zero perfectly):
     8-bit storage stalls under slow decay; half-float has no rounding stalls */
  var extHF = gl.getExtension("OES_texture_half_float");
  var extHFL = gl.getExtension("OES_texture_half_float_linear");
  var extCB = gl.getExtension("EXT_color_buffer_half_float");
  var flowType = (extHF && extHFL && extCB) ? extHF.HALF_FLOAT_OES : gl.UNSIGNED_BYTE;

  function sh(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s);
    return s;
  }
  function prog(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw gl.getProgramInfoLog(p);
    return p;
  }

  var VS = [
    "attribute vec2 p;",
    "varying vec2 uv;",
    "void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }"
  ].join("\n");

  var FS_FLOW = [
    "precision highp float;",
    "varying vec2 uv;",
    "uniform sampler2D prev;",
    "uniform vec2 mouse;",
    "uniform vec2 pmouse;",
    "uniform vec2 vel;",
    "uniform float aspect;",
    "uniform float active;",
    /* scroll slosh (phones): a body force across the whole field rather
       than a stir at a point — the container is accelerating, not a
       finger dragging through it */
    "uniform float slosh;",
    /* tap splash: xy = centre, z = strength */
    "uniform vec3 splash;",
    "float segDist(vec2 p, vec2 a, vec2 b){",
    "  vec2 pa = p - a; vec2 ba = b - a;",
    "  float h = clamp(dot(pa,ba)/max(dot(ba,ba),1e-5), 0.0, 1.0);",
    "  return length(pa - ba*h);",
    "}",
    "void main(){",
    "  vec2 f = texture2D(prev, uv).rg;",
    "  vec2 d1 = f - 0.5;",
    "  d1 *= 0.9685;",
    "  d1 -= sign(d1) * min(abs(d1), 0.0028);",  /* always reaches true zero */
    "  f = 0.5 + d1;",
    "  vec2 d0 = f - 0.5;",
    "  f = 0.5 + d0 * step(vec2(0.0045), abs(d0));",
    "  vec2 a = mouse, b = pmouse;",
    "  vec2 uva = uv; uva.x *= aspect;",
    "  vec2 aa = a; aa.x *= aspect; vec2 bb = b; bb.x *= aspect;",
    "  float dist = segDist(uva, aa, bb);",
    "  float s = exp(-dist*dist * 25.0) * active;",
    "  f += vel * 0.30 * s;",
    /* --- scroll slosh -------------------------------------------------
       A flat push would slide the whole wordmark rigidly, which reads as
       a translate, not a liquid. Shearing it across x makes the middle
       lag differently from the ends; the blur pass then smears those
       bands into each other and it reads as fluid. The small x term is
       the lateral wobble you get in a glass that isn't perfectly level. */
    "  float shear = 0.62 + 0.38 * sin(uv.x * 6.2831 + 1.1)",
    "                     + 0.14 * sin(uv.x * 15.9 + 4.2);",
    /* NB: smoothstep is undefined when edge0 >= edge1, so the top taper is
       written as 1.0 - smoothstep(lo, hi) rather than smoothstep(hi, lo) */
    "  float edge = smoothstep(0.0, 0.22, uv.y) * (1.0 - smoothstep(0.78, 1.0, uv.y));",
    "  f.g += slosh * shear * (0.55 + 0.45 * edge);",
    "  f.r += slosh * 0.13 * sin(uv.x * 9.4 + uv.y * 3.7);",
    /* --- tap splash: radial impulse out of the touch point ------------- */
    "  vec2 sc = splash.xy; sc.x *= aspect;",
    "  vec2 dv = uva - sc;",
    "  float dl = max(length(dv), 1e-4);",
    "  f += (dv / dl) * splash.z * exp(-dl * dl * 34.0);",
    "  f = clamp(f, 0.0, 1.0);",
    "  gl_FragColor = vec4(f, 0.0, 1.0);",
    "}"
  ].join("\n");

  var FS_BLUR = [
    "precision highp float;",
    "varying vec2 uv;",
    "uniform sampler2D src;",
    "uniform vec2 dir;",
    "void main(){",
    "  vec2 o1 = dir * 1.3846153846;",
    "  vec2 o2 = dir * 3.2307692308;",
    "  vec3 c = texture2D(src, uv).rgb * 0.2270270270;",
    "  c += texture2D(src, uv + o1).rgb * 0.3162162162;",
    "  c += texture2D(src, uv - o1).rgb * 0.3162162162;",
    "  c += texture2D(src, uv + o2).rgb * 0.0702702703;",
    "  c += texture2D(src, uv - o2).rgb * 0.0702702703;",
    "  gl_FragColor = vec4(c, 1.0);",
    "}"
  ].join("\n");

  var FS_DRAW = [
    "precision highp float;",
    "varying vec2 uv;",
    "uniform sampler2D flowT;",
    "uniform sampler2D textT;",
    "void main(){",
    "  vec2 f = (texture2D(flowT, uv).rg - 0.5);",
    "  float m = length(f);",
    "  float gate = smoothstep(0.002, 0.03, m);",
    "  vec2 disp = f * 0.26;",
    "  float aR = texture2D(textT, uv + disp * 1.28).a;",
    "  float aG = texture2D(textT, uv + disp * 1.0).a;",
    "  float aB = texture2D(textT, uv + disp * 0.74).a;",
    /* monochrome: the three taps above are still displaced by different
       amounts, so the wordmark still smears and ghosts under the cursor —
       it just resolves in grey instead of orange. Matches --paper/--silver/--uv. */
    "  vec3 paper = vec3(0.949, 0.949, 0.949);",
    "  vec3 blaze = vec3(0.431, 0.431, 0.431);",
    "  vec3 ember = vec3(0.706, 0.706, 0.706);",
    "  vec3 col = paper * aG;",
    "  col = mix(col, blaze, aR * clamp(m*4.2,0.0,0.8) * gate);",
    "  col = mix(col, ember, aB * clamp(m*3.0,0.0,0.6) * gate);",
    "  float a = max(aG, gate * max(aR*m*4.2, aB*m*3.0));",
    "  a = clamp(a, 0.0, 1.0);",
    "  gl_FragColor = vec4(col * a, a);",
    "}"
  ].join("\n");

  var quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

  var pFlow, pBlur, pDraw;
  try { pFlow = prog(VS, FS_FLOW); pBlur = prog(VS, FS_BLUR); pDraw = prog(VS, FS_DRAW); }
  catch (e) { useFallback(); return; }

  function bindQuad(p) {
    var loc = gl.getAttribLocation(p, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  function tex(w, h, type) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type || gl.UNSIGNED_BYTE, null);
    return t;
  }
  function fbo(w, h) {
    var t = tex(w, h, flowType);
    var f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
        && flowType !== gl.UNSIGNED_BYTE) {
      /* GPU can't render to half-float: fall back to byte + subtractive decay */
      flowType = gl.UNSIGNED_BYTE;
      gl.deleteTexture(t); gl.deleteFramebuffer(f);
      return fbo(w, h);
    }
    gl.clearColor(0.5, 0.5, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { t: t, f: f };
  }

  var W = 0, H = 0, FW = 0, FH = 0;
  var textTex = null, flowA = null, flowB = null, blurT = null;

  function drawTextTexture() {
    /* supersample: render the type larger than the display buffer and let
       linear downsampling smooth the edges (capped to the GPU's limit) */
    var maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    var SS = Math.min(1.75, maxTex / Math.max(W, 2), maxTex / Math.max(H, 2));
    SS = Math.max(1, SS);
    var TW = Math.round(W * SS), TH = Math.round(H * SS);
    var off = document.createElement("canvas");
    off.width = TW; off.height = TH;
    var c = off.getContext("2d");
    /* Archivo is a VARIABLE font and the display face elsewhere uses
       wdth 125 / wght 900. Canvas 2D font shorthand cannot express a width
       axis, and crucially measureText() does NOT honour a wdth set via
       font-variation-settings on the canvas element while fillText() DOES —
       so requesting wdth 125 here makes the raster ~20% wider than the size
       fs was computed to fit, clipping the word at both edges. The canvas
       wordmark therefore draws at Archivo's default width at wght 900:
       measure and raster agree, and the word always fits. Do NOT re-add
       font-variation-settings here without also measuring at that width. */
    c.clearRect(0, 0, TW, TH);
    c.fillStyle = "#fff";
    c.textAlign = "center";
    c.textBaseline = "middle";
    var word = "BADSCANDAL";
    var probe = 100;
    c.font = "900 " + probe + "px " + FONT;
    var w100 = c.measureText(word).width || 1;
    var fs = Math.floor(probe * (TW * 0.94) / w100);
    fs = Math.min(fs, Math.floor(TH * 0.9));
    c.font = "900 " + fs + "px " + FONT;
    c.fillText(word, TW / 2, TH / 2 + fs * 0.02);
    if (textTex) gl.deleteTexture(textTex);
    textTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, textTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, off);
  }

  function resize() {
    var r = canvas.getBoundingClientRect();
    W = Math.max(2, Math.round(r.width * DPR));
    H = Math.max(2, Math.round(r.height * DPR));
    canvas.width = W; canvas.height = H;
    FW = Math.max(2, Math.round(W / 2)); FH = Math.max(2, Math.round(H / 2));
    flowA = fbo(FW, FH);
    flowB = fbo(FW, FH);
    blurT = fbo(FW, FH);
    drawTextTexture();
  }

  var mouse = { x: -1, y: -1, px: -1, py: -1, vx: 0, vy: 0, on: 0, seen: false };
  function setMouse(e) {
    var r = canvas.getBoundingClientRect();
    var cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    var cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    var x = cx / r.width, y = 1 - cy / r.height;
    if (mouse.seen) {
      mouse.vx = Math.max(-1, Math.min(1, (x - mouse.x) * 16));
      mouse.vy = Math.max(-1, Math.min(1, (y - mouse.y) * 16));
    }
    mouse.px = mouse.seen ? mouse.x : x;
    mouse.py = mouse.seen ? mouse.y : y;
    mouse.x = x; mouse.y = y; mouse.on = 1; mouse.seen = true;
  }
  canvas.addEventListener("pointermove", setMouse, { passive: true });
  canvas.addEventListener("pointerdown", setMouse, { passive: true });
  canvas.addEventListener("pointerleave", function () { mouse.on = 0; }, { passive: true });

  /* ---------- scroll slosh + tap splash (this is the phone story) -------
     On a phone there is no hover, and touch-action:pan-y gives vertical
     drags to the browser — so the only gesture anyone actually makes over
     the wordmark is the one that scrolls past it. Scroll therefore drives
     the liquid, the same way it drives the film behind it.

     It reacts to ACCELERATION, not velocity: scrolling at a steady rate
     settles, while starting, stopping and reversing slosh. That's how
     liquid behaves in a glass you're carrying, and it means a long
     scroll doesn't turn into constant undirected churn.

     >>> TUNE HERE <<< */
  var SLOSH_GAIN = 0.085;   /* how hard scroll pushes the liquid   */
  var SLOSH_DIR = -1;       /* flip to 1 if it sloshes the wrong way */
  var SPLASH_GAIN = 0.30;   /* tap impulse strength                */

  var lastY = window.pageYOffset || 0;
  var scrollV = 0;          /* instantaneous, normalised to viewports */
  var containerV = 0;       /* the smoothed "glass" it lags behind    */
  var sloshVal = 0;
  var splash = { x: -9, y: -9, s: 0 };

  window.addEventListener("scroll", function () {
    var y = window.pageYOffset || 0;
    var vh = window.innerHeight || 1;
    /* clamped: an anchor jump or a restored scroll position arrives as one
       enormous delta, which would slam the field to saturation */
    var dv = (y - lastY) / vh;
    scrollV = Math.max(-1.5, Math.min(1.5, dv));
    lastY = y;
    if (visible && !raf) raf = requestAnimationFrame(tick);
  }, { passive: true });

  /* a tap does nothing else on the hero, so let it break the surface */
  canvas.addEventListener("pointerdown", function (e) {
    var r = canvas.getBoundingClientRect();
    splash.x = (e.clientX - r.left) / r.width;
    splash.y = 1 - (e.clientY - r.top) / r.height;
    splash.s = SPLASH_GAIN;
  }, { passive: true });

  var visible = true, raf = null;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(tick);
    }).observe(canvas);
  }

  function blurPass() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, blurT.f);
    gl.viewport(0, 0, FW, FH);
    gl.useProgram(pBlur);
    bindQuad(pBlur);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, flowB.t);
    gl.uniform1i(gl.getUniformLocation(pBlur, "src"), 0);
    gl.uniform2f(gl.getUniformLocation(pBlur, "dir"), 1 / FW, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, flowB.f);
    gl.bindTexture(gl.TEXTURE_2D, blurT.t);
    gl.uniform2f(gl.getUniformLocation(pBlur, "dir"), 0, 1 / FH);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function tick() {
    raf = null;

    gl.bindFramebuffer(gl.FRAMEBUFFER, flowB.f);
    gl.viewport(0, 0, FW, FH);
    gl.useProgram(pFlow);
    bindQuad(pFlow);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, flowA.t);
    gl.uniform1i(gl.getUniformLocation(pFlow, "prev"), 0);
    gl.uniform2f(gl.getUniformLocation(pFlow, "mouse"), mouse.x, mouse.y);
    gl.uniform2f(gl.getUniformLocation(pFlow, "pmouse"),
                 mouse.px < 0 ? mouse.x : mouse.px, mouse.py < 0 ? mouse.y : mouse.py);
    gl.uniform2f(gl.getUniformLocation(pFlow, "vel"), mouse.vx, mouse.vy);
    gl.uniform1f(gl.getUniformLocation(pFlow, "aspect"), FW / FH);
    gl.uniform1f(gl.getUniformLocation(pFlow, "active"), mouse.on);
    gl.uniform1f(gl.getUniformLocation(pFlow, "slosh"), sloshVal);
    gl.uniform3f(gl.getUniformLocation(pFlow, "splash"), splash.x, splash.y, splash.s);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    mouse.vx *= 0.62; mouse.vy *= 0.62;
    mouse.px = mouse.x; mouse.py = mouse.y;

    /* the glass catches up to the hand; the gap is what the liquid feels.
       Steady scrolling closes the gap and settles — only changes slosh. */
    containerV += (scrollV - containerV) * 0.08;
    var lag = (scrollV - containerV) * SLOSH_GAIN * SLOSH_DIR;
    /* the field lives in 0..1 around 0.5, so anything past ~0.4 just
       saturates and looks like a hard clip instead of a slosh */
    sloshVal = Math.max(-0.11, Math.min(0.11, lag));
    scrollV *= 0.86;          /* no scroll events = the flick is spending itself */
    splash.s *= 0.82;         /* ~400ms tail */
    if (Math.abs(splash.s) < 0.002) splash.s = 0;

    blurPass();
    blurPass();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(pDraw);
    bindQuad(pDraw);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, flowB.t);
    gl.uniform1i(gl.getUniformLocation(pDraw, "flowT"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textTex);
    gl.uniform1i(gl.getUniformLocation(pDraw, "textT"), 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    var t = flowA; flowA = flowB; flowB = t;

    if (visible) raf = requestAnimationFrame(tick);
  }

  var rT;
  window.addEventListener("resize", function () {
    clearTimeout(rT); rT = setTimeout(resize, 160);
  });

  try {
    resize();
    raf = requestAnimationFrame(tick);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { drawTextTexture(); });
    }
    if (document.fonts && document.fonts.load) {
      document.fonts.load('900 100px "Archivo"').then(function () { drawTextTexture(); }).catch(function(){});
    }
  } catch (e) { useFallback(); }
})();
