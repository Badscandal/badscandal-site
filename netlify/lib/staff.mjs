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
/* unsorted (bank reader, 11 Nov 2026): seen in an account, nobody has said what it is yet; counts in neither received nor pending */
export const INCOME_STATUS = ["received", "pending", "transfer", "unsorted"];
export const CADENCE = ["daily", "monthly", "quarterly", "irregular"];
export const SOURCE_STATE = ["active", "blocked", "unknown", "not_tracked"];
export const PEOPLE = ["Luke", "Claude", "HQ"]; /* not bots; HQ = the site's own twice-daily check */
/* nobody needs more than this in a day; past it something is looping, and the answer is "stop" */
export const LIMITS = { updatesPerBotPerDay: 60, messagesPerSenderPerDay: 40, messagesPerMonth: 1500, paymentsPerMonth: 3000, checksPerBotPerDay: 40 };

/* The team as the repo may show it: names and one public line each. The full roster (why each bot
   is needed, its tools, its times) is seeded into the store and replaces this. */
export const DEFAULT_ROSTER = [
  { name: "Nova", role: "Chief of staff", duty: "Runs the team's day and the task board", time: "08:00",
    why: "Without Nova nobody resets the day's duties, chases what is missing or writes the evening wrap-up. She is Claude's contact and the one who passes instructions to every other bot.",
    schedule: [{ time: "08:00", what: "Read new briefs and the messages on the desk" }, { time: "08:05", what: "Reset today's duties on the task board, each with its time" }, { time: "09:00", what: "Standup: logged, or the blocker" },
      { time: "09:45", what: "Check the month's ad spend against the cap" }, { time: "12:00", what: "Chase anything missing" }, { time: "21:00", what: "Wrap-up: mark what slipped, write the daily report" }, { time: "Sunday", what: "Weekly numbers and the weekly report" }],
    writes: "The task board and the release timeline; the daily report" },
  { name: "Alfred", role: "Luke's assistant", duty: "One message to Luke a day, plus urgent alerts", time: "10:00",
    why: "The only voice that reaches Luke, once a day, so no other bot has to interrupt him. Carries the site's check, Claude's note and anything that needs Luke's yes.",
    schedule: [{ time: "10:00", what: "The daily message: ad spend against the cap, income, what needs Luke, who didn't log, the next release" }, { time: "any time", what: "Alert at USD 750, at USD 900 and above USD 1,000 of ad spend" }],
    writes: "Nothing: Alfred reports, he doesn't log" },
  { name: "Ledger", role: "Income", duty: "Logs every new payment", time: "07:30",
    why: "Sees every payment the day it lands, so income is never found weeks later and nothing is missed or counted twice.",
    schedule: [{ time: "07:30", what: "Check every money account and the statement emails; submit each new payment; say each account was checked" }, { time: "5th", what: "Monthly income report" }, { time: "20th", what: "Chase every pending payment" }],
    writes: "Payments on the desk; rows for the income sheet" },
  { name: "Sheet", role: "Income sheet", duty: "Keeps the income sheet complete", time: "08:00",
    why: "Keeps the books tidy: every payment Ledger found has its source, category, currency, amount and status, so the monthly totals can be trusted.",
    schedule: [{ time: "08:00", what: "Confirm the income sheet is complete for yesterday" }], writes: "The income sheet" },
  { name: "Steve", role: "Instagram", duty: "Daily growth and best post", time: "09:10",
    why: "Instagram is where the fans are found first. Steve ties each day's growth to the post that caused it.",
    schedule: [{ time: "09:10", what: "Followers, change, views, best post and its link" }], writes: "The Growth tab" },
  { name: "Kevin", role: "TikTok", duty: "Daily growth, best post, fan signals", time: "09:10",
    why: "TikTok growth and the comments that show who is turning into a fan.",
    schedule: [{ time: "09:10", what: "Followers, change, views, best post; up to 5 fan signals from yesterday's comments" }], writes: "The Growth and Fans tabs" },
  { name: "Laura", role: "YouTube", duty: "Daily growth, best video, fan signals", time: "09:10",
    why: "YouTube growth, the release videos, and the comments that show who is turning into a fan.",
    schedule: [{ time: "09:10", what: "Subscribers, change, views, best video; up to 5 fan signals" }, { time: "7 days before a release", what: "Video scheduled" }], writes: "The Growth and Fans tabs; the release timeline's video step" },
  { name: "Atlas", role: "Spotify and stores", duty: "Daily numbers for every released song", time: "09:15",
    why: "Streams per song, day by day, are the number the whole plan is steered by. Atlas also sends every Spotify playlist pitch.",
    schedule: [{ time: "09:15", what: "One row per released song for the newest full day, plus the Spotify followers row" }, { time: "14 days before a release", what: "Send the Spotify pitch (never later than 7 days before)" }], writes: "The Songs and Growth tabs; the release timeline's pitch step" },
  { name: "Drop", role: "Distribution", duty: "Release status and royalties", time: "09:20",
    why: "Gets each self-release into the stores on time and reports what each song earned.",
    schedule: [{ time: "09:20", what: "Status of every unreleased song" }, { time: "21 days before a release", what: "Upload" }, { time: "5th", what: "Royalties per song and per store" }], writes: "The release timeline and the Royalties tab" },
  { name: "Verse", role: "Lyrics", duty: "Lyrics live before each release", time: "09:20",
    why: "Lyrics showing in the apps on release day; only needed when a release is 14 days away or less.",
    schedule: [{ time: "09:20", what: "Lyrics status when a release is 14 days away or less; done 10 days before" }], writes: "The release timeline's lyrics step" },
  { name: "Webmaster", role: "Website", duty: "Daily check that the site is up and clean", time: "09:20",
    why: "Every ad and the bio link land on our own pages; if a page is down, the ad money is wasted.",
    schedule: [{ time: "09:20", what: "Home page, every song page and the dashboard answer; no pre-save or Feature.fm link anywhere" }, { time: "7 days before a release", what: "Song page live" }, { time: "Release day", what: "Add the Spotify link" }], writes: "Its own duty row; the song pages" },
  { name: "Forge", role: "Ads", duty: "Logs ad spend, checks the cap before any launch", time: "09:30",
    why: "Keeps ad spend inside USD 1,000 a month: logs what Google and TikTok spent and checks the cap before anything launches.",
    schedule: [{ time: "09:30", what: "Yesterday's Google and TikTok spend" }, { time: "Monday", what: "Compare the month's Meta total with Ads Manager" }, { time: "before any launch", what: "Month to date + planned budgets must stay under the cap" }, { time: "at USD 900", what: "Switch every ad off (never delete) and confirm" }], writes: "The Ads Tracker's daily log" },
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

/* Things that must never be written on the desk: passwords, keys, cards, bank account numbers.
   A guard rail, not a lock: it has to let ordinary work through (ISRCs, UPCs, 15-digit ad account
   ids, payment references, "token: expired", "the OTP is 6-digit", "my job card"), so each rule asks
   for the real shape of the secret, not just the word. */
const SAID = /\b(pass(?:word|code)?|senha|pwd|otp|2fa code|verification code|login code|api[ _-]?key|secret|token)\b\s*(?:is|=|:)\s*(\S{4,})/gi;
const KEYS = [
  [/\b(sk|pk|rk)[-_](live|test|proj)?[-_]?[A-Za-z0-9]{16,}/, "an API key"],
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|EAA[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16}|AIza[0-9A-Za-z_-]{30,})/, "an access key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/\b(card|cart[aã]o)\b[^\n]{0,24}?(?:\d[ -]?){13,19}/i, "a card number"],
  [/\b(cvv|cvc)\b\D{0,6}\d{3,4}\b/i, "a card code"],
];
/* a real IBAN passes the mod-97 check; a payment reference that merely looks like one doesn't */
function ibanIn(text) {
  for (const m of String(text).matchAll(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g)) {
    const v = m[0].replace(/ /g, "");
    if (v.length < 15 || v.length > 34) continue;
    const digits = (v.slice(4) + v.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
    let r = 0;
    for (const ch of digits) r = (r * 10 + Number(ch)) % 97;
    if (r === 1) return true;
  }
  return false;
}
export function secretIn(text, { reference = false } = {}) {
  const s = String(text || "");
  for (const m of s.matchAll(SAID)) {
    const v = m[2];
    /* the value has to look like the secret itself: a digit in it, and not "6-digit", "60-day" or a date */
    if (/\d/.test(v) && !/^\d{1,3}-[A-Za-z]/.test(v) && !/^\d{4}-\d{2}-\d{2}\b/.test(v)) return "a password, code or key";
  }
  for (const [re, what] of KEYS) if (re.test(s)) return what;
  if (!reference && ibanIn(s)) return "a bank account number (IBAN)";
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
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) return null; /* "1.234": one point two, or one thousand? never guessed */
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
  /* absent -> the fallback. A store that fails THROWS: "couldn't read" must never look like "empty"
     (an empty roster, or the bots' switch reading as on). */
  const got = await store.getWithMetadata(key, { type: "json", consistency: "strong" });
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
    if (res && res.modified === false) continue; /* changed under us */
    /* The store's client answers "modified" for ANY reply that isn't "changed under you", a failed
       write included. A write counts only with the new version's tag, or when reading it back
       shows exactly what was written. */
    if (res && res.etag) return out ? out.value : undefined;
    const back = await readDoc(store, key, fallback).catch(() => null);
    if (back && JSON.stringify(back.data) === JSON.stringify(base)) return out ? out.value : undefined;
    fail("The desk could not save that. Nothing was saved. Try again in a moment.", "busy");
  }
  fail("The desk is busy. Nothing was saved. Try again in a moment.", "busy");
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
  await mutate(store, `upd/${spDay(now)}.json`, [], (list) => {
    /* a looping bot is told to stop; it never pushes the others' lines out */
    if (list.filter((x) => x.bot === bot).length >= LIMITS.updatesPerBotPerDay) fail(`${bot} has already posted ${LIMITS.updatesPerBotPerDay} updates today, which is the limit. Something is repeating: stop, and tell Nova.`, "limit");
    list.push(u);
    return { value: u };
  });
  return u;
}
export async function listUpdates(store, now, days = 2) {
  const keys = Array.from({ length: days }, (_, i) => `upd/${addDays(spDay(now), -i)}.json`);
  const docs = await Promise.all(keys.map((k) => readDoc(store, k, [])));
  return docs.flatMap((d) => (Array.isArray(d.data) ? d.data : [])).sort((a, b) => (a.at < b.at ? 1 : -1));
}
/* rows for the sheet-shaped live log: time | bot | status | message | link */
export const updateRows = (updates) => updates.map((u) => [u.sp, u.bot, u.status, u.message, u.link || ""]);
/* today's word from each bot on its duty: { byDuty: {"d-atlas-1": {...}}, byBot: {"atlas": {...}} }.
   Each keeps who said it and when, so the reader can take the NEWER of the two and ignore a bot
   speaking about another bot's duty. */
export function dutyOverlay(updates, today) {
  const byDuty = {}, byBot = {};
  for (const u of [...updates].sort((a, b) => (a.at < b.at ? -1 : 1))) {
    if (!u.sp || u.sp.slice(0, 10) !== today || !["done", "blocked", "working", "error"].includes(u.status)) continue;
    const v = { status: u.status === "error" ? "blocked" : u.status, message: u.message, at: u.sp, iso: u.at, bot: low(u.bot) };
    if (u.duty) byDuty[low(u.duty)] = v;
    byBot[low(u.bot)] = v; /* the bot's latest word, with or without a duty id */
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
  if (from !== "HQ") noSecrets(text); /* the site's own report is scrubbed line by line in checkReport() */
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
  await mutate(store, msgKey(m.at.slice(0, 7)), [], (list) => {
    const day = m.sp.slice(0, 10);
    if (list.filter((x) => x.from === from && x.sp.slice(0, 10) === day).length >= LIMITS.messagesPerSenderPerDay) fail(`${from} has already sent ${LIMITS.messagesPerSenderPerDay} messages today, which is the limit. Something is repeating: stop, and tell Nova.`, "limit");
    if (list.length >= LIMITS.messagesPerMonth) fail("The board is full for this month. Tell Claude.", "limit");
    list.push(m);
    return { value: m };
  });
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
    /* Luke may close anything; anyone else only what was sent to them, or what they sent themselves */
    if (by !== "Luke" && p.to !== by && p.from !== by) fail(`That message is waiting on ${p.to}, not on you. Only ${p.to}, ${p.from} or Luke can close it.`, "not_allowed");
    p.resolved = { by, at: new Date(now).toISOString(), note };
    return { value: p };
  });
}
/* newest first: everything from this month and the one before, plus anything STILL OPEN from the
   two months before that (a decision asked on the 30th must not vanish on the 1st of the month after) */
export async function listMessages(store, now, months = 2, openMonths = 2) {
  let m = new Date(now).toISOString().slice(0, 7);
  const keys = [];
  for (let i = 0; i < months + openMonths; i++) { keys.push(msgKey(m)); m = prevMonth(m); }
  const docs = await Promise.all(keys.map((k) => readDoc(store, k, [])));
  return docs.flatMap((d, i) => { const list = Array.isArray(d.data) ? d.data : []; return i < months ? list : list.filter(isOpen); }).sort((a, b) => (a.at < b.at ? 1 : -1));
}
export function isOpen(m) { return m.needs !== "none" && !m.resolved; }
/* what is waiting on one name, oldest first */
export const waitingOn = (messages, name) => messages.filter((m) => isOpen(m) && low(m.to) === low(name)).sort((a, b) => (a.at < b.at ? -1 : 1));
export function threads(messages) {
  /* a thread = a first message and EVERY answer under it, however deep the answers were chained
     (an answer to an answer must not vanish from the board) */
  const byId = Object.fromEntries(messages.map((m) => [m.id, m]));
  const rootOf = (m) => { let cur = m; for (let i = 0; i < 20 && cur.re && byId[cur.re]; i++) cur = byId[cur.re]; return cur; };
  const replies = {};
  for (const m of messages) { const r = rootOf(m); if (r !== m) (replies[r.id] || (replies[r.id] = [])).push(m); }
  return messages.filter((m) => rootOf(m) === m).map((m) => ({ ...m, replies: (replies[m.id] || []).sort((a, b) => (a.at < b.at ? -1 : 1)) }));
}

/* ---------- income: one record per payment, and "checked, nothing new" ---------- */
const incKey = (month) => `inc/${month}.json`;
const chkKey = (month) => `chk/${month}.json`;
const sameMoney = (x, e) => low(x.payer) === low(e.payer) && x.amount === e.amount && x.currency === e.currency;
/* Is x the payment e? Same account + reference; or the same day, payer and amount, unless both carry
   a reference and the references differ (two real payments of the same size on one day). */
export function samePayment(x, e) {
  if (x.reference && e.reference) return low(x.account) === low(e.account) && low(x.reference) === low(e.reference);
  return x.date === e.date && sameMoney(x, e);
}
export const dedupeKey = (e) => (e.reference ? low(e.account) + "|ref|" + low(e.reference) : [e.date, low(e.payer), e.amount, e.currency].join("|"));
export async function submitIncome(store, now, roster, a) {
  const by = whoIs(a.bot, roster, { people: true });
  const date = clean(a.date, 10);
  if (!DAY.test(date) || Number.isNaN(Date.parse(date + "T12:00:00Z")) || new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date) fail("date must be the day the money arrived (or the statement date), as YYYY-MM-DD");
  if (date > addDays(spDay(now), 1)) fail("date is in the future");
  const payer = clean(a.payer, 80);
  if (payer.length < 2) fail("payer is empty. Write who paid, exactly as the account or statement shows it.");
  const amount = amountOf(a.amount);
  if (amount == null || amount <= 0) fail('amount must be a positive number, written like 112.01 (a point for the cents, no thousands separator). If you could not see the amount, do not submit: post an update with status "blocked" instead.');
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
  noSecrets(e.payer, e.note, e.period);
  { const what = secretIn(e.reference, { reference: true }); if (what) fail(`reference looks like ${what}. It must be the payment's own transaction id, nothing else.`, "secret"); }

  /* A statement logged as pending, whose money now shows on a LATER day: that is the same payment
     arriving, not a second one. Look for one pending entry with the same payer, amount and currency
     in this month and the three before, and turn it into received (it keeps its statement date and
     gains the day it arrived, which is the day it counts on). */
  if (status === "received") {
    let m = date.slice(0, 7);
    for (let i = 0; i < 4; i++, m = prevMonth(m)) {
      const hit = await mutate(store, incKey(m), [], (list) => {
        if (list.some((x) => samePayment(x, e))) return { skip: true, value: null }; /* the exact payment is there: the normal path below handles it */
        const old = list.find((x) => x.status === "pending" && sameMoney(x, e) && x.date <= date && !(x.reference && e.reference && low(x.reference) !== low(e.reference)));
        if (!old) return { skip: true, value: null };
        old.history = (old.history || []).concat({ at: e.at, by, from: "pending", to: "received" }).slice(-10);
        old.status = "received"; old.arrived = date; old.account = account; old.updatedAt = e.at;
        if (e.reference && !old.reference) old.reference = e.reference;
        if (e.note) old.note = e.note;
        return { value: { entry: old, added: false, updated: true } };
      });
      if (hit) return hit;
      if (i === 0) { const cur = await readDoc(store, incKey(m), []); if ((cur.data || []).some((x) => samePayment(x, e))) break; }
    }
  }
  return mutate(store, incKey(date.slice(0, 7)), [], (list) => {
    const old = list.find((x) => samePayment(x, e));
    if (old) {
      /* the same payment again: never added twice. It may gain its reference; pending may become
         received; received never goes back to pending (a statement email read again). */
      const gainsRef = !!e.reference && !old.reference;
      const moves = old.status !== e.status && !(old.status === "received" && e.status === "pending") && e.status !== "unsorted"; /* a later "unsorted" never overwrites a decided status */
      if (!moves && !gainsRef && !(e.note && e.note !== old.note)) return { skip: true, value: { entry: old, added: false, updated: false } };
      if (moves) { if (old.status === "unsorted") old.category = e.category; old.history = (old.history || []).concat({ at: e.at, by, from: old.status, to: e.status }).slice(-10); old.status = e.status; }
      if (gainsRef) old.reference = e.reference;
      if (e.note) old.note = e.note;
      old.updatedAt = e.at;
      return { value: { entry: old, added: false, updated: true } };
    }
    if (list.length >= LIMITS.paymentsPerMonth) fail("This month's list of payments is full. Tell Claude.", "limit");
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
  await mutate(store, chkKey(c.day.slice(0, 7)), [], (list) => {
    if (list.filter((x) => x.by === by && x.day === c.day).length >= LIMITS.checksPerBotPerDay) fail(`${by} has already recorded ${LIMITS.checksPerBotPerDay} checks today, which is the limit. Something is repeating: stop, and tell Nova.`, "limit");
    list.push(c);
    return { value: c };
  });
  return c;
}
/* Luke (or Claude, Ledger, Sheet, Nova) says what an "unsorted" payment is: income (with its category)
   or not income (a transfer). Only an unsorted entry can be sorted here; anything decided stays. */
export const SORTERS = ["Luke", "Claude", "Ledger", "Sheet", "Nova"];
export async function sortIncome(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  if (!SORTERS.includes(by)) fail(`Only ${SORTERS.join(", ")} can sort a payment.`, "not_allowed");
  const id = clean(a.id, 20);
  if (!/^i[0-9a-z]{8,16}$/.test(id)) fail("id must be the payment's id (it starts with i)");
  const status = low(a.status);
  if (!["received", "transfer"].includes(status)) fail('status must be "received" (it is income) or "transfer" (not income)');
  const category = status === "received" ? CATEGORIES.find((c) => low(c) === low(a.category)) : null;
  if (status === "received" && !category) fail(`category must be one of: ${CATEGORIES.join(", ")}`);
  let months = [clean(a.month, 7)];
  if (!/^\d{4}-\d{2}$/.test(months[0])) { let m = spDay(now).slice(0, 7); months = []; for (let i = 0; i < 4; i++, m = prevMonth(m)) months.push(m); }
  for (const m of months) {
    const hit = await mutate(store, incKey(m), [], (list) => {
      const e = list.find((x) => x.id === id);
      if (!e) return { skip: true, value: null };
      if (e.status !== "unsorted") fail(`That payment is already sorted (${e.status}). Nothing was changed.`, "not_allowed");
      const at = new Date(now).toISOString();
      e.history = (e.history || []).concat({ at, by, from: "unsorted", to: status }).slice(-10);
      e.status = status; if (category) e.category = category; e.updatedAt = at;
      return { value: e };
    });
    if (hit) return hit;
  }
  fail("There is no payment with that id", "not_found");
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
  /* a payment counts on the day it arrived (a pending statement that later landed keeps both dates) */
  entries = entries.map((e) => (e.arrived && e.arrived !== e.date ? { ...e, statement: e.date, date: e.arrived } : e));
  for (const e of entries) {
    if (e.date.slice(0, 7) !== month || e.status === "transfer" || e.status === "unsorted") continue;
    add(e.status === "pending" ? pending : received, e.currency, e.amount);
    if (e.status === "received") add(byCat[e.category] || (byCat[e.category] = {}), e.currency, e.amount);
  }
  const lastCheck = {};
  for (const c of checks) { const k = low(c.account); if (!lastCheck[k] || c.at > lastCheck[k].at) lastCheck[k] = c; }
  const list = sources.map((s) => {
    const mine = entries.filter((e) => (s.kind === "account" ? low(e.account) === low(s.name) || srcMatches(s, e.account) : low(e.source) === s.id || srcMatches(s, e.payer)));
    const last = mine.reduce((a, e) => (!a || e.date > a.date ? e : a), null);
    const chk = s.kind === "account" ? lastCheck[low(s.name)] || Object.values(lastCheck).find((c) => srcMatches(s, c.account)) || null : null;
    const lastLogged = mine.reduce((a, e) => (!a || e.at > a ? e.at : a), null); /* the last time anything was logged for it, as a São Paulo day */
    const lastLook = [lastLogged && spDay(Date.parse(lastLogged)), chk && chk.day].filter(Boolean).sort().pop() || null;
    const monthTotal = {};
    for (const e of mine) if (e.date.slice(0, 7) === month && e.status !== "transfer" && e.status !== "unsorted") add(monthTotal, e.currency, e.amount);
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
  const unknown = [...new Set(entries.filter((e) => e.status !== "transfer" && e.status !== "unsorted" && !payers.some((s) => low(e.source) === s.id || srcMatches(s, e.payer))).map((e) => e.payer))].slice(0, 20);
  const accounts = list.filter((s) => s.kind === "account"), src = list.filter((s) => s.kind !== "account");
  const problems = [];
  for (const a of accounts) if (["never", "overdue", "due"].includes(a.verdict)) problems.push(`${a.name}: not checked today${a.owner ? " (" + a.owner + ")" : ""}`);
  for (const s of src) if (s.verdict === "overdue") problems.push(`${s.name}: ${s.why}`);
  for (const s of list) if (s.verdict === "blocked") problems.push(`${s.name}: blocked. ${s.blocker}`.trim());
  if (unknown.length) problems.push(`New payer(s) not on the list of sources: ${unknown.join(", ")}`);
  const oldPending = entries.filter((e) => e.status === "pending" && daysBetween(e.date, today) > 30).length;
  if (oldPending) problems.push(`${oldPending} pending payment${oldPending === 1 ? "" : "s"} older than 30 days`);
  /* seen in an account (the bank reader), not yet said what it is: listed apart, in no total */
  const unsorted = entries.filter((e) => e.status === "unsorted").sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.at < b.at ? 1 : -1));
  if (unsorted.length) problems.push(`${unsorted.length} payment${unsorted.length === 1 ? "" : "s"} in ${[...new Set(unsorted.map((e) => e.account))].join(" and ")} that nobody has sorted yet`);
  return { month, received, pending, byCategory: byCat, count: entries.filter((e) => e.date.slice(0, 7) === month).length, unsorted: unsorted.slice(0, 40), unsortedCount: unsorted.length,
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

/* ---------- the connector's trouble log: the last few requests that were turned away ----------
   So "the bots' app says HTTP 404" can be looked up instead of guessed. Never the key, never the body:
   the time, the HTTP method, the protocol method, the answer's status, whether a key came with it, the
   protocol version asked for and the client's name. */
export async function traceConnector(store, now, t) {
  const row = { at: new Date(now).toISOString(), sp: spStamp(now), http: clean(t.http, 8), path: clean(t.path, 60), method: clean(t.method, 40), status: Number(t.status) || 0,
    key: ["none", "wrong", "bots", "claude"].includes(t.key) ? t.key : "none", version: clean(t.version, 20), agent: clean(t.agent, 80), note: clean(t.note, 120) };
  try { await mutate(store, "trace.json", [], (list) => { list.push(row); if (list.length > 40) list.splice(0, list.length - 40); return { value: row }; }, 3); } catch {}
  return row;
}
export async function getTrace(store) { const { data } = await readDoc(store, "trace.json", []); return Array.isArray(data) ? data.slice().reverse() : []; }

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
    else if (todays.length && todays[0].status === "working") state = "working"; /* updates are newest first */
    else if (todays.length && todays[0].status === "done" && !items.length) state = "done";
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
  /* one log: when the sheet was read, its Updates tab and the connector are already merged there
     (hqModel -> team.live.feed), so a bot that still writes only the sheet is not shown as silent */
  const live = hq && hq.team && hq.team.live && hq.team.live.ready ? hq.team.live.feed : null;
  const updates = live ? live.map((u) => ({ sp: u.at, at: u.at, bot: u.bot, status: u.status, message: u.message, link: u.link || "" })) : desk.updates;
  const staff = workers(desk.roster, { hq, updates, messages: desk.messages, cards: desk.cards, seen: desk.seen, today, nowHM });
  const lastSeen = Object.entries(desk.seen).filter(([n]) => n !== "Claude").sort((a, b) => (a[1].at < b[1].at ? 1 : -1))[0] || null;
  return {
    today, now: spStamp(now), staff,
    updates: updates.slice(0, 60),
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
  else if (hq) problems.push("Duties: the Tasks tab has no duty rows for today (Nova resets them at 08:05)");
  else problems.push("Duties: not read (the team's sheet could not be read)");
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
  /* the report quotes cells from the sheet and lines from the bots: anything that looks like a
     password or an account number is left out here, so the report itself always goes through */
  const scrub = (list) => list.map((t) => (secretIn(t) ? "(one line left out: it looked like a password, a code or an account number)" : t));
  problems.splice(0, problems.length, ...scrub(problems)); lines.splice(0, lines.length, ...scrub(lines));
  const title = `HQ check, ${today} ${morning ? "morning" : "evening"}: ` + (problems.length ? `${problems.length} thing${problems.length === 1 ? "" : "s"} to look at` : "all running");
  const text = [title, ...(problems.length ? ["", "Needs a look:", ...problems.map((p) => "- " + p)] : []), "", "Running:", ...lines.map((l) => "- " + l)].join("\n").slice(0, 1500);
  return { title, problems, lines, text, part: morning ? "am" : "pm", day: today };
}
