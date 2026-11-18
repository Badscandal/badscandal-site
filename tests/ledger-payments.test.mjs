/* Ledger's report (16 Nov 2026, via Nova): he couldn't reach HQ's Revolut payments.
   - income_status listed the 15 newest payments only (11 of November's 26 out of view, no word about it) and no ids
     for HQ's own rows, so sort_payment / fix_payment could never reach them
   - a received payment couldn't be tied to its source (the source card said "nothing logged" while the money counted)
   - Revolut still said "blocked" / "not connected" after the site had read it; PayPal (Luke's own) was a "new payer"
   Every name and number here is made up. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";

const NOW = Date.parse("2026-11-16T15:00:00Z");
const R = S.DEFAULT_ROSTER;
const fails = (p, re) => assert.rejects(p, (e) => e.name === "StaffError" && re.test(e.message));
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args) => callTool(tool(name), args, { store: d, now: NOW, role: "bot", hq: async () => null });
const SRC = [
  { id: "label", name: "Sample Label", kind: "payer", category: "Label deals", currency: "EUR", lands: "Revolut", cadence: "monthly", owner: "Ledger", state: "active", match: ["sample label"] },
  { id: "store", name: "Sample Store", kind: "payer", category: "Self-releases", currency: "EUR", lands: "Revolut", cadence: "monthly", owner: "Ledger", state: "blocked", blocker: "Can't be seen until Revolut can be read", match: ["sample store"] },
  { id: "revolut", name: "Revolut", kind: "account", owner: "HQ", cadence: "daily", state: "blocked", blocker: "The site's Revolut reader is not connected yet" },
  { id: "paypal", name: "PayPal", kind: "account", owner: "Ledger", cadence: "daily", state: "active" }];
async function desk() {
  const d = memoryDesk();
  await S.setSources(d, SRC);
  for (let i = 1; i <= 26; i++) await S.submitIncome(d, NOW, R, { bot: i % 2 ? "HQ" : "Ledger", date: `2026-11-${String(1 + (i % 15)).padStart(2, "0")}`, payer: `Made-up Payer ${i}`, amount: String(10 + i), currency: "EUR",
    status: "received", category: "Other", account: i % 2 ? "Revolut" : "PayPal", reference: `ref-${i}` });
  return d;
}

test("payments: every payment of a month, with its id, filtered by account, source, payer or status; never cut without saying", async () => {
  const d = await desk();
  const all = await call(d, "payments", { bot: "Ledger", month: "2026-11" });
  assert.equal(all.total, 26);
  assert.equal(all.payments.length, 26, "no 15-row cap");
  const p = all.payments[0];
  /* 18 Nov 2026: statement month and landing month are both shown */
  const keys = ["account", "added_by", "amount", "category", "counts_in", "counts_note", "counted", "currency", "date", "id", "landed_month", "payer", "source", "statement_month", "status"];
  if (p.note) keys.push("note");
  assert.deepEqual(Object.keys(p).sort(), keys.sort());
  assert.match(p.id, /^i/);
  assert.ok(all.payments.every((x, i, a) => i === 0 || a[i - 1].date >= x.date), "newest first");
  assert.equal((await call(d, "payments", { bot: "Ledger", month: "2026-11", account: "revolut" })).total, 13);
  assert.equal((await call(d, "payments", { bot: "Ledger", month: "2026-11", payer: "payer 26" })).payments[0].payer, "Made-up Payer 26");
  const few = await call(d, "payments", { bot: "Ledger", month: "2026-11", limit: 5 });
  assert.deepEqual([few.payments.length, few.total], [5, 26]);
  assert.match(few.more, /21 more/);
  await fails(call(d, "payments", { bot: "Ledger", month: "Nov" }), /YYYY-MM/);
  /* income_status: ids on the newest, and the rest said */
  const st = await call(d, "income_status", { bot: "Ledger" });
  assert.match(st.newest_payments[0], /\(id i[a-z0-9]+\)$/);
  assert.match(st.more_payments, /^11 more this month: use payments/);
});

test("fix_payment takes source: any payment (HQ's Revolut rows too) is tied to its source, which then shows it", async () => {
  const d = await desk();
  const row = (await S.submitIncome(d, NOW, R, { bot: "HQ", date: "2026-11-03", payer: "SAMPLE STORE LTD PAYOUT", amount: "411.43", currency: "EUR", status: "received", category: "Other", account: "Revolut", reference: "ref-store" })).entry;
  const r = await call(d, "fix_payment", { bot: "Ledger", id: row.id, month: "2026-11", source: "store", category: "Self-releases", reason: "it is Sample Store's payout" });
  assert.deepEqual(r.fixed.sort(), ["category", "source"]);
  const i = await S.incomeState(d, NOW);
  const store = i.sources.find((s) => s.id === "store");
  assert.deepEqual(store.monthTotal, { EUR: 411.43 });
  await fails(call(d, "fix_payment", { bot: "Ledger", id: row.id, month: "2026-11", source: "nosuch", reason: "x y z" }), /no income source/i);
  assert.equal((await call(d, "payments", { bot: "Ledger", month: "2026-11", source: "store" })).total, 1);
});

test("a full Revolut read clears 'blocked' and 'not connected': on the Revolut account, and a source waiting only for Revolut", async () => {
  const d = await desk();
  let i = await S.incomeState(d, NOW);
  assert.ok(!i.problems.some((p) => /Revolut: blocked/.test(p)), "18 Nov 2026: Revolut rows are already arriving, so the warning is hidden");
  const changed = await S.afterBankRead(d, NOW);
  assert.deepEqual(changed.sort(), ["revolut", "store"]);
  i = await S.incomeState(d, NOW);
  assert.ok(!i.problems.some((p) => /not connected|until Revolut/i.test(p)), i.problems.join(" | "));
  const src = await S.getSources(d);
  assert.deepEqual([src.find((s) => s.id === "revolut").state, src.find((s) => s.id === "store").state], ["active", "active"]);
  assert.deepEqual(await S.afterBankRead(d, NOW), [], "once");
});

test("Luke's own money accounts (PayPal, Wise) are never a 'new payer'", async () => {
  const d = await desk();
  await S.submitIncome(d, NOW, R, { bot: "Ledger", date: "2026-11-10", payer: "PAYPAL", amount: "80", currency: "EUR", status: "received", category: "Other", account: "Revolut", reference: "ref-pp" });
  const i = await S.incomeState(d, NOW);
  assert.ok(!i.unknown.includes("PAYPAL"), i.unknown.join(", "));
  assert.ok(i.unknown.includes("Made-up Payer 1"));
});

/* 17 Nov 2026 (Nova): "Label Engine" still showed EUR 411.43 after Ledger tied that payment to CREATE: a payment tied
   to a source counts for that source only, never for another whose name its payer happens to match */
test("a payment tied to a source counts for that source only", async () => {
  const d = memoryDesk();
  await S.setSources(d, [...SRC, { id: "engine", name: "Sample Engine", kind: "payer", category: "Self-releases", currency: "EUR", cadence: "monthly", owner: "Ledger", state: "active", match: ["sample engine"] }]);
  const e = (await S.submitIncome(d, NOW, R, { bot: "HQ", date: "2026-11-03", payer: "SAMPLE ENGINE PAYOUTS", amount: "411.43", currency: "EUR", status: "received", category: "Other", account: "Revolut", reference: "ref-eng" })).entry;
  await call(d, "fix_payment", { bot: "Ledger", id: e.id, month: "2026-11", source: "store", reason: "it is Sample Store's money, paid through Sample Engine" });
  const i = await S.incomeState(d, NOW);
  const by = Object.fromEntries(i.sources.map((s) => [s.id, s.monthTotal]));
  assert.deepEqual([by.store, by.engine], [{ EUR: 411.43 }, {}]);
});
