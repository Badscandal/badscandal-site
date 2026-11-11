/* The staff desk's doors (11 Nov 2026). Logic: netlify/lib/staff.mjs; the connector's protocol:
   netlify/lib/mcp.mjs; its tools: netlify/lib/staff-tools.mjs.

     POST /mcp                 the connector the bots add in their app ("Remote HTTPS", one header:
                               Authorization: Bearer <key>). Claude Code connects the same way.
     GET  /api/staff/board     everything /hq shows about the team, the messages and the money in
     POST /api/staff/message   Luke (or Claude) writes on the board        { to, text, needs, re, options }
     POST /api/staff/resolve   …or settles a message                        { id, note }
     POST /api/staff/sort      Luke (or Claude) says what a Revolut payment is { id, month, status: received|transfer, category }
     POST /api/staff/config    Luke switches the bots' key off / on         { botsOn }
     PUT  /api/staff/seed      Claude loads the roster, the income sources and the guide

   Who is calling:
     Luke   = the /hq login cookie (same as every /api/admin/* call; POSTs must come from our own page)
     bots   = Netlify env STAFF_BOT_KEY     (one key for the whole team: the bots' app shares one
                                             connector, so each call names its bot)
     Claude = Netlify env STAFF_CLAUDE_KEY
   Keys travel ONLY in the Authorization header, are compared in constant time and are never logged.
   Luke can switch the bots' key off from /hq at once (config.botsOn) without touching Netlify.
   Deploy previews use their own throwaway store. Nothing here can touch ads, posts or the sheets. */
import { getDeployStore, getStore } from "@netlify/blobs";
import { keyOk } from "../lib/feed.mjs";
import { loadHq } from "../lib/hq-load.mjs";
import { handle } from "../lib/mcp.mjs";
import { COOKIE, readCookie, verifySession } from "../lib/session.mjs";
import * as S from "../lib/staff.mjs";
import { sampleBoard } from "../lib/staff-sample.mjs";
import { callTool, CLAUDE_TOOLS, INSTRUCTIONS, TOOLS } from "../lib/staff-tools.mjs";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (status, data, extra = {}) => new Response(data === null ? null : JSON.stringify(data), { status, headers: { ...(data === null ? {} : { "Content-Type": "application/json; charset=utf-8" }), ...NO_STORE, ...extra } });
const MAX_BODY = 64 * 1024;

async function bodyOf(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) return { tooBig: true };
  try { return { value: JSON.parse(text) }; } catch { return { bad: true }; }
}
/* "Bearer X" or a bare "X" (the bots' app may send either) */
const bearer = (req) => { const h = (req.headers.get("authorization") || "").trim(); return h.replace(/^Bearer\s+/i, "").trim(); };

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
  const prod = context.deploy?.context === "production";
  const open = (name, strong) => (prod ? getStore(strong ? { name, consistency: "strong" } : name) : getDeployStore(strong ? { name, consistency: "strong" } : name));
  return { desk: open("staff", true), cache: open("meta-cache", false) };
}
const hqLoader = (st) => { let p = null; return () => p || (p = loadHq({ cache: st.cache, desk: st.desk, env: (k) => Netlify.env.get(k) })); };

/* one line in the connector's trouble log for a request that was turned away (and for every first
   contact), so a client's "HTTP 404" can be looked up. Requests without a valid key are noted at most
   once every 20 seconds per running copy of this function: nobody outside can make the desk write. */
let lastStranger = 0;
async function note(context, req, status, key, method, extra) {
  const first = method === "initialize" || method === "server/discover";
  if (status < 400 && !first) return;
  if (key === "none" || key === "wrong") { if (Date.now() - lastStranger < 20000) return; lastStranger = Date.now(); }
  try {
    await S.traceConnector(stores(context).desk, Date.now(), { http: req.method, path: new URL(req.url).pathname, method, status, key,
      version: req.headers.get("mcp-protocol-version") || "", agent: req.headers.get("user-agent") || "", note: extra || "" });
  } catch {}
}

async function mcp(req, context) {
  /* No Origin gate here: the key travels in a header that a page on another site cannot forge (no
     cookie is ever accepted on /mcp), and a bot platform's client that happens to send an Origin
     must not be turned away with something that isn't a protocol answer. */
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS", ...NO_STORE } });
  if (!Netlify.env.get("STAFF_BOT_KEY") && !Netlify.env.get("STAFF_CLAUDE_KEY")) return json(503, { error: "The connector's keys are not set on Netlify" });
  const role = await keyRole(req);
  const who = role === "claude" ? "claude" : role === "bot" ? "bots" : bearer(req) ? "wrong" : "none";
  if (!role) {
    await note(context, req, 401, who, "", "no valid key in the Authorization header");
    return json(401, { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Missing or wrong key. Send the header Authorization: Bearer <key>." } }, { "WWW-Authenticate": 'Bearer realm="BADSCANDAL HQ"' });
  }
  if (req.method !== "POST") {
    await note(context, req, 405, who, "", "only POST is answered");
    return json(405, { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Use POST" } }, { Allow: "POST, OPTIONS" });
  }
  const b = await bodyOf(req);
  if (b.tooBig) return json(413, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Too large" } });
  if (b.bad) { await note(context, req, 400, who, "", "the body was not JSON"); return json(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: the body is not JSON" } }); }
  const st = stores(context), now = Date.now();
  const headers = Object.fromEntries([...req.headers].map(([k, v]) => [k.toLowerCase(), v]));
  const ctx = { store: st.desk, now, role, hq: hqLoader(st) };
  const out = await handle(b.value, headers, { tools: role === "claude" ? TOOLS.concat(CLAUDE_TOOLS) : TOOLS, instructions: INSTRUCTIONS, call: (tool, args) => callTool(tool, args, ctx) });
  const method = b.value && typeof b.value.method === "string" ? b.value.method : "";
  await note(context, req, out.status, who, method, out.body && out.body.error ? out.body.error.message : "");
  return json(out.status, out.body);
}

async function api(req, context, path) {
  const url = new URL(req.url);
  const luke = await isLuke(req);
  const role = luke ? "luke" : await keyRole(req);
  if (!role) return json(401, { error: "Not logged in" });
  if (role === "bot") return json(403, { error: "The bots use the connector at /mcp" });
  if (req.method !== "GET") {
    const origin = req.headers.get("origin");
    if (luke && origin && origin !== url.origin) return json(403, { error: "Forbidden" });
  }
  const sample = url.searchParams.get("sample") === "1";
  const now = Date.now();
  const me = role === "luke" ? "Luke" : "Claude";

  if (path === "board" && req.method === "GET") {
    if (sample) return json(200, { sample: true, ...sampleBoard(now) });
    const st = stores(context);
    const [desk, hqAns] = await Promise.all([S.loadDesk(st.desk, now), hqLoader(st)().catch(() => null)]);
    if (role === "claude") await S.touchSeen(st.desk, now, "Claude", "board");
    return json(200, { ...S.board(desk, now, hqAns && hqAns.team ? hqAns : null), hqRead: !!(hqAns && hqAns.team), keys: { bots: !!Netlify.env.get("STAFF_BOT_KEY"), claude: !!Netlify.env.get("STAFF_CLAUDE_KEY") } });
  }
  if (path === "trace" && req.method === "GET") return sample ? json(200, { sample: true, trace: [] }) : json(200, { trace: await S.getTrace(stores(context).desk) });
  if (sample) return json(200, { ok: true, sample: true }); /* the sample never writes */

  const st = stores(context);
  const roster = await S.getRoster(st.desk);
  const b = req.method === "GET" ? { value: {} } : await bodyOf(req);
  if (b.tooBig) return json(413, { error: "Too large" });
  if (b.bad || !b.value || typeof b.value !== "object") return json(400, { error: "Bad request" });
  const a = b.value;
  try {
    if (path === "message" && req.method === "POST") {
      const r = await S.sendMessage(st.desk, now, roster, { from: me, to: a.to, text: a.text, needs: a.needs, re: a.re, options: a.options });
      return json(200, { ok: true, message: r.message });
    }
    if (path === "resolve" && req.method === "POST") return json(200, { ok: true, message: await S.resolveMessage(st.desk, now, roster, { id: a.id, by: me, note: a.note }) });
    if (path === "sort" && req.method === "POST")
      return json(200, { ok: true, entry: await S.sortIncome(st.desk, now, roster, { by: me, id: a.id, month: a.month, status: a.status, category: a.category }) });
    if (path === "config" && req.method === "POST") {
      if (role !== "luke") return json(403, { error: "Only Luke switches the bots' key" });
      return json(200, { ok: true, config: await S.setConfig(st.desk, now, { botsOn: a.botsOn }) });
    }
    if (path === "seed" && req.method === "PUT") {
      const done = [];
      if (a.roster) { await S.setRoster(st.desk, a.roster); done.push("roster"); }
      if (a.sources) { await S.setSources(st.desk, a.sources); done.push("sources"); }
      if (typeof a.guide === "string") { await S.setGuide(st.desk, now, a.guide); done.push("guide"); }
      return json(200, { ok: true, done });
    }
  } catch (e) {
    if (e && e.name === "StaffError") return json(e.code === "not_found" ? 404 : e.code === "busy" ? 503 : 400, { error: e.message });
    console.error("staff api failed", e?.name || e);
    return json(500, { error: "Could not save that" });
  }
  return json(404, { error: "Not found" });
}

export default async (req, context) => {
  const path = new URL(req.url).pathname.replace(/\/$/, "");
  try {
    if (path === "/mcp" || path.startsWith("/mcp/")) return await mcp(req, context);
    if (path.startsWith("/api/staff/")) return await api(req, context, path.slice("/api/staff/".length));
  } catch (e) {
    console.error("staff failed", e?.name || e);
    return json(500, { error: "Something went wrong" });
  }
  return json(404, { error: "Not found" });
};

export const config = { path: ["/mcp", "/mcp/*", "/api/staff/*"] };
