import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { handle, headerText, LEGACY, MODERN, toolList } from "../netlify/lib/mcp.mjs";
import { TOOLS, INSTRUCTIONS } from "../netlify/lib/staff-tools.mjs";
import { makeSession, sessionCookie } from "../netlify/lib/session.mjs";
import { DEFAULT_ROSTER, spDay } from "../netlify/lib/staff.mjs";

/* the handler under test talks to @netlify/blobs: swap it for the in-memory stand-in */
const FAKE = new URL("./fixtures/fake-blobs.mjs", import.meta.url).href;
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: FAKE, shortCircuit: true } : next(spec, ctx); } });
const ENV = { ADMIN_KEY: "correct horse", STAFF_BOT_KEY: "bot-key-for-tests-0123456789", STAFF_CLAUDE_KEY: "claude-key-for-tests-0123456789" };
globalThis.Netlify = { env: { get: (k) => ENV[k] } };
const fetches = [];
globalThis.fetch = async (u) => { fetches.push(String(u)); return new Response("{}", { status: 500 }); };
const { default: staff } = await import("../netlify/functions/staff.mjs");
const ctx = { ip: "203.0.113.5", deploy: { context: "production" } };
const cookie = sessionCookie(await makeSession("correct horse")).split(";")[0];

const deps = { tools: TOOLS, instructions: INSTRUCTIONS, call: async (tool, args) => ({ tool: tool.name, args }) };
const rpc = (method, params, id = 1) => ({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });

test("mcp: the tools are short, described and flat, so any client can list them", () => {
  const list = toolList(TOOLS);
  assert.equal(list.length, 16, "twelve, plus the four release tools (11 Nov 2026)");
  for (const t of list) {
    assert.match(t.name, /^[a-z][a-z_]{2,30}$/, t.name);
    assert.ok(t.title && t.description.length > 60, t.name + " needs a real description");
    assert.equal(t.inputSchema.type, "object");
    assert.ok(t.inputSchema.required.includes("bot"), t.name + ": every call says which bot");
    for (const [k, p] of Object.entries(t.inputSchema.properties)) assert.ok(p.type && p.description, `${t.name}.${k}`);
    assert.ok(!JSON.stringify(t.inputSchema).includes("$ref"));
    assert.equal(t.annotations.destructiveHint, false);
  }
  assert.equal(new Set(list.map((t) => t.name)).size, 16);
  assert.equal(list.find((t) => t.name === "my_day").annotations.readOnlyHint, true);
  assert.equal(list.find((t) => t.name === "post_update").annotations.readOnlyHint, false);
});

test("mcp legacy: initialize, the 202 for notifications, ping, tools/list, tools/call", async () => {
  for (const v of LEGACY) assert.equal((await handle(rpc("initialize", { protocolVersion: v, capabilities: {}, clientInfo: { name: "x", version: "1" } }), {}, deps)).body.result.protocolVersion, v);
  const init = await handle(rpc("initialize", { protocolVersion: "1999-01-01" }), {}, deps);
  assert.equal(init.status, 200); assert.equal(init.body.result.protocolVersion, LEGACY[0], "an unknown version gets our newest legacy one, not an error");
  assert.deepEqual(init.body.result.capabilities, { tools: { listChanged: false } }); assert.equal(init.body.result.serverInfo.name, "badscandal-hq"); assert.ok(init.body.result.instructions.length > 100);
  assert.deepEqual(await handle({ jsonrpc: "2.0", method: "notifications/initialized" }, {}, deps), { status: 202, body: null });
  assert.deepEqual((await handle(rpc("ping"), {}, deps)).body, { jsonrpc: "2.0", id: 1, result: {} });
  const list = await handle(rpc("tools/list", {}, "abc"), { "mcp-protocol-version": "2025-06-18" }, deps);
  assert.equal(list.body.id, "abc"); assert.equal(list.body.result.tools.length, 16); assert.equal(list.body.result.resultType, undefined);
  const call = await handle(rpc("tools/call", { name: "my_day", arguments: { bot: "Nova" } }), {}, deps);
  assert.equal(call.body.result.isError, false); assert.deepEqual(call.body.result.structuredContent, { tool: "my_day", args: { bot: "Nova" } });
  assert.equal(call.body.result.content[0].type, "text"); assert.match(call.body.result.content[0].text, /"my_day"/);
  assert.equal((await handle(rpc("tools/call", { name: "nope" }), {}, deps)).body.error.code, -32602, "unknown tool = a protocol error");
  const missing = await handle(rpc("tools/call", { name: "post_update", arguments: { bot: "Nova" } }), {}, deps);
  assert.equal(missing.body.result.isError, true); assert.match(missing.body.result.content[0].text, /Missing: status, message/);
  assert.equal((await handle(rpc("nope/nope"), {}, deps)).body.error.code, -32601);
  assert.deepEqual((await handle(rpc("resources/list"), {}, deps)).body.result, { resources: [] });
  assert.equal((await handle(rpc("tools/list"), { "mcp-protocol-version": "1999-01-01" }, deps)).status, 400);
  assert.equal((await handle([rpc("ping")], {}, deps)).status, 400, "no batches");
  assert.equal((await handle({ hello: 1 }, {}, deps)).body.error.code, -32600);
});

test("mcp 2026-07-28: no handshake; discover; version and header checks; resultType on every result", async () => {
  const meta = { _meta: { "io.modelcontextprotocol/protocolVersion": MODERN, "io.modelcontextprotocol/clientCapabilities": {} } };
  const disc = await handle(rpc("server/discover", meta), { "mcp-protocol-version": MODERN, "mcp-method": "server/discover" }, deps);
  assert.equal(disc.status, 200); assert.deepEqual(disc.body.result.supportedVersions, [MODERN]); assert.equal(disc.body.result.resultType, "complete");
  assert.equal(disc.body.result._meta["io.modelcontextprotocol/serverInfo"].name, "badscandal-hq");
  const list = await handle(rpc("tools/list", meta), { "mcp-protocol-version": MODERN }, deps);
  assert.deepEqual([list.body.result.resultType, list.body.result.cacheScope, list.body.result.tools.length], ["complete", "private", 16]);
  const call = await handle(rpc("tools/call", { ...meta, name: "my_day", arguments: { bot: "Nova" } }), { "mcp-protocol-version": MODERN, "mcp-method": "tools/call", "mcp-name": "=?base64?" + btoa("my_day") + "?=" }, deps);
  assert.equal(call.body.result.resultType, "complete"); assert.equal(call.body.result.isError, false);
  const badV = await handle(rpc("tools/list", { _meta: { "io.modelcontextprotocol/protocolVersion": "2030-01-01" } }), {}, deps);
  assert.deepEqual([badV.status, badV.body.error.code, badV.body.error.data.supported[0]], [400, -32022, MODERN]);
  assert.equal((await handle(rpc("tools/call", { ...meta, name: "my_day", arguments: { bot: "Nova" } }), { "mcp-name": "post_update" }, deps)).body.error.code, -32020);
  assert.equal((await handle(rpc("tools/list", meta), { "mcp-method": "tools/call" }, deps)).body.error.code, -32020);
  /* a client must never be shown "HTTP 404" by the connector (the bots' app gave up on one, 11 Nov 2026) */
  for (const m of ["ping", "resources/list", "prompts/list", "resources/templates/list"]) { const r = await handle(rpc(m, meta), { "mcp-protocol-version": MODERN }, deps); assert.equal(r.status, 200, m); assert.equal(r.body.result.resultType, "complete", m); }
  const unknown = await handle(rpc("nope/nope", meta), {}, deps);
  assert.deepEqual([unknown.status, unknown.body.error.code], [200, -32601], "an unknown method is a protocol error, never a 404 page");
  assert.equal(headerText("=?base64?" + btoa("abc") + "?="), "abc"); assert.equal(headerText("plain"), "plain");
});

const post = (body, key, extra = {}) => staff(new Request("https://badscandal.com/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(key ? { authorization: key } : {}), ...extra }, body: typeof body === "string" ? body : JSON.stringify(body) }), ctx);
const tool = async (name, args, key = "Bearer " + ENV.STAFF_BOT_KEY) => { const r = await post(rpc("tools/call", { name, arguments: args }), key); return (await r.json()).result; };

test("connector: no key, no entry; the key rides in the header only; browsers and other methods are turned away", async () => {
  const none = await post(rpc("tools/list"));
  assert.equal(none.status, 401); assert.match(none.headers.get("www-authenticate"), /^Bearer realm=/); assert.ok(!/resource_metadata/.test(none.headers.get("www-authenticate")));
  assert.equal(none.headers.get("cache-control"), "no-store");
  assert.equal((await post(rpc("tools/list"), "Bearer wrong-key")).status, 401);
  assert.equal((await staff(new Request("https://badscandal.com/mcp?key=" + ENV.STAFF_BOT_KEY, { method: "POST", body: JSON.stringify(rpc("tools/list")) }), ctx)).status, 401, "never from the address");
  assert.equal((await post(rpc("tools/list"), ENV.STAFF_BOT_KEY)).status, 200, "a bare key works too");
  assert.equal((await post(rpc("tools/list"), "Bearer " + ENV.STAFF_BOT_KEY, { origin: "https://app.example" })).status, 200, "the key is the lock: a client that sends an Origin is not turned away");
  assert.equal((await post(rpc("tools/list"), undefined, { origin: "https://evil.example", cookie })).status, 401, "Luke's login cookie never opens the connector");
  const get = await staff(new Request("https://badscandal.com/mcp", { method: "GET", headers: { authorization: "Bearer " + ENV.STAFF_BOT_KEY } }), ctx);
  assert.equal(get.status, 405); assert.equal(get.headers.get("allow"), "POST, OPTIONS");
  assert.equal((await staff(new Request("https://badscandal.com/mcp", { method: "DELETE", headers: { authorization: "Bearer " + ENV.STAFF_BOT_KEY } }), ctx)).status, 405);
  assert.equal((await staff(new Request("https://badscandal.com/mcp", { method: "OPTIONS" }), ctx)).status, 204);
  const bad = await post("{not json", "Bearer " + ENV.STAFF_BOT_KEY);
  assert.equal(bad.status, 400); assert.equal((await bad.json()).error.code, -32700);
  const note = await post({ jsonrpc: "2.0", method: "notifications/initialized" }, "Bearer " + ENV.STAFF_BOT_KEY);
  assert.equal(note.status, 202); assert.equal(await note.text(), "");
  const init = await post(rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "grok", version: "1" } }), "Bearer " + ENV.STAFF_BOT_KEY);
  assert.equal(init.headers.get("content-type"), "application/json; charset=utf-8"); assert.equal(init.headers.get("mcp-session-id"), null);
  assert.equal((await init.json()).result.protocolVersion, "2025-06-18");
});

test("connector: a bot's whole day, end to end (the sheet isn't connected in this test, and that is said, not hidden)", async () => {
  const day = await tool("my_day", { bot: "ledger" });
  assert.equal(day.isError, false); assert.equal(day.structuredContent.you, "Ledger"); assert.equal(day.structuredContent.rules.length, 8); assert.match(day.structuredContent.note, /could not be read/);
  assert.match((await tool("my_day", { bot: "Luke" })).content[0].text, /not a name on the team/);
  assert.equal((await tool("my_day", { bot: "Manny" })).isError, true);
  assert.equal((await tool("post_update", { bot: "Ledger", status: "working", message: "Checking Wise and PayPal" })).structuredContent.saved, true);
  assert.match((await tool("post_update", { bot: "Ledger", status: "blocked", message: "PayPal password: abc12345" })).content[0].text, /Never write passwords/);
  const pay = { bot: "Ledger", date: "2026-11-10", payer: "Sample Distro", amount: 104.04, currency: "USD", account: "PayPal", reference: "TX-9" };
  assert.equal((await tool("submit_income", pay)).structuredContent.saved, true);
  const again = (await tool("submit_income", pay)).structuredContent;
  assert.deepEqual([again.saved, again.duplicate], [false, true]);
  assert.match((await tool("submit_income", { ...pay, amount: "not read" })).content[0].text, /amount must be a positive number/);
  assert.equal((await tool("income_check", { bot: "Ledger", account: "Wise", new_payments: 0 })).structuredContent.saved, true);
  const inc = (await tool("income_status", { bot: "Alfred" })).structuredContent;
  assert.equal(inc.received_this_month, "USD 104.04"); assert.equal(inc.payments_logged_this_month, 1); assert.match(inc.newest_payments[0], /Sample Distro · USD 104\.04 · received · PayPal · by Ledger/);
  const sent = (await tool("send_message", { bot: "Nova", to: "Luke", text: "Survivors on Fri 11 Dec?", needs: "decision", options: ["Yes", "January"] })).structuredContent;
  assert.equal(sent.sent, true); assert.match(sent.note, /Alfred's next message/);
  const ask = (await tool("send_message", { bot: "Nova", to: "Ledger", text: "Did Wise load today?", needs: "reply" })).structuredContent;
  assert.equal((await tool("read_messages", { bot: "Ledger" })).structuredContent.waiting_on_you.length, 1);
  assert.equal((await tool("send_message", { bot: "Ledger", to: "Nova", text: "Yes.", reply_to: ask.id })).structuredContent.answered, ask.id);
  assert.match((await tool("resolve_message", { bot: "Nova", id: sent.id })).content[0].text, /Only Luke/);
  assert.match((await tool("resolve_message", { bot: "Atlas", id: ask.id })).content[0].text, /waiting on Ledger, not on you/, "a bot can't close what isn't its own");
  assert.equal((await tool("set_my_card", { bot: "Atlas", working_on: "Backfilling Touch Me" })).structuredContent.saved, true);
  const team = (await tool("team_board", { bot: "Nova" })).structuredContent;
  assert.equal(team.team.length, 12); assert.equal(team.duties, "not read"); assert.equal(team.waiting_on_luke.length, 1);
  assert.equal(team.team.find((w) => w.name === "Ledger").last_update.includes("working: Checking Wise"), true); assert.equal(team.team.find((w) => w.name === "Atlas").working_on, "Backfilling Touch Me");
  assert.match(team.team.find((w) => w.name === "Ledger").last_used_the_desk, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "São Paulo time, not UTC"); assert.equal(team.team.find((w) => w.name === "Verse").last_used_the_desk, "never");
  const brief = (await tool("luke_briefing", { bot: "Alfred" })).structuredContent;
  assert.equal(brief.ad_spend, "not read", "a number that could not be read is never 0"); assert.equal(brief.decisions_waiting_on_luke[0].options.length, 2); assert.equal(brief.income_this_month.received, "USD 104.04");
  assert.match((await tool("read_guide", { bot: "Verse" })).content[0].text, /has not been loaded/);
  /* Claude's key acts as Claude whatever name is given */
  const c = (await tool("send_message", { bot: "Nova", to: "Nova", text: "Please confirm the Updates tab.", needs: "action" }, "Bearer " + ENV.STAFF_CLAUDE_KEY)).structuredContent;
  assert.equal((await tool("read_messages", { bot: "Nova" })).structuredContent.waiting_on_you[0].from, "Claude"); assert.equal(c.sent, true);
  assert.equal((await tool("post_update", { bot: "Claude", status: "info", message: "hello there" }, "Bearer " + ENV.STAFF_CLAUDE_KEY)).isError, true);
});

const api = (path, init = {}) => staff(new Request("https://badscandal.com/api/staff/" + path, init), ctx);
test("staff api: Luke's login reads the board, writes and settles; he can switch the bots' key off at once", async () => {
  assert.equal((await api("board")).status, 401); assert.deepEqual(await (await api("board")).json(), { error: "Not logged in" });
  assert.equal((await api("board", { headers: { authorization: "Bearer " + ENV.STAFF_BOT_KEY } })).status, 403, "the bots' key opens the connector only");
  const b = await (await api("board", { headers: { cookie } })).json();
  assert.equal(b.staff.length, 12); assert.equal(b.waiting.luke.length, 1); assert.equal(b.income.count, 1); assert.equal(b.connector.lastUsed.bot.length > 0, true); assert.deepEqual(b.keys, { bots: true, claude: true });
  assert.equal(b.hqRead, false);
  const send = (body, headers = {}) => api("message", { method: "POST", headers: { cookie, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  assert.equal((await send({ to: "Nova", text: "Yes to Survivors." }, { origin: "https://evil.example" })).status, 403);
  const m = await (await send({ to: "Nova", text: "Yes to Survivors.", re: b.waiting.luke[0].id }, { origin: "https://badscandal.com" })).json();
  assert.equal(m.message.from, "Luke");
  assert.equal((await send({ to: "Nobody", text: "x y" })).status, 400);
  assert.equal((await api("resolve", { method: "POST", headers: { cookie }, body: JSON.stringify({ id: b.waiting.luke[0].id, note: "Yes" }) })).status, 200);
  assert.equal((await (await api("board", { headers: { cookie } })).json()).waiting.luke.length, 0);
  assert.equal((await api("config", { method: "POST", headers: { authorization: "Bearer " + ENV.STAFF_CLAUDE_KEY }, body: JSON.stringify({ botsOn: false }) })).status, 403, "only Luke");
  assert.equal((await api("config", { method: "POST", headers: { cookie }, body: JSON.stringify({ botsOn: false }) })).status, 200);
  assert.match((await tool("my_day", { bot: "Nova" })).content[0].text, /switched the bots' connector off/);
  assert.equal((await tool("read_messages", { bot: "Claude" }, "Bearer " + ENV.STAFF_CLAUDE_KEY)).isError, false, "Claude's own key still works");
  await api("config", { method: "POST", headers: { cookie }, body: JSON.stringify({ botsOn: true }) });
  assert.equal((await tool("my_day", { bot: "Nova" })).isError, false);
  const seed = await api("seed", { method: "PUT", headers: { authorization: "Bearer " + ENV.STAFF_CLAUDE_KEY }, body: JSON.stringify({ roster: [{ name: "Nova", role: "Chief of staff" }, { name: "Echo", role: "New" }], sources: [{ id: "wise", name: "Wise", kind: "account" }], guide: "Hello team." }) });
  assert.deepEqual((await seed.json()).done, ["roster", "sources", "guide"]);
  assert.match((await tool("read_guide", { bot: "Echo" })).content[0].text, /Hello team\./);
  assert.equal((await api("nope", { headers: { cookie } })).status, 404);
});

test("staff api: the sample is made up, needs the login, and never opens the real desk", async () => {
  assert.equal((await api("board?sample=1")).status, 401);
  globalThis.__asked.length = 0;
  const s = await (await api("board?sample=1", { headers: { cookie } })).json();
  assert.equal(s.sample, true); assert.equal(s.staff.length, 12); assert.equal(s.waiting.luke.length, 2); assert.ok(s.income.sources.length >= 3);
  assert.deepEqual(globalThis.__asked, [], "no store was opened");
  assert.equal((await (await api("message?sample=1", { method: "POST", headers: { cookie }, body: JSON.stringify({ to: "Nova", text: "hello" }) })).json()).sample, true);
  assert.deepEqual(globalThis.__asked, []);
});

test("/api/hq/data still answers as before through the shared loader (login, sample, not connected)", async () => {
  const { default: hq } = await import("../netlify/functions/hq.mjs");
  const get = (path, headers = {}) => hq(new Request("https://badscandal.com" + path, { headers }), ctx);
  assert.equal((await get("/api/hq/data")).status, 401);
  assert.deepEqual(await (await get("/api/hq/data", { cookie })).json(), { connected: false, need: ["GOOGLE_SA_KEY", "HQ_SHEET_ID"] });
  globalThis.__asked.length = 0;
  const s = await (await get("/api/hq/data?sample=1", { cookie })).json();
  assert.equal(s.sample, true); assert.equal(s.team.duties.total, 6); assert.equal(s.team.live.ready, true); assert.ok(s.money.cap.spent > 0); assert.ok(s.health && s.metaKey);
  assert.deepEqual(s.releases.map((r) => [r.song, !!r.desk]), [["Touch Me", true], ["Me Dá Seu Body", true], ["Survivors", false]], "the made-up desk releases join the made-up sheet, one entry per song");
  assert.ok(!globalThis.__asked.includes("staff"), "the sample never opens the staff desk");
  assert.equal((await get("/api/hq/summary", { cookie })).status, 404);
});

test("connector: requests that were turned away are noted (never the key), and Claude or Luke can read them", async () => {
  await post(rpc("tools/list"), "Bearer definitely-wrong");
  await staff(new Request("https://badscandal.com/mcp/sse", { method: "GET", headers: { authorization: "Bearer " + ENV.STAFF_BOT_KEY, "user-agent": "SomeBotApp/1.0" } }), ctx);
  await post(rpc("initialize", { protocolVersion: "2025-06-18" }), "Bearer " + ENV.STAFF_BOT_KEY, { "user-agent": "SomeBotApp/1.0" });
  const r = await api("trace", { headers: { authorization: "Bearer " + ENV.STAFF_CLAUDE_KEY } });
  const { trace } = await r.json();
  assert.equal(r.status, 200);
  assert.ok(trace.some((t) => t.status === 401 && (t.key === "none" || t.key === "wrong")), "a request without a valid key is noted (at most one every 20 seconds, so strangers can't make the desk write)");
  assert.ok(trace.filter((t) => t.status === 401).length <= 2, "…and only now and then");
  assert.ok(trace.some((t) => t.status === 405 && t.path === "/mcp/sse" && t.agent === "SomeBotApp/1.0"), "a sub-path reaches the connector, not the site's 404 page");
  assert.ok(trace.some((t) => t.method === "initialize" && t.status === 200 && t.key === "bots"));
  assert.ok(!JSON.stringify(trace).includes(ENV.STAFF_BOT_KEY) && !JSON.stringify(trace).includes("definitely-wrong"), "no key is ever written down");
  assert.equal((await api("trace", { headers: { authorization: "Bearer " + ENV.STAFF_BOT_KEY } })).status, 403);
});

/* ---- the release pipeline (11 Nov 2026): the four tools and /api/staff/release*, end to end ---- */
test("release pipeline: Luke's routes, the bots' four tools, refusals as sentences, the sample never writes", async () => {
  const claude = { authorization: "Bearer " + ENV.STAFF_CLAUDE_KEY }, bots = { authorization: "Bearer " + ENV.STAFF_BOT_KEY };
  await api("seed", { method: "PUT", headers: claude, body: JSON.stringify({ roster: DEFAULT_ROSTER }) }); /* an earlier test left only Nova and Echo */
  const day = (n) => new Date(Date.parse(spDay(Date.now()) + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const rel = async (path, body, headers = { cookie }) => { const r = await api(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };

  assert.equal((await rel("release", { title: "Night Drive" }, {})).status, 401);
  assert.equal((await rel("release", { title: "Night Drive" }, bots)).status, 403, "the bots use the connector, never these routes");
  assert.equal((await rel("release", { title: "Night Drive" }, { cookie, origin: "https://evil.example" })).status, 403);
  const made = await rel("release", { title: "Night Drive", date: day(30), pack: { wav: "https://example.com/n.wav", genre: "Dance" } });
  assert.equal(made.status, 200);
  const id = made.body.release.id;
  assert.deepEqual([id, made.body.release.status, made.body.release.packTotal, made.body.release.daysToGo], ["nightdrive", "draft", 17, 30]);
  const badLink = await rel("release", { id, pack: { artwork: "http://example.com/c.jpg" } });
  assert.deepEqual([badLink.status, badLink.body.error], [400, "Artwork must be a link that starts with https:// (copy it from the browser's address bar). Nothing was saved."]);
  const early = await rel("release/send", { id });
  assert.equal(early.status, 400); assert.equal(early.body.error, "Still missing: Artwork, Language, Explicit, Writers. Fill them in, then send again.");
  assert.deepEqual(early.body.missing, ["artwork", "language", "explicit", "writers"]);
  /* Claude's key fills the rest (as Claude), Luke sends */
  const filled = await rel("release", { id, pack: { artwork: "https://example.com/c.jpg", language: "English", explicit: "No", writers: "Sample Writer: music and lyrics" } }, claude);
  assert.equal(filled.body.release.log[0].by, "Claude");
  const sent = await rel("release/send", { id });
  assert.deepEqual([sent.status, sent.body.release.status, sent.body.release.steps.length, sent.body.already, sent.body.told], [200, "scheduled", 9, false, true]);
  assert.equal((await rel("release/send", { id })).body.already, true);
  await rel("release", { title: "Hidden Draft", date: day(40) }); /* a draft is Luke's, never shown to the bots */

  /* the bots, through /mcp */
  const list = (await tool("releases", { bot: "Drop" })).structuredContent;
  assert.deepEqual(list.releases.map((r) => r.song), ["Night Drive"]);
  assert.deepEqual(list.releases[0].your_steps.map((s) => s.step), ["upload", "approved"]);
  assert.ok(!list.releases[0].all_steps, "only Nova and Claude see every step");
  assert.equal((await tool("releases", { bot: "Nova" })).structuredContent.releases[0].all_steps.length, 9);
  assert.deepEqual((await tool("releases", { bot: "x" }, "Bearer " + ENV.STAFF_CLAUDE_KEY)).structuredContent.releases.map((r) => r.song).sort(), ["Hidden Draft", "Night Drive"]);
  const pack = (await tool("release_pack", { bot: "Verse", song: "night drive" })).structuredContent;
  assert.equal(pack.pack.length, 23); assert.equal(pack.pack.find((f) => f.field === "wav").value, "https://example.com/n.wav");
  assert.match(pack.pack.find((f) => f.field === "lyrics").state, /missing \(needed for "Lyrics live"\)/);
  assert.match((await tool("release_pack", { bot: "Drop", song: "Hidden Draft" })).content[0].text, /There is no release called "Hidden Draft"\. The releases on the desk are: Night Drive \(nightdrive\)\./);
  const wrongBot = await tool("release_step", { bot: "Atlas", song: "Night Drive", step: "upload", status: "done" });
  assert.equal(wrongBot.isError, true); assert.match(wrongBot.content[0].text, /is Drop's step\. Only Drop, Nova, Claude or Luke can mark it/);
  assert.match((await tool("release_step", { bot: "Drop", song: "Night Drive", step: "approved", status: "blocked" })).content[0].text, /needs a note: say exactly what is needed and from whom/);
  const done = (await tool("release_step", { bot: "Drop", song: "nightdrive", step: "upload", status: "done", link: "https://example.com/rn" })).structuredContent;
  assert.deepEqual([done.saved, done.step, done.state], [true, "upload", "done"]);
  assert.equal((await tool("release_fill", { bot: "Drop", song: "Night Drive", field: "isrc", value: "SAMPLE0000009" })).structuredContent.value, "SAMPLE0000009");
  assert.match((await tool("release_fill", { bot: "Drop", song: "Night Drive", field: "lyrics", value: "la la" })).content[0].text, /Lyrics is filled by Verse \(or Nova, Luke or Claude\), not by you/);
  assert.match((await tool("release_step", { bot: "Drop", song: "Night Drive" })).content[0].text, /^Missing: step, status\./);
  const myDay = (await tool("my_day", { bot: "Drop" })).structuredContent;
  assert.deepEqual(myDay.release_steps.map((s) => s.step), ["approved"]);
  assert.match(myDay.next, /^You have 1 open release step; the soonest is "Approved by RouteNote \(nothing waiting\)" for Night Drive/);
  assert.ok(!/release step/.test((await tool("my_day", { bot: "Steve" })).structuredContent.next));
  assert.deepEqual((await tool("team_board", { bot: "Nova" })).structuredContent.releases, [{ song: "Night Drive", date: (await tool("releases", { bot: "Nova" })).structuredContent.releases[0].release_day, done: "1 of 9", late: 0, blocked: 0 }]);
  assert.equal((await tool("luke_briefing", { bot: "Alfred" })).structuredContent.next_release.song, "Night Drive", "with the sheet unread, the desk's own next release");

  /* Luke marks a step, moves the date, cancels */
  const step = await rel("release/step", { id, step: "teasers", status: "done" });
  assert.equal(step.body.release.steps.find((s) => s.key === "teasers").by, "Luke");
  assert.equal((await rel("release/step", { id, step: "teasers", status: "nope" })).status, 400);
  const moved = await rel("release/date", { id, date: day(37) });
  assert.deepEqual([moved.body.moved, moved.body.release.date, moved.body.release.steps[0].due], [true, day(37), done.due.slice(-11, -1)]);
  const b = await (await api("board", { headers: { cookie } })).json();
  assert.equal(b.packFields.length, 23); assert.equal(b.releaseSteps.length, 9); assert.ok(Array.isArray(b.answered));
  assert.equal(b.releases[0].id, "nightdrive"); assert.equal(b.staff.find((w) => w.name === "Drop").releaseSteps[0].key, "approved");
  assert.ok(b.messages.some((m) => m.to === "all" && m.from === "Luke" && /^New release: Night Drive/.test(m.text) && m.seen === null));
  const gone = await rel("release/cancel", { id }, claude);
  assert.deepEqual([gone.status, gone.body.release.status, gone.body.told], [200, "cancelled", true]);
  assert.match((await tool("release_step", { bot: "Drop", song: "Night Drive", step: "approved", status: "done" })).content[0].text, /was cancelled/);

  /* the sample: the login, no store, no write */
  globalThis.__asked.length = 0;
  for (const p of ["release", "release/send", "release/date", "release/cancel", "release/step"]) assert.deepEqual((await rel(p + "?sample=1", { id: "x", title: "y" })).body, { ok: true, sample: true }, p);
  const sb = await (await api("board?sample=1", { headers: { cookie } })).json();
  assert.equal(sb.releases.length, 3); assert.equal(sb.answered.length, 2); assert.equal(sb.packFields.length, 23);
  assert.deepEqual(globalThis.__asked, [], "the sample never opened a store");
});
