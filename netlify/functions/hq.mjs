/* /api/hq/data — the BADSCANDAL HQ dashboard's server (11 Nov 2026). Page: hq.html + js/hq.js.
   Same login as /admin (the session cookie from /api/admin/login). READ-ONLY everywhere: it reads
   the bots' "BADSCANDAL HQ" Google Sheet (netlify/lib/gsheets.mjs) and the ECB's average rates.
   ?sample=1 answers with made-up numbers (netlify/lib/hq-sample.mjs) so the page can be looked at
   before the sheet is connected; the page says SAMPLE in big letters. */
import { getDeployStore, getStore } from "@netlify/blobs";
import { spDay } from "../lib/admin.mjs";
import { fetchMonthAverage } from "../lib/fx.mjs";
import { readTabs } from "../lib/gsheets.mjs";
import { hqModel, HQ_TABS } from "../lib/hq.mjs";
import { sampleMeta, sampleSheets } from "../lib/hq-sample.mjs";
import { EXPIRED_CODE, keyHealth, readKeyHealth, readMeta } from "../lib/metaread.mjs";
import { DEFAULT_ACCOUNT } from "../lib/metaspend.mjs";
import { COOKIE, readCookie, verifySession } from "../lib/session.mjs";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...NO_STORE } });
const SHEET_TTL = 10 * 60 * 1000;

async function rates(cache, months, today) {
  const out = {};
  await Promise.all(months.slice(0, 8).map(async (m) => {
    const key = `fx/${m}.json`;
    let got = null;
    try { got = await cache.get(key, { type: "json" }); } catch {}
    const fresh = got && (m < today.slice(0, 7) || Date.now() - got.at < 12 * 3600 * 1000);
    if (!fresh) {
      const fx = await fetchMonthAverage(m, today);
      if (!fx.error) { got = { at: Date.now(), fx }; try { await cache.setJSON(key, got); } catch {} }
    }
    if (got) out[m] = got.fx;
  }));
  return out;
}

/* Meta's own spend for the whole ad account, the 1st of last month .. today (read-only GET, cached an
   hour in meta-cache). -> the `meta` argument of hqModel(): { ok:true, rows, since, until } or
   { ok:false, reason } (the page then says it fell back to the sheet, and why). */
async function metaForHq(cache, today) {
  const token = Netlify.env.get("META_ADS_TOKEN");
  if (!token) return { ok: false, reason: "META_ADS_TOKEN is not set on Netlify" };
  const account = (Netlify.env.get("META_AD_ACCOUNT_ID") || DEFAULT_ACCOUNT).replace(/\D/g, "");
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const since = (m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`) + "-01";
  const r = await readMeta({ cache, token, account, since, until: today, level: "account", key: `hq/${account}/${since}_${today}.json` });
  if (r.error) { console.error("hq meta: " + r.error); return { ok: false, reason: r.error, expired: r.code === EXPIRED_CODE }; }
  return { ok: true, rows: r.rows, since, until: today, at: r.at };
}

const monthsIn = (sheets, today) => {
  const set = new Set([today.slice(0, 7)]);
  for (const tab of ["Spend", "Income", "Royalties"]) for (const r of (sheets[tab] || []).slice(1)) {
    const m = String(r[0] || "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(m)) set.add(m);
  }
  return [...set].sort().reverse();
};

export default async (req, context) => {
  const secret = Netlify.env.get("ADMIN_KEY") || Netlify.env.get("STATS_KEY");
  if (!secret) return json(503, { error: "ADMIN_KEY is not set on Netlify" });
  if (!(await verifySession(readCookie(req.headers.get("cookie"), COOKIE), secret))) return json(401, { error: "Not logged in" });
  const url = new URL(req.url);
  if (req.method !== "GET" || url.pathname.replace(/\/$/, "") !== "/api/hq/data") return json(404, { error: "Not found" });

  const today = spDay(Date.now());
  const cache = context.deploy?.context === "production" ? getStore("meta-cache") : getDeployStore("meta-cache");
  const rawKey = Netlify.env.get("GOOGLE_SA_KEY"), sheetId = Netlify.env.get("HQ_SHEET_ID");
  const sample = url.searchParams.get("sample") === "1";
  try {
    if (sample || !rawKey || !sheetId) {
      if (!sample) return json(200, { connected: false, need: [!rawKey && "GOOGLE_SA_KEY", !sheetId && "HQ_SHEET_ID"].filter(Boolean) });
      const sheets = sampleSheets(today);
      return json(200, { connected: true, sample: true, ...hqModel(sheets, today, await rates(cache, monthsIn(sheets, today), today), sampleMeta(sheets, today)),
        metaKey: { state: "ok", text: "Meta key: reading OK, last read 12 min ago (sample)" }, generated: new Date().toISOString() });
    }
    let got = null;
    try { got = await cache.get("hq/sheets.json", { type: "json" }); } catch {}
    if (!got || Date.now() - got.at > SHEET_TTL || url.searchParams.get("fresh") === "1") {
      const fresh = await readTabs(rawKey, sheetId, HQ_TABS);
      if (fresh.error) {
        console.error("hq sheet: " + fresh.error);
        if (!got) return json(200, { connected: true, error: fresh.error });
      } else {
        got = { at: Date.now(), sheets: fresh.sheets };
        try { await cache.setJSON("hq/sheets.json", got); } catch {}
      }
    }
    const [fx, meta] = await Promise.all([rates(cache, monthsIn(got.sheets, today), today),
      metaForHq(cache, today).catch((e) => ({ ok: false, reason: "Couldn't read Meta (" + (e?.name || "error") + ")" }))]);
    const metaKey = keyHealth(await readKeyHealth(cache), !!Netlify.env.get("META_ADS_TOKEN"));
    return json(200, { connected: true, ...hqModel(got.sheets, today, fx, meta), metaKey, readAt: new Date(got.at).toISOString(), generated: new Date().toISOString() });
  } catch (e) {
    console.error("hq data failed", e?.name || e);
    return json(500, { error: "Could not read the numbers" });
  }
};

export const config = { path: "/api/hq/*" };
