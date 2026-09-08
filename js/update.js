/* badscandal.com/updatecleanslate — the CLEANSLATE update page.
   The plug-in's CHECK FOR UPDATE opens this page as /updatecleanslate?v=<installed>&os=<mac|win>.
   Everything version-shaped comes from /cleanslate-version.json (served no-store); the copy lives
   in the HTML. Runtime strings go through BS_T (js/i18n.js) so ES/PT keep working. No JS or a
   failed fetch: the page still reads, with the hard-coded installer links. */
(function () {
  "use strict";
  var T = window.BS_T || function (s) { return s; };
  var params = new URLSearchParams(location.search);
  var installed = (params.get("v") || "").trim();
  var os = (params.get("os") || "").toLowerCase();
  if (os !== "mac" && os !== "win") {
    os = /Mac|iPhone|iPad/.test(navigator.platform + " " + navigator.userAgent) ? "mac" : "win";
  }

  var head = document.getElementById("upd-head");
  var sub = document.getElementById("upd-sub");
  var dl = { mac: document.getElementById("dl-mac"), win: document.getElementById("dl-win") };

  /* same rule as Source/Licensing/UpdateChecker.cpp: numeric per component, missing = 0, suffix ignored */
  function cmp(a, b) {
    function parts(v) {
      v = String(v || "").trim().replace(/^v/i, "");
      var out = [0, 0, 0], t = v.split(".");
      for (var i = 0; i < 3 && i < t.length; i++) { var m = /^\d+/.exec(t[i]); out[i] = m ? parseInt(m[0], 10) : 0; }
      return out;
    }
    var pa = parts(a), pb = parts(b);
    for (var i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
    return 0;
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }

  function platform() {
    /* the visitor's OS gets the loud button and goes first; labels stay static (.roll rebuilds them) */
    var first = dl[os], other = dl[os === "mac" ? "win" : "mac"];
    if (!first || !other) return;
    first.classList.add("buy-btn"); first.classList.remove("cta-btn");
    other.classList.add("cta-btn"); other.classList.remove("buy-btn");
    if (first.parentNode) first.parentNode.insertBefore(first, other);
  }

  function render(m) {
    platform();
    var latest = m && m.latest ? String(m.latest).trim() : "";
    if (m && m.downloads) {
      if (m.downloads.mac && dl.mac) dl.mac.href = m.downloads.mac;
      if (m.downloads.win && dl.win) dl.win.href = m.downloads.win;
    }
    if (!head || !sub) return;
    if (!latest) {
      head.innerHTML = "CLEANSLATE <span class=\"em\">" + esc(T("updates")) + "</span>.";
      sub.textContent = T("The latest installers are below.");
      return;
    }
    var badge = document.getElementById("upd-latest");
    if (badge && cmp(latest, badge.textContent) > 0) badge.textContent = latest;
    if (installed && cmp(installed, latest) < 0) {
      document.body.classList.add("upd-behind");
      head.innerHTML = esc(T("Update to")) + " <span class=\"em\">" + esc(latest) + "</span> " + esc(T("now")) + ".";
      sub.textContent = T("You are on version") + " " + installed;
    } else if (installed) {
      head.innerHTML = esc(T("You're on the")) + " <span class=\"em\">" + esc(T("latest")) + "</span> " + esc(T("version")) + ".";
      sub.textContent = T("Version") + " " + latest + (m.released ? " · " + T("released") + " " + m.released : "");
    } else {
      head.innerHTML = "CLEANSLATE <span class=\"em\">" + esc(latest) + "</span>";
      sub.textContent = T("Open CLEANSLATE and press CHECK FOR UPDATE in the footer to see your version.");
    }
  }

  fetch("cleanslate-version.json", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(render)
    .catch(function () { render(null); });
})();
