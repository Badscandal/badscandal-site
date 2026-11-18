/* L1 Expected money and L9 payout-route cost (18 Nov 2026), for Ledger and Sheet.
   Every name and number here is made up. A missing rate is "not enough data", never a guessed figure.
   HQ only reads what was recorded. Nothing in these tests moves money. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk, sampleBoard } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, INSTRUCTIONS } from "../netlify/lib/staff-tools.mjs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const TODAY = "2026-11-18";
const NOW = Date.parse("2026-11-18T15:00:00Z");
const R = S.DEFAULT_ROSTER;
const src = (over = {}) => ({ id: "distro", name: "Sample Distro", kind: "payer", category: "Self-releases", currency: "USD", lands: "PayPal", cadence: "monthly", owner: "Ledger", state: "active", match: ["sample distro"], ...over });
const pay = (over) => ({ history: [], reference: "", period: "", source: "", note: "", by: "Ledger", at: "2026-11-01T15:00:00Z", ...over });
const view = (entries, sources, today = TODAY) => S.moneyExpectations(entries, sources, today);
const call = (d, name, args, now = NOW) => callTool(TOOLS.find((t) => t.name === name), args, { store: d, now, role: "bot", hq: async () => null });

test("a statement takes the monthly source's due day, and is late only once that day has passed", () => {
  const statement = pay({ id: "istatement01", date: "2026-11-02", payer: "Sample Distro", amount: 80, currency: "USD", status: "pending", account: "Statement only", category: "Self-releases" });
  const early = view([statement], [src({ dueDay: 10 })], "2026-11-09").expected.rows[0];
  assert.equal(early.due, "2026-11-10");
  assert.equal(early.dueFrom, "set");
  assert.deepEqual(early.flags, [], "the 10th has not passed");
  const late = view([statement], [src({ dueDay: 10 })], TODAY).expected.rows[0];
  assert.deepEqual(late.flags, ["late"]);
  assert.equal(late.payableState, "not_recorded", "filed as pending: payable was never recorded");
  assert.equal(late.paid, null);
  assert.equal(late.landed, null);
  /* a quarterly source's due day is not applied to every month (the tile already works that way) */
  const quarter = view([statement], [src({ cadence: "quarterly", dueDay: 10 })], TODAY).expected.rows[0];
  assert.equal(quarter.due, null);
  assert.equal(quarter.dueNote, "");
});

test("the due date stays unknown when there is not enough history, and a plain receipt is not a statement", () => {
  const one = pay({ id: "ireceipt001", date: "2026-10-12", payer: "Sample Distro", amount: 40, currency: "USD", status: "received", account: "Revolut", category: "Self-releases" });
  const open = pay({ id: "istatement02", date: "2026-11-02", payer: "Sample Distro", amount: 40, currency: "USD", status: "statement only", account: "Statement only", category: "Self-releases" });
  const got = view([one, open], [src()]);
  assert.equal(got.expected.rows.length, 1, "the Revolut receipt was never a statement");
  assert.equal(got.expected.rows[0].id, "istatement02");
  assert.equal(got.expected.rows[0].due, null);
  assert.equal(got.expected.rows[0].payableState, "not_yet");
  assert.equal(got.expected.learned[0].enough, false);
  assert.equal(got.expected.learned[0].why, "not enough payments yet");
  assert.equal(got.routes.length, 0, "a statement with nothing landed is not a route");
});

test("a pay day is learned from history, and not when the days are too far apart", () => {
  const arrive = (id, date) => pay({ id, date, payer: "Sample Distro", amount: 20, currency: "USD", status: "received", account: "Revolut", category: "Self-releases" });
  const open = pay({ id: "istatement03", date: "2026-11-01", payer: "Sample Distro", amount: 20, currency: "USD", status: "pending", account: "Statement only", category: "Self-releases" });
  const close = view([arrive("iaaa000001", "2026-08-11"), arrive("iaaa000002", "2026-09-12"), arrive("iaaa000003", "2026-10-12"), open], [src()]).expected;
  assert.equal(close.learned[0].day, 12);
  assert.equal(close.learned[0].payments, 3);
  assert.equal(close.rows[0].due, "2026-11-12");
  assert.equal(close.rows[0].dueFrom, "day");
  const spread = view([arrive("iaaa000004", "2026-08-01"), arrive("iaaa000005", "2026-09-02"), arrive("iaaa000006", "2026-10-20"), open], [src()]).expected;
  assert.equal(spread.learned[0].enough, false);
  assert.match(spread.learned[0].why, /too spread out/);
  assert.equal(spread.rows[0].due, null, "no day is invented");
});

test("two earlier landings teach the gap, and a due day Ledger set wins over that gap", () => {
  const done = (id, statement, landed) => pay({ id, date: statement, arrived: landed, payer: "Sample Distro", amount: 50, currency: "USD", status: "received", account: "Revolut", category: "Self-releases" });
  const open = pay({ id: "istatement04", date: "2026-11-01", payer: "Sample Distro", amount: 50, currency: "USD", status: "pending", account: "Statement only", category: "Self-releases" });
  const learned = view([done("idone00001", "2026-08-01", "2026-08-15"), done("idone00002", "2026-09-01", "2026-09-17"), open], [src()]).expected.rows.find((r) => r.id === "istatement04");
  assert.equal(learned.dueFrom, "lag");
  assert.equal(learned.due, "2026-11-16", "14 and 16 days: about 15 days after the statement");
  const set = view([done("idone00001", "2026-08-01", "2026-08-21"), done("idone00002", "2026-09-01", "2026-09-21"), open], [src({ dueDay: 5 })]).expected.rows.find((r) => r.id === "istatement04");
  assert.equal(set.due, "2026-11-05", "the day that was set, not the learned gap");
  assert.match(set.dueNote, /the 5th/);
  assert.match(set.dueNote, /about 20 days after the statement/);
});

test("short, late and missing are flagged from recorded amounts, and a different currency is not short", () => {
  const sources = [src({ dueDay: 5 }), { id: "label", name: "Sample Label", kind: "payer", category: "Label deals", cadence: "monthly", state: "active", match: ["sample label"], dueDay: 3 },
    { id: "pub", name: "Sample Publishing", kind: "payer", category: "Publishing", cadence: "quarterly", state: "active", match: ["sample publishing"], dueDay: 3 },
    { id: "plugin", name: "Plug-in sales", kind: "payer", category: "Other", cadence: "monthly", state: "not_tracked", match: ["plug"] }];
  const short = pay({ id: "istatement05", date: "2026-11-01", payer: "Sample Distro", amount: 110, currency: "USD", status: "pending", account: "Statement only", category: "Self-releases", paidBy: "irevolut0005" });
  const landed = pay({ id: "irevolut0005", date: "2026-11-08", payer: "Sample Distro", amount: 100, currency: "USD", status: "received", account: "Revolut", category: "Self-releases" });
  const otherCur = pay({ id: "istatement06", date: "2026-11-01", payer: "Sample Label", amount: 50, currency: "USD", status: "payable", account: "Statement only", category: "Label deals", paidBy: "irevolut0006" });
  const euros = pay({ id: "irevolut0006", date: "2026-11-04", payer: "Sample Label", amount: 40, currency: "EUR", status: "received", account: "Revolut", category: "Label deals" });
  const got = view([short, landed, otherCur, euros], sources).expected;
  const row = got.rows.find((r) => r.id === "istatement05");
  assert.deepEqual(row.shortBy, { amount: 10, currency: "USD" });
  assert.ok(!row.flags.includes("late"), "it landed, so it is not still late");
  assert.ok(got.rows.find((r) => r.id === "istatement06").flags.includes("short") === false);
  const waiting = view([pay({ id: "istatement07", date: "2026-11-01", payer: "Sample Distro", amount: 10, currency: "USD", status: "statement only", account: "Statement only", category: "Self-releases" })], sources, "2026-11-04").expected;
  assert.deepEqual(waiting.rows[0].flags, [], "before the distro's due day");
  assert.deepEqual(waiting.missing.map((m) => m.source), ["Sample Label"], "the 3rd has passed for Sample Label; the distro has a statement so it is not missing");
  assert.equal(view([], sources, "2026-11-02").expected.missing.length, 0, "the pay day has not passed");
  const missed = view([], sources, TODAY).expected;
  assert.deepEqual(missed.missing.map((m) => m.source), ["Sample Distro", "Sample Label"]);
  assert.match(missed.missing[0].why, /No statement and nothing received/);
  assert.equal(missed.summary.text, "2 missing");
});

test("the journey keeps the days between the steps that were recorded", () => {
  const statement = pay({ id: "istatement08", date: "2026-11-01", payer: "Sample Distro", amount: 80, currency: "USD", status: "received", account: "Wise", category: "Self-releases", arrived: "2026-11-08", movedTo: "irevolut0008",
    history: [{ at: "2026-11-04T15:00:00Z", by: "Ledger", from: "statement only", to: "payable" }] });
  const rev = pay({ id: "irevolut0008", date: "2026-11-10", payer: "Sample Distro", amount: 80, currency: "USD", status: "received", account: "Revolut", category: "Self-releases", from: ["istatement08"] });
  const row = view([statement, rev], [src({ dueDay: 5 })]).expected.rows.find((r) => r.id === "istatement08");
  assert.equal(row.statement.date, "2026-11-01");
  assert.equal(row.payable, "2026-11-04");
  assert.equal(row.paid.date, "2026-11-08");
  assert.equal(row.landed.date, "2026-11-10");
  assert.deepEqual(row.days, { payable: 3, paid: 4, landed: 2 });
  assert.equal(L.expectedJourney(row), "Statement Sun 1 Nov · Payable Wed 4 Nov, 3 days · Paid Sun 8 Nov, 4 days · Landed Tue 10 Nov, 2 days");
  const fresh = view([pay({ id: "istatement09", date: "2026-11-02", payer: "Sample Distro", amount: 5, currency: "USD", status: "statement only", account: "Statement only", category: "Self-releases" })], [src({ dueDay: 20 })]).expected.rows[0];
  assert.match(L.expectedJourney(fresh), /Payable: not there yet · Paid: not there yet · Landed: not there yet/);
  assert.equal(L.expectedFlags(fresh), "Waiting");
  assert.match(L.expectedDue(fresh), /Due Fri 20 Nov/);
});

test("a route's cost is sent minus landed, and a currency change is not enough data with no invented rate", () => {
  const paypal = pay({ id: "ipaypal0001", date: "2026-11-05", payer: "Sample Distro", amount: 104.04, currency: "USD", status: "received", account: "PayPal", category: "Self-releases", movedTo: "irevolut0010" });
  const rev = pay({ id: "irevolut0010", date: "2026-11-06", payer: "Sample Distro", amount: 100, currency: "USD", status: "received", account: "Revolut", category: "Self-releases", from: ["ipaypal0001"] });
  const hop = S.routeCosts([paypal, rev], [src()])[0];
  assert.equal(hop.name, "Sample Distro via PayPal into Revolut");
  assert.deepEqual(hop.fees, { USD: 4.04 });
  assert.equal(hop.mixed, 0);
  assert.equal(S.routeCostText(hop), "Fees: USD 4.04 on 1 payout.");
  const statement = pay({ id: "istatement10", date: "2026-11-01", payer: "Sample Distro", amount: 110, currency: "USD", status: "pending", account: "Statement only", category: "Self-releases", paidBy: "ipaypal0001" });
  const whole = S.routeCosts([statement, paypal, rev], [src()])[0];
  assert.deepEqual(whole.fees, { USD: 10 }, "the statement is what was sent, the Revolut amount is what landed");
  const wise = pay({ id: "iwise000001", date: "2026-10-08", payer: "Northlight Records", amount: 96.4, currency: "EUR", status: "received", account: "Wise", category: "Label deals", source: "northlight", movedTo: "irevolut0011" });
  const fx = pay({ id: "irevolut0011", date: "2026-10-09", payer: "Northlight Records", amount: 100, currency: "USD", status: "received", account: "Revolut", category: "Label deals", source: "northlight", from: ["iwise000001"] });
  const north = { id: "northlight", name: "Northlight Records", kind: "payer", category: "Label deals", cadence: "monthly", state: "active", match: ["northlight"] };
  const mixed = S.routeCosts([wise, fx], [north])[0];
  assert.equal(mixed.mixed, 1);
  assert.deepEqual(mixed.fees, {});
  assert.match(S.routeCostText(mixed), /EUR 96\.40 sent, USD 100\.00 landed/);
  assert.match(S.routeCostText(mixed), /Exchange: not enough data/);
  assert.equal(mixed.rate, undefined);
  assert.doesNotMatch(JSON.stringify(mixed), /0\.9|1\.0[0-9]/, "no rate is worked out");
  const more = pay({ id: "ipaypal0002", date: "2026-11-01", payer: "Sample Distro", amount: 90, currency: "USD", status: "received", account: "PayPal", category: "Self-releases", movedTo: "irevolut0012" });
  const over = pay({ id: "irevolut0012", date: "2026-11-02", payer: "Sample Distro", amount: 100, currency: "USD", status: "received", account: "Revolut", category: "Self-releases", from: ["ipaypal0002"] });
  const extra = S.routeCosts([more, over], [src()])[0];
  /* 18 Nov 2026: landed above what was sent is a wrong pairing, not a negative fee */
  assert.deepEqual(extra.extra, {});
  assert.equal(extra.checkLink, 1);
  assert.match(S.routeCostText(extra), /Check link/);
  assert.doesNotMatch(S.routeCostText(extra), /more than was sent/);
  assert.equal(S.routeCosts([statement], [src()]).length, 0);
  const lines = L.routeLines(mixed);
  assert.ok(lines.some((t) => t === "Exchange: not enough data."));
  assert.ok(lines.some((t) => /EUR 96\.40 sent, USD 100\.00 landed/.test(t)));
});

test("filing the route does not count the money twice, and luke_briefing's problems stay as they were", async () => {
  const d = memoryDesk();
  await S.setSources(d, [
    { id: "paypal", name: "PayPal", kind: "account", cadence: "daily", state: "active" },
    { id: "revolut", name: "Revolut", kind: "account", cadence: "daily", state: "active" },
    { id: "distro", name: "Sample Distro", kind: "payer", category: "Self-releases", cadence: "monthly", state: "active", match: ["sample distro"] },
  ]);
  const statement = (await S.submitIncome(d, NOW, R, { bot: "Ledger", date: "2026-11-02", payer: "Sample Distro", amount: 110, currency: "USD", status: "pending", account: "Statement only", category: "Self-releases" })).entry;
  const paypal = (await S.submitIncome(d, NOW, R, { bot: "Ledger", date: "2026-11-05", payer: "Sample Distro", amount: 104.04, currency: "USD", status: "received", account: "PayPal", category: "Self-releases" })).entry;
  const rev = (await S.submitIncome(d, NOW, R, { bot: "Ledger", date: "2026-11-06", payer: "Sample Distro", amount: 100, currency: "USD", status: "received", account: "Revolut", category: "Self-releases" })).entry;
  await S.fixIncome(d, NOW, R, { by: "Ledger", id: statement.id, month: "2026-11", paid_by: paypal.id, reason: "the PayPal credit paid this statement" });
  await S.linkTransfer(d, NOW, R, { by: "Ledger", revolut_id: rev.id, month: "2026-11", from: [paypal.id] });
  const i = await S.incomeState(d, NOW);
  assert.deepEqual(i.received, { USD: 100 }, "only what landed in Revolut");
  assert.deepEqual(i.pending, {}, "the statement is settled, so it is not pending income");
  assert.equal(i.routes[0].fees.USD, 10);
  assert.ok(!i.problems.some((p) => /Expected money/.test(p)), "the briefing reads problems, which do not grow");
  const brief = await call(d, "luke_briefing", { bot: "Alfred" });
  assert.deepEqual(brief.income_this_month.problems, i.problems);
  assert.equal(brief.expected_money, undefined, "luke_briefing's output does not gain a field");
  const status = await call(d, "income_status", { bot: "Ledger" });
  assert.equal(status.expected_money.short, 0, "18 Nov 2026: the USD 10 gap is the route fee, counted once");
  assert.match(status.payout_routes[0].cost, /Fees: USD 10\.00/);
  assert.match(status.payout_routes[0].cost, /1 payout/);
  const day = await call(d, "my_day", { bot: "Ledger" });
  assert.match(day.expected_money, /nothing to flag/, "18 Nov 2026: the gap is the route fee, so expected money does not also say short");
  assert.match(day.payout_routes, /Do not guess a rate/);
  assert.equal((await call(d, "my_day", { bot: "Atlas" })).expected_money, undefined);
  assert.equal(TOOLS.length, 40, "no new tool: income_status grew fields");
  assert.ok(!TOOLS.some((t) => t.name === "expected_money" || t.name === "payout_routes"));
  assert.match(INSTRUCTIONS, /not enough data/);
  assert.match(TOOLS.find((t) => t.name === "income_status").description, /payout_routes/);
});

test("the sample shows a fee, a route with not enough data, and a missing source, without counting the money twice", () => {
  const inc = sampleBoard(Date.parse("2026-11-11T13:00:00Z")).income;
  assert.equal(inc.received.USD, 520.5);
  const fee = inc.routes.find((r) => r.fees.USD);
  const thin = inc.routes.find((r) => r.mixed);
  assert.equal(fee.fees.USD, 10);
  assert.match(S.routeCostText(thin), /not enough data/i);
  assert.equal(thin.rate, undefined);
  assert.ok(inc.expected.missing.some((m) => m.source === "Sample Label"));
  /* 18 Nov 2026: the sample's USD 10 gap is the PayPal route's fee, not also a short */
  assert.equal(inc.expected.summary.short, 0);
  assert.ok(!inc.problems.some((p) => /Expected money/.test(p)));
  assert.ok(!inc.expected.rows.some((r) => r.shortBy && r.shortBy.amount === 10));
  assert.ok(L.incomeProblems(inc, null).some((p) => p === "Expected money: " + inc.expected.summary.text));
});
