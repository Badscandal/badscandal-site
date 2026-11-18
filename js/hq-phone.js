/* BADSCANDAL HQ · the phone opening screen (18 Nov 2026).
   Draws Needs you, the numbers strip, the week, the spend gauge, the Monday pick and the lyrics
   card from data the page already has. Yes / No go through the same message write as Messages
   (the listener in js/hq-staff.js). Nothing here can pause an ad, post, or store a password. */
(function () {
  "use strict";
  var L = window.HQLib;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.HQ ? HQ.esc(s) : String(s == null ? "" : s); };
  var lyricsCache = {};
  var QUIET = "bs_hq_quiet", LATER = "bs_hq_later";
  var openCard = "", editing = "";

  function quietOn() { try { return localStorage.getItem(QUIET) !== "0"; } catch (e) { return true; } }
  function applyQuiet() {
    document.body.classList.toggle("quiet", quietOn());
    var b = $("quietBtn");
    if (b) { b.setAttribute("aria-pressed", quietOn() ? "true" : "false"); b.textContent = quietOn() ? "Quiet on" : "Quiet off"; }
  }
  function snoozed(id) {
    try { var o = JSON.parse(localStorage.getItem(LATER) || "{}"); return o[id] && o[id] > Date.now(); } catch (e) { return false; }
  }
  function snooze(id) {
    try {
      var o = JSON.parse(localStorage.getItem(LATER) || "{}");
      o[id] = Date.now() + 6 * 3600000;
      localStorage.setItem(LATER, JSON.stringify(o));
    } catch (e) {}
    draw();
  }

  function spark(series) {
    var v = (series || []).map(Number).filter(function (n) { return isFinite(n); });
    if (v.length < 2) return "";
    var w = 72, h = 22, min = Math.min.apply(null, v), max = Math.max.apply(null, v), span = max - min || 1;
    var d = v.map(function (n, i) { return (i ? "L" : "M") + (i / (v.length - 1) * w).toFixed(1) + " " + (h - ((n - min) / span) * (h - 2) - 1).toFixed(1); }).join(" ");
    return '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true"><path d="' + d + '"/></svg>';
  }
  function fmt(n) { return n == null || !isFinite(Number(n)) ? "–" : Math.round(Number(n)).toLocaleString("en-US"); }
  function signed(n) { if (n == null || !isFinite(n)) return ""; return (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n)); }

  function gaugeHtml(g) {
    if (!g || !g.reported) return '<p class="gauge-miss">Ad spend this month: not reported</p>';
    var max = g.amount || 1, parts = g.parts || [], sum = parts.reduce(function (a, p) { return a + p.amount; }, 0);
    var segs = parts.map(function (p) { return '<i class="g-' + esc(L.slug(p.name)) + '" style="width:' + Math.max(0, p.amount / max * 100).toFixed(2) + '%" title="' + esc(p.name + " " + L.money(p.amount, g.currency)) + '"></i>'; }).join("");
    var rest = Math.max(0, g.spent - sum);
    if (rest > 0.5) segs += '<i class="g-rest" style="width:' + (rest / max * 100).toFixed(2) + '%"></i>';
    var marks = '<b class="gw" style="left:' + (g.warn / max * 100) + '%"></b><b class="gs" style="left:' + (g.stop / max * 100) + '%"></b>';
    var legend = parts.map(function (p) { return '<span><i class="g-' + esc(L.slug(p.name)) + '"></i>' + esc(p.name) + " " + esc(L.money(p.amount, g.currency)) + "</span>"; }).join("");
    var gap = g.gaps && g.gaps.length ? '<button class="gapbtn" type="button" aria-expanded="false">Days not read</button><p class="gapwhy" hidden>' + esc(g.gaps.join("; ")) + "</p>" : "";
    return '<div class="gauge" aria-label="' + esc(g.label) + '"><p class="gauge-n"><b>' + esc(g.label) + '</b><span>750 · 900</span></p>' +
      '<div class="gbar" role="img">' + segs + marks + "</div>" +
      (legend ? '<p class="gleg">' + legend + "</p>" : "") + gap + "</div>";
  }

  function cardButtons(c) {
    var dis = HQ.sample ? " disabled" : "";
    var yesLabel = c.lyrics ? "Yes, correct" : "Yes";
    var h = '<div class="dacts">';
    if (c.yes) h += '<button class="sendbtn" type="button" data-decide="' + esc(c.id) + '" data-choice="' + esc(c.yes) + '"' + dis + ">" + esc(yesLabel) + (c.yes !== yesLabel ? '<small>' + esc(c.yes) + "</small>" : "") + "</button>";
    if (c.no) h += '<button class="copybtn" type="button" data-decide="' + esc(c.id) + '" data-choice="' + esc(c.no) + '"' + dis + ">No<small>" + esc(c.no) + "</small></button>";
    if (c.later) h += '<button class="copybtn" type="button" data-decide="' + esc(c.id) + '" data-choice="' + esc(c.later) + '"' + dis + ">Later</button>";
    else h += '<button class="copybtn" type="button" data-snooze="' + esc(c.id) + '">Later</button>';
    return h + "</div>";
  }

  function stackHtml(list, topOpen) {
    return (list || []).map(function (c, i) {
      var open = openCard ? openCard === c.id : (topOpen && i === 0);
      var money = c.money_at_risk && c.amount != null ? " · " + c.currency + " " + c.amount : "";
      var link = /^https:\/\//.test(c.link || "") ? '<p class="dmeta"><a href="' + esc(c.link) + '">' + esc(c.link) + "</a></p>" : "";
      var dis = window.HQ && HQ.sample ? " disabled" : "";
      return '<article class="dcard astack' + (open ? " open" : "") + '"><button class="astackbtn" type="button" data-aopen="' + esc(c.id) + '"><b>' + esc(c.owner_bot || c.owner) + "</b> " + esc(c.preview || c.text) + esc(money) + "</button>" +
        '<div class="abody"' + (open ? "" : " hidden") + "><p>" + esc(c.text) + "</p>" +
        (c.recipient ? "<p>To " + esc(c.recipient) + "</p>" : "") + link +
        (c.deadline ? '<p class="dmeta">' + esc(c.deadline) + "</p>" : "") +
        '<p class="drec">' + esc(c.line) + "</p>" +
        '<div class="dacts"><button class="sendbtn" type="button" data-achoice="yes" data-aid="' + esc(c.id) + '"' + dis + ">Yes</button>" +
        '<button class="copybtn" type="button" data-achoice="no" data-aid="' + esc(c.id) + '"' + dis + ">No</button>" +
        '<button class="copybtn" type="button" data-achoice="edit" data-aid="' + esc(c.id) + '"' + dis + ">Edit</button></div>" +
        (editing === c.id ? '<div class="aedit"><textarea class="fld" rows="4" maxlength="600" data-aedit="' + esc(c.id) + '">' + esc(c.text) + '</textarea><button class="sendbtn" type="button" data-asave="' + esc(c.id) + '"' + dis + ">Save this version</button></div>" : "") +
        '<p class="ferr" data-aerr="' + esc(c.id) + '"></p></div></article>';
    }).join("");
  }
  function othersHtml(items) {
    if (!items || !items.length) return "";
    return '<section class="waitlane"><h2>Waiting on others</h2><ul>' + items.map(function (it) {
      var meta = [];
      if (it.ticket) meta.push(it.ticket);
      if (it.days != null) meta.push(it.days === 1 ? "1 day" : it.days + " days");
      return '<li class="' + (it.tone === "bad" ? "bad" : "") + '"><b>' + esc(it.name) + "</b> " + esc(it.text) + (meta.length ? "<small>" + esc(meta.join(" · ")) + "</small>" : "") + "</li>";
    }).join("") + "</ul></section>";
  }
  function sendChoice(id, choice, text) {
    if (!window.HQ || HQ.sample) return;
    HQ.postJSON("/api/staff/card", { id: id, choice: choice, text: text || "" }).then(function (res) {
      if (res && res.s === 200 && res.j && res.j.ok) { editing = ""; openCard = ""; if (window.HQStaff && HQStaff.reload) HQStaff.reload(); return; }
      var p = document.querySelector('[data-aerr="' + id + '"]');
      if (p) p.textContent = (res && res.j && res.j.error) || "Couldn't save that.";
    }, function () {
      var p = document.querySelector('[data-aerr="' + id + '"]');
      if (p) p.textContent = "No connection. Nothing was sent.";
    });
  }

  function drawHome() {
    var el = $("phoneHome"); if (!el || !window.HQ) return;
    var board = window.HQStaff && HQStaff.board ? HQStaff.board() : null;
    var sheet = HQ.sheet ? HQ.sheet() : null;
    var ov = HQ.overview ? HQ.overview() : null;
    var waiting = (board && board.waiting && board.waiting.luke) || [];
    var cards = L.decisionCards(waiting).filter(function (c) { return !snoozed(c.id); });
    var auto = board && board.auto;
    var h = "";
    if (auto && auto.header) h += '<p class="dhead">' + esc(auto.header) + "</p>" + stackHtml(auto.needsYou, true);
    if (auto && auto.quiet && auto.held && auto.held.length) h += '<p class="dnone">Quiet hours until 08:00. These wait.</p>' + stackHtml(auto.held, false);
    cards.forEach(function (c) {
      if (c.lyrics) { h += lyricsCard(c); return; }
      h += '<article class="dcard" data-card="' + esc(c.id) + '"><p class="dfrom">' + esc(c.from) + (c.song ? " · " + esc(c.song) : "") + "</p>" +
        '<p class="dline' + (c.line.length > 90 ? " clamp" : "") + '">' + esc(c.line) + "</p>" +
        (c.line.length > 90 ? '<button class="linkbtn" type="button" data-expand>More</button>' : "") +
        (c.recommended ? '<p class="drec">Recommended: ' + esc(c.recommended) + "</p>" : "") + cardButtons(c) + "</article>";
    });
    var watchers = L.phoneWatchers ? L.phoneWatchers(board) : [];
    watchers.forEach(function (w) {
      h += '<article class="dcard"><p class="dfrom">' + esc(w.title) + '</p><p class="dline' + (w.line.length > 160 ? " clamp" : "") + '">' + esc(w.line) + "</p>" +
        (w.line.length > 160 ? '<button class="linkbtn" type="button" data-expand>More</button>' : "") +
        (w.href ? '<a class="linkbtn" href="' + esc(w.href) + '">Open</a>' : "") + "</article>";
    });
    if (!cards.length && !(auto && auto.needsYou && auto.needsYou.length) && !watchers.length) h += '<p class="dnone">Nothing is waiting on you.</p>';
    if (auto) h += othersHtml(auto.waitingOnOthers);
    h += stripHtml(sheet, ov);
    h += mondayHtml(board);
    el.innerHTML = h;
    var ads = $("adsGauge");
    if (ads) ads.innerHTML = gaugeHtml(L.spendGauge(sheet && sheet.money && sheet.money.cap));
    cards.forEach(function (c) { if (c.lyrics && c.releaseId) loadLyrics(c); });
  }

  function stripHtml(sheet, ov) {
    var rows = L.followerStrip(sheet && sheet.growth);
    var bits = rows.map(function (g) {
      var n = g.reported ? fmt(g.followers) : "not reported";
      var d = g.reported && g.day != null ? '<span class="' + (g.day > 0 ? "up" : g.day < 0 ? "dn" : "") + '">' + esc(signed(g.day)) + "</span>" : "";
      return '<a class="fcell" href="#growth"><b>' + esc(g.platform) + "</b><span class=\"fn\">" + esc(n) + "</span>" + d + spark(g.series) + "</a>";
    }).join("");
    var art = sheet && L.artistLines(sheet.artist);
    var listeners = art ? esc(art.big) : "not reported";
    var cap = L.spendGauge(sheet && sheet.money && sheet.money.cap);
    return '<div class="nstrip">' + bits +
      '<a class="fcell" href="#songs"><b>Listeners</b><span class="fn">' + listeners + "</span></a>" +
      '<a class="fcell wide" href="#ads">' + gaugeHtml(cap) + "</a></div>";
  }

  function mondayHtml(board) {
    var ig = window.HQ && HQ.instagram ? HQ.instagram() : null;
    var ranking = ig && ig.ranking;
    if (!ranking || !(ranking.ranked || []).length) return "";
    var songs = [];
    var ov = HQ.overview && HQ.overview();
    var sheet = HQ.sheet && HQ.sheet();
    ((ov && ov.songs) || []).forEach(function (s) { songs.push({ title: s.title, cover: s.cover || "" }); });
    ((sheet && sheet.songs) || []).forEach(function (s) { if (!songs.some(function (x) { return x.title === s.song; })) songs.push({ title: s.song, cover: s.cover || "" }); });
    var waiting = (board && board.waiting && board.waiting.luke) || [];
    var decision = waiting.filter(function (m) { return m && m.from === "Forge" && m.needs === "decision" && !m.resolved; })[0] || null;
    var pick = L.mondayPick(ranking, decision, songs);
    if (!pick) return "";
    var slide = function (p, label) {
      if (!p) return "";
      var img = p.cover ? '<img src="' + esc(p.cover) + '" alt="">' : '<span class="nothumb">No cover on file</span>';
      return '<article class="mpick"><p class="dfrom">' + esc(label) + "</p>" + img + "<h3>" + esc(p.song) + "</h3>" +
        "<p>" + esc(p.rate) + "</p><p>" + esc(p.deep) + "</p><p>Cost per engagement: " + esc(p.cost) + "</p></article>";
    };
    var acts = "";
    if (pick.decisionId && pick.yes) {
      var dis = HQ.sample ? " disabled" : "";
      acts = '<div class="dacts"><button class="sendbtn" type="button" data-decide="' + esc(pick.decisionId) + '" data-choice="' + esc(pick.yes) + '"' + dis + ">Yes<small>" + esc(pick.yes) + "</small></button>" +
        (pick.no ? '<button class="copybtn" type="button" data-decide="' + esc(pick.decisionId) + '" data-choice="' + esc(pick.no) + '"' + dis + ">No<small>" + esc(pick.no) + "</small></button>" : "") + "</div>";
    } else acts = '<p class="drec">Forge has not asked yet, so there is nothing to answer.</p>';
    return '<section class="monday"><h2>Monday pick</h2><div class="mswipes">' + slide(pick.pick, "This one") + slide(pick.runner, "Runner-up") + "</div>" + acts + "</section>";
  }

  function lyricsCard(c) {
    var got = lyricsCache[c.releaseId];
    var body = !got ? '<p class="lyr-wait">Opening the lyrics…</p>' : got.error ? '<p class="lyr-wait">' + esc(got.error) + ' <button class="linkbtn" type="button" data-lyrics="' + esc(c.releaseId) + '">Try again</button></p>'
      : got.empty ? '<p class="lyr-wait">No lyrics in the pack yet.</p>'
      : '<div class="lyrics-prev"><p class="ly-title">' + esc(c.song || "Lyrics") + "</p>" + got.lines.map(function (l) { return "<p>" + (l ? esc(l) : " ") + "</p>"; }).join("") + "</div>";
    return '<article class="dcard lyrics-card" data-card="' + esc(c.id) + '"><p class="dfrom">' + esc(c.from) + " · final lyrics</p>" + body + cardButtons(c) + "</article>";
  }
  function loadLyrics(c) {
    if (!c.releaseId || lyricsCache[c.releaseId] || !window.HQ) return;
    lyricsCache[c.releaseId] = { wait: true };
    HQ.getJSON("/api/staff/release?id=" + encodeURIComponent(c.releaseId) + (HQ.sample ? "&sample=1" : "")).then(function (res) {
      if (res.s !== 200 || !res.j || !res.j.release) { lyricsCache[c.releaseId] = { error: "Couldn't open the lyrics (" + res.s + ")." }; drawHome(); return; }
      var text = res.j.release.pack && res.j.release.pack.lyrics;
      var prev = L.lyricsPreview(text);
      lyricsCache[c.releaseId] = prev.empty ? { empty: true } : { lines: prev.lines };
      drawHome();
    }, function () { lyricsCache[c.releaseId] = { error: "No connection." }; drawHome(); });
  }

  function drawWeek() {
    var el = $("weekAhead"); if (!el || !window.HQ) return;
    var board = window.HQStaff && HQStaff.board ? HQStaff.board() : null;
    var ov = HQ.overview ? HQ.overview() : null;
    var today = (board && board.today) || (HQ.sheet() && HQ.sheet().today) || "";
    var items = L.weekAhead({ today: today, releases: (board && board.releases) || [], homeCard: (ov && ov.homeCard) || null });
    el.innerHTML = items.length ? '<h2 class="t-lbl">Next 7 days</h2><ol class="week">' + items.map(function (x) {
      return '<li class="wk ' + esc(x.kind) + '"><a href="' + esc(x.href) + '"><i></i><span>' + esc(L.day(x.date)) + "</span><b>" + esc(x.title) + "</b></a></li>";
    }).join("") + "</ol>" : "";
  }

  function drawTeam() {
    var el = $("teamStrip"); if (!el || !window.HQStaff || !HQStaff.board || !HQStaff.board()) return;
    var sheet = HQ.sheet ? HQ.sheet() : null;
    var workers = (HQStaff.board().staff || []).map(function (w) { return L.workerView(w, sheet, HQStaff.board().today); });
    var dots = L.teamDots(workers);
    el.innerHTML = dots.length ? '<div class="dots" role="list">' + dots.map(function (d) {
      return '<button class="dotbtn ' + d.tone + '" type="button" data-dot="' + esc(d.slug) + '" aria-label="' + esc(d.name + ", " + d.label) + '"><i></i><span>' + esc(d.name) + "</span></button>";
    }).join("") + "</div>" : "";
  }

  function draw() { applyQuiet(); drawHome(); drawWeek(); drawTeam(); }

  document.addEventListener("hq:refreshed", draw);
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("[data-aopen],[data-achoice],[data-asave]");
    if (a) {
      if (a.hasAttribute("data-aopen")) { openCard = a.getAttribute("data-aopen"); drawHome(); return; }
      var id = a.getAttribute("data-aid") || a.getAttribute("data-asave");
      if (a.getAttribute("data-achoice") === "edit") { editing = id; openCard = id; drawHome(); return; }
      if (a.hasAttribute("data-asave")) {
        var box = document.querySelector('[data-aedit="' + id + '"]');
        sendChoice(id, "edit", box ? box.value : "");
        return;
      }
      if (a.getAttribute("data-achoice") === "yes" || a.getAttribute("data-achoice") === "no") sendChoice(id, a.getAttribute("data-achoice"));
      return;
    }
    var t = ev.target.closest && ev.target.closest("[data-expand],[data-snooze],[data-lyrics],[data-dot],.gapbtn,#quietBtn");
    if (!t) return;
    if (t.id === "quietBtn") {
      try { localStorage.setItem(QUIET, quietOn() ? "0" : "1"); } catch (e) {}
      applyQuiet();
      if (window.HQ && HQ.drawFeed && window.HQStaff && HQStaff.board && HQStaff.board()) HQ.drawFeed(L.liveFeed(HQStaff.board(), HQ.sheet()), HQStaff.board().today);
      return;
    }
    if (t.hasAttribute("data-expand")) {
      var p = t.previousElementSibling;
      if (p) p.classList.toggle("open");
      t.textContent = p && p.classList.contains("open") ? "Less" : "More";
      return;
    }
    if (t.hasAttribute("data-snooze")) { snooze(t.getAttribute("data-snooze")); return; }
    if (t.hasAttribute("data-lyrics")) { delete lyricsCache[t.getAttribute("data-lyrics")]; drawHome(); return; }
    if (t.classList.contains("gapbtn")) {
      var why = t.nextElementSibling;
      if (why) { why.hidden = !why.hidden; t.setAttribute("aria-expanded", why.hidden ? "false" : "true"); }
      return;
    }
    var slug = t.getAttribute("data-dot");
    if (!slug) return;
    var card = document.getElementById("team-" + slug);
    if (card) { card.classList.add("pin"); card.open = true; card.hidden = false; card.scrollIntoView({ block: "nearest" }); }
    if (location.hash !== "#team") location.hash = "#team";
  });
  document.addEventListener("DOMContentLoaded", applyQuiet);
  applyQuiet();
})();
