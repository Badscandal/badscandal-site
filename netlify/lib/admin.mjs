/* The numbers behind /admin (9 Nov 2026). Pure functions, no Netlify imports, so
   tests/admin.test.mjs can run them under plain node.

   Flow: admin.mjs lists the raw event keys for the chosen São Paulo days (+ the period before,
   for the "vs previous" arrows) -> parseKey -> summarize() -> dashboard(). Days older than 90
   that rollup.mjs has already folded into daily totals come in as ready-made summaries and are
   merged with mergeSummary(); they carry counts only (no visit log, no speed samples), and their
   unique visitors are summed per day, so a range reaching back past 90 days slightly
   over-counts uniques. */

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

/* ---------- summarising ---------- */

const vt = () => ({ v: 0, t: 0 });
function bucket(obj, k) { return obj[k] || (obj[k] = vt()); }

export function emptySummary() {
  return {
    visits: 0, unique: 0, taps: 0, tapUnique: 0,
    stores: {}, days: {}, hours: Array.from({ length: 24 }, vt),
    ads: {}, countries: {}, cities: {}, apps: {}, devices: {}, sources: {}, refs: {},
    speed: { hist: new Array(11).fill(0), fast: vt(), slow: vt(), samples: [] },
    meta: { sent: 0, notSent: 0, yes: 0, no: 0 },
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

const adKey = (e) => (e.campaign || "-") + "|" + (e.content || "-");
/* One tap per page load per store: a double tap is still one tap. Old keys have no pv. */
const loadKey = (e) => (e.pv && e.pv !== "-" ? e.pv : e.visitor + ":" + e.ts);

/* events: parsed keys (any page, any day); days: São Paulo days to keep. */
export function summarize(events, days, page) {
  const keep = new Set(days);
  const s = emptySummary();
  for (const d of days) s.days[d] = { v: 0, t: 0, u: 0 };

  const views = [], clicks = [], consents = [];
  for (const e of events) {
    if (!e || e.page !== page || !e.ts) continue;
    const d = spDay(e.ts);
    if (!keep.has(d)) continue;
    e.spDay = d;
    if (e.type === "view") views.push(e);
    else if (e.type === "click") clicks.push(e);
    else if (e.type === "consent") consents.push(e);
  }

  const visitors = new Set(), dayVisitors = {};
  for (const e of views) {
    s.visits++;
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
  s.unique = visitors.size;
  for (const d of days) s.days[d].u = dayVisitors[d] ? dayVisitors[d].size : 0;

  /* Spotify taps: one per page load. Other stores counted the same way. */
  const seen = new Set(), spotifyLoads = new Map(), tapVisitors = new Set();
  for (const e of clicks.sort((a, b) => a.ts - b.ts)) {
    const k = loadKey(e) + "|" + e.target;
    if (seen.has(k)) continue;
    seen.add(k);
    s.stores[e.target] = (s.stores[e.target] || 0) + 1;
    if (e.target !== "spotify") continue;
    spotifyLoads.set(loadKey(e), e);
    tapVisitors.add(e.visitor);
    s.taps++;
    s.days[e.spDay].t++;
    s.hours[spHour(e.ts)].t++;
    bucket(s.ads, adKey(e)).t++;
    bucket(s.countries, e.country).t++;
    bucket(s.apps, appLabel(e)).t++;
    bucket(s.devices, deviceLabel(e)).t++;
    bucket(s.sources, e.src).t++;
    if (e.meta === "1") s.meta.sent++;
    else s.meta.notSent++;
  }
  s.tapUnique = tapVisitors.size;

  for (const e of consents) {
    if (e.target === "yes") s.meta.yes++;
    else if (e.target === "no") s.meta.no++;
  }

  /* Speed: how long until the Spotify button could be tapped, and whether that cost taps. */
  for (const e of views) {
    if (e.ms == null) continue;
    s.speed.samples.push(e.ms);
    s.speed.hist[Math.min(10, Math.floor(e.ms / 100))]++;
    const tapped = spotifyLoads.has(loadKey(e)) ? 1 : 0;
    if (e.ms < 300) { s.speed.fast.v++; s.speed.fast.t += tapped; }
    if (e.ms > 600) { s.speed.slow.v++; s.speed.slow.t += tapped; }
  }

  s._views = views;
  s._clicks = clicks;
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
  const out = JSON.parse(JSON.stringify({ ...s, _views: undefined, _clicks: undefined }));
  out.speed.samples = [];
  return out;
}

/* ---------- the visit log ---------- */

export function visitLog(s) {
  const taps = new Map();
  for (const c of s._clicks || []) {
    const k = loadKey(c);
    const row = taps.get(k) || (taps.set(k, { spotify: null, other: [], meta: "-" }), taps.get(k));
    if (c.target === "spotify") {
      if (!row.spotify || c.ts < row.spotify.ts) { row.spotify = c; row.meta = c.meta; }
    } else if (!row.other.includes(c.target)) row.other.push(c.target);
  }
  return (s._views || [])
    .slice()
    .sort((a, b) => b.ts - a.ts)
    .map((e) => {
      const t = taps.get(loadKey(e));
      return {
        ts: e.ts, time: spTime(e.ts), visitor: e.visitor, returning: e.ret === "1",
        country: e.country, city: e.city === "-" ? "" : e.city,
        device: deviceLabel(e), app: appLabel(e), src: e.src, ref: e.ref === "-" ? "" : e.ref,
        campaign: e.campaign === "-" ? "" : e.campaign, ad: e.content === "-" ? "" : e.content,
        readyMs: e.ms, spotify: !!(t && t.spotify), tapMs: t && t.spotify ? t.spotify.ms : null,
        other: t ? t.other : [], meta: t && t.spotify ? t.meta === "1" : null,
      };
    });
}

const CSV_COLS = [
  ["time_sao_paulo", "time"], ["visitor", "visitor"], ["returning", "returning"], ["country", "country"],
  ["city", "city"], ["device", "device"], ["browser_or_app", "app"], ["source", "src"], ["referrer", "ref"],
  ["campaign", "campaign"], ["ad", "ad"], ["button_ready_ms", "readyMs"], ["tapped_spotify", "spotify"],
  ["time_to_tap_ms", "tapMs"], ["other_stores", "other"], ["sent_to_meta", "meta"],
];

export function toCSV(rows) {
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

export function dashboard(cur, prev, days, link) {
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
      const [campaign, content] = r.k.split("|");
      return { campaign: campaign === "-" ? "" : campaign, ad: content === "-" ? "" : content, v: r.v, t: r.t };
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
  };
}
