/* The staff desk (11 Nov 2026): what the bot team, Claude and Luke share ON THE SITE.

   Until now the bots only wrote rows into Google Sheets and /hq only read them. This adds a small
   desk kept in the Netlify Blob store "staff" (the site can't write the sheets, and shouldn't):

     updates   the bots' running log (same shape as the sheet's Updates tab; the two are merged)
     messages  one board for Luke, Claude and every bot (needs: none | reply | action | decision)
     income    one record per payment, submitted daily, plus "I checked <account>, nothing new"
     roster    who each bot is, why it is needed, what it does every day
     sources   every place money comes from, so a missing one is visible
     cards     what each bot says it is working on; seen/<bot>.json = its last call
     releases  the release pipeline (11 Nov 2026): one pack per song with everything every bot needs
               (the WAV, the artwork, the lyrics, the RouteNote details, whose release it is) and its
               steps, dated back from the release day
     sightings what Spotify for Artists shows as upcoming (Atlas, daily) and Luke's answers about the
               songs there that never went through the pipeline (sightings.json)
     read      read/<name>.json: when each bot (or Claude) last took its messages (my_day,
               read_messages, Alfred's luke_briefing), so "Read by Nova 17:10" means read, not active

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
export const PEOPLE = ["Luke", "Claude", "HQ"]; /* not bots; HQ = the site's own check (three times a day since 11 Nov 2026) */
/* nobody needs more than this in a day; past it something is looping, and the answer is "stop" */
export const LIMITS = { updatesPerBotPerDay: 60, messagesPerSenderPerDay: 40, messagesPerMonth: 1500, paymentsPerMonth: 3000, checksPerBotPerDay: 40, releases: 60, releaseLog: 30 };

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
/* lyric: a song's words (11 Nov 2026). "the password is 2night", "my secret is 4ever yours", "pass: 24/7
   on my mind" and "token: 1000 kisses" are lines of a song, not secrets: in lyrics the value must look
   like a made-up secret (letters AND digits, 6 or more, no "/", not a word like 2night or 4ever). */
const lyricSecret = (v) => /[A-Za-z]/.test(v) && v.length >= 6 && !v.includes("/") && !/^\d+[A-Za-z]+[.,!?'"]*$/.test(v);
export function secretIn(text, { reference = false, lyric = false } = {}) {
  const s = String(text || "");
  for (const m of s.matchAll(SAID)) {
    const v = m[2];
    /* the value has to look like the secret itself: a digit in it, and not "6-digit", "60-day" or a date */
    if (/\d/.test(v) && !/^\d{1,3}-[A-Za-z]/.test(v) && !/^\d{4}-\d{2}-\d{2}\b/.test(v) && (!lyric || lyricSecret(v))) return "a password, code or key";
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
/* extra (never from a tool's arguments): { release } marks a line written by setStep() for a release
   step, so it shows in the live log but never finishes or blocks the bot's DAILY duty (dutyOverlay). */
export async function postUpdate(store, now, roster, a, extra = {}) {
  const bot = whoIs(a.bot, roster);
  const status = low(a.status);
  if (!UPDATE_STATUS.includes(status)) fail(`status must be one of: ${UPDATE_STATUS.join(", ")}`);
  const message = clean(a.message, 240);
  if (message.length < 3) fail("message is empty. Say what you did or what is in the way, with the number if there is one.");
  noSecrets(message, a.link);
  const u = { id: newId("u", now), at: new Date(now).toISOString(), sp: spStamp(now), bot, status, message, link: httpsLink(a.link), duty: /^[Dd]-[\w-]{1,30}$/.test(clean(a.duty, 40)) ? clean(a.duty, 40) : "", ...(extra.release ? { release: clean(extra.release, 60) } : {}) };
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
    if (u.release) continue; /* "Survivors: Lyrics live — done" is about a release step, not today's duty */
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
  /* what Luke's answer settles the message with (an option he picked); "answered" otherwise */
  const settleNote = from === "Luke" ? clean(a.note, 240) : "";
  if (settleNote) noSecrets(settleNote);
  const pm = re ? monthOfId(re) : null;
  if (re) {
    if (!pm) fail("re must be the id of the message you are answering");
    const cur = await readDoc(store, msgKey(pm), []);
    if (!(Array.isArray(cur.data) ? cur.data : []).some((x) => x.id === re)) fail("There is no message with that id", "not_found");
  }
  /* The answer is saved FIRST, and only then is the message it answers settled (fixed 11 Nov 2026): a
     full board or a busy desk must never close the question while losing the answer to it. */
  await mutate(store, msgKey(m.at.slice(0, 7)), [], (list) => {
    const day = m.sp.slice(0, 10);
    if (list.filter((x) => x.from === from && x.sp.slice(0, 10) === day).length >= LIMITS.messagesPerSenderPerDay) fail(`${from} has already sent ${LIMITS.messagesPerSenderPerDay} messages today, which is the limit. Something is repeating: stop, and tell Nova.`, "limit");
    if (list.length >= LIMITS.messagesPerMonth) fail("The board is full for this month. Tell Claude.", "limit");
    list.push(m);
    return { value: m };
  });
  let parent = null;
  if (re) {
    try {
      parent = await mutate(store, msgKey(pm), [], (list) => {
        const p = list.find((x) => x.id === re);
        if (!p) return { skip: true, value: null };
        /* an answer from the person it was waiting on settles a "reply". Luke's answer settles ANYTHING
           that waits on him (11 Nov 2026, Luke: "when i reply to a message right now nothing happens"):
           a plain reply to an action or a decision used to leave it sitting in "Waiting on you". */
        if (!p.resolved && from === "Luke" && isOpen(p) && p.to === "Luke") { p.resolved = { by: "Luke", at: m.at, note: settleNote || "answered" }; return { value: p }; }
        if (p.needs === "reply" && !p.resolved && (p.to === from || p.to === "all")) { p.resolved = { by: from, at: m.at, note: "answered" }; return { value: p }; }
        return { skip: true, value: p };
      });
    } catch {
      /* the answer is on the board; the question just stays open (the caller sees settled: false). Never
         throw here: the sender would think nothing was sent and send the answer twice. */
      parent = null;
    }
  }
  return { message: m, parent, settled: !!(parent && parent.resolved && parent.resolved.at === m.at) };
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
  if (status === "unsorted" && by !== "HQ") fail("status must be received, pending or transfer"); /* only the bank reader files a payment as unsorted */
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
    /* pending_id (the bank reader): THAT statement, chosen by the caller, and no other */
    const pid = clean(a.pending_id, 20);
    let m = date.slice(0, 7);
    for (let i = 0; i < 4; i++, m = prevMonth(m)) {
      const hit = await mutate(store, incKey(m), [], (list) => {
        if (list.some((x) => samePayment(x, e))) return { skip: true, value: null }; /* the exact payment is there: the normal path below handles it */
        const old = pid ? list.find((x) => x.id === pid && x.status === "pending" && x.amount === e.amount && x.currency === e.currency && x.date <= date)
          : list.find((x) => x.status === "pending" && sameMoney(x, e) && x.date <= date && !(x.reference && e.reference && low(x.reference) !== low(e.reference)));
        if (!old) return { skip: true, value: null };
        old.history = (old.history || []).concat({ at: e.at, by, from: "pending", to: "received" }).slice(-10);
        old.status = "received"; old.arrived = date; old.account = account; old.updatedAt = e.at;
        /* a statement keeps its own reference; the account's transaction id is kept beside it */
        if (e.reference && !old.reference) old.reference = e.reference;
        else if (e.reference && low(old.reference) !== low(e.reference)) old.bankRef = e.reference;
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
      if (moves && old.status === "unsorted" && by !== "HQ" && !SORTERS.includes(by)) fail("That payment is unsorted. Only Ledger, Sheet, Nova, Claude or Luke say what it is, with the tool sort_payment. Nothing was changed.", "not_allowed");
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
/* Who may say what an "unsorted" payment is: income (with its category) or not income (a transfer).
   Luke and Claude, and the three bots whose job is the money: Ledger, Sheet and Nova (Luke, 11 Nov
   2026: the bots see his full Revolut income, so the income bot can sort it).
   What the bank reader itself decided (its last word is HQ's: "transfer" from an own-transfer rule,
   "received" from a known source) can be corrected too; what a person or a bot decided stays. */
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
      const lastBy = (e.history || []).length ? e.history[e.history.length - 1].by : e.by;
      if (e.status !== "unsorted" && lastBy !== "HQ") fail(`That payment is already sorted (${e.status}). Nothing was changed.`, "not_allowed");
      if (e.status === "pending") fail("That payment is still pending. Nothing was changed.", "not_allowed");
      const at = new Date(now).toISOString();
      e.history = (e.history || []).concat({ at, by, from: e.status, to: status }).slice(-10);
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
/* "Read", not "active" (V6, 11 Nov 2026, Luke: "i want to know when i've replied to a message and that
   reply has been read"): read/<name>.json is written ONLY by the tools that hand a reader its messages
   (my_day, read_messages, and luke_briefing for Alfred). seen/<name>.json stays "last used the desk":
   a bot that only posts an update has used the desk, not read its messages. */
export async function touchRead(store, now, name) {
  try { await store.setJSON(`read/${low(name).replace(/[^a-z0-9]/g, "")}.json`, { at: new Date(now).toISOString() }); } catch {}
}
/* when this reader last took its messages (null = never); read BEFORE touchRead moves it */
export async function lastRead(store, name) {
  try { const { data } = await readDoc(store, `read/${low(name).replace(/[^a-z0-9]/g, "")}.json`, null); return data && data.at ? data.at : null; } catch { return null; }
}
/* What a reader is HANDED when the read marker moves (11 Nov 2026, review: my_day wrote "Read by Ledger"
   for Luke's reply, which it never gave Ledger; it listed only what was still open). Every message to
   `name`, to all, or answering one of `name`'s own, written since its last read, newest `max`, oldest
   first. more = how many older ones did not fit (read_messages has them). */
export function messagesFor(messages, name, since, max = 30) {
  const mine = new Set(messages.filter((m) => m.from === name).map((m) => m.id));
  const all = messages.filter((m) => m.from !== name && (!since || m.at > since) && (m.to === name || m.to === "all" || (!!m.re && mine.has(m.re))))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  return { list: all.slice(0, max).reverse(), more: Math.max(0, all.length - max) };
}
export async function getRead(store, roster) {
  const names = botNames(roster).concat("Claude");
  const docs = await Promise.all(names.map((n) => readDoc(store, `read/${low(n).replace(/[^a-z0-9]/g, "")}.json`, null)));
  return Object.fromEntries(names.map((n, i) => [n, docs[i].data]).filter(([, v]) => v && v.at));
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

/* ---------- the release pipeline (11 Nov 2026) ----------
   Luke: "when a new song is ready we want all the info every bot needs, high quality wav link,
   artwork, lyrics, information for routenote everything, and that they auto schedule it and
   everything and the pitch is handled later". One desk document, releases.json (newest first), one
   entry per song: the PACK (every field a bot needs, PACK_FIELDS) and the STEPS (RELEASE_STEPS),
   dated back from the release day when Luke sends it to the team. The form on /hq, the connector's
   tools and the "still missing" list are all built from these two lists, so a field is added in ONE
   place. A release is "draft" (Luke is still filling it), "scheduled" (sent; the steps have dates)
   or "cancelled". "Released" is never stored: it is a scheduled release whose day has come. */
const F = (key, label, short, kind, group, o = {}) => ({ key, label, short, kind, group, required: !!o.required, requiredWhen: o.requiredWhen || null, showWhen: "showWhen" in o ? o.showWhen : o.requiredWhen || null, neededBy: o.neededBy || "",
  choices: o.choices || [], hint: o.hint || "", fill: o.fill || [], max: o.max || (kind === "line" ? 200 : kind === "link" ? 400 : 1000) });
/* group = where the /hq form shows it: deal | files | stores | lyrics | pitch | later | notes.
   required = must be filled before the pack can go to the team. requiredWhen = { field, equals }:
   required only while another field has that value (the label and the split, only "With a label").
   neededBy = a step that needs it (it shows as missing until filled, and that step's owner is told).
   fill = which bots may fill it through the connector (Luke and Claude fill everything; Nova may fill
   what any bot may fill). */
export const LABEL_KIND = "With a label";
export const SELF_KIND = "Self-release";
/* who delivers a self-release when the pack doesn't say (Luke's spec, 11 Nov 2026) */
export const SELF_DISTRIBUTOR = "RouteNote (badscandaladmin)";
const WITH_LABEL = { field: "kind", equals: LABEL_KIND };
export const PACK_FIELDS = [
  /* Whose release is it (11 Nov 2026, Luke: "i want it to be if it's self release or released with
     label; for instance touch me: [the label] own 50% of that"). First on the form. */
  F("kind", "Self-release or with a label", "Self-release or label", "choice", "deal", { required: true, choices: [SELF_KIND, LABEL_KIND], hint: "With a label = a label owns part of it or delivers it to the stores." }),
  F("label", "The label", "Label", "line", "deal", { requiredWhen: WITH_LABEL, max: 120, hint: "The label's name, as on the contract." }),
  F("split", "The split (who owns what)", "Split", "line", "deal", { requiredWhen: WITH_LABEL, hint: 'For example "BADSCANDAL 50% · Sample Records 50%".' }),
  F("distributor", "Who delivers it to the stores", "Distributor", "line", "deal", { max: 120, hint: `Leave empty: a self-release goes through ${SELF_DISTRIBUTOR}, a label release is delivered by the label. Write "RouteNote" if we deliver a label release ourselves.` }),
  F("deal", "The deal in a few words (contract, date signed, where the money comes from)", "The deal", "text", "deal", { max: 600, hint: 'Optional. For example "Contract signed 3 Mar 2026; the label pays royalties twice a year".' }),
  F("wav", "Master WAV (link)", "Master WAV", "link", "files", { required: true, hint: "A download link to the final master, as a WAV file (Dropbox, Google Drive...). It must start with https://" }),
  F("artwork", "Artwork, 3000 x 3000 (link)", "Artwork", "link", "files", { required: true, hint: "A link to the cover: square, 3000 x 3000 pixels, JPG or PNG. No store logos or web addresses on it." }),
  F("folder", "Folder with the release files (link)", "Folder", "link", "files", { hint: "Optional. One shared folder with the master, the cover, stems and clips." }),
  F("language", "Language of the lyrics", "Language", "line", "stores", { required: true, hint: 'For example "Portuguese", "English", or "Instrumental".' }),
  F("explicit", "Explicit lyrics?", "Explicit", "choice", "stores", { required: true, choices: ["No", "Yes", "Clean version"], hint: "Yes if the lyrics swear or are sexual. RouteNote asks for it." }),
  F("genre", "Genre", "Genre", "line", "stores", { required: true, hint: 'The main store genre, for example "Dance" or "Electronic".' }),
  F("subgenre", "Second genre", "Second genre", "line", "stores", { hint: 'Optional, for example "House".' }),
  F("version", "Version (Original, Radio edit...)", "Version", "line", "stores", { hint: "Leave empty for the original." }),
  F("writers", "Writers: full legal names, who wrote music and who wrote lyrics", "Writers", "text", "stores", { required: true, max: 600, hint: 'One person per line, for example "Full Legal Name: music and lyrics". Legal names, not artist names.' }),
  F("producers", "Producers", "Producers", "line", "stores", { hint: "Optional. As they should be credited." }),
  F("featuring", "Featured artists", "Featured artists", "line", "stores", { hint: "Only artists credited in the title." }),
  /* required to send a SELF-RELEASE since 11 Nov 2026 (evening): it cannot be uploaded without it. A label
     release the label delivers doesn't use it (review, 11 Nov 2026); one we upload ourselves needs it for
     the upload. showWhen: the form shows it whatever the kind (requiredWhen alone would hide it). */
  F("copyright", "Copyright line (℗ and ©)", "Copyright line", "line", "stores", { requiredWhen: { field: "kind", equals: SELF_KIND }, showWhen: null, neededBy: "upload", hint: 'For example "℗ 2026 BADSCANDAL · © 2026 BADSCANDAL". Drop needs it for the upload.' }),
  /* Luke's words only (11 Nov 2026): Verse puts them live, it never writes them (the guide: "never write,
     guess or copy lyrics"), so no bot fills this field */
  F("lyrics", "Lyrics, full text", "Lyrics", "text", "lyrics", { neededBy: "lyrics", max: 8000, hint: "The whole text, line by line, as sung. Verse puts them live in the stores." }),
  F("mood", "Mood (for the pitch)", "Mood", "line", "pitch", { neededBy: "pitch", hint: 'Can wait. For example "late night, euphoric".' }),
  F("instruments", "Instruments (for the pitch)", "Instruments", "line", "pitch", { neededBy: "pitch", hint: 'Can wait. For example "synths, drum machine, vocal chops".' }),
  F("story", "The song in two lines (for the pitch)", "The song in two lines", "text", "pitch", { neededBy: "pitch", max: 400, hint: "Can wait. What the song is about and why it matters, for Atlas's Spotify pitch." }),
  F("isrc", "ISRC", "ISRC", "line", "later", { fill: ["Drop"], max: 40, hint: "Drop fills it from RouteNote." }),
  F("upc", "UPC", "UPC", "line", "later", { fill: ["Drop"], max: 40, hint: "Drop fills it from RouteNote." }),
  F("storeStatus", "Status at the distributor", "Status at the distributor", "line", "later", { fill: ["Drop"], hint: 'Drop keeps it current, for example "in review at RouteNote".' }),
  F("spotifyTrack", "Spotify track link", "Spotify track link", "link", "later", { fill: ["Atlas", "Webmaster"], hint: "https://open.spotify.com/track/... once the song is out." }),
  /* Laura's RESULT, not her input (11 Nov 2026): never "missing" before her step, like the ISRC */
  F("video", "Video (link)", "Video", "link", "later", { fill: ["Laura"], hint: "Laura fills it once the video is scheduled." }),
  F("page", "Song page (link)", "Song page", "link", "later", { fill: ["Webmaster"], hint: "Webmaster fills it once the page is live: https://badscandal.com/<slug>" }),
  F("notes", "Anything else the team should know", "Notes", "text", "notes", { max: 1000, hint: "Optional." }),
];
/* null prototype (11 Nov 2026): "constructor", "toString" or "__proto__" sent as a pack key must be an
   unknown field, not something every plain object already has */
const FIELD = Object.assign(Object.create(null), Object.fromEntries(PACK_FIELDS.map((f) => [f.key, f])));
/* days = how many days before the release day the step is due. after = a step that must be done (or
   skipped) first: until then this one is WAITING, never late (11 Nov 2026, Luke: "it says spotify pitch
   sent [late] but it didn't get sent because the song hasn't shown in spotify for artists yet"). */
export const RELEASE_STEPS = [
  { key: "upload", label: "Uploaded to RouteNote with the release date", owner: "Drop", days: 21 },
  { key: "approved", label: "Approved by RouteNote (nothing waiting)", owner: "Drop", days: 16 },
  { key: "spotify", label: "Showing as upcoming in Spotify for Artists", owner: "Atlas", days: 15 },
  { key: "pitch", label: "Spotify pitch sent", owner: "Atlas", days: 14, after: "spotify" },
  { key: "lyrics", label: "Lyrics live", owner: "Verse", days: 10 },
  { key: "page", label: "Song page live on badscandal.com", owner: "Webmaster", days: 7 },
  { key: "video", label: "Video scheduled on YouTube", owner: "Laura", days: 7 },
  { key: "teasers", label: "Teaser clips approved for posting", owner: "Luke", days: 3 },
  { key: "ads", label: "Ad drafts ready, inside the cap", owner: "Forge", days: 1 },
  { key: "live", label: "Release day: Spotify link on the song page and the home card", owner: "Webmaster", days: 0 },
];
const STEP = Object.assign(Object.create(null), Object.fromEntries(RELEASE_STEPS.map((s) => [s.key, s])));
/* skipped (11 Nov 2026): a step that does not apply (the label delivers it; the song was already out).
   Never late, never open. Only Luke, Claude and Nova skip a step, always with a note. */
export const STEP_STATUS = ["todo", "working", "done", "blocked", "skipped"];
const finished = (s) => !!s && (s.status === "done" || s.status === "skipped");
export const LABEL_NOTE = "The label delivers this one";
export const OUT_NOTE = "Already out when it was recorded";
export const PITCHED_NOTE = "The pitch was sent before this step existed";
/* the steps whose work carries the release day OUTSIDE the desk (the store, YouTube, the song page):
   when the day moves after they are done, they have to be changed there too */
const DATED_OUTSIDE = ["upload", "video", "page", "live"];
export const RELEASE_STATUS = ["draft", "scheduled", "cancelled"];
const REL_KEY = "releases.json";
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isDay = (d) => DAY.test(d || "") && !Number.isNaN(Date.parse(d + "T12:00:00Z")) && new Date(d + "T12:00:00Z").toISOString().slice(0, 10) === d;
/* "2026-12-11" -> "Fri 11 Dec" (what a bot and Luke read; the ISO date travels next to it) */
export const dayWords = (d) => (isDay(d) ? `${WEEKDAY[new Date(d + "T12:00:00Z").getUTCDay()]} ${Number(d.slice(8, 10))} ${MONTH[Number(d.slice(5, 7)) - 1]}` : "");
/* a song's name compared without accents, case, spaces or signs: "Me Dá Seu Body" = "me da seu body" = "medaseubody" */
export const songKey = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const releaseId = (title) => songKey(title).slice(0, 40);
/* Is it the same song? (fixed 11 Nov 2026, review) A title with no Latin letter or digit ("Ночь", an emoji)
   has an EMPTY songKey, and "" === "" made every such title the same song. Those are compared by their
   own words instead (lower case, spaces trimmed); an empty title is never the same as anything. */
const ownWords = (s) => String(s == null ? "" : s).normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
export function sameSong(a, b) {
  const ka = songKey(a), kb = songKey(b);
  if (ka || kb) return ka === kb;
  return ownWords(a) !== "" && ownWords(a) === ownWords(b);
}
/* the part of a sighting's key that names the song: its songKey, or for a title with no Latin letter or
   digit a short hash of its own words (ASCII, so two such songs never share one key or one page id) */
function titlePart(title) {
  const k = songKey(title);
  if (k) return k;
  let h = 2166136261;
  for (const ch of ownWords(title)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return "t" + h.toString(36);
}
const filled = (v) => v != null && String(v).trim() !== "";
const lukeOrClaude = (by, what) => { if (by !== "Luke" && by !== "Claude") fail(`Only Luke or Claude can ${what}. If something about this release needs changing, send Luke a message.`, "not_allowed"); };
const joinWords = (list) => (list.length < 2 ? list.join("") : list.slice(0, -1).join(", ") + " and " + list[list.length - 1]);

/* ---------- the deal (11 Nov 2026): self-release or with a label, and the split ---------- */
/* is this field required for THIS pack? (requiredWhen: the label and the split only "With a label") */
export const requiredNow = (f, pack) => !!f.required || (!!f.requiredWhen && (pack || {})[f.requiredWhen.field] === f.requiredWhen.equals);
/* who delivers it: what the pack says, else RouteNote for a self-release and the label for a label
   release; "" while the kind is not recorded */
export function distributorOf(pack) {
  const p = pack || {};
  if (filled(p.distributor)) return p.distributor;
  return p.kind === LABEL_KIND ? p.label || "the label" : p.kind === SELF_KIND ? SELF_DISTRIBUTOR : "";
}
/* a label release the label delivers itself: our RouteNote upload and approval don't apply */
export const labelDelivers = (pack) => !!pack && pack.kind === LABEL_KIND && !/routenote/i.test(pack.distributor || "");
/* what /hq's Songs card and the board show: { kind, label, split, distributor, id }. kind "" = a desk
   record exists but whose release it is was never recorded (releases from before 11 Nov 2026). */
export const dealOf = (r) => { const p = r.pack || {}; return { kind: p.kind || "", label: p.label || "", split: p.split || "", distributor: distributorOf(p), id: r.id }; };

/* every pack value through the same cleaners as the rest of the desk, then the secrets guard (the
   lyrics too: ordinary words like "password" or a number in a line pass, a real "password: x1y2z3"
   doesn't) */
export function packValue(key, v) {
  const f = FIELD[key];
  if (!f) fail(`"${clean(key, 40)}" is not a field of the release pack. The fields are: ${PACK_FIELDS.map((x) => x.key).join(", ")}.`);
  if (v == null) return "";
  if (typeof v !== "string" && typeof v !== "number") fail(`${f.short} must be written as text.`);
  let out;
  if (f.kind === "link") {
    const s = clean(v, 400);
    if (!s) return "";
    out = httpsLink(s);
    if (!out) fail(`${f.short} must be a link that starts with https:// (copy it from the browser's address bar). Nothing was saved.`);
  } else if (f.kind === "choice") {
    const s = clean(v, 40);
    if (!s) return "";
    out = f.choices.find((c) => low(c) === low(s));
    if (!out) fail(`${f.short} must be one of: ${f.choices.join(", ")}.`);
  } else out = f.kind === "text" ? cleanText(v, f.max) : clean(v, f.max);
  packSecrets(f, out);
  return out;
}
/* The refusal says WHICH line, its digits hidden, and what to do: whoever filled it (Luke, Claude or a
   bot) can act on it. "Ask Luke" is no use to Verse (fixed 11 Nov 2026). */
function packSecrets(f, out) {
  const lines = String(out).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const what = secretIn(lines[i], { lyric: f.key === "lyrics" });
    if (!what) continue;
    const q = clean(lines[i], 60).replace(/\d/g, "•");
    fail(`${f.short}${lines.length > 1 ? `, line ${i + 1}` : ""} ("${q}${lines[i].trim().length > 60 ? "…" : ""}") looks like ${what}. Nothing was saved. Passwords, codes, keys, card and bank account numbers never go in the release pack: take that out and save again.`, "secret");
  }
  if (secretIn(out, { lyric: f.key === "lyrics" })) noSecrets(out);
}

/* The steps, dated back from the release day. A due date already past becomes TODAY: a release sent
   late is compressed, never born late. tight = sent fewer than 21 days before its day.
   o.labelDelivers: the RouteNote upload and approval are "skipped" (the label delivers it).
   o.alreadyOut: a song recorded after it came out (for its deal): every step skipped, no dates. */
export function scheduleSteps(date, today, o = {}) {
  if (o.alreadyOut) return { steps: RELEASE_STEPS.map((s) => ({ key: s.key, label: s.label, owner: s.owner, due: null, status: "skipped", note: OUT_NOTE, link: "", at: null, by: null })), tight: false };
  const steps = RELEASE_STEPS.map((s) => {
    const want = addDays(date, -s.days);
    const skip = o.labelDelivers && (s.key === "upload" || s.key === "approved");
    return { key: s.key, label: s.label, owner: s.owner, due: want < today ? today : want, status: skip ? "skipped" : "todo", note: skip ? LABEL_NOTE : "", link: "", at: null, by: null };
  });
  return { steps, tight: daysBetween(today, date) < 21 };
}
/* a step whose `after` step is not finished yet (the pitch before the song shows in Spotify for
   Artists). A release from before 11 Nov 2026 has no spotify step: its pitch never waits. */
function waitingFor(steps, s) {
  const after = STEP[s.key] && STEP[s.key].after;
  if (!after || finished(s)) return null;
  const a = steps.find((x) => x.key === after);
  return a && !finished(a) ? a : null;
}
const waitWords = (a) => (a.key === "spotify" ? "waiting: the song is not in Spotify for Artists yet" : `waiting for "${a.label}"`);
/* the moment a step is done (or skipped), the steps that waited for it become ordinary steps, due no
   earlier than today: they are never born late */
function freeWaiting(r, key, today) {
  for (const s of r.steps || []) if (STEP[s.key] && STEP[s.key].after === key && !finished(s) && s.due && s.due < today) s.due = today;
}
/* label release or not, after a change of the pack on a release already sent: the upload and the
   approval follow the deal (only while nobody has started them) */
function applyDeal(r, today) {
  if (r.status !== "scheduled" || r.alreadyOut) return [];
  const lab = labelDelivers(r.pack), changed = [];
  for (const s of r.steps || []) {
    if (s.key !== "upload" && s.key !== "approved") continue;
    if (lab && s.status === "todo") { s.status = "skipped"; s.note = LABEL_NOTE; changed.push(s.label); }
    /* ours again: never born late (review, 11 Nov 2026), like a release sent late */
    else if (!lab && s.status === "skipped" && s.note === LABEL_NOTE) { s.status = "todo"; s.note = ""; if (today && s.due && s.due < today) s.due = today; changed.push(s.label); }
  }
  return changed;
}
/* What Drop is told when the deal changes after the song went to the team (review, 11 Nov 2026: his steps
   moved without a word, and an upload he had started stayed "working" on a song the label delivers).
   "" when nothing of his changed. */
function dealNews(r, by, moved) {
  const up = (r.steps || []).find((s) => s.key === "upload");
  const started = up && (up.status === "working" || up.status === "done") ? up.status : "";
  const lab = labelDelivers(r.pack);
  if (!moved.length && !(lab && started)) return "";
  const head = `${by} changed whose release ${r.title} is (out ${dayWords(r.date)}): `;
  if (!lab) return head + `we deliver it now, through ${distributorOf(r.pack)}. ${joinWords(moved)} ${moved.length === 1 ? "is" : "are"} yours again: the dates are in my_day.`;
  return head + `${r.pack.label || "the label"} delivers it to the stores, not us.` + (moved.length ? ` ${joinWords(moved)} ${moved.length === 1 ? "is" : "are"} skipped.` : "") +
    (started ? ` "${up.label}" is already ${started}: stop, and tell Luke on the desk whether it went to RouteNote, so the song is not delivered twice.` : " Do not upload it to RouteNote.");
}

/* A song recorded only for its deal (already out): it needs the deal, not the files. A draft whose day
   has passed is recorded this way when it is sent. */
const outAlready = (r, today) => !!r.alreadyOut || (r.status === "draft" && isDay(r.date) && r.date < today);

/* what one release looks like to /hq and to the tools. o.sightings: the latest Spotify for Artists
   report (sightingsView or the stored document), for the warnings. */
export function releaseView(r, today, o = {}) {
  const date = isDay(r.date) ? r.date : null;
  const pack = r.pack || {};
  const raw = r.steps || [];
  const steps = raw.map((s) => {
    const w = waitingFor(raw, s), skipped = s.status === "skipped";
    return { ...s, late: !finished(s) && !w && !!s.due && s.due < today, dueIn: s.due ? daysBetween(today, s.due) : null, waiting: !!w,
      ...(w ? { waitingFor: w.key, waitingText: waitWords(w) } : {}), ...(skipped ? { skipped: true } : {}), ...(STEP[s.key] && STEP[s.key].after ? { after: STEP[s.key].after } : {}) };
  });
  const dueOf = (key) => { const s = steps.find((x) => x.key === key); return s ? s.due : date && STEP[key] ? addDays(date, -STEP[key].days) : null; };
  const out = outAlready(r, today);
  const missing = [];
  if (!date) missing.push({ key: "date", label: "Release day", short: "Release day", required: true, neededBy: "", step: "", owner: "", due: null });
  /* already out: only whose song it is matters (the files and the details went to the stores long ago) */
  for (const f of PACK_FIELDS) if (requiredNow(f, pack) && !filled(pack[f.key]) && (!out || f.group === "deal")) missing.push({ key: f.key, label: f.label, short: f.short, required: true, neededBy: "", step: "", owner: "", due: null });
  for (const f of PACK_FIELDS) if (!out && !requiredNow(f, pack) && f.neededBy && !filled(pack[f.key])) {
    const st = steps.find((x) => x.key === f.neededBy);
    if (st && st.status === "skipped") continue; /* the label delivers it: nothing of ours needs the field */
    if (!st && labelDelivers(pack) && (f.neededBy === "upload" || f.neededBy === "approved")) continue; /* nor in a draft */
    missing.push({ key: f.key, label: f.label, short: f.short, required: false, neededBy: f.neededBy, step: STEP[f.neededBy].label, owner: STEP[f.neededBy].owner, due: dueOf(f.neededBy) });
  }
  /* "Pack: 14 of 17 filled": the fields Luke fills about the song; the team's "later" fields and the
     deal (shown on its own line) are not counted */
  const own = PACK_FIELDS.filter((f) => f.group !== "later" && f.group !== "deal");
  const open = steps.filter((s) => !finished(s));
  /* next = the first open step someone can work on now (a waiting one only when nothing else is open) */
  const next = open.find((s) => !s.waiting) || open[0] || null;
  const released = r.status === "scheduled" && !!date && date <= today;
  const v = { id: r.id, title: r.title, date, status: r.status, weekday: date ? WEEKDAY[new Date(date + "T12:00:00Z").getUTCDay()] : null, dateWords: dayWords(date),
    daysToGo: date ? daysBetween(today, date) : null, released, tight: !!r.tight, alreadyOut: !!r.alreadyOut, sentWithout: Array.isArray(r.sentWithout) ? r.sentWithout : null,
    createdAt: r.createdAt || null, createdBy: r.createdBy || "", updatedAt: r.updatedAt || null, sentAt: r.sentAt || null,
    pack: Object.fromEntries(PACK_FIELDS.filter((f) => filled(pack[f.key])).map((f) => [f.key, pack[f.key]])),
    deal: dealOf(r),
    packFilled: own.filter((f) => filled(pack[f.key])).length, packTotal: own.length, missing, steps,
    counts: { done: steps.filter((s) => s.status === "done").length, total: steps.filter((s) => s.status !== "skipped").length, late: steps.filter((s) => s.late).length,
      blocked: steps.filter((s) => s.status === "blocked").length, skipped: steps.filter((s) => s.status === "skipped").length, waiting: steps.filter((s) => s.waiting).length },
    next: next ? { key: next.key, label: next.label, owner: next.owner, due: next.due, dueIn: next.dueIn, status: next.status, late: next.late, waiting: next.waiting, note: next.note || "" } : null,
    log: (r.log || []).slice().reverse() };
  v.warnings = releaseWarnings(v, o.sightings || null, today);
  v.where = whereWords(v, today);
  return v;
}
/* a release the team is still working on: sent, not a song recorded after it came out, and not out
   for more than 14 days */
export const releaseActive = (v) => v.status === "scheduled" && !v.alreadyOut && (v.daysToGo == null || v.daysToGo >= -14);

/* "Where it is at", one line (V1, 11 Nov 2026): "4 of 9 steps done · next: Lyrics live, Verse, Fri 14 Nov" */
export function whereWords(v, today) {
  const filledLine = `${v.packFilled} of ${v.packTotal} filled`;
  if (v.status === "cancelled") return "Cancelled";
  if (v.status === "draft") {
    const req = v.missing.filter((m) => m.required);
    if (v.date && v.date < today) return `Release day ${dayWords(v.date)} has passed: sending records it as already out, with no steps` + (req.length ? ` · still missing: ${joinWords(req.map((m) => m.short))}` : "");
    return "In the pipeline: " + filledLine + (req.length ? ` · still missing: ${joinWords(req.map((m) => m.short))}` : " · ready to send");
  }
  if (v.alreadyOut) return `Already out (${v.dateWords || "no date"}): recorded for its deal`;
  const n = `${v.counts.done} of ${v.counts.total} steps done`;
  if (v.released) return (v.daysToGo === 0 ? "Out today" : `Out since ${v.dateWords}`) + " · " + n;
  const x = v.next;
  if (!x) return `All ${v.counts.total} steps done · out ${v.dateWords}`;
  /* blocked before late (11 Nov 2026, review): "late" pointed at Drop when the step waits on Luke's cover */
  return `${n} · next: ${x.label}, ${x.owner}, ` + (x.waiting ? "waiting: not in Spotify for Artists yet" : x.status === "blocked" ? "blocked" + (x.note ? `: ${x.note.replace(/\s+/g, " ").slice(0, 60)}` : "") : x.late ? `late since ${dayWords(x.due)}` : dayWords(x.due) || "no date yet");
}

/* ---------- warnings on a release (V5, 11 Nov 2026): a fact with a consequence, most urgent first ----------
   Each item { kind, text }; releaseWarnings() gives the sentences. kinds: today | blocked | late |
   twice | pitch | spotify | date | soon | without | unrecorded | split | tight. sightings: the latest Spotify for Artists report
   (sightingsView or the stored document), or null. */
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
/* sightings: the stored report (list + answers) or sightingsView (items, each with its match and answer) */
const reportItems = (s) => (s && Array.isArray(s.items || s.list) ? s.items || s.list : null);
const answerOf = (s, x) => (x.answer && typeof x.answer === "object" ? x.answer : ((s && s.answers) || {})[x.key]) || null;
/* does the report show THIS release (the same song within a day of its date, or the one Luke named)? */
const inReport = (sightings, v) => { const list = reportItems(sightings); return !!list && list.some((x) => (x.match != null ? x.match === v.id : sightMatch(x, [v], sightings.answers) === v)); };
/* the day Spotify for Artists shows for this release when it is not the pack's day: the song Luke said
   it is, or the same title nobody has answered for and nothing else of that name within a day */
function otherDate(sightings, v) {
  const list = reportItems(sightings);
  if (!list || !(v.daysToGo > 0)) return null;
  const named = list.find((x) => { const a = answerOf(sightings, x); return a && a.answer === "it" && a.id === v.id; });
  if (named) return nearDay(named.date, v.date) ? null : named.date;
  if (list.some((x) => sameSong(x.title, v.title) && nearDay(x.date, v.date))) return null;
  const x = list.find((y) => sameSong(y.title, v.title) && !answerOf(sightings, y));
  return x ? x.date : null;
}
export function warningsOf(v, sightings, today) {
  if (!v || v.status !== "scheduled" || v.alreadyOut || !v.date) return [];
  const out = [];
  const st = (k) => v.steps.find((s) => s.key === k) || null;
  const live = st("live"), pitch = st("pitch"), spot = st("spotify");
  const days = v.daysToGo;
  if (days === 0 && live && !finished(live)) out.push({ kind: "today", rank: 0, text: "Out today and the Spotify link is not on the song page yet" });
  for (const s of v.steps) if (s.status === "blocked") out.push({ kind: "blocked", rank: 1, text: `${s.label} is blocked (${s.owner})` + (s.note ? `: ${s.note.replace(/\s+/g, " ").slice(0, 160)}` : "") });
  const pitchTooLate = pitch && !finished(pitch) && days > 0 && days < 7;
  /* only while the pitch is still to go (11 Nov 2026, review): a pitch already sent (an older release
     moved, or marked by Luke) can't be held up by it */
  const other = otherDate(sightings, v);
  const spotMissing = spot && !finished(spot) && pitch && !finished(pitch) && days > 0 && days <= 14 && !inReport(sightings, v) && !other;
  for (const s of v.steps.filter((x) => x.late && x.status !== "blocked").sort((a, b) => a.dueIn - b.dueIn)) {
    if (s.key === "live" && days === 0) continue; /* said above */
    if (s.key === "pitch" && pitchTooLate) continue; /* said below, with what it means */
    if (s.key === "spotify" && spotMissing) continue;
    out.push({ kind: "late", rank: 2, text: `${s.label} is ${plural(-s.dueIn, "day")} late (${s.owner})` });
  }
  if (pitchTooLate) out.push({ kind: "pitch", rank: 3, text: "Too late for a Spotify pitch: Spotify needs it 7 days before release" });
  /* with fewer than 7 days to go the pitch is too late anyway (said above): no "until it does" */
  if (spotMissing) out.push({ kind: "spotify", rank: 3, text: `Not showing in Spotify for Artists yet, ${plural(days, "day")} before release` + (pitchTooLate ? "" : ": the pitch cannot be sent until it does") });
  /* the same song shows there on another day (11 Nov 2026, review): one of the two dates is wrong */
  if (other) out.push({ kind: "date", rank: 3, text: `Spotify for Artists shows ${dayWords(other)}, the pack says ${dayWords(v.date)}` });
  /* a field a step needs within 3 days (not for a step that is waiting: the Spotify line says why) */
  const soon = {};
  for (const m of v.missing) {
    if (m.required) continue;
    const s = st(m.neededBy);
    if (s && !finished(s) && !s.waiting && s.dueIn != null && s.dueIn <= 3) (soon[s.key] || (soon[s.key] = { s, fields: [] })).fields.push(m.short);
  }
  for (const g of Object.values(soon)) {
    const f = g.fields, words = joinWords(f.map((x, i) => (i ? x.toLowerCase() : x)));
    out.push({ kind: "soon", rank: 4, text: `${words} ${f.length > 1 || /s$/i.test(f[0]) ? "are" : "is"} missing and ${g.s.label} ${g.s.dueIn < 0 ? "was" : "is"} due ${dayWords(g.s.due)}` });
  }
  const isLabel = v.pack && v.pack.kind === LABEL_KIND;
  /* "Sent without" only for what "send anyway" really left out (sentWithout, 11 Nov 2026, review). A release
     sent before whose release it is was asked has no record of it: said as such, and kept out of the
     site's check (it was never sent without anything). */
  if (Array.isArray(v.sentWithout)) {
    const without = v.missing.filter((m) => m.required && v.sentWithout.includes(m.key) && !(isLabel && m.key === "split"));
    if (without.length) out.push({ kind: "without", rank: 5, text: `Sent without ${joinWords(without.map((m) => m.short))}: fill ${without.length === 1 ? "it" : "them"} in under Edit the details` });
  } else if (!(v.pack && v.pack.kind)) out.push({ kind: "unrecorded", rank: 5, text: "Not recorded yet: self-release or label" });
  /* a label release the label delivers, with our upload started or done: the song could reach the stores twice */
  const up = st("upload");
  if (v.pack && labelDelivers(v.pack) && up && (up.status === "working" || up.status === "done")) out.push({ kind: "twice", rank: 1, text: `A label release, but ${up.label} is ${up.status} (${up.owner}): one song must not be delivered twice` });
  if (isLabel && !filled(v.pack.split)) out.push({ kind: "split", rank: 5, text: `A label release with no split recorded: write down who owns what${v.pack.label ? ` (us and ${v.pack.label})` : ""}` });
  if (v.tight && v.sentAt && !v.released) {
    const sentDays = daysBetween(spDay(Date.parse(v.sentAt)), v.date);
    if (sentDays < 21) out.push({ kind: "tight", rank: 6, text: `Sent ${plural(sentDays, "day")} before release: the usual 21 days for the stores could not be kept` });
  }
  return out.sort((a, b) => a.rank - b.rank).map(({ kind, text }) => ({ kind, text }));
}
export const releaseWarnings = (v, sightings, today) => warningsOf(v, sightings, today).map((w) => w.text);

export async function listReleases(store) { const { data } = await readDoc(store, REL_KEY, []); return Array.isArray(data) ? data : []; }
/* id or title, without accents / case / spaces; a live release before a cancelled one of the same name.
   drafts: false = the bots' view (a draft is Luke's, not the team's yet). */
export function findRelease(list, song, { drafts = true } = {}) {
  const k = songKey(song);
  const seen = list.filter((r) => drafts || r.status !== "draft");
  const hits = k ? seen.filter((r) => r.id === k || songKey(r.title) === k) : [];
  const hit = hits.find((r) => r.status !== "cancelled") || hits[0];
  if (hit) return hit;
  const names = seen.filter((r) => r.status !== "cancelled").map((r) => `${r.title} (${r.id})`);
  fail(`There is no release called "${clean(song, 60)}". ` + (names.length ? `The releases on the desk are: ${names.join(", ")}.` : "There are no releases on the desk yet."));
}
const logIt = (r, at, by, what) => { r.log = (r.log || []).concat({ at, by, what: clean(what, 240) }).slice(-LIMITS.releaseLog); }; /* the last 30 changes */
/* one note to the whole team; a full board must not undo the release change that was already saved.
   Sent by "HQ", the site itself (11 Nov 2026): it names who did it, and it is not a message Luke typed,
   so it doesn't read as one on his own board. */
async function tellTeam(store, now, roster, text) {
  try { return (await sendMessage(store, now, roster, { from: "HQ", to: "all", text, needs: "none" })).message.id; } catch { return null; }
}

/* Luke or Claude: start a draft, or change one. pack = only the fields being set ("" clears one);
   the fields left out keep their value. Changing the title keeps the id. */
export async function saveRelease(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  lukeOrClaude(by, "start or edit a release pack");
  const today = spDay(now), at = new Date(now).toISOString();
  const title = clean(a.title, 120);
  noSecrets(title);
  const dateGiven = a.date !== undefined && a.date !== null;
  const date = clean(a.date, 10);
  if (date && !isDay(date)) fail("The release day must be a date written YYYY-MM-DD, for example 2026-12-11.");
  const pack = a.pack == null ? {} : a.pack;
  if (typeof pack !== "object" || Array.isArray(pack)) fail("pack must be the fields of the release, each with its value.");
  const unknown = Object.keys(pack).filter((k) => !FIELD[k]);
  if (unknown.length) fail(`${unknown.length === 1 ? "This is not a field" : "These are not fields"} of the release pack: ${unknown.map((k) => clean(k, 40)).join(", ")}. The fields are: ${PACK_FIELDS.map((f) => f.key).join(", ")}.`);
  const values = Object.fromEntries(Object.keys(pack).map((k) => [k, packValue(k, pack[k])]));
  const id = a.id ? clean(a.id, 60) : "";
  /* a day in the past is allowed since 11 Nov 2026 (V2): a song that is already out is recorded for its
     deal; sending it creates no dated steps */
  const pastNote = (d) => (d && d < today ? " (already out)" : "");
  let news = ""; /* what Drop is told when the deal changes a release already sent (set inside the write) */
  const saved = await mutate(store, REL_KEY, [], (list) => {
    news = "";
    if (id) {
      const r = list.find((x) => x.id === id);
      if (!r) fail(`There is no release with the id "${id}".`);
      if (r.status === "cancelled") fail(`${r.title} was cancelled. Start a new release instead.`);
      const changes = [];
      if (title && title !== r.title) {
        /* two live releases with one name: the bots could only ever reach one of them, and /hq's merged
           list would drop the other (fixed 11 Nov 2026) */
        const k = songKey(title), other = k && list.find((x) => x !== r && x.status !== "cancelled" && (x.id === k || songKey(x.title) === k));
        if (other) fail(`There is already a release called "${other.title}"${other.status === "draft" ? " (a draft)" : ""}. Pick another title, or cancel that one first. Nothing was saved.`, "exists");
        changes.push(`renamed it from "${r.title}" to "${title}"`); r.title = title;
      }
      if (dateGiven && date !== (r.date || "")) {
        if (r.status === "scheduled") fail(`${r.title} has already gone to the team. Use "Change the date" instead: it moves every open step and tells the team.`);
        changes.push(date ? `set the release day to ${dayWords(date)}${pastNote(date)}` : "cleared the release day");
        r.date = date;
      }
      r.pack = r.pack || {};
      const changed = Object.keys(values).filter((k) => (r.pack[k] || "") !== values[k]);
      for (const k of changed) { if (values[k]) r.pack[k] = values[k]; else delete r.pack[k]; }
      if (changed.length) changes.push(`changed ${joinWords(changed.map((k) => FIELD[k].short))}`);
      /* the deal changed on a release already sent: the upload and the approval follow it, and Drop is told */
      if (changed.some((k) => k === "kind" || k === "distributor")) {
        const moved = applyDeal(r, today);
        if (moved.length) changes.push(`${labelDelivers(r.pack) ? "skipped" : "reopened"} ${joinWords(moved)} (${labelDelivers(r.pack) ? "the label delivers it" : "we deliver it"})`);
        news = dealNews(r, by, moved);
      }
      if (!changes.length) return { skip: true, value: r };
      r.updatedAt = at;
      logIt(r, at, by, `${by} ${changes.join("; ")}`);
      return { value: r };
    }
    if (!title) fail("A release needs its title.");
    /* the same form sent twice must not make two releases; a cancelled one may be started again. The
       whole name is compared (not the 40-character id), so two long titles that only start alike are two
       releases. */
    const k = songKey(title), clash = k && list.find((x) => x.status !== "cancelled" && (x.id === k || songKey(x.title) === k));
    if (clash) fail(`There is already a release called "${clash.title}" (${clash.status === "draft" ? "a draft" : "sent to the team"}). Open it and edit it instead of starting a second one.`, "exists");
    /* a title with no Latin letter or digit ("Ночь") still gets an address of its own */
    const base = releaseId(title) || "r" + Number(now).toString(36);
    let nid = base;
    for (let n = 2; list.some((x) => x.id === nid); n++) nid = base + n;
    if (list.length >= LIMITS.releases) fail(`The desk holds ${LIMITS.releases} releases, which is the limit. Nothing was saved. ` + (by === "Claude"
      ? "Remove old ones first (POST /api/staff/release/remove with the id): a cancelled release, or one that came out more than 90 days ago."
      : "Ask Claude to remove old ones: a cancelled release, or one that came out more than 90 days ago, can be removed."), "limit");
    const r = { id: nid, title, date, status: "draft", createdAt: at, createdBy: by, updatedAt: at, sentAt: null, tight: false,
      pack: Object.fromEntries(Object.entries(values).filter(([, v]) => v)), steps: [], log: [] };
    logIt(r, at, by, `${by} started the song` + (date ? ` for ${dayWords(date)}${pastNote(date)}` : "") + (a.from ? ` (${clean(a.from, 80)})` : ""));
    list.unshift(r);
    return { value: r };
  });
  /* ONE message to the owner of the upload; a full board must not undo the change already saved */
  if (news) try { await sendMessage(store, now, roster, { from: "HQ", to: STEP.upload.owner, text: news, needs: "action" }); } catch {}
  return saved;
}

/* Luke or Claude: the pack goes to the team. The steps get their dates and ONE note goes to all.
   a.anyway (Luke or Claude, 11 Nov 2026): sent with required fields still missing; they stay on the
   release as warnings ("Sent without …"). A release day in the past: the song is ALREADY OUT and is
   recorded for its deal: every step skipped, no dates, and nobody is told (there is nothing to do). */
export async function sendRelease(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  lukeOrClaude(by, "send a release to the team");
  const today = spDay(now), at = new Date(now).toISOString();
  const anyway = a.anyway === true;
  const seenIn = await getSightings(store).catch(() => null); /* already showing in Spotify for Artists? */
  const out = await mutate(store, REL_KEY, [], (list) => {
    const r = list.find((x) => x.id === clean(a.id, 60));
    if (!r) fail(`There is no release with the id "${clean(a.id, 60)}".`);
    if (r.status === "scheduled") return { skip: true, value: { release: r, already: true } }; /* sent twice: nothing happens the second time */
    if (r.status === "cancelled") fail(`${r.title} was cancelled. Start a new release instead.`);
    const miss = releaseView(r, today).missing.filter((m) => m.required);
    const noDay = !isDay(r.date); /* the steps are dated from it: never sent without it, not even anyway */
    if (miss.length && (!anyway || noDay)) {
      const e = new StaffError(`Still missing: ${miss.map((m) => m.short).join(", ")}. Fill ${miss.length === 1 ? "it" : "them"} in, then send again.` +
        (noDay ? " The release day can't be left out: every step is dated from it." : " Or send anyway: what is missing stays on the release as a warning."), "missing");
      e.missing = miss.map((m) => m.key); e.anyway = !noDay; throw e;
    }
    const alreadyOut = r.date < today;
    const s = scheduleSteps(r.date, today, { alreadyOut, labelDelivers: labelDelivers(r.pack) });
    /* sentWithout (11 Nov 2026, review): what "send anyway" left out, kept on the release. Only this makes the
       "Sent without …" warning: a release sent before a field was required was never sent without it. */
    Object.assign(r, { status: "scheduled", sentAt: at, updatedAt: at, steps: s.steps, tight: s.tight, sentWithout: miss.map((m) => m.key), ...(alreadyOut ? { alreadyOut: true } : {}) });
    /* Atlas's last report already shows it (a song Luke put in the pipeline from that report): its
       Spotify step is done from the start, in Atlas's name, and the pitch is open */
    const shown = !alreadyOut && seenIn && seenIn.list.find((x) => sightMatch(x, [r], seenIn.answers) === r);
    if (shown) { const st = r.steps.find((x) => x.key === "spotify"); Object.assign(st, { status: "done", note: spotNote(shown, r), at, by: seenIn.by }); freeWaiting(r, "spotify", today); }
    const without = miss.length ? ` without ${joinWords(miss.map((m) => m.short))} (sent anyway)` : "";
    logIt(r, at, by, alreadyOut ? `${by} recorded it as already out (${dayWords(r.date)}): no steps` + without
      : `${by} sent it to the team for ${dayWords(r.date)}` + (s.tight ? ` (${daysBetween(today, r.date)} days before release: the early steps are due today)` : "") + without);
    return { value: { release: r, already: false, alreadyOut, without: miss.map((m) => m.key) } };
  });
  if (out.already || out.alreadyOut) return { ...out, told: null };
  const r = out.release;
  const missText = out.without.length ? ` Still missing, to be added to the pack: ${joinWords(out.without.map((k) => FIELD[k].short))}.` : "";
  const label = labelDelivers(r.pack) ? ` ${r.pack.label || "The label"} delivers it to the stores: no RouteNote upload for us.` : "";
  const told = await tellTeam(store, now, roster, `New release from ${by}: ${r.title}, out ${dayWords(r.date)}. The pack is on the desk (tool release_pack). Your steps and their dates are in my_day.` +
    (r.tight ? ` It is ${daysBetween(today, r.date)} days away, so the steps that should already be done are due today.` : "") + label + missText);
  return { ...out, told };
}

/* Luke or Claude: a new release day. Open steps get new dates; done steps keep theirs. */
export async function moveRelease(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  lukeOrClaude(by, "move a release");
  const today = spDay(now), at = new Date(now).toISOString();
  const date = clean(a.date, 10);
  if (!isDay(date)) fail("The new release day must be a date written YYYY-MM-DD, for example 2026-12-11.");
  const out = await mutate(store, REL_KEY, [], (list) => {
    const r = list.find((x) => x.id === clean(a.id, 60));
    if (!r) fail(`There is no release with the id "${clean(a.id, 60)}".`);
    if (r.status === "cancelled") fail(`${r.title} was cancelled. Start a new release instead.`);
    /* a song recorded after it came out only corrects its day; a release still to come can't move into the past */
    if (r.alreadyOut ? date > today : date < today) fail(r.alreadyOut ? `${r.title} was recorded as already out: its day must be today or earlier.` : `${dayWords(date)} has already passed. Pick today or a later day.`);
    const from = r.date || "";
    if (from === date) return { skip: true, value: { release: r, moved: false } };
    let added = false, doneOutside = [];
    if (r.status === "scheduled" && !r.alreadyOut) {
      const s = scheduleSteps(date, today);
      /* a release sent before the Spotify step existed gets it now, when Luke moves it (11 Nov 2026) */
      if (!r.steps.some((x) => x.key === "spotify")) {
        const n = s.steps.find((x) => x.key === "spotify"), at2 = r.steps.findIndex((x) => x.key === "pitch");
        /* its pitch already went out (review, 11 Nov 2026): the step is history, not a new job for Atlas */
        const pitched = at2 >= 0 && finished(r.steps[at2]);
        r.steps.splice(at2 < 0 ? r.steps.length : at2, 0, pitched ? { ...n, status: "skipped", note: PITCHED_NOTE, at, by } : { ...n });
        added = pitched ? "skipped" : true;
      }
      for (const st of r.steps) if (!finished(st)) { const n = s.steps.find((x) => x.key === st.key); if (n) st.due = n.due; }
      r.tight = s.tight; /* moved months out, every open step has its full time again: no longer "sent late" */
      /* done with the OLD date somewhere outside the desk (the store, YouTube, the song page) */
      doneOutside = r.steps.filter((st) => st.status === "done" && DATED_OUTSIDE.includes(st.key)).map((st) => `${st.label} (${st.owner})`);
    }
    r.date = date; r.updatedAt = at;
    logIt(r, at, by, (from ? `${by} moved the date from ${dayWords(from)} to ${dayWords(date)}` : `${by} set the release day to ${dayWords(date)}`) + (added ? "; added the step \"Showing as upcoming in Spotify for Artists\"" + (added === "skipped" ? " (skipped: the pitch was already sent)" : "") : ""));
    return { value: { release: r, moved: true, from, doneOutside } };
  });
  if (!out.moved || out.release.status !== "scheduled" || out.release.alreadyOut) return { ...out, told: null };
  const told = await tellTeam(store, now, roster, `${by} moved ${out.release.title} from ${dayWords(out.from)} to ${dayWords(date)}. Every step that is not done has a new date: see my_day.` +
    (out.doneOutside.length ? ` Already done with the old date, so change it there too: ${joinWords(out.doneOutside)}.` : ""));
  return { ...out, told };
}

/* Luke or Claude: called off. The team is told only if it had heard of it (a draft never went out). */
export async function cancelRelease(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  lukeOrClaude(by, "cancel a release");
  const at = new Date(now).toISOString();
  const out = await mutate(store, REL_KEY, [], (list) => {
    const r = list.find((x) => x.id === clean(a.id, 60));
    if (!r) fail(`There is no release with the id "${clean(a.id, 60)}".`);
    if (r.status === "cancelled") return { skip: true, value: { release: r, was: "cancelled" } };
    const was = r.status;
    r.status = "cancelled"; r.updatedAt = at;
    logIt(r, at, by, `${by} cancelled it`);
    return { value: { release: r, was } };
  });
  if (out.was !== "scheduled") return { ...out, told: null };
  const told = await tellTeam(store, now, roster, `${by} cancelled ${out.release.title} (out ${dayWords(out.release.date)}). Stop working on its steps.`);
  return { ...out, told };
}

/* Luke or Claude: take an old release off the desk for good (11 Nov 2026), so the 60-release limit
   never locks the desk. Only a cancelled release, or one that came out more than 90 days ago. */
export async function removeRelease(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  lukeOrClaude(by, "remove a release");
  const today = spDay(now);
  return mutate(store, REL_KEY, [], (list) => {
    const i = list.findIndex((x) => x.id === clean(a.id, 60));
    if (i < 0) fail(`There is no release with the id "${clean(a.id, 60)}".`);
    const r = list[i];
    const old = r.status === "scheduled" && isDay(r.date) && daysBetween(r.date, today) > 90;
    if (r.status !== "cancelled" && !old) fail(`${r.title} can't be removed: only a cancelled release, or one that came out more than 90 days ago, can be. Cancel it first if it is not happening.`, "not_allowed");
    list.splice(i, 1);
    return { value: { removed: true, id: r.id, title: r.title, left: list.length } };
  });
}

/* who may fill a field: Luke and Claude anything; Nova whatever any bot may fill; a bot its own */
const mayFill = (f, by) => by === "Luke" || by === "Claude" || (f.fill.length && (by === "Nova" || f.fill.includes(by)));
export const fieldsFor = (bot) => PACK_FIELDS.filter((f) => mayFill(f, bot)).map((f) => f.key);

/* a bot fills ONE field it is responsible for (Drop the ISRC, Verse the lyrics...) */
export async function fillRelease(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  const key = Object.keys(FIELD).find((k) => low(k) === low(a.field));
  if (!key) { const mine = fieldsFor(by); fail(`"${clean(a.field, 40)}" is not a field of the release pack.` + (mine.length ? ` You can fill: ${mine.join(", ")}.` : " There is no field for you to fill.")); }
  const f = FIELD[key];
  if (!mayFill(f, by)) fail(`${f.short} is filled by ${f.fill.length ? f.fill.join(" or ") + " (or Nova, Luke or Claude)" : "Luke or Claude only"}, not by you. If it is wrong or missing, send ${f.fill.length ? f.fill[0] : "Luke"} a message.`, "not_allowed");
  const value = packValue(key, a.value);
  if (!value) fail(`value is empty. Write the ${f.short} itself.`);
  const at = new Date(now).toISOString();
  return mutate(store, REL_KEY, [], (list) => {
    const r = findRelease(list, a.id || a.song, { drafts: by === "Luke" || by === "Claude" });
    if (r.status === "cancelled") fail(`${r.title} was cancelled. Nothing was saved.`);
    r.pack = r.pack || {};
    if (r.pack[key] === value) return { skip: true, value: r };
    const had = filled(r.pack[key]);
    r.pack[key] = value; r.updatedAt = at;
    logIt(r, at, by, `${by} ${had ? "changed" : "filled"} ${f.short}`);
    return { value: r };
  });
}

/* the step's owner, Nova, Claude or Luke marks a step. A bot's mark is also a line in the live log. */
export async function setStep(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  const status = low(a.status);
  if (!STEP_STATUS.includes(status)) fail(`status must be one of: ${STEP_STATUS.join(", ")}. Use done only when it is really done.`);
  const note = cleanText(a.note, 240);
  const rawLink = clean(a.link, 400), link = httpsLink(rawLink);
  if (rawLink && !link) fail("link must start with https:// . Nothing was saved.");
  if (status === "blocked" && note.length < 3) fail("A blocked step needs a note: say exactly what is needed and from whom.");
  if (status === "skipped" && !["Luke", "Claude", "Nova"].includes(by)) fail("Only Luke, Claude or Nova can skip a step (a step that does not apply to this release). If yours does not apply, tell Nova.", "not_allowed");
  if (status === "skipped" && note.length < 3) fail("A skipped step needs a note: say why it does not apply to this release.");
  noSecrets(note, link);
  const at = new Date(now).toISOString(), today = spDay(now);
  const { release: r, st, changed } = await mutate(store, REL_KEY, [], (list) => {
    const r = findRelease(list, a.id || a.song, { drafts: by === "Luke" || by === "Claude" });
    if (r.status === "cancelled") fail(`${r.title} was cancelled. Nothing was saved.`);
    if (r.status !== "scheduled") fail(`${r.title} has not been sent to the team yet, so it has no steps.`);
    const want = low(a.step);
    const st = (r.steps || []).find((s) => s.key === want || low(s.label) === want);
    if (!st) fail(`"${clean(a.step, 60)}" is not a step of this release. The steps are: ${r.steps.map((s) => s.key).join(", ")}.`);
    if (by !== st.owner && !["Nova", "Claude", "Luke"].includes(by)) fail(`"${st.label}" is ${st.owner}'s step. Only ${st.owner}, Nova, Claude or Luke can mark it. Mark only your own steps.`, "not_allowed");
    /* Luke's own step is his approval ("Only Luke approves ... public posts"): nobody else marks it done */
    if (st.owner === "Luke" && (status === "done" || status === "skipped") && by !== "Luke") fail(`"${st.label}" is Luke's own approval: only Luke can mark it ${status}, on his dashboard. If it is ready for him, send Luke ONE message.`, "not_allowed");
    /* the pitch can't really have gone out before the song shows in Spotify for Artists (11 Nov 2026):
       a bot is told what comes first; Luke and Claude may still record what they know */
    const w = waitingFor(r.steps, st);
    if (w && status === "done" && !PEOPLE.includes(by)) fail(`"${st.label}" is waiting for "${w.label}" (${w.owner}): it can't be done before that. When the song shows as upcoming in Spotify for Artists, Atlas reports it with spotify_upcoming and the pitch opens.`, "waiting");
    if (st.status === status && st.note === note && (!link || st.link === link)) return { skip: true, value: { release: r, st, changed: false } };
    Object.assign(st, { status, note, ...(link ? { link } : {}), at, by });
    if (finished(st)) freeWaiting(r, st.key, today);
    r.updatedAt = at;
    logIt(r, at, by, `${by}: ${st.label} — ${status === "todo" ? "reopened" : status}` + (note ? ` (${note})` : ""));
    return { value: { release: r, st, changed: true } };
  });
  if (changed && !PEOPLE.includes(by)) {
    try {
      await postUpdate(store, now, roster, { bot: by, status: status === "todo" || status === "skipped" ? "info" : status, message: `${r.title}: ${st.label} — ${status === "todo" ? "reopened" : status}` + (note ? `: ${note}` : ""), link: st.link }, { release: r.id });
    } catch {} /* the step is saved; a full live log must not undo it */
  }
  return r;
}

/* ---------- what Spotify for Artists shows as upcoming (V4, 11 Nov 2026) ----------
   Luke: "it should show any upcoming release in spotify for artists, and flag ones that haven't gone
   through the pipeline and ask me what it is". Atlas (or Nova for him) reports EVERYTHING listed there,
   every day; each report replaces the list. One desk document, sightings.json:
     { at, sp, by, note, list: [ { key, title, date, shownAs, firstSeen } ],
       answers: { <key>: { answer, label, note, by, at, msg } } }
   key = the song's name without accents/case/spaces + "|" + the date. Luke's answers are kept 180 days. */
const SIGHT_KEY = "sightings.json";
export const SIGHT_REPORTERS = ["Atlas", "Nova", "Claude"];
export const SIGHT_ANSWERS = [
  { answer: "self", text: "Mine: a self-release" },
  { answer: "label", text: "Mine: with a label", asks: "The label's name" },
  { answer: "notmine", text: "Not mine, or on the wrong account" },
  { answer: "mistake", text: "A mistake: it should not be there" },
];
export const sightKey = (title, date) => titlePart(title) + "|" + date;
/* Which desk release IS this song in Spotify for Artists? (fixed 11 Nov 2026, review: the title alone
   matched another artist's "Love You" to our Love You, out since March, and a pack dated 11 Dec to a store
   date of 4 Dec.) The same song (sameSong), not cancelled, not a song recorded after it came out, and
   its release day within one day of the date shown there (a draft with no day yet matches on its
   title). Or the release Luke named for it ("It is <song>", answers[key].id). */
const nearDay = (a, b) => isDay(a) && isDay(b) && Math.abs(daysBetween(a, b)) <= 1;
export function sightMatch(item, releases, answers) {
  const live = (releases || []).filter((r) => r && r.status !== "cancelled" && !r.alreadyOut);
  const ans = answers && answers[item.key];
  if (ans && ans.answer === "it" && ans.id) { const named = live.find((r) => r.id === ans.id); if (named) return named; }
  return live.find((r) => sameSong(r.title, item.title) && (r.date ? nearDay(r.date, item.date) : r.status === "draft")) || null;
}
/* The release Luke may mean when a song there has no match (V4 review, 11 Nov 2026): the same song under
   a longer or shorter title ("Me Dá Seu Body (feat. Sample)", "(Extended Mix)"), the same title on another
   day, or failing those the ONE live release out that very day. Offered as a fifth answer, "It is <song>".
   A song already out is never offered (another artist's "Love You" is not our Love You from March). */
export function sightNear(item, releases, today) {
  const live = (releases || []).filter((r) => r && r.status !== "cancelled" && !r.alreadyOut && !(r.status === "scheduled" && isDay(r.date) && r.date < today));
  const k = songKey(item.title);
  const byName = live.find((r) => { const rk = songKey(r.title); return !!k && !!rk && rk.length >= 3 && (k.startsWith(rk) || rk.startsWith(k)); }) ||
    live.find((r) => sameSong(r.title, item.title));
  if (byName) return byName;
  const sameDay = live.filter((r) => r.date === item.date);
  return sameDay.length === 1 ? sameDay[0] : null;
}
/* a claim on the message to Nova ("sending:<when>"), so two quick taps send it once; older than a minute
   = that send failed and may be tried again */
const CLAIM = "sending:";
const claimFresh = (msg, now) => typeof msg === "string" && msg.startsWith(CLAIM) && now - Date.parse(msg.slice(CLAIM.length)) < 60000;
const toldId = (msg) => (typeof msg === "string" && msg && !msg.startsWith(CLAIM) ? msg : null);
/* the note on a spotify step it marked done; the title as shown there when it differs from the pack */
const spotNote = (seen, r) => `Showing in Spotify for Artists${sameSong(seen.title, r.title) ? "" : ` as "${seen.title}"`} since ${dayWords(seen.firstSeen)}`;
export async function getSightings(store) { const { data } = await readDoc(store, SIGHT_KEY, null); return data && Array.isArray(data.list) ? data : null; }

export async function reportSightings(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  if (!SIGHT_REPORTERS.includes(by)) fail("Only Atlas reports what Spotify for Artists shows as upcoming (Nova may report for him). If you saw something there, tell Atlas.", "not_allowed");
  if (!Array.isArray(a.releases)) fail('releases must be the list of everything Spotify for Artists shows under upcoming releases, each { title, date }. If nothing is upcoming there, send an empty list: []. If you could not open Spotify for Artists, do not call this: post an update with status "blocked".');
  if (a.releases.length > 20) fail(`That is ${a.releases.length} songs; the most a report can hold is 20. Nothing was saved. Send only what is listed under upcoming releases.`, "limit");
  const today = spDay(now), at = new Date(now).toISOString();
  const note = clean(a.note, 240);
  const items = [];
  a.releases.forEach((x, i) => {
    const title = clean(x && x.title, 120), date = clean(x && x.date, 10), shownAs = clean(x && (x.shown_as != null ? x.shown_as : x.shownAs), 200);
    if (title.length < 1) fail(`Song ${i + 1} in the list has no title. Write the title exactly as Spotify for Artists shows it. Nothing was saved.`);
    if (!isDay(date)) fail(`"${title}": date must be its release day as Spotify for Artists shows it, written YYYY-MM-DD (for example 2026-12-11). Nothing was saved.`);
    noSecrets(title, shownAs);
    const key = sightKey(title, date);
    if (!items.some((y) => y.key === key)) items.push({ key, title, date, shownAs });
  });
  noSecrets(note);
  const doc = await mutate(store, SIGHT_KEY, {}, (d) => {
    const prev = Array.isArray(d.list) ? d.list : [];
    /* answers: kept 180 days, the newest 200 at most */
    d.answers = Object.fromEntries(Object.entries(d.answers || {}).filter(([, v]) => v && v.at && now - Date.parse(v.at) < 180 * 86400000).sort((x, y) => (x[1].at < y[1].at ? 1 : -1)).slice(0, 200));
    d.list = items.map((x) => ({ ...x, firstSeen: (prev.find((p) => p.key === x.key) || {}).firstSeen || today })); /* the list is REPLACED */
    Object.assign(d, { at, sp: spStamp(now), by, note });
    return { value: d };
  });
  /* a song in the pipeline that now shows there: its "spotify" step is done, once, by the reporter */
  const completed = [];
  if (doc.list.length) {
    const got = await mutate(store, REL_KEY, [], (list) => {
      const done = [];
      /* each song shown there finds ITS release: the same song within a day of its date, or the one
         Luke named for it (sightMatch); never another song of the same name on another day */
      for (const seen of doc.list) {
        const r = sightMatch(seen, list, doc.answers);
        if (!r || r.status !== "scheduled" || done.some((x) => x.id === r.id)) continue;
        const st = (r.steps || []).find((s) => s.key === "spotify");
        if (!st || finished(st)) continue;
        Object.assign(st, { status: "done", note: spotNote(seen, r), at, by });
        freeWaiting(r, "spotify", today);
        r.updatedAt = at;
        logIt(r, at, by, `${by}: ${st.label} — done (${st.note})`);
        done.push({ id: r.id, title: r.title, label: st.label, note: st.note });
      }
      return done.length ? { value: done } : { skip: true, value: [] };
    });
    completed.push(...got);
  }
  if (!PEOPLE.includes(by)) for (const c of completed) {
    try { await postUpdate(store, now, roster, { bot: by, status: "done", message: `${c.title}: ${c.label} — done: ${c.note}` }, { release: c.id }); } catch {}
  }
  return { doc, completed };
}

/* the report as /hq and the bots read it. releases: the desk's releases (stored or releaseView). */
export function sightingsView(doc, releases, today, now = null) {
  const base = { at: null, sp: null, by: null, note: "", never: true, stale: false, items: [], unknown: 0, retry: 0, waitingOnLuke: 0, choices: SIGHT_ANSWERS };
  if (!doc || !Array.isArray(doc.list)) return base;
  const live = (releases || []).filter((r) => r && r.status !== "cancelled");
  const answers = doc.answers || {};
  const stale = now != null ? now - Date.parse(doc.at) > 48 * 3600000 : daysBetween(String(doc.sp || "").slice(0, 10) || today, today) > 2;
  const clock = now != null ? now : Date.parse(today + "T15:00:00Z");
  const items = doc.list.map((x) => {
    const hit = sightMatch(x, live, answers);
    const ans = answers[x.key] || null;
    /* "Not mine" / "a mistake" whose message to Nova never went (a busy desk, a limit): Luke's answer is
       kept, and the page offers "Send it to Nova again" (state retry) instead of a dead end */
    const tells = !!ans && (ans.answer === "notmine" || ans.answer === "mistake");
    const retry = tells && !toldId(ans.msg) && !claimFresh(ans.msg, clock);
    const state = hit ? "pipeline" : retry ? "retry" : ans ? "answered" : "unknown";
    const choice = ans ? SIGHT_ANSWERS.find((c) => c.answer === ans.answer) : null;
    const near = state === "unknown" ? sightNear(x, live, today) : null;
    return { key: x.key, title: x.title, date: x.date, dateWords: dayWords(x.date), shownAs: x.shownAs || "", firstSeen: x.firstSeen || null,
      match: hit ? hit.id : null, matchStatus: hit ? hit.status : null, state,
      question: state === "unknown" ? `${x.title} is upcoming in Spotify for Artists for ${dayWords(x.date)}, and it has not gone through the pipeline. What is it?` : null,
      ...(near ? { near: { id: near.id, title: near.title, date: near.date || null, dateWords: dayWords(near.date) } } : {}),
      answer: ans ? { answer: ans.answer, text: choice ? choice.text : ans.answer === "it" ? `It is ${hit ? hit.title : "a song in the pipeline"}` : ans.answer, label: ans.label || "", note: ans.note || "", by: ans.by, at: ans.at, day: spDay(Date.parse(ans.at)), told: toldId(ans.msg), ...(ans.id ? { id: ans.id } : {}) } : null };
  });
  const unknown = items.filter((x) => x.state === "unknown").length, retry = items.filter((x) => x.state === "retry").length;
  return { ...base, at: doc.at, sp: doc.sp, by: doc.by, note: doc.note || "", never: false, stale, items, unknown, retry, waitingOnLuke: unknown + retry };
}

/* Luke answers "what is it?" for a song Spotify for Artists shows that the pipeline doesn't have.
   self / label: a DRAFT is started in "In the pipeline" (the song then matches). notmine / mistake: ONE
   message from Luke to Nova, who finds out who delivered it and from which account. */
export async function answerSighting(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  if (by !== "Luke") fail("Only Luke answers what a song in Spotify for Artists is.", "not_allowed");
  const answer = low(a.answer);
  /* "it" (11 Nov 2026, review): "It is <a song already in the pipeline>", shown under another title */
  if (answer !== "it" && !SIGHT_ANSWERS.some((c) => c.answer === answer)) fail(`answer must be one of: ${SIGHT_ANSWERS.map((c) => c.answer).join(", ")}, or it (with the id of the song in the pipeline).`);
  const label = clean(a.label, 120), note = clean(a.note, 240);
  if (answer === "label" && label.length < 2) fail("Write the label's name.");
  noSecrets(label, note);
  const key = clean(a.key, 200), at = new Date(now).toISOString(), today = spDay(now);
  const doc = await getSightings(store);
  const item = doc && doc.list.find((x) => x.key === key);
  if (!item) fail("That song is not in the latest Spotify for Artists report any more. Refresh the page.", "not_found");
  let release = null;
  if (answer === "it") {
    const id = clean(a.id, 60), r = (await listReleases(store)).find((x) => x.id === id);
    if (!r || r.status === "cancelled" || r.alreadyOut) fail("That song is not in the pipeline any more. Refresh the page.", "not_found");
    /* its Spotify step is done now, in Luke's name, with the title as it shows there; the pitch opens */
    release = await mutate(store, REL_KEY, [], (list) => {
      const x = list.find((y) => y.id === id);
      const st = x && x.status === "scheduled" ? (x.steps || []).find((s) => s.key === "spotify") : null;
      if (!st || finished(st)) return { skip: true, value: x || r };
      Object.assign(st, { status: "done", note: spotNote(item, x), at, by });
      freeWaiting(x, "spotify", today);
      x.updatedAt = at;
      logIt(x, at, by, `${by}: ${st.label} — done (${st.note})`);
      return { value: x };
    });
  }
  if (answer === "self" || answer === "label") {
    release = await saveRelease(store, now, roster, { by, title: item.title, date: item.date, pack: { kind: answer === "label" ? LABEL_KIND : SELF_KIND, ...(answer === "label" ? { label } : {}) }, from: "seen in Spotify for Artists" });
  }
  const tells = answer === "notmine" || answer === "mistake";
  /* the message to Nova is CLAIMED inside the same write that records the answer (fixed 11 Nov 2026,
     review): two quick taps, or a retry from a slow phone, both read the answer before either had sent,
     and Nova got the message twice. Only the call that set the claim sends. */
  const rec = await mutate(store, SIGHT_KEY, {}, (d) => {
    if (!Array.isArray(d.list)) fail("There is no Spotify for Artists report on the desk.", "not_found");
    d.answers = d.answers || {};
    const old = d.answers[key] || null;
    const same = old && old.answer === answer && (old.label || "") === label && (old.id || "") === (release && answer === "it" ? release.id : "");
    let msg = same ? old.msg || null : null, mine = false;
    if (tells && !toldId(msg) && !claimFresh(msg, now)) { msg = CLAIM + at; mine = true; }
    d.answers[key] = { answer, label, ...(answer === "it" ? { id: release.id } : {}), note: note || (same ? old.note || "" : ""), by, at: same ? old.at : at, msg };
    return { value: { mine, msg } };
  });
  let told = toldId(rec.msg);
  if (rec.mine) {
    const says = answer === "notmine" ? "it is not his, or it is on the wrong account" : "it is a mistake and should not be there";
    try {
      told = (await sendMessage(store, now, roster, { from: "Luke", to: "Nova", needs: "action",
        text: `'${item.title}' is upcoming in our Spotify for Artists for ${dayWords(item.date)} (shown as: ${item.shownAs || "not given"}). Luke says: ${says}.` + (note ? ` Luke's note: ${note}.` : "") +
          " Find out who delivered it and from which account, say what has to be done, and report back on the desk." })).message.id;
    } catch { told = null; } /* the answer is kept; the claim is let go below, so "Send it to Nova again" on the page sends it */
    try { await mutate(store, SIGHT_KEY, {}, (d) => { const x = d.answers && d.answers[key]; if (!x || x.msg !== rec.msg) return { skip: true, value: null }; x.msg = told; return { value: null }; }); } catch {}
  }
  const sending = tells && !rec.mine && claimFresh(rec.msg, now); /* another tap is sending it right now */
  const fresh = await getSightings(store);
  return { item, answer, release, told, sending, sightings: sightingsView(fresh, await listReleases(store), spDay(now), now) };
}

/* ---------- the whole desk in one answer (for /hq and for the bots' tools) ---------- */
/* hq: the dashboard model from netlify/lib/hq.mjs (optional): gives each bot its duty and tasks.
   releases: releaseView()s (optional): each bot's open release steps; a late or blocked one makes the
   bot late / blocked, like a duty does (11 Nov 2026). */
export function workers(roster, { hq, updates, messages, cards, seen, today, nowHM, releases = [] }) {
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
    const relSteps = releases.filter(releaseActive).flatMap((r) => r.steps.filter((s) => !finished(s) && low(s.owner) === k)
      .map((s) => ({ id: r.id, title: r.title, key: s.key, label: s.label, due: s.due, dueIn: s.dueIn, status: s.status, late: s.late, note: s.note || "", waiting: !!s.waiting })))
      .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
    let state = "idle";
    if (b.state === "paused") state = "paused";
    else if (items.some((d) => d.status === "blocked") || relSteps.some((s) => s.status === "blocked") || (last && last.status === "blocked" && last.sp.slice(0, 10) === today)) state = "blocked";
    else if (items.some((d) => d.late) || relSteps.some((s) => s.late)) state = "late";
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
      releaseSteps: relSteps, seen: s ? s.at : null, connected: !!s };
  });
}

export async function loadDesk(store, now) {
  const [roster, updates, messages, cardsDoc, config, releases, sightings] = await Promise.all([getRoster(store), listUpdates(store, now, 3), listMessages(store, now, 2), readDoc(store, "cards.json", {}), getConfig(store), listReleases(store), getSightings(store)]);
  const [seen, read, income] = await Promise.all([getSeen(store, roster), getRead(store, roster), incomeState(store, now)]);
  return { roster, updates, messages, cards: cardsDoc.data || {}, seen, read, income, config, releases, sightings };
}

/* Has the person a message was sent to READ it? (V6, 11 Nov 2026: from the read markers, read/<name>,
   which only the tools that hand over messages write.) null for "all", Luke and HQ: one person's
   reading can't be told for them (a note to all carries readCount() instead). */
export function seenBy(read, to, at) {
  if (!to || to === "all" || to === "Luke" || to === "HQ") return { seen: null, seenAt: null };
  const s = read && read[to];
  return s && s.at > at ? { seen: true, seenAt: s.at } : { seen: false, seenAt: null };
}
/* a note to everyone: "Read by 7 of 12" = the bots on the roster (not its sender) that read it since */
export function readCount(read, roster, m) {
  const names = botNames(roster).filter((n) => n !== m.from);
  const by = names.filter((n) => read && read[n] && read[n].at > m.at);
  return { by: by.length, of: names.length, names: by };
}
const readMark = (read, roster, m) => ({ ...seenBy(read, m.to, m.at), ...(m.to === "all" ? { read: readCount(read, roster, m) } : {}) });
/* the last 10 things Luke answered (a reply) or settled (an option, "mark as done") in 48 hours, newest
   first, each with whether its sender has READ it since */
export function answeredByLuke(messages, seen, now) {
  const since = new Date(now - 48 * 3600000).toISOString();
  const replies = messages.filter((m) => m.from === "Luke" && m.re).sort((a, b) => (a.at < b.at ? 1 : -1));
  const out = [];
  for (const m of messages) {
    if (m.from === "Luke") continue;
    const rep = replies.find((x) => x.re === m.id) || null;
    const set = m.resolved && m.resolved.by === "Luke" ? m.resolved : null;
    const at = rep ? rep.at : set ? set.at : null;
    if (!at || at < since) continue;
    const text = rep ? rep.text : set.note && set.note !== "answered" ? set.note : "Marked as done";
    out.push({ id: m.id, from: m.from, to: m.to, text: m.text, needs: m.needs, at: m.at, sp: m.sp,
      reply: { by: "Luke", kind: rep ? "reply" : "settled", text, at, sp: spStamp(Date.parse(at)), ...seenBy(seen, m.from, at) } });
  }
  return out.sort((a, b) => (a.reply.at < b.reply.at ? 1 : -1)).slice(0, 10);
}
/* releases for /hq: coming ones first (soonest first), then the ones that are out (newest first),
   cancelled last; 20 at most */
function releaseOrder(views) {
  const rank = (v) => (v.status === "cancelled" ? 2 : v.released ? 1 : 0);
  return views.slice().sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? ((a.date || "") < (b.date || "") ? 1 : -1) : ((a.date || "9") < (b.date || "9") ? -1 : (a.date || "9") > (b.date || "9") ? 1 : 0)));
}
/* A release as the board sends it (11 Nov 2026): without the lyrics (their length instead) and without
   the change log, so a refresh of /hq doesn't carry every song's full text each time. The page asks for
   ONE whole release (GET /api/staff/release?id=) when Luke opens its details or its form. */
export function slimRelease(v) {
  const { lyrics, ...pack } = v.pack || {};
  return { ...v, pack, lyricsChars: lyrics ? String(lyrics).length : 0, log: [], logCount: (v.log || []).length, slim: true };
}
/* what the page needs to build the form and the pipeline without hard-coding either */
export const packFieldsOut = () => PACK_FIELDS.map((f) => ({ key: f.key, label: f.label, short: f.short, kind: f.kind, required: f.required, requiredWhen: f.requiredWhen, showWhen: f.showWhen, neededBy: f.neededBy, choices: f.choices, hint: f.hint, fill: f.fill, group: f.group, max: f.max }));
export const releaseStepsOut = () => RELEASE_STEPS.map((s) => ({ key: s.key, label: s.label, owner: s.owner, days: s.days, ...(s.after ? { after: s.after } : {}) }));

export function board(desk, now, hq) {
  const today = spDay(now), nowHM = spHM(now);
  const views = (desk.releases || []).map((r) => releaseView(r, today, { sightings: desk.sightings || null }));
  const read = desk.read || {};
  const mark = (m) => ({ ...m, ...readMark(read, desk.roster, m) });
  /* one log: when the sheet was read, its Updates tab and the connector are already merged there
     (hqModel -> team.live.feed), so a bot that still writes only the sheet is not shown as silent */
  const live = hq && hq.team && hq.team.live && hq.team.live.ready ? hq.team.live.feed : null;
  const updates = live ? live.map((u) => ({ sp: u.at, at: u.at, bot: u.bot, status: u.status, message: u.message, link: u.link || "" })) : desk.updates;
  const staff = workers(desk.roster, { hq, updates, messages: desk.messages, cards: desk.cards, seen: desk.seen, today, nowHM, releases: views });
  const lastSeen = Object.entries(desk.seen).filter(([n]) => n !== "Claude").sort((a, b) => (a[1].at < b[1].at ? 1 : -1))[0] || null;
  return {
    today, now: spStamp(now), staff,
    updates: updates.slice(0, 60),
    messages: threads(desk.messages).slice(0, 80).map((t) => ({ ...mark(t), replies: t.replies.map(mark) })),
    answered: answeredByLuke(desk.messages, read, now),
    releases: releaseOrder(views).slice(0, 20).map(slimRelease), packFields: packFieldsOut(), releaseSteps: releaseStepsOut(),
    sightings: sightingsView(desk.sightings || null, desk.releases || [], today, now),
    waiting: { luke: waitingOn(desk.messages, "Luke"), claude: waitingOn(desk.messages, "Claude"), bots: desk.messages.filter((m) => isOpen(m) && !PEOPLE.includes(m.to)).length },
    income: desk.income,
    connector: { botsOn: desk.config.botsOn, changedAt: desk.config.changedAt, lastUsed: lastSeen ? { bot: lastSeen[0], at: lastSeen[1].at, tool: lastSeen[1].tool } : null,
      connected: staff.filter((w) => w.connected).length, total: staff.length, claudeSeen: desk.seen.Claude ? desk.seen.Claude.at : null },
    report: desk.messages.find((m) => m.from === "HQ" && m.kind === "report") || null,
    names: botNames(desk.roster).concat(PEOPLE),
  };
}

/* ---------- the site's own check, three times a day (netlify/functions/staffcheck.mjs) ----------
   Facts only, no judgement: what a person would otherwise have to look up tab by tab. */
/* which of the three checks this is (09:35, 15:35, 21:35 São Paulo since 11 Nov 2026) */
export const dayPart = (now) => { const hm = spHM(now); return hm < "13:00" ? "morning" : hm < "19:00" ? "afternoon" : "evening"; };
export function checkReport({ desk, hq, hqState, now }) {
  const today = spDay(now), hm = spHM(now), part = dayPart(now);
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
  /* 4. the releases on the desk: late and blocked steps, and a pack field a step needs within 3 days */
  /* ONE line per release for its late steps (11 Nov 2026): four releases sent late made 31 lines and
     pushed the rest of the report past its cut */
  const sightings = desk.sightings || null;
  for (const v of (desk.releases || []).map((r) => releaseView(r, today, { sightings })).filter(releaseActive)) {
    for (const st of v.steps) if (st.status === "blocked") problems.push(`${v.title}: ${st.label} is blocked (${st.owner})` + (st.note ? `: ${st.note.replace(/\s+/g, " ").slice(0, 120)}` : ""));
    /* the warnings that say what lateness MEANS (V5): said instead of the plain late line for that step */
    const warn = warningsOf(v, sightings, today).filter((w) => ["today", "twice", "pitch", "spotify", "date", "without", "split"].includes(w.kind));
    const said = new Set([...(warn.some((w) => w.kind === "pitch") ? ["pitch"] : []), ...(warn.some((w) => w.kind === "spotify") ? ["spotify"] : [])]);
    const late = v.steps.filter((st) => st.late && st.status !== "blocked" && !said.has(st.key));
    if (late.length === 1) problems.push(`${v.title}: ${late[0].label} is late (${late[0].owner}, due ${dayWords(late[0].due)})`);
    else if (late.length) problems.push(`${v.title}: ${late.length} steps late: ` + late.map((st) => `${st.key} (${st.owner}, due ${dayWords(st.due)})`).join(", "));
    for (const w of warn) problems.push(`${v.title}: ${w.text}`);
    if (v.released) continue;
    const soon = {};
    for (const m of v.missing) {
      const st = v.steps.find((x) => x.key === m.neededBy);
      if (st && !finished(st) && !st.waiting && st.dueIn <= 3) (soon[st.key] || (soon[st.key] = { st, fields: [] })).fields.push(m.short.toLowerCase());
    }
    const parts = Object.values(soon).map((g) => `${joinWords(g.fields)} still missing and ${g.st.label} is due ${dayWords(g.st.due)}`);
    if (parts.length) problems.push(`${v.title}: ${parts.join("; ")}`);
    else if (!v.counts.late && !v.counts.blocked && !warn.length) lines.push(`${v.title}: ${v.counts.done} of ${v.counts.total} steps done, out ${dayWords(v.date)}`);
  }
  /* what Spotify for Artists shows (V4): each song nobody put through the pipeline, and a report that is
     old (or was never made) while something is coming */
  const sv = sightingsView(sightings, desk.releases || [], today, now);
  for (const x of sv.items.filter((i) => i.state === "unknown")) problems.push(`'${x.title}' is upcoming in Spotify for Artists but not in the pipeline: Luke has to say what it is`);
  const coming = (desk.releases || []).some((r) => r.status === "scheduled" && !r.alreadyOut && isDay(r.date) && r.date > today) || sv.items.some((i) => i.date > today);
  if (coming && sv.never) problems.push("Atlas has not reported what is upcoming in Spotify for Artists yet");
  else if (coming && sv.stale) problems.push(`Atlas has not reported what is upcoming in Spotify for Artists since ${dayWords(sv.sp.slice(0, 10))} ${sv.sp.slice(11)}`);
  /* 5. the dashboard's own sources */
  if (hqState) {
    if (hqState.connected === false) problems.push("The HQ sheet is not connected");
    else if (hqState.error) problems.push("The HQ sheet can't be read: " + hqState.error);
    else if (hqState.readAt && now - Date.parse(hqState.readAt) > 30 * 60000) problems.push(`The HQ sheet was last read ${Math.round((now - Date.parse(hqState.readAt)) / 60000)} min ago`);
    for (const [tab, e] of Object.entries(hqState.sheetErrors || {})) problems.push(`Sheet tab ${tab} shows an error (${e.first})`);
    if (hqState.metaKey && hqState.metaKey.state && hqState.metaKey.state !== "ok") problems.push(hqState.metaKey.text || "The Meta key is not reading");
    const cap = hq && hq.money && hq.money.cap;
    if (cap) say(cap.status === "ok", `Ad spend this month: ${cap.currency} ${cap.spent.toFixed(2)} of ${cap.amount}` + (cap.status === "ok" ? "" : cap.status === "warn" ? " (past the 750 warning)" : " (at or past 900: every ad must be off)"));
    const next = hq && hq.next;
    /* a desk release's late steps are already listed above, so they are not said twice */
    if (next) say(!next.late, `Next release: ${next.song}, ${next.date} (${next.daysToGo} days)` + (next.late ? `, ${next.late} step${next.late === 1 ? "" : "s"} late` + (next.desk ? " (listed above)" : `: ${next.steps.filter((s) => s.late).map((s) => s.label + " (" + s.owner + ")").join("; ")}`) : ", nothing late"));
  }
  /* the report quotes cells from the sheet and lines from the bots: anything that looks like a
     password or an account number is left out here, so the report itself always goes through */
  const scrub = (list) => list.map((t) => (secretIn(t) ? "(one line left out: it looked like a password, a code or an account number)" : t));
  problems.splice(0, problems.length, ...scrub(problems)); lines.splice(0, lines.length, ...scrub(lines));
  const title = `HQ check, ${today} ${part}: ` + (problems.length ? `${problems.length} thing${problems.length === 1 ? "" : "s"} to look at` : "all running");
  return { title, problems, lines, text: reportText(title, problems, lines), part, day: today };
}
/* The message is at most 1500 characters, cut by WHOLE lines (11 Nov 2026): what doesn't fit is
   counted ("+N more on /hq"), never cut mid-word, and "Running:" keeps at least its first lines. */
export function reportText(title, problems, lines, max = 1500) {
  const one = (t) => "- " + (t.length > 300 ? t.slice(0, 299) + "…" : t);
  const build = (np, nl) => [title, ...(problems.length ? ["", "Needs a look:", ...problems.slice(0, np).map(one), ...(np < problems.length ? [`- +${problems.length - np} more on /hq`] : [])] : []),
    "", "Running:", ...lines.slice(0, nl).map(one), ...(nl < lines.length ? [`- +${lines.length - nl} more on /hq`] : [])].join("\n");
  let np = problems.length, nl = lines.length;
  while (build(np, nl).length > max && nl > 2) nl--;
  while (build(np, nl).length > max && np > 0) np--;
  while (build(np, nl).length > max && nl > 0) nl--;
  const out = build(np, nl);
  return out.length > max ? out.slice(0, out.lastIndexOf("\n", max)) : out;
}
