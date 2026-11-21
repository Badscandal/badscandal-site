/* HQ v18 (21 Nov 2026): Forge's v17 re-check and Ledger's lines. Every name, amount and id here is
   made up. The account ids are the shape of an ads id (XXX-XXX-XXXX), not a real one. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";
await import("../js/hq-lib.js");
await import("../js/hq-look.js");
const L = globalThis.HQLib;
const V = globalThis.HQLook;

const NOW = Date.parse("2026-11-21T15:00:00Z"); /* 12:00 in São Paulo */
const R = S.DEFAULT_ROSTER;
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, hq) => callTool(tool(name), args, { store: d, now: NOW, role: "bot", hq: hq || (async () => null) });
const ID = "111-222-3333";

test("an ads id comes out of a line for Luke with the brackets and words that held it", () => {
  for (const [raw, want] of [
    [`Google Ads signed out (at ${ID}).`, "Google Ads signed out."],
    [`Google Ads signed out at ${ID}).`, "Google Ads signed out."],
    [`Google Ads signed out (${ID}).`, "Google Ads signed out."],
    [`Google Ads ${ID} signed out at 09:10`, "Google Ads signed out at 09:10"],
    [`Sign in to Google Ads for account ${ID} please`, "Sign in to Google Ads please"],
    ["Nothing to take out (here).", "Nothing to take out (here)."],
  ]) {
    assert.equal(S.dropAccountId(raw), want, raw);
    assert.equal(L.dropAccountId(raw), want, raw);
  }
  assert.doesNotMatch(S.lukeLine(`Forge: Google Ads signed out at ${ID}).`), /\(\s*\)|at \)|\s\)/);
  assert.doesNotMatch(L.screenText(`Google Ads signed out (${ID}).`), /\(\s*\)/);
});

test("the short briefing's sign-in line has no empty brackets, and a sign-in that is back is not listed", async () => {
  const d = memoryDesk();
  await S.setCard(d, NOW - 60000, R, { bot: "Forge", needs: `Google Ads signed out (${ID}). Luke to sign in.`, blockers: "" });
  await S.setCard(d, NOW - 60000, R, { bot: "Kevin", needs: "TikTok Ads is signed in again.", blockers: "" });
  const short = await call(d, "luke_short_briefing", { bot: "Alfred" });
  const lines = short.needs_luke_sign_in.join(" | ");
  assert.doesNotMatch(lines, /\(\s*\)|at \)/);
  assert.match(lines, /Google Ads/);
  assert.doesNotMatch(lines, /TikTok/);
});

test("the short briefing's income line is never cut with an ellipsis and shows no payment ids or payers", () => {
  const inc = {
    received: { EUR: 10 },
    unsortedCount: 2,
    problems: [
      "Payments nobody has sorted: 2026-10 · 2026-10-02 · Made Up Payer · EUR 31.00 (id iabcdefgh01); 2026-10 · 2026-10-03 · Made Up Payer · EUR 9.00 (id iabcdefgh02)",
      "Sample Distro: overdue. It usually pays by the 5th, and nothing came this month (last payment 2026-09-29 USD 12.34, waiting in PayPal)",
    ],
  };
  const line = S.shortIncomeLine(inc, (o) => Object.entries(o).map(([c, a]) => `${c} ${a.toFixed(2)}`).join(" + "));
  assert.doesNotMatch(line, /…|\.\.\./);
  assert.doesNotMatch(line, /iabcdefgh0|Made Up Payer|\(id /);
  assert.match(line, /2 payments to sort/);
  assert.match(line, /Sample Distro: overdue/);
  assert.match(line, /^Received EUR 10\.00 this month/);
});

test("luke_briefing keeps its keys; its income problems lose payment ids, and ad_spend says Google was not read", async () => {
  const d = memoryDesk();
  const cap = { month: "2026-11", currency: "USD", spent: 12.5, amount: 1000, left: 987.5, status: "ok", estimated: true,
    notRead: ["Google Sat 14 Nov: signed out", "Google Sun 15 Nov: signed out", "Google Mon 16 Nov: Luke to sign in at https://example.com/x"] };
  const hq = async () => ({ money: { cap }, team: { duties: { done: 1, total: 1, late: 0, blocked: 0, byOwner: [] }, tasks: [] } });
  const brief = await call(d, "luke_briefing", { bot: "Alfred" }, hq);
  assert.deepEqual(Object.keys(brief.ad_spend).slice(0, 6), ["month", "spent", "cap", "left", "status", "estimated"]);
  assert.match(brief.ad_spend.not_read, /^Google not read since 14 Nov/);
  assert.doesNotMatch(brief.ad_spend.not_read, /https?:/);
  assert.equal(S.lukeProblem("Payments nobody has sorted: 2026-10 · Made Up Payer · EUR 31.00 (id iabcdefgh01)"), "Payments nobody has sorted: 2026-10 · Made Up Payer · EUR 31.00");
});

test("read_guide says how many tools there are now, not an old count or version", async () => {
  const d = memoryDesk();
  await S.setGuide(d, NOW - 9 * 86400000, "TEAM GUIDE, v2, Wed 11 Nov 2026\n\nFive new tools: seventeen in all. Use seventeen tools wisely.");
  const g = await call(d, "read_guide", { bot: "Ledger" });
  assert.doesNotMatch(g, /seventeen|v2, Wed 11 Nov 2026/i);
  assert.match(g, new RegExp(`${TOOLS.length} tools in all`));
  assert.match(g, /first written Wed 11 Nov 2026/);
});

test("a task blocker that waits on a sign-in the desk says is back gets a check line", async () => {
  const d = memoryDesk();
  await S.setCard(d, NOW - 60000, R, { bot: "Forge", working_on: "Spend log", needs: "TikTok Ads is signed in again.", blockers: "" });
  const tasks = [{ id: "T-90", owner: "Forge", task: "Restart the made-up campaign", status: "blocked", blocker: "Waiting for Luke's written restart and Forge's TikTok Ads sign-in" }];
  const hq = async () => ({ team: { duties: { done: 0, total: 0, late: 0, blocked: 0, byOwner: [] }, tasks } });
  const day = await call(d, "my_day", { bot: "Forge" }, hq);
  const t = day.open_tasks.find((x) => x.id === "T-90");
  assert.ok(t, "the task stays: the restart still waits on Luke");
  assert.match(t.blocker_check || "", /TikTok is signed in again/);
  assert.match(t.blocker_check || "", /task_update/);
});

test("Money: the month chip counts that month's payments to sort, and older ones get their own list", () => {
  const inc = { month: "2026-11", unsortedMonth: [], unsorted: [{ id: "a", date: "2026-10-02" }, { id: "b", date: "2026-09-30" }] };
  const split = V.toSortSplit(inc);
  assert.deepEqual(split.month.map((e) => e.id), []);
  assert.deepEqual(split.older.map((e) => e.id), ["a", "b"]);
  assert.equal(V.unsortedIn(inc, "2026-11"), 0);
  assert.equal(V.unsortedIn(inc, "2026-10"), 1);
  const staff = fs.readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8");
  assert.match(staff, /V\.unsortedIn\(inc, monthKey\)/);
  assert.match(staff, /From earlier months/);
});

test("Money says route, split, due-date and short lines in plain words, with the payment's own note", () => {
  assert.deepEqual(L.routeLines({ payouts: 1, checkLink: 1, split: "rule pending" }), ["More landed in Revolut than was sent: the link between them needs checking.", "Split: you haven't confirmed how it is shared yet."]);
  assert.equal(L.expectedDue({}), "Due date: not reported");
  assert.equal(L.expectedFlags({ shortBy: { amount: 2, currency: "USD" }, shortReason: "unexplained", shortNote: "fee or short payment, not checked" }),
    "Short USD 2.00 (the payment's note: fee or short payment, not checked)");
  assert.equal(L.expectedFlags({ shortBy: { amount: 2, currency: "USD" }, shortReason: "unexplained" }), "Short, unexplained USD 2.00");
  const rows = S.moneyExpectations([
    { id: "st1", date: "2026-11-02", payer: "Sample Distro", amount: 12, currency: "USD", status: "payable", statement: "2026-11-02", paidBy: "rv1" },
    { id: "rv1", date: "2026-11-05", payer: "Sample Distro", amount: 10, currency: "USD", status: "received", account: "Revolut", note: "fee or short payment, not checked" },
  ], [{ id: "distro", name: "Sample Distro", kind: "payer", match: ["sample distro"], cadence: "monthly" }], "2026-11-21").expected.rows;
  const r = rows.find((x) => x.id === "st1");
  assert.ok(r && r.shortBy, JSON.stringify(rows));
  assert.equal(r.shortNote, "fee or short payment, not checked");
  assert.match(L.bankLine({ configured: true, connected: true, lastRunAt: "2026-11-21T09:50:00Z", lastOkAt: "2026-11-21T09:50:00Z", lastAdded: 0, daysLeft: 80, validUntil: "2027-02-01T00:00:00Z" }, NOW), /06:50 SP/);
});

test("a wait that started today says today, never 0 days", () => {
  assert.equal(L.waitedWords(0), "today");
  assert.equal(L.waitedWords(1), "1 day");
  assert.equal(L.waitedWords(4), "4 days");
  assert.equal(L.waitedWords(null), "");
  assert.doesNotMatch(fs.readFileSync(new URL("../js/hq-phone.js", import.meta.url), "utf8"), /it\.days \+ " days"/);
});

test("Team says today's duties and the longer tasks apart, so the counts don't clash", () => {
  assert.equal(L.taskListLine({ blocked: 4, late: 6 }), "Today's duties are on track. Longer tasks: 4 blocked, 6 late.");
  assert.equal(L.taskListLine({ blocked: 0, late: 1 }), "Today's duties are on track. Longer tasks: 1 late.");
  assert.equal(L.taskListLine({ blocked: 0, late: 0 }), "Nobody is stuck right now.");
  assert.doesNotMatch(fs.readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8"), /late on the task list/);
});

test("Ads lists Google's unread days as one line, with no web addresses", () => {
  const lines = ["Google Sat 14 Nov: signed out", "Google Sun 15 Nov: Luke to sign in at https://example.com/sign-in?x=1",
    "Google Mon 16 Nov: not read", "TikTok Fri 13 Nov: see https://example.com/tt for the code"];
  const out = L.gapNotes(lines);
  assert.equal(out.filter((l) => /google/i.test(l)).length, 1);
  assert.equal(out[0], "Google not read since 14 Nov (signed out)");
  assert.ok(out.every((l) => !/https?:/.test(l)), out.join(" | "));
  const miss = L.capMissingLine({ notRead: lines });
  assert.doesNotMatch(miss, /https?:|Sun 15 Nov/);
  assert.match(miss, /^Not read: Google not read since 14 Nov/);
});
