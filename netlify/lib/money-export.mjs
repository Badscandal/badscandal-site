/* The one-time move of HQ's stored money to badscandal books (24 Nov 2026, Luke: "i also want the books site
   to literally be our money page just move it there"). HQ stopped reading these documents in PR #114; they are
   still on the desk. exportMoney() hands them over as ONE JSON file, read only: nothing is changed or deleted
   here. The books site imports the file (it never overwrites what it already has). Luke's login only. */
export const EXPORT_PREFIXES = ["inc/", "chk/"];
export const EXPORT_KEYS = ["sources.json", "closes.json"];

export async function exportMoney(store, now) {
  const keys = [];
  for (const prefix of EXPORT_PREFIXES) {
    const { blobs } = await store.list({ prefix });
    for (const b of blobs || []) if (b && typeof b.key === "string" && /^(inc|chk)\/\d{4}-\d{2}\.json$/.test(b.key)) keys.push(b.key);
  }
  keys.sort();
  keys.push(...EXPORT_KEYS);
  const docs = {};
  for (const key of keys) {
    let v = null;
    try { v = await store.get(key, { type: "json" }); } catch { v = null; }
    if (v != null) docs[key] = v;
  }
  return { exportedAt: new Date(now).toISOString(), from: "badscandal.com/hq", docs };
}
