/* The bots' feedback, round 2 (15 Nov 2026, the bots' COMBINED.md).
   - Nova's yes counts as Luke's, as long as Luke told Nova yes himself (Luke, 15 Nov 2026: "yes novas
     counts as long as i told him yes"). Never for money (the bots' own rule, which Luke said yes to). */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, INSTRUCTIONS, toolsFor } from "../netlify/lib/staff-tools.mjs";
import { readFileSync } from "node:fs";
await import("../js/hq-lib.js");

const NOW = Date.parse("2026-11-15T15:00:00Z");
const MIN = 60000;
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, o = {}) => callTool(tool(name), args, { store: d, now: o.now || NOW, role: "bot", hq: async () => null });

test("record_luke_answer: Nova records the yes Luke gave Nova, as Luke's answer via Nova", async () => {
  const d = memoryDesk();
  const dec = await call(d, "send_message", { bot: "Drop", to: "Luke", text: "Fix the Featured typo in the pack?", needs: "decision", options: ["Yes", "Not yet"] });
  const r = await call(d, "record_luke_answer", { bot: "Nova", reply_to: dec.id, luke_said: "yes fix it", option: "Yes" });
  assert.deepEqual([r.saved, r.closed], [true, true]);
  assert.match(r.shown_on, /via Nova/);
  const ans = (await S.listMessages(d, NOW + MIN)).find((m) => m.re === dec.id);
  assert.deepEqual([ans.from, ans.via, ans.to, ans.text], ["Luke", "Nova", "Drop", "yes fix it"]);
  assert.equal((await S.getMessage(d, dec.id)).resolved.note, "Yes");
});

test("record_luke_answer: an approval Nova records says via Nova", async () => {
  const d = memoryDesk();
  const PACK = { kind: "Self-release", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", language: "Portuguese", explicit: "No", genre: "Dance",
    writers: "Sample Writer: music and lyrics", copyright: "℗ 2026 Sample · © 2026 Sample", lyrics: "Made-up line one\nMade-up line two" };
  const r0 = await S.saveRelease(d, NOW, S.DEFAULT_ROSTER, { by: "Luke", title: "Night Drive", date: "2026-12-11", pack: PACK });
  const r = (await S.sendRelease(d, NOW, S.DEFAULT_ROSTER, { by: "Luke", id: r0.id })).release;
  const ask = await call(d, "send_message", { bot: "Verse", to: "Luke", text: "Final lyrics OK?", approval: { song: "Night Drive", what: "lyrics" } });
  const rec = await call(d, "record_luke_answer", { bot: "Nova", reply_to: ask.id, luke_said: "yes final", option: "Approve" });
  assert.match(rec.approved, /via Nova/);
  const ap = (await S.listReleases(d)).find((x) => x.id === r.id).approvals.lyrics;
  assert.deepEqual([ap.by, ap.via, ap.words], ["Luke", "Nova", "yes final"]);
});

test("record_luke_answer: never money for Nova (Ledger, Sheet, Forge ask about money), and nobody else", async () => {
  const d = memoryDesk();
  for (const bot of ["Ledger", "Sheet", "Forge"]) {
    const m = await call(d, "send_message", { bot, to: "Luke", text: "Is this payment ours?", needs: "decision", options: ["Yes", "No"] });
    await assert.rejects(call(d, "record_luke_answer", { bot: "Nova", reply_to: m.id, luke_said: "yes", option: "Yes" }), /money/i);
    const ok = await call(d, "record_luke_answer", { bot: "Alfred", reply_to: m.id, luke_said: "yes", option: "Yes" });
    assert.equal(ok.closed, true, "Alfred still records Luke's money answers from his own chat");
  }
  const m = await call(d, "send_message", { bot: "Drop", to: "Luke", text: "Resubmit?", needs: "reply" });
  await assert.rejects(call(d, "record_luke_answer", { bot: "Kevin", reply_to: m.id, luke_said: "yes" }), /Alfred or Nova/);
});

test("the rule is written for the bots: only Luke's own yes to Nova, his exact words, never money", () => {
  assert.match(tool("record_luke_answer").description, /NOVA/);
  assert.match(tool("record_luke_answer").description, /money/i);
  assert.match(INSTRUCTIONS, /Nova's yes counts as Luke's/);
  assert.ok(toolsFor("Nova", S.DEFAULT_ROSTER).some((t) => t.name === "record_luke_answer"));
  assert.ok(!toolsFor("Kevin", S.DEFAULT_ROSTER).some((t) => t.name === "record_luke_answer"));
});

/* ---------- money is counted once (Luke, 15 Nov 2026: "merge the duplicate payers but money should be
   counted once"), and every RouteNote account shows ("hq should show the second routenote account") ---------- */
const SRC = [
  { id: "routenote", name: "RouteNote", kind: "payer", category: "Self-releases", currency: "USD", lands: "PayPal", owner: "Ledger", state: "active", match: ["routenote"] },
  { id: "northwind", name: "Northwind Music", kind: "payer", category: "Label deals", currency: "EUR", lands: "Wise", owner: "Ledger", state: "active", match: ["northwind"] },
  { id: "holdings", name: "Sample Holdings", kind: "payer", category: "Salary", currency: "EUR", lands: "Wise", owner: "Ledger", state: "active", match: ["sample holdings"] }];
const sub = (d, o) => S.submitIncome(d, NOW, S.DEFAULT_ROSTER, o);
const pay = (o) => ({ bot: "Ledger", date: "2026-11-05", amount: "812.30", currency: "EUR", status: "received", category: "Salary", account: "Wise", ...o });

test("payerName: the same company with or without its ending (LLC, Ltd, Inc) and punctuation", () => {
  assert.equal(S.payerName("Sample Holdings LLC"), S.payerName("Sample Holdings"));
  assert.equal(S.payerName("Northwind Music Ltd."), S.payerName("northwind music"));
  assert.equal(S.payerName("Sample, Inc"), "sample");
  assert.notEqual(S.payerName("Sample Holdings"), S.payerName("Sample Records"));
});

test("submit_income: the same payment under two spellings of one payer name is kept once; different names stay apart", async () => {
  const d = memoryDesk();
  await S.setSources(d, SRC);
  const a = await sub(d, pay({ payer: "Sample Holdings LLC" }));
  const b = await sub(d, pay({ bot: "Sheet", payer: "Sample Holdings" }));
  assert.equal(a.added, true);
  assert.equal(b.added, false, "Sheet's copy is the same payment");
  /* a label paying "via" another company is its own payer, even under one source (Luke: "should be separate") */
  await sub(d, pay({ payer: "Northwind Music Ltd", amount: "400", category: "Label deals" }));
  const c = await sub(d, pay({ payer: "Starlit Records via Northwind", amount: "400", category: "Label deals" }));
  assert.equal(c.added, true);
  /* a different amount, or a different day, is a different payment */
  assert.equal((await sub(d, pay({ payer: "Sample Holdings", amount: "812.31" }))).added, true);
  assert.equal((await sub(d, pay({ payer: "Sample Holdings", date: "2026-11-06" }))).added, true);
});

test("incomeReport: a payment already logged twice under two payer names counts once, and says so", () => {
  const e = (o) => ({ id: o.id, at: o.at, by: "Ledger", date: "2026-11-05", payer: "Sample Holdings", amount: 812.30, currency: "EUR", status: "received", category: "Salary", account: "Wise", reference: "", ...o });
  const entries = [e({ id: "i1", at: "2026-11-05T10:00:00Z", payer: "Sample Holdings LLC" }), e({ id: "i2", at: "2026-11-05T11:00:00Z", by: "Sheet" }),
    e({ id: "i3", at: "2026-11-06T09:00:00Z", payer: "Northwind Music Ltd", amount: 400, category: "Label deals", status: "unsorted", by: "HQ" }),
    e({ id: "i4", at: "2026-11-06T10:00:00Z", payer: "Starlit Records via Northwind", amount: 400, category: "Label deals" })];
  const r = S.incomeReport(entries, [], SRC.map((s) => ({ how: "", blocker: "", needsLuke: "", ...s })), "2026-11-15");
  assert.deepEqual(r.received, { EUR: 1212.30 }, "812.30 once + the 400 that arrived (the two Northwind names stay two payers)");
  assert.deepEqual(r.entries.map((x) => x.id).sort(), ["i1", "i3", "i4"], "the first one logged is kept");
  assert.equal(r.unsortedCount, 1, "the unsorted Northwind Music row is not the Starlit payment");
  /* the same name twice, one unsorted from the bank and one decided: the decided one is kept */
  const two = S.incomeReport([e({ id: "u", at: "2026-11-05T09:00:00Z", status: "unsorted", by: "HQ" }), e({ id: "k", at: "2026-11-05T12:00:00Z" })], [], [], "2026-11-15");
  assert.deepEqual([two.entries.map((x) => x.id), two.unsortedCount], [["k"], 0]);
  assert.ok(r.problems.some((p) => /logged twice/.test(p) && /counted once/.test(p)), r.problems.join(" | "));
});

test("incomeReport: a source with several accounts shows each one, with its last payment or nothing yet", () => {
  const src = [{ ...SRC[0], accounts: ["PayPal (account A)", "PayPal (account B)"], how: "", blocker: "", needsLuke: "" }];
  const entries = [{ id: "i1", at: "2026-10-02T10:00:00Z", by: "Ledger", date: "2026-09-30", payer: "RouteNote", amount: 640.12, currency: "USD", status: "payable", category: "Self-releases", account: "PayPal (account A)", reference: "" }];
  const r = S.incomeReport(entries, [], src, "2026-11-15");
  assert.deepEqual(r.sources[0].byAccount, [
    { account: "PayPal (account A)", last: { date: "2026-09-30", amount: 640.12, currency: "USD", status: "payable" } },
    { account: "PayPal (account B)", last: null }]);
  /* an account the seed doesn't name yet, seen on a payment, shows too */
  const more = S.incomeReport(entries.concat({ ...entries[0], id: "i2", date: "2026-11-02", amount: 50, account: "Account C" }), [], src, "2026-11-15");
  assert.deepEqual(more.sources[0].byAccount.map((a) => a.account), ["PayPal (account A)", "PayPal (account B)", "Account C"]);
  /* one account only: nothing extra (the "Lands in" line says it) */
  assert.equal(S.incomeReport(entries, [], [{ ...src[0], accounts: undefined }], "2026-11-15").sources[0].byAccount, undefined);
});

test("the Money page lists each account of a source under its name", () => {
  const page = readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8");
  assert.match(page, /byAccount/);
  assert.equal(typeof globalThis.HQLib.accountsLine, "function");
  assert.equal(globalThis.HQLib.accountsLine({ byAccount: [
    { account: "PayPal (account A)", last: { date: "2026-09-30", amount: 640.12, currency: "USD", status: "payable" } },
    { account: "PayPal (account B)", last: null }] }),
    "PayPal (account A): USD 640.12 payable, Wed 30 Sept · PayPal (account B): nothing logged yet");
  assert.equal(globalThis.HQLib.accountsLine({}), "");
});

test("income_status: the bots see each account of RouteNote, and the payment counted twice", async () => {
  const d = memoryDesk();
  await S.setSources(d, SRC);
  await call(d, "income_source", { bot: "Ledger", source: "routenote", accounts: ["PayPal (account A)", "PayPal (account B)"] });
  await sub(d, pay({ payer: "RouteNote", amount: "640.12", currency: "USD", status: "payable", account: "PayPal (account A)", category: "Self-releases", date: "2026-11-02" }));
  const st = await call(d, "income_status", { bot: "Ledger" });
  assert.deepEqual(st.sources.find((s) => s.id === "routenote").by_account, ["PayPal (account A): 2026-11-02 USD 640.12 (payable)", "PayPal (account B): none logged"]);
});
