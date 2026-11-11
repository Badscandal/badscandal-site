/* The bank reader (11 Nov 2026): what comes INTO Luke's personal Revolut, read by itself once a day.

   Revolut has no API for personal accounts. The only lawful way in is PSD2 open banking through a
   licensed reader: Enable Banking (free "own accounts" tier, services ["AIS"] = account information
   only). NOTHING HERE CAN MOVE MONEY: every call is a read, except POST /auth + POST /sessions (asking
   for and finishing Luke's read-only approval) and DELETE /sessions/{id} (giving it back).

   How it talks to Enable Banking: every request carries a fresh RS256 JWT signed with the
   application's private key (kid = the application id); there is no token to refresh or store. What
   expires is Luke's approval ("consent"), at most 180 days, and only Luke can renew it, in Revolut.

   Netlify env (names only, Luke sets them): ENABLE_BANKING_APPLICATION_ID, ENABLE_BANKING_PRIVATE_KEY
   (the PEM, raw or base64 on one line), optional ENABLE_BANKING_ASPSP_NAME / _COUNTRY (default
   Revolut / IE). The redirect address registered with Enable Banking is exactly REDIRECT_URL.

   Blob store "bank" (strong consistency):
     conn.json          { sessionId, validUntil, aspsp, connectedAt, accounts:[{ uid, name, currency, idHash, holder }], gone? }
     state/<nonce>.json { at, validUntil }  single use, 10 minutes: the lock on the public callback
     sync.json          { lastRunAt, lastOkAt, lastError, perAccount:{ <uid>:{ lastDate, cursor? } }, lastAdded, totals, last }
   The session id is never returned by any endpoint and never logged.

   What a refresh does (syncBank): reads every account's transactions since (lastDate - 7 days), or
   the 1st of last month on the first run, keeps only BOOKED CREDITS, sorts each with classify() and
   puts it on the staff desk (netlify/lib/staff.mjs submitIncome, account "Revolut", bot "HQ"):
     transfer  Luke moving his own money (his own name as payer; an equal-and-opposite debit in another
               of his accounts within 3 days; Revolut's wording for exchanges, card top-ups, pockets)
     refund    a merchant refund / reversal: not income, skipped (counted in the summary)
     income    the payer is a known source on the desk -> received, with that source's category
     unsorted  anything else: on the desk as "unsorted" (in no total) until someone sorts it
   Then incomeCheck() so the dashboard shows "Revolut: checked today".

   Everything here takes the stores, the env, the clock and fetch as arguments (tests/bank.test.mjs). */
import { createHash, createPrivateKey, randomBytes, sign } from "node:crypto";
import * as S from "./staff.mjs";

export const API = "https://api.enablebanking.com";
export const REDIRECT_URL = "https://badscandal.com/api/bank/callback";
export const ACCOUNT = "Revolut"; /* the account name on the desk */
export const LIMITS = {
  pagesPerAccount: 12, /* per account per run; the next run continues */
  budgetMs: 20000, /* the whole refresh (the scheduled function may run 30 s) */
  httpBudgetMs: 8000, /* POST /api/bank/sync: a normal function is cut off at 10 s */
  overlapDays: 7, /* banks backdate bookings: re-read the week before; the desk never counts a payment twice */
  stateMinutes: 10, /* how long a Connect press stays valid */
  maxConsentDays: 180,
  expiringDays: 14,
  pairDays: 3, /* the two legs of Luke's own transfer may book up to 3 days apart */
  callMs: 9000, /* one request to the reader */
};
export const SAY = {
  again: "Revolut has to be approved again: press Connect Revolut",
  missing: "The site is missing its Revolut settings",
  notConnected: "Revolut is not connected",
  preview: "Connecting Revolut only works on badscandal.com itself, not on a preview.",
  keyBad: "The Revolut key on Netlify can't be read. Paste the private key again into ENABLE_BANKING_PRIVATE_KEY (the whole PEM, or that PEM in base64), then redeploy.",
  keyRefused: "Enable Banking refused the site's key. ENABLE_BANKING_APPLICATION_ID and ENABLE_BANKING_PRIVATE_KEY must come from the same application; after changing them, redeploy.",
  noBank: "Enable Banking does not list that bank. Check ENABLE_BANKING_ASPSP_NAME and ENABLE_BANKING_ASPSP_COUNTRY on Netlify (normally empty: Revolut, IE).",
  readerDown: "Revolut could not be read just now: the bank's reader did not answer properly. It tries again at the next daily read.",
  unreachable: "Revolut could not be reached just now. It tries again at the next daily read.",
  someAccounts: "One of the Revolut accounts could not be read just now. It tries again at the next daily read.",
  desk: "The payments could not be saved on the dashboard just now. It tries again at the next daily read.",
};

const DAY_MS = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const low = (s) => String(s == null ? "" : s).trim().toLowerCase();
const first = (...v) => { for (const x of v) if (typeof x === "string" && x.trim()) return x.trim(); return ""; };
const dayOf = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v.slice(0, 10) + "T12:00:00Z")) ? v.slice(0, 10) : "");
export const addDays = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
const daysApart = (a, b) => Math.abs(Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / DAY_MS));
const prevMonth = (m) => { const y = Number(m.slice(0, 4)), n = Number(m.slice(5, 7)); return n === 1 ? `${y - 1}-12` : `${y}-${String(n - 1).padStart(2, "0")}`; };
export const firstOfPrevMonth = (now) => prevMonth(iso(now).slice(0, 7)) + "-01";
const sha = (s) => createHash("sha256").update(String(s)).digest("hex");

/* ---------- settings ---------- */
export function readConfig(env) {
  const get = (k) => String((typeof env === "function" ? env(k) : env && env[k]) || "").trim();
  const applicationId = get("ENABLE_BANKING_APPLICATION_ID"), privateKey = get("ENABLE_BANKING_PRIVATE_KEY");
  return { configured: !!(applicationId && privateKey), applicationId, privateKey,
    aspsp: { name: get("ENABLE_BANKING_ASPSP_NAME") || "Revolut", country: (get("ENABLE_BANKING_ASPSP_COUNTRY") || "IE").toUpperCase() }, redirectUrl: REDIRECT_URL };
}

/* A failure that is safe to describe: what went wrong and the reader's HTTP status, never a body,
   an id, a code or a key. kind: missing | key | refused | gone | no_bank | reader | network | bad_answer | no_accounts | cancelled */
export class BankError extends Error {
  constructor(kind, status = 0, code = "") { super(`bank: ${kind}${status ? " " + status : ""}`); this.name = "BankError"; this.kind = kind; this.status = status; this.code = code; }
}
/* one log line, scrubbed: the kind, the HTTP status and the reader's error word (A_LIKE_THIS) only */
export const logLine = (e) => (e && e.name === "BankError" ? `${e.kind}${e.status ? " " + e.status : ""}${e.code ? " " + e.code : ""}` : (e && e.name) || "Error");

/* ---------- the signed assertion ---------- */
/* The key survives env systems better as base64 on one line; both forms are accepted (and a PEM whose
   line breaks were pasted as "\n"). */
export function decodePem(value) {
  let v = String(value || "").trim();
  if (!v) throw new BankError("missing");
  if (!v.includes("-----BEGIN")) {
    const d = Buffer.from(v.replace(/\s+/g, ""), "base64").toString("utf8");
    if (!d.includes("-----BEGIN")) throw new BankError("key");
    v = d.trim();
  }
  return v.replace(/\\n/g, "\n");
}
const b64u = (x) => Buffer.from(x).toString("base64url");
export function signJwt(cfg, nowMs) {
  if (!cfg || !cfg.applicationId) throw new BankError("missing");
  let key;
  try { key = createPrivateKey(decodePem(cfg.privateKey)); } catch (e) { throw e && e.name === "BankError" ? e : new BankError("key"); }
  const iat = Math.floor(nowMs / 1000);
  const data = b64u(JSON.stringify({ typ: "JWT", alg: "RS256", kid: cfg.applicationId })) + "." + b64u(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat, exp: iat + 3600 }));
  return data + "." + b64u(sign("RSA-SHA256", Buffer.from(data), key));
}

/* ---------- one request to the reader ---------- */
const GONE_WORDS = /(EXPIRED|REVOKED|CLOSED|INVALID)_SESSION|SESSION_(EXPIRED|REVOKED|CLOSED|NOT_FOUND|DOES_NOT_EXIST)|\b(session|consent)\b[^.]{0,40}\b(expired|revoked|closed|invalid|not found|does not exist|no longer)/i;
export async function ebCall(cfg, fetchImpl, now, method, path, body) {
  const token = signJwt(cfg, now);
  let res;
  try {
    res = await fetchImpl(API + path, { method, headers: { Authorization: "Bearer " + token, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(LIMITS.callMs) });
  } catch { throw new BankError("network"); }
  if (!res.ok) {
    const info = await res.json().catch(() => null);
    const word = info && typeof info.error === "string" && /^[A-Z][A-Z_]{2,40}$/.test(info.error) ? info.error : "";
    const text = info ? [info.error, info.message, info.detail].filter((x) => typeof x === "string").join(" ") : "";
    const gone = res.status === 401 || res.status === 403 || GONE_WORDS.test(text);
    const e = new BankError(gone ? "gone" : "reader", res.status, word);
    throw e;
  }
  if (res.status === 204) return {};
  try { return await res.json(); } catch { throw new BankError("bad_answer", res.status); }
}
const isGone = (e) => e && e.name === "BankError" && e.kind === "gone";

/* ---------- Connect: ask Revolut for Luke's read-only approval ---------- */
/* valid_until = the bank's maximum (seconds), at most 180 days, minus an hour (asking for exactly the
   maximum is refused often enough, between our clock and theirs) */
export function consentUntil(maxSeconds, now) {
  const cap = LIMITS.maxConsentDays * DAY_MS;
  const allowed = Number.isFinite(maxSeconds) && maxSeconds > 0 ? Math.min(maxSeconds * 1000, cap) : cap;
  return iso(now + Math.max(allowed > 2 * 3600000 ? allowed - 3600000 : allowed, 60000));
}
export async function startConnect({ bank, env, now, fetchImpl }) {
  const cfg = readConfig(env);
  if (!cfg.configured) throw new BankError("missing");
  signJwt(cfg, now); /* a key that can't be read is said before anything is stored */
  let list;
  try { list = await ebCall(cfg, fetchImpl, now, "GET", `/aspsps?country=${encodeURIComponent(cfg.aspsp.country)}`); }
  catch (e) { throw isGone(e) ? new BankError("refused", e.status, e.code) : e; }
  const all = Array.isArray(list) ? list : Array.isArray(list && list.aspsps) ? list.aspsps : [];
  const a = all.find((x) => x && low(x.name) === low(cfg.aspsp.name) && low(x.country) === low(cfg.aspsp.country));
  if (!a) throw new BankError("no_bank");
  const validUntil = consentUntil(Number(a.maximum_consent_validity), now);
  const state = randomBytes(24).toString("base64url");
  await bank.setJSON(`state/${state}.json`, { at: iso(now), validUntil }); /* stored BEFORE the browser goes anywhere */
  let body;
  try {
    body = await ebCall(cfg, fetchImpl, now, "POST", "/auth", { access: { valid_until: validUntil }, aspsp: { name: cfg.aspsp.name, country: cfg.aspsp.country }, state, redirect_url: cfg.redirectUrl, psu_type: "personal" });
  } catch (e) { await bank.delete(`state/${state}.json`).catch(() => {}); throw isGone(e) ? new BankError("refused", e.status, e.code) : e; }
  if (!body || typeof body.url !== "string" || !/^https:\/\/\S+$/.test(body.url)) { await bank.delete(`state/${state}.json`).catch(() => {}); throw new BankError("bad_answer"); }
  await pruneStates(bank, now);
  return { url: body.url };
}
/* presses of Connect that were never finished: older than the 10 minutes, they can only be clutter */
async function pruneStates(bank, now) {
  try {
    const { blobs } = await bank.list({ prefix: "state/" });
    for (const b of (blobs || []).slice(0, 50)) {
      const got = await bank.get(b.key, { type: "json" }).catch(() => null);
      if (!got || !(now - Date.parse(got.at) <= LIMITS.stateMinutes * 60000)) await bank.delete(b.key).catch(() => {});
    }
  } catch {}
}

/* ---------- the accounts the approval covers ---------- */
/* PSD2 names the account holder in "name" on /accounts/{uid}/details; Revolut's per-currency accounts
   often carry no label of their own, so the label is the description, the product, or "EUR account". */
const NUMBERS = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{2,4}){3,8}\b|(?:\d[ -]?){7,}\d/g; /* IBAN-shaped, or 8+ digits: never kept */
const noNumbers = (s, max) => S.clean(String(s || "").replace(NUMBERS, " ").replace(/\s+/g, " ").replace(/^[\s,.;:/-]+|[\s,.;:/-]+$/g, ""), max);
export function accountInfo(uid, details, fromSession) {
  const d = details && typeof details === "object" ? details : {}, f = fromSession && typeof fromSession === "object" ? fromSession : {};
  const cur = first(d.currency, f.currency).toUpperCase();
  const currency = /^[A-Z]{3}$/.test(cur) ? cur : null;
  const label = noNumbers(first(d.details, d.product, f.details, f.product), 60) || (currency ? `${currency} account` : "Account");
  return { uid: String(uid), name: label, currency, idHash: sha("eb|" + first(d.identification_hash, f.identification_hash, String(uid))).slice(0, 16), holder: noNumbers(first(d.name, f.name), 80) };
}

/* ---------- the callback: the bank sends Luke's browser back here ---------- */
const STATE_RE = /^[A-Za-z0-9_-]{20,64}$/;
/* -> { ok: true, accounts } or { ok: false, why: "state" } (an unknown, used or expired nonce:
   NOTHING is read, written or called). Other failures throw a BankError after the nonce is gone. */
export async function finishCallback({ bank, env, now, fetchImpl, code, state, error }) {
  if (!STATE_RE.test(String(state || ""))) return { ok: false, why: "state" };
  const key = `state/${state}.json`;
  const got = await bank.getWithMetadata(key, { type: "json", consistency: "strong" });
  const at = got && got.data ? Date.parse(got.data.at) : NaN;
  if (!got || !got.data || got.data.used || !(now - at <= LIMITS.stateMinutes * 60000) || now < at - 60000) return { ok: false, why: "state" };
  /* claim it (write only if unchanged): two copies of the same callback can't both go on */
  const claim = await bank.setJSON(key, { ...got.data, used: iso(now) }, got.etag ? { onlyIfMatch: got.etag } : {});
  if (claim && claim.modified === false) return { ok: false, why: "state" };
  try {
    if (error || !code) throw new BankError("cancelled");
    const cfg = readConfig(env);
    if (!cfg.configured) throw new BankError("missing");
    const sess = await ebCall(cfg, fetchImpl, now, "POST", "/sessions", { code: String(code) });
    const sessionId = sess && sess.session_id != null ? String(sess.session_id) : "";
    if (!sessionId) throw new BankError("bad_answer");
    const data = Array.isArray(sess.accounts_data) ? sess.accounts_data : [];
    const accounts = [];
    for (const entry of Array.isArray(sess.accounts) ? sess.accounts : []) {
      const uid = first(typeof entry === "string" ? entry : entry && entry.uid);
      if (!uid || accounts.some((a) => a.uid === uid)) continue;
      let details = null;
      try { details = await ebCall(cfg, fetchImpl, now, "GET", `/accounts/${encodeURIComponent(uid)}/details`); } catch {} /* the account is still kept without its details */
      accounts.push(accountInfo(uid, details, { ...(data.find((x) => x && first(x.uid) === uid) || {}), ...(entry && typeof entry === "object" ? entry : {}) }));
    }
    if (!accounts.length) throw new BankError("no_accounts");
    const vu = sess.access && Date.parse(sess.access.valid_until);
    const validUntil = Number.isFinite(vu) && vu > now ? iso(vu) : got.data.validUntil || consentUntil(null, now);
    const old = (await S.readDoc(bank, "conn.json", null)).data;
    await bank.setJSON("conn.json", { sessionId, validUntil, aspsp: { name: first(sess.aspsp && sess.aspsp.name) || cfg.aspsp.name, country: first(sess.aspsp && sess.aspsp.country) || cfg.aspsp.country },
      connectedAt: iso(now), accounts });
    await S.mutate(bank, "sync.json", {}, (s) => { s.lastError = null; s.connectedAt = iso(now); return { value: null }; }).catch(() => {});
    /* a previous approval is given back (its failure doesn't matter: it expires by itself) */
    if (old && old.sessionId && old.sessionId !== sessionId) await ebCall(cfg, fetchImpl, now, "DELETE", `/sessions/${encodeURIComponent(old.sessionId)}`).catch(() => {});
    return { ok: true, accounts: accounts.length };
  } finally {
    await bank.delete(key).catch(() => {});
  }
}

/* ---------- Disconnect ---------- */
export async function disconnect({ bank, env, now, fetchImpl }) {
  const conn = (await S.readDoc(bank, "conn.json", null)).data;
  const cfg = readConfig(env);
  if (conn && conn.sessionId && cfg.configured) await ebCall(cfg, fetchImpl, now, "DELETE", `/sessions/${encodeURIComponent(conn.sessionId)}`).catch(() => {});
  await bank.delete("conn.json");
  await S.mutate(bank, "sync.json", {}, (s) => { s.lastError = null; s.perAccount = {}; return { value: null }; }).catch(() => {});
  return { ok: true, connected: false };
}

/* ---------- what the dashboard is told ---------- */
export async function bankStatus({ bank, env, now, canConnectHere }) {
  const cfg = readConfig(env);
  const [c, s] = await Promise.all([S.readDoc(bank, "conn.json", null), S.readDoc(bank, "sync.json", {})]);
  const conn = c.data && c.data.sessionId ? c.data : null, sync = s.data || {};
  const vu = conn ? Date.parse(conn.validUntil) : NaN;
  const needsApproval = !!conn && (!!conn.gone || !(vu > now));
  const connected = !!conn && !needsApproval;
  const daysLeft = connected ? Math.max(0, Math.floor((vu - now) / DAY_MS)) : null;
  return {
    configured: cfg.configured, connected, needsApproval,
    aspsp: conn && conn.aspsp ? conn.aspsp.name || null : null,
    validUntil: conn ? conn.validUntil || null : null, daysLeft, expiring: connected && daysLeft <= LIMITS.expiringDays,
    accounts: conn ? (conn.accounts || []).map((a) => ({ name: a.name, currency: a.currency })) : [],
    lastRunAt: sync.lastRunAt || null, lastOkAt: sync.lastOkAt || null,
    lastError: needsApproval ? SAY.again : sync.lastError || null,
    lastAdded: Number.isInteger(sync.lastAdded) ? sync.lastAdded : null,
    canConnectHere: !!canConnectHere,
  };
}
/* The one sentence the dashboard shows. Times are São Paulo's, like the rest of /hq. */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function bankLine(st, now = Date.now()) {
  if (!st || !st.configured) return "The site is missing its Revolut settings";
  if (st.needsApproval) return "Revolut has to be approved again";
  if (!st.connected) return "Revolut is not connected";
  const parts = [];
  const ok = st.lastOkAt ? Date.parse(st.lastOkAt) : NaN;
  if (Number.isFinite(ok)) {
    const d = S.spDay(ok), today = S.spDay(now);
    const when = d === today ? "today" : d === addDays(today, -1) ? "yesterday" : `on ${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}`;
    parts.push(`Revolut: read ${when} at ${S.spHM(ok)}`);
  } else parts.push("Revolut: not read yet");
  const failedSince = st.lastError && (!Number.isFinite(ok) || Date.parse(st.lastRunAt) > ok);
  if (failedSince) parts.push("the last read failed");
  else if (Number.isFinite(ok) && Number.isInteger(st.lastAdded)) parts.push(st.lastAdded === 0 ? "no new payments" : `${st.lastAdded} payment${st.lastAdded === 1 ? "" : "s"} in`);
  parts.push(st.daysLeft === 0 ? "approval ends today" : st.daysLeft === 1 ? "approval ends tomorrow" : `approval ends in ${st.daysLeft} days`);
  return parts.join(" · ");
}

/* ---------- one transaction, read ---------- */
/* Booked = no status, or anything that isn't pending / cancelled / rejected / on hold / scheduled /
   information only (PSD2 statuses vary by bank; a whole account's history must not vanish over one
   unexpected word, but money that has not really landed must never be counted). */
const NOT_BOOKED = /pend|pdng|cncl|cancel|rjct|reject|hold|schd|sched|^info|^othr$/i;
export function readTx(t) {
  const raw = t && typeof t === "object" ? t : {};
  const m = raw.transaction_amount || {};
  const n = Number(m.amount);
  const cur = first(m.currency).toUpperCase();
  const ind = first(raw.credit_debit_indicator).toUpperCase();
  const rem = Array.isArray(raw.remittance_information) ? raw.remittance_information : typeof raw.remittance_information === "string" ? [raw.remittance_information] : [];
  const btc = raw.bank_transaction_code && typeof raw.bank_transaction_code === "object" ? raw.bank_transaction_code : {};
  const status = first(raw.status);
  return {
    amount: Number.isFinite(n) && n !== 0 ? Math.round(Math.abs(n) * 100) / 100 : null,
    currency: /^[A-Z]{3}$/.test(cur) ? cur : "",
    credit: ind === "CRDT" ? true : ind === "DBIT" ? false : null,
    booked: !status || !NOT_BOOKED.test(status),
    date: dayOf(raw.booking_date) || dayOf(raw.value_date) || dayOf(raw.transaction_date),
    payer: first(raw.debtor && raw.debtor.name), /* money IN: the payer is the debtor (the creditor is Luke) */
    remit: rem.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()),
    code: [btc.description, btc.code, btc.sub_code].filter((x) => typeof x === "string" && x.trim()).join(" "),
    id: first(raw.transaction_id, raw.entry_reference),
  };
}
/* the payer exactly as the bank gives it, else the first line of the payment text; numbers that could
   be an account (IBAN-shaped, 8+ digits) are never kept */
export const payerOf = (tx) => noNumbers(tx.payer, 80) || noNumbers(tx.remit[0], 80) || "Unknown payer";
export const refHash = (tx, payer) => "h" + sha([tx.date, tx.amount.toFixed(2), tx.currency, low(payer)].join("|")).slice(0, 24);
/* the reference on the desk: the bank's transaction id (else its entry reference), else a hash of
   date|amount|currency|payer. An id too long for the desk is hashed rather than cut (cut ids could collide). */
export function refOf(tx, payer) {
  const id = S.clean(tx.id, 200);
  if (!id) return refHash(tx, payer);
  return id.length <= 80 ? id : "t" + sha(id).slice(0, 32);
}

/* "Sam Example", "EXAMPLE SAM", "Sám  Example" are one name: accents, case, order and dots ignored */
export function normName(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ")
    .filter((w) => w && !["mr", "mrs", "ms", "dr"].includes(w)).sort().join(" ");
}
/* the desk's own rule for "this payer is that source" (netlify/lib/staff.mjs incomeReport) */
const srcMatches = (s, text) => { const t = low(text); return !!t && [low(s.name), s.id, ...(s.match || [])].filter(Boolean).some((k) => t.includes(k)); };
export function sourceFor(payer, sources) {
  const s = (Array.isArray(sources) ? sources : []).find((x) => x && x.kind !== "account" && x.id && srcMatches(x, payer));
  return s ? { id: s.id, name: s.name, category: s.category || "Other" } : null;
}

/* Revolut's own wording for moving Luke's own money (checked line by line, from the line's start, so
   "Payment from Savings & Co" is NOT taken for a savings move). Conservative on purpose: a payment that
   only looks a bit like a transfer stays "unsorted", where Luke sees it, rather than vanishing. */
export const OWN_MOVES = [
  [/^exchanged? (?:to|from) [A-Z]{3}\b/i, "exchange"], /* "Exchanged to EUR", "Exchanged from USD" */
  [/^(?:to|from) (?:pocket|vault|savings)\b/i, "pocket"], /* "To pocket EUR SAVING from EUR", "From Savings Vault" */
  [/^(?:pocket|vault|savings) (?:withdrawal|top-?up|transfer)\b/i, "pocket"],
  [/^withdrawing savings\b/i, "pocket"],
  [/\btop-?up by \*\d{4}\b/i, "card top-up"], /* "Top-Up by *1234", "Apple Pay Top-Up by *1234" */
  [/^(?:apple|google) pay (?:top-?up|deposit)\b/i, "card top-up"],
];
export const REFUND = /\b(?:refund(?:ed)?|reversal|reversed|reverted|chargeback)\b/i;

/* What a booked credit is. tx = Enable Banking's transaction as it comes; ctx = { uid (its account),
   holders (the account holders' names), debits (this run's booked debits: { uid, amount, currency,
   date }), sources (the desk's list) }. Checked in this order: own name, Revolut's wording, refund, known
   source, the pair. -> { kind, why, source?, pair? } (pair = the index of the
   matching debit, so the caller can use each debit once). null for anything that isn't a booked credit. */
export function classify(t, ctx = {}) {
  const tx = readTx(t);
  if (tx.credit !== true || !tx.booked || !tx.amount || !tx.currency || !tx.date) return null;
  const holders = (ctx.holders || []).map(normName).filter((n) => n.includes(" ")); /* a full name, never one word */
  if (tx.payer && holders.includes(normName(tx.payer))) return { kind: "transfer", why: "own name" };
  const lines = [...tx.remit, tx.payer, tx.code].filter(Boolean);
  for (const [re, why] of OWN_MOVES) if (lines.some((l) => re.test(l))) return { kind: "transfer", why };
  if (lines.some((l) => REFUND.test(l))) return { kind: "refund", why: "refund" };
  const source = sourceFor(payerOf(tx), ctx.sources);
  if (source) return { kind: "income", why: "source", source }; /* a known payer is never hidden by a look-alike debit */
  const pair = (ctx.debits || []).findIndex((d) => d && d.uid !== ctx.uid && d.currency === tx.currency && d.amount === tx.amount && d.date && daysApart(d.date, tx.date) <= LIMITS.pairDays);
  if (pair >= 0) return { kind: "transfer", why: "pair", pair };
  return { kind: "unsorted", why: "unknown payer" };
}

/* ---------- the desk side ---------- */
async function deskEntries(desk, fromDate, now) {
  const months = [];
  let m = iso(now).slice(0, 7);
  const stop = prevMonth(prevMonth(prevMonth(fromDate.slice(0, 7))));
  for (let i = 0; i < 12 && m >= stop; i++, m = prevMonth(m)) months.push(m);
  const docs = await Promise.all(months.map((k) => S.readDoc(desk, `inc/${k}.json`, [])));
  const map = new Map();
  for (const d of docs) for (const e of Array.isArray(d.data) ? d.data : []) if (e && e.id) map.set(e.id, e);
  return map;
}
const ofSource = (e, source) => low(e.source) === source.id || srcMatches(source, e.payer);
/* Already on the desk? The same Revolut transaction id; or a statement (pending) that this very credit
   already turned into received in an earlier run (it may keep the statement's own reference). */
export function findKnown(entries, tx, ref, source) {
  const r = low(ref);
  return entries.find((e) => low(e.account) === low(ACCOUNT) && r && low(e.reference) === r)
    || (source && entries.find((e) => low(e.account) === low(ACCOUNT) && e.status === "received" && e.arrived === tx.date && e.amount === tx.amount && e.currency === tx.currency
      && (e.history || []).some((h) => h.from === "pending" && h.to === "received") && ofSource(e, source))) || null;
}
/* A statement Ledger logged as pending ("Northlight Records Ltd") and the bank's credit ("NORTHLIGHT RECORDS
   LIMITED") are one payment when both belong to the same known source, with the same amount and
   currency, the statement dated on or before the credit, in the credit's month or the three before.
   The oldest such statement is taken. */
export function pendingFor(entries, tx, source) {
  if (!source) return null;
  const months = [tx.date.slice(0, 7)];
  for (let i = 0; i < 3; i++) months.push(prevMonth(months[i]));
  return entries.filter((e) => e.status === "pending" && e.amount === tx.amount && e.currency === tx.currency && e.date <= tx.date && months.includes(String(e.date).slice(0, 7)) && ofSource(e, source))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0] || null;
}

async function markGone(bank, now) {
  await S.mutate(bank, "conn.json", null, (c) => { if (!c || c.gone) return { skip: true, value: null }; c.gone = iso(now); return { value: null }; }).catch(() => {});
  await S.mutate(bank, "sync.json", {}, (s) => { s.lastRunAt = iso(now); s.lastError = SAY.again; return { value: null }; }).catch(() => {});
}
const sayFor = (e) => (e && e.name === "BankError" ? (e.kind === "network" ? SAY.unreachable : e.kind === "missing" ? SAY.missing : e.kind === "key" ? SAY.keyBad : SAY.readerDown) : SAY.desk);
const COUNTS = ["credits", "income", "unsorted", "transfers", "refunds", "added", "updated", "upgraded", "already", "skipped", "newPayments"];

/* ---------- the refresh ---------- */
/* -> the summary (no ids, no names): { ok, at, connected, accounts, pages, booked, credits, income,
   unsorted, transfers, refunds, added, updated, upgraded, already, skipped, newPayments, more,
   checked, error }. Never throws for a bank or desk failure: it says so in `error` and sync.json. */
export async function syncBank({ bank, desk, env, now, fetchImpl, clock = Date.now, budgetMs = LIMITS.budgetMs, pagesPerAccount = LIMITS.pagesPerAccount }) {
  const started = clock();
  const sum = { ok: false, at: iso(now), connected: false, accounts: 0, pages: 0, booked: 0, credits: 0, income: 0, unsorted: 0, transfers: 0, refunds: 0,
    added: 0, updated: 0, upgraded: 0, already: 0, skipped: 0, newPayments: 0, more: false, checked: false, error: null };
  const cfg = readConfig(env);
  if (!cfg.configured) return { ...sum, error: SAY.missing };
  const conn = (await S.readDoc(bank, "conn.json", null)).data;
  if (!conn || !conn.sessionId) return { ...sum, error: SAY.notConnected };
  if (conn.gone || !(Date.parse(conn.validUntil) > now)) { await markGone(bank, now); return { ...sum, error: SAY.again }; }
  sum.connected = true;
  const prev = (await S.readDoc(bank, "sync.json", {})).data || {};
  const per = prev.perAccount || {}, next = {}, rows = [];
  const today = iso(now).slice(0, 10), fetchUntil = started + Math.floor(budgetMs * 0.6); /* the rest of the time is for the desk */
  let error = null, gone = false, accountFails = 0, complete = true;

  /* 1. read every account, page by page, within the caps */
  for (const acc of conn.accounts || []) {
    const st = per[acc.uid] || {};
    const from = (st.cursor && st.cursor.dateFrom) || (st.lastDate ? addDays(st.lastDate, -LIMITS.overlapDays) : firstOfPrevMonth(now));
    let key = (st.cursor && st.cursor.key) || null, n = 0, done = false;
    try {
      while (n < pagesPerAccount && clock() < fetchUntil) {
        const q = new URLSearchParams({ date_from: from });
        if (key) q.set("continuation_key", key);
        let page;
        try { page = await ebCall(cfg, fetchImpl, now, "GET", `/accounts/${encodeURIComponent(acc.uid)}/transactions?${q}`); }
        catch (e) { if (n === 0 && key && !isGone(e)) { key = null; continue; } throw e; } /* a saved place the reader no longer knows: start the account again */
        n++; sum.pages++;
        for (const t of Array.isArray(page && page.transactions) ? page.transactions : []) rows.push({ uid: acc.uid, raw: t });
        key = page && typeof page.continuation_key === "string" && page.continuation_key.trim() ? page.continuation_key : null;
        if (!key) { done = true; break; }
      }
      sum.accounts++;
      next[acc.uid] = done ? { lastDate: today } : key ? { ...(st.lastDate ? { lastDate: st.lastDate } : {}), cursor: { key, dateFrom: from } } : st;
      if (!done) sum.more = true;
    } catch (e) {
      if (isGone(e)) { gone = true; break; }
      accountFails++; next[acc.uid] = st; error = SAY.someAccounts;
      if (conn.accounts.length === 1) error = sayFor(e);
      console.error("bank: an account could not be read:", logLine(e));
    }
  }
  if (gone) { await markGone(bank, now); return { ...sum, connected: false, error: SAY.again }; }

  /* 2. sort the booked credits and put them on the desk */
  const seen = new Set(), txs = [];
  for (const r of rows) {
    const tx = readTx(r.raw);
    if (!tx.booked || tx.credit === null || !tx.amount || !tx.currency || !tx.date) continue;
    const k = r.uid + "|" + (tx.id || JSON.stringify(r.raw));
    if (seen.has(k)) continue;
    seen.add(k); txs.push({ ...tx, uid: r.uid, raw: r.raw });
  }
  sum.booked = txs.length;
  const debits = txs.filter((t) => !t.credit).map((t) => ({ uid: t.uid, amount: t.amount, currency: t.currency, date: t.date }));
  const credits = txs.filter((t) => t.credit).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  sum.credits = credits.length;
  let roster = null;
  try {
    roster = await S.getRoster(desk);
    if (credits.length) {
      const sources = await S.getSources(desk);
      const holders = (conn.accounts || []).map((a) => a.holder).filter(Boolean);
      const index = await deskEntries(desk, credits[0].date, now);
      for (const tx of credits) {
        if (clock() - started > budgetMs) { complete = false; sum.more = true; break; }
        const c = classify(tx.raw, { uid: tx.uid, holders, debits, sources });
        if (!c) continue;
        if (c.pair != null) debits.splice(c.pair, 1);
        sum[c.kind === "transfer" ? "transfers" : c.kind === "refund" ? "refunds" : c.kind]++;
        if (c.kind === "refund") continue;
        const status = c.kind === "income" ? "received" : c.kind;
        const payer = payerOf(tx), ref = refOf(tx, payer);
        const entries = [...index.values()];
        const known = findKnown(entries, tx, ref, c.source);
        if (known && !(known.status === "unsorted" && status !== "unsorted")) { sum.already++; continue; }
        let name = payer, reference = ref;
        const pend = c.kind === "income" && !known ? pendingFor(entries, tx, c.source) : null;
        if (pend) { name = pend.payer; if (pend.reference && low(pend.reference) !== low(ref)) reference = ""; } /* the desk's own rule then turns it into received */
        try {
          const r = await S.submitIncome(desk, now, roster, { bot: "HQ", date: tx.date, payer: name, amount: tx.amount, currency: tx.currency, account: ACCOUNT, status,
            category: c.source ? c.source.category : undefined, source: c.source ? c.source.id : undefined, reference, note: "Read from Revolut" });
          index.set(r.entry.id, r.entry);
          if (r.added) { sum.added++; if (status !== "transfer") sum.newPayments++; }
          else if (r.updated) { sum.updated++; const h = (r.entry.history || []).at(-1); if (pend && h && h.from === "pending") sum.upgraded++; }
          else sum.already++;
        } catch (e) {
          /* one odd row (a payer name the desk's secrets guard refuses, a full month) never stops the rest */
          if (e && e.name === "StaffError" && e.code !== "busy") { sum.skipped++; continue; }
          throw e;
        }
      }
    }
  } catch (e) {
    complete = false; error = SAY.desk;
    console.error("bank: the desk could not be written:", (e && e.name) || "Error");
  }

  /* 3. "checked today", only when every account was read to the end */
  if (complete && !accountFails && !sum.more && roster) {
    const note = `Read from Revolut: ${sum.newPayments} new, ${sum.unsorted} to sort, ${sum.transfers} own transfer${sum.transfers === 1 ? "" : "s"}, ${sum.refunds} refund${sum.refunds === 1 ? "" : "s"} left out`;
    try { await S.incomeCheck(desk, now, roster, { bot: "HQ", account: ACCOUNT, new_payments: Math.min(sum.newPayments, 500), note }); sum.checked = true; } catch {}
  }

  /* 4. remember where every account got to (only when the desk took everything that was read) */
  try {
    await S.mutate(bank, "sync.json", {}, (s) => {
      s.lastRunAt = iso(now);
      if (!error) s.lastOkAt = iso(now);
      s.lastError = error;
      if (complete) {
        const keep = {};
        const merged = { ...(s.perAccount || {}), ...next };
        for (const a of conn.accounts || []) if (merged[a.uid]) keep[a.uid] = merged[a.uid];
        s.perAccount = keep;
      }
      s.lastAdded = sum.newPayments;
      const t = s.totals || {};
      for (const k of COUNTS) t[k] = (t[k] || 0) + sum[k];
      t.runs = (t.runs || 0) + 1;
      s.totals = t;
      s.last = Object.fromEntries(COUNTS.concat("pages", "booked", "more", "checked").map((k) => [k, sum[k]]));
      return { value: null };
    });
  } catch { error = error || SAY.desk; }
  return { ...sum, ok: !error, error };
}
