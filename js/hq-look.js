/* BADSCANDAL HQ · presentation (18 Nov 2026).
   Turns numbers the page already has into the phone layout. It does not fetch, write, or invent a
   figure: a missing one is "not reported". Health dots and action cards are used when another part
   of HQ has already put them on the board (platformHealth, actionCards); otherwise the same facts
   come from growth rows and the messages waiting on Luke. */
(function (root) {
  "use strict";
  var CURRENCIES = ["USD", "EUR", "GBP"];
  var PLATFORMS = ["TikTok", "Instagram", "YouTube", "Spotify"];
  var MARKS = [1000, 10000, 100000, 1000000, 10000000, 100000000];
  var TIMELINE = [
    { key: "upload", label: "Uploaded" },
    { key: "moderation", label: "In moderation" },
    { key: "approved", label: "Approved" },
    { key: "delivered", label: "Delivered" },
    { key: "live", label: "Live on Spotify" },
    { key: "lyrics", label: "Lyrics live" }
  ];

  function num(n) { return n == null || n === "" || !isFinite(Number(n)) ? null : Number(n); }
  function fmt(n) {
    n = num(n);
    return n == null ? "not reported" : Math.round(n).toLocaleString("en-US");
  }
  function money(n, cur, L) {
    if (L && L.money) return L.money(n, cur);
    n = num(n);
    return n == null ? "not reported" : (cur ? cur + " " : "") + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function day(d, L) { return L && L.day ? L.day(d) : (d || "not reported"); }
  function isDay(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")); }
  function daysBetween(today, date) {
    if (!isDay(today) || !isDay(date)) return null;
    var a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
    var b = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
    return Math.round((b - a) / 86400000);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function https(url) { return /^https:\/\//.test(String(url || "")) ? String(url) : ""; }

  /* "3 need you · 1 to check". need = the ONE Needs you count (board.needs.total from the server, else
     needTotal() below: the same rule). The second number is alerts (late steps, the cap, quiet bots), which are
     not money, so they are "to check", never "at risk" (18 Nov 2026, handoff bug 1). Both zero is the caught-up
     line. The words stay as written for 1 as well. */
  function homePulse(o) {
    o = o || {};
    var need = Array.isArray(o.need) ? o.need.length : (num(o.need) || 0);
    var risk = Array.isArray(o.risk) ? o.risk.length : (num(o.risk) || 0);
    var caughtUp = need === 0 && risk === 0;
    return { need: need, risk: risk, caughtUp: caughtUp, line: caughtUp ? "You're all caught up" : need + " need you · " + risk + " to check" };
  }
  /* The server's rule (S.waitingOnLuke via action-cards.mjs needsCount), for when the board has no count (an
     offline copy): open messages to Luke needing a decision, reply or action + Spotify for Artists songs only he
     can name + his open cards (live and held) + red account rows. */
  function needTotal(o) {
    o = o || {};
    var messages = (o.messages || []).filter(function (m) {
      return m && !m.resolved && m.to === "Luke" && /^(decision|reply|action)$/.test(String(m.needs || ""));
    }).length;
    var spotify = ((o.sightings && o.sightings.items) || []).filter(function (x) { return x && (x.state === "unknown" || x.state === "retry"); }).length;
    var auto = o.auto || {};
    var cards = ((auto.needsYou || []).length) + ((auto.held || []).length);
    var accounts = (o.healthNeeds || []).length;
    return { total: messages + spotify + cards + accounts, messages: messages, spotify: spotify, cards: cards, accounts: accounts };
  }

  /* A milestone only when the latest logged point crossed a mark the one before had not. */
  function milestones(songs) {
    var out = [];
    (songs || []).forEach(function (s) {
      if (!s) return;
      var series = (s.series || []).map(num).filter(function (n) { return n != null; });
      if (series.length < 2) return;
      var prev = series[series.length - 2], cur = series[series.length - 1];
      var hit = MARKS.filter(function (m) { return prev < m && cur >= m; });
      if (!hit.length) return;
      var mark = hit[hit.length - 1], name = s.song || s.title || "A song";
      out.push({
        song: name, mark: mark,
        line: name + " passed " + fmt(mark) + " streams",
        asOf: s.lastDay || "",
        source: "Spotify streams logged" + (s.lastDay ? " on " + s.lastDay : "")
      });
    });
    out.sort(function (a, b) { return b.mark - a.mark; });
    return out.slice(0, 3);
  }

  /* The release Luke is in: the soonest one still to come, else one that came out in the last 7 days. */
  function releaseHero(releases, today, covers) {
    covers = covers || {};
    var list = (releases || []).filter(function (r) { return r && r.status !== "cancelled" && isDay(r.date); });
    var upcoming = list.filter(function (r) { return r.date >= today && r.status !== "draft"; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var recent = list.filter(function (r) {
      var d = daysBetween(today, r.date);
      return d != null && d <= 0 && d >= -7;
    }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var r = upcoming[0] || recent[0];
    if (!r) return { reported: false, line: "No release on the board." };
    var days = daysBetween(today, r.date);
    var when = days == null ? "not reported" : days > 1 ? days + " days" : days === 1 ? "1 day" : days === 0 ? "Out today" : "Out now";
    var cover = r.cover || covers[r.id] || covers[r.title] || "";
    return { reported: true, id: r.id || "", title: r.title || "Untitled", date: r.date, days: days, when: when, cover: cover, source: "The release list" + (today ? ", as of " + today : "") };
  }

  function healthDot(name, health, row) {
    var h = health && (health[name] || health[String(name).toLowerCase()]);
    if (h && (h.state || h.dot)) {
      var state = h.state || h.dot;
      if (state !== "ok" && state !== "bad" && state !== "off") state = "off";
      return { state: state, label: h.text || h.label || (state === "ok" ? "Fine" : state === "bad" ? "Needs a look" : "not reported") };
    }
    if (!row || num(row.followers) == null) return { state: "off", label: "not reported" };
    if (num(row.stale) != null && row.stale > 2) return { state: "bad", label: "Not logged for " + row.stale + " days" };
    return { state: "ok", label: "Logged" };
  }

  /* The big number is the last-7-days change. A missing change is "not reported", never 0. */
  function kpiCard(label, hero, total, series, source) {
    var h = num(hero);
    return {
      label: label,
      hero: h == null ? "not reported" : (h > 0 ? "+" : h < 0 ? "−" : "") + fmt(Math.abs(h)),
      dir: h == null ? "flat" : h > 0 ? "up" : h < 0 ? "down" : "flat",
      total: num(total) == null ? "not reported" : fmt(total),
      series: Array.isArray(series) ? series.map(function (n) { return num(n); }) : [],
      source: source || "not reported"
    };
  }
  function platformKpis(growth, health) {
    return PLATFORMS.map(function (name) {
      var g = (growth || []).filter(function (x) { return x && String(x.platform || "").toLowerCase() === name.toLowerCase(); })[0] || null;
      var src = g && g.lastDay ? name + " logged " + g.lastDay : (g ? name + " logged" : "not reported");
      var views = g && (g.views != null || g.weekViews != null) ? kpiCard("Views", g.weekViews, g.views, g.viewSeries || g.series, src) : kpiCard("Views", null, null, [], "not reported");
      var profile = g && (g.profileViews != null || g.weekProfile != null) ? kpiCard("Profile views", g.weekProfile, g.profileViews, g.profileSeries || [], src) : kpiCard("Profile views", null, null, [], "not reported");
      var followers = kpiCard("Followers", g && g.week, g && g.followers, g && g.series, src);
      return { platform: name, health: healthDot(name, health, g), cards: [views, profile, followers] };
    });
  }

  function sparkPath(vals, w, h) {
    var pts = [];
    (vals || []).forEach(function (n, i) { if (num(n) != null) pts.push([i, num(n)]); });
    if (pts.length < 2) return "";
    var lo = Math.min.apply(null, pts.map(function (p) { return p[1]; }));
    var hi = Math.max.apply(null, pts.map(function (p) { return p[1]; }));
    var span = hi - lo || 1, n = (vals.length - 1) || 1;
    return pts.map(function (p, i) {
      return (i ? "L" : "M") + (p[0] / n * w).toFixed(1) + " " + (h - ((p[1] - lo) / span) * (h - 4) - 2).toFixed(1);
    }).join(" ");
  }
  /* Previous stretch dotted, the latest point dashed ("so far"), the rest solid. Fixed box, so the card doesn't jump. */
  function sparkSvg(series) {
    var vals = series || [];
    if (vals.filter(function (n) { return num(n) != null; }).length < 2) return "";
    var w = 120, h = 36, mid = Math.max(1, Math.floor(vals.length / 2));
    var prev = vals.slice(0, mid).concat(vals.slice(mid).map(function () { return null; }));
    var now = vals.slice();
    if (now.length) now[now.length - 1] = null;
    var last = vals.map(function (n, i) { return i >= vals.length - 2 ? n : null; });
    var a = sparkPath(prev, w, h), b = sparkPath(now, w, h), c = sparkPath(last, w, h);
    return '<svg class="sparkline" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true">' +
      (a ? '<path class="prev" d="' + a + '"/>' : "") +
      (b ? '<path class="now" d="' + b + '"/>' : "") +
      (c ? '<path class="sofar" d="' + c + '"/>' : "") + "</svg>";
  }

  function amountIn(text) {
    var m = /(?:USD|EUR|GBP|R\$|US\$|\$|€|£)\s?-?\d[\d.,]*/.exec(String(text || ""));
    return m ? m[0] : "";
  }
  function deadlineIn(m) {
    if (!m) return "";
    if (isDay(m.deadline)) return m.deadline;
    if (m.approval && isDay(m.approval.date)) return m.approval.date;
    var hit = /\d{4}-\d{2}-\d{2}/.exec(String(m.text || ""));
    return hit ? hit[0] : "";
  }
  /* Wallet cards from action cards already on the board, else from decisions waiting on Luke.
     Old blocked T- tasks go in the drawer, not on top. */
  function decisionStack(messages, tasks, actionCards) {
    var cards = [];
    if (Array.isArray(actionCards) && actionCards.length) {
      actionCards.forEach(function (c) {
        if (!c || c.resolved) return;
        cards.push({
          id: c.id || "", from: c.from || c.owner || "", title: c.title || c.line || "",
          text: c.text || c.body || "", amount: c.amount || amountIn(c.text || c.title),
          deadline: c.deadline || "", yes: c.yes || "", no: c.no || "", later: c.later || "",
          recommended: c.recommended || "", lyrics: !!c.lyrics, before: c.before || "", after: c.after || ""
        });
      });
    }
    (messages || []).forEach(function (m) {
      if (!m || m.resolved || m.to !== "Luke" || m.needs !== "decision" || !(m.options || []).length) return;
      if (cards.some(function (c) { return c.id && c.id === m.id; })) return;
      var yes = m.options[0], rest = m.options.slice(1), rec = null;
      if (m.recommendations && m.recommendations.length) {
        var recs = m.recommendations.slice().sort(function (a, b) { return a && a.by === "Nova" ? -1 : b && b.by === "Nova" ? 1 : 0; });
        rec = recs.filter(function (r) { return r && r.option && m.options.indexOf(r.option) >= 0; })[0] || null;
        if (rec) { yes = rec.option; rest = m.options.filter(function (o) { return o !== yes; }); }
      }
      var later = rest.filter(function (o) { return /^later$/i.test(String(o)); })[0] || "";
      var no = rest.filter(function (o) { return o !== later; })[0] || "";
      cards.push({
        id: m.id, from: m.from || "", title: String(m.text || "").split("\n")[0],
        text: String(m.text || ""), amount: amountIn(m.text), deadline: deadlineIn(m),
        yes: yes, no: no, later: later,
        recommended: rec ? rec.option : "",
        lyrics: !!(m.approval && m.approval.what === "lyrics"),
        before: (m.approval && m.approval.before) || "", after: (m.approval && (m.approval.after || m.approval.text)) || ""
      });
    });
    var parked = (tasks || []).filter(function (t) {
      return t && /^T-\d+/i.test(String(t.id || "")) && /blocked|waiting/i.test(String(t.status || ""));
    }).map(function (t) {
      return { id: t.id, title: t.task || t.title || t.id, owner: t.owner || "", note: t.blocker || t.note || "" };
    });
    return { top: cards[0] || null, rest: cards.slice(1), parked: parked, caughtUp: !cards.length };
  }
  /* One Needs-you list (19 Nov 2026). Questions, T-tasks waiting on Luke, and dispute cases
     (waiting on him, or solved and waiting for his confirm). Red first, then the oldest. */
  function waitingOnYou(o) {
    o = o || {};
    var today = o.today || "";
    var items = [];
    (o.messages || []).forEach(function (m) {
      if (!m || m.resolved || m.to !== "Luke") return;
      if (m.needs !== "decision" && m.needs !== "reply" && m.needs !== "action") return;
      items.push({
        kind: "question", id: m.id || "", title: String(m.text || "").split("\n")[0],
        reason: "", at: m.at || "", tone: m.needs === "decision" ? "red" : "yellow",
        href: m.id ? "#messages/" + m.id : "#messages"
      });
    });
    (o.tasks || []).forEach(function (t) {
      if (!t || !/^T-\d+/i.test(String(t.id || ""))) return;
      var st = String(t.status || "");
      if (!/blocked|waiting/i.test(st)) return;
      items.push({
        kind: "task", id: t.id, title: t.task || t.title || t.id,
        reason: t.blocker || t.note || "", at: t.updated || t.at || t.deadline || "",
        tone: /blocked/i.test(st) || t.late ? "red" : "yellow", href: "#team"
      });
    });
    var disputes = Array.isArray(o.disputes) ? o.disputes : ((o.disputes && o.disputes.items) || []);
    disputes.forEach(function (c) {
      if (!c || String(c.platform || "").trim().toUpperCase() === "TEST") return;
      if (c.status !== "waiting on Luke" && c.status !== "solved - confirm") return;
      var overdue = c.nextCheck && today && c.nextCheck < today;
      items.push({
        kind: "dispute", id: c.id || "", title: (c.song || "A song") + " · " + (c.platform || "a case"),
        reason: c.status === "solved - confirm" ? "Solved. Confirm to close it." : (c.waitingOn ? "Waiting on " + c.waitingOn : "Waiting on you"),
        at: c.waitingSince || c.createdAt || c.opened || "",
        tone: c.status === "solved - confirm" && !overdue ? "green" : "red",
        href: c.id ? "#songs/" + c.id : "#songs"
      });
    });
    var rank = { red: 0, yellow: 1, green: 2 };
    items.sort(function (a, b) {
      var d = (rank[a.tone] == null ? 3 : rank[a.tone]) - (rank[b.tone] == null ? 3 : rank[b.tone]);
      if (d) return d;
      if (!a.at) return 1;
      if (!b.at) return -1;
      return a.at < b.at ? -1 : a.at > b.at ? 1 : 0;
    });
    return items;
  }

  function stepDone(steps, re) {
    return (steps || []).some(function (s) { return s && re.test(String(s.key || "") + " " + String(s.label || "")) && (s.status === "done" || s.done); });
  }
  function storeDot(store) {
    var st = String((store && (store.status || store.state)) || "").toLowerCase();
    var reason = (store && (store.reason || store.note)) || "";
    if (!st) return { tone: "off", label: "not reported", reason: "" };
    if (/reject|fail|error/.test(st)) return { tone: "bad", label: "Rejected", reason: reason || "No reason reported" };
    if (/deliver|live/.test(st)) return { tone: "ok", label: "Delivered", reason: "" };
    return { tone: "wait", label: "Processing", reason: "" };
  }
  function releaseRows(releases, today, covers) {
    covers = covers || {};
    return (releases || []).filter(function (r) {
      return r && r.status !== "cancelled" && !r.released && r.status !== "draft";
    }).map(function (r) {
      var days = daysBetween(today, r.date);
      var store = storeDot(r.store);
      return {
        id: r.id || "", title: r.title || "Untitled", cover: r.cover || covers[r.id] || covers[r.title] || "",
        store: store, days: days,
        when: days == null ? "Date not reported" : days > 1 ? days + " days" : days === 1 ? "1 day" : days === 0 ? "Out today" : "Out now",
        dots: [
          { key: "sfa", label: "Spotify for Artists", on: stepDone(r.steps, /spotify/i) || !!(r.sighting || r.inSpotify) },
          { key: "pitch", label: "Pitched", on: stepDone(r.steps, /pitch/i) || (r.pitch && r.pitch.status === "pitched") },
          { key: "canvas", label: "Canvas", on: stepDone(r.steps, /canvas/i) },
          { key: "lyrics", label: "Lyrics", on: stepDone(r.steps, /lyric/i) },
          { key: "page", label: "Page live", on: stepDone(r.steps, /page/i) }
        ],
        lyrics: lyricsState(r)
      };
    }).sort(function (a, b) { return (a.days == null ? 999 : a.days) - (b.days == null ? 999 : b.days); });
  }
  function lyricsState(r) {
    var step = (r.steps || []).filter(function (s) { return s && /lyric/i.test(String(s.key || "") + " " + String(s.label || "")); })[0];
    if (step && (step.status === "done" || step.done)) return "Lyrics live";
    if (step && (step.status === "blocked" || step.late)) return "Lyrics blocked";
    if (r.pack && r.pack.lyrics) return "In the pack";
    if (r.lyricsChars) return "In the pack";
    return "Not in the pack yet";
  }

  function stampOf(step, store, key) {
    if (step && (step.at || step.doneOn || step.since)) return step.at || step.doneOn || step.since;
    if (key === "moderation" && store && /moderat/.test(String(store.status || "")) && store.since) return store.since;
    if ((key === "approved" || key === "delivered") && store && store.since && new RegExp(key === "approved" ? "approv" : "deliver").test(String(store.status || ""))) return store.since;
    return "";
  }
  function releaseTimeline(r) {
    if (!r) return [];
    var steps = r.steps || [], store = r.store || {};
    var failed = /reject|fail/.test(String(store.status || "").toLowerCase());
    return TIMELINE.map(function (stage) {
      var step = steps.filter(function (s) { return s && new RegExp(stage.key === "upload" ? "upload" : stage.key === "live" ? "live|spotify" : stage.key, "i").test(String(s.key || "") + " " + String(s.label || "")); })[0];
      var done = !!(step && (step.status === "done" || step.done));
      if (stage.key === "moderation") done = done || /moderat|approv|deliver|live/.test(String(store.status || "").toLowerCase());
      if (stage.key === "approved") done = done || /approv|deliver|live/.test(String(store.status || "").toLowerCase());
      if (stage.key === "delivered") done = done || /deliver|live/.test(String(store.status || "").toLowerCase());
      if (stage.key === "live" && r.pack && r.pack.spotifyTrack) done = true;
      var bad = (step && (step.status === "blocked" || /reject|fail/.test(String(step.note || "")))) || (failed && (stage.key === "moderation" || stage.key === "approved"));
      var note = (bad && (store.reason || (step && step.note))) || "";
      return { key: stage.key, label: stage.label, done: done && !bad, bad: !!bad, at: stampOf(step, store, stage.key), note: note || (bad ? "No reason reported" : ""), autoOpen: !!bad && !!(note || store.reason || (step && step.note)) };
    });
  }
  /* under a song that was already sent: are its files and details complete? (18 Nov 2026: it said "Ready to send"
     for songs that had been sent) */
  function readinessBox(blockers) {
    var list = (blockers || []).filter(Boolean).map(function (b) { return typeof b === "string" ? b : (b.text || b.label || ""); }).filter(Boolean);
    return { ready: !list.length, items: list, line: list.length ? (list.length === 1 ? "1 thing missing" : list.length + " things missing") + " from the files and details" : "Files and details: nothing missing" };
  }
  /* "Mon 16 Nov" from a stored stamp (an ISO instant or a day); "" when it isn't one (never the raw text) */
  function stampDay(at, L) {
    var m = String(at || "").match(/^(\d{4}-\d{2}-\d{2})/);
    if (!m) return "";
    return L && L.day ? L.day(m[1]) : m[1];
  }

  function adsPins(o, L) {
    o = o || {};
    var cap = o.cap || {};
    var spent = num(cap.spent), amount = num(cap.amount) || 1000;
    var missing = [];
    (cap.notRead || []).forEach(function (line) {
      var name = String(line).split(" ")[0];
      if (name && missing.indexOf(name) < 0) missing.push(name);
    });
    (cap.gaps || []).forEach(function (g) {
      var name = String(g.platform || g).split(" ")[0];
      if (name && missing.indexOf(name) < 0) missing.push(name);
    });
    var ySpend = o.yesterday && num(o.yesterday.spend);
    var prevSpend = num(o.prevSpend);
    var cpe = num(o.costPerEngagement);
    var visits = num(o.visits), prevVisits = num(o.prevVisits);
    var vs = function (cur, prev) {
      if (cur == null || prev == null) return "vs last week: not reported";
      if (!prev) return cur ? "new since last week" : "same as last week";
      var p = (cur - prev) / prev * 100;
      if (Math.abs(p) < 0.5) return "same as last week";
      return (p > 0 ? "up " : "down ") + Math.abs(p).toFixed(0) + "% vs last week";
    };
    return {
      cap: {
        reported: spent != null,
        label: spent == null ? "not reported" : money(spent, cap.currency || "USD", L) + " of " + money(amount, cap.currency || "USD", L) + (cap.estimated ? ", estimated" : ""),
        pct: spent == null ? 0 : Math.max(0, Math.min(100, spent / amount * 100)),
        missing: missing.map(function (n) { return n + " not read"; }),
        source: cap.fetched ? "Ad spend, read " + cap.fetched : "Ad spend"
      },
      yesterday: { reported: ySpend != null, label: ySpend == null ? "not reported" : money(ySpend, (o.yesterday && o.yesterday.currency) || cap.currency || "USD", L), vs: vs(ySpend, prevSpend), source: "Yesterday's ad spend" },
      engagement: { reported: cpe != null, label: cpe == null ? "not reported" : money(cpe, o.currency || cap.currency || "USD", L), vs: vs(cpe, num(o.prevCostPerEngagement)), source: "Cost per engagement" },
      visits: { reported: visits != null, label: visits == null ? "not reported" : fmt(visits), vs: vs(visits, prevVisits), source: "Song-page visits" }
    };
  }
  function runningNow(ads) {
    var list = (ads || []).filter(function (a) { return a && a.status; });
    if (!list.length) return { reported: false, line: "Running now: not reported" };
    return { reported: true, rows: list.map(function (a) { return { name: a.ad || a.name || "Ad", on: /active|running|on/i.test(String(a.status)) && !/pause|off/i.test(String(a.status)), status: a.status }; }) };
  }
  function creativePlot(ads) {
    var pts = (ads || []).map(function (a) {
      if (!a) return null;
      var spend = num(a.spend), engaged = num(a.engaged != null ? a.engaged : a.engagements);
      if (spend == null || engaged == null) return null;
      var series = (a.cpeSeries || a.costSeries || []).map(num).filter(function (n) { return n != null; });
      var fatigue = series.length >= 3 && series.slice(-3).every(function (n, i, arr) { return i === 0 || n > arr[i - 1]; });
      return { name: a.ad || a.name || "Ad", song: a.song || "", spend: spend, engaged: engaged, thumb: https(a.thumb || a.thumbnail || ""), fatigue: fatigue };
    }).filter(Boolean);
    if (!pts.length) return { reported: false, line: "No ad has both spend and engagements yet." };
    var spends = pts.map(function (p) { return p.spend; }).sort(function (a, b) { return a - b; });
    var engs = pts.map(function (p) { return p.engaged; }).sort(function (a, b) { return a - b; });
    var med = function (a) { var m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
    var maxS = Math.max.apply(null, spends) || 1, maxE = Math.max.apply(null, engs) || 1, mS = med(spends), mE = med(engs);
    return { reported: true, points: pts.map(function (p) {
      return { name: p.name, song: p.song, thumb: p.thumb, x: Math.max(4, Math.min(96, p.spend / maxS * 100)), y: Math.max(4, Math.min(96, 100 - p.engaged / maxE * 100)), over: p.spend > mS && p.engaged < mE, fatigue: p.fatigue, spend: p.spend, engaged: p.engaged };
    }) };
  }

  function sumCurrency(entries, cur, pred) {
    var n = 0, any = false;
    (entries || []).forEach(function (e) {
      if (!e || e.currency !== cur || !pred(e)) return;
      var a = num(e.amount);
      if (a == null) return;
      any = true; n += a;
    });
    return any ? Math.round(n * 100) / 100 : null;
  }
  function landedEntry(e) {
    return e && e.status === "received" && !e.movedTo && !e.holding && /revolut/i.test(String(e.account || "")) && e.status !== "transfer";
  }
  function pendingEntry(e) {
    return e && !e.paidBy && !e.movedTo && /^(payable|pending|statement only)$/.test(String(e.status || ""));
  }
  /* One card per currency. Landed is the only received total. Pending is never added in. */
  function moneyCards(o, L) {
    o = o || {};
    var inc = o.income, entries = o.entries || [], month = o.month || (inc && inc.month) || "";
    var received = (inc && inc.receivedByMonth && month && inc.receivedByMonth[month]) || (inc && inc.received) || null;
    if (!inc) {
      return { reported: false, cards: CURRENCIES.map(function (c) { return { currency: c, landed: null, pending: null, landedText: "not reported", pendingText: "not reported" }; }) };
    }
    return { reported: true, month: month, cards: CURRENCIES.map(function (c) {
      var fromEntries = entries.length ? sumCurrency(entries, c, function (e) { return (!month || String(e.date || "").slice(0, 7) === month) && landedEntry(e); }) : null;
      var hasKey = !!(received && Object.prototype.hasOwnProperty.call(received, c) && num(received[c]) != null);
      var landed = fromEntries != null ? fromEntries : (hasKey ? num(received[c]) : (received ? 0 : null));
      var pendingListed = num(inc.payable && inc.payable[c]);
      var pendingExtra = entries.length ? sumCurrency(entries, c, function (e) { return (!month || String(e.date || "").slice(0, 7) === month) && e.status === "statement only" && !e.paidBy; }) : null;
      var pendingKnown = !!(inc.payable || entries.length);
      var pending = !pendingKnown && pendingListed == null && pendingExtra == null ? null : (pendingListed || 0) + (pendingExtra || 0);
      return {
        currency: c,
        landed: landed,
        pending: pending,
        landedText: landed == null ? "not reported" : landed === 0 ? "Nothing received" : money(landed, c, L),
        pendingText: pending == null ? "not reported" : pending === 0 ? "nothing" : money(pending, c, L)
      };
    }) };
  }
  function monthChip(o) {
    o = o || {};
    var month = o.month || "";
    var closed = (o.closes || []).some(function (c) { return c && c.month === month; });
    if (closed) return { status: "closed", text: "Closed", reason: "" };
    var unsorted = num(o.unsorted) || 0;
    var pending = !!o.pending;
    if (o.ready === true && !unsorted) return { status: "ready", text: "Ready", reason: "" };
    if (unsorted) return { status: "open", text: "Open", reason: unsorted + " payment" + (unsorted === 1 ? "" : "s") + " still to sort" };
    if (pending) return { status: "provisional", text: "Provisional", reason: "Money is still on a statement or not in Revolut yet" };
    return { status: "open", text: "Open", reason: "This month is not closed" };
  }
  function whyPayments(entries, currency, month) {
    return (entries || []).filter(function (e) {
      return e && e.currency === currency && (!month || String(e.date || "").slice(0, 7) === month) && landedEntry(e);
    }).map(function (e) {
      return { payer: e.payer || "Payer not named", amount: e.amount, currency: e.currency, date: e.date || "", evidence: https(e.evidence || e.link || (e.links && e.links[0])) };
    });
  }
  function splitOff(e) {
    if (!e || !Array.isArray(e.splits) || !e.splits.length || num(e.amount) == null) return false;
    var sum = 0, ok = true;
    e.splits.forEach(function (s) { var n = num(typeof s === "number" ? s : (s && (s.amount != null ? s.amount : s.value))); if (n == null) ok = false; else sum += n; });
    if (!ok) return false;
    return Math.abs(Math.round(sum * 100) - Math.round(num(e.amount) * 100)) > 0;
  }
  function plainStatus(text) {
    var t = String(text || "");
    var map = {
      "Moved to Revolut": "Already counted in Revolut",
      "Statement only (not payable yet)": "On a statement, not owed yet",
      "Pending (not received yet)": "On a statement",
      "Payable (not received yet)": "Owed, not in Revolut yet",
      "Paid (see the received payment)": "Paid out",
      "To sort": "Waiting for you to sort",
      "Received": "Received"
    };
    if (map[t]) return map[t];
    if (/^In .+counts when it reaches Revolut$/.test(t)) return "On the way. It counts when it reaches Revolut.";
    return t.replace(/\bpaid_by\b/gi, "the payment").replace(/\bsettled\b/gi, "received");
  }
  /* Wise/PayPal rows that only confirm a Revolut payment, statement-only rows, and own transfers stay out of the main list. */
  function paymentBucket(e) {
    if (!e) return "hide";
    if (e.movedTo) return "confirming";
    if (e.holding && !/revolut/i.test(String(e.account || ""))) return "statement";
    if (e.status === "statement only") return "statement";
    if (e.status === "transfer" || e.own) return "transfer";
    return "main";
  }

  function bestPost(ranking, songs) {
    var ranked = (ranking && ranking.ranked) || [];
    var r = ranked.filter(function (p) { return p && num(p.views) != null && p.views >= 1000; })[0];
    if (!r) return { reported: false, line: "No post with 1,000 views yet." };
    var song = "";
    (songs || []).some(function (s) {
      var title = s && (s.title || s.song);
      if (title && String(r.caption || "").toLowerCase().indexOf(String(title).toLowerCase()) >= 0) { song = title; return true; }
      return false;
    });
    var when = String(r.at || "").slice(0, 10);
    return {
      reported: true,
      title: (song || "Post") + (when ? " · " + when : ""),
      why: (num(r.rate) == null ? "Engagement not reported" : (Math.round(r.rate * 1000) / 10).toFixed(1) + "% engaged per view"),
      thumb: https(r.thumb || r.thumbnail || r.media || ""),
      link: https(r.link),
      source: "Ranked at the same age, from the posts already read"
    };
  }
  function fanCards(inbox) {
    var out = [];
    ((inbox && inbox.questions) || []).forEach(function (q) {
      if (!q) return;
      out.push({ id: q.id || "", kind: "question", user: q.user || "", text: q.text || "", needs: !!q.needsReply, flag: q.needsReply ? "Needs your reply" : "Answered" });
    });
    ((inbox && inbox.ours) || []).forEach(function (c) {
      if (!c) return;
      out.push({ id: c.id || "", kind: "whose", user: c.user || "", text: c.text || "", whose: c.ours ? "Ours" : "Fan" });
    });
    return out;
  }
  /* A week strip only when real online-follower counts were logged. Otherwise hidden. */
  function uploadSlots(online) {
    if (!Array.isArray(online) || online.length < 7) return null;
    var rows = online.map(function (x) { return { hour: num(x && x.hour), day: x && x.day, n: num(x && (x.followers != null ? x.followers : x.online)) }; }).filter(function (x) { return x.n != null; });
    if (rows.length < 7) return null;
    var max = Math.max.apply(null, rows.map(function (x) { return x.n; })) || 1;
    return rows.map(function (x) { return { hour: x.hour, day: x.day || "", n: x.n, shade: x.n / max }; });
  }

  function siteRows(tiles) {
    return (tiles || []).filter(function (t) { return t && t.id && t.id !== "home"; }).map(function (t) {
      var bad = (t.lines || []).filter(function (l) { return l && l.tone === "bad"; });
      var page = (t.lines || []).filter(function (l) { return l && l.label === "Page"; })[0];
      return {
        path: "/" + t.id,
        title: t.title || t.id,
        address: t.address || ("badscandal.com/" + t.id),
        state: bad.length ? "Needs a look" : "Ready",
        ok: !bad.length,
        detail: bad.map(function (l) { return l.text; }),
        ago: (page && page.text) || ""
      };
    });
  }

  function lyricsDiff(before, after) {
    if (before == null || after == null || before === "" || after === "") return { ready: false, line: "No earlier version to compare." };
    var a = String(before).replace(/\r\n/g, "\n").split("\n");
    var b = String(after).replace(/\r\n/g, "\n").split("\n");
    var rows = [], i = 0, j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) { rows.push({ kind: "same", text: a[i] }); i++; j++; }
      else if (j < b.length && a.indexOf(b[j], i) < 0) { rows.push({ kind: "add", text: b[j] }); j++; }
      else if (i < a.length && b.indexOf(a[i], j) < 0) { rows.push({ kind: "del", text: a[i] }); i++; }
      else if (i < a.length && j < b.length) { rows.push({ kind: "del", text: a[i] }); rows.push({ kind: "add", text: b[j] }); i++; j++; }
      else if (i < a.length) { rows.push({ kind: "del", text: a[i] }); i++; }
      else { rows.push({ kind: "add", text: b[j] }); j++; }
    }
    return { ready: true, rows: rows };
  }

  /* Lines that belong in a bot's view or behind More, not on Luke's first screen. */
  function lukeSees(text) {
    var t = String(text || "");
    if (!t) return false;
    if (/reconnect needed|tools_seen|list_version|tools_version|notes_for_everyone/i.test(t)) return false;
    if (/none right now/i.test(t)) return false;
    if (/^no change\b/i.test(t)) return false;
    if (/\b(ISRC|UPC)\b/.test(t)) return false;
    return true;
  }

  function badge(dir) {
    if (dir === "up") return '<span class="kb up">▲ Up</span>';
    if (dir === "down") return '<span class="kb dn">▼ Down</span>';
    return '<span class="kb flat">– Flat</span>';
  }
  function kpiHtml(block) {
    var h = block.health || { state: "off", label: "not reported" };
    var cards = (block.cards || []).map(function (c) {
      return '<article class="kcard"><p class="kl">' + esc(c.label) + "</p>" +
        '<p class="kn num">' + esc(c.hero) + badge(c.dir) + "</p>" +
        '<p class="kt">Now ' + esc(c.total) + "</p>" + sparkSvg(c.series) +
        '<button type="button" class="whybtn" data-source="' + esc(c.source) + '">Source</button></article>';
    }).join("");
    return '<section class="kplat"><h3>' + esc(block.platform) + ' <i class="hdot ' + esc(h.state) + '" title="' + esc(h.label) + '"></i><span class="sr">' + esc(h.label) + "</span></h3><div class=\"krow\">" + cards + "</div></section>";
  }
  function homeHtml(o) {
    o = o || {};
    if (o.loading) return '<div class="pulse"><p class="ph big"></p></div><div class="ph big"></div><div class="ph"></div>';
    if (o.error) return '<div class="tile look-err" role="alert"><p>' + esc(o.error) + '</p><button type="button" class="sendbtn" data-look-retry>Retry</button></div>';
    var pulse = o.pulse || homePulse({});
    var h = '<header class="pulse"><p class="pulse-n">' + esc(pulse.line) + "</p></header>";
    h += o.decision || "";
    if (o.milestones && o.milestones.length) {
      h += '<section class="miles" aria-label="Milestones">' + o.milestones.map(function (m) {
        return '<article class="mile"><p>' + esc(m.line) + '</p><button type="button" class="whybtn" data-source="' + esc(m.source) + '">Source</button></article>';
      }).join("") + "</section>";
    }
    var hero = o.hero;
    if (hero && hero.reported) {
      h += '<a class="rhero" href="#releases/' + esc(hero.id) + '"' + (hero.cover ? ' style="background-image:url(' + esc(hero.cover) + ')"' : "") + ">" +
        '<span class="rhero-in"><span class="kl">Current release</span><strong>' + esc(hero.title) + "</strong><span class=\"rcount\">" + esc(hero.when) + "</span></span></a>";
    } else h += '<p class="look-empty">No release on the board.</p>';
    h += (o.kpis || []).map(kpiHtml).join("");
    return h;
  }

  var api = {
    homePulse: homePulse, needTotal: needTotal, stampDay: stampDay, milestones: milestones, releaseHero: releaseHero, platformKpis: platformKpis, healthDot: healthDot,
    sparkSvg: sparkSvg, decisionStack: decisionStack, waitingOnYou: waitingOnYou, releaseRows: releaseRows, releaseTimeline: releaseTimeline, readinessBox: readinessBox,
    lyricsState: lyricsState, adsPins: adsPins, runningNow: runningNow, creativePlot: creativePlot,
    moneyCards: moneyCards, monthChip: monthChip, whyPayments: whyPayments, splitOff: splitOff, plainStatus: plainStatus, paymentBucket: paymentBucket,
    bestPost: bestPost, fanCards: fanCards, uploadSlots: uploadSlots, siteRows: siteRows, lyricsDiff: lyricsDiff, lukeSees: lukeSees,
    homeHtml: homeHtml, kpiHtml: kpiHtml, CURRENCIES: CURRENCIES
  };
  root.HQLook = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
