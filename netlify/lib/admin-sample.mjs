/* MADE-UP numbers for /hq?sample=1 (11 Nov 2026): the page-visit side (Songs, Ads, Pages) of the one
   dashboard. Nothing here is real and nothing is written anywhere: sampleEnv() returns an in-memory
   "stats" store full of invented visit keys (the same key format the counter writes, so every real
   code path in netlify/functions/admin.mjs runs on it unchanged: numbers, visit log, CSV, Meta
   health) and an in-memory "meta-cache" that answers every Meta question from invented ad rows, so
   no request ever goes to Meta. The page shows a SAMPLE banner whenever this is used. */
import { eventKey } from "./stats.mjs";
import { healthKey, LAST_ERROR_KEY, LAST_KEY } from "./capi.mjs";
import { addDays, spDay } from "./admin.mjs";
import { KEY_HEALTH } from "./metaread.mjs";

/* A Blobs-like store in memory (get / set / setJSON / delete / list). */
export function memoryStore(entries = []) {
  const m = new Map(entries);
  return {
    get: async (k, o) => (m.has(k) ? (o && o.type === "json" ? JSON.parse(m.get(k)) : m.get(k)) : null),
    set: async (k, v) => { m.set(k, String(v)); },
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    delete: async (k) => { m.delete(k); },
    list: async ({ prefix = "" } = {}) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
    size: () => m.size,
  };
}

/* The made-up ads: name (= utm_content on the visits), page, campaign, spend per day (USD). */
export const SAMPLE_ADS = [
  { ad: "TM BR - vocal contatinho", content: "tm-br-vocal-contatinho", page: "touchme", campaign: "Touch Me BR", adset: "BR 18-34", usd: 9, tapRate: 0.46 },
  { ad: "TM BR - vermelho letra", content: "tm-br-vermelho-letra", page: "touchme", campaign: "Touch Me BR", adset: "BR 18-34", usd: 7.5, tapRate: 0.38 },
  { ad: "TM BR - noite DJ", content: "tm-br-noite-dj", page: "touchme", campaign: "Touch Me BR", adset: "BR 25-44", usd: 6, tapRate: 0.29 },
  { ad: "MDSB BR - teaser", content: "mdsb-br-teaser", page: "medaseubody", campaign: "Me Da Seu Body launch", adset: "BR 18-34", usd: 4, tapRate: 0.33 },
];

function rng(seed) { let r = seed % 2147483647 || 7; return () => (r = (r * 16807) % 2147483647) / 2147483647; }

/* ~14 days of visits for the songs and the home page, ending now. */
export function sampleStatsEntries(now = Date.now()) {
  const rnd = rng(Number(spDay(now).replace(/-/g, "")));
  const out = [];
  const geo = [["br", "sao-paulo", 0.6], ["br", "rio-de-janeiro", 0.14], ["br", "belo-horizonte", 0.07], ["pt", "lisbon", 0.06], ["ie", "dublin", 0.05], ["de", "berlin", 0.04], ["es", "madrid", 0.04]];
  const apps = [["instagram", "ios", "mobile", "webview", 0.5], ["instagram", "android", "mobile", "webview", 0.22], ["facebook", "android", "mobile", "webview", 0.1], ["-", "ios", "mobile", "safari", 0.1], ["-", "macos", "desktop", "chrome", 0.08]];
  const pick = (a, w) => { let x = rnd() * a.reduce((s, i) => s + i[w], 0); for (const i of a) { x -= i[w]; if (x <= 0) return i; } return a[0]; };
  let n = 0;
  const add = (e, ts) => out.push([eventKey(e, ts, "x" + n++), ""]);
  for (let d = 13; d >= 0; d--) {
    /* inside São Paulo day "today - d" (SP = UTC-3): 03:00 UTC .. 03:00 UTC, and only up to now */
    const start = Date.parse(addDays(spDay(now), -d) + "T03:00:00Z");
    const span = d === 0 ? Math.max(0.5, (now - start) / 3600000) : 24;
    for (const page of ["touchme", "medaseubody", "home"]) {
      const count = Math.round((page === "touchme" ? 34 + (13 - d) * 2 : page === "medaseubody" ? 8 + (13 - d) : 12) * (span / 24) + rnd() * 6);
      for (let i = 0; i < count; i++) {
        const ts = start + Math.floor(rnd() * span * 3600000);
        const ads = SAMPLE_ADS.filter((a) => a.page === page);
        const ad = ads.length && rnd() < 0.75 ? ads[Math.floor(rnd() * ads.length)] : null;
        const g = pick(geo, 2), a = pick(apps, 4);
        const eu = ["pt", "ie", "de", "es"].includes(g[0]);
        const base = { page, src: ad ? "meta" : page === "home" ? "direct" : "ig", country: g[0], city: g[1], visitor: "v" + page.slice(0, 2) + Math.floor(rnd() * (page === "touchme" ? 260 : 90)), pv: "p" + Math.floor(rnd() * 1e9),
          campaign: ad ? "br" : "", content: ad ? ad.content : "", app: a[0], os: a[1], device: a[2], browser: a[3], ref: a[0] === "instagram" ? "l.instagram.com" : "", fb: ad ? 1 : 0 };
        const ms = Math.round(110 + rnd() * rnd() * 800);
        add({ ...base, type: "view", ms, ret: rnd() < 0.1 ? 1 : 0 }, ts);
        if (rnd() < 0.07) { add({ ...base, visitor: "b" + n, pv: "b" + n, type: "view", ms: 80, bot: rnd() < 0.6 ? "dc-meta" : "dc-town", city: "prineville", country: "us" }, ts + 2000); continue; }
        if (rnd() < 0.08) continue; /* looked, never touched: hidden */
        add({ ...base, type: "act", target: "touch", ms: ms + 600 }, ts + 700);
        if (eu && page !== "home" && rnd() < 0.7) add({ ...base, type: "consent", target: rnd() < 0.6 ? "yes" : "no" }, ts + 1500);
        if (page === "home") { if (rnd() < 0.3) add({ ...base, type: "click", target: ["spotify", "instagram", "youtube"][Math.floor(rnd() * 3)], ms: 3000 }, ts + 3000); continue; }
        if (rnd() < (ad ? ad.tapRate : 0.3)) {
          add({ ...base, type: "click", target: "spotify", ms: Math.round(1500 + rnd() * 5000), meta: eu ? (rnd() < 0.55 ? 1 : 0) : 1 }, ts + 3500);
          out.push([healthKey({ events: "sc", sent: 1, received: 1, result: "ok" }, ts + 3600, "h" + n++), ""]);
        }
        out.push([healthKey({ events: "pv.vc", sent: 2, received: 2, result: "ok" }, ts + 900, "h" + n++), ""]);
      }
    }
  }
  out.push([LAST_KEY, JSON.stringify({ ok: true, ts: now - 3 * 60000, events: ["SpotifyClick"], received: 1, detail: "-", message: "", test: false })]);
  out.push([LAST_ERROR_KEY, JSON.stringify({ ok: false, ts: now - 30 * 3600000, events: ["PageView", "ViewContent"], received: null, detail: "timeout", message: "Meta didn't answer within 5 seconds", test: false })]);
  return out;
}

/* Made-up ad-level rows for since..until (USD). */
export function sampleAdRows(since, until) {
  const rows = [];
  for (let d = since, k = 0; d <= until && k < 120; d = addDays(d, 1), k++) {
    for (const a of SAMPLE_ADS) {
      const spend = Math.round(a.usd * (0.8 + ((k * 7 + a.usd * 3) % 5) / 10) * 100) / 100;
      const impressions = Math.round(spend * 180), reach = Math.round(impressions * 0.8), clicks = Math.round(spend * 4);
      rows.push({ day: d, ad: a.ad, adset: a.adset, campaign: a.campaign, spend, currency: "USD", impressions, reach, linkClicks: clicks, lpv: Math.round(clicks * 0.7) });
    }
  }
  return rows;
}

/* A meta-cache that answers every read from the made-up rows (so readMeta() never calls Meta). */
function sampleMetaCache(now) {
  const real = memoryStore([[KEY_HEALTH, JSON.stringify({ ok: true, at: now - 12 * 60000, lastOk: now - 12 * 60000 })]]);
  const range = (key) => { const m = /(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})/.exec(key); return m ? [m[1], m[2]] : null; };
  return {
    ...real,
    get: async (key, o) => {
      if (key.startsWith("fx/")) return { at: now, fx: { USD: 1.1204, GBP: 0.8712, BRL: 6.1, days: 8 } };
      if (key.startsWith("cap/")) {
        const today = key.slice(-15, -5);
        const rows = sampleAdRows(today.slice(0, 8) + "01", today);
        const by = {};
        for (const r of rows) by[r.day] = (by[r.day] || 0) + r.spend;
        return { at: now - 20 * 60000, rows: Object.entries(by).map(([day, spend]) => ({ day, spend: Math.round(spend * 100) / 100, currency: "USD" })) };
      }
      const r = range(key);
      if (key.startsWith("insights/") && r) return { at: now - 20 * 60000, rows: sampleAdRows(r[0], r[1]) };
      return real.get(key, o);
    },
  };
}

let memo = null;
/* The stand-in for the real stores + Meta settings (see envFor() in netlify/functions/admin.mjs). */
export function sampleEnv(now = Date.now()) {
  const day = spDay(now);
  if (!memo || memo.day !== day || now - memo.at > 15 * 60000) memo = { day, at: now, entries: sampleStatsEntries(now) };
  return { sample: true, stats: memoryStore(memo.entries), cache: sampleMetaCache(now), token: "sample", account: "0", testMode: false };
}
