/* The numbers behind /admin (9 Nov 2026). Pure functions, no Netlify imports, so
   tests/admin.test.mjs can run them under plain node.

   Flow: admin.mjs lists the raw event keys for the chosen São Paulo days (+ the period before,
   for the "vs previous" arrows) -> parseKey -> summarize() -> dashboard(). Days older than 90
   that rollup.mjs has already folded into daily totals come in as ready-made summaries and are
   merged with mergeSummary(); they carry counts only (no visit log, no speed samples), and their
   unique visitors are summed per day, so a range reaching back past 90 days slightly
   over-counts uniques.

   People only (9 Nov 2026): see "bots: who counts as a person" below. Bots are left out of
   every number, chart and the visit log unless the portal asks for bots=1. Reloads by the same
   browser within 30 minutes are ONE visit (SESSION_GAP). */

/* >>> EDIT HERE <<< One entry per release page. `id` is the page name the counter stores. */
export const LINKS = [
  { id: "touchme", title: "Touch Me", path: "/touchme", cover: "/assets/touchme-cover-600-v1.webp" },
];

export const TZ = "America/Sao_Paulo";
export const MAX_DAYS = 120;
export const STORES = ["spotify", "apple", "youtube", "deezer", "amazon"];

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" });
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export const spDay = (ts) => dayFmt.format(ts);
export const spHour = (ts) => parseInt(hourFmt.format(ts), 10) % 24;
export function spTime(ts) {
  const p = Object.fromEntries(timeFmt.formatToParts(ts).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

export function addDays(day, n) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function span(from, to) {
  const out = [];
  for (let d = from; d <= to && out.length < MAX_DAYS; d = addDays(d, 1)) out.push(d);
  return out;
}

/* range: today | 7d | 30d | custom (+ from/to as YYYY-MM-DD). Returns São Paulo days. */
export function resolveRange(q, now = Date.now()) {
  const today = spDay(now);
  const n = { today: 1, "7d": 7, "30d": 30 }[q.range];
  let days;
  if (n) days = span(addDays(today, 1 - n), today);
  else {
    const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
    let from = ok(q.from) ? q.from : addDays(today, -6);
    let to = ok(q.to) ? q.to : today;
    if (to > today) to = today;
    if (from > to) from = to;
    days = span(from, to);
  }
  const len = days.length;
  const prev = span(addDays(days[0], -len), addDays(days[0], -1));
  return { range: n ? q.range : "custom", days, prev };
}

/* A São Paulo day runs 03:00 UTC to 03:00 UTC next day, so it touches two UTC key prefixes. */
export function utcDaysFor(spDays) {
  const out = new Set();
  for (const d of spDays) { out.add(d); out.add(addDays(d, 1)); }
  return [...out].sort();
}

/* ---------- bots: who counts as a person ----------

   A page load counts as a PERSON only when, while the page was on screen, the browser reported
   a real touch, pointer, scroll or key press (the "act" event from js/touchme.js), a store tap
   or a consent answer, AND nothing marked it as a bot. Everything else is kept but hidden:

     hard flags (always hidden):  the `bot` key part from hit.mjs (data-centre IP, crawler user
       agent, webdriver/headless, never on screen, inhuman tap, "me"), the "deploycheck" launch
       tests, and the small towns below that are nothing but data centres
     noact:  no interaction at all (link scanners, speed tests, prefetches, people who looked and
       left without touching the screen; there is no way to tell those last ones apart)
     dc-city: a big data-centre city (Ashburn, Kansas City, …) AND no interaction. Real people
       live there, so an interacting visit from one still counts.

   Keys written before the "act" event existed (before 9 Nov, morning) can only prove a person
   by a store tap. */
const DC_TOWNS = new Set([
  /* Meta */ "prineville", "forest-city", "altoona", "los-lunas", "lulea", "clonee", "papillion", "new-albany",
  "eagle-mountain", "gallatin", "stanton-springs", "jeffersonville", "sarpy",
  /* Amazon / Google / Microsoft */ "boardman", "the-dalles", "quincy", "moncks-corner", "umatilla", "hermiston",
  "council-bluffs", "pryor", "lenoir", "mayes-county", "berkeley-county", "dublin-ohio",
]);
const DC_CITIES = new Set([
  "odense", "fort-worth", "henrico", "huntsville", "dekalb", "kansas-city", "mesa", "ashburn", "sterling", "manassas",
  "columbus", "san-antonio", "des-moines", "cheyenne", "hillsboro", "santa-clara", "council-bluffs",
]);

export function hardBot(e) {
  if (e.bot && e.bot !== "-") return e.bot;
  if (e.src === "deploycheck") return "test";
  if (DC_TOWNS.has(e.city)) return "dc-town";
  return "";
}
/* kept for older callers/tests: the reason an event on its own would be hidden */
export const botReason = hardBot;

/* ---------- which ad / where from ---------- */

/* kind: ad (utm_content = the ad name, from the Meta ads' URL tags), untagged (Meta's click id
   fbclid but no utm: an ad whose tags were lost, or a plain Facebook link), instagram (Instagram
   app or referrer without fbclid: bio, DMs, stories; Instagram's own utm_content=link_in_bio too),
   direct (anything else: typed, pasted, other apps). */
export function adOf(e) {
  let content = e.content && e.content !== "-" ? e.content : "";
  const campaign = e.campaign && e.campaign !== "-" ? e.campaign : "";
  if (content === "link_in_bio") content = "";
  if (content || (campaign && e.src === "meta")) return { kind: "ad", campaign, ad: content };
  if (e.fb === "1") return { kind: "untagged", campaign: "", ad: "" };
  const ig = e.src === "ig" || e.app === "instagram" || /(^|\.)instagram\.com$/.test(e.ref || "");
  return { kind: ig ? "instagram" : "direct", campaign: "", ad: "" };
}

/* ---------- summarising ---------- */

const vt = () => ({ v: 0, t: 0 });
function bucket(obj, k) { return obj[k] || (obj[k] = vt()); }

export const SESSION_GAP = 30 * 60 * 1000; /* reloads within 30 min of the last one = one visit */
export const MAX_TAP_MS = 10 * 60 * 1000;  /* time-to-tap shown as "10+ min" above this */

export function emptySummary() {
  return {
    visits: 0, unique: 0, taps: 0, tapUnique: 0, reloads: 0,
    stores: {}, days: {}, hours: Array.from({ length: 24 }, vt),
    ads: {}, countries: {}, cities: {}, apps: {}, devices: {}, sources: {}, refs: {},
    speed: { hist: new Array(11).fill(0), fast: vt(), slow: vt(), samples: [] },
    meta: { sent: 0, notSent: 0, yes: 0, no: 0 },
    hidden: { visits: 0, reasons: {} },
  };
}

export function deviceLabel(e) {
  if (e.os === "ios") return e.device === "tablet" ? "ipad" : "iphone";
  if (e.os === "android") return e.device === "tablet" ? "android-tablet" : "android";
  if (e.os === "macos") return "mac";
  if (e.os === "windows") return "windows";
  if (e.os === "-" || !e.os) return "unknown";
  return e.os;
}

export function appLabel(e) {
  if (e.app && e.app !== "-") return e.app;
  return e.browser && e.browser !== "-" ? e.browser : "unknown";
}

const adKey = (e) => { const a = adOf(e); return a.kind + "|" + a.campaign + "|" + a.ad; };
/* One page load. Old keys have no pv: each event is its own load. */
const loadKey = (e) => (e.pv && e.pv !== "-" ? e.pv : e.visitor + ":" + e.ts);

/* Page loads -> person or bot (with the reason). */
function classify(events) {
  const loads = new Map();
  for (const e of events) {
    const k = loadKey(e);
    let l = loads.get(k);
    if (!l) loads.set(k, (l = { key: k, views: [], clicks: [], acts: [], consents: [], hard: "", human: false }));
    const h = hardBot(e);
    if (h && !l.hard) l.hard = h;
    if (e.type === "view") l.views.push(e);
    else if (e.type === "click") { l.clicks.push(e); if (!h) l.human = true; }
    else if (e.type === "act") { l.acts.push(e); if (!h) l.human = true; }
    else if (e.type === "consent") { l.consents.push(e); if (!h) l.human = true; }
  }
  for (const l of loads.values()) {
    const first = l.views[0] || l.clicks[0] || l.acts[0] || l.consents[0];
    l.first = first;
    l.ts = Math.min(...[...l.views, ...l.clicks, ...l.acts, ...l.consents].map((e) => e.ts));
    l.bot = l.hard || (l.human ? "" : DC_CITIES.has(first.city) ? "dc-city" : "noact");
  }
  return [...loads.values()];
}

/* Loads -> visits: same browser, same kind (person/bot), within 30 min of its previous load. */
function sessions(loads) {
  const byVisitor = new Map();
  for (const l of loads.sort((a, b) => a.ts - b.ts)) {
    const k = l.first.visitor + "|" + (l.bot ? "b" : "h");
    const list = byVisitor.get(k) || (byVisitor.set(k, []), byVisitor.get(k));
    const cur = list[list.length - 1];
    if (cur && l.ts - cur.last <= SESSION_GAP) { cur.loads.push(l); cur.last = l.ts; }
    else list.push({ loads: [l], start: l.ts, last: l.ts });
  }
  const out = [];
  for (const list of byVisitor.values()) {
    for (const s of list) {
      const loadsIn = s.loads;
      const view = loadsIn.map((l) => l.views[0]).find(Boolean) || loadsIn[0].first;
      const clicks = loadsIn.flatMap((l) => l.clicks).sort((a, b) => a.ts - b.ts);
      out.push({
        view, hasView: loadsIn.some((l) => l.views.length), ts: s.start,
        reloads: loadsIn.filter((l) => l.views.length).length - 1,
        bot: loadsIn.find((l) => l.bot)?.bot || "",
        acted: loadsIn.some((l) => l.acts.length || l.clicks.length || l.consents.length),
        spotify: clicks.find((c) => c.target === "spotify") || null,
        stores: [...new Set(clicks.map((c) => c.target))],
        consents: loadsIn.flatMap((l) => l.consents),
      });
    }
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/* events: parsed keys (any page, any day); days: São Paulo days to keep.
   opts.bots: true = count bots too (the portal's "Show bots");  opts.until: ignore events after
   this time (so "vs previous" compares the same stretch of the day). */
export function summarize(events, days, page, opts = {}) {
  const keep = new Set(days);
  const s = emptySummary();
  for (const d of days) s.days[d] = { v: 0, t: 0, u: 0 };

  const mine = [];
  for (const e of events) {
    if (!e || e.page !== page || !e.ts) continue;
    if (opts.until && e.ts > opts.until) continue;
    const d = spDay(e.ts);
    if (!keep.has(d)) continue;
    e.spDay = d;
    mine.push(e);
  }

  const all = sessions(classify(mine));
  const visits = [];
  for (const v of all) {
    if (v.bot && v.hasView) {
      s.hidden.visits++;
      s.hidden.reasons[v.bot] = (s.hidden.reasons[v.bot] || 0) + 1;
    }
    if (!v.bot || opts.bots) visits.push(v);
  }

  const visitors = new Set(), dayVisitors = {}, tapVisitors = new Set();
  for (const v of visits) {
    const e = v.view;
    if (v.hasView) {
      s.visits++;
      s.reloads += v.reloads;
      visitors.add(e.visitor);
      s.days[e.spDay].v++;
      (dayVisitors[e.spDay] || (dayVisitors[e.spDay] = new Set())).add(e.visitor);
      s.hours[spHour(e.ts)].v++;
      bucket(s.ads, adKey(e)).v++;
      bucket(s.countries, e.country).v++;
      if (e.city && e.city !== "-") {
        const c = s.cities[e.country] || (s.cities[e.country] = {});
        c[e.city] = (c[e.city] || 0) + 1;
      }
      bucket(s.apps, appLabel(e)).v++;
      bucket(s.devices, deviceLabel(e)).v++;
      bucket(s.sources, e.src).v++;
      if (e.ref && e.ref !== "-") s.refs[e.ref] = (s.refs[e.ref] || 0) + 1;
    }
    /* stores: one tap per visit per store, however many reloads or double taps */
    for (const st of v.stores) s.stores[st] = (s.stores[st] || 0) + 1;
    const c = v.spotify;
    if (c) {
      tapVisitors.add(c.visitor);
      s.taps++;
      s.days[c.spDay].t++;
      s.hours[spHour(c.ts)].t++;
      bucket(s.ads, adKey(e)).t++;
      bucket(s.countries, e.country).t++;
      bucket(s.apps, appLabel(e)).t++;
      bucket(s.devices, deviceLabel(e)).t++;
      bucket(s.sources, e.src).t++;
      if (c.meta === "1") s.meta.sent++;
      else s.meta.notSent++;
    }
    for (const k of v.consents) {
      if (k.target === "yes") s.meta.yes++;
      else if (k.target === "no") s.meta.no++;
    }
    /* Speed: how long until the Spotify button could be tapped (first load of the visit). */
    if (v.hasView && e.ms != null) {
      s.speed.samples.push(e.ms);
      s.speed.hist[Math.min(10, Math.floor(e.ms / 100))]++;
      const tapped = c ? 1 : 0;
      if (e.ms < 300) { s.speed.fast.v++; s.speed.fast.t += tapped; }
      if (e.ms > 600) { s.speed.slow.v++; s.speed.slow.t += tapped; }
    }
  }
  s.unique = visitors.size;
  s.tapUnique = tapVisitors.size;
  for (const d of days) s.days[d].u = dayVisitors[d] ? dayVisitors[d].size : 0;

  s._visits = visits;
  return s;
}

/* Adds a rolled-up day (or any summary) into `into`. Numbers add, arrays add per slot. */
export function mergeSummary(into, from) {
  (function add(a, b) {
    for (const k of Object.keys(b)) {
      if (k.startsWith("_") || k === "samples") continue;
      const bv = b[k];
      if (typeof bv === "number") a[k] = (a[k] || 0) + bv;
      else if (Array.isArray(bv)) {
        if (!Array.isArray(a[k])) a[k] = [];
        bv.forEach((x, i) => {
          if (typeof x === "number") a[k][i] = (a[k][i] || 0) + x;
          else add(a[k][i] || (a[k][i] = {}), x);
        });
      } else if (bv && typeof bv === "object") add(a[k] || (a[k] = {}), bv);
    }
  })(into, from);
  return into;
}

/* What rollup.mjs stores per day: the summary without the raw events or speed samples. */
export function compact(s) {
  const out = JSON.parse(JSON.stringify({ ...s, _visits: undefined }));
  out.speed.samples = [];
  return out;
}

/* ---------- the visit log ---------- */

export function visitLog(s) {
  return (s._visits || [])
    .filter((v) => v.hasView)
    .slice()
    .sort((a, b) => b.ts - a.ts)
    .map((v) => {
      const e = v.view, a = adOf(e), t = v.spotify;
      return {
        ts: e.ts, time: spTime(e.ts), visitor: e.visitor, returning: e.ret === "1", reloads: v.reloads,
        country: e.country, city: e.city === "-" ? "" : e.city,
        device: deviceLabel(e), app: appLabel(e), src: e.src, ref: e.ref === "-" ? "" : e.ref,
        campaign: a.campaign, ad: a.ad, adKind: a.kind, adLabel: adLabel(a),
        readyMs: e.ms, spotify: !!t, tapMs: t && t.ms != null ? Math.min(t.ms, MAX_TAP_MS) : null,
        other: v.stores.filter((x) => x !== "spotify"), meta: t ? t.meta === "1" : null,
        interacted: v.acted, bot: v.bot,
      };
    });
}

/* What the portal and the CSV call where a visit came from. */
export function adLabel(a) {
  if (a.kind === "direct") return "Direct";
  if (a.kind === "instagram") return "Instagram (bio/DM/story)";
  if (a.kind === "untagged") return "Meta ad (untagged)";
  return a.ad ? a.ad.replace(/[-_]+/g, " ") : "Meta ad (no ad name)";
}

export const BOT_LABELS = {
  noact: "No touch, scroll or tap", "dc-town": "Data-centre town", "dc-city": "Data-centre city, no interaction",
  "dc-meta": "Meta data centre", "dc-aws": "Amazon data centre", "dc-google": "Google Cloud",
  "dc-azure": "Microsoft data centre", "dc-apple": "Apple link preview",
  ua: "Link-preview bot / crawler", webdriver: "Script-driven browser", headless: "Headless browser", notouch: "Phone without a touch screen",
  hidden: "Never on screen", fasttap: "Tap faster than a human", synthetic: "Script click", me: "You (device not counted)",
  test: "Launch test",
};

const CSV_COLS = [
  ["time_sao_paulo", "time"], ["visitor", "visitor"], ["returning", "returning"], ["country", "country"],
  ["city", "city"], ["device", "device"], ["browser_or_app", "app"], ["referrer", "ref"], ["reloads_within_30_min", "reloads"],
  ["source", "adLabel"], ["campaign", "campaign"], ["ad_name", "ad"], ["came_from", "src"], ["button_ready_ms", "readyMs"], ["tapped_spotify", "spotify"],
  ["time_to_tap_ms", "tapMs"], ["other_stores", "other"], ["sent_to_meta", "meta"],
  ["interacted", "interacted"], ["bot", "bot"], ["bot_reason", "botLabel"],
];

export function toCSV(rows) {
  rows = rows.map((r) => ({ ...r, botLabel: r.bot ? BOT_LABELS[r.bot] || r.bot : "" }));
  const cell = (v) => {
    if (v == null) return "";
    if (Array.isArray(v)) v = v.join(" ");
    if (typeof v === "boolean") v = v ? "yes" : "no";
    v = String(v);
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; /* spreadsheet formula guard */
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  return [CSV_COLS.map((c) => c[0]).join(",")]
    .concat(rows.map((r) => CSV_COLS.map((c) => cell(r[c[1]])).join(",")))
    .join("\n") + "\n";
}

/* ---------- the dashboard payload ---------- */

function pct(a, b) { return b ? a / b : null; }

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}

function ranked(obj) {
  return Object.entries(obj)
    .map(([k, r]) => ({ k, v: r.v || 0, t: r.t || 0 }))
    .filter((r) => r.v || r.t)
    .sort((a, b) => b.v - a.v || b.t - a.t);
}

export function dashboard(cur, prev, days, link, extra = {}) {
  const kpi = (s) => ({
    visits: s.visits, unique: s.unique, taps: s.taps,
    ctr: pct(s.taps, s.visits), ctrUnique: pct(s.tapUnique, s.unique),
  });
  const oneDay = days.length === 1;
  const dayRows = days.map((d) => ({ d, ...(cur.days[d] || { v: 0, t: 0, u: 0 }) }));
  const hourRows = cur.hours.map((h, i) => ({ h: i, v: h.v, t: h.t }));
  const samples = (cur.speed.samples || []).slice().sort((a, b) => a - b);
  const log = visitLog(cur);

  return {
    link,
    links: LINKS,
    from: days[0],
    to: days[days.length - 1],
    days: days.length,
    kpis: { ...kpi(cur), prev: kpi(prev) },
    spark: oneDay
      ? { unit: "hour", visits: hourRows.map((r) => r.v), taps: hourRows.map((r) => r.t),
          unique: null, ctr: hourRows.map((r) => (r.v ? r.t / r.v : 0)) }
      : { unit: "day", visits: dayRows.map((r) => r.v), taps: dayRows.map((r) => r.t),
          unique: dayRows.map((r) => r.u), ctr: dayRows.map((r) => (r.v ? r.t / r.v : 0)) },
    series: { day: dayRows, hour: hourRows },
    funnel: {
      visits: cur.visits, unique: cur.unique, spotify: cur.taps,
      other: STORES.slice(1).reduce((n, k) => n + (cur.stores[k] || 0), 0),
      stores: Object.fromEntries(STORES.map((k) => [k, cur.stores[k] || 0])),
    },
    byAd: ranked(cur.ads).map((r) => {
      const [kind, campaign, ad] = r.k.split("|");
      return { kind, campaign, ad, label: adLabel({ kind, ad }), v: r.v, t: r.t };
    }),
    byCountry: ranked(cur.countries).map((r) => {
      const cities = Object.entries(cur.cities[r.k] || {}).sort((a, b) => b[1] - a[1]);
      return { cc: r.k, city: cities[0] ? cities[0][0] : "", cities: cities.length, v: r.v, t: r.t };
    }),
    byApp: ranked(cur.apps),
    byDevice: ranked(cur.devices),
    bySource: ranked(cur.sources),
    refs: Object.entries(cur.refs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => ({ k, n })),
    speed: {
      n: samples.length, median: quantile(samples, 0.5), p90: quantile(samples, 0.9),
      hist: cur.speed.hist, fast: cur.speed.fast, slow: cur.speed.slow,
    },
    meta: cur.meta,
    log: log.slice(0, 300),
    logTotal: log.length,
    reloads: cur.reloads,
    hidden: { visits: cur.hidden.visits, reasons: Object.entries(cur.hidden.reasons).sort((a, b) => b[1] - a[1])
      .map(([k, n]) => ({ k, label: BOT_LABELS[k] || k, n })) },
    ...extra,
  };
}

/* ---------- Meta health (the mh/ keys written by netlify/functions/capi.mjs) ---------- */

export function healthSummary(list, days, now = Date.now()) {
  const keep = new Set(days), today = spDay(now);
  const blank = () => ({ calls: 0, sent: 0, received: 0, errors: 0, blocked: 0, taps: 0, tapsReceived: 0, test: 0 });
  const range = blank(), day = blank();
  let lastOk = null, lastError = null;
  for (const h of list) {
    if (!h || !h.ts) continue;
    const d = spDay(h.ts);
    for (const b of [keep.has(d) && range, d === today && day]) {
      if (!b) continue;
      if (h.result === "blocked") { b.blocked++; continue; }
      b.calls++;
      b.sent += h.sent;
      if (h.test) b.test++;
      if (h.result === "ok") {
        b.received += h.received || 0;
        if (h.events.includes("sc")) { b.taps++; b.tapsReceived += h.received ? 1 : 0; }
      } else {
        b.errors++;
        if (h.events.includes("sc")) b.taps++;
      }
    }
    if (h.result === "ok" && (!lastOk || h.ts > lastOk)) lastOk = h.ts;
    if (h.result === "error" && (!lastError || h.ts > lastError.ts)) lastError = { ts: h.ts, detail: h.detail };
  }
  return {
    today: day, range,
    lastOk: lastOk ? spTime(lastOk) : null,
    lastError: lastError ? { time: spTime(lastError.ts), detail: lastError.detail } : null,
  };
}
