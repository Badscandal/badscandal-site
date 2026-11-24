/* BADSCANDAL HQ · the staff desk on the page (11 Nov 2026). One answer, /api/staff/board (same login
   cookie as everything else; netlify/functions/staff.mjs), drawn in three places:
     Team      the connector strip, ONE card per bot on the roster (also the ones with no duty today),
               the live log
     Messages  what waits on Luke, a box to write, the whole board as threads
   Every rule and every sentence is in js/hq-lib.js (tested); this file
   only draws and sends.

     Releases  (11 Nov 2026) the release pipeline: a card per release on the desk with its files and
               details and every bot's step, the form to start / finish / send one
   Today's "Needs attention", the site-check line and Data health read the same answer through
   js/hq.js (HQ.boardChanged).

   THE ONLY WRITES ON /hq ARE HERE: Luke's own messages (send, answer, mark as done), the bots' key
   switch, his Yes / No / Edit on an action card, the "taps count as Luke's yes" switch, one webhook
   address per bot, the release pipeline, and the profile photo and banner he uploads on Profiles.
   Nothing here can touch an ad, a post, the sheet or any money. Nothing is sent to a platform.
   In /hq?sample=1 nothing is sent at all and the page says so.

   Everything on the board was typed by a bot or a person: it is ALWAYS escaped (esc), never put in
   the page as HTML, and a link is only a link when it starts with https://. */
(function () {
  "use strict";
  var HQ = window.HQ, L = window.HQLib;
  var $ = function (id) { return document.getElementById(id); };
  var esc = HQ.esc;
  var KEY = "bs_hq_last_staff"; /* the last good board, kept on this device (never the sample) */
  var board = null, problem = "", tried = false, goodAt = null, loading = null;
  /* what is open / typed / in flight. Kept OUTSIDE the page so the 5-minute refresh can redraw
     without losing a half-written reply or closing what Luke opened. */
  var ui = fresh();
  function fresh() {
    return { reply: "", ask: null, drafts: {}, err: {}, busy: "", open: {}, why: {}, allThreads: false, keyAsk: false, keyErr: "", keyBusy: false,
      /* replies that visibly land (11 Nov 2026): what Luke just answered (id -> the line in its place)
         and the line under a thread he answered on the board */
      landed: {}, tsent: {},
      /* the release pipeline: busy / error / the inline question per card, notes, open disclosures, the form */
      rel: { busy: "", err: {}, ask: null, note: {}, open: {}, fold: {}, full: {}, loading: {}, gen: {}, tried: {}, time: "", shut: {} }, form: null,
      /* planning (14 Nov 2026): the month shown and the day picked on the calendar */
      cal: { ym: "", sel: "" }, hookDraft: {}, tapAsk: false, tapErr: "", tapBusy: false,
      /* In Spotify for Artists (v2): the question being answered, the label typed, what was answered */
      spot: { k: "", answer: "", label: "", busy: "", err: {}, done: {} } };
  }
  var PEOPLE = ["Luke", "Claude", "HQ", "all"];
  var KEEP_MS = 10 * 60000; /* how long "Sent to Nova at 17:03" stays in the place of what was answered */
  var safe = function (s) { return String(s == null ? "" : s).replace(/[^a-z0-9]/gi, ""); };
  var cap = function (s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); };

  /* ---------- loading: with the other answers, on start and on every refresh ---------- */
  /* fresh (after a write): never reuse an answer asked for BEFORE the write was saved; wait for it, then ask
     again. 24 Nov 2026, Luke: "lets fully remove the money section": Revolut's state is no longer asked for. */
  /* the fields are asked once (they don't change); a New release waiting for them opens as soon as they land */
  function reload(fresh) { if (!fields) loadFields().then(pendingNew, pendingNew); return reloadBoard(fresh); }
  function reloadBoard(fresh) {
    if (loading) return fresh ? loading.then(function () { return reloadBoard(); }) : loading;
    loading = HQ.getJSON("/api/staff/board" + (HQ.sample ? "?sample=1" : "")).then(function (res) {
      loading = null; tried = true;
      if (HQ.authFail(res)) return;
      HQ.showShell();
      if (res.s !== 200 || !res.j || !Array.isArray(res.j.staff)) { failed("Couldn't load (" + res.s + ")", "Couldn't load the team's desk (" + res.s + ")."); return; }
      board = res.j; problem = ""; goodAt = Date.now();
      HQ.net("staff", null);
      HQ.keep(KEY, "", board);
      draw();
    }, function () { loading = null; tried = true; failed("No connection", "offline"); });
    return loading;
  }
  /* A failed board never breaks the page: the last good one stays (or this device's kept copy),
     else Team falls back to the sheet and Messages offers Retry. */
  function failed(why, msg) {
    var old = HQ.kept(KEY);
    if (!board && old) { board = old.j; goodAt = old.at; }
    problem = why;
    HQ.net("staff", msg, board ? goodAt : null);
    draw();
  }
  function clear() {
    board = null; problem = ""; tried = false; goodAt = null; ui = fresh(); fields = null; fieldsFailed = false;
    $("msgText").value = ""; counter(); $("msgErr").textContent = ""; $("msgOk").textContent = "";
    $("waitList").innerHTML = $("threadList").innerHTML = $("dutyList").innerHTML = '<div class="ph"></div>';
    $("answeredList").innerHTML = ""; $("answeredCard").hidden = true;
    $("relForm").hidden = true; $("relForm").innerHTML = ""; $("relDesk").innerHTML = $("relOut").innerHTML = $("relPipe").innerHTML = $("relSpot").innerHTML = ""; if ($("relSpotWrap")) $("relSpotWrap").hidden = true; if ($("relRows")) $("relRows").innerHTML = ""; $("relMsg").textContent = "";
    draw();
  }
  function draw() {
    drawWorkers(); drawMessages(); drawBadges(); drawReleases(); drawProfiles();
    /* New release waiting for the desk; Save and Send wake up when it lands (only then: a refresh must not
       redraw the buttons under Luke's finger) */
    pendingNew(); if (ui.form && ui.form.footFor !== footKey()) drawFoot();
    HQ.boardChanged(); /* Today's attention + site check, Data health, and Team's fallback when there is no board */
  }

  /* ---------- the page's writes ---------- */
  /* -> { ok, j } | { ok:false, error: a plain sentence to show next to the button, j: the answer (a
     release that can't be sent yet names its missing fields in j.missing) } */
  function write(path, body) {
    if (HQ.sample) return Promise.resolve({ ok: false, error: "This is the sample: nothing is sent." });
    return HQ.postJSON("/api/staff/" + path, body).then(function (res) {
      if (HQ.authFail(res)) return { ok: false, error: "You were logged out. Log in and send it again." };
      if (res.s === 200 && res.j && res.j.ok) return { ok: true, j: res.j };
      return { ok: false, j: res.j || {}, error: (res.j && typeof res.j.error === "string" && res.j.error) || "Couldn't save that (" + res.s + "). Try again." };
    }, function () { return { ok: false, error: "No connection. Nothing was sent: try again." }; });
  }
  var off = function () { return HQ.sample ? " disabled" : ""; };

  /* ================= Team ================= */
  function drawConnector() {
    var c = L.connectorLine(board, Date.now()), el = $("connCard");
    var ask = ui.keyAsk
      ? '<div class="confirm" role="group" aria-label="Confirm"><p>' + (c.on ? "Switch the bots' key off? No bot will be able to send updates, messages or payments until you switch it back on."
        : "Switch the bots' key back on? The bots can send updates, messages and payments again.") + '</p><div class="conn-acts"><button class="sendbtn" type="button" data-key="yes"' + (ui.keyBusy ? " disabled" : "") + ">" +
        (ui.keyBusy ? "Switching…" : c.on ? "Yes, switch it off" : "Yes, switch it on") + '</button><button class="copybtn" type="button" data-key="no"' + (ui.keyBusy ? " disabled" : "") + ">Cancel</button></div></div>"
      : '<div class="conn-acts"><button class="copybtn" type="button" data-key="ask"' + off() + ">" + (c.on ? "Switch the bots' key off" : "Switch it back on") + "</button>" +
        (HQ.sample ? '<span class="fok">Sample: the switch does nothing here.</span>' : "") + "</div>";
    el.hidden = false;
    if ($("connFold")) { $("connFold").hidden = false; $("connState").textContent = c.on ? "on" : "OFF"; $("connState").className = c.on ? "" : "off"; if (!c.on) $("connFold").open = true; }
    el.innerHTML = '<p class="conn-line"><b class="' + (c.on ? "" : "off") + '">' + (c.on ? "Connection on" : "Connection off") + "</b> · " + esc(c.rest) + "</p>" +
      c.notes.map(function (n) { return '<p class="conn-note">' + esc(n) + "</p>"; }).join("") + ask + '<p class="ferr" role="alert">' + esc(ui.keyErr) + "</p>";
  }
  var shown = []; /* the bots as drawn (for "Copy message for Nova") */
  /* Team, simpler (13 Nov 2026, Luke: "the team section … making more sense being simpler and better"):
     the bots in three groups (HQLib.teamGroups). Stuck ones get a short card saying only what is wrong
     (botProblems) and "Copy message for Nova"; everyone else is one line (botNext). Every card and line
     opens to everything about that bot (botDetail). Deep link #team/<bot> opens it. */
  function botDetail(w) {
    var now = Date.now(), lastMs = w.last ? L.spMs(w.last.at) : null;
    var counts = L.workerCounts(w), sched = (w.schedule || []).filter(function (x) { return x && x.what; });
    var why = [];
    if (w.why) why.push("<p>" + esc(w.why) + "</p>");
    if (sched.length) why.push("<p><b>Every day</b>" + sched.map(function (x) { return esc((x.time ? x.time + " · " : "") + x.what); }).join("<br>") + "</p>");
    else if (w.duty) why.push("<p><b>Every day</b>" + esc((w.time ? w.time + " · " : "") + w.duty) + "</p>");
    if (w.writes) why.push("<p><b>Writes</b>" + esc(w.writes) + "</p>");
    if (w.access) why.push("<p><b>Access</b>" + esc(w.access) + "</p>");
    if (w.blockers) why.push("<p><b>" + (w.blockersStale ? "Old, still true?" : "Known blockers") + "</b>" + esc(w.blockers) + "</p>");
    return ((w.duties || []).length ? '<p class="bsub">Today\'s duties</p><ul class="bduties">' + w.duties.map(function (d) {
        return '<li class="' + (d.status === "blocked" || d.late ? "bad" : d.status === "done" ? "done" : "") + '"><span class="bt">' + esc(d.task) + (d.blocker ? "<small>Blocked: " + esc(d.blocker) + "</small>" : "") + (d.gaps ? "<small>" + esc(window.HQLib.dutyGapsLine(d)) + "</small>" : "") +
          '</span><span class="bw">' + esc(L.dutyWhen(d)) + "</span></li>"; }).join("") + "</ul>" : "") +
      relSteps(w) +
      (w.last ? '<p class="blast"><b>' + esc(lastMs ? L.ago(now - lastMs) : L.screenText(w.last.at, 40)) + "</b> " + HQ.link(w.last.link, L.screenText(w.last.message)) + "</p>" : "") +
      (w.card && w.card.workingOn ? '<p class="bline"><b>Working on</b><span>' + esc(w.card.workingOn) + "</span></p>" : "") +
      (w.card && w.card.needs ? '<p class="bline need"><b>Needs</b><span>' + esc(w.card.needs) + "</span></p>" : "") +
      '<p class="bmeta">' + (counts ? "<span>" + esc(counts) + "</span>" : "") + "<span>" + esc(L.seenLine(w, now)) + "</span></p>" +
      '<div class="bwhytext"><p class="bsub">Why this bot</p>' + (why.length ? why.join("") : "<p>Nothing is written down for this bot yet.</p>") + "</div>";
  }
  var head = function (w) {
    return '<span class="bn"><b>' + esc(w.name) + "</b>" + (w.role ? "<small>" + esc(w.role) + "</small>" : "") + "</span>";
  };
  function stuckCard(w) {
    var id = L.slug(w.name), probs = L.botProblems(w, board.today);
    return '<article class="tile stuckcard" id="team-' + esc(id) + '"><div class="bhead">' + head(w) + '<span class="bstate ' + w.state + '">' + esc(L.workerLabel(w.state)) + "</span></div>" +
      (probs.length ? '<ul class="bprobs">' + probs.map(function (p) { return "<li><b>" + esc(p.what) + "</b><span>" + esc(p.why) + "</span></li>"; }).join("") + "</ul>" : "") +
      (w.card && w.card.needs ? '<p class="bneed"><b>Needs</b>' + esc(w.card.needs) + "</p>" : "") +
      '<button class="copybtn" type="button" data-nova="' + esc(id) + '">Copy message for Nova</button>' +
      '<details class="bmore" data-why="' + esc(id) + '"' + (ui.why[id] ? " open" : "") + "><summary>Everything about " + esc(w.name) + "</summary>" + botDetail(w) + "</details></article>";
  }
  function botRow(w) {
    var id = L.slug(w.name);
    return '<details class="botrow' + (w.state === "done" ? " is-done" : "") + '" id="team-' + esc(id) + '" data-why="' + esc(id) + '"' + (ui.why[id] ? " open" : "") + '><summary><span class="bdot ' + w.state + '" aria-hidden="true"></span>' + head(w) +
      '<span class="bl">' + esc(L.botNext(w, board.today)) + '</span><span class="bstate ' + w.state + '">' + esc(L.workerLabel(w.state)) + '</span></summary><div class="browbody">' + botDetail(w) + "</div></details>";
  }
  /* a bot's open release steps, under its duties: the same words as the release card */
  function relSteps(w) {
    var list = w.releaseSteps || [];
    if (!list.length) return "";
    return '<p class="bsub">Release steps</p><ul class="bduties">' + list.map(function (s) {
      var st = L.stepState(s, board.today);
      return '<li class="' + (st.bad ? "bad" : "") + '"><span class="bt">' + esc(s.label) + '<small>' + esc(s.title) + (s.due && !st.waiting ? " · due " + esc(L.day(s.due)) : "") + "</small>" +
        '</span><span class="bw">' + esc(st.text) + "</span></li>";
    }).join("") + "</ul>";
  }
  /* -> true when the board drew Team (js/hq.js falls back to the sheet's duty rows when it didn't) */
  function drawWorkers() {
    if (!board) return false;
    var sheet = HQ.sheet();
    drawConnector();
    $("liveNote").hidden = board.hqRead !== false;
    $("liveNote").textContent = "The sheet isn't being read right now, so today's duties and open tasks are missing from these cards.";
    shown = L.sortWorkers((board.staff || []).map(function (w) { return L.workerView(w, sheet, board.today); }));
    var g = L.teamGroups(shown), c = L.teamCounts(shown);
    $("teamSum").innerHTML = !shown.length ? "" :
      '<div class="ts' + (c.stuck ? " bad" : "") + '"><b>' + c.stuck + "</b><span>Stuck</span></div>" +
      '<div class="ts' + (c.quiet ? " warn" : "") + '"><b>' + c.quiet + "</b><span>Haven't checked in</span></div>" +
      '<div class="ts ok"><b>' + c.onTrack + "</b><span>On track</span></div>";
    $("dutyList").innerHTML = !shown.length ? '<p class="empty">No bots are on the list yet.</p>' :
      (g.stuck.length ? '<h3 class="lblh">Stuck</h3><p class="secsub">Only what is wrong. Copy the message for Nova, or open a card for everything.</p><div class="botgrid">' + g.stuck.map(stuckCard).join("") + "</div>"
        : '<p class="allgood">' + esc(L.taskListLine(sheet && sheet.team)) + "</p>") +
      (g.quiet.length ? '<h3 class="lblh">Haven\'t checked in today</h3><div class="botlist">' + g.quiet.map(botRow).join("") + "</div>" : "") +
      (g.onTrack.length ? '<h3 class="lblh">On track</h3><div class="botlist">' + g.onTrack.map(botRow).join("") + "</div>" : "");
    HQ.drawFeed(L.liveFeed(board, sheet), board.today);
    drawAuto();
    return true;
  }
  function drawAuto() {
    var el = $("autoCard"); if (!el || !board || !board.auto) { if (el) el.hidden = true; return; }
    var a = board.auto, taps = !!a.tapsCountAsYes;
    el.hidden = false;
    var rows = (a.webhooks || []).map(function (w) {
      var draft = ui.hookDraft[w.bot];
      return '<label class="flbl">' + esc(w.bot) + (w.on ? " · " + esc(w.host) : " · off") +
        '<input class="fld" type="url" inputmode="url" autocomplete="off" data-hook="' + esc(w.bot) + '" placeholder="https://" value="' + esc(draft != null ? draft : "") + '"' + off() + '></label>' +
        '<button class="copybtn" type="button" data-hook-save="' + esc(w.bot) + '"' + off() + ">Save</button>";
    }).join("");
    var ask = ui.tapAsk ? '<div class="confirm" role="group"><p>A Yes on a card will count as your yes, except payments and signatures, which you still do yourself. HQ will not change ads.</p><button class="sendbtn" type="button" data-taps="yes"' + (ui.tapBusy ? " disabled" : "") + '>Yes, switch it on</button><button class="copybtn" type="button" data-taps="cancel">Cancel</button></div>' : "";
    el.innerHTML = '<h3 class="lblh">One-tap cards</h3><p>' + esc(a.tapsLine || "") + "</p>" +
      (taps ? '<button class="copybtn" type="button" data-taps="off"' + off() + ">Switch taps off</button>" : '<button class="copybtn" type="button" data-taps="on"' + off() + ">Taps count as my yes</button>") +
      ask + '<h3 class="lblh">Wake a bot\'s app</h3><p>Paste the https address the bot\'s app gives you (Nova can send it). Empty means off.</p>' + /* v18: was "Desk push", five sentences */
      rows + '<p class="ferr" role="alert">' + esc(ui.tapErr) + "</p>";
  }
  var autoEl = $("autoCard");
  if (autoEl) {
    autoEl.addEventListener("input", function (ev) {
      var b = ev.target.getAttribute && ev.target.getAttribute("data-hook");
      if (b) ui.hookDraft[b] = ev.target.value;
    });
    autoEl.addEventListener("click", function (ev) {
      var b = ev.target.closest && ev.target.closest("button");
      if (!b || HQ.sample) return;
      var taps = b.getAttribute("data-taps"), who = b.getAttribute("data-hook-save");
      if (taps === "on") { ui.tapAsk = true; ui.tapErr = ""; drawAuto(); return; }
      if (taps === "cancel") { ui.tapAsk = false; drawAuto(); return; }
      if (taps === "yes" || taps === "off") {
        ui.tapBusy = true; drawAuto();
        write("auto", { tapsCountAsYes: taps === "yes" }).then(function (r) {
          ui.tapBusy = false; ui.tapAsk = false;
          if (!r.ok) { ui.tapErr = r.error; drawAuto(); return; }
          ui.tapErr = ""; reload();
        });
        return;
      }
      if (who) {
        var input = autoEl.querySelector('[data-hook="' + who + '"]');
        var url = input ? input.value.trim() : "";
        write("auto", { webhook: { bot: who, url: url } }).then(function (r) {
          if (!r.ok) { ui.tapErr = r.error; drawAuto(); return; }
          delete ui.hookDraft[who]; ui.tapErr = ""; reload();
        });
      }
    });
  }
  $("team").addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("button");
    if (!b) return;
    var slug = b.getAttribute("data-nova"), key = b.getAttribute("data-key");
    if (slug) {
      var w = shown.filter(function (x) { return L.slug(x.name) === slug; })[0];
      if (w) HQ.copyText(L.novaMessage(w), function () { b.textContent = "Copied. Paste it to Nova."; setTimeout(function () { b.textContent = "Copy message for Nova"; }, 3500); });
      return;
    }
    if (!key || !board || HQ.sample) return;
    if (key === "ask") { ui.keyAsk = true; ui.keyErr = ""; drawConnector(); var no = $("connCard").querySelector('[data-key="no"]'); if (no) no.focus(); return; }
    if (key === "no") { ui.keyAsk = false; drawConnector(); var ask = $("connCard").querySelector('[data-key="ask"]'); if (ask) ask.focus(); return; }
    if (key === "yes" && !ui.keyBusy) {
      var want = board.connector && board.connector.botsOn === false;
      ui.keyBusy = true; drawConnector();
      write("config", { botsOn: want }).then(function (r) {
        ui.keyBusy = false;
        if (!r.ok) { ui.keyErr = r.error; drawConnector(); return; }
        ui.keyAsk = false; ui.keyErr = "";
        if (board && board.connector && r.j.config) { board.connector.botsOn = r.j.config.botsOn; board.connector.changedAt = r.j.config.changedAt; draw(); }
        reload();
      });
    }
  });
  /* remember which "Why this bot" is open (toggle doesn't bubble: listen on the way down) */
  $("dutyList").addEventListener("toggle", function (ev) { var id = ev.target.getAttribute && ev.target.getAttribute("data-why"); if (id) ui.why[id] = ev.target.open; }, true);

  /* ================= Messages ================= */
  var byId = {};
  function when(m) { var at = Date.parse(m.at), w = L.spWhen(m.sp, board.today) || L.spWhen(m.at, board.today), a = isFinite(at) ? L.ago(Date.now() - at) : ""; return w + (w && a ? " · " : "") + a; }
  function errLine(k) { return '<p class="ferr" role="alert">' + esc(ui.err[k] || "") + "</p>"; }
  function replyBox(k, m) {
    var to = m.from === "Luke" ? (m.to === "all" ? "everyone" : m.to) : m.from, busy = ui.busy === k;
    return '<div class="mreply"><label class="flbl" for="re-' + esc(safe(k)) + '">Your reply to ' + esc(to) + '</label><textarea class="fld" id="re-' + esc(safe(k)) + '" data-f="' + esc(k) + '" maxlength="1500" rows="3"' + (busy ? " disabled" : "") + ">" +
      esc(ui.drafts[k] || "") + '</textarea><div class="macts"><button class="sendbtn" type="button" data-act="send" data-k="' + esc(k) + '"' + (busy ? " disabled" : "") + ">" + (busy ? "Sending…" : "Send reply") +
      '</button><button class="copybtn" type="button" data-act="cancel" data-k="' + esc(k) + '"' + (busy ? " disabled" : "") + ">Cancel</button></div></div>";
  }
  function waitItem(m) {
    var k = "w:" + m.id, busy = ui.busy === k, dis = HQ.sample || busy ? " disabled" : "";
    var root = byId[L.threadRoot(board, m)], about = m.re && root && root.id !== m.id ? '<p class="mabout">About: “' + esc(String(root.text).split("\n")[0].slice(0, 90)) + (root.text.length > 90 ? "…" : "") + "”</p>" : "";
    var opts = "";
    if (m.needs === "decision" && (m.options || []).length) {
      opts = ui.ask && ui.ask.k === k && m.options[ui.ask.i] != null
        ? '<div class="confirm" role="group" aria-label="Confirm your answer"><p>' + (m.proposal ? esc(L.proposalConfirm(m, m.options[ui.ask.i])) : "Answer “" + esc(m.options[ui.ask.i]) + "”? " + esc(m.from) + " will see it, and this is marked as done.") + '</p><div class="conn-acts"><button class="sendbtn" type="button" data-act="opt-yes" data-k="' + esc(k) + '"' + dis + ">" +
          (busy ? "Sending…" : "Send this answer") + '</button><button class="copybtn" type="button" data-act="opt-no" data-k="' + esc(k) + '"' + dis + ">Cancel</button></div></div>"
        : '<div class="mopts">' + m.options.map(function (o, i) { var rec = i === L.recommendedOption(m); return '<button class="copybtn' + (rec ? " rec" : "") + '" type="button" data-act="opt" data-k="' + esc(k) + '" data-i="' + i + '"' + dis + ">" + esc(o) + (rec ? ' <span class="rectag">recommended</span>' : "") + "</button>"; }).join("") + "</div>";
    }
    /* A3 (17 Nov 2026): Luke's decisions inbox: the recommendations (Nova's first), above the options */
    var recs = L.recommendLines(m);
    if (recs.length) opts = '<ul class="mrec">' + recs.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" + opts;
    /* numbered questions (14 Nov 2026): one answer box per open question, one button for them all */
    var qs = L.questionLines(m), qhtml = "";
    if (qs.length) {
      qhtml = '<ol class="mqs">' + qs.map(function (q) {
        var f = "qa:" + m.id + ":" + q.n;
        return "<li><p class=\"mq\">" + esc(q.q) + "</p>" + (q.open
          ? '<label class="flbl" for="' + esc(safe(f)) + '">Your answer to question ' + q.n + '</label><textarea class="fld" rows="2" maxlength="600" id="' + esc(safe(f)) + '" data-f="' + esc(f) + '"' + dis + ">" + esc(ui.drafts[f] || "") + "</textarea>"
          : '<p class="ma">' + esc(q.answer) + "</p>") + "</li>";
      }).join("") + "</ol>" + '<p class="mabout">' + esc(L.questionsLeft(m)) + '</p><div class="macts"><button class="sendbtn" type="button" data-act="qsend" data-k="' + esc(k) + '"' + dis + ">" + (busy ? "Sending…" : "Send answers") + "</button></div>";
    }
    /* batch 3: what Luke is asked to approve (the pitch in full; the lyrics are in the pack), and Drop's resubmit question */
    var ap = m.approval ? '<div class="mappr"><p class="mq">' + esc((m.approval.what === "pitch" ? "The pitch for " : "The final lyrics of ") + m.approval.title) + "</p>" +
      (m.approval.text ? '<blockquote class="mpitch">' + esc(m.approval.text) + "</blockquote>" : '<p class="mabout">The lyrics as they are in Files and details (Upcoming › ' + esc(m.approval.title) + " › See the files and details).</p>") + "</div>" : "";
    /* 16 Nov 2026: a bot's proposal lists every change, from and to; nothing changes before "Yes, correct" */
    var pr = L.proposalRows(m);
    if (pr.length) ap += '<div class="mappr"><p class="mq">' + esc(m.proposal.action === "add" ? "The new song" : m.proposal.action === "profile" ? "The new image" : "What changes on " + m.proposal.title) + '</p><dl class="mprop">' +
      pr.map(function (r) { return "<dt>" + esc(r.label) + "</dt><dd>" + (r.from ? '<s>' + esc(r.from) + "</s> → " : "") + esc(r.to) + "</dd>"; }).join("") + "</dl>" +
      (m.proposal.send ? '<p class="mabout">Then it goes to the team: every bot gets its steps.</p>' : "") + "</div>";
    var tag = m.approval ? " · approval" : m.proposal ? " · is this correct?" : m.ask === "resubmit" ? " · ready to resubmit" : "";
    return '<article class="wmsg" id="wait-' + esc(safe(m.id)) + '"><p class="mhead"><span><b>' + esc(m.from) + "</b> " + esc(L.needWords(m)) + esc(tag) + (m.about ? " · about " + esc(m.about) : "") + '</span><span class="mtime">' + esc(when(m)) + "</span></p>" + about +
      '<p class="mtext">' + esc(L.screenText(m.text)) + "</p>" + ap + opts + qhtml +
      (ui.reply === k ? replyBox(k, m) : '<div class="macts"><button class="copybtn" type="button" data-act="reply" data-k="' + esc(k) + '"' + dis + '>Reply</button><button class="copybtn" type="button" data-act="done" data-k="' + esc(k) + '"' + dis + ">" +
        (busy ? "Saving…" : "Mark as done") + "</button></div>") + errLine(k) + "</article>";
  }
  /* what took the place of an item Luke answered: where it went and when (it stays 10 minutes) */
  function landedItem(x) {
    var first = String(x.m.text || "").split("\n")[0];
    return '<p class="landed" role="status" tabindex="-1" id="wait-' + esc(safe(x.m.id)) + '"><span>' + esc(x.line) +
      '<span class="lsub">' + esc(x.m.from + ": “" + first.slice(0, 80) + (first.length > 80 || String(x.m.text).indexOf("\n") >= 0 ? "…" : "") + "”") + "</span></span></p>";
  }
  /* "Read by Nova 17:10" / "Not read yet" / "Read by 7 of 12" on a message (nothing when nobody can read it) */
  function seenMark(m) { var s = L.seenWords(m, board.today); return s ? '<span class="mseen' + (s.seen ? " yes" : "") + '">' + esc(s.text) + "</span>" : ""; }
  function head(m) {
    var lab = L.waitLabel(m);
    return '<p class="mhead"><span><b>' + esc(m.from) + "</b>" + (m.via ? " (via " + esc(m.via) + ")" : "") + ' <span class="arrow">→</span> <b>' + esc(m.to === "all" ? "Everyone" : m.to) + '</b></span><span class="mtime">' + esc(when(m)) + "</span>" +
      (lab ? '<span class="mlabel' + (lab.mine ? " mine" : lab.open ? " open" : "") + '">' + esc(lab.text) + "</span>" : "") + seenMark(m) + "</p>";
  }
  /* "You answered": the last two days, each with when it went and whether the bot has READ it since */
  function drawAnswered() {
    var list = L.answeredList(board);
    $("answeredCard").hidden = !list.length;
    $("answeredList").innerHTML = list.map(function (a) {
      /* the time is in the "Sent 17:03 · …" line under it, not twice */
      return '<li><p class="mhead"><span><b>' + esc(a.who) + "</b> " + esc(a.asked) + "</span>" + (a.status ? "" : '<span class="mtime">' + esc(a.when) + "</span>") + "</p>" +
        '<p class="aq">' + esc(a.their) + '</p><p class="ay">' + esc(a.say) + "</p>" +
        /* "Sent 17:03 · Read by Ledger 17:10" (v2: read, from the bot's read marker) */
        (a.status ? '<p class="aseen' + (a.seen && a.seen.seen ? " yes" : "") + '">' + esc(a.status) + "</p>" + (a.seen && a.seen.note ? '<span class="anote">' + esc(a.seen.note) + "</span>" : "") : "") + "</li>";
    }).join("");
  }
  function thread(th) {
    var id = safe(th.id), k = "b:" + th.id;
    if (th.kind === "report") {
      var p = L.reportParts(th.text, 8), open = !!ui.open[id];
      return '<article class="t-card thread report" id="messages-' + esc(id) + '"><p class="mhead"><span><b>Site check</b></span><span class="mtime">' + esc(when(th)) + '</span></p><p class="rtitle">' + esc(p.title) + "</p>" +
        (p.head ? '<p class="mtext">' + esc(open && p.rest ? p.head + "\n" + p.rest : p.head) + "</p>" : "") +
        (p.rest ? '<button class="linkbtn" type="button" data-act="more" data-k="' + esc(k) + '" aria-expanded="' + open + '">' + (open ? "Show less" : "Show all (" + p.more + " more line" + (p.more === 1 ? "" : "s") + ")") + "</button>" : "") + "</article>";
    }
    var tq = L.questionLines(th);
    var body = L.screenText(th.text);
    var words = body.split(" ").filter(Boolean);
    var short = words.slice(0, 12).join(" ");
    var folded = th.resolved
      ? '<p class="mtext">' + esc(short) + "</p>" + (words.length > 12 ? '<details class="answered"><summary>Show more</summary><p class="mtext">' + esc(body) + "</p></details>" : "")
      : '<p class="mtext">' + esc(body) + "</p>";
    return '<article class="t-card thread" id="messages-' + esc(id) + '">' + head(th) + (th.about ? '<p class="mabout">About ' + esc(th.about) + "</p>" : "") + folded +
      (tq.length ? '<ol class="mqs">' + tq.map(function (q) { return '<li><p class="mq">' + esc(q.q) + '</p><p class="ma' + (q.open ? " open" : "") + '">' + esc(q.open ? "No answer yet" : q.answer) + "</p></li>"; }).join("") + "</ol>" : "") +
      ((th.options || []).length ? '<p class="mabout">Choices: ' + esc(th.options.join(" · ")) + "</p>" : "") +
      ((th.replies || []).length ? '<ul class="treplies">' + th.replies.map(function (r) { return "<li>" + head(r) + '<p class="mtext">' + esc(L.screenText(r.text)) + "</p></li>"; }).join("") + "</ul>" : "") +
      (ui.tsent[k] && Date.now() - ui.tsent[k].at < KEEP_MS ? '<p class="landed tsent" role="status"><span>' + esc(ui.tsent[k].line) + "</span></p>" : "") +
      (ui.reply === k ? replyBox(k, th) + errLine(k) : '<div class="tfoot"><button class="linkbtn" type="button" data-act="reply" data-k="' + esc(k) + '"' + off() + ">Reply</button></div>" + errLine(k)) + "</article>";
  }
  function drawMessages() {
    $("msgSample").hidden = !HQ.sample;
    $("msgFail").hidden = !!board || !tried;
    $("msgBody").hidden = !board && tried;
    if (!board) return;
    /* who Luke can write to (keeps his pick) */
    var to = $("msgTo"), cur = to.value;
    to.innerHTML = L.composeNames(board.names).map(function (n) { return '<option value="' + esc(n.value) + '">' + esc(n.label) + "</option>"; }).join("");
    if ([].some.call(to.options, function (o) { return o.value === cur; })) to.value = cur;
    ["msgTo", "msgNeeds", "msgText", "msgSend"].forEach(function (id) { $(id).disabled = HQ.sample; });
    syncNeeds();
    byId = {};
    (board.messages || []).forEach(function (th) { byId[th.id] = th; (th.replies || []).forEach(function (r) { byId[r.id] = r; }); });
    var wait = waitingNow();
    wait.forEach(function (m) { byId[m.id] = byId[m.id] || m; });
    /* what Luke just answered stays in its place as one line ("Sent to Nova at 17:03") */
    var stubs = Object.keys(ui.landed).map(function (id) { return ui.landed[id]; }).filter(function (x) { return Date.now() - x.at < KEEP_MS; });
    var rows = wait.map(function (m) { return { at: m.at, html: waitItem(m) }; }).concat(stubs.map(function (x) { return { at: x.m.at, html: landedItem(x) }; }))
      .sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
    /* a redraw must not steal the reply Luke is typing: remember where the caret was */
    var act = document.activeElement, fk = act && act.getAttribute ? act.getAttribute("data-f") : null, s0 = fk ? act.selectionStart : 0, s1 = fk ? act.selectionEnd : 0;
    $("waitCard").classList.toggle("has", wait.length > 0);
    $("waitList").innerHTML = rows.length ? rows.map(function (x) { return x.html; }).join("") : '<p class="empty2">Nothing is waiting on you.</p>';
    drawAnswered();
    var all = board.messages || [], list = ui.allThreads ? all : all.slice(0, 25);
    $("threadList").innerHTML = (all.length ? list.map(thread).join("") : '<p class="empty2">No messages yet. They show up here when a bot or you write one.</p>') +
      (all.length > list.length ? '<button class="copybtn more-row" type="button" data-act="older">Show older messages (' + (all.length - list.length) + ")</button>" : "");
    if (fk) { var el = $("messages").querySelector('[data-f="' + fk.replace(/[^a-z0-9:]/gi, "") + '"]'); if (el) { el.focus(); try { el.setSelectionRange(s0, s1); } catch (e) {} } }
  }
  /* what still waits on Luke: the board's list without what he has just answered (the board may not
     have caught up yet). Only for 10 minutes: after that the board's own word counts again, so the badge,
     this list and Today's "Needs attention" can never disagree for good. */
  function waitingNow() { return ((board && board.waiting && board.waiting.luke) || []).filter(function (m) { var x = ui.landed[m.id]; return !(x && Date.now() - x.at < KEEP_MS); }); }
  function drawBadges() {
    var n = board ? waitingNow().length : 0;
    ["msgBadge", "msgBadge2", "waitN"].forEach(function (id) { $(id).hidden = !n; $(id).textContent = n; $(id).setAttribute("aria-label", n + " waiting on you"); });
    $("moreDot").hidden = !n;
  }
  function focusIn(sel) { var el = $("messages").querySelector(sel); if (el) el.focus(); }
  /* answer a message, to whoever wrote it, filed under THAT message (11 Nov 2026: it used to be filed under
     the first message of its thread, which closed an unrelated request at the top of the thread). The desk
     shows answers at any depth in their thread, and settles the message itself: the answer says
     settled: true when it did. note = the option Luke picked, kept with the closed message. */
  function answer(m, text, note, answers) {
    var body = { to: m.from === "Luke" ? m.to : m.from, text: text, needs: "none", re: m.id, note: note || "" };
    if (answers) body.answers = answers;
    return write("message", body);
  }
  var waitsOnLuke = function (x) { return !!x && !x.resolved && x.to === "Luke" && !!x.needs && x.needs !== "none"; };
  $("messages").addEventListener("input", function (ev) { var k = ev.target.getAttribute && ev.target.getAttribute("data-f"); if (k) ui.drafts[k] = ev.target.value; });
  $("messages").addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-act]");
    if (!b || !board) return;
    var act = b.getAttribute("data-act"), k = b.getAttribute("data-k") || "", m = byId[k.slice(2)];
    if (act === "older") { ui.allThreads = true; drawMessages(); return; }
    if (act === "more") { var id = safe(k.slice(2)); ui.open[id] = !ui.open[id]; drawMessages(); focusIn('[data-act="more"][data-k="' + k.replace(/[^a-z0-9:]/gi, "") + '"]'); return; }
    if (!m || HQ.sample || ui.busy) return;
    var sel = function (a) { return '[data-act="' + a + '"][data-k="' + k.replace(/[^a-z0-9:]/gi, "") + '"]'; };
    /* it landed: the item leaves "Waiting on you" at once, a line takes its place, and "You answered"
       lists it before the board has even caught up */
    var land = function (x, kind, text) { /* x = the message that was answered or settled */
      var now = Date.now(), iso = new Date(now).toISOString();
      ui.landed[x.id] = { m: x, at: now, line: L.sentLine(kind, x.from, now, text) };
      if (board.waiting && board.waiting.luke) board.waiting.luke = board.waiting.luke.filter(function (y) { return y.id !== x.id; });
      var rep = { by: "Luke", kind: kind === "reply" ? "reply" : "settled", text: kind === "done" ? "Marked as done" : text, at: iso, sp: L.spStampOf(now), seen: PEOPLE.indexOf(x.from) >= 0 ? null : false, seenAt: null };
      board.answered = [{ id: x.id, from: x.from, to: x.to, text: x.text, needs: x.needs, at: x.at, sp: x.sp, reply: rep }].concat((board.answered || []).filter(function (a) { return a.id !== x.id; })).slice(0, 10);
      ui.reply = ""; ui.ask = null;
      draw(); /* the badge, Today's attention and the list, all at once */
      var el = $("wait-" + safe(x.id)); if (el && k.charAt(0) === "w") el.focus();
    };
    /* sent, but the desk couldn't close what it answers: said in the same place, never hidden */
    var stillWaiting = function (x, what) {
      ui.err[k] = what + " went to " + x.from + " at " + L.spStampOf(Date.now()).slice(11, 16) + ", but it is still waiting on you: the desk couldn't close it. Press Mark as done when it's finished.";
      drawMessages();
    };
    var settle = function (r, after) { /* one write came back */
      ui.busy = "";
      if (!r.ok) { ui.err[k] = r.error; drawMessages(); return false; }
      delete ui.err[k];
      if (after) after();
      return true;
    };
    if (act === "reply") { ui.reply = k; ui.ask = null; delete ui.err[k]; drawMessages(); focusIn('[data-f="' + k.replace(/[^a-z0-9:]/gi, "") + '"]'); }
    else if (act === "cancel") { ui.reply = ""; delete ui.err[k]; drawMessages(); focusIn(sel("reply")); }
    else if (act === "opt") { ui.ask = { k: k, i: Number(b.getAttribute("data-i")) }; ui.reply = ""; delete ui.err[k]; drawMessages(); focusIn(sel("opt-yes")); }
    else if (act === "opt-no") { ui.ask = null; drawMessages(); }
    else if (act === "done") {
      ui.busy = k; drawMessages();
      write("resolve", { id: m.id }).then(function (r) { if (settle(r)) { land(m, "done"); reload(); } });
    }
    else if (act === "send") {
      var text = String(ui.drafts[k] || "").trim();
      if (text.length < 2) { ui.err[k] = "Write your reply first."; drawMessages(); focusIn('[data-f="' + k.replace(/[^a-z0-9:]/gi, "") + '"]'); return; }
      ui.busy = k; drawMessages();
      /* from a thread on the board: the question in it that waits on Luke, else its first message */
      var target = k.charAt(0) === "b" ? L.answerTarget(m) : m, waits = waitsOnLuke(target);
      answer(target, text).then(function (r) {
        if (!settle(r, function () { delete ui.drafts[k]; ui.reply = ""; })) return;
        var to = target.from === "Luke" ? target.to : target.from;
        if (k.charAt(0) === "b") ui.tsent[k] = { at: Date.now(), line: L.sentLine("reply", to, Date.now()) };
        if (waits && r.j.settled) land(target, "reply", text);
        else if (waits) stillWaiting(target, "Your reply");
        else drawMessages();
        reload();
      });
    }
    else if (act === "qsend") {
      var got = {}, lines = [];
      L.questionLines(m).forEach(function (q) { var t = String(ui.drafts["qa:" + m.id + ":" + q.n] || "").trim(); if (q.open && t) { got[q.n] = t; lines.push(q.n + ". " + t); } });
      if (!lines.length) { ui.err[k] = "Write at least one answer first."; drawMessages(); return; }
      ui.busy = k; drawMessages();
      answer(m, lines.join("\n"), "", got).then(function (r) {
        if (!settle(r, function () { Object.keys(got).forEach(function (n) { delete ui.drafts["qa:" + m.id + ":" + n]; }); })) return;
        if (r.j.settled) land(m, "reply", lines.join("\n"));
        else stillWaiting(m, "Your answers");
        reload();
      });
    }
    else if (act === "opt-yes" && ui.ask && ui.ask.k === k) {
      var choice = (m.options || [])[ui.ask.i];
      if (choice == null) return;
      ui.busy = k; drawMessages();
      /* one write: the answer, and the desk closes the decision with the option as its note. A one-letter
         option ("A") is sent as "Answer: A" (the board takes nothing shorter than 2 characters). */
      var said = String(choice).trim().length < 2 ? "Answer: " + choice : String(choice);
      answer(m, said, String(choice).slice(0, 240)).then(function (r) {
        if (!settle(r)) return;
        ui.ask = null;
        if (r.j.settled) land(m, "option", choice);
        else stillWaiting(m, "Your answer “" + choice + "”");
        reload();
      });
    }
  });

  /* the box to write a new message */
  function counter() { $("msgCount").textContent = $("msgText").value.length + " / 1500"; }
  function syncNeeds() {
    var all = $("msgTo").value === "all";
    if (all) $("msgNeeds").value = "none";
    $("msgNeeds").disabled = all || HQ.sample;
    $("msgHint").hidden = !all;
  }
  $("msgText").addEventListener("input", function () { counter(); $("msgOk").textContent = ""; });
  $("msgTo").addEventListener("change", syncNeeds);
  var sending = false;
  $("composeForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (HQ.sample || sending) return;
    var text = $("msgText").value.trim(), to = $("msgTo").value, needs = to === "all" ? "none" : $("msgNeeds").value, btn = $("msgSend");
    $("msgOk").textContent = "";
    if (text.length < 2) { $("msgErr").textContent = "Write the message first."; $("msgText").focus(); return; }
    sending = true; btn.disabled = true; btn.textContent = "Sending…"; $("msgErr").textContent = "";
    write("message", { to: to, text: text, needs: needs }).then(function (r) {
      sending = false; btn.disabled = false; btn.textContent = "Send";
      if (!r.ok) { $("msgErr").textContent = r.error; return; } /* the text stays in the box */
      $("msgText").value = ""; counter();
      /* stays until Luke starts the next one: he can see it went, and when */
      $("msgOk").textContent = L.sentLine("message", to, Date.now());
      reload();
    });
  });
  /* Needs you / Monday / lyrics: one tap sends the message's own option through the same write as Messages.
     The Messages tab keeps its confirm step (this ignores clicks inside #messages). */
  function findMsg(id) {
    var hit = null;
    var walk = function (m) { if (!m || hit) return; if (m.id === id) hit = m; (m.replies || []).forEach(walk); };
    ((board && board.messages) || []).forEach(walk);
    ((board && board.waiting && board.waiting.luke) || []).forEach(function (m) { if (m && m.id === id) hit = m; });
    return hit;
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-decide]");
    if (!b || (b.closest && b.closest("#messages")) || !board || HQ.sample) return;
    var choice = b.getAttribute("data-choice") || "", m = findMsg(b.getAttribute("data-decide"));
    if (!m || (m.options || []).indexOf(choice) < 0) return;
    b.disabled = true;
    var said = String(choice).trim().length < 2 ? "Answer: " + choice : String(choice);
    var card = b.closest && b.closest(".wallet");
    if (card) card.classList.add("gone");
    answer(m, said, String(choice).slice(0, 240)).then(function (r) {
      b.disabled = false;
      if (!r.ok) {
        if (card) card.classList.remove("gone");
        try { document.dispatchEvent(new CustomEvent("hq:decided", { detail: { ok: false, error: r.error || "That didn't send." } })); } catch (e) {}
        var n = document.createElement("p"); n.className = "ferr"; n.setAttribute("role", "alert"); n.textContent = r.error || "That didn't send."; b.insertAdjacentElement("afterend", n); return;
      }
      try { document.dispatchEvent(new CustomEvent("hq:decided", { detail: { ok: true, id: m.id } })); } catch (e) {}
      reload();
    });
  });
  $("msgRetry").addEventListener("click", function () { reload(); });

  /* ================= Releases: the release pipeline (11 Nov 2026) =================
     Luke: "when a new song is ready we want all the info every bot needs ... and that they auto
     schedule it ... and the pitch is handled later". One card per release on the desk (drafts too):
     its files and details, then every step with its owner, date and state. The form is built from
     board.packFields, so a field added on the desk shows here by itself. Writes: /api/staff/release
     (save), release/send, release/date, release/cancel, release/step. The sheet's own release rows
     keep their card (HQ.sheetReleaseCard) when the desk doesn't have that song. */
  var relById = {};
  /* what Luke typed and hasn't saved stays on this device, one copy per release (L.formKey); logout
     clears every bs_hq_last_* */
  function relFields() { return (board && board.packFields) || (fields && fields.packFields) || []; }
  /* New release opens before the board is there (12 Nov 2026, the HQ apps: "#releases/new" from a cold
     start). GET /api/staff/fields gives the form its fields, steps and today without reading the desk;
     only Save and Send wait for the board ("Loading the team…"). */
  var fields = null, fieldsLoading = null, fieldsFailed = false;
  function loadFields() {
    if (fields) return Promise.resolve(fields);
    if (fieldsLoading) return fieldsLoading;
    fieldsFailed = false; /* a new try: an old failure doesn't count while it is on its way */
    fieldsLoading = HQ.getJSON("/api/staff/fields").then(function (res) {
      fieldsLoading = null;
      /* a 401 here is left to the board's own answer, which shows the login */
      if (res.s === 200 && res.j && Array.isArray(res.j.packFields) && res.j.packFields.length) { fields = res.j; fieldsFailed = false; } else fieldsFailed = true;
      return fields;
    }, function () { fieldsLoading = null; fieldsFailed = true; return null; });
    return fieldsLoading;
  }
  function formBase() { return board || fields || { today: "", releaseSteps: [] }; }
  /* the form can't be opened at all only when BOTH the board and the fields failed */
  function bothFailed() { return fieldsFailed && tried && !board; }
  var NEEDS_DESK = "The form needs the team's desk, which couldn't be loaded. Try Refresh.";
  /* New release: the empty song form. A new form already open (with what Luke typed) is kept: it is
     scrolled to, never wiped. */
  function openNew() {
    if (ui.form && !ui.form.id) { $("relForm").scrollIntoView({ block: "start" }); var t = $("rf-title"); if (t) t.focus({ preventScroll: true }); return; }
    if (relFields().length) { ui.pendingNew = false; openForm(""); return; }
    ui.pendingNew = true;
    $("relMsg").textContent = "Opening the form…";
    loadFields().then(pendingNew, pendingNew);
    setTimeout(function () {
      if (ui.pendingNew && !relFields().length) $("relMsg").textContent = "Still opening. Close it and try again.";
    }, 12000);
  }
  function pendingNew() {
    if (!ui.pendingNew) return;
    if (relFields().length) { ui.pendingNew = false; openForm(""); return; }
    if (bothFailed()) { ui.pendingNew = false; $("relMsg").textContent = NEEDS_DESK; }
  }
  /* #releases/new (the iPhone's "New release", the Mac's ⌘N / Dock / menu bar, a bookmark): open the
     form, then put #releases back, so the same address works again next time. This listener runs BEFORE
     the shell's (this file loads first), and the shell then shows the tab and scrolls to the top; so the
     form opens on the next tick, after that, and its scroll wins. */
  function routeNew() {
    var r = L.newReleaseRoute(location.hash);
    if (!r.open) return;
    try { history.replaceState(history.state, "", location.pathname + location.search + r.replace); } catch (e) {}
    setTimeout(openNew, 0);
  }
  window.addEventListener("hashchange", routeNew);
  document.addEventListener("DOMContentLoaded", routeNew);
  function hhmm(ms) { return L.spStampOf(ms).slice(11, 16); }
  var isLink = function (v) { return /^https:\/\//.test(String(v || "")); };
  function outLink(url, text, cls) { return isLink(url) ? '<a' + (cls ? ' class="' + cls + '"' : "") + ' href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(text) + "</a>" : esc(text); }
  /* The board's copy of a release has no lyrics and no change log (11 Nov 2026: they made every refresh
     heavy). The whole release is asked for when Luke opens its details or its form, and kept while it is
     current (same updatedAt as the board's copy). */
  /* a fetched copy is shown once it is here. One retry if the board has moved on, then it stops
     saying "Opening…" (18 Nov 2026: the song panel could sit on that word). */
  function fullOf(v) {
    if (!v) return null;
    if (!v.slim) return v;
    var f = ui.rel.full[v.id];
    if (!f) return null;
    if (v.updatedAt && f.updatedAt && String(f.updatedAt) < String(v.updatedAt) && !ui.rel.tried[v.id]) {
      ui.rel.tried[v.id] = 1; delete ui.rel.full[v.id]; return null;
    }
    return f;
  }
  function loadFull(id) {
    var v = relById[id];
    if (!v || fullOf(v)) return Promise.resolve(fullOf(v));
    if (ui.rel.loading[id]) return ui.rel.loading[id];
    var gen = (ui.rel.gen[id] = (ui.rel.gen[id] || 0) + 1);
    var timer = setTimeout(function () {
      if (ui.rel.gen[id] !== gen) return;
      delete ui.rel.loading[id];
      ui.rel.err[id] = "Still opening. Close it and try again.";
      drawReleases();
    }, 12000);
    var p = ui.rel.loading[id] = HQ.getJSON("/api/staff/release?id=" + encodeURIComponent(id) + (HQ.sample ? "&sample=1" : "")).then(function (res) {
      clearTimeout(timer);
      delete ui.rel.loading[id];
      if (ui.rel.gen[id] !== gen) return null;
      if (HQ.authFail(res)) return null;
      if (res.s !== 200 || !res.j || !res.j.release) { ui.rel.err[id] = "Couldn't open the details (" + res.s + "). Try again."; drawReleases(); return null; }
      ui.rel.full[id] = res.j.release; delete ui.rel.err[id];
      drawReleases();
      return res.j.release;
    }, function () { clearTimeout(timer); delete ui.rel.loading[id]; if (ui.rel.gen[id] !== gen) return null; ui.rel.err[id] = "No connection: couldn't open the details. Try again."; drawReleases(); return null; });
    return p;
  }
  function putRelease(v) {
    if (!board || !v) return;
    if (!v.slim) ui.rel.full[v.id] = v; /* a write answers with the whole release */
    var list = board.releases || (board.releases = []), i = list.map(function (x) { return x.id; }).indexOf(v.id);
    if (i >= 0) list[i] = v; else list.unshift(v);
    relById[v.id] = v;
  }

  /* one step of the pipeline: owner, due date, state in words, the bot's note and link; Luke's own step
     has "Mark as done", every other one a small "Mark done" / "Reopen" for Luke */
  function relStep(v, s) {
    var st = L.stepState(s, board.today), mine = s.owner === "Luke", k = v.id + ":" + s.key, busy = ui.rel.busy === "step:" + k, dis = HQ.sample || busy ? " disabled" : "";
    var btn = "", sb = L.stepButton(v, s);
    if (sb) {
      var attrs = ' type="button" data-rel="step" data-id="' + esc(v.id) + '" data-step="' + esc(s.key) + '" data-to="' + sb.to + '"' + dis;
      btn = '<button class="' + (sb.main ? "copybtn" : "linkbtn") + '"' + attrs + ">" + (busy ? "Saving…" : esc(sb.text)) + "</button>";
    }
    var lk = isLink(s.link) ? outLink(s.link, "Open the link", "rl") : "";
    /* v2: a step that is not ours (skipped) or that waits for Spotify for Artists has no due date that
       means anything: none is shown, and its note is already in its words */
    var quiet = st.skipped || st.waiting;
    return '<li class="' + (st.done ? "done" : st.bad ? "bad" : st.skipped ? "skip" : st.waiting ? "wait" : "") + '"><i aria-hidden="true"></i><div class="rs"><b>' + esc(s.label) + "</b>" +
      '<span class="ro">' + esc((mine ? "You" : s.owner) + (s.due && !quiet ? " · due " + L.day(s.due) : "")) + "</span>" +
      '<span class="rline"><span class="rw">' + esc(cap(st.text)) + "</span>" + (lk || btn ? '<span class="racts2">' + lk + btn + "</span>" : "") + "</span>" +
      (s.note && !st.bad && !st.waiting && !st.skipped ? '<span class="rn">' + esc(s.note) + "</span>" : "") + "</div></li>";
  }
  /* the inline questions under a card: a new release day, or cancelling */
  function relAsk(v) {
    var a = ui.rel.ask, busy = ui.rel.busy === "ask:" + v.id, dis = HQ.sample || busy ? " disabled" : "";
    if (!a || a.id !== v.id) return "";
    if (a.kind === "date") {
      var dn = L.releaseDayNote(a.date, board.today, { move: true }), ok = a.date && !dn.bad && a.date !== v.date;
      return '<div class="confirm" role="group" aria-label="Change the release day"><label class="flbl" for="rd-' + esc(safe(v.id)) + '">New release day</label>' +
        '<input class="fld" type="date" id="rd-' + esc(safe(v.id)) + '" data-reldate="' + esc(v.id) + '" min="' + esc(board.today) + '" value="' + esc(a.date || "") + '"' + (busy ? " disabled" : "") + ">" +
        (dn.line ? '<p class="rdn' + (dn.bad ? " attn" : "") + '">' + esc([dn.line].concat(dn.notes).join(". ").replace(/\.\./g, ".")) + "</p>" : "") +
        (ok ? "<p>" + esc(L.moveQuestion(v.title, v.date, a.date)) + "</p>" : "") +
        '<div class="conn-acts"><button class="sendbtn" type="button" data-rel="date-yes" data-id="' + esc(v.id) + '"' + (ok ? dis : " disabled") + ">" + (busy ? "Moving…" : "Yes, move it") + "</button>" +
        '<button class="copybtn" type="button" data-rel="no" data-id="' + esc(v.id) + '"' + (busy ? " disabled" : "") + ">Keep the date</button></div></div>";
    }
    return '<div class="confirm" role="group" aria-label="Cancel the release"><p>' + esc(L.cancelQuestion(v)) + "</p>" +
      '<div class="conn-acts"><button class="sendbtn" type="button" data-rel="cancel-yes" data-id="' + esc(v.id) + '"' + dis + ">" + (busy ? "Cancelling…" : "Yes, cancel it") + "</button>" +
      '<button class="copybtn" type="button" data-rel="no" data-id="' + esc(v.id) + '"' + (busy ? " disabled" : "") + ">Keep it</button></div></div>";
  }
  /* "See the files and details": every filled field, read-only (lyrics in their own scrolling box,
     links only when https://), then the latest changes */
  function relPack(v) {
    var whole = fullOf(v), open = !!ui.rel.open[v.id];
    if (open && !whole && !ui.rel.err[v.id]) loadFull(v.id); /* after a failure, only a new tap asks again */
    if (!whole) return '<details class="bwhy" data-relopen="' + esc(v.id) + '"' + (open ? " open" : "") + "><summary>See the files and details</summary><p>" + (ui.rel.err[v.id] ? "Close and open it again to retry." : "Opening…") + "</p></details>";
    v = whole;
    var filled = relFields().filter(function (f) { return v.pack && v.pack[f.key] != null && String(v.pack[f.key]) !== ""; });
    var dl = filled.length ? '<dl class="rpackdl">' + filled.map(function (f) {
      var val = String(v.pack[f.key]);
      return "<dt>" + esc(f.label) + "</dt><dd>" + (f.kind === "link" ? outLink(val, val) : f.key === "lyrics" ? '<div class="lyr" tabindex="0" aria-label="Lyrics">' + esc(val) + "</div>" : esc(val)) + "</dd>";
    }).join("") + "</dl>" : "<p>Nothing filled in yet.</p>";
    var log = (v.log || []).slice(0, 6);
    return '<details class="bwhy" data-relopen="' + esc(v.id) + '"' + (ui.rel.open[v.id] ? " open" : "") + "><summary>See the files and details</summary>" + dl +
      (log.length ? '<p class="bsub">Latest changes</p><ul class="rlog">' + log.map(function (x) { return "<li><span>" + esc(L.spWhen(L.spStampOf(x.at), board.today)) + " · </span>" + esc(x.what) + "</li>"; }).join("") + "</ul>" : "") + "</details>";
  }
  /* the card's line about the files and details (both kinds of card) */
  function packHtml(v) {
    var pk = L.packLine(v, board.today);
    return '<div class="rpack"><b>Files and details</b><span>' + esc(pk.filled) + (pk.items.length ? " · still missing:" : "") + "</span>" +
      (pk.items.length ? "<ul>" + pk.items.map(function (x) { return "<li" + (x.attn ? ' class="attn"' : "") + ">" + esc(x.text) + "</li>"; }).join("") + (pk.more ? "<li>+" + pk.more + " more (see " + (v.status === "draft" ? "Finish and send" : "Edit the details") + ")</li>" : "") + "</ul>" : "") + "</div>";
  }
  /* whose song it is, under the date (v2) */
  function dealHtml(v) { var d = L.dealWords(v.deal); return '<p class="rdeal' + (d.known ? "" : " no") + '">' + esc(d.known ? d.text : "Whose release it is: not filled in yet") + "</p>"; }
  /* In the pipeline: a draft Luke is still filling. Title, its day, whose it is, what is still missing,
     "Finish and send". A draft whose day has passed says that sending records it as already out. */
  /* a draft's planned day, judged by the team's rule (14 Nov 2026): too close, too near another song, not a
     Friday; with something wrong (or no day yet), the better days, one tap away */
  function planHtml(v, today) {
    var advice = L.planAdvice(v.date, today, board.releases, { except: v.id });
    var better = !v.date || advice.some(function (a) { return a.bad; }) ? L.suggestDates(today, board.releases, { except: v.id, n: 3 }) : [];
    return advice.map(function (a) { return '<p class="dnote' + (a.bad ? " bad" : " q") + '">' + esc(a.text) + "</p>"; }).join("") +
      (better.length ? '<div class="pchips"><span class="pchips-l">' + (v.date ? "Better days:" : "Suggested days:") + "</span>" + better.map(function (x) {
        return '<button class="pchip' + (x.best ? " best" : "") + '" type="button" data-plan="use" data-id="' + esc(v.id) + '" data-date="' + esc(x.date) + '">' + esc(x.words) + "<small>" + esc(x.weeks + " weeks" + (x.note ? " · holidays" : "")) + "</small></button>";
      }).join("") + "</div>" : "");
  }
  function pipeCard(v) {
    var today = board.today, off = HQ.sample ? " disabled" : "", asking = ui.rel.ask && ui.rel.ask.id === v.id, past = !!v.date && v.date < today;
    var advice = L.planAdvice(v.date, today, board.releases, { except: v.id }), bad = advice.filter(function (a) { return a.bad; });
    var better = !v.date || bad.length ? L.suggestDates(today, board.releases, { except: v.id, n: 3 }) : [];
    var pk = L.packLine(v, today), miss = (v.missing || []).length;
    return '<article class="tile relcard" id="releases-' + esc(safe(v.id)) + '"><div class="bhead"><div><h3>' + esc(v.title) + "</h3>" +
      '<p class="rwhen">' + esc(L.releaseWhen(v.date, today, true)) + "</p>" + dealHtml(v) + "</div>" + '<span class="pill">Draft</span></div>' +
      (ui.rel.note[v.id] ? '<p class="rdone" role="status">' + esc(ui.rel.note[v.id]) + "</p>" : "") +
      (past ? '<p class="rstat">' + esc(L.whereLine(v)) + "</p>" : "") +
      /* the overhaul: one line for the files (what is still missing, by name), the day's problems in red with
         better days one tap away; everything filled in is under "See the files and details" */
      '<p class="rstat' + (pk.attn ? " bad" : "") + '">' + esc(pk.filled + (miss ? " · still missing: " + pk.items.map(function (x) { return x.text; }).join(", ") + (pk.more ? " +" + pk.more + " more" : "") : " · ready to send")) + "</p>" +
      preflightHtml(v) +
      advice.map(function (a) { return '<p class="dnote' + (a.bad ? " bad" : " q") + '">' + esc(a.text) + "</p>"; }).join("") +
      (better.length ? '<div class="pchips"><span class="pchips-l">' + (v.date ? "Better days:" : "Suggested days:") + "</span>" + better.map(function (x) {
        return '<button class="pchip' + (x.best ? " best" : "") + '" type="button" data-plan="use" data-id="' + esc(v.id) + '" data-date="' + esc(x.date) + '">' + esc(x.words) + "<small>" + esc(x.weeks + " weeks" + (x.note ? " · holidays" : "")) + "</small></button>";
      }).join("") + "</div>" : "") +
      (asking ? relAsk(v) : '<div class="racts"><button class="sendbtn" type="button" data-rel="edit" data-id="' + esc(v.id) + '">Finish and send</button>' +
        '<button class="linkbtn" type="button" data-rel="cancel" data-id="' + esc(v.id) + '"' + off + ">Cancel the draft</button></div>") +
      '<p class="ferr" role="alert">' + esc(ui.rel.err[v.id] || "") + "</p>" +
      relPack(v) + "</article>";
  }
  /* ---------- batch 3 (14 Nov 2026): the distributor's history, Luke's approvals, "ready to resubmit" ---------- */
  /* where the song is at the distributor, then its history folded (Drop's moderation log) */
  function storeHtml(v) {
    var line = L.storeLine(v.store), hist = L.storeHistory(v.store);
    if (!line) return "";
    return '<div class="rstore"><p class="rstore-now' + (v.store.status === "rejected" ? " bad" : "") + '">' + esc(line) + "</p>" +
      /* 23 Nov 2026 (Luke): day, one word, and a reason only for a rejection; no brackets */
      (hist.length > 1 ? '<details class="bwhy" data-fold="store:' + esc(v.id) + '"' + (ui.rel.fold["store:" + v.id] ? " open" : "") + "><summary>What the distributor said</summary><ul class=\"slog\">" +
        L.storeRows(v.store).map(function (r) {
          return '<li><span class="sl-d">' + esc(r.day) + '</span><b class="sl-w' + (r.tone ? " " + r.tone : "") + '">' + esc(r.word) + "</b>" + (r.why ? '<span class="sl-y">' + esc(r.why) + "</span>" : "") + "</li>";
        }).join("") + "</ul></details>" : "") + "</div>";
  }
  /* Luke's two approvals; he can approve the final lyrics here (the pitch comes from Atlas, as a question
     with its text), and take an approval back. Each asks first. */
  function approvalsHtml(v) {
    if (v.status !== "scheduled") return "";
    var a = ui.rel.ask, busy = ui.rel.busy === "ask:" + v.id, dis = HQ.sample || busy ? " disabled" : "";
    var hasLyrics = !!(v.lyricsChars || (v.pack && v.pack.lyrics));
    var rows = L.approvalLines(v).map(function (x) {
      var undo = L.approvalUndo(x), btn = "";
      if (undo) btn = '<button class="linkbtn" type="button" data-rel="unapprove" data-id="' + esc(v.id) + '" data-what="' + x.key + '"' + dis + ">" + esc(undo) + "</button>";
      else if (x.key === "lyrics" && hasLyrics && !x.ok) btn = '<button class="copybtn" type="button" data-rel="approve" data-id="' + esc(v.id) + '" data-what="lyrics"' + dis + ">" + (x.stale ? "Approve them again" : "Approve the final lyrics") + "</button>";
      return '<li class="' + (x.ok ? "ok" : x.stale ? "stale" : "") + '"><span>' + esc(x.text) + "</span>" + (btn ? '<span class="racts2">' + btn + "</span>" : "") + "</li>";
    }).join("");
    var conf = "";
    if (a && a.id === v.id && (a.kind === "approve" || a.kind === "unapprove")) {
      var which = a.what === "pitch" ? "pitch" : "lyrics";
      var q = a.kind === "approve" ? "Approve the lyrics of " + v.title + " as they are in Files and details now? Verse sees that they are final." : "Take back your approval of the " + (which === "pitch" ? "pitch" : "final lyrics") + " of " + v.title + "?";
      conf = '<div class="confirm" role="group" aria-label="Confirm"><p>' + esc(q) + '</p><div class="conn-acts"><button class="sendbtn" type="button" data-rel="' + a.kind + '-yes" data-id="' + esc(v.id) + '"' + dis + ">" +
        (busy ? "Saving…" : a.kind === "approve" ? "Yes, approve" : "Yes, take back the " + which) + '</button><button class="copybtn" type="button" data-rel="no" data-id="' + esc(v.id) + '"' + (busy ? " disabled" : "") + ">Cancel</button></div></div>";
    }
    return '<div class="rappr"><b>Your approvals</b><ul>' + rows + "</ul>" + conf + "</div>";
  }
  /* Drop asks whether to resubmit a rejected song: Yes / Not yet, right on the card (it is also in Waiting on
     you); the answer goes back to Drop like any answer */
  function resubmitHtml(v) {
    var m = L.resubmitAsk(board, v.id);
    if (!m) return "";
    var a = ui.rel.ask, busy = ui.rel.busy === "ask:" + v.id, dis = HQ.sample || busy ? " disabled" : "";
    var picked = a && a.id === v.id && a.kind === "resubmit" ? (m.options || [])[a.i] : null;
    return '<div class="rask" role="group" aria-label="Ready to resubmit?"><p class="rask-h"><b>Ready to resubmit?</b> ' + esc(m.from) + " asks</p><p>" + esc(m.text) + "</p>" +
      (picked != null ? '<div class="confirm"><p>Answer “' + esc(picked) + "”? " + esc(m.from) + ' will see it.</p><div class="conn-acts"><button class="sendbtn" type="button" data-rel="resubmit-yes" data-id="' + esc(v.id) + '"' + dis + ">" + (busy ? "Sending…" : "Send this answer") + "</button>" +
        '<button class="copybtn" type="button" data-rel="no" data-id="' + esc(v.id) + '"' + (busy ? " disabled" : "") + ">Cancel</button></div></div>"
        : '<div class="mopts">' + (m.options || []).map(function (o, i) { return '<button class="copybtn" type="button" data-rel="resubmit" data-id="' + esc(v.id) + '" data-i="' + i + '"' + dis + ">" + esc(o) + "</button>"; }).join("") + "</div>") + "</div>";
  }
  /* L7: the pitch line on an Upcoming card (not pitched / pitched with the day / missed) and any editorial playlists */
  function pitchHtml(v) {
    var p = v && v.pitch;
    if (!p || (!p.line && !(p.editorial || []).length)) return "";
    var eds = (p.editorial || []).map(function (e) { return e.name + (e.date ? " (" + L.day(e.date) + ")" : ""); });
    return '<p class="rpitch' + (p.status === "missed" ? " bad" : "") + '">' + esc(p.line || "") +
      (eds.length ? "<span>Editorial: " + esc(eds.join(" · ")) + "</span>" : "") + "</p>";
  }
  /* Coming up: a song sent to the team (the overhaul, 15 Nov 2026). The card itself: its day, whose it is, a
     progress bar and ONE status line (the most urgent problem, else the next step); Drop's "ready to resubmit?"
     stays in sight because it waits on Luke. Everything else (the warnings, the distributor, every step, the
     approvals, the files) folds behind "Steps and details", remembered per song. */
  function relCard(v) {
    var today = board.today, pill = L.upcomingPill(v, today), live = v.status === "scheduled" && !v.released, off = HQ.sample ? " disabled" : "";
    var acts = ['<div class="racts-main"><button class="copybtn" type="button" data-rel="page" data-id="' + esc(v.id) + '">Release page</button><button class="copybtn" type="button" data-rel="edit" data-id="' + esc(v.id) + '">Edit the details</button></div>'];
    if (live) acts.push('<div class="racts-more"><button class="linkbtn" type="button" data-rel="date" data-id="' + esc(v.id) + '"' + off + ">Change the date</button>" +
      '<button class="linkbtn danger" type="button" data-rel="cancel" data-id="' + esc(v.id) + '"' + off + ">Cancel release</button></div>");
    var asking = ui.rel.ask && ui.rel.ask.id === v.id, wg = L.warnGroups(v), st = L.relStatus(v, today), pr = L.relProgress(v), g = L.stepGroups(v);
    var badLeft = st.bad ? wg.bad.slice(1) : wg.bad;
    var allDone = v.released && v.counts && v.counts.total && v.counts.done === v.counts.total;
    var stepList = function (list) { return '<ol class="rsteps" aria-label="Steps">' + list.map(function (s) { return relStep(v, s); }).join("") + "</ol>"; };
    var steps = allDone ? '<p class="rnote">All ' + v.counts.total + " steps done.</p>"
      : (g.open.length ? '<p class="bsub">Still to do (' + g.open.length + ")</p>" + stepList(g.open) : "") +
        (g.done.length ? '<details class="bwhy" data-fold="done:' + esc(v.id) + '"' + (ui.rel.fold["done:" + v.id] ? " open" : "") + "><summary>Done or not ours (" + g.done.length + ")</summary>" + stepList(g.done) + "</details>" : "");
    var sheetSong = (HQ.sheet() && HQ.sheet().songs || []).filter(function (s) { return L.titleKey(s.song) === L.titleKey(v.title); })[0];
    var pageSong = (HQ.overview && HQ.overview() && HQ.overview().songs || []).filter(function (s) { return L.titleKey(s.title) === L.titleKey(v.title); })[0];
    var face = L.releaseFace(v, today, { cover: (pageSong && pageSong.cover) || (sheetSong && sheetSong.cover) || "", taps: pageSong ? pageSong.taps : null, people: pageSong ? pageSong.people : null, spend: "", mail: board && board.mail });
    var ring = face.progress.total ? '<span class="ring" style="--p:' + face.progress.pct + '" aria-label="' + esc(face.progress.text) + '"><b>' + face.progress.done + "/" + face.progress.total + "</b></span>" : "";
    var dots = face.dots.length ? '<p class="rdots" aria-hidden="true">' + face.dots.map(function (t) { return '<i class="' + t + '"></i>'; }).join("") + "</p>" : "";
    var nxt = face.next ? '<p class="rnext">Next: ' + esc(face.next.label) + " · " + esc(face.next.owner) + (face.next.when ? " · " + esc(face.next.when) : "") + "</p>" : "";
    var tapN = face.taps == null ? null : Number(String(face.taps).replace(/,/g, ""));
    var statBits = [face.people != null ? L.fmt(face.people) + " people" : "", face.taps != null ? L.fmt(face.taps) + " Spotify tap" + (tapN === 1 ? "" : "s") : ""].filter(Boolean);
    var stats = statBits.length ? '<p class="rstats">' + esc(statBits.join(" · ")) + "</p>" : "";
    if (face.prehq) { badLeft = []; wg = { bad: [], caution: [] }; }
    var mark = L.songMark(board && board.disputes, v.title, today, [v]);
    return '<article class="tile relcard rstrip' + (mark.tone ? " tone-" + mark.tone : "") + '" id="releases-' + esc(safe(v.id)) + '">' +
      (face.cover ? '<img class="rcover" src="' + esc(face.cover) + '" alt="">' : "") +
      '<div class="rface"><div class="bhead"><div><h3>' + esc(v.title) + "</h3>" +
      '<p class="rwhen">' + esc(face.when) + "</p>" + dealHtml(v) + (mark.badge ? '<p class="dbadge">' + esc(mark.badge) + "</p>" : "") + "</div>" + ring +
      '<span class="' + (pill.bad ? "bstate late" : "pill" + (pill.rel ? " rel" : "")) + '">' + esc(pill.text) + "</span></div>" +
      (face.prehq ? '<p class="prehq">pre-HQ</p>' : "") + dots + nxt +
      (face.distributor && !/ISRC|UPC/i.test(face.distributor) ? '<p class="rdist">' + esc(face.distributor) + "</p>" : "") +
      (face.mailLine && !/^RouteNote email: (not connected|not reported)$/.test(face.mailLine) ? '<p class="rdist">' + esc(face.mailLine) + "</p>" : "") + stats +
      (ui.rel.note[v.id] ? '<p class="rdone" role="status">' + esc(ui.rel.note[v.id]) + "</p>" : "") +
      (!face.prehq && (st.bad || st.caution) ? '<p class="rstat' + (st.bad ? " bad" : " caution") + '">' + esc(st.text) + (st.more ? ' <span class="rmore">+' + st.more + " more</span>" : "") + "</p>" : "") +
      "</div>" +
      pitchHtml(v) +
      resubmitHtml(v) + preflightHtml(v) +
      '<details class="rfold" data-fold="card:' + esc(v.id) + '"' + (ui.rel.fold["card:" + v.id] ? " open" : "") + "><summary>Steps and details</summary>" +
      (badLeft.length ? '<ul class="rwarn" aria-label="Warnings">' + badLeft.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>" : "") +
      (wg.caution.length ? '<ul class="rwarn note" aria-label="Notes">' + wg.caution.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>" : "") +
      storeHtml(v) + steps + approvalsHtml(v) + packHtml(v) + relPack(v) + "</details>" +
      (asking && (ui.rel.ask.kind === "date" || ui.rel.ask.kind === "cancel") ? relAsk(v) : '<div class="racts racts-card">' + acts.join("") + "</div>") +
      '<p class="ferr" role="alert">' + esc(ui.rel.err[v.id] || "") + "</p></article>";
  }
  /* Needs you (the overhaul): what on this tab waits on Luke, first; each one opens its card (or the message,
     or Spotify for Artists). Nothing waiting: the line says so, quietly. */
  function drawNow() {
    var el = $("relNow");
    if (!el) return;
    var asks = L.upcomingAsks(board, board.today);
    el.innerHTML = asks.length ? '<section class="tile relnow" aria-labelledby="relNowH"><h3 class="lblh" id="relNowH">Needs you (' + asks.length + ")</h3><ul>" + asks.map(function (x) {
      return '<li><button class="relnow-i" type="button" data-now="' + esc(x.go) + '" data-id="' + esc(x.id) + '"' + (x.msg ? ' data-msg="' + esc(x.msg) + '"' : "") + "><span>" + esc(x.text) + '</span><span aria-hidden="true">›</span></button></li>';
    }).join("") + "</ul></section>" : '<p class="relnow-ok">Nothing on this tab needs you right now.</p>';
  }
  /* ---------- Planning (14 Nov 2026, Luke: "a calender with team reccomendations … scheduled correctly well
     in advance … when i upload it should suggest dates") ----------
     At the top of Upcoming: the next good release days (HQLib.suggestDates; a draft with no day yet, like
     Survivors, gets "Use Fri 18 Dec for Survivors"), the calendar (HQLib.calendarMonth: release days and
     every open step on its day; tap a day for its list), and how long things take (HQLib.PLAN_TIMELINE). */
  /* A6 (17 Nov 2026): the pre-flight list (artist spelling, links, file types), folded under one amber line */
  function preflightHtml(v) {
    var line = L.preflightLine(v);
    return line ? '<details class="rpre" data-fold="pre:' + esc(v.id) + '"' + (ui.rel.fold["pre:" + v.id] ? " open" : "") + "><summary>" + esc(line) + '</summary><ul class="rwarn">' +
      v.preflight.map(function (x) { return "<li>" + esc(x.text) + "</li>"; }).join("") + "</ul></details>" : "";
  }
  function drawPlan() {
    var el = $("relPlan");
    if (!el || !board || !Array.isArray(board.releases)) return;
    var today = board.today, rels = board.releases;
    var sugg = L.suggestDates(today, rels);
    var noDay = rels.filter(function (v) { return v.status === "draft" && !v.date; });
    var nextHtml = '<section class="tile plan-next"><h3 class="lblh">Next good release days</h3><p class="secsub">Fridays at least ' + (L.PLAN_RULE.recommend / 7) + " weeks out and 2 weeks clear of every other song.</p>" +
      '<div class="pchips">' + sugg.map(function (x) {
        return '<button class="pchip' + (x.best ? " best" : "") + '" type="button" data-plan="new" data-date="' + esc(x.date) + '">' + esc(x.words) + "<small>" + esc(x.weeks + " weeks" + (x.note ? " · holidays" : "")) + "</small></button>";
      }).join("") + "</div>" +
      noDay.map(function (v) {
        var s = L.suggestDates(today, rels, { except: v.id, n: 1 })[0];
        return s ? '<p class="plan-draft"><b>' + esc(v.title) + "</b> has no release day yet. " + '<button class="linkbtn" type="button" data-plan="use" data-id="' + esc(v.id) + '" data-date="' + esc(s.date) + '">Use ' + esc(s.words) + " for " + esc(v.title) + "</button></p>" : "";
      }).join("") + (HQ.sample ? '<p class="fok">Sample: the form opens, nothing is saved.</p>' : "") + "</section>";
    var m = L.calendarMonth(ui.cal.ym || today.slice(0, 7), rels, today);
    var sel = ui.cal.sel && m.weeks.some(function (w) { return w.some(function (c) { return c.date === ui.cal.sel; }); }) ? ui.cal.sel : "";
    var cell = function (c) {
      var rel = c.items.filter(function (x) { return x.kind === "release"; }), steps = c.items.filter(function (x) { return x.kind === "step"; });
      var late = steps.some(function (x) { return x.late; });
      return '<button class="cday' + (c.inMonth ? "" : " out") + (c.today ? " now" : "") + (c.date === sel ? " sel" : "") + (rel.length ? " rel" : "") + '" type="button" data-cal="' + esc(c.date) + '" aria-label="' +
        esc(L.day(c.date) + (rel.length ? ", release: " + rel.map(function (x) { return x.title; }).join(", ") : "") + (steps.length ? ", " + steps.length + " step" + (steps.length === 1 ? "" : "s") : "")) + '">' +
        '<span class="cn">' + c.day + "</span>" +
        rel.map(function (x) { return '<span class="crel' + (x.draft ? " draft" : "") + '">' + esc(x.title) + "</span>"; }).join("") +
        (steps.length ? '<span class="cdots' + (late ? " late" : "") + '">' + steps.slice(0, 4).map(function () { return "<i></i>"; }).join("") + (steps.length > 4 ? "+" : "") + "</span>" : "") + "</button>";
    };
    var selCell = sel ? m.weeks.reduce(function (a, w) { return a.concat(w); }, []).filter(function (c) { return c.date === sel; })[0] : null;
    var dayList = selCell ? '<div class="cal-day"><h4>' + esc(L.day(sel)) + "</h4>" + (selCell.items.length ? '<ul class="cal-items">' + selCell.items.map(function (x) {
        return x.kind === "release" ? '<li class="r"><a href="#releases/' + esc(safe(x.id)) + '"><b>' + esc(x.title) + "</b> comes out" + (x.draft ? " (draft: not sent yet)" : "") + "</a></li>"
          : '<li class="' + (x.late ? "late" : "") + '"><a href="#releases/' + esc(safe(x.id)) + '"><b>' + esc(x.owner) + "</b> · " + esc(x.label) + " · " + esc(x.title) + (x.late ? " · late" : "") + "</a></li>";
      }).join("") + "</ul>" : '<p class="empty2">Nothing due that day.</p>') + "</div>" : '<p class="cal-hint">Tap a day to see what is due.</p>';
    var calHtml = '<section class="tile plan-cal" aria-labelledby="calTitle"><div class="cal-head"><button class="iconbtn" type="button" data-calnav="' + esc(m.prev) + '" aria-label="Previous month">‹</button>' +
      '<h3 id="calTitle">' + esc(m.title) + '</h3><button class="iconbtn" type="button" data-calnav="' + esc(m.next) + '" aria-label="Next month">›</button></div>' +
      '<div class="cal-grid" role="grid"><span class="cw">Mon</span><span class="cw">Tue</span><span class="cw">Wed</span><span class="cw">Thu</span><span class="cw">Fri</span><span class="cw">Sat</span><span class="cw">Sun</span>' +
      m.weeks.map(function (w) { return w.map(cell).join(""); }).join("") + "</div>" +
      '<p class="cal-key"><span class="k rel">Release day</span><span class="k dot">Team steps due</span><span class="k late">Late</span></p>' + dayList + "</section>";
    var timeHtml = '<details class="tile plan-time"' + (ui.rel.fold.timeline ? " open" : "") + ' data-fold="timeline"><summary>How long things take, and the team\'s rule</summary><ul class="tl">' +
      L.PLAN_TIMELINE.map(function (x) { return "<li><b>" + esc(x.what) + "</b><span>" + esc(x.time) + "</span></li>"; }).join("") + "</ul>" +
      '<p class="tl-rule"><b>The team\'s rule:</b> Drop sends a song to RouteNote 4 weeks before its release day (3 weeks at the very least), songs come out on Fridays, and there are 2 weeks between two songs: a week as Out now, then a week as the next one. Atlas pitches the day the song shows in Spotify for Artists.</p></details>';
    /* 23 Nov 2026 (Luke): the six-week list and the pitch tile are off this tab: the calendar shows the
       weeks, and each song's steps show its pitch. (L.sixWeeks / L.pitchBlock stay for the bots' tools.) */
    el.innerHTML = '<div class="plangrid">' + nextHtml + calHtml + "</div>" + timeHtml;
  }
  /* -> true when the desk drew the tab (js/hq.js draws the sheet's list when it didn't) */
  /* the release page (17 Nov 2026): the whole release in one view, on top of Upcoming */
  function releasePageHtml(v, sheet) {
    var song = sheet && (sheet.songs || []).filter(function (x) { return L.titleKey(x.song) === L.titleKey(v.title); })[0];
    var p = L.releasePage(v, board.today, { fields: board.packFields || [], song: song });
    var GROUPS = { deal: "Whose release", files: "Files", stores: "For the stores", lyrics: "Lyrics", pitch: "For the pitch", later: "Filled by the team", notes: "Notes" };
    var cls = { filled: "", missing: "st-missing", "needed later": "st-later", optional: "st-opt", "not needed": "st-none" };
    var groups = {}; p.fields.forEach(function (f) { (groups[f.group] || (groups[f.group] = [])).push(f); });
    var show = function (f) { return f.state === "filled" ? (/^https:\/\//.test(f.value) ? '<a href="' + esc(f.value) + '" target="_blank" rel="noopener">link</a>' : esc(f.value.length > 160 ? f.value.slice(0, 159) + "…" : f.value)) : '<span class="' + cls[f.state] + '">' + esc(f.state) + "</span>"; };
    return '<article class="tile rpage" aria-labelledby="rpTitle"><div class="rphead"><div><h3 id="rpTitle">' + esc(p.title) + '</h3><p class="rwhen">' + esc(p.when) + "</p></div>" +
      '<button class="copybtn" type="button" data-rel="page-close" data-id="' + esc(v.id) + '">Close</button></div>' +
      '<p class="rpready ' + (p.ready ? "ok" : "no") + '">' + esc(p.ready ? "Ready: everything is done" : p.readyText) + "</p>" +
      '<ul class="rpcheck">' + p.checklist.map(function (c) { return '<li class="' + (c.ok ? "ok" : "no") + '"><span class="mk">' + (c.ok ? "✓" : "○") + "</span><span>" + esc(c.text) + "</span></li>"; }).join("") + "</ul>" +
      '<div class="rpsec"><p class="t-lbl">Ad plan</p>' + (p.adPlan ? '<p class="rpplan">' + esc(p.adPlan) + "</p>" : '<p class="rnote">Not written yet. Add your notes under Edit the details (Ad plan).</p>') + "</div>" +
      (p.results.length ? '<div class="rpsec"><p class="t-lbl">After the release</p>' + p.results.map(function (r) { return "<p>" + esc(r) + "</p>"; }).join("") + '<p><a href="#songs">See Songs</a></p></div>' : "") +
      Object.keys(groups).map(function (g) { return '<div class="rpsec"><p class="t-lbl">' + esc(GROUPS[g] || g) + '</p><dl class="rpfields">' + groups[g].map(function (f) { return "<dt>" + esc(f.label) + "</dt><dd>" + show(f) + "</dd>"; }).join("") + "</dl></div>"; }).join("") +
      "</article>";
  }
  function drawRelRows(list) {
    var box = $("relRows");
    if (!box || !window.HQLook) return;
    var rows = HQLook.releaseRows(list, board.today);
    var key = rows.length ? '<p class="rdots-key">Dots, in order: in Spotify for Artists · pitched · Canvas · lyrics · song page. Filled = done.</p>' : "";
    rows.forEach(function (r) {
      var rel = relById[r.id];
      var tl = rel ? HQLook.releaseTimeline(rel) : [];
      if (!ui.rel.time && !ui.rel.shut[r.id] && tl.some(function (s) { return s.autoOpen; })) ui.rel.time = r.id;
    });
    box.innerHTML = rows.map(function (r) {
      var open = ui.rel.time === r.id;
      var rel = relById[r.id];
      var tl = open && rel ? HQLook.releaseTimeline(rel) : [];
      var blockers = [];
      if (open && rel) {
        try {
          var view = L.releaseView(rel, board.today);
          blockers = (view.missing || []).map(function (m) { return m && (m.label || m.text || m); });
        } catch (e) { blockers = []; }
      }
      var ready = open ? HQLook.readinessBox(blockers) : null;
      return '<article class="relrow"><button type="button" class="relrow-h" data-rel="time" data-id="' + esc(r.id) + '"><i class="sdot ' + esc(r.store.tone) + '" aria-label="' + esc(r.store.label) + '"></i><b>' + esc(r.title) + '</b><span>' + esc(r.when) + '</span><span class="rdots">' + r.dots.map(function (d) { return '<i class="' + (d.on ? "on" : "") + '" title="' + esc(d.label) + '"></i>'; }).join("") + '</span></button>' +
        (open ? '<ol class="tl-v">' + tl.map(function (s) {
          var when = HQLook.stampDay ? HQLook.stampDay(s.at, L) : "";
          var sub = s.note || (s.done && when ? when : "");
          return '<li class="' + (s.bad ? "bad" : s.done ? "ok" : "") + '"><b>' + esc(s.label) + "</b>" + (sub ? "<span>" + esc(sub) + "</span>" : "") + "</li>"; }).join("") + "</ol>" +
          (ready ? '<div class="readybox"><p>' + esc(ready.line) + "</p>" + (ready.items.length ? "<ul>" + ready.items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>" : "") + "</div>" : "") : "") + "</article>";
    }).join("") + key;
  }
  function drawReleases() {
    if (!board || !Array.isArray(board.releases)) return false;
    var sheet = HQ.sheet(), lists = L.releaseLists(board, sheet);
    relById = {}; board.releases.forEach(function (v) { relById[v.id] = v; });
    var pg = ui.rel.page && relById[ui.rel.page];
    $("relPage").hidden = !pg;
    $("relPage").innerHTML = pg ? releasePageHtml(pg, sheet) : "";
    $("relSample").hidden = !HQ.sample;
    /* a redraw must not take the caret out of the date field being picked */
    var act = document.activeElement, fk = act && act.getAttribute ? act.getAttribute("data-reldate") : null;
    $("relPipe").innerHTML = lists.pipeline.length ? lists.pipeline.map(pipeCard).join("") : '<p class="empty2">Nothing is being prepared right now. Start one with New song.</p>';
    $("relDesk").innerHTML = lists.coming.map(relCard).join("");
    drawRelRows(lists.coming);
    if (sheet && HQ.releasesBroken()) $("relList").innerHTML = '<p class="empty">See the note above.</p>';
    else $("relList").innerHTML = lists.sheetOnly.map(HQ.sheetReleaseCard).join("") ||
      ((lists.coming.length || (board.releases || []).some(function (r) { return r && r.status === "scheduled"; })) ? "" : '<p class="empty2">Nothing has been sent to the team yet. A song moves here from “In the pipeline” when you send it.</p>');
    /* the songs whose day has come leave Upcoming: one quiet line (they live in Songs); one that still has
       a step open keeps its card, so the step can be finished */
    var outs = lists.out.map(function (v) { return { title: v.title, date: v.date }; }).concat(lists.sheetOut.map(function (r) { return { title: r.song, date: r.date }; }))
      .sort(function (a, b) { return (a.date || "") < (b.date || "") ? 1 : -1; });
    var ol = L.outLine(outs);
    $("relOut").innerHTML = (ol ? '<p class="routline">' + esc(ol) + ' <a href="#songs">See Songs</a></p>' : "") +
      (lists.openOut.length ? '<h4 class="lblh">Out, with a step still open</h4><div class="relgrid">' + lists.openOut.map(relCard).join("") + "</div>" : "") +
      (lists.cancelled.length ? '<details class="relfold" data-fold="cancelled"' + (ui.rel.fold.cancelled ? " open" : "") + "><summary>Cancelled (" + lists.cancelled.length + ")</summary>" + lists.cancelled.map(function (v) {
        return '<p class="rcanc"><b>' + esc(v.title) + "</b> · " + esc(v.date ? L.day(v.date) : "no release day") + "</p>"; }).join("") + "</details>" : "");
    drawSpotify();
    drawPlan();
    drawNow();
    if (fk) { var el = $("releases").querySelector('[data-reldate="' + fk.replace(/[^a-z0-9]/gi, "") + '"]'); if (el) el.focus(); }
    return true;
  }

  /* ---------- In Spotify for Artists (v2, 11 Nov 2026) ----------
     What Atlas last saw there as upcoming (board.sightings). A song in the pipeline is listed quietly; a
     song that didn't go through it is a QUESTION for Luke, on the page (not a message), with the four
     answers. "With a label" asks the label's name in place; every answer is confirmed in place first.
     The only write: POST /api/staff/sighting (Luke only; off in the sample). */
  function spotQ(x, choices) {
    var S = ui.spot, id = safe(x.key), q = L.sightQuestion(x), mine = S.k === x.key && S.answer, busy = S.busy === x.key;
    var body;
    if (mine) {
      var dis = HQ.sample || busy ? " disabled" : "", self = S.answer === "self" || S.answer === "label";
      body = '<div class="confirm" role="group" aria-label="Confirm your answer">' +
        (S.answer === "label" ? '<label class="flbl" for="spl-' + esc(id) + '">The label\'s name</label><input class="fld" id="spl-' + esc(id) + '" data-splabel="' + esc(x.key) + '" maxlength="120" autocomplete="off" value="' + esc(S.label) + '"' + (busy ? " disabled" : "") + ">" : "") +
        '<p id="spc-' + esc(id) + '">' + esc(L.sightConfirm(x, S.answer, S.label.trim())) + "</p>" +
        '<div class="conn-acts"><button class="sendbtn" type="button" data-sp="yes" data-k="' + esc(x.key) + '"' + dis + ">" + (busy ? "Sending…" : self ? "Yes, start the draft" : S.answer === "it" ? "Yes, it is that song" : "Yes, tell Nova") + "</button>" +
        '<button class="copybtn" type="button" data-sp="no" data-k="' + esc(x.key) + '"' + (busy ? " disabled" : "") + ">Cancel</button></div></div>";
    } else body = '<div class="mopts spopts">' +
      /* a song in the pipeline under another title (review, 11 Nov 2026): a fifth answer, first */
      (x.near ? '<button class="copybtn" type="button" data-sp="pick" data-k="' + esc(x.key) + '" data-a="it"' + (HQ.sample ? " disabled" : "") + ">" + esc("It is " + x.near.title) + "</button>" : "") +
      choices.map(function (c) {
      return '<button class="copybtn" type="button" data-sp="pick" data-k="' + esc(x.key) + '" data-a="' + esc(c.answer) + '"' + (HQ.sample ? " disabled" : "") + ">" + esc(c.text) + "</button>"; }).join("") + "</div>";
    return '<div class="spq" id="spq-' + esc(id) + '"><p class="spt"><b>' + esc(q.title) + "</b>" + esc(q.rest) + "</p>" + (x.shownAs ? '<p class="sps">Shown there as: ' + esc(x.shownAs) + "</p>" : "") +
      body + '<p class="ferr" role="alert">' + esc(S.err[x.key] || "") + "</p></div>";
  }
  function spotRow(x) {
    var r = L.sightRow(x), d = ui.spot.done[x.key], fresh = d && Date.now() - d.at < KEEP_MS;
    return '<li class="' + (x.state === "answered" ? "q" : "") + '"><span class="spr"><b>' + esc(r.title) + "</b> · " + esc(r.when) + "</span>" +
      '<span class="spw">' + (x.state === "pipeline" && r.id && relById[r.id] ? '<button class="linkbtn" type="button" data-sp="go" data-id="' + esc(r.id) + '">' + esc(r.text) + "</button>" : esc(r.text)) + "</span>" +
      (r.shown ? '<span class="sps">Shown there as: ' + esc(r.shown) + "</span>" : "") +
      /* the message to Nova never went (review, 11 Nov 2026): the same answer, sent again */
      (r.retry ? '<div class="conn-acts"><button class="copybtn" type="button" data-sp="resend" data-k="' + esc(x.key) + '"' + (HQ.sample || ui.spot.busy === x.key ? " disabled" : "") + ">" + (ui.spot.busy === x.key ? "Sending…" : "Send it to Nova again") + "</button></div>" +
        '<p class="ferr" role="alert">' + esc(ui.spot.err[x.key] || "") + "</p>" : "") +
      (fresh ? (d.fail ? '<p class="ferr" role="alert">' + esc(d.line) + "</p>" : '<p class="landed tsent" role="status"><span>' + esc(d.line) + "</span></p>") : "") + "</li>";
  }
  /* 23 Nov 2026 (Luke: "remove … in spotify for artists, that's clearly handled in the drop down of steps"):
     a song in the pipeline shows there through its own steps, so this part shows ONLY a song that did not go
     through Upcoming (his question), one whose message to Nova has to go again, or an answer just given. */
  function drawSpotify() {
    var el = $("relSpot"), wrap = $("relSpotWrap"), sv = board && board.sightings, items = (sv && sv.items) || [];
    var fresh = function (x) { var d = ui.spot.done[x.key]; return !!(d && Date.now() - d.at < KEEP_MS); };
    var ask = items.filter(function (x) { return x.state === "unknown"; });
    var rest = items.filter(function (x) { return x.state === "retry"; }).concat(items.filter(function (x) { return x.state !== "unknown" && x.state !== "retry" && fresh(x); }));
    var choices = sv && sv.choices && sv.choices.length ? sv.choices : [];
    if (wrap) wrap.hidden = !(ask.length || rest.length);
    el.innerHTML = ask.length || rest.length ? '<div class="tile spotcard">' +
      (ask.length ? '<div class="spasks">' + ask.map(function (x) { return spotQ(x, choices); }).join("") + "</div>" : "") +
      (rest.length ? '<ul class="splist">' + rest.map(spotRow).join("") + "</ul>" : "") + "</div>" : "";
  }
  $("relSpot").addEventListener("input", function (ev) {
    var k = ev.target.getAttribute && ev.target.getAttribute("data-splabel"), S = ui.spot;
    if (!k || S.k !== k) return;
    S.label = ev.target.value;
    if (S.err[k]) { delete S.err[k]; var fe = $("spq-" + safe(k)).querySelector(".ferr"); if (fe) fe.textContent = ""; }
    var x = ((board && board.sightings && board.sightings.items) || []).filter(function (i) { return i.key === k; })[0], p = $("spc-" + safe(k));
    if (x && p) p.textContent = L.sightConfirm(x, S.answer, S.label.trim());
  });
  $("relSpot").addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-sp]");
    if (!b || !board || !board.sightings) return;
    var act = b.getAttribute("data-sp"), k = b.getAttribute("data-k") || "", S = ui.spot, sk = safe(k);
    if (act === "go") { jumpTo(b.getAttribute("data-id")); return; }
    var x = (board.sightings.items || []).filter(function (i) { return i.key === k; })[0];
    if (!x || S.busy) return;
    var focus = function (sel) { var el = $("relSpot").querySelector(sel); if (el) el.focus(); };
    if (act === "pick") {
      if (HQ.sample) return;
      S.k = k; S.answer = b.getAttribute("data-a"); S.label = ""; delete S.err[k]; drawSpotify();
      focus(S.answer === "label" ? "#spl-" + sk : '[data-sp="no"][data-k]');
      return;
    }
    if (act === "no") { S.k = ""; S.answer = ""; S.label = ""; drawSpotify(); focus("#spq-" + sk + " [data-sp=pick]"); return; }
    var answer, label;
    if (act === "resend") {
      /* the same answer again: the desk sends the message it could not send before */
      if (HQ.sample || x.state !== "retry" || !x.answer) return;
      answer = x.answer.answer; label = x.answer.label || "";
    } else {
      if (act !== "yes" || S.k !== k || HQ.sample) return;
      answer = S.answer; label = S.label.trim();
    }
    if (answer === "label" && label.length < 2) { S.err[k] = "Write the label's name first."; drawSpotify(); focus("#spl-" + sk); return; }
    if (answer === "it" && !x.near) return;
    S.busy = k; drawSpotify();
    write("sighting", { key: k, answer: answer, label: answer === "label" ? label : "", id: answer === "it" ? x.near.id : "" }).then(function (r) {
      S.busy = "";
      if (!r.ok) { S.err[k] = r.error; drawSpotify(); return; }
      delete S.err[k];
      if (r.j.sightings) board.sightings = r.j.sightings;
      if (r.j.release) putRelease(r.j.release);
      /* fail: the answer is kept but the message to Nova didn't go: said in red, never with a tick */
      S.done[k] = { at: Date.now(), line: L.sightDone(x.title, answer, !!r.j.told, Date.now()), fail: (answer === "notmine" || answer === "mistake") && !r.j.told };
      S.k = ""; S.answer = ""; S.label = "";
      draw();
      reload();
    });
  });
  function jumpTo(id, open) {
    if (open && relById[id]) { ui.rel.fold["card:" + id] = true; drawReleases(); }
    var el = $("releases-" + safe(id));
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    el.classList.add("pulse"); setTimeout(function () { el.classList.remove("pulse"); }, 1600);
  }
  function relDone(r, id, after) { /* one release write came back */
    ui.rel.busy = "";
    if (!r.ok) { ui.rel.err[id] = r.error; drawReleases(); return; }
    delete ui.rel.err[id];
    if (r.j && r.j.release) putRelease(r.j.release);
    if (after) after(r.j || {});
    drawReleases(); HQ.boardChanged();
    reload();
  }
  /* Needs you: each item opens its card (unfolded), the message, or Spotify for Artists */
  $("relNow").addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-now]");
    if (!b) return;
    var go = b.getAttribute("data-now"), id = b.getAttribute("data-id");
    if (go === "message") { location.hash = "#messages/" + (b.getAttribute("data-msg") || ""); return; }
    if (go === "spotify") { var sp = $("releases-spotify"); if (sp) sp.scrollIntoView({ block: "start" }); return; }
    jumpTo(id, true);
  });
  $("releases").addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-rel]");
    if (!b || !board) return;
    var act = b.getAttribute("data-rel"), id = b.getAttribute("data-id") || "", v = relById[id];
    if (act === "time") {
      ui.rel.time = ui.rel.time === id ? "" : id;
      if (!ui.rel.time) ui.rel.shut[id] = true;
      else delete ui.rel.shut[id];
      drawReleases();
      return;
    }
    var focusSel = function (sel) { var el = $("releases").querySelector(sel); if (el) el.focus(); };
    var sid = id.replace(/[^a-z0-9]/gi, "");
    if (act === "page") { ui.rel.page = id; drawReleases(); var pgEl = $("relPage"); if (pgEl) pgEl.scrollIntoView({ block: "start" }); return; }
    if (act === "page-close") { ui.rel.page = null; drawReleases(); jumpTo(id, true); return; }
    if (act === "edit") {
      if (ui.rel.loading[id]) return;
      /* the form needs the whole release (the lyrics too), or saving it would look like clearing them */
      if (relById[id] && !fullOf(relById[id])) { b.disabled = true; b.textContent = "Opening…"; loadFull(id).then(function (f) { if (f && fullOf(relById[id])) openForm(id); else drawReleases(); }); return; }
      openForm(id); return;
    }
    if (!v || ui.rel.busy) return;
    if (act === "no") { ui.rel.ask = null; drawReleases(); focusSel('[data-rel="date"][data-id="' + sid + '"], [data-rel="cancel"][data-id="' + sid + '"]'); return; }
    if (HQ.sample) return;
    if (act === "date") { ui.rel.ask = { id: id, kind: "date", date: "" }; delete ui.rel.err[id]; drawReleases(); focusSel('[data-reldate="' + sid + '"]'); return; }
    if (act === "cancel") { ui.rel.ask = { id: id, kind: "cancel" }; delete ui.rel.err[id]; drawReleases(); focusSel('[data-rel="no"][data-id="' + sid + '"]'); return; }
    if (act === "date-yes" && ui.rel.ask && ui.rel.ask.id === id && ui.rel.ask.date) {
      var to = ui.rel.ask.date, from = v.date;
      ui.rel.busy = "ask:" + id; drawReleases();
      write("release/date", { id: id, date: to }).then(function (r) {
        relDone(r, id, function (j) { ui.rel.ask = null; ui.rel.note[id] = "Moved from " + L.day(from) + " to " + L.day(to) + " at " + hhmm(Date.now()) + ". Every step that isn't done has a new date." + (j.told ? " The team was told." : ""); });
      });
    }
    /* batch 3: approve / take back (Luke only: POST release/approve), and the answer to "ready to resubmit?" */
    if (act === "approve" || act === "unapprove") { ui.rel.ask = { id: id, kind: act, what: b.getAttribute("data-what") === "pitch" ? "pitch" : "lyrics" }; delete ui.rel.err[id]; drawReleases(); focusSel('[data-rel="' + act + '-yes"][data-id="' + sid + '"]'); return; }
    if ((act === "approve-yes" || act === "unapprove-yes") && ui.rel.ask && ui.rel.ask.id === id) {
      var what = ui.rel.ask.what, back = act === "unapprove-yes";
      ui.rel.busy = "ask:" + id; drawReleases();
      write("release/approve", { id: id, what: what, withdraw: back }).then(function (r) {
        relDone(r, id, function () { ui.rel.ask = null; ui.rel.note[id] = (back ? "Approval taken back" : "Final lyrics approved") + " at " + hhmm(Date.now()) + "."; });
      });
      return;
    }
    if (act === "resubmit") { ui.rel.ask = { id: id, kind: "resubmit", i: Number(b.getAttribute("data-i")) }; delete ui.rel.err[id]; drawReleases(); focusSel('[data-rel="resubmit-yes"][data-id="' + sid + '"]'); return; }
    if (act === "resubmit-yes" && ui.rel.ask && ui.rel.ask.id === id) {
      var m = L.resubmitAsk(board, id), pick = m && (m.options || [])[ui.rel.ask.i];
      if (!m || pick == null) return;
      ui.rel.busy = "ask:" + id; drawReleases();
      write("message", { to: m.from, text: String(pick), needs: "none", re: m.id, note: String(pick).slice(0, 240) }).then(function (r) {
        relDone(r, id, function () { ui.rel.ask = null; m.resolved = { by: "Luke", at: new Date().toISOString(), note: pick }; ui.rel.note[id] = "Sent to " + m.from + " at " + hhmm(Date.now()) + ": " + pick + "."; });
      });
      return;
    }
    if (act === "cancel-yes" && ui.rel.ask && ui.rel.ask.id === id) {
      ui.rel.busy = "ask:" + id; drawReleases();
      write("release/cancel", { id: id }).then(function (r) {
        relDone(r, id, function (j) { ui.rel.ask = null; $("relMsg").textContent = v.title + " is cancelled." + (j.told ? " The team was told to stop working on it." : ""); });
      });
    }
    if (act === "step") {
      var key = b.getAttribute("data-step"), want = b.getAttribute("data-to") === "todo" ? "todo" : "done";
      var st = (v.steps || []).filter(function (x) { return x.key === key; })[0];
      if (!st) return;
      ui.rel.busy = "step:" + id + ":" + key; drawReleases();
      /* the bot's own note stays with its step; a "blocked" note doesn't outlive the block */
      write("release/step", { id: id, step: key, status: want, note: st.status === "blocked" ? "" : st.note || "", link: "" }).then(function (r) { relDone(r, id); });
    }
  });
  $("releases").addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-calnav],[data-cal],[data-plan]");
    if (!b || !board) return;
    var nav = b.getAttribute("data-calnav"), d = b.getAttribute("data-cal"), plan = b.getAttribute("data-plan"), date = b.getAttribute("data-date") || "";
    if (nav) { ui.cal.ym = nav; ui.cal.sel = ""; drawPlan(); var again = $("relPlan").querySelector('[data-calnav="' + nav.replace(/[^0-9-]/g, "") + '"]') || $("calTitle"); if (again && again.focus) again.focus(); return; }
    if (d) { ui.cal.sel = ui.cal.sel === d ? "" : d; drawPlan(); var c = $("relPlan").querySelector('[data-cal="' + d.replace(/[^0-9-]/g, "") + '"]'); if (c) c.focus(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (plan === "new") {
      /* a new song on that day; a new form already open keeps what was typed and takes the day */
      if (ui.form && !ui.form.id) { ui.form.date = date; drawForm(); $("relForm").scrollIntoView({ block: "start" }); return; }
      openForm("", { date: date }); return;
    }
    if (plan === "use") {
      var id = b.getAttribute("data-id");
      var go = function () { openForm(id); if (ui.form && ui.form.id === id && ui.form.status !== "scheduled") { ui.form.date = date; drawForm(); keepForm(); } };
      if (relById[id] && fullOf(relById[id])) go(); else { b.disabled = true; b.textContent = "Opening…"; loadFull(id).then(function (f) { if (f && fullOf(relById[id])) go(); else drawPlan(); }); }
    }
  });
  $("releases").addEventListener("change", function (ev) {
    var id = ev.target.getAttribute && ev.target.getAttribute("data-reldate");
    if (!id || !ui.rel.ask || ui.rel.ask.id !== id) return;
    ui.rel.ask.date = ev.target.value; drawReleases();
  });
  /* remember which disclosures are open (toggle doesn't bubble: listen on the way down) */
  $("releases").addEventListener("toggle", function (ev) {
    var t = ev.target, id = t.getAttribute && t.getAttribute("data-relopen"), fold = t.getAttribute && t.getAttribute("data-fold"), fg = t.getAttribute && t.getAttribute("data-fg");
    if (id) { ui.rel.open[id] = t.open; if (t.open && relById[id] && !fullOf(relById[id])) { delete ui.rel.err[id]; loadFull(id); } }
    if (fold) ui.rel.fold[fold] = t.open;
    if (fg && ui.form) ui.form.open[fg] = t.open;
  }, true);

  /* ---------- the form: start a release, finish a draft, or change one that went out ---------- */
  function keepForm() { if (HQ.sample || !ui.form) return; try { localStorage.setItem(L.formKey(ui.form.id), JSON.stringify({ id: ui.form.id, title: ui.form.title, date: ui.form.date, vals: ui.form.vals, at: Date.now() })); } catch (e) {} }
  function forgetForm(id) { try { localStorage.removeItem(L.formKey(id)); } catch (e) {} }
  /* preset (v2, Songs' "Add its details"): { title, date } for a new one, filled in already */
  function openForm(id, preset) {
    if (!relFields().length || (id && !board)) { $("relMsg").textContent = id || bothFailed() ? NEEDS_DESK : "Loading the team…"; return; }
    var v = id ? fullOf(relById[id]) : null, vals = {};
    if (id && !v) { $("relMsg").textContent = "Couldn't open that release's details. Try again."; return; }
    relFields().forEach(function (f) { vals[f.key] = v && v.pack && v.pack[f.key] != null ? String(v.pack[f.key]) : ""; });
    var F = ui.form = { id: v ? v.id : "", status: v ? v.status : "draft", title: v ? v.title : "", date: (v && v.date) || "", orig: { title: v ? v.title : "", date: (v && v.date) || "", vals: JSON.parse(JSON.stringify(vals)) },
      vals: vals, later: false, open: {}, miss: [], err: "", ok: "", busy: "", ask: false, anyway: null };
    if (!v && preset) { F.title = String(preset.title || ""); F.date = /^\d{4}-\d{2}-\d{2}$/.test(preset.date || "") ? preset.date : ""; }
    /* what Luke typed last time and didn't save comes back (this device only; for another song's
       "Add its details" it stays where it is) */
    var kept = null;
    if (!HQ.sample) try { kept = JSON.parse(localStorage.getItem(L.formKey(F.id)) || "null"); } catch (e) {}
    if (kept && preset && !v && L.titleKey(kept.title) !== L.titleKey(F.title)) kept = null;
    if (kept && kept.id === F.id && kept.vals) {
      F.title = kept.title || F.title; if (F.status !== "scheduled") F.date = kept.date || ""; Object.keys(kept.vals).forEach(function (k) { if (k in F.vals) F.vals[k] = String(kept.vals[k] || ""); });
      F.ok = "What you typed last time is back. It isn't saved until you press Save or Send.";
    }
    $("relMsg").textContent = "";
    drawForm();
    $("relForm").hidden = false; $("relNew").setAttribute("aria-expanded", "true");
    $("relForm").scrollIntoView({ block: "start" });
    var t = $("rf-title"); if (t) t.focus({ preventScroll: true });
  }
  function closeForm(keep) {
    if (!keep && ui.form) forgetForm(ui.form.id);
    ui.form = null;
    $("relForm").hidden = true; $("relForm").innerHTML = ""; $("relNew").setAttribute("aria-expanded", "false");
  }
  /* the release day has passed: a song already out, recorded for whose song it is (v2) */
  var outNow = function (F) { return F.status !== "scheduled" && /^\d{4}-\d{2}-\d{2}$/.test(F.date || "") && F.date < formBase().today; };
  /* "needed to send" follows the desk's rule: the label and the split only "With a label" (v2) */
  var NEED = function (f) { return L.needWord(f, ui.form.vals, formBase().releaseSteps, outNow(ui.form)); };
  function fieldHtml(f) {
    var F = ui.form, id = "rf-" + safe(f.key), val = F.vals[f.key] || "", need = NEED(f), hint = f.hint ? '<p class="fhint" id="' + id + '-h">' + esc(f.hint) + "</p>" : "";
    if (!L.fieldShown(f, F.vals)) return "";
    var desc = f.hint ? ' aria-describedby="' + id + '-h"' : "", miss = F.miss.indexOf(f.key) >= 0 ? " miss" : "";
    if (f.group === "later" && !F.later) /* the team fills these: read-only until Luke asks to change them */
      return '<div class="ff" data-ff="' + esc(f.key) + '"><p class="flbl">' + esc(f.label) + '</p><p class="ro-v' + (val ? "" : " none") + '">' + (val ? (f.kind === "link" ? outLink(val, val) : esc(val)) : esc(L.fillWho(f))) + "</p></div>";
    var lbl = esc(f.label) + (need ? ' <span class="req">' + esc(need) + "</span>" : "");
    if (f.kind === "choice")
      return '<fieldset class="ff' + miss + '" data-ff="' + esc(f.key) + '"><legend class="flbl">' + lbl + "</legend>" + hint + '<div class="chooser">' + (f.choices || []).map(function (c) {
        return '<label><input type="radio" name="' + id + '" value="' + esc(c) + '" data-rf="' + esc(f.key) + '"' + (val === c ? " checked" : "") + desc + "><span>" + esc(c) + "</span></label>"; }).join("") + "</div></fieldset>";
    var common = ' class="fld' + (f.key === "lyrics" ? " lyrics" : "") + '" id="' + id + '" data-rf="' + esc(f.key) + '" maxlength="' + (f.max || 200) + '"' + desc;
    var input = f.kind === "text" ? "<textarea" + common + ' rows="' + (f.key === "lyrics" ? 10 : 4) + '">' + esc(val) + "</textarea>"
      : f.kind === "link" ? '<input type="url" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off" placeholder="https://"' + common + ' value="' + esc(val) + '">'
      : '<input type="text" autocomplete="off"' + common + ' value="' + esc(val) + '">';
    return '<div class="ff' + miss + (f.kind === "text" ? " wide" : "") + '" data-ff="' + esc(f.key) + '"><label class="flbl" for="' + id + '">' + lbl + "</label>" + hint + input + "</div>";
  }
  function dayNoteHtml() {
    var F = ui.form;
    if (F.status === "scheduled") return '<p class="dnote q">' + (F.date && F.date <= formBase().today ? "Out already." : "Already with the team. To move it, use Change the date on its card: that moves every open step and tells the team.") + "</p>";
    var today = formBase().today, dn = L.releaseDayNote(F.date, today);
    /* a day ahead: the team's advice (planAdvice: too close, another song too near, not a Friday,
       the holidays) instead of the older notes; a day gone: "already out" as before */
    var advice = dn.out || dn.bad ? dn.notes.map(function (n) { return { bad: dn.bad, text: n }; }) : L.planAdvice(F.date, today, board ? board.releases : [], { except: F.id });
    var sugg = board ? L.suggestDates(today, board.releases, { except: F.id }) : [];
    return (dn.line ? '<p class="dnote' + (dn.bad ? " bad" : "") + '">' + esc(dn.line) + "</p>" : "") +
      advice.map(function (a) { return '<p class="dnote' + (a.bad ? " bad" : " q") + '">' + esc(a.text) + "</p>"; }).join("") +
      (sugg.length && (!F.date || advice.some(function (a) { return a.bad; })) ? '<div class="pchips"><span class="pchips-l">' + (F.date ? "Better days:" : "Suggested days:") + "</span>" + sugg.map(function (x) {
        return '<button class="pchip' + (x.best ? " best" : "") + '" type="button" data-rf-act="pickdate" data-date="' + esc(x.date) + '">' + esc(x.words) + "<small>" + esc(x.weeks + " weeks" + (x.note ? " · holidays" : "")) + "</small></button>";
      }).join("") + "</div>" : "");
  }
  function drawForm() {
    var F = ui.form;
    if (!F) return;
    var sched = F.status === "scheduled", out = outNow(F), need = out ? "needed to record it" : "needed to send", miss = function (k) { return F.miss.indexOf(k) >= 0 ? " miss" : ""; };
    var h = '<h3 id="rfTitleH">' + (F.id ? (sched ? "Edit " : "Finish ") + esc(F.orig.title || F.title) : "New song") + "</h3>" +
      '<p class="rf-sub">' + (sched ? "It's already with the team: what you change here reaches every bot the next time it opens its day."
        : out ? "Already out: only “Whose release is it” is needed. Recording it keeps whose song it is, for Songs; there are no steps and nobody is told."
        : "Fill in what you have. Save it for later, or send it to the team once everything marked “needed to send” is in. The pitch details can wait.") + "</p>" +
      '<div class="ffrow"><div class="ff' + miss("title") + '" data-ff="title"><label class="flbl" for="rf-title">Title <span class="req">' + need + '</span></label><input class="fld" id="rf-title" data-rf="title" maxlength="120" autocomplete="off" value="' + esc(F.title) + '"></div>' +
      /* no lower limit (v2): a day that has passed records a song that is already out */
      '<div class="ff' + miss("date") + '" data-ff="date"><label class="flbl" for="rf-date">Release day <span class="req">' + need + '</span></label><input class="fld" type="date" id="rf-date" data-rf="date" value="' + esc(F.date) + '"' + (sched ? " disabled" : "") + ' aria-describedby="rfDay"><div id="rfDay" aria-live="polite">' + dayNoteHtml() + "</div></div></div>";
    L.formGroups(relFields()).forEach(function (g) {
      var body = g.fields.map(fieldHtml).join("") + (g.key === "later" && !F.later ? '<button class="linkbtn" type="button" data-rf-act="later">Change these yourself</button>' : "");
      /* "Whose release is it", the files and the store details are always open; the rest fold */
      if (g.key === "deal" || g.key === "files" || g.key === "stores") { h += '<section class="fgroup' + (g.key === "deal" ? " fdeal" : "") + '" data-fsec="' + g.key + '"><h4>' + esc(g.title) + '</h4><div class="fbody ffrow">' + body + "</div></section>"; return; }
      var n = g.fields.filter(function (f) { return F.vals[f.key]; }).length, want = g.fields.some(function (f) { return F.miss.indexOf(f.key) >= 0; });
      var open = F.open[g.key] != null ? F.open[g.key] : want || (g.key === "lyrics" && !!F.vals.lyrics);
      h += '<details class="fgroup" data-fg="' + g.key + '"' + (open || want ? " open" : "") + "><summary>" + esc(g.title) + '<span class="gs">' + n + " of " + g.fields.length + " filled</span></summary><div class=\"fbody\">" + body + "</div></details>";
    });
    $("relForm").innerHTML = h + '<div class="rf-foot" id="rfFoot"></div>';
    drawFoot();
  }
  function footKey() { return (board ? "b" : "") + (tried ? "t" : ""); }
  function drawFoot() {
    var F = ui.form, el = $("rfFoot");
    if (!F || !el) return;
    F.footFor = footKey();
    var sched = F.status === "scheduled", dis = HQ.sample || F.busy || !board ? " disabled" : "", out = outNow(F);
    var h = (F.err ? '<p class="ferr" role="alert">' + esc(F.err) + "</p>" : "") + (F.ok ? '<p class="fok" role="status">' + esc(F.ok) + "</p>" : "");
    if (F.anyway) /* refused with something missing (v2): fill it in, or send anyway (it stays on the card as a warning) */
      h += '<div class="confirm" role="group" aria-label="Send anyway?"><p>' + esc(L.missingSentence(F.anyway, true) + " What you typed is saved.") + '</p><div class="conn-acts"><button class="sendbtn" type="button" data-rf-act="anyway-yes"' + dis + ">" +
        (F.busy === "send" ? "Sending…" : out ? "Record it anyway" : "Send anyway") + '</button><button class="copybtn" type="button" data-rf-act="anyway-no"' + (F.busy ? " disabled" : "") + ">Not yet</button></div></div>";
    else if (F.ask) h += '<div class="confirm" role="group" aria-label="Confirm sending"><p>' + esc(L.sendQuestion(F.title, F.date, formBase().today)) + '</p><div class="conn-acts"><button class="sendbtn" type="button" data-rf-act="send-yes"' + dis + ">" + (F.busy === "send" ? "Sending…" : out ? "Yes, record it" : "Yes, send it") + '</button><button class="copybtn" type="button" data-rf-act="send-no"' + (F.busy ? " disabled" : "") + ">Not yet</button></div></div>";
    else h += '<div class="conn-acts">' + (sched ? "" : '<button class="sendbtn" type="button" data-rf-act="send"' + dis + ">" + (F.busy === "send" ? "Saving…" : esc(L.sendButton(F.date, formBase().today))) + "</button>") +
      '<button class="copybtn" type="button" data-rf-act="save"' + dis + ">" + (F.busy === "save" ? "Saving…" : sched ? "Save changes" : "Save for later") + "</button>" +
      '<button class="linkbtn" type="button" data-rf-act="close"' + (F.busy ? " disabled" : "") + ">Close</button></div>";
    if (HQ.sample) h += '<p class="fok" style="margin:12px 0 0">This is the sample: saving and sending are switched off here.</p>';
    else if (!board) h += '<p class="fok" role="status" style="margin:12px 0 0">' + (tried ? "Couldn't load the team's desk yet, so Save and Send wait for it. Try Refresh." : "Loading the team…") + "</p>";
    el.innerHTML = h;
  }
  function markMiss() {
    var F = ui.form;
    [].forEach.call($("relForm").querySelectorAll("[data-ff]"), function (el) { el.classList.toggle("miss", F.miss.indexOf(el.getAttribute("data-ff")) >= 0); });
    [].forEach.call($("relForm").querySelectorAll("details[data-fg]"), function (d) { if (d.querySelector(".miss")) d.open = true; });
  }
  function focusFirstMiss() {
    var el = $("relForm").querySelector(".miss input, .miss textarea");
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: "center" }); }
  }
  /* save (and, for Send, then check what's missing and ask before it goes) */
  function saveForm(thenSend) {
    var F = ui.form;
    if (!F || HQ.sample || F.busy || !board) return;
    F.title = F.title.trim(); F.ok = ""; F.err = ""; F.anyway = null;
    if (!F.title) { F.err = "Give the release its title first."; F.miss = ["title"]; drawFoot(); markMiss(); focusFirstMiss(); return; }
    var body = { title: F.title, pack: L.packChanges(relFields(), F.orig.vals, F.vals) };
    if (F.id) body.id = F.id;
    /* a release that went out keeps its date here ("Change the date" moves it and tells the team) */
    if (F.status !== "scheduled" && (!F.id || F.date !== F.orig.date)) body.date = F.date || "";
    F.busy = thenSend ? "send" : "save"; drawFoot();
    write("release", body).then(function (r) {
      F.busy = "";
      if (ui.form !== F) return;
      if (!r.ok) { F.err = r.error; drawFoot(); return; }
      var v = r.j.release;
      putRelease(v); forgetForm(F.id); /* the copy under its old key ("new" for a release just started) */
      F.id = v.id; F.status = v.status; F.orig = { title: v.title, date: v.date || "", vals: JSON.parse(JSON.stringify(F.vals)) };
      if (!thenSend) {
        ui.rel.note[v.id] = "Saved at " + hhmm(Date.now()) + "." + (v.status === "draft" ? " Not sent to the team yet." : "");
        closeForm(); drawReleases(); jumpTo(v.id); reload(); return;
      }
      var miss = (v.missing || []).filter(function (m) { return m.required; });
      drawReleases();
      if (miss.length) {
        F.miss = miss.map(function (m) { return m.key; });
        /* v2: "Send anyway" is offered, except without a release day (nothing could be dated) */
        if (L.canSendAnyway(miss)) { F.anyway = miss; F.err = ""; drawFoot(); markMiss(); var no = $("relForm").querySelector('[data-rf-act="anyway-no"]'); if (no) no.focus(); }
        else { F.err = L.missingSentence(miss) + " What you typed is saved."; drawFoot(); markMiss(); focusFirstMiss(); }
        return;
      }
      F.miss = []; F.ask = true; markMiss(); drawFoot();
      var y = $("relForm").querySelector('[data-rf-act="send-yes"]'); if (y) y.focus();
    });
  }
  /* anyway (v2): sent with what is still missing, which stays on the card as a warning */
  function sendForm(anyway) {
    var F = ui.form;
    if (!F || !F.id || HQ.sample || F.busy || !board) return;
    F.busy = "send"; drawFoot();
    write("release/send", anyway ? { id: F.id, anyway: true } : { id: F.id }).then(function (r) {
      F.busy = "";
      if (ui.form !== F) return;
      if (!r.ok) {
        var keys = r.j && Array.isArray(r.j.missing) ? r.j.missing : [];
        F.ask = false; F.miss = keys;
        var short = function (k) { var f = relFields().filter(function (x) { return x.key === k; })[0]; return { key: k, short: k === "date" ? "Release day" : f ? f.short || f.label : k, required: true }; };
        if (r.j && r.j.canSendAnyway && keys.length && !anyway) { F.anyway = keys.map(short); F.err = ""; } else { F.anyway = null; F.err = r.error; }
        drawFoot(); markMiss(); if (!F.anyway) focusFirstMiss();
        return;
      }
      putRelease(r.j.release);
      var id = r.j.release.id, note = L.sentNote(r.j, Date.now(), relFields());
      ui.rel.note[id] = note;
      closeForm(); drawReleases(); HQ.boardChanged();
      /* recorded as already out: it is in the "Out" line, not a card; say it at the top */
      if (r.j.alreadyOut) { $("relMsg").textContent = r.j.release.title + ": " + note; $("relMsg").scrollIntoView({ block: "center" }); } else jumpTo(id);
      reload();
    });
  }
  $("relNew").addEventListener("click", openNew);
  $("relForm").addEventListener("input", onFormInput);
  $("relForm").addEventListener("change", onFormInput);
  function onFormInput(ev) {
    var F = ui.form, el = ev.target, k = el.getAttribute && el.getAttribute("data-rf");
    if (!F || !k) return;
    if (el.type === "radio" && !el.checked) return;
    var wasOut = outNow(F);
    if (k === "title" || k === "date") F[k] = el.value; else F.vals[k] = el.value;
    if (k === "date") $("rfDay").innerHTML = dayNoteHtml();
    if (F.anyway) { F.anyway = null; drawFoot(); } /* changed after "Send anyway?": ask again with what's there now */
    /* the label and the split come and go with "With a label"; a day in the past (a song already out)
       changes what is needed: the form is drawn again, the caret kept where it was */
    if ((k === "kind" && ev.type === "change") || (k === "date" && wasOut !== outNow(F))) {
      drawForm(); markMiss();
      var back = $("relForm").querySelector(k === "kind" ? 'input[data-rf="kind"]:checked' : "#rf-date"); if (back) back.focus({ preventScroll: true });
    }
    if (F.miss.indexOf(k) >= 0 && String(el.value).trim()) { F.miss = F.miss.filter(function (x) { return x !== k; }); var w = el.closest("[data-ff]"); if (w) w.classList.remove("miss"); }
    if (F.ask) { F.ask = false; drawFoot(); } /* changed after "Send?": ask again with what's there now */
    keepForm();
  }
  $("relForm").addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-rf-act]");
    if (!b || !ui.form) return;
    var act = b.getAttribute("data-rf-act");
    if (act === "pickdate") {
      /* a suggested day (14 Nov 2026): set it, as if typed in the date field */
      var F = ui.form, d = b.getAttribute("data-date") || "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || F.status === "scheduled") return;
      F.date = d; var inp = $("rf-date"); if (inp) inp.value = d;
      if (F.miss.indexOf("date") >= 0) { F.miss = F.miss.filter(function (x) { return x !== "date"; }); markMiss(); }
      if (F.ask) { F.ask = false; drawFoot(); }
      $("rfDay").innerHTML = dayNoteHtml(); keepForm();
      if (inp) inp.focus({ preventScroll: true });
      return;
    }
    if (act === "later") { ui.form.later = true; ui.form.open.later = true; drawForm(); var i = $("relForm").querySelector('details[data-fg="later"] input'); if (i) i.focus(); }
    else if (act === "close") { var id = ui.form.id; closeForm(true); if (id) jumpTo(id); else $("relNew").focus(); }
    else if (act === "save") saveForm(false);
    else if (act === "send") saveForm(true);
    else if (act === "send-yes") sendForm(false);
    else if (act === "anyway-yes") sendForm(true);
    else if (act === "anyway-no") { ui.form.anyway = null; drawFoot(); focusFirstMiss(); }
    else if (act === "send-no") { ui.form.ask = false; drawFoot(); var s = $("relForm").querySelector('[data-rf-act="send"]'); if (s) s.focus(); }
  });
  $("relForm").addEventListener("submit", function (ev) { ev.preventDefault(); });

  /* Songs' "Add its details" (v2, 11 Nov 2026): o = { id, title, date }. id = the desk already has the
     song (recorded before whose release it was asked): its own form; else a new one with the title and
     the day filled in. Upcoming is opened first, so the form is where Luke can see it. */
  function addDetails(o) {
    o = o || {};
    if (location.hash.split("/")[0] !== "#releases") location.hash = "#releases";
    setTimeout(function () {
      if (!board) { $("relMsg").textContent = "The form needs the team's desk, which couldn't be loaded. Try Refresh."; return; }
      var id = o.id && relById[o.id] ? o.id : "";
      if (!id) { openForm("", { title: o.title, date: o.date }); return; }
      if (fullOf(relById[id])) { openForm(id); return; }
      loadFull(id).then(function (f) { if (f) openForm(id); });
    }, 80);
  }

  /* L12: one card per platform. The sentences come from HQLib.profileBlocks. Links only when https. */
  function shortUrl(u) {
    var s = String(u || "").replace(/^https:\/\//, "");
    return s.length > 72 ? s.slice(0, 69) + "…" : s;
  }
  /* Profiles v2 (21 Nov 2026, Luke): one line of counts, a strip with every platform's photo (coloured by
     what matters most), then one card per platform. Each image: a thumbnail, ONE state, one line, Answer /
     Open, and the size rule folded away. The words come from HQLib.profileBlocks / profileOverview. */
  function pImg(src) {
    return src ? '<img alt="" loading="lazy" referrerpolicy="no-referrer" data-pthumb src="' + esc(src) + '">' : "";
  }
  /* Profiles (21 Nov 2026, Luke): his two uploads on top; the strip (green = that platform uses his upload, red = an
     issue); one issue card per red platform, saying it plainly, with a reply that goes straight to that bot; then
     every platform folded away. Words from HQLib.profileBlocks / profileOverview. */
  var pfMsg = {};
  function masterPrev(boxId, kind, saved) {
    var box = $(boxId);
    if (!box || box.getAttribute("data-local")) return;
    if (!saved) { box.hidden = true; box.innerHTML = ""; return; }
    if (HQ.sample) { box.hidden = true; return; }
    var src = "/api/staff/profile-file/master-" + kind;
    box.hidden = false;
    if (!box.querySelector("img")) box.innerHTML = '<img alt="" data-pthumb src="' + esc(src) + '">' + (kind === "photo" ? '<i class="safe"></i>' : "");
  }
  function drawProfiles() {
    var el = $("profList");
    if (!el) return;
    if (!board || !board.profiles) { el.innerHTML = problem ? '<p class="empty2">' + esc(problem) + "</p>" : '<div class="ph big"></div>'; return; }
    var b = L.profileBlocks(board.profiles);
    var o = L.profileOverview(b);
    if ($("profSum")) $("profSum").textContent = o.line;
    if ($("profStrip")) $("profStrip").innerHTML = o.chips.map(function (c) {
      return '<a class="pf-chip pf-t-' + esc(c.tone) + '" href="' + esc(c.href) + '" aria-label="' + esc(c.platform) + '"><span class="pf-av">' + esc(c.initials) + pImg(c.thumb) + '</span><span class="pf-n">' + esc(c.label || c.platform) + "</span></a>";
    }).join("");
    var pv = board.profiles.masters || {};
    if ($("profPhotoLine")) $("profPhotoLine").textContent = b.masters && b.masters.photo ? b.masters.photo + ". Only scaled down, never cropped." : "Not uploaded yet. Only scaled down, never cropped.";
    if ($("profBannerLine")) $("profBannerLine").textContent = b.masters && b.masters.banner ? b.masters.banner + ". Another shape or size: its bot makes an AI version that looks exactly like yours." : "Not uploaded yet. Another shape or size: its bot makes an AI version that looks exactly like yours.";
    masterPrev("profPhotoPrev", "photo", !!pv.photo);
    masterPrev("profBannerPrev", "banner", !!pv.banner);
    var iss = $("profIssues");
    if (iss) {
      iss.innerHTML = o.issues.length ? o.issues.map(function (g) {
        var chip = o.chips.filter(function (c) { return c.id === g.platformId; })[0] || { initials: "" };
        var key = g.platformId;
        return '<article class="t-card pf-issue" id="profiles-issue-' + esc(key) + '"><header class="pf-head"><span class="pf-av pf-t-issue">' + esc(chip.initials) + pImg(chip.thumb) + "</span><div><h3>" + esc(g.platform) + '</h3><p class="secsub">' + esc(g.to) + " is on it</p></div></header>" +
          g.items.map(function (x) {
            var acts = (x.answer ? '<a class="go" href="' + esc(x.answer) + '">Answer</a>' : "") + (x.open && /^https:\/\//.test(x.open) ? outLink(x.open, "See the image") : "");
            return '<div class="pf-item"><p class="pf-state pf-t-issue"><i></i>' + esc(x.kind) + " · " + esc(x.label) + '</p><p class="pf-itext">' + esc(x.text) + "</p>" + (acts ? '<div class="pf-acts">' + acts + "</div>" : "") + "</div>";
          }).join("") +
          '<form class="pf-reply" data-pfreply="' + esc(key) + '" data-to="' + esc(g.to) + '" data-about="' + esc(g.items.map(function (x) { return g.platform + " " + String(x.kind || "").toLowerCase(); }).join(" and ")) + '">' +
          '<textarea name="t" maxlength="1200" placeholder="Reply to ' + esc(g.to) + '" aria-label="Reply to ' + esc(g.to) + '"></textarea>' +
          '<button type="submit" class="sendbtn"' + (HQ.sample ? " disabled" : "") + ">Send to " + esc(g.to) + '</button><p class="pf-msg" role="status">' + esc(pfMsg[key] || "") + "</p></form></article>";
      }).join("") : (o.counts.ok ? '<p class="pf-allgood">No issues. Every platform with an upload uses yours.</p>' : "");
    }
    el.innerHTML = b.platforms.map(function (p) {
      var chip = o.chips.filter(function (c) { return c.id === p.id; })[0] || { tone: "none", initials: "", thumb: "" };
      return '<article class="t-card pf-card" id="profiles-' + esc(p.id) + '"><header class="pf-head"><span class="pf-av pf-t-' + esc(chip.tone) + '">' + esc(chip.initials) + pImg(chip.thumb) + "</span><div><h3>" + esc(p.platform) + '</h3><p class="secsub">' + esc(p.ownerLine) + "</p></div></header>" +
        p.slots.map(function (s) {
          var st = s.state || { tone: "none", label: "", line: "" };
          var ratio = !s.circle && s.exactW > 0 && s.exactH > 0 ? ' style="aspect-ratio:' + Number(s.exactW) + " / " + Number(s.exactH) + '"' : "";
          var thumb = '<div class="pf-thumb ' + (s.circle ? "pf-round" : "pf-wide") + (s.thumb ? "" : " empty") + " pf-t-" + esc(st.tone) + '"' + (s.thumb ? ratio : "") + ">" + (s.thumb ? pImg(s.thumb) : s.circle ? "" : "<span>No image yet</span>") + "</div>";
          var size = s.exactW > 0 && s.exactH > 0 ? s.exactW + " × " + s.exactH : "";
          var rule = '<details class="pf-rule"><summary>Size rule</summary><p>' + esc(s.rule) + "</p></details>";
          return '<div class="pf-slot' + (s.circle ? "" : " wide") + '">' + thumb + '<div class="pf-info"><p class="pf-kind">' + esc(s.kind) + (size ? "<small>" + esc(size) + "</small>" : "") + "</p>" +
            '<p class="pf-state pf-t-' + esc(st.tone) + '"><i></i>' + esc(st.label) + "</p>" + (st.line ? '<p class="pf-line">' + esc(st.line) + "</p>" : "") + rule + "</div></div>";
        }).join("") + "</article>";
    }).join("");
  }
  /* a reply on an issue card goes straight to that platform's bot, as a message from Luke */
  document.addEventListener("submit", function (ev) {
    var f = ev.target && ev.target.closest && ev.target.closest("[data-pfreply]");
    if (!f) return;
    ev.preventDefault();
    if (HQ.sample) return;
    var key = f.getAttribute("data-pfreply"), to = f.getAttribute("data-to"), about = f.getAttribute("data-about");
    var box = f.querySelector("textarea"), btn = f.querySelector("button"), msg = f.querySelector(".pf-msg");
    var text = box ? String(box.value || "").trim() : "";
    if (text.length < 2) { if (msg) msg.textContent = "Write the reply first."; return; }
    btn.disabled = true; btn.textContent = "Sending…";
    write("message", { to: to, text: "About the " + about + ": " + text, needs: "none" }).then(function (r) {
      btn.disabled = false; btn.textContent = "Send to " + to;
      if (!r.ok) { if (msg) msg.textContent = r.error || "That didn't send. Your text is still here."; return; }
      box.value = "";
      pfMsg[key] = "Sent to " + to + ".";
      if (msg) msg.textContent = pfMsg[key];
    });
  });
  /* a thumbnail that won't load (an expired platform link, a file not stored yet) becomes a plain tile */
  document.addEventListener("error", function (ev) {
    var t = ev.target;
    if (!t || t.tagName !== "IMG" || !t.hasAttribute("data-pthumb")) return;
    var box = t.parentNode;
    t.parentNode.removeChild(t);
    if (box && box.classList && box.classList.contains("pf-thumb")) { box.classList.add("empty"); box.removeAttribute("style"); if (box.classList.contains("pf-wide") && !box.textContent) box.innerHTML = "<span>Preview not available</span>"; }
  }, true);

  /* Luke's master upload. The sized copies are drawn here, in the browser, and only scaled down. */
  var profBusy = false;
  function profSay(id, text) { var n = $(id); if (n) n.textContent = text || ""; }
  function loadImage(file) {
    return new Promise(function (ok, bad) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); ok(img); };
      img.onerror = function () { URL.revokeObjectURL(url); bad(new Error("unreadable")); };
      img.src = url;
    });
  }
  function canvasJpeg(img, w, h, q) {
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var g = c.getContext("2d");
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, w, h);
    return new Promise(function (ok) { c.toBlob(function (b) { ok(b); }, "image/jpeg", q); });
  }
  function blobB64(blob) {
    return new Promise(function (ok, bad) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).split(",")[1] || ""); };
      r.onerror = function () { bad(r.error); };
      r.readAsDataURL(blob);
    });
  }
  function postPic(url, body, onProg) {
    return new Promise(function (ok, bad) {
      var x = new XMLHttpRequest();
      x.open("POST", url);
      x.withCredentials = true;
      x.setRequestHeader("Content-Type", "application/json");
      x.upload.onprogress = function (e) { if (e.lengthComputable && onProg) onProg(e.loaded / e.total); };
      x.onload = function () { var j = {}; try { j = JSON.parse(x.responseText); } catch (e) {} ok({ s: x.status, j: j }); };
      x.onerror = function () { bad(new Error("network")); };
      x.send(JSON.stringify(body));
    });
  }
  function showLocal(boxId, img, circle) {
    var box = $(boxId);
    if (!box) return;
    box.hidden = false;
    box.setAttribute("data-local", "1"); /* the picture just chosen stays until the page reloads */
    box.className = "profprev" + (circle ? " circle" : " banner");
    box.innerHTML = "";
    var el = document.createElement("img");
    el.alt = "";
    var c = document.createElement("canvas");
    var edge = Math.max(img.naturalWidth, img.naturalHeight) || 1;
    var scale = Math.min(1, 480 / edge);
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    var g = c.getContext("2d");
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, c.width, c.height);
    el.src = c.toDataURL("image/jpeg", 0.8);
    box.appendChild(el);
    if (circle) { var i = document.createElement("i"); i.className = "safe"; box.appendChild(i); }
  }
  async function sizedCopy(img, w, h, mb) {
    var cap = Math.min(mb || 4, 3.6) * 1024 * 1024;
    var qs = [0.92, 0.85, 0.75, 0.6];
    var blob = null;
    for (var i = 0; i < qs.length; i++) {
      blob = await canvasJpeg(img, w, h, qs[i]);
      if (blob && blob.size <= cap) return blob;
    }
    return blob && blob.size <= cap ? blob : null;
  }
  async function takeMaster(kind, input) {
    var prog = kind === "photo" ? "profPhotoProg" : "profBannerProg";
    var box = kind === "photo" ? "profPhotoPrev" : "profBannerPrev";
    var file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    if (HQ.sample) { profSay(prog, "This is the sample. Uploads are switched off."); return; }
    if (profBusy) { profSay(prog, "Still working on the last picture."); return; }
    profBusy = true;
    try {
      profSay(prog, "Reading the picture…");
      var img = await loadImage(file);
      if (!img.naturalWidth || !img.naturalHeight) throw new Error("unreadable");
      showLocal(box, img, kind === "photo");
      var edge = Math.max(img.naturalWidth, img.naturalHeight);
      var scale = Math.min(1, 3000 / edge);
      var mw = Math.max(1, Math.round(img.naturalWidth * scale));
      var mh = Math.max(1, Math.round(img.naturalHeight * scale));
      profSay(prog, "Preparing the master…");
      var master = null, q, qualities = [0.92, 0.85, 0.75, 0.62];
      for (q = 0; q < qualities.length; q++) {
        master = await canvasJpeg(img, mw, mh, qualities[q]);
        if (master && master.size <= 3.6 * 1024 * 1024) break;
      }
      if (!master || master.size > 3.6 * 1024 * 1024) throw new Error("large");
      profSay(prog, "Uploading… 0%");
      var up = await postPic("/api/staff/profile-master", { kind: kind, image_base64: await blobB64(master) }, function (p) {
        profSay(prog, "Uploading… " + Math.round(p * 100) + "%");
      });
      if (up.s !== 200) throw new Error((up.j && up.j.error) || "The master was not saved.");
      var slots = (up.j && up.j.slots) || [];
      var made = 0, skipped = 0;
      for (var i = 0; i < slots.length; i++) {
        var s = slots[i];
        if (!s.fit || !s.out) { skipped++; continue; }
        profSay(prog, "Making the " + s.platform + " " + String(s.kind || "").toLowerCase() + "…");
        var copy = await sizedCopy(img, s.out[0], s.out[1], s.mb);
        if (!copy) { profSay(prog, s.platform + " came out over the size limit. The others still go through."); continue; }
        var saved = await postPic("/api/staff/profile-version", { slot: s.id, image_base64: await blobB64(copy) }, function (p) {
          profSay(prog, s.platform + "… " + Math.round(p * 100) + "%");
        });
        if (saved.s !== 200) throw new Error((saved.j && saved.j.error) || ("Could not save " + s.platform));
        made++;
      }
      profSay(prog, made ? "Saved. " + made + " sized " + (made === 1 ? "copy is" : "copies are") + " ready." + (skipped ? " " + skipped + " need a new shape, and nothing was cropped." : "") : "Saved. Nothing was cropped. The platforms that need a different shape are marked below.");
      await reload(true);
    } catch (e) {
      profSay(prog, e && e.message === "unreadable" ? "That file could not be read. Use a JPG or PNG from your camera roll." : e && e.message === "large" ? "That picture is too big to send from this phone. Try a smaller one." : e && e.message === "network" ? "The upload did not finish. Try again." : (e && e.message) || "That picture was not saved.");
    }
    profBusy = false;
  }
  function bindProfiles() {
    var photo = $("profPhoto"), banner = $("profBanner");
    if (photo) photo.addEventListener("change", function () { takeMaster("photo", photo); });
    if (banner) banner.addEventListener("change", function () { takeMaster("banner", banner); });
  }
  bindProfiles();

  window.HQStaff = { reload: reload, clear: clear, drawWorkers: drawWorkers, drawReleases: drawReleases, addDetails: addDetails, board: function () { return board; }, problem: function () { return problem; } };
})();
