/* badscandal.com/listen — the bio-link page (17 Sep 2026).
   Everything link-shaped and the stream total come from /listen.json (repo root, served no-store —
   NEVER under assets/, which is immutable for a year). The HTML carries the same values hard-coded
   as the no-JS / failed-fetch fallback: a release edits the JSON and nothing here. Runtime strings
   go through BS_T (js/i18n.js) so ES/PT keep working.

   Counter: main.js's count-up reads data-count-to lazily, when .stat-count scrolls into view, so
   rewriting the attribute here is enough; if it already ran we set the text too.
   Pre-save: release.mode "presave" flips body.presave, the button label and its href. Self-hosted
   Spotify pre-saves are capped at 5 users for new apps (2026), so `presave` is an external URL
   (Feature.fm / HyperFollow / Linkfire). */
(function () {
  "use strict";
  var T = window.BS_T || function (s) { return s; };
  var each = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); };

  function render(m) {
    if (!m) return;

    var links = m.links || {};
    each("[data-link]", function (a) {
      var u = links[a.getAttribute("data-link")];
      if (u) a.href = u;
    });

    var r = m.release;
    if (r) {
      var presave = r.mode === "presave" && r.presave;
      document.body.classList.toggle("presave", !!presave);

      var cover = document.querySelector("[data-rel=cover]");
      if (cover && r.cover) { cover.src = r.cover; if (r.title) cover.alt = r.title + " — cover"; }

      var title = document.querySelector("[data-rel=title]");
      if (title && r.title) title.textContent = r.title;

      var kicker = document.querySelector("[data-rel=kicker]");
      if (kicker && r.kicker) kicker.textContent = T(r.kicker);

      var cta = document.querySelector("[data-rel=cta]");
      if (cta) {
        if (presave) { cta.href = r.presave; cta.textContent = T("Pre-save"); }
        else if (r.cta) { cta.href = r.cta; cta.textContent = T("Listen"); }
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
