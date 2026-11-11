/* /api/feed/meta-daily.csv and /api/feed/meta-ads.csv — the Ads Tracker sheet's Meta feed
   (11 Nov 2026). Google Sheets pulls them with
     =IMPORTDATA("https://badscandal.com/api/feed/meta-daily.csv?key=...")
   IMPORTDATA can't send headers, so the key is in the address: ?key= must equal the Netlify env
   SHEET_FEED_KEY (secret). Wrong, missing or unset -> a plain 404, as if nothing were here. The query
   string is never logged.

   READ-ONLY towards Meta: GET requests to Ads Insights only (netlify/lib/metaspend.mjs via
   netlify/lib/metaread.mjs, one-hour "meta-cache"). If Meta answers with an error: HTTP 502 and one
   plain, scrubbed line; never a file of zeros for days that couldn't be read. Shapes, range and
   matching: netlify/lib/feed.mjs. The finished file is cached an hour too (meta-cache,
   feed/file/<name>/<since>_<until>.json). */
import { getDeployStore, getStore } from "@netlify/blobs";
import { adTaps, LINKS, summarize, utcDaysFor } from "../lib/admin.mjs";
import { scrub } from "../lib/capi.mjs";
import { ADS_HEAD, adsRows, csv, DAILY_HEAD, dailyRows, daysBetween, feedRange, keyOk, tapsByDayAd } from "../lib/feed.mjs";
import { readMeta } from "../lib/metaread.mjs";
import { CACHE_MS, DEFAULT_ACCOUNT, MONTHLY_CAP } from "../lib/metaspend.mjs";
import { parseKey, PREFIX } from "../lib/stats.mjs";

const HEAD = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const text = (status, body) => new Response(body + "\n", { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...HEAD } });
const FILES = { "meta-daily.csv": "account", "meta-ads.csv": "ad" };

async function listEvents(store, spDays) {
  const lists = await Promise.all(utcDaysFor(spDays).map(async (d) => (await store.list({ prefix: PREFIX + d + "/" })).blobs.map((b) => parseKey(b.key)).filter(Boolean)));
  return lists.flat();
}

export default async (req, context) => {
  const url = new URL(req.url);
  const name = url.pathname.replace(/\/$/, "").split("/").pop();
  const level = FILES[name];
  if (req.method !== "GET" || !level || !(await keyOk(url.searchParams.get("key"), Netlify.env.get("SHEET_FEED_KEY")))) return text(404, "Not found");

  const token = Netlify.env.get("META_ADS_TOKEN");
  if (!token) return text(502, "Meta error: META_ADS_TOKEN is not set on Netlify");
  const account = (Netlify.env.get("META_AD_ACCOUNT_ID") || DEFAULT_ACCOUNT).replace(/\D/g, "");
  const prod = context.deploy?.context === "production";
  const cache = prod ? getStore("meta-cache") : getDeployStore("meta-cache");
  const { since, until } = feedRange();
  const csvOut = (body) => new Response(body, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", ...HEAD } });
  /* The finished file is kept an hour (meta-ads.csv re-reads up to two months of visit records):
     only good files are kept, never an error. */
  const fileKey = `feed/file/${name}/${since}_${until}.json`;
  try {
    let kept = null;
    try { kept = await cache.get(fileKey, { type: "json" }); } catch {}
    if (kept && typeof kept.body === "string" && Date.now() - kept.at < CACHE_MS) return csvOut(kept.body);
    const r = await readMeta({ cache, token, account, since, until, level, key: `feed/${account}/${level}/${since}_${until}.json` });
    if (r.error) {
      console.error("feed " + name + ": Meta " + r.error); /* scrubbed by fetchInsights; never the URL or the key */
      return text(502, "Meta error: " + scrub(r.error));
    }
    let body;
    if (level === "account") body = csv(DAILY_HEAD, dailyRows(r.rows, since, until, MONTHLY_CAP.currency));
    else {
      const days = daysBetween(since, until);
      const events = await listEvents(prod ? getStore("stats") : getDeployStore("stats"), days);
      const songs = LINKS.filter((l) => l.date).map((l) => ({ id: l.id, title: l.title, ...adTaps(summarize(events, days, l.id)) }));
      body = csv(ADS_HEAD, adsRows(r.rows, songs, tapsByDayAd(events, days, songs.map((s) => s.id), summarize, adTaps)));
    }
    try { await cache.setJSON(fileKey, { at: Date.now(), body }); } catch {}
    return csvOut(body);
  } catch (e) {
    console.error("feed " + name + " failed", e?.name || "error");
    return text(500, "Could not build the file");
  }
};

export const config = { path: "/api/feed/*" };
