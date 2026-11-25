/* HQ clean-up after Money and Rights came off (25 Nov 2026). Ledger and Sheet are off HQ, no money words in duty
   and card text, no money ask on Needs you, and Luke's call on the month's cap (keep running past the stop line).
   Made-up names, songs and amounts only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import * as S from "../netlify/lib/staff.mjs";
import * as O from "../netlify/lib/offhq.mjs";
import * as C from "../netlify/lib/action-cards.mjs";
import { memoryDesk, sampleBoard } from "../netlify/lib/staff-sample.mjs";
import { needsDesk } from "../netlify/lib/needs.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";
import { dutiesReport, hqModel } from "../netlify/lib/hq.mjs";
import { sampleSheets } from "../netlify/lib/hq-sample.mjs";
import { runCapCheck } from "../netlify/lib/hq-jobs.mjs";
import { makeSession, sessionCookie } from "../netlify/lib/session.mjs";

const FAKE = new URL("./fixtures/fake-blobs.mjs", import.meta.url).href;
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: FAKE, shortCircuit: true } : next(spec, ctx); } });
const ENV = { ADMIN_KEY: "correct horse", STAFF_BOT_KEY: "bot-key-for-tests-0123456789", STAFF_CLAUDE_KEY: "claude-key-for-tests-0123456789" };
globalThis.Netlify = { env: { get: (k) => ENV[k] } };
globalThis.fetch = async () => new Response("{}", { status: 500 });

const NOW = Date.parse("2026-11-25T15:00:00Z");
const TODAY = S.spDay(NOW);
const R = S.DEFAULT_ROSTER;
const L = await import("../js/hq-lib.js").then(() => globalThis.HQLib);
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, hq) => callTool(tool(name), args, { store: d, now: NOW, role: "bot", hq: hq || (async () => null) });

/* ---------- 1. Ledger and Sheet off the Team page ---------- */
test("Ledger and Sheet are off HQ by default; the seed can say otherwise", async () => {
  assert.deepEqual(R.filter((b) => b.offHq).map((b) => b.name), ["Ledger", "Sheet"]);
  assert.equal(O.isOffHq({ name: "Ledger" }), true, "a seed without the flag: the default");
  assert.equal(O.isOffHq({ name: "Ledger", offHq: false }), false, "the seed brings it back");
  assert.equal(O.isOffHq({ name: "Forge", offHq: true }), true);
  const d = memoryDesk();
  await d.setJSON("roster.json", R.map((b) => { const { offHq, ...rest } = b; return rest; }));
  const roster = await S.getRoster(d);
  assert.deepEqual(roster.filter((b) => b.offHq).map((b) => b.name), ["Ledger", "Sheet"]);
});

test("an off-HQ bot is never on Team, quiet, late, counted or in Search; its my_day still answers", async () => {
  const b = sampleBoard(NOW);
  assert.equal(b.staff.some((w) => w.name === "Ledger" || w.name === "Sheet"), false);
  assert.deepEqual(b.offHq, ["Ledger", "Sheet"]);
  assert.equal(b.names.includes("Ledger"), false, "not in the To list either");
  const views = b.staff.map((w) => L.workerView(w, null, b.today));
  const g = L.teamGroups(views);
  assert.equal([...g.stuck, ...g.quiet, ...g.onTrack].some((w) => w.name === "Ledger"), false);
  assert.equal(L.cmdIndex({ board: b }).some((x) => x.kind === "bot" && /Ledger|Sheet/.test(x.label)), false);
  assert.equal(L.offHqLine(b.offHq), "Ledger and Sheet work outside HQ now (money → badscandal books, they report to Alfred).");
  /* the sheet's duty rows for them are not HQ's: no duty, no count, no late */
  const sheets = sampleSheets(TODAY, NOW);
  sheets.Tasks = [...sheets.Tasks, ["D-ledger-1", "Ledger", "Log yesterday's payments", TODAY + " 07:30", "todo", "", ""], ["T-99", "Sheet", "Fix the made-up sheet", "", "blocked", "Waiting on Luke", ""]];
  const m = hqModel(sheets, TODAY, {}, null, "15:00", { offHq: O.offHqNames(R) });
  assert.equal(m.team.duties.byOwner.some((o) => o.owner === "Ledger"), false);
  assert.equal((m.team.tasks || []).some((t) => t.owner === "Sheet"), false);
  /* the 21:00 chase never names them */
  const d = memoryDesk();
  const hq = { team: { duties: { byOwner: [{ owner: "Ledger", items: [{ id: "D-ledger-1", owner: "Ledger", task: "Log payments", due: "07:30", status: "todo", late: true }] }] } } };
  const chased = await S.chaseLate(d, Date.parse("2026-11-25T14:00:00Z"), await S.getRoster(d), { hq });
  assert.deepEqual(chased.nudged, []);
  /* the site's check */
  const desk = await S.loadDesk(d, NOW);
  const rep = S.checkReport({ desk, hq: null, hqState: null, now: NOW });
  assert.doesNotMatch(JSON.stringify(rep), /Ledger|Sheet/);
  /* my_day still answers, with the pointer to badscandal books and Alfred */
  const md = await call(d, "my_day", { bot: "Ledger" });
  assert.match(md.money_stopped, /badscandal books/);
  assert.match(md.money_stopped, /Alfred/);
});

/* ---------- 2. No money text in duty and card wording ---------- */
test("duty and card text lose their money clauses; Alfred's card has no income line", () => {
  const alfred = R.find((b) => b.name === "Alfred");
  assert.doesNotMatch(JSON.stringify(alfred), /income/i);
  assert.match(alfred.schedule[0].what, /USD 1,000 cap and yesterday per platform, what needs Luke today, who didn't log yesterday, the next release/);
  const du = dutiesReport([
    { id: "D-alfred-1", owner: "Alfred", task: "Send Luke the 10:00 message: ad spend vs the cap, income received this month per currency, Needs you, next release.", deadline: TODAY + " 10:00", status: "todo" },
    { id: "D-laura-2", owner: "Laura", task: "Check Content ID claims on every video and log them", deadline: TODAY + " 09:10", status: "todo" },
    { id: "D-laura-1", owner: "Laura", task: "Log YouTube subscribers. Check Content ID claims.", deadline: TODAY + " 09:10", status: "todo" },
  ], TODAY);
  const tasks = du.byOwner.flatMap((o) => o.items.map((x) => x.task));
  assert.ok(tasks.includes("Send Luke the 10:00 message: ad spend vs the cap, Needs you, next release."));
  assert.ok(tasks.includes("Log YouTube subscribers."));
  assert.equal(tasks.some((t) => /claim|income/i.test(t)), false);
  assert.equal(du.total, 2, "a duty only about claims is not shown");
  assert.equal(S.freshDuty("Daily growth, best post, Revolut check, fan signals"), "Daily growth, best post, fan signals");
  assert.equal(O.dropMoneyText("Where every release is at (no royalties: that is Ledger's)"), "Where every release is at");
  assert.equal(O.dropMoneyText("Ad spend vs the USD 1,000 cap"), "Ad spend vs the USD 1,000 cap", "ad spend is not money");
});

test("a seeded card that still talks about income shows without it on Team", () => {
  const roster = R.map((b) => (b.name === "Alfred" ? { ...b, schedule: [{ time: "10:00", what: "The daily message: ad spend vs cap, income received this month per currency, what needs Luke" }] } : b));
  const w = S.workers(roster, { hq: null, updates: [], messages: [], cards: {}, seen: {}, today: TODAY, nowHM: "15:00", now: NOW }).find((x) => x.name === "Alfred");
  assert.equal(w.schedule[0].what, "The daily message: ad spend vs cap, what needs Luke");
});

/* ---------- 3. Needs you never shows a money task ---------- */
test("a money task from Nova or Ledger is not counted or alerted; an ad-spend card still is", async () => {
  const d = memoryDesk();
  await S.sendMessage(d, NOW - 60000, R, { from: "Nova", to: "Luke", needs: "action", text: "blocked: waiting for Luke (a task: Made-up Label EUR 12.34, no proof of arrival)" });
  await C.saveCard(d, NOW, R, { by: "Ledger", kind: "payment", text: "Confirm the made-up statement.", dedupe_key: "l-1", action: "confirm it" });
  await C.saveCard(d, NOW, R, { by: "Forge", kind: "ads", text: "Ad spend is at USD 912 this month. Pause the made-up campaign?", dedupe_key: "f-1", action: "pause it" });
  const desk = { ...(await needsDesk(d, NOW, {})), lukeTasks: [
    { id: "T-90", owner: "Nova", task: "Made-up payout", status: "blocked", blocker: "Waiting for Luke: Made-up Label EUR 12.34, no proof of arrival" },
    { id: "T-91", owner: "Ledger", task: "Made-up task", status: "blocked", blocker: "Waiting on Luke to answer the made-up question" },
  ] };
  const n = C.needsCount(desk, TODAY, NOW);
  assert.equal(n.total, n.items.length);
  assert.equal(n.items.length, 1, JSON.stringify(n.items.map((x) => x.text)));
  assert.equal(n.items[0].from, "Forge");
  assert.equal(S.offNeeds("Ledger", "anything", O.offHqNames(R)), true);
  assert.equal(S.offNeeds("Forge", "Meta ad spend USD 912", O.offHqNames(R)), false);
});

/* ---------- 4. Luke's call on the month's cap ---------- */
const CAP = { month: "2026-11", amount: 1000, warn: 750, stop: 900, currency: "USD", spent: 932.5, left: 67.5, pct: 93.3, status: "stop", perDay: 30 };
test("without an override 900 is the stop line as before; with one it is Luke's call, amber, never red", () => {
  assert.equal(O.applyCapOverride(CAP, null), CAP);
  assert.equal(O.applyCapOverride(CAP, { by: "Luke", at: "x", note: "", month: "2026-10" }), CAP, "last month's call is gone");
  const c = O.applyCapOverride(CAP, { by: "Luke", at: "2026-11-25T15:00:00Z", note: "Me Dá Seu Body campaign", month: "2026-11" });
  assert.equal(c.status, "lukes_call");
  assert.equal(c.overrideLine, "Past the stop line on Luke's call (Me Dá Seu Body campaign)");
  assert.equal(c.spent, 932.5); assert.equal(c.left, 67.5); assert.equal(c.perDay, 30);
  const below = O.applyCapOverride({ ...CAP, spent: 600, left: 400, status: "ok" }, { by: "Luke", at: "x", note: "", month: "2026-11" });
  assert.equal(below.status, "ok", "below 750 nothing changes but the note");
  assert.equal(below.overrideLine, "Luke's call: keep running past the stop line");
  /* the page */
  const sheet = { money: { cap: c }, releases: [], songs: [] };
  const att = L.attention({ sheet, ov: null, board: null });
  const capItem = att.find((a) => a.key === "cap");
  assert.equal(capItem.tone, "amber");
  assert.match(capItem.text, /^Past the stop line on Luke's call/);
  assert.equal(att.some((a) => /every ad (should|must) be off/.test(a.text)), false);
  assert.ok(L.briefing({ sheet, ov: null, attention: att }).some((x) => /^Past the stop line on Luke's call/.test(x)));
  assert.match(L.capCallMessage(c), /USD 933 of 1,000, USD 68 left\. At USD 30 a day/);
  const hqjs = fs.readFileSync(new URL("../js/hq.js", import.meta.url), "utf8");
  assert.match(hqjs, /Keep ads running past the stop line this month/);
  /* the site's check */
  const d = memoryDesk();
  return S.loadDesk(d, NOW).then((desk) => {
    const rep = S.checkReport({ desk, hq: { money: { cap: c }, team: null }, hqState: { readAt: new Date(NOW).toISOString() }, now: NOW });
    assert.match(JSON.stringify(rep), /Past the stop line on Luke's call \(Me Dá Seu Body campaign\): report only/);
    assert.doesNotMatch(JSON.stringify(rep), /every ad must be off/);
  });
});

test("only Luke sets it, for this month; the cap job sends no 750/900 message or card while it is set", async () => {
  const d = memoryDesk();
  await assert.rejects(S.setCapOverride(d, NOW, R, { by: "Nova", note: "x" }), /Only Luke/);
  await assert.rejects(S.setCapOverride(d, NOW, R, { by: "Claude", note: "x" }), /Only Luke/);
  const r = await S.setCapOverride(d, NOW, R, { by: "Luke", note: "Me Dá Seu Body campaign" });
  assert.equal(r.month, "2026-11");
  assert.deepEqual(await S.getCapOverride(d, "2026-11"), { by: "Luke", at: new Date(NOW).toISOString(), note: "Me Dá Seu Body campaign", month: "2026-11" });
  assert.equal(await S.getCapOverride(d, "2026-12"), null, "next month is clean");
  /* 912 recorded: the job would raise the 900 line; with Luke's call it says nothing */
  const rows = [{ date: "2026-11-24", platform: "Meta", amount: 912, currency: "USD" }];
  const out = await runCapCheck(d, NOW, R, { spend: rows, fetch: async () => new Response("{}") });
  assert.equal(out.level, "lukes_call", JSON.stringify(out));
  const msgs = await S.listMessages(d, NOW, 1);
  assert.equal(msgs.some((m) => /900 line|750 line/.test(m.text)), false);
  /* taken back: the usual rule again */
  await S.setCapOverride(d, NOW, R, { by: "Luke", off: true });
  assert.equal(await S.getCapOverride(d, "2026-11"), null);
  assert.equal((await runCapCheck(d, NOW, R, { spend: rows, fetch: async () => new Response("{}") })).level, "stop", "without it, 900 is the stop line exactly as before");
});

test("the bots' cap checks say Luke's call: keep running, report only", async () => {
  const d = memoryDesk();
  const c = O.applyCapOverride(CAP, { by: "Luke", at: "x", note: "made-up note", month: "2026-11" });
  const hq = async () => ({ money: { cap: c, rows: [] }, team: { duties: { byOwner: [], total: 0 }, tasks: [] }, releases: [], songs: [] });
  const forge = await call(d, "my_day", { bot: "Forge" }, hq);
  assert.match(forge.cap_call, /^Luke's call: keep running, report only\. Past the stop line on Luke's call \(made-up note\)/);
  const steve = await call(d, "my_day", { bot: "Steve" }, hq);
  assert.equal(steve.cap_call, undefined, "only the bots that check the cap");
  const short = await call(d, "luke_short_briefing", { bot: "Alfred" }, hq);
  assert.match(JSON.stringify(short), /Luke's call: keep running, report only/);
  const brief = await call(d, "luke_briefing", { bot: "Alfred" }, hq);
  assert.deepEqual(Object.keys(brief.ad_spend).sort(), ["cap", "estimated", "left", "month", "spent", "status"], "luke_briefing keeps its shape");
});

test("the route: Luke's cookie from our own page only; Claude's key and the bots get 403", async () => {
  const { default: staff } = await import("../netlify/functions/staff.mjs");
  const ctx = { ip: "203.0.113.5", deploy: { context: "production" } };
  const cookie = sessionCookie(await makeSession("correct horse")).split(";")[0];
  const ORIGIN = "https://badscandal.com";
  const post = (headers, body = { note: "made-up note" }) => staff(new Request(ORIGIN + "/api/staff/capover", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }), ctx);
  assert.equal((await post({ authorization: "Bearer " + ENV.STAFF_CLAUDE_KEY })).status, 403);
  assert.equal((await post({ authorization: "Bearer " + ENV.STAFF_BOT_KEY })).status, 403);
  assert.equal((await post({ cookie })).status, 403, "no Origin: refused");
  assert.equal((await post({ cookie, origin: "https://evil.example" })).status, 403);
  const ok = await post({ cookie, origin: ORIGIN });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).override.note, "made-up note");
});

/* ---------- 5. Small leftovers ---------- */
test("a done step drops its old waiting note; no Rights, Money or Disputes tab", () => {
  assert.equal(L.staleDoneNote({ status: "done", note: "One unpublished made-up draft is left In draft, waiting on Luke's answer about it" }), true);
  assert.equal(L.staleDoneNote({ status: "working", note: "waiting on Luke's answer" }), false, "not done: the note stands");
  assert.equal(L.staleDoneNote({ status: "done", note: "Live on Meta" }), false);
  const page = fs.readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  assert.equal(/data-tab="(rights|money|disputes)"/.test(page), false);
});
