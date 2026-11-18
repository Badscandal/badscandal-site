/* The staff desk's doors (11 Nov 2026). Logic: netlify/lib/staff.mjs; the connector's protocol:
   netlify/lib/mcp.mjs; its tools: netlify/lib/staff-tools.mjs.

     POST /mcp                 the connector the bots add in their app ("Remote HTTPS", one header:
                               Authorization: Bearer <key>). Claude Code connects the same way.
     GET  /api/staff/board     everything /hq shows about the team, the messages and the money in
     POST /api/staff/message   Luke (or Claude) writes on the board        { to, text, needs, re, options, note }
                               (-> settled: did the answer close the message it answers; note = Luke's pick)
     POST /api/staff/resolve   …or settles a message                        { id, note }
     POST /api/staff/sort      Luke (or Claude) says what a Revolut payment is { id, month, status: received|transfer, category, pending_id? }
     POST /api/staff/config    Luke switches the bots' key off / on         { botsOn }
     POST /api/staff/card      Luke answers an action card                  { id, choice: yes|no|edit, text? }
     POST /api/staff/auto      Luke only: taps count as his yes, or one bot's webhook { tapsCountAsYes?, webhook?: { bot, url } }
     PUT  /api/staff/seed      Claude loads the roster, the income sources and the guide
     POST /api/staff/release         a release pack: start a draft or change one { id?, title, date, pack }
     POST /api/staff/release/send    …send it to the team (steps get dates)       { id }
     POST /api/staff/release/date    …move its release day                         { id, date }
     POST /api/staff/release/cancel  …cancel it                                    { id }
     POST /api/staff/release/step    …mark one step (Luke may mark any)            { id, step, status, note, link }
     POST /api/staff/release/remove  …take a cancelled or long-out one off the desk { id }
     GET  /api/staff/release?id=     ONE whole release (the board's copy has no lyrics and no log)
     (the release pipeline, 11 Nov 2026: every answer is { ok, release: releaseView } or 400 { error }
      in a plain sentence; a refused send also carries missing: [field keys] and canSendAnyway: true.
      release/send takes anyway: true (Luke or Claude): sent with required fields missing)
     POST /api/staff/sighting        Luke answers what a song Spotify for Artists shows is  { key, answer, label?, note? }
                                     answer: self | label | notmine | mistake (Luke only, 11 Nov 2026)
     GET  /api/staff/fields          the release form's fields and steps, without reading the desk (12 Nov
                                     2026: #releases/new opens the form before the board has arrived)

   Push alerts (12 Nov 2026, the HQ apps): after a bot's send_message to Luke that needs him, a
   spotify_upcoming report, or Claude's POST message to Luke that needs him, a push sweep runs
   (netlify/lib/push.mjs). It runs after the answer (context.waitUntil) when Netlify offers that, else
   it is awaited; either way it can never fail the call.

   Who is calling:
     Luke   = the /hq login cookie (same as every /api/admin/* call; POSTs must come from our own page)
     bots   = Netlify env STAFF_BOT_KEY     (one key for the whole team: the bots' app shares one
                                             connector, so each call names its bot)
     Claude = Netlify env STAFF_CLAUDE_KEY
   Keys travel ONLY in the Authorization header, are compared in constant time and are never logged.
   Luke can switch the bots' key off from /hq at once (config.botsOn) without touching Netlify.
   Deploy previews use their own throwaway store. Nothing here can touch ads, posts or the sheets. */
import { loadReport, sampleReport } from "../lib/account-health.mjs";
import { getDeployStore, getStore } from "@netlify/blobs";
import { keyOk } from "../lib/feed.mjs";
import { dispatchSongJob, readSongReport } from "../lib/github.mjs";
import { loadHq } from "../lib/hq-load.mjs";
import { handle } from "../lib/mcp.mjs";
import { sweep as pushSweep } from "../lib/push.mjs";
import { COOKIE, readCookie, verifySession } from "../lib/session.mjs";
import * as C from "../lib/action-cards.mjs";
import { pingNames } from "../lib/desk-push.mjs";
import * as S from "../lib/staff.mjs";
import * as W from "../lib/workspaces.mjs";
import { sampleBoard, sampleReleases, sampleSightings } from "../lib/staff-sample.mjs";
import { callTool, CLAUDE_TOOLS, INSTRUCTIONS, TOOLS, toolsFor, instructionsFor } from "../lib/staff-tools.mjs";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (status, data, extra = {}) => new Response(data === null ? null : JSON.stringify(data), { status, headers: { ...(data === null ? {} : { "Content-Type": "application/json; charset=utf-8" }), ...NO_STORE, ...extra } });
const MAX_BODY = 64 * 1024;
/* upload_cover carries the picture itself (16 Nov 2026, Webmaster: every upload was refused "Too large"): ONE
   tools/call of upload_cover may be up to 5.8 MB (a 4 MB picture in base64, under Netlify's 6 MB); every other
   request stays at 64 KB */
const MAX_UPLOAD_BODY = 5.8 * 1024 * 1024;
const isUpload = (v) => !!v && !Array.isArray(v) && v.method === "tools/call" && v.params && v.params.name === "upload_cover";

async function bodyOf(req, { upload = false } = {}) {
  const text = await req.text();
  if (text.length > MAX_BODY) {
    if (!upload || text.length > MAX_UPLOAD_BODY) return { tooBig: true, upload: upload && text.length > MAX_BODY };
    let v;
    try { v = JSON.parse(text); } catch { return { bad: true }; }
    return isUpload(v) ? { value: v } : { tooBig: true };
  }
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

/* the Instagram reader's store (B4): read-only for the bots, through the instagram tool */
function igStore(context) { return context.deploy?.context === "production" ? getStore({ name: "instagram", consistency: "strong" }) : getDeployStore({ name: "instagram", consistency: "strong" }); }
function stores(context) {
  const prod = context.deploy?.context === "production";
  const open = (name, strong) => (prod ? getStore(strong ? { name, consistency: "strong" } : name) : getDeployStore(strong ? { name, consistency: "strong" } : name));
  return { desk: open("staff", true), cache: open("meta-cache", false) };
}
/* a push sweep after something new may wait on Luke; never throws, never fails the call it follows */
function pushAfter(context, st, now) {
  const p = (async () => {
    try { await pushSweep(st.desk, now, { desk: () => S.loadDesk(st.desk, now), env: (k) => Netlify.env.get(k) }); }
    catch (e) { console.error("push sweep failed", e?.name || "Error"); }
  })();
  if (context && typeof context.waitUntil === "function") { try { context.waitUntil(p); return Promise.resolve(); } catch {} }
  return p;
}
const asksLuke = (m) => !!m && m.to === "Luke" && m.needs !== "none";
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
  const b = await bodyOf(req, { upload: true });
  if (b.tooBig) return json(413, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Too large: a request may be 64 KB at most; only upload_cover may carry a picture (4 MB at most)" } });
  if (b.bad) { await note(context, req, 400, who, "", "the body was not JSON"); return json(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: the body is not JSON" } }); }
  const st = stores(context), now = Date.now();
  const headers = Object.fromEntries([...req.headers].map(([k, v]) => [k.toLowerCase(), v]));
  const ctx = { store: st.desk, now, role, hq: hqLoader(st), ig: () => igStore(context) };
  /* batch 5: /mcp/<bot> (or /mcp?bot=<bot>) = that bot's own tools and instruction lines; a call there
     without `bot` is that bot's, and another bot's name is refused. /mcp, a name not on the team, and
     Claude's key keep the whole list. */
  const url = new URL(req.url);
  const asked = decodeURIComponent((url.pathname.replace(/\/$/, "").split("/")[2] || url.searchParams.get("bot") || "")).trim().slice(0, 40);
  const roster = role === "bot" && asked ? await S.getRoster(st.desk) : [];
  const own = (roster.find((r) => r.name.toLowerCase() === asked.toLowerCase()) || {}).name || "";
  const tools = role === "claude" ? TOOLS.concat(CLAUDE_TOOLS) : own ? toolsFor(own, roster) : TOOLS;
  const instructions = own ? instructionsFor(own, roster) : INSTRUCTIONS;
  const msg = b.value;
  if (own && msg && msg.method === "tools/call" && msg.params && typeof msg.params === "object") {
    const a = msg.params.arguments && typeof msg.params.arguments === "object" && !Array.isArray(msg.params.arguments) ? msg.params.arguments : {};
    if (a.bot === undefined || a.bot === null || String(a.bot).trim() === "") msg.params.arguments = { ...a, bot: own };
  }
  const call = async (tool, args) => {
    if (own && String(args.bot || "").trim().toLowerCase().replace(/\s*\(.*$/, "") !== own.toLowerCase()) throw new S.StaffError(`This connector address is ${own}'s (badscandal.com/mcp/${own.toLowerCase()}): call with bot "${own}", or use your own address. Nothing was done.`, "not_allowed");
    const out = await callTool(tool, args, ctx);
    if ((tool.name === "send_message" && asksLuke(out)) || tool.name === "spotify_upcoming") await pushAfter(context, st, now);
    return out;
  };
  const out = await handle(msg, headers, { tools, instructions, call });
  const method = b.value && typeof b.value.method === "string" ? b.value.method : "";
  await note(context, req, out.status, who, method, out.body && out.body.error ? out.body.error.message : "");
  return json(out.status, out.body);
}

async function api(req, context, path) {
  const url = new URL(req.url);
  /* a cover Webmaster put on the desk (16 Nov 2026): public, the picture only (it goes on the song page anyway;
     GitHub fetches it to build the page). Nothing else on the desk is reachable without a key. */
  if (req.method === "GET" && path.startsWith("cover/")) return S.coverResponse(stores(context).desk, path.slice("cover/".length));
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

  /* A7 (17 Nov 2026): a closed month as a CSV: the snapshot, then every change since (Luke or Claude) */
  if (path === "month-close.csv" && req.method === "GET") {
    if (sample) return new Response("This is the sample: there is no closed month.\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    const m = String(url.searchParams.get("month") || "");
    const v = /^\d{4}-\d{2}$/.test(m) ? await S.monthCloseView(stores(context).desk, now, m) : null;
    if (!v) return json(404, { error: "That month has not been closed." });
    return new Response(S.closeCsv(v), { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="income-${m}-closed.csv"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  }
  if (path === "fields" && req.method === "GET") return json(200, { today: S.spDay(now), packFields: S.packFieldsOut(), releaseSteps: S.releaseStepsOut() });
  if (path === "board" && req.method === "GET") {
    if (sample) return json(200, { sample: true, ...sampleBoard(now), auto: C.sampleAuto(now), accountHealth: sampleReport(now) });
    const st = stores(context);
    await S.upgradeReleases(st.desk, now).catch(() => null); /* releases sent before the pipeline changed (15 Nov 2026) */
    const [desk, hqAns] = await Promise.all([S.loadDesk(st.desk, now), hqLoader(st)().catch(() => null)]);
    /* the board hands Claude every message, so it counts as Claude having READ them (11 Nov 2026, review:
       a round that reads the desk this way left Luke's answers to Claude "Not read yet" for good) */
    if (role === "claude") await Promise.all([S.touchSeen(st.desk, now, "Claude", "board"), S.touchRead(st.desk, now, "Claude")]);
    /* L6: what happened to each song-page request (the Pages tab's tiles) */
    const pageBuilds = await S.songPages(st.desk, now).catch(() => []);
    const auto = await C.boardAuto(st.desk, now, desk).catch(() => null);
    /* account health reads the desk and the stored Instagram copy. A failure here must not blank the board. */
    const accountHealth = await loadReport({ store: st.desk, ig: igStore(context), now, claims: desk.claims, builds: pageBuilds }).catch(() => null);
    return json(200, { ...S.board(desk, now, hqAns && hqAns.team ? hqAns : null), pageBuilds, hqRead: !!(hqAns && hqAns.team), accountHealth, ...(auto ? { auto } : {}), keys: { bots: !!Netlify.env.get("STAFF_BOT_KEY"), claude: !!Netlify.env.get("STAFF_CLAUDE_KEY") } });
  }
  if (path === "trace" && req.method === "GET") return sample ? json(200, { sample: true, trace: [] }) : json(200, { trace: await S.getTrace(stores(context).desk) });
  if (path === "workspace" && req.method === "GET") {
    const ws = String(url.searchParams.get("ws") || "");
    if (sample) return json(200, W.sampleWorkspace(ws, now));
    try { return json(200, await W.view(stores(context).desk, now, ws)); }
    catch (e) { if (e && e.name === "StaffError") return json(400, { error: e.message }); throw e; }
  }
  if (path === "release" && req.method === "GET") {
    /* one whole release, lyrics and log included (11 Nov 2026: the board no longer carries them) */
    const id = String(url.searchParams.get("id") || "").slice(0, 60);
    const desk = sample ? null : stores(context).desk;
    const [list, sightings] = sample ? [sampleReleases(now), sampleSightings(now)] : await Promise.all([S.listReleases(desk), S.getSightings(desk)]);
    const r = list.find((x) => x.id === id);
    return r ? json(200, { ok: true, ...(sample ? { sample: true } : {}), release: S.releaseView(r, S.spDay(now), { sightings }) }) : json(404, { error: "There is no release with that id. Refresh the page." });
  }
  if (sample) return json(200, { ok: true, sample: true }); /* the sample never writes */

  const st = stores(context);
  const roster = await S.getRoster(st.desk);
  const b = req.method === "GET" ? { value: {} } : await bodyOf(req);
  if (b.tooBig) return json(413, { error: "Too large" });
  if (b.bad || !b.value || typeof b.value !== "object") return json(400, { error: "Bad request" });
  const a = b.value;
  try {
    if (path === "workspace" && req.method === "POST") return json(200, { ok: true, ...(await W.workspaceAct(st.desk, now, { ...a, by: me })) });
    if (path === "message" && req.method === "POST") {
      const r = await S.sendMessage(st.desk, now, roster, { from: me, to: a.to, text: a.text, needs: a.needs, re: a.re, options: a.options, note: a.note, answers: a.answers, questions: a.questions, about: a.about });
      if (role === "claude" && asksLuke(r.message)) await pushAfter(context, st, now);
      return json(200, { ok: true, message: r.message, settled: r.settled });
    }
    if (path === "resolve" && req.method === "POST") return json(200, { ok: true, message: await S.resolveMessage(st.desk, now, roster, { id: a.id, by: me, note: a.note }) });
    if (path.startsWith("release") && req.method === "POST") {
      const sightings = await S.getSightings(st.desk).catch(() => null);
      const view = (r) => S.releaseView(r, S.spDay(now), { sightings });
      if (path === "release") return json(200, { ok: true, release: view(await S.saveRelease(st.desk, now, roster, { by: me, id: a.id, title: a.title, date: a.date, pack: a.pack })) });
      if (path === "release/send") {
        const r = await S.sendRelease(st.desk, now, roster, { by: me, id: a.id, anyway: a.anyway === true });
        return json(200, { ok: true, release: view(r.release), already: r.already, told: !!r.told, alreadyOut: !!r.alreadyOut, sentWithout: r.without || [] });
      }
      if (path === "release/date") { const r = await S.moveRelease(st.desk, now, roster, { by: me, id: a.id, date: a.date }); return json(200, { ok: true, release: view(r.release), moved: r.moved, told: !!r.told }); }
      if (path === "release/cancel") { const r = await S.cancelRelease(st.desk, now, roster, { by: me, id: a.id }); return json(200, { ok: true, release: view(r.release), told: !!r.told }); }
      if (path === "release/remove") return json(200, { ok: true, ...(await S.removeRelease(st.desk, now, roster, { by: me, id: a.id })) });
      if (path === "release/step") return json(200, { ok: true, release: view(await S.setStep(st.desk, now, roster, { by: me, id: a.id, step: a.step, status: a.status, note: a.note, link: a.link, done_on: a.done_on, due: a.due })) });
      /* Luke's approval of the pitch or the final lyrics (batch 3): Luke only, never Claude's key */
      if (path === "release/approve") {
        if (role !== "luke") return json(403, { error: "Only Luke approves the pitch or the final lyrics" });
        return json(200, { ok: true, release: view(await S.approveRelease(st.desk, now, roster, { by: me, id: a.id, what: a.what, text: a.text, withdraw: a.withdraw === true })) });
      }
    }
    if (path === "sighting" && req.method === "POST") {
      if (role !== "luke") return json(403, { error: "Only Luke answers what a song in Spotify for Artists is" });
      const r = await S.answerSighting(st.desk, now, roster, { by: me, key: a.key, answer: a.answer, label: a.label, note: a.note, id: a.id });
      return json(200, { ok: true, answer: r.answer, release: r.release ? S.releaseView(r.release, S.spDay(now), { sightings: r.sightings }) : null, told: !!(r.told || r.sending), sightings: r.sightings });
    }
    if (path === "sort" && req.method === "POST")
      return json(200, { ok: true, entry: await S.sortIncome(st.desk, now, roster, { by: me, id: a.id, month: a.month, status: a.status, category: a.category, pending_id: a.pending_id }) });
    if (path === "config" && req.method === "POST") {
      if (role !== "luke") return json(403, { error: "Only Luke switches the bots' key" });
      return json(200, { ok: true, config: await S.setConfig(st.desk, now, { botsOn: a.botsOn }) });
    }
    if (path === "card" && req.method === "POST") {
      if (role !== "luke") return json(403, { error: "Only Luke answers a card" });
      const card = await C.answerCard(st.desk, now, roster, { by: "Luke", id: a.id, choice: a.choice, text: a.text });
      await pingNames(st.desk, now, [card.owner], { kind: "card", id: card.id }).catch(() => null);
      const view = C.botCard(card);
      return json(200, { ok: true, id: view.id, status: view.status, version: view.version, line: view.line, may_act: view.may_act });
    }
    if (path === "auto" && req.method === "POST") {
      if (role !== "luke") return json(403, { error: "Only Luke changes this" });
      await C.setAuto(st.desk, now, { by: "Luke", roster, tapsCountAsYes: a.tapsCountAsYes, webhook: a.webhook });
      return json(200, { ok: true, auto: C.autoPublic(await C.getAuto(st.desk), roster) });
    }
    if (path === "seed" && req.method === "PUT") {
      const done = [];
      if (a.roster) { await S.setRoster(st.desk, a.roster); done.push("roster"); }
      if (a.sources) { await S.setSources(st.desk, a.sources); done.push("sources"); }
      if (typeof a.guide === "string") { await S.setGuide(st.desk, now, a.guide); done.push("guide"); }
      return json(200, { ok: true, done });
    }
  } catch (e) {
    if (e && e.name === "StaffError") return json(e.code === "not_found" ? 404 : e.code === "busy" ? 503 : 400, { error: e.message, ...(e.missing ? { missing: e.missing } : {}), ...(e.anyway ? { canSendAnyway: true } : {}) });
    console.error("staff api failed", e?.name || e);
    return json(500, { error: "Could not save that" });
  }
  return json(404, { error: "Not found" });
}

export default async (req, context) => {
  const path = new URL(req.url).pathname.replace(/\/$/, "");
  /* song pages (16 Nov 2026): Luke's "Yes, correct" asks GitHub to build the page. ONLY the published site:
     a deploy preview has its own throwaway desk, and must never publish to main. */
  S.useSongDispatch(context?.deploy?.context === "production" ? (job) => dispatchSongJob({ GITHUB_SONG_TOKEN: Netlify.env.get("GITHUB_SONG_TOKEN") }, job) : null);
  /* the build reports (A2, 17 Nov 2026): public files, no key; the published site only */
  S.useSongReports(context?.deploy?.context === "production" ? (id) => readSongReport(id) : null);
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
