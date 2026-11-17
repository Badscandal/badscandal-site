/* The bots' feedback, batch 4 (15 Nov 2026): money.
   - the ad spend total drifted (473.40, 473.47, 473.83 in one day) because EUR was converted at a live
     average: ONE figure, worked out here with the sheet's FIXED monthly rate (Rates!B1), saying which rate
     it used and which reads are missing, and "estimated" on its own when anything is missing.
   - log_growth: one call writes the day's numbers, works out the change, skips duplicates, marks the duty
     done, and lets a later call fill in a field that wasn't reported.
   - "done with gaps": one unreadable number no longer turns a whole duty red.
   - record_spend for Forge: a day's spend per platform, answered with the month so far against the cap.
   - income sources the owning bot edits (several accounts each), so Ledger's old "needs Luke" asks clear.
   - a bot fixes a payment it already submitted; "statement only" and "payable"; a total without salary. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, INSTRUCTIONS } from "../netlify/lib/staff-tools.mjs";
import { hqModel, fixedRate, dutiesReport } from "../netlify/lib/hq.mjs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const NOW = Date.parse("2026-11-15T15:00:00Z"); /* Sun 15 Nov, 12:00 in São Paulo */
const TODAY = "2026-11-15";
const DAY = 86400000;
const R = S.DEFAULT_ROSTER;
const fails = (p, re) => assert.rejects(p, (e) => e.name === "StaffError" && re.test(e.message));
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, o = {}) => callTool(tool(name), args, { store: d, now: o.now || NOW, role: o.role || "bot", hq: o.hq || (async () => null) });

/* the sheet as rows (header first), the way the site reads it */
const FX = { "2026-11": { USD: 1.2 } }; /* ECB: 1.20 USD per EUR (made up) */
const SPEND = [["date", "platform", "campaign", "spend", "currency"],
  ["2026-11-11", "Meta", "ALL", "300", "USD"], ["2026-11-12", "Google", "Search", "100", "EUR"], ["2026-11-12", "TikTok", "Spark", "50", "EUR"]];
const RATES = [["EUR to USD, November (fixed)", "1.10"]];
const sheets = (extra = {}) => ({ Spend: SPEND, Rates: RATES, ...extra });

/* ---------- 1. one ad spend figure ---------- */
test("the cap uses the sheet's fixed rate (Rates!B1), says so, and is not an estimate when nothing is missing", () => {
  assert.deepEqual(fixedRate(RATES), { rate: 1.1, label: "EUR to USD, November (fixed)", from: "Rates!B1" });
  const cap = hqModel(sheets(), TODAY, FX).money.cap;
  assert.equal(cap.spent, 465, "300 USD + (100 + 50) EUR x 1.10");
  assert.deepEqual(cap.rateUsed, { value: 1.1, from: "Rates!B1", label: "EUR to USD, November (fixed)", month: "2026-11" });
  assert.deepEqual(cap.notRead, []);
  assert.equal(cap.estimated, false);
  assert.deepEqual(cap.estimatedWhy, []);
  /* the same answer whatever the day's live average does: the drift is gone */
  assert.equal(hqModel(sheets(), TODAY, { "2026-11": { USD: 1.31 } }).money.cap.spent, 465);
});

test("without a usable fixed rate: the month's average, and the figure is marked estimated with the reason", () => {
  const none = hqModel({ Spend: SPEND }, TODAY, FX).money.cap;
  assert.equal(none.spent, 480);
  assert.deepEqual([none.rateUsed.from, none.rateUsed.value, none.estimated], ["ECB average", 1.2, true]);
  assert.match(none.estimatedWhy.join(" "), /no fixed rate in the sheet's Rates tab/i);
  /* a number that can't be USD per EUR is not used */
  assert.match(fixedRate([["rate", "0.52"]]).error, /doesn't look like USD per 1 EUR/);
  assert.match(fixedRate([["rate", "#REF!"]]).error, /Rates!B1/);
  assert.match(fixedRate(undefined).error, /no Rates tab/i);
  const odd = hqModel(sheets({ Rates: [["rate", "0.52"]] }), TODAY, FX).money.cap;
  assert.deepEqual([odd.spent, odd.rateUsed.from, odd.estimated], [480, "ECB average", true]);
  /* a cap in USD only needs no rate at all */
  const usd = hqModel({ Spend: SPEND.slice(0, 2) }, TODAY, FX).money.cap;
  assert.deepEqual([usd.spent, usd.estimated, usd.rateUsed], [300, false, null]);
});

test("missing reads are listed and make the figure estimated: a 'not read' sheet row, or Forge's not_read", async () => {
  const withGap = hqModel(sheets({ Spend: SPEND.concat([["2026-11-13", "TikTok", "Spark", "not read", "EUR"]]) }), TODAY, FX).money.cap;
  assert.deepEqual(withGap.notRead, ["TikTok Fri 13 Nov"]);
  assert.equal(withGap.estimated, true);
  assert.match(withGap.estimatedWhy.join(" "), /1 read missing/);
  /* the desk: Forge's numbers replace the sheet's for that platform and day; a not_read says why */
  const d = memoryDesk();
  await S.recordSpend(d, NOW, R, { by: "Forge", platform: "Google", account: "Google Ads", date: "2026-11-12", amount: "120", currency: "EUR" });
  await S.recordSpend(d, NOW, R, { by: "Forge", platform: "TikTok", account: "TikTok Ads", date: "2026-11-13", not_read: "signed out" });
  const cap = hqModel(sheets(), TODAY, FX, undefined, "", { spend: await S.listSpend(d, NOW) }).money.cap;
  assert.equal(cap.spent, 487, "300 USD + (120 + 50) EUR x 1.10: the desk's 120 replaces the sheet's 100, never added to it");
  assert.deepEqual(cap.notRead, ["TikTok Fri 13 Nov: signed out"]);
  assert.equal(cap.estimated, true);
  /* once the number is read, the gap closes */
  await S.recordSpend(d, NOW + 1, R, { by: "Forge", platform: "TikTok", account: "TikTok Ads", date: "2026-11-13", amount: "10", currency: "EUR" });
  const cap2 = hqModel(sheets(), TODAY, FX, undefined, "", { spend: await S.listSpend(d, NOW) }).money.cap;
  assert.deepEqual([cap2.spent, cap2.notRead, cap2.estimated], [498, [], false]);
  /* HQ's words */
  assert.equal(L.capRateLine(cap), "Rate: 1.1 USD per EUR (Rates!B1, Nov 2026)");
  assert.equal(L.capRateLine(hqModel({ Spend: SPEND }, TODAY, FX).money.cap), "Rate: 1.2 USD per EUR (ECB average for Nov 2026, so far)");
  assert.equal(L.capMissingLine(cap), "Not read: TikTok Fri 13 Nov: signed out");
});

/* ---------- 4. record_spend ---------- */
test("record_spend: Forge's day per platform, once; the answer is the month so far against the cap", async () => {
  const d = memoryDesk();
  const hq = async () => hqModel(sheets(), TODAY, FX, undefined, "", { spend: await S.listSpend(d, NOW) });
  const r = await call(d, "record_spend", { bot: "Forge", platform: "Google", account: "Google Ads", date: "2026-11-14", amount: "20", currency: "EUR" }, { hq });
  assert.equal(r.saved, true);
  assert.deepEqual(r.month_to_date, { spent: "USD 487.00", cap: "USD 1000", left: "USD 513.00", status: "ok", rate: "1.1 USD per EUR (Rates!B1)", not_read: [], estimated: false });
  const again = await call(d, "record_spend", { bot: "Forge", platform: "Google", account: "Google Ads", date: "2026-11-14", amount: "20", currency: "EUR" }, { hq });
  assert.equal(again.duplicate, true);
  const fixed = await call(d, "record_spend", { bot: "Forge", platform: "google", account: "Google Ads", date: "2026-11-14", amount: "22.5", currency: "EUR" }, { hq });
  assert.equal(fixed.updated, true);
  assert.equal((await S.listSpend(d, NOW)).filter((x) => x.platform === "Google").length, 1);
  assert.equal((await S.listSpend(d, NOW))[0].was, 20);
  await fails(S.recordSpend(d, NOW, R, { by: "Kevin", platform: "TikTok", account: "x", date: "2026-11-14", amount: "1", currency: "EUR" }), /Forge/);
  await fails(S.recordSpend(d, NOW, R, { by: "Forge", platform: "Snapchat", account: "x", date: "2026-11-14", amount: "1", currency: "EUR" }), /Meta, Google or TikTok/);
  await fails(S.recordSpend(d, NOW, R, { by: "Forge", platform: "TikTok", account: "x", date: "2026-11-16", amount: "1", currency: "EUR" }), /future/);
  await fails(S.recordSpend(d, NOW, R, { by: "Forge", platform: "TikTok", account: "x", date: "2026-11-14", amount: "1.234", currency: "EUR" }), /amount/);
  await fails(S.recordSpend(d, NOW, R, { by: "Forge", platform: "TikTok", account: "x", date: "2026-11-14", currency: "EUR" }), /amount or not_read/);
  await fails(S.recordSpend(d, NOW, R, { by: "Forge", platform: "TikTok", account: "x", date: "2026-11-14", amount: "1", currency: "euros" }), /three-letter/);
  /* a paused day is a real 0, not a missing read */
  assert.equal((await S.recordSpend(d, NOW, R, { by: "Forge", platform: "TikTok", account: "TikTok Ads", date: "2026-11-14", amount: "0", currency: "EUR" })).entry.amount, 0);
  /* the sheet unread: said so, never a made-up total */
  assert.equal((await call(d, "record_spend", { bot: "Forge", platform: "Meta", account: "Meta", date: "2026-11-14", amount: "5", currency: "USD" })).month_to_date, "not read just now: the team's sheet could not be read");
});

/* ---------- 3. done with gaps ---------- */
test("done with gaps: the duty is done (not red), and says what could not be read", async () => {
  const d = memoryDesk();
  await call(d, "post_update", { bot: "Kevin", status: "done", message: "TikTok growth logged: 1,240 followers", duty: "D-kevin-growth", gaps: "views: TikTok shows them a day late" });
  const ov = S.dutyOverlay(await S.listUpdates(d, NOW), TODAY);
  const tasks = [{ id: "D-kevin-growth", owner: "Kevin", task: "Log TikTok growth", deadline: TODAY + " 10:00", status: "", blocker: "" }];
  const rep = dutiesReport(tasks, TODAY, "11:00", ov);
  const it = rep.byOwner[0].items[0];
  assert.deepEqual([it.status, it.gaps, it.late, rep.done, rep.blocked], ["done", "views: TikTok shows them a day late", false, 1, 0]);
  /* the sheet's own "done with gaps" counts as done too */
  const sheetSaid = dutiesReport([{ ...tasks[0], status: "done with gaps", blocker: "views not shown yet" }], TODAY, "11:00", null).byOwner[0].items[0];
  assert.deepEqual([sheetSaid.status, sheetSaid.gaps], ["done", "views not shown yet"]);
  assert.equal(L.dutyGapsLine(it), "Done, with gaps: views: TikTok shows them a day late");
  assert.equal(tool("post_update").inputSchema.properties.gaps.type, "string");
  await fails(S.postUpdate(d, NOW, R, { bot: "Kevin", status: "blocked", message: "stuck here", gaps: "views" }), /only with status done/);
});

/* ---------- 2. log_growth ---------- */
test("log_growth: the day's numbers, the change worked out, the duty marked done (with gaps), duplicates skipped", async () => {
  const d = memoryDesk();
  const first = await call(d, "log_growth", { bot: "Kevin", date: "2026-11-13", platform: "TikTok", account: "@badscandal", followers: "1200", views: "5400" }, { now: NOW - 2 * DAY });
  assert.equal(first.saved, true);
  const r = await call(d, "log_growth", { bot: "Kevin", date: "2026-11-14", platform: "TikTok", account: "@badscandal", followers: "1,240", duty: "D-kevin-growth", gaps: { views: "TikTok shows views a day late" } });
  assert.deepEqual([r.saved, r.change, r.duty], [true, 40, "done, with gaps"]);
  const rows = await S.listGrowth(d, NOW);
  const row = rows.find((x) => x.date === "2026-11-14");
  assert.deepEqual([row.kind, row.platform, row.followers, row.change, row.views, row.gaps], ["growth", "TikTok", 1240, 40, null, { views: "TikTok shows views a day late" }]);
  /* the duty: done, with its gap, through the same live log as post_update */
  const u = (await S.listUpdates(d, NOW)).find((x) => x.bot === "Kevin");
  assert.deepEqual([u.status, u.duty, u.gaps], ["done", "D-kevin-growth", "views: TikTok shows views a day late"]);
  assert.match(u.message, /TikTok 14 Nov: 1,240 followers \(\+40\)/);
  /* the same numbers again: nothing new */
  const dup = await call(d, "log_growth", { bot: "Kevin", date: "2026-11-14", platform: "TikTok", account: "@badscandal", followers: "1240" });
  assert.equal(dup.duplicate, true);
  /* a later call fills the field that was missing, and the gap closes */
  const fill = await call(d, "log_growth", { bot: "Kevin", date: "2026-11-14", platform: "TikTok", account: "@badscandal", views: "6100" }, { now: NOW + DAY });
  assert.deepEqual([fill.saved, fill.filled], [true, ["views"]]);
  const row2 = (await S.listGrowth(d, NOW + DAY)).find((x) => x.date === "2026-11-14");
  assert.deepEqual([row2.views, row2.followers, row2.gaps], [6100, 1240, {}]);
  /* HQ: the desk's rows join the sheet's Growth tab (newer day from the desk; the sheet's own day kept) */
  const g = hqModel({ Growth: [["date", "platform", "account", "followers", "change", "views"], ["2026-11-12", "TikTok", "@badscandal", "1180", "", "4000"]] }, TODAY, {}, undefined, "", { growth: await S.listGrowth(d, NOW + DAY) }).growth;
  const tt = g.find((p) => p.platform === "TikTok");
  assert.deepEqual([tt.followers, tt.lastDay, tt.day], [1240, "2026-11-14", 40]);
});

test("log_growth for songs (Atlas); who may log; numbers are never guessed", async () => {
  const d = memoryDesk();
  const s = await call(d, "log_growth", { bot: "Atlas", date: "2026-11-14", song: "Touch Me", streams: "3540", listeners: "2100", gaps: { saves: "not shown for this song yet" } });
  assert.equal(s.saved, true);
  const row = (await S.listGrowth(d, NOW)).find((x) => x.kind === "song");
  assert.deepEqual([row.song, row.streams, row.listeners, row.saves], ["Touch Me", 3540, 2100, null]);
  const songs = hqModel({ Songs: [["date", "song", "spotify_streams"], ["2026-11-13", "Touch Me", "3400"]] }, TODAY, {}, undefined, "", { growth: await S.listGrowth(d, NOW) }).songs;
  assert.deepEqual([songs[0].lastDay, songs[0].streams, songs[0].dayChange], ["2026-11-14", 3540, 140]);
  await fails(S.logGrowth(d, NOW, R, { by: "Drop", date: "2026-11-14", platform: "TikTok", followers: "1" }), /Steve, Atlas, Kevin or Laura/);
  await fails(S.logGrowth(d, NOW, R, { by: "Kevin", date: "2026-11-14", platform: "TikTok", followers: "about 1k" }), /followers must be a number/);
  await fails(S.logGrowth(d, NOW, R, { by: "Kevin", date: "2026-11-14", platform: "TikTok" }), /no numbers/i);
  await fails(S.logGrowth(d, NOW, R, { by: "Kevin", date: "2026-11-14", platform: "TikTok", song: "Touch Me", followers: "1" }), /platform OR song/);
  await fails(S.logGrowth(d, NOW, R, { by: "Kevin", date: "2026-11-16", platform: "TikTok", followers: "1" }), /future/);
});

/* ---------- 5. owner-editable income sources ---------- */
const SOURCES = [{ id: "tipalti", name: "Tipalti", kind: "payer", category: "Self-releases", currency: "USD", lands: "PayPal", owner: "Ledger", state: "blocked", blocker: "Needs Luke's login code", needsLuke: "Send the Tipalti login code" },
  { id: "routenote", name: "RouteNote", kind: "payer", category: "Self-releases", currency: "USD", lands: "PayPal", owner: "Ledger", state: "active" }];
test("income_source: the owning bot says where the money lands (several accounts), its state and why; a re-seed keeps it", async () => {
  const d = memoryDesk();
  await S.setSources(d, SOURCES);
  const r = await call(d, "income_source", { bot: "Ledger", source: "Tipalti", state: "active", reason: "", needs_luke: "", accounts: ["PayPal", "Wise"], category: "Self-releases" });
  assert.equal(r.saved, true);
  const src = (await S.getSources(d)).find((s) => s.id === "tipalti");
  assert.deepEqual([src.state, src.blocker, src.needsLuke, src.accounts, src.lands, src.editedBy], ["active", "", "", ["PayPal", "Wise"], "PayPal + Wise", "Ledger"]);
  /* RouteNote has two accounts */
  await call(d, "income_source", { bot: "Sheet", source: "routenote", accounts: ["PayPal (badscandal)", "PayPal (badscandaladmin)"] });
  assert.equal((await S.getSources(d)).find((s) => s.id === "routenote").lands, "PayPal (badscandal) + PayPal (badscandaladmin)");
  /* the old "needs Luke" ask is gone from what everyone reads */
  const st = await call(d, "income_status", { bot: "Nova" });
  assert.equal(st.sources.find((s) => s.name === "Tipalti").needs_luke, undefined);
  /* the private seed loaded again: the bots' edits stay on top */
  await S.setSources(d, SOURCES);
  assert.equal((await S.getSources(d)).find((s) => s.id === "tipalti").state, "active");
  await fails(S.editSource(d, NOW, R, { by: "Kevin", source: "tipalti", state: "active" }), /Ledger/);
  await fails(S.editSource(d, NOW, R, { by: "Ledger", source: "nope", state: "active" }), /no income source called "nope"/);
  await fails(S.editSource(d, NOW, R, { by: "Ledger", source: "tipalti", state: "fine" }), /state must be one of/);
  await fails(S.editSource(d, NOW, R, { by: "Ledger", source: "tipalti", state: "blocked" }), /reason/);
});

/* ---------- 6 + 7 + 8. a payment fixed; statement only and payable; royalties without salary ---------- */
test("fix_payment: the bot that submitted it (or a sorter) fixes it, with the reason kept", async () => {
  const d = memoryDesk();
  const sub = await S.submitIncome(d, NOW, R, { bot: "Ledger", date: "2026-11-10", payer: "Sample Music Group", amount: "473.07", currency: "USD", status: "transfer", account: "PayPal" });
  const r = await call(d, "fix_payment", { bot: "Ledger", id: sub.entry.id, month: "2026-11", status: "received", category: "Label deals", reason: "It is royalties from the label, not a transfer" });
  assert.deepEqual([r.saved, r.fixed], [true, ["status", "category"]]);
  const e = (await S.incomeState(d, NOW)).entries.find((x) => x.id === sub.entry.id);
  assert.deepEqual([e.status, e.category, e.fixes[0].by, e.fixes[0].reason], ["received", "Label deals", "Ledger", "It is royalties from the label, not a transfer"]);
  assert.deepEqual(e.fixes[0].changed, { status: ["transfer", "received"], category: ["Other", "Label deals"] });
  assert.deepEqual((await S.incomeState(d, NOW)).received, { USD: 473.07 });
  await fails(S.fixIncome(d, NOW, R, { by: "Kevin", id: sub.entry.id, month: "2026-11", amount: "1", reason: "x is wrong" }), /Ledger/);
  await fails(S.fixIncome(d, NOW, R, { by: "Ledger", id: sub.entry.id, month: "2026-11", date: "2026-10-30", reason: "wrong month" }), /same month/);
  await fails(S.fixIncome(d, NOW, R, { by: "Ledger", id: sub.entry.id, month: "2026-11", amount: "500" }), /reason/);
  await fails(S.fixIncome(d, NOW, R, { by: "Ledger", id: "i0000000000000", month: "2026-11", amount: "500", reason: "typo" }), /no payment/);
  /* the bot sees its own payments, with the id and month to fix them */
  const st = await call(d, "income_status", { bot: "Ledger" });
  assert.deepEqual(st.your_payments[0].id, sub.entry.id);
  assert.equal(st.your_payments[0].month, "2026-11");
});

test("statement only and payable: owed money is payable, a statement below the payout line counts nowhere yet; royalties leave out salary", async () => {
  assert.deepEqual(S.INCOME_STATUS.slice(0, 5), ["received", "pending", "transfer", "statement only", "payable"]);
  const d = memoryDesk();
  const add = (payer, amount, status, category = "Self-releases") => S.submitIncome(d, NOW, R, { bot: "Ledger", date: "2026-11-10", payer, amount, currency: "USD", status, account: status === "received" ? "Wise" : "Statement only", category });
  await add("Sample Distro", "1507.31", "payable");
  await add("Sample Publisher", "31.07", "statement only", "Publishing");
  await add("Sample Label", "200", "received", "Label deals");
  await add("Sample Holdings", "1000", "received", "Salary");
  const i = await S.incomeState(d, NOW);
  assert.deepEqual([i.pending, i.payable, i.statementOnly], [{ USD: 1507.31 }, { USD: 1507.31 }, { USD: 31.07 }]);
  assert.deepEqual([i.received, i.royaltiesOnly], [{ USD: 1200 }, { USD: 200 }]);
  const st = await call(d, "income_status", { bot: "Ledger" });
  assert.equal(st.royalties_only_this_month, "USD 200.00");
  assert.equal(st.payable_this_month, "USD 1507.31");
  assert.equal(st.statement_only_this_month, "USD 31.07");
  /* the statement's money arriving later turns it received, like a pending one */
  await S.submitIncome(d, NOW + DAY, R, { bot: "Ledger", date: "2026-11-15", payer: "Sample Distro", amount: "1507.31", currency: "USD", status: "received", account: "Wise", category: "Self-releases" });
  const i2 = await S.incomeState(d, NOW + DAY);
  assert.deepEqual([i2.payable, i2.received], [{}, { USD: 2707.31 }]);
  /* 16 Nov 2026 (Luke): "never put pending income only what is received" */
  assert.deepEqual(L.incomeTotals(i2).map((x) => x.label), ["Received", "Royalties (no salary)"]);
});

/* ---------- the connector ---------- */
test("the connector: at least 25 tools; the new rules in INSTRUCTIONS; luke_briefing keeps its shape", async () => {
  assert.ok(TOOLS.length >= 25);
  for (const n of ["log_growth", "record_spend", "income_source", "fix_payment"]) assert.ok(tool(n), n);
  assert.deepEqual(tool("submit_income").inputSchema.properties.status.enum, ["received", "pending", "transfer", "statement only", "payable"]);
  assert.match(INSTRUCTIONS, /log_growth/);
  assert.match(INSTRUCTIONS, /record_spend/);
  assert.match(INSTRUCTIONS, /gaps/);
  const d = memoryDesk();
  const hq = async () => hqModel(sheets(), TODAY, FX);
  const b = await call(d, "luke_briefing", { bot: "Alfred" }, { hq });
  assert.deepEqual(Object.keys(b.ad_spend), ["month", "spent", "cap", "left", "status", "estimated"]);
  assert.equal(b.ad_spend.spent, "USD 465.00");
});
