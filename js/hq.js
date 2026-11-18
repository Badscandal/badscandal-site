/* BADSCANDAL HQ: the one dashboard (11 Nov 2026; /admin, /admin.html and /stats 301 here).
   This file: the login (the same /api/admin/login password, cookie and lockout as /admin had), the
   sheet side (/api/hq/data: Today, Growth, Fans, Releases, Money, Team, the combined cap) and the
   all-songs page side (/api/admin/overview: Today's yesterday, Songs, Ads). The Pages section is
   js/hq-pages.js (/api/admin/data), which uses window.HQ from here.
   The staff desk (/api/staff/board: Team's bot cards, Messages, "Money coming in") is js/hq-staff.js.
   Speed: the answers are asked for at the same time and each section is drawn the moment its own
   answer arrives, Today first. ?sample=1 = made-up numbers everywhere, under the SAMPLE banner.
   The page still can't change an ad, a post, the sheet or any money. The ONLY things it writes
   (11 Nov 2026, js/hq-staff.js) are Luke's own messages on the board, the bots' key switch and the
   release pipeline (a release's files and details, sending it, its date, its steps) on the desk. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var sample = /[?&]sample=1/.test(location.search);
  var sheet = null, ov = null, started = false;

  /* ---------- helpers (shared with hq-pages.js through window.HQ) ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(n) { return n == null ? "–" : Math.round(Number(n)).toLocaleString("en-US"); }
  function signed(n) { return n == null ? "–" : (n > 0 ? "+" : "") + fmt(n); }
  function money(n, cur) {
    if (n == null) return "–";
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD", currencyDisplay: "code" }).format(n); }
    catch (e) { return Number(n).toFixed(2) + " " + (cur || ""); }
  }
  /* one rule with js/hq-lib.js: a Sheet deadline that isn't YYYY-MM-DD is shown as written (A1, 17 Nov 2026) */
  var L = window.HQLib;
  function day(d) { return d ? L.day(d) : "–"; }
  function spToday() { try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } }
  function monthName(m) { return new Date(m + "-15T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }); }
  function link(url, text) { return /^https:\/\//.test(url || "") ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(text) + "</a>" : esc(text); }
  function spark(series) {
    if (!series || series.length < 2) return "";
    var vs = series.map(function (p) { return p.v; }), lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs), span = hi - lo || 1;
    var pts = series.map(function (p, i) { return (i / (series.length - 1) * 100).toFixed(2) + "," + (40 - ((p.v - lo) / span) * 36).toFixed(2); }).join(" ");
    return '<svg class="spark" viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="#F2F2F2" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';
  }
  function amounts(o) { var k = Object.keys(o || {}); return k.length ? k.map(function (c) { return money(o[c], c); }).join(" + ") : "–"; }
  function flat(block) {
    var t = {};
    Object.keys(block || {}).forEach(function (c) { Object.keys(block[c]).forEach(function (cur) { t[cur] = Math.round(((t[cur] || 0) + block[c][cur]) * 100) / 100; }); });
    return t;
  }
  function ago(ms) {
    var m = Math.round(ms / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    var h = Math.round(m / 60);
    return h < 48 ? h + " h ago" : Math.round(h / 24) + " days ago";
  }
  function ordinal(n) { var x = ["th", "st", "nd", "rd"], v = n % 100; return n + (x[(v - 20) % 10] || x[v] || x[0]); }
  function adKey(s) { var v = String(s || ""); try { v = v.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {} return v.toLowerCase().replace(/[^a-z0-9]/g, ""); }
  /* phones: each wide-table row becomes a card, every value labelled from the header row */
  function stack(id) {
    var t = $(id), rows = t.rows, head = [], r, c;
    if (!rows.length || !rows[0].querySelector("th")) return;
    rows[0].className = "hd";
    for (c = 0; c < rows[0].cells.length; c++) head.push(rows[0].cells[c].textContent);
    for (r = 1; r < rows.length; r++) for (c = 0; c < rows[r].cells.length; c++) {
      var td = rows[r].cells[c], v = document.createElement("div");
      while (td.firstChild) v.appendChild(td.firstChild);
      td.appendChild(v); td.setAttribute("data-l", head[c] || "");
    }
  }
  function getJSON(url, tried) {
    return fetch(url, { credentials: "same-origin", cache: "no-store" })
      .then(function (r) {
        /* one 401 is retried once (18 Nov 2026): a phone sometimes drops the cookie on a single call */
        if (r.status === 401 && !tried) return new Promise(function (ok) { setTimeout(ok, 600); }).then(function () { return getJSON(url, 1); });
        return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j, u: url }; });
      });
  }

  /* the page's only writes (js/hq-staff.js): same cookie, our own origin; answers like getJSON */
  function postJSON(url, body) {
    return fetch(url, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j, u: url }; }); });
  }
  /* plain text to the clipboard, with the old-browser fallback */
  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback() { var t = document.createElement("textarea"); t.value = text; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); done(); } catch (e) {} document.body.removeChild(t); }
  }
  /* a table and the glass tile around it: an empty table hides its tile (and its heading) */
  function setTable(id, html) {
    var t = $(id), wrap = t.closest("[data-wrap]") || t.closest(".tile");
    t.innerHTML = html || "";
    if (wrap) wrap.hidden = !html;
    if (html) stack(id);
  }
  function staffBoard() { return window.HQStaff ? window.HQStaff.board() : null; }

  /* ---------- the range shared by Songs, Ads and Pages ---------- */
  /* São Paulo "today" and the 1st of its month, for "This month" (a custom range under the hood) */
  function spToday() { try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } }
  var state = { range: "7d", from: "", to: "" };
  try {
    var saved = JSON.parse(localStorage.getItem("bs_admin_view") || "{}");
    if (/^(today|7d|30d)$/.test(saved.range)) state.range = saved.range;
    if (saved.range === "month") { state.range = "custom"; state.to = spToday(); state.from = state.to.slice(0, 8) + "01"; }
  } catch (e) {}
  function isMonth() { var t = spToday(); return state.range === "custom" && state.to === t && state.from === t.slice(0, 8) + "01"; }
  function rangeQuery() {
    var q = new URLSearchParams({ range: state.range });
    if (state.range === "custom") { if (state.from) q.set("from", state.from); if (state.to) q.set("to", state.to); }
    if (sample) q.set("sample", "1");
    return q;
  }
  function syncRangeSelects() {
    var v = isMonth() ? "month" : state.range;
    [].forEach.call(document.querySelectorAll("[data-range]"), function (s) { s.value = v; });
    var c = $("rangeCustom");
    if (c) { c.hidden = v !== "custom"; if (state.from) $("rFrom").value = state.from; if (state.to) $("rTo").value = state.to; }
  }
  /* range: today | 7d | 30d | month | custom (from, to) */
  function setRange(range, from, to) {
    if (range === "month") { to = spToday(); from = to.slice(0, 8) + "01"; }
    state.range = range === "month" ? "custom" : range; state.from = from || state.from; state.to = to || state.to;
    try { var v = JSON.parse(localStorage.getItem("bs_admin_view") || "{}"); v.range = range; localStorage.setItem("bs_admin_view", JSON.stringify(v)); } catch (e) {}
    syncRangeSelects();
    loadOverview();
    if (window.HQPages) window.HQPages.reload();
  }
  document.addEventListener("change", function (ev) {
    if (!ev.target.matches) return;
    if (ev.target.matches("[data-range]")) {
      var v = ev.target.value;
      if (v === "custom") { $("rangeCustom").hidden = false; $("rFrom").value = state.from || spToday().slice(0, 8) + "01"; $("rTo").value = state.to || spToday(); $("rFrom").focus(); return; }
      setRange(v);
    }
    if (ev.target.id === "rFrom" || ev.target.id === "rTo") { var f = $("rFrom").value, t = $("rTo").value; if (f && t) setRange("custom", f <= t ? f : t, f <= t ? t : f); }
  });

  /* ---------- login (same endpoint, password, cookie and lockout as before) ---------- */
  /* why the login appeared (A1, 17 Nov 2026: "HQ signs me out after about 3 minutes"): the Log out button,
     or an answer saying "not logged in" while HQ was showing. Kept on this device (not swept by Log out) and
     said on the login form for a day, so the next sign-out can be traced; a good login clears it. */
  var SIGNOUT = "bs_hq_signout";
  function noteSignout(why, what) { try { localStorage.setItem(SIGNOUT, JSON.stringify({ at: Date.now(), why: why, what: what || "" })); } catch (e) {} }
  function signoutLine() { try { return L.signoutWords(JSON.parse(localStorage.getItem(SIGNOUT) || "null"), Date.now()); } catch (e) { return ""; } }
  function showLogin(msg) {
    $("shell").hidden = true;
    $("login").hidden = false; $("boot").hidden = true;
    $("err").textContent = msg || signoutLine();
    clearInterval(timer);
    started = false;
    if (window.HQPages) window.HQPages.stop();
    setTimeout(function () { $("pw").focus(); }, 50);
    /* the HQ apps (js/hq-app.js, 12 Nov 2026): the login form is showing */
    try { document.dispatchEvent(new CustomEvent("hq:login")); } catch (e) {}
  }
  function showShell() {
    var was = $("shell").hidden;
    $("login").hidden = true; $("shell").hidden = false; $("boot").hidden = true;
    /* the CRT wordmark (js/crt.js) measured itself while the shell was hidden: let it measure again */
    if (was) setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 0);
  }
  $("loginForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var btn = $("go");
    btn.disabled = true;
    $("err").textContent = "";
    fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ password: $("pw").value }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (res.s === 200) { $("pw").value = ""; try { localStorage.removeItem(SIGNOUT); } catch (e) {} start(); return; }
        if (res.s === 401) $("err").textContent = "Wrong password." + (res.j.left != null ? " " + res.j.left + " tries left." : "");
        else $("err").textContent = res.j.error || "Couldn't log in (" + res.s + ").";
      })
      .catch(function () { btn.disabled = false; $("err").textContent = "No connection. Try again."; });
  });
  /* Logging out forgets the numbers kept on this device too (every bs_hq_last_* and bs_hq_seen):
     without a session, even offline, the page must not show the last numbers again. */
  function forget() {
    sheet = null; ov = null; curSeen = null; sinceShown = false; net = {};
    if (window.HQStaff) window.HQStaff.clear();
    try {
      var gone = [];
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && (k.indexOf("bs_hq_last_") === 0 || k === SEEN)) gone.push(k); }
      gone.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
  }
  /* inside the HQ apps, the device stops getting alerts first (js/hq-app.js: unregister while the login
     still works, then the app clears its badge); in a browser that is nothing */
  $("logout").addEventListener("click", function () {
    noteSignout("button");
    var first = window.HQAppPage && window.HQAppPage.beforeLogout ? window.HQAppPage.beforeLogout() : null;
    Promise.resolve(first).catch(function () {})
      .then(function () { return fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" }).catch(function () {}); })
      .then(function () { forget(); showLogin(""); });
  });
  /* any 401 / 503 from any of the three answers lands here.
     One endpoint saying "not logged in" is not a sign-out (18 Nov 2026: phones were dropped after a
     few minutes when a single answer 401'd). getJSON already retries that call once. Two different
     answers, or the same one twice in a refresh, is a real sign-out. The password stays in the form. */
  var denied = {};
  function authFail(res) {
    if (res.s === 401) {
      var path = String(res.u || "").split("?")[0];
      denied[path] = (denied[path] || 0) + 1;
      if (Object.keys(denied).length < 2 && denied[path] < 2) return false;
      if (!$("shell").hidden) noteSignout("401", res.u);
      showLogin("");
      return true;
    }
    if (res.s === 503 && /ADMIN_KEY/.test((res.j && res.j.error) || "")) { showLogin("The password isn't set on Netlify yet (ADMIN_KEY)."); return true; }
    return false;
  }

  /* ---------- loading: three answers in parallel, each drawn as it lands ---------- */
  var EVERY = 5 * 60 * 1000, timer = null, lastRefresh = 0, sheetProblem = "";
  /* when HQ's own data last answered with a good login (the sheet or the overview, 200): the HQ apps
     take "logged in" from this, never from another answer (js/hq-app.js, 12 Nov 2026) */
  var dataOkAt = 0;
  function start() {
    started = true;
    /* never a blank black page: a device that has numbers kept (so it was logged in) gets the shell
       at once with placeholders; a first visit sees "Loading…" until the first answer says who it is */
    if (kept("bs_hq_last_sheet") || kept("bs_hq_last_ov") || kept("bs_hq_last_staff")) showShell(); else $("boot").hidden = false;
    $("sample").hidden = !sample;
    syncRangeSelects();
    refresh();
    clearInterval(timer);
    timer = setInterval(function () { if (!document.hidden) refresh(); }, EVERY);
    /* while the page is open, touch the login cookie so a phone does not drop it mid-task.
       Still the same HttpOnly cookie: nothing readable is stored here. */
    setInterval(function () {
      if (document.hidden || $("shell").hidden) return;
      getJSON("/api/admin/session").then(function (r) { if (r && r.s === 401) authFail(r); }, function () {});
    }, 2 * 60 * 1000);
  }
  /* every 5 minutes while the page is on screen; coming back after longer than that refreshes at once */
  document.addEventListener("visibilitychange", function () { if (!document.hidden && started && Date.now() - lastRefresh > EVERY) refresh(); });
  function refresh() {
    denied = {};
    var startedAt = lastRefresh = Date.now();
    /* the board may be the only answer that came back: Today still says what it knows */
    var after = function () {
      drawDataHealth(); if (sheet || ov) drawSince(); else drawBriefing();
      /* the HQ apps (js/hq-app.js, 12 Nov 2026): the answers are in. loggedIn = HQ's own data answered
         with a good login during THIS refresh and the login form isn't showing; startedAt lets the page
         drop a refresh that began before a Log out */
      var loggedIn = dataOkAt >= startedAt && $("login").hidden;
      try { document.dispatchEvent(new CustomEvent("hq:refreshed", { detail: { loggedIn: loggedIn, startedAt: startedAt } })); } catch (e) {}
    };
    return Promise.all([loadInstagram(), loadSheet(), loadOverview(), window.HQPages ? window.HQPages.reload() : null, window.HQStaff ? window.HQStaff.reload() : null]).then(after, after);
  }

  /* ---------- the last good numbers, kept on this device for offline ("as of <time>") ---------- */
  function keep(key, q, j) { if (sample) return; try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), q: q, j: j })); } catch (e) {} }
  function kept(key, q) { if (sample) return null; try { var v = JSON.parse(localStorage.getItem(key) || "null"); return v && v.j && (q == null || v.q === q) ? v : null; } catch (e) { return null; } }
  var net = {}; /* part -> { msg, asOf } */
  function hhmm(at) { return new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }); }
  function netState(part, msg, asOf) {
    if (msg) net[part] = { msg: msg, asOf: asOf || null }; else delete net[part];
    var parts = Object.keys(net), bar = $("netBar");
    bar.hidden = !parts.length;
    if (!parts.length) { $("dot").className = "livedot"; return; }
    var offline = parts.every(function (k) { return net[k].msg === "offline"; });
    var asOf = parts.map(function (k) { return net[k].asOf; }).filter(Boolean).sort()[0];
    bar.className = "netbar" + (offline ? " offline" : "");
    $("netMsg").textContent = offline ? (asOf ? "Offline · showing the numbers as of " + hhmm(asOf) + " SP" : "Offline · no numbers saved on this device yet")
      : parts.map(function (k) { return net[k].msg === "offline" ? "" : net[k].msg; }).filter(Boolean).join(" ") + (asOf ? " Showing the numbers as of " + hhmm(asOf) + " SP." : "");
    $("dot").className = "livedot off";
    $("when").textContent = offline ? "offline" : "problem";
  }
  $("retry").addEventListener("click", function () { refresh(); });

  function loadSheet() {
    return getJSON("/api/hq/data" + (sample ? "?sample=1" : "")).then(function (res) {
      if (authFail(res)) return;
      if (res.s === 200) dataOkAt = Date.now();
      showShell();
      $("sample").hidden = !sample;
      if (res.s !== 200) {
        var old = kept("bs_hq_last_sheet");
        if (old) { sheet = old.j; drawSheet(); }
        sheetProblem = "Couldn't load (" + res.s + ")";
        netState("sheet", "Couldn't load the sheet numbers (" + res.s + ").", old && old.at);
        return;
      }
      netState("sheet", null);
      if (res.j.error) { sheetProblem = "Can't be read: " + res.j.error; offSheet("Couldn't read the sheet: " + res.j.error + "."); return; }
      if (!res.j.connected) { sheetProblem = "Not connected (" + (res.j.need || []).join(", ") + " missing on Netlify)"; offSheet("The sheet sections read the bots' \"BADSCANDAL HQ\" sheet. Still to add on Netlify: " + (res.j.need || []).join(" and ") + "."); return; }
      sheetProblem = "";
      $("sheetOff").hidden = true;
      sheet = res.j;
      keep("bs_hq_last_sheet", "", sheet);
      drawSheet();
    }).catch(function () {
      /* no answer at all (offline, or the request died): ALWAYS show the shell, with the last good
         numbers if this device has them, else the "Offline · no numbers saved" line. Never black. */
      var old = kept("bs_hq_last_sheet");
      showShell();
      if (old && !sheet) { sheet = old.j; drawSheet(); }
      netState("sheet", "offline", old && old.at);
    });
  }
  function offSheet(msg) {
    sheet = null;
    $("sheetOff").hidden = false; $("sheetOffMsg").textContent = msg;
    ["errToday", "errSongs", "errGrowth", "errFans", "errReleases", "errMoney", "errTeam"].forEach(function (id) { $(id).hidden = true; });
    $("growthList").innerHTML = $("relList").innerHTML = '<p class="empty">This fills in once the sheet is connected.</p>';
    ["fanTable", "moneyTable", "teamTable", "taskTable"].forEach(function (id) { setTable(id, ""); });
    $("moneyDetail").innerHTML = "";
    $("teamSub").textContent = "";
    drawLive();
    drawSongs(); drawCapCard();
    if (window.HQStaff) window.HQStaff.drawReleases(); /* the desk's releases don't need the sheet */
  }
  $("showSample").addEventListener("click", function () { location.search = "?sample=1"; });

  function loadOverview() {
    var q = rangeQuery().toString();
    /* the range may change while this is on its way (two quick picks, or the 5-minute refresh): an
       answer for an older range is dropped, the newer request draws */
    var stale = function () { return q !== rangeQuery().toString(); };
    return getJSON("/api/admin/overview?" + q).then(function (res) {
      if (authFail(res)) return;
      if (res.s === 200) dataOkAt = Date.now();
      showShell();
      if (stale()) return;
      if (res.s !== 200) {
        var old = kept("bs_hq_last_ov", q);
        if (old) { ov = old.j; drawOverview(); }
        netState("ov", "Couldn't load the page numbers (" + res.s + ").", old && old.at);
        return;
      }
      netState("ov", null);
      ov = res.j;
      keep("bs_hq_last_ov", q, ov);
      $("when").textContent = (sample ? "sample · " : "live · ") + hhmm(Date.now()) + " SP";
      drawOverview();
    }).catch(function () {
      showShell();
      if (stale()) return;
      var old = kept("bs_hq_last_ov", q);
      if (old) { ov = old.j; drawOverview(); }
      netState("ov", "offline", old && old.at);
    });
  }
  function drawOverview() { drawBriefing(); drawSongs(); drawAds(); drawDataHealth(); drawSongTiles(); }

  /* ---------- Data health: Sheet, Meta, page counter, exchange rate (one dot in the header) ---------- */
  function drawDataHealth() {
    var H = window.HQStaff, o = { sheet: sheet, sheetProblem: sheetProblem, ov: ov, board: staffBoard(), boardProblem: H ? H.problem() : "" };
    if (H) { o.bank = H.bank(); o.bankProblem = H.bankProblem(); } /* the Revolut row (11 Nov 2026) */
    var rows = window.HQLib.healthRows(o);
    var st = window.HQLib.healthState(rows);
    $("hDot").className = "hdot " + st;
    $("healthBtn").setAttribute("aria-label", "Data health: " + (st === "bad" ? "something needs attention" : st === "ok" ? "all fine" : "not everything read yet"));
    $("healthRows").innerHTML = rows.map(function (r) {
      return '<li class="' + r.state + '"><i class="' + r.state + '" aria-hidden="true"></i><b>' + esc(r.label) + "</b><span>" + esc(r.text) + "</span></li>";
    }).join("");
  }

  /* ---------- sheet errors: say so instead of looking empty ---------- */
  var TAB_SECTIONS = { Growth: ["errGrowth"], Songs: ["errSongs"], Royalties: ["errSongs", "errMoney"], Fans: ["errFans"],
    Releases: ["errReleases", "errToday"], Tasks: ["errTeam", "errToday"], Spend: ["errMoney", "errAds"], Income: ["errMoney"] };
  function drawSheetErrors() {
    var msgs = {};
    var errs = (sheet && sheet.sheetErrors) || {};
    Object.keys(errs).forEach(function (tab) {
      var e = errs[tab];
      var line = e.readable ? "Part of the " + tab + " tab can't be read: the sheet shows an error (" + e.first + " in " + e.cells + " cell" + (e.cells > 1 ? "s" : "") + "). The rest is shown."
        : tab + " can't be read: the sheet shows an error (" + e.first + "). Fix the tab in the sheet and it comes back here.";
      (TAB_SECTIONS[tab] || []).forEach(function (id) { (msgs[id] = msgs[id] || []).push(line); });
    });
    ["errToday", "errSongs", "errAds", "errGrowth", "errFans", "errReleases", "errMoney", "errTeam"].forEach(function (id) {
      $(id).hidden = !msgs[id]; $(id).textContent = (msgs[id] || []).join(" ");
    });
  }
  function broken(tab) { var e = sheet && sheet.sheetErrors && sheet.sheetErrors[tab]; return !!(e && !e.readable); }

  function drawSheet() {
    drawSheetErrors();
    drawToday(); drawBriefing(); drawSongs(); drawCapCard(); drawGrowth(); drawFans(); drawReleases(); drawMoney(); drawTeam(); drawDataHealth();
  }

  /* ---------- Today ---------- */
  function capMessage(c) {
    var msg = { ok: money(c.left, c.currency) + " left.", warn: "Getting close: past " + money(c.warn, c.currency) + ".", stop: "Past " + money(c.stop, c.currency) + ": every ad should be off for the rest of the month.", over: "OVER the cap. Every ad must be off now." }[c.status] || "";
    if (c.status === "ok" && c.perDay > 0) msg += " At " + money(c.perDay, c.currency) + " a day " + (c.stopDay ? "the " + fmt(c.stop) + " line comes around day " + c.stopDay + "." : "the month ends under the line.");
    return msg;
  }
  function paintBar(c, fill, warn, stop) {
    var p = function (n) { return Math.min(100, (n / c.amount) * 100) + "%"; };
    $(fill).style.width = p(c.spent); $(warn).style.left = p(c.warn); $(stop).style.left = p(c.stop);
  }
  /* " · on time" only when nothing is late, blocked or warned about (A1, 17 Nov 2026) */
  function nextTrouble(t) {
    var bits = [];
    if (t.late) bits.push(t.late + " step" + (t.late > 1 ? "s" : "") + " late");
    if (t.blocked) bits.push(t.blocked + " blocked");
    if (t.warnings && !t.late) bits.push(t.warnings + " warning" + (t.warnings > 1 ? "s" : ""));
    return bits.length ? ' · <span class="attn">' + esc(bits.join(" · ")) + "</span>" : " · on time";
  }
  function drawToday() {
    var c = sheet.money.cap, attn = c.status !== "ok";
    $("capMonth").textContent = monthName(c.month);
    $("todaySub").textContent = day(sheet.today);
    $("capTile").className = "t-card t-cap " + c.status;
    $("capSpent").innerHTML = esc(money(c.spent, c.currency)) + " <small>of " + esc(fmt(c.amount)) + "</small>";
    paintBar(c, "capFill", "capWarn", "capStop");
    var line = { ok: money(c.left, c.currency) + " left", warn: "Past " + fmt(c.warn) + ": getting close", stop: "Past " + fmt(c.stop) + ": every ad should be off", over: "Over the cap: every ad must be off now" }[c.status] || "";
    var pace = c.status === "ok" && c.perDay > 0 ? (c.stopDay ? "At this pace the " + fmt(c.stop) + " line comes on the " + ordinal(c.stopDay) + "." : "On pace to stay under " + fmt(c.stop) + ".") : "";
    $("capShort").innerHTML = '<b class="' + (attn ? "attn" : "") + '">' + esc(line) + "</b>" + (pace ? " · " + esc(pace) : "");
    var n = sheet.next;
    $("nextSong").textContent = broken("Releases") ? "Can't be read" : n ? n.song : "None set";
    $("nextMsg").innerHTML = broken("Releases") ? '<span class="attn">The Releases tab in the sheet shows an error.</span>' : n ? "<b>" + (n.daysToGo === 0 ? "Out today" : n.daysToGo + " day" + (n.daysToGo === 1 ? "" : "s")) + "</b> · " + esc(day(n.date)) +
      nextTrouble(L.releaseTrouble(n)) : "Tell Nova the next song and a Friday.";
    var mine = sheet.team.forLuke;
    $("forLuke").innerHTML = broken("Tasks") ? '<p class="empty2 attn">The Tasks tab can\'t be read.</p>' : mine.length ? '<ul class="t-list">' + mine.slice(0, 4).map(function (x) {
      return '<li class="' + (x.late ? "late" : "") + '"><span>' + esc(x.task) + '</span><span class="when">' + (x.late ? "late · " : "") + esc(x.deadline ? day(x.deadline) : "") + "</span></li>"; }).join("") + "</ul>"
      : '<p class="empty2">Nothing waiting on you.</p>';
    var du = sheet.team.duties;
    $("dutyBig").innerHTML = broken("Tasks") ? "–" : du.total ? du.done + " <small>of " + du.total + " done</small>" : "–";
    $("dutyMsg").innerHTML = broken("Tasks") ? '<span class="attn">The Tasks tab can\'t be read.</span>' : !du.total ? "No duties logged for today." :
      (du.blocked ? '<span class="attn">' + du.blocked + " blocked</span> · " : "") + (du.late ? '<span class="attn">' + du.late + " late</span> · " : "") + (du.total - du.done - du.blocked - (du.late || 0)) + " to do";
    $("nextTile").disabled = !n || broken("Releases");
  }
  /* ---------- Today as a morning briefing (Stage 2): the rules are in js/hq-lib.js ---------- */
  var lastSummary = "";
  function drawBriefing() {
    var board = staffBoard();
    if (!sheet && !ov && !board) return;
    var L = window.HQLib;
    /* the site's own twice-daily check: one quiet line under the briefing, opening its message */
    var chk = board && board.report ? L.siteCheckLine(board.report, board.today) : "";
    $("siteCheck").hidden = !chk;
    if (chk) { $("siteCheck").textContent = chk + " ›"; $("siteCheck").setAttribute("href", "#messages/" + String(board.report.id || "").replace(/[^a-z0-9]/gi, "")); }
    var att = L.attention({ sheet: sheet, ov: ov, board: board, bank: window.HQStaff ? window.HQStaff.bank() : null }), br = L.briefing({ sheet: sheet, ov: ov, attention: att }), ti = L.tiles({ sheet: sheet, ov: ov });
    var lead = br.slice(0, 1), rest = br.slice(1);
    $("brief").innerHTML = lead.map(function (x) { return "<p>" + esc(x) + "</p>"; }).join("") +
      (rest.length ? '<details class="fold"><summary>The rest of the note</summary>' + rest.map(function (x) { return "<p>" + esc(x) + "</p>"; }).join("") + "</details>" : "");
    $("attnCard").classList.toggle("has", att.length > 0);
    var item = function (a) { return '<li><a href="' + esc(a.href) + '"' + (a.href === "#health" ? " data-health" : "") + ">" + esc(a.text) + "</a></li>"; };
    var top = att.slice(0, 4), moreAtt = att.slice(4);
    $("attnList").innerHTML = att.length ? top.map(item).join("") + (moreAtt.length ? '<li class="foldli"><details class="fold"><summary>' + moreAtt.length + " more</summary><ul class=\"attn-list\">" + moreAtt.map(item).join("") + "</ul></details></li>" : "") : '<li class="calm">Nothing needs attention.</li>';
    $("tilesRange").textContent = ov ? "· " + (ov.range === "today" ? "today" : ov.range === "custom" ? ov.from.slice(5).replace("-", "/") + " to " + ov.to.slice(5).replace("-", "/") : "last " + ov.days + " days") + " for ads and taps" : "";
    $("tiles").innerHTML = ti.map(function (x) {
      var arrow = x.change.dir === "up" ? "▲ " : x.change.dir === "down" ? "▼ " : "";
      return '<div class="htile"><p class="hl">' + esc(x.label) + '</p><p class="hv' + (x.green ? " green" : "") + '">' + esc(x.value) + "</p>" +
        '<p class="hc"><b>' + arrow + esc(x.change.text) + "</b> " + esc(x.vs) + "</p>" + trend(x.series, x.green) + "</div>";
    }).join("");
    lastSummary = L.summaryText({ date: sheet ? day(sheet.today) : day(spToday()), briefing: br, attention: att, tiles: ti });
  }
  /* a small trend line; gaps (no taps that day) are left out, never drawn as 0 */
  function trend(vals, green) {
    var pts = (vals || []).map(function (v, i) { return v == null || !isFinite(v) ? null : [i, v]; }).filter(Boolean);
    if (pts.length < 2) return "";
    var n = vals.length - 1 || 1, lo = Math.min.apply(null, pts.map(function (p) { return p[1]; })), hi = Math.max.apply(null, pts.map(function (p) { return p[1]; })), sp = hi - lo || 1;
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + (p[0] / n * 100).toFixed(1) + " " + (28 - (p[1] - lo) / sp * 24).toFixed(1); }).join("");
    return '<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + '" fill="none" stroke="' + (green ? "#1ED760" : "#B4B4B4") + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }
  /* "Since you last looked": compared with the picture saved when the last visit ended (this device) */
  var SEEN = "bs_hq_seen", sinceShown = false;
  function drawSince() {
    var L = window.HQLib, cur = L.snapshot({ sheet: sheet, ov: ov }), prev = null;
    if (sample) { /* made-up: as if the last visit was 9 hours ago */
      prev = JSON.parse(JSON.stringify(cur)); prev.at = Date.now() - 9 * 3600000;
      var song = Object.keys(prev.streams || {})[0], plat = Object.keys(prev.followers || {})[0];
      if (song) prev.streams[song] -= 1240; if (plat) prev.followers[plat] -= 21;
      if (prev.capSpent != null) prev.capSpent = Math.round((prev.capSpent - 27.48) * 100) / 100; if (prev.fans != null) prev.fans -= 2;
    } else { try { prev = JSON.parse(localStorage.getItem(SEEN) || "null"); } catch (e) {} }
    if (!sinceShown || sample) {
      var list = L.changesSince(prev, cur);
      $("sinceCard").hidden = !prev;
      if (prev) {
        $("sinceWhen").textContent = "· " + L.ago(Date.now() - prev.at);
        $("sinceList").innerHTML = list.length ? list.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") : "<li>Nothing new since then.</li>";
      }
      sinceShown = true;
    }
    curSeen = cur;
  }
  var curSeen = null;
  function saveSeen() { if (curSeen && !sample) try { localStorage.setItem(SEEN, JSON.stringify(curSeen)); } catch (e) {} }
  document.addEventListener("visibilitychange", function () { if (document.hidden) saveSeen(); });
  window.addEventListener("pagehide", saveSeen);
  $("copySummary").addEventListener("click", function () {
    if (!lastSummary) return;
    copyText(lastSummary, function () { $("copied").textContent = "Copied. Paste it into WhatsApp."; setTimeout(function () { $("copied").textContent = ""; }, 4000); });
  });

  /* ---------- Pages: one tile per song page (L6, 17 Nov 2026, Webmaster's #15) ----------
     live or not, what the button does, people and taps for the header's range, whether Meta is receiving THIS
     page's events, and the home card. Rules in HQLib.songTile; the build states come with the board. */
  function drawSongTiles() {
    var box = $("songTiles");
    if (!box) return;
    if (!ov || !ov.songs) { box.innerHTML = ""; return; }
    var b = staffBoard(), today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    var songs = ov.songs.filter(function (x) { return x.id && x.id !== "home" && x.date; });
    if (!songs.length) { box.innerHTML = ""; return; }
    box.innerHTML = '<h3 class="sth">Song pages</h3><div class="stgrid">' + songs.map(function (x) {
      var t = L.songTile(x, { today: today, now: Date.now(), card: ov.homeCard, builds: b && b.pageBuilds });
      return '<div class="tile stile ' + t.tone + '"><div class="sthead"><button type="button" class="stpick" data-page="' + esc(t.id) + '">' + esc(t.title) + '</button>' +
        '<a class="staddr" href="https://' + esc(t.address) + '" target="_blank" rel="noopener">' + esc(t.address) + '</a></div><dl>' +
        t.lines.map(function (l) { return '<div class="' + (l.tone || "") + '"><dt>' + esc(l.label) + '</dt><dd>' + esc(l.text) + '</dd></div>'; }).join("") + '</dl></div>';
    }).join("") + '</div>';
  }
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target.closest(".stpick") : null, sel = $("link");
    if (!t || !sel) return;
    sel.value = t.getAttribute("data-page");
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    var k = document.querySelector("#pages .controls"); if (k && k.scrollIntoView) k.scrollIntoView();
  });

  /* ---------- Songs: the sheet's Spotify numbers + our page + Meta + royalties, one card each ---------- */
  function drawSongs() {
    var bySheet = {}, order = [];
    (sheet ? sheet.songs : []).forEach(function (s) { bySheet[adKey(s.song)] = s; order.push(adKey(s.song)); });
    var byPage = {};
    (ov ? ov.songs : []).forEach(function (s) { byPage[adKey(s.title)] = s; if (order.indexOf(adKey(s.title)) < 0) order.push(adKey(s.title)); });
    var spendBy = {};
    if (ov && ov.spend && ov.spend.connected && !ov.spend.error) ov.spend.songs.forEach(function (s) { spendBy[adKey(s.title)] = s; });
    var cur = ov && ov.spend ? ov.spend.currency : "";
    var rangeTxt = !ov ? "" : ov.range === "today" ? "today" : ov.range === "custom" ? ov.days + " days" : "last " + ov.days + " days";
    var plBy = {};
    if (sheet && sheet.songPL) L.songPLView(sheet.songPL).songs.forEach(function (x) { plBy[adKey(x.song)] = x; });
    /* A8 (17 Nov 2026, Atlas): the artist's Spotify monthly listeners and Brazil's share, with their trend */
    var al = L.artistLines(sheet && sheet.artist);
    $("artistCard").innerHTML = al ? '<div class="tile"><div class="row"><h3>Spotify monthly listeners</h3><span class="lbl">the artist, all songs</span></div><div class="big num">' + esc(al.big) + '</div><div class="d">' + esc(al.sub) + "</div>" + spark(sheet.artist.series) + "</div>" : "";
    if (!order.length) { $("songList").innerHTML = '<p class="empty">' + (ov || sheet ? "No songs yet." : "Loading…") + "</p>"; return; }
    $("songList").innerHTML = order.map(function (k) {
      var s = bySheet[k], p = byPage[k], sp = spendBy[k];
      var name = s ? s.song : p.title;
      var pill = !s ? "" : s.trend === "rising" ? '<span class="pill hot">Rising ' + signed(s.momentum) + "%</span>" : s.trend === "cooling" ? '<span class="pill warn">Cooling ' + signed(s.momentum) + "%</span>" : s.trend === "steady" ? '<span class="pill">Steady ' + signed(s.momentum) + "%</span>" : '<span class="pill">New</span>';
      /* released or not, said in words on the card (the sheet's release date, else our song page's) */
      var rw = HQLib.releaseWords((s && s.released) || (p && p.date), (sheet && sheet.today) || spToday());
      var relPill = rw ? '<span class="pill ' + (rw.out ? "rel" : "") + '">' + esc(rw.pill) + "</span>" : "";
      var out = '<div class="tile" id="song-' + esc(p ? p.id : k) + '"><div class="songhead">' + (p && p.cover ? '<img class="cover" src="' + esc(p.cover) + '" alt="">' : "") + "<h3>" + esc(name) + "</h3>" + (relPill || pill ? '<span class="pills">' + relPill + pill + "</span>" : "") + "</div>";
      /* whose song it is (v2, 11 Nov 2026, Luke: "the current songs section should include if the song is a
         collaborative release with a label like magic and the split of the song"): from the team's desk;
         not recorded yet = "Add its details", which opens the form in Upcoming with the title and day in */
      var deal = HQLib.songDeal(name, s, staffBoard());
      if (deal !== undefined) {
        var dw = HQLib.dealWords(deal), rdate = (s && s.released) || (p && p.date) || "";
        out += '<p class="sdeal' + (dw.known ? "" : " no") + '">' + esc(dw.text) + (dw.known ? "" : ' <button class="linkbtn" type="button" data-adddeal="' + esc(dw.id) + '" data-title="' + esc(name) + '" data-date="' + esc(String(rdate).slice(0, 10)) + '">Add its details</button>') + "</p>";
      }
      if (s) out += '<div class="big num">' + fmt(s.streams) + " <small>streams · " + esc(day(s.lastDay)) + "</small></div>";
      var more = "";
      if (s) more += '<div class="d">' + signed(s.dayChange) + " vs the day before · " + fmt(s.week) + " in 7 days" + (s.prevWeek != null ? " (" + fmt(s.prevWeek) + " the 7 before)" : "") + "</div>" + spark(s.series) +
        '<div class="d">' + fmt(s.listeners) + " listeners · " + fmt(s.saves) + " saves · " + fmt(s.adds) + " playlist adds" + (s.stale > 3 ? ' · <b style="color:var(--paper)">not logged for ' + s.stale + " days</b>" : "") + "</div>";
      else more += '<p class="d" style="margin:8px 0">' + (broken("Songs") ? "The Songs tab can't be read." : sheet ? "No Spotify rows in the sheet yet." : "") + "</p>";
      if (!p && ov) more += '<div class="kv" style="margin-top:8px"><span>Our page</span><b>no song page for this one</b></div>';
      else more += '<div class="kv" style="margin-top:8px"><span>Our page · ' + esc(rangeTxt || "…") + "</span><b>" + (p ? fmt(p.visits) + " visits · " + fmt(p.people) + " people" : "–") + "</b></div>" +
        '<div class="kv"><span>Real Spotify taps</span><b>' + (p ? fmt(p.taps) : "–") + "</b></div>" +
        '<div class="kv"><span>Meta spend · per tap</span><b>' + (sp ? esc(money(sp.spend, cur)) + " · " + esc(money(sp.cpt, cur)) : ov && ov.spend && !ov.spend.connected ? "not connected" : "–") + "</b></div>";
      more += '<div class="kv"><span>Royalties so far</span><b>' + (s ? esc(amounts(s.royalties)) : "–") + "</b></div>" +
        (plBy[k] ? '<div class="kv"><span>Ad spend for this song</span><b>' + esc(plBy[k].adSpend) + "</b></div>" : "") +
        (rw ? '<div class="kv"><span>' + esc(rw.label) + "</span><b>" + esc(rw.line) + "</b></div>" : "");
      return out + '<details class="fold"><summary>Numbers</summary>' + more + "</details></div>";
    }).join("");
  }

  /* ---------- Ads: ONE cap card (combined, Meta-only under it), cost per tap, events health ---------- */
  function drawCapCard() {
    var card = $("capCard");
    if (!sheet) {
      card.className = "tile w12";
      $("capSpent2").textContent = "–"; $("capLeft").textContent = ""; $("capMonth2").textContent = "";
      $("capMsg").textContent = "The combined cap (Meta + Google + TikTok) needs the sheet. Meta alone is below.";
      $("capMeta").innerHTML = "";
      drawMetaOnly(); return;
    }
    var c = sheet.money.cap;
    card.className = "tile w12 " + c.status;
    $("capMonth2").textContent = monthName(c.month);
    $("capSpent2").innerHTML = esc(money(c.spent, c.currency)) + " <small>of " + esc(money(c.amount, c.currency)) + " · " + c.pct + "%</small>";
    $("capLeft").textContent = c.left >= 0 ? money(c.left, c.currency) + " left" : money(-c.left, c.currency) + " over";
    paintBar(c, "capFill2", "capWarn2", "capStop2");
    var msg = capMessage(c);
    /* batch 4 (15 Nov 2026): one figure, at the team's fixed rate; it says which rate, what is missing, and why it
       is an estimate when it is one */
    if (Object.keys(c.native || {}).some(function (k) { return k !== c.currency; })) msg += " Billed: " + amounts(c.native) + ".";
    var rl = window.HQLib.capRateLine(c), ml = window.HQLib.capMissingLine(c);
    if (rl) msg += " " + rl + ".";
    if (ml) msg += " " + ml + ".";
    if (c.estimated) msg += " Estimated: " + (c.estimatedWhy && c.estimatedWhy.length ? c.estimatedWhy.join("; ") : "something is missing") + ".";
    if (c.lastDay) msg += " Last day logged: " + day(c.lastDay) + ".";
    $("capMsg").textContent = msg;
    var src = sheet.money.metaSource, plat = c.byPlatform || {};
    var parts = Object.keys(plat).map(function (p) { return esc(p) + " " + esc(amounts(plat[p])); }).join(" · ");
    $("capMeta").innerHTML = (parts ? "This month: " + parts + ". " : "") + (!src ? "" : src.from === "meta"
      ? "Meta counted from Meta itself; Google and TikTok from the sheet." + (src.mismatch.length ? src.mismatch.map(function (x) { return "<br>" + esc(day(x.d)) + ": Meta " + esc(money(x.meta, x.currency)) + ' · <b class="says">sheet says ' + esc(money(x.sheet, x.currency)) + "</b>"; }).join("") : "")
      : '<b class="says">Meta\'s own numbers couldn\'t be read' + (src.expired ? " (the Meta key has expired)" : "") + ", so Meta comes from the sheet.</b> Reason: " + esc(src.reason));
    drawMetaOnly();
  }
  function drawMetaOnly() {
    var k = ov && ov.cap, el = $("capMetaOnly");
    if (!ov) { el.textContent = "Loading…"; return; }
    if (!k || !k.connected) { el.textContent = "Meta spend not connected (META_ADS_TOKEN on Netlify)."; return; }
    if (k.error) { el.textContent = "Couldn't read Meta: " + k.error; return; }
    var cc = k.capCurrency;
    if (k.status === "currency") { el.textContent = money(k.spent, k.currency) + " this month. The ad account bills in " + k.currency + ", the cap is in " + cc + ", so it isn't compared."; return; }
    var t = money(k.spent, cc) + " this month (" + k.pct + "% of the cap on its own).";
    if (k.perDay > 0) t += " Last days' pace " + money(k.perDay, cc) + "/day" + (k.stopDay ? ": the " + money(k.stop, cc) + " line around day " + k.stopDay + "." : ".");
    if (k.fx) t += " About " + money(k.fx.eur, "EUR") + " at this month's average rate.";
    t += " The ad account's days. Read " + (k.fetched ? k.fetched.slice(11, 16) + " SP" : "") + ", refreshed hourly.";
    el.textContent = t;
  }
  function mtable(el, head, rows) {
    el.innerHTML = rows.length ? "<tr>" + head.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr>" +
      rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return "<td>" + (i === 0 ? c : i === 3 ? "<b>" + esc(c) + "</b>" : esc(c)) + "</td>"; }).join("") + "</tr>"; }).join("")
      : '<tr><td class="empty">Nothing in this period.</td></tr>';
  }
  function drawAds() {
    drawCapCard();
    var sp = ov.spend;
    if (!sp || !sp.connected || sp.error) {
      $("spOn").hidden = true; $("spOff").hidden = false; $("spCur").textContent = "";
      $("spOff").textContent = sp && sp.error ? "Couldn't read Meta spend: " + sp.error : "Meta spend not connected. To connect it, add META_ADS_TOKEN on Netlify (a read-only ads token).";
    } else {
      var c = sp.currency, taps = sp.songs.reduce(function (n, s) { return n + s.taps; }, 0), spent = sp.songs.reduce(function (n, s) { return n + s.spend; }, 0) + (sp.unmatched || 0);
      $("spOff").hidden = true; $("spOn").hidden = false;
      $("spCur").textContent = c ? "in " + c : "";
      $("spSub").textContent = "Meta ad spend (read-only) against people's Spotify taps, " + (ov.range === "today" ? "today" : "last " + ov.days + " days") + ".";
      $("spSpend").textContent = money(spent, c); $("spTaps").textContent = fmt(taps); $("spCpt").textContent = money(taps ? spent / taps : null, c);
      var H = ["Spend", "Taps", "Per tap"];
      mtable($("spAds"), ["Ad"].concat(H), sp.ads.map(function (a) { return [esc(a.ad) + "<small>" + esc(a.song) + "</small>", money(a.spend, c), fmt(a.taps), money(a.cpt, c)]; }));
      mtable($("spSongs"), ["Song"].concat(H), sp.songs.map(function (r) { return [esc(r.title), money(r.spend, c), fmt(r.taps), money(r.cpt, c)]; }));
      mtable($("spAll"), ["Day"].concat(H), sp.days.slice().reverse().map(function (r) { return [esc(day(r.d)), money(r.spend, c), fmt(r.taps), money(r.cpt, c)]; }));
      $("spNote").textContent = "Spend is in the ad account's currency (" + (c || "?") + "), never converted; Meta's days are the ad account's days. Taps are real people only. " +
        (sp.unmatched ? money(sp.unmatched, c) + " of spend couldn't be matched to a song (an ad nobody has visited from yet, without a song name in it). " : "") +
        "Read from Meta " + (sp.fetched ? sp.fetched.slice(11, 16) + " SP" : "") + ", refreshed hourly.";
    }
    drawHealth();
  }
  function drawHealth() {
    var h = ov.health, last = h && h.last, el = $("mstat");
    el.className = "mstat" + (last ? (last.ok ? " ok" : " bad") : "");
    $("mstatTxt").textContent = !last ? "Meta: nothing sent yet" : last.ok ? "Meta: sending OK, last event " + ago(last.agoMs) + (last.test ? " (test mode)" : "") : "Meta: ERROR " + ago(last.agoMs) + ": " + (last.message || last.detail);
    if (!h) { $("hPill").textContent = "No data"; $("hPill").className = "pill"; return; }
    var t = h.today, g = h.range;
    $("hSent").textContent = fmt(t.sent); $("hRec").textContent = fmt(t.received); $("hErr").textContent = fmt(t.errors);
    $("hTaps").textContent = fmt(t.taps) + " / " + fmt(t.tapsReceived);
    $("hRangeLbl").textContent = ov.days === 1 ? "Today, calls to Meta" : "Last " + ov.days + " days";
    $("hRange").textContent = fmt(g.sent) + " sent · " + fmt(g.received) + " accepted · " + fmt(g.errors) + " errors";
    $("hBlocked").textContent = fmt(t.blocked) + " today · " + fmt(g.blocked) + " this period";
    $("hLastOk").textContent = h.lastOk ? h.lastOk.slice(5, 16).replace("-", "/") + " SP" : "none yet";
    var le = h.lastErrorFull;
    $("hLastErr").textContent = le ? le.time.slice(5, 16).replace("-", "/") + " SP · " + le.detail : h.lastError ? h.lastError.time.slice(5, 16).replace("-", "/") + " SP · " + h.lastError.detail : "none";
    $("hErrMsg").hidden = !(le && le.message); $("hErrMsg").textContent = le && le.message ? "Meta said: " + le.message : "";
    $("hTest").hidden = !h.testMode;
    var pill = $("hPill");
    if (t.errors) { pill.textContent = t.errors + " error" + (t.errors > 1 ? "s" : "") + " today"; pill.className = "pill bad"; }
    else if (t.calls) { pill.textContent = "Working"; pill.className = "pill ok"; }
    else { pill.textContent = "Nothing sent today"; pill.className = "pill"; }
  }

  /* ---------- the Instagram reader (B4, 17 Nov 2026), under Growth & Fans ---------- */
  var ig = null, igMsg = "", igBusy = false;
  function loadInstagram() {
    return getJSON("/api/hq/instagram" + (sample ? "?sample=1" : "")).then(function (res) { if (res.s === 200) ig = res.j; drawInstagram(); }, function () { drawInstagram(); });
  }
  function drawInstagram() {
    var box = $("igBox"); if (!box) return;
    if (!ig) { box.innerHTML = ""; return; }
    var st = ig.status || {}, line = L.igStatusLine(st, Date.now()), dis = sample || igBusy ? " disabled" : "";
    var h = '<h3 class="sech">Instagram</h3><p class="sub' + (st.lastError ? " igerr" : "") + '">' + esc(line) + "</p>";
    /* L3 part 1: song questions and repeat fans, from the comments already read. A reply is Luke's. */
    var inbox = ig.fanInbox || { questions: [], repeats: [] };
    var askIds = {};
    (inbox.questions || []).forEach(function (q) { askIds[q.id] = 1; });
    if (st.connected) {
      var qs = inbox.questions || [], rs = inbox.repeats || [];
      h += '<div class="tile faninbox" id="fanInbox"><h3>Fan inbox</h3><p class="sub">' + esc(L.FAN_INTRO) + "</p>";
      if (!qs.length && !rs.length) h += '<p class="d">' + esc(L.FAN_EMPTY) + "</p>";
      if (qs.length) {
        h += "<h3>" + esc(L.FAN_ASK) + " (" + qs.length + ")</h3><ul>";
        qs.forEach(function (q) {
          h += '<li><span class="fanflag' + (q.needsReply ? "" : " ok") + '">' + esc(L.fanFlagWord(q.needsReply)) + '</span> <span class="lbl">' + esc(L.fanKindWord(q.kind)) + "</span> <b>" + esc(q.user) + "</b>: " + esc(q.text) + ' <span class="lbl">on ' + link(q.link, q.postCaption || "a post") + "</span></li>";
        });
        h += "</ul>";
      }
      if (rs.length) {
        h += "<h3>" + esc(L.FAN_BACK) + " (" + rs.length + ")</h3><ul>";
        rs.forEach(function (r) {
          h += "<li>" + (r.needsReply ? '<span class="fanflag">' + esc(L.fanFlagWord(true)) + "</span> " : "") + "<b>" + esc(r.user) + "</b> <span class=\"lbl\">" + r.posts + " post" + (r.posts === 1 ? "" : "s") + "</span>: " + esc(r.lastText) + ' <span class="lbl">on ' + link(r.link, r.postCaption || "a post") + "</span></li>";
        });
        h += "</ul>";
      }
      h += "</div>";
    }
    if (!st.connected || st.errorKind === "refused") {
      h += '<div class="tile"><p class="d">Paste the key from Meta (the Graph API Explorer key after "Extend Access Token", or the Instagram setup\u2019s "Generate token"). HQ checks it with Instagram and keeps it to itself; a Facebook key is swapped for the Page\u2019s own key, which doesn\u2019t run out. Read-only: it can never post or change anything.</p>' +
        '<form class="igform" id="igForm" autocomplete="off"><input type="password" id="igKey" placeholder="The Instagram key" aria-label="The Instagram key"' + dis + '><button class="sendbtn" type="submit"' + dis + ">" + (igBusy ? "Checking…" : "Connect Instagram") + "</button></form>" +
        (igMsg ? '<p class="d" role="status">' + esc(igMsg) + "</p>" : "") + "</div>";
    } else {
      h += '<p class="d"><button class="copybtn" type="button" id="igRead"' + dis + ">" + (igBusy ? "Reading…" : "Read now") + '</button> <button class="linkbtn" type="button" id="igOff"' + dis + ">Disconnect</button>" + (igMsg ? " " + esc(igMsg) : "") + "</p>";
    }
    /* L2: What engages best, per view, every post at the same age, with the ads that boosted each (17 Nov 2026) */
    var rk = ig.ranking;
    function rankItem(r) {
      var x = L.rankParts(r);
      return '<li class="tile"><div class="row"><h3>' + link(r.link, r.caption || "(no caption)") + '</h3><span class="lbl">' + esc(r.type + " · " + day(String(r.at).slice(0, 10)) + " · " + x.window) + '</span></div>' +
        '<div class="big num">' + esc(x.rate) + '</div><div class="d">' + esc(x.views) + '</div><div class="d">' + esc(x.deep) + "</div>" + (x.follows ? '<div class="d">' + esc(x.follows) + "</div>" : "") +
        '<div class="d' + (r.paid ? "" : " muted") + '">' + esc(x.paid) + "</div>" + (x.before ? '<div class="d">' + esc(x.before) + "</div>" : "") + (x.own ? '<div class="d muted">' + esc(x.own) + "</div>" : "") + "</li>";
    }
    if (rk && ((rk.ranked || []).length || (rk.older || []).length)) {
      h += '<h3 class="sech" style="margin-top:14px">What engages best</h3><p class="sub">Every post at the same age (its numbers at 1 day). Engaged = likes, comments, saves and shares ÷ views; our own accounts\u2019 comments don\u2019t count. Paid views bring few engagements, so a boosted post doesn\u2019t win on reach alone. ' +
        (rk.adsAt ? "Ads read " + esc(L.ago(Date.now() - rk.adsAt)) + "." : "The ads that boosted each post show here once HQ has read them (hourly).") +
        (rk.tooFew ? " " + rk.tooFew + " newer post" + (rk.tooFew === 1 ? "" : "s") + " not ranked yet (under " + rk.minViews + " views, or not a day old)." : "") +
        ((rk.ranked || []).length < 10 ? " Fewer than 10 posts compared so far: the order isn\u2019t settled yet." : "") + "</p>";
      if ((rk.ranked || []).length) h += '<ol class="igrank">' + rk.ranked.slice(0, 8).map(rankItem).join("") + "</ol>";
      if ((rk.older || []).length) h += '<details class="tile" style="margin-bottom:12px"><summary>Older posts (' + rk.older.length + "): lifetime numbers, not the same age</summary>" + '<ol class="igrank">' + rk.older.slice(0, 10).map(rankItem).join("") + "</ol></details>";
    }
    var otherAsks = (ig.needsReply || []).filter(function (c) { return !askIds[c.id]; });
    if (otherAsks.length) h += '<div class="tile" style="margin:12px 0"><h3>Needs a reply (' + otherAsks.length + ')</h3><p class="sub">Other questions nobody of ours has answered yet. Replying is yours.</p><ul class="igcomments">' +
      otherAsks.map(function (c) { return "<li><b>" + esc(c.user) + "</b>: " + esc(c.text) + ' <span class="lbl">on ' + link(c.link, c.postCaption || "a post") + "</span></li>"; }).join("") + "</ul></div>";
    /* our own accounts (Nova keeps the list with the instagram tool; Luke sees it here) */
    if (st.connected) h += '<details class="tile" style="margin:12px 0"><summary>Our own accounts (' + (ig.own || []).length + "): their comments don\u2019t count</summary>" +
      '<p class="d">' + esc((ig.own || []).map(function (x) { return "@" + x; }).join(", ")) + '</p><p class="d muted">Nova keeps this list (the connected account is always on it). Ask Nova to add or remove one.</p>' +
      ((ig.ownLog || []).length ? '<ul class="igcomments">' + ig.ownLog.slice(0, 10).map(function (x) { return "<li>" + esc(L.deskWhen(x.at, sheet && sheet.today) + " · " + x.by + " " + (x.action === "add" ? "added" : "removed") + " @" + x.handle) + ' <span class="lbl">' + esc(x.reason) + "</span></li>"; }).join("") + "</ul>" : "") + "</details>";
    if ((ig.posts || []).length) h += '<div class="igposts">' + ig.posts.slice(0, 9).map(function (p) {
      return '<div class="tile igpost"><div class="row"><h3>' + link(p.link, p.caption || "(no caption)") + '</h3><span class="lbl">' + esc((p.type || "post") + " · " + day(p.at.slice(0, 10))) + '</span></div><div class="d">' + esc(L.igPostNumbers(p) || "No numbers yet") + "</div></div>";
    }).join("") + "</div>";
    if ((ig.comments || []).length) h += '<div class="tile" style="margin-top:12px"><h3>Newest comments</h3><ul class="igcomments">' + ig.comments.slice(0, 8).map(function (c) {
      return "<li><b>" + esc(c.user) + "</b>: " + esc(c.text) + ' <span class="lbl">on ' + link(c.link, c.postCaption || "a post") + "</span></li>"; }).join("") + "</ul></div>";
    if ((ig.countries || []).length) h += '<p class="d" style="margin-top:10px">Followers by country: ' + esc(ig.countries.slice(0, 6).map(function (c) { return c.country + " " + fmt(c.count); }).join(" · ")) + "</p>";
    box.innerHTML = h;
  }
  document.addEventListener("submit", function (ev) {
    if (!ev.target || ev.target.id !== "igForm") return;
    ev.preventDefault();
    var v = ($("igKey").value || "").trim(); if (!v) return;
    igBusy = true; igMsg = ""; drawInstagram();
    postJSON("/api/hq/instagram/key", { token: v }).then(function (res) {
      igBusy = false; igMsg = res.s === 200 ? "Connected @" + res.j.username + (res.j.read ? "." : ". The first read didn't work yet: " + (res.j.error || "")) : (res.j && res.j.error) || "Couldn't connect (" + res.s + ").";
      return loadInstagram();
    }, function () { igBusy = false; igMsg = "No connection. Try again."; drawInstagram(); });
  });
  document.addEventListener("click", function (ev) {
    var t = ev.target; if (!t || (t.id !== "igRead" && t.id !== "igOff")) return;
    igBusy = true; igMsg = ""; drawInstagram();
    postJSON("/api/hq/instagram/" + (t.id === "igRead" ? "sync" : "disconnect"), {}).then(function (res) {
      igBusy = false; igMsg = t.id === "igOff" ? "Disconnected." : res.j && res.j.ok ? "Read just now." : (res.j && res.j.error) || "Couldn't read (" + res.s + ").";
      return loadInstagram();
    }, function () { igBusy = false; igMsg = "No connection. Try again."; drawInstagram(); });
  });

  /* ---------- Growth, Fans, Releases, Money, Team (the sheet) ---------- */
  function drawGrowth() {
    $("growthList").innerHTML = broken("Growth") ? '<p class="empty">See the note above.</p>' : sheet.growth.length ? sheet.growth.map(function (g) {
      return '<div class="tile"><div class="row"><h3>' + esc(g.platform) + '</h3><span class="lbl">' + esc(g.account) + "</span></div>" +
        '<div class="big num">' + fmt(g.followers) + "</div>" +
        '<div class="d">' + signed(g.day) + " yesterday · " + signed(g.week) + " " + L.growthWhen(g) + (g.month != null ? " · " + signed(g.month) + " in 30" : "") + "</div>" + spark(g.series) +
        (g.best.length ? '<div class="lbl" style="margin-top:4px">Best days</div>' + g.best.map(function (b) { return '<div class="d" style="margin-top:4px">' + signed(b.change) + " · " + esc(day(b.d)) + " · " + link(b.link, b.post) + "</div>"; }).join("") : "") +
        (g.stale > 2 ? '<div class="d" style="margin-top:6px;color:var(--paper)">Not logged for ' + g.stale + " days</div>" : "") + "</div>";
    }).join("") : '<p class="empty">No growth rows yet. Steve, Kevin, Laura and Atlas log one row a day.</p>';
  }
  function drawFans() {
    var f = sheet.fans;
    $("fansSub").textContent = f.total ? f.total + " people noticed · " + f.repeat + " came back more than once. Suggestions only: nobody is contacted without your yes." : "People asking for the song name, repeat commenters and DMs.";
    setTable("fanTable", broken("Fans") ? "" : f.people.length ? "<tr><th>Who</th><th>Where</th><th class='r'>Times</th><th>What they said</th><th>About them</th><th>How to reach them</th></tr>" + f.people.map(function (p) {
      return "<tr><td><b>" + link(p.profile, p.handle) + "</b><br><span class='lbl'>" + esc(p.signals.join(" · ").replace(/_/g, " ")) + "</span></td><td>" + esc(p.platform) + "<br><span class='lbl'>" + esc(day(p.last)) + "</span></td><td class='r'>" + (p.times >= 2 ? "<b>" + p.times + "</b>" : p.times) + "</td><td>" + (p.quote ? "“" + link(p.post, p.quote) + "”" : "–") + "</td><td>" + esc(p.about || "–") + "</td><td>" + esc(p.engage || "–") + "</td></tr>";
    }).join("") : '<tr><td class="empty">No fan signals logged yet.</td></tr>');
  }
  /* Releases (11 Nov 2026): js/hq-staff.js draws the tab from the team's desk (the pipeline, the
     form) and asks for the sheet's own cards for the songs the desk doesn't have. Without the desk,
     the sheet's list as before (it already carries the desk's scheduled releases, hq.mjs mergeReleases). */
  function drawReleases() {
    if (window.HQStaff && window.HQStaff.drawReleases()) return;
    /* without the desk: the sheet's songs still to come, and one line for the ones that are out (v2) */
    var l = window.HQLib.releaseLists(null, sheet), ol = window.HQLib.outLine(l.sheetOut.map(function (r) { return { title: r.song, date: r.date }; }));
    $("relDesk").innerHTML = ""; $("relPipe").innerHTML = "";
    $("relOut").innerHTML = ol ? '<p class="routline">' + esc(ol) + ' <a href="#songs">See Songs</a></p>' : "";
    $("relSpot").innerHTML = '<p class="empty2">This shows once the team\'s desk is read.</p>';
    $("relList").innerHTML = broken("Releases") ? '<p class="empty">See the note above.</p>' : l.sheetOnly.length ? l.sheetOnly.map(sheetReleaseCard).join("") : '<p class="empty">Nothing coming in the sheet yet.</p>';
  }
  function sheetReleaseCard(r) {
    var isOut = !!r.date && r.daysToGo <= 0;
    var when = r.date ? (r.daysToGo > 0 ? r.daysToGo + " days to go" : r.daysToGo === 0 ? "Released today" : "Released " + (-r.daysToGo) + " day" + (r.daysToGo === -1 ? "" : "s") + " ago") : "No date yet";
    /* once it is out the card says Released; "On time" / "N late" are about getting there */
    var tr = L.releaseTrouble(r); /* "On time" only with nothing late, blocked or warned about (A1, 17 Nov 2026) */
    return '<div class="tile"><div class="row"><h3>' + esc(r.song) + "</h3>" + (isOut ? '<span class="pill rel">Released</span>' : tr.late ? '<span class="pill warn">' + tr.late + " late</span>"
      : tr.blocked ? '<span class="pill warn">' + tr.blocked + " blocked</span>" : tr.warnings ? '<span class="pill warn">' + tr.warnings + " warning" + (tr.warnings > 1 ? "s" : "") + "</span>" : '<span class="pill">On time</span>') + "</div>" +
      '<div class="d" style="margin-top:6px">' + esc(day(r.date)) + " · " + when + (r.status && !(r.daysToGo <= 0 && /^(out|released|live)$/i.test(r.status)) ? " · " + esc(r.status) : "") + (r.weekday && r.weekday !== "Fri" && r.daysToGo > 0 ? " · not a Friday" : "") + "</div>" +
      /* v2: the pitch waits (never late) while the latest Spotify for Artists report doesn't show the song;
         a step the label delivers is not ours */
      '<ul class="steps">' + r.steps.map(function (s) { return '<li class="' + (s.done && !s.skipped ? "done" : s.late ? "late" : "") + '"><span class="dot"></span><span>' + esc(s.label) + ' <span class="lbl">' + esc(s.owner) + '</span></span><span class="w' + (s.waiting && !s.done ? " wait" : "") + '">' +
        (s.skipped ? "not ours" : s.done ? "done" : s.waiting && !s.late ? esc(s.waitingText || "waiting") : esc(day(s.due)) + (s.late ? " · late" : "")) + "</span></li>"; }).join("") + "</ul>" +
      (r.notes ? '<div class="d" style="margin-top:8px">' + esc(r.notes) + "</div>" : "") +
      '<button class="rel-btn" type="button" data-release="' + esc(r.song) + '">See what\'s missing ›</button></div>';
  }
  /* month by month: just the month and what was received (16 Nov 2026, Luke) */
  function drawMoney() {
    var incomeBad = broken("Income"), rows = HQLib.monthRows(sheet.money.months);
    var box = $("songPL");
    if (box) box.innerHTML = sheet.songPL ? L.songPLHtml(L.songPLView(sheet.songPL)) : "";
    setTable("moneyTable", rows.length ? "<tr><th>Month</th><th class='r'>Received</th></tr>" + rows.map(function (r) {
      return "<tr><td><b>" + esc(r.label) + "</b></td><td class='r'>" + (incomeBad ? "can't be read" : esc(r.amount)) + "</td></tr>";
    }).join("") : '<tr><td class="empty">' + (incomeBad ? "See the note above." : "No income rows yet.") + "</td></tr>");
    $("moneyDetail").innerHTML = "";
  }
  var TASK_WORD = { todo: "To do", doing: "Doing", blocked: "Blocked", waiting: "Waiting", review: "In review" }; /* sentence case: no shouting pills */
  function drawTeam() {
    var t = sheet.team, du = t.duties;
    $("teamSub").textContent = broken("Tasks") ? "" : t.tasks.length + " open task" + (t.tasks.length === 1 ? "" : "s") + " · " + t.late + " late · " + t.blocked + " blocked · today's duties " + du.done + " of " + du.total + " done";
    drawLive();
    setTable("teamTable", t.team.length ? "<tr><th>Who</th><th class='r'>Open</th><th class='r'>Late</th><th class='r'>Blocked</th><th>Last logged a number</th></tr>" + t.team.map(function (o) {
      return "<tr><td><b>" + esc(o.owner) + "</b></td><td class='r'>" + o.open + "</td><td class='r'>" + (o.late ? "<b>" + o.late + "</b>" : 0) + "</td><td class='r'>" + (o.blocked ? "<b>" + o.blocked + "</b>" : 0) + "</td><td>" + (o.lastLogged ? esc(day(o.lastLogged)) + (o.quiet > 2 ? " · <b>quiet " + o.quiet + " days</b>" : "") : "–") + "</td></tr>";
    }).join("") : "");
    setTable("taskTable", t.tasks.length ? "<tr><th>Task</th><th>Owner</th><th>Deadline</th><th>Status</th></tr>" + t.tasks.map(function (x) {
      return "<tr><td>" + (x.late ? "<b>" + esc(x.task) + "</b>" : esc(x.task)) + (x.blocker ? "<small>Blocked: " + esc(x.blocker) + "</small>" : x.note ? "<small>" + esc(x.by || x.owner) + ": " + esc(x.note) + "</small>" : "") + "</td><td>" + esc(x.owner) + "</td><td>" + esc(x.deadline ? day(x.deadline) : "–") + (x.late ? " · <b class='attn'>late</b>" : "") + "</td><td><span class='mlabel" + (x.status === "blocked" ? " mine" : "") + "'>" + esc(TASK_WORD[x.status] || x.status) + "</span></td></tr>";
    }).join("") : broken("Tasks") ? "" : '<tr><td class="empty">No open tasks in the sheet.</td></tr>');
  }

  /* ---------- Team, without the staff desk: what the sheet alone gives ----------
     Normally js/hq-staff.js draws Team's cards (one per bot on the roster) and the live log from
     /api/staff/board. This is the fallback for when that answer isn't there: a card per bot that has a
     duty row or an update in the sheet. Same card, same words (HQLib.dutyWhen), one state pill. */
  function spAgo(at) { var ms = window.HQLib.spMs(at); return ms ? window.HQLib.ago(Date.now() - ms) : ""; }
  function drawLive() {
    if (window.HQStaff && window.HQStaff.drawWorkers()) return; /* the staff desk drew it */
    var L = window.HQLib;
    $("connCard").hidden = true; if ($("connFold")) $("connFold").hidden = true; if ($("teamSum")) $("teamSum").innerHTML = "";
    if (!sheet) {
      $("liveNote").hidden = true;
      $("dutyList").innerHTML = '<p class="empty">This fills in once the sheet is connected.</p>';
      $("liveFeed").innerHTML = '<li><span class="t">–</span><span class="m">No live log yet.</span></li>';
      return;
    }
    var du = sheet.team.duties, live = sheet.team.live || { ready: false, feed: [], bots: [] };
    var names = {};
    du.byOwner.forEach(function (o) { names[o.owner] = { duties: o }; });
    live.bots.forEach(function (b) { (names[b.bot] = names[b.bot] || {}).last = b; });
    var cards = Object.keys(names).map(function (n) {
      var o = names[n].duties, last = names[n].last, today = last && last.lastAt.slice(0, 10) === sheet.today;
      var st = o ? (o.blocked ? "blocked" : o.late ? "late" : !o.todo ? "done" : today && last.status === "working" ? "working" : "todo") : today && (last.status === "blocked" || last.status === "error") ? "blocked" : "idle";
      return { name: n, state: st, duties: o ? o.items : [], last: last };
    });
    $("liveNote").hidden = live.ready;
    $("liveNote").textContent = "The bots' live log isn't in the sheet yet (Nova has been asked to add it). Until then this shows today's duties only.";
    if (broken("Tasks")) $("dutyList").innerHTML = '<p class="empty">See the note above.</p>';
    else $("dutyList").innerHTML = cards.length ? L.sortWorkers(cards).map(function (w) {
      return '<article class="tile botcard" id="team-' + esc(L.slug(w.name)) + '"><div class="bhead"><h3>' + esc(w.name) + '</h3><span class="bstate ' + w.state + '">' + esc(L.workerLabel(w.state)) + "</span></div>" +
        (w.duties.length ? '<ul class="bduties">' + w.duties.map(function (d) {
          return '<li class="' + (d.status === "blocked" || d.late ? "bad" : d.status === "done" ? "done" : "") + '"><span class="bt">' + esc(d.task) + (d.blocker ? "<small>Blocked: " + esc(d.blocker) + "</small>" : "") + (d.gaps ? "<small>" + esc(window.HQLib.dutyGapsLine(d)) + "</small>" : "") + '</span><span class="bw">' + esc(L.dutyWhen(d)) + "</span></li>"; }).join("") + "</ul>" : "") +
        (w.last ? '<p class="blast"><b>' + esc(spAgo(w.last.lastAt)) + "</b> " + (w.last.link ? link(w.last.link, w.last.message) : esc(w.last.message)) + "</p>" : "") + "</article>";
    }).join("") : '<p class="empty">No duties for today yet. Nova sets them every morning at 08:05.</p>';
    drawFeed(live.ready ? live.feed : null, sheet.today);
  }
  /* the live log (Team). feed: [{at "YYYY-MM-DD HH:MM" São Paulo, bot, status, message, link}], null = there is none yet */
  function feedWhen(u, today) {
    var raw = u && (u.at || u.sp) || "";
    if (!raw || /^invalid date$/i.test(String(raw))) return "not reported";
    return L.deskWhen(raw, today);
  }
  function feedLi(u, today) {
    var st = /^(done|working|blocked|error|info)$/.test(u.status) ? u.status : "info";
    return '<li class="' + st + (st === "done" ? " quiet-done" : "") + '"><span class="t">' + esc(feedWhen(u, today)) + '</span><span class="m"><b>' + esc(u.bot) + "</b> " +
      (u.link ? link(u.link, u.message) : esc(u.message)) + (st === "info" ? "" : '<span class="s">' + esc(st) + "</span>") + "</span></li>";
  }
  function drawFeed(feed, today) {
    if (!feed) { $("liveFeed").innerHTML = '<li><span class="t">–</span><span class="m">No live log yet.</span></li>'; return; }
    if (!feed.length) { $("liveFeed").innerHTML = '<li><span class="t">–</span><span class="m">Nothing logged yet.</span></li>'; return; }
    if (document.body.classList.contains("quiet")) {
      $("liveFeed").innerHTML = L.quietFeed(feed).slice(0, 20).map(function (g) {
        var more = g.older.length ? '<details class="feedmore"><summary>' + g.older.length + " earlier</summary><ul>" + g.older.map(function (u) { return feedLi(u, today); }).join("") + "</ul></details>" : "";
        return feedLi(g.latest, today).replace("</li>", more + "</li>");
      }).join("");
      return;
    }
    $("liveFeed").innerHTML = feed.slice(0, 20).map(function (u) { return feedLi(u, today); }).join("");
  }

  /* ---------- the release panel: what's missing, then what's done ---------- */
  var detailFrom = null;
  /* the steps counted back from release day, from the desk's own list (never hard-coded here) */
  function stepsLine() { var b = staffBoard(); return b && b.releaseSteps ? window.HQLib.stepsSummary(b.releaseSteps) : ""; }
  function openRelease(song) {
    if (!sheet) return;
    var r = (sheet.releases || []).filter(function (x) { return x.song === song; })[0];
    var d = window.HQLib.releaseDetail(r, sheet.today);
    if (!d) return;
    var when = d.date ? (d.daysToGo > 0 ? d.daysToGo + " day" + (d.daysToGo === 1 ? "" : "s") + " to go" : d.daysToGo === 0 ? "out today" : "out " + (-d.daysToGo) + " days ago") : "no date yet";
    var step = function (x) {
      return '<li class="' + (x.done ? "done" : x.late ? "late" : "") + '"><i aria-hidden="true"></i><b>' + esc(x.label) + '</b><span class="w">' + esc(x.when) + "</span>" +
        '<span class="o">' + esc(x.owner) + (x.due ? " · due " + esc(day(x.due)) : "") + "</span>" + (x.note ? '<span class="n">' + esc(x.note) + "</span>" : "") + "</li>";
    };
    $("detailBody").innerHTML = '<h2 class="d-title" id="detailTitle">' + esc(d.song) + "</h2>" +
      '<p class="d-sub">' + esc(day(d.date)) + " · " + esc(when) + (d.status ? " · " + esc(d.status) : "") + (d.weekday && d.weekday !== "Fri" && d.daysToGo > 0 ? ' · <span class="attn">not a Friday</span>' : "") + "</p>" +
      '<p class="d-sum' + (d.missing.some(function (x) { return x.late; }) ? " attn" : "") + '">' + esc(d.summary) + "</p>" +
      (d.missing.length ? '<h3 class="d-h">What\'s missing</h3><ul class="d-steps">' + d.missing.map(step).join("") + "</ul>" : '<p class="d-sum">Nothing missing: every step is done.</p>') +
      (d.done.length ? '<h3 class="d-h">Done</h3><ul class="d-steps">' + d.done.map(step).join("") + "</ul>" : "") +
      (d.notes ? '<p class="d-notes">' + esc(d.notes) + "</p>" : "") +
      (stepsLine() ? '<p class="d-notes">' + esc(stepsLine()) + "</p>" : "");
    detailFrom = document.activeElement;
    $("detailSheet").hidden = false; $("scrim").hidden = false;
    $("detailClose").focus();
  }
  function closeRelease() {
    if ($("detailSheet").hidden) return;
    $("detailSheet").hidden = true; $("scrim").hidden = true;
    if (detailFrom && detailFrom.focus) detailFrom.focus();
  }
  $("nextTile").addEventListener("click", function () { if (sheet && sheet.next) openRelease(sheet.next.song); });
  document.addEventListener("click", function (ev) { var b = ev.target.closest && ev.target.closest("[data-release]"); if (b) openRelease(b.getAttribute("data-release")); });
  /* Songs: "Add its details" for a song whose deal isn't recorded (v2): the form in Upcoming */
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-adddeal]");
    if (b && window.HQStaff) window.HQStaff.addDetails({ id: b.getAttribute("data-adddeal"), title: b.getAttribute("data-title"), date: b.getAttribute("data-date") });
  });
  $("detailClose").addEventListener("click", closeRelease);
  $("scrim").addEventListener("click", closeRelease);
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") closeRelease(); });
  window.addEventListener("hashchange", closeRelease);

  window.HQ = { sample: sample, state: state, setRange: setRange, refresh: refresh, net: function (p, m, a) { netState(p, m, a); }, keep: keep, kept: kept, showLogin: showLogin, showShell: showShell, rangeQuery: rangeQuery,
    esc: esc, fmt: fmt, money: money, day: day, ago: ago, getJSON: getJSON, authFail: authFail,
    /* for js/hq-staff.js (11 Nov 2026) */
    postJSON: postJSON, copyText: copyText, link: link, stack: stack, drawFeed: drawFeed, sheet: function () { return sheet; },
    sheetReleaseCard: sheetReleaseCard, releasesBroken: function () { return broken("Releases"); },
    /* the songs as Songs names its cards (id = the card's song-<id>): for Search (js/hq-cmd.js) */
    songIndex: function () {
      var out = [], seen = {};
      (ov && ov.songs ? ov.songs : []).forEach(function (p) { var k = adKey(p.title); if (k && !seen[k]) { seen[k] = 1; out.push({ name: p.title, id: p.id }); } });
      (sheet && sheet.songs ? sheet.songs : []).forEach(function (s) { var k = adKey(s.song); if (k && !seen[k]) { seen[k] = 1; out.push({ name: s.song, id: k }); } });
      return out;
    },
    /* the staff desk answered (or was cleared): Today's attention, the site-check line and Data health read it */
    boardChanged: function () { if (sheet || ov) { drawBriefing(); drawSongs(); } drawDataHealth(); drawSongTiles(); if (!staffBoard()) drawLive(); },
    overview: function () { return ov; }, instagram: function () { return ig; } };
  /* hq-pages.js is loaded with defer right after this file: start once both are in */
  document.addEventListener("DOMContentLoaded", start);
})();
