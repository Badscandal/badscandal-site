/* A7 (17 Nov 2026, Ledger, Sheet): a locked month close. When month_check says a month is ready, close_month
   freezes it: a snapshot of every payment that counts in it, what was received, and evidence links. Later
   changes in that month are listed old -> new (month_check's closed.changes_since and the CSV), never lost.
   Made-up payers, amounts and links only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, toolsFor } from "../netlify/lib/staff-tools.mjs";

await import("../js/hq-lib.js");
const HL = globalThis.HQLib;
const NOW = Date.parse("2026-12-02T15:00:00Z");
const R = S.DEFAULT_ROSTER;
const SRC = [
  { id: "label", name: "Sample Label", kind: "payer", category: "Label deals", currency: "EUR", lands: "Revolut", cadence: "monthly", owner: "Ledger", state: "active", match: ["sample label"] },
  { id: "revolut", name: "Revolut", kind: "account", owner: "HQ", cadence: "daily", state: "active" }];
const call = (d, name, args, o = {}) => callTool(TOOLS.find((t) => t.name === name), args, { store: d, now: o.now || NOW, role: o.role || "bot", hq: async () => null }).catch((e) => ({ error: e.message }));
async function desk() {
  const d = memoryDesk(); await S.setSources(d, SRC);
  const a = await S.submitIncome(d, NOW, R, { bot: "Ledger", date: "2026-11-10", payer: "Sample Label", amount: "120.00", currency: "EUR", status: "received", category: "Label deals", account: "Revolut", reference: "ref-a" });
  const b = await S.submitIncome(d, NOW, R, { bot: "Ledger", date: "2026-11-20", payer: "Made Up Client", amount: "60.00", currency: "EUR", status: "received", category: "Production", account: "Revolut", reference: "ref-b" });
  return { d, a: a.entry, b: b.entry };
}

test("close_month: only a finished, ready month; a snapshot, the total and evidence", async () => {
  const { d } = await desk();
  assert.match(String((await call(d, "close_month", { bot: "Ledger", month: "2026-12" })).error), /hasn't ended/);
  await S.submitIncome(d, NOW, R, { bot: "HQ", date: "2026-11-25", payer: "Somebody Unknown", amount: "5.00", currency: "EUR", status: "unsorted", category: "Other", account: "Revolut", reference: "tx-u" });
  assert.match(String((await call(d, "close_month", { bot: "Ledger", month: "2026-11" })).error), /isn't ready to close: 1 to sort/);
  const { d: d2 } = await desk();
  assert.match(String((await call(d2, "close_month", { bot: "Kevin", month: "2026-11" })).error), /Ledger, Sheet or Nova/);
  assert.match(String((await call(d2, "close_month", { bot: "Ledger", month: "2026-11", evidence: ["http://example.com/x"] })).error), /https/);
  const r = await call(d2, "close_month", { bot: "Ledger", month: "2026-11", evidence: ["https://example.com/statement-nov.pdf"] });
  assert.equal(r.closed, true);
  assert.equal(r.received, "EUR 180.00");
  assert.equal(r.payments, 2);
  const c = await S.getMonthClose(d2, "2026-11");
  assert.equal(c.by, "Ledger");
  assert.deepEqual(c.evidence, ["https://example.com/statement-nov.pdf"]);
  assert.equal(c.rows.length, 2);
  /* twice: the first close stands */
  const again = await call(d2, "close_month", { bot: "Sheet", month: "2026-11" });
  assert.equal(again.already, true);
  assert.equal((await S.getMonthClose(d2, "2026-11")).by, "Ledger");
});
test("after closing, changes in that month are listed old -> new, with who and why", async () => {
  const { d, b } = await desk();
  /* 18 Nov 2026: a ready month still needs an evidence link */
  assert.match(String((await call(d, "close_month", { bot: "Ledger", month: "2026-11" })).error), /evidence link/);
  await call(d, "close_month", { bot: "Ledger", month: "2026-11", evidence: ["https://example.com/nov.pdf"] });
  await S.fixIncome(d, NOW + 60000, R, { by: "Ledger", id: b.id, month: "2026-11", amount: "65.00", reason: "the bank's amount was 65" });
  await S.submitIncome(d, NOW + 120000, R, { bot: "Ledger", date: "2026-11-28", payer: "Late Arrival", amount: "10.00", currency: "EUR", status: "received", category: "Other", account: "Revolut", reference: "ref-c" });
  const v = await S.monthCloseView(d, NOW + 180000, "2026-11");
  assert.equal(v.changes.length, 2);
  const lines = S.closeChangeLines(v.changes);
  assert.ok(lines.some((l) => /^Changed .*Made Up Client.*amount 60\.00 → 65\.00.*Ledger: the bank's amount was 65/.test(l)), lines.join("\n"));
  assert.ok(lines.some((l) => /^Added after closing: 2026-11-28 · Late Arrival · EUR 10\.00/.test(l)), lines.join("\n"));
  const mc = await call(d, "month_check", { bot: "Ledger", month: "2026-11" }, { now: NOW + 180000 });
  assert.match(mc.closed.line, /^Closed by Ledger on Wed 2 Dec: EUR 180\.00 received, 2 payments/);
  assert.equal(mc.closed.changes_since.length, 2);
});
test("the CSV: the snapshot, then the changes since", async () => {
  const { d, b } = await desk();
  await call(d, "close_month", { bot: "Ledger", month: "2026-11", evidence: ["https://example.com/e.pdf"] });
  await S.fixIncome(d, NOW + 60000, R, { by: "Ledger", id: b.id, month: "2026-11", amount: "65.00", reason: "bank says 65" });
  const csv = S.closeCsv(await S.monthCloseView(d, NOW + 120000, "2026-11"));
  const rows = csv.split("\n");
  assert.equal(rows[0], "month,closed_at,closed_by,received,evidence");
  assert.match(rows[1], /^2026-11,.*,Ledger,EUR 180\.00,https:\/\/example\.com\/e\.pdf$/);
  assert.ok(rows.includes("id,date,payer,amount,currency,status,category,source,account,reference"));
  assert.ok(rows.some((r) => /^"?Changed/.test(r) || /^change,/.test(r)));
  assert.match(csv, /,Made Up Client,60,EUR,/);
  /* a cell starting with = + - @ is made safe for spreadsheets */
  assert.equal(S.csvCell("=SUM(A1)"), "\"'=SUM(A1)\"");
});
test("who gets the tool; the route; the page line", () => {
  assert.ok(toolsFor("Ledger", R).some((t) => t.name === "close_month"));
  assert.ok(toolsFor("Sheet", R).some((t) => t.name === "close_month"));
  assert.ok(!toolsFor("Kevin", R).some((t) => t.name === "close_month"));
  assert.match(readFileSync(new URL("../netlify/functions/staff.mjs", import.meta.url), "utf8"), /month-close\.csv/);
  assert.equal(HL.closedLine({ month: "2026-11", by: "Ledger", at: "2026-12-02T15:00:00Z" }), "Closed by Ledger on Wed 2 Dec");
  assert.equal(HL.closedLine(null), "");
  assert.match(readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8"), /L\.closedLine\(/);
});
test("the board carries the closes (one small index doc)", async () => {
  const { d } = await desk();
  await call(d, "close_month", { bot: "Ledger", month: "2026-11", evidence: ["https://example.com/nov.pdf"] }); /* 18 Nov 2026: evidence is required */
  const desk2 = await S.loadDesk(d, NOW);
  assert.deepEqual(desk2.closes.map((c) => [c.month, c.by]), [["2026-11", "Ledger"]]);
});
