/* The bank reader (netlify/lib/bank.mjs + netlify/functions/bank.mjs). Enable Banking is never called:
   a scripted fake answers with the shapes the August 2026 build saw from the real API. Every name,
   amount, id and key here is made up (the repo is public). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { generateKeyPairSync, verify } from "node:crypto";
import * as B from "../netlify/lib/bank.mjs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { makeSession, sessionCookie } from "../netlify/lib/session.mjs";

const { privateKey: PEM, publicKey: PUB } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const APP = "11111111-2222-3333-4444-555555555555";
const KEY64 = Buffer.from(PEM).toString("base64");
const ENV = { ENABLE_BANKING_APPLICATION_ID: APP, ENABLE_BANKING_PRIVATE_KEY: KEY64 };
const NOW = Date.parse("2026-11-12T09:50:00Z"); /* 06:50 in São Paulo */
const DAY = 86400000;
const SID = "made-up-session-7f3c9a1e";
const FAKE_IBAN = "IE29AIBK93115212345678"; /* the textbook example IBAN, not a real account */
const SOURCES = [{ id: "revolut", name: "Revolut", kind: "account", state: "active" },
  { id: "northlight", name: "Northlight Records Ltd", category: "Label deals", cadence: "monthly", state: "active", match: ["northlight"] },
  { id: "pub", name: "Sample Publishing", category: "Publishing", cadence: "quarterly", state: "active", match: ["sample publishing"] }];
const ACCOUNTS = [{ uid: "uid-eur", name: "Current", currency: "EUR", idHash: "a1", holder: "Sam Example" },
  { uid: "uid-sav", name: "Savings", currency: "EUR", idHash: "a2", holder: "Sam Example" }, { uid: "uid-usd", name: "Current", currency: "USD", idHash: "a3", holder: "Sam Example" }];

/* one Enable Banking transaction, Revolut-like */
const tx = (o) => ({ ...(o.id ? { transaction_id: o.id } : {}), entry_reference: o.ref, transaction_amount: { amount: String(o.amount), currency: o.cur || "EUR" }, credit_debit_indicator: o.out ? "DBIT" : "CRDT",
  status: o.status || "BOOK", booking_date: o.date, value_date: o.date, remittance_information: o.text ? [].concat(o.text) : [],
  ...(o.payer ? { debtor: { name: o.payer } } : {}), creditor: { name: o.out ? "Example Shop" : "Sam Example" }, balance_after_transaction: { balance_amount: { amount: "987.65", currency: o.cur || "EUR" } } });
const ok = (x, status = 200) => new Response(JSON.stringify(x), { status, headers: { "Content-Type": "application/json" } });

/* the reader, scripted. pages: { uid: [page0, page1, ...] }, a page's continuation_key "page-N" asks for page N */
function fakeReader(o = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = new URL(url), method = init.method || "GET";
    calls.push({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers && init.headers.Authorization });
    if (o.tick) o.tick(method, u.pathname);
    const hit = o.fail && o.fail(method, u.pathname);
    if (hit) return hit;
    if (u.pathname === "/aspsps") return ok({ aspsps: [{ name: "Other Bank", country: "IE", maximum_consent_validity: 7776000 }, { name: "Revolut", country: "IE", maximum_consent_validity: 15552000 }] });
    if (method === "POST" && u.pathname === "/auth") return ok({ url: "https://auth.example.test/approve?ref=made-up", authorization_id: "made-up-auth" });
    if (method === "POST" && u.pathname === "/sessions") return ok({ session_id: SID, accounts: ["uid-eur", "uid-usd"], accounts_data: [{ uid: "uid-eur", identification_hash: "hash-eur" }, { uid: "uid-usd", identification_hash: "hash-usd" }],
      aspsp: { name: "Revolut", country: "IE" }, access: { valid_until: "2027-05-10T09:00:00.000+00:00" } });
    if (method === "DELETE") return new Response(null, { status: 204 });
    const m = /^\/accounts\/([^/]+)\/(details|transactions)$/.exec(u.pathname);
    if (m && m[2] === "details") return ok({ uid: m[1], name: "Sam Example", currency: m[1] === "uid-usd" ? "USD" : "EUR", product: m[1] === "uid-usd" ? "" : "Current", account_id: { iban: FAKE_IBAN }, identification_hash: "hash-" + m[1] });
    if (m) { const list = (o.pages || {})[m[1]] || [{ transactions: [] }]; const k = u.searchParams.get("continuation_key"); return ok(list[k ? Number(k.slice(5)) : 0] || { transactions: [] }); }
    return ok({ error: "NOT_FOUND" }, 404);
  };
  f.calls = calls;
  return f;
}
async function connectedBank(extra = {}) {
  const bank = memoryDesk();
  await bank.setJSON("conn.json", { sessionId: SID, validUntil: new Date(NOW + 86.5 * DAY).toISOString(), aspsp: { name: "Revolut", country: "IE" }, connectedAt: new Date(NOW - DAY).toISOString(), accounts: ACCOUNTS, ...extra });
  return bank;
}
async function deskWithSources() { const desk = memoryDesk(); await S.setSources(desk, SOURCES); return desk; }
const doc = async (store, key) => (await S.readDoc(store, key, null)).data;
const allEntries = async (desk) => [...desk._map.keys()].filter((k) => k.startsWith("inc/")).flatMap((k) => JSON.parse(desk._map.get(k).body));

/* ---------------------------------------------------------------- the signed assertion */
test("bank: the JWT carries kid = application id, RS256, Enable Banking's iss/aud, one hour, and verifies; raw and base64 keys both work", () => {
  for (const key of [PEM, KEY64, PEM.trim().replace(/\n/g, "\\n"), "  " + KEY64 + "\n"]) {
    const jwt = B.signJwt({ applicationId: APP, privateKey: key }, NOW);
    const [h, p, s] = jwt.split(".");
    assert.deepEqual(JSON.parse(Buffer.from(h, "base64url")), { typ: "JWT", alg: "RS256", kid: APP });
    assert.deepEqual(JSON.parse(Buffer.from(p, "base64url")), { iss: "enablebanking.com", aud: "api.enablebanking.com", iat: NOW / 1000, exp: NOW / 1000 + 3600 }, "claims only: no account or user data");
    assert.ok(verify("RSA-SHA256", Buffer.from(h + "." + p), PUB, Buffer.from(s, "base64url")), "the signature verifies with the matching public key");
  }
  const other = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } }).publicKey;
  const [h, p, s] = B.signJwt({ applicationId: APP, privateKey: PEM }, NOW).split(".");
  assert.equal(verify("RSA-SHA256", Buffer.from(h + "." + p), other, Buffer.from(s, "base64url")), false);
  for (const [key, kind] of [["bm90LWEta2V5", "key"], ["", "missing"], ["-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----", "key"]])
    assert.throws(() => B.signJwt({ applicationId: APP, privateKey: key }, NOW), (e) => e.name === "BankError" && e.kind === kind && !e.message.includes("AAAA"));
  assert.throws(() => B.signJwt({ applicationId: "", privateKey: PEM }, NOW), (e) => e.kind === "missing");
  assert.deepEqual(B.readConfig(ENV).aspsp, { name: "Revolut", country: "IE" });
  assert.deepEqual(B.readConfig({ ...ENV, ENABLE_BANKING_ASPSP_NAME: "Mock ASPSP", ENABLE_BANKING_ASPSP_COUNTRY: "fi" }).aspsp, { name: "Mock ASPSP", country: "FI" });
  assert.equal(B.readConfig({ ENABLE_BANKING_APPLICATION_ID: APP }).configured, false);
  assert.equal(B.readConfig((k) => ENV[k]).configured, true, "env as a function (Netlify.env.get) too");
});

test("bank: the approval asked for = the bank's maximum, at most 180 days, minus an hour", () => {
  assert.equal(B.consentUntil(7776000, NOW), new Date(NOW + 90 * DAY - 3600000).toISOString());
  assert.equal(B.consentUntil(10 * 365 * 86400, NOW), new Date(NOW + 180 * DAY - 3600000).toISOString());
  assert.equal(B.consentUntil(null, NOW), new Date(NOW + 180 * DAY - 3600000).toISOString());
  assert.ok(Date.parse(B.consentUntil(-5, NOW)) > NOW && Date.parse(B.consentUntil(60, NOW)) > NOW);
});

/* ---------------------------------------------------------------- connect + callback */
test("bank connect: /aspsps, then /auth with the right body; the nonce is stored first; nothing is stored when it fails", async () => {
  const bank = memoryDesk(), f = fakeReader();
  const r = await B.startConnect({ bank, env: ENV, now: NOW, fetchImpl: f });
  assert.deepEqual(r, { url: "https://auth.example.test/approve?ref=made-up" });
  assert.deepEqual(f.calls.map((c) => c.method + " " + c.path), ["GET /aspsps", "POST /auth"]);
  assert.equal(f.calls[0].query.country, "IE");
  const keys = [...bank._map.keys()];
  assert.equal(keys.length, 1); assert.match(keys[0], /^state\/[A-Za-z0-9_-]{32}\.json$/);
  const nonce = keys[0].slice(6, -5);
  assert.deepEqual(f.calls[1].body, { access: { valid_until: new Date(NOW + 180 * DAY - 3600000).toISOString() }, aspsp: { name: "Revolut", country: "IE" }, state: nonce,
    redirect_url: "https://badscandal.com/api/bank/callback", psu_type: "personal" });
  assert.deepEqual(await doc(bank, keys[0]), { at: new Date(NOW).toISOString(), validUntil: f.calls[1].body.access.valid_until });
  for (const c of f.calls) { assert.match(c.auth, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/); assert.equal(JSON.parse(Buffer.from(c.auth.split(" ")[1].split(".")[0], "base64url")).kid, APP); }
  /* a second press makes a second nonce and clears nothing that is still valid */
  await B.startConnect({ bank, env: ENV, now: NOW + 1000, fetchImpl: f });
  assert.equal([...bank._map.keys()].length, 2);
  /* an old unfinished press is cleared on the next one */
  await B.startConnect({ bank, env: ENV, now: NOW + 20 * 60000, fetchImpl: f });
  assert.equal([...bank._map.keys()].length, 1);
  /* failures: nothing stored */
  for (const [fail, kind] of [[(m, p) => (p === "/aspsps" ? ok({ code: 401, message: "Unauthorized" }, 401) : null), "refused"], [(m, p) => (p === "/auth" ? ok({ error: "WRONG_REQUEST_PARAMETERS" }, 422) : null), "reader"]]) {
    const b2 = memoryDesk();
    await assert.rejects(B.startConnect({ bank: b2, env: ENV, now: NOW, fetchImpl: fakeReader({ fail }) }), (e) => e.kind === kind);
    assert.equal(b2._map.size, 0);
  }
  const b3 = memoryDesk();
  await assert.rejects(B.startConnect({ bank: b3, env: { ...ENV, ENABLE_BANKING_ASPSP_COUNTRY: "GB" }, now: NOW, fetchImpl: f }), (e) => e.kind === "no_bank");
  await assert.rejects(B.startConnect({ bank: b3, env: { ...ENV, ENABLE_BANKING_PRIVATE_KEY: "junk" }, now: NOW, fetchImpl: f }), (e) => e.kind === "key");
  await assert.rejects(B.startConnect({ bank: b3, env: {}, now: NOW, fetchImpl: f }), (e) => e.kind === "missing");
  assert.equal(b3._map.size, 0);
});

test("bank callback: a wrong, reused or expired nonce changes nothing; a good one stores the accounts, never answers the session id", async () => {
  const bank = memoryDesk(), f = fakeReader();
  await B.startConnect({ bank, env: ENV, now: NOW, fetchImpl: f });
  const nonce = [...bank._map.keys()][0].slice(6, -5);
  const snap = () => JSON.stringify([...bank._map.entries()]);
  const before = snap();
  f.calls.length = 0;
  const cb = (o) => B.finishCallback({ bank, env: ENV, now: NOW + 60000, fetchImpl: f, code: "made-up-code-123", state: nonce, ...o });
  for (const state of [undefined, "", "nope", "x".repeat(32), nonce.slice(0, -1) + (nonce.endsWith("A") ? "B" : "A"), "../conn", nonce + "/../x"])
    assert.deepEqual(await cb({ state }), { ok: false, why: "state" }, String(state));
  assert.deepEqual(await cb({ now: NOW + 11 * 60000 }), { ok: false, why: "state" }, "older than 10 minutes");
  assert.equal(snap(), before, "nothing written or deleted"); assert.equal(f.calls.length, 0, "the bank was not called");

  const good = await cb({ now: NOW + 120000 });
  assert.deepEqual(good, { ok: true, accounts: 2 });
  assert.ok(!JSON.stringify(good).includes(SID));
  assert.deepEqual(f.calls.map((c) => c.method + " " + c.path), ["POST /sessions", "GET /accounts/uid-eur/details", "GET /accounts/uid-usd/details"]);
  assert.deepEqual(f.calls[0].body, { code: "made-up-code-123" });
  const conn = await doc(bank, "conn.json");
  assert.equal(conn.sessionId, SID); assert.equal(conn.validUntil, "2027-05-10T09:00:00.000Z"); assert.deepEqual(conn.aspsp, { name: "Revolut", country: "IE" });
  assert.deepEqual(conn.accounts.map((a) => [a.uid, a.name, a.currency, a.holder]), [["uid-eur", "Current", "EUR", "Sam Example"], ["uid-usd", "USD account", "USD", "Sam Example"]]);
  assert.match(conn.accounts[0].idHash, /^[0-9a-f]{16}$/);
  assert.ok(!JSON.stringify([...bank._map.entries()]).includes(FAKE_IBAN) && !JSON.stringify([...bank._map.entries()]).includes("AIBK"), "no account number is kept");
  assert.equal([...bank._map.keys()].filter((k) => k.startsWith("state/")).length, 0, "the nonce is gone");
  /* the same link again (the browser's back button): refused, nothing changes */
  const after = snap(); f.calls.length = 0;
  assert.deepEqual(await cb({ now: NOW + 130000 }), { ok: false, why: "state" });
  assert.equal(snap(), after); assert.equal(f.calls.length, 0);

  /* a cancelled approval: the nonce is used up, the old connection stays */
  await B.startConnect({ bank, env: ENV, now: NOW + DAY, fetchImpl: f });
  const n2 = [...bank._map.keys()].find((k) => k.startsWith("state/")).slice(6, -5);
  await assert.rejects(B.finishCallback({ bank, env: ENV, now: NOW + DAY + 1000, fetchImpl: f, state: n2, error: "access_denied" }), (e) => e.kind === "cancelled");
  assert.equal((await doc(bank, "conn.json")).sessionId, SID); assert.equal([...bank._map.keys()].filter((k) => k.startsWith("state/")).length, 0);
  /* reconnecting replaces the connection and gives the old approval back */
  await B.startConnect({ bank, env: ENV, now: NOW + DAY, fetchImpl: f });
  const n3 = [...bank._map.keys()].find((k) => k.startsWith("state/")).slice(6, -5);
  await bank.setJSON("conn.json", { ...(await doc(bank, "conn.json")), sessionId: "made-up-older-session" });
  f.calls.length = 0;
  assert.equal((await B.finishCallback({ bank, env: ENV, now: NOW + DAY + 1000, fetchImpl: f, state: n3, code: "c2" })).ok, true);
  assert.deepEqual(f.calls.at(-1), { method: "DELETE", path: "/sessions/made-up-older-session", query: {}, body: undefined, auth: f.calls.at(-1).auth });
});

/* ---------------------------------------------------------------- status + the dashboard's sentence */
test("bank status: before, after, expiring, expired; bankLine says it in one sentence", async () => {
  const empty = memoryDesk();
  const none = await B.bankStatus({ bank: empty, env: {}, now: NOW, canConnectHere: true });
  assert.deepEqual(none, { configured: false, connected: false, needsApproval: false, aspsp: null, validUntil: null, daysLeft: null, expiring: false, accounts: [], lastRunAt: null, lastOkAt: null, lastError: null, lastAdded: null, canConnectHere: true });
  assert.equal(B.bankLine(none, NOW), "The site is missing its Revolut settings");
  const before = await B.bankStatus({ bank: empty, env: ENV, now: NOW, canConnectHere: false });
  assert.equal(before.configured, true); assert.equal(B.bankLine(before, NOW), "Revolut is not connected");

  const bank = await connectedBank();
  await bank.setJSON("sync.json", { lastRunAt: new Date(NOW).toISOString(), lastOkAt: new Date(NOW).toISOString(), lastError: null, perAccount: {}, lastAdded: 2 });
  const st = await B.bankStatus({ bank, env: ENV, now: NOW + 60000, canConnectHere: true });
  assert.deepEqual(st, { configured: true, connected: true, needsApproval: false, aspsp: "Revolut", validUntil: new Date(NOW + 86.5 * DAY).toISOString(), daysLeft: 86, expiring: false,
    accounts: [{ name: "Current", currency: "EUR" }, { name: "Savings", currency: "EUR" }, { name: "Current", currency: "USD" }],
    lastRunAt: "2026-11-12T09:50:00.000Z", lastOkAt: "2026-11-12T09:50:00.000Z", lastError: null, lastAdded: 2, canConnectHere: true });
  assert.ok(!JSON.stringify(st).includes(SID) && !JSON.stringify(st).includes("uid-") && !JSON.stringify(st).includes("Sam Example"), "no session id, no account ids, no holder name");
  assert.equal(B.bankLine(st, NOW + 60000), "Revolut: read today at 06:50 · 2 payments in · approval ends in 86 days");
  assert.equal(B.bankLine({ ...st, lastAdded: 1, daysLeft: 1 }, NOW + DAY), "Revolut: read yesterday at 06:50 · 1 payment in · approval ends tomorrow");
  assert.equal(B.bankLine({ ...st, lastAdded: 0, daysLeft: 0 }, NOW + 3 * DAY), "Revolut: read on 12 Nov at 06:50 · no new payments · approval ends today");
  assert.equal(B.bankLine({ ...st, lastRunAt: new Date(NOW + DAY).toISOString(), lastError: B.SAY.readerDown }, NOW + DAY), "Revolut: read yesterday at 06:50 · the last read failed · approval ends in 86 days");
  assert.equal(B.bankLine({ ...st, lastOkAt: null, lastAdded: null }, NOW), "Revolut: not read yet · approval ends in 86 days");

  const soon = await B.bankStatus({ bank: await connectedBank({ validUntil: new Date(NOW + 10 * DAY).toISOString() }), env: ENV, now: NOW, canConnectHere: true });
  assert.deepEqual([soon.connected, soon.daysLeft, soon.expiring], [true, 10, true]);
  const edge = await B.bankStatus({ bank: await connectedBank({ validUntil: new Date(NOW + 14.5 * DAY).toISOString() }), env: ENV, now: NOW });
  assert.deepEqual([edge.daysLeft, edge.expiring], [14, true]);
  const fifteen = await B.bankStatus({ bank: await connectedBank({ validUntil: new Date(NOW + 15.5 * DAY).toISOString() }), env: ENV, now: NOW });
  assert.equal(fifteen.expiring, false);
  for (const extra of [{ validUntil: new Date(NOW - 1000).toISOString() }, { gone: new Date(NOW).toISOString() }]) {
    const ex = await B.bankStatus({ bank: await connectedBank(extra), env: ENV, now: NOW });
    assert.deepEqual([ex.connected, ex.needsApproval, ex.daysLeft, ex.expiring, ex.lastError], [false, true, null, false, "Revolut has to be approved again: press Connect Revolut"]);
    assert.equal(B.bankLine(ex, NOW), "Revolut has to be approved again");
  }
});

/* ---------------------------------------------------------------- classify */
test("bank classify: own name, the equal-and-opposite pair, Revolut's own wording, refunds, known sources, the rest unsorted", () => {
  const ctx = { uid: "uid-eur", holders: ["Sam Example", "Current"], sources: SOURCES, debits: [{ uid: "uid-sav", amount: 50, currency: "EUR", date: "2026-11-03" }] };
  const kind = (o, c = ctx) => { const r = B.classify(tx({ date: "2026-11-05", amount: 10, ...o }), c); return r && [r.kind, r.why]; };
  assert.deepEqual(kind({ payer: "SAM EXAMPLE" }), ["transfer", "own name"]);
  assert.deepEqual(kind({ payer: "Example, Sám" }), ["transfer", "own name"], "accents, case and order ignored");
  assert.deepEqual(kind({ payer: "Mr Sam Example" }), ["transfer", "own name"]);
  assert.deepEqual(kind({ payer: "Sam Example Music Ltd" }), ["unsorted", "unknown payer"], "a company with his name in it is not him");
  assert.deepEqual(kind({ payer: "Current" }), ["unsorted", "unknown payer"], "a one-word 'holder' never matches");
  /* the pair: 50 out of Savings on the 3rd, 50 into Current on the 5th */
  const pair = B.classify(tx({ date: "2026-11-05", amount: "50.00", text: "Transfer" }), ctx);
  assert.deepEqual(pair, { kind: "transfer", why: "pair", pair: 0 });
  assert.deepEqual(kind({ amount: 50, text: "Transfer" }, { ...ctx, uid: "uid-sav" }), ["unsorted", "unknown payer"], "not from the same account");
  assert.deepEqual(kind({ amount: 50, cur: "USD", text: "Transfer" }), ["unsorted", "unknown payer"], "not across currencies");
  assert.deepEqual(kind({ amount: 50, date: "2026-11-07", text: "Transfer" }), ["unsorted", "unknown payer"], "not 4 days apart");
  assert.deepEqual(kind({ amount: 50.01, text: "Transfer" }), ["unsorted", "unknown payer"]);
  assert.deepEqual(kind({ amount: 50, payer: "Northlight Records Ltd" }), ["income", "source"], "a known payer is never hidden by a look-alike debit");
  /* Revolut's wording for Luke's own moves */
  for (const [text, why] of [["Exchanged to EUR", "exchange"], ["Exchanged from USD", "exchange"], ["To pocket EUR Holiday from EUR", "pocket"], ["From Savings Vault", "pocket"],
    ["Withdrawing savings", "pocket"], ["Top-Up by *1234", "card top-up"], ["Apple Pay Top-Up by *9876", "card top-up"], ["Google Pay top-up", "card top-up"]])
    assert.deepEqual(kind({ text }), ["transfer", why], text);
  assert.deepEqual(kind({ payer: "Savings & Loan Example Co", text: "Payment from Savings & Loan Example Co" }), ["unsorted", "unknown payer"], "'from Savings' inside a sentence is not a pocket");
  assert.deepEqual(kind({ payer: "Made-up Friend", text: "Payment from Made-up Friend" }), ["unsorted", "unknown payer"], "an incoming bank transfer from someone else is not a top-up");
  /* refunds: not income, left out */
  for (const text of ["Refund from Example Shop", "Card refund", "REVERSAL Example Air", "Chargeback 0042"]) assert.deepEqual(kind({ text, payer: "Example Shop" }), ["refund", "refund"], text);
  /* income from a known source, with its category; the payer may be written any way the bank likes */
  const inc = B.classify(tx({ date: "2026-11-05", amount: 100, payer: "NORTHLIGHT RECORDS LIMITED" }), ctx);
  assert.deepEqual(inc, { kind: "income", why: "source", source: { id: "northlight", name: "Northlight Records Ltd", category: "Label deals" } });
  assert.equal(B.classify(tx({ date: "2026-11-05", amount: 5, text: "SAMPLE PUBLISHING ROYALTIES Q3" }), ctx).kind, "income", "no payer name: the first line of the text is the payer");
  assert.deepEqual(kind({ payer: "Revolut" }), ["unsorted", "unknown payer"], "an account on the list of sources is not a payer");
  assert.deepEqual(kind({ payer: "Made-up Friend" }), ["unsorted", "unknown payer"]);
  /* not credits, not booked, not readable: no answer at all */
  for (const o of [{ out: true, payer: "Northlight" }, { status: "PDNG", payer: "Northlight" }, { status: "pending" }, { status: "CNCL" }, { amount: "x" }, { amount: 0 }, { date: "" }])
    assert.equal(B.classify(tx({ date: "2026-11-05", amount: 10, ...o }), ctx), null, JSON.stringify(o));
  assert.equal(B.classify({ ...tx({ date: "2026-11-05", amount: 10 }), credit_debit_indicator: undefined }, ctx), null, "no direction: never guessed");
  assert.equal(B.classify({ ...tx({ date: "2026-11-05", amount: 10, payer: "Made-up Friend" }), status: undefined }, ctx).kind, "unsorted", "no status at all counts as booked");
  assert.deepEqual(B.readTx(tx({ date: "2026-11-05", amount: "-12.345", cur: "eur" })).amount, 12.35);
  assert.equal(B.payerOf(B.readTx(tx({ date: "2026-11-05", amount: 1, text: ["IE29 AIBK 9311 5212 3456 78 rent share", "second line"] }))), "rent share", "an account number in the text is never kept");
  assert.equal(B.payerOf(B.readTx(tx({ date: "2026-11-05", amount: 1 }))), "Unknown payer");
  assert.equal(B.normName(" Lúke  O'Example "), "example luke o");
});

/* ---------------------------------------------------------------- the refresh */
const MONTH = [
  tx({ id: "t-inc-1", date: "2026-11-03", amount: "100.00", payer: "NORTHLIGHT RECORDS LIMITED", text: "INV 0042" }),
  tx({ id: "t-pend", date: "2026-11-04", amount: "20.00", payer: "Made-up Friend", status: "PDNG" }),
  tx({ id: "t-out-1", date: "2026-11-04", amount: "30.00", out: true, text: "Example Shop" }),
  tx({ id: "t-friend", date: "2026-11-05", amount: "25.00", payer: "Made-up Friend", text: ["Dinner", "IE29 AIBK 9311 5212 3456 78"] }),
  tx({ id: "t-refund", date: "2026-11-06", amount: "9.99", payer: "Example Shop", text: "Refund from Example Shop" }),
  tx({ id: "t-own", date: "2026-11-07", amount: "200.00", payer: "Sam Example", text: "Payment from Sam Example" }),
  tx({ id: "t-leg-in", date: "2026-11-08", amount: "50.00", text: "Transfer" }),
];
const SAVINGS = [tx({ id: "t-leg-out", date: "2026-11-08", amount: "50.00", out: true, text: "Transfer" })];

test("bank refresh: only booked credits; first run from the 1st of last month; the 7-day overlap never doubles anything; 'checked today'", async () => {
  const bank = await connectedBank(), desk = await deskWithSources();
  const f = fakeReader({ pages: { "uid-eur": [{ transactions: MONTH }], "uid-sav": [{ transactions: SAVINGS }] } });
  const s = await B.syncBank({ bank, desk, env: ENV, now: NOW, fetchImpl: f });
  assert.deepEqual(s, { ok: true, at: "2026-11-12T09:50:00.000Z", connected: true, accounts: 3, pages: 3, booked: 7, credits: 5, income: 1, unsorted: 1, transfers: 2, refunds: 1,
    added: 4, updated: 0, upgraded: 0, already: 0, skipped: 0, newPayments: 2, more: false, checked: true, error: null });
  const tq = f.calls.filter((c) => c.path.endsWith("/transactions"));
  assert.deepEqual(tq.map((c) => [c.path, c.query]), ACCOUNTS.map((a) => [`/accounts/${a.uid}/transactions`, { date_from: "2026-10-01" }]));
  assert.ok(f.calls.every((c) => c.method === "GET"), "the refresh only reads");
  const entries = await allEntries(desk);
  assert.deepEqual(entries.map((e) => [e.reference, e.status, e.payer, e.amount, e.currency, e.account, e.by, e.date, e.category, e.note]).sort(), [
    ["t-friend", "unsorted", "Made-up Friend", 25, "EUR", "Revolut", "HQ", "2026-11-05", "Other", "Read from Revolut"],
    ["t-inc-1", "received", "NORTHLIGHT RECORDS LIMITED", 100, "EUR", "Revolut", "HQ", "2026-11-03", "Label deals", "Read from Revolut"],
    ["t-leg-in", "transfer", "Transfer", 50, "EUR", "Revolut", "HQ", "2026-11-08", "Other", "Read from Revolut"],
    ["t-own", "transfer", "Sam Example", 200, "EUR", "Revolut", "HQ", "2026-11-07", "Other", "Read from Revolut"]]);
  assert.equal(entries.find((e) => e.reference === "t-inc-1").source, "northlight");
  const kept = JSON.stringify([...desk._map.entries()]);
  for (const never of ["AIBK", "987.65", "Dinner", "INV 0042", "t-pend", "t-refund", "t-out-1"]) assert.ok(!kept.includes(never), never + " must not be on the desk");
  const inc = await S.incomeState(desk, NOW);
  assert.deepEqual([inc.received, inc.pending, inc.unsortedCount], [{ EUR: 100 }, {}, 1]);
  assert.ok(inc.problems.includes("1 payment in Revolut that nobody has sorted yet"));
  const rev = inc.accounts.find((a) => a.id === "revolut");
  assert.deepEqual([rev.verdict, rev.checked], ["ok", { day: "2026-11-12", by: "HQ", new: 2 }], "the dashboard shows Revolut checked today");
  const sync = await doc(bank, "sync.json");
  assert.deepEqual(sync.perAccount, { "uid-eur": { lastDate: "2026-11-12" }, "uid-sav": { lastDate: "2026-11-12" }, "uid-usd": { lastDate: "2026-11-12" } });
  assert.deepEqual([sync.lastRunAt, sync.lastOkAt, sync.lastError, sync.lastAdded, sync.totals.added, sync.totals.runs], ["2026-11-12T09:50:00.000Z", "2026-11-12T09:50:00.000Z", null, 2, 4, 1]);
  assert.ok(!JSON.stringify(sync).includes(SID));

  /* the next day: from lastDate minus 7 days; the same rows again change nothing */
  f.calls.length = 0;
  const s2 = await B.syncBank({ bank, desk, env: ENV, now: NOW + DAY, fetchImpl: f });
  assert.deepEqual(f.calls.filter((c) => c.path.endsWith("/transactions")).map((c) => c.query.date_from), ["2026-11-05", "2026-11-05", "2026-11-05"]);
  assert.deepEqual([s2.ok, s2.added, s2.updated, s2.already, s2.newPayments, s2.checked], [true, 0, 0, 4, 0, true]);
  assert.equal((await allEntries(desk)).length, 4);
  assert.deepEqual((await S.incomeState(desk, NOW + DAY)).received, { EUR: 100 });
  assert.equal((await doc(bank, "sync.json")).lastAdded, 0);

  /* Luke sorts the friend's 25 as "not income"; the bank sees it again: his answer stays */
  const friend = (await allEntries(desk)).find((e) => e.reference === "t-friend");
  await S.sortIncome(desk, NOW + DAY, S.DEFAULT_ROSTER, { by: "Luke", id: friend.id, month: "2026-11", status: "transfer" });
  await B.syncBank({ bank, desk, env: ENV, now: NOW + 2 * DAY, fetchImpl: f });
  assert.equal((await allEntries(desk)).find((e) => e.reference === "t-friend").status, "transfer");
  /* a source added later: an UNSORTED payment from it becomes income on the next read */
  const d2 = await deskWithSources(), b2 = await connectedBank();
  const one = fakeReader({ pages: { "uid-eur": [{ transactions: [tx({ id: "t-x", date: "2026-11-09", amount: 70, payer: "Example Strings Ltd" })] }] } });
  await B.syncBank({ bank: b2, desk: d2, env: ENV, now: NOW, fetchImpl: one });
  assert.equal((await allEntries(d2))[0].status, "unsorted");
  await S.setSources(d2, SOURCES.concat({ id: "strings", name: "Example Strings", category: "Production", match: ["example strings"] }));
  const s3 = await B.syncBank({ bank: b2, desk: d2, env: ENV, now: NOW + DAY, fetchImpl: one });
  assert.deepEqual([s3.updated, (await allEntries(d2))[0].status, (await allEntries(d2))[0].category, (await allEntries(d2)).length], [1, "received", "Production", 1]);
});

test("bank refresh: the page cap and the time cap stop a run; the next run carries on where it stopped", async () => {
  const pages = (n, uid = "e") => Array.from({ length: n }, (_, i) => ({ transactions: [tx({ id: `${uid}-${i}`, date: "2026-11-0" + (i + 1), amount: 10 + i, payer: "Made-up Friend " + i })], ...(i < n - 1 ? { continuation_key: "page-" + (i + 1) } : {}) }));
  /* pages: 3 pages, at most 2 a run */
  const bank = await connectedBank({ accounts: [ACCOUNTS[0]] }), desk = await deskWithSources();
  const f = fakeReader({ pages: { "uid-eur": pages(3) } });
  const a = await B.syncBank({ bank, desk, env: ENV, now: NOW, fetchImpl: f, pagesPerAccount: 2 });
  assert.deepEqual([a.ok, a.pages, a.added, a.more, a.checked], [true, 2, 2, true, false], "not every page read: no 'checked today' yet");
  assert.deepEqual((await doc(bank, "sync.json")).perAccount, { "uid-eur": { cursor: { key: "page-2", dateFrom: "2026-10-01" } } });
  f.calls.length = 0;
  const b = await B.syncBank({ bank, desk, env: ENV, now: NOW + DAY, fetchImpl: f, pagesPerAccount: 2 });
  assert.deepEqual(f.calls.map((c) => c.query), [{ date_from: "2026-10-01", continuation_key: "page-2" }]);
  assert.deepEqual([b.pages, b.added, b.more, b.checked], [1, 1, false, true]);
  assert.deepEqual((await doc(bank, "sync.json")).perAccount, { "uid-eur": { lastDate: "2026-11-13" } });
  assert.equal((await allEntries(desk)).length, 3);
  /* a saved place the reader no longer knows: the account is read again from the start, nothing doubled */
  await bank.setJSON("sync.json", { perAccount: { "uid-eur": { cursor: { key: "page-9", dateFrom: "2026-10-01" } } } });
  const reader = fakeReader({ pages: { "uid-eur": pages(3) } });
  const wrapped = async (url, init) => (new URL(url).searchParams.get("continuation_key") === "page-9" ? ok({ error: "WRONG_CONTINUATION_KEY" }, 400) : reader(url, init));
  const c = await B.syncBank({ bank, desk, env: ENV, now: NOW + 2 * DAY, fetchImpl: wrapped });
  assert.deepEqual([c.ok, c.pages, c.added, c.already, c.more], [true, 3, 0, 3, false]);

  /* time: each request takes 5 s of a 20 s budget; reading stops at 60 % of it, the rest is for the desk */
  let t = 0;
  const bank2 = await connectedBank({ accounts: [ACCOUNTS[0]] }), desk2 = await deskWithSources();
  const slow = fakeReader({ pages: { "uid-eur": pages(5) }, tick: () => { t += 5000; } });
  const d = await B.syncBank({ bank: bank2, desk: desk2, env: ENV, now: NOW, fetchImpl: slow, clock: () => t });
  assert.deepEqual([d.ok, d.pages, d.added, d.more, d.checked], [true, 3, 3, true, false]);
  assert.deepEqual((await doc(bank2, "sync.json")).perAccount, { "uid-eur": { cursor: { key: "page-3", dateFrom: "2026-10-01" } } });
  t = 0;
  const e = await B.syncBank({ bank: bank2, desk: desk2, env: ENV, now: NOW + DAY, fetchImpl: slow, clock: () => t });
  assert.deepEqual([e.pages, e.added, e.more, e.checked], [2, 2, false, true]);
  assert.equal((await allEntries(desk2)).length, 5);

  /* the desk's share of the time runs out: what was written stays, NOTHING is marked as read, so the
     next run reads the same pages again and finishes (what is already on the desk is not doubled) */
  let u = 0;
  const bank3 = await connectedBank({ accounts: [ACCOUNTS[0]] }), desk3 = await deskWithSources();
  const late = fakeReader({ pages: { "uid-eur": [{ transactions: MONTH }] }, tick: () => { u += 11000; } });
  const origSubmit = desk3.setJSON.bind(desk3);
  desk3.setJSON = async (k, v, o) => { if (k.startsWith("inc/")) u += 5000; return origSubmit(k, v, o); };
  const g = await B.syncBank({ bank: bank3, desk: desk3, env: ENV, now: NOW, fetchImpl: late, clock: () => u });
  assert.deepEqual([g.ok, g.more, g.checked, g.added], [true, true, false, 2]);
  assert.deepEqual((await doc(bank3, "sync.json")).perAccount ?? {}, {}, "no account marked as read");
  u = 0; desk3.setJSON = origSubmit;
  const h = await B.syncBank({ bank: bank3, desk: desk3, env: ENV, now: NOW, fetchImpl: fakeReader({ pages: { "uid-eur": [{ transactions: MONTH }] } }), clock: () => u });
  assert.deepEqual([h.added, h.already, h.refunds, h.more, h.checked], [2, 2, 1, false, true]);
  assert.deepEqual((await doc(bank3, "sync.json")).perAccount, { "uid-eur": { lastDate: "2026-11-12" } });
});

test("bank refresh: a statement logged as pending is turned into received, never doubled (other wording, other month, its own reference)", async () => {
  const bank = await connectedBank({ accounts: [ACCOUNTS[0]] }), desk = await deskWithSources();
  const R = S.DEFAULT_ROSTER;
  await S.submitIncome(desk, NOW, R, { bot: "Ledger", date: "2026-10-28", payer: "Northlight Records Ltd", amount: 100, currency: "EUR", account: "Statement only", status: "pending", category: "Label deals" });
  await S.submitIncome(desk, NOW, R, { bot: "Ledger", date: "2026-10-30", payer: "Sample Publishing", amount: 60, currency: "EUR", account: "Statement only", status: "pending", category: "Publishing", reference: "ST-55" });
  await S.submitIncome(desk, NOW, R, { bot: "Ledger", date: "2026-11-10", payer: "Northlight Records Ltd", amount: 75, currency: "EUR", account: "Statement only", status: "pending", category: "Label deals" });
  const rows = [tx({ id: "t-n", date: "2026-11-03", amount: "100.00", payer: "NORTHLIGHT RECORDS LIMITED" }), tx({ id: "t-p", date: "2026-11-04", amount: "60.00", payer: "SAMPLE PUBLISHING LLC" }),
    tx({ id: "t-n2", date: "2026-11-05", amount: "75.00", payer: "NORTHLIGHT RECORDS LIMITED" })];
  const f = fakeReader({ pages: { "uid-eur": [{ transactions: rows }] } });
  const s = await B.syncBank({ bank, desk, env: ENV, now: NOW, fetchImpl: f });
  assert.deepEqual([s.income, s.upgraded, s.updated, s.added], [3, 2, 2, 1], "two statements landed; the 75 statement is dated AFTER its credit, so that credit is a payment of its own");
  const all = await allEntries(desk);
  assert.equal(all.length, 4);
  const n = all.find((e) => e.amount === 100);
  assert.deepEqual([n.status, n.payer, n.date, n.arrived, n.account, n.reference, n.history.at(-1).by], ["received", "Northlight Records Ltd", "2026-10-28", "2026-11-03", "Revolut", "t-n", "HQ"]);
  const p = all.find((e) => e.amount === 60);
  assert.deepEqual([p.status, p.reference, p.arrived], ["received", "ST-55", "2026-11-04"], "the statement keeps its own reference");
  const inc = await S.incomeState(desk, NOW);
  assert.deepEqual([inc.received, inc.pending], [{ EUR: 235 }, { EUR: 75 }]);
  /* read again (the 7-day overlap, and a week later): still one payment each */
  for (const k of [1, 7]) {
    const again = await B.syncBank({ bank, desk, env: ENV, now: NOW + k * DAY, fetchImpl: f });
    assert.deepEqual([again.added, again.updated, again.already], [0, 0, 3], "day +" + k);
  }
  assert.equal((await allEntries(desk)).length, 4);
  assert.deepEqual((await S.incomeState(desk, NOW + 7 * DAY)).received, { EUR: 235 });
});

test("bank refresh: an odd payer name is skipped, the run goes on; an expired approval and a broken reader are said plainly", async () => {
  const bank = await connectedBank({ accounts: [ACCOUNTS[0]] }), desk = await deskWithSources();
  const rows = [tx({ id: "t-odd", date: "2026-11-03", amount: 5, payer: "password: hunter22x" }), tx({ id: "t-ok", date: "2026-11-04", amount: 6, payer: "Made-up Friend" }),
    tx({ id: "sk_live_" + "A1b2C3d4E5f6G7h8J9k0", date: "2026-11-04", amount: 7, payer: "Another Friend" })];
  const s = await B.syncBank({ bank, desk, env: ENV, now: NOW, fetchImpl: fakeReader({ pages: { "uid-eur": [{ transactions: rows }] } }) });
  assert.deepEqual([s.ok, s.skipped, s.added, s.checked, s.error], [true, 2, 1, true, null]);
  assert.ok(!JSON.stringify([...desk._map.entries()]).includes("hunter22x"));

  /* the approval is gone (the reader answers 401): connected false, the plain sentence, no more calls */
  const gone = fakeReader({ fail: (m, p) => (p.endsWith("/transactions") ? ok({ code: 401, message: "Unauthorized" }, 401) : null) });
  const g = await B.syncBank({ bank, desk, env: ENV, now: NOW + DAY, fetchImpl: gone });
  assert.deepEqual([g.ok, g.connected, g.error], [false, false, "Revolut has to be approved again: press Connect Revolut"]);
  const st = await B.bankStatus({ bank, env: ENV, now: NOW + DAY, canConnectHere: true });
  assert.deepEqual([st.connected, st.needsApproval, st.lastError], [false, true, B.SAY.again]);
  gone.calls.length = 0;
  assert.equal((await B.syncBank({ bank, desk, env: ENV, now: NOW + 2 * DAY, fetchImpl: gone })).error, B.SAY.again);
  assert.equal(gone.calls.length, 0, "an expired approval is not asked again");
  /* "the session is gone" in other words, and a date that has passed */
  for (const [answer, status] of [[{ error: "EXPIRED_SESSION", message: "Session expired" }, 400], [{ message: "Session not found" }, 404]]) {
    const b = await connectedBank({ accounts: [ACCOUNTS[0]] });
    const r = await B.syncBank({ bank: b, desk, env: ENV, now: NOW, fetchImpl: fakeReader({ fail: (m, p) => (p.endsWith("/transactions") ? ok(answer, status) : null) }) });
    assert.equal(r.error, B.SAY.again, JSON.stringify(answer));
  }
  const old = await connectedBank({ validUntil: new Date(NOW - 1000).toISOString() });
  const none = fakeReader();
  assert.equal((await B.syncBank({ bank: old, desk, env: ENV, now: NOW, fetchImpl: none })).error, B.SAY.again);
  assert.equal(none.calls.length, 0);

  /* anything else: a plain sentence, the connection is kept, the next run tries again */
  const b500 = await connectedBank({ accounts: [ACCOUNTS[0]] });
  await b500.setJSON("sync.json", { lastOkAt: new Date(NOW - DAY).toISOString(), perAccount: { "uid-eur": { lastDate: "2026-11-11" } } });
  const r = await B.syncBank({ bank: b500, desk, env: ENV, now: NOW, fetchImpl: fakeReader({ fail: (m, p) => (p.endsWith("/transactions") ? ok({ error: "ASPSP_ERROR" }, 500) : null) }) });
  assert.deepEqual([r.ok, r.connected, r.error, r.checked], [false, true, B.SAY.readerDown, false]);
  const st5 = await B.bankStatus({ bank: b500, env: ENV, now: NOW });
  assert.deepEqual([st5.connected, st5.lastError, st5.lastOkAt], [true, B.SAY.readerDown, new Date(NOW - DAY).toISOString()]);
  assert.deepEqual((await doc(b500, "sync.json")).perAccount, { "uid-eur": { lastDate: "2026-11-11" } }, "where it got to is not moved on");
  const three = await connectedBank();
  const net = await B.syncBank({ bank: three, desk, env: ENV, now: NOW, fetchImpl: async (u) => { if (String(u).includes("uid-sav")) throw new Error("ECONNRESET"); return fakeReader()(u); } });
  assert.deepEqual([net.ok, net.accounts, net.error], [false, 2, B.SAY.someAccounts]);
  /* not configured / not connected: nothing is called, nothing is written */
  const nobody = memoryDesk(), quiet = fakeReader();
  assert.equal((await B.syncBank({ bank: nobody, desk, env: ENV, now: NOW, fetchImpl: quiet })).error, "Revolut is not connected");
  assert.equal((await B.syncBank({ bank: bank, desk, env: {}, now: NOW, fetchImpl: quiet })).error, "The site is missing its Revolut settings");
  assert.equal(quiet.calls.length, 0); assert.equal(nobody._map.size, 0);
  /* the desk itself fails: said, and nothing is marked as read */
  const broken = await deskWithSources(), b6 = await connectedBank({ accounts: [ACCOUNTS[0]] });
  broken.setJSON = async () => { throw new Error("store down"); };
  const w = await B.syncBank({ bank: b6, desk: broken, env: ENV, now: NOW, fetchImpl: fakeReader({ pages: { "uid-eur": [{ transactions: MONTH }] } }) });
  assert.deepEqual([w.ok, w.error, w.checked], [false, B.SAY.desk, false]);
  assert.equal((await doc(b6, "sync.json")).perAccount, undefined);
});

/* ---------------------------------------------------------------- the doors */
const FAKE = new URL("./fixtures/fake-blobs.mjs", import.meta.url).href;
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: FAKE, shortCircuit: true } : next(spec, ctx); } });

test("bank endpoints: who may call what; the callback's two answers; nothing secret in any answer or log line", async () => {
  const HENV = { ADMIN_KEY: "correct horse", STAFF_BOT_KEY: "bot-key-for-tests-0123456789", STAFF_CLAUDE_KEY: "claude-key-for-tests-0123456789", ...ENV };
  globalThis.Netlify = { env: { get: (k) => HENV[k] } };
  const reader = fakeReader({ pages: { "uid-eur": [{ transactions: MONTH }] } });
  globalThis.fetch = reader;
  const lines = [], log = console.log, err = console.error;
  console.log = (...a) => lines.push(a.join(" ")); console.error = (...a) => lines.push(a.join(" "));
  try {
    const { default: bankFn, config } = await import("../netlify/functions/bank.mjs");
    const { config: daily } = await import("../netlify/functions/banksync.mjs");
    assert.deepEqual(config, { path: "/api/bank/*" }); assert.deepEqual(daily, { schedule: "50 9 * * *" });
    const prod = { deploy: { context: "production" } }, preview = { deploy: { context: "deploy-preview" } };
    const cookie = sessionCookie(await makeSession("correct horse")).split(";")[0];
    const answers = [];
    const call = async (method, path, { auth, origin, ctx = prod } = {}) => {
      const headers = {};
      if (auth === "luke") headers.cookie = cookie; else if (auth) headers.authorization = "Bearer " + auth;
      if (origin) headers.origin = origin;
      const res = await bankFn(new Request("https://badscandal.com/api/bank/" + path, { method, headers }), ctx);
      const text = await res.text();
      answers.push(text + " " + (res.headers.get("location") || ""));
      return { status: res.status, body: text ? JSON.parse(text) : null, location: res.headers.get("location") };
    };
    const LUKE = { auth: "luke", origin: "https://badscandal.com" };
    /* who */
    assert.equal((await call("GET", "status")).status, 401);
    assert.equal((await call("GET", "status", { auth: "wrong-key-0123456789" })).status, 401);
    for (const [m, p] of [["GET", "status"], ["POST", "sync"], ["POST", "connect"], ["POST", "disconnect"]]) assert.equal((await call(m, p, { auth: HENV.STAFF_BOT_KEY })).status, 403, "bots: " + p);
    assert.equal((await call("GET", "status", { auth: HENV.STAFF_CLAUDE_KEY })).status, 200);
    assert.equal((await call("POST", "connect", { auth: HENV.STAFF_CLAUDE_KEY })).status, 403, "Claude can't connect");
    assert.equal((await call("POST", "disconnect", { auth: HENV.STAFF_CLAUDE_KEY })).status, 403, "Claude can't disconnect");
    for (const p of ["connect", "sync", "disconnect"]) assert.equal((await call("POST", p, { auth: "luke", origin: "https://evil.example" })).status, 403, "foreign origin: " + p);
    assert.equal((await call("POST", "status", LUKE)).status, 405);
    assert.equal((await call("GET", "connect", LUKE)).status, 405);
    assert.equal((await call("GET", "nope", LUKE)).status, 404);
    /* status before */
    const before = await call("GET", "status", { auth: "luke" });
    assert.deepEqual([before.body.configured, before.body.connected, before.body.canConnectHere], [true, false, true]);
    assert.equal((await call("GET", "status", { auth: "luke", ctx: preview })).body.canConnectHere, false);
    /* connect: not on a preview; not without the settings */
    assert.deepEqual(await call("POST", "connect", { ...LUKE, ctx: preview }), { status: 409, body: { error: B.SAY.preview }, location: null });
    delete HENV.ENABLE_BANKING_PRIVATE_KEY;
    assert.deepEqual((await call("POST", "connect", LUKE)), { status: 503, body: { error: B.SAY.missing }, location: null });
    HENV.ENABLE_BANKING_PRIVATE_KEY = "junk";
    assert.deepEqual((await call("POST", "connect", LUKE)).body, { error: B.SAY.keyBad });
    HENV.ENABLE_BANKING_PRIVATE_KEY = KEY64;
    const c = await call("POST", "connect", LUKE);
    assert.deepEqual(c, { status: 200, body: { url: "https://auth.example.test/approve?ref=made-up" }, location: null });
    const store = globalThis.__stores.get("bank");
    const nonce = [...store._map.keys()].find((k) => k.startsWith("state/")).slice(6, -5);
    /* the callback: public; a bad nonce -> failed, a good one -> connected */
    const CODE = "made-up-code-SECRET-42";
    const bad = await call("GET", `callback?code=${CODE}&state=not-the-nonce-0000000000`);
    assert.deepEqual([bad.status, bad.location], [302, "/hq?bank=failed#money"]);
    const good = await call("GET", `callback?code=${CODE}&state=${nonce}`);
    assert.deepEqual([good.status, good.location], [302, "/hq?bank=connected#money"]);
    assert.equal((await call("GET", `callback?code=${CODE}&state=${nonce}`)).location, "/hq?bank=failed#money", "used once only");
    const st = await call("GET", "status", { auth: HENV.STAFF_CLAUDE_KEY });
    assert.deepEqual([st.body.connected, st.body.accounts], [true, [{ name: "Current", currency: "EUR" }, { name: "USD account", currency: "USD" }]]);
    /* sync: Luke or Claude */
    const s = await call("POST", "sync", { auth: HENV.STAFF_CLAUDE_KEY });
    assert.deepEqual([s.status, s.body.ok, s.body.added, s.body.newPayments, s.body.transfers], [200, true, 4, 3, 1]);
    assert.equal((await call("POST", "sync", LUKE)).body.already, 4);
    /* a callback whose session exchange fails: failed, one scrubbed line */
    await call("POST", "connect", LUKE);
    const n2 = [...store._map.keys()].find((k) => k.startsWith("state/")).slice(6, -5);
    globalThis.fetch = fakeReader({ fail: (m, p) => (p === "/sessions" ? ok({ error: "WRONG_AUTHORIZATION_CODE", message: "code " + CODE + " is wrong" }, 422) : null) });
    const failed = await call("GET", `callback?code=${CODE}&state=${n2}`);
    assert.equal(failed.location, "/hq?bank=failed#money");
    assert.ok(lines.includes("bank callback failed: reader 422 WRONG_AUTHORIZATION_CODE"), lines.join("\n"));
    assert.equal((await call("GET", "status", { auth: "luke" })).body.connected, true, "a failed reconnect leaves the old connection");
    /* disconnect: Luke only; gives the approval back */
    globalThis.fetch = reader; reader.calls.length = 0;
    assert.deepEqual((await call("POST", "disconnect", LUKE)).body, { ok: true, connected: false });
    assert.deepEqual(reader.calls.map((c) => c.method + " " + c.path), ["DELETE /sessions/" + SID]);
    assert.equal((await call("GET", "status", { auth: "luke" })).body.connected, false);
    globalThis.fetch = fakeReader({ fail: () => ok({}, 500) });
    assert.equal((await call("POST", "disconnect", LUKE)).status, 200, "the reader's failure to take it back doesn't matter");
    /* nothing secret anywhere */
    const everything = answers.join("\n") + "\n" + lines.join("\n");
    for (const secret of [SID, CODE, nonce, n2, KEY64.slice(40, 80), "PRIVATE KEY", HENV.STAFF_CLAUDE_KEY, HENV.STAFF_BOT_KEY, "uid-eur", "Sam Example", FAKE_IBAN])
      assert.ok(!everything.includes(secret), "leaked: " + secret);
  } finally { console.log = log; console.error = err; }
});
