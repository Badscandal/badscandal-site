/* /api/hq/data — the BADSCANDAL HQ dashboard's server (11 Nov 2026). Page: hq.html + js/hq.js.
   Same login as /admin (the session cookie from /api/admin/login). READ-ONLY everywhere: it reads
   the bots' "BADSCANDAL HQ" Google Sheet (netlify/lib/gsheets.mjs), Meta's own spend and the ECB's
   average rates; all of that lives in netlify/lib/hq-load.mjs (shared with the staff connector and
   the twice-daily check). ?sample=1 answers with made-up numbers (netlify/lib/hq-sample.mjs) so the
   page can be looked at before the sheet is connected; the page says SAMPLE in big letters.
   Since 12 Nov 2026 it also hands /api/hq/push/* (the HQ apps' push alerts: register a device, what is
   waiting on Luke, a test alert, the write-only push key) to netlify/lib/push-api.mjs, behind the same
   login; those are the only writes here. */
import { getDeployStore, getStore } from "@netlify/blobs";
import { loadHq } from "../lib/hq-load.mjs";
import { pushApi } from "../lib/push-api.mjs";
import * as IG from "../lib/instagram.mjs";
import * as S from "../lib/staff.mjs";
import { COOKIE, readCookie, verifySession } from "../lib/session.mjs";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...NO_STORE } });

export default async (req, context) => {
  const secret = Netlify.env.get("ADMIN_KEY") || Netlify.env.get("STATS_KEY");
  if (!secret) return json(503, { error: "ADMIN_KEY is not set on Netlify" });
  if (!(await verifySession(readCookie(req.headers.get("cookie"), COOKIE), secret))) return json(401, { error: "Not logged in" });
  const url = new URL(req.url);
  const prod = context.deploy?.context === "production";
  /* the Instagram reader (B4, 17 Nov 2026), the same login: GET /api/hq/instagram (status, posts, comments,
     countries; never the key) · POST .../key {token} (write-only, the published site only) · POST .../sync (read
     now) · POST .../disconnect. POSTs only from our own page. ?sample=1 = made-up numbers, nothing written. */
  if (url.pathname.startsWith("/api/hq/instagram")) {
    const sub = url.pathname.replace(/^\/api\/hq\/instagram\/?/, "");
    const sample = url.searchParams.get("sample") === "1";
    if (req.method === "GET" && !sub) return json(200, sample ? IG.sampleView(Date.now()) : await IG.igView(igStore(prod), Date.now()));
    if (req.method !== "POST") return json(404, { error: "Not found" });
    const origin = req.headers.get("origin");
    if (origin && origin !== url.origin) return json(403, { error: "Forbidden" });
    if (sample) return json(200, { ok: false, error: "This is the sample: nothing is saved." });
    const store = igStore(prod), now = Date.now();
    try {
      if (sub === "key") {
        if (!prod) return json(409, { error: "Connect Instagram on badscandal.com itself, not on a preview." });
        let body = {};
        try { const t = await req.text(); if (t.length > 4096) return json(413, { error: "Too large." }); body = JSON.parse(t || "{}"); } catch { body = {}; }
        const r = await IG.saveKey(store, body && body.token, now);
        const sync = await IG.syncInstagram({ store, now, logGrowth: deskGrowth(prod, now) });
        return json(200, { ok: true, username: r.username, followers: r.followers, read: sync.ok, ...(sync.ok ? {} : { error: sync.error }) });
      }
      if (sub === "sync") { const r = await IG.syncInstagram({ store, now, logGrowth: deskGrowth(prod, now) }); return json(200, r); }
      if (sub === "disconnect") { await IG.forgetKey(store); return json(200, { ok: true }); }
    } catch (e) {
      if (e && e.kind) return json(400, { error: e.message, kind: e.kind });
      console.error("hq instagram failed", e?.name || "Error");
      return json(500, { error: "Something went wrong" });
    }
    return json(404, { error: "Not found" });
  }
  /* the HQ apps' push alerts (12 Nov 2026): the same login, then netlify/lib/push-api.mjs */
  if (url.pathname.startsWith("/api/hq/push/")) {
    try {
      return await pushApi(req, { store: () => (prod ? getStore({ name: "staff", consistency: "strong" }) : getDeployStore({ name: "staff", consistency: "strong" })), env: (k) => Netlify.env.get(k) });
    } catch (e) {
      console.error("hq push failed", e?.name || "Error");
      return json(500, { error: "Something went wrong" });
    }
  }
  if (req.method !== "GET" || url.pathname.replace(/\/$/, "") !== "/api/hq/data") return json(404, { error: "Not found" });

  const cache = prod ? getStore("meta-cache") : getDeployStore("meta-cache");
  const sample = url.searchParams.get("sample") === "1";
  /* the staff desk (the bots' connector updates); never opened for the sample */
  let desk = null;
  if (!sample) { try { desk = prod ? getStore({ name: "staff", consistency: "strong" }) : getDeployStore({ name: "staff", consistency: "strong" }); } catch { desk = null; } }
  try {
    return json(200, await loadHq({ cache, desk, env: (k) => Netlify.env.get(k), sample, fresh: url.searchParams.get("fresh") === "1" }));
  } catch (e) {
    console.error("hq data failed", e?.name || e);
    return json(500, { error: "Could not read the numbers" });
  }
};

function igStore(prod) { return prod ? getStore({ name: "instagram", consistency: "strong" }) : getDeployStore({ name: "instagram", consistency: "strong" }); }
/* HQ's Instagram row on the desk (log_growth by HQ), so Growth's Instagram card fills itself */
function deskGrowth(prod, now) {
  const desk = prod ? getStore({ name: "staff", consistency: "strong" }) : getDeployStore({ name: "staff", consistency: "strong" });
  return async (row) => S.logGrowth(desk, now, await S.getRoster(desk), { by: "HQ", date: S.spDay(now), ...row });
}

export const config = { path: "/api/hq/*" };
