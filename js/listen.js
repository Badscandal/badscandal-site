/* badscandal.com/listen — the bio-link page (17 Sep 2026).
   Everything link-shaped and the stream total come from /listen.json (repo root, served no-store —
   NEVER under assets/, which is immutable for a year). The HTML carries the same values hard-coded
   as the no-JS / failed-fetch fallback: a release edits the JSON and nothing here. Runtime strings
   go through BS_T (js/i18n.js) so ES/PT keep working.

   Counter: main.js's count-up reads data-count-to lazily, when .stat-count scrolls into view, so
   rewriting the attribute here is enough; if it already ran we set the text too.
   Upcoming (24 Oct 2026): release.mode "upcoming" also flips body.presave (store links hide); with a
   `presave` URL the button is PRE-SAVE, without one it is FOLLOW ON SPOTIFY -> release.cta.
   Pre-save: release.mode "presave" flips body.presave, the button label and its href. Self-hosted
   Spotify pre-saves are capped at 5 users for new apps (2026), so `presave` is an external URL
   (Feature.fm / HyperFollow / Linkfire).
   Countdown (25 Oct 2026): release.date "YYYY-MM-DD" + mode "upcoming"/"presave" shows the .cd block,
   counting to MIDNIGHT IN THE VISITOR'S OWN TIME ZONE on that date — stores release at local midnight
   per country, so Dublin and São Paulo each hit zero when the track is actually live for them. At zero
   the page flips itself to OUT NOW + LISTEN (presave URL, else cta) without waiting for a JSON edit.
   Release week (25 Oct 2026): for 7 days from release.date (any mode, so keep `date` set on "out") the
   card gets .is-out — a light circling its edge, the cover fading in, OUT NOW as a shimmering link. */
(function () {
  "use strict";
  var T = window.BS_T || function (s) { return s; };
  var each = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); };
  var LOCALE = { en: "en-IE", es: "es-ES", pt: "pt-BR" }[window.BS_LANG] || "en-IE";
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var RELEASE_WEEK = 7 * 86400000; /* how long after release.date the card keeps its OUT NOW ring */

  /* "2026-12-30" -> local midnight that day, or null. Built from parts, never Date.parse: a bare
     ISO date parses as UTC midnight, which is the wrong moment everywhere west of Greenwich. */
  function localMidnight(s) {
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    return p ? new Date(+p[1], +p[2] - 1, +p[3]) : null;
  }

  function countdown(r, at, cta) {
    var box = document.querySelector("[data-rel=countdown]");
    if (!box) return;
    var dateEl = box.querySelector("[data-cd=date]");
    var n = {};
    each("[data-cd]", function (e) { n[e.getAttribute("data-cd")] = e; });
    var pad = function (v) { return v < 10 ? "0" + v : String(v); };
    var timer = null;

    function out() {
      if (timer) clearInterval(timer);
      var href = r.mode === "out" ? r.cta : (r.presave || r.cta);
      box.querySelector(".cd-grid").hidden = true;
      if (dateEl) {
        var a = document.createElement("a");
        a.className = "cd-now-link";
        a.textContent = T("Out now");
        if (href) { a.href = href; a.target = "_blank"; a.rel = "noopener"; }
        dateEl.textContent = "";
        dateEl.appendChild(a);
        dateEl.classList.add("cd-now");
      }
      if (cta && href) { cta.href = href; cta.textContent = T("Listen"); }
      /* release week: the light runs round the card (css "release week") */
      if (Date.now() - at < RELEASE_WEEK) {
        var card = box.closest(".rel-card");
        if (card) card.classList.add("is-out");
      }
      box.hidden = false;
    }

    function tick() {
      var left = Math.floor((at - Date.now()) / 1000);
      if (left <= 0) { out(); return; }
      var d = Math.floor(left / 86400), h = Math.floor(left % 86400 / 3600),
          m = Math.floor(left % 3600 / 60), s = left % 60;
      n.d.textContent = d < 100 ? pad(d) : String(d);
      n.h.textContent = pad(h); n.m.textContent = pad(m);
      if (n.s.textContent !== pad(s)) {
        n.s.textContent = pad(s);
        if (!reduced) { n.s.classList.remove("cd-tick"); void n.s.offsetWidth; n.s.classList.add("cd-tick"); }
      }
    }

    if (dateEl) {
      var day = at.toLocaleDateString(LOCALE, { day: "numeric", month: "long" });
      dateEl.textContent = T("Out") + " " + day;
    }
    box.hidden = false;
    tick();
    if (at - Date.now() > 0) timer = setInterval(tick, 1000);
  }

  function render(m) {
    if (!m) return;

    var links = m.links || {};
    each("[data-link]", function (a) {
      var u = links[a.getAttribute("data-link")];
      if (u) a.href = u;
    });

    var r = m.release;
    if (r) {
      var upcoming = r.mode === "upcoming";
      var presave = (r.mode === "presave" || upcoming) && r.presave;
      document.body.classList.toggle("presave", !!presave || upcoming);

      var cover = document.querySelector("[data-rel=cover]");
      if (cover && r.cover) { cover.src = r.cover; if (r.title) cover.alt = r.title + " — cover"; }

      var title = document.querySelector("[data-rel=title]");
      if (title && r.title) title.textContent = r.title;

      var kicker = document.querySelector("[data-rel=kicker]");
      if (kicker && r.kicker) kicker.textContent = T(r.kicker);

      var cta = document.querySelector("[data-rel=cta]");
      if (cta) {
        if (presave) { cta.href = r.presave; cta.textContent = T("Pre-save"); }
        else if (upcoming && r.cta) { cta.href = r.cta; cta.textContent = T("Follow on Spotify"); }
        else if (r.cta) { cta.href = r.cta; cta.textContent = T("Listen"); }
      }

      var at = localMidnight(r.date);
      var since = at ? Date.now() - at : -1;
      if (at && (upcoming || r.mode === "presave" || (r.mode === "out" && since >= 0 && since < RELEASE_WEEK))) {
        countdown(r, at, cta);
      }

      var rl = r.links || {};
      each("[data-rel-link]", function (a) {
        var u = rl[a.getAttribute("data-rel-link")];
        if (u) a.href = u;
        else if (a.parentNode) a.parentNode.removeChild(a); /* no link for this store = no row */
      });
    }

    var s = m.streams || {};
    var el = document.getElementById("streams");
    var total = parseInt(s.total, 10) || 0;
    if (el && total > 0) {
      el.setAttribute("data-count-to", String(total));
      if (el.textContent.trim() !== "0") { /* count-up already fired: land on the fresh number */
        el.textContent = total.toLocaleString("en-IE") + (el.getAttribute("data-suffix") || "");
      }
    }
    var asOf = document.getElementById("streams-as");
    if (asOf && s.asOf) asOf.textContent = s.asOf;
  }

  if (!window.fetch) return;
  fetch("listen.json", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(render)
    .catch(function () {});
})();
