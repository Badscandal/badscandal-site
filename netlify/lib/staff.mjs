/* The staff desk (11 Nov 2026): what the bot team, Claude and Luke share ON THE SITE.

   Until now the bots only wrote rows into Google Sheets and /hq only read them. This adds a small
   desk kept in the Netlify Blob store "staff" (the site can't write the sheets, and shouldn't):

     updates   the bots' running log (same shape as the sheet's Updates tab; the two are merged)
     messages  one board for Luke, Claude and every bot (needs: none | reply | action | decision)
     income    one record per payment, submitted daily, plus "I checked <account>, nothing new"
     roster    who each bot is, why it is needed, what it does every day
     sources   every place money comes from, so a missing one is visible
     cards     what each bot says it is working on; seen/<bot>.json = its last call

   Reached by the bots through the connector at /mcp (netlify/lib/mcp.mjs + staff-tools.mjs), by
   /hq through /api/staff/* (netlify/functions/staff.mjs). Everything here takes the store and the
   clock as arguments, so it is unit tested without Netlify (tests/staff.test.mjs).

   Rules kept here:
   - Writes to a shared document go through mutate(): read with its etag, write only if nobody
     else wrote in between, retry. Two bots posting in the same second both land.
   - Nothing that looks like a password, a key, a card or a bank account number is stored.
   - Amounts always carry a currency and are never converted. A missing number is null, never 0.
   - Real payers, amounts and the roster's private notes live ONLY in the store: this file (the repo
     is public) carries no real data. */

export const TZ = "America/Sao_Paulo";
export const UPDATE_STATUS = ["done", "working", "blocked", "error", "info"];
export const NEEDS = ["none", "reply", "action", "decision"];
export const CATEGORIES = ["Self-releases", "Label deals", "Publishing", "Production", "Salary", "Other"];
export const INCOME_STATUS = ["received", "pending", "transfer"];
export const CADENCE = ["daily", "monthly", "quarterly", "irregular"];
export const SOURCE_STATE = ["active", "blocked", "unknown", "not_tracked"];
export const PEOPLE = ["Luke", "Claude", "HQ"]; /* not bots; HQ = the site's own twice-daily check */

/* The team as the repo may show it: names and one public line each. The full roster (why each bot
   is needed, its tools, its times) is seeded into the store and replaces this. */
export const DEFAULT_ROSTER = [
  { name: "Nova", role: "Chief of staff", duty: "Runs the team's day and the task board", time: "08:00" },
  { name: "Alfred", role: "Luke's assistant", duty: "One message to Luke a day, plus urgent alerts", time: "10:00" },
  { name: "Ledger", role: "Income", duty: "Logs every new payment", time: "07:30" },
  { name: "Sheet", role: "Income sheet", duty: "Keeps the income sheet complete", time: "08:00" },
  { name: "Steve", role: "Instagram", duty: "Daily growth and best post", time: "09:10" },
  { name: "Kevin", role: "TikTok", duty: "Daily growth, best post, fan signals", time: "09:10" },
  { name: "Laura", role: "YouTube", duty: "Daily growth, best video, fan signals", time: "09:10" },
  { name: "Atlas", role: "Spotify and stores", duty: "Daily numbers for every released song", time: "09:15" },
  { name: "Drop", role: "Distribution", duty: "Release status and royalties", time: "09:20" },
  { name: "Verse", role: "Lyrics", duty: "Lyrics live before each release", time: "09:20" },
  { name: "Webmaster", role: "Website", duty: "Daily check that the site is up and clean", time: "09:20" },
  { name: "Forge", role: "Ads", duty: "Logs ad spend, checks the cap before any launch", time: "09:30" },
];

/* ---------- small helpers ---------- */
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hmFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const spDay = (ts) => dayFmt.format(ts);
export const spHM = (ts) => hmFmt.format(ts);
export const spStamp = (ts) => spDay(ts) + " " + spHM(ts);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
const prevMonth = (m) => { const y = Number(m.slice(0, 4)), n = Number(m.slice(5, 7)); return n === 1 ? `${y - 1}-12` : `${y}-${String(n - 1).padStart(2, "0")}`; };
const round = (n) => Math.round(n * 100) / 100;
const low = (s) => String(s == null ? "" : s).trim().toLowerCase();

/* one line of plain text: control characters out, spaces collapsed, cut to max */
export function clean(v, max = 240) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
/* several lines allowed (messages, notes) */
export function cleanText(v, max = 1500) {
  return String(v == null ? "" : v).replace(/\r/g, "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}
export const httpsLink = (v) => { const s = clean(v, 400); return /^https:\/\/[^\s"'<>]+$/.test(s) ? s : ""; };

/* Things that must never be written on the desk: passwords, keys, cards, bank account numbers. */
const SECRETS = [
  /* "password: hunter2x" yes; "token: expired" / "the key is missing" no (the value must carry a digit) */
  [/\b(pass(word|code)?|senha|pwd|otp|2fa code|verification code|login code|api[ _-]?key|secret|token)\b\s*(is|=|:)\s*(?=\S*\d)\S{4,}/i, "a password, code or key"],
  [/\b(sk|pk|rk)[-_](live|test|proj)?[-_]?[A-Za-z0-9]{16,}/, "an API key"],
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|EAA[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16}|AIza[0-9A-Za-z_-]{30,})/, "an access key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/\b[A-Z]{2}\d{2}[ ]?(?:[A-Z0-9]{4}[ ]?){3,7}[A-Z0-9]{1,4}\b/, "a bank account number (IBAN)"],
  [/\b(card|cart[aã]o|cvv|cvc)\b[^\n]{0,24}\d{3,}/i, "a card number"],
];
export function secretIn(text) {
  const s = String(text || "");
  for (const [re, what] of SECRETS) if (re.test(s)) return what;
  return "";
}

export class StaffError extends Error {
  constructor(message, code = "bad_request") { super(message); this.name = "StaffError"; this.code = code; }
}
const fail = (m, code) => { throw new StaffError(m, code); };
function noSecrets(...texts) {
  for (const t of texts) { const what = secretIn(t); if (what) fail(`That looks like ${what}. Never write passwords, codes, keys, card or bank account numbers here. Say what is needed in words and ask Luke.`, "secret"); }
}

/* amount: a number, or text like "1,234.50" / "1.234,50". Never guessed: junk -> null. */
export function amountOf(v) {
  if (typeof v === "number") return Number.isFinite(v) ? round(v) : null;
  let s = String(v == null ? "" : v).trim().replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return null;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? round(n) : null;
}

let seq = 0;
export function newId(prefix, now) {
  seq = (seq + 1) % 1296;
  return prefix + now.toString(36) + seq.toString(36).padStart(2, "0") + Math.floor(Math.random() * 1296).toString(36).padStart(2, "0");
}
/* the month a message id was made in ("m" + base36 ms + 4 chars) */
export function monthOfId(id) {
  const m = /^[a-z]([0-9a-z]{8,9})[0-9a-z]{4}$/.exec(String(id || ""));
  if (!m) return null;
  const ts = parseInt(m[1], 36);
  return Number.isFinite(ts) && ts > 1.6e12 && ts < 4e12 ? new Date(ts).toISOString().slice(0, 7) : null;
}

/* ---------- the store: one JSON document per key, written only if unchanged ---------- */
export async function readDoc(store, key, fallback) {
  let got = null;
  try { got = await store.getWithMetadata(key, { type: "json", consistency: "strong" }); } catch { got = null; }
  return got && got.data != null ? { data: got.data, etag: got.etag || null } : { data: fallback, etag: null };
}
export async function mutate(store, key, fallback, fn, tries = 12) {
  for (let i = 0; i < tries; i++) {
    if (i) await new Promise((r) => setTimeout(r, Math.random() * 25 * i)); /* someone else wrote first: wait a moment, read again */
    const cur = await readDoc(store, key, fallback);
    const base = JSON.parse(JSON.stringify(cur.data));
    const out = await fn(base);
    if (out && out.skip) return out.value;
    const res = await store.setJSON(key, base, cur.etag ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (!res || res.modified !== false) return out ? out.value : undefined;
  }
  fail("The desk is busy. Try again in a moment.", "busy");
}

/* ---------- who is who ---------- */
export async function getRoster(store) {
  const { data } = await readDoc(store, "roster.json", null);
  const list = Array.isArray(data) && data.length ? data : DEFAULT_ROSTER;
  return list.filter((b) => b && b.name).map((b) => ({ ...b, name: clean(b.name, 40) }));
}
export const botNames = (roster) => roster.map((b) => b.name);
/* "nova", " Nova ", "NOVA (chief of staff)" -> "Nova"; unknown -> a plain error listing the names */
export function whoIs(name, roster, { people = false } = {}) {
  const want = low(name).replace(/\s*\(.*$/, "");
  const all = botNames(roster).concat(people ? PEOPLE : []);
  const hit = all.find((n) => low(n) === want);
  if (!hit) fail(`"${clean(name, 40)}" is not a name on the team. Use exactly one of: ${all.join(", ")}.`, "unknown_name");
  return hit;
}
export function setRoster(store, list) {
  if (!Array.isArray(list) || !list.length || list.length > 40) fail("roster must be a list of 1 to 40 bots");
  const seen = new Set();
  const out = list.map((b) => {
    const name = clean(b && b.name, 40);
    if (!/^[A-Za-z][A-Za-z0-9 ]{1,30}$/.test(name) || PEOPLE.some((p) => low(p) === low(name)) || low(name) === "all") fail(`"${name}" can't be a bot name`);
    if (seen.has(low(name))) fail(`"${name}" is listed twice`);
    seen.add(low(name));
    noSecrets(JSON.stringify(b));
    return {
      name, role: clean(b.role, 60), why: cleanText(b.why, 400), duty: clean(b.duty, 200), time: /^\d{2}:\d{2}$/.test(b.time || "") ? b.time : "",
      schedule: (Array.isArray(b.schedule) ? b.schedule : []).slice(0, 12).map((s) => ({ time: clean(s && s.time, 20), what: clean(s && s.what, 160) })).filter((s) => s.what),
      writes: clean(b.writes, 200), access: clean(b.access, 300), blockers: clean(b.blockers, 300),
      state: ["active", "paused", "blocked"].includes(b.state) ? b.state : "active",
    };
  });
  return store.setJSON("roster.json", out).then(() => out);
}

/* ---------- the bots' running log ---------- */
export async function postUpdate(store, now, roster, a) {
  const bot = whoIs(a.bot, roster);
  const status = low(a.status);
  if (!UPDATE_STATUS.includes(status)) fail(`status must be one of: ${UPDATE_STATUS.join(", ")}`);
  const message = clean(a.message, 240);
  if (message.length < 3) fail("message is empty. Say what you did or what is in the way, with the number if there is one.");
  noSecrets(message, a.link);
  const u = { id: newId("u", now), at: new Date(now).toISOString(), sp: spStamp(now), bot, status, message, link: httpsLink(a.link), duty: /^[Dd]-[\w-]{1,30}$/.test(clean(a.duty, 40)) ? clean(a.duty, 40) : "" };
  await mutate(store, `upd/${spDay(now)}.json`, [], (list) => { list.push(u); if (list.length > 600) list.splice(0, list.length - 600); return { value: u }; });
  return u;
}
export async function listUpdates(store, now, days = 2) {
  const keys = Array.from({ length: days }, (_, i) => `upd/${addDays(spDay(now), -i)}.json`);
  const docs = await Promise.all(keys.map((k) => readDoc(store, k, [])));
  return docs.flatMap((d) => (Array.isArray(d.data) ? d.data : [])).sort((a, b) => (a.at < b.at ? 1 : -1));
}
/* rows for the sheet-shaped live log: time | bot | status | message | link */
export const updateRows = (updates) => updates.map((u) => [u.sp, u.bot, u.status, u.message, u.link || ""]);
/* today's word from each bot on its duty: { byDuty: {"d-atlas-1": {...}}, byBot: {"atlas": {...}} } (newest wins) */
export function dutyOverlay(updates, today) {
  const byDuty = {}, byBot = {};
  for (const u of [...updates].sort((a, b) => (a.at < b.at ? -1 : 1))) {
    if (!u.sp || u.sp.slice(0, 10) !== today || !["done", "blocked", "working", "error"].includes(u.status)) continue;
    const v = { status: u.status === "error" ? "blocked" : u.status, message: u.message, at: u.sp };
    if (u.duty) byDuty[low(u.duty)] = v; else byBot[low(u.bot)] = v;
  }
  return { byDuty, byBot };
}

/* ---------- the message board ---------- */
const msgKey = (month) => `msg/${month}.json`;
export async function sendMessage(store, now, roster, a) {
  const from = whoIs(a.from, roster, { people: true });
  const to = low(a.to) === "all" || low(a.to) === "everyone" || low(a.to) === "team" ? "all" : whoIs(a.to, roster, { people: true });
  const text = cleanText(a.text, 1500);
  if (text.length < 2) fail("text is empty");
  noSecrets(text);
  let needs = low(a.needs) || "none";
  if (!NEEDS.includes(needs)) fail(`needs must be one of: ${NEEDS.join(", ")}`);
  if (to === "all" && needs !== "none") needs = "none"; /* a note to everyone can't wait on everyone */
  const re = a.re ? clean(a.re, 20) : "";
  const options = (Array.isArray(a.options) ? a.options : []).map((o) => clean(o, 80)).filter(Boolean).slice(0, 4);
  const kind = ["report", "note"].includes(low(a.kind)) ? low(a.kind) : "note";
  const m = { id: newId("m", now), at: new Date(now).toISOString(), sp: spStamp(now), from, to, text, needs, re, options, kind, resolved: null };
  let parent = null;
  if (re) {
    const pm = monthOfId(re);
    if (!pm) fail("re must be the id of the message you are answering");
    parent = await mutate(store, msgKey(pm), [], (list) => {
      const p = list.find((x) => x.id === re);
      if (!p) fail("There is no message with that id", "not_found");
      /* an answer from the person it was waiting on settles a "reply" */
      if (p.needs === "reply" && !p.resolved && (p.to === from || p.to === "all")) { p.resolved = { by: from, at: m.at, note: "answered" }; return { value: p }; }
      return { skip: true, value: p };
    });
  }
  await mutate(store, msgKey(m.at.slice(0, 7)), [], (list) => { list.push(m); return { value: m }; });
  return { message: m, parent };
}
export async function resolveMessage(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  const id = clean(a.id, 20), month = monthOfId(id);
  if (!month) fail("id must be a message id (it starts with m)");
  const note = clean(a.note, 240);
  noSecrets(note);
  return mutate(store, msgKey(month), [], (list) => {
    const p = list.find((x) => x.id === id);
    if (!p) fail("There is no message with that id", "not_found");
    if (p.needs === "decision" && by !== "Luke" && p.to === "Luke") fail("Only Luke can settle a decision that is waiting on Luke.", "not_allowed");
    p.resolved = { by, at: new Date(now).toISOString(), note };
    return { value: p };
  });
}
/* newest first; this month and the one before (older open items are still found by listOpen) */
export async function listMessages(store, now, months = 2) {
  let m = new Date(now).toISOString().slice(0, 7);
  const keys = [];
  for (let i = 0; i < months; i++) { keys.push(msgKey(m)); m = prevMonth(m); }
  const docs = await Promise.all(keys.map((k) => readDoc(store, k, [])));
  return docs.flatMap((d) => (Array.isArray(d.data) ? d.data : [])).sort((a, b) => (a.at < b.at ? 1 : -1));
}
export const isOpen = (m) => m.needs !== "none" && !m.resolved;
/* what is waiting on one name, oldest first */
export const waitingOn = (messages, name) => messages.filter((m) => isOpen(m) && low(m.to) === low(name)).sort((a, b) => (a.at < b.at ? -1 : 1));
export function threads(messages) {
  const byId = Object.fromEntries(messages.map((m) => [m.id, m]));
  const replies = {};
  for (const m of messages) if (m.re && byId[m.re]) (replies[m.re] || (replies[m.re] = [])).push(m);
  return messages.filter((m) => !(m.re && byId[m.re])).map((m) => ({ ...m, replies: (replies[m.id] || []).sort((a, b) => (a.at < b.at ? -1 : 1)) }));
}

/* ---------- income: one record per payment, and "checked, nothing new" ---------- */
const incKey = (month) => `inc/${month}.json`;
const chkKey = (month) => `chk/${month}.json`;
export const dedupeKey = (e) => (e.reference ? low(e.account) + "|ref|" + low(e.reference) : [e.date, low(e.payer), e.amount, e.currency].join("|"));
export async function submitIncome(store, now, roster, a) {
  const by = whoIs(a.bot, roster, { people: true });
  const date = clean(a.date, 10);
  if (!DAY.test(date) || Number.isNaN(Date.parse(date + "T12:00:00Z"))) fail("date must be the day the money arrived (or the statement date), as YYYY-MM-DD");
  if (date > addDays(spDay(now), 1)) fail("date is in the future");
  const payer = clean(a.payer, 80);
  if (payer.length < 2) fail("payer is empty. Write who paid, exactly as the account or statement shows it.");
  const amount = amountOf(a.amount);
  if (amount == null || amount === 0) fail('amount must be a number, for example 112.01. If you could not see the amount, do not submit: post an update with status "blocked" instead.');
  const currency = clean(a.currency, 12).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) fail("currency must be the three-letter code the money was paid in (EUR, USD, GBP, BRL...). Never convert.");
  const status = low(a.status) || "received";
  if (!INCOME_STATUS.includes(status)) fail(`status must be one of: ${INCOME_STATUS.join(", ")}`);
  const category = CATEGORIES.find((c) => low(c) === low(a.category)) || (a.category ? null : "Other");
  if (!category) fail(`category must be one of: ${CATEGORIES.join(", ")}`);
  const account = clean(a.account, 40);
  if (!account) fail("account is empty. Write where the money landed (Wise, PayPal, Revolut, Bank) or \"Statement only\" if you only saw a statement.");
  const e = { id: newId("i", now), at: new Date(now).toISOString(), by, date, payer, amount, currency, status, category, account,
    reference: clean(a.reference, 80), period: clean(a.period, 40), source: clean(a.source, 40), note: clean(a.note, 240) };
  noSecrets(e.payer, e.reference, e.note, e.period);
  const key = dedupeKey(e);
  return mutate(store, incKey(date.slice(0, 7)), [], (list) => {
    const old = list.find((x) => dedupeKey(x) === key);
    if (old) {
      /* the same payment again: nothing is added twice; a pending one may become received */
      const changed = old.status !== e.status || (e.note && e.note !== old.note);
      if (!changed) return { skip: true, value: { entry: old, added: false, updated: false } };
      old.history = (old.history || []).concat({ at: e.at, by, from: old.status, to: e.status }).slice(-10);
      old.status = e.status; if (e.note) old.note = e.note; old.updatedAt = e.at;
      return { value: { entry: old, added: false, updated: true } };
    }
    list.push(e);
    return { value: { entry: e, added: true, updated: false } };
  });
}
export async function incomeCheck(store, now, roster, a) {
  const by = whoIs(a.bot, roster, { people: true });
  const account = clean(a.account, 40);
  if (!account) fail("account is empty (Wise, PayPal, ...)");
  const n = Number(a.new_payments);
  if (!Number.isInteger(n) || n < 0 || n > 500) fail("new_payments must be how many new payments you found (0 if none)");
  const note = clean(a.note, 240);
  noSecrets(note);
  const c = { at: new Date(now).toISOString(), day: spDay(now), by, account, new: n, note };
  await mutate(store, chkKey(c.day.slice(0, 7)), [], (list) => { list.push(c); if (list.length > 2000) list.splice(0, list.length - 2000); return { value: c }; });
  return c;
}
export async function getSources(store) {
  const { data } = await readDoc(store, "sources.json", []);
  return Array.isArray(data) ? data : [];
}
export function setSources(store, list) {
  if (!Array.isArray(list) || list.length > 80) fail("sources must be a list (80 at most)");
  const seen = new Set();
  const out = list.map((s) => {
    const id = low(s && s.id).replace(/[^a-z0-9-]/g, "");
    if (!id || seen.has(id)) fail("every source needs its own short id (letters, digits, dashes)");
    seen.add(id);
    noSecrets(JSON.stringify(s));
    return { id, name: clean(s.name, 60), kind: s.kind === "account" ? "account" : "payer", match: (Array.isArray(s.match) ? s.match : []).slice(0, 8).map((x) => low(x)).filter(Boolean),
      category: CATEGORIES.find((c) => low(c) === low(s.category)) || "Other", currency: clean(s.currency, 12).toUpperCase(), lands: clean(s.lands, 40),
      cadence: CADENCE.includes(s.cadence) ? s.cadence : "irregular", owner: clean(s.owner, 40), how: clean(s.how, 160),
      state: SOURCE_STATE.includes(s.state) ? s.state : "unknown", blocker: clean(s.blocker, 200), needsLuke: clean(s.needsLuke, 200) };
  });
  return store.setJSON("sources.json", out).then(() => out);
}
const srcMatches = (s, text) => { const t = low(text); return !!t && [low(s.name), s.id, ...(s.match || [])].filter(Boolean).some((k) => t.includes(k)); };
const DUE_DAYS = { daily: 2, monthly: 45, quarterly: 110 };

/* The picture of the money coming in. entries: this month + last (+ any older passed in).
   -> { month, received:{CUR:n}, pending:{CUR:n}, entries (newest 60), accounts:[...], sources:[...], problems:[...] } */
export function incomeReport(entries, checks, sources, today) {
  const month = today.slice(0, 7);
  const add = (o, cur, a) => { o[cur] = round((o[cur] || 0) + a); };
  const received = {}, pending = {}, byCat = {};
  for (const e of entries) {
    if (e.date.slice(0, 7) !== month || e.status === "transfer") continue;
    add(e.status === "pending" ? pending : received, e.currency, e.amount);
    if (e.status === "received") add(byCat[e.category] || (byCat[e.category] = {}), e.currency, e.amount);
  }
  const lastCheck = {};
  for (const c of checks) { const k = low(c.account); if (!lastCheck[k] || c.at > lastCheck[k].at) lastCheck[k] = c; }
  const list = sources.map((s) => {
    const mine = entries.filter((e) => (s.kind === "account" ? low(e.account) === low(s.name) || srcMatches(s, e.account) : low(e.source) === s.id || srcMatches(s, e.payer)));
    const last = mine.reduce((a, e) => (!a || e.date > a.date ? e : a), null);
    const chk = s.kind === "account" ? lastCheck[low(s.name)] || Object.values(lastCheck).find((c) => srcMatches(s, c.account)) || null : null;
    const lastLook = [last && last.at.slice(0, 10), chk && chk.day].filter(Boolean).sort().pop() || null;
    const monthTotal = {};
    for (const e of mine) if (e.date.slice(0, 7) === month && e.status !== "transfer") add(monthTotal, e.currency, e.amount);
    let verdict = "ok", why = "";
    if (s.state === "not_tracked") { verdict = "not_tracked"; why = "Nobody is logging this yet"; }
    else if (s.state === "blocked") { verdict = "blocked"; why = s.blocker || "Blocked"; }
    else if (s.kind === "account") {
      if (!lastLook) { verdict = "never"; why = "Never checked through the connector"; }
      else if (lastLook < today) { verdict = daysBetween(lastLook, today) > 1 ? "overdue" : "due"; why = `Last checked ${lastLook}`; }
    } else if (!last) { verdict = s.cadence === "irregular" ? "quiet" : "never"; why = "No payment logged yet"; }
    else if (DUE_DAYS[s.cadence] && daysBetween(last.date, today) > DUE_DAYS[s.cadence]) { verdict = "overdue"; why = `Last payment ${last.date}; expected ${s.cadence}`; }
    return { id: s.id, name: s.name, kind: s.kind, category: s.category, currency: s.currency, lands: s.lands, cadence: s.cadence, owner: s.owner, how: s.how, state: s.state,
      blocker: s.blocker, needsLuke: s.needsLuke, last: last ? { date: last.date, amount: last.amount, currency: last.currency, status: last.status } : null,
      checked: chk ? { day: chk.day, by: chk.by, new: chk.new } : null, lastLook, monthTotal, verdict, why };
  });
  /* payments whose payer matches no known source: a new source nobody has named yet */
  const payers = sources.filter((s) => s.kind !== "account");
  const unknown = [...new Set(entries.filter((e) => e.status !== "transfer" && !payers.some((s) => low(e.source) === s.id || srcMatches(s, e.payer))).map((e) => e.payer))].slice(0, 20);
  const accounts = list.filter((s) => s.kind === "account"), src = list.filter((s) => s.kind !== "account");
  const problems = [];
  for (const a of accounts) if (["never", "overdue", "due"].includes(a.verdict)) problems.push(`${a.name}: not checked today${a.owner ? " (" + a.owner + ")" : ""}`);
  for (const s of src) if (s.verdict === "overdue") problems.push(`${s.name}: ${s.why}`);
  for (const s of list) if (s.verdict === "blocked") problems.push(`${s.name}: blocked. ${s.blocker}`.trim());
  if (unknown.length) problems.push(`New payer(s) not on the list of sources: ${unknown.join(", ")}`);
  const oldPending = entries.filter((e) => e.status === "pending" && daysBetween(e.date, today) > 30).length;
  if (oldPending) problems.push(`${oldPending} pending payment${oldPending === 1 ? "" : "s"} older than 30 days`);
  return { month, received, pending, byCategory: byCat, count: entries.filter((e) => e.date.slice(0, 7) === month).length,
    entries: [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.at < b.at ? 1 : -1)).slice(0, 60),
    accounts, sources: src, unknown, problems,
    lastEntryAt: entries.reduce((a, e) => (!a || e.at > a ? e.at : a), null) };
}
export async function incomeState(store, now) {
  const today = spDay(now), m = today.slice(0, 7), months = [m, prevMonth(m), prevMonth(prevMonth(m)), prevMonth(prevMonth(prevMonth(m)))];
  const [inc, chk, sources] = await Promise.all([
    Promise.all(months.map((k) => readDoc(store, incKey(k), []))), Promise.all(months.slice(0, 2).map((k) => readDoc(store, chkKey(k), []))), getSources(store)]);
  const flat = (docs) => docs.flatMap((d) => (Array.isArray(d.data) ? d.data : []));
  return incomeReport(flat(inc), flat(chk), sources, today);
}

/* ---------- cards (what a bot says it is working on) and last-seen ---------- */
export async function setCard(store, now, roster, a) {
  const bot = whoIs(a.bot, roster);
  const card = { workingOn: cleanText(a.working_on, 400), needs: cleanText(a.needs, 400), at: new Date(now).toISOString() };
  noSecrets(card.workingOn, card.needs);
  await mutate(store, "cards.json", {}, (all) => { all[low(bot)] = card; return { value: card }; });
  return { bot, ...card };
}
export async function touchSeen(store, now, bot, tool) {
  try { await store.setJSON(`seen/${low(bot).replace(/[^a-z0-9]/g, "")}.json`, { at: new Date(now).toISOString(), tool: clean(tool, 40) }); } catch {}
}
export async function getSeen(store, roster) {
  const names = botNames(roster).concat("Claude");
  const docs = await Promise.all(names.map((n) => readDoc(store, `seen/${low(n).replace(/[^a-z0-9]/g, "")}.json`, null)));
  return Object.fromEntries(names.map((n, i) => [n, docs[i].data]).filter(([, v]) => v));
}

/* ---------- settings Luke controls from /hq: the bots' key on/off ---------- */
export async function getConfig(store) {
  const { data } = await readDoc(store, "config.json", {});
  return { botsOn: data.botsOn !== false, changedAt: data.changedAt || null };
}
export const setConfig = (store, now, patch) => mutate(store, "config.json", {}, (c) => { if (typeof patch.botsOn === "boolean") { c.botsOn = patch.botsOn; c.changedAt = new Date(now).toISOString(); } return { value: { botsOn: c.botsOn !== false, changedAt: c.changedAt || null } }; });

/* ---------- the guide the bots can read through the connector ---------- */
export async function getGuide(store) { const { data } = await readDoc(store, "guide.json", null); return data && typeof data.text === "string" ? data : { text: "", at: null }; }
export function setGuide(store, now, text) {
  const t = String(text || "").slice(0, 60000);
  noSecrets(t.replace(/\b(pass(word|code)?|token|secret|api[ _-]?key)\b\s*(is|=|:)/gi, "$1")); /* the guide talks ABOUT keys; only real ones are refused */
  return store.setJSON("guide.json", { text: t, at: new Date(now).toISOString() });
}

/* ---------- the whole desk in one answer (for /hq and for the bots' tools) ---------- */
/* hq: the dashboard model from netlify/lib/hq.mjs (optional): gives each bot its duty and tasks. */
export function workers(roster, { hq, updates, messages, cards, seen, today, nowHM }) {
  const duties = (hq && hq.team && hq.team.duties && hq.team.duties.byOwner) || [];
  const tasks = (hq && hq.team && hq.team.tasks) || [];
  return roster.map((b) => {
    const k = low(b.name);
    const mine = duties.find((d) => low(d.owner) === k);
    const items = mine ? mine.items : [];
    const last = updates.find((u) => low(u.bot) === k) || null;
    const todays = updates.filter((u) => low(u.bot) === k && u.sp.slice(0, 10) === today);
    const open = tasks.filter((t) => low(t.owner) === k);
    const asks = waitingOn(messages, b.name);
    let state = "idle";
    if (b.state === "paused") state = "paused";
    else if (items.some((d) => d.status === "blocked") || (last && last.status === "blocked" && last.sp.slice(0, 10) === today)) state = "blocked";
    else if (items.some((d) => d.late)) state = "late";
    else if (items.length && items.every((d) => d.status === "done")) state = "done";
    else if (todays.some((u) => u.status === "working")) state = "working";
    else if (todays.some((u) => u.status === "done") && !items.length) state = "done";
    else if (items.length) state = "todo";
    else if (b.time && nowHM && nowHM > b.time && !todays.length) state = "quiet";
    const s = seen[b.name] || null;
    return { name: b.name, role: b.role || "", why: b.why || "", duty: b.duty || "", time: b.time || "", schedule: b.schedule || [], writes: b.writes || "", access: b.access || "",
      blockers: b.blockers || "", paused: b.state === "paused", state, duties: items, tasks: open.slice(0, 12), lateTasks: open.filter((t) => t.late).length,
      last: last ? { at: last.sp, status: last.status, message: last.message, link: last.link } : null, updatesToday: todays.length,
      card: cards[k] || null, waiting: asks.map((m) => ({ id: m.id, from: m.from, text: m.text.slice(0, 200), needs: m.needs, at: m.sp })),
      seen: s ? s.at : null, connected: !!s };
  });
}

export async function loadDesk(store, now) {
  const [roster, updates, messages, cardsDoc, config] = await Promise.all([getRoster(store), listUpdates(store, now, 3), listMessages(store, now, 2), readDoc(store, "cards.json", {}), getConfig(store)]);
  const [seen, income] = await Promise.all([getSeen(store, roster), incomeState(store, now)]);
  return { roster, updates, messages, cards: cardsDoc.data || {}, seen, income, config };
}

export function board(desk, now, hq) {
  const today = spDay(now), nowHM = spHM(now);
  const staff = workers(desk.roster, { hq, updates: desk.updates, messages: desk.messages, cards: desk.cards, seen: desk.seen, today, nowHM });
  const lastSeen = Object.entries(desk.seen).filter(([n]) => n !== "Claude").sort((a, b) => (a[1].at < b[1].at ? 1 : -1))[0] || null;
  return {
    today, now: spStamp(now), staff,
    updates: desk.updates.slice(0, 60),
    messages: threads(desk.messages).slice(0, 80),
    waiting: { luke: waitingOn(desk.messages, "Luke"), claude: waitingOn(desk.messages, "Claude"), bots: desk.messages.filter((m) => isOpen(m) && !PEOPLE.includes(m.to)).length },
    income: desk.income,
    connector: { botsOn: desk.config.botsOn, changedAt: desk.config.changedAt, lastUsed: lastSeen ? { bot: lastSeen[0], at: lastSeen[1].at, tool: lastSeen[1].tool } : null,
      connected: staff.filter((w) => w.connected).length, total: staff.length, claudeSeen: desk.seen.Claude ? desk.seen.Claude.at : null },
    report: desk.messages.find((m) => m.from === "HQ" && m.kind === "report") || null,
    names: botNames(desk.roster).concat(PEOPLE),
  };
}

/* ---------- the site's own check, twice a day (netlify/functions/staffcheck.mjs) ----------
   Facts only, no judgement: what a person would otherwise have to look up tab by tab. */
export function checkReport({ desk, hq, hqState, now }) {
  const today = spDay(now), hm = spHM(now), morning = hm < "15:00";
  const b = board(desk, now, hq);
  const lines = [], problems = [];
  const say = (ok, text) => { (ok ? lines : problems).push(text); };
  /* 1. the bots */
  const withDuty = b.staff.filter((w) => w.duties.length);
  const d = hq && hq.team ? hq.team.duties : null;
  if (d && d.total) say(d.late === 0 && d.blocked === 0, `Duties: ${d.done} of ${d.total} done` + (d.late ? `, ${d.late} late` : "") + (d.blocked ? `, ${d.blocked} blocked` : ""));
  else problems.push("Duties: the Tasks tab has no duty rows for today (Nova resets them at 08:05)");
  for (const w of withDuty) for (const x of w.duties) {
    if (x.status === "blocked") problems.push(`${w.name} is blocked: ${x.blocker || x.task}`);
    else if (x.late) problems.push(`${w.name} is late (due ${x.due}): ${x.task}`);
  }
  const silent = b.staff.filter((w) => !w.paused && w.time && hm > w.time && !w.updatesToday && !w.duties.some((x) => x.status === "done")).map((w) => w.name);
  if (silent.length) problems.push(`No word today from: ${silent.join(", ")}`);
  const never = b.staff.filter((w) => !w.connected).map((w) => w.name);
  if (never.length && never.length < b.staff.length) problems.push(`Never used the connector: ${never.join(", ")}`);
  if (never.length === b.staff.length) problems.push("No bot has used the connector yet");
  /* 2. money in */
  const inc = b.income;
  const cur = (o) => Object.entries(o).map(([c, a]) => `${c} ${a.toFixed(2)}`).join(" + ") || "nothing yet";
  lines.push(`Income logged this month: ${cur(inc.received)} received` + (Object.keys(inc.pending).length ? `, ${cur(inc.pending)} pending` : ""));
  for (const p of inc.problems) problems.push("Income: " + p);
  /* 3. messages waiting */
  const age = (m) => Math.floor((now - Date.parse(m.at)) / 3600000);
  if (b.waiting.luke.length) problems.push(`${b.waiting.luke.length} waiting on Luke (oldest ${age(b.waiting.luke[0])} h): "${b.waiting.luke[0].text.slice(0, 90)}"`);
  const stale = desk.messages.filter((m) => isOpen(m) && m.to !== "Luke" && age(m) >= 24);
  for (const m of stale.slice(0, 5)) problems.push(`${m.to} has not answered ${m.from} for ${age(m)} h: "${m.text.slice(0, 70)}"`);
  /* 4. the dashboard's own sources */
  if (hqState) {
    if (hqState.connected === false) problems.push("The HQ sheet is not connected");
    else if (hqState.error) problems.push("The HQ sheet can't be read: " + hqState.error);
    else if (hqState.readAt && now - Date.parse(hqState.readAt) > 30 * 60000) problems.push(`The HQ sheet was last read ${Math.round((now - Date.parse(hqState.readAt)) / 60000)} min ago`);
    for (const [tab, e] of Object.entries(hqState.sheetErrors || {})) problems.push(`Sheet tab ${tab} shows an error (${e.first})`);
    if (hqState.metaKey && hqState.metaKey.state && hqState.metaKey.state !== "ok") problems.push(hqState.metaKey.text || "The Meta key is not reading");
    const cap = hq && hq.money && hq.money.cap;
    if (cap) say(cap.status === "ok", `Ad spend this month: ${cap.currency} ${cap.spent.toFixed(2)} of ${cap.amount}` + (cap.status === "ok" ? "" : cap.status === "warn" ? " (past the 750 warning)" : " (at or past 900: every ad must be off)"));
    const next = hq && hq.next;
    if (next) say(!next.late, `Next release: ${next.song}, ${next.date} (${next.daysToGo} days)` + (next.late ? `, ${next.late} step${next.late === 1 ? "" : "s"} late: ${next.steps.filter((s) => s.late).map((s) => s.label + " (" + s.owner + ")").join("; ")}` : ", nothing late"));
  }
  const title = `HQ check, ${today} ${morning ? "morning" : "evening"}: ` + (problems.length ? `${problems.length} thing${problems.length === 1 ? "" : "s"} to look at` : "all running");
  const text = [title, ...(problems.length ? ["", "Needs a look:", ...problems.map((p) => "- " + p)] : []), "", "Running:", ...lines.map((l) => "- " + l)].join("\n").slice(0, 1500);
  return { title, problems, lines, text, part: morning ? "am" : "pm", day: today };
}
