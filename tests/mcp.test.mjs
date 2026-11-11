import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { handle, headerText, LEGACY, MODERN, toolList } from "../netlify/lib/mcp.mjs";
import { TOOLS, INSTRUCTIONS } from "../netlify/lib/staff-tools.mjs";
import * as S from "../netlify/lib/staff.mjs";
import { makeSession, sessionCookie } from "../netlify/lib/session.mjs";

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
  assert.equal(list.length, 13);
  for (const t of list) {
    assert.match(t.name, /^[a-z][a-z_]{2,30}$/, t.name);
    assert.ok(t.title && t.description.length > 60, t.name + " needs a real description");
    assert.equal(t.inputSchema.type, "object");
    assert.ok(t.inputSchema.required.includes("bot"), t.name + ": every call says which bot");
    for (const [k, p] of Object.entries(t.inputSchema.properties)) assert.ok(p.type && p.description, `${t.name}.${k}`);
    assert.ok(!JSON.stringify(t.inputSchema).includes("$ref"));
    assert.equal(t.annotations.destructiveHint, false);
  }
  assert.equal(new Set(list.map((t) => t.name)).size, 13);
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
  assert.equal(list.body.id, "abc"); assert.equal(list.body.result.tools.length, 13); assert.equal(list.body.result.resultType, undefined);
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
  assert.deepEqual([list.body.result.resultType, list.body.result.cacheScope, list.body.result.tools.length], ["complete", "private", 13]);
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

test("bank reader: the bots see every incoming Revolut payment; Ledger, Sheet and Nova can sort one, the others can't (/api/staff/sort, sort_payment)", async () => {
  const desk = globalThis.__stores.get("staff"), now = Date.now(), day = S.spDay(now), month = day.slice(0, 7);
  const rev = { bot: "HQ", date: day, currency: "EUR", account: "Revolut", note: "Read from Revolut" };
  const friend = (await S.submitIncome(desk, now, S.DEFAULT_ROSTER, { ...rev, payer: "Made-up Mum", amount: 40, status: "unsorted", reference: "tx-mum" })).entry;
  const client = (await S.submitIncome(desk, now, S.DEFAULT_ROSTER, { ...rev, payer: "Made-up Client Ltd", amount: 250, status: "unsorted", reference: "tx-client" })).entry;
  const own = (await S.submitIncome(desk, now, S.DEFAULT_ROSTER, { ...rev, payer: "Made-up Self", amount: 300, status: "transfer", reference: "tx-own" })).entry;
  await S.submitIncome(desk, now, S.DEFAULT_ROSTER, { ...rev, payer: "Sample Records", amount: 70, status: "received", reference: "tx-label", category: "Label deals" });
  /* Luke, 11 Nov 2026: the bots see his full Revolut income: every row, sorted or not */
  const bot = (await tool("income_status", { bot: "Nova" })).structuredContent;
  const seen = JSON.stringify(bot);
  assert.ok(seen.includes("Made-up Mum") && seen.includes("Made-up Self") && seen.includes("Sample Records"), seen);
  assert.deepEqual(bot.unsorted.find((u) => u.id === friend.id), { id: friend.id, month, line: `${day} · Made-up Mum · EUR 40.00 · Revolut` });
  const botTools = (await (await post(rpc("tools/list"), "Bearer " + ENV.STAFF_BOT_KEY)).json()).result.tools;
  assert.ok(botTools.some((t) => t.name === "sort_payment"));
  assert.deepEqual(botTools.find((t) => t.name === "submit_income").inputSchema.properties.status.enum, ["received", "pending", "transfer"], "nobody files a payment as unsorted by hand: only the bank reader does");
  assert.match((await tool("submit_income", { bot: "Nova", date: day, payer: "Someone", amount: 5, currency: "EUR", account: "Wise", status: "unsorted" })).content[0].text, /received, pending or transfer/);
  /* a bot whose job is not the money can look but not sort, neither with the tool nor by sending the payment again */
  assert.match((await tool("sort_payment", { bot: "Echo", id: friend.id, month, status: "transfer" })).content[0].text, /Only Luke, Claude, Ledger, Sheet, Nova can sort/);
  assert.match((await tool("submit_income", { bot: "Echo", date: day, payer: "Made-up Mum", amount: 40, currency: "EUR", account: "Revolut", reference: "tx-mum", status: "received" })).content[0].text, /unsorted\. Only Ledger, Sheet, Nova, Claude or Luke/);
  /* a money bot sorts one as income (this file's roster is Nova + Echo by now: Nova is one of Ledger, Sheet, Nova) */
  const sortedC = (await tool("sort_payment", { bot: "Nova", id: client.id, month, status: "received", category: "Production" })).structuredContent;
  assert.deepEqual([sortedC.saved, sortedC.status, sortedC.category], [true, "received", "Production"]);
  assert.match((await tool("sort_payment", { bot: "Nova", id: client.id, month, status: "received" })).content[0].text, /already sorted|category must be/);
  /* Claude sorts through the same tool; what a person or a bot decided stays */
  const claude = "Bearer " + ENV.STAFF_CLAUDE_KEY;
  const sorted = (await tool("sort_payment", { bot: "Claude", id: friend.id, month, status: "received", category: "Other" }, claude)).structuredContent;
  assert.deepEqual([sorted.saved, sorted.status, sorted.category], [true, "received", "Other"]);
  assert.match((await tool("sort_payment", { bot: "Claude", id: friend.id, month, status: "transfer" }, claude)).content[0].text, /already sorted/, "what a person decided stays");
  const after = (await tool("income_status", { bot: "Nova" })).structuredContent;
  assert.equal(after.unsorted.length, 0);
  /* Luke, on /hq: corrects what the bank reader itself decided (its own-transfer rule was wrong) */
  const sort = (body, headers) => api("sort", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  assert.equal((await sort({ id: own.id, month, status: "received", category: "Salary" }, { authorization: "Bearer " + ENV.STAFF_BOT_KEY })).status, 403);
  assert.equal((await sort({ id: own.id, month, status: "received", category: "Salary" }, { cookie, origin: "https://evil.example" })).status, 403);
  const r = await sort({ id: own.id, month, status: "received", category: "Salary" }, { cookie, origin: "https://badscandal.com" });
  const e = (await r.json()).entry;
  assert.deepEqual([r.status, e.status, e.category, e.history.at(-1).by, e.history.at(-1).from], [200, "received", "Salary", "Luke", "transfer"]);
  assert.equal((await sort({ id: own.id, month, status: "transfer" }, { cookie })).status, 400, "once Luke has said, it stays");
  assert.equal((await sort({ id: "i" + "0".repeat(12), month, status: "transfer" }, { cookie })).status, 404);
});
