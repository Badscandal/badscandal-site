/* The bots' feedback, batch 5 (15 Nov 2026): tidy-ups.
   - the tool list was ~40 KB on every run, mostly income tools the social bots never use: each bot can
     get ONLY its own tools (and only its own instruction lines) at its own address, /mcp/<bot>. The
     shared /mcp keeps the whole list, so nothing breaks for a connector set up the old way.
   - Nova reset the duties at 08:05, after Ledger's 07:30 run and Sheet's 08:00 one, so they found no
     duty row: the reset moves to 07:00, the reset time is read from Nova's card, and work done before
     the rows exist counts (my_day says so instead of "tell Nova the row is missing").
   - out-of-date role text: Drop no longer does royalties (Ledger since 11 Nov), Forge logs Meta too,
     Webmaster's report never mentions pre-saves, and a duty time that disagrees with the card is named.
   - Alfred's SHORT briefing, a separate tool: the cap, income, the top 3 decisions by deadline, one list
     of everything that needs Luke's sign-in. luke_briefing is unchanged. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, INSTRUCTIONS, toolsFor, instructionsFor } from "../netlify/lib/staff-tools.mjs";
import { toolList } from "../netlify/lib/mcp.mjs";
import { dutiesReport } from "../netlify/lib/hq.mjs";

const FAKE = new URL("./fixtures/fake-blobs.mjs", import.meta.url).href;
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: FAKE, shortCircuit: true } : next(spec, ctx); } });
const ENV = { ADMIN_KEY: "correct horse", STAFF_BOT_KEY: "bot-key-for-tests-0123456789", STAFF_CLAUDE_KEY: "claude-key-for-tests-0123456789" };
globalThis.Netlify = { env: { get: (k) => ENV[k] } };
globalThis.fetch = async () => new Response("{}", { status: 500 });
const { default: staff } = await import("../netlify/functions/staff.mjs");
const fctx = { ip: "203.0.113.5", deploy: { context: "production" } };
const rpc = (method, params, id = 1) => ({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
const post = (path, body, key = ENV.STAFF_BOT_KEY) => staff(new Request("https://badscandal.com" + path, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + key }, body: JSON.stringify(body) }), fctx);

const NOW = Date.parse("2026-11-15T15:00:00Z"); /* Sun 15 Nov, 12:00 in São Paulo */
const TODAY = "2026-11-15";
const MIN = 60000, HOUR = 3600000;
const R = S.DEFAULT_ROSTER;
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, o = {}) => callTool(tool(name), args, { store: d, now: o.now || NOW, role: o.role || "bot", hq: o.hq || (async () => null) });
const names = (list) => list.map((t) => t.name);
const INCOME = ["submit_income", "fix_payment", "income_source", "income_check", "sort_payment"];

/* ---------- 1. each bot gets only its own tools ---------- */
test("toolsFor: a bot gets the shared tools plus its own; the shared list stays whole", () => {
  const kevin = names(toolsFor("Kevin", R));
  for (const t of ["my_day", "post_update", "send_message", "read_messages", "resolve_message", "task_update", "set_my_card", "read_guide", "releases", "release_pack", "release_step", "log_growth"]) assert.ok(kevin.includes(t), "Kevin has " + t);
  for (const t of [...INCOME, "income_status", "record_spend", "store_status", "spotify_upcoming", "luke_briefing", "luke_short_briefing", "record_luke_answer"]) assert.ok(!kevin.includes(t), "Kevin does not get " + t);
  const ledger = names(toolsFor("ledger", R));
  for (const t of [...INCOME, "income_status"]) assert.ok(ledger.includes(t), "Ledger has " + t);
  assert.ok(!ledger.includes("log_growth") && !ledger.includes("record_spend"));
  assert.ok(names(toolsFor("Forge", R)).includes("record_spend"));
  assert.ok(names(toolsFor("Drop", R)).includes("store_status"));
  assert.ok(names(toolsFor("Atlas", R)).includes("spotify_upcoming") && names(toolsFor("Atlas", R)).includes("log_growth"));
  const alfred = names(toolsFor("Alfred", R));
  for (const t of ["luke_briefing", "luke_short_briefing", "record_luke_answer", "income_status", "team_board"]) assert.ok(alfred.includes(t), "Alfred has " + t);
  /* Nova runs the team: everything */
  assert.deepEqual(names(toolsFor("Nova", R)), names(TOOLS));
  /* nobody named, or a name not on the team: the whole list, as before */
  assert.deepEqual(names(toolsFor("", R)), names(TOOLS));
  assert.deepEqual(names(toolsFor("sse", R)), names(TOOLS));
  /* the point: Kevin's list is less than 60% of the whole one */
  const size = (l) => JSON.stringify(toolList(l)).length;
  assert.ok(size(toolsFor("Kevin", R)) < 0.6 * size(TOOLS), `${size(toolsFor("Kevin", R))} vs ${size(TOOLS)}`);
  /* the order stays the shared list's order */
  assert.deepEqual(kevin, names(TOOLS).filter((n) => kevin.includes(n)));
});

test("instructionsFor: the shared lines plus the bot's own; the whole text is unchanged for /mcp", () => {
  const k = instructionsFor("Kevin", R);
  assert.match(k, /Every call needs `bot`/);
  assert.match(instructionsFor("Laura", R), /Laura: when the pack has a visualiser/, "Laura's own line");
  assert.doesNotMatch(k, /Laura: when the pack has a visualiser/);
  assert.match(k, /log_growth/, "his growth line");
  assert.doesNotMatch(k, /Ledger and Sheet: keep your income sources/);
  assert.doesNotMatch(k, /Drop: you submit everything to RouteNote/);
  assert.doesNotMatch(k, /Forge: record each platform/);
  assert.ok(k.length < 0.75 * INSTRUCTIONS.length);
  assert.match(instructionsFor("Drop", R), /Drop: you submit everything/);
  assert.equal(instructionsFor("", R), INSTRUCTIONS);
  assert.equal(instructionsFor("Nova", R), INSTRUCTIONS, "Nova passes instructions to everyone: she reads them all");
});

test("the connector at /mcp/<bot>: that bot's list; calls fill in and check the bot; /mcp keeps everything", async () => {
  const whole = await (await post("/mcp", rpc("tools/list"))).json();
  assert.equal(whole.result.tools.length, TOOLS.length);
  const mine = await (await post("/mcp/kevin", rpc("tools/list"))).json();
  assert.deepEqual(mine.result.tools.map((t) => t.name), names(toolsFor("Kevin", R)));
  const init = await (await post("/mcp/Kevin", rpc("initialize", { protocolVersion: "2025-06-18" }))).json();
  assert.match(init.result.instructions, /Steve, Atlas, Kevin, Laura: log each day/);
  assert.doesNotMatch(init.result.instructions, /Laura: when the pack has a visualiser/);
  assert.doesNotMatch(init.result.instructions, /Ledger and Sheet: keep/);
  /* a call without bot is Kevin's; another bot's name is refused; a tool that isn't his is unknown here */
  const day = await (await post("/mcp/kevin", rpc("tools/call", { name: "my_day", arguments: {} }))).json();
  assert.equal(day.result.isError, false, day.result.content[0].text);
  assert.equal(JSON.parse(day.result.content[0].text).you, "Kevin");
  const other = await (await post("/mcp/kevin", rpc("tools/call", { name: "my_day", arguments: { bot: "Ledger" } }))).json();
  assert.equal(other.result.isError, true);
  assert.match(other.result.content[0].text, /Kevin's/);
  const notHis = await (await post("/mcp/kevin", rpc("tools/call", { name: "submit_income", arguments: { bot: "Kevin" } }))).json();
  assert.match(JSON.stringify(notHis), /not one of Kevin's tools|Unknown tool/);
  /* ?bot= works the same; an unknown name gets the whole list */
  assert.equal((await (await post("/mcp?bot=Ledger", rpc("tools/list"))).json()).result.tools.length, toolsFor("Ledger", R).length);
  assert.equal((await (await post("/mcp/nobody", rpc("tools/list"))).json()).result.tools.length, TOOLS.length);
  /* Claude's key always gets everything */
  assert.equal((await (await post("/mcp/kevin", rpc("tools/list"), ENV.STAFF_CLAUDE_KEY)).json()).result.tools.length, TOOLS.length);
});

/* ---------- 2. the duty reset ---------- */
test("Nova resets the duties at 07:00, before every other bot's run, and the time comes from her card", () => {
  assert.equal(S.dutyResetTime(R), "07:00");
  for (const b of R.filter((x) => x.name !== "Nova")) assert.ok(b.time > "07:00", `${b.name} runs at ${b.time}, after the reset`);
  const nova = R.find((b) => b.name === "Nova");
  assert.ok(!JSON.stringify(nova).includes("08:05"));
  /* a seeded card with another time: that time */
  assert.equal(S.dutyResetTime([{ name: "Nova", schedule: [{ time: "06:45", what: "Reset today's duties on the task board" }] }]), "06:45");
  assert.equal(S.dutyResetTime([{ name: "Nova", schedule: [] }]), "");
});

test("before the reset: my_day says the rows are not set yet and the work counts; after it, the early 'done' finishes the duty", async () => {
  const d = memoryDesk();
  const early = Date.parse("2026-11-15T09:30:00Z"); /* 06:30 São Paulo, before Nova's 07:00 reset */
  const noRows = async () => ({ team: { duties: { today: TODAY, total: 0, done: 0, blocked: 0, late: 0, byOwner: [] }, tasks: [] } });
  const day = await call(d, "my_day", { bot: "Ledger" }, { now: early, hq: noRows });
  assert.match(day.note, /07:00/);
  assert.match(day.note, /counts/i);
  assert.doesNotMatch(day.note, /tell Nova/i);
  /* after the reset time with still no row: tell Nova, as before */
  const late = await call(d, "my_day", { bot: "Ledger" }, { now: early + 2 * HOUR, hq: noRows });
  assert.match(late.note, /tell Nova/i);
  /* Ledger finishes at 06:30, then Nova's row appears at 07:00 still "todo": it shows done */
  await call(d, "post_update", { bot: "Ledger", status: "done", message: "3 accounts checked, 1 new payment submitted" }, { now: early });
  const overlay = S.dutyOverlay(await S.listUpdates(d, early + HOUR), TODAY);
  const rep = dutiesReport([{ id: "D-ledger-1", owner: "Ledger", task: "Check every money account", deadline: TODAY + " 07:30", status: "todo", blocker: "" }], TODAY, "07:05", overlay);
  assert.equal(rep.byOwner[0].items[0].status, "done");
  assert.equal(rep.byOwner[0].items[0].via, "connector");
});

test("the site check names the reset time from Nova's card", async () => {
  const d = memoryDesk();
  const hq = { team: { duties: { today: TODAY, total: 0, done: 0, blocked: 0, late: 0, byOwner: [] }, tasks: [] } };
  const rep = S.checkReport({ desk: await S.loadDesk(d, NOW), hq, hqState: null, now: NOW });
  assert.ok(rep.problems.some((p) => /no duty rows for today \(Nova resets them at 07:00\)/.test(p)), rep.problems.join(" | "));
});

/* ---------- 3. the role text ---------- */
test("role text: Drop has no royalties (Ledger has), Forge logs Meta too, Webmaster's report never says pre-save, one time each", () => {
  const card = (n) => JSON.stringify(R.find((b) => b.name === n));
  assert.doesNotMatch(card("Drop"), /royalt/i);
  assert.match(card("Ledger"), /royalt/i);
  assert.match(card("Forge"), /Meta, Google and TikTok/);
  assert.doesNotMatch(card("Webmaster"), /pre-save|feature\.fm/i);
  assert.doesNotMatch(card("Webmaster"), /09:10/);
  assert.equal(R.find((b) => b.name === "Webmaster").time, "09:20");
  /* the rule itself stays in the rules */
  assert.ok(INSTRUCTIONS.length && TOOLS.length);
});

test("the site check names a duty whose time on the board disagrees with the bot's card", async () => {
  const d = memoryDesk();
  const item = { id: "D-webmaster-1", owner: "Webmaster", task: "Site check", status: "todo", due: "09:10", late: false };
  const hq = { team: { duties: { today: TODAY, total: 1, done: 0, blocked: 0, late: 0, byOwner: [{ owner: "Webmaster", done: 0, todo: 1, blocked: 0, late: 0, items: [item] }] }, tasks: [] } };
  const rep = S.checkReport({ desk: await S.loadDesk(d, NOW), hq, hqState: null, now: NOW });
  assert.ok(rep.problems.some((p) => /Webmaster.*09:10.*09:20/.test(p)), rep.problems.join(" | "));
  /* the same time: nothing said */
  const same = { team: { duties: { ...hq.team.duties, byOwner: [{ ...hq.team.duties.byOwner[0], items: [{ ...item, due: "09:20" }] }] }, tasks: [] } };
  const ok = S.checkReport({ desk: await S.loadDesk(d, NOW), hq: same, hqState: null, now: NOW });
  assert.ok(!ok.problems.some((p) => /09:10/.test(p)));
});

/* ---------- 4. Alfred's short briefing ---------- */
const PACK = { kind: "Self-release", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", language: "English", explicit: "No", genre: "Dance", writers: "Sample Writer", copyright: "℗ 2026 Sample" };
async function sent(d, title, date) {
  const r = await S.saveRelease(d, NOW, R, { by: "Luke", title, date, pack: PACK });
  return (await S.sendRelease(d, NOW, R, { by: "Luke", id: r.id })).release;
}
const capHq = async () => ({ team: { duties: { today: TODAY, total: 1, done: 0, blocked: 1, late: 0, byOwner: [{ owner: "Kevin", done: 0, todo: 0, blocked: 1, late: 0,
  items: [{ id: "D-kevin-1", owner: "Kevin", task: "Log TikTok", status: "blocked", blocker: "TikTok login expired", due: "09:10", late: false }] }] }, tasks: [] },
  money: { cap: { month: "2026-11", currency: "USD", spent: 512.3, amount: 1000, left: 487.7, status: "ok", estimated: true, estimatedWhy: ["TikTok Fri 13 Nov: signed out"], notRead: ["TikTok Fri 13 Nov: signed out"], rateUsed: { value: 1.08, from: "Rates!B1", month: "2026-11" } } },
  next: null });

test("luke_short_briefing: the cap, income, the top 3 decisions by deadline, and one list of sign-ins", async () => {
  const d = memoryDesk();
  const soon = await sent(d, "Night Drive", "2026-11-27");
  const later = await sent(d, "Slow Fade", "2026-12-18");
  /* four decisions for Luke: two plain (no deadline), the pitch of Slow Fade (due 4 Dec), Night Drive's resubmit (27 Nov) */
  await call(d, "send_message", { bot: "Nova", to: "Luke", text: "Plain decision one?", needs: "decision", options: ["Yes", "No"] }, { now: NOW - 3 * HOUR });
  await call(d, "send_message", { bot: "Forge", to: "Luke", text: "Plain decision two?", needs: "decision", options: ["Yes", "No"] }, { now: NOW - 2 * HOUR });
  await call(d, "send_message", { bot: "Atlas", to: "Luke", text: "Pitch for Slow Fade OK?", approval: { song: "Slow Fade", what: "pitch", text: "Warm night-drive house with a made-up hook." } }, { now: NOW - HOUR });
  await call(d, "store_status", { bot: "Drop", song: soon.id, status: "rejected", reason: "Artwork has a web address" }, { now: NOW - 50 * MIN });
  await call(d, "store_status", { bot: "Drop", song: soon.id, status: "rejected", ready_to_resubmit: true, note: "New artwork" }, { now: NOW - 40 * MIN });
  /* things that need Luke's sign-in, said in different places */
  await S.setRoster(d, R.map((b) => (b.name === "Kevin" ? { ...b, blockers: "TikTok asks for Luke's phone code on a new sign-in" } : b)));
  await call(d, "set_my_card", { bot: "Forge", working_on: "Meta check", needs: "Luke's 2FA code for Google Ads" }, { now: NOW - 30 * MIN });
  await call(d, "post_update", { bot: "Laura", status: "blocked", message: "YouTube Studio signed me out: needs Luke to log in again" }, { now: NOW - 20 * MIN });
  await call(d, "post_update", { bot: "Steve", status: "blocked", message: "Instagram insights tab won't load" }, { now: NOW - 10 * MIN });
  const readBefore = await S.lastRead(d, "Alfred");

  const b = await call(d, "luke_short_briefing", { bot: "Alfred" }, { hq: capHq });
  assert.match(b.ad_spend, /USD 512\.30 of USD 1000/);
  assert.match(b.ad_spend, /estimated/);
  assert.match(b.ad_spend, /TikTok Fri 13 Nov: signed out/);
  assert.ok(typeof b.income === "string" && /Received/.test(b.income));
  assert.equal(b.decisions.length, 3);
  assert.match(b.decisions[0], /Night Drive/, "the soonest deadline first: Night Drive's resubmit (27 Nov)");
  assert.match(b.decisions[0], /27 Nov/);
  assert.match(b.decisions[1], /Slow Fade/, "then the pitch due 4 Dec");
  assert.match(b.decisions[2], /Plain decision one/, "then the oldest without a deadline");
  assert.match(b.more_decisions, /1 more/);
  const signIns = b.needs_luke_sign_in.join("\n");
  assert.match(signIns, /Kevin.*phone code/);
  assert.match(signIns, /Kevin.*TikTok login expired/);
  assert.match(signIns, /Forge.*2FA/);
  assert.match(signIns, /Laura.*signed me out/);
  assert.match(signIns, /TikTok Fri 13 Nov: signed out/);
  assert.doesNotMatch(signIns, /insights tab/, "not a sign-in");
  assert.equal(new Set(b.needs_luke_sign_in).size, b.needs_luke_sign_in.length, "each once");
  assert.ok(JSON.stringify(b).length < 2500, "short: " + JSON.stringify(b).length);
  /* it hands over no messages: Alfred's read marker doesn't move (luke_briefing does that) */
  assert.equal(await S.lastRead(d, "Alfred"), readBefore);
  assert.equal(b.messages_for_you, undefined);
  /* nothing read: said as not read, never 0 */
  const none = await call(d, "luke_short_briefing", { bot: "Alfred" });
  assert.match(none.ad_spend, /not read/);
  assert.ok(tool("luke_short_briefing").readOnly);
  assert.match(tool("luke_short_briefing").description, /short/i);
});

test("luke_briefing is unchanged: the same keys, in the same order", async () => {
  const d = memoryDesk();
  const b = await call(d, "luke_briefing", { bot: "Alfred" }, { hq: capHq });
  assert.deepEqual(Object.keys(b), ["today", "now_sao_paulo", "site_check", "claude_note", "decisions_waiting_on_luke", "ad_spend", "next_release", "unknown_in_spotify", "messages_for_you", "income_this_month", "duties_not_done", "how_to_report"]);
  assert.deepEqual(Object.keys(b.ad_spend), ["month", "spent", "cap", "left", "status", "estimated"]);
});

test("times disagree only when none of a bot's duty times is on its card (Forge's evening cap check is fine)", async () => {
  const d = memoryDesk();
  const items = [{ id: "D-forge-1", owner: "Forge", task: "Spend", status: "todo", due: "09:30", late: false }, { id: "D-forge-2", owner: "Forge", task: "Cap", status: "todo", due: "23:30", late: false }];
  const hq = { team: { duties: { today: TODAY, total: 2, done: 0, blocked: 0, late: 0, byOwner: [{ owner: "Forge", done: 0, todo: 2, blocked: 0, late: 0, items }] }, tasks: [] } };
  const rep = S.checkReport({ desk: await S.loadDesk(d, NOW), hq, hqState: null, now: NOW });
  assert.ok(!rep.problems.some((p) => /Times disagree/.test(p)), rep.problems.join(" | "));
});
