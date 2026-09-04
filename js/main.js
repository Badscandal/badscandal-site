/* ============================================================
   BADSCANDAL — interaction suite (original, no libraries)
   roll-up link labels · magnetic buttons · custom cursor ·
   preloader · nav shop categories · scroll-scrub engine ·
   stamp/card sequence · about modal · menu · reveals · Dublin clock
   ============================================================ */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia("(pointer: coarse)").matches;

  /* hero film honours reduced motion: cancel autoplay so the visitor
     keeps the poster frame instead of a moving loop */
  if (reduced) {
    Array.prototype.forEach.call(document.querySelectorAll(".hero video"), function (v) {
      v.removeAttribute("autoplay");
      v.pause();
    });
  }

  /* autoplay refused (iOS Low Power Mode, data saver): the loops sit on
     their poster with a play glyph. Retry on the first touch / scroll,
     which counts as the user gesture Safari wants. */
  if (!reduced) {
    var kick = function () {
      Array.prototype.forEach.call(document.querySelectorAll(".hero video[autoplay]"), function (v) {
        if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      });
    };
    window.addEventListener("touchstart", kick, { once: true, passive: true });
    window.addEventListener("scroll", kick, { once: true, passive: true });
    window.addEventListener("pointerdown", kick, { once: true, passive: true });
  }

  /* belt-and-braces loader dismissal: registered before ANYTHING that could
     throw, so even a runtime error further down this file can never trap the
     visitor behind the loader. (A parse error still can — the CSS
     @media (scripting:none) + <noscript> fallbacks cover the no-JS case.) */
  setTimeout(function () {
    var l = document.getElementById("loader");
    if (l && !l.classList.contains("done")) l.classList.add("done");
  }, 4000);

  /* ---------- roll-up labels: wrap every .roll in two stacked copies --- */
  Array.prototype.forEach.call(document.querySelectorAll(".roll"), function (el) {
    var label = el.textContent.trim();
    el.textContent = "";
    var wrap = document.createElement("span");
    wrap.className = "roll-in";
    var a = document.createElement("span"); a.textContent = label;
    var b = document.createElement("span"); b.textContent = label;
    b.setAttribute("aria-hidden", "true");
    wrap.appendChild(a); wrap.appendChild(b);
    el.appendChild(wrap);
  });

  /* ---------- preloader: decode intro (PixelVault-style, no brackets) --
     Random glyphs cycle and progressively LOCK into "BADSCANDAL" as the
     page actually loads; resolved word holds a beat, then melts apart in
     the chromatic channels. ------------------------------------------- */
  var loader = document.getElementById("loader");
  var scrambleEl = document.getElementById("load-scramble");
  var pctEl = document.getElementById("load-pct");
  var WORD = "BADSCANDAL";
  var GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&<>/*+=";
  /* letters resolve in a scattered order, not left-to-right */
  var lockOrder = [3, 7, 0, 5, 9, 2, 6, 1, 8, 4];
  var pctVal = 0, pageLoaded = false;
  /* the counter and the wordmark are the same signal: pctVal drives how
     many letters have locked AND what the number reads */
  function renderPct() {
    if (pctEl) pctEl.textContent = pctVal;
  }
  function renderScramble() {
    renderPct();
    if (!scrambleEl) return;
    var locked = Math.floor((pctVal / 100) * WORD.length);
    var out = "";
    for (var i = 0; i < WORD.length; i++) {
      var isLocked = lockOrder.indexOf(i) < locked;
      out += isLocked ? WORD.charAt(i)
                      : GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
    }
    scrambleEl.textContent = out;
  }
  var scrambleTick = null;
  function setPct(v) {
    pctVal = Math.max(pctVal, Math.min(100, Math.round(v)));
  }
  window.addEventListener("load", function () { pageLoaded = true; });
  /* completion: the loading line melts apart in chromatic channels */
  function burst() {
    if (!loader || reduced) return;
    var tag = loader.querySelector(".load-tag");
    var cv = document.createElement("canvas");
    cv.className = "load-burst";
    loader.appendChild(cv);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = loader.clientWidth * dpr; cv.height = loader.clientHeight * dpr;
    var ctx = cv.getContext("2d");
    var fs = Math.round(((tag ? tag.getBoundingClientRect().height : 40) || 40) * dpr * 0.92);
    function textCanvas(color) {
      var o = document.createElement("canvas");
      o.width = cv.width; o.height = Math.round(fs * 2.6);
      var c2 = o.getContext("2d");
      /* Archivo variable font: wght 900 comes from the shorthand below;
         wdth 125 is requested via font-variation-settings on the detached
         canvas — honoured by Chromium/Firefox, harmlessly ignored elsewhere
         (falls back to default width, still wght 900). Matches flow.js. */
      try { o.style.fontVariationSettings = '"wdth" 125, "wght" 900'; } catch (err2) {}
      c2.fillStyle = color;
      c2.textBaseline = "middle";
      c2.font = "900 " + fs + "px 'Archivo', Arial, sans-serif";
      /* draw per-character so the melt matches the letter-spaced DOM word */
      var word = "BADSCANDAL";
      var gap = fs * 0.32;
      var widths = [], total = 0;
      for (var wi = 0; wi < word.length; wi++) {
        widths[wi] = c2.measureText(word.charAt(wi)).width;
        total += widths[wi];
      }
      total += gap * (word.length - 1);
      var x = (o.width - total) / 2;
      for (var wj = 0; wj < word.length; wj++) {
        c2.fillText(word.charAt(wj), x, o.height / 2);
        x += widths[wj] + gap;
      }
      return o;
    }
    var layers = [
      /* three offset layers still split apart as the word melts —
         achromatic now, so it reads as ghosting rather than RGB fringing */
      { img: textCanvas("#6E6E6E"), dx: -1, g: 0.85 },
      { img: textCanvas("#B4B4B4"), dx: 1,  g: 0.85 },
      { img: textCanvas("#F2F2F2"), dx: 0,  g: 1.0 }
    ];
    if (tag) tag.style.opacity = "0";
    var t0 = null;
    (function fr(now) {
      if (!t0) t0 = now || performance.now();
      var k = Math.min(1, ((now || performance.now()) - t0) / 820);
      var e = 1 - Math.pow(1 - k, 2);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = "lighter";
      var split = e * 48 * dpr;   /* channel separation */
      var melt = 1 + e * 0.9;     /* vertical smear */
      for (var i = 0; i < layers.length; i++) {
        var L = layers[i];
        ctx.save();
        ctx.globalAlpha = (1 - e) * L.g;
        ctx.translate(cv.width / 2 + L.dx * split, cv.height / 2);
        ctx.scale(1 + e * 0.1, melt);
        try { ctx.filter = "blur(" + (e * 5 * dpr).toFixed(1) + "px)"; } catch (err) {}
        ctx.drawImage(L.img, -L.img.width / 2, -L.img.height / 2);
        ctx.restore();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      if (k < 1) requestAnimationFrame(fr);
      else if (cv.parentNode) cv.parentNode.removeChild(cv);
    })();
  }
  /* the intro was removed from the site; the machinery stays (it is
     self-contained and documented) but must not run — without this guard
     it kept two intervals ticking forever on a page with no #loader */
  if (loader && !reduced) {
    /* the glyphs flicker fast; letters lock in as loading progresses */
    scrambleTick = setInterval(renderScramble, 55);
    renderScramble();
    /* creep toward 90 while assets load, then rush to 100 once loaded */
    var tick = setInterval(function () {
      var ceiling = pageLoaded ? 100 : 90;
      var step = pageLoaded ? 7 : Math.max(1, (ceiling - pctVal) * 0.10);
      setPct(pctVal + step);
      if (pctVal >= 100) {
        clearInterval(tick);
        clearInterval(scrambleTick);
        if (scrambleEl) scrambleEl.textContent = WORD;
        renderPct();
        /* hold the resolved word a beat, then melt it apart */
        setTimeout(function () {
          burst();
          setTimeout(function () { if (loader) loader.classList.add("done"); }, 680);
        }, 520);
      }
    }, 90);
  } else {
    setPct(100);
    if (scrambleEl) scrambleEl.textContent = WORD;
    renderPct();
    setTimeout(function () { if (loader) loader.classList.add("done"); }, 150);
  }
  /* fail-open safety net: never trap the visitor behind the loader.
     Snap the count to 100 first — otherwise a slow connection sees the
     loader slide away mid-count, stuck on something like 47. */
  setTimeout(function () {
    if (!loader) return;
    setPct(100);
    if (scrambleEl) scrambleEl.textContent = WORD;
    renderPct();
    loader.classList.add("done");
  }, 3400);

  /* ---------- custom cursor -------------------------------------------- */
  if (!coarse && !reduced) {
    var dot = document.createElement("div");
    dot.id = "cursor";
    document.body.appendChild(dot);
    var cx = -100, cy = -100, tx = cx, ty = cy;
    document.addEventListener("pointermove", function (e) {
      tx = e.clientX; ty = e.clientY;
      var over = e.target.closest("a, button, summary");
      dot.classList.toggle("grow", !!over);
    }, { passive: true });
    (function loop() {
      cx += (tx - cx) * 0.22; cy += (ty - cy) * 0.22;
      dot.style.transform = "translate(" + cx + "px," + cy + "px)";
      requestAnimationFrame(loop);
    })();
    document.documentElement.classList.add("has-cursor");
  }

  /* ---------- magnetic buttons ------------------------------------------ */
  if (!coarse && !reduced) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-mag]"), function (el) {
      var r = null;
      el.addEventListener("pointerenter", function () { r = el.getBoundingClientRect(); });
      el.addEventListener("pointermove", function (e) {
        if (!r) r = el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = "translate(" + dx * 0.18 + "px," + dy * 0.28 + "px)";
      });
      el.addEventListener("pointerleave", function () {
        el.style.transform = "";
        r = null;
      });
    });
  }

  /* ---------- count-up numbers (the arithmetic on the story page) ------- */
  (function counts() {
    var els = document.querySelectorAll(".stat-count[data-count-to]");
    if (!els.length) return;
    function run(el) {
      var to = parseInt(el.getAttribute("data-count-to"), 10) || 0;
      var suf = el.getAttribute("data-suffix") || "";
      if (reduced) { el.textContent = to.toLocaleString("en-IE") + suf; return; }
      var t0 = null, dur = 1900;
      function frame(now) {
        if (!t0) t0 = now;
        var k = Math.min(1, (now - t0) / dur);
        var e = 1 - Math.pow(1 - k, 3); /* ease-out */
        el.textContent = Math.round(to * e).toLocaleString("en-IE") + (k >= 1 ? suf : "");
        if (k < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }
    if ("IntersectionObserver" in window) {
      var cio = new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          if (en.isIntersecting) { run(en.target); cio.unobserve(en.target); }
        });
      }, { threshold: 0.4 });
      Array.prototype.forEach.call(els, function (el) { cio.observe(el); });
    } else {
      Array.prototype.forEach.call(els, function (el) { run(el); });
    }
  })();

  /* ---------- scroll-scrubbed films (scroll = transport control) --------- */
  function makeScrub(section, video, desktopSrc, phoneSrc, desktopPoster, phonePoster) {
    if (!section || !video) return;
    video.controls = false;
    video.muted = true;                       /* property, not just attribute (iOS) */
    video.setAttribute("webkit-playsinline", "");
    /* hard guarantee: this can never run as a video — any playback is
       instantly paused and snapped back to the scrub position */
    video.addEventListener("playing", function () {
      video.pause();
      try { video.currentTime = current || 0.001; } catch (e) {}
    });
    var small = window.matchMedia("(max-width: 820px)").matches;
    var useFast = window.matchMedia("(pointer: coarse)").matches;
    var srcUrl = (small && phoneSrc) ? phoneSrc : desktopSrc;
    var poster = (small && phonePoster) ? phonePoster : desktopPoster;
    if (poster) video.poster = poster;
    video.src = srcUrl;
    var duration = 0, target = 0, current = 0, sRaf = null;
    video.addEventListener("loadedmetadata", function () {
      duration = video.duration || 0;
      try { video.currentTime = 0.001; } catch (e) {}
    });
    /* iOS paints no frames until playback has started once */
    var primed = false;
    function prime() {
      if (primed) return; primed = true;
      var p = video.play();
      if (p && p.then) {
        p.then(function () {
          video.pause();
          try { video.currentTime = 0.001; } catch (e) {}
        }).catch(function () { primed = false; });
      }
    }
    video.addEventListener("canplay", prime);
    window.addEventListener("touchstart", prime, { once: true, passive: true });
    if (reduced) return; /* reduced motion: poster / first frame only */
    /* fully buffer as a blob: seeks become local + instant (the iOS fix) */
    fetch(srcUrl).then(function (r) { return r.blob(); }).then(function (b) {
      var at = video.currentTime || 0.001;
      video.src = URL.createObjectURL(b);
      video.load();
      video.addEventListener("loadedmetadata", function () {
        try { video.currentTime = at; } catch (e) {}
      }, { once: true });
      primed = false;
      prime();
    }).catch(function () { /* streaming source stays */ });
    function progress() {
      var r = section.getBoundingClientRect();
      var total = r.height - window.innerHeight;
      if (total <= 0) return 0;
      return Math.min(1, Math.max(0, -r.top / total));
    }
    function loop() {
      sRaf = null;
      if (!duration) return;
      target = progress() * Math.max(0, duration - 0.05);
      current += (target - current) * 0.16;
      if (Math.abs(current - target) < 0.003) current = target;
      try {
        if (useFast && typeof video.fastSeek === "function") video.fastSeek(current);
        else video.currentTime = current;
      } catch (e) {}
      if (Math.abs(current - target) > 0.003) sRaf = requestAnimationFrame(loop);
    }
    window.addEventListener("scroll", function () {
      if (!sRaf) sRaf = requestAnimationFrame(loop);
    }, { passive: true });
    window.addEventListener("resize", function () {
      if (!sRaf) sRaf = requestAnimationFrame(loop);
    });
  }
  /* Generic mount (5 Sep 2026): any [data-scrub] section holding a <video>
     is a scrolled film — the plugin page's centrepiece. Sources and
     posters come from its data-* attributes so this file stays generic. */
  Array.prototype.forEach.call(document.querySelectorAll("[data-scrub]"), function (sec) {
    makeScrub(sec, sec.querySelector("video"),
              sec.getAttribute("data-src"), sec.getAttribute("data-src-phone"),
              sec.getAttribute("data-poster"), sec.getAttribute("data-poster-phone"));
  });
  /* The homepage hero is a still photo + CRT wordmark now — no scrubbed
     film there any more. makeScrub() stays: it is generic, no-ops when
     its element is absent, and a future scrubbed section is one call +
     the markup (see CLAUDE.md, "The films"). */


  /* ---------- nav shop categories --------------------------------------
     The nav carries the shop taxonomy as plain hand-written LABELS only —
     js/store.js stays the single source of truth for behaviour: it renders
     the filter buttons (each carrying data-key), and these links simply
     click the matching button. On a page with the store markup the link's
     own #store anchor scrolls to the grid; on other pages the links point
     at store.html#<key> and the hash is applied below once store.js has
     built the filters. -------------------------------------------------- */
  (function navShop() {
    function pick(fam, gar) {
      var tab = document.querySelector(".store-tabs [data-key='" + (fam || "all") + "']");
      var chip = document.querySelector(".store-chips [data-key='" + (gar || "all") + "']");
      var hit = false;
      if (tab) { tab.click(); hit = true; }
      if (chip) { chip.click(); hit = true; }
      return hit;
    }
    Array.prototype.forEach.call(
      document.querySelectorAll("[data-shop-family],[data-shop-garment]"),
      function (a) {
        a.addEventListener("click", function () {
          /* one axis per nav link; the other resets to "all" so the nav
             always shows exactly the named category */
          pick(a.getAttribute("data-shop-family"), a.getAttribute("data-shop-garment"));
        });
      });
    /* deep link: store.html#statement / #tee ... — applied after store.js
       has rendered the filter rows (it runs later in the same body) */
    function applyHash() {
      var key = (location.hash || "").slice(1);
      if (!key) return;
      var tab = document.querySelector(".store-tabs [data-key='" + key + "']");
      var chip = document.querySelector(".store-chips [data-key='" + key + "']");
      if (tab) pick(key, null);
      else if (chip) pick(null, key);
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", applyHash);
    } else {
      applyHash();
    }
    window.addEventListener("hashchange", applyHash);
  })();

  /* ---------- stamp/card sequence (the postcards) ------------------------
     The stamps themselves NEVER animate. Each CARD flies ~2000-2900px up
     on ONE spring (damped harmonic oscillator on rAF — duration ~0.7s,
     small overshoot: the thwack on landing), rotated so nothing is ever
     parallel, and stacks OVER the previous card (z 2/3/4 in CSS). A card
     lands when its invisible 800px marker has fully scrolled into view —
     because the panel is exactly 100vh, that is the moment the scroll
     travelled past the panel exceeds (i+1)*800px. The stamp then inks on
     90ms later via the CSS .landed transition. Scrolling back up flies
     the card out again, so the sequence replays in reverse.
     Reduced motion: this module exits first and the cards simply ARE in
     place (CSS default --fly:0, stamps at opacity 1). ------------------ */
  (function stamps() {
    var sec = document.querySelector(".stamps");
    if (!sec) return;
    var cards = Array.prototype.slice.call(sec.querySelectorAll(".scard"));
    if (!cards.length || reduced) return;
    sec.classList.add("fly");
    var STEP = 800;               /* must match .stamps-marker height in CSS */
    var FLY = [2000, 2450, 2900]; /* flight distance per card, px */
    var Z = 0.8, W0 = 7.5;        /* damping ratio + natural frequency:
                                     ~0.7s settle with a ~1.5% overshoot
                                     (the "duration .7, bounce .2" spring) */
    var states = [];
    for (var i = 0; i < cards.length; i++) {
      var d = FLY[i % FLY.length];
      cards[i].style.setProperty("--fly", d + "px");
      /* card 1 lands 120px into the section instead of a full STEP —
         a whole dead marker before anything happened read as "the
         section is broken". Later cards keep STEP spacing, and card 3
         landing well before the panel releases leaves a beat to read
         it (before, it landed exactly at release). */
      states.push({ el: cards[i], x: d, v: 0, target: d, from: d, at: 120 + i * STEP });
    }
    var raf = null, lastT = 0;
    function step(now) {
      raf = null;
      var dt = lastT ? Math.min(0.032, (now - lastT) / 1000) : 0.016;
      lastT = now;
      var busy = false;
      for (var k = 0; k < states.length; k++) {
        var s = states[k];
        if (Math.abs(s.x - s.target) < 0.5 && Math.abs(s.v) < 6) {
          if (s.x !== s.target) {
            s.x = s.target; s.v = 0;
            s.el.style.setProperty("--fly", s.x + "px");
          }
          if (s.target === 0) s.el.classList.add("landed");
          continue;
        }
        /* damped harmonic oscillator, stepped on rAF */
        var a = -W0 * W0 * (s.x - s.target) - 2 * Z * W0 * s.v;
        s.v += a * dt;
        s.x += s.v * dt;
        s.el.style.setProperty("--fly", s.x.toFixed(2) + "px");
        busy = true;
      }
      if (busy) raf = requestAnimationFrame(step);
      else lastT = 0;
    }
    function wake() {
      if (!raf) { lastT = 0; raf = requestAnimationFrame(step); }
    }
    function onScroll() {
      var past = -sec.getBoundingClientRect().top;
      var changed = false;
      for (var k = 0; k < states.length; k++) {
        var s = states[k];
        /* land at the marker line; fly back out 120px earlier so the
           boundary can never chatter */
        var want = s.target === 0
          ? (past >= s.at - 120 ? 0 : s.from)
          : (past >= s.at ? 0 : s.from);
        if (want !== s.target) {
          s.target = want;
          changed = true;
          if (want !== 0) s.el.classList.remove("landed");
        }
      }
      if (changed) wake();
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
  })();

  /* ---------- scroll-driven pops (reversible, directional) --------------- */
  (function pops() {
    var els = Array.prototype.slice.call(document.querySelectorAll("[data-pop]"));
    if (!els.length || reduced) return;
    var t;
    function upd() {
      t = null;
      var vh = window.innerHeight;
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var dir = el.getAttribute("data-pop") || "up";
        var r = el.getBoundingClientRect();
        var p = (vh * 0.92 - r.top) / (vh * 0.5);
        p = Math.max(0, Math.min(1, p));
        var e = 1 - Math.pow(1 - p, 3);
        var d = 1 - e, tx = 0, ty = 0;
        if (dir === "left") tx = -d * 110;
        else if (dir === "right") tx = d * 110;
        else ty = d * 90;
        el.style.opacity = (0.08 + e * 0.92).toFixed(3);
        el.style.transform = "translate(" + tx.toFixed(2) + "px," + ty.toFixed(2) + "px)";
      }
    }
    window.addEventListener("scroll", function () { if (!t) t = requestAnimationFrame(upd); }, { passive: true });
    window.addEventListener("resize", function () { if (!t) t = requestAnimationFrame(upd); });
    upd();
  })();

  /* ---------- bottom blur veil: step aside at the end of the page ------- */
  (function veil() {
    var v = document.querySelector(".blur-veil");
    if (!v) return;
    var t;
    function chk() {
      if (t) return;
      t = requestAnimationFrame(function () {
        t = null;
        var nearBottom = window.innerHeight + window.scrollY >=
                         document.documentElement.scrollHeight - 220;
        v.classList.toggle("away", nearBottom);
      });
    }
    window.addEventListener("scroll", chk, { passive: true });
    chk();
  })();

  /* ---------- assemble censored words on subpage sections ---------------- */
  (function pageSwears() {
    var w = "f" + ["u", "c", "k"].join("");
    Array.prototype.forEach.call(document.querySelectorAll(".bs-swear"), function (el) {
      if (!el.closest("#about")) el.textContent = w;
    });
  })();

  /* ---------- menu ------------------------------------------------------- */
  var menuBtn = document.getElementById("menu-btn");
  var menu = document.getElementById("menu");
  function closeMenu() {
    document.body.classList.remove("menu-open");
    if (menuBtn) menuBtn.setAttribute("aria-expanded", "false");
    if (menu) menu.setAttribute("aria-hidden", "true");
  }
  if (menuBtn) {
    menuBtn.addEventListener("click", function () {
      var open = document.body.classList.toggle("menu-open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (menu) menu.setAttribute("aria-hidden", open ? "false" : "true");
    });
  }
  if (menu) {
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) closeMenu();
    });
  }

  /* ---------- about modal ------------------------------------------------- */
  var about = document.getElementById("about");
  var lastFocus = null;
  var sweared = false;
  function openAbout() {
    if (!about) return;
    lastFocus = document.activeElement;
    about.hidden = false;
    closeMenu();
    document.body.style.overflow = "hidden";
    /* the served HTML only ever contains "f***"; the real word is
       assembled in the live DOM the first time the modal opens
       (same crawler-safe trick as the old homepage reveal) */
    if (!sweared) {
      sweared = true;
      var w = "f" + ["u", "c", "k"].join("");
      Array.prototype.forEach.call(about.querySelectorAll(".bs-swear"), function (el) {
        el.textContent = w;
      });
    }
    var c = document.getElementById("close-about");
    if (c) c.focus();
  }
  function closeAbout() {
    if (!about || about.hidden) return;
    about.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-about]"), function (b) {
    b.addEventListener("click", openAbout);
  });
  var closeBtn = document.getElementById("close-about");
  if (closeBtn) closeBtn.addEventListener("click", closeAbout);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeAbout(); closeMenu(); }
  });
  if (about) {
    about.addEventListener("click", function (e) { if (e.target === about) closeAbout(); });
    /* subpages link here as index.html?about=1 */
    try {
      if (new URLSearchParams(location.search).get("about") === "1") openAbout();
    } catch (e) {}
  }

  /* ---------- "(soon)" rows ------------------------------------------------ */
  /* ---------- scroll reveals ------------------------------------------------ */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduced) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -10% 0px" });
    Array.prototype.forEach.call(reveals, function (el) { io.observe(el); });
  } else {
    Array.prototype.forEach.call(reveals, function (el) { el.classList.add("in"); });
  }

  /* ---------- Dublin clock (full Supersolid format) + year ------------------- */
  var clock = document.getElementById("clock");
  var zoneLabel = "LOCAL";
  try {
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    zoneLabel = (tz.split("/").pop() || "LOCAL").replace(/_/g, " ").toUpperCase();
  } catch (e) {}
  function tickClock() {
    if (!clock) return;
    try {
      var now = new Date();
      var day = new Intl.DateTimeFormat("en-IE", { weekday: "long" }).format(now).toUpperCase();
      var time = new Intl.DateTimeFormat("en-IE", {
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
      }).format(now);
      clock.textContent = day + " " + time + " " + zoneLabel;
    } catch (e) {
      clock.textContent = new Date().toTimeString().slice(0, 8);
    }
  }
  tickClock();
  setInterval(tickClock, 1000);
  var yrEl = document.getElementById("year");
  if (yrEl) yrEl.textContent = String(new Date().getFullYear());
})();
