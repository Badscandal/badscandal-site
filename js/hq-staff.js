/* BADSCANDAL HQ · the staff desk on the page (11 Nov 2026). One answer, /api/staff/board (same login
   cookie as everything else; netlify/functions/staff.mjs), drawn in three places:
     Team      the connector strip, ONE card per bot on the roster (also the ones with no duty today),
               the live log
     Messages  what waits on Luke, a box to write, the whole board as threads
     Money     "Money coming in": accounts checked, this month, every source, the latest payments
   Every rule and every sentence is in js/hq-lib.js (tested); this file
   only draws and sends.

     Releases  (11 Nov 2026) the release pipeline: a card per release on the desk with its files and
               details and every bot's step, the form to start / finish / send one
   Today's "Needs attention", the site-check line and Data health read the same answer through
   js/hq.js (HQ.boardChanged).

   THE ONLY WRITES ON /hq ARE HERE: Luke's own messages (send, answer, mark as done), the bots' key
   switch, and (11 Nov 2026) the release pipeline: save / send / move / cancel a release and mark a
   step. Nothing here can touch an ad, a post, the sheet or any money. In /hq?sample=1 nothing is
   sent at all and the page says so.

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
    return { reply: "", ask: null, drafts: {}, err: {}, busy: "", open: {}, why: {}, payAll: false, allThreads: false, keyAsk: false, keyErr: "", keyBusy: false,
      /* replies that visibly land (11 Nov 2026): what Luke just answered (id -> the line in its place)
         and the line under a thread he answered on the board */
      landed: {}, tsent: {},
      /* the release pipeline: busy / error / the inline question per card, notes, open disclosures, the form */
      rel: { busy: "", err: {}, ask: null, note: {}, open: {}, fold: {}, full: {}, loading: {} }, form: null,
      /* In Spotify for Artists (v2): the question being answered, the label typed, what was answered */
      spot: { k: "", answer: "", label: "", busy: "", err: {}, done: {} },
      /* Revolut (11 Nov 2026): the tile's button in flight, its inline "Disconnect?", the last error and
         what the last "Read now" brought; the payment being sorted, errors per payment, and what was
         sorted (id -> the line in its place, kept 10 minutes like an answered message) */
      bank: { busy: "", ask: false, err: "", done: "" }, sort: { id: "", kind: "", cat: "", stmt: false, busy: false }, sortErr: {}, sorted: {} };
  }
  var PEOPLE = ["Luke", "Claude", "HQ", "all"];
  var KEEP_MS = 10 * 60000; /* how long "Sent to Nova at 17:03" stays in the place of what was answered */
  var safe = function (s) { return String(s == null ? "" : s).replace(/[^a-z0-9]/gi, ""); };
  var cap = function (s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); };

  /* ---------- loading: with the other answers, on start and on every refresh ---------- */
  /* the desk's board and Revolut's state, side by side: either may fail without the other */
  /* fresh (after a write: a sort, a Read now): never reuse an answer asked for BEFORE the write was
     saved; wait for it, then ask again */
  /* the fields are asked once (they don't change); a New release waiting for them opens as soon as they land */
  function reload(fresh) { if (!fields) loadFields().then(pendingNew, pendingNew); return Promise.all([reloadBoard(fresh), loadBank(fresh)]); }
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
    bank = null; bankProblem = ""; bankTried = false; bankFlagNow = null;
    $("msgText").value = ""; counter(); $("msgErr").textContent = ""; $("msgOk").textContent = "";
    $("waitList").innerHTML = $("threadList").innerHTML = $("dutyList").innerHTML = $("incomeBody").innerHTML = '<div class="ph"></div>';
    $("answeredList").innerHTML = ""; $("answeredCard").hidden = true;
    $("relForm").hidden = true; $("relForm").innerHTML = ""; $("relDesk").innerHTML = $("relOut").innerHTML = $("relPipe").innerHTML = $("relSpot").innerHTML = ""; $("relMsg").textContent = "";
    draw();
  }
  function draw() {
    drawWorkers(); drawMessages(); drawIncome(); drawBadges(); drawReleases();
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
    el.innerHTML = '<p class="conn-line"><b class="' + (c.on ? "" : "off") + '">' + esc(c.head) + "</b> · " + esc(c.rest) + "</p>" +
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
    if (w.blockers) why.push("<p><b>Known blockers</b>" + esc(w.blockers) + "</p>");
    return ((w.duties || []).length ? '<p class="bsub">Today\'s duties</p><ul class="bduties">' + w.duties.map(function (d) {
        return '<li class="' + (d.status === "blocked" || d.late ? "bad" : d.status === "done" ? "done" : "") + '"><span class="bt">' + esc(d.task) + (d.blocker ? "<small>Blocked: " + esc(d.blocker) + "</small>" : "") +
          '</span><span class="bw">' + esc(L.dutyWhen(d)) + "</span></li>"; }).join("") + "</ul>" : "") +
      relSteps(w) +
      (w.last ? '<p class="blast"><b>' + esc(lastMs ? L.ago(now - lastMs) : w.last.at) + "</b> " + HQ.link(w.last.link, w.last.message) + "</p>" : "") +
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
    return '<details class="botrow" id="team-' + esc(id) + '" data-why="' + esc(id) + '"' + (ui.why[id] ? " open" : "") + '><summary><span class="bdot ' + w.state + '" aria-hidden="true"></span>' + head(w) +
      '<span class="bl">' + esc(L.botNext(w, board.today)) + '</span><span class="bstate ' + w.state + '">' + esc(L.workerLabel(w.state)) + '</span></summary><div class="browbody">' + botDetail(w) + "</div></details>";
  }
  /* a bot's open release steps, under its duties: the same words as the release card */
  function relSteps(w) {
    var list = w.releaseSteps || [];
    if (!list.length) return "";
    return '<p class="bsub">Release steps</p><ul class="bduties">' + list.map(function (s) {
      var st = L.stepState(s, board.today), blocked = s.status === "blocked";
      return '<li class="' + (st.bad ? "bad" : "") + '"><span class="bt">' + esc(s.label) + '<small>' + esc(s.title) + (s.due ? " · due " + esc(L.day(s.due)) : "") + "</small>" +
        (blocked && s.note ? "<small>Blocked: " + esc(s.note) + "</small>" : "") + '</span><span class="bw">' + esc(blocked ? "blocked" : st.text) + "</span></li>";
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
        : '<p class="allgood">Nobody is stuck right now.</p>') +
      (g.quiet.length ? '<h3 class="lblh">Haven\'t checked in today</h3><div class="botlist">' + g.quiet.map(botRow).join("") + "</div>" : "") +
      (g.onTrack.length ? '<h3 class="lblh">On track</h3><div class="botlist">' + g.onTrack.map(botRow).join("") + "</div>" : "");
    HQ.drawFeed(L.liveFeed(board, sheet), board.today);
    return true;
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
  function when(m) { var at = Date.parse(m.at), w = L.spWhen(m.sp, board.today), a = isFinite(at) ? L.ago(Date.now() - at) : ""; return w + (w && a ? " · " : "") + a; }
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
        ? '<div class="confirm" role="group" aria-label="Confirm your answer"><p>Answer “' + esc(m.options[ui.ask.i]) + "”? " + esc(m.from) + ' will see it, and this is marked as done.</p><div class="conn-acts"><button class="sendbtn" type="button" data-act="opt-yes" data-k="' + esc(k) + '"' + dis + ">" +
          (busy ? "Sending…" : "Send this answer") + '</button><button class="copybtn" type="button" data-act="opt-no" data-k="' + esc(k) + '"' + dis + ">Cancel</button></div></div>"
        : '<div class="mopts">' + m.options.map(function (o, i) { return '<button class="copybtn" type="button" data-act="opt" data-k="' + esc(k) + '" data-i="' + i + '"' + dis + ">" + esc(o) + "</button>"; }).join("") + "</div>";
    }
    return '<article class="wmsg" id="wait-' + esc(safe(m.id)) + '"><p class="mhead"><span><b>' + esc(m.from) + "</b> " + esc(L.needWords(m)) + '</span><span class="mtime">' + esc(when(m)) + "</span></p>" + about +
      '<p class="mtext">' + esc(m.text) + "</p>" + opts +
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
    return '<p class="mhead"><span><b>' + esc(m.from) + '</b> <span class="arrow">→</span> <b>' + esc(m.to === "all" ? "Everyone" : m.to) + '</b></span><span class="mtime">' + esc(when(m)) + "</span>" +
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
    return '<article class="t-card thread" id="messages-' + esc(id) + '">' + head(th) + '<p class="mtext">' + esc(th.text) + "</p>" +
      ((th.options || []).length ? '<p class="mabout">Choices: ' + esc(th.options.join(" · ")) + "</p>" : "") +
      ((th.replies || []).length ? '<ul class="treplies">' + th.replies.map(function (r) { return "<li>" + head(r) + '<p class="mtext">' + esc(r.text) + "</p></li>"; }).join("") + "</ul>" : "") +
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
    $("threadList").innerHTML = (all.length ? list.map(thread).join("") : '<p class="empty2">No messages yet. They show up here when a bot, Claude or you write one.</p>') +
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
  function answer(m, text, note) {
    return write("message", { to: m.from === "Luke" ? m.to : m.from, text: text, needs: "none", re: m.id, note: note || "" });
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
  $("msgRetry").addEventListener("click", function () { reload(); });

  /* ================= Money coming in ================= */
  function amountLines(o, none) {
    var list = L.curList(o);
    return list.length ? list.map(function (x) { return '<p class="amt num">' + esc(x) + "</p>"; }).join("") : '<p class="amt none">' + esc(none) + "</p>";
  }
  function drawIncome() {
    var el = $("incomeBody");
    if (!board) {
      el.innerHTML = '<div class="acct">' + bankTile() + "</div>" + (tried ? '<div class="tile mfail"><p>Couldn\'t load the money coming in.</p><button class="sendbtn" type="button" data-retry>Retry</button></div>' : '<div class="ph big"></div><div class="ph"></div>');
      return;
    }
    var inc = board.income || {}, today = board.today, sources = inc.sources || [], entries = inc.entries || [];
    /* the desk's own "Revolut" account tile gives way to the reader's tile (one tile per account) */
    var accounts = (inc.accounts || []).filter(function (a) { return !/^revolut$/i.test(String(a.name || "").trim()); });
    if (L.incomeEmpty(inc) && !accounts.length) {
      el.innerHTML = '<div class="acct">' + bankTile() + '</div><div class="tile"><p class="empty2">Nothing has been submitted yet. This fills in when Ledger starts submitting payments through the connector.</p></div>';
      return;
    }
    var month = inc.month ? new Date(inc.month + "-15T12:00:00Z").toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" }) : "this month";
    var probs = L.incomeProblems(inc), h = "";
    h += '<div class="acct">' + bankTile() + accounts.map(function (a) {
      var l = L.accountLine(a, today);
      return '<div class="tile' + (l.attn ? " attn-t" : "") + '"><p class="an">' + esc(a.name) + '</p><p class="al">' + esc(cap(l.text)) + "</p>" + (a.needsLuke ? '<p class="al need">Needs you: ' + esc(a.needsLuke) + "</p>" : "") + "</div>";
    }).join("") + "</div>";
    h += '<div class="inmonth"><div class="tile"><p class="t-lbl">Received in ' + esc(month) + "</p>" + amountLines(inc.received, "Nothing yet") + '</div><div class="tile"><p class="t-lbl">Pending</p>' + amountLines(inc.pending, "Nothing pending") + "</div></div>";
    h += toSortHtml(inc);
    if (probs.length) h += '<div class="t-card attn-card has"><p class="t-lbl">To look at</p><ul class="inprob">' + probs.map(function (p) { return "<li><span>" + esc(p) + "</span></li>"; }).join("") + "</ul></div>";
    h += '<h4 class="lblh">Where money comes from</h4><div class="tile"><div class="scroll"><table class="stack" id="srcTable">' +
      (sources.length ? "<tr><th>Source</th><th>Type</th><th>Usually paid</th><th>Last payment</th><th>This month</th><th>State</th></tr>" + sources.map(function (s) {
        var st = L.sourceState(s), mt = L.curList(s.monthTotal);
        return "<tr><td><b>" + esc(s.name) + "</b></td><td>" + esc(s.category || "–") + "</td><td>" + esc(L.cadenceWord(s.cadence)) + "</td><td>" + esc(cap(L.payLine(s.last))) + "</td><td>" + esc(mt.length ? mt.join(" + ") : "Nothing yet") +
          "</td><td>" + (st.attn ? '<span class="attn">' + esc(st.text) + "</span>" : esc(st.text)) + (s.needsLuke ? '<small class="need">Needs you: ' + esc(s.needsLuke) + "</small>" : "") + "</td></tr>";
      }).join("") : '<tr><td class="empty">No sources are on the list yet.</td></tr>') + "</table></div></div>";
    /* transfers and payments still to sort say so in words, their amount greyed: never in the totals */
    var rows = entries.slice(0, ui.payAll ? 60 : 15), stat = function (e) { return L.payStatus(e).text; }, nc = function (e) { return L.payStatus(e).counted ? "" : " nc"; };
    h += '<h4 class="lblh">Latest payments</h4><div class="tile">' + (!rows.length ? '<p class="empty2">No payments have been submitted yet.</p>'
      : '<div class="scroll paywide"><table id="payTable"><tr><th>Date</th><th>Payer</th><th class="r">Amount</th><th>Status</th><th>Account</th><th>Logged by</th></tr>' + rows.map(function (e) {
        return "<tr><td>" + esc(L.day(e.date)) + "</td><td><b>" + esc(e.payer) + "</b>" + (e.note ? "<small>" + esc(e.note) + "</small>" : "") + '</td><td class="r' + nc(e) + '"><b>' + esc(L.money(e.amount, e.currency)) + "</b></td><td>" +
          esc(stat(e)) + "</td><td>" + esc(e.account || "–") + "</td><td>" + esc(e.by || "–") + "</td></tr>";
      }).join("") + '</table></div><ul class="paylist">' + rows.map(function (e) {
        return "<li><b>" + esc(e.payer) + '</b><span class="pa' + nc(e) + '">' + esc(L.money(e.amount, e.currency)) + '</span><span class="pm">' + esc([L.day(e.date), e.account, e.by ? "by " + e.by : ""].filter(Boolean).join(" · ")) +
          '</span><span class="ps">' + esc(stat(e)) + "</span>" + (e.note ? '<span class="pn">' + esc(e.note) + "</span>" : "") + "</li>";
      }).join("") + "</ul>") +
      (entries.length > rows.length ? '<button class="copybtn more-row" type="button" data-pay-more>Show more (' + (Math.min(60, entries.length) - rows.length) + ")</button>" : "") + "</div>";
    /* a redraw (the 5-minute refresh, the answer to a sort) must not lose where Luke is: focus goes
       back to the same control, or to the line that took a sorted payment's place */
    var act = document.activeElement, keep = act && el.contains(act) ? (act.id ? "#" + act.id : act.getAttribute("data-sort") ? '[data-sort="' + act.getAttribute("data-sort") + '"][data-id="' + safe(act.getAttribute("data-id")) + '"]' + (act.getAttribute("data-cat") ? '[data-cat="' + act.getAttribute("data-cat").replace(/[^a-z -]/gi, "") + '"]' : "")
      : act.getAttribute("data-bank") ? '[data-bank="' + act.getAttribute("data-bank") + '"]' : "") : "";
    el.innerHTML = h;
    HQ.stack("srcTable");
    if (keep) { var back = el.querySelector(keep); if (back) back.focus({ preventScroll: true }); }
  }
  $("incomeBody").addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-retry")) reload();
    if (b.hasAttribute("data-pay-more")) { ui.payAll = true; drawIncome(); }
    if (b.hasAttribute("data-bank")) bankClick(b.getAttribute("data-bank"));
    if (b.hasAttribute("data-sort")) sortClick(b.getAttribute("data-sort"), b.getAttribute("data-id") || "", b.getAttribute("data-cat") || "");
  });

  /* ================= Revolut: the bank reader (11 Nov 2026) =================
     GET /api/bank/status, asked with the board and refreshed with it (a failure never breaks the page:
     the tile says so and the rest of Money is drawn as usual). Buttons: Connect Revolut / Approve again
     (POST /api/bank/connect, then the browser goes to Revolut's approval page), Read now (POST
     /api/bank/sync), Disconnect (POST /api/bank/disconnect, behind an inline question). Nothing here can
     move money: the reader is read-only. In ?sample=1 the state is made up and every button is off. */
  var bank = null, bankProblem = "", bankTried = false, bankLoading = null;
  /* the bank sends Luke back to /hq?bank=connected|failed|device#money: say it once, then take the flag
     out of the address so a refresh doesn't say it (or read) again */
  var bankFlagNow = (function () {
    var f = L.bankFlag(location.search);
    if (f.had) { try { history.replaceState(history.state, "", location.pathname + f.search + location.hash); } catch (e) {} }
    return f.kind ? { kind: f.kind, line: f.line, auto: f.kind === "connected" } : null;
  })();
  function loadBank(fresh) {
    if (bankLoading) return fresh ? bankLoading.then(function () { return loadBank(); }) : bankLoading;
    bankLoading = HQ.getJSON("/api/bank/status" + (HQ.sample ? "?sample=1" : "")).then(function (res) {
      bankLoading = null; bankTried = true;
      if (HQ.authFail(res)) return;
      if (res.s === 200 && res.j && typeof res.j.configured === "boolean") { bank = res.j; bankProblem = ""; }
      else bankProblem = "Couldn't be read (" + res.s + ")";
      /* "connected" is said only while Revolut is connected, and reads at once only right after a real
         Connect (an old link or bookmark to /hq?bank=connected does neither) */
      var after = bank ? L.bankFlagAfter(bankFlagNow, bank, Date.now()) : { flag: bankFlagNow, sync: false };
      bankFlagNow = after.flag;
      drawIncome(); HQ.boardChanged();
      if (after.sync && !HQ.sample) bankSync();
    }, function () { bankLoading = null; bankTried = true; bankProblem = "No connection"; drawIncome(); HQ.boardChanged(); });
    return bankLoading;
  }
  function bankPost(path) {
    if (HQ.sample) return Promise.resolve({ ok: false, error: "This is the sample: nothing is sent." });
    return HQ.postJSON("/api/bank/" + path, {}).then(function (res) {
      if (HQ.authFail(res)) return { ok: false, error: "You were logged out. Log in and try again." };
      if (res.s === 200 && res.j) return { ok: true, j: res.j };
      return { ok: false, kind: (res.j && typeof res.j.kind === "string" && res.j.kind) || "", error: (res.j && typeof res.j.error === "string" && res.j.error) || "That didn't work (" + res.s + "). Try again." };
    }, function () { return { ok: false, error: "No connection. Nothing was sent: try again." }; });
  }
  function bankFocus(sel) { var el = $("incomeBody").querySelector(sel); if (el) el.focus(); }
  function bankSync() {
    if (ui.bank.busy) return;
    ui.bank.busy = "sync"; ui.bank.err = ""; ui.bank.done = ""; ui.bank.ask = false; drawIncome();
    bankPost("sync").then(function (r) {
      ui.bank.busy = "";
      var w = r.ok ? L.syncWords(r.j, Date.now()) : { ok: false, text: r.error };
      if (w.ok) ui.bank.done = w.text; else ui.bank.err = w.text;
      if (bankFlagNow && bankFlagNow.kind === "connected") bankFlagNow = null; /* "the first read is running" has its answer */
      drawIncome();
      reload(true); /* what came in: the list to sort, the totals, the tile's line */
    });
  }
  function bankConnect() {
    if (ui.bank.busy) return;
    ui.bank.busy = "connect"; ui.bank.err = ""; ui.bank.done = ""; bankFlagNow = null; drawIncome();
    bankPost("connect").then(function (r) {
      var to = r.ok && r.j && typeof r.j.url === "string" && /^https:\/\//.test(r.j.url) ? r.j.url : "";
      if (!to) { ui.bank.busy = ""; ui.bank.err = r.ok ? "Revolut's approval page didn't come back. Try again." : L.bankSays(r.kind, r.error); drawIncome(); return; }
      location.assign(to); /* Revolut asks Luke to approve read-only access, then sends him back here */
    });
  }
  /* Back from Revolut's page without approving: a browser that restores the page as it was would keep
     every Revolut button greyed out on "Opening Revolut…" */
  window.addEventListener("pageshow", function (ev) { if (ev.persisted && ui.bank.busy === "connect") { ui.bank.busy = ""; drawIncome(); } });
  function bankClick(act) {
    if (act === "retry") { loadBank(); return; }
    if (HQ.sample || !bank || ui.bank.busy) return;
    if (act === "sync") bankSync();
    else if (act === "connect" || act === "approve") bankConnect();
    else if (act === "disconnect") { ui.bank.ask = true; ui.bank.err = ""; drawIncome(); bankFocus('[data-bank="disc-no"]'); }
    else if (act === "disc-no") { ui.bank.ask = false; drawIncome(); bankFocus('[data-bank="disconnect"]'); }
    else if (act === "disc-yes") {
      ui.bank.busy = "disconnect"; drawIncome();
      bankPost("disconnect").then(function (r) {
        ui.bank.busy = "";
        if (!r.ok) { ui.bank.err = r.error; drawIncome(); return; }
        ui.bank.ask = false; ui.bank.done = "Disconnected at " + hhmm(Date.now()) + ". The payments already read stay here.";
        loadBank(true);
      });
    }
  }
  /* the tile among the account tiles */
  function bankTile() {
    var head = '<p class="an">Revolut</p>';
    if (!bank) {
      if (!bankTried) return '<div class="tile bank" id="bankTile">' + head + '<div class="ph"></div></div>';
      return '<div class="tile bank" id="bankTile">' + head + '<p class="al">Couldn\'t read Revolut\'s state just now. The rest of Money is fine.</p>' +
        '<div class="conn-acts"><button class="copybtn" type="button" data-bank="retry">Try again</button></div></div>';
    }
    var v = L.bankView(bank, Date.now()), b = ui.bank, dis = HQ.sample || b.busy ? " disabled" : "";
    var BUSY = { sync: "Reading…", connect: "Opening Revolut…", approve: "Opening Revolut…" };
    var acts = b.ask
      ? '<div class="confirm" role="group" aria-label="Disconnect Revolut"><p>Disconnect Revolut? The site stops reading it and gives the approval back. The payments already read stay here.</p>' +
        '<div class="conn-acts"><button class="sendbtn" type="button" data-bank="disc-yes"' + dis + ">" + (b.busy === "disconnect" ? "Disconnecting…" : "Yes, disconnect") + "</button>" +
        '<button class="copybtn" type="button" data-bank="disc-no"' + (b.busy ? " disabled" : "") + ">Keep it</button></div></div>"
      : v.buttons.length ? '<div class="conn-acts">' + v.buttons.map(function (k, i) {
        var busyNow = b.busy === k || (b.busy === "connect" && k === "approve");
        return '<button class="' + (k === "disconnect" ? "linkbtn" : i === 0 ? "sendbtn" : "copybtn") + '" type="button" data-bank="' + k + '"' + dis + ">" + esc(busyNow ? BUSY[k] || "Saving…" : L.bankButton(k)) + "</button>";
      }).join("") + "</div>" : "";
    var flag = bankFlagNow ? '<p class="rdone' + (bankFlagNow.kind === "connected" ? "" : " bad") + '" role="status">' + esc(bankFlagNow.line) + "</p>" : "";
    /* the tile is headed "Revolut" already: its line starts "Read today at 06:50 · …" */
    return '<div class="tile bank' + (v.attn ? " attn-t" : "") + '" id="bankTile">' + head + '<p class="al">' + esc(cap(v.line.replace(/^Revolut: /, ""))) + "</p>" +
      (v.error ? '<p class="al">' + esc(v.error) + "</p>" : "") +
      (bankProblem ? '<p class="al">Couldn\'t check again just now: this is what was read before.</p>' : "") +
      (v.accounts.length ? '<p class="al bacc">Reads ' + esc(v.accounts.join(", ")) + ". Read only: it can never move money.</p>" : "") +
      flag + (b.done ? '<p class="rdone" role="status">' + esc(b.done) + "</p>" : "") + acts +
      (v.note ? '<p class="al">' + esc(v.note) + "</p>" : "") + '<p class="ferr" role="alert">' + esc(b.err) + "</p>" +
      (HQ.sample && v.buttons.length ? '<p class="fok bnote">Sample: these buttons do nothing here.</p>' : "") + "</div>";
  }

  /* "To sort": in the account, nobody has said what it is yet, so it counts as nothing. "It's income"
     asks the kind of income, "Not income" asks once; then POST /api/staff/sort and the payment leaves
     the list, a line taking its place ("Sorted as income (Production)"), and the totals are read again. */
  function sortedNow() { return Object.keys(ui.sorted).map(function (k) { return ui.sorted[k]; }).filter(function (x) { return Date.now() - x.at < KEEP_MS; }); }
  function toSortHtml(inc) {
    var all = inc.unsorted || [], left = all.filter(function (e) { return !ui.sorted[e.id]; }), stubs = sortedNow();
    var n = Math.max(0, (inc.unsortedCount || all.length) - (all.length - left.length));
    if (!n && !stubs.length) return "";
    var rows = stubs.map(function (x) { return '<li class="landed" role="status" tabindex="-1" id="sort-' + esc(safe(x.id)) + '"><span>' + esc(x.line) + '<span class="lsub">' + esc(x.sub) + "</span></span></li>"; })
      .concat(left.map(sortRow));
    return '<section class="tile tosort" aria-labelledby="toSortH"><h4 class="t-lbl" id="toSortH">To sort' + (n ? " · " + n : "") + "</h4>" +
      '<p class="tsub">In the account, and nobody has said what it is yet. It counts as nothing until it is sorted.</p>' +
      (HQ.sample ? '<p class="mnote">This is the sample: sorting is switched off here.</p>' : "") +
      '<ul class="sortlist">' + rows.join("") + "</ul>" +
      (n > left.length ? '<p class="tsub">Showing the newest ' + left.length + " of " + n + ". Sort these and the next ones show.</p>" : !left.length ? '<p class="tsub">Nothing left to sort.</p>' : "") + "</section>";
  }
  function sortRow(e) {
    var s = ui.sort.id === e.id ? ui.sort : null, busy = !!(s && s.busy), dis = HQ.sample || busy ? " disabled" : "", id = esc(e.id);
    /* the money of a statement already logged as pending (the desk offers it): the first answer */
    var stmt = e.pendingMatch ? '<button class="copybtn stmt" type="button" data-sort="stmt" data-id="' + id + '" aria-pressed="' + !!(s && s.stmt) + '"' + dis + ">" + esc(L.pendingAnswer(e)) + "</button>" : "";
    var top = '<div class="srow"><div class="sl"><b>' + esc(e.payer) + '</b><span class="pm">' + esc(L.day(e.date) + (e.account ? " · " + e.account : "")) + '</span></div><span class="pa">' + esc(L.money(e.amount, e.currency)) + "</span></div>";
    var body;
    if (!s) body = '<div class="sacts"><button class="copybtn" type="button" data-sort="income" data-id="' + id + '"' + off() + ">It's income</button>" +
      '<button class="copybtn" type="button" data-sort="not" data-id="' + id + '"' + off() + ">Not income</button></div>";
    else if (s.kind === "income") body = '<div class="confirm" role="group" aria-label="What kind of income"><p>' + (stmt ? "Which statement or kind of income is it?" : "What kind of income is it?") + '</p><div class="stypes">' + stmt +
      L.SORT_TYPES.map(function (c) { return '<button class="copybtn" type="button" data-sort="cat" data-id="' + id + '" data-cat="' + esc(c) + '" aria-pressed="' + (s.cat === c) + '"' + dis + ">" + esc(c) + "</button>"; }).join("") + "</div>" +
      (s.stmt ? '<p class="sq">' + esc(L.pendingQuestion(e)) + "</p>" : s.cat ? '<p class="sq">' + esc(L.sortQuestion(e, "received", s.cat)) + "</p>" : "") +
      '<div class="conn-acts"><button class="sendbtn" type="button" data-sort="yes" data-id="' + id + '"' + (s.cat || s.stmt ? dis : " disabled") + ">" + (busy ? "Saving…" : s.stmt ? "Yes, it's that statement" : "Yes, it's income") + "</button>" +
      '<button class="copybtn" type="button" data-sort="no" data-id="' + id + '"' + (busy ? " disabled" : "") + ">Cancel</button></div></div>";
    else body = '<div class="confirm" role="group" aria-label="Not income"><p>' + esc(L.sortQuestion(e, "transfer")) + "</p>" +
      '<div class="conn-acts"><button class="sendbtn" type="button" data-sort="yes" data-id="' + id + '"' + dis + ">" + (busy ? "Saving…" : "Yes, not income") + "</button>" +
      '<button class="copybtn" type="button" data-sort="no" data-id="' + id + '"' + (busy ? " disabled" : "") + ">Cancel</button></div></div>";
    return '<li id="sort-' + esc(safe(e.id)) + '">' + top + body + '<p class="ferr" role="alert">' + esc(ui.sortErr[e.id] || "") + "</p></li>";
  }
  function sortClick(act, id, cat) {
    if (!board || HQ.sample || (ui.sort.busy && act !== "no")) return;
    var inc = board.income || {}, e = (inc.unsorted || []).filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    var sel = function (a) { return '[data-sort="' + a + '"][data-id="' + safe(id) + '"]'; };
    if (act === "income" || act === "not") { ui.sort = { id: id, kind: act, cat: "", stmt: false, busy: false }; delete ui.sortErr[id]; drawIncome(); bankFocus(act === "not" ? sel("no") : e.pendingMatch ? sel("stmt") : '[data-sort="cat"][data-id="' + safe(id) + '"]'); return; }
    if (act === "no") { var k = ui.sort.kind; ui.sort = { id: "", kind: "", cat: "", stmt: false, busy: false }; drawIncome(); bankFocus(sel(k === "not" ? "not" : "income")); return; }
    if (act === "cat" && ui.sort.id === id) { ui.sort.cat = L.SORT_TYPES.indexOf(cat) >= 0 ? cat : ""; ui.sort.stmt = false; drawIncome(); bankFocus('[data-sort="cat"][data-id="' + safe(id) + '"][aria-pressed="true"]'); return; }
    if (act === "stmt" && ui.sort.id === id && e.pendingMatch) { ui.sort.stmt = true; ui.sort.cat = ""; drawIncome(); bankFocus(sel("stmt")); return; }
    if (act !== "yes" || ui.sort.id !== id) return;
    var status = ui.sort.kind === "income" ? "received" : "transfer", category = ui.sort.cat, pm = status === "received" && ui.sort.stmt ? e.pendingMatch : null;
    if (status === "received" && !category && !pm) return;
    ui.sort.busy = true; drawIncome();
    write("sort", { id: id, month: String(e.date).slice(0, 7), status: status, category: status === "received" && !pm ? category : undefined, pending_id: pm ? pm.id : undefined }).then(function (r) {
      ui.sort.busy = false;
      if (!r.ok) { ui.sortErr[id] = r.error; drawIncome(); return; }
      delete ui.sortErr[id];
      ui.sort = { id: "", kind: "", cat: "", stmt: false, busy: false };
      ui.sorted[id] = { id: id, at: Date.now(), line: pm ? L.pendingSorted(pm) : L.sortedLine(status, category), sub: e.payer + " · " + L.money(e.amount, e.currency) + " · " + L.day(e.date) };
      /* at once, before the board catches up: out of the list, the status in "Latest payments" (the
         money of a statement: this row is gone and the statement is received) */
      if (pm) inc.entries = (inc.entries || []).filter(function (x) { return x.id !== id; }).map(function (x) { return x.id === pm.id ? Object.assign({}, x, { status: "received", arrived: e.date, account: e.account }) : x; });
      else (inc.entries || []).forEach(function (x) { if (x.id === id) { x.status = status; if (status === "received") x.category = category; x.history = (x.history || []).concat({ by: "Luke", from: "unsorted", to: status }); } });
      draw();
      bankFocus("#sort-" + safe(id));
      reload(true); /* the totals with it counted (or not) */
    });
  }

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
  function fullOf(v) { var f = v && ui.rel.full[v.id]; return v && !v.slim ? v : f && f.updatedAt === v.updatedAt ? f : null; }
  function loadFull(id) {
    var v = relById[id];
    if (!v || fullOf(v)) return Promise.resolve(fullOf(v));
    if (ui.rel.loading[id]) return ui.rel.loading[id];
    var p = ui.rel.loading[id] = HQ.getJSON("/api/staff/release?id=" + encodeURIComponent(id) + (HQ.sample ? "&sample=1" : "")).then(function (res) {
      delete ui.rel.loading[id];
      if (HQ.authFail(res)) return null;
      if (res.s !== 200 || !res.j || !res.j.release) { ui.rel.err[id] = "Couldn't open the details (" + res.s + "). Try again."; drawReleases(); return null; }
      ui.rel.full[id] = res.j.release; delete ui.rel.err[id];
      drawReleases();
      return res.j.release;
    }, function () { delete ui.rel.loading[id]; ui.rel.err[id] = "No connection: couldn't open the details. Try again."; drawReleases(); return null; });
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
      (s.note && s.status !== "blocked" && !st.skipped ? '<span class="rn">' + esc(s.note) + "</span>" : "") + "</div></li>";
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
  function pipeCard(v) {
    var today = board.today, off = HQ.sample ? " disabled" : "", asking = ui.rel.ask && ui.rel.ask.id === v.id, past = !!v.date && v.date < today;
    return '<article class="tile relcard" id="releases-' + esc(safe(v.id)) + '"><div class="bhead"><div><h3>' + esc(v.title) + "</h3>" +
      '<p class="rwhen">' + esc(L.releaseWhen(v.date, today, true)) + "</p>" + dealHtml(v) + "</div>" + '<span class="pill">Draft</span></div>' +
      (ui.rel.note[v.id] ? '<p class="rdone" role="status">' + esc(ui.rel.note[v.id]) + "</p>" : "") +
      (past ? '<p class="rwhere">' + esc(L.whereLine(v)) + "</p>" : "") + packHtml(v) +
      (asking ? relAsk(v) : '<div class="racts"><button class="sendbtn" type="button" data-rel="edit" data-id="' + esc(v.id) + '">Finish and send</button>' +
        '<button class="copybtn" type="button" data-rel="cancel" data-id="' + esc(v.id) + '"' + off + ">Cancel the draft</button></div>") +
      '<p class="ferr" role="alert">' + esc(ui.rel.err[v.id] || "") + "</p>" + relPack(v) + "</article>";
  }
  /* Upcoming: a song sent to the team. Where it is at (one line), its warnings (red: each one a fact
     with a consequence), every step, then the files and details. */
  function relCard(v) {
    var today = board.today, pill = L.upcomingPill(v, today), live = v.status === "scheduled" && !v.released, off = HQ.sample ? " disabled" : "";
    var acts = ['<button class="copybtn" type="button" data-rel="edit" data-id="' + esc(v.id) + '">Edit the details</button>'];
    if (live) acts.push('<button class="copybtn" type="button" data-rel="date" data-id="' + esc(v.id) + '"' + off + ">Change the date</button>",
      '<button class="copybtn" type="button" data-rel="cancel" data-id="' + esc(v.id) + '"' + off + ">Cancel release</button>");
    var asking = ui.rel.ask && ui.rel.ask.id === v.id, warn = v.warnings || [], where = L.whereLine(v);
    return '<article class="tile relcard" id="releases-' + esc(safe(v.id)) + '"><div class="bhead"><div><h3>' + esc(v.title) + "</h3>" +
      '<p class="rwhen">' + esc(L.releaseWhen(v.date, today)) + "</p>" + dealHtml(v) + "</div>" +
      '<span class="' + (pill.bad ? "bstate late" : "pill" + (pill.rel ? " rel" : "")) + '">' + esc(pill.text) + "</span></div>" +
      (ui.rel.note[v.id] ? '<p class="rdone" role="status">' + esc(ui.rel.note[v.id]) + "</p>" : "") +
      (where ? '<p class="rwhere">' + esc(where) + "</p>" : "") +
      (warn.length ? '<ul class="rwarn" aria-label="Warnings">' + warn.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>" : "") +
      /* out, and every step done: one line instead of ten (the steps are history now) */
      (v.released && v.counts && v.counts.total && v.counts.done === v.counts.total ? '<p class="rnote">All ' + v.counts.total + " steps done.</p>"
        : (v.steps || []).length ? '<ol class="rsteps" aria-label="Steps">' + v.steps.map(function (s) { return relStep(v, s); }).join("") + "</ol>" : "") +
      packHtml(v) +
      (asking ? relAsk(v) : '<div class="racts">' + acts.join("") + "</div>") +
      '<p class="ferr" role="alert">' + esc(ui.rel.err[v.id] || "") + "</p>" + relPack(v) + "</article>";
  }
  /* -> true when the desk drew the tab (js/hq.js draws the sheet's list when it didn't) */
  function drawReleases() {
    if (!board || !Array.isArray(board.releases)) return false;
    var sheet = HQ.sheet(), lists = L.releaseLists(board, sheet);
    relById = {}; board.releases.forEach(function (v) { relById[v.id] = v; });
    $("relSample").hidden = !HQ.sample;
    $("relSub").textContent = L.stepsSummary(board.releaseSteps) || "Every song on its way out: its files and details, and each bot's step with its date.";
    /* a redraw must not take the caret out of the date field being picked */
    var act = document.activeElement, fk = act && act.getAttribute ? act.getAttribute("data-reldate") : null;
    $("relPipe").innerHTML = lists.pipeline.length ? lists.pipeline.map(pipeCard).join("") : '<p class="empty2">Nothing is being prepared right now. Start one with New song.</p>';
    $("relDesk").innerHTML = lists.coming.map(relCard).join("");
    if (sheet && HQ.releasesBroken()) $("relList").innerHTML = '<p class="empty">See the note above.</p>';
    else $("relList").innerHTML = lists.sheetOnly.map(HQ.sheetReleaseCard).join("") ||
      (lists.coming.length ? "" : '<p class="empty2">Nothing has been sent to the team yet. A song moves here from “In the pipeline” when you send it.</p>');
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
  function drawSpotify() {
    var el = $("relSpot"), sv = board && board.sightings;
    if (!sv) { el.innerHTML = '<p class="empty2">Not read yet.</p>'; return; }
    var h = L.sightingsHead(sv, Date.now(), board.today), items = sv.items || [];
    /* a song whose message to Nova couldn't go (retry) is listed first among the rest: Luke has a button there */
    var ask = items.filter(function (x) { return x.state === "unknown"; }), rest = items.filter(function (x) { return x.state === "retry"; }).concat(items.filter(function (x) { return x.state !== "unknown" && x.state !== "retry"; }));
    var choices = sv.choices && sv.choices.length ? sv.choices : [];
    el.innerHTML = '<div class="tile spotcard"><p class="sphead' + (h.attn ? " attn" : "") + '">' + esc(h.text) + "</p>" +
      (sv.note ? '<p class="sps">' + esc((sv.by || "Atlas") + "’s note: " + sv.note) + "</p>" : "") + (h.empty ? '<p class="sps">' + esc(h.empty) + "</p>" : "") +
      (ask.length ? '<div class="spasks">' + ask.map(function (x) { return spotQ(x, choices); }).join("") + "</div>" : "") +
      (rest.length ? '<ul class="splist">' + rest.map(spotRow).join("") + "</ul>" : "") + "</div>";
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
  function jumpTo(id) {
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
  $("releases").addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-rel]");
    if (!b || !board) return;
    var act = b.getAttribute("data-rel"), id = b.getAttribute("data-id") || "", v = relById[id];
    var focusSel = function (sel) { var el = $("releases").querySelector(sel); if (el) el.focus(); };
    var sid = id.replace(/[^a-z0-9]/gi, "");
    if (act === "edit") {
      if (ui.rel.loading[id]) return;
      /* the form needs the whole release (the lyrics too), or saving it would look like clearing them */
      if (relById[id] && !fullOf(relById[id])) { b.disabled = true; b.textContent = "Opening…"; loadFull(id).then(function (f) { if (f) openForm(id); else drawReleases(); }); return; }
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
    var dn = L.releaseDayNote(F.date, formBase().today);
    return (dn.line ? '<p class="dnote' + (dn.bad ? " bad" : "") + '">' + esc(dn.line) + "</p>" : "") + dn.notes.map(function (n) { return '<p class="dnote' + (dn.bad ? " bad" : " q") + '">' + esc(n) + "</p>"; }).join("");
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

  window.HQStaff = { reload: reload, clear: clear, drawWorkers: drawWorkers, drawReleases: drawReleases, addDetails: addDetails, board: function () { return board; }, problem: function () { return problem; },
    /* Revolut's state (GET /api/bank/status) for Today and Data health */
    bank: function () { return bank; }, bankProblem: function () { return bankProblem; } };
})();
