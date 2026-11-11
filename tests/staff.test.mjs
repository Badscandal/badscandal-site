import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk, sampleBoard, sampleDesk } from "../netlify/lib/staff-sample.mjs";
import { hqModel, dutiesReport, mergeUpdates } from "../netlify/lib/hq.mjs";

const NOW = Date.parse("2026-11-12T12:20:00Z"); /* 09:20 in São Paulo */
const R = S.DEFAULT_ROSTER;
const fails = (p, re) => assert.rejects(p, (e) => e.name === "StaffError" && re.test(e.message));

test("staff: names are matched to the roster, never guessed", () => {
  assert.equal(S.whoIs(" nova ", R), "Nova");
  assert.equal(S.whoIs("NOVA (Manager/Chief Of Staff)", R), "Nova");
  assert.throws(() => S.whoIs("Manny", R), /not a name on the team.*Nova/);
  assert.throws(() => S.whoIs("Luke", R), /not a name/, "a bot can't call itself Luke");
  assert.equal(S.whoIs("luke", R, { people: true }), "Luke");
});

test("staff: an update is one clean line; secrets are refused, plain talk about keys is not", async () => {
  const d = memoryDesk();
  const u = await S.postUpdate(d, NOW, R, { bot: "atlas", status: "DONE", message: "  Touch Me row for Mon 9 Nov\nwritten: 3,540 streams ", link: "http://x", duty: "D-atlas-1" });
  assert.deepEqual([u.bot, u.status, u.message, u.link, u.duty, u.sp], ["Atlas", "done", "Touch Me row for Mon 9 Nov written: 3,540 streams", "", "D-atlas-1", "2026-11-12 09:20"]);
  await fails(S.postUpdate(d, NOW, R, { bot: "Atlas", status: "finished", message: "x y z" }), /status must be one of/);
  await fails(S.postUpdate(d, NOW, R, { bot: "Atlas", status: "done", message: "" }), /message is empty/);
  await fails(S.postUpdate(d, NOW, R, { bot: "Kevin", status: "blocked", message: "TikTok password: hunter42x" }), /Never write passwords/);
  await fails(S.postUpdate(d, NOW, R, { bot: "Kevin", status: "blocked", message: "login code is 482913" }), /Never write/);
  await fails(S.postUpdate(d, NOW, R, { bot: "Ledger", status: "info", message: "pay to IE29 AIBK 9311 5212 3456 78" }), /bank account/);
  const fine = ["Meta token: expired, Luke needs to make a new one", "The key is missing on Netlify", "TikTok login expired: needs Luke's phone code", "ISRC GX8LD2651342, UPC 5064172779824, ad account 230002830106369",
    "Updated my job card for 2026 releases", "Paid by card, USD 104.04", "The OTP is 6-digit and goes to Luke's phone", "Meta token is 60-day, expires 2027-01-10", "token: 2026-11-14 is the day it ends", "Invoice IN26 0001 2345 6789 0 and RN20 2611 0045 8812 9"];
  for (const ok of fine) await S.postUpdate(d, NOW, R, { bot: "Forge", status: "info", message: ok });
  assert.equal((await S.listUpdates(d, NOW, 1)).length, 1 + fine.length);
  for (const bad of ["card 4242 4242 4242 4242 exp 12/27", "cvv 123", "sk_live_abcdefghijklmnop1234", "DE89 3704 0044 0532 0130 00 is the account"]) assert.ok(S.secretIn(bad), bad);
  assert.equal(S.secretIn("AB12CDEF3456GH789", { reference: true }), "", "a payment's own reference is not an account number");
});

test("staff: eight bots posting at the same moment all land (write only if unchanged, then retry)", async () => {
  const d = memoryDesk();
  await Promise.all(R.slice(0, 8).map((b, i) => S.postUpdate(d, NOW + i, R, { bot: b.name, status: "working", message: "starting my duty " + i })));
  const got = await S.listUpdates(d, NOW, 1);
  assert.equal(got.length, 8);
  assert.equal(new Set(got.map((u) => u.id)).size, 8);
});

test("staff: what a bot says through the connector finishes or blocks today's duty; the sheet's done wins", () => {
  const tasks = [{ id: "D-atlas-1", owner: "Atlas", task: "Log Spotify", deadline: "2026-11-12 09:15", status: "todo" }, { id: "D-kevin-1", owner: "Kevin", task: "Log TikTok", deadline: "2026-11-12 09:10", status: "todo" },
    { id: "D-forge-1", owner: "Forge", task: "Log spend", deadline: "2026-11-12 09:30", status: "todo" }, { id: "D-forge-2", owner: "Forge", task: "Check cap", deadline: "2026-11-12 23:30", status: "todo" },
    { id: "D-steve-1", owner: "Steve", task: "Log IG", deadline: "2026-11-12 09:10", status: "done" }];
  const ups = [{ at: "2026-11-12T12:01:00Z", sp: "2026-11-12 09:01", bot: "Atlas", status: "done", message: "rows written", duty: "" },
    { at: "2026-11-12T12:02:00Z", sp: "2026-11-12 09:02", bot: "Kevin", status: "blocked", message: "TikTok signed me out", duty: "D-kevin-1" },
    { at: "2026-11-12T12:03:00Z", sp: "2026-11-12 09:03", bot: "Forge", status: "done", message: "spend logged", duty: "" }, /* two duties, no id: can't know which */
    { at: "2026-11-12T12:04:00Z", sp: "2026-11-12 09:04", bot: "Steve", status: "blocked", message: "late note", duty: "D-steve-1" },
    { at: "2026-11-11T12:04:00Z", sp: "2026-11-11 09:04", bot: "Forge", status: "done", message: "yesterday", duty: "D-forge-2" }];
  const r = dutiesReport(tasks, "2026-11-12", "09:20", S.dutyOverlay(ups, "2026-11-12"));
  const by = Object.fromEntries(r.byOwner.flatMap((o) => o.items).map((x) => [x.id, x]));
  assert.equal(by["D-atlas-1"].status, "done"); assert.equal(by["D-atlas-1"].via, "connector"); assert.equal(by["D-atlas-1"].late, false);
  assert.equal(by["D-kevin-1"].status, "blocked"); assert.equal(by["D-kevin-1"].blocker, "TikTok signed me out");
  assert.equal(by["D-forge-1"].status, "todo", "a bot with two duties must name the duty"); assert.equal(by["D-forge-2"].status, "todo", "yesterday's word doesn't count today");
  assert.equal(by["D-steve-1"].status, "done", "the sheet's done wins");
  assert.equal(r.done, 2); assert.equal(r.blocked, 1);
  assert.equal(dutiesReport(tasks, "2026-11-12", "09:20").done, 1, "no overlay: exactly as before");
});

test("staff: the sheet's Updates tab and the connector make ONE live log, without doubles", () => {
  const sheetRows = [{ time: "2026-11-12 09:01", bot: "Atlas", status: "done", message: "rows written", link: "" }];
  const merged = mergeUpdates(sheetRows, [{ sp: "2026-11-12 09:02", bot: "atlas", status: "done", message: "Rows written" }, { sp: "2026-11-12 09:05", bot: "Nova", status: "info", message: "Standup" }]);
  assert.equal(merged.length, 2);
  const noTab = hqModel({ Updates: null }, "2026-11-12", {}, undefined, "09:20", { updates: [{ sp: "2026-11-12 09:05", bot: "Nova", status: "info", message: "Standup", link: "" }], overlay: null });
  assert.equal(noTab.team.live.ready, true, "the connector is a live log even before the sheet tab exists");
  assert.equal(noTab.team.live.feed[0].bot, "Nova");
  assert.equal(hqModel({ Updates: null }, "2026-11-12").team.live.ready, false, "no tab and no desk: still 'not set up yet'");
});

test("staff: messages wait on someone until answered; only Luke settles a decision for Luke", async () => {
  const d = memoryDesk();
  const q = (await S.sendMessage(d, NOW, R, { from: "Nova", to: "luke", text: "Survivors on Fri 11 Dec?", needs: "decision", options: ["Yes", "January", "", "No", "x", "y"] })).message;
  assert.deepEqual([q.from, q.to, q.needs, q.options.length], ["Nova", "Luke", "decision", 4]);
  const ask = (await S.sendMessage(d, NOW + 1, R, { from: "Claude", to: "Ledger", text: "Is the Bank row still pending?", needs: "reply" })).message;
  const all1 = await S.listMessages(d, NOW + 2);
  assert.equal(S.waitingOn(all1, "Luke").length, 1); assert.equal(S.waitingOn(all1, "Ledger").length, 1);
  await fails(S.resolveMessage(d, NOW + 3, R, { id: q.id, by: "Nova" }), /Only Luke/);
  const ans = await S.sendMessage(d, NOW + 4, R, { from: "Ledger", to: "Claude", text: "Yes, still pending.", re: ask.id });
  assert.equal(ans.parent.resolved.by, "Ledger", "an answer from the one it waited on settles a reply");
  await S.resolveMessage(d, NOW + 5, R, { id: q.id, by: "Luke", note: "Yes" });
  const all2 = await S.listMessages(d, NOW + 6);
  assert.equal(all2.filter(S.isOpen).length, 0);
  const t = S.threads(all2);
  assert.equal(t.length, 2); assert.equal(t.find((x) => x.id === ask.id).replies.length, 1);
  assert.equal((await S.sendMessage(d, NOW + 7, R, { from: "Claude", to: "all", text: "New guide.", needs: "action" })).message.needs, "none", "a note to everyone can't wait on everyone");
  await fails(S.sendMessage(d, NOW, R, { from: "Nova", to: "Bob", text: "hi" }), /not a name/);
  await fails(S.sendMessage(d, NOW, R, { from: "Nova", to: "Luke", text: "the password is abc12345" }), /Never write/);
  await fails(S.sendMessage(d, NOW, R, { from: "Nova", to: "Luke", text: "x y", re: "m123" }), /id of the message/);
});

test("staff: one payment is recorded once; pending becomes received; nothing is converted or guessed", async () => {
  const d = memoryDesk();
  const pay = { bot: "Ledger", date: "2026-11-10", payer: "Northlight Records", amount: "112,01", currency: "eur", account: "Statement only", status: "pending", category: "label deals" };
  const a = await S.submitIncome(d, NOW, R, pay);
  assert.equal(a.added, true); assert.deepEqual([a.entry.amount, a.entry.currency, a.entry.category, a.entry.by], [112.01, "EUR", "Label deals", "Ledger"]);
  assert.deepEqual((await S.submitIncome(d, NOW + 1, R, pay)).added, false, "the same payment again is not added twice");
  const up = await S.submitIncome(d, NOW + 2, R, { ...pay, status: "received" });
  assert.deepEqual([up.added, up.updated, up.entry.status, up.entry.history.length], [false, true, "received", 1]);
  await S.submitIncome(d, NOW + 3, R, { bot: "Ledger", date: "2026-11-11", payer: "Own account", amount: 500, currency: "EUR", account: "Wise", status: "transfer" });
  await S.submitIncome(d, NOW + 4, R, { bot: "Ledger", date: "2026-11-11", payer: "Sample Distro", amount: 104.04, currency: "USD", account: "PayPal", reference: "TX-1" });
  assert.equal((await S.submitIncome(d, NOW + 5, R, { bot: "Ledger", date: "2026-11-12", payer: "Sample Distro Inc", amount: 104.04, currency: "USD", account: "PayPal", reference: "tx-1" })).added, false, "same reference = same payment");
  for (const [bad, re] of [[{ amount: "not read" }, /positive number/], [{ amount: 0 }, /positive number/], [{ amount: -5 }, /positive number/], [{ amount: "1.234" }, /positive number/], [{ date: "2026-02-31" }, /YYYY-MM-DD/], [{ currency: "euros" }, /three-letter/], [{ date: "10/11/2026" }, /YYYY-MM-DD/], [{ date: "2027-01-01" }, /future/], [{ payer: "" }, /payer is empty/], [{ account: "" }, /account is empty/], [{ category: "Gifts" }, /category must be/], [{ status: "paid" }, /status must be/], [{ bot: "Bob" }, /not a name/], [{ note: "IBAN IE29 AIBK 9311 5212 3456 78" }, /bank account/]])
    await fails(S.submitIncome(d, NOW, R, { ...pay, ...bad }), re);
  await S.incomeCheck(d, NOW, R, { bot: "Ledger", account: "Wise", new_payments: 0 });
  await fails(S.incomeCheck(d, NOW, R, { bot: "Ledger", account: "Wise", new_payments: -1 }), /how many/);
  await S.setSources(d, [{ id: "wise", name: "Wise", kind: "account", owner: "Ledger", cadence: "daily", state: "active" }, { id: "paypal", name: "PayPal", kind: "account", owner: "Ledger", cadence: "daily", state: "active" },
    { id: "revolut", name: "Revolut", kind: "account", state: "blocked", blocker: "Not connected" }, { id: "northlight", name: "Northlight Records", category: "Label deals", cadence: "monthly", state: "active" },
    { id: "pub", name: "Sample Publishing", category: "Publishing", cadence: "quarterly", state: "active" }, { id: "plug", name: "Plug-in sales", state: "not_tracked" }]);
  const i = await S.incomeState(d, NOW);
  assert.deepEqual(i.received, { EUR: 112.01, USD: 104.04 }, "currencies are never mixed; the transfer is not income");
  assert.deepEqual(i.pending, {});
  const v = Object.fromEntries(i.accounts.concat(i.sources).map((s) => [s.id, s.verdict]));
  assert.deepEqual(v, { wise: "ok", paypal: "ok", revolut: "blocked", northlight: "ok", pub: "never", plug: "not_tracked" });
  assert.deepEqual(i.unknown, ["Sample Distro"], "a payer nobody has named is pointed out");
  assert.ok(i.problems.some((p) => /Revolut: blocked/.test(p)) && i.problems.some((p) => /New payer/.test(p)));
  const tomorrow = await S.incomeState(d, NOW + 2 * 86400000);
  assert.equal(tomorrow.accounts.find((a) => a.id === "wise").verdict, "overdue", "an account nobody looked at is said out loud");
});

test("staff: the roster, the sources and the guide are checked before they are stored", async () => {
  const d = memoryDesk();
  assert.equal((await S.getRoster(d)).length, S.DEFAULT_ROSTER.length, "the built-in team until the real roster is loaded");
  await S.setRoster(d, [{ name: "Nova", role: "Chief of staff", why: "Runs the day", time: "08:00", schedule: [{ time: "08:05", what: "Reset duties" }] }, { name: "Echo", role: "New" }]);
  assert.deepEqual(S.botNames(await S.getRoster(d)), ["Nova", "Echo"]);
  assert.throws(() => S.setRoster(d, [{ name: "Luke" }]), /can't be a bot name/);
  assert.throws(() => S.setRoster(d, [{ name: "Nova" }, { name: "nova" }]), /twice/);
  assert.throws(() => S.setRoster(d, [{ name: "Nova", access: "password: abc12345" }]), /Never write/);
  await S.setGuide(d, NOW, "Keys: never write a password or token: say what is needed in words.");
  assert.match((await S.getGuide(d)).text, /never write a password/);
  assert.deepEqual(await S.getConfig(d), { botsOn: true, changedAt: null });
  assert.equal((await S.setConfig(d, NOW, { botsOn: false })).botsOn, false);
});

test("staff: the board and the twice-daily check say what is wrong in plain lines", async () => {
  const b = sampleBoard(NOW);
  assert.equal(b.staff.length, S.DEFAULT_ROSTER.length);
  const st = Object.fromEntries(b.staff.map((w) => [w.name, w.state]));
  assert.equal(st.Kevin, "blocked"); assert.equal(st.Steve, "done"); assert.equal(st.Laura, "late");
  assert.equal(b.waiting.luke.length, 2); assert.equal(b.connector.botsOn, true); assert.equal(b.report.from, "HQ");
  assert.ok(b.staff.find((w) => w.name === "Kevin").waiting.length === 0 && b.staff.find((w) => w.name === "Nova").waiting.length === 1);
  const desk = sampleDesk(NOW);
  const r = S.checkReport({ desk, hq: null, hqState: { connected: true, error: "A tab is missing in the sheet" }, now: NOW });
  assert.match(r.title, /^HQ check, 2026-11-12 morning: \d+ things? to look at$/);
  assert.ok(r.problems.some((p) => /sheet can't be read/.test(p)));
  assert.ok(r.problems.some((p) => /waiting on Luke/.test(p)));
  assert.ok(r.problems.some((p) => /Never used the connector/.test(p)));
  assert.ok(r.text.length <= 1500);
  assert.equal(S.checkReport({ desk, hq: null, hqState: null, now: NOW + 9 * 3600000 }).part, "pm");
});

/* ---- added after the independent review (11 Nov 2026) ---- */

test("staff: a write the store did not really make is never reported as saved", async () => {
  const d = memoryDesk();
  const real = d.setJSON.bind(d);
  /* what the real client answers for a failed conditional write: "modified", no tag, nothing stored */
  d.setJSON = async () => ({ modified: true, etag: "" });
  await fails(S.postUpdate(d, NOW, R, { bot: "Atlas", status: "done", message: "rows written" }), /Nothing was saved/);
  /* a write that DID land but came back without a tag is accepted once reading it back proves it */
  d.setJSON = async (k, v, o) => { await real(k, v, o); return { modified: true, etag: "" }; };
  assert.equal((await S.postUpdate(d, NOW, R, { bot: "Atlas", status: "done", message: "rows written" })).bot, "Atlas");
  assert.equal((await S.listUpdates(d, NOW, 1)).length, 1);
  /* a store that cannot be read is an error, never "empty" (the bots' switch must not read as on) */
  d.getWithMetadata = async () => { throw new Error("store down"); };
  await assert.rejects(S.getConfig(d), /store down/);
  await assert.rejects(S.getRoster(d), /store down/);
});

test("staff: one payment stays one payment, whichever way the bot sends it", async () => {
  const d = memoryDesk();
  const base = { bot: "Ledger", payer: "Northlight Records", amount: 112.01, currency: "EUR", category: "Label deals" };
  /* statement on the 3rd (pending), the money on the 9th: the same payment arriving */
  await S.submitIncome(d, NOW, R, { ...base, date: "2026-11-03", account: "Statement only", status: "pending" });
  const landed = await S.submitIncome(d, NOW + 1, R, { ...base, date: "2026-11-09", account: "Wise", status: "received", reference: "TX-77" });
  assert.deepEqual([landed.added, landed.updated, landed.entry.status, landed.entry.arrived, landed.entry.account, landed.entry.reference], [false, true, "received", "2026-11-09", "Wise", "TX-77"]);
  /* the statement email read again must not push it back to pending, nor add a second one */
  const reread = await S.submitIncome(d, NOW + 2, R, { ...base, date: "2026-11-03", account: "Statement only", status: "pending" });
  assert.deepEqual([reread.added, reread.updated, reread.entry.status], [false, false, "received"]);
  /* first without its reference, then with it: still one */
  await S.submitIncome(d, NOW + 3, R, { bot: "Ledger", date: "2026-11-10", payer: "Sample Distro", amount: 50, currency: "USD", account: "PayPal" });
  const withRef = await S.submitIncome(d, NOW + 4, R, { bot: "Ledger", date: "2026-11-10", payer: "Sample Distro", amount: 50, currency: "USD", account: "PayPal", reference: "PP-1" });
  assert.deepEqual([withRef.added, withRef.updated, withRef.entry.reference], [false, true, "PP-1"]);
  /* two real payments of the same size on one day, each with its own reference: two */
  assert.equal((await S.submitIncome(d, NOW + 5, R, { bot: "Ledger", date: "2026-11-10", payer: "Sample Distro", amount: 50, currency: "USD", account: "PayPal", reference: "PP-2" })).added, true);
  /* a pending statement from last month whose money lands this month counts THIS month, once */
  await S.submitIncome(d, NOW + 6, R, { ...base, amount: 80, date: "2026-10-28", account: "Statement only", status: "pending" });
  await S.submitIncome(d, NOW + 7, R, { ...base, amount: 80, date: "2026-11-11", account: "Wise", status: "received" });
  const i = await S.incomeState(d, NOW);
  assert.deepEqual(i.received, { EUR: 192.01, USD: 100 }); assert.deepEqual(i.pending, {});
  assert.equal(i.entries.length, 4, "four payments, not seven");
  assert.equal(i.entries.find((e) => e.amount === 80).statement, "2026-10-28");
  assert.equal(S.secretIn("AB12CDEF3456GH789", { reference: true }), "");
  assert.equal((await S.submitIncome(d, NOW + 8, R, { bot: "Ledger", date: "2026-11-11", payer: "Sample Distro", amount: 7, currency: "USD", account: "PayPal", reference: "AB12CDEF3456GH789" })).added, true, "a PayPal-style transaction id is accepted");
});

test("staff: 'checked today' is a São Paulo day; open messages survive the month; the newest word decides", async () => {
  const d = memoryDesk();
  await S.setSources(d, [{ id: "wise", name: "Wise", kind: "account", owner: "Ledger", cadence: "daily", state: "active" }]);
  const late = Date.parse("2026-11-12T00:30:00Z"); /* 21:30 on the 11th in São Paulo, already the 12th in UTC */
  await S.submitIncome(d, late, R, { bot: "Ledger", date: "2026-11-11", payer: "Someone", amount: 5, currency: "EUR", account: "Wise" });
  assert.equal((await S.incomeState(d, late)).accounts[0].verdict, "ok");
  assert.equal((await S.incomeState(d, Date.parse("2026-11-12T15:00:00Z"))).accounts[0].verdict, "due", "logged last night is not 'checked today'");
  /* a decision asked on 30 Sep is still waiting on Luke in November */
  const sep = Date.parse("2026-09-30T15:00:00Z");
  const q = (await S.sendMessage(d, sep, R, { from: "Nova", to: "Luke", text: "Old question?", needs: "decision", options: ["a", "b"] })).message;
  await S.sendMessage(d, sep + 1, R, { from: "Nova", to: "Luke", text: "Old note, nothing needed." });
  const nov = await S.listMessages(d, NOW);
  assert.deepEqual(nov.map((m) => m.id), [q.id], "the open one is found; the settled chatter of old months is not loaded");
  /* working, then done, with no duty row: done */
  await S.postUpdate(d, NOW, R, { bot: "Verse", status: "working", message: "checking lyrics" });
  await S.postUpdate(d, NOW + 60000, R, { bot: "Verse", status: "done", message: "lyrics live" });
  const desk = await S.loadDesk(d, NOW + 120000);
  assert.equal(S.board(desk, NOW + 120000, null).staff.find((w) => w.name === "Verse").state, "done");
});

test("staff: a looping bot is told to stop and never pushes the others out", async () => {
  const d = memoryDesk();
  await S.postUpdate(d, NOW, R, { bot: "Atlas", status: "done", message: "the one line that matters" });
  for (let i = 0; i < S.LIMITS.updatesPerBotPerDay; i++) await S.postUpdate(d, NOW + i, R, { bot: "Kevin", status: "info", message: "again " + i });
  await fails(S.postUpdate(d, NOW, R, { bot: "Kevin", status: "info", message: "once more" }), /limit.*stop, and tell Nova/);
  assert.ok((await S.listUpdates(d, NOW, 1)).some((u) => u.bot === "Atlas"), "Atlas's line is still there");
  for (let i = 0; i < S.LIMITS.messagesPerSenderPerDay; i++) await S.sendMessage(d, NOW + i, R, { from: "Kevin", to: "Nova", text: "ping " + i });
  await fails(S.sendMessage(d, NOW, R, { from: "Kevin", to: "Nova", text: "ping again" }), /limit/);
  assert.equal((await S.sendMessage(d, NOW, R, { from: "Atlas", to: "Nova", text: "still works for me" })).message.from, "Atlas");
});

test("staff: the duty overlay takes the newer word and only from the duty's own bot", () => {
  const tasks = [{ id: "D-atlas-1", owner: "Atlas", task: "Log Spotify", deadline: "2026-11-12 09:15", status: "todo" }, { id: "D-kevin-1", owner: "Kevin", task: "Log TikTok", deadline: "2026-11-12 09:10", status: "todo" }];
  const ups = [{ at: "2026-11-12T12:02:00Z", sp: "2026-11-12 09:02", bot: "Atlas", status: "blocked", message: "signed out", duty: "D-atlas-1" },
    { at: "2026-11-12T12:30:00Z", sp: "2026-11-12 09:30", bot: "Atlas", status: "done", message: "rows written", duty: "" },
    { at: "2026-11-12T12:31:00Z", sp: "2026-11-12 09:31", bot: "Atlas", status: "done", message: "did Kevin's too", duty: "D-kevin-1" }];
  const by = Object.fromEntries(dutiesReport(tasks, "2026-11-12", "09:40", S.dutyOverlay(ups, "2026-11-12")).byOwner.flatMap((o) => o.items).map((x) => [x.id, x]));
  assert.equal(by["D-atlas-1"].status, "done", "blocked at 09:02, done at 09:30: done");
  assert.equal(by["D-kevin-1"].status, "todo", "Atlas can't finish Kevin's duty");
  const sheet = [{ time: "2026-11-12 09:01", bot: "Atlas", status: "done", message: "x" }, { time: "2026-11-12 09:05", bot: "Atlas", status: "done", message: "x" }];
  assert.equal(mergeUpdates(sheet, []).length, 2, "the sheet's own rows are never collapsed");
});

test("staff: the twice-daily report always goes on the board, even when the sheet holds something it shouldn't", async () => {
  const d = memoryDesk();
  const hq = hqModel({ Tasks: [["id", "owner", "task", "deadline", "status", "blocker", "updated"], ["D-kevin-1", "Kevin", "Log TikTok", "2026-11-12 09:10", "blocked", "TikTok login code: 482913 expired", ""]] }, "2026-11-12", {}, undefined, "09:20");
  const desk = await S.loadDesk(d, NOW);
  const r = S.checkReport({ desk, hq, hqState: { connected: true, sheetErrors: {} }, now: NOW });
  assert.ok(!/482913/.test(r.text), "the code is not repeated");
  assert.match(r.text, /one line left out/);
  const sent = await S.sendMessage(d, NOW, desk.roster, { from: "HQ", to: "Luke", text: r.text, needs: "none", kind: "report" });
  assert.equal(sent.message.kind, "report");
  const none = S.checkReport({ desk, hq: null, hqState: { connected: true, error: "Google didn't answer in time" }, now: NOW });
  assert.ok(none.problems.some((p) => /Duties: not read/.test(p)) && !none.problems.some((p) => /no duty rows/.test(p)), "an unread sheet is not blamed on Nova");
});

test("staff: an answer to an answer stays in its thread; a bot that only writes the sheet is not 'silent'", async () => {
  const d = memoryDesk();
  const a = (await S.sendMessage(d, NOW, R, { from: "Claude", to: "Nova", text: "Is the Updates tab there?", needs: "reply" })).message;
  const b = (await S.sendMessage(d, NOW + 1, R, { from: "Nova", to: "Claude", text: "Yes.", re: a.id })).message;
  await S.sendMessage(d, NOW + 2, R, { from: "Claude", to: "Nova", text: "Thanks.", re: b.id });
  const t = S.threads(await S.listMessages(d, NOW + 3));
  assert.equal(t.length, 1); assert.deepEqual(t[0].replies.map((m) => m.text), ["Yes.", "Thanks."]);
  /* Steve wrote only the sheet's Updates tab today */
  const hq = hqModel({ Updates: [["time", "bot", "status", "message", "link"], ["2026-11-12 09:05", "Steve", "done", "Instagram row written: 13,509 followers", ""]] }, "2026-11-12", {}, undefined, "09:20", { updates: [], overlay: null });
  const bd = S.board(await S.loadDesk(d, NOW), NOW, hq);
  const steve = bd.staff.find((w) => w.name === "Steve");
  assert.equal(steve.last.message, "Instagram row written: 13,509 followers"); assert.equal(steve.state, "done"); assert.equal(bd.updates.length, 1);
});

test("staff: an 'unsorted' payment (seen in the bank, not yet said what it is) is in no total until someone sorts it", async () => {
  const d = memoryDesk();
  const base = { bot: "HQ", payer: "Made-up Friend", currency: "EUR", account: "Revolut", note: "Read from Revolut" };
  const a = await S.submitIncome(d, NOW, R, { ...base, date: "2026-11-09", amount: 40, status: "unsorted", reference: "tx-a" });
  await S.submitIncome(d, NOW + 1, R, { ...base, date: "2026-11-10", amount: 15, status: "unsorted", reference: "tx-b", payer: "Unknown Co" });
  await S.submitIncome(d, NOW + 2, R, { ...base, date: "2026-11-10", amount: 100, status: "received", reference: "tx-c", payer: "Northlight Records", category: "Label deals" });
  let i = await S.incomeState(d, NOW);
  assert.deepEqual([i.received, i.pending, i.byCategory], [{ EUR: 100 }, {}, { "Label deals": { EUR: 100 } }], "unsorted counts in neither received nor pending");
  assert.deepEqual(i.unsorted.map((e) => e.reference), ["tx-b", "tx-a"], "newest first"); assert.equal(i.unsortedCount, 2);
  assert.ok(i.problems.includes("2 payments in Revolut that nobody has sorted yet"));
  assert.ok(!i.unknown.includes("Made-up Friend"), "an unsorted payer is not also listed as a new payer");
  /* the same payment again as unsorted changes nothing; a later decided submit of it may sort it */
  assert.equal((await S.submitIncome(d, NOW + 3, R, { ...base, date: "2026-11-09", amount: 40, status: "unsorted", reference: "tx-a" })).updated, false);
  const up = await S.submitIncome(d, NOW + 4, R, { ...base, date: "2026-11-09", amount: 40, status: "received", reference: "tx-a", category: "Production" });
  assert.deepEqual([up.updated, up.entry.status, up.entry.category, up.entry.history.at(-1).from], [true, "received", "Production", "unsorted"]);
  const back = await S.submitIncome(d, NOW + 5, R, { ...base, date: "2026-11-09", amount: 40, status: "unsorted", reference: "tx-a" });
  assert.deepEqual([back.updated, back.entry.status], [false, "received"], "a later 'unsorted' never overwrites a decided status");
  /* sortIncome: Luke says the other one is not income */
  const b = (await S.incomeState(d, NOW)).unsorted[0];
  await fails(S.sortIncome(d, NOW, R, { by: "Steve", id: b.id, month: "2026-11", status: "transfer" }), /can sort/);
  await fails(S.sortIncome(d, NOW, R, { by: "Luke", id: b.id, month: "2026-11", status: "received" }), /category must be/);
  await fails(S.sortIncome(d, NOW, R, { by: "Luke", id: b.id, month: "2026-11", status: "pending" }), /status must be/);
  await fails(S.sortIncome(d, NOW, R, { by: "Luke", id: "i" + "0".repeat(12), month: "2026-11", status: "transfer" }), /no payment/);
  const sorted = await S.sortIncome(d, NOW + 6, R, { by: "luke", id: b.id, month: "2026-11", status: "transfer" });
  assert.deepEqual([sorted.status, sorted.history.at(-1)], ["transfer", { at: new Date(NOW + 6).toISOString(), by: "Luke", from: "unsorted", to: "transfer" }]);
  await fails(S.sortIncome(d, NOW, R, { by: "Luke", id: b.id, month: "2026-11", status: "received", category: "Other" }), /already sorted/);
  i = await S.incomeState(d, NOW);
  assert.deepEqual([i.unsortedCount, i.unsorted, i.received], [0, [], { EUR: 140 }]);
  assert.ok(!i.problems.some((p) => /nobody has sorted/.test(p)));
  /* without a month it looks in this month and the three before */
  const c = await S.submitIncome(d, NOW + 7, R, { ...base, date: "2026-09-20", amount: 9, status: "unsorted", reference: "tx-d" });
  assert.equal((await S.sortIncome(d, NOW + 8, R, { by: "Claude", id: c.entry.id, status: "received", category: "other" })).category, "Other");
  assert.equal(a.entry.category, "Other");
});
