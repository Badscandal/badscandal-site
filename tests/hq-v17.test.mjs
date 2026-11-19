/* HQ v17 (19 Nov 2026). Made-up names and amounts. The October and waiting figures in the
   money card are the shape Luke asked the screen to show, not a live ledger. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";
import { needsCount } from "../netlify/lib/action-cards.mjs";
import { dutiesReport } from "../netlify/lib/hq.mjs";
await import("../js/hq-lib.js");
await import("../js/hq-look.js");
const L = globalThis.HQLib;
const V = globalThis.HQLook;

const NOW = Date.parse("2026-11-19T15:00:00Z");
const R = S.DEFAULT_ROSTER;
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, hq) => callTool(tool(name), args, { store: d, now: NOW, role: "bot", hq: hq || (async () => null) });

const TASKS = [
  { id: "T-19", owner: "Webmaster", task: "Site analytics", status: "blocked", blocker: "Needs Netlify Viewer access" },
  { id: "T-30", owner: "Forge", task: "Read Google Ads spend", status: "blocked", blocker: "Google Ads signed out" },
  { id: "T-32", owner: "Nova", task: "Meta system user", status: "blocked", blocker: "Waiting on Luke to make the Meta system user" },
];
const hq = async () => ({ team: { duties: { done: 1, total: 2, late: 0, blocked: 0, byOwner: [] }, tasks: TASKS }, money: { cap: { month: "2026-11", currency: "USD", spent: 10, amount: 1000, left: 990, status: "ok", notRead: [] } } });

function idsOf(rows) { return (rows || []).map((x) => x.id); }

test("needs you is one list and one count on every answer", async () => {
  const d = memoryDesk();
  await S.sendMessage(d, NOW - 3600000, R, { from: "Verse", to: "Luke", needs: "decision", options: ["Yes", "No"], text: "Is the made-up line right?" });
  await S.sendMessage(d, NOW - 1000, R, { from: "Nova", to: "Luke", needs: "action", text: "Please contact me about the made-up show." });
  const you = await call(d, "needs_you", { bot: "Nova" }, hq);
  const day = await call(d, "my_day", { bot: "Nova" }, hq);
  const team = await call(d, "team_board", { bot: "Nova" }, hq);
  const brief = await call(d, "luke_briefing", { bot: "Alfred" }, hq);
  const short = await call(d, "luke_short_briefing", { bot: "Alfred" }, hq);
  assert.equal(you.total, you.waiting.length);
  assert.equal(you.open, you.total);
  assert.deepEqual(idsOf(day.waiting_on_luke), idsOf(you.waiting));
  assert.deepEqual(idsOf(team.waiting_on_luke), idsOf(you.waiting));
  assert.deepEqual(idsOf(brief.decisions_waiting_on_luke), idsOf(you.waiting));
  assert.equal(short.needs_you, you.total);
  assert.equal(you.waiting.some((x) => /Site analytics|Read Google Ads|runbook/i.test(x.what || x.text || "")), false);
  assert.ok(you.waiting.some((x) => x.kind === "handle" && /Nova needs you to contact me/.test(x.what)));
  assert.ok(you.waiting.some((x) => /Meta system user/.test(x.what || x.text || "")));
  assert.equal(you.waiting[0].kind, "decision");
  assert.equal(you.waiting[0].options.length, 2);
});

test("a dropped task title is not a card, and the header matches the cards", () => {
  const desk = { messages: [], releases: [], disputes: [], lukeTasks: TASKS };
  const n = needsCount(desk, "2026-11-19", NOW);
  assert.equal(n.total, n.items.length);
  assert.equal(n.items.some((x) => /Site analytics|Read Google Ads/.test(x.text)), false);
  assert.ok(n.items.some((x) => /Meta system user/.test(x.text)));
});

test("dispute cards stay collapsed, keep line breaks, and a song shows once", () => {
  const row = { id: "c1", song: "Northwind", songKey: "northwind", platform: "YouTube", type: "dispute", status: "waiting on them", owner: "Laura", opened: "2026-11-01", waitingOn: "YouTube", nextCheck: "2026-11-24", recommendation: "Leave it.\nThe longer reason stays folded.", proposal: "Hello there\n\nSecond line of the email.", timeline: [{ at: "2026-11-01T12:00:00Z", by: "Laura", text: "Opened" }] };
  const html = L.disputeHtml([row, { ...row }], { today: "2026-11-19" });
  assert.match(html, /<details class="dcase-more">/);
  assert.equal(/<details class="dcase-more" open/.test(html), false);
  assert.match(html, /Leave it\./);
  assert.match(html, /Second line of the email\./);
  assert.match(html, /<br>/);
  assert.equal((html.match(/data-case="c1"/g) || []).length, 1);
  const phone = fs.readFileSync(new URL("../js/hq-phone.js", import.meta.url), "utf8");
  assert.match(phone, /Do this first/);
  assert.equal(/Also waiting on you/.test(phone), false);
});

test("a proposal keeps its line breaks, and waiting_since is not a timeline line", async () => {
  const d = memoryDesk();
  const opened = await S.openCase(d, NOW, R, { by: "Laura", song: "Northwind", platform: "YouTube", type: "dispute" });
  const saved = await S.updateCase(d, NOW, R, { by: "Laura", id: opened.item.id, proposal: "Hello there\n\nSecond line.", waiting_since: "2026-11-01" });
  assert.match(saved.item.proposal, /Hello there\n\nSecond line\./);
  assert.equal((saved.item.timeline || []).some((t) => /Waiting since/.test(t.text || "")), false);
  assert.ok(saved.item.waitingSince);
});

test("the received card uses the connector total, and Wise or PayPal stays on the way", () => {
  const cards = V.moneyCards({
    income: { month: "2026-10", receivedByMonth: { "2026-10": { EUR: 9855.48 } }, payable: {} },
    entries: [
      { status: "received", account: "Revolut", currency: "EUR", amount: 100, date: "2026-10-02" },
      { status: "received", account: "Wise", currency: "EUR", amount: 3052.04, date: "2026-10-04" },
      { status: "received", account: "PayPal", currency: "USD", amount: 9.76, date: "2026-10-04" },
    ],
    month: "2026-10",
  });
  const eur = cards.cards.find((c) => c.currency === "EUR");
  const usd = cards.cards.find((c) => c.currency === "USD");
  assert.equal(eur.landed, 9855.48);
  assert.match(eur.pendingText, /3,?052\.04/);
  assert.match(eur.pendingText, /Wise/);
  assert.notEqual(usd.landed, 9.76);
  assert.match(usd.pendingText, /PayPal/);
});

test("a payment that reached Revolut on a later day is not overdue from the earlier wallet date", async () => {
  const d = memoryDesk();
  await d.setJSON("sources.json", [{ id: "store", name: "Sample Store", kind: "payer", category: "Royalties", cadence: "monthly", state: "active", match: ["sample store"] }]);
  await d.setJSON("inc/2026-10.json", [
    { id: "w1", date: "2026-10-01", payer: "Sample Store", amount: 40, currency: "EUR", status: "received", account: "Wise", source: "store", movedTo: "r1", by: "Ledger" },
    { id: "r1", date: "2026-10-30", payer: "Sample Store", amount: 40, currency: "EUR", status: "received", account: "Revolut", source: "store", by: "Ledger" },
  ]);
  const inc = await S.incomeState(d, NOW);
  const src = inc.sources.find((s) => s.id === "store");
  assert.equal(src.last.date, "2026-10-30");
  assert.notEqual(src.verdict, "overdue");
});

test("month_check names what is in the way, or says ready", async () => {
  const d = memoryDesk();
  await d.setJSON("sources.json", []);
  await d.setJSON("inc/2026-10.json", [
    { id: "u1", date: "2026-10-03", payer: "Sample", amount: 3, currency: "EUR", status: "unsorted", account: "Revolut", by: "HQ" },
  ]);
  const blocked = await S.monthCheck(d, NOW, { month: "2026-10" });
  assert.equal(blocked.ready, false);
  assert.match(blocked.reason, /1 to sort/);
  assert.equal(blocked.waiting_count, 0);
  await d.setJSON("inc/2026-09.json", []);
  const clear = await S.monthCheck(d, NOW, { month: "2026-09" });
  assert.equal(clear.ready, true);
  assert.equal(clear.reason, "ready");
});

test("a logged growth day stays fixed when HQ reads it again, and a boost has a cost per follow", async () => {
  const d = memoryDesk();
  const roster = R.concat([{ name: "HQ", role: "site" }]);
  await S.logGrowth(d, NOW, roster, { by: "Steve", date: "2026-11-18", platform: "Instagram", followers: 100, views: 50 });
  const again = await S.logGrowth(d, NOW, roster, { by: "HQ", date: "2026-11-18", platform: "Instagram", followers: 999, views: 80 });
  assert.equal(again.row.followers, 100);
  assert.equal(again.row.views, 50);
  assert.equal(again.row.by, "Steve");
  assert.equal(again.row.live.followers, 999);
  const boosted = await S.logGrowth(d, NOW, roster, { by: "Steve", date: "2026-11-18", platform: "Instagram", boosts: [{ link: "https://example.com/p/1", spend: 10, currency: "USD", status: "active", follows: 4 }] });
  assert.equal(boosted.row.boosts[0].cost_per_follow, 2.5);
  const rows = await S.listGrowth(d, NOW, 2);
  const dates = rows.map((r) => r.date);
  assert.deepEqual(dates, dates.slice().sort().reverse());
});

test("post_update done flips a duty whose id is a close match", () => {
  const tasks = [{ id: "D-spark-1", owner: "Spark", task: "Rank the posts", deadline: "2026-11-19", status: "todo" }];
  const overlay = { byDuty: {}, byBot: { spark: { status: "done", duty: "D-spark", bot: "spark", iso: "2026-11-19T12:00:00Z", message: "done" } } };
  const report = dutiesReport(tasks, "2026-11-19", "18:00", overlay);
  assert.equal(report.byOwner[0].items[0].status, "done");
});

test("a recorded profile with no change date says Live, and Luke's line has no account number or raw date", () => {
  const view = S.profilesView({ slots: { "facebook-photo": { current: { link: "https://example.com/fb.jpg", by: "Steve" } } } }, []);
  const blocks = L.profileBlocks(view);
  const slot = blocks.platforms.find((p) => p.platform === "Facebook Page").slots.find((s) => s.id === "facebook-photo");
  assert.equal(slot.currentLine, "Live");
  assert.equal(slot.statusLine, "Live");
  const line = S.lukeLine("Google Ads account 111-222-3333, signed out since 2026-11-14. Check at 14:22.");
  assert.equal(/111-222-3333/.test(line), false);
  assert.match(line, /14 Nov/);
  assert.match(line, /14:22 SP/);
  assert.match(view.note, /New images need Luke's yes/);
});
