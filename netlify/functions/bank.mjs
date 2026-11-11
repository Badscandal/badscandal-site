/* The bank reader's doors (11 Nov 2026). Logic: netlify/lib/bank.mjs. Read-only towards the bank.

     POST /api/bank/connect     Luke              -> { url }: Revolut's approval page (read-only access)
     GET  /api/bank/callback    public            the bank sends Luke's browser back here; the single-use
                                                  nonce from connect is the lock. -> 302 /hq?bank=connected#money
                                                  or /hq?bank=failed#money
     GET  /api/bank/status      Luke or Claude    connected? approval days left, last read, last error
     POST /api/bank/sync        Luke or Claude    one refresh now -> its summary
     POST /api/bank/disconnect  Luke              gives the approval back and forgets it

   Luke = the /hq login cookie (POSTs must come from our own page: a foreign Origin is refused).
   Claude = Netlify env STAFF_CLAUDE_KEY in Authorization: Bearer. The bots' key opens nothing here.
   Connecting works only on the live site: the redirect registered with Enable Banking is
   https://badscandal.com/api/bank/callback. Deploy previews use their own throwaway stores.
   Never logged or answered: the session id, the bank's code, the state nonce, any key. */
import { getDeployStore, getStore } from "@netlify/blobs";
import * as B from "../lib/bank.mjs";
import { keyOk } from "../lib/feed.mjs";
import { COOKIE, readCookie, verifySession } from "../lib/session.mjs";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...NO_STORE } });
const back = (flag) => new Response(null, { status: 302, headers: { Location: `/hq?bank=${flag}#money`, "Referrer-Policy": "no-referrer", ...NO_STORE } });
const env = (k) => Netlify.env.get(k);
const fetchImpl = (...a) => fetch(...a);

const bearer = (req) => (req.headers.get("authorization") || "").trim().replace(/^Bearer\s+/i, "").trim();
async function keyRole(req) {
  const given = bearer(req);
  if (!given) return null;
  if (await keyOk(given, Netlify.env.get("STAFF_CLAUDE_KEY"))) return "claude";
  if (await keyOk(given, Netlify.env.get("STAFF_BOT_KEY"))) return "bot";
  return null;
}
async function isLuke(req) {
  const secret = Netlify.env.get("ADMIN_KEY") || Netlify.env.get("STATS_KEY");
  return !!secret && (await verifySession(readCookie(req.headers.get("cookie"), COOKIE), secret));
}
function stores(context) {
  const prod = context?.deploy?.context === "production";
  const open = (name) => (prod ? getStore({ name, consistency: "strong" }) : getDeployStore({ name, consistency: "strong" }));
  return { bank: open("bank"), desk: open("staff"), prod };
}

async function callback(req, context) {
  if (req.method !== "GET") return json(405, { error: "Use GET" });
  const q = new URL(req.url).searchParams;
  try {
    const r = await B.finishCallback({ bank: stores(context).bank, env, now: Date.now(), fetchImpl, code: q.get("code"), state: q.get("state"), error: q.get("error") });
    return back(r.ok ? "connected" : "failed");
  } catch (e) {
    console.error("bank callback failed:", B.logLine(e));
    return back("failed");
  }
}

const CONNECT_SAY = { missing: B.SAY.missing, key: B.SAY.keyBad, refused: B.SAY.keyRefused, no_bank: B.SAY.noBank, network: B.SAY.unreachable };

export default async (req, context) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, "").replace(/^\/api\/bank\//, "");
  try {
    if (path === "callback") return await callback(req, context);
    const luke = await isLuke(req);
    const role = luke ? "luke" : await keyRole(req);
    if (!role) return json(401, { error: "Not logged in" });
    if (role === "bot") return json(403, { error: "The bots can't use the bank reader" });
    if (req.method === "POST" && luke) {
      const origin = req.headers.get("origin");
      if (origin && origin !== url.origin) return json(403, { error: "Forbidden" });
    }
    const st = stores(context), now = Date.now();

    if (path === "status") {
      if (req.method !== "GET") return json(405, { error: "Use GET" });
      return json(200, await B.bankStatus({ bank: st.bank, env, now, canConnectHere: st.prod }));
    }
    if (path === "sync") {
      if (req.method !== "POST") return json(405, { error: "Use POST" });
      const s = await B.syncBank({ bank: st.bank, desk: st.desk, env, now, fetchImpl, budgetMs: B.LIMITS.httpBudgetMs });
      console.log(`bank sync (${role}): ${s.ok ? "ok" : "failed"}, ${s.added} added, ${s.unsorted} to sort, ${s.transfers} transfers, ${s.refunds} refunds, ${s.skipped} skipped${s.more ? ", more next time" : ""}`);
      return json(200, s);
    }
    if (path === "connect") {
      if (req.method !== "POST") return json(405, { error: "Use POST" });
      if (role !== "luke") return json(403, { error: "Only Luke connects Revolut" });
      if (!B.readConfig(env).configured) return json(503, { error: B.SAY.missing });
      if (!st.prod) return json(409, { error: B.SAY.preview });
      try {
        return json(200, await B.startConnect({ bank: st.bank, env, now, fetchImpl }));
      } catch (e) {
        if (e && e.name !== "BankError") throw e;
        console.error("bank connect failed:", B.logLine(e));
        return json(e.kind === "missing" || e.kind === "key" ? 503 : 502, { error: CONNECT_SAY[e.kind] || "Enable Banking did not answer properly. Try again in a minute." });
      }
    }
    if (path === "disconnect") {
      if (req.method !== "POST") return json(405, { error: "Use POST" });
      if (role !== "luke") return json(403, { error: "Only Luke disconnects Revolut" });
      return json(200, await B.disconnect({ bank: st.bank, env, now, fetchImpl }));
    }
  } catch (e) {
    console.error("bank failed:", B.logLine(e));
    return json(500, { error: "Something went wrong" });
  }
  return json(404, { error: "Not found" });
};

export const config = { path: "/api/bank/*" };
