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

  /* The "Data health" panel: Sheet, Meta, page counter, exchange rate. state: ok | bad | off.
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
    return rows;
  }
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
     - the sheet's Meta spend disagreeing with Meta (by more than 1.00 on a day) */
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
        ow.items.forEach(function (d) { if (d.status === "blocked") out.push({ key: "duty:" + d.id, text: ow.owner + "'s duty is blocked: " + (d.blocker || d.task), href: "#team" }); });
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
    return out;
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

  return { ago: ago, healthRows: healthRows, healthState: healthState, median: median, change: change, money: money, attention: attention, briefing: briefing,
    snapshot: snapshot, changesSince: changesSince, tiles: tiles, summaryText: summaryText, shortStep: shortStep };
});
