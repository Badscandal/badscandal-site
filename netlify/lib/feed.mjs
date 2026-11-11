/* The Ads Tracker sheet feed (11 Nov 2026): two CSV files Google Sheets pulls with IMPORTDATA.
   Pure functions only (unit tested in tests/feed.test.mjs); the server is netlify/functions/feed.mjs.

   meta-daily.csv  date,platform,campaign,spend,currency
                   one row per calendar day, the WHOLE ad account (level=account), platform "Meta",
                   campaign "ALL (account)"; a day Meta reports nothing for is 0.00.
   meta-ads.csv    date,campaign,ad_set,ad,song,spend,currency,impressions,reach,link_clicks,
                   landing_page_views,spotify_taps,cost_per_tap
                   song = songOf() (the same matching /admin uses); spotify_taps = people-only
                   ("Humans only") Spotify taps from our own counter for that ad (adKey of
                   utm_content) on that day; cost_per_tap empty when there are no taps.
   Range: the 1st of last month up to YESTERDAY in Europe/Dublin, so every row is a finished day.
   Dates are Meta's (the ad account's days); our taps are counted on São Paulo days. */
import { adKey, songOf } from "./metaspend.mjs";
import { sameString } from "./session.mjs";

export const DAILY_HEAD = ["date", "platform", "campaign", "spend", "currency"];
export const ADS_HEAD = ["date", "campaign", "ad_set", "ad", "song", "spend", "currency", "impressions", "reach", "link_clicks", "landing_page_views", "spotify_taps", "cost_per_tap"];

const dublinFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit" });
export const dublinDay = (ts) => dublinFmt.format(ts);
const addDays = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

/* -> { since, until }: the 1st of last month .. yesterday, Dublin time. */
export function feedRange(now = Date.now()) {
  const today = dublinDay(now);
  const until = addDays(today, -1);
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const since = (m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`) + "-01";
  return { since, until };
}

export function daysBetween(since, until) {
  const out = [];
  for (let d = since; d <= until && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/* One CSV field: quoted only when needed (IMPORTDATA reads values, it never runs them as formulas). */
export function cell(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export const csv = (head, rows) => [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
const money2 = (n) => (Math.round(n * 100) / 100).toFixed(2);

/* rows: fetchInsights(..., "account"). fallbackCurrency: used only when Meta returned no row at all. */
export function dailyRows(rows, since, until, fallbackCurrency = "USD") {
  const currency = (rows.find((r) => r.currency) || {}).currency || fallbackCurrency;
  const by = {};
  for (const r of rows) if (r.day >= since && r.day <= until) by[r.day] = (by[r.day] || 0) + (Number(r.spend) || 0);
  return daysBetween(since, until).map((d) => [d, "Meta", "ALL (account)", money2(by[d] || 0), currency]);
}

/* rows: fetchInsights(..., "ad"). songs: [{id, title, tapsByAd}] for the matching.
   taps: { "YYYY-MM-DD|<adKey>": n } people-only Spotify taps. Each (day, ad) gets its taps once,
   on its first row, so an ad name used in two ad sets can't double them. */
export function adsRows(rows, songs, taps) {
  const titled = Object.fromEntries(songs.map((s) => [s.id, s.title || s.id]));
  const used = new Set();
  return [...rows]
    .filter((r) => r.day)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : (a.campaign + a.adset + a.ad).localeCompare(b.campaign + b.adset + b.ad)))
    .map((r) => {
      const k = r.day + "|" + adKey(r.ad);
      const t = used.has(k) ? 0 : taps[k] || 0;
      used.add(k);
      const id = songOf(r, songs);
      return [r.day, r.campaign, r.adset, r.ad, id ? titled[id] : "", money2(r.spend || 0), r.currency || "",
        r.impressions, r.reach, r.linkClicks, r.lpv, t, t > 0 ? money2((r.spend || 0) / t) : ""];
    });
}

/* ?key= against SHEET_FEED_KEY: both sides hashed first, then a constant-time compare. */
export async function keyOk(given, want) {
  if (!want || typeof given !== "string" || !given || given.length > 256) return false;
  const h = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("bs-feed|" + s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const [a, b] = await Promise.all([h(given), h(want)]);
  return sameString(a, b);
}

/* People-only Spotify taps per (São Paulo day, ad), exactly as /admin counts them for a one-day
   range ("Humans only"): summarize() + adTaps() from netlify/lib/admin.mjs, per song, per day. */
export function tapsByDayAd(events, days, songIds, summarize, adTaps) {
  const out = {};
  for (const id of songIds) for (const d of days) {
    const t = adTaps(summarize(events, [d], id)).tapsByAd;
    for (const [k, n] of Object.entries(t)) if (n) out[d + "|" + k] = (out[d + "|" + k] || 0) + n;
  }
  return out;
}
