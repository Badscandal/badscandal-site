/* badscandal.com/listen — the bio-link page (17 Sep 2026).
   Everything link-shaped and the stream total come from /listen.json (repo root, served no-store —
   NEVER under assets/, which is immutable for a year). The HTML carries the same values hard-coded
   as the no-JS / failed-fetch fallback: a release edits the JSON and nothing here. Runtime strings
   go through BS_T (js/i18n.js) so ES/PT keep working.

   Counter: main.js's count-up reads data-count-to lazily, when .stat-count scrolls into view, so
   rewriting the attribute here is enough; if it already ran we set the text too.
   Upcoming (24 Oct 2026): release.mode "upcoming" flips body.upcoming (store links hide) and the
   button is FOLLOW ON SPOTIFY -> release.cta (the artist profile). NO PRE-SAVE LINKS, ever (team
   rule since 10 Nov 2026); the old "presave" mode and field are gone.
   Countdown (25 Oct 2026): release.date "YYYY-MM-DD" + mode "upcoming" shows the .cd block,
   counting to MIDNIGHT IN THE VISITOR'S OWN TIME ZONE on that date — stores release at local midnight
   per country, so Dublin and São Paulo each hit zero when the track is actually live for them. At zero
   the page flips itself to OUT NOW + LISTEN (-> cta) without waiting for a JSON edit.
   Release week (25 Oct 2026): for 7 days from release.date (any mode, so keep `date` set on "out") the
   card gets .is-out — a light circling its edge, the cover fading in, OUT NOW as a shimmering link.
   Out (11 Nov 2026): once a release is out the card keeps saying "Out now", after the release week
   too (no "Released <date>" line on the public page: Luke wants that wording in /hq only). At zero in "upcoming" mode the button and the
   OUT NOW link go to the song's Spotify track when /songs.json has one, else to our own song page
   (/<slug>), never just the artist profile; body.upcoming comes off. Under the card, "Out now"
   lists every released song in /songs.json (date reached in the visitor's time zone AND
   spotifyTrack set), each linking to our own page with data-link="<slug>" so js/count.js counts
   the tap (/hq -> Pages -> Home page). */
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

  function longDate(at, month) {
    try { return at.toLocaleDateString(LOCALE, { day: "numeric", month: month || "long", year: "numeric" }); } catch (e) { return ""; }
  }
  function isTrack(u) { return /^https:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]+/.test(u || ""); }

  /* The card's song in /songs.json: same cover file, else same title, else same release day. */
  function songOf(r, songs) {
    var low = function (v) { return String(v || "").trim().toLowerCase(); };
    var by = function (fn) { return songs.filter(fn)[0]; };
    return by(function (x) { return r.cover && x.cover === r.cover; }) ||
      by(function (x) { return r.title && low(x.title) === low(r.title); }) ||
      by(function (x) { return r.date && x.date === r.date; }) || null;
  }

  /* Where LISTEN goes once the song is out. Mode "out": release.cta (set by hand on release day).
     Still "upcoming" in the JSON (the flip at zero): the track from /songs.json, else our own
     song page; the artist profile only when the song isn't in the list at all. */
  function outLink(r, song) {
    if (r.mode !== "upcoming" || !song) return { href: r.cta };
    if (isTrack(song.spotifyTrack)) return { href: song.spotifyTrack };
    return { href: "/" + song.slug, own: song.slug };
  }
  function point(a, l) {
    a.href = l.href;
    if (l.own) { a.removeAttribute("target"); a.removeAttribute("rel"); a.setAttribute("data-link", l.own); }
    else { a.target = "_blank"; a.rel = "noopener"; }
  }

  /* out for more than the release week: no ring, no shimmer, but it still says so */
  function settled(at) {
    var box = document.querySelector("[data-rel=countdown]");
    if (!box) return;
    var grid = box.querySelector(".cd-grid"), dateEl = box.querySelector("[data-cd=date]");
    if (grid) grid.hidden = true;
    if (dateEl) dateEl.textContent = T("Out now");
    box.hidden = false;
  }

  function countdown(r, at, cta, song) {
    var box = document.querySelector("[data-rel=countdown]");
    if (!box) return;
    var dateEl = box.querySelector("[data-cd=date]");
    var n = {};
    each("[data-cd]", function (e) { n[e.getAttribute("data-cd")] = e; });
    var pad = function (v) { return v < 10 ? "0" + v : String(v); };
    var timer = null;

    function out() {
      if (timer) clearInterval(timer);
      var l = outLink(r, song);
      box.querySelector(".cd-grid").hidden = true;
      if (dateEl) {
        var a = document.createElement("a");
        a.className = "cd-now-link";
        a.textContent = T("Out now");
        if (l.href) point(a, l);
        dateEl.textContent = "";
        dateEl.appendChild(a);
        dateEl.classList.add("cd-now");
      }
      if (cta && l.href) { point(cta, l); cta.textContent = T("Listen"); }
      document.body.classList.remove("upcoming"); /* it's out: the whole page says so, not half of it */
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

  /* "Out now" under the card: every song in /songs.json whose day has come here and that has
     its Spotify track link. Each row goes to OUR page (/<slug>), which has the Spotify button. */
  function outList(songs) {
    var box = document.querySelector("[data-outs]"), ul = box && box.querySelector("ul");
    if (!ul) return;
    var now = Date.now();
    var live = songs.filter(function (x) {
      var at = localMidnight(x.date);
      return at && at <= now && isTrack(x.spotifyTrack) && /^[a-z0-9]+$/.test(x.slug || "") && x.title;
    }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    if (!live.length) return;
    ul.textContent = "";
    live.forEach(function (x) {
      var li = document.createElement("li"), a = document.createElement("a");
      a.className = "out-row";
      a.href = "/" + x.slug;
      a.setAttribute("data-link", x.slug);
      var art = x.coverWeb || x.cover;
      if (art) {
        var img = document.createElement("img");
        img.className = "out-art"; img.src = art; img.alt = ""; img.width = 48; img.height = 48;
        img.loading = "lazy"; img.decoding = "async";
        a.appendChild(img);
      }
      var t = document.createElement("span"); t.className = "out-t"; t.textContent = x.title; a.appendChild(t);
      var d = document.createElement("span"); d.className = "out-d"; d.textContent = longDate(localMidnight(x.date), "short"); a.appendChild(d);
      li.appendChild(a); ul.appendChild(li);
    });
    box.hidden = false;
  }

  /* "September 2026" (listen.json, English) -> the page language */
  var MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  function monthYear(v) {
    var p = /^\s*([A-Za-z]+)\s+(\d{4})\s*$/.exec(v || ""), i = p ? MONTHS.indexOf(p[1].toLowerCase()) : -1;
    if (i < 0 || !window.BS_LANG || window.BS_LANG === "en") return v;
    try { return new Date(+p[2], i, 1).toLocaleDateString(LOCALE, { month: "long", year: "numeric" }); } catch (e) { return v; }
  }

  function render(m, songs) {
    outList(songs);
    var asOf = document.getElementById("streams-as");
    var as = (m && m.streams && m.streams.asOf) || (asOf && asOf.textContent);
    if (asOf && as) asOf.textContent = monthYear(as);
    if (!m) return;

    var links = m.links || {};
    each("[data-link]", function (a) {
      var u = links[a.getAttribute("data-link")];
      if (u) a.href = u;
    });

    var r = m.release;
    if (r) {
      var upcoming = r.mode === "upcoming";
      document.body.classList.toggle("upcoming", upcoming);

      var cover = document.querySelector("[data-rel=cover]");
      if (cover && r.cover) { cover.src = r.cover; if (r.title) cover.alt = r.title + " — cover"; }

      var title = document.querySelector("[data-rel=title]");
      if (title && r.title) title.textContent = r.title;

      var kicker = document.querySelector("[data-rel=kicker]");
      if (kicker && r.kicker) kicker.textContent = T(r.kicker);

      var cta = document.querySelector("[data-rel=cta]");
      if (cta) {
        if (upcoming && r.cta) { cta.href = r.cta; cta.textContent = T("Follow on Spotify"); }
        else if (r.cta) { cta.href = r.cta; cta.textContent = T("Listen"); }
      }

      var rl = r.links || {};
      each("[data-rel-link]", function (a) {
        var u = rl[a.getAttribute("data-rel-link")];
        if (u) a.href = u;
        else if (a.parentNode) a.parentNode.removeChild(a); /* no link for this store = no row */
      });
      each(".rel-links", function (p) { if (!p.querySelector("a")) p.hidden = true; }); /* and no empty gap */

      var at = localMidnight(r.date);
      var since = at ? Date.now() - at : -1;
      if (at && (upcoming || (r.mode === "out" && since >= 0 && since < RELEASE_WEEK))) {
        countdown(r, at, cta, songOf(r, songs));
      } else if (at && r.mode === "out" && since >= RELEASE_WEEK) {
        settled(at);
      }
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
  }

  if (!window.fetch) return;
  /* both files are tiny, same-origin and no-store; a missing one just leaves its part as it is */
  function get(u) {
    return fetch(u, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  Promise.all([get("listen.json"), get("songs.json")]).then(function (a) {
    render(a[0], (a[1] && Array.isArray(a[1].songs) && a[1].songs) || []);
  }).catch(function () {});
})();
