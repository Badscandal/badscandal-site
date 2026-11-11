/* One way to read Meta Ads Insights for the whole site (11 Nov 2026): /admin, /hq and the sheet
   feed all go through readMeta(), so they share the one-hour "meta-cache" Blob cache and the key's
   health record. READ-ONLY: fetchInsights() only ever sends GET requests to Ads Insights.

   Key health ("Meta key: reading OK, last read 12 min ago" / "The Meta key has expired: make a new
   one"): every REAL read (not a cache hit) overwrites KEY_HEALTH in the cache store with
   { ok, at, code, error, lastOk }. META_ADS_TOKEN is a personal token and can expire after about
   60 days; Meta then answers with error code 190. The token itself is never stored or logged. */
import { CACHE_MS, fetchInsights } from "./metaspend.mjs";

export const KEY_HEALTH = "meta-key/health.json";
export const EXPIRED_CODE = 190;

/* cache: a Blobs store (get/setJSON). key: the cache key for this exact question.
   -> { rows, at } | { error, code, stale: {rows, at} | null } */
export async function readMeta({ cache, token, account, since, until, level = "ad", key, fetchImpl = fetch, now = Date.now(), maxAge = CACHE_MS }) {
  let got = null;
  try { got = await cache.get(key, { type: "json" }); } catch {}
  if (got && Array.isArray(got.rows) && now - got.at <= maxAge) return { rows: got.rows, at: got.at, cached: true };
  const fresh = await fetchInsights(token, account, since, until, fetchImpl, level);
  await noteHealth(cache, fresh.error ? { ok: false, at: now, code: fresh.code || null, error: fresh.error } : { ok: true, at: now });
  if (fresh.error) return { error: fresh.error, code: fresh.code || null, stale: got && Array.isArray(got.rows) ? { rows: got.rows, at: got.at } : null };
  try { await cache.setJSON(key, { at: now, rows: fresh.rows }); } catch {}
  return { rows: fresh.rows, at: now };
}

async function noteHealth(cache, rec) {
  let prev = null;
  try { prev = await cache.get(KEY_HEALTH, { type: "json" }); } catch {}
  const lastOk = rec.ok ? rec.at : (prev && (prev.ok ? prev.at : prev.lastOk)) || null;
  try { await cache.setJSON(KEY_HEALTH, { ...rec, lastOk }); } catch {}
}

export async function readKeyHealth(cache) {
  try { return await cache.get(KEY_HEALTH, { type: "json" }); } catch { return null; }
}

const ago = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return "just now";
  if (m < 60) return m + " min ago";
  const h = Math.round(m / 60);
  return h < 48 ? h + " h ago" : Math.round(h / 24) + " days ago";
};

/* The one line shown at the top of /admin and in /hq Today. state: ok | expired | error | unknown | off */
export function keyHealth(rec, hasToken, now = Date.now()) {
  if (!hasToken) return { state: "off", text: "Meta key: not set (META_ADS_TOKEN on Netlify)" };
  if (!rec) return { state: "unknown", text: "Meta key: not read yet" };
  if (rec.ok) return { state: "ok", text: "Meta key: reading OK, last read " + ago(now - rec.at), at: rec.at };
  if (Number(rec.code) === EXPIRED_CODE) return { state: "expired", text: "The Meta key has expired: make a new one", at: rec.at };
  return { state: "error", text: "Meta key: couldn't read (" + rec.error + ")" + (rec.lastOk ? ", last good read " + ago(now - rec.lastOk) : ""), at: rec.at };
}
