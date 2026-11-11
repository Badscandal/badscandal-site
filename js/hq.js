/* BADSCANDAL HQ: the one dashboard (11 Nov 2026; /admin, /admin.html and /stats 301 here).
   This file: the login (the same /api/admin/login password, cookie and lockout as /admin had), the
   sheet side (/api/hq/data: Today, Growth, Fans, Releases, Money, Team, the combined cap) and the
   all-songs page side (/api/admin/overview: Today's yesterday, Songs, Ads). The Pages section is
   js/hq-pages.js (/api/admin/data), which uses window.HQ from here.
   Speed: the three answers are asked for at the same time and each section is drawn the moment its
   own answer arrives, Today first. ?sample=1 = made-up numbers everywhere, under the SAMPLE banner.
   Display only: nothing on this page changes an ad, a post, the sheet or any money. */
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
  function day(d) { return d ? new Date(String(d).slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "–"; }
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
  function getJSON(url) {
    return fetch(url, { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j }; }); });
  }

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
  function showLogin(msg) {
    $("shell").hidden = true;
    $("login").hidden = false;
    $("err").textContent = msg || "";
    clearInterval(timer);
    started = false;
    if (window.HQPages) window.HQPages.stop();
    setTimeout(function () { $("pw").focus(); }, 50);
  }
  function showShell() {
    var was = $("shell").hidden;
    $("login").hidden = true; $("shell").hidden = false;
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
        if (res.s === 200) { $("pw").value = ""; start(); return; }
        if (res.s === 401) $("err").textContent = "Wrong password." + (res.j.left != null ? " " + res.j.left + " tries left." : "");
        else $("err").textContent = res.j.error || "Couldn't log in (" + res.s + ").";
      })
      .catch(function () { btn.disabled = false; $("err").textContent = "No connection. Try again."; });
  });
  $("logout").addEventListener("click", function () {
    fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" }).finally(function () { sheet = null; ov = null; showLogin(""); });
  });
  /* any 401 / 503 from any of the three answers lands here */
  function authFail(res) {
    if (res.s === 401) { showLogin(""); return true; }
    if (res.s === 503 && /ADMIN_KEY/.test(res.j.error || "")) { showLogin("The password isn't set on Netlify yet (ADMIN_KEY)."); return true; }
    return false;
  }

  /* ---------- loading: three answers in parallel, each drawn as it lands ---------- */
  var EVERY = 5 * 60 * 1000, timer = null, lastRefresh = 0, sheetProblem = "";
  function start() {
    started = true;
    syncRangeSelects();
    refresh();
    clearInterval(timer);
    timer = setInterval(function () { if (!document.hidden) refresh(); }, EVERY);
  }
  /* every 5 minutes while the page is on screen; coming back after longer than that refreshes at once */
  document.addEventListener("visibilitychange", function () { if (!document.hidden && started && Date.now() - lastRefresh > EVERY) refresh(); });
  function refresh() {
    lastRefresh = Date.now();
    return Promise.all([loadSheet(), loadOverview(), window.HQPages ? window.HQPages.reload() : null]).then(drawDataHealth, drawDataHealth);
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
      var old = kept("bs_hq_last_sheet");
      if (old && !sheet) { sheet = old.j; showShell(); drawSheet(); }
      netState("sheet", "offline", old && old.at);
    });
  }
  function offSheet(msg) {
    sheet = null;
    $("sheetOff").hidden = false; $("sheetOffMsg").textContent = msg;
    ["errToday", "errSongs", "errGrowth", "errFans", "errReleases", "errMoney", "errTeam"].forEach(function (id) { $(id).hidden = true; });
    $("growthList").innerHTML = $("relList").innerHTML = '<p class="empty">Needs the sheet.</p>';
    $("fanTable").innerHTML = $("moneyTable").innerHTML = $("teamTable").innerHTML = $("taskTable").innerHTML = $("moneyDetail").innerHTML = "";
    $("dutyList").innerHTML = '<p class="empty">Needs the sheet.</p>';
    drawSongs(); drawCapCard();
  }
  $("showSample").addEventListener("click", function () { location.search = "?sample=1"; });

  function loadOverview() {
    var q = rangeQuery().toString();
    return getJSON("/api/admin/overview?" + q).then(function (res) {
      if (authFail(res)) return;
      showShell();
      if (res.s !== 200) {
        var old = kept("bs_hq_last_ov", q);
        if (old) { ov = old.j; drawOverview(); }
        else $("yday").innerHTML = '<p class="empty2">Couldn\'t load the page numbers.</p>';
        netState("ov", "Couldn't load the page numbers (" + res.s + ").", old && old.at);
        return;
      }
      netState("ov", null);
      ov = res.j;
      keep("bs_hq_last_ov", q, ov);
      $("when").textContent = (sample ? "sample · " : "live · ") + hhmm(Date.now()) + " SP";
      drawOverview();
    }).catch(function () {
      var old = kept("bs_hq_last_ov", q);
      if (old) { ov = old.j; showShell(); drawOverview(); }
      netState("ov", "offline", old && old.at);
    });
  }
  function drawOverview() { drawYesterday(); drawSongs(); drawAds(); drawDataHealth(); }

  /* ---------- Data health: Sheet, Meta, page counter, exchange rate (one dot in the header) ---------- */
  function drawDataHealth() {
    var rows = window.HQLib.healthRows({ sheet: sheet, sheetProblem: sheetProblem, ov: ov });
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
    drawToday(); drawSongs(); drawCapCard(); drawGrowth(); drawFans(); drawReleases(); drawMoney(); drawTeam(); drawDataHealth();
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
    $("nextMsg").innerHTML = broken("Releases") ? '<span class="attn">The Releases tab shows an error.</span>' : n ? "<b>" + (n.daysToGo === 0 ? "Out today" : n.daysToGo + " day" + (n.daysToGo === 1 ? "" : "s")) + "</b> · " + esc(day(n.date)) +
      (n.late ? ' · <span class="attn">' + n.late + " step" + (n.late > 1 ? "s" : "") + " late</span>" : " · on time") : "Tell Nova the next song and a Friday.";
    var mine = sheet.team.forLuke;
    $("forLuke").innerHTML = broken("Tasks") ? '<p class="empty2 attn">The Tasks tab can\'t be read.</p>' : mine.length ? '<ul class="t-list">' + mine.slice(0, 4).map(function (x) {
      return '<li class="' + (x.late ? "late" : "") + '"><span>' + esc(x.task) + '</span><span class="when">' + (x.late ? "late · " : "") + esc(x.deadline ? day(x.deadline.slice(0, 10)) : "") + "</span></li>"; }).join("") + "</ul>"
      : '<p class="empty2">Nothing waiting on you.</p>';
    var du = sheet.team.duties;
    $("dutyBig").innerHTML = broken("Tasks") ? "–" : du.total ? du.done + " <small>of " + du.total + " done</small>" : "–";
    $("dutyMsg").innerHTML = broken("Tasks") ? '<span class="attn">The Tasks tab can\'t be read.</span>' : !du.total ? "No duties logged for today." :
      (du.blocked ? '<span class="attn">' + du.blocked + " blocked</span> · " : "") + (du.total - du.done - du.blocked) + " to do";
  }
  function drawYesterday() {
    var y = ov.yesterday;
    $("yday").innerHTML = '<p class="t-big num green">' + fmt(y.taps) + ' <small>real Spotify taps</small></p>' +
      '<ul class="t-rows"><li><span>People on the song pages</span><b>' + fmt(y.people) + "</b></li>" +
      "<li><span>Meta spend</span><b>" + (y.spend == null ? "–" : esc(money(y.spend, y.currency))) + "</b></li>" +
      "<li><span>Cost per tap</span><b>" + (y.cpt == null ? "–" : esc(money(y.cpt, y.currency))) + "</b></li></ul>";
  }
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
    if (!order.length) { $("songList").innerHTML = '<p class="empty">' + (ov || sheet ? "No songs yet." : "Loading…") + "</p>"; return; }
    $("songList").innerHTML = order.map(function (k) {
      var s = bySheet[k], p = byPage[k], sp = spendBy[k];
      var name = s ? s.song : p.title;
      var pill = !s ? "" : s.trend === "rising" ? '<span class="pill hot">Rising ' + signed(s.momentum) + "%</span>" : s.trend === "cooling" ? '<span class="pill warn">Cooling ' + signed(s.momentum) + "%</span>" : s.trend === "steady" ? '<span class="pill">Steady ' + signed(s.momentum) + "%</span>" : '<span class="pill">New</span>';
      var out = '<div class="tile" id="song-' + esc(p ? p.id : k) + '"><div class="songhead">' + (p && p.cover ? '<img class="cover" src="' + esc(p.cover) + '" alt="">' : "") + "<h3>" + esc(name) + "</h3>" + pill + "</div>";
      if (s) out += '<div class="big num">' + fmt(s.streams) + " <small>streams · " + esc(day(s.lastDay)) + "</small></div>" +
        '<div class="d">' + signed(s.dayChange) + " vs the day before · " + fmt(s.week) + " in 7 days" + (s.prevWeek != null ? " (" + fmt(s.prevWeek) + " the 7 before)" : "") + "</div>" + spark(s.series) +
        '<div class="d">' + fmt(s.listeners) + " listeners · " + fmt(s.saves) + " saves · " + fmt(s.adds) + " playlist adds" + (s.stale > 3 ? ' · <b style="color:var(--paper)">not logged for ' + s.stale + " days</b>" : "") + "</div>";
      else out += '<p class="d" style="margin:8px 0">' + (broken("Songs") ? "The Songs tab can't be read." : sheet ? "No Spotify rows in the sheet yet." : "") + "</p>";
      if (!p && ov) out += '<div class="kv" style="margin-top:8px"><span>Our page</span><b>no song page for this one</b></div>';
      else out += '<div class="kv" style="margin-top:8px"><span>Our page · ' + esc(rangeTxt || "…") + "</span><b>" + (p ? fmt(p.visits) + " visits · " + fmt(p.people) + " people" : "–") + "</b></div>" +
        '<div class="kv"><span>Real Spotify taps</span><b>' + (p ? fmt(p.taps) : "–") + "</b></div>" +
        '<div class="kv"><span>Meta spend · per tap</span><b>' + (sp ? esc(money(sp.spend, cur)) + " · " + esc(money(sp.cpt, cur)) : ov && ov.spend && !ov.spend.connected ? "not connected" : "–") + "</b></div>";
      out += '<div class="kv"><span>Royalties so far</span><b>' + (s ? esc(amounts(s.royalties)) : "–") + "</b></div>" +
        (s && s.daysOut != null ? '<div class="kv"><span>Out for</span><b>' + s.daysOut + " days</b></div>" : p && p.date ? '<div class="kv"><span>Release</span><b>' + esc(day(p.date)) + "</b></div>" : "");
      return out + "</div>";
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
    if (c.estimated) msg += " Billed: " + amounts(c.native) + (c.rate ? " (EUR counted at this month's average, 1 EUR = " + c.rate + " USD)." : " (no rate yet, EUR part not counted).");
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

  /* ---------- Growth, Fans, Releases, Money, Team (the sheet) ---------- */
  function drawGrowth() {
    $("growthList").innerHTML = broken("Growth") ? '<p class="empty">See the note above.</p>' : sheet.growth.length ? sheet.growth.map(function (g) {
      return '<div class="tile"><div class="row"><h3>' + esc(g.platform) + '</h3><span class="lbl">' + esc(g.account) + "</span></div>" +
        '<div class="big num">' + fmt(g.followers) + "</div>" +
        '<div class="d">' + signed(g.day) + " yesterday · " + signed(g.week) + " in 7 days" + (g.month != null ? " · " + signed(g.month) + " in 30" : "") + "</div>" + spark(g.series) +
        (g.best.length ? '<div class="lbl" style="margin-top:4px">Best days</div>' + g.best.map(function (b) { return '<div class="d" style="margin-top:4px">' + signed(b.change) + " · " + esc(day(b.d)) + " · " + link(b.link, b.post) + "</div>"; }).join("") : "") +
        (g.stale > 2 ? '<div class="d" style="margin-top:6px;color:var(--paper)">Not logged for ' + g.stale + " days</div>" : "") + "</div>";
    }).join("") : '<p class="empty">No growth rows yet. Steve, Kevin, Laura and Atlas log one row a day.</p>';
  }
  function drawFans() {
    var f = sheet.fans;
    $("fansSub").textContent = f.total ? f.total + " people noticed · " + f.repeat + " came back more than once. Suggestions only: nobody is contacted without your yes." : "People asking for the song name, repeat commenters and DMs.";
    $("fanTable").innerHTML = broken("Fans") ? "" : f.people.length ? "<tr><th>Who</th><th>Where</th><th class='r'>Times</th><th>What they said</th><th>About them</th><th>How to reach them</th></tr>" + f.people.map(function (p) {
      return "<tr><td><b>" + link(p.profile, p.handle) + "</b><br><span class='lbl'>" + esc(p.signals.join(" · ").replace(/_/g, " ")) + "</span></td><td>" + esc(p.platform) + "<br><span class='lbl'>" + esc(day(p.last)) + "</span></td><td class='r'>" + (p.times >= 2 ? "<b>" + p.times + "</b>" : p.times) + "</td><td>" + (p.quote ? "“" + link(p.post, p.quote) + "”" : "–") + "</td><td>" + esc(p.about || "–") + "</td><td>" + esc(p.engage || "–") + "</td></tr>";
    }).join("") : '<tr><td class="empty">No fan signals logged yet.</td></tr>';
    stack("fanTable");
  }
  function drawReleases() {
    $("relList").innerHTML = broken("Releases") ? '<p class="empty">See the note above.</p>' : sheet.releases.length ? sheet.releases.map(function (r) {
      var when = r.date ? (r.daysToGo > 0 ? r.daysToGo + " days to go" : r.daysToGo === 0 ? "Out today" : "Out " + (-r.daysToGo) + " day" + (r.daysToGo === -1 ? "" : "s") + " ago") : "No date yet";
      return '<div class="tile"><div class="row"><h3>' + esc(r.song) + "</h3>" + (r.late ? '<span class="pill warn">' + r.late + " late</span>" : '<span class="pill">On time</span>') + "</div>" +
        '<div class="d" style="margin-top:6px">' + esc(day(r.date)) + " · " + when + (r.status && !(r.daysToGo <= 0 && /^(out|released|live)$/i.test(r.status)) ? " · " + esc(r.status) : "") + (r.weekday && r.weekday !== "Fri" && r.daysToGo > 0 ? " · not a Friday" : "") + "</div>" +
        '<ul class="steps">' + r.steps.map(function (s) { return '<li class="' + (s.done ? "done" : s.late ? "late" : "") + '"><span class="dot"></span><span>' + esc(s.label) + ' <span class="lbl">' + esc(s.owner) + '</span></span><span class="w">' + (s.done ? "done" : esc(day(s.due)) + (s.late ? " · late" : "")) + "</span></li>"; }).join("") + "</ul>" +
        (r.notes ? '<div class="d" style="margin-top:8px">' + esc(r.notes) + "</div>" : "") + "</div>";
    }).join("") : '<p class="empty">No releases in the sheet yet.</p>';
  }
  function drawMoney() {
    var ms = sheet.money.months, incomeBad = broken("Income");
    $("moneyTable").innerHTML = ms.length ? "<tr><th>Month</th><th>Ad spend (as billed)</th><th>Income received (as paid)</th><th class='r'>Spend ≈ EUR</th><th class='r'>Income ≈ EUR</th><th class='r'>Left over ≈ EUR</th></tr>" + ms.map(function (m) {
      return "<tr><td><b>" + esc(monthName(m.month)) + "</b>" + (m.rate ? "<br><span class='lbl'>1 EUR = " + m.rate + " USD</span>" : "") + "</td><td>" + esc(amounts(flat(m.spend))) + "</td><td>" + (incomeBad ? "can't be read" : esc(amounts(flat(m.income))) + (Object.keys(m.pending).length ? "<br><span class='lbl'>pending: " + esc(amounts(flat(m.pending))) + "</span>" : "")) +
        "</td><td class='r'>" + esc(money(m.spendEur.amount, "EUR")) + (m.spendEur.missing ? "*" : "") + "</td><td class='r'>" + (incomeBad ? "–" : esc(money(m.incomeEur.amount, "EUR")) + (m.incomeEur.missing ? "*" : "")) + "</td><td class='r'><b>" + (incomeBad || m.netEur == null ? "–" : esc(money(m.netEur, "EUR"))) + "</b></td></tr>";
    }).join("") : '<tr><td class="empty">' + (broken("Spend") || incomeBad ? "See the note above." : "No spend or income rows yet.") + "</td></tr>";
    stack("moneyTable");
    var m0 = ms[0];
    if (!m0) { $("moneyDetail").innerHTML = ""; return; }
    var block = function (title, o, bad) {
      var k = Object.keys(o || {});
      return '<div class="tile"><div class="lbl">' + esc(title) + "</div>" + (bad ? '<p class="empty" style="margin-top:6px">Can\'t be read: the sheet shows an error.</p>' : k.length ? k.map(function (c) { return '<div class="row d" style="margin-top:6px"><span>' + esc(c) + "</span><b style='color:var(--paper)'>" + esc(amounts(o[c])) + "</b></div>"; }).join("") : '<p class="empty" style="margin-top:6px">Nothing logged.</p>') + "</div>";
    };
    var src = sheet.money.metaSource;
    var spendTitle = "Ad spend by platform" + (src && src.from === "meta" ? " · Meta from Meta" : src && src.from === "sheet" ? " · Meta from the sheet" : "");
    $("moneyDetail").innerHTML = '<div class="lbl" style="margin:16px 0 8px">' + esc(monthName(m0.month)) + ' in detail</div><div class="grid g3">' + block(spendTitle, m0.spend) + block("Income by type", m0.income, incomeBad) + block("Self-release royalties by song", m0.royalties, broken("Royalties")) + "</div>";
  }
  function drawTeam() {
    var t = sheet.team, du = t.duties;
    $("teamSub").textContent = broken("Tasks") ? "" : t.tasks.length + " open tasks · " + t.late + " late · " + t.blocked + " blocked · today's duties " + du.done + " of " + du.total + " done";
    $("dutyList").innerHTML = broken("Tasks") ? '<p class="empty">See the note above.</p>' : du.byOwner.length ? du.byOwner.map(function (o) {
      return '<div class="tile"><div class="row"><h3>' + esc(o.owner) + '</h3><span class="lbl">' + o.done + " of " + o.items.length + " done</span></div>" +
        o.items.map(function (d) { return '<div class="duty ' + d.status + '"><span>' + esc(d.task) + (d.blocker ? "<small>Blocked: " + esc(d.blocker) + "</small>" : "") + '</span><span class="w">' + d.status + "</span></div>"; }).join("") + "</div>";
    }).join("") : '<p class="empty">No duties for today. The bots log them as Tasks rows whose id starts with "D-".</p>';
    $("teamTable").innerHTML = t.team.length ? "<tr><th>Who</th><th class='r'>Open</th><th class='r'>Late</th><th class='r'>Blocked</th><th>Last logged a number</th></tr>" + t.team.map(function (o) {
      return "<tr><td><b>" + esc(o.owner) + "</b></td><td class='r'>" + o.open + "</td><td class='r'>" + (o.late ? "<b>" + o.late + "</b>" : 0) + "</td><td class='r'>" + (o.blocked ? "<b>" + o.blocked + "</b>" : 0) + "</td><td>" + (o.lastLogged ? esc(day(o.lastLogged)) + (o.quiet > 2 ? " · <b>quiet " + o.quiet + " days</b>" : "") : "–") + "</td></tr>";
    }).join("") : broken("Tasks") ? "" : '<tr><td class="empty">No tasks in the sheet yet.</td></tr>';
    stack("teamTable");
    $("taskTable").innerHTML = t.tasks.length ? "<tr><th>Task</th><th>Owner</th><th>Deadline</th><th>Status</th></tr>" + t.tasks.map(function (x) {
      return "<tr><td>" + (x.late ? "<b>" + esc(x.task) + "</b>" : esc(x.task)) + (x.blocker ? "<br><span class='lbl'>blocked: " + esc(x.blocker) + "</span>" : "") + "</td><td>" + esc(x.owner) + "</td><td>" + esc(x.deadline ? day(x.deadline.slice(0, 10)) : "–") + (x.late ? " · <b>late</b>" : "") + "</td><td><span class='pill" + (x.status === "blocked" ? " warn" : "") + "'>" + esc(x.status) + "</span></td></tr>";
    }).join("") : "";
    stack("taskTable");
  }

  window.HQ = { sample: sample, state: state, setRange: setRange, refresh: refresh, net: function (p, m, a) { netState(p, m, a); }, keep: keep, kept: kept, showLogin: showLogin, showShell: showShell, rangeQuery: rangeQuery,
    esc: esc, fmt: fmt, money: money, day: day, ago: ago, getJSON: getJSON, authFail: authFail };
  /* hq-pages.js is loaded with defer right after this file: start once both are in */
  document.addEventListener("DOMContentLoaded", start);
})();
