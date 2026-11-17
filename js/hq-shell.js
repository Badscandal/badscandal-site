/* BADSCANDAL HQ · the shell (11 Nov 2026, Step 0 of the new look): tabs with their own address
   (#today, #songs, … — the back button works), the bottom bar on phones (Today, Songs, Ads, Money,
   More) and the left rail on desktop, the More sheet, and the refresh button. The last tab is
   remembered on this device. The data itself is js/hq.js + js/hq-pages.js + js/hq-staff.js.
   Messages (the staff desk, 11 Nov 2026) is the tenth tab: in the rail, and in More on phones. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var TABS = ["today", "songs", "ads", "pages", "growth", "releases", "money", "team", "messages"];
  var MORE = ["pages", "growth", "releases", "team", "messages"];
  /* addresses that moved: Fans is a part of the Growth & Fans page since 12 Nov 2026 (Luke: "growth and
     fans can be on the same page"); an old #fans link or bookmark lands on that part */
  var ALIAS = { fans: "growth/fans" };
  var KEY = "bs_hq_tab";

  function tabFromHash() {
    var t = (location.hash || "").replace(/^#/, "").split("/")[0];
    return TABS.indexOf(t) >= 0 ? t : "";
  }
  /* #songs/touchme -> the Touch Me card, #team/nova -> Nova's card, #messages/<id> -> that message
     (it may still be loading: try again for a few seconds). A plain jump: the page no longer
     smooth-scrolls, and scroll-padding-top (hq.html) keeps the card clear of the header, so there is
     no second scrollBy to cancel the first. */
  function subFromHash() { var p = (location.hash || "").replace(/^#/, "").split("/"); return p[1] ? decodeURIComponent(p[1]).replace(/[^a-z0-9-]/gi, "") : ""; }
  function focusSub(tab, sub, tries) {
    var el = sub && document.getElementById((tab === "songs" ? "song-" : tab + "-") + sub);
    if (el) { if (el.tagName === "DETAILS") el.open = true; el.scrollIntoView({ block: "start" }); el.classList.add("pulse"); setTimeout(function () { el.classList.remove("pulse"); }, 1600); return; }
    if (sub && (tries || 0) < 20) setTimeout(function () { focusSub(tab, sub, (tries || 0) + 1); }, 300);
  }
  function show(tab) {
    TABS.forEach(function (t) { var v = $(t); if (v) v.hidden = t !== tab; });
    [].forEach.call(document.querySelectorAll("[data-tab]"), function (a) {
      if (a.getAttribute("data-tab") === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    $("moreBtn").classList.toggle("on", MORE.indexOf(tab) >= 0);
    try { localStorage.setItem(KEY, tab); } catch (e) {}
    closeMore(); closeHealth();
    window.scrollTo(0, 0);
    focusSub(tab, subFromHash());
    /* the chart in Pages measures itself: redraw once it is visible */
    if (tab === "pages") window.dispatchEvent(new Event("resize"));
  }
  function route() {
    var moved = ALIAS[(location.hash || "").replace(/^#/, "").split("/")[0]];
    if (moved) history.replaceState(null, "", location.pathname + location.search + "#" + moved);
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
  /* a deep link opened from scratch (#growth/fans, #songs/touchme, #team/nova…) jumps before the numbers
     above it have loaded, and they then push it out of view: once HQ's first load is in, jump again */
  var firstLoad = true;
  document.addEventListener("hq:refreshed", function () {
    if (!firstLoad) return;
    firstLoad = false;
    var tab = tabFromHash(), sub = subFromHash();
    var el = tab && sub && document.getElementById((tab === "songs" ? "song-" : tab + "-") + sub);
    if (el) el.scrollIntoView({ block: "start" });
  });

  /* More (phones) */
  /* A1 (17 Nov 2026): the sheet used to cover the bar, with Log out exactly where the More button was, so a
     second tap on More ("close it") logged Luke out. Now the bar stays on top while the sheet is open
     (body.more-open), the sheet's items end above it, and More closes it again. */
  function openMore() { $("moreSheet").hidden = false; $("scrim").hidden = false; document.body.classList.add("more-open"); $("moreBtn").setAttribute("aria-expanded", "true"); var a = $("moreSheet").querySelector("a"); if (a) a.focus(); }
  function closeMore() { $("moreSheet").hidden = true; $("scrim").hidden = true; document.body.classList.remove("more-open"); $("moreBtn").setAttribute("aria-expanded", "false"); }
  $("nav").addEventListener("click", function (ev) { var a = ev.target.closest && ev.target.closest("a[data-tab]"); if (a && !$("moreSheet").hidden) closeMore(); });

  /* A1 (17 Nov 2026): the space under every page on phones follows the bottom bar's REAL height and place
     (--navpad, HQLib.navPad), so the bar never covers the end of a page whatever the phone, the text size or
     the app around it. The CSS keeps its fixed 112 px as the least. Desktop's rail: 0. */
  var L = window.HQLib;
  function sizeNav() {
    var n = $("nav"); if (!n || !L) return;
    var r = n.getBoundingClientRect(), vh = window.innerHeight;
    var bar = r.height > 0 && r.width > window.innerWidth / 2 && r.bottom > vh - 60; /* the phone's bar, not the rail */
    document.documentElement.style.setProperty("--navpad", (bar ? L.navPad(r, vh) : 0) + "px");
  }
  window.addEventListener("resize", sizeNav);
  window.addEventListener("orientationchange", sizeNav);
  window.addEventListener("pageshow", sizeNav);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", sizeNav);
  if (window.ResizeObserver) try { new ResizeObserver(sizeNav).observe($("nav")); } catch (e) {}
  document.addEventListener("hq:refreshed", sizeNav);
  sizeNav();
  $("moreBtn").addEventListener("click", function () { if ($("moreSheet").hidden) openMore(); else closeMore(); });
  $("scrim").addEventListener("click", closeMore);
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !$("moreSheet").hidden) { closeMore(); $("moreBtn").focus(); } });
  $("logout2").addEventListener("click", function () { closeMore(); $("logout").click(); });

  /* Data health panel */
  function openHealth() { closeMore(); $("healthSheet").hidden = false; $("scrim").hidden = false; $("healthBtn").setAttribute("aria-expanded", "true"); $("healthRefresh").focus(); }
  function closeHealth() { if ($("healthSheet").hidden) return; $("healthSheet").hidden = true; $("scrim").hidden = true; $("healthBtn").setAttribute("aria-expanded", "false"); }
  $("healthBtn").addEventListener("click", function () { if ($("healthSheet").hidden) openHealth(); else closeHealth(); });
  $("scrim").addEventListener("click", closeHealth);
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !$("healthSheet").hidden) { closeHealth(); $("healthBtn").focus(); } });
  $("healthRefresh").addEventListener("click", function () { $("refresh").click(); });
  /* "Needs attention" items about the Meta key open this panel instead of a tab */
  document.addEventListener("click", function (ev) { var a = ev.target.closest && ev.target.closest("[data-health]"); if (a) { ev.preventDefault(); openHealth(); } });

  /* refresh: spins until every answer is back */
  $("refresh").addEventListener("click", function () {
    var b = $("refresh");
    if (b.classList.contains("spin") || !window.HQ || !window.HQ.refresh) return;
    b.classList.add("spin");
    window.HQ.refresh().then(function () { b.classList.remove("spin"); }, function () { b.classList.remove("spin"); });
  });

  route();

  /* Installable on the home screen (hq.webmanifest) and opens without signal: hq-sw.js keeps a copy
     of this page and its scripts (never the numbers: those come from this device's last good copy). */
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("/hq-sw.js", { scope: "/hq" }).catch(function () {}); });
  }
})();
