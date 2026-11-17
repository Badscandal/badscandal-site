/* Ledger, 16 Nov 2026 (points 8 and 10): royalties are only the music's own money; a statement filed as pending or
   payable can be marked paid by the received payment that settled it (the amount or currency may differ: a
   USD 1,300 statement paid as USD 1,280; a USD statement paid in EUR). Every name and number here is made up. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const NOW = Date.parse("2026-11-16T15:00:00Z");
const R = S.DEFAULT_ROSTER;
const fails = (p, re) => assert.rejects(p, (e) => e.name === "StaffError" && re.test(e.message));
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args) => callTool(tool(name), args, { store: d, now: NOW, role: "bot", hq: async () => null });
const sub = async (d, o) => (await S.submitIncome(d, NOW, R, { bot: "Ledger", account: "Revolut", status: "received", category: "Other", ...o })).entry;

test("royalties this month: self-releases, label deals and publishing only (never production or salary)", async () => {
  const d = memoryDesk();
  await sub(d, { date: "2026-11-05", payer: "Sample Studio", amount: "1280", currency: "USD", category: "Production" });
  await sub(d, { date: "2026-11-06", payer: "Sample Distro", amount: "9.76", currency: "USD", category: "Self-releases" });
  await sub(d, { date: "2026-11-02", payer: "Sample Employer", amount: "1000", currency: "EUR", category: "Salary" });
  await sub(d, { date: "2026-11-07", payer: "Sample Label", amount: "50", currency: "EUR", category: "Label deals" });
  await sub(d, { date: "2026-11-08", payer: "Sample Publishing", amount: "20", currency: "EUR", category: "Publishing" });
  await sub(d, { date: "2026-11-09", payer: "Sample Misc", amount: "5", currency: "EUR", category: "Other" });
  const i = await S.incomeState(d, NOW);
  assert.deepEqual(i.royaltiesOnly, { USD: 9.76, EUR: 70 });
  assert.equal((await call(d, "income_status", { bot: "Ledger" })).royalties_only_this_month.includes("USD 9.76"), true);
});

test("fix_payment paid_by: a filed statement is settled by the received payment, even with another amount or currency", async () => {
  const d = memoryDesk();
  const stmt = await sub(d, { date: "2026-11-02", payer: "Sample Studio", amount: "1300", currency: "USD", status: "pending", account: "Statement only", category: "Production" });
  const got = await sub(d, { date: "2026-11-05", payer: "Sample Studio", amount: "1280", currency: "USD", category: "Production" });
  const stmt2 = await sub(d, { date: "2026-10-28", payer: "Sample Store", amount: "473.07", currency: "USD", status: "payable", account: "Statement only", category: "Self-releases" });
  const got2 = await sub(d, { date: "2026-11-03", payer: "Sample Store", amount: "411.43", currency: "EUR", category: "Self-releases" });
  let i = await S.incomeState(d, NOW);
  assert.deepEqual([i.pendingOnly, i.payable], [{ USD: 1300 }, { }]);
  const r = await call(d, "fix_payment", { bot: "Ledger", id: stmt.id, month: "2026-11", paid_by: got.id, reason: "paid as USD 1,280 on 5 Nov" });
  assert.deepEqual(r.fixed, ["paidBy"]);
  await call(d, "fix_payment", { bot: "Ledger", id: stmt2.id, month: "2026-10", paid_by: got2.id, reason: "paid in EUR on 3 Nov" });
  i = await S.incomeState(d, NOW);
  assert.deepEqual([i.pendingOnly, i.pending, i.received], [{}, {}, { USD: 1280, EUR: 411.43 }], "the statements are settled; the money counts once, as received");
  const p = (await call(d, "payments", { bot: "Ledger", month: "2026-11" })).payments.find((x) => x.id === stmt.id);
  assert.equal(p.paid_by, got.id);
  assert.deepEqual(L.payStatus({ status: "pending", paidBy: got.id }), { text: "Paid (see the received payment)", counted: false });
  /* refused: a target that isn't a received payment; marking a received payment as a statement */
  await fails(call(d, "fix_payment", { bot: "Ledger", id: stmt.id, month: "2026-11", paid_by: stmt2.id, reason: "x y z" }), /not a received payment/);
  await fails(call(d, "fix_payment", { bot: "Ledger", id: got.id, month: "2026-11", paid_by: got2.id, reason: "x y z" }), /Only a statement/);
  await fails(call(d, "fix_payment", { bot: "Ledger", id: stmt.id, month: "2026-11", paid_by: "inope", reason: "x y z" }), /no received payment/);
});

/* 17 Nov 2026 (Luke: "the month should count when the payment arrives so the payment from cheerful landed today"):
   fix_payment may put a payment's real arrival day in ANOTHER month: it moves there, keeps its id, counts once */
test("fix_payment date: a payment moves to the month it really arrived in, once, with its id", async () => {
  const d = memoryDesk();
  const p = await sub(d, { date: "2026-10-30", payer: "Sample Studio", amount: "1280", currency: "USD", category: "Production" });
  const r = await call(d, "fix_payment", { bot: "Ledger", id: p.id, month: "2026-10", date: "2026-11-16", reason: "it landed in Revolut on 16 Nov" });
  assert.deepEqual([r.saved, r.fixed, r.moved_to], [true, ["date"], "2026-11"]);
  const nov = await call(d, "payments", { bot: "Ledger", month: "2026-11" }), oct = await call(d, "payments", { bot: "Ledger", month: "2026-10" });
  assert.deepEqual([nov.payments.map((x) => [x.id, x.date]), oct.total], [[[p.id, "2026-11-16"]], 0]);
  const i = await S.incomeState(d, NOW);
  assert.deepEqual([i.received, i.receivedByMonth["2026-10"]], [{ USD: 1280 }, undefined]);
  await fails(call(d, "fix_payment", { bot: "Ledger", id: p.id, month: "2026-11", date: "2026-12-30", reason: "x y z" }), /future/);
});

test("Ledger and Sheet ask Luke when they're not sure what a payment is", async () => {
  const { INSTRUCTIONS } = await import("../netlify/lib/staff-tools.mjs");
  assert.match(INSTRUCTIONS, /not sure what a payment .* ask Luke/);
});
