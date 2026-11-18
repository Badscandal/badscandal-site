/* Money links (18 Nov 2026, Ledger and Sheet). Every name and number here is made up.
   Received means it landed in Revolut. A stored amount is never rewritten. HQ does not write a sheet. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";

const TODAY = "2026-11-18";
const NOW = Date.parse("2026-11-18T15:00:00Z");
const R = S.DEFAULT_ROSTER;
const call = (d, name, args) => callTool(TOOLS.find((t) => t.name === name), args, { store: d, now: NOW, role: "bot", hq: async () => null });
const pay = (over) => ({ history: [], reference: "", period: "", source: "", note: "", by: "Ledger", at: "2026-11-01T15:00:00Z", category: "Other", ...over });
const src = (id, name, match) => ({ id, name, kind: "payer", category: "Other", currency: "EUR", lands: "", cadence: "monthly", owner: "Ledger", state: "active", match: match || [name.toLowerCase()], how: "", blocker: "", needsLuke: "" });

test("a route sums every link of one transfer, and the fee is what was left", () => {
  const a = pay({ id: "iwise00000a", date: "2026-10-20", payer: "Harbour Audio", amount: 100, currency: "EUR", status: "received", account: "Wise", movedTo: "irev0000001" });
  const b = pay({ id: "iwise00000b", date: "2026-10-20", payer: "Harbour Audio", amount: 50, currency: "EUR", status: "received", account: "Wise", movedTo: "irev0000001" });
  const c = pay({ id: "iwise00000c", date: "2026-10-20", payer: "Harbour Audio", amount: 30, currency: "EUR", status: "received", account: "Wise", movedTo: "irev0000001" });
  const rev = pay({ id: "irev0000001", date: "2026-10-21", payer: "Harbour Audio", amount: 100, currency: "EUR", status: "received", account: "Revolut", from: ["iwise00000a"] });
  const stmt = pay({ id: "istmt000001", date: "2026-10-01", payer: "Harbour Audio", amount: 180.4, currency: "EUR", status: "pending", account: "Statement only", paidBy: "iwise00000a" });
  const route = S.routeCosts([a, b, c, rev, stmt], [src("harbour", "Harbour Audio")])[0];
  assert.equal(route.fees.EUR, 0.4, "100 + 50 + 30 against 180.40, not 180.40 against the first link");
});

test("both months are shown and neither is chosen", () => {
  const row = S.payOut(pay({ id: "irevmonth01", date: "2026-09-30", arrived: "2026-11-16", payer: "Kind Co", amount: 40, currency: "USD", status: "received", account: "Revolut" }));
  assert.equal(row.statement_month, "2026-09");
  assert.equal(row.landed_month, "2026-11");
  assert.equal(row.counts_in, "2026-11");
  assert.match(row.counts_note, /landed in Revolut/);
});

test("Wise money is not received, and payments, month_check and income_status agree", async () => {
  const d = memoryDesk();
  await S.setSources(d, [
    { id: "wise", name: "Wise", kind: "account", cadence: "daily", state: "active" },
    { id: "revolut", name: "Revolut", kind: "account", cadence: "daily", state: "active" },
    src("harbour", "Harbour Audio"),
  ]);
  await S.submitIncome(d, NOW, R, { bot: "Ledger", date: "2026-11-04", payer: "Harbour Audio", amount: "80.00", currency: "EUR", status: "received", account: "Wise", category: "Other" });
  const rev = await S.submitIncome(d, NOW, R, { bot: "Ledger", date: "2026-11-05", payer: "Other Studio", amount: "20.00", currency: "EUR", status: "received", account: "Revolut", category: "Other" });
  const listed = await call(d, "payments", { bot: "Ledger", month: "2026-11" });
  const status = await call(d, "income_status", { bot: "Ledger" });
  const check = await call(d, "month_check", { bot: "Ledger", month: "2026-11" });
  assert.equal(listed.received, "EUR 20.00");
  assert.equal(status.received_this_month, "EUR 20.00");
  assert.equal(check.received, "EUR 20.00");
  assert.equal(listed.payments.find((p) => p.account === "Wise").status, "waiting in Wise");
  assert.equal(listed.payments.find((p) => p.id === rev.entry.id).counted, true);
  assert.match(listed.received_note, /Revolut only/);
  assert.equal(listed.writes_to_sheet, false);
  const wise = status.sources.find((s) => s.id === "harbour");
  assert.match(wise.this_month, /not received/);
  assert.doesNotMatch(wise.last_payment, /\(received\)/);
});

test("received this year says Revolut only", async () => {
  const d = memoryDesk();
  await S.setSources(d, [{ id: "revolut", name: "Revolut", kind: "account", cadence: "daily", state: "active" }, src("harbour", "Harbour Audio")]);
  await S.submitIncome(d, NOW, R, { bot: "Ledger", date: "2026-02-02", payer: "Harbour Audio", amount: "15.00", currency: "GBP", status: "received", account: "Revolut", category: "Other" });
  const status = await call(d, "income_status", { bot: "Ledger" });
  assert.match(status.received_this_year_note, /^Revolut only/);
  assert.match(status.received_this_year, /GBP 15\.00/);
});

test("a gap with no source is short and unexplained, never a fee", () => {
  const stmt = pay({ id: "istmtkind01", date: "2026-11-02", payer: "Kind Co", amount: 120, currency: "USD", status: "statement only", account: "Statement only", paidBy: "irevkind0001" });
  const rev = pay({ id: "irevkind0001", date: "2026-11-16", payer: "Kind Co", amount: 100, currency: "USD", status: "received", account: "Revolut" });
  const got = S.moneyExpectations([stmt, rev], [], TODAY);
  const row = got.expected.rows.find((r) => r.id === "istmtkind01");
  assert.equal(row.shortReason, "unexplained");
  assert.deepEqual(row.shortBy, { amount: 20, currency: "USD" });
  assert.deepEqual(got.routes[0].fees, {});
  assert.doesNotMatch(S.routeCostText(got.routes[0]), /Fees/);
});

test("a conversion stores the Revolut rate and where it came from, or says not enough data", () => {
  const wise = pay({ id: "iwisefx0001", date: "2026-11-15", payer: "Kind Co", amount: 80, currency: "USD", status: "received", account: "Wise", source: "kind", movedTo: "irevfx00001" });
  const rev = pay({ id: "irevfx00001", date: "2026-11-16", payer: "Kind Co", amount: 70, currency: "EUR", status: "received", account: "Revolut", source: "kind", from: ["iwisefx0001"] });
  const bare = S.routeCosts([wise, rev], [src("kind", "Kind Co")])[0];
  assert.equal(bare.rate, undefined);
  assert.match(S.routeCostText(bare), /not enough data/);
  const fx = pay({ id: "irevfxrow01", date: "2026-11-16", payer: "Exchanged to EUR", amount: 70, currency: "EUR", status: "transfer", account: "Revolut", note: "Exchanged to EUR" });
  const rated = S.routeCosts([wise, rev, fx], [src("kind", "Kind Co")])[0];
  assert.equal(rated.rate.source, "Revolut exchange row");
  assert.equal(rated.rate.from, "USD");
  assert.equal(rated.rate.to, "EUR");
  assert.equal(rated.rate.value, 0.88);
  assert.match(S.routeCostText(rated), /from Revolut exchange row/);
});

test("a landed statement shows received, and a settled statement says settled in both lists", async () => {
  const stmt = pay({ id: "istmtland01", date: "2026-11-02", payer: "Bright Records", amount: 40, currency: "USD", status: "statement only", account: "Statement only", paidBy: "irevland0001" });
  const rev = pay({ id: "irevland0001", date: "2026-11-09", payer: "Bright Records", amount: 40, currency: "USD", status: "received", account: "Revolut" });
  const row = S.moneyExpectations([stmt, rev], [src("bright", "Bright Records")], TODAY).expected.rows[0];
  assert.equal(row.status, "received");
  assert.notEqual(row.payableState, "not_yet");
  const d = memoryDesk();
  const owed = await S.submitIncome(d, NOW, R, { bot: "Ledger", date: "2026-11-02", payer: "Bright Records", amount: "50", currency: "USD", status: "payable", account: "Statement only", category: "Other" });
  const got = await S.submitIncome(d, NOW + 1000, R, { bot: "Ledger", date: "2026-11-04", payer: "Bright Records", amount: "40", currency: "USD", status: "received", account: "Revolut", category: "Other" });
  await S.fixIncome(d, NOW + 2000, R, { by: "Ledger", id: owed.entry.id, month: "2026-11", paid_by: got.entry.id, reason: "the Revolut credit paid it" });
  const status = await call(d, "income_status", { bot: "Ledger" });
  const listed = await call(d, "payments", { bot: "Ledger", month: "2026-11" });
  assert.match(status.newest_payments.find((line) => line.includes(owed.entry.id)), /settled/);
  assert.equal(listed.payments.find((p) => p.id === owed.entry.id).status, "settled");
});

test("a card last-four and a top-up reference are stripped from every shown field", () => {
  assert.match(S.hidePrivate("card *4242 top-up reference TU-99881"), /\[hidden\]/);
  assert.doesNotMatch(S.hidePrivate("card *4242 top-up reference TU-99881"), /4242|TU-99881/);
  assert.equal(S.hidePrivate("the song is 4 minutes"), "the song is 4 minutes");
  const shown = S.payOut(pay({ id: "iopen000001", date: "2026-11-03", payer: "Open Span *4242", amount: 5, currency: "EUR", status: "received", account: "Revolut", note: "top-up reference TU-99881" }));
  assert.doesNotMatch(shown.payer + shown.note, /4242|TU-99881/);
});

test("the newer landing is the last payment, Create Music is the name, and a blank lands is filled from the one account", () => {
  const sources = [src("north", "Northwind", ["northwind"]), src("stream", "StreamCo", ["streamco"]), { ...src("bright", "Tipalti eCheck", ["tipalti"]), lands: "" }, { ...src("kind", "Kind Co"), lands: "" }];
  const old = pay({ id: "ioldusd0001", date: "2026-08-01", payer: "Northwind", amount: 9, currency: "USD", status: "received", account: "Wise", source: "north" });
  const rev = pay({ id: "irevnewer01", date: "2026-11-10", payer: "Northwind", amount: 30, currency: "EUR", status: "received", account: "Revolut", source: "north" });
  const kind = pay({ id: "irevkindac1", date: "2026-11-04", payer: "Kind Co", amount: 12, currency: "EUR", status: "received", account: "Revolut", source: "kind" });
  const report = S.incomeReport([old, rev, kind], [], sources, TODAY);
  const north = report.sources.find((s) => s.id === "north");
  assert.equal(north.last.date, "2026-11-10");
  assert.equal(north.last.status, "received");
  const kindRow = report.sources.find((s) => s.id === "kind");
  assert.equal(kindRow.lands, "Revolut");
  assert.equal(S.displayPayer(pay({ payer: "Tipalti eCheck", source: "bright", note: "Create" })), "Create Music");
});

test("a combined Revolut credit is split by the linked parts and counted once", () => {
  const sources = [src("north", "Northwind", ["northwind"]), src("stream", "StreamCo", ["streamco"])];
  const north = pay({ id: "inorth00001", date: "2026-10-28", payer: "Northwind", amount: 60, currency: "EUR", status: "received", account: "Wise", source: "north", movedTo: "irevcombo01" });
  const stream = pay({ id: "istream0001", date: "2026-10-28", payer: "StreamCo", amount: 40, currency: "EUR", status: "received", account: "PayPal", source: "stream", movedTo: "irevcombo01" });
  const rev = pay({ id: "irevcombo01", date: "2026-10-30", payer: "Northwind", amount: 100, currency: "EUR", status: "received", account: "Revolut", source: "north", from: ["inorth00001", "istream0001"] });
  const report = S.incomeReport([north, stream, rev], [], sources, "2026-11-18");
  assert.deepEqual(report.receivedByMonth["2026-10"], { EUR: 100 });
  assert.equal(report.sources.find((s) => s.id === "north").last.amount, 60);
  assert.equal(report.sources.find((s) => s.id === "stream").last.amount, 40);
});

test("a pay day is learned from this source's Revolut landings, not the other account", () => {
  const sources = [src("admin", "Sample Distro", ["sample distro"]), src("one", "Sample Distro one", ["sample distro one"])];
  const wise = (id, date) => pay({ id, date, payer: "Sample Distro", amount: 10, currency: "EUR", status: "received", account: "Wise" });
  const rev = (id, date) => pay({ id, date, payer: "Sample Distro one", amount: 10, currency: "EUR", status: "received", account: "Revolut" });
  const open = pay({ id: "istmtone001", date: "2026-11-01", payer: "Sample Distro one", amount: 10, currency: "EUR", status: "pending", account: "Statement only" });
  const got = S.moneyExpectations([
    wise("iwiseadmin1", "2026-08-03"), wise("iwiseadmin2", "2026-09-03"), wise("iwiseadmin3", "2026-10-03"),
    rev("irevone0001", "2026-08-15"), rev("irevone0002", "2026-09-15"), rev("irevone0003", "2026-10-15"), open,
  ], sources, TODAY);
  const one = got.expected.learned.find((x) => x.source === "Sample Distro one");
  assert.equal(one.day, 15);
  assert.equal(got.expected.rows.find((r) => r.id === "istmtone001").due, "2026-11-15");
  assert.equal(got.expected.learned.find((x) => x.source === "Sample Distro"), undefined, "the other account's Wise rows do not teach a day");
});

test("link suggestions include a sum inside two days and do not link anything", async () => {
  const d = memoryDesk();
  await S.setSources(d, [
    { id: "wise", name: "Wise", kind: "account", cadence: "daily", state: "active" },
    { id: "revolut", name: "Revolut", kind: "account", cadence: "daily", state: "active" },
  ]);
  const a = await S.submitIncome(d, NOW, R, { bot: "Ledger", date: "2026-11-14", payer: "Harbour Audio", amount: "30.00", currency: "EUR", status: "received", account: "Wise", category: "Other" });
  const b = await S.submitIncome(d, NOW + 1000, R, { bot: "Ledger", date: "2026-11-14", payer: "Harbour Audio", amount: "20.00", currency: "EUR", status: "received", account: "Wise", category: "Other" });
  await S.submitIncome(d, NOW + 2000, R, { bot: "Ledger", date: "2026-11-15", payer: "Harbour Audio", amount: "50.00", currency: "EUR", status: "received", account: "Revolut", category: "Other" });
  const before = (await S.monthCheck(d, NOW, { month: "2026-11" })).suggestions;
  assert.ok(before.some((s) => s.ids.includes(a.entry.id) && s.ids.includes(b.entry.id)));
  assert.match(before[0].confirm, /link_transfer/);
  const after = await S.monthCheck(d, NOW, { month: "2026-11" });
  assert.equal(after.waiting.length, 2, "nothing was linked");
});

test("an unconfirmed split says rule pending, and a confirmed one does not invent a percentage", () => {
  const sources = [src("north", "Northwind", ["northwind"]), src("stream", "StreamCo", ["streamco"])];
  const north = pay({ id: "inorth00002", date: "2026-11-01", payer: "Northwind", amount: 60, currency: "EUR", status: "received", account: "Wise", source: "north", movedTo: "irevsplit001" });
  const stream = pay({ id: "istream0002", date: "2026-11-01", payer: "StreamCo", amount: 40, currency: "EUR", status: "received", account: "PayPal", source: "stream", movedTo: "irevsplit001" });
  const rev = pay({ id: "irevsplit001", date: "2026-11-02", payer: "Northwind", amount: 100, currency: "EUR", status: "received", account: "Revolut", from: ["inorth00002", "istream0002"] });
  const open = S.routeCosts([north, stream, rev], sources, [])[0];
  assert.equal(open.split, "rule pending");
  assert.match(S.routeCostText(open), /rule pending/);
  assert.doesNotMatch(JSON.stringify(open), /%|percent/i);
  const closed = S.routeCosts([north, stream, rev], sources, [
    { source: "north", confirmed_by: "Luke", date: "2026-11-01" },
    { source: "stream", confirmed_by: "Luke", date: "2026-11-01" },
  ])[0];
  assert.equal(closed.split, "confirmed");
  assert.doesNotMatch(S.routeCostText(closed), /rule pending|%/);
});

test("the counted export and changed_since are read-only", async () => {
  const d = memoryDesk();
  const rev = await S.submitIncome(d, NOW, R, { bot: "Ledger", date: "2026-11-06", payer: "Harbour Audio", amount: "20.00", currency: "EUR", status: "received", account: "Revolut", category: "Other", note: "https://example.com/evidence" });
  const all = await call(d, "payments", { bot: "Ledger", month: "2026-11" });
  const row = all.counted.find((r) => r.id === rev.entry.id);
  assert.equal(row.landing_date, "2026-11-06");
  assert.equal(row.evidence, "https://example.com/evidence");
  assert.equal(row.ledger_month, "2026-11");
  assert.equal(row.landed_month, "2026-11");
  assert.equal(all.writes_to_sheet, false);
  const none = await call(d, "payments", { bot: "Ledger", month: "2026-11", changed_since: "2026-12-01T00:00:00Z" });
  assert.equal(none.total, 0);
  assert.equal(TOOLS.length, 47); /* account_health, needs_you, song_pl (18 Nov 2026 night test) + profile_jobs, profile_master, profile_rework, profile_uploaded (PR #87) */
});

test("read_guide names the money words added on 18 Nov", async () => {
  const d = memoryDesk();
  const g = await call(d, "read_guide", { bot: "Ledger" });
  for (const word of ["paid_by", "settled", "moved to Revolut", "expected_money", "payout_routes", "Exchange and fees", "rule pending", "evidence"]) {
    assert.match(g, new RegExp(word), word);
  }
  assert.match(g, /never writes to the Google Sheet/);
});
