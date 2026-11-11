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
    /* Revolut (the bank reader): only when the caller has asked for its state */
    if ("bank" in o || o.bankProblem) rows.push(bankHealth(o.bank, o.bankProblem, now));
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
    "Lyrics ready": "lyrics", "Video scheduled, song page live": "video and page", "Ad drafts ready": "ad drafts",
    /* the release pipeline's own steps (staff desk, 11 Nov 2026): the same short words */
    "Uploaded to RouteNote with the release date": "RouteNote upload", "Approved by RouteNote (nothing waiting)": "RouteNote approval", "Lyrics live": "lyrics",
    "Song page live on badscandal.com": "song page", "Video scheduled on YouTube": "video", "Teaser clips approved for posting": "teaser clips",
    "Ad drafts ready, inside the cap": "ad drafts", "Release day: Spotify link on the song page and the home card": "release-day links",
    /* v2 (11 Nov 2026, evening): the song showing in Spotify for Artists, before the pitch */
    "Showing as upcoming in Spotify for Artists": "Spotify for Artists" };
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
       the bots' connector switched off
     - Revolut (o.bank + o.board, see bankAttention()): payments to sort, the approval gone or ending */
  function attention(o) {
    var sheet = o.sheet, ov = o.ov, out = [];
    if (sheet) {
      var c = sheet.money.cap;
      if (c.status === "over") out.push({ key: "cap", text: "Ad spend is over the " + fmt(c.amount) + " cap (" + money(c.spent, c.currency, true) + "): every ad must be off now", href: "#ads" });
      else if (c.status === "stop") out.push({ key: "cap", text: "Ad spend is past " + fmt(c.stop) + " (" + money(c.spent, c.currency, true) + "): every ad should be off for the rest of the month", href: "#ads" });
      else if (c.status === "warn") out.push({ key: "cap", text: "Ad spend is past " + fmt(c.warn) + " (" + money(c.spent, c.currency, true) + " of " + fmt(c.amount) + ")", href: "#ads" });
      (sheet.releases || []).forEach(function (r) {
        if (r.daysToGo != null && r.daysToGo < 0) return;
        /* a desk release says what its lateness MEANS in its warnings (below), never the bare step twice */
        if (r.desk && (o.board || Array.isArray(r.warnings))) return;
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
    /* the warnings on the releases still coming (v2): right after the cap, at most 4 */
    var cap = out.filter(function (x) { return x.key === "cap"; });
    out = cap.concat(releaseAttention(sheet, o.board), out.filter(function (x) { return x.key !== "cap"; }));
    /* the staff desk: messages waiting on Luke go first (he can act on them now), and with them a song in
       Spotify for Artists only he can say what it is (review, 11 Nov 2026: it sat ninth of ten); the rest after */
    var st = staffAttention(o.board, o.bank).concat(bankAttention(o.bank, o.board)), first = function (x) { return x.key === "msgs" || x.key === "spotify"; };
    return st.filter(first).concat(out, st.filter(function (x) { return !first(x); }));
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

  /* Is a song out? (Luke, 11 Nov 2026: "when a song is released it should say released", in HERE, not
     on the public song page.) date / today: "YYYY-MM-DD" (São Paulo). -> null without a date, else
     { out, pill, label, line }: pill for the card's head, label + line for a labelled row. */
  function releaseWords(date, today) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(today || ""))) return null;
    var n = Math.round((Date.parse(today + "T12:00:00Z") - Date.parse(date + "T12:00:00Z")) / 86400000);
    if (n > 0) return { out: true, days: n, pill: "Released", label: "Released", line: day(date) + " · " + plural(n, "day") + " ago" };
    if (n === 0) return { out: true, days: 0, pill: "Released today", label: "Released", line: day(date) + " · today" };
    return { out: false, days: n, pill: "Out in " + plural(-n, "day"), label: "Release day", line: day(date) + " · in " + plural(-n, "day") };
  }

  /* The release panel (Today "Next release" and Releases): every step, what's missing first.
     today: "YYYY-MM-DD". -> { song, date, daysToGo, summary, missing: [...], done: [...] } */
  function releaseDetail(r, today) {
    if (!r) return null;
    var dd = function (a, b) { return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000); };
    var steps = r.steps.map(function (st) {
      /* v2: a step the label delivers is "not ours"; the pitch waits (never late) until the song shows in
         Spotify for Artists */
      var when = st.skipped ? "not ours" : st.done ? "done" : st.waiting && !st.late ? st.waitingText || "waiting" : !st.due ? "no date yet" : st.late ? "late by " + plural(dd(st.due, today), "day") : st.due === today ? "due today" : "due in " + plural(dd(today, st.due), "day");
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
    /* a late or blocked release step makes a card late / blocked too (11 Nov 2026): say which */
    (w.releaseSteps || []).filter(function (s) { return s.status === "blocked" || s.late; }).forEach(function (s) {
      lines.push("Release step: " + s.title + ": " + s.label + " (" + stepState(s, "").text + ")");
    });
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

  /* Which message Luke's answer goes to (11 Nov 2026, Luke: "when i reply to a message right now nothing
     happens"). From "Waiting on you" it is the message itself (the desk files an answer under any message,
     however deep in its thread). From a thread's Reply button on the board it is the newest question in
     that thread still waiting on Luke from the one he is answering, so that question is closed and leaves
     "Waiting on you"; when nothing there waits on him, the thread's first message. th = a board thread. */
  function answerTarget(th) {
    if (!th) return null;
    var who = th.from === "Luke" ? th.to : th.from;
    var open = [th].concat(th.replies || []).filter(function (x) {
      return x && !x.resolved && x.needs && x.needs !== "none" && x.to === "Luke" && x.from !== "Luke" && (who === "all" || x.from === who);
    }).sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
    return open.length ? open[open.length - 1] : th;
  }

  /* ---- Today ---- */
  /* "Needs attention" from the staff desk: messages waiting on Luke, income problems (3 at most,
     then "+N more"), the bots' connector switched off. */
  function staffAttention(board, bank) {
    if (!board) return [];
    var out = [], n = ((board.waiting && board.waiting.luke) || []).length;
    if (n) out.push({ key: "msgs", text: n === 1 ? "1 message is waiting on you" : n + " messages are waiting on you", href: "#messages" });
    /* v2: a song Spotify for Artists shows that never went through the pipeline is a question for Luke */
    var su = board.sightings && board.sightings.unknown;
    if (su) out.push({ key: "spotify", text: su === 1 ? "Spotify for Artists shows 1 song that didn't go through the pipeline: say what it is" : "Spotify for Artists shows " + su + " songs that didn't go through the pipeline: say what they are", href: "#releases/spotify" });
    var p = incomeProblems(board.income, bank);
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
    if (!r || !at) rows.push({ key: "check", label: "Site check", state: "off", text: "No check yet. The site checks itself three times a day" });
    else {
      /* three times a day since 11 Nov 2026 (09:35, 15:35, 21:35 São Paulo): the longest gap is the 12
         hours overnight, so more than 14 hours without one means a check didn't run */
      var res = checkResult(r);
      rows.push({ key: "check", label: "Site check", state: now - at > 14 * 3600000 ? "bad" : "ok", text: "Last check " + ago(now - at) + (res ? ": " + res : "") });
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
     ("New payer not on the list: …") instead of the desk's line about it. bank = Revolut's state
     (GET /api/bank/status): once the reader is set up, the desk's own lines about its "Revolut" account
     ("Revolut: blocked. …", "Revolut: not checked today") go, because the Revolut tile, bankAttention
     and Data health say Revolut's state from the reader itself */
  function incomeProblems(inc, bank) {
    /* the desk's "N payments in Revolut that nobody has sorted yet" has its own block ("To sort") and
       its own line on Today (bankAttention), so it is not said a third time here */
    var reader = !!(bank && bank.configured);
    var out = ((inc && inc.problems) || []).filter(function (p) { return !/^New payer\(s\) not on the list/.test(p) && !/ that nobody has sorted yet$/.test(p) && !(reader && /^Revolut:/i.test(p)); });
    var u = (inc && inc.unknown) || [];
    if (u.length) out.push((u.length === 1 ? "New payer not on the list: " : "New payers not on the list: ") + u.join(", "));
    return out;
  }
  /* "Mon 9 Nov · USD 104.04 · received" */
  function payLine(p) { return p ? day(p.date) + " · " + money(p.amount, p.currency) + " · " + p.status : "none logged yet"; }
  /* nothing submitted and no list of sources yet */
  function incomeEmpty(inc) { return !inc || (!inc.count && !(inc.sources || []).length && !(inc.entries || []).length); }

  /* ================= Replies that visibly land (11 Nov 2026) =================
     Luke: "when i reply to a message right now nothing happens let's make that clearer that i've
     replied". So: the item leaves "Waiting on you" at once, a line says where it went and when, and
     "You answered" shows whether the bot has looked at the desk since. */
  /* an ISO time or ms -> "YYYY-MM-DD HH:MM" in São Paulo (UTC-3, no summer time since 2019) */
  function spStampOf(at) { var v = t(at); return v == null ? "" : new Date(v - 3 * 3600000).toISOString().slice(0, 16).replace("T", " "); }
  var CLAUDE_ROUNDS = "Claude reads the desk at 09:40, 15:40 and 21:40.";
  /* the small mark on a message: "Read by Nova 17:10" / "Not read yet" (v2, 11 Nov 2026: READ, from the
     desk's read markers, which only the tools that hand a bot its messages write; no longer "the bot used
     the desk"). A note to everyone: "Read by 7 of 12" (x.read = { by, of }). null when nobody can read it
     (to Luke, to HQ). x = { to, seen, seenAt, read } as the board sends it. */
  function seenWords(x, today) {
    if (!x || !x.to) return null;
    if (x.to === "all") {
      var r = x.read;
      if (!r || !r.of) return null;
      return r.by ? { seen: true, text: "Read by " + r.by + " of " + r.of, note: "" } : { seen: false, text: "Not read yet", note: "" };
    }
    if (x.seen == null) return null;
    if (x.seen) { var w = spWhen(spStampOf(x.seenAt), today); return { seen: true, text: "Read by " + x.to + (w ? " " + w : ""), note: "" }; }
    return { seen: false, text: "Not read yet", note: x.to === "Claude" ? CLAUDE_ROUNDS : "" };
  }
  /* the line that takes the place of what Luke just answered. kind: reply | option | done | message */
  function sentLine(kind, to, at, choice) {
    var who = to === "all" ? "everyone" : to || "", hm = spStampOf(at).slice(11, 16), out;
    if (kind === "option") out = "Your answer “" + choice + "” went to " + who + " at " + hm + ".";
    else if (kind === "done") out = "Marked as done at " + hm + ". " + who + " sees it on the desk.";
    else out = "Sent to " + who + " at " + hm + ".";
    return to === "Claude" ? out + " " + CLAUDE_ROUNDS : out;
  }
  /* "You answered": the board's list (board.answered), each with what was asked, what Luke said and
     whether the bot has seen it. An answer to a message deep in a thread is filed by the desk under
     the thread's first message, and that message is then closed with a separate "mark as done": the
     words Luke typed are found again in the thread, so it never reads "Marked as done" for a reply. */
  function answeredList(board) {
    var today = board && board.today, threadsOf = (board && board.messages) || [];
    return ((board && board.answered) || []).map(function (a) {
      var r = a.reply || {}, text = r.text || "", kind = r.kind || "reply";
      if (kind === "settled" && text === "Marked as done") {
        var th = threadsOf.filter(function (x) { return x.id === a.id || (x.replies || []).some(function (y) { return y.id === a.id; }); })[0];
        var mine = th ? (th.replies || []).filter(function (y) { return y.from === "Luke" && y.to === a.from && t(y.at) <= t(r.at) && t(r.at) - t(y.at) < 120000; }) : [];
        if (mine.length) { text = mine[mine.length - 1].text; kind = "reply"; }
      }
      var say = kind === "reply" ? "You: " + text : text === "Marked as done" ? "You marked it as done." : "You answered: " + text;
      var seen = seenWords({ to: a.from, seen: r.seen, seenAt: r.seenAt }, today), sent = r.sp ? "Sent " + spWhen(r.sp, today) : "";
      return { id: a.id, who: a.from, asked: needWords(a).replace(/^needs/, "needed").replace(/^asks/, "asked"), their: a.text, when: spWhen(r.sp, today),
        you: text, say: say, kind: kind, seen: seen,
        /* "Sent 17:03 · Read by Ledger 17:10" / "Sent 17:03 · Not read yet" (v2) */
        status: [sent, seen ? seen.text : ""].filter(Boolean).join(" · ") };
    });
  }

  /* ================= The release pipeline on /hq (11 Nov 2026) =================
     board.releases = the desk's releases (netlify/lib/staff.mjs releaseView), board.packFields = every
     field of a release, board.releaseSteps = the steps. The page never hard-codes either list. */
  var dayDiff = function (a, b) { return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000); };
  var isDay = function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) && isFinite(Date.parse(d + "T12:00:00Z")); };
  /* v2 (11 Nov 2026, evening): "Whose release is it" first, right under the title and the day */
  var GROUPS = [["deal", "Whose release is it"], ["files", "The files"], ["stores", "For the stores"], ["lyrics", "Lyrics"], ["pitch", "For the pitch (can wait)"], ["later", "Later, the team fills these"], ["notes", "Notes"]];
  /* the form's sections, in Luke's order; a field in a group we don't know goes under Notes' heading */
  function formGroups(fields) {
    var known = GROUPS.map(function (g) { return g[0]; });
    return GROUPS.map(function (g) {
      return { key: g[0], title: g[1], fields: (fields || []).filter(function (f) { return f.group === g[0] || (g[0] === "notes" && known.indexOf(f.group) < 0); }) };
    }).filter(function (g) { return g.fields.length; });
  }
  /* under the date field: "Fri 11 Dec, 30 days away", and a quiet note when it isn't a Friday or is
     close (the early steps are then due at once). A day that has passed is a song ALREADY OUT (v2, 11 Nov
     2026): it can be recorded for whose song it is (out: true). o.move = "Change the date" on a release
     that went out: a past day is refused there (bad: true). */
  function releaseDayNote(date, today, o) {
    if (!isDay(date) || !isDay(today)) return { line: "", notes: [], bad: false, out: false };
    var n = dayDiff(today, date), notes = [];
    if (n < 0) {
      var line = day(date) + ", " + plural(-n, "day") + " ago";
      if (o && o.move) return { line: line, notes: ["That day has passed. Pick today or a later day."], bad: true, out: false };
      return { line: line, notes: ["Already out: it is recorded for whose song it is, with no steps and no message to the team."], bad: false, out: true };
    }
    if (new Date(date + "T12:00:00Z").getUTCDay() !== 5) notes.push("Not a Friday. New music usually comes out on a Friday.");
    if (n < 21) notes.push("Fewer than 21 days away: the steps that should already be done will be due straight away.");
    return { line: day(date) + ", " + (n === 0 ? "today" : n === 1 ? "tomorrow" : n + " days away"), notes: notes, bad: false, out: false };
  }
  /* one step's state in words: "done 12 Nov by Drop" · "late by 2 days" · "blocked: <note>" · "due in 5 days".
     bad = late or blocked (the only red). st = a step of releaseView (or a bot's releaseSteps item). */
  function stepState(st, today) {
    if (!st) return { text: "", bad: false, done: false };
    /* v2 (11 Nov 2026): a step that doesn't apply, and the pitch that waits for Spotify for Artists.
       Neither is ever late, so neither is ever red. */
    if (st.status === "skipped") {
      var sn = String(st.note || "").trim();
      return { text: sn === LABEL_NOTE ? "not ours: the label delivers it" : sn === OUT_NOTE ? "already out when it was recorded" : "skipped" + (sn ? ": " + sn : ""), bad: false, done: false, skipped: true };
    }
    if (st.waiting && st.status !== "done" && st.status !== "blocked") return { text: st.waitingText || "waiting: the song is not in Spotify for Artists yet", bad: false, done: false, waiting: true };
    var n = typeof st.dueIn === "number" ? st.dueIn : isDay(st.due) && isDay(today) ? dayDiff(today, st.due) : null;
    if (st.status === "done") {
      var when = st.at ? day(spStampOf(st.at).slice(0, 10)).replace(/^\w+ /, "") : "";
      return { text: "done" + (when ? " " + when : "") + (st.by ? " by " + st.by : ""), bad: false, done: true };
    }
    if (st.status === "blocked") return { text: "blocked" + (st.note ? ": " + st.note : ""), bad: true, done: false };
    var pre = st.status === "working" ? "working · " : "";
    if (n == null) return { text: pre + "no date yet", bad: false, done: false };
    if (n < 0) return { text: pre + "late by " + plural(-n, "day"), bad: true, done: false };
    return { text: pre + (n === 0 ? "due today" : n === 1 ? "due tomorrow" : "due in " + n + " days"), bad: false, done: false };
  }
  /* the button on one step of a release card, or null (11 Nov 2026). Every step of a release that went
     out keeps its button, also after its release day: the site's check keeps naming an unfinished step
     as late, so Luke must be able to finish (or reopen) it. Luke's own step gets the main button. */
  function stepButton(v, s) {
    if (!v || !s || v.status !== "scheduled" || s.status === "skipped") return null; /* skipped: not ours to mark */
    /* waiting (the pitch before the song shows in Spotify for Artists): one tap must not record a pitch that
       could not have gone out (review, 11 Nov 2026); the desk tells the bots the same */
    if (s.waiting && s.status !== "done") return null;
    var done = s.status === "done", mine = s.owner === "Luke";
    return { to: done ? "todo" : "done", text: done ? "Reopen" : mine ? "Mark as done" : "Mark done", main: mine && !done };
  }
  /* where the form keeps what Luke typed and hasn't saved, on this device: one copy PER RELEASE, so
     opening another release's form never wipes it (11 Nov 2026). Logout clears every bs_hq_last_*. */
  function formKey(id) { return "bs_hq_last_relform:" + (String(id || "").replace(/[^a-z0-9]/gi, "") || "new"); }
  /* a release card's date line: "Tue 24 Nov · 13 days to go" / "Release day" / "Released 12 days ago" */
  function releaseWhen(date, today, draft) {
    if (!isDay(date)) return "No release day yet";
    var rw = releaseWords(date, today);
    if (!rw) return day(date);
    /* a draft (In the pipeline, v2): "· not sent yet"; one whose day has passed is a song already out */
    if (draft) return day(date) + " · " + (rw.out && rw.days > 0 ? "already out, not recorded yet" : (!rw.out ? plural(-rw.days, "day") + " to go" : "today") + " · not sent yet");
    return day(date) + " · " + (!rw.out ? plural(-rw.days, "day") + " to go" : rw.days === 0 ? "Release day" : "Released " + plural(rw.days, "day") + " ago");
  }
  /* "Copyright line (needed for the RouteNote upload, Fri 20 Nov)"; a field needed to send is just its name */
  function missingWords(m) { return m.short + (m.step ? " (needed for the " + shortStep(m.step) + (m.due ? ", " + day(m.due) : "") + ")" : ""); }
  /* the card's line about the files and details. attn = something a step needs is still missing and
     that step is due within 3 days (or late): the same rule as the site's check. */
  function packLine(v, today) {
    var miss = (v && v.missing) || [], soon = function (m) { return v.status === "scheduled" && !v.released && !!m.due && isDay(today) && dayDiff(today, m.due) <= 3; };
    /* v2: a field for a step that WAITS (the pitch, before the song shows in Spotify for Artists) has no
       date that means anything yet, and is never red: the warning says why */
    var waits = function (m) { return (v.steps || []).some(function (s) { return s.key === m.neededBy && s.waiting; }); };
    var items = miss.slice(0, 4).map(function (m) { var w = waits(m); return { text: missingWords(w ? { short: m.short, step: m.step } : m), attn: !w && soon(m) }; });
    return { filled: v.packFilled + " of " + v.packTotal + " filled", items: items, more: Math.max(0, miss.length - 4),
      text: v.packFilled + " of " + v.packTotal + " filled" + (miss.length ? " · still missing: " + items.map(function (x) { return x.text; }).join("; ") + (miss.length > 4 ? "; +" + (miss.length - 4) + " more" : "") : ""),
      attn: miss.some(function (m) { return !waits(m) && soon(m); }) };
  }
  /* the same sentence the desk answers with when a release can't be sent yet. anyway (v2): the page
     also offers "Send anyway" (never when the release day itself is missing: nothing can be dated) */
  function missingSentence(miss, anyway) {
    var req = (miss || []).filter(function (m) { return m.required !== false; });
    if (!req.length) return "";
    var s = "Still missing: " + req.map(function (m) { return m.short || m.label || m.key; }).join(", ") + ". Fill " + (req.length === 1 ? "it" : "them") + " in, then send again.";
    return anyway && canSendAnyway(req) ? s + " Or send anyway: what is missing stays on the release as a warning." : s;
  }
  function canSendAnyway(miss) { return !(miss || []).some(function (m) { return (m.key || m) === "date"; }); }
  /* what the form sends: only the fields that changed ("" clears one), so a field the team filled in
     the meantime is never overwritten with an old copy. before = the release's pack ({} for a new one). */
  function packChanges(fields, before, now) {
    var out = {};
    (fields || []).forEach(function (f) {
      if (!now || !(f.key in now)) return;
      var a = String((before || {})[f.key] == null ? "" : before[f.key]).trim(), b = String(now[f.key] == null ? "" : now[f.key]).trim();
      if (a !== b) out[f.key] = b;
    });
    return out;
  }
  /* who fills a "later" field: "Drop fills this" / "Atlas or Webmaster fills this" */
  function fillWho(f) { var w = (f && f.fill) || []; return w.length ? w.join(" or ") + " fills this" : "You fill this"; }
  /* the card's one pill. bad = red (late / blocked) */
  function relPill(v, today) {
    if (v.status === "cancelled") return { text: "Cancelled", bad: false, rel: false };
    if (v.status === "draft") return { text: "Draft", bad: false, rel: false };
    var rw = releaseWords(v.date, today);
    if (v.released && rw) return { text: rw.pill, bad: false, rel: true };
    var c = v.counts || {};
    if (c.blocked) return { text: c.blocked + " blocked", bad: true, rel: false };
    if (c.late) return { text: c.late + " late", bad: true, rel: false };
    return { text: "On time", bad: false, rel: false };
  }
  /* a song's name without accents, case, spaces or signs ("Me Dá Seu Body" = "medaseubody"), as the desk compares them */
  /* a title with no Latin letter or digit ("Ночь") keeps its own words (review, 11 Nov 2026): "" for every such
     title made them all one song */
  function titleKey(s) { var raw = String(s == null ? "" : s), v = raw; try { v = v.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {} var k = v.toLowerCase().replace(/[^a-z0-9]/g, ""); return k || (raw.trim() ? "~" + raw.trim().toLowerCase().replace(/\s+/g, " ") : ""); }
  /* Which cards the Upcoming tab draws (v2, 11 Nov 2026, Luke: "songs done in the pipeline should go to the
     upcoming section"), so a song is never shown twice:
       pipeline   the drafts Luke is still filling ("In the pipeline"), soonest first
       coming     sent to the team and not out yet ("Upcoming"), soonest first
       sheetOnly  the sheet's rows the desk doesn't have, not out yet (their own card, under Upcoming)
       out        the desk's songs whose day has come, newest first (one quiet line: they live in Songs)
       sheetOut   the sheet's own rows that are out (in that same line)
       openOut    out, but a step is still open (14 days at most, as the site's check): their cards stay,
                  so the step can still be finished
       cancelled */
  function releaseLists(board, sheet) {
    var desk = (board && board.releases) || [], have = {};
    desk.forEach(function (v) { if (v.status !== "cancelled") have[titleKey(v.title)] = 1; });
    var byDate = function (a, b) { return (a.date || "9") < (b.date || "9") ? -1 : (a.date || "9") > (b.date || "9") ? 1 : 0; };
    var sheetRows = ((sheet && sheet.releases) || []).filter(function (r) { return !r.desk && !have[titleKey(r.song)]; });
    var gone = function (r) { return r.daysToGo != null && r.daysToGo <= 0; };
    var out = desk.filter(function (v) { return v.status === "scheduled" && v.released; }).sort(function (a, b) { return -byDate(a, b); });
    return {
      pipeline: desk.filter(function (v) { return v.status === "draft"; }).sort(byDate),
      coming: desk.filter(function (v) { return v.status === "scheduled" && !v.released; }).sort(byDate),
      sheetOnly: sheetRows.filter(function (r) { return !gone(r); }),
      out: out,
      sheetOut: sheetRows.filter(gone),
      openOut: out.filter(function (v) { return !v.alreadyOut && v.counts && v.counts.done < v.counts.total && (v.daysToGo == null || v.daysToGo >= -14); }),
      cancelled: desk.filter(function (v) { return v.status === "cancelled"; })
    };
  }
  /* under the Upcoming list: "Out: Touch Me (30 Oct), Slow Burn (2 Dec)." (they live in Songs now).
     list = [{ title, date }] */
  function outLine(list) {
    var l = (list || []).filter(function (x) { return x && x.title; });
    if (!l.length) return "";
    var shown = l.slice(0, 6).map(function (x) { return x.title + (isDay(x.date) ? " (" + day(x.date).replace(/^\w+ /, "") + ")" : ""); });
    return "Out: " + shown.join(", ") + (l.length > 6 ? " and " + (l.length - 6) + " more" : "") + ".";
  }
  /* "Counting back from release day: 21 days RouteNote upload, 16 RouteNote approval, …" */
  function stepsSummary(steps) {
    var byDays = [];
    (steps || []).forEach(function (s) {
      var last = byDays[byDays.length - 1], w = s.days === 0 ? "" : shortStep(s.label);
      if (s.days === 0) return;
      if (last && last.days === s.days) last.words.push(w); else byDays.push({ days: s.days, words: [w] });
    });
    return byDays.length ? "Counting back from release day: " + byDays.map(function (x, i) { return x.days + (i ? "" : " days") + " " + x.words.join(" and "); }).join(", ") + "." : "";
  }
  /* today (v2): a release day that has passed is recorded as already out, not sent */
  function sendQuestion(title, date, today) {
    if (isDay(today) && isDay(date) && date < today) return "Record " + title + " as already out (" + day(date) + ")? There are no steps and nobody is told: it is kept so Songs shows whose song it is.";
    return "Send " + title + " to the team for " + day(date) + "? Every bot gets its steps and dates.";
  }
  function sendButton(date, today) { return isDay(today) && isDay(date) && date < today ? "Record it as already out" : "Send to the team"; }
  function moveQuestion(title, from, to) { return "Move " + title + " from " + day(from) + " to " + day(to) + "? Every step that isn't done moves with it, and the team is told."; }
  function cancelQuestion(v) { return v.status === "draft" ? "Cancel the draft of " + v.title + "? Nobody was told about it yet." : "Cancel " + v.title + "? The team is told to stop working on its steps."; }

  /* ================= Release pipeline v2 on /hq (11 Nov 2026, evening) =================
     Luke: "in the releases section i want it to be if it's self release or released with label",
     "the word releases should be changed to upcoming", "we should also have warnings about lateness",
     "it should show any upcoming release in spotify for artists, and flag ones that haven't gone through
     the pipeline and ask me what it is", "i want to know when i've replied to a message and that reply
     has been read". The desk's words (netlify/lib/staff.mjs) are used as they come where it sends them
     (where, warnings, the question); these are the page's own. */
  var LABEL_KIND = "With a label", SELF_KIND = "Self-release";
  var LABEL_NOTE = "The label delivers this one", OUT_NOTE = "Already out when it was recorded";
  var NOT_RECORDED = "Not recorded yet: self-release or label?";
  var joinWords = function (l) { return l.length < 2 ? l.join("") : l.slice(0, -1).join(", ") + " and " + l[l.length - 1]; };

  /* whose song it is, one line: "Self-release" / "With Magic Records · Luke 50% · Magic Records 50%".
     deal = { kind, label, split, distributor, id } | null. known = false: nothing recorded (null), or a
     desk record from before whose release it is was asked (kind ""); id then opens that record. */
  function dealWords(deal) {
    if (!deal || !deal.kind) return { text: NOT_RECORDED, known: false, id: (deal && deal.id) || "" };
    if (deal.kind === LABEL_KIND) return { text: "With " + (deal.label || "a label") + " · " + (deal.split || "split not recorded yet"), known: true, id: deal.id || "" };
    return { text: deal.kind === SELF_KIND ? "Self-release" : deal.kind, known: true, id: deal.id || "" };
  }
  /* a Songs card's deal: the desk's own release of that song first (the board is the freshest), then
     what /api/hq/data says (songs[].deal: null = the desk has no record). undefined = nothing has been
     read yet, so nothing is claimed. */
  function songDeal(name, sheetSong, board) {
    var list = board && Array.isArray(board.releases) ? board.releases : null, k = titleKey(name);
    var same = (list || []).filter(function (v) { return v && k && v.status !== "cancelled" && v.deal && titleKey(v.title) === k; });
    var v = same.filter(function (x) { return x.status === "scheduled"; })[0] || same[0];
    if (v) return v.deal;
    if (sheetSong && "deal" in sheetSong) return sheetSong.deal || null;
    return list ? null : undefined;
  }

  /* the form follows the desk's rule (PACK_FIELDS requiredWhen): the label and the split are shown and
     needed only "With a label". out = the release day has passed (a song already out): only "Whose
     release is it" is needed then. vals = what the form holds now. */
  /* showWhen (11 Nov 2026, review): the copyright line is required only for a self-release but is shown
     whatever the kind; a field list from before showWhen existed falls back to requiredWhen */
  function fieldShown(f, vals) { var w = f && ("showWhen" in f ? f.showWhen : f.requiredWhen); return !f || !w || (vals || {})[w.field] === w.equals; }
  function fieldRequired(f, vals, out) {
    if (!f) return false;
    var req = !!f.required || (!!f.requiredWhen && (vals || {})[f.requiredWhen.field] === f.requiredWhen.equals);
    return req && (!out || f.group === "deal");
  }
  /* the small words after a field's name: "needed to send" / "needed for the lyrics" / "" */
  function needWord(f, vals, steps, out) {
    if (fieldRequired(f, vals, out)) return out ? "needed to record it" : "needed to send";
    if (out || !f || !f.neededBy) return "";
    var v = vals || {};
    if ((f.neededBy === "upload" || f.neededBy === "approved") && v.kind === LABEL_KIND && !/routenote/i.test(v.distributor || "")) return ""; /* the label delivers it */
    var st = (steps || []).filter(function (s) { return s.key === f.neededBy; })[0];
    return st ? "needed for the " + shortStep(st.label) : "";
  }

  /* an Upcoming card's pill: its warnings counted ("2 warnings", red), else the plain pill */
  function upcomingPill(v, today) {
    var n = v && v.status === "scheduled" && !v.alreadyOut ? (v.warnings || []).length : 0;
    return n ? { text: plural(n, "warning"), bad: true, rel: false } : relPill(v, today);
  }
  /* "where it is at", one line: the desk's own (releaseView.where), else what the page can say itself
     (a copy kept on this device from before v2) */
  function whereLine(v) {
    if (!v) return "";
    if (typeof v.where === "string" && v.where) return v.where;
    if (v.status === "draft") return "In the pipeline: " + v.packFilled + " of " + v.packTotal + " filled";
    var c = v.counts || {};
    return c.total ? c.done + " of " + c.total + " steps done" : "";
  }

  /* Today's "Needs attention": the warnings of the releases on the desk (sent, not recorded after they
     came out, not out for more than 14 days), "<title>: <warning>", at most 4, then "+N more". The board
     first (freshest); without it, the sheet's merged desk rows. */
  function releaseAttention(sheet, board) {
    var list = board && Array.isArray(board.releases)
      ? board.releases.filter(function (v) { return v.status === "scheduled" && !v.alreadyOut; }).map(function (v) { return { id: v.id, title: v.title, days: v.daysToGo, w: v.warnings || [] }; })
      : ((sheet && sheet.releases) || []).filter(function (r) { return r.desk; }).map(function (r) { return { id: r.id, title: r.song, days: r.daysToGo, w: r.warnings || [] }; });
    var all = [];
    list.filter(function (x) { return x.days == null || x.days >= -14; }).sort(function (a, b) { return (a.days == null ? 999 : a.days) - (b.days == null ? 999 : b.days); }).forEach(function (x) {
      x.w.forEach(function (w, i) { all.push({ key: "rw:" + x.id + ":" + i, text: x.title + ": " + w, href: "#releases/" + String(x.id || "").replace(/[^a-z0-9]/gi, "") }); });
    });
    if (all.length <= 4) return all;
    return all.slice(0, 4).concat({ key: "rw:more", text: "+" + (all.length - 4) + " more release warnings", href: "#releases" });
  }

  /* the note on the card once it went: sent (and what it went without), or recorded as already out.
     j = the answer of release/send { told, alreadyOut, sentWithout: [field keys] } */
  function sentNote(j, at, fields) {
    var hm = spStampOf(at).slice(11, 16);
    if (j && j.alreadyOut) return "Recorded as already out at " + hm + ". Songs shows whose song it is; there are no steps and nobody was told.";
    var w = ((j && j.sentWithout) || []).map(function (k) { var f = (fields || []).filter(function (x) { return x.key === k; })[0]; return f ? f.short || f.label : k; });
    return "Sent to the team at " + hm + ". Every bot has its steps and dates." + (j && j.told ? " Everyone got a note on the board." : "") +
      (w.length ? " Sent without " + joinWords(w) + ": " + (w.length === 1 ? "it stays" : "they stay") + " on the card as a warning until filled." : "");
  }

  /* ---- In Spotify for Artists: what Atlas last saw there as upcoming (board.sightings) ---- */
  /* the line on top: when he looked, or that he hasn't (never), or that it is old (stale: red) */
  function sightingsHead(sv, now, today) {
    now = now || Date.now();
    if (!sv || sv.never) return { text: "Atlas hasn't reported what Spotify for Artists shows as upcoming yet. Once he does, every song listed there shows here, and any song that didn't go through the pipeline is asked about.", attn: false, never: true, empty: "" };
    var at = t(sv.at), who = sv.by || "Atlas", w = spWhen(sv.sp, today), a = at ? " (" + ago(now - at) + ")" : "";
    var when = String(sv.sp || "").slice(0, 10) === today ? "at " + w : "on " + w;
    var empty = (sv.items || []).length ? "" : "Nothing is upcoming there right now.";
    if (sv.stale) return { text: who + " last looked " + when + a + ". He should look every day, so this may be out of date.", attn: true, never: false, empty: empty };
    return { text: who + " looked " + when + a + ".", attn: false, never: false, empty: empty };
  }
  /* one song he saw that isn't a question: in the pipeline, or answered (said quietly, with when) */
  function sightRow(x) {
    if (!x) return null;
    var base = { key: x.key, title: x.title, when: x.dateWords || day(x.date), shown: x.shownAs || "", id: x.match || "" };
    if (x.state === "pipeline") base.text = (x.matchStatus === "draft" ? "In the pipeline" : "In Upcoming") + (x.answer && x.answer.answer === "it" ? " (you said it is this song, " + day(x.answer.day) + ")" : "");
    else if (x.state === "retry") {
      /* "Not mine" / "a mistake" whose message to Nova never went: the page offers to send it again */
      var ra = x.answer || {};
      base.text = "You said: " + (ra.text || ra.answer || "") + (ra.day ? ", " + day(ra.day) : "") + ". The message to Nova couldn't go.";
      base.retry = ra.answer || "";
    } else if (x.state === "answered") {
      var a = x.answer || {};
      base.text = "You said: " + (a.text || a.answer || "") + (a.label ? " (" + a.label + ")" : "") + (a.day ? ", " + day(a.day) : "") + "." +
        ((a.answer === "notmine" || a.answer === "mistake") ? (a.told ? " Nova was asked to find out." : " The message to Nova couldn't go yet.") : "");
    } else base.text = "Not in the pipeline";
    return base;
  }
  /* the question: "<b>Velvet Night</b> is upcoming in Spotify for Artists for Fri 27 Nov, and it has not
     gone through the pipeline. What is it?" (title apart so the page can make it bold) */
  function sightQuestion(x) { return { title: x.title, rest: " is upcoming in Spotify for Artists for " + (x.dateWords || day(x.date)) + ", and it has not gone through the pipeline. What is it?" }; }
  /* asked before an answer goes: what will happen */
  function sightConfirm(x, answer, label) {
    var d = " (" + (x.dateWords || day(x.date)) + ")";
    if (answer === "it" && x.near) return "Is " + x.title + " the same song as " + x.near.title + (x.near.dateWords ? " (" + x.near.dateWords + ")" : "") + "? Its step “Showing as upcoming in Spotify for Artists” is marked done, and Atlas can send the pitch.";
    if (answer === "self") return "Start a draft of " + x.title + d + " as a self-release? It goes to “In the pipeline”, where you fill in its files and details.";
    if (answer === "label") return "Start a draft of " + x.title + d + " with " + (label || "the label") + "? It goes to “In the pipeline”, where you fill in the split, its files and details.";
    var says = answer === "notmine" ? "is not yours, or is on the wrong account" : "is a mistake and should not be there";
    return "Tell Nova that " + x.title + " " + says + "? Nova finds out who delivered it and from which account, and reports back on the desk.";
  }
  /* the line in its place once answered */
  function sightDone(title, answer, told, at) {
    var hm = spStampOf(at).slice(11, 16);
    if (answer === "self" || answer === "label") return "Answered at " + hm + ". " + title + " is now in “In the pipeline”: fill in its files and details there.";
    if (answer === "it") return "Answered at " + hm + ". " + title + " counts as showing in Spotify for Artists now.";
    return told ? "Answered at " + hm + ". Nova was asked to find out who delivered " + title + "." : "Your answer is saved, but the message to Nova couldn't go. Press “Send it to Nova again”.";
  }

  /* ================= Revolut: the bank reader on the page (11 Nov 2026) =================
     GET /api/bank/status (netlify/functions/bank.mjs) says where the reader is; the payments it could
     not place are on the desk as "unsorted" (board.income.unsorted): in no total until someone sorts
     them (POST /api/staff/sort). Luke's words, never the reader's: "to sort", "your own transfer". */
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var addDay = function (d, n) { return new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10); };
  var PREVIEW = "Connecting Revolut only works on badscandal.com itself, not on a preview.";
  /* the six kinds of income a payment can be sorted as (the desk's CATEGORIES) */
  var SORT_TYPES = ["Self-releases", "Label deals", "Publishing", "Production", "Salary", "Other"];
  /* A failure that names Netlify settings (the private key, the application id, the bank's name) is
     for Claude and the logs; Luke is told what to do instead. kind = the server's errorKind (status,
     sync) or kind (connect): key | refused | no_bank. The words are checked too, in case a sentence
     that names a setting ever comes without its kind. */
  var SETTINGS_WORDS = "Revolut's settings on Netlify need fixing: ask Claude.";
  function bankSays(kind, text) {
    if (kind === "key" || kind === "refused" || kind === "no_bank" || /ENABLE_BANKING_|\bPEM\b|base64|redeploy/i.test(String(text || ""))) return SETTINGS_WORDS;
    return text || "";
  }
  function endsWords(n) { return n === 0 ? "approval ends today" : n === 1 ? "approval ends tomorrow" : "approval ends in " + n + " days"; }
  /* the reader's last read failed: an error, and no full read since it */
  function bankFailed(st) { var ok = t(st && st.lastOkAt), run = t(st && st.lastRunAt); return !!(st && st.lastError && (ok == null || (run != null && run > ok))); }
  /* The one sentence (the server's bankLine, netlify/lib/bank.mjs, word for word; São Paulo times):
     "Revolut: read today at 06:50 · 2 payments in · approval ends in 86 days" */
  function bankLine(st, now) {
    now = now || Date.now();
    if (!st || !st.configured) return "The site is missing its Revolut settings";
    if (st.needsApproval) return "Revolut has to be approved again";
    if (!st.connected) return "Revolut is not connected";
    var parts = [], ok = t(st.lastOkAt);
    if (ok != null) {
      var d = spStampOf(ok).slice(0, 10), today = spStampOf(now).slice(0, 10);
      var when = d === today ? "today" : d === addDay(today, -1) ? "yesterday" : "on " + Number(d.slice(8, 10)) + " " + MON[Number(d.slice(5, 7)) - 1];
      parts.push("Revolut: read " + when + " at " + spStampOf(ok).slice(11, 16));
    } else parts.push(st.partial ? "Revolut: not fully read yet" : "Revolut: not read yet");
    if (bankFailed(st)) parts.push("the last read failed");
    else if (st.partial) parts.push("the last read stopped part way, the rest comes at the next read");
    else if (ok != null && typeof st.lastAdded === "number" && isFinite(st.lastAdded)) parts.push(st.lastAdded === 0 ? "no new payments" : st.lastAdded + " payment" + (st.lastAdded === 1 ? "" : "s") + " in");
    parts.push(endsWords(st.daysLeft));
    return parts.join(" · ");
  }
  /* What the Revolut tile shows: the line, the accounts it reads, the reader's own sentence when the
     last read failed, and which buttons: connect | approve | sync | disconnect (the first is the main
     one). attn when Luke has to act: approval gone, or 14 days or fewer left. note = why there is no
     Connect button (only the live site can connect) or what is missing. */
  function bankView(st, now) {
    var v = { line: bankLine(st, now), attn: false, accounts: [], error: "", note: "", buttons: [] };
    if (!st) return v;
    v.accounts = (st.accounts || []).map(function (a) { return [a.name, a.currency].filter(Boolean).join(" · "); }).filter(Boolean);
    if (!st.configured) { v.note = "Connecting needs the Revolut settings on Netlify first."; return v; }
    var here = !!st.canConnectHere;
    if (st.needsApproval) { v.attn = true; v.buttons = here ? ["approve", "disconnect"] : ["disconnect"]; }
    else if (!st.connected) v.buttons = here ? ["connect"] : [];
    else {
      v.attn = !!st.expiring;
      v.buttons = (st.expiring && here ? ["approve"] : []).concat("sync", "disconnect");
      if (bankFailed(st)) v.error = bankSays(st.errorKind, st.lastError);
    }
    if (!here && (st.needsApproval || !st.connected || st.expiring)) v.note = PREVIEW;
    return v;
  }
  var BANK_BUTTON = { connect: "Connect Revolut", approve: "Approve again", sync: "Read now", disconnect: "Disconnect" };
  function bankButton(k) { return BANK_BUTTON[k] || ""; }
  /* The bank sends Luke back to /hq?bank=connected|failed|device#money. -> { kind, line, search (the
     address without the flag, for history.replaceState), had } */
  var FLAG_LINE = { connected: "Revolut is connected. The first read is running.", failed: "That didn't connect. Press the Revolut button below to try again.",
    device: "Finish on the device you started on, or start again here with the Revolut button below." };
  function bankFlag(search) {
    var parts = String(search || "").replace(/^\?/, "").split("&").filter(Boolean), kind = "", had = false;
    parts = parts.filter(function (p) { var m = /^bank=(.*)$/.exec(p); if (!m) return true; had = true; if (FLAG_LINE[m[1]]) kind = m[1]; return false; });
    return { kind: kind, line: FLAG_LINE[kind] || "", search: parts.length ? "?" + parts.join("&") : "", had: had };
  }
  /* Once Revolut's state is known: what is left of the ?bank= flag, and whether to read at once.
     "connected" is said only while Revolut IS connected, and reads by itself only once, and only when
     the connection is under 10 minutes old (an old link, a bookmark or the address bar's memory of
     /hq?bank=connected never starts a read). -> { flag (null = say nothing), sync } */
  var AUTO_READ_MS = 10 * 60000;
  function bankFlagAfter(flag, st, now) {
    now = now || Date.now();
    if (!flag || !st || flag.kind !== "connected") return { flag: flag || null, sync: false };
    if (!st.connected) return { flag: null, sync: false };
    var at = t(st.connectedAt), fresh = at != null && now - at >= -60000 && now - at < AUTO_READ_MS;
    if (!fresh) return { flag: null, sync: false };
    return { flag: { kind: flag.kind, line: flag.line, auto: false }, sync: !!flag.auto };
  }
  /* "Read now" came back (the sync summary). -> { ok, text } */
  function syncWords(s, at) {
    if (!s || typeof s !== "object") return { ok: false, text: "Couldn't read Revolut just now. Try again." };
    if (!s.ok || s.error) return { ok: false, text: bankSays(s.errorKind, s.error) || "Couldn't read Revolut just now. Try again." };
    var n = s.newPayments || 0, hm = spStampOf(at).slice(11, 16);
    return { ok: true, text: "Read at " + hm + ": " + (n ? n + " new payment" + (n === 1 ? "" : "s") + " came in" : "nothing new came in") + (s.more ? ". The rest comes at the next read." : ".") };
  }
  /* a payment's state in "Latest payments": counted = it is in the totals. "Your own transfer" only for
     what the bank reader itself found to be his own money (by HQ, never changed since); anything else
     marked as a transfer (sorted as "Not income", or a bot's refund or gift) is "Not income". */
  function payStatus(e) {
    var s = e && e.status;
    if (s === "unsorted") return { text: "To sort", counted: false };
    if (s === "transfer") return { text: e.by === "HQ" && !(e.history || []).length ? "Your own transfer" : "Not income", counted: false };
    s = String(s || ""); return { text: s.charAt(0).toUpperCase() + s.slice(1), counted: true };
  }
  /* the inline question before a payment is sorted (it can't be changed on the page afterwards) */
  function sortQuestion(e, status, category) {
    var what = e.payer + "'s " + money(e.amount, e.currency) + " (" + day(e.date) + ")";
    return status === "received" ? "Sort " + what + " as income (" + category + ")? It counts as money coming in from then on, and can't be changed here."
      : "Sort " + what + " as not income? Your own money, a refund, a gift: it never counts in the totals, and can't be changed here.";
  }
  function sortedLine(status, category) { return status === "received" ? "Sorted as income (" + category + ")" : "Sorted as not income"; }
  /* The payment is the money of a statement already logged as pending (the desk offers it as
     e.pendingMatch): the answer, the question before it goes, and the line in its place afterwards */
  function pendingWhat(p) { return p.payer + " statement (" + money(p.amount, p.currency) + ", " + day(p.date) + ")"; }
  function pendingAnswer(e) { var p = e && e.pendingMatch; return p ? "It's the pending " + pendingWhat(p) : ""; }
  function pendingQuestion(e) {
    var p = e.pendingMatch;
    return "Is " + e.payer + "'s " + money(e.amount, e.currency) + " (" + day(e.date) + ") the money of the pending " + pendingWhat(p) + "? The statement becomes received on " + day(e.date) + ", it leaves Pending, and this payment is counted once, as that statement. It can't be changed here.";
  }
  function pendingSorted(p) { return "Sorted as the " + p.payer + " statement: received"; }
  /* "2 payments in Revolut to sort" */
  function toSortWords(inc) {
    var list = (inc && inc.unsorted) || [], n = (inc && inc.unsortedCount) || list.length;
    if (!n) return "";
    var where = list.map(function (e) { return e.account; }).filter(function (a, i, all) { return a && all.indexOf(a) === i; });
    return n + " payment" + (n === 1 ? "" : "s") + " in " + (where.length ? joinWords(where) : "the accounts") + " to sort";
  }
  /* Today's "Needs attention" from the reader: payments to sort, and the approval (gone, or 14 days or
     fewer left). Every item opens Money. */
  function bankAttention(st, board) {
    var out = [], ts = toSortWords(board && board.income);
    if (ts) out.push({ key: "tosort", text: ts, href: "#money" });
    if (st && st.configured && st.needsApproval) out.push({ key: "bank", text: "Revolut has to be approved again", href: "#money" });
    else if (st && st.configured && st.connected && st.expiring) out.push({ key: "bank", text: "Revolut's " + endsWords(st.daysLeft), href: "#money" });
    return out;
  }
  /* Data health: the "Revolut" row. It reads every morning at 06:50 (09:50 UTC); more than 26 hours
     without a full read means a morning was missed. */
  function bankHealth(st, problem, now) {
    now = now || Date.now();
    var R = function (state, text) { return { key: "revolut", label: "Revolut", state: state, text: text }; };
    if (!st) return problem ? R("bad", problem) : R("off", "Not read yet");
    if (!st.configured) return R("off", "Not set up: the site is missing its Revolut settings");
    if (st.needsApproval) return R("bad", "Has to be approved again (Money)");
    if (!st.connected) return R("off", "Not connected");
    var ok = t(st.lastOkAt);
    if (bankFailed(st)) return R("bad", "The last read failed: " + bankSays(st.errorKind, st.lastError));
    if (st.expiring) return R("bad", (ok != null ? "Read " + ago(now - ok) + " · " : "") + endsWords(st.daysLeft));
    if (st.partial) return R("off", "The last read stopped part way: the rest comes at the next read");
    if (ok == null) return R("off", "Not read yet: it reads every morning at 06:50");
    if (now - ok > 26 * 3600000) return R("bad", "Last full read " + ago(now - ok) + ": it reads every morning at 06:50");
    return R("ok", "Read " + ago(now - ok) + " · " + endsWords(st.daysLeft));
  }

  return { ago: ago, spMs: spMs, releaseWords: releaseWords, releaseDetail: releaseDetail, healthRows: healthRows, healthState: healthState, median: median, change: change, money: money, attention: attention, briefing: briefing,
    snapshot: snapshot, changesSince: changesSince, tiles: tiles, summaryText: summaryText, shortStep: shortStep, day: day,
    slug: slug, workerLabel: workerLabel, sortWorkers: sortWorkers, workerView: workerView, dutyWhen: dutyWhen, workerCounts: workerCounts, seenLine: seenLine, connectorLine: connectorLine,
    novaMessage: novaMessage, liveFeed: liveFeed, spWhen: spWhen, waitLabel: waitLabel, needWords: needWords, reportParts: reportParts, siteCheckLine: siteCheckLine, composeNames: composeNames,
    threadRoot: threadRoot, answerTarget: answerTarget, stepButton: stepButton, formKey: formKey, staffAttention: staffAttention, staffHealth: staffHealth, curList: curList, cadenceWord: cadenceWord, accountLine: accountLine, sourceState: sourceState, payLine: payLine,
    incomeEmpty: incomeEmpty, incomeProblems: incomeProblems,
    /* replies that visibly land + the release pipeline (11 Nov 2026) */
    spStampOf: spStampOf, seenWords: seenWords, sentLine: sentLine, answeredList: answeredList, CLAUDE_ROUNDS: CLAUDE_ROUNDS,
    formGroups: formGroups, releaseDayNote: releaseDayNote, releaseWhen: releaseWhen, stepState: stepState, missingWords: missingWords, packLine: packLine, missingSentence: missingSentence,
    packChanges: packChanges, fillWho: fillWho, relPill: relPill, releaseLists: releaseLists, stepsSummary: stepsSummary,
    sendQuestion: sendQuestion, moveQuestion: moveQuestion, cancelQuestion: cancelQuestion,
    /* release pipeline v2 (11 Nov 2026, evening) */
    titleKey: titleKey, outLine: outLine, sendButton: sendButton, canSendAnyway: canSendAnyway, dealWords: dealWords, songDeal: songDeal,
    fieldShown: fieldShown, fieldRequired: fieldRequired, needWord: needWord, upcomingPill: upcomingPill, whereLine: whereLine,
    releaseAttention: releaseAttention, sentNote: sentNote, sightingsHead: sightingsHead, sightRow: sightRow, sightQuestion: sightQuestion,
    sightConfirm: sightConfirm, sightDone: sightDone,
    /* the Revolut reader (11 Nov 2026) */
    bankLine: bankLine, bankView: bankView, bankButton: bankButton, bankFlag: bankFlag, syncWords: syncWords, payStatus: payStatus, sortQuestion: sortQuestion,
    sortedLine: sortedLine, toSortWords: toSortWords, bankAttention: bankAttention, bankHealth: bankHealth, SORT_TYPES: SORT_TYPES,
    /* after the review of 12 Nov 2026 */
    bankSays: bankSays, bankFlagAfter: bankFlagAfter, pendingAnswer: pendingAnswer, pendingQuestion: pendingQuestion, pendingSorted: pendingSorted };
});
