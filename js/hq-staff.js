/* BADSCANDAL HQ · the staff desk on the page (11 Nov 2026). One answer, /api/staff/board (same login
   cookie as everything else; netlify/functions/staff.mjs), drawn in three places:
     Team      the connector strip, ONE card per bot on the roster (also the ones with no duty today),
               the live log
     Messages  what waits on Luke, a box to write, the whole board as threads
     Money     "Money coming in": accounts checked, this month, every source, the latest payments
   Today's "Needs attention", the site-check line and Data health read the same answer through
   js/hq.js (HQ.boardChanged). Every rule and every sentence is in js/hq-lib.js (tested); this file
   only draws and sends.

   THE ONLY WRITES ON /hq ARE HERE: Luke's own messages (send, answer, mark as done) and the bots'
   key switch. Nothing here can touch an ad, a post, the sheet or any money. In /hq?sample=1 nothing
   is sent at all and the page says so.

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
  function fresh() { return { reply: "", ask: null, drafts: {}, err: {}, busy: "", open: {}, why: {}, payAll: false, allThreads: false, keyAsk: false, keyErr: "", keyBusy: false }; }
  var safe = function (s) { return String(s == null ? "" : s).replace(/[^a-z0-9]/gi, ""); };
  var cap = function (s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); };

  /* ---------- loading: with the other answers, on start and on every refresh ---------- */
  function reload() {
    if (loading) return loading;
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
    board = null; problem = ""; tried = false; goodAt = null; ui = fresh();
    $("msgText").value = ""; counter(); $("msgErr").textContent = ""; $("msgOk").textContent = "";
    $("waitList").innerHTML = $("threadList").innerHTML = $("dutyList").innerHTML = $("incomeBody").innerHTML = '<div class="ph"></div>';
    draw();
  }
  function draw() {
    drawWorkers(); drawMessages(); drawIncome(); drawBadges();
    HQ.boardChanged(); /* Today's attention + site check, Data health, and Team's fallback when there is no board */
  }

  /* ---------- the page's writes ---------- */
  /* -> { ok } | { ok:false, error: a plain sentence to show next to the button } */
  function write(path, body) {
    if (HQ.sample) return Promise.resolve({ ok: false, error: "This is the sample: nothing is sent." });
    return HQ.postJSON("/api/staff/" + path, body).then(function (res) {
      if (HQ.authFail(res)) return { ok: false, error: "You were logged out. Log in and send it again." };
      if (res.s === 200 && res.j && res.j.ok) return { ok: true, j: res.j };
      return { ok: false, error: (res.j && typeof res.j.error === "string" && res.j.error) || "Couldn't save that (" + res.s + "). Try again." };
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
    el.innerHTML = '<p class="conn-line"><b class="' + (c.on ? "" : "off") + '">' + esc(c.head) + "</b> · " + esc(c.rest) + "</p>" +
      c.notes.map(function (n) { return '<p class="conn-note">' + esc(n) + "</p>"; }).join("") + ask + '<p class="ferr" role="alert">' + esc(ui.keyErr) + "</p>";
  }
  var shown = []; /* the cards as drawn (for "Copy message for Nova") */
  function workerCard(w) {
    var id = L.slug(w.name), bad = w.state === "blocked" || w.state === "late", now = Date.now();
    var lastMs = w.last ? L.spMs(w.last.at) : null;
    var counts = L.workerCounts(w), sched = (w.schedule || []).filter(function (x) { return x && x.what; });
    var why = [];
    if (w.why) why.push("<p>" + esc(w.why) + "</p>");
    if (sched.length) why.push("<p><b>Every day</b>" + sched.map(function (x) { return esc((x.time ? x.time + " · " : "") + x.what); }).join("<br>") + "</p>");
    else if (w.duty) why.push("<p><b>Every day</b>" + esc((w.time ? w.time + " · " : "") + w.duty) + "</p>");
    if (w.writes) why.push("<p><b>Writes</b>" + esc(w.writes) + "</p>");
    if (w.access) why.push("<p><b>Access</b>" + esc(w.access) + "</p>");
    if (w.blockers) why.push("<p><b>Known blockers</b>" + esc(w.blockers) + "</p>");
    if (!why.length) why.push("<p>Nothing is written down for this bot yet.</p>");
    return '<article class="tile botcard" id="team-' + esc(id) + '"><div class="bhead"><div><h3>' + esc(w.name) + "</h3>" + (w.role ? '<p class="brole">' + esc(w.role) + "</p>" : "") +
      '</div><span class="bstate ' + w.state + '">' + esc(L.workerLabel(w.state)) + "</span></div>" +
      ((w.duties || []).length ? '<ul class="bduties">' + w.duties.map(function (d) {
        return '<li class="' + (d.status === "blocked" || d.late ? "bad" : d.status === "done" ? "done" : "") + '"><span class="bt">' + esc(d.task) + (d.blocker ? "<small>Blocked: " + esc(d.blocker) + "</small>" : "") +
          '</span><span class="bw">' + esc(L.dutyWhen(d)) + "</span></li>"; }).join("") + "</ul>" : "") +
      (w.last ? '<p class="blast"><b>' + esc(lastMs ? L.ago(now - lastMs) : w.last.at) + "</b> " + HQ.link(w.last.link, w.last.message) + "</p>" : "") +
      (w.card && w.card.workingOn ? '<p class="bline"><b>Working on</b><span>' + esc(w.card.workingOn) + "</span></p>" : "") +
      (w.card && w.card.needs ? '<p class="bline need"><b>Needs</b><span>' + esc(w.card.needs) + "</span></p>" : "") +
      '<p class="bmeta">' + (counts ? "<span>" + esc(counts) + "</span>" : "") + "<span>" + esc(L.seenLine(w, now)) + "</span></p>" +
      (bad ? '<button class="copybtn" type="button" data-nova="' + esc(id) + '">Copy message for Nova</button>' : "") +
      '<details class="bwhy" data-why="' + esc(id) + '"' + (ui.why[id] ? " open" : "") + "><summary>Why this bot</summary>" + why.join("") + "</details></article>";
  }
  /* -> true when the board drew Team (js/hq.js falls back to the sheet's duty rows when it didn't) */
  function drawWorkers() {
    if (!board) return false;
    var sheet = HQ.sheet();
    drawConnector();
    $("liveNote").hidden = board.hqRead !== false;
    $("liveNote").textContent = "The sheet isn't being read right now, so today's duties and open tasks are missing from these cards.";
    shown = L.sortWorkers((board.staff || []).map(function (w) { return L.workerView(w, sheet, board.today); }));
    $("dutyList").innerHTML = shown.length ? shown.map(workerCard).join("") : '<p class="empty">No bots are on the list yet.</p>';
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
  function head(m) {
    var lab = L.waitLabel(m);
    return '<p class="mhead"><span><b>' + esc(m.from) + '</b> <span class="arrow">→</span> <b>' + esc(m.to === "all" ? "Everyone" : m.to) + '</b></span><span class="mtime">' + esc(when(m)) + "</span>" +
      (lab ? '<span class="mlabel' + (lab.mine ? " mine" : lab.open ? " open" : "") + '">' + esc(lab.text) + "</span>" : "") + "</p>";
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
    var wait = (board.waiting && board.waiting.luke) || [];
    wait.forEach(function (m) { byId[m.id] = byId[m.id] || m; });
    /* a redraw must not steal the reply Luke is typing: remember where the caret was */
    var act = document.activeElement, fk = act && act.getAttribute ? act.getAttribute("data-f") : null, s0 = fk ? act.selectionStart : 0, s1 = fk ? act.selectionEnd : 0;
    $("waitCard").classList.toggle("has", wait.length > 0);
    $("waitList").innerHTML = wait.length ? wait.map(waitItem).join("") : '<p class="empty2">Nothing is waiting on you.</p>';
    var all = board.messages || [], list = ui.allThreads ? all : all.slice(0, 25);
    $("threadList").innerHTML = (all.length ? list.map(thread).join("") : '<p class="empty2">No messages yet. They show up here when a bot, Claude or you write one.</p>') +
      (all.length > list.length ? '<button class="copybtn more-row" type="button" data-act="older">Show older messages (' + (all.length - list.length) + ")</button>" : "");
    if (fk) { var el = $("messages").querySelector('[data-f="' + fk.replace(/[^a-z0-9:]/gi, "") + '"]'); if (el) { el.focus(); try { el.setSelectionRange(s0, s1); } catch (e) {} } }
  }
  function drawBadges() {
    var n = board ? ((board.waiting && board.waiting.luke) || []).length : 0;
    ["msgBadge", "msgBadge2", "waitN"].forEach(function (id) { $(id).hidden = !n; $(id).textContent = n; $(id).setAttribute("aria-label", n + " waiting on you"); });
    $("moreDot").hidden = !n;
  }
  function focusIn(sel) { var el = $("messages").querySelector(sel); if (el) el.focus(); }
  /* answer a message: under the message that starts its thread (so the board shows it), to whoever wrote it */
  function answer(m, text) {
    return write("message", { to: m.from === "Luke" ? m.to : m.from, text: text, needs: "none", re: L.threadRoot(board, m) });
  }
  $("messages").addEventListener("input", function (ev) { var k = ev.target.getAttribute && ev.target.getAttribute("data-f"); if (k) ui.drafts[k] = ev.target.value; });
  $("messages").addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-act]");
    if (!b || !board) return;
    var act = b.getAttribute("data-act"), k = b.getAttribute("data-k") || "", m = byId[k.slice(2)];
    if (act === "older") { ui.allThreads = true; drawMessages(); return; }
    if (act === "more") { var id = safe(k.slice(2)); ui.open[id] = !ui.open[id]; drawMessages(); focusIn('[data-act="more"][data-k="' + k.replace(/[^a-z0-9:]/gi, "") + '"]'); return; }
    if (!m || HQ.sample || ui.busy) return;
    var sel = function (a) { return '[data-act="' + a + '"][data-k="' + k.replace(/[^a-z0-9:]/gi, "") + '"]'; };
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
      write("resolve", { id: m.id }).then(function (r) { if (settle(r)) reload(); });
    }
    else if (act === "send") {
      var text = String(ui.drafts[k] || "").trim();
      if (text.length < 2) { ui.err[k] = "Write your reply first."; drawMessages(); focusIn('[data-f="' + k.replace(/[^a-z0-9:]/gi, "") + '"]'); return; }
      ui.busy = k; drawMessages();
      answer(m, text).then(function (r) {
        if (!settle(r, function () { delete ui.drafts[k]; ui.reply = ""; })) return;
        /* the desk settles a question when its answer points at it; ours points at the start of the
           thread, so a question that was itself an answer is settled here */
        if (m.needs === "reply" && !m.resolved && m.to === "Luke" && L.threadRoot(board, m) !== m.id) return write("resolve", { id: m.id, note: "answered" }).then(function () { reload(); });
        reload();
      });
    }
    else if (act === "opt-yes" && ui.ask && ui.ask.k === k) {
      var choice = (m.options || [])[ui.ask.i];
      if (choice == null) return;
      ui.busy = k; drawMessages();
      answer(m, choice).then(function (r) {
        if (!r.ok) { settle(r); return; }
        return write("resolve", { id: m.id, note: String(choice).slice(0, 240) }).then(function (r2) {
          ui.busy = ""; ui.ask = null;
          if (!r2.ok) ui.err[k] = "Your answer was sent, but it couldn't be marked as done: " + r2.error; else delete ui.err[k];
          reload();
        });
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
  $("msgText").addEventListener("input", counter);
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
      $("msgOk").textContent = "Sent to " + (to === "all" ? "everyone" : to) + ".";
      setTimeout(function () { $("msgOk").textContent = ""; }, 5000);
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
      el.innerHTML = tried ? '<div class="tile mfail"><p>Couldn\'t load the money coming in.</p><button class="sendbtn" type="button" data-retry>Retry</button></div>' : '<div class="ph big"></div><div class="ph"></div>';
      return;
    }
    var inc = board.income || {}, today = board.today, accounts = inc.accounts || [], sources = inc.sources || [], entries = inc.entries || [];
    if (L.incomeEmpty(inc) && !accounts.length) {
      el.innerHTML = '<div class="tile"><p class="empty2">Nothing has been submitted yet. This fills in when Ledger starts submitting payments through the connector.</p></div>';
      return;
    }
    var month = inc.month ? new Date(inc.month + "-15T12:00:00Z").toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" }) : "this month";
    var probs = L.incomeProblems(inc), h = "";
    if (accounts.length) h += '<div class="acct">' + accounts.map(function (a) {
      var l = L.accountLine(a, today);
      return '<div class="tile' + (l.attn ? " attn-t" : "") + '"><p class="an">' + esc(a.name) + '</p><p class="al">' + esc(cap(l.text)) + "</p>" + (a.needsLuke ? '<p class="al need">Needs you: ' + esc(a.needsLuke) + "</p>" : "") + "</div>";
    }).join("") + "</div>";
    h += '<div class="inmonth"><div class="tile"><p class="t-lbl">Received in ' + esc(month) + "</p>" + amountLines(inc.received, "Nothing yet") + '</div><div class="tile"><p class="t-lbl">Pending</p>' + amountLines(inc.pending, "Nothing pending") + "</div></div>";
    if (probs.length) h += '<div class="t-card attn-card has"><p class="t-lbl">To look at</p><ul class="inprob">' + probs.map(function (p) { return "<li><span>" + esc(p) + "</span></li>"; }).join("") + "</ul></div>";
    h += '<h4 class="lblh">Where money comes from</h4><div class="tile"><div class="scroll"><table class="stack" id="srcTable">' +
      (sources.length ? "<tr><th>Source</th><th>Type</th><th>Usually paid</th><th>Last payment</th><th>This month</th><th>State</th></tr>" + sources.map(function (s) {
        var st = L.sourceState(s), mt = L.curList(s.monthTotal);
        return "<tr><td><b>" + esc(s.name) + "</b></td><td>" + esc(s.category || "–") + "</td><td>" + esc(L.cadenceWord(s.cadence)) + "</td><td>" + esc(cap(L.payLine(s.last))) + "</td><td>" + esc(mt.length ? mt.join(" + ") : "Nothing yet") +
          "</td><td>" + (st.attn ? '<span class="attn">' + esc(st.text) + "</span>" : esc(st.text)) + (s.needsLuke ? '<small class="need">Needs you: ' + esc(s.needsLuke) + "</small>" : "") + "</td></tr>";
      }).join("") : '<tr><td class="empty">No sources are on the list yet.</td></tr>') + "</table></div></div>";
    var rows = entries.slice(0, ui.payAll ? 60 : 15), stat = function (e) { return e.status === "transfer" ? "Transfer (not income)" : cap(e.status); };
    h += '<h4 class="lblh">Latest payments</h4><div class="tile">' + (!rows.length ? '<p class="empty2">No payments have been submitted yet.</p>'
      : '<div class="scroll paywide"><table id="payTable"><tr><th>Date</th><th>Payer</th><th class="r">Amount</th><th>Status</th><th>Account</th><th>Logged by</th></tr>' + rows.map(function (e) {
        return "<tr><td>" + esc(L.day(e.date)) + "</td><td><b>" + esc(e.payer) + "</b>" + (e.note ? "<small>" + esc(e.note) + "</small>" : "") + '</td><td class="r"><b>' + esc(L.money(e.amount, e.currency)) + "</b></td><td>" +
          esc(stat(e)) + "</td><td>" + esc(e.account || "–") + "</td><td>" + esc(e.by || "–") + "</td></tr>";
      }).join("") + '</table></div><ul class="paylist">' + rows.map(function (e) {
        return "<li><b>" + esc(e.payer) + '</b><span class="pa">' + esc(L.money(e.amount, e.currency)) + '</span><span class="pm">' + esc([L.day(e.date), e.account, e.by ? "by " + e.by : ""].filter(Boolean).join(" · ")) +
          '</span><span class="ps">' + esc(stat(e)) + "</span>" + (e.note ? '<span class="pn">' + esc(e.note) + "</span>" : "") + "</li>";
      }).join("") + "</ul>") +
      (entries.length > rows.length ? '<button class="copybtn more-row" type="button" data-pay-more>Show more (' + (Math.min(60, entries.length) - rows.length) + ")</button>" : "") + "</div>";
    el.innerHTML = h;
    HQ.stack("srcTable");
  }
  $("incomeBody").addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-retry")) reload();
    if (b.hasAttribute("data-pay-more")) { ui.payAll = true; drawIncome(); }
  });

  window.HQStaff = { reload: reload, clear: clear, drawWorkers: drawWorkers, board: function () { return board; }, problem: function () { return problem; } };
})();
