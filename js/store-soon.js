/* ============================================================
   BADSCANDAL — store "coming soon"
   The little troublemaker swings in, sets a bomb in the middle,
   legs it off-screen, the bomb blows, and the blast sweeps up into
   the "COMING SOON" reveal + a sleek notify button.

   Runs on the store page (needs #soon). Reduced-motion / no-canvas
   visitors just see the static heading + button (no animation).
   ============================================================ */
(function () {
  "use strict";

  var soon = document.getElementById("soon");
  if (!soon) return;
  var canvas = soon.querySelector(".soon-canvas");
  var titleEl = soon.querySelector(".soon-title");
  var subEl = soon.querySelector(".soon-sub");
  var btnEl = soon.querySelector(".soon-btn");

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Static fallback: leave the heading + button visible, do nothing fancy.
  if (reduce || !canvas || !canvas.getContext) return;

  var ctx = canvas.getContext("2d");
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;
  function size() {
    var r = soon.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  window.addEventListener("resize", size);

  // hide the reveal bits until the blast lands
  titleEl.style.opacity = "0";
  subEl.style.opacity = "0";
  btnEl.style.opacity = "0";

  /* ---------- tween + easings ---------- */
  function tween(dur, ease, up, done) {
    var t0 = performance.now();
    (function f(now) {
      var k = Math.min(1, (now - t0) / dur);
      up(ease ? ease(k) : k);
      if (k < 1) requestAnimationFrame(f); else if (done) done();
    })(performance.now());
  }
  var easeInOut = function (k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
  var linear = function (k) { return k; };

  /* ---------- layout anchors (soon-local px) ---------- */
  var cx = W * 0.5;
  var groundY = H * 0.60;   // where the man stands / the bomb sits

  /* ---------- the little guy ---------- */
  var man = document.createElement("span");
  man.className = "bs-stickman";
  man.setAttribute("aria-hidden", "true");
  man.innerHTML =
    '<span class="sm-rig"><svg viewBox="0 0 30 44"><g class="sm-bob">' +
      '<circle class="sm head" cx="15" cy="7" r="4"/>' +
      '<line class="sm torso"     x1="15" y1="11" x2="15" y2="26"/>' +
      '<line class="sm arm-back"  x1="15" y1="14" x2="9"  y2="21"/>' +
      '<line class="sm arm-front" x1="15" y1="14" x2="21" y2="21"/>' +
      '<line class="sm leg-back"  x1="15" y1="26" x2="9"  y2="38"/>' +
      '<line class="sm leg-front" x1="15" y1="26" x2="21" y2="38"/>' +
    '</g></svg></span>';
  soon.appendChild(man);
  var rig = man.querySelector(".sm-rig");

  var MH = Math.min(70, Math.max(44, H * 0.16));
  var MW = MH * (30 / 44);
  man.style.width = MW + "px";
  man.style.height = MH + "px";
  function placeMan(centerX) {
    man.style.left = (centerX - MW / 2) + "px";
    man.style.top = (groundY - MH + 2) + "px";
  }

  // enter: land left of centre, then swing in to it
  placeMan(cx - W * 0.16);
  man.classList.add("swing");
  setTimeout(afterSwing, 1300);

  function manWalkTo(centerX, dur, done) {
    var sL = parseFloat(man.style.left) || 0, eL = centerX - MW / 2;
    man.classList.add("walking");
    tween(dur, easeInOut, function (k) { man.style.left = (sL + (eL - sL) * k) + "px"; },
      function () { man.classList.remove("walking"); if (done) done(); });
  }

  function afterSwing() {
    man.classList.remove("swing");
    manWalkTo(cx - MW * 0.55, 480, placeBomb);   // walk up beside centre
  }

  var bomb;
  function placeBomb() {
    // crouch to set it down
    rig.style.transition = "transform .18s ease";
    rig.style.transform = "translateY(3px)";

    bomb = document.createElement("span");
    bomb.className = "soon-bomb";
    bomb.style.left = cx + "px";
    bomb.style.top = groundY + "px";
    bomb.innerHTML =
      '<svg width="34" height="42" viewBox="0 0 34 42">' +
        '<path class="fuse" d="M19 9 C 22 3, 28 4, 26 9" fill="none" stroke="#9a8c7a" stroke-width="2" stroke-linecap="round"/>' +
        '<circle class="fuse-spark" cx="26" cy="8.5" r="2.6" fill="#ffd27a"/>' +
        '<circle cx="16" cy="26" r="11" fill="#15110d" stroke="#2a2118" stroke-width="1.5"/>' +
        '<ellipse cx="12" cy="22" rx="3.4" ry="2.1" fill="rgba(255,255,255,.18)"/>' +
        '<rect x="14" y="12" width="4" height="5" rx="1.4" fill="#15110d"/>' +
      '</svg>';
    bomb.style.opacity = "0";
    bomb.style.transition = "opacity .2s ease";
    soon.appendChild(bomb);
    requestAnimationFrame(function () { bomb.style.opacity = "1"; });

    setTimeout(function () {
      rig.style.transform = "translateY(0)";        // stand back up
      setTimeout(function () {
        rig.style.transition = "";                  // make the turn instant
        rig.style.transform = "";
        man.classList.add("sm-flip");               // face left
        man.classList.add("walking");
        var sL = parseFloat(man.style.left) || 0, eL = -MW - 40;
        tween(950, linear, function (k) { man.style.left = (sL + (eL - sL) * k) + "px"; },
          function () { man.classList.remove("walking"); if (man.parentNode) man.remove(); });
        setTimeout(boom, 720);                       // fuse burns while he runs
      }, 170);
    }, 250);
  }

  /* ---------- the blast → COMING SOON ---------- */
  var COLORS = ["#ffffff", "#FFB454", "#F0791E", "#ff4d1a"];
  function boom() {
    var bx = cx, by = groundY;
    if (bomb) {
      bx = parseFloat(bomb.style.left); by = parseFloat(bomb.style.top);
      bomb.classList.add("boom");
      setTimeout(function () { if (bomb && bomb.parentNode) bomb.remove(); }, 220);
    }

    // quick light flash at the bomb
    var flash = document.createElement("div");
    flash.className = "soon-flash";
    flash.style.setProperty("--fx", (bx / W * 100) + "%");
    flash.style.setProperty("--fy", (by / H * 100) + "%");
    soon.appendChild(flash);
    setTimeout(function () { if (flash.parentNode) flash.remove(); }, 520);

    // target = the (laid-out, currently transparent) title box
    var sr = soon.getBoundingClientRect();
    var tr = titleEl.getBoundingClientRect();
    var tCx = tr.left - sr.left + tr.width / 2;
    var tCy = tr.top - sr.top + tr.height / 2;
    var halfW = Math.max(40, tr.width / 2 * 0.92);
    var halfH = Math.max(12, tr.height / 2 * 0.6);

    var ps = [], N = 150;
    for (var i = 0; i < N; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 2.5 + Math.random() * 6.5;
      ps.push({
        x: bx, y: by,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - (2 + Math.random() * 2),  // upward bias
        tx: tCx + (Math.random() * 2 - 1) * halfW,
        ty: tCy + (Math.random() * 2 - 1) * halfH,
        c: COLORS[(Math.random() * COLORS.length) | 0],
        sz: 1.5 + Math.random() * 2.2
      });
    }

    var EXPL = 480, CONV = 720, FADE = 320, total = EXPL + CONV + FADE;
    var t0 = performance.now(), titleShown = false, extrasShown = false;

    (function frame(now) {
      var t = now - t0;
      ctx.clearRect(0, 0, W, H);
      var alpha = t < EXPL + CONV ? 1 : Math.max(0, 1 - (t - (EXPL + CONV)) / FADE);
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        if (t < EXPL) { p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy = p.vy * 0.92 + 0.25; }
        else { p.x += (p.tx - p.x) * 0.12; p.y += (p.ty - p.y) * 0.12; }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x, p.y, p.sz, p.sz);
      }
      ctx.globalAlpha = 1;

      if (!titleShown && t > EXPL + 220) {
        titleShown = true; titleEl.style.opacity = "1"; titleEl.classList.add("soon-in");
      }
      if (!extrasShown && t > EXPL + CONV - 140) {
        extrasShown = true;
        subEl.style.opacity = "1"; subEl.classList.add("soon-in");
        btnEl.style.opacity = "1"; btnEl.classList.add("soon-in");
      }

      if (t < total) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    })(performance.now());
  }
})();
