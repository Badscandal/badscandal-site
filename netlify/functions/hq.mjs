/* /api/hq/data — the BADSCANDAL HQ dashboard's server (11 Nov 2026). Page: hq.html + js/hq.js.
   Same login as /admin (the session cookie from /api/admin/login). READ-ONLY everywhere: it reads
   the bots' "BADSCANDAL HQ" Google Sheet (netlify/lib/gsheets.mjs) and the ECB's average rates.
   ?sample=1 answers with made-up numbers (netlify/lib/hq-sample.mjs) so the page can be looked at
   before the sheet is connected; the page says SAMPLE in big letters.

   /api/hq/summary — the same numbers trimmed for a phone (hqSummary), for the LDashboard app's
   BADSCANDAL tab (luke-lilian-before-we-go, its own /api/hq fetches this server to server).
   Auth: "Authorization: Bearer <HQ_APP_TOKEN>" ONLY (no cookie, no CORS headers: browsers on other
   sites can't read it). HQ_APP_TOKEN unset -> 503 (fails closed); wrong -> 401. ?sample=1 works
   here too, still behind the token. */
import { getDeployStore, getStore } from "@netlify/blobs";
import { spDay } from "../lib/admin.mjs";
import { fetchMonthAverage } from "../lib/fx.mjs";
import { readTabs } from "../lib/gsheets.mjs";
import { hqModel, hqSummary, HQ_TABS } from "../lib/hq.mjs";
import { sampleSheets } from "../lib/hq-sample.mjs";
import { bearerOk, COOKIE, readCookie, verifySession } from "../lib/session.mjs";

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

const monthsIn = (sheets, today) => {
  const set = new Set([today.slice(0, 7)]);
  for (const tab of ["Spend", "Income", "Royalties"]) for (const r of (sheets[tab] || []).slice(1)) {
    const m = String(r[0] || "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(m)) set.add(m);
  }
  return [...set].sort().reverse();
};

/* The model, from the sheet (cached 10 min) or the sample. -> {body} (ready to send) or {model, ...}. */
async function build(url, context) {
  const today = spDay(Date.now());
  const cache = context.deploy?.context === "production" ? getStore("meta-cache") : getDeployStore("meta-cache");
  const rawKey = Netlify.env.get("GOOGLE_SA_KEY"), sheetId = Netlify.env.get("HQ_SHEET_ID");
  if (url.searchParams.get("sample") === "1") {
    const sheets = sampleSheets(today);
    return { model: hqModel(sheets, today, await rates(cache, monthsIn(sheets, today), today)), sample: true };
  }
  if (!rawKey || !sheetId) return { body: { connected: false, need: [!rawKey && "GOOGLE_SA_KEY", !sheetId && "HQ_SHEET_ID"].filter(Boolean) } };
  let got = null;
  try { got = await cache.get("hq/sheets.json", { type: "json" }); } catch {}
  if (!got || Date.now() - got.at > SHEET_TTL || url.searchParams.get("fresh") === "1") {
    const fresh = await readTabs(rawKey, sheetId, HQ_TABS);
    if (fresh.error) {
      console.error("hq sheet: " + fresh.error);
      if (!got) return { body: { connected: true, error: fresh.error } };
    } else {
      got = { at: Date.now(), sheets: fresh.sheets };
      try { await cache.setJSON("hq/sheets.json", got); } catch {}
    }
  }
  const fx = await rates(cache, monthsIn(got.sheets, today), today);
  return { model: hqModel(got.sheets, today, fx), readAt: new Date(got.at).toISOString() };
}

export default async (req, context) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, "");

  if (path === "/api/hq/summary") {
    const token = Netlify.env.get("HQ_APP_TOKEN");
    if (!token) return json(503, { error: "HQ_APP_TOKEN is not set on Netlify" });
    if (!(await bearerOk(req.headers.get("authorization"), token))) return json(401, { error: "Wrong token" });
    if (req.method !== "GET") return json(405, { error: "GET only" });
    try {
      const r = await build(url, context);
      if (r.body) return json(200, r.body);
      return json(200, { connected: true, ...(r.sample ? { sample: true } : { readAt: r.readAt }), ...hqSummary(r.model), generated: new Date().toISOString() });
    } catch (e) {
      console.error("hq summary failed", e?.name || e);
      return json(500, { error: "Could not read the numbers" });
    }
  }

  const secret = Netlify.env.get("ADMIN_KEY") || Netlify.env.get("STATS_KEY");
  if (!secret) return json(503, { error: "ADMIN_KEY is not set on Netlify" });
  if (!(await verifySession(readCookie(req.headers.get("cookie"), COOKIE), secret))) return json(401, { error: "Not logged in" });
  if (req.method !== "GET" || path !== "/api/hq/data") return json(404, { error: "Not found" });
  try {
    const r = await build(url, context);
    if (r.body) return json(200, r.body);
    return json(200, { connected: true, ...(r.sample ? { sample: true } : { readAt: r.readAt }), ...r.model, generated: new Date().toISOString() });
  } catch (e) {
    console.error("hq data failed", e?.name || e);
    return json(500, { error: "Could not read the numbers" });
  }
};

export const config = { path: "/api/hq/*" };
