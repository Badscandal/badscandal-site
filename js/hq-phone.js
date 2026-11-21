/* BADSCANDAL HQ · the phone opening screen (18 Nov 2026).
   Draws Needs you, the numbers strip, the week, the spend gauge, the Monday pick and the lyrics
   card from data the page already has. Yes / No go through the same message write as Messages
   (the listener in js/hq-staff.js). Nothing here can pause an ad, post, or store a password. */
(function () {
  "use strict";
  var L = window.HQLib;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.HQ ? HQ.esc(s) : String(s == null ? "" : s); };
  var QUIET = "bs_hq_quiet", LATER = "bs_hq_later";
  var openCard = "", editing = "";

  function quietOn() { try { return localStorage.getItem(QUIET) !== "0"; } catch (e) { return true; } }
  function applyQuiet() {
    document.body.classList.toggle("quiet", quietOn());
    var b = $("quietBtn");
    if (b) { b.setAttribute("aria-pressed", quietOn() ? "true" : "false"); b.title = "Holds non-urgent cards until morning"; b.textContent = quietOn() ? "Night quiet" : "Night quiet off"; }
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

  function spark(series, name) {
    if (!window.HQChart) return "";
    return HQChart.html(series, { label: (name || "Followers") + " followers", totals: false });
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
    return '<div class="gauge" aria-label="' + esc(g.label) + '"><p class="gauge-n"><b>' + esc(g.label) + '</b>' + (g.asOf ? '<span>as of ' + esc(g.asOf) + "</span>" : '<span>750 · 900</span>') + "</p>" +
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

  var openId = "";
  function walletCard(c, open) {
    var when = c.deadline ? L.day(c.deadline) : "";
    var meta = [c.amount, when].filter(Boolean).join(" · ");
    var diff = "";
    if (c.lyrics && window.HQLook) {
      var d = HQLook.lyricsDiff(c.before, c.after);
      diff = d.ready ? '<div class="ldiff">' + d.rows.map(function (row) {
        return '<p class="ld ' + row.kind + '">' + esc(row.text || " ") + "</p>";
      }).join("") + "</div>" : '<p class="lyr-wait">' + esc(d.line) + "</p>";
    }
    return '<article class="wallet" data-card="' + esc(c.id) + '"><button type="button" class="whead" data-wallet aria-expanded="' + (open ? "true" : "false") + '"><span>' + esc(c.from || "Decision") + "</span><span class=\"wmeta\">" + esc(meta || "Tap to open") + "</span></button>" +
      '<div class="wbody"' + (open ? "" : " hidden") + "><p>" + esc(c.text || c.line || "") + "</p>" + diff +
      (c.recommended ? '<p class="drec">Recommended: ' + esc(c.recommended) + "</p>" : "") + cardButtons(c) + "</div></article>";
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
  /* questions stay tappable; a task's reason is its own muted line, never glued to the title */
  function youHtml(items, wallets, openId) {
    var rows = items.map(function (it) {
      if (it.kind === "question" && wallets[it.id]) return '<li class="you-card">' + walletCard(wallets[it.id], it.id === openId) + "</li>";
      var reason = it.reason ? '<p class="why">' + esc(it.reason) + "</p>" : "";
      var code = /^T-/i.test(String(it.id || "")) ? "" : it.id;
      return '<li class="tone-' + esc(it.tone || "") + '"><a href="' + esc(it.href || "#today") + '">' + (code ? "<b>" + esc(code) + "</b> " : "") + esc(it.title) + "</a>" + reason + "</li>";
    }).join("");
    return '<section class="waitlane you" aria-label="Waiting on you"><h2>Waiting on you</h2><ul>' + rows + "</ul></section>";
  }
  function othersHtml(items) {
    if (!items || !items.length) return "";
    return '<section class="waitlane"><h2>Waiting on others</h2><ul>' + items.map(function (it) {
      var meta = [];
      if (it.ticket) meta.push(it.ticket);
      if (it.days != null) meta.push(window.HQLib.waitedWords(it.days));
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
    var V = window.HQLook;
    var board = window.HQStaff && HQStaff.board ? HQStaff.board() : null;
    var sheet = HQ.sheet ? HQ.sheet() : null;
    var ov = HQ.overview ? HQ.overview() : null;
    if (!V) { el.innerHTML = '<p class="look-empty">The layout did not load. <button type="button" class="sendbtn" data-look-retry>Retry</button></p>'; return; }
    var allWaiting = (board && board.waiting && board.waiting.luke) || [];
    var waiting = allWaiting.filter(function (m) { return m && !snoozed(m.id); });
    var tasks = (sheet && sheet.team && sheet.team.tasks) || (board && board.tasks) || [];
    var stack = V.decisionStack(waiting, tasks, board && board.actionCards);
    var auto = board && board.auto;
    var health = L.accountHealthHome ? L.accountHealthHome(board && board.accountHealth) : { dots: [], needs: [] };
    var risk = [];
    try { risk = L.attention({ sheet: sheet, ov: ov, board: board, bank: window.HQStaff && HQStaff.bank ? HQStaff.bank() : null }); } catch (e) { risk = []; }
    /* ONE count (18 Nov 2026): the server's board.needs.total, the same number the needs_you tool gives. A card
       snoozed on this phone still counts: it is still waiting on Luke. */
    var count = board && board.needs && typeof board.needs.total === "number" ? board.needs.total : V.needTotal({ messages: allWaiting, sightings: board && board.sightings, auto: auto, healthNeeds: health.needs }).total;
    var snoozedN = allWaiting.filter(function (m) { return m && snoozed(m.id); }).length;
    var pulse = V.homePulse({ need: count, risk: risk });
    var today = (board && board.today) || (sheet && sheet.today) || "";
    var items = board && board.needs && Array.isArray(board.needs.items) ? board.needs.items : null;
    var decision = "";
    /* one card per item on the shared list. The header count is that list. No second "also waiting" list. */
    if (items) {
      decision += askHtml(items);
      if (!items.length) decision += '<p class="dnone">Nothing is waiting on you.</p>';
    }
    decision += healthDots(health);
    if (auto) decision += othersHtml(auto.waitingOnOthers);
    if (snoozedN) decision += '<p class="wcount">' + snoozedN + " snoozed on this phone (still counted above)</p>";
    var covers = {};
    ((ov && ov.songs) || []).forEach(function (s) { if (s && s.title) covers[s.title] = s.cover || ""; });
    var hero = V.releaseHero((board && board.releases) || [], today, covers);
    var miles = V.milestones((sheet && sheet.songs) || []);
    /* the platform numbers live on Growth & Fans (18 Nov 2026, Luke: they cluttered Needs you) */
    var kpis = [];
    var h = V.homeHtml({ pulse: pulse, decision: decision, milestones: miles, hero: hero, kpis: kpis });
    h += mondayHtml(board);
    el.innerHTML = h;
    var ads = $("adsGauge");
    if (ads) ads.innerHTML = gaugeHtml(L.spendGauge(sheet && sheet.money && sheet.money.cap));
  }

  /* v18 (21 Nov 2026, Luke): one card per item of the ONE list (board.needs.items). A decision is one short
     question with Yes / No / Reply; the email opens only on Reply and can be edited. An ask has a reply box,
     plus Done when it is an action. Answers are recorded the way they were before (needCard's "via"). The
     drawing is HQLook.needCardHtml; what a tap sends is below. Typing survives the 5-minute refresh. */
  var nOpen = {}, nDraft = {}, nItems = {};
  function askHtml(items) {
    var V = window.HQLook;
    nItems = {};
    return (items || []).map(function (x, i) {
      if (!x || !x.key) return "";
      nItems[x.key] = x;
      return V.needCardHtml(x, { first: i === 0, open: !!nOpen[x.key], draft: nDraft[x.key], sample: !!(window.HQ && HQ.sample) });
    }).join("");
  }
  function nErr(key, text) {
    var p = document.querySelector('[data-nerr="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]');
    if (p) p.textContent = text || "";
  }
  function nFields(key) {
    var x = nItems[key] || {};
    var sel = function (f) { return document.querySelector('[data-nk="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"][data-nf="' + f + '"]'); };
    if (x.email) {
      var e = {};
      ["to", "cc", "subject", "body"].forEach(function (f) { var el = sel(f); e[f] = el ? String(el.value || "") : ""; });
      return { email: e, text: window.HQLook.needEmailText(e) };
    }
    var t = sel("text");
    return { text: t ? String(t.value || "").trim() : "" };
  }
  /* one tap -> one write, the same endpoints as before v18 */
  function nSend(x, act, text) {
    var j = function (path, body) { return HQ.postJSON(path, body); };
    if (x.via === "message") {
      if (act === "done") return j("/api/staff/resolve", { id: x.id, note: "done" });
      var said = act === "yes" ? x.yes.choice : act === "no" ? x.no.choice : text;
      if (act !== "send" && String(said).trim().length < 2) said = "Answer: " + said;
      return j("/api/staff/message", { to: x.to, text: said, needs: "none", re: x.id, note: act === "send" ? "" : String((act === "yes" ? x.yes : x.no).choice).slice(0, 240) });
    }
    if (x.via === "case") {
      var c = act === "yes" ? x.yes : act === "no" ? x.no : { choice: "respond" };
      return j("/api/staff/case", { id: x.id, choice: c.choice, text: act === "send" ? text : (c.text || "") });
    }
    if (x.via === "card") return j("/api/staff/card", { id: x.id, choice: act === "send" ? "edit" : act, text: act === "send" ? text : "" });
    /* mark: a sign-in, access, a task, a fan, a bot waiting on his yes */
    var body = { key: x.key, to: x.to };
    if (act === "yes" || act === "no") { body.text = (act === "yes" ? x.yes : x.no).text || (act === "yes" ? "Yes" : "No"); body.choice = act; }
    else if (act === "done") { body.text = "Done: " + (x.title || x.text || ""); body.choice = "done"; }
    else if (x.kind === "fan") { body.text = "Reply to the fan on Instagram (" + (x.title || "") + "): " + text; body.needs = "action"; body.choice = "reply"; }
    else { body.text = text; body.done = x.type === "decision"; body.choice = "reply"; }
    return j("/api/staff/need", body);
  }
  document.addEventListener("input", function (ev) {
    var el = ev.target;
    var key = el && el.getAttribute && el.getAttribute("data-nk"), f = el && el.getAttribute && el.getAttribute("data-nf");
    if (!key || !f) return;
    if (f === "text") nDraft[key] = String(el.value || "");
    else { var d = nDraft[key] && typeof nDraft[key] === "object" ? nDraft[key] : Object.assign({}, (nItems[key] || {}).email || {}); d[f] = String(el.value || ""); nDraft[key] = d; }
  });
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-nact]");
    if (!b || !window.HQ) return;
    var key = b.getAttribute("data-nk"), act = b.getAttribute("data-nact"), x = nItems[key];
    if (!x) return;
    if (act === "reply") {
      nOpen[key] = !nOpen[key]; drawHome();
      if (nOpen[key]) { var first = document.querySelector('[data-nk="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"][data-nf]'); if (first) first.focus(); }
      return;
    }
    if (HQ.sample) { nErr(key, "This is the sample: nothing is sent."); return; }
    var text = "";
    if (act === "send") {
      text = nFields(key).text;
      if (String(text).replace(/^(To|CC|Subject|Body):\s*$/gim, "").trim().length < 2) { nErr(key, "Write the reply first."); return; }
    }
    b.disabled = true; nErr(key, "");
    var card = b.closest && b.closest(".needcard");
    nSend(x, act, text).then(function (res) {
      b.disabled = false;
      if (res && res.s === 200 && res.j && res.j.ok !== false) {
        if (card) card.classList.add("gone");
        delete nOpen[key]; delete nDraft[key];
        try { document.dispatchEvent(new CustomEvent("hq:decided", { detail: { ok: true, id: x.id } })); } catch (e) {}
        if (window.HQStaff && HQStaff.reload) HQStaff.reload(true);
        return;
      }
      nErr(key, (res && res.j && res.j.error) || "That didn't send. Nothing changed.");
    }, function () { b.disabled = false; nErr(key, "No connection. Nothing was sent."); });
  });

  function healthDots(health) {
    var dots = (health && health.dots) || [];
    if (!dots.length && !(health && health.connection && health.connection.state === "watch")) return "";
    var row = dots.map(function (d) {
      return '<a class="adot ' + esc(d.state) + '" href="#growth"><i></i><span>' + esc(d.label) + "</span></a>";
    }).join("");
    var note = health.connection && health.connection.state === "watch" ? '<p class="dnone">' + esc(health.connection.line) + "</p>" : "";
    return '<div class="adots" role="list">' + row + "</div>" + note;
  }

  function stripHtml(sheet, ov) {
    var rows = L.followerStrip(sheet && sheet.growth);
    var bits = rows.map(function (g) {
      var n = g.reported ? fmt(g.followers) : "not reported";
      var d = g.reported && g.day != null ? '<span class="' + (g.day > 0 ? "up" : g.day < 0 ? "dn" : "") + '">' + esc(signed(g.day)) + "</span>" : "";
      return '<div class="fcell"><a href="#growth"><b>' + esc(g.platform) + "</b><span class=\"fn\">" + esc(n) + "</span>" + d + "</a>" + spark(g.series, g.platform) + "</div>";
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
      /* the post's picture; if Instagram's link has expired, the song's cover, else a plain tile with no "missing" words */
      var img = p.cover ? '<img src="' + esc(p.cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer" data-fallback="' + esc(p.fallback || "") + '">' : '<span class="nothumb">' + esc(p.song) + "</span>";
      return '<article class="mpick"><p class="dfrom">' + esc(label) + "</p>" + img + "<h3>" + esc(p.song) + "</h3>" +
        "<p>" + esc(p.rate) + "</p><p>" + esc(p.deep) + "</p>" + (p.cost && p.cost !== "not reported" ? "<p>Cost per engagement: " + esc(p.cost) + "</p>" : "") + "</article>";
    };
    var acts = "";
    if (pick.decisionId && pick.yes) {
      var dis = HQ.sample ? " disabled" : "";
      acts = '<div class="dacts"><button class="sendbtn" type="button" data-decide="' + esc(pick.decisionId) + '" data-choice="' + esc(pick.yes) + '"' + dis + ">Yes<small>" + esc(pick.yes) + "</small></button>" +
        (pick.no ? '<button class="copybtn" type="button" data-decide="' + esc(pick.decisionId) + '" data-choice="' + esc(pick.no) + '"' + dis + ">No<small>" + esc(pick.no) + "</small></button>" : "") + "</div>";
    } else acts = "";
    return '<section class="monday"><h2>Monday pick</h2><div class="mswipes">' + slide(pick.pick, "This one") + slide(pick.runner, "Runner-up") + "</div>" + acts + "</section>";
  }

  /* the lyrics card is walletCard() with the diff (18 Nov 2026: the unused lyricsCard()/loadLyrics() were removed) */

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
  /* a post picture whose Instagram link has expired: the song's cover, else a plain tile (18 Nov 2026) */
  document.addEventListener("error", function (ev) {
    var t = ev.target;
    if (!t || t.tagName !== "IMG" || !t.hasAttribute("data-fallback")) return;
    var f = t.getAttribute("data-fallback");
    t.removeAttribute("data-fallback");
    if (f) { t.src = f; return; }
    var s = document.createElement("span"); s.className = "nothumb"; t.parentNode && t.parentNode.replaceChild(s, t);
  }, true);
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
    var t = ev.target.closest && ev.target.closest("[data-expand],[data-wallet],[data-snooze],[data-dot],[data-source],.gapbtn,#quietBtn");
    if (!t) return;
    if (t.id === "quietBtn") {
      try { localStorage.setItem(QUIET, quietOn() ? "0" : "1"); } catch (e) {}
      applyQuiet();
      if (window.HQ && HQ.drawFeed && window.HQStaff && HQStaff.board && HQStaff.board()) HQ.drawFeed(L.liveFeed(HQStaff.board(), HQ.sheet()), HQStaff.board().today);
      return;
    }
    if (t.hasAttribute("data-wallet")) {
      var card = t.closest(".wallet");
      openId = card && card.getAttribute("data-card") === openId ? "" : (card ? card.getAttribute("data-card") : "");
      draw();
      return;
    }
    if (t.hasAttribute("data-source")) {
      var was = t.getAttribute("data-said");
      if (was) { t.textContent = "Source"; t.removeAttribute("data-said"); }
      else { t.setAttribute("data-said", "1"); t.textContent = t.getAttribute("data-source"); }
      return;
    }
    if (t.hasAttribute("data-expand")) {
      var p = t.previousElementSibling;
      if (p) p.classList.toggle("open");
      t.textContent = p && p.classList.contains("open") ? "Less" : "More";
      return;
    }
    if (t.hasAttribute("data-snooze")) { snooze(t.getAttribute("data-snooze")); return; }
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

  function toast(msg) {
    var t = $("lookToast");
    if (!t) {
      t = document.createElement("p");
      t.id = "lookToast";
      t.className = "look-toast";
      t.setAttribute("role", "status");
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 2400);
  }
  document.addEventListener("hq:decided", function (ev) {
    var d = (ev && ev.detail) || {};
    toast(d.ok ? "Done" : (d.error || "That didn't send"));
  });
  var swipe = null;
  document.addEventListener("pointerdown", function (ev) {
    var card = ev.target.closest && ev.target.closest(".wallet");
    if (!card || (ev.target.closest && ev.target.closest("button, a, textarea, input"))) return;
    swipe = { x: ev.clientX, y: ev.clientY, card: card };
  });
  document.addEventListener("pointerup", function (ev) {
    if (!swipe) return;
    var dx = ev.clientX - swipe.x, dy = ev.clientY - swipe.y, card = swipe.card;
    swipe = null;
    var btn = null;
    if (dy > 72 && dy > Math.abs(dx)) btn = card.querySelector("[data-snooze]");
    else if (dx > 72 && Math.abs(dx) > Math.abs(dy)) btn = card.querySelector(".sendbtn");
    else if (dx < -72 && Math.abs(dx) > Math.abs(dy)) btn = card.querySelector("[data-decide].copybtn");
    if (!btn && dy > 72) { snooze(card.getAttribute("data-card")); toast("Snoozed"); return; }
    if (btn && !btn.disabled) btn.click();
  });
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-look-retry]");
    if (b && window.HQ && HQ.refresh) HQ.refresh();
  });
})();
