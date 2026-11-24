/* Money is gone from HQ (24 Nov 2026, Luke: "lets fully remove the money section, and leave a note for the bots
   telling them to stop checking all things related to money and delete any tasks related to money ... The ads
   section and spend stays."). This file checks that it stays gone: no Money section on /hq, no income tool on the
   connector for anyone, record_spend still there, Ledger and Sheet told to stop, and luke_briefing's keys
   unchanged for Alfred (rule 6). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, INSTRUCTIONS, TOOL_USERS, toolsFor } from "../netlify/lib/staff-tools.mjs";

const NOW = Date.parse("2026-11-24T13:00:00Z");
const call = (d, name, args, hq = async () => null) => callTool(TOOLS.find((t) => t.name === name), args, { store: d, now: NOW, role: "bot", hq });
/* a read sheet (made up), so the briefing carries no "sheet not read" note */
const cap = { month: "2026-11", currency: "USD", spent: 12.5, amount: 1000, left: 987.5, status: "ok", estimated: false, notRead: [] };
const sheetHq = async () => ({ money: { cap }, team: { duties: { done: 1, total: 1, late: 0, blocked: 0, byOwner: [] }, tasks: [] }, next: null });
const names = (list) => list.map((t) => t.name);
const GONE = ["submit_income", "fix_payment", "income_source", "income_check", "link_transfer", "month_check", "payments", "income_status", "close_month", "song_pl", "sort_payment"];
/* luke_briefing's top-level keys as they were before money left (Alfred's call, which also hands him his messages) */
const BRIEFING_KEYS = ["today", "now_sao_paulo", "site_check", "claude_note", "decisions_waiting_on_luke", "ad_spend", "next_release", "unknown_in_spotify", "messages_for_you", "income_this_month", "duties_not_done", "how_to_report"];

test("/hq has no Money section", () => {
  const page = fs.readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  assert.doesNotMatch(page, /<section[^>]*\bid="money"/);
  assert.doesNotMatch(page, /id="(errMoney|incomeBody|songPL|moneyTable|moneyDetail)"/);
  assert.match(page, /\bid="ads"/, "the Ads section stays");
});

test("no income tool on the connector, for anyone; record_spend stays", () => {
  for (const n of GONE) assert.ok(!names(TOOLS).includes(n), n + " is gone");
  for (const n of GONE) assert.equal(TOOL_USERS[n], undefined, n);
  for (const b of S.DEFAULT_ROSTER) for (const n of GONE) assert.ok(!names(toolsFor(b.name, S.DEFAULT_ROSTER)).includes(n), `${b.name} has no ${n}`);
  assert.ok(names(TOOLS).includes("record_spend"));
  assert.ok(names(toolsFor("Forge", S.DEFAULT_ROSTER)).includes("record_spend"), "Forge still records ad spend");
  assert.match(INSTRUCTIONS, /record_spend/);
  /* the tool names (payments is also a plain word, used in the note that says money left HQ) */
  for (const n of GONE.filter((x) => x.includes("_"))) assert.doesNotMatch(INSTRUCTIONS, new RegExp("\\b" + n + "\\b"), n + " is not in the instructions");
});

test("Ledger's and Sheet's my_day carry the one note: stop the money work, delete money tasks, ask Luke", async () => {
  const d = memoryDesk();
  for (const bot of ["Ledger", "Sheet"]) {
    const day = await call(d, "my_day", { bot });
    assert.match(day.money_stopped, /HQ no longer handles money/);
    assert.match(day.money_stopped, /Stop checking income, payments, Revolut and the income sheet/);
    assert.match(day.money_stopped, /Delete your money tasks/);
    assert.match(day.money_stopped, /Ask Luke for your new task/);
    assert.equal(day.income_problems, undefined);
    assert.equal(day.expected_money, undefined);
  }
  assert.equal((await call(d, "my_day", { bot: "Atlas" })).money_stopped, undefined, "only Ledger and Sheet");
});

test("luke_briefing keeps its keys and their types; income_this_month only says money left HQ", async () => {
  const d = memoryDesk();
  const b = await call(d, "luke_briefing", { bot: "Alfred" }, sheetHq);
  assert.deepEqual(Object.keys(b), BRIEFING_KEYS);
  assert.deepEqual(Object.keys(b.income_this_month), ["received", "pending", "payable", "problems"]);
  for (const k of ["received", "pending", "payable"]) assert.equal(b.income_this_month[k], "Money is no longer on HQ.");
  assert.deepEqual(b.income_this_month.problems, []);
  const short = await call(d, "luke_short_briefing", { bot: "Alfred" }, sheetHq);
  assert.equal(short.income, undefined);
  assert.ok("ad_spend" in short && "decisions" in short && "needs_luke_sign_in" in short);
});

test("the desk no longer reads income, and the site check says nothing about it", async () => {
  const d = memoryDesk();
  const desk = await S.loadDesk(d, NOW);
  assert.equal(desk.income, undefined);
  const b = S.board(desk, NOW, null);
  assert.equal(b.income, undefined); assert.equal(b.closes, undefined);
  assert.doesNotMatch(S.checkReport({ desk, hq: null, hqState: null, now: NOW }).text, /income/i);
});
