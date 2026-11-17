/* Money, simpler (16 Nov 2026, Luke: "this part is confusing ... better to just have one received in november the
   total for that month, and an option check other months previously ... at the beginning of every month they
   should not be highlighted and it should say when we receive them they should change to green if we don't
   receive change it to red ... revolut is my main bank account, paypal and wise money goes there ... month by
   month should be updated to just show the month and amount").
   Payer names never go in this repo: which sources are the main ones and the day each usually pays by are set on
   the desk (income_source main / due_day), by Ledger. Every name and number here is made up. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, instructionsFor } from "../netlify/lib/staff-tools.mjs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const NOW = Date.parse("2026-11-16T15:00:00Z"); /* Mon 16 Nov, São Paulo */
const R = S.DEFAULT_ROSTER;
const fails = (p, re) => assert.rejects(p, (e) => e.name === "StaffError" && re.test(e.message));
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args) => callTool(tool(name), args, { store: d, now: NOW, role: "bot", hq: async () => null });
const SRC = [
  { id: "distro", name: "Sample Distro", kind: "payer", category: "Self-releases", currency: "USD", lands: "PayPal", cadence: "monthly", owner: "Ledger", state: "active", match: ["sample distro"] },
  { id: "label", name: "Sample Label", kind: "payer", category: "Label deals", currency: "EUR", lands: "Revolut", cadence: "monthly", owner: "Ledger", state: "active", match: ["sample label"] },
  { id: "wage", name: "Sample Wage", kind: "payer", category: "Salary", currency: "EUR", lands: "Revolut", cadence: "monthly", owner: "Ledger", state: "active", match: ["sample wage"] },
  { id: "pub", name: "Sample Publishing", kind: "payer", category: "Publishing", currency: "USD", lands: "Wise", cadence: "quarterly", owner: "Ledger", state: "active", match: ["sample publishing"] },
  { id: "revolut", name: "Revolut", kind: "account", owner: "HQ", cadence: "daily", state: "active" }];
const sub = (d, o) => S.submitIncome(d, NOW, R, { bot: "Ledger", category: "Other", account: "Revolut", status: "received", ...o });

test("income_source: main and the day it usually pays by; a source the desk doesn't have yet can be added", async () => {
  const d = memoryDesk();
  await S.setSources(d, SRC);
  const r = await call(d, "income_source", { bot: "Ledger", source: "Sample Label", main: true, due_day: 10 });
  assert.deepEqual([r.main, r.due_day], [true, 10]);
  await fails(call(d, "income_source", { bot: "Ledger", source: "Sample Label", due_day: 40 }), /1 to 31/);
  const n = await call(d, "income_source", { bot: "Ledger", source: "New Sample Store", create: true, category: "Self-releases", main: true, due_day: 25, accounts: ["Revolut"] });
  assert.equal(n.saved, true);
  const all = await S.getSources(d);
  const made = all.find((s) => s.name === "New Sample Store");
  assert.deepEqual([made.kind, made.main, made.dueDay, made.category, made.cadence, made.state], ["payer", true, 25, "Self-releases", "monthly", "active"]);
  await fails(call(d, "income_source", { bot: "Ledger", source: "Another Unknown", main: true }), /There is no income source called .*create: true/);
  await fails(call(d, "income_source", { bot: "Ledger", source: "Sample Label", create: true, category: "Other" }), /already/);
});

test("each main source this month: neutral until its money comes, green when it has, red once its day has passed", async () => {
  const d = memoryDesk();
  await S.setSources(d, SRC);
  for (const [source, due] of [["distro", 5], ["label", 10], ["wage", 20], ["pub", 3]]) await call(d, "income_source", { bot: "Ledger", source, main: true, due_day: due });
  await sub(d, { payer: "Sample Distro Inc", amount: "120.50", currency: "USD", date: "2026-11-04", category: "Self-releases" });
  await sub(d, { payer: "Sample Distro Inc", amount: "99.00", currency: "USD", date: "2026-10-04", category: "Self-releases" });
  const i = await S.incomeState(d, NOW);
  const by = Object.fromEntries(i.sources.map((s) => [s.id, s.thisMonth]));
  assert.deepEqual(by.distro, { state: "received", amount: { USD: 120.5 }, date: "2026-11-04", dueDay: 5 });
  assert.deepEqual(by.label, { state: "late", amount: null, date: null, dueDay: 10 }, "the 10th has passed: red");
  assert.deepEqual(by.wage, { state: "waiting", amount: null, date: null, dueDay: 20 }, "the 20th hasn't come: neutral");
  assert.equal(by.pub.state, "waiting", "a quarterly source is never red in a month it may not pay");
  /* the page's words */
  assert.equal(L.sourceMonthLine({ thisMonth: by.distro }), "Received USD 120.50 · Wed 4 Nov");
  assert.equal(L.sourceMonthLine({ thisMonth: by.label }), "Not received: it usually pays by the 10th");
  assert.equal(L.sourceMonthLine({ thisMonth: by.wage }), "Expected by the 20th");
  assert.equal(L.sourceMonthLine({ thisMonth: { state: "waiting", dueDay: null } }), "Not received yet this month");
  /* the main ones first, in their own list */
  assert.deepEqual(L.mainSources(i.sources).map((s) => s.id), ["distro", "label", "wage", "pub"]);
  assert.ok(!L.mainSources(i.sources).some((s) => s.kind === "account"));
});

test("Received: one total per month, this month and the ones before (received only)", async () => {
  const d = memoryDesk();
  await S.setSources(d, SRC);
  await sub(d, { payer: "Sample Label", amount: "300", currency: "EUR", date: "2026-11-02" });
  await sub(d, { payer: "Sample Wage", amount: "1000", currency: "EUR", date: "2026-11-01" });
  await sub(d, { payer: "Sample Distro", amount: "50", currency: "USD", date: "2026-10-20" });
  await sub(d, { payer: "Sample Label", amount: "70", currency: "EUR", date: "2026-10-03", status: "pending", account: "Statement only" });
  const st = await S.incomeState(d, NOW);
  assert.deepEqual(st.receivedByMonth["2026-11"], { EUR: 1300 });
  assert.deepEqual(st.receivedByMonth["2026-10"], { USD: 50 }, "a pending statement is never received");
  assert.deepEqual(L.incomeTotals(st).map((t) => t.label), ["Received"], "one total, no 'royalties (no salary)'");
  assert.deepEqual(L.receivedMonths(st, "2026-11"), [{ month: "2026-11", label: "November 2026", lines: ["EUR 1,300.00"] }, { month: "2026-10", label: "October 2026", lines: ["USD 50.00"] }]);
});

test("Month by month: the month and what was received, nothing else", () => {
  const rows = L.monthRows([{ month: "2026-11", income: { Royalties: { EUR: 10, USD: 5 }, Salary: { EUR: 1000 } }, spend: { Meta: { USD: 9 } }, pending: { EUR: 3 } }, { month: "2026-10", income: {}, spend: {} }]);
  assert.deepEqual(rows, [{ month: "2026-11", label: "November 2026", amount: "EUR 1,010.00 + USD 5.00" }, { month: "2026-10", label: "October 2026", amount: "nothing received" }]);
});

test("sort_payment: a Revolut row can be tied to its source (the wage Luke moves in from another bank is income)", async () => {
  const d = memoryDesk();
  await S.setSources(d, SRC);
  /* as the reader files Luke's own transfer from another bank of his */
  const e = (await S.submitIncome(d, NOW, R, { bot: "HQ", date: "2026-11-05", payer: "Sam Example", amount: "1000", currency: "EUR", status: "transfer", category: "Other", account: "Revolut", reference: "tx-wage-1", note: "Read from Revolut" })).entry;
  const r = await call(d, "sort_payment", { bot: "Ledger", id: e.id, month: "2026-11", status: "received", category: "Salary", source: "wage", note: "the monthly wage, moved in by Luke" });
  assert.equal(r.status, "received");
  const i = await S.incomeState(d, NOW);
  assert.equal(i.sources.find((s) => s.id === "wage").thisMonth.state, "received");
  await fails(call(d, "sort_payment", { bot: "Ledger", id: e.id, month: "2026-11", status: "received", category: "Salary", source: "nosuch" }), /no income source/i);
});

test("Ledger's rules: Revolut is the main bank; Wise and PayPal money arriving there is confirmed, never counted twice", () => {
  const t = instructionsFor("Ledger", R);
  assert.match(t, /Revolut is Luke's main bank/);
  assert.match(t, /Wise or PayPal.*same money.*transfer/);
  assert.match(t, /wage .* from another bank .* received.* Salary.* source/);
  assert.match(t, /main true and due_day/);
});
