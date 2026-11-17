/* ONE entry per payment (17 Nov 2026, Luke: "money is not double counted so if something comes to paypal and i
   send it to revolut its not double counted ... wise and paypal are only mainly used to confirm and check revolut
   is the main entry from the first day to last day of month income is checked").
   - income counts once, when it lands in Revolut (the main account), in the month it lands
   - a payment logged in Wise or PayPal is "in PayPal": seen, never counted on its own
   - link_transfer ties the Revolut credit to the PayPal / Wise payments it carried: the Revolut row counts (with
     their source and category), they are "moved to Revolut"
   - month_check: what is left before a month is right
   Every name and number here is made up. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, INSTRUCTIONS } from "../netlify/lib/staff-tools.mjs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const NOW = Date.parse("2026-11-17T15:00:00Z");
const R = S.DEFAULT_ROSTER;
const fails = (p, re) => assert.rejects(p, (e) => e.name === "StaffError" && re.test(e.message));
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args) => callTool(tool(name), args, { store: d, now: NOW, role: "bot", hq: async () => null });
const SRC = [
  { id: "distro", name: "Sample Distro", kind: "payer", category: "Self-releases", currency: "USD", lands: "PayPal", cadence: "monthly", owner: "Ledger", state: "active", match: ["sample distro"], main: true, dueDay: 20 },
  { id: "label", name: "Sample Label", kind: "payer", category: "Label deals", currency: "EUR", lands: "Revolut", cadence: "monthly", owner: "Ledger", state: "active", match: ["sample label"] },
  { id: "revolut", name: "Revolut", kind: "account", owner: "HQ", cadence: "daily", state: "active" },
  { id: "paypal", name: "PayPal", kind: "account", owner: "Ledger", cadence: "daily", state: "active" },
  { id: "wise", name: "Wise", kind: "account", owner: "Ledger", cadence: "daily", state: "active" }];
const sub = async (d, o) => (await S.submitIncome(d, NOW, R, { bot: "Ledger", status: "received", category: "Other", ...o })).entry;
async function desk() { const d = memoryDesk(); await S.setSources(d, SRC); return d; }

test("money in PayPal or Wise is seen, never counted; Revolut is the one entry", async () => {
  const d = await desk();
  await sub(d, { date: "2026-11-05", payer: "Sample Distro", amount: "100", currency: "USD", account: "PayPal", category: "Self-releases" });
  await sub(d, { date: "2026-11-06", payer: "Sample Label", amount: "50", currency: "EUR", account: "Revolut", category: "Label deals" });
  const i = await S.incomeState(d, NOW);
  assert.deepEqual(i.received, { EUR: 50 }, "only what landed in Revolut");
  assert.deepEqual(i.holding, { USD: 100 });
  assert.equal(i.sources.find((s) => s.id === "distro").thisMonth.state, "waiting", "not received until it is in Revolut");
  const row = i.entries.find((e) => e.account === "PayPal");
  assert.equal(row.holding, true);
  assert.deepEqual(L.payStatus(row), { text: "In PayPal: counts when it reaches Revolut", counted: false });
  const st = await call(d, "income_status", { bot: "Ledger" });
  assert.equal(st.in_wise_or_paypal_not_counted, "USD 100.00");
  assert.match(st.waiting_in_wise_or_paypal[0].line, /Sample Distro/);
});

test("link_transfer: the Revolut credit from PayPal counts once, with the source and category of what it carried", async () => {
  const d = await desk();
  const a = await sub(d, { date: "2026-11-05", payer: "Sample Distro", amount: "100", currency: "USD", account: "PayPal", category: "Self-releases" });
  const b = await sub(d, { date: "2026-11-08", payer: "Sample Distro", amount: "60", currency: "USD", account: "PayPal", category: "Self-releases" });
  /* as the reader files it: from PayPal, nobody has said what it is */
  const rev = (await S.submitIncome(d, NOW, R, { bot: "HQ", date: "2026-11-12", payer: "PAYPAL", amount: "155.20", currency: "USD", status: "unsorted", category: "Other", account: "Revolut", reference: "tx-pp-1", note: "Read from Revolut" })).entry;
  const r = await call(d, "link_transfer", { bot: "Ledger", revolut_id: rev.id, month: "2026-11", from: [a.id, b.id], note: "two Sample Distro payouts, PayPal took its fee" });
  assert.deepEqual([r.linked, r.counted], [2, "USD 155.20"]);
  const i = await S.incomeState(d, NOW);
  assert.deepEqual([i.received, i.holding], [{ USD: 155.2 }, {}], "counted once, at Revolut");
  const by = Object.fromEntries(i.entries.map((e) => [e.id, e]));
  assert.deepEqual([by[rev.id].status, by[rev.id].source, by[rev.id].category], ["received", "distro", "Self-releases"]);
  assert.equal(by[a.id].movedTo, rev.id);
  assert.deepEqual(L.payStatus(by[a.id]), { text: "Moved to Revolut", counted: false });
  assert.equal(i.sources.find((s) => s.id === "distro").thisMonth.state, "received");
  /* refused: linking twice, a non-Revolut target, a Revolut row as a source, nothing to link */
  await fails(call(d, "link_transfer", { bot: "Ledger", revolut_id: rev.id, month: "2026-11", from: [a.id] }), /already (linked|moved)/);
  await fails(call(d, "link_transfer", { bot: "Ledger", revolut_id: a.id, month: "2026-11", from: [b.id] }), /not a Revolut payment/);
  const c = await sub(d, { date: "2026-11-09", payer: "Sample Distro", amount: "10", currency: "USD", account: "PayPal", category: "Self-releases" });
  const rev2 = (await S.submitIncome(d, NOW, R, { bot: "HQ", date: "2026-11-13", payer: "PAYPAL", amount: "10", currency: "USD", status: "unsorted", category: "Other", account: "Revolut", reference: "tx-pp-2" })).entry;
  await fails(call(d, "link_transfer", { bot: "Ledger", revolut_id: rev2.id, month: "2026-11", from: [rev.id] }), /in Wise or PayPal/);
  await fails(call(d, "link_transfer", { bot: "Ledger", revolut_id: rev2.id, month: "2026-11", from: [] }), /from/);
  await fails(call(d, "link_transfer", { bot: "Kevin", revolut_id: rev2.id, month: "2026-11", from: [c.id] }), /Ledger/);
});

test("month_check: everything still in the way of a right month, and ready when nothing is", async () => {
  const d = await desk();
  const a = await sub(d, { date: "2026-11-05", payer: "Sample Distro", amount: "100", currency: "USD", account: "PayPal", category: "Self-releases" });
  const rev = (await S.submitIncome(d, NOW, R, { bot: "HQ", date: "2026-11-12", payer: "PAYPAL", amount: "98", currency: "USD", status: "unsorted", category: "Other", account: "Revolut", reference: "tx-pp-1" })).entry;
  await sub(d, { date: "2026-11-06", payer: "Sample Label", amount: "50", currency: "EUR", account: "Revolut", category: "Label deals" });
  let c = await call(d, "month_check", { bot: "Ledger", month: "2026-11" });
  assert.equal(c.ready, false);
  assert.equal(c.received, "EUR 50.00");
  assert.equal(c.to_sort.length, 1);
  assert.match(c.to_sort[0], /PAYPAL .* from your own PayPal: link it with link_transfer/);
  assert.equal(c.waiting_in_wise_or_paypal.length, 1);
  await call(d, "link_transfer", { bot: "Ledger", revolut_id: rev.id, month: "2026-11", from: [a.id] });
  c = await call(d, "month_check", { bot: "Ledger", month: "2026-11" });
  assert.deepEqual([c.ready, c.to_sort.length, c.waiting_in_wise_or_paypal.length, c.received], [true, 0, 0, "EUR 50.00 + USD 98.00"]);
  assert.match(c.verdict, /^November 2026 is right/);
});

test("the bots are told: one entry, Revolut; Wise and PayPal only confirm; link, check the month, ask Luke", () => {
  assert.match(INSTRUCTIONS, /counted once, when it lands in Revolut/);
  assert.match(INSTRUCTIONS, /link_transfer/);
  assert.match(INSTRUCTIONS, /month_check/);
  assert.doesNotMatch(INSTRUCTIONS, /if that payment is already on the desk as received, it is the same money, so sort the Revolut row as transfer/, "the old rule is gone");
});
