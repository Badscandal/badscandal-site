/* BADSCANDAL HQ · the shell (11 Nov 2026, Step 0 of the new look): tabs with their own address
   (#today, #songs, … — the back button works), the bottom bar on phones (Today, Songs, Ads, Money,
   More) and the left rail on desktop, the More sheet, and the refresh button. The last tab is
   remembered on this device. The data itself is js/hq.js + js/hq-pages.js. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var TABS = ["today", "songs", "ads", "pages", "growth", "fans", "releases", "money", "team"];
  var MORE = ["pages", "growth", "fans", "releases", "team"];
  var KEY = "bs_hq_tab";

  function tabFromHash() {
    var t = (location.hash || "").replace(/^#/, "").split("/")[0];
    return TABS.indexOf(t) >= 0 ? t : "";
  }
  function show(tab) {
    TABS.forEach(function (t) { var v = $(t); if (v) v.hidden = t !== tab; });
    [].forEach.call(document.querySelectorAll("[data-tab]"), function (a) {
      if (a.getAttribute("data-tab") === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    $("moreBtn").classList.toggle("on", MORE.indexOf(tab) >= 0);
    try { localStorage.setItem(KEY, tab); } catch (e) {}
    closeMore();
    window.scrollTo(0, 0);
    /* the chart in Pages measures itself: redraw once it is visible */
    if (tab === "pages") window.dispatchEvent(new Event("resize"));
  }
  function route() {
    var t = tabFromHash();
    if (!t) {
      var last = "today";
      try { last = localStorage.getItem(KEY) || "today"; } catch (e) {}
      if (TABS.indexOf(last) < 0) last = "today";
      history.replaceState(null, "", location.pathname + location.search + "#" + last);
      t = last;
    }
    show(t);
  }
  window.addEventListener("hashchange", route);

  /* More (phones) */
  function openMore() { $("moreSheet").hidden = false; $("scrim").hidden = false; $("moreBtn").setAttribute("aria-expanded", "true"); var a = $("moreSheet").querySelector("a"); if (a) a.focus(); }
  function closeMore() { $("moreSheet").hidden = true; $("scrim").hidden = true; $("moreBtn").setAttribute("aria-expanded", "false"); }
  $("moreBtn").addEventListener("click", function () { if ($("moreSheet").hidden) openMore(); else closeMore(); });
  $("scrim").addEventListener("click", closeMore);
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !$("moreSheet").hidden) { closeMore(); $("moreBtn").focus(); } });
  $("logout2").addEventListener("click", function () { closeMore(); $("logout").click(); });

  /* refresh: spins until all three answers are back */
  $("refresh").addEventListener("click", function () {
    var b = $("refresh");
    if (b.classList.contains("spin") || !window.HQ || !window.HQ.refresh) return;
    b.classList.add("spin");
    window.HQ.refresh().then(function () { b.classList.remove("spin"); }, function () { b.classList.remove("spin"); });
  });

  route();
})();
