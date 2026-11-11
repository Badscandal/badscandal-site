/* BADSCANDAL HQ · pure calculations for the page (11 Nov 2026). No DOM, no network: every rule the
   page shows is written here so tests/hq-lib.test.mjs can check it. Loaded in the browser as
   window.HQLib (plain <script>); in node the tests import it and read globalThis.HQLib. */
(function (root, factory) {
  var lib = factory();
  if (typeof module === "object" && module.exports) module.exports = lib;
  else root.HQLib = lib;
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* "just now" / "12 min ago" / "3 h ago" / "2 days ago" */
  function ago(ms) {
    if (ms == null || !isFinite(ms)) return "";
    var m = Math.max(0, Math.round(ms / 60000));
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    var h = Math.round(m / 60);
    return h < 48 ? h + " h ago" : Math.round(h / 24) + " days ago";
  }
  var t = function (iso) { var v = iso == null ? NaN : typeof iso === "number" ? iso : Date.parse(iso); return isFinite(v) ? v : null; };

  /* The "Data health" panel: Sheet, Meta, page counter, exchange rate, bots, and (when o.board is
     passed) the connector and the site's own check. state: ok | bad | off.
     sheet: the /api/hq/data answer (or null), sheetProblem: a plain reason when it couldn't be read,
     ov: the /api/admin/overview answer (or null). */
  function healthRows(o, now) {
    now = now || Date.now();
    var sheet = o.sheet, ov = o.ov, rows = [];
    /* Sheet */
    if (o.sheetProblem) rows.push({ key: "sheet", label: "Sheet", state: "bad", text: o.sheetProblem });
    else if (!sheet) rows.push({ key: "sheet", label: "Sheet", state: "off", text: "Not read yet" });
    else {
      var errs = Object.keys(sheet.sheetErrors || {});
      var at = t(sheet.health && sheet.health.sheetAt) || t(sheet.readAt);
      if (errs.length) rows.push({ key: "sheet", label: "Sheet", state: "bad", text: errs.length + " tab" + (errs.length > 1 ? "s show" : " shows") + " an error (" + errs.join(", ") + ")" + (at ? " · read " + ago(now - at) : "") });
      else rows.push({ key: "sheet", label: "Sheet", state: "ok", text: at ? "Read " + ago(now - at) : "Read" });
    }
    /* Meta (the read-only ads key) */
    var k = (ov && ov.metaKey) || (sheet && sheet.metaKey);
    if (!k) rows.push({ key: "meta", label: "Meta", state: "off", text: "Not read yet" });
    else if (k.state === "ok") rows.push({ key: "meta", label: "Meta", state: "ok", text: "Key reading OK" + (k.at ? ", last read " + ago(now - k.at) : "") });
    else if (k.state === "expired") rows.push({ key: "meta", label: "Meta", state: "bad", text: "The Meta key has expired: make a new one" });
    else if (k.state === "error") rows.push({ key: "meta", label: "Meta", state: "bad", text: k.text.replace(/^Meta key: /, "") });
    else rows.push({ key: "meta", label: "Meta", state: "off", text: k.text.replace(/^Meta key: /, "") });
    /* Page counter: the newest visit record (no visits for a while is not an error by itself) */
    if (!ov) rows.push({ key: "counter", label: "Page counter", state: "off", text: "Not read yet" });
    else if (!ov.lastEventAt) rows.push({ key: "counter", label: "Page counter", state: "off", text: "No visits in this range" });
    else rows.push({ key: "counter", label: "Page counter", state: now - ov.lastEventAt > 48 * 3600000 ? "off" : "ok", text: "Last visit " + ago(now - ov.lastEventAt) });
    /* Exchange rate (this month's ECB average) */
    var fx = sheet && sheet.health ? sheet.health.fx : null;
    if (!sheet) rows.push({ key: "fx", label: "Exchange rate", state: "off", text: "Not read yet" });
    else if (!fx) rows.push({ key: "fx", label: "Exchange rate", state: "bad", text: "This month's rate isn't read yet, so EUR estimates are missing" });
    else rows.push({ key: "fx", label: "Exchange rate", state: "ok", text: "1 EUR = " + fx.rate + " USD" + (fx.days ? " (average of " + fx.days + " days)" : "") + (t(fx.at) ? " · " + ago(now - t(fx.at)) : "") });
    /* Bots: their live log ("Updates" tab) */
    var live = sheet && sheet.team ? sheet.team.live : null;
    if (sheet) {
      if (!live || !live.ready) rows.push({ key: "bots", label: "Bots", state: "off", text: "No live updates yet: the Updates tab isn't in the sheet" });
      else if (!live.lastAt) rows.push({ key: "bots", label: "Bots", state: "off", text: "Updates tab is there; nothing logged yet" });
      else {
        var la = spMs(live.lastAt), du = sheet.team.duties || {};
        rows.push({ key: "bots", label: "Bots", state: la && now - la < 12 * 3600000 ? "ok" : "off",
          text: "Last update " + ago(now - la) + " (" + live.feed[0].bot + ")" + (du.total ? " · " + du.done + " of " + du.total + " duties done" : "") });
      }
    }
    /* Connector + Site check (the staff desk): only when the caller has asked for the board */
    if ("board" in o || o.boardProblem) rows = rows.concat(staffHealth(o.board, o.boardProblem, now));
    return rows;
  }
  /* "YYYY-MM-DD HH:MM" São Paulo (UTC-3, no summer time since 2019) -> ms */
  function spMs(s) { var v = Date.parse(String(s || "").replace(" ", "T") + ":00-03:00"); return isFinite(v) ? v : null; }
  /* the one dot on the header button: red if anything needs attention, green if all is fine */
  function healthState(rows) {
    if (rows.some(function (r) { return r.state === "bad"; })) return "bad";
    return rows.every(function (r) { return r.state === "ok"; }) ? "ok" : "off";
  }

  /* ================= Stage 2: Today as a morning briefing (11 Nov 2026) ================= */
  function fmt(n) { return n == null || !isFinite(n) ? "–" : Math.round(Number(n)).toLocaleString("en-US"); }
  function money(n, cur, whole) {
    if (n == null || !isFinite(n)) return "–";
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD", currencyDisplay: "code", maximumFractionDigits: whole ? 0 : 2, minimumFractionDigits: whole ? 0 : 2 }).format(n).replace(/ /g, " "); }
    catch (e) { return (whole ? Math.round(n) : Number(n).toFixed(2)) + " " + (cur || ""); }
  }
  function plural(n, one, many) { return fmt(n) + " " + (n === 1 ? one : many || one + "s"); }
  function day(d) { return d ? new Date(String(d).slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : ""; }
  function median(a) {
    var v = a.filter(function (x) { return x != null && isFinite(x); }).slice().sort(function (x, y) { return x - y; });
    if (!v.length) return null;
    var m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }
  /* "+12%" / "−8%" / "new" / "–": the change against the period before */
  function change(cur, prev) {
    if (cur == null || prev == null) return { text: "–", dir: "flat" };
    if (!prev) return cur ? { text: "new", dir: "up" } : { text: "–", dir: "flat" };
    var p = (cur - prev) / prev * 100;
    if (Math.abs(p) < 0.5) return { text: "same", dir: "flat" };
    return { text: (p > 0 ? "+" : "−") + Math.abs(p).toFixed(Math.abs(p) < 10 ? 1 : 0) + "%", dir: p > 0 ? "up" : "down" };
  }
  /* the release steps in short words, for sentences */
  var SHORT = { "Master, cover, details to Drop": "master and cover", "Submitted to RouteNote": "RouteNote", "Spotify pitch sent": "Spotify pitch",
    "Lyrics ready": "lyrics", "Video scheduled, song page live": "video and page", "Ad drafts ready": "ad drafts" };
  function shortStep(label) { return SHORT[label] || String(label || "").toLowerCase(); }
  var TAB_HREF = { Growth: "#growth", Songs: "#songs", Royalties: "#money", Fans: "#fans", Releases: "#releases", Tasks: "#team", Spend: "#money", Income: "#money" };
  function metaCur(ov) { return (ov && ((ov.yesterday && ov.yesterday.currency) || (ov.spend && ov.spend.currency))) || "USD"; }

  /* "Needs attention": every rule is here. Each item: { key, text, href }.
     - the monthly cap at warn (750) / stop (900) / over (1,000)
     - a late release step (any release not out yet, or out today)
     - a sheet tab showing an error (#REF!, #N/A, …)
     - the Meta key expired (code 190) or failing
     - a bot that hasn't logged for 3+ days (Spotify's numbers are 2 days late, so 2 is normal),
       and a bot duty that is blocked today
     - an ad that spent USD 10+ over the last 7 finished days with 0 real Spotify taps
     - yesterday: spend with 0 taps (USD 10+), or cost per tap more than double the middle value
       (median) of the 7 days before (needs 3+ of those days with taps)
     - the sheet's Meta spend disagreeing with Meta (by more than 1.00 on a day)
     - from the staff desk (o.board, see staffAttention()): messages waiting on Luke, income problems,
       the bots' connector switched off */
  function attention(o) {
    var sheet = o.sheet, ov = o.ov, out = [];
    if (sheet) {
      var c = sheet.money.cap;
      if (c.status === "over") out.push({ key: "cap", text: "Ad spend is over the " + fmt(c.amount) + " cap (" + money(c.spent, c.currency, true) + "): every ad must be off now", href: "#ads" });
      else if (c.status === "stop") out.push({ key: "cap", text: "Ad spend is past " + fmt(c.stop) + " (" + money(c.spent, c.currency, true) + "): every ad should be off for the rest of the month", href: "#ads" });
      else if (c.status === "warn") out.push({ key: "cap", text: "Ad spend is past " + fmt(c.warn) + " (" + money(c.spent, c.currency, true) + " of " + fmt(c.amount) + ")", href: "#ads" });
      (sheet.releases || []).forEach(function (r) {
        if (r.daysToGo != null && r.daysToGo < 0) return;
        r.steps.forEach(function (st) {
          if (st.late) out.push({ key: "late:" + r.song + ":" + st.label, text: "The " + shortStep(st.label) + " for " + r.song + " is late (" + st.owner + ", due " + day(st.due) + ")", href: "#releases" });
        });
      });
      Object.keys(sheet.sheetErrors || {}).forEach(function (tab) {
        out.push({ key: "sheet:" + tab, text: "The " + tab + " tab in the sheet shows an error (" + sheet.sheetErrors[tab].first + ")", href: TAB_HREF[tab] || "#today" });
      });
      ((sheet.team && sheet.team.team) || []).forEach(function (t) {
        if (t.lastLogged && t.quiet != null && t.quiet >= 3 && !/^luke$/i.test(t.owner)) out.push({ key: "quiet:" + t.owner, text: t.owner + " hasn't logged a number for " + t.quiet + " days", href: "#team" });
      });
      ((sheet.team && sheet.team.duties && sheet.team.duties.byOwner) || []).forEach(function (ow) {
        ow.items.forEach(function (d) {
          if (d.status === "blocked") out.push({ key: "duty:" + d.id, text: ow.owner + "'s duty is blocked: " + (d.blocker || d.task), href: "#team" });
          else if (d.late) out.push({ key: "dutylate:" + d.id, text: ow.owner + "'s duty is late (due " + d.due + "): " + d.task, href: "#team" });
        });
      });
      var src = sheet.money.metaSource;
      if (src && src.from === "meta" && src.mismatch && src.mismatch.length) out.push({ key: "mismatch", text: "The sheet's Meta spend differs from Meta on " + plural(src.mismatch.length, "day"), href: "#ads" });
    }
    var k = (ov && ov.metaKey) || (sheet && sheet.metaKey);
    if (k && k.state === "expired") out.push({ key: "key", text: "The Meta key has expired: make a new one", href: "#health" });
    else if (k && k.state === "error") out.push({ key: "key", text: "Meta can't be read: " + k.text.replace(/^Meta key: /, ""), href: "#health" });
    if (ov && ov.recent) {
      (ov.recent.ads7 || []).forEach(function (a) {
        if (a.currency === "USD" && a.spend >= 10 && !a.taps) out.push({ key: "ad:" + a.ad, text: "“" + a.ad + "” spent " + money(a.spend, "USD") + " in 7 days with no real Spotify taps", href: "#ads" });
      });
      var ds = ov.recent.days || [], y = ds[ds.length - 1], cur = metaCur(ov);
      if (y && y.spend != null) {
        if (!y.taps && y.spend >= 10 && cur === "USD") out.push({ key: "ytaps", text: "Yesterday " + money(y.spend, cur) + " was spent with no real Spotify taps", href: "#ads" });
        else if (y.taps && y.spend) {
          var base = ds.slice(0, -1).filter(function (x) { return x.taps && x.spend; }).map(function (x) { return x.spend / x.taps; });
          var med = base.length >= 3 ? median(base) : null, yc = y.spend / y.taps;
          if (med != null && yc > 2 * med) out.push({ key: "cpt", text: "Cost per tap yesterday was " + money(yc, cur) + ", more than double the usual " + money(med, cur), href: "#ads" });
        }
      }
    }
    /* the staff desk: messages waiting on Luke go first (he can act on them now), the rest after */
    var st = staffAttention(o.board);
    return st.filter(function (x) { return x.key === "msgs"; }).concat(out, st.filter(function (x) { return x.key !== "msgs"; }));
  }

  /* the 3 to 5 sentences at the top of Today */
  function briefing(o) {
    var sheet = o.sheet, ov = o.ov, att = o.attention || [], out = [];
    if (ov && ov.yesterday) {
      var y = ov.yesterday, cur = y.currency || metaCur(ov);
      if (y.spend) out.push(y.taps ? "Yesterday: " + money(y.spend, cur) + " for " + plural(y.taps, "real Spotify tap") + " (" + money(y.cpt, cur) + " each)."
        : "Yesterday: " + money(y.spend, cur) + " spent and no real Spotify taps.");
      else out.push("Yesterday: " + plural(y.taps, "real Spotify tap") + " from " + plural(y.people, "person", "people") + (y.spend === 0 ? ", with no ad spend." : "."));
    }
    if (sheet) {
      var c = sheet.money.cap;
      out.push({ ok: money(c.left, c.currency, true) + " left this month.", warn: "Ad spend is past " + fmt(c.warn) + ": " + money(c.spent, c.currency, true) + " of " + fmt(c.amount) + " this month.",
        stop: "Ad spend is past " + fmt(c.stop) + ": every ad should be off for the rest of the month.", over: "Ad spend is over the " + fmt(c.amount) + " cap: every ad must be off now." }[c.status]);
      var n = sheet.next;
      if (n) {
        var rel = (sheet.releases || []).filter(function (r) { return r.song === n.song; })[0];
        var late = rel ? rel.steps.filter(function (st) { return st.late; }) : [];
        out.push(n.song + (n.daysToGo === 0 ? " is out today" : " is out in " + plural(n.daysToGo, "day")) + "; " +
          (late.length ? (late.length === 1 ? "1 step is" : late.length + " steps are") + " late (" + late.map(function (st) { return shortStep(st.label) + ", " + st.owner; }).join("; ") + ")." : "everything is on time."));
      }
      var moving = (sheet.songs || []).filter(function (s) { return s.trend === "rising" || s.trend === "cooling"; })
        .sort(function (a, b) { return Math.abs(b.momentum) - Math.abs(a.momentum); })[0];
      if (moving) out.push(moving.song + " is " + moving.trend + ": " + fmt(moving.week) + " Spotify streams in 7 days, " + (moving.momentum > 0 ? "up " : "down ") + Math.abs(Math.round(moving.momentum)) + "%.");
    }
    out.push(att.length ? (att.length === 1 ? "1 thing needs you" : att.length + " things need you") + " below." : "Nothing needs you today.");
    return out.slice(0, 5);
  }

  /* "Since you last looked": a small picture of the numbers, kept on this device, and what moved */
  function snapshot(o) {
    var sheet = o.sheet, ov = o.ov, snap = { at: o.now || Date.now() };
    if (sheet) {
      snap.capSpent = sheet.money.cap.spent; snap.capCurrency = sheet.money.cap.currency; snap.month = sheet.money.cap.month;
      snap.streams = {}; (sheet.songs || []).forEach(function (s) { snap.streams[s.song] = s.total; });
      snap.followers = {}; (sheet.growth || []).forEach(function (g) { if (g.followers != null) snap.followers[g.platform] = g.followers; });
      snap.late = (sheet.releases || []).reduce(function (n, r) { return n + (r.daysToGo != null && r.daysToGo < 0 ? 0 : r.late); }, 0);
      snap.fans = sheet.fans ? sheet.fans.total : null;
      snap.dutiesDone = sheet.team && sheet.team.duties ? sheet.team.duties.done : null; snap.dutiesDay = sheet.today;
    }
    if (ov && ov.yesterday) { snap.yd = ov.yesterday.d; snap.yTaps = ov.yesterday.taps; }
    return snap;
  }
  function changesSince(prev, cur) {
    if (!prev || !cur) return [];
    var out = [];
    Object.keys(cur.streams || {}).forEach(function (song) {
      var a = (prev.streams || {})[song], b = cur.streams[song];
      if (a != null && b != null && b > a) out.push("+" + fmt(b - a) + " Spotify streams logged for " + song);
    });
    Object.keys(cur.followers || {}).forEach(function (p) {
      var a = (prev.followers || {})[p], b = cur.followers[p];
      if (a != null && b != null && b !== a) out.push((b > a ? "+" : "−") + fmt(Math.abs(b - a)) + " followers on " + p);
    });
    if (prev.capSpent != null && cur.capSpent != null && prev.month === cur.month && prev.capCurrency === cur.capCurrency && cur.capSpent - prev.capSpent >= 0.01)
      out.push(money(cur.capSpent - prev.capSpent, cur.capCurrency) + " more ad spend this month");
    if (prev.fans != null && cur.fans != null && cur.fans > prev.fans) out.push(plural(cur.fans - prev.fans, "new fan") + " noticed");
    if (prev.late != null && cur.late != null && cur.late !== prev.late) out.push(cur.late > prev.late ? plural(cur.late - prev.late, "more release step") + " late" : plural(prev.late - cur.late, "late step") + " done");
    if (prev.dutiesDay === cur.dutiesDay && cur.dutiesDone > prev.dutiesDone) out.push(plural(cur.dutiesDone - prev.dutiesDone, "more duty", "more duties") + " done today");
    if (prev.yd !== cur.yd && cur.yTaps != null) out.push("A new day closed: " + plural(cur.yTaps, "real Spotify tap") + " on " + day(cur.yd));
    return out;
  }

  /* headline tiles: value, change vs the period before, a small trend line */
  function tiles(o) {
    var sheet = o.sheet, ov = o.ov, out = [];
    if (ov) {
      var vs = ov.range === "today" ? "vs yesterday by now" : "vs the " + plural(ov.days, "day") + " before";
      var cur = metaCur(ov), ser = ov.series || [];
      var sumOf = function (f) { return ser.reduce(function (n, x) { return n + (f(x) || 0); }, 0); };
      var taps = sumOf(function (x) { return x.taps; });
      if (ov.spend && ov.spend.connected && !ov.spend.error) {
        var sp = sumOf(function (x) { return x.spend; });
        out.push({ key: "spend", label: "Ad spend", value: money(sp, cur), change: change(sp, ov.prev.spend), vs: vs, series: ser.map(function (x) { return x.spend; }) });
        out.push({ key: "taps", label: "Real Spotify taps", value: fmt(taps), green: true, change: change(taps, ov.prev.taps), vs: vs, series: ser.map(function (x) { return x.taps; }) });
        out.push({ key: "cpt", label: "Cost per tap", value: taps ? money(sp / taps, cur) : "–", change: change(taps ? sp / taps : null, ov.prev.taps ? ov.prev.spend / ov.prev.taps : null), vs: vs,
          series: ser.map(function (x) { return x.taps ? x.spend / x.taps : null; }) });
      } else out.push({ key: "taps", label: "Real Spotify taps", value: fmt(taps), green: true, change: change(taps, ov.prev ? ov.prev.taps : null), vs: vs, series: ser.map(function (x) { return x.taps; }) });
    }
    if (sheet && (sheet.songs || []).length) {
      var bydate = function (key) { var m = {}; sheet.songs.forEach(function (s) { (s[key] || []).forEach(function (p) { m[p.d] = (m[p.d] || 0) + p.v; }); }); return Object.keys(m).sort().slice(-14).map(function (d) { return m[d]; }); };
      var week = sheet.songs.reduce(function (n, s) { return n + (s.week || 0); }, 0);
      var prevWeek = sheet.songs.every(function (s) { return s.prevWeek != null; }) ? sheet.songs.reduce(function (n, s) { return n + s.prevWeek; }, 0) : null;
      out.push({ key: "streams", label: "Spotify streams, 7 days", value: fmt(week), change: change(week, prevWeek), vs: "vs the 7 days before", series: bydate("series") });
      var ls = bydate("listenersSeries"), lnow = ls.length ? ls[ls.length - 1] : null, lthen = ls.length > 7 ? ls[ls.length - 8] : null;
      out.push({ key: "listeners", label: "Spotify listeners", value: fmt(lnow), change: change(lnow, lthen), vs: "vs 7 days earlier", series: ls });
    }
    if (sheet) (sheet.growth || []).forEach(function (g) {
      out.push({ key: "f:" + g.platform, label: g.platform + " followers", value: fmt(g.followers), change: g.week == null ? { text: "–", dir: "flat" } : { text: (g.week > 0 ? "+" : g.week < 0 ? "−" : "") + fmt(Math.abs(g.week)), dir: g.week > 0 ? "up" : g.week < 0 ? "down" : "flat" },
        vs: "in 7 days", series: (g.series || []).slice(-14).map(function (p) { return p.v; }) });
    });
    return out;
  }

  /* "Copy today's summary": plain text for WhatsApp */
  function summaryText(o) {
    var lines = ["BADSCANDAL · " + (o.date || "")].concat(o.briefing || []);
    if ((o.attention || []).length) { lines.push("", "Needs attention:"); o.attention.forEach(function (a) { lines.push("• " + a.text); }); }
    var t = o.tiles || [];
    if (t.length) { lines.push(""); t.forEach(function (x) { lines.push(x.label + ": " + x.value + (x.change && x.change.text !== "–" ? " (" + x.change.text + " " + x.vs + ")" : "")); }); }
    return lines.join("\n");
  }

  /* The release panel (Today "Next release" and Releases): every step, what's missing first.
     today: "YYYY-MM-DD". -> { song, date, daysToGo, summary, missing: [...], done: [...] } */
  function releaseDetail(r, today) {
    if (!r) return null;
    var dd = function (a, b) { return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000); };
    var steps = r.steps.map(function (st) {
      var when = !st.due ? "no date yet" : st.done ? "done" : st.late ? "late by " + plural(dd(st.due, today), "day") : st.due === today ? "due today" : "due in " + plural(dd(today, st.due), "day");
      var note = String(st.note || "").trim();
      return { label: st.label, owner: st.owner, due: st.due, done: st.done, late: st.late, when: when, note: /^(done|yes|✓|✔)$/i.test(note) ? "" : note };
    });
    var missing = steps.filter(function (x) { return !x.done; }).sort(function (a, b) { return (b.late - a.late) || ((a.due || "9") < (b.due || "9") ? -1 : 1); });
    var done = steps.filter(function (x) { return x.done; });
    var late = missing.filter(function (x) { return x.late; }).length;
    return { song: r.song, date: r.date, daysToGo: r.daysToGo, weekday: r.weekday, status: r.status, notes: r.notes,
      summary: done.length + " of " + steps.length + " steps done" + (late ? " · " + late + " late" : "") + (missing.length - late ? " · " + (missing.length - late) + " to do" : ""),
      missing: missing, done: done };
  }

  /* ================= The staff desk (11 Nov 2026): Team as the workers section, Messages, money coming in =================
     board = the /api/staff/board answer (netlify/lib/staff.mjs board()). Everything on it was written by
     bots or people: these functions only return plain text; the page escapes it when it draws. */
  var lc = function (s) { return String(s == null ? "" : s).trim().toLowerCase(); };
  /* "Nova" -> "nova": the card's address (#team/nova) */
  function slug(name) { return lc(name).replace(/[^a-z0-9]/g, ""); }

  /* ---- Team: one card per bot ---- */
  var STATE_ORDER = ["blocked", "late", "quiet", "todo", "working", "done", "idle", "paused"];
  var STATE_LABEL = { blocked: "Blocked", late: "Late", quiet: "Quiet today", todo: "To do", working: "Working", done: "Done", idle: "No duty today", paused: "Paused" };
  function workerLabel(state) { return STATE_LABEL[state] || STATE_LABEL.idle; }
  /* what needs a look first: blocked, late, quiet, to do, working, done, no duty, paused (then by name) */
  function sortWorkers(staff) {
    var rank = function (w) { var i = STATE_ORDER.indexOf(w.state); return i < 0 ? STATE_ORDER.indexOf("idle") : i; };
    return (staff || []).slice().sort(function (a, b) { return rank(a) - rank(b) || (lc(a.name) < lc(b.name) ? -1 : lc(a.name) > lc(b.name) ? 1 : 0); });
  }
  /* The board's own "last word" per bot only knows the connector. A bot may still write the sheet's
     Updates tab: take whichever word is newer, and let it count for "Quiet today" / "Blocked" the way
     the connector's does. sheet = the /api/hq/data answer (or null). */
  function workerView(w, sheet, today) {
    var bots = (sheet && sheet.team && sheet.team.live && sheet.team.live.bots) || [];
    var sb = bots.filter(function (b) { return lc(b.bot) === lc(w.name); })[0];
    var last = w.last || null;
    if (sb && sb.lastAt && (!last || sb.lastAt > last.at)) last = { at: sb.lastAt, status: sb.status, message: sb.message, link: sb.link || "" };
    var state = STATE_ORDER.indexOf(w.state) >= 0 ? w.state : "idle";
    var isToday = !!(last && today && String(last.at).slice(0, 10) === today);
    if (state === "quiet" && isToday) state = "idle";
    if (isToday && (last.status === "blocked") && ["idle", "quiet", "todo", "working", "late"].indexOf(state) >= 0) state = "blocked";
    var out = {}; Object.keys(w).forEach(function (k) { out[k] = w[k]; });
    out.last = last; out.state = state;
    return out;
  }
  /* one duty's right-hand words, sentence case, said once: "late · due 00:30", never a second pill */
  function dutyWhen(d) {
    if (!d) return "";
    if (d.status === "done") return "done";
    if (d.status === "blocked") return "blocked";
    if (d.late) return "late" + (d.due ? " · due " + d.due : "");
    if (d.working) return "working" + (d.due ? " · due " + d.due : "");
    return d.due ? "due " + d.due : "to do";
  }
  /* "3 open tasks · 1 late · 2 messages waiting on it" (only what isn't zero) */
  function workerCounts(w) {
    var open = (w.tasks || []).length, late = w.lateTasks || 0, wait = (w.waiting || []).length, out = [];
    if (open) out.push(plural(open, "open task"));
    if (late) out.push(late + " late");
    if (wait) out.push(plural(wait, "message") + " waiting on it");
    return out.join(" · ");
  }
  function seenLine(w, now) {
    var at = t(w && w.seen);
    return at ? "Last used the connector " + ago((now || Date.now()) - at) : "Hasn't used the connector yet";
  }
  /* the strip at the top of Team */
  function connectorLine(board, now) {
    now = now || Date.now();
    var c = (board && board.connector) || {}, keys = (board && board.keys) || {}, on = c.botsOn !== false, notes = [];
    var rest = (c.connected || 0) + " of " + (c.total || 0) + " bots have used it";
    var lu = c.lastUsed && t(c.lastUsed.at);
    if (lu) rest += " · last used " + ago(now - lu) + " (" + c.lastUsed.bot + ")";
    if (keys.bots === false) notes.push("The connector's key isn't set on the site yet.");
    if (!on) notes.push("Switched off" + (t(c.changedAt) ? " " + ago(now - t(c.changedAt)) : "") + ". No bot can send updates, messages or payments until you switch it back on.");
    else if (!c.connected) notes.push("No bot has connected yet. It starts when the connector is added in the bots' app.");
    return { on: on, head: "Bots' connector: " + (on ? "on" : "off"), rest: rest, notes: notes };
  }
  /* "Copy message for Nova": plain text about one blocked or late bot */
  function novaMessage(w) {
    var lines = ["Nova, please look at " + w.name + (w.role ? " (" + w.role + ")" : "") + ".", "State: " + workerLabel(w.state)];
    var bad = (w.duties || []).filter(function (d) { return d.status === "blocked" || d.late; });
    bad.forEach(function (d) { lines.push("Duty: " + d.task + " (" + dutyWhen(d) + ")"); if (d.blocker) lines.push("Blocker: " + d.blocker); });
    if (!bad.some(function (d) { return d.blocker; }) && w.blockers) lines.push("Known blocker: " + w.blockers);
    if (w.card && w.card.needs) lines.push("Needs: " + w.card.needs);
    if (w.last && w.last.message) lines.push("Latest update (" + String(w.last.at).slice(11) + "): " + w.last.message);
    return lines.join("\n");
  }
  /* ONE live log: what came through the connector (board.updates) and the sheet's Updates tab
     (sheet.team.live.feed), the same line never twice, newest first. Either side may be missing. */
  function liveFeed(board, sheet) {
    var seen = {}, out = [];
    var add = function (at, u) {
      if (!at || !u || !u.bot) return;
      var k = [String(at).slice(0, 10), lc(u.bot), lc(u.status), lc(u.message)].join("|");
      if (seen[k]) return;
      seen[k] = 1; out.push({ at: String(at), bot: u.bot, status: u.status || "info", message: u.message || "", link: u.link || "" });
    };
    ((board && board.updates) || []).forEach(function (u) { add(u.sp, u); });
    ((sheet && sheet.team && sheet.team.live && sheet.team.live.feed) || []).forEach(function (u) { add(u.at, u); });
    return out.map(function (u, i) { return [u, i]; }).sort(function (a, b) { return a[0].at < b[0].at ? 1 : a[0].at > b[0].at ? -1 : a[1] - b[1]; }).map(function (x) { return x[0]; });
  }

  /* ---- Messages ---- */
  /* "09:15" today, "Mon 9 Nov, 09:15" before (sp = "YYYY-MM-DD HH:MM", São Paulo) */
  function spWhen(sp, today) {
    var s = String(sp || ""), hm = s.slice(11, 16);
    if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return "";
    return s.slice(0, 10) === today ? hm : day(s) + (hm ? ", " + hm : "");
  }
  /* the small label on a message: who it waits on, or how it ended. null = it never asked for anything */
  function waitLabel(m) {
    if (!m || !m.needs || m.needs === "none") return null;
    if (!m.resolved) return { text: "waiting on " + (m.to === "Luke" ? "you" : m.to === "all" ? "everyone" : m.to), open: true, mine: m.to === "Luke" };
    if (m.resolved.note === "answered") return { text: "answered by " + (m.resolved.by === "Luke" ? "you" : m.resolved.by), open: false, mine: false };
    return { text: "done", open: false, mine: false };
  }
  /* what a message waiting on Luke wants, in his words */
  function needWords(m) { return { decision: "needs a decision", action: "asks you to do something", reply: "needs a reply" }[m && m.needs] || "wrote"; }
  /* the site's own check ("report"): first line = the title, the rest collapsed after `max` lines */
  function reportParts(text, max) {
    max = max || 8;
    var lines = String(text || "").split("\n"), title = lines.shift() || "";
    while (lines.length && !lines[0].trim()) lines.shift();
    return { title: title, head: lines.slice(0, max).join("\n"), rest: lines.slice(max).join("\n"), more: Math.max(0, lines.length - max) };
  }
  /* Today, under the briefing: "Site check 09:50: 3 things to look at" */
  function checkResult(report) {
    var title = String((report && report.text) || "").split("\n")[0], i = title.indexOf(": ");
    return i >= 0 ? title.slice(i + 2) : title;
  }
  function siteCheckLine(report, today) {
    if (!report || !report.text) return "";
    var when = spWhen(report.sp, today);
    return "Site check" + (when ? " " + when : "") + ": " + checkResult(report);
  }
  /* who Luke can write to: Nova first, then Claude, every other bot, then everyone */
  function composeNames(names) {
    var bots = (names || []).filter(function (n) { return ["Luke", "Claude", "HQ"].indexOf(n) < 0; });
    var out = [];
    if (bots.indexOf("Nova") >= 0) out.push({ value: "Nova", label: "Nova" });
    out.push({ value: "Claude", label: "Claude" });
    bots.forEach(function (n) { if (n !== "Nova") out.push({ value: n, label: n }); });
    out.push({ value: "all", label: "Everyone" });
    return out;
  }
  /* The board shows a message and, under it, its answers (one level). So an answer must point at the
     message that STARTS the thread, or it would not be drawn. -> that message's id */
  function threadRoot(board, m) {
    if (!m) return "";
    var hit = ((board && board.messages) || []).filter(function (th) { return th.id === m.id || th.id === m.re || (th.replies || []).some(function (r) { return r.id === m.id || r.id === m.re; }); })[0];
    return hit ? hit.id : m.id;
  }

  /* ---- Today ---- */
  /* "Needs attention" from the staff desk: messages waiting on Luke, income problems (3 at most,
     then "+N more"), the bots' connector switched off. */
  function staffAttention(board) {
    if (!board) return [];
    var out = [], n = ((board.waiting && board.waiting.luke) || []).length;
    if (n) out.push({ key: "msgs", text: n === 1 ? "1 message is waiting on you" : n + " messages are waiting on you", href: "#messages" });
    var p = incomeProblems(board.income);
    p.slice(0, 3).forEach(function (x, i) { out.push({ key: "income:" + i, text: "Income: " + x, href: "#money" }); });
    if (p.length > 3) out.push({ key: "income:more", text: "Income: +" + (p.length - 3) + " more", href: "#money" });
    if (board.connector && board.connector.botsOn === false) out.push({ key: "connector", text: "The bots' connector is switched off", href: "#team" });
    return out;
  }

  /* ---- Data health: "Connector" and "Site check" ---- */
  function staffHealth(board, problem, now) {
    now = now || Date.now();
    if (problem) return [{ key: "connector", label: "Connector", state: "bad", text: problem }, { key: "check", label: "Site check", state: "off", text: "Not read yet" }];
    if (!board) return [{ key: "connector", label: "Connector", state: "off", text: "Not read yet" }, { key: "check", label: "Site check", state: "off", text: "Not read yet" }];
    var rows = [], c = board.connector || {}, keys = board.keys || {}, lu = c.lastUsed && t(c.lastUsed.at);
    if (keys.bots === false) rows.push({ key: "connector", label: "Connector", state: "off", text: "The connector's key isn't set on the site yet" });
    else if (c.botsOn === false) rows.push({ key: "connector", label: "Connector", state: "bad", text: "Switched off" + (t(c.changedAt) ? " " + ago(now - t(c.changedAt)) : "") + ": the bots can't send anything" });
    else if (!c.connected) rows.push({ key: "connector", label: "Connector", state: "off", text: "On · no bot has connected yet" });
    else rows.push({ key: "connector", label: "Connector", state: "ok", text: "On · " + c.connected + " of " + c.total + " bots connected" + (lu ? " · last used " + ago(now - lu) + " (" + c.lastUsed.bot + ")" : "") });
    var r = board.report, at = r && t(r.at);
    if (!r || !at) rows.push({ key: "check", label: "Site check", state: "off", text: "No check yet. The site checks itself twice a day" });
    else {
      /* twice a day: more than 26 hours without one means it didn't run */
      var res = checkResult(r);
      rows.push({ key: "check", label: "Site check", state: now - at > 26 * 3600000 ? "bad" : "ok", text: "Last check " + ago(now - at) + (res ? ": " + res : "") });
    }
    return rows;
  }

  /* ---- Money coming in ---- */
  /* { USD: 104.04, EUR: 112.01 } -> ["USD 104.04", "EUR 112.01"]: each currency as given, never added, never converted */
  function curList(o) { return Object.keys(o || {}).sort().map(function (c) { return money(o[c], c); }); }
  var CADENCE = { daily: "Every day", monthly: "Every month", quarterly: "Every 3 months", irregular: "Irregular" };
  function cadenceWord(c) { return CADENCE[c] || "Irregular"; }
  /* an account tile: "checked today by Ledger · 0 new" / "not checked today". attn only for never / overdue / blocked */
  function accountLine(a, today) {
    var v = a.verdict, c = a.checked;
    if (v === "blocked") return { text: "blocked: " + (a.blocker || a.why || "no reason given"), attn: true };
    if (v === "not_tracked") return { text: "nobody is checking this yet", attn: false };
    if (v === "never") return { text: "never checked through the connector", attn: true };
    if (v === "overdue") return { text: "not checked since " + day(a.lastLook), attn: true };
    if (v === "due") return { text: "not checked today" + (a.lastLook ? " · last look " + day(a.lastLook) : ""), attn: false };
    if (c && c.day === today) return { text: "checked today by " + c.by + " · " + c.new + " new", attn: false };
    return { text: "a payment was logged today", attn: false };
  }
  /* a source's state in plain words. attn for overdue / blocked */
  function sourceState(s) {
    var v = s.verdict;
    if (v === "ok") return { text: "Up to date", attn: false };
    if (v === "overdue") return { text: "Overdue", attn: true };
    if (v === "never") return { text: "Nothing logged yet", attn: false };
    if (v === "quiet") return { text: "Nothing yet (irregular)", attn: false };
    if (v === "blocked") return { text: "Blocked: " + (s.blocker || s.why || "no reason given"), attn: true };
    if (v === "not_tracked") return { text: "Nobody is logging this yet", attn: false };
    return { text: "Not read", attn: false };
  }
  /* what to look at, as the desk found it; a payer nobody has named yet is said in our own words
     ("New payer not on the list: …") instead of the desk's line about it */
  function incomeProblems(inc) {
    var out = ((inc && inc.problems) || []).filter(function (p) { return !/^New payer\(s\) not on the list/.test(p); });
    var u = (inc && inc.unknown) || [];
    if (u.length) out.push((u.length === 1 ? "New payer not on the list: " : "New payers not on the list: ") + u.join(", "));
    return out;
  }
  /* "Mon 9 Nov · USD 104.04 · received" */
  function payLine(p) { return p ? day(p.date) + " · " + money(p.amount, p.currency) + " · " + p.status : "none logged yet"; }
  /* nothing submitted and no list of sources yet */
  function incomeEmpty(inc) { return !inc || (!inc.count && !(inc.sources || []).length && !(inc.entries || []).length); }

  return { ago: ago, spMs: spMs, releaseDetail: releaseDetail, healthRows: healthRows, healthState: healthState, median: median, change: change, money: money, attention: attention, briefing: briefing,
    snapshot: snapshot, changesSince: changesSince, tiles: tiles, summaryText: summaryText, shortStep: shortStep, day: day,
    slug: slug, workerLabel: workerLabel, sortWorkers: sortWorkers, workerView: workerView, dutyWhen: dutyWhen, workerCounts: workerCounts, seenLine: seenLine, connectorLine: connectorLine,
    novaMessage: novaMessage, liveFeed: liveFeed, spWhen: spWhen, waitLabel: waitLabel, needWords: needWords, reportParts: reportParts, siteCheckLine: siteCheckLine, composeNames: composeNames,
    threadRoot: threadRoot, staffAttention: staffAttention, staffHealth: staffHealth, curList: curList, cadenceWord: cadenceWord, accountLine: accountLine, sourceState: sourceState, payLine: payLine,
    incomeEmpty: incomeEmpty, incomeProblems: incomeProblems };
});
