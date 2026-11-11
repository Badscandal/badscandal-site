/* BADSCANDAL HQ page (11 Nov 2026). Reads /api/hq/data (same login as /admin) and draws it.
   ?sample=1 in the address shows made-up numbers. This page only displays: no button here
   changes an ad, a post, a sheet or any money. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var sample = /[?&]sample=1/.test(location.search);
  var data = null;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(n) { return n == null ? "–" : Number(n).toLocaleString("en-US"); }
  function signed(n) { return n == null ? "–" : (n > 0 ? "+" : "") + fmt(n); }
  function money(n, cur) {
    if (n == null) return "–";
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD", currencyDisplay: "code" }).format(n); }
    catch (e) { return Number(n).toFixed(2) + " " + (cur || ""); }
  }
  function day(d) { return d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "–"; }
  function monthName(m) { return new Date(m + "-15T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }); }
  function link(url, text) { return /^https:\/\//.test(url || "") ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(text) + "</a>" : esc(text); }
  function spark(series) {
    if (!series || series.length < 2) return '<svg class="spark" aria-hidden="true"></svg>';
    var vs = series.map(function (p) { return p.v; }), lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs), span = hi - lo || 1;
    var pts = series.map(function (p, i) { return (i / (series.length - 1) * 100).toFixed(2) + "," + (40 - ((p.v - lo) / span) * 36).toFixed(2); }).join(" ");
    return '<svg class="spark" viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="#F2F2F2" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';
  }
  function amounts(o) { /* {USD: 12, EUR: 3} -> "USD 12.00 + EUR 3.00" */
    var k = Object.keys(o || {});
    return k.length ? k.map(function (c) { return money(o[c], c); }).join(" + ") : "–";
  }
  function flat(block) { /* {cat: {cur: n}} -> {cur: n} */
    var t = {};
    Object.keys(block || {}).forEach(function (c) { Object.keys(block[c]).forEach(function (cur) { t[cur] = Math.round(((t[cur] || 0) + block[c][cur]) * 100) / 100; }); });
    return t;
  }

  function stack(id) { /* phones: hq.html turns each row into a card; label every cell from the header row */
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

  function drawToday() {
    var c = data.money.cap, t = $("capTile");
    $("capMonth").textContent = monthName(c.month);
    $("todaySub").textContent = day(data.today) + " · São Paulo";
    t.className = "tile " + c.status;
    $("capSpent").innerHTML = esc(money(c.spent, c.currency)) + " <small>of " + esc(money(c.amount, c.currency)) + " · " + c.pct + "%</small>";
    var p = function (n) { return Math.min(100, (n / c.amount) * 100) + "%"; };
    $("capFill").style.width = p(c.spent); $("capWarn").style.left = p(c.warn); $("capStop").style.left = p(c.stop);
    var msg = { ok: money(c.left, c.currency) + " left.", warn: "Getting close: past " + money(c.warn, c.currency) + ".", stop: "Past " + money(c.stop, c.currency) + ": every ad should be off for the rest of the month.", over: "OVER the cap. Every ad must be off now." }[c.status];
    if (c.status === "ok" && c.perDay > 0) msg += " At " + money(c.perDay, c.currency) + " a day " + (c.stopDay ? "the " + fmt(c.stop) + " line comes around day " + c.stopDay + "." : "the month ends under the line.");
    if (c.estimated) msg += " Billed: " + amounts(c.native) + (c.rate ? " (EUR counted at this month's average, 1 EUR = " + c.rate + " USD)." : " (no rate yet, EUR part not counted).");
    if (c.lastDay) msg += " Last day logged: " + day(c.lastDay) + ".";
    $("capMsg").textContent = msg;
    /* where Meta's part came from: Meta itself (read-only), or the sheet because the read failed */
    var src = data.money.metaSource;
    $("capMeta").innerHTML = !src ? "" : src.from === "meta"
      ? "Meta counted from Meta itself (" + esc(money(src.total, src.currency)) + " since " + esc(day(src.since)) + "); Google and TikTok from the sheet." +
        (src.mismatch.length ? src.mismatch.map(function (x) { return "<br>" + esc(day(x.d)) + ": Meta " + esc(money(x.meta, x.currency)) + ' · <b class="says">sheet says ' + esc(money(x.sheet, x.currency)) + "</b>"; }).join("") : "")
      : '<b class="says">Meta\'s own numbers couldn\'t be read' + (src.expired ? " (the Meta key has expired)" : "") + ", so Meta comes from the sheet.</b> Reason: " + esc(src.reason);
    var k = data.metaKey, kl = $("metaKey");
    kl.hidden = !k;
    if (k) { kl.textContent = k.text; kl.className = "keyline" + (k.state === "ok" ? " ok" : k.state === "expired" || k.state === "error" ? " bad" : ""); }
    var n = data.next;
    $("nextSong").textContent = n ? n.song : "None set";
    $("nextMsg").textContent = n ? (n.daysToGo === 0 ? "Out today" : n.daysToGo + " days to go") + " · " + day(n.date) + (n.late ? " · " + n.late + " step" + (n.late > 1 ? "s" : "") + " late" : " · on time") : "Tell Nova the next song and a Friday.";
    var mine = data.team.forLuke;
    $("forLuke").innerHTML = mine.length ? '<ul class="steps">' + mine.slice(0, 5).map(function (x) {
      return '<li class="' + (x.late ? "late" : "") + '"><span class="dot"></span><span>' + esc(x.task) + '</span><span class="w">' + esc(x.deadline ? day(x.deadline.slice(0, 10)) : "") + "</span></li>"; }).join("") + "</ul>"
      : '<p class="empty" style="margin-top:8px">Nothing waiting on you.</p>';
  }

  function drawSongs() {
    $("songList").innerHTML = data.songs.length ? data.songs.map(function (s) {
      var pill = s.trend === "rising" ? '<span class="pill hot">Rising ' + signed(s.momentum) + "%</span>" : s.trend === "cooling" ? '<span class="pill warn">Cooling ' + signed(s.momentum) + "%</span>" : s.trend === "steady" ? '<span class="pill">Steady ' + signed(s.momentum) + "%</span>" : '<span class="pill">New · not enough days yet</span>';
      return '<div class="tile"><div class="row"><h3>' + esc(s.song) + "</h3>" + pill + "</div>" +
        '<div class="big num">' + fmt(s.streams) + " <small>streams · " + esc(day(s.lastDay)) + "</small></div>" +
        '<div class="d">' + signed(s.dayChange) + " vs the day before · " + fmt(s.week) + " in 7 days" + (s.prevWeek != null ? " (" + fmt(s.prevWeek) + " the 7 before)" : "") + "</div>" + spark(s.series) +
        '<div class="d">' + fmt(s.listeners) + " listeners · " + fmt(s.saves) + " saves · " + fmt(s.adds) + " playlist adds</div>" +
        '<div class="d" style="margin-top:6px">' + (s.daysOut != null ? "Out " + s.daysOut + " days · " : "") + "Royalties so far: " + esc(amounts(s.royalties)) + (s.stale > 3 ? ' · <b style="color:var(--paper)">not logged for ' + s.stale + " days</b>" : "") + "</div></div>";
    }).join("") : '<p class="empty">No song rows yet. Atlas logs these daily from Spotify for Artists.</p>';
  }

  function drawGrowth() {
    $("growthList").innerHTML = data.growth.length ? data.growth.map(function (g) {
      return '<div class="tile"><div class="row"><h3>' + esc(g.platform) + '</h3><span class="lbl">' + esc(g.account) + "</span></div>" +
        '<div class="big num">' + fmt(g.followers) + "</div>" +
        '<div class="d">' + signed(g.day) + " yesterday · " + signed(g.week) + " in 7 days" + (g.month != null ? " · " + signed(g.month) + " in 30" : "") + "</div>" + spark(g.series) +
        (g.best.length ? '<div class="lbl" style="margin-top:4px">Best days</div>' + g.best.map(function (b) { return '<div class="d" style="margin-top:4px">' + signed(b.change) + " · " + esc(day(b.d)) + " · " + link(b.link, b.post) + "</div>"; }).join("") : "") +
        (g.stale > 2 ? '<div class="d" style="margin-top:6px;color:var(--paper)">Not logged for ' + g.stale + " days</div>" : "") + "</div>";
    }).join("") : '<p class="empty">No growth rows yet. Steve, Kevin, Laura and Atlas log one row a day.</p>';
  }

  function drawFans() {
    var f = data.fans;
    $("fansSub").textContent = f.total ? f.total + " people noticed · " + f.repeat + " came back more than once. Suggestions only: nobody is contacted without your yes." : "People asking for the song name, repeat commenters and DMs.";
    $("fanTable").innerHTML = f.people.length ? "<tr><th>Who</th><th>Where</th><th class='r'>Times</th><th>What they said</th><th>About them</th><th>How to reach them</th></tr>" + f.people.map(function (p) {
      return "<tr><td><b>" + link(p.profile, p.handle) + "</b><br><span class='lbl'>" + esc(p.signals.join(" · ").replace(/_/g, " ")) + "</span></td><td>" + esc(p.platform) + "<br><span class='lbl'>" + esc(day(p.last)) + "</span></td><td class='r'>" + (p.times >= 2 ? "<b>" + p.times + "</b>" : p.times) + "</td><td>" + (p.quote ? "“" + link(p.post, p.quote) + "”" : "–") + "</td><td>" + esc(p.about || "–") + "</td><td>" + esc(p.engage || "–") + "</td></tr>";
    }).join("") : '<tr><td class="empty">No fan signals logged yet.</td></tr>';
    stack("fanTable");
  }

  function drawReleases() {
    $("relList").innerHTML = data.releases.length ? data.releases.map(function (r) {
      var when = r.date ? (r.daysToGo > 0 ? r.daysToGo + " days to go" : r.daysToGo === 0 ? "Out today" : "Out " + (-r.daysToGo) + " day" + (r.daysToGo === -1 ? "" : "s") + " ago") : "No date yet";
      return '<div class="tile"><div class="row"><h3>' + esc(r.song) + "</h3>" + (r.late ? '<span class="pill warn">' + r.late + " late</span>" : '<span class="pill">On time</span>') + "</div>" +
        '<div class="d" style="margin-top:6px">' + esc(day(r.date)) + " · " + when + (r.status && !(r.daysToGo <= 0 && /^(out|released|live)$/i.test(r.status)) ? " · " + esc(r.status) : "") + (r.weekday && r.weekday !== "Fri" && r.daysToGo > 0 ? " · not a Friday" : "") + "</div>" +
        '<ul class="steps">' + r.steps.map(function (s) { return '<li class="' + (s.done ? "done" : s.late ? "late" : "") + '"><span class="dot"></span><span>' + esc(s.label) + ' <span class="lbl">' + esc(s.owner) + '</span></span><span class="w">' + (s.done ? "done" : esc(day(s.due)) + (s.late ? " · late" : "")) + "</span></li>"; }).join("") + "</ul>" +
        (r.notes ? '<div class="d" style="margin-top:8px">' + esc(r.notes) + "</div>" : "") + "</div>";
    }).join("") : '<p class="empty">No releases in the sheet yet.</p>';
  }

  function drawMoney() {
    var ms = data.money.months;
    $("moneyTable").innerHTML = ms.length ? "<tr><th>Month</th><th>Ad spend (as billed)</th><th>Income received (as paid)</th><th class='r'>Spend ≈ EUR</th><th class='r'>Income ≈ EUR</th><th class='r'>Left over ≈ EUR</th></tr>" + ms.map(function (m) {
      return "<tr><td><b>" + esc(monthName(m.month)) + "</b>" + (m.rate ? "<br><span class='lbl'>1 EUR = " + m.rate + " USD</span>" : "") + "</td><td>" + esc(amounts(flat(m.spend))) + "</td><td>" + esc(amounts(flat(m.income))) + (Object.keys(m.pending).length ? "<br><span class='lbl'>pending: " + esc(amounts(flat(m.pending))) + "</span>" : "") + "</td><td class='r'>" + esc(money(m.spendEur.amount, "EUR")) + (m.spendEur.missing ? "*" : "") + "</td><td class='r'>" + esc(money(m.incomeEur.amount, "EUR")) + (m.incomeEur.missing ? "*" : "") + "</td><td class='r'><b>" + (m.netEur == null ? "–" : esc(money(m.netEur, "EUR"))) + "</b></td></tr>";
    }).join("") : '<tr><td class="empty">No spend or income rows yet.</td></tr>';
    stack("moneyTable");
    var m0 = ms[0];
    if (!m0) { $("moneyDetail").innerHTML = ""; return; }
    var block = function (title, o) {
      var k = Object.keys(o || {});
      return '<div class="tile"><div class="lbl">' + esc(title) + "</div>" + (k.length ? k.map(function (c) { return '<div class="row d" style="margin-top:6px"><span>' + esc(c) + "</span><b style='color:var(--paper)'>" + esc(amounts(o[c])) + "</b></div>"; }).join("") : '<p class="empty" style="margin-top:6px">Nothing logged.</p>') + "</div>";
    };
    var src = data.money.metaSource;
    var spendTitle = "Ad spend by platform" + (src && src.from === "meta" ? " · Meta from Meta" : src && src.from === "sheet" ? " · Meta from the sheet" : "");
    $("moneyDetail").innerHTML = '<div class="lbl" style="margin:16px 0 8px">' + esc(monthName(m0.month)) + ' in detail</div><div class="grid g3">' + block(spendTitle, m0.spend) + block("Income by type", m0.income) + block("Self-release royalties by song", m0.royalties) + "</div>";
  }

  function drawTeam() {
    var t = data.team;
    $("teamSub").textContent = t.tasks.length + " open tasks · " + t.late + " late · " + t.blocked + " blocked";
    $("teamTable").innerHTML = t.team.length ? "<tr><th>Who</th><th class='r'>Open</th><th class='r'>Late</th><th class='r'>Blocked</th><th>Last logged a number</th></tr>" + t.team.map(function (o) {
      return "<tr><td><b>" + esc(o.owner) + "</b></td><td class='r'>" + o.open + "</td><td class='r'>" + (o.late ? "<b>" + o.late + "</b>" : 0) + "</td><td class='r'>" + (o.blocked ? "<b>" + o.blocked + "</b>" : 0) + "</td><td>" + (o.lastLogged ? esc(day(o.lastLogged)) + (o.quiet > 2 ? " · <b>quiet " + o.quiet + " days</b>" : "") : "–") + "</td></tr>";
    }).join("") : '<tr><td class="empty">No tasks in the sheet yet.</td></tr>';
    stack("teamTable");
    $("taskTable").innerHTML = t.tasks.length ? "<tr><th>Task</th><th>Owner</th><th>Deadline</th><th>Status</th></tr>" + t.tasks.map(function (x) {
      return "<tr><td>" + (x.late ? "<b>" + esc(x.task) + "</b>" : esc(x.task)) + (x.blocker ? "<br><span class='lbl'>blocked: " + esc(x.blocker) + "</span>" : "") + "</td><td>" + esc(x.owner) + "</td><td>" + esc(x.deadline ? day(x.deadline.slice(0, 10)) : "–") + (x.late ? " · <b>late</b>" : "") + "</td><td><span class='pill" + (x.status === "blocked" ? " warn" : "") + "'>" + esc(x.status) + "</span></td></tr>";
    }).join("") : "";
    stack("taskTable");
  }

  function render() {
    $("sample").hidden = !data.sample;
    $("off").hidden = true; $("app").hidden = false;
    $("when").textContent = data.sample ? "sample" : data.readAt ? "sheet read " + new Date(data.readAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) + " SP" : "";
    drawToday(); drawSongs(); drawGrowth(); drawFans(); drawReleases(); drawMoney(); drawTeam();
  }
  function off(msg) {
    $("app").hidden = true; $("off").hidden = false;
    if (msg) $("offMsg").textContent = msg;
  }
  function load() {
    fetch("/api/hq/data" + (sample ? "?sample=1" : ""), { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (res) {
        if (res.s === 401) { location.replace("/admin?next=" + encodeURIComponent("/hq" + (sample ? "?sample=1" : "") + (/^#[a-z]+$/.test(location.hash) ? location.hash : ""))); return; }
        if (res.s !== 200) return off("Couldn't load the numbers (" + res.s + "). Try again in a minute.");
        if (res.j.error) return off("Couldn't read the sheet: " + res.j.error + ".");
        if (!res.j.connected) return off('The dashboard reads the bots\' "BADSCANDAL HQ" sheet. Still to add on Netlify: ' + (res.j.need || []).join(" and ") + ".");
        data = res.j; render();
      })
      .catch(function () { off("No connection. Try again."); });
  }
  $("showSample").addEventListener("click", function () { sample = true; load(); });
  load();
  setInterval(function () { if (!document.hidden && data && !data.sample) load(); }, 5 * 60 * 1000);
})();
