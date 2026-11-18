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

import { SONGS, RESERVED as SONG_RESERVED, SLUG_RE, TRACK_RE, homeCardSong, homeCardNow as homeCardPublished } from "./songs.mjs";
export const homeCardNow = homeCardPublished;
export const TZ = "America/Sao_Paulo";
export const UPDATE_STATUS = ["done", "working", "blocked", "error", "info"];
export const NEEDS = ["none", "reply", "action", "decision"];
export const CATEGORIES = ["Self-releases", "Label deals", "Publishing", "Production", "Salary", "Other"];
/* unsorted (bank reader, 11 Nov 2026): seen in an account, nobody has said what it is yet; counts in neither received nor pending */
/* batch 4 (15 Nov 2026): "statement only" = a statement, not payable yet (under the payout line), counted
   nowhere yet; "payable" = owed to us and ready to be paid out, counted with pending ("owed to us") */
export const INCOME_STATUS = ["received", "pending", "transfer", "statement only", "payable", "unsorted"];
/* a statement whose money hasn't arrived yet: when it lands, the same payment turns received */
export const OWED = ["pending", "payable", "statement only"];
export const CADENCE = ["daily", "monthly", "quarterly", "irregular"];
export const SOURCE_STATE = ["active", "blocked", "unknown", "not_tracked"];
export const PEOPLE = ["Luke", "Claude", "HQ"]; /* not bots; HQ = the site's own check (three times a day since 11 Nov 2026) */
/* nobody needs more than this in a day; past it something is looping, and the answer is "stop" */
export const LIMITS = { updatesPerBotPerDay: 60, messagesPerSenderPerDay: 40, messagesPerMonth: 1500, paymentsPerMonth: 3000, checksPerBotPerDay: 40, releases: 60, releaseLog: 30 };

/* The team as the repo may show it: names and one public line each. The full roster (why each bot
   is needed, its tools, its times) is seeded into the store and replaces this. */
export const DEFAULT_ROSTER = [
  { name: "Nova", role: "Chief of staff", duty: "Runs the team's day and the task board", time: "07:00",
    why: "Without Nova nobody resets the day's duties, chases what is missing or writes the evening wrap-up. She is Claude's contact and the one who passes instructions to every other bot.",
    schedule: [{ time: "07:00", what: "Reset today's duties on the task board, each with its time (before Ledger's 07:30 run)" }, { time: "08:00", what: "Read new briefs and the messages on the desk" }, { time: "09:00", what: "Standup: logged, or the blocker" },
      { time: "09:45", what: "Check the month's ad spend against the cap" }, { time: "12:00", what: "Chase anything missing" }, { time: "21:00", what: "Wrap-up: mark what slipped, write the daily report" }, { time: "Sunday", what: "Weekly numbers and the weekly report" }],
    writes: "The task board and the release timeline; the daily report" },
  { name: "Alfred", role: "Luke's assistant", duty: "One message to Luke a day, plus urgent alerts", time: "10:00",
    why: "The only voice that reaches Luke, once a day, so no other bot has to interrupt him. Carries the site's check, Claude's note and anything that needs Luke's yes.",
    schedule: [{ time: "10:00", what: "The daily message: ad spend against the cap, income, what needs Luke, who didn't log, the next release" }, { time: "any time", what: "Alert at USD 750, at USD 900 and above USD 1,000 of ad spend" }],
    writes: "Nothing: Alfred reports, he doesn't log" },
  { name: "Ledger", role: "Income", duty: "Logs every new payment", time: "07:30",
    why: "Sees every payment the day it lands, royalties included (Ledger owns them since 11 Nov 2026), so income is never found weeks later and nothing is missed or counted twice.",
    schedule: [{ time: "07:30", what: "Check every money account and the statement emails; submit each new payment; say each account was checked" }, { time: "5th", what: "Monthly income report, royalties per song and per store included" }, { time: "20th", what: "Chase every pending payment" }],
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
    schedule: [{ time: "09:15", what: "One row per released song for the newest full day, plus the Spotify followers row" }, { time: "14 days before a release", what: "Send the Spotify pitch (never later than 7 days before), then record the day with pitch_log. After release, record each new editorial playlist." }], writes: "The Songs and Growth tabs; the release timeline's pitch step; editorial playlist adds" },
  { name: "Drop", role: "Distribution", duty: "Where every release is at the distributor", time: "09:20",
    why: "Gets each self-release into the stores on time and keeps where each song is at the distributor (uploaded, in moderation, approved, live), telling Luke the moment a date can't be kept.",
    schedule: [{ time: "09:20", what: "Status of every unreleased song at the distributor (store_status)" }, { time: "4 weeks before a release", what: "Upload to RouteNote (3 weeks at the latest)" }], writes: "The release timeline and each song's store status" },
  { name: "Verse", role: "Lyrics", duty: "Lyrics on Musixmatch once each song is out", time: "09:20",
    why: "Lyrics showing in the apps: they go on Musixmatch, which only lists a song once it is out.",
    schedule: [{ time: "09:20", what: "From each release day: check Musixmatch; add Luke's approved lyrics the day the song shows there" }], writes: "The release timeline's lyrics step" },
  { name: "Webmaster", role: "Website", duty: "Daily check that the site is up and clean", time: "09:20",
    why: "Every ad and the bio link land on our own pages; if a page is down, the ad money is wasted.",
    schedule: [{ time: "09:20", what: "Home page, every song page and the dashboard answer" }, { time: "a week after the previous release", what: "The next song's page live" }, { time: "Release day", what: "Add the Spotify link" }], writes: "Its own duty row; the song pages" },
  { name: "Forge", role: "Ads", duty: "Logs ad spend, checks the cap before any launch", time: "09:30",
    why: "Keeps ad spend inside USD 1,000 a month: logs what Meta, Google and TikTok spent and checks the cap before anything launches.",
    schedule: [{ time: "09:30", what: "Yesterday's Meta, Google and TikTok spend (record_spend)" }, { time: "Monday", what: "Compare the month's Meta total with Ads Manager" }, { time: "before any launch", what: "Month to date + planned budgets must stay under the cap" }, { time: "at USD 900", what: "Switch every ad off (never delete) and confirm" }], writes: "The Ads Tracker's daily log" },
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
    /* { replace: <doc> } writes that document instead of the (edited) copy: for a document whose stored
       shape is broken (a list that isn't a list), which can't be fixed in place */
    const doc = out && Object.prototype.hasOwnProperty.call(out, "replace") ? out.replace : base;
    const res = await store.setJSON(key, doc, cur.etag ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res && res.modified === false) continue; /* changed under us */
    /* The store's client answers "modified" for ANY reply that isn't "changed under you", a failed
       write included. A write counts only with the new version's tag, or when reading it back
       shows exactly what was written. */
    if (res && res.etag) return out ? out.value : undefined;
    const back = await readDoc(store, key, fallback).catch(() => null);
    if (back && JSON.stringify(back.data) === JSON.stringify(doc)) return out ? out.value : undefined;
    fail("The desk could not save that. Nothing was saved. Try again in a moment.", "busy");
  }
  fail("The desk is busy. Nothing was saved. Try again in a moment.", "busy");
}

/* ---------- who is who ---------- */
export async function getRoster(store) {
  const [{ data }, ed] = await Promise.all([readDoc(store, "roster.json", null), readDoc(store, "rosteredit.json", {})]);
  const list = Array.isArray(data) && data.length ? data : DEFAULT_ROSTER;
  const edits = ed.data && typeof ed.data === "object" && !Array.isArray(ed.data) ? ed.data : {};
  /* Nova's fixes to a job card (roster_card, 17 Nov 2026) go on top of the seed: a re-seed never wipes them */
  return list.filter((b) => b && b.name).map((b) => { const name = clean(b.name, 40), e = edits[low(name)]; if (!e) return { ...b, name }; const { by, at, ...f } = e; return { ...b, ...f, name, editedBy: by, editedAt: at }; });
}
/* roster_card (17 Nov 2026, Nova: Drop's card still listed royalties, Forge's times were old, and the private seed
   is not on this Mac): Nova (or Claude, Luke) fixes a bot's duty, why, usual time, schedule or role on the desk */
export async function editRosterCard(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  if (!["Nova", "Claude", "Luke"].includes(by)) fail("Only Nova changes a bot's job card. Tell Nova what is wrong on it.", "not_allowed");
  const name = whoIs(a.for, roster);
  const f = {};
  if (a.duty != null && String(a.duty).trim()) f.duty = clean(a.duty, 200);
  if (a.why != null && String(a.why).trim()) f.why = cleanText(a.why, 400);
  if (a.role != null && String(a.role).trim()) f.role = clean(a.role, 60);
  if (a.time != null && String(a.time).trim()) { const t = clean(a.time, 5); if (!/^\d{2}:\d{2}$/.test(t)) fail("time must be HH:MM (24 hours, São Paulo), for example 09:20."); f.time = t; }
  if (a.schedule != null) {
    if (!Array.isArray(a.schedule) || a.schedule.length > 8) fail('schedule must be a list of 0 to 8 lines: [{"time": "09:20", "what": "..."}].');
    f.schedule = a.schedule.map((x) => ({ time: clean(x && x.time, 40), what: clean(x && x.what, 200) })).filter((x) => x.time && x.what);
  }
  if (!Object.keys(f).length) fail("Nothing to change: give duty, why, time, schedule or role.");
  noSecrets(JSON.stringify(f));
  const at = new Date(now).toISOString();
  await mutate(store, "rosteredit.json", {}, (doc) => {
    const d = doc && typeof doc === "object" && !Array.isArray(doc) ? doc : {};
    d[low(name)] = { ...(d[low(name)] || {}), ...f, by, at };
    return { replace: d, value: d[low(name)] };
  });
  return (await getRoster(store)).find((b) => b.name === name);
}
export const botNames = (roster) => roster.map((b) => b.name);
/* When Nova resets the day's duty rows: the time of the "reset" line on her card (07:00 since batch 5,
   15 Nov 2026: at 08:05 Ledger's 07:30 and Sheet's 08:00 runs found no row). "" when her card has none. */
export function dutyResetTime(roster) {
  const nova = (roster || []).find((b) => b && low(b.name) === "nova");
  const line = nova && Array.isArray(nova.schedule) ? nova.schedule.find((x) => x && /reset/i.test(x.what || "") && /^\d{2}:\d{2}$/.test(x.time || "")) : null;
  return line ? line.time : "";
}
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
      schedule: (Array.isArray(b.schedule) ? b.schedule : []).slice(0, 12).map((s) => ({ time: clean(s && s.time, 60), what: clean(s && s.what, 160) })).filter((s) => s.what),
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
  /* gaps (batch 4): done, but one number could not be read (TikTok views come a day late): the duty is
     done, not blocked, and says what is missing */
  const gaps = clean(a.gaps, 240);
  if (gaps && status !== "done") fail("gaps goes only with status done: the duty is done except for what you name in gaps. Nothing was saved.");
  noSecrets(message, a.link, gaps);
  const u = { id: newId("u", now), at: new Date(now).toISOString(), sp: spStamp(now), bot, status, message, link: httpsLink(a.link), duty: /^[Dd]-[\w-]{1,30}$/.test(clean(a.duty, 40)) ? clean(a.duty, 40) : "", ...(gaps ? { gaps } : {}), ...(extra.release ? { release: clean(extra.release, 60) } : {}) };
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
    const v = { status: u.status === "error" ? "blocked" : u.status, message: u.message, at: u.sp, iso: u.at, bot: low(u.bot), ...(u.gaps ? { gaps: u.gaps } : {}) };
    if (u.duty) byDuty[low(u.duty)] = v;
    byBot[low(u.bot)] = v; /* the bot's latest word, with or without a duty id */
  }
  return { byDuty, byBot };
}

/* ---------- the bots' own word on their T- tasks (14 Nov 2026, the bots' feedback) ----------
   The sheet's task rows are written by Nova; a bot could not close its own task, so finished work
   stayed "open" and old blockers stood for days. task_update writes here, and HQ shows it OVER the
   sheet's row (teamReport): done takes the task off the open list, blocked sets the blocker to the
   note, todo/working clear the blocker. tasks.json = { "T-27": {status, note, by, at, sp} }. */
export const TASK_STATUS = ["todo", "working", "blocked", "done", "cancelled"]; /* cancelled: round 3, 16 Nov 2026 */
export async function getTaskOverlay(store) {
  const { data } = await readDoc(store, "tasks.json", {});
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}
/* openTasks: the sheet's open T- tasks as HQ reads them ({id, owner, ...}); null = the sheet wasn't read */
export async function setTaskStatus(store, now, roster, a, openTasks) {
  const by = whoIs(a.by, roster, { people: true });
  const raw = clean(a.task, 40);
  if (/^D-/i.test(raw)) fail(`${raw} is a daily duty, not a task: finish or block a duty with post_update (status done or blocked, duty ${raw}).`);
  if (!/^T-[\w-]{1,30}$/i.test(raw)) fail('task must be the id of one of your open tasks from my_day (it starts with "T-", for example "T-27").');
  const id = raw.toUpperCase();
  const status = low(a.status);
  if (!TASK_STATUS.includes(status)) fail(`status must be one of: ${TASK_STATUS.join(", ")}`);
  const note = clean(a.note, 240);
  if (status === "blocked" && note.length < 3) fail("With status blocked, say in note what is needed and from whom.");
  if (status === "cancelled" && note.length < 3) fail("With status cancelled, say in note why it is no longer needed.");
  /* title (round 3): the task's corrected wording, shown over the sheet's (T-31 kept an old phone number) */
  const title = a.title != null ? clean(a.title, 200) : "";
  noSecrets(note, title);
  if (!Array.isArray(openTasks)) fail("The team's Google Sheet could not be read just now, so the task can't be checked. Nothing was saved. Try again later.", "busy");
  const t = openTasks.find((x) => String(x.id || "").toUpperCase() === id);
  if (!t) fail(`There is no open task ${id} on the sheet. Check the id in my_day (open_tasks).`, "not_found");
  if (low(t.owner) !== low(by) && !["Nova", "Claude", "Luke"].includes(by)) fail(`${id} is ${t.owner}'s task, not yours: only ${t.owner} (or Nova) can update it.`);
  const row = { status, note, by, at: new Date(now).toISOString(), sp: spStamp(now), ...(title ? { title } : {}) };
  await mutate(store, "tasks.json", {}, (all) => {
    if (!all || typeof all !== "object" || Array.isArray(all)) return { replace: { [id]: row }, value: row };
    all[id] = row;
    const ids = Object.keys(all);
    if (ids.length > 300) ids.sort((x, y) => (all[x].at < all[y].at ? -1 : 1)).slice(0, ids.length - 300).forEach((k) => delete all[k]);
    return { value: row };
  });
  return { id, ...row };
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
  const options = (Array.isArray(a.options) ? a.options : []).map((o) => clean(o, 240)).filter(Boolean).slice(0, 4);
  const kind = ["report", "note"].includes(low(a.kind)) ? low(a.kind) : "note";
  /* several questions in one message, each answered on its own (14 Nov 2026, the bots: Luke's one-word
     "Correct" closed Verse's 4 questions, 3 of them unanswered) */
  const qs = Array.isArray(a.questions) ? a.questions.map((q) => clean(q, 300)).filter(Boolean) : [];
  if (Array.isArray(a.questions) && a.questions.length) {
    if (to === "all") fail("Questions need one name in to (Luke, Claude or a bot), not all.");
    if (qs.length < 2 || qs.length > 6) fail("questions must be 2 to 6 questions. One question goes in text.");
    if (options.length) fail("Use options for ONE question, or questions for several, not both.");
    if (from !== "HQ") noSecrets(qs.join("\n"));
    if (needs === "none") needs = "reply";
  }
  /* approval (14 Nov 2026, batch 3): asks Luke to approve the pitch (Atlas) or the final lyrics (Verse) of a
     release; a decision with the options Approve / Not yet. His Approve records the approval on the release. */
  let approval = null;
  if (a.approval != null) {
    const ap = a.approval;
    if (typeof ap !== "object" || Array.isArray(ap)) fail('approval must be {"song": "...", "what": "pitch" or "lyrics", "text": "the pitch"}.');
    const what = low(ap.what);
    if (!APPROVALS[what]) fail("approval.what must be pitch or lyrics.");
    if (to !== "Luke") fail("An approval request goes to Luke: put Luke in to.");
    if (!APPROVALS[what].asks.includes(from)) fail(what === "pitch" ? "The pitch is Atlas's to put to Luke: only Atlas asks him to approve it (Nova may ask for him)." : "The final lyrics are Verse's to put to Luke: only Verse asks him to approve them (Nova may ask for him).", "not_allowed");
    const r = findRelease(await listReleases(store), ap.song, { drafts: true });
    if (r.status === "cancelled") fail(`${r.title} was cancelled. Nothing was sent.`);
    let atext = "";
    if (what === "pitch") {
      atext = cleanText(ap.text, 3000);
      if (atext.length < 10) fail("approval.text must be the pitch itself, exactly as it would be sent. Nothing was sent.");
      noSecrets(atext);
    } else if (!filled((r.pack || {}).lyrics)) fail(`There are no lyrics in the pack for ${r.title} yet: only Luke (or Claude) fills them in. Nothing was sent.`);
    approval = { id: r.id, title: r.title, what, ...(atext ? { text: atext } : {}) };
    needs = "decision";
  }
  /* about (14 Nov 2026): the bot a message to Luke is about; it and the answer reach that bot too */
  let about = a.about != null && String(a.about).trim() ? whoIs(a.about, roster) : "";
  const via = a.via ? whoIs(a.via, roster) : "";
  const answers = answersOf(a.answers);
  if (answers && !re) fail("answers only go with reply_to: the id of the message whose questions you answer.");
  if (answers) for (const t of Object.values(answers)) noSecrets(t);
  /* proposal: set only by proposeRelease (no tool passes it through), answered Yes, correct / No */
  const proposal = a.proposal && typeof a.proposal === "object" && to === "Luke" ? a.proposal : null;
  if (proposal) needs = "decision";
  const opts = approval ? APPROVE_OPTIONS.slice() : proposal ? PROPOSE_OPTIONS.slice() : options;
  /* release + ask: set only by the desk itself (store_status's "ready to resubmit"), never by a tool argument */
  const tag = a.ask === "resubmit" && a.release ? { release: clean(a.release, 60), ask: "resubmit" } : {};
  /* the asker's own recommendation (A3, 17 Nov 2026): which option and why, on a message that needs Luke */
  let recs = null;
  if ((a.recommend != null && String(a.recommend).trim()) || (a.recommend_option != null && String(a.recommend_option).trim())) {
    if (to !== "Luke" || needs === "none") fail("recommend goes only on a message to Luke that needs him (needs: decision, reply or action).");
    recs = [recommendation(from, now, opts, a.recommend_option, a.recommend)];
  }
  const m = { id: newId("m", now), at: new Date(now).toISOString(), sp: spStamp(now), from, to, text, needs, re, options: opts, kind, resolved: null, ...(approval ? { approval } : {}), ...(proposal ? { proposal } : {}), ...tag, ...(recs ? { recommendations: recs } : {}),
    ...(qs.length >= 2 ? { questions: qs.map((q) => ({ q, answer: "", by: "", at: "" })) } : {}), ...(answers ? { answers } : {}), ...(via ? { via } : {}) };
  /* what Luke's answer settles the message with (an option he picked); "answered" otherwise */
  const settleNote = from === "Luke" ? clean(a.note, 240) : "";
  if (settleNote) noSecrets(settleNote);
  const pm = re ? monthOfId(re) : null;
  if (re) {
    if (!pm) fail("re must be the id of the message you are answering");
    const cur = await readDoc(store, msgKey(pm), []);
    const p0 = (Array.isArray(cur.data) ? cur.data : []).find((x) => x.id === re);
    if (!p0) fail("There is no message with that id", "not_found");
    if (answers) {
      const n = (p0.questions || []).length;
      if (!n) fail("That message has no numbered questions: answer it in text.");
      for (const k of Object.keys(answers)) if (Number(k) < 1 || Number(k) > n) fail(`There is no question ${k}: that message has ${n} questions.`);
      if (from !== "Luke" && from !== p0.to) fail(`Those questions are for ${p0.to}: only ${p0.to} (or Luke) answers them.`);
    }
    if (!about && p0.about) about = p0.about; /* the answer to a message about a bot reaches that bot too */
  }
  if (about) m.about = about;
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
        /* numbered questions: only answers fill them, and the message closes when every one has one */
        if (Array.isArray(p.questions) && p.questions.length) {
          if (!answers || p.resolved) return { skip: true, value: p };
          for (const [k, t] of Object.entries(answers)) { const q = p.questions[Number(k) - 1]; if (q) Object.assign(q, { answer: t, by: from, at: m.at, ...(via ? { via } : {}) }); }
          if (p.questions.every((q) => q.answer)) p.resolved = { by: from, at: m.at, note: `all ${p.questions.length} answered` };
          return { value: p };
        }
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
  const settled = !!(parent && parent.resolved && parent.resolved.at === m.at);
  /* what Luke's pick does on the release (batch 3). The answer is already saved and the message closed:
     a failure here never throws (the answer would be sent twice); it is returned instead. */
  let approved = null, releaseNote = null, proposalDone = null;
  if (settled && from === "Luke") {
    const pick = low(settleNote);
    if (parent.proposal && pick === PROPOSE_YES) {
      proposalDone = await applyProposal(store, now, roster, parent, via);
      /* the outcome stays on the question (song_pages reads it, 16 Nov 2026) */
      try { await mutate(store, msgKey(pm), [], (list) => { const x = list.find((y) => y.id === parent.id); if (!x) return { skip: true, value: null }; x.proposalResult = { done: !!proposalDone.done, at: m.at, ...(proposalDone.error ? { error: proposalDone.error } : {}) }; return { value: x }; }); } catch {}
    }
    try {
      if (parent.approval && pick === "approve") {
        await approveRelease(store, now, roster, { by: "Luke", via, id: parent.approval.id, what: parent.approval.what, text: parent.approval.text, msg: parent.id, words: low(text) !== pick ? text : "" });
        approved = { what: parent.approval.what, id: parent.approval.id };
      }
      if (parent.ask === "resubmit" && parent.release) {
        const at = m.at, said = settleNote || text.slice(0, 120);
        await mutate(store, REL_KEY, [], (list) => {
          const r = list.find((x) => x.id === parent.release);
          if (!r) return { skip: true, value: null };
          logIt(r, at, "Luke", `Luke answered ${parent.from}: ${said}` + (via ? ` (via ${via})` : ""));
          return { value: r };
        });
        releaseNote = said;
      }
    } catch (e) { approved = approved || (parent.approval ? { error: e && e.message ? e.message : "not recorded" } : null); }
  }
  return { message: m, parent, settled, ...(approved ? { approved } : {}), ...(releaseNote ? { releaseNote } : {}), ...(proposalDone ? { proposal: proposalDone } : {}) };
}
/* answers: {"1": "yes", "3": "no"} or ["yes", "", "no"] -> {"1": "yes", "3": "no"} (null = none given) */
function answersOf(x) {
  if (x == null) return null;
  const pairs = Array.isArray(x) ? x.map((t, i) => [String(i + 1), t]) : typeof x === "object" ? Object.entries(x) : null;
  if (!pairs) fail('answers must be a list (["yes", "", "no"]) or numbered ({"1": "yes", "3": "no"}).');
  const out = {};
  for (const [k, t] of pairs) {
    const v = cleanText(t, 600);
    if (!v) continue;
    if (!/^\d{1,2}$/.test(String(k).trim())) fail(`There is no question ${clean(k, 10)}: number the answers 1, 2, 3...`);
    out[String(Number(k))] = v;
  }
  if (!Object.keys(out).length) fail("answers is empty: give at least one answer.");
  return out;
}
/* ---------- automatic chasing (A4, 17 Nov 2026, Nova: "HQ nudges a bot when its duty is late, so Nova only escalates") ----------
   Run by the hourly job, 07:00 to 22:00 São Paulo. For each late duty (hq.team.duties, from the sheet + the
   connector) and each late release step (desk release views), owned by a bot on the roster that isn't paused:
     first time today -> ONE reminder from HQ to that bot (needs none: it is in its messages_for_you);
     still late 2 hours after the reminder -> ONE message from HQ to Nova, needs action (Nova's own -> Luke).
   Blocked, waiting and skipped work is never chased (the blocker is already said). Each key is claimed in
   chase/<SP day>.json before its message goes, so two runs at once send once. */
const CHASE_FROM = "07:00", CHASE_UNTIL = "22:00", CHASE_AFTER = 2 * 3600000;
export async function chaseLate(store, now, roster, o = {}) {
  const out = { nudged: [], escalated: [] };
  const hm = spHM(now), day = spDay(now);
  if (hm < CHASE_FROM || hm >= CHASE_UNTIL) return out;
  const active = new Set((roster || []).filter((b) => b.state !== "paused").map((b) => b.name));
  const items = [];
  const byOwner = (o.hq && o.hq.team && o.hq.team.duties && o.hq.team.duties.byOwner) || [];
  for (const g of byOwner) for (const x of g.items || []) {
    if (!x.late || x.status !== "todo" || !active.has(x.owner)) continue;
    items.push({ key: `d:${x.id || x.task}`, bot: x.owner, label: `${x.owner}: ${x.task}`, what: `"${x.task}"`, due: x.due || "",
      remind: `Reminder: your duty "${x.task}" was due at ${x.due} and isn't done yet. Do it now and post_update done (with gaps if something couldn't be read), or blocked with exactly what stops you.` });
  }
  for (const r of o.releases || []) {
    if (r.status !== "scheduled") continue;
    for (const st of r.steps || []) {
      if (!st.late || st.waiting || ["done", "blocked", "skipped"].includes(st.status) || !active.has(st.owner)) continue;
      items.push({ key: `s:${r.id}:${st.key}`, bot: st.owner, label: `${st.owner}: ${r.title}: ${st.label}`, what: `"${st.label}" for ${r.title}`, due: st.due ? dayWords(st.due) : "",
        remind: `Reminder: "${st.label}" for ${r.title} was due ${dayWords(st.due)} and isn't done yet. Do it now and mark it with release_step (done, with the link), or blocked with exactly what stops you.` });
    }
  }
  if (!items.length) return out;
  /* claim first, then send: what this run will send is decided in one write */
  const plan = await mutate(store, `chase/${day}.json`, {}, (doc) => {
    const d = doc && typeof doc === "object" && !Array.isArray(doc) ? doc : {};
    const todo = [];
    for (const it of items) {
      const was = d[it.key];
      if (!was) { d[it.key] = { nudged: new Date(now).toISOString(), bot: it.bot }; todo.push({ ...it, step: "nudge" }); }
      else if (!was.escalated && now - Date.parse(was.nudged) >= CHASE_AFTER) { was.escalated = new Date(now).toISOString(); todo.push({ ...it, step: "escalate" }); }
    }
    return todo.length ? { value: todo, replace: d } : { skip: true, value: [] };
  });
  for (const it of plan || []) {
    try {
      if (it.step === "nudge") { await sendMessage(store, now, roster, { from: "HQ", to: it.bot, needs: "none", text: it.remind }); out.nudged.push(it.label); }
      else {
        const to = it.bot === "Nova" ? "Luke" : "Nova";
        await sendMessage(store, now, roster, { from: "HQ", to, needs: "action", about: it.bot === "Nova" ? "" : it.bot,
          text: `${it.bot} still hasn't done ${it.what}${it.due ? ` (due ${it.due})` : ""}, 2 hours after HQ's reminder. ` + (to === "Nova" ? `Chase ${it.bot}, or tell Luke if it needs him.` : "Nova is the one who resets and chases the duties: check on her.") });
        out.escalated.push(it.label);
      }
    } catch {}
  }
  return out;
}

/* ---------- the next 6 weeks (A5, 17 Nov 2026, Nova: "a 6-week release calendar with every song's steps") ----------
   Monday-first weeks from this one: release days (drafts marked), every open step on its due day (not done, not
   skipped, not waiting), and late steps placed in THIS week with late: true. Cancelled songs never. The page has the
   same rule (js/hq-lib.js sixWeeks; tests/six-weeks.test.mjs checks they agree). */
export function sixWeeks(releases, today) {
  const start = addDays(today, -((new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7));
  const weeks = [];
  for (let i = 0; i < 6; i++) { const ws = addDays(start, i * 7); weeks.push({ start: ws, end: addDays(ws, 6), label: i === 0 ? "This week" : "Week of " + dayWords(ws), items: [] }); }
  const slot = (d) => { if (d < start) return 0; const n = Math.floor((Date.parse(d + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) / 604800000); return n < 6 ? n : -1; };
  for (const r of releases || []) {
    if (!r || r.status === "cancelled") continue;
    if (r.date && r.date >= start) { const i = slot(r.date); if (i >= 0) weeks[i].items.push({ date: r.date, kind: "release", id: r.id, title: r.title, draft: r.status === "draft" }); }
    for (const st of r.steps || []) {
      if (!st.due || st.waiting || st.status === "done" || st.status === "skipped") continue;
      const i = slot(st.due);
      if (i >= 0) weeks[i].items.push({ date: st.due, kind: "step", id: r.id, title: r.title, owner: st.owner, label: st.label, late: st.due < today });
    }
  }
  for (const w of weeks) w.items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === b.kind ? 0 : a.kind === "release" ? -1 : 1));
  return weeks;
}
/* the same weeks as plain lines, for the bots */
export function sixWeekLines(weeks) {
  return weeks.map((w) => ({ week: w.label, lines: w.items.length ? w.items.map((x) => x.kind === "release"
    ? `${dayWords(x.date)} · ${x.title} comes out${x.draft ? " (draft: not sent to the team yet)" : ""}`
    : `${dayWords(x.date)} · ${x.owner} · ${x.label} · ${x.title}${x.late ? " · LATE" : ""}`) : ["nothing due"] }));
}

/* ---------- pre-flight checks (A6, 17 Nov 2026, Forge, Drop, Verse: "artist names vs the store spelling
   ("Basdcandal"), ad links = badscandal.com/<song>, cover size on upload, WAV/artwork specs") ----------
   Facts the team checks before anything reaches the stores or the ads. Nothing is refused here: they show on the
   release (releaseView().preflight, the card, releases / release_pack) and on demand (the preflight tool). */
export const ARTIST = "badscandal";
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); /* swapped letters */
  }
  return d[a.length][b.length];
}
/* the artist's name as the stores need it: exactly "badscandal", one word, all lowercase (Luke's rule) */
export function artistProblems(text) {
  const s = String(text == null ? "" : text), out = [];
  const words = [...s.matchAll(/[A-Za-zÀ-ÿ]+/g)].map((m) => ({ w: m[0], i: m.index }));
  for (let k = 0; k < words.length; k++) {
    const one = words[k], two = words[k + 1];
    if (two && /^[\s\-_.]+$/.test(s.slice(one.i + one.w.length, two.i)) && (one.w + two.w).toLowerCase() === ARTIST) {
      out.push(`“${s.slice(one.i, two.i + two.w.length)}”: the stores need “badscandal”, one word, all lowercase.`); k++; continue;
    }
    const lw = one.w.toLowerCase();
    if (lw === ARTIST) { if (one.w !== ARTIST) out.push(`“${one.w}”: write it “badscandal”, all lowercase.`); continue; }
    if (lw.length >= 8 && lw.length <= 12 && editDistance(lw, ARTIST) <= 2) out.push(`“${one.w}” looks like a misspelling: the stores need “badscandal”.`);
  }
  return out;
}
/* an ad (or song page) link: https://badscandal.com/<the song>, where the Meta pixel and HQ's Pages count it */
export function adLinkProblem(link, slug = "", own = "") {
  const raw = String(link == null ? "" : link).trim();
  let u;
  try { u = new URL(raw); } catch { return "That is not a link: use https://badscandal.com/<song>."; }
  if (u.protocol !== "https:") return "Use the https link: https://badscandal.com/<song>.";
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (/(^|\.)(ffm\.to|feature\.fm)$/.test(host) || host === "music.badscandal.com") return "Feature.fm is cancelled: ads and links go to https://badscandal.com/<song>.";
  if (host !== "badscandal.com") return `Ads should send people to badscandal.com/<song> (the Meta pixel and HQ's Pages count them there), not ${host}.`;
  const p = u.pathname.replace(/^\/+|\/+$/g, "").replace(/\.html$/, "").toLowerCase();
  if (!p) return "That is the home page: ads go to the song's own page, badscandal.com/<song>.";
  if (!SONGS.some((x) => x.slug === p) && p !== own) return `There is no song page at badscandal.com/${p} (yet): check the address, or ask Webmaster for the page first.`;
  if (slug && p !== slug) return `This link goes to /${p}, not this song's page /${slug}.`;
  return "";
}
const ARTIST_FIELDS = ["primary", "featuring", "producers", "split", "copyright"];
const extOf = (link) => { try { return ((/\.([a-z0-9]{2,5})$/i.exec(new URL(String(link)).pathname) || [])[1] || "").toLowerCase(); } catch { return ""; } };
export function preflightOf(r) {
  const pack = (r && r.pack) || {}, out = [];
  const short = (k) => (FIELD[k] ? FIELD[k].short : k);
  for (const k of ARTIST_FIELDS) for (const t of artistProblems(pack[k])) out.push({ field: k, text: `${short(k)}: ${t}` });
  const wext = filled(pack.wav) ? extOf(pack.wav) : "";
  if (["mp3", "m4a", "aac", "ogg", "opus"].includes(wext)) out.push({ field: "wav", text: `${short("wav")}: the master must be a WAV (the stores' quality), not an .${wext}.` });
  const aext = filled(pack.artwork) ? extOf(pack.artwork) : "";
  if (["webp", "gif", "heic", "bmp", "tif", "tiff", "svg"].includes(aext)) out.push({ field: "artwork", text: `${short("artwork")}: must be a JPG or PNG, 3000 x 3000, not a .${aext}.` });
  /* L8: a Canvas link whose file type is known and isn't one Spotify takes (a link with no file type says nothing) */
  const cext = filled(pack.canvas) ? extOf(pack.canvas) : "";
  if (cext) for (const t of assetProblems("canvas", { format: cext })) out.push({ field: "canvas", text: `${short("canvas")}: ${t.replace(/^Spotify Canvas must/, "must")}` });
  const own = r && r.id ? r.id : "";
  if (filled(pack.page)) { const pr = adLinkProblem(pack.page, "", own); if (pr) out.push({ field: "page", text: `${short("page")}: ${pr}` }); }
  for (const l of String(pack.adplan || "").match(/https?:\/\/[^\s"'<>)]+/g) || []) { const pr = adLinkProblem(l.replace(/[.,;]+$/, ""), "", own); if (pr) out.push({ field: "adplan", text: `${short("adplan")}: ${pr}` }); }
  return out;
}
/* a cover upload (the song page crops any picture to a square; the stores need a square 3000 x 3000) */
export function coverWarnings(w, h) {
  if (w == null || h == null) return [];
  if (w !== h) return [`The picture is ${w} x ${h}: not square. The song page crops it to a square; the stores need a square 3000 x 3000.`];
  if (w < 3000) return [`${w} x ${h}: fine for the song page; RouteNote needs 3000 x 3000 for the stores.`];
  return [];
}

/* ---------- the asset checker (L8, 17 Nov 2026, Atlas via Nova: "cover, Canvas and banner vs each platform's
   rules") ----------
   Each platform's published rule, checked against what a bot can read off the file (width, height, seconds,
   file type, size). Anything not given is not checked; nothing is refused, the preflight tool lists the problems.
   ratio = width / height, with 2% slack; min = the smallest width and height; mb = the largest file. */
export const ASSETS = {
  cover: { label: "Cover", formats: ["jpg", "jpeg", "png"], ratio: 1, ratioWords: "square", min: [3000, 3000], mb: null,
    rule: "RouteNote and the stores: a square JPG or PNG, at least 3000 x 3000." },
  canvas: { label: "Spotify Canvas", formats: ["mp4", "jpg", "jpeg"], ratio: 9 / 16, ratioWords: "9:16", minHeight: 720, seconds: [3, 8], mb: null,
    rule: "Spotify Canvas: an MP4 (or a JPG), 9:16 portrait, at least 720 px tall, 3 to 8 seconds; no text, logos or links on it (Spotify's guidelines)." },
  spotify_header: { label: "Spotify header", formats: ["jpg", "jpeg", "png"], ratio: null, min: [2660, 1140], mb: 20,
    rule: "Spotify for Artists header image: a JPG or PNG, at least 2660 x 1140, 20 MB at most; keep faces and text in the middle (it is cropped on phones)." },
  youtube_banner: { label: "YouTube banner", formats: ["jpg", "jpeg", "png", "gif", "bmp"], ratio: 16 / 9, ratioWords: "16:9", min: [2048, 1152], mb: 6,
    rule: "YouTube channel banner: a JPG, PNG, GIF or BMP, 16:9, at least 2048 x 1152, 6 MB at most; text and logos inside the middle 1235 x 338 (what every device shows)." },
  /* L12 (18 Nov 2026): profile photos and banners whose platforms publish a size. A platform with no
     published size is not given a kind here: the Profiles list says "Rule not set" instead. */
  spotify_avatar: { label: "Spotify profile photo", formats: ["jpg", "jpeg", "png", "gif"], min: [750, 750], mb: 20,
    rule: "Spotify profile photo (avatar): a JPG, PNG or GIF, at least 750 x 750, 20 MB at most (Spotify's artist image guidelines)." },
  youtube_photo: { label: "YouTube profile photo", formats: ["jpg", "jpeg", "png", "gif", "bmp"], ratio: 1, ratioWords: "square", min: [800, 800], mb: 15,
    rule: "YouTube profile photo: a JPG, PNG, GIF or BMP, square, at least 800 x 800, 15 MB at most; not an animated GIF. YouTube shows it as a circle." },
  apple_image: { label: "Apple Music artist image", formats: ["jpg", "jpeg", "png"], ratio: 1, ratioWords: "square", min: [800, 800], mb: null,
    rule: "Apple Music artist image: a square JPG or PNG, at least 800 x 800; 2400 x 2400 or larger is preferred. The same image can show on Shazam (Apple's artist image guidelines)." },
  x_photo: { label: "X profile photo", formats: ["jpg", "jpeg", "png", "gif"], ratio: 1, ratioWords: "square", min: [400, 400], mb: 2,
    rule: "X profile photo: a JPG, PNG or GIF, square, at least 400 x 400 (X's recommended size), 2 MB at most. It is shown as a circle." },
  x_header: { label: "X header", formats: ["jpg", "jpeg", "png", "gif"], ratio: 3, ratioWords: "3:1", min: [1500, 500], mb: null,
    rule: "X header: a JPG, PNG or GIF, 3:1, at least 1500 x 500 (X's recommended size). About 60 px at the top and bottom can be cropped." },
  soundcloud_photo: { label: "SoundCloud profile image", formats: ["jpg", "jpeg", "png"], ratio: 1, ratioWords: "square", min: [800, 800], mb: 2,
    rule: "SoundCloud profile image: a square JPG or PNG, at least 800 x 800, 2 MB at most. It is shown as a circle (SoundCloud Help Center)." },
  soundcloud_header: { label: "SoundCloud header", formats: ["jpg", "jpeg", "png"], min: [2480, 520], mb: 2,
    rule: "SoundCloud header: a JPG or PNG, at least 2480 x 520, 2 MB at most. Text in it gets cropped on small screens (SoundCloud Help Center)." },
  facebook_photo: { label: "Facebook profile photo", formats: ["jpg", "jpeg", "png"], ratio: 1, ratioWords: "square", min: [320, 320], mb: null,
    rule: "Facebook Page profile photo: a JPG or PNG, square, at least 320 x 320 (Facebook's size for best quality). It is cropped to a circle." },
  facebook_cover: { label: "Facebook cover", formats: ["jpg", "jpeg", "png"], min: [400, 150], mb: null,
    rule: "Facebook Page cover: a JPG or PNG, at least 400 x 150. 851 x 315 JPG loads fastest. It is cropped differently on a computer and a phone, and the profile photo covers the left side (Facebook Help Center)." },
  amazon_photo: { label: "Amazon Music profile image", formats: ["jpg", "jpeg", "png"], min: [500, 500], mb: 15,
    rule: "Amazon Music profile image: a JPG or PNG, at least 500 x 500, 15 MB at most (Amazon Music for Artists)." },
  amazon_background: { label: "Amazon Music background", formats: ["jpg", "jpeg", "png"], min: [1920, 1440], mb: 15,
    rule: "Amazon Music background: a JPG or PNG, at least 1920 x 1440, 15 MB at most. Keep the face in the upper part, near the middle (Amazon Music for Artists)." },
};
const FORMAT_WORDS = { cover: "a JPG or PNG", canvas: "an MP4 or JPG", spotify_header: "a JPG or PNG", youtube_banner: "a JPG, PNG, GIF or BMP" };
/* a file-type sentence for a kind added after the four above (L12). The original four keep FORMAT_WORDS. */
function formatWords(kind, a) {
  if (FORMAT_WORDS[kind]) return FORMAT_WORDS[kind];
  const name = { jpg: "JPG", jpeg: "JPG", png: "PNG", gif: "GIF", bmp: "BMP", mp4: "MP4" };
  const seen = [];
  for (const f of a.formats || []) { const w = name[f] || String(f).toUpperCase(); if (!seen.includes(w)) seen.push(w); }
  if (seen.length <= 1) return "a " + (seen[0] || "file");
  if (seen.length === 2) return "a " + seen[0] + " or " + seen[1];
  return "a " + seen.slice(0, -1).join(", ") + " or " + seen[seen.length - 1];
}
export function assetProblems(kind, o = {}) {
  const a = Object.prototype.hasOwnProperty.call(ASSETS, kind) ? ASSETS[kind] : null;
  if (!a) fail("asset must be one of: " + Object.keys(ASSETS).join(", ") + ".");
  const num = (v) => (v == null || v === "" ? null : Number(v));
  const w = num(o.width), h = num(o.height), sec = num(o.seconds), mb = num(o.mb);
  const fmt = String(o.format == null ? "" : o.format).trim().toLowerCase().replace(/^\./, "");
  const out = fmt && !a.formats.includes(fmt) ? [`${a.label} must be ${formatWords(kind, a)}, not a .${fmt}.`] : [];
  if (kind === "cover") return [...(w != null && h != null ? coverWarnings(w, h) : []), ...out]; /* A6's wording, kept */
  if (w != null && h != null && a.ratio && Math.abs(w / h - a.ratio) / a.ratio > 0.02) out.push(`${w} x ${h} is not ${a.ratioWords}: ${a.label} needs ${a.ratioWords}.`);
  if (a.min && w != null && h != null && (w < a.min[0] || h < a.min[1])) out.push(`${w} x ${h} is too small: ${a.label} needs at least ${a.min[0]} x ${a.min[1]}.`);
  if (a.minHeight && h != null && h < a.minHeight) out.push(`${h} px tall is too small: ${a.label} needs at least ${a.minHeight} px tall.`);
  if (a.seconds && sec != null && (sec < a.seconds[0] || sec > a.seconds[1])) out.push(`${sec} seconds: ${a.label} must be ${a.seconds[0]} to ${a.seconds[1]} seconds.`);
  if (a.mb && mb != null && mb > a.mb) out.push(`${mb} MB: ${a.label} is ${a.mb} MB at most.`);
  return out;
}

/* ---------- profiles (L12, 18 Nov 2026) ----------
   One list of the profile photo and the banner (header, cover, wallpaper) on every official platform.
   The desk RECORDS what is live, and asks Luke "Yes, correct" before a new image. HQ never logs in and
   never changes a platform: after yes, the owner uploads it by hand and then records it.
   asset "" = no published size rule: the list says "Rule not set" and a proposal is not size-checked.
   X has no owner yet. Instagram, TikTok and Deezer publish no size this list will enforce. */
const PROF_KEY = "profiles.json";
export const PROFILE_SLOTS = [
  { id: "facebook-photo", platformId: "facebook", platform: "Facebook Page", kind: "Profile photo", words: ["profile", "photo", "avatar", "picture"], owner: "Steve", asset: "facebook_photo" },
  { id: "facebook-cover", platformId: "facebook", platform: "Facebook Page", kind: "Cover", words: ["cover", "banner"], owner: "Steve", asset: "facebook_cover" },
  { id: "instagram-photo", platformId: "instagram", platform: "Instagram", kind: "Profile photo", words: ["profile", "photo", "avatar", "picture"], owner: "Steve", asset: "" },
  { id: "youtube-photo", platformId: "youtube", platform: "YouTube", kind: "Profile photo", words: ["profile", "photo", "avatar", "picture"], owner: "Laura", asset: "youtube_photo" },
  { id: "youtube-banner", platformId: "youtube", platform: "YouTube", kind: "Banner", words: ["banner"], owner: "Laura", asset: "youtube_banner" },
  { id: "spotify-photo", platformId: "spotify", platform: "Spotify", kind: "Profile photo", words: ["profile", "photo", "avatar", "picture"], owner: "Atlas", asset: "spotify_avatar" },
  { id: "spotify-header", platformId: "spotify", platform: "Spotify", kind: "Header", words: ["header", "banner"], owner: "Atlas", asset: "spotify_header" },
  { id: "apple-image", platformId: "apple", platform: "Apple Music", kind: "Artist image", words: ["image", "hero", "artist", "profile", "photo", "avatar"], owner: "Atlas", asset: "apple_image" },
  { id: "tiktok-photo", platformId: "tiktok", platform: "TikTok", kind: "Profile photo", words: ["profile", "photo", "avatar", "picture"], owner: "Kevin", asset: "" },
  { id: "x-photo", platformId: "x", platform: "X", kind: "Profile photo", words: ["profile", "photo", "avatar", "picture"], owner: "", asset: "x_photo" },
  { id: "x-header", platformId: "x", platform: "X", kind: "Header", words: ["header", "banner"], owner: "", asset: "x_header" },
  { id: "soundcloud-photo", platformId: "soundcloud", platform: "SoundCloud", kind: "Profile image", words: ["profile", "photo", "avatar", "picture", "image"], owner: "Atlas", asset: "soundcloud_photo" },
  { id: "soundcloud-header", platformId: "soundcloud", platform: "SoundCloud", kind: "Header", words: ["header", "banner"], owner: "Atlas", asset: "soundcloud_header" },
  { id: "deezer-photo", platformId: "deezer", platform: "Deezer", kind: "Profile photo", words: ["profile", "photo", "avatar", "picture"], owner: "Atlas", asset: "" },
  { id: "amazon-photo", platformId: "amazon", platform: "Amazon Music", kind: "Profile image", words: ["profile", "photo", "avatar", "picture", "image"], owner: "Atlas", asset: "amazon_photo" },
  { id: "amazon-background", platformId: "amazon", platform: "Amazon Music", kind: "Background", words: ["background", "banner"], owner: "Atlas", asset: "amazon_background" },
];
const profileRule = (slot) => (slot.asset && ASSETS[slot.asset] ? ASSETS[slot.asset].rule : "Rule not set");
function profilePlatforms(q) {
  const want = fold(q);
  if (!want) return [];
  return PROFILE_SLOTS.filter((s) => { const name = fold(s.platform); return name === want || name.split(" ")[0] === want; });
}
function pickProfile(platform, image) {
  const slots = profilePlatforms(platform);
  if (!slots.length) fail(`There is no profile for "${clean(platform, 40)}". The platforms are: ${[...new Set(PROFILE_SLOTS.map((s) => s.platform))].join(", ")}.`);
  const want = fold(image);
  if (!want) {
    if (slots.length === 1) return slots[0];
    fail(`${slots[0].platform} has more than one image. Say which in image: ${slots.map((s) => s.kind.toLowerCase()).join(", ")}.`);
  }
  const hit = slots.filter((s) => s.id === want || fold(s.kind) === want || (s.words || []).includes(want));
  if (hit.length === 1) return hit[0];
  if (!hit.length) fail(`${slots[0].platform} has no image called "${clean(image, 40)}". Say one of: ${slots.map((s) => s.kind.toLowerCase()).join(", ")}.`);
  fail(`"${clean(image, 40)}" matches more than one ${slots[0].platform} image: ${hit.map((s) => s.kind.toLowerCase()).join(", ")}. Say which.`);
}
function profileMay(by, slot) {
  if (by === "Luke" || by === "Claude" || by === "Nova" || (slot.owner && by === slot.owner)) return;
  if (!slot.owner) fail(`${slot.platform} has no owner yet. Luke uploads it himself. Tell him, or ask Nova. Nothing was saved.`, "not_allowed");
  fail(`${slot.platform}'s ${slot.kind.toLowerCase()} is ${slot.owner}'s. Tell ${slot.owner}. Nothing was saved.`, "not_allowed");
}
function profileNum(v, name) {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  if (!(n > 0) || !Number.isFinite(n)) fail(`${name} must be a number above 0, as the file shows it. Nothing was asked.`);
  return n;
}
export async function getProfiles(store) {
  const { data } = await readDoc(store, PROF_KEY, {});
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}
function profileSlotOf(doc, id) {
  const slots = doc && doc.slots && typeof doc.slots === "object" && !Array.isArray(doc.slots) ? doc.slots : {};
  const s = slots[id];
  return s && typeof s === "object" ? s : {};
}
async function writeProfile(store, id, fn) {
  return mutate(store, PROF_KEY, {}, (doc) => {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      const fresh = { slots: {} }, next = fn({});
      if (!next) return { skip: true, value: null };
      fresh.slots[id] = next;
      return { replace: fresh, value: next };
    }
    doc.slots = doc.slots && typeof doc.slots === "object" && !Array.isArray(doc.slots) ? doc.slots : {};
    const cur = doc.slots[id] && typeof doc.slots[id] === "object" ? doc.slots[id] : {};
    const next = fn(cur);
    if (!next) return { skip: true, value: cur };
    doc.slots[id] = next;
    return { value: next };
  });
}
/* the list HQ and the profiles tool show. messages = the board, so an open "Yes, correct" shows as waiting. */
export function profilesView(doc, messages) {
  const platforms = [];
  for (const s of PROFILE_SLOTS) {
    let p = platforms.find((x) => x.id === s.platformId);
    if (!p) { p = { id: s.platformId, platform: s.platform, owner: s.owner || "", slots: [] }; platforms.push(p); }
    const stored = profileSlotOf(doc, s.id);
    const current = stored.current && stored.current.link ? { link: stored.current.link, changed: stored.current.changed || "", by: stored.current.by || "" } : null;
    const approvedRaw = stored.approved && stored.approved.link ? stored.approved : null;
    const approved = approvedRaw && (!current || current.link !== approvedRaw.link) ? { link: approvedRaw.link, by: approvedRaw.by || "", at: approvedRaw.at || "" } : null;
    const wait = (messages || []).filter((m) => m && m.proposal && m.proposal.action === "profile" && m.proposal.slot === s.id && isOpen(m))
      .sort((a, b) => (a.at < b.at ? 1 : -1))[0] || null;
    p.slots.push({ id: s.id, kind: s.kind, asset: s.asset || "", rule: profileRule(s), current, approved,
      waiting: wait ? { id: wait.id, link: wait.proposal.link || "", by: wait.from || "" } : null });
  }
  return { note: "HQ never logs in and never changes a platform. A new image waits for your \"Yes, correct\". Then the owner uploads it by hand.", platforms };
}
export async function recordProfile(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  const slot = pickProfile(a.platform, a.image);
  profileMay(by, slot);
  const link = httpsLink(a.link);
  if (!link) fail("link must be an https link to the image. Nothing was saved.");
  noSecrets(link);
  const changed = clean(a.changed, 10);
  if (!isDay(changed)) fail("changed must be the day the image last changed, written YYYY-MM-DD (for example 2026-10-01). Nothing was saved.");
  if (changed > spDay(now)) fail(`${dayWords(changed)} is in the future. changed is the day the image last changed, not a day still to come. Nothing was saved.`);
  const at = new Date(now).toISOString();
  let already = false;
  await writeProfile(store, slot.id, (cur) => {
    const prev = cur.current || null;
    if (prev && prev.link === link && prev.changed === changed) { already = true; return null; }
    const next = { ...cur, current: { link, changed, by, at } };
    if (next.approved && next.approved.link === link) delete next.approved;
    return next;
  });
  return { saved: true, already, platform: slot.platform, image: slot.kind, link, changed,
    note: already ? "Already recorded. Nothing new. HQ did not change the platform." : "Recorded as the image that is live now. HQ did not change the platform." };
}
export async function proposeProfile(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  const slot = pickProfile(a.platform, a.image);
  profileMay(by, slot);
  const link = httpsLink(a.link);
  if (!link) fail("link must be an https link to the new image. Nothing was asked.");
  noSecrets(link);
  const why = cleanText(a.why, 300);
  if (why) noSecrets(why);
  const doc = await getProfiles(store);
  const saved = profileSlotOf(doc, slot.id);
  const current = saved.current && saved.current.link ? saved.current : null;
  const approved = saved.approved && saved.approved.link && (!current || saved.approved.link !== current.link) ? saved.approved.link : "";
  if (approved) fail(approved === link
    ? `Luke already said yes to that image. ${slot.owner || "Luke"} uploads it by hand, then record it with profiles. Nothing was asked.`
    : `Luke already said yes to a new ${slot.platform} ${slot.kind.toLowerCase()} that is not recorded as live yet. Upload that one and record it before asking about another. Nothing was asked.`);
  if (current && current.link === link) fail(`That link is already the current ${slot.platform} ${slot.kind.toLowerCase()}${current.changed ? ` (changed ${dayWords(current.changed)})` : ""}. Nothing was asked.`);
  const asset = slot.asset && ASSETS[slot.asset] ? ASSETS[slot.asset] : null;
  let checked = "Rule not set: the size was not checked.";
  if (asset) {
    const got = { width: profileNum(a.width, "width"), height: profileNum(a.height, "height"), format: String(a.format == null ? "" : a.format).trim(), size_mb: profileNum(a.size_mb, "size_mb") };
    const need = ["width", "height", "format"].concat(asset.mb ? ["size_mb"] : []);
    const missing = need.filter((k) => (k === "format" ? !got.format : got[k] == null));
    if (missing.length) fail(`Give ${missing.join(", ")} so it can be checked. The rule: ${asset.rule} Nothing was asked.`);
    const problems = assetProblems(slot.asset, { width: got.width, height: got.height, format: got.format, mb: got.size_mb });
    if (problems.length) fail(`${problems.join(" ")} Fix the image, then propose again. Nothing was asked.`);
    const bits = [`${got.width} x ${got.height}`, got.format.replace(/^\./, "").toLowerCase()];
    if (got.size_mb != null) bits.push(`${got.size_mb} MB`);
    checked = bits.join(", ") + ": nothing to fix";
  }
  const open = (await listMessages(store, now)).find((m) => m.proposal && m.proposal.action === "profile" && m.proposal.slot === slot.id && isOpen(m));
  if (open) fail(`Luke has not answered the last question about the ${slot.platform} ${slot.kind.toLowerCase()} yet (message ${open.id}, from ${open.from}). Wait for his answer. Nothing was asked.`, "exists");
  const rule = profileRule(slot);
  const changes = [
    { label: "Platform", from: "", to: slot.platform },
    { label: "Image", from: "", to: slot.kind },
    { label: "New image", from: current ? current.link : "", to: link },
    { label: "Rule", from: "", to: rule },
    { label: "Checked", from: "", to: checked },
  ];
  const who = slot.owner || "Luke";
  const text = `${by} asks: is this correct? A new ${slot.platform} ${slot.kind.toLowerCase()}. Link: ${link}. Rule: ${rule} ${checked}` +
    (why ? ` Why: ${why}` : "") + ` Nothing changes until you say "Yes, correct". After that, ${who} uploads it by hand. HQ does not log in and does not change ${slot.platform}.`;
  const r = await sendMessage(store, now, roster, { from: by, to: "Luke", needs: "decision", text, ...(slot.owner && slot.owner !== by ? { about: slot.owner } : {}),
    proposal: { action: "profile", slot: slot.id, platform: slot.platform, kind: slot.kind, title: `${slot.platform} ${slot.kind.toLowerCase()}`, link, owner: slot.owner || "", by, changes } });
  return { message: r.message, slot, rule, changes };
}
/* Luke said yes: remember the image. The live one changes only when the owner records the upload. */
export async function approveProfile(store, now, p, asker, msg) {
  const slot = PROFILE_SLOTS.find((s) => s.id === p.slot);
  if (!slot) throw new StaffError("That profile is no longer on the list. Nothing was saved.");
  const link = httpsLink(p.link);
  if (!link) throw new StaffError("The image link is not an https link. Nothing was saved.");
  await writeProfile(store, slot.id, (cur) => ({ ...cur, approved: { link, by: asker, at: new Date(now).toISOString(), msg: clean(msg, 20) } }));
  const who = slot.owner ? `${slot.owner} uploads it by hand, then records it with profiles (the link and the day it changed).` : "No owner yet: Luke uploads it himself, then it is recorded with profiles.";
  return `${slot.platform} ${slot.kind.toLowerCase()}: Luke said yes. ${who} HQ does not log in and does not change the platform.`;
}

/* ---------- recommendations (A3, 17 Nov 2026, Nova: "Luke's decisions inbox with my recommendation on each card") ----------
   { by, option, why, at } on a message waiting on Luke. option = one of the message's options, exactly as listed
   ("" when it has none, or none is picked); why = one or two sentences. The asker gives its own through
   send_message; Nova (or Claude) adds hers with recommend. One per person: a new one replaces that person's. */
export const RECOMMENDERS = ["Nova", "Claude"];
function recommendation(by, now, options, option, why) {
  const w = cleanText(why, 300);
  if (w.length < 2) fail("Say why in recommend (why): one or two sentences.");
  noSecrets(w);
  let opt = "";
  if (option != null && String(option).trim()) {
    if (!(options || []).length) fail("recommend_option only goes with options: say what you recommend in recommend instead.");
    opt = options.find((o) => low(o) === low(option)) || "";
    if (!opt) fail(`recommend_option must be one of the options, exactly as listed: ${options.join(" / ")}.`);
  }
  return { by, option: opt, why: w, at: new Date(now).toISOString() };
}
export async function recommendMessage(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  if (!RECOMMENDERS.includes(by)) fail("Only Nova (or Claude) adds a recommendation to someone else's question. When you ask Luke yourself, put yours in send_message recommend.", "not_allowed");
  const id = clean(a.id, 20), month = monthOfId(id);
  if (!month) fail("message_id must be the id of the message waiting on Luke (it starts with m).");
  return mutate(store, msgKey(month), [], (list) => {
    const p = list.find((x) => x.id === id);
    if (!p) fail("There is no message with that id.", "not_found");
    if (p.to !== "Luke" || !isOpen(p)) fail("That message is not waiting on Luke (it was not sent to him, or it is already handled). Nothing was saved.");
    const opt = a.option != null && String(a.option).trim() ? a.option : "";
    if (opt && !(p.options || []).length) fail("That question has no options: say what you recommend in why.");
    if (opt && !(p.options || []).some((o) => low(o) === low(opt))) fail(`option must be one of the options, exactly as listed: ${(p.options || []).join(" / ")}.`);
    const rec = recommendation(by, now, p.options || [], opt, a.why);
    p.recommendations = (Array.isArray(p.recommendations) ? p.recommendations : []).filter((x) => x.by !== by).concat([rec]);
    return { value: p };
  });
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
/* ONE message by id, whatever its age (read_messages id, 14 Nov 2026) */
export async function getMessage(store, id) {
  const want = clean(id, 20), month = monthOfId(want);
  if (!month) fail("There is no message with that id. Message ids start with m, as read_messages shows them.", "not_found");
  const { data } = await readDoc(store, msgKey(month), []);
  const m = (Array.isArray(data) ? data : []).find((x) => x.id === want);
  if (!m) fail("There is no message with that id.", "not_found");
  return m;
}
/* "YYYY-MM-DD" or "YYYY-MM-DD HH:MM", São Paulo time -> the ISO instant it starts (null = not a time) */
export function spInstant(s) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(String(s || "").trim());
  if (!m) return null;
  const guess = Date.parse(`${m[1]}T${m[2] || "00"}:${m[3] || "00"}:00Z`);
  if (!Number.isFinite(guess)) return null;
  const seen = Date.parse(`${spDay(guess)}T${spHM(guess)}:00Z`); /* what São Paulo's clock reads at `guess` */
  return new Date(guess + (guess - seen)).toISOString();
}
const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/* read_messages' filters: since, from, to, about (from or to), search (every word in the text) */
export function filterMessages(list, roster, a = {}) {
  const has = (k) => a[k] != null && String(a[k]).trim() !== "";
  const name = (k) => (["all", "everyone", "team"].includes(low(a[k])) ? "all" : whoIs(a[k], roster, { people: true }));
  let out = list;
  if (has("since")) {
    const t = spInstant(a.since);
    if (!t) fail('since must be a day "YYYY-MM-DD" or a time "YYYY-MM-DD HH:MM" (São Paulo time).');
    out = out.filter((m) => m.at >= t);
  }
  if (has("from")) { const n = name("from"); out = out.filter((m) => m.from === n); }
  if (has("to")) { const n = name("to"); out = out.filter((m) => m.to === n); }
  if (has("about")) { const n = name("about"); out = out.filter((m) => m.from === n || m.to === n); }
  if (has("search")) {
    const words = fold(a.search).split(/\s+/).filter(Boolean).slice(0, 8);
    out = out.filter((m) => { const t = fold(m.text + " " + (m.options || []).join(" ")); return words.every((w) => t.includes(w)); });
  }
  return out;
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
/* a payer's name without punctuation or a company ending: "Sample Holdings LLC" = "Sample Holdings" (round 2,
   15 Nov 2026, Luke: "merge the duplicate payers but money should be counted once") */
const COMPANY_END = /\s+(llc|ltd|limited|inc|incorporated|corp|corporation|co|company|gmbh|sa|sl|ltda|eireli|me|plc|pty|bv|srl)$/;
export function payerName(p) {
  let n = low(p).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  for (let i = 0; i < 3 && COMPANY_END.test(n); i++) n = n.replace(COMPANY_END, "").trim();
  return n;
}
/* one payer = the same name as above. Two DIFFERENT names are never merged, even under one source: a
   label paying "via" another company is its own payer (Luke, 15 Nov 2026: one such pair "should be separate") */
const STATEMENT = /^statement/i;
const sameMoney = (x, e) => x.amount === e.amount && x.currency === e.currency && payerName(x.payer) === payerName(e.payer);
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
  if (status === "unsorted" && by !== "HQ") fail("status must be received, pending, transfer, statement only or payable"); /* only the bank reader files a payment as unsorted */
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
        const old = pid ? list.find((x) => x.id === pid && OWED.includes(x.status) && x.amount === e.amount && x.currency === e.currency && x.date <= date)
          : list.find((x) => OWED.includes(x.status) && sameMoney(x, e) && x.date <= date && !(x.reference && e.reference && low(x.reference) !== low(e.reference)));
        if (!old) return { skip: true, value: null };
        old.history = (old.history || []).concat({ at: e.at, by, from: old.status, to: "received" }).slice(-10);
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
      const moves = old.status !== e.status && !(old.status === "received" && OWED.includes(e.status)) && e.status !== "unsorted"; /* a later "unsorted" never overwrites a decided status */
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
/* how many months of payments "To sort" looks back over (this month and the 11 before): an unsorted
   payment stays on the list, in the count and in income_status for a year, not just four months */
export const UNSORTED_MONTHS = 12;
const PAY_ID = /^i[0-9a-z]{8,16}$/;
/* Is the statement p (pending) the money of the credit e? Same amount and currency, dated on or before
   it, in its month or the three before (the rule the bank reader's own upgrade uses). */
const pendingFits = (p, e) => OWED.includes(p.status) && p.amount === e.amount && p.currency === e.currency && p.date <= e.date && monthsBack(e.date.slice(0, 7), 4).includes(String(p.date).slice(0, 7));
const monthsBack = (m, n) => { const out = []; for (let i = 0; i < n; i++, m = prevMonth(m)) out.push(m); return out; };
/* a.pending_id (with status received): the payment is the money of THAT statement, logged earlier as
   pending. The statement is upgraded as the bank reader's own upgrade does it (received, arrived = the
   credit's day, the credit's id kept as its reference or bankRef) and the unsorted row is taken off the
   desk, so the money is counted once, as received, and never also as pending. */
export async function sortIncome(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  if (!SORTERS.includes(by)) fail(`Only ${SORTERS.join(", ")} can sort a payment.`, "not_allowed");
  const id = clean(a.id, 20);
  if (!PAY_ID.test(id)) fail("id must be the payment's id (it starts with i)");
  const status = low(a.status);
  if (!["received", "transfer"].includes(status)) fail('status must be "received" (it is income) or "transfer" (not income)');
  const pid = a.pending_id == null || a.pending_id === "" ? "" : clean(a.pending_id, 20);
  if (pid && (status !== "received" || !PAY_ID.test(pid))) fail("pending_id goes only with status received, and must be the pending statement's id (it starts with i)");
  const category = status === "received" ? CATEGORIES.find((c) => low(c) === low(a.category)) : null;
  if (status === "received" && !category && !pid) fail(`category must be one of: ${CATEGORIES.join(", ")}`);
  /* source + note (16 Nov 2026): tie a Revolut row to the source it is (a wage Luke moves in from another bank of
     his, money from a payer via Wise or PayPal), so that source turns green on Money */
  let srcId = "";
  if (a.source != null && String(a.source).trim()) {
    const k = low(clean(a.source, 60)), list = await getSources(store), hit = list.find((x) => x.kind !== "account" && (x.id === k || low(x.name) === k));
    if (!hit) fail(`There is no income source called "${clean(a.source, 60)}". The sources are: ${list.filter((x) => x.kind !== "account").map((x) => `${x.name} (${x.id})`).join(", ")}.`);
    srcId = hit.id;
  }
  const sortNote = a.note != null ? clean(a.note, 240) : "";
  noSecrets(sortNote);
  let months = [clean(a.month, 7)];
  if (!/^\d{4}-\d{2}$/.test(months[0])) months = monthsBack(spDay(now).slice(0, 7), UNSORTED_MONTHS);
  const sortable = (e) => {
    const lastBy = (e.history || []).length ? e.history[e.history.length - 1].by : e.by;
    if (e.status !== "unsorted" && lastBy !== "HQ") fail(`That payment is already sorted (${e.status}). Nothing was changed.`, "not_allowed");
    if (e.status === "pending") fail("That payment is still pending. Nothing was changed.", "not_allowed");
  };
  for (const m of months) {
    if (pid) {
      const cur = ((await readDoc(store, incKey(m), [])).data || []).find((x) => x.id === id);
      if (!cur) continue;
      sortable(cur);
      return mergePending(store, now, by, cur, m, pid);
    }
    const hit = await mutate(store, incKey(m), [], (list) => {
      const e = list.find((x) => x.id === id);
      if (!e) return { skip: true, value: null };
      sortable(e);
      const at = new Date(now).toISOString();
      e.history = (e.history || []).concat({ at, by, from: e.status, to: status }).slice(-10);
      e.status = status; if (category) e.category = category; if (srcId) e.source = srcId; if (sortNote) e.note = sortNote; e.updatedAt = at;
      return { value: e };
    });
    if (hit) return hit;
  }
  fail("There is no payment with that id", "not_found");
}
async function mergePending(store, now, by, e, month, pid) {
  const at = new Date(now).toISOString(), ref = e.reference || "";
  const drop = (list) => { const i = list.findIndex((x) => x.id === e.id); if (i >= 0) list.splice(i, 1); return i >= 0; };
  let up = null;
  for (const m of monthsBack(e.date.slice(0, 7), 4)) {
    up = await mutate(store, incKey(m), [], (list) => {
      const p = list.find((x) => x.id === pid);
      if (!p) return { skip: true, value: null };
      /* done already (a second press, or a first one cut off before the row went): only the row goes */
      const done = p.status === "received" && !!ref && (low(p.reference) === low(ref) || low(p.bankRef) === low(ref));
      if (!done) {
        if (p.status !== "pending") fail(`That statement is not pending any more (${p.status}). Nothing was changed.`, "not_allowed");
        if (!pendingFits(p, e)) fail("That statement is not this payment: the amount, the currency or the day doesn't fit. Nothing was changed.", "not_allowed");
        p.history = (p.history || []).concat({ at, by, from: "pending", to: "received", merged: e.id }).slice(-10);
        p.status = "received"; p.arrived = e.date; p.account = e.account; p.updatedAt = at;
        if (ref && !p.reference) p.reference = ref;
        else if (ref && low(p.reference) !== low(ref)) p.bankRef = ref; /* how the bank reader knows it when it reads the payment again */
      }
      if (m === month) drop(list); /* the same month: one write does both */
      return { value: p };
    });
    if (up) break;
  }
  if (!up) fail("There is no pending statement with that id", "not_found");
  if (month !== up.date.slice(0, 7)) await mutate(store, incKey(month), [], (list) => (drop(list) ? { value: null } : { skip: true, value: null }));
  return up;
}
/* batch 4 (15 Nov 2026): a payment already on the desk, corrected by the bot that submitted it (or Ledger,
   Sheet, Nova, Claude, Luke), within its own month, with the reason kept beside what changed */
const FIX_FIELDS = ["date", "payer", "amount", "currency", "status", "category", "account", "reference", "note", "source", "paidBy"];
export const ROYALTY_CATS = ["Self-releases", "Label deals", "Publishing"];
export async function fixIncome(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  const id = clean(a.id, 20), month = clean(a.month, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) fail("month must be the payment's month, YYYY-MM, as income_status lists it under your_payments.");
  const reason = clean(a.reason, 240);
  if (reason.length < 3) fail("reason is empty: say in one line what was wrong. Nothing was changed.");
  noSecrets(reason);
  const want = {};
  /* the day it arrived, in ANY month (17 Nov 2026, Luke: "the month should count when the payment arrives"): a
     payment whose real day is in another month moves there (same id, counted once) */
  if (a.date != null && String(a.date).trim()) { const d = clean(a.date, 10); if (!DAY.test(d) || Number.isNaN(Date.parse(d + "T12:00:00Z"))) fail("date must be YYYY-MM-DD."); if (d > spDay(now)) fail(`date is in the future (${d}). Nothing was changed.`); want.date = d; }
  if (a.payer != null && String(a.payer).trim()) want.payer = clean(a.payer, 80);
  if (a.amount != null && String(a.amount).trim()) { const n = amountOf(a.amount); if (n == null || n <= 0) fail("amount must be a positive number, written like 112.01."); want.amount = n; }
  if (a.currency != null && String(a.currency).trim()) { const c = clean(a.currency, 12).toUpperCase(); if (!/^[A-Z]{3}$/.test(c)) fail("currency must be the three-letter code the money was paid in."); want.currency = c; }
  if (a.status != null && String(a.status).trim()) { const st = low(a.status); if (!INCOME_STATUS.includes(st) || st === "unsorted") fail(`status must be one of: ${INCOME_STATUS.filter((x) => x !== "unsorted").join(", ")}.`); want.status = st; }
  if (a.category != null && String(a.category).trim()) { const c = CATEGORIES.find((x) => low(x) === low(a.category)); if (!c) fail(`category must be one of: ${CATEGORIES.join(", ")}.`); want.category = c; }
  if (a.account != null && String(a.account).trim()) want.account = clean(a.account, 40);
  if (a.reference != null) want.reference = clean(a.reference, 80);
  if (a.note != null) want.note = clean(a.note, 240);
  /* source (16 Nov 2026, Ledger): tie ANY payment to its income source, HQ's Revolut rows included */
  if (a.source != null && String(a.source).trim()) {
    const k = low(clean(a.source, 60)), list = await getSources(store), hit = list.find((x) => x.kind !== "account" && (x.id === k || low(x.name) === k));
    if (!hit) fail(`There is no income source called "${clean(a.source, 60)}". The sources are: ${list.filter((x) => x.kind !== "account").map((x) => `${x.name} (${x.id})`).join(", ")}.`);
    want.source = hit.id;
  }
  noSecrets(want.payer || "", want.note || "");
  if (want.reference) { const what = secretIn(want.reference, { reference: true }); if (what) fail(`reference looks like ${what}. It must be the payment's own transaction id, nothing else.`, "secret"); }
  /* paid_by (16 Nov 2026, Ledger): a statement filed as pending / payable / statement only is settled by the
     received payment that paid it, whatever its amount or currency (USD 1,300 statement, USD 1,280 received; a
     USD statement paid in EUR). The statement then counts nowhere; the money counts once, as received. */
  if (a.paid_by != null && String(a.paid_by).trim()) {
    const pid = clean(a.paid_by, 20);
    let target = null;
    for (const m of monthsBack(spDay(now).slice(0, 7), UNSORTED_MONTHS)) { target = ((await readDoc(store, incKey(m), [])).data || []).find((x) => x.id === pid); if (target) break; }
    if (!target) fail(`There is no received payment with the id "${pid}". Find it with payments.`, "not_found");
    if (target.status !== "received") fail(`${pid} is not a received payment (it is ${target.status}): a statement is settled by the money that arrived.`);
    want.paidBy = pid;
  }
  const at = new Date(now).toISOString();
  /* a statement already paid keeps its own (statement) date and gets the day it arrived instead */
  const moveTo = want.date && want.date.slice(0, 7) !== month ? want.date.slice(0, 7) : "";
  const res = await mutate(store, incKey(month), [], (list) => {
    const e = list.find((x) => x.id === id);
    if (!e) fail(`There is no payment with the id "${id}" in ${month}. Find it with payments.`, "not_found");
    if (e.by !== by && !SORTERS.includes(by)) fail(`That payment was submitted by ${e.by}: only ${e.by}, Ledger, Sheet, Nova, Claude or Luke fix it. Tell ${e.by}.`, "not_allowed");
    if (e.status === "unsorted") fail("That payment is unsorted: say what it is with sort_payment, not fix_payment.", "not_allowed");
    if (want.paidBy && !OWED.includes(e.status)) fail(`Only a statement (pending, payable or statement only) can be marked paid with paid_by; this payment is ${e.status}.`, "not_allowed");
    const changed = {};
    for (const k of FIX_FIELDS) if (k in want && (e[k] ?? "") !== want[k]) changed[k] = [e[k] ?? "", want[k]];
    if (!Object.keys(changed).length) return { skip: true, value: { entry: e, fixed: [] } };
    if (moveTo && e.arrived) { delete changed.date; changed.arrived = [e.arrived, want.date]; } /* merged statement: its arrival day moves, it stays filed */
    for (const k of Object.keys(changed)) e[k] = k === "arrived" ? want.date : want[k];
    e.fixes = (e.fixes || []).concat({ at, by, reason, changed }).slice(-10);
    e.updatedAt = at;
    /* to another month: written there first, then taken out of here, so it is never lost (and never twice: the
       new month skips an id it already has) */
    return { value: { entry: e, fixed: Object.keys(changed), move: !!(moveTo && changed.date) } };
  });
  if (!res.move) return res;
  await mutate(store, incKey(moveTo), [], (list) => {
    if (list.some((x) => x.id === id)) return { skip: true, value: null };
    list.push(res.entry);
    return { value: res.entry };
  });
  await mutate(store, incKey(month), [], (list) => {
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return { skip: true, value: null };
    list.splice(i, 1);
    return { value: true };
  });
  return { ...res, movedTo: moveTo };
}
export async function getSources(store) {
  const [{ data }, ed] = await Promise.all([readDoc(store, "sources.json", []), readDoc(store, "srcedit.json", {})]);
  const edits = ed.data && typeof ed.data === "object" ? ed.data : {};
  /* the bots' own edits (batch 4) on top of the private seed: a re-seed never wipes them */
  const seed = Array.isArray(data) ? data : [];
  /* a source the seed doesn't have, added by Ledger with income_source create (16 Nov 2026) */
  const made = Object.entries(edits).filter(([id, e]) => e && e.created && !seed.some((x) => x.id === id))
    .map(([id, e]) => ({ id, name: e.name, kind: "payer", category: e.category || "Other", currency: "", lands: "", cadence: "monthly", owner: e.by || "Ledger", state: "active", match: [low(e.name)], how: "", blocker: "", needsLuke: "" }));
  return seed.concat(made).map((s) => {
    const e = edits[s.id];
    if (!e) return s;
    const { by, at, created, name, ...f } = e;
    const out = { ...s, ...f, editedBy: by, editedAt: at };
    if (Array.isArray(f.accounts) && f.accounts.length) out.lands = f.accounts.join(" + ");
    return out;
  });
}
/* link_transfer (17 Nov 2026): the Revolut credit that carried money from Wise / PayPal is tied to the payment(s) it
   carried: it becomes received (counted once) with their source and category; they are "moved to Revolut" (counted
   nowhere). One transfer may carry several payments; fees and exchange are fine (the Revolut amount is what counts). */
export async function linkTransfer(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  if (!SORTERS.includes(by)) fail("Linking money moved into Revolut is Ledger's (Sheet and Nova may too). Tell Ledger.", "not_allowed");
  const rid = clean(a.revolut_id, 20), month = clean(a.month, 7);
  if (!PAY_ID.test(rid)) fail("revolut_id must be the Revolut payment's id (from payments, account Revolut).");
  if (!/^\d{4}-\d{2}$/.test(month)) fail("month must be the Revolut payment's month, YYYY-MM.");
  const from = (Array.isArray(a.from) ? a.from : String(a.from || "").split(/[ ,]+/)).map((x) => clean(x, 20)).filter(Boolean);
  if (!from.length || from.length > 20) fail("from must be the id(s) of the Wise or PayPal payment(s) this Revolut money carried (1 to 20).");
  const sources = await getSources(store), isHold = holdingOf(sources);
  const note = clean(a.note, 240); noSecrets(note);
  const rev = ((await readDoc(store, incKey(month), [])).data || []).find((x) => x.id === rid);
  if (!rev) fail(`There is no payment with the id "${rid}" in ${month}. Find it with payments (account Revolut).`, "not_found");
  if (!isMainAccount(rev.account)) fail(`${rid} is not a Revolut payment (it landed in ${rev.account}): link_transfer ties the Revolut payment to what it carried.`);
  if (rev.from && rev.from.length) fail(`${rid} is already linked to ${rev.from.join(", ")}.`, "exists");
  if (!["received", "unsorted", "transfer"].includes(rev.status)) fail(`${rid} is ${rev.status}: only money that arrived in Revolut can be linked.`);
  /* find every "from" payment in the last 12 months */
  const found = [];
  for (const id of from) {
    let hit = null, hm = null;
    for (const m of monthsBack(spDay(now).slice(0, 7), UNSORTED_MONTHS)) { hit = ((await readDoc(store, incKey(m), [])).data || []).find((x) => x.id === id); if (hit) { hm = m; break; } }
    if (!hit) fail(`There is no payment with the id "${id}". Find it with payments.`, "not_found");
    if (hit.movedTo) fail(`${id} is already moved to Revolut (${hit.movedTo}).`, "exists");
    if (!isHold(hit)) fail(`${id} is not money received in Wise or PayPal (it is ${hit.status} in ${hit.account}).`);
    found.push({ e: hit, m: hm });
  }
  const at = new Date(now).toISOString();
  for (const m of [...new Set(found.map((x) => x.m))]) {
    await mutate(store, incKey(m), [], (list) => {
      for (const x of list) if (from.includes(x.id)) { x.movedTo = rid; x.history = (x.history || []).concat({ at, by, from: "received", to: "moved to Revolut", rev: rid }).slice(-10); x.updatedAt = at; }
      return { value: true };
    });
  }
  const first = found[0].e;
  const out = await mutate(store, incKey(month), [], (list) => {
    const r = list.find((x) => x.id === rid);
    if (!r) fail("The Revolut payment is gone. Nothing was linked.", "not_found");
    r.history = (r.history || []).concat({ at, by, from: r.status, to: "received", linked: from }).slice(-10);
    r.status = "received"; r.from = from; r.category = first.category || r.category;
    if (first.source || sources.find((s) => s.kind !== "account" && srcMatches(s, first.payer))) r.source = first.source || sources.find((s) => s.kind !== "account" && srcMatches(s, first.payer)).id;
    r.note = note || `From ${[...new Set(found.map((x) => x.e.account))].join(" + ")}: ${[...new Set(found.map((x) => x.e.payer))].join(", ")}`;
    r.updatedAt = at;
    return { value: r };
  });
  return { entry: out, linked: found.length };
}
/* month_check (17 Nov 2026, Luke: income "checked from the first day to the last day of the month"): what is still in
   the way of a right month: payments still to sort, Revolut credits from Luke's own accounts not yet linked, money
   still waiting in Wise / PayPal. ready = nothing is. */
export async function monthCheck(store, now, a = {}) {
  const month = a.month == null || String(a.month).trim() === "" ? spDay(now).slice(0, 7) : clean(a.month, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) fail("month must be YYYY-MM.");
  const sources = await getSources(store), isHold = holdingOf(sources), own = sources.filter((s) => s.kind === "account" && !isMainAccount(s.name));
  const list = ((await readDoc(store, incKey(month), [])).data || []).filter(Boolean).map((e) => (e.arrived && e.arrived !== e.date ? { ...e, date: e.arrived } : e)).filter((e) => e.date.slice(0, 7) === month);
  const received = {};
  for (const e of list) if (e.status === "received" && !e.movedTo && !isHold(e)) received[e.currency] = round((received[e.currency] || 0) + e.amount);
  const fromOwn = (e) => own.find((s) => srcMatches(s, e.payer));
  const toSort = list.filter((e) => e.status === "unsorted");
  const waiting = list.filter(isHold);
  const ownTransfers = list.filter((e) => e.status === "transfer" && isMainAccount(e.account) && !(e.from && e.from.length) && e.by === "HQ" && !(e.history || []).length);
  return { month, received, toSort, waiting, ownTransfers, fromOwn, ready: !toSort.length && !waiting.length };
}
/* ---------- the locked month close (A7, 17 Nov 2026, Ledger, Sheet) ----------
   When month_check says a finished month is ready, close_month freezes it: close/<month>.json = { month, at, by,
   received (per currency), count, rows (every payment that counts in that month: id, date, payer, amount, currency,
   status, category, source, account, reference), evidence (https links) }, and one line in closes.json (the index
   the board reads). A month closes once. Nothing is blocked afterwards: monthCloseView compares the month as it is
   now with the snapshot, so every later change shows old -> new (with the fix's who and why when there is one). */
export const CLOSERS = ["Ledger", "Sheet", "Nova", "Claude", "Luke"];
const closeKey = (m) => `close/${m}.json`;
const SNAP = ["date", "payer", "amount", "currency", "status", "category", "source", "account", "reference"];
const snapRow = (e) => Object.fromEntries([["id", e.id], ...SNAP.map((k) => [k, e[k] == null ? "" : e[k]])]);
async function monthRows(store, month) {
  return ((await readDoc(store, incKey(month), [])).data || []).filter(Boolean)
    .map((e) => (e.arrived && e.arrived !== e.date ? { ...e, date: e.arrived } : e)).filter((e) => e.date.slice(0, 7) === month);
}
export async function getMonthClose(store, month) { const { data } = await readDoc(store, closeKey(month), null); return data && data.month ? data : null; }
const moneyWords = (o) => Object.keys(o || {}).sort().map((k) => `${k} ${Number(o[k]).toFixed(2)}`).join(" + ") || "nothing";
export async function closeMonth(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  if (!CLOSERS.includes(by)) fail("A month is closed by Ledger, Sheet or Nova (or Luke). Tell Ledger.", "not_allowed");
  const month = clean(a.month, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) fail("month must be YYYY-MM, for example 2026-11.");
  if (month >= spDay(now).slice(0, 7)) fail(`${month} hasn't ended yet: a month is closed once it is over (on the 1st or later).`);
  const ev = (Array.isArray(a.evidence) ? a.evidence : a.evidence ? [a.evidence] : []).map((x) => clean(x, 300)).filter(Boolean);
  if (ev.some((x) => !/^https:\/\//.test(x))) fail("evidence must be https links (a statement, a sheet, a screenshot folder).");
  if (ev.length > 10) fail("At most 10 evidence links.");
  noSecrets(ev.join("\n"));
  const was = await getMonthClose(store, month);
  if (was) return { already: true, close: was };
  const c = await monthCheck(store, now, { month });
  if (!c.ready) fail(`${month} isn't ready to close: ${c.toSort.length} to sort, ${c.waiting.length} waiting in Wise or PayPal. Run month_check and sort them first.`);
  const rows = (await monthRows(store, month)).map(snapRow).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.id < y.id ? -1 : 1));
  const doc = { month, at: new Date(now).toISOString(), by, received: c.received, count: rows.length, rows, evidence: ev };
  let first = false;
  await mutate(store, closeKey(month), null, (cur) => { if (cur && cur.month) return { skip: true, value: null }; first = true; return { replace: doc, value: doc }; });
  if (!first) return { already: true, close: await getMonthClose(store, month) };
  await mutate(store, "closes.json", [], (list) => {
    const l = Array.isArray(list) ? list.filter((x) => x.month !== month) : [];
    l.push({ month, at: doc.at, by, received: doc.received, count: doc.count });
    l.sort((x, y) => (x.month < y.month ? 1 : -1));
    return { replace: l.slice(0, 24), value: true };
  });
  return { already: false, close: doc };
}
/* the closed month now vs its snapshot: [{ kind: added|removed|changed, id, row (now, or as closed), fields: {f: [old, new]}, by, why }] */
export async function monthCloseView(store, now, month) {
  const close = await getMonthClose(store, month);
  if (!close) return null;
  const nowRows = await monthRows(store, month), byId = new Map(nowRows.map((e) => [e.id, e])), snap = new Map(close.rows.map((r) => [r.id, r]));
  const changes = [];
  for (const r of close.rows) {
    const e = byId.get(r.id);
    if (!e) { changes.push({ kind: "removed", id: r.id, row: r }); continue; }
    const cur = snapRow(e), fields = {};
    for (const k of SNAP) if (String(cur[k]) !== String(r[k])) fields[k] = [r[k], cur[k]];
    if (Object.keys(fields).length) { const fx = (e.fixes || []).filter((f) => f.at > close.at).slice(-1)[0]; changes.push({ kind: "changed", id: r.id, row: cur, fields, ...(fx ? { by: fx.by, why: fx.reason } : {}) }); }
  }
  for (const e of nowRows) if (!snap.has(e.id)) changes.push({ kind: "added", id: e.id, row: snapRow(e), by: e.by || "" });
  return { ...close, changes };
}
const rowWords = (r) => `${r.date} · ${r.payer} · ${r.currency} ${Number(r.amount).toFixed(2)} · ${r.status}`;
export function closeChangeLines(changes) {
  return (changes || []).map((c) => c.kind === "added" ? `Added after closing: ${rowWords(c.row)}${c.by ? ` (by ${c.by})` : ""}`
    : c.kind === "removed" ? `Gone since closing (moved to another month, or merged): ${rowWords(c.row)}`
    : `Changed ${rowWords(c.row)}: ` + Object.entries(c.fields).map(([k, [o, n]]) => `${k} ${k === "amount" ? Number(o).toFixed(2) : o || "(empty)"} → ${k === "amount" ? Number(n).toFixed(2) : n || "(empty)"}`).join(", ") + (c.by ? ` (${c.by}: ${c.why})` : ""));
}
/* a CSV cell: quoted, and a leading = + - @ made harmless for spreadsheets */
export function csvCell(v) { let t = String(v == null ? "" : v); if (/^[=+\-@]/.test(t)) t = "'" + t; return /[",\n']/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }
export function closeCsv(v) {
  const L = [["month", "closed_at", "closed_by", "received", "evidence"].join(","), [v.month, v.at, v.by, moneyWords(v.received), (v.evidence || []).join(" ")].map(csvCell).join(","), "",
    ["id", ...SNAP].join(","), ...v.rows.map((r) => [r.id, ...SNAP.map((k) => r[k])].map(csvCell).join(","))];
  L.push("", "change,detail");
  for (const [i, line] of closeChangeLines(v.changes).entries()) L.push([v.changes[i].kind, line].map(csvCell).join(","));
  return L.join("\n") + "\n";
}
export const closeLine = (c) => `Closed by ${c.by} on ${dayWords(spDay(Date.parse(c.at)))}: ${moneyWords(c.received)} received, ${c.count} payment${c.count === 1 ? "" : "s"}`;

/* Every payment of one month, for Ledger (16 Nov 2026: income_status showed the 15 newest, without ids for HQ's
   Revolut rows, so they could never be sorted or fixed). Filters: account, source (its id or name: the payments
   tied to it or whose payer matches it), payer (words in the name), status. Newest first; limit 1..200 (100). */
export async function listPayments(store, now, a = {}) {
  const month = a.month == null || String(a.month).trim() === "" ? spDay(now).slice(0, 7) : clean(a.month, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) fail("month must be YYYY-MM, for example 2026-11.");
  const limit = a.limit == null ? 100 : Math.max(1, Math.min(200, Math.floor(Number(a.limit)) || 100));
  let list = ((await readDoc(store, incKey(month), [])).data || []).filter(Boolean);
  if (a.account != null && String(a.account).trim()) { const k = low(a.account); list = list.filter((e) => low(e.account).includes(k)); }
  if (a.source != null && String(a.source).trim()) {
    const k = low(clean(a.source, 60)), src = (await getSources(store)).find((x) => x.id === k || low(x.name) === k);
    if (!src) fail(`There is no income source called "${clean(a.source, 60)}".`);
    list = list.filter((e) => low(e.source) === src.id || (!e.source && srcMatches(src, e.payer)));
  }
  if (a.payer != null && String(a.payer).trim()) { const words = low(a.payer).split(/\s+/).filter(Boolean); list = list.filter((e) => words.every((w) => low(e.payer).includes(w))); }
  if (a.status != null && String(a.status).trim()) { const st = low(a.status); list = list.filter((e) => e.status === st); }
  list.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : (x.at || "") < (y.at || "") ? 1 : -1));
  return { month, total: list.length, payments: list.slice(0, limit) };
}
/* After a full Revolut read (16 Nov 2026, Ledger: Revolut still said "blocked" / "not connected" after the site had
   read it): the Revolut account source is active again with no blocker or ask, and so is a payer source that was
   blocked only for want of Revolut. Kept in srcedit.json by "HQ"; a source changes once. -> ids changed */
export async function afterBankRead(store, now) {
  const list = await getSources(store);
  const fix = list.filter((s) => (s.kind === "account" && /revolut/i.test(s.name) && (s.state === "blocked" || s.needsLuke || s.blocker)) ||
    (s.kind !== "account" && s.state === "blocked" && /revolut/i.test(s.blocker || "")));
  if (!fix.length) return [];
  const at = new Date(now).toISOString();
  await mutate(store, "srcedit.json", {}, (doc) => {
    const d = doc && typeof doc === "object" && !Array.isArray(doc) ? doc : {};
    for (const s of fix) d[s.id] = { ...(d[s.id] || {}), state: "active", blocker: "", ...(s.kind === "account" ? { needsLuke: "" } : {}), by: "HQ", at };
    return { replace: d, value: true };
  });
  return fix.map((s) => s.id);
}
/* batch 4 (15 Nov 2026): the bot that owns a source (or Ledger, Sheet, Nova, Claude, Luke) says where its
   money lands (one or several accounts), its state and why, its category, and clears a "needs Luke" that
   no longer stands. Kept in srcedit.json, on top of the seed. */
export const SOURCE_EDITORS = ["Ledger", "Sheet", "Nova", "Claude", "Luke"];
export async function editSource(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  const want = low(clean(a.source, 60));
  const list = await getSources(store);
  let s = list.find((x) => x.id === want || low(x.name) === want);
  /* create (16 Nov 2026): a main source the desk doesn't have yet, added by Ledger, Sheet or Nova */
  const create = a.create === true;
  if (create && s) fail(`${s.name} is already a source: change it without create. Nothing was saved.`, "exists");
  if (!s && !create) fail(`There is no income source called "${clean(a.source, 60)}". The sources are: ${list.map((x) => x.name).join(", ") || "none yet"}. To add a new one, send create: true with its name in source and its category.`);
  if (create) {
    if (!SOURCE_EDITORS.includes(by)) fail("Only Ledger, Sheet or Nova add a source. Tell Ledger.", "not_allowed");
    const name = clean(a.source, 60);
    if (name.length < 2) fail("Give the new source's name in source. Nothing was saved.");
    noSecrets(name);
    const id = songKey(name).slice(0, 30) || "s" + Number(now).toString(36);
    if (list.some((x) => x.id === id)) fail(`There is already a source with the id "${id}". Nothing was saved.`, "exists");
    s = { id, name, owner: by, created: true };
  }
  if (!SOURCE_EDITORS.includes(by) && by !== s.owner) fail(`${s.name} is edited by its owner (${s.owner || "nobody named"}), Ledger, Sheet or Nova. If something about it is wrong, tell ${s.owner || "Ledger"}.`, "not_allowed");
  const f = {};
  if (a.state != null && String(a.state).trim() !== "") {
    const st = low(a.state).replace(/[ -]/g, "_");
    if (!SOURCE_STATE.includes(st)) fail(`state must be one of: ${SOURCE_STATE.join(", ")}. Nothing was saved.`);
    f.state = st;
  }
  if (a.reason != null) f.blocker = clean(a.reason, 200);
  if (f.state === "blocked" && (f.blocker || "").length < 3) fail("A blocked source needs its reason: say what is in the way and who can fix it. Nothing was saved.");
  if (f.state && f.state !== "blocked" && a.reason == null) f.blocker = "";
  if (a.needs_luke != null) f.needsLuke = clean(a.needs_luke, 200);
  if (a.category != null && String(a.category).trim() !== "") {
    const c = CATEGORIES.find((x) => low(x) === low(a.category));
    if (!c) fail(`category must be one of: ${CATEGORIES.join(", ")}.`);
    f.category = c;
  }
  if (a.accounts != null) {
    const acc = (Array.isArray(a.accounts) ? a.accounts : [a.accounts]).map((x) => clean(x, 40)).filter(Boolean);
    if (!acc.length || acc.length > 4) fail("accounts must be 1 to 4 account names, for example [\"PayPal\", \"Wise\"].");
    f.accounts = acc;
  } else if (a.lands != null && clean(a.lands, 40)) f.accounts = [clean(a.lands, 40)];
  /* main + due_day (16 Nov 2026, Luke): the main sources are highlighted on Money every month, green once
     their money has come, red once the day they usually pay by has passed */
  if (a.main != null) f.main = a.main === true || low(a.main) === "true";
  if (a.due_day != null && String(a.due_day).trim() !== "") {
    const n = Number(a.due_day);
    if (!Number.isInteger(n) || n < 1 || n > 31) fail("due_day must be the day of the month it usually pays by, 1 to 31. Nothing was saved.");
    f.dueDay = n;
  }
  if (s.created) { f.created = true; f.name = s.name; if (!f.category) f.category = "Other"; }
  if (!Object.keys(f).length) fail("Nothing to change: give state, reason, accounts, category, needs_luke, main or due_day.");
  noSecrets(JSON.stringify(f));
  const at = new Date(now).toISOString();
  await mutate(store, "srcedit.json", {}, (doc) => {
    const d = doc && typeof doc === "object" && !Array.isArray(doc) ? doc : {};
    d[s.id] = { ...(d[s.id] || {}), ...f, by, at };
    return { replace: d, value: d[s.id] };
  });
  return (await getSources(store)).find((x) => x.id === s.id);
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

/* The picture of the money coming in. entries: this month + last (+ any older passed in). older: the
   months before those (up to UNSORTED_MONTHS in all), read ONLY for "To sort" (unsorted payments and
   the statement each may be).
   -> { month, received:{CUR:n}, pending:{CUR:n}, entries (newest 60), accounts:[...], sources:[...], problems:[...],
        unsorted (newest 40, each with pendingMatch {id, payer, amount, currency, date} when ONE payer's
        pending statement fits it), unsortedCount } */
/* ONE entry per payment (17 Nov 2026, Luke: "money is not double counted ... wise and paypal are only mainly used to
   confirm and check revolut is the main entry"): income counts once, when it lands in Revolut. A received payment
   logged in another of Luke's own accounts (Wise, PayPal: the account sources) is HOLDING: seen, counted nowhere,
   until link_transfer ties it to the Revolut credit that carried it (movedTo). */
export const isMainAccount = (acc) => /revolut/i.test(String(acc || ""));

/* ---------- Expected money (L1) and what a payout route cost (L9), 18 Nov 2026 ----------
   Built on the records already on the desk. A statement (statement only / payable / pending, or one
   later tied with paid_by or turned into the payment that arrived) IS the expected row. Its due date
   comes from the source's due day when Ledger set one on a monthly source, else from the gap between
   earlier statements and the day they landed, else from the day of the month the money usually arrives.
   Nothing here is guessed: too few payments, or pay days too far apart, is "not known" / "not enough".
   Short = the same currency arrived for less than the statement. Late = the due day passed and the
   money has not landed in Revolut. Missing = a monthly source's pay day passed with no statement and
   nothing received. The route cost is sent minus landed, and only when both amounts were recorded in
   the same currency. A different currency is "not enough data": no rate is invented. */
const LEARN_LAG_MIN = 2, LEARN_LAG_SPREAD = 21, LEARN_DAY_MIN = 3, LEARN_DAY_SPREAD = 10, RECENT_LANDED = 62;
const ordinalN = (n) => { const t = n % 100, u = n % 10; return n + (t >= 11 && t <= 13 ? "th" : u === 1 ? "st" : u === 2 ? "nd" : u === 3 ? "rd" : "th"); };
const medianInt = (list) => { const a = list.slice().sort((x, y) => x - y), m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2); };
const monthLen = (ym) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
const clampDay = (ym, dayNum) => ym + "-" + String(Math.min(Math.max(1, dayNum), monthLen(ym))).padStart(2, "0");
const nextYm = (ym) => { const y = Number(ym.slice(0, 4)), n = Number(ym.slice(5, 7)); return n === 12 ? `${y + 1}-01` : `${y}-${String(n + 1).padStart(2, "0")}`; };
const onOrAfter = (from, dayNum) => { const inM = clampDay(from.slice(0, 7), dayNum); return inM >= from ? inM : clampDay(nextYm(from.slice(0, 7)), dayNum); };
const spanDays = (a, b) => { if (!a || !b || !DAY.test(a) || !DAY.test(b)) return null; const n = daysBetween(a, b); return n < 0 ? null : n; };
const normPay = (e) => { if (!e || typeof e !== "object") return null; return e.arrived && e.arrived !== e.date ? { ...e, statement: e.statement || e.date, date: e.arrived } : { ...e }; };
const wasStatement = (e) => !!(e && (OWED.includes(e.status) || e.paidBy || e.statement || (e.history || []).some((h) => OWED.includes(h.from) || OWED.includes(h.to))));
const payerSource = (e, sources) => {
  if (!e) return null;
  if (e.source) { const s = (sources || []).find((x) => x.kind !== "account" && x.id === e.source); if (s) return s; }
  return (sources || []).find((x) => x.kind !== "account" && srcMatches(x, e.payer)) || null;
};
const histDay = (h) => { if (!h || !h.at) return null; const t = Date.parse(h.at); if (Number.isNaN(t)) return null; const d = spDay(t); return DAY.test(d) ? d : null; };
function payableOf(e, statementDate) {
  const hit = (e.history || []).find((h) => h.to === "payable");
  if (hit) { const d = histDay(hit); return d ? { state: "date", date: d } : { state: "not_recorded", date: null }; }
  if (e.status === "payable" || (e.history || []).some((h) => h.from === "payable")) return { state: "date", date: statementDate };
  if (e.status === "statement only") return { state: "not_yet", date: null };
  return { state: "not_recorded", date: null };
}
function moneyEnd(e, byId) {
  const target = e.paidBy ? byId.get(e.paidBy) : null;
  const holder = target || (e.status === "received" ? e : null);
  if (!holder) return { paid: null, landed: null, missingLink: !!(e.paidBy && !target) };
  const paid = { date: holder.date, amount: holder.amount, currency: holder.currency, account: holder.account };
  if (isMainAccount(holder.account)) return { paid, landed: { date: holder.date, amount: holder.amount, currency: holder.currency }, missingLink: false };
  const rev = holder.movedTo ? byId.get(holder.movedTo) : null;
  if (rev && isMainAccount(rev.account)) return { paid, landed: { date: rev.date, amount: rev.amount, currency: rev.currency }, missingLink: false };
  return { paid, landed: null, missingLink: false };
}
const viaOf = (froms) => { const v = []; for (const f of froms) { if (!f || !f.account || isMainAccount(f.account) || STATEMENT.test(f.account)) continue; if (!v.includes(f.account)) v.push(f.account); } return v.sort(); };
const routeSourceName = (occ, sources) => {
  const names = [];
  const add = (e) => { if (!e) return; const s = payerSource(e, sources), name = s ? s.name : e.payer; if (name && !names.includes(name)) names.push(name); };
  add(occ.stmt);
  if (!names.length) for (const f of occ.froms) add(f);
  if (!names.length) add(occ.rev);
  return names.join(" + ") || "Unknown payer";
};
function priceRoute(occ) {
  const rev = occ.rev;
  if (!rev || rev.amount == null || !rev.currency) return { incomplete: true };
  const known = occ.froms.filter(Boolean);
  if (occ.froms.length && known.length !== occ.froms.length) return { incomplete: true };
  const landed = { currency: rev.currency, amount: rev.amount };
  const sumCur = (list) => {
    const by = {};
    for (const f of list) { if (f.amount == null || !f.currency) return null; by[f.currency] = round((by[f.currency] || 0) + f.amount); }
    return Object.keys(by).sort().map((c) => ({ currency: c, amount: by[c] }));
  };
  const sent = occ.stmt && occ.stmt.amount != null && occ.stmt.currency ? [{ currency: occ.stmt.currency, amount: occ.stmt.amount }] : sumCur(known);
  if (!sent || !sent.length) return { incomplete: true };
  if (sent.length === 1 && sent[0].currency === landed.currency) return { incomplete: false, mixed: false, fee: round(sent[0].amount - landed.amount), currency: landed.currency, sent, landed };
  const hop = known.length ? sumCur(known) : null;
  if (hop && hop.length === 1 && hop[0].currency === landed.currency) return { incomplete: false, mixed: true, fee: round(hop[0].amount - landed.amount), currency: landed.currency, sent, landed };
  return { incomplete: false, mixed: true, fee: null, currency: "", sent, landed };
}
function learnDay(list) {
  if (!list || list.length < LEARN_DAY_MIN) return { day: null, payments: list ? list.length : 0, enough: false, why: "not enough payments yet" };
  const s = list.slice().sort((a, b) => a - b);
  if (s[s.length - 1] - s[0] > LEARN_DAY_SPREAD) return { day: null, payments: list.length, enough: false, why: "the pay days are too spread out to name one" };
  return { day: medianInt(list), payments: list.length, enough: true, why: "" };
}
function learnLag(list) {
  if (!list || list.length < LEARN_LAG_MIN) return null;
  const s = list.slice().sort((a, b) => a - b);
  if (s[s.length - 1] - s[0] > LEARN_LAG_SPREAD) return null;
  return { days: medianInt(list), payments: list.length };
}
/* What each payout route cost, from amounts already on the desk. routes: [{ name, source, via, payouts,
   fees, feePayouts, extra, extraPayouts, noFee, mixed, mixedExamples, incomplete }] */
export function routeCosts(entries, sources) {
  const pool = []; const seen = new Set();
  for (const raw of entries || []) { const e = normPay(raw); if (!e || !e.id || seen.has(e.id)) continue; seen.add(e.id); pool.push(e); }
  const byId = new Map(pool.map((e) => [e.id, e]));
  const occs = []; const seenRev = new Set();
  const push = (rev, froms, stmt) => { if (!rev || seenRev.has(rev.id)) { const o = occs.find((x) => rev && x.rev.id === rev.id); if (o && stmt && !o.stmt) o.stmt = stmt; return; } seenRev.add(rev.id); occs.push({ rev, froms, stmt, via: viaOf(froms) }); };
  for (const rev of pool) {
    if (!isMainAccount(rev.account) || !Array.isArray(rev.from) || !rev.from.length) continue;
    const froms = rev.from.map((id) => byId.get(id) || null);
    const ids = new Set(rev.from);
    const linked = pool.find((e) => wasStatement(e) && e.paidBy && (ids.has(e.paidBy) || e.paidBy === rev.id) && !ids.has(e.id));
    push(rev, froms, linked || froms.find((f) => f && wasStatement(f)) || null);
  }
  for (const e of pool) {
    if (!wasStatement(e) || !e.paidBy) continue;
    const target = byId.get(e.paidBy);
    if (!target) continue;
    if (isMainAccount(target.account)) push(target, [], e);
    else if (target.movedTo && byId.get(target.movedTo) && isMainAccount(byId.get(target.movedTo).account)) push(byId.get(target.movedTo), [target], e);
  }
  for (const e of pool) {
    if (!wasStatement(e) || e.paidBy || !e.movedTo) continue;
    const rev = byId.get(e.movedTo);
    if (rev && isMainAccount(rev.account)) push(rev, [e], e);
  }
  const groups = new Map();
  for (const occ of occs) {
    const source = routeSourceName(occ, sources), via = occ.via, key = source + "|" + via.join("+");
    const g = groups.get(key) || { name: via.length ? `${source} via ${via.join(" and ")} into Revolut` : `${source} into Revolut`, source, via, payouts: 0, fees: {}, feePayouts: 0, extra: {}, extraPayouts: 0, noFee: 0, mixed: 0, mixedExamples: [], incomplete: 0 };
    g.payouts++;
    const p = priceRoute(occ);
    if (p.incomplete) g.incomplete++;
    else {
      if (p.mixed) { g.mixed++; if (g.mixedExamples.length < 3) g.mixedExamples.push({ sent: p.sent, landed: p.landed }); }
      if (p.fee > 0) { g.fees[p.currency] = round((g.fees[p.currency] || 0) + p.fee); g.feePayouts++; }
      else if (p.fee < 0) { g.extra[p.currency] = round((g.extra[p.currency] || 0) + (-p.fee)); g.extraPayouts++; }
      else if (p.fee === 0) g.noFee++;
    }
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
}
const moneyBits = (o) => Object.keys(o || {}).sort().map((c) => `${c} ${Number(o[c]).toFixed(2)}`);
const sentBits = (parts) => (parts || []).map((p) => `${p.currency} ${Number(p.amount).toFixed(2)}`).join(" + ");
/* One sentence for the bots. Same-currency gaps are fees. A currency change is "not enough data". */
export function routeCostText(r) {
  if (!r || !r.payouts) return "Not enough data.";
  const bits = [];
  const fees = moneyBits(r.fees);
  if (fees.length) bits.push(`Fees: ${fees.join(" + ")} on ${r.feePayouts} payout${r.feePayouts === 1 ? "" : "s"}`);
  const extra = moneyBits(r.extra);
  if (extra.length) bits.push(`Landed ${extra.join(" + ")} more than was sent. No fee to show`);
  if (r.noFee && !fees.length && !extra.length && !r.mixed) bits.push("No fee on the amounts recorded");
  if (r.mixed) {
    for (const m of r.mixedExamples || []) bits.push(`${sentBits(m.sent)} sent, ${m.landed.currency} ${Number(m.landed.amount).toFixed(2)} landed`);
    bits.push("Exchange: not enough data");
  }
  if (!bits.length) bits.push("Not enough data");
  return bits.join(". ") + ".";
}
export function routeSummary(routes) {
  if (!routes || !routes.length) return "Not enough data yet. Tie what was sent to what landed in Revolut, then income_status shows the cost. Do not guess a rate.";
  const thin = routes.filter((r) => r.mixed || (r.incomplete && !Object.keys(r.fees || {}).length)).length;
  return `${routes.length} payout route${routes.length === 1 ? "" : "s"}` + (thin ? `, ${thin} with not enough data for the exchange` : "") + ". Read payout_routes in income_status. Do not guess a rate.";
}
/* expected: { rows, missing, learned, summary }. Every figure comes from a recorded amount or date. */
export function moneyExpectations(entries, sources, today) {
  const pool = []; const seen = new Set();
  for (const raw of entries || []) { const e = normPay(raw); if (!e || !e.id || seen.has(e.id)) continue; seen.add(e.id); pool.push(e); }
  const byId = new Map(pool.map((e) => [e.id, e]));
  const arrivals = new Map(), lagLists = new Map();
  const journeys = [];
  for (const e of pool) {
    if (e.status === "received" && !e.from && DAY.test(e.date || "")) {
      const s = payerSource(e, sources);
      if (s) { const a = arrivals.get(s.id) || []; a.push(Number(e.date.slice(8, 10))); arrivals.set(s.id, a); }
    }
    if (!wasStatement(e)) continue;
    const statementDate = DAY.test(e.statement || "") ? e.statement : (DAY.test(e.date || "") ? e.date : "");
    if (!statementDate) continue;
    const end = moneyEnd(e, byId);
    journeys.push({ e, statementDate, payable: payableOf(e, statementDate), ...end });
    if (end.landed && DAY.test(end.landed.date)) {
      const gap = daysBetween(statementDate, end.landed.date);
      const s = payerSource(e, sources);
      if (s && gap >= 0) { const a = lagLists.get(s.id) || []; a.push(gap); lagLists.set(s.id, a); }
    }
  }
  const learnedDay = new Map(), learned = [];
  for (const s of sources || []) {
    if (!s || s.kind === "account") continue;
    const days = arrivals.get(s.id);
    if (!days) continue;
    const got = learnDay(days);
    learnedDay.set(s.id, got);
    learned.push({ sourceId: s.id, source: s.name, day: got.day, payments: got.payments, enough: got.enough, ...(got.why ? { why: got.why } : {}) });
  }
  const learnedLag = new Map();
  for (const [id, list] of lagLists) { const g = learnLag(list); if (g) learnedLag.set(id, g); }
  const rows = [];
  for (const j of journeys) {
    const e = j.e, src = payerSource(e, sources);
    const monthlyDue = src && Number.isInteger(src.dueDay) && (src.cadence || "monthly") === "monthly" ? src.dueDay : null;
    const lag = src ? learnedLag.get(src.id) : null;
    const dayL = src ? learnedDay.get(src.id) : null;
    let due = null, dueFrom = "", dueNote = "";
    if (monthlyDue) {
      due = onOrAfter(j.statementDate, monthlyDue); dueFrom = "set";
      dueNote = `the day this source pays by (the ${ordinalN(monthlyDue)})`;
      if (lag && Math.abs(lag.days - daysBetween(j.statementDate, due)) > 7) dueNote += `. Earlier payments landed about ${lag.days} days after the statement`;
    } else if (lag) { due = addDays(j.statementDate, lag.days); dueFrom = "lag"; dueNote = `about ${lag.days} days after the statement, from ${lag.payments} earlier payments`; }
    else if (dayL && dayL.day) { due = onOrAfter(j.statementDate, dayL.day); dueFrom = "day"; dueNote = `usually around the ${ordinalN(dayL.day)}, from ${dayL.payments} payments`; }
    /* short only when a different recorded amount, in the same currency, is below the statement */
    const other = j.landed && j.landed.currency === e.currency ? j.landed : (j.paid && j.paid.currency === e.currency && j.paid.amount !== e.amount ? j.paid : null);
    const gap = other ? round(e.amount - other.amount) : 0;
    const shortBy = gap > 0 ? { amount: gap, currency: e.currency } : null;
    const flags = [];
    if (!j.landed && due && due < today) flags.push("late");
    if (shortBy) flags.push("short");
    const age = j.landed && DAY.test(j.landed.date) ? daysBetween(j.landed.date, today) : null;
    if (j.landed && !shortBy && age != null && age > RECENT_LANDED) continue;
    const payableDate = j.payable.state === "date" ? j.payable.date : null;
    rows.push({
      id: e.id, payer: e.payer, source: src ? src.name : "", sourceId: src ? src.id : "", amount: e.amount, currency: e.currency, status: e.status,
      due, dueFrom, dueNote, flags, shortBy, open: !j.landed, missingLink: j.missingLink,
      statement: { date: j.statementDate, amount: e.amount, currency: e.currency },
      payable: payableDate, payableState: j.payable.state,
      paid: j.paid, landed: j.landed,
      days: { payable: spanDays(j.statementDate, payableDate), paid: spanDays(payableDate, j.paid && j.paid.date), landed: spanDays(j.paid && j.paid.date, j.landed && j.landed.date) },
      landedAfter: j.landed && due && j.landed.date > due ? daysBetween(due, j.landed.date) : null,
    });
  }
  const rank = (r) => (r.flags.includes("late") ? 0 : r.flags.includes("short") ? 1 : r.open ? 2 : 3);
  rows.sort((a, b) => rank(a) - rank(b) || ((a.due || "9") < (b.due || "9") ? -1 : (a.due || "9") > (b.due || "9") ? 1 : 0) || (a.statement.date < b.statement.date ? -1 : 1));
  const shown = rows.slice(0, 40);
  const missing = [];
  for (const s of sources || []) {
    if (!s || s.kind === "account" || s.cadence !== "monthly" || s.state === "not_tracked" || s.state === "blocked") continue;
    const dayN = Number.isInteger(s.dueDay) ? s.dueDay : (learnedDay.get(s.id) && learnedDay.get(s.id).day);
    if (!dayN) continue;
    const due = clampDay(today.slice(0, 7), dayN);
    if (due >= today) continue;
    const month = today.slice(0, 7);
    const hit = pool.some((e) => {
      const ps = payerSource(e, sources);
      if (!ps || ps.id !== s.id || e.status === "transfer" || e.status === "unsorted" || (Array.isArray(e.from) && e.from.length)) return false;
      if (wasStatement(e) && OWED.includes(e.status) && !e.paidBy) return true;
      if (e.status === "received" && !e.movedTo && String(e.date).slice(0, 7) === month) return true;
      if (wasStatement(e) && String(e.statement || e.date).slice(0, 7) === month) return true;
      return false;
    });
    if (hit) continue;
    missing.push({ sourceId: s.id, source: s.name, due, dueDay: dayN, why: `No statement and nothing received. It usually pays by the ${ordinalN(dayN)}.` });
  }
  missing.sort((a, b) => (a.source < b.source ? -1 : 1));
  const summary = { late: shown.filter((r) => r.flags.includes("late")).length, short: shown.filter((r) => r.flags.includes("short")).length, missing: missing.length, text: "" };
  const parts = [];
  if (summary.late) parts.push(`${summary.late} late`);
  if (summary.short) parts.push(`${summary.short} short`);
  if (summary.missing) parts.push(`${summary.missing} missing`);
  summary.text = parts.length ? parts.join(", ") : "nothing to flag";
  return { expected: { rows: shown, missing, learned, summary }, routes: routeCosts(pool, sources) };
}

export function holdingOf(sources) {
  const own = (sources || []).filter((s) => s.kind === "account" && !isMainAccount(s.name));
  return (e) => !!e && e.status === "received" && !e.movedTo && !isMainAccount(e.account) && own.some((s) => srcMatches(s, e.account));
}
export function incomeReport(entries, checks, sources, today, older = []) {
  const isHold = holdingOf(sources);
  const month = today.slice(0, 7);
  const add = (o, cur, a) => { o[cur] = round((o[cur] || 0) + a); };
  const received = {}, pending = {}, byCat = {}, payable = {}, statementOnly = {}, royaltiesOnly = {}, pendingOnly = {}, holding = {};
  /* a payment counts on the day it arrived (a pending statement that later landed keeps both dates) */
  entries = entries.map((e) => (e.arrived && e.arrived !== e.date ? { ...e, statement: e.date, date: e.arrived } : e));
  /* round 2: one payment logged twice under two names of its payer (before the desk knew they were one)
     counts once. Kept: a decided status before an unsorted one, else the first logged. */
  const twice = [];
  { const RANK = { received: 0, payable: 1, pending: 2, "statement only": 3, transfer: 4, unsorted: 5 }, kept = [];
    const order = [...entries].sort((a, b) => (RANK[a.status] ?? 6) - (RANK[b.status] ?? 6) || ((a.at || "") < (b.at || "") ? -1 : (a.at || "") > (b.at || "") ? 1 : 0));
    for (const e of order) { const k = kept.find((x) => samePayment(x, e)); if (k) twice.push([k, e]); else kept.push(e); }
    if (twice.length) entries = entries.filter((e) => kept.includes(e)); }
  for (const e of entries) {
    if (e.date.slice(0, 7) !== month || e.status === "transfer" || e.status === "unsorted") continue;
    if (e.paidBy && OWED.includes(e.status)) continue; /* a statement settled by a received payment counts nowhere */
    if (e.movedTo) continue; /* moved on to Revolut: the Revolut payment is the one that counts */
    if (isHold(e)) { add(holding, e.currency, e.amount); continue; } /* still in Wise / PayPal: seen, not counted */
    /* batch 4: a statement under the payout line counts nowhere yet; payable is owed (with pending) */
    if (e.status === "statement only") { add(statementOnly, e.currency, e.amount); continue; }
    add(e.status === "pending" || e.status === "payable" ? pending : received, e.currency, e.amount);
    if (e.status === "payable") add(payable, e.currency, e.amount);
    if (e.status === "pending") add(pendingOnly, e.currency, e.amount); /* pending without the payable (round 3) */
    if (e.status === "received") add(byCat[e.category] || (byCat[e.category] = {}), e.currency, e.amount);
    /* the music's own money (16 Nov 2026, Ledger: a production buyout is not a royalty): self-releases, label deals, publishing */
    if (e.status === "received" && ROYALTY_CATS.includes(e.category)) add(royaltiesOnly, e.currency, e.amount);
  }
  const lastCheck = {};
  for (const c of checks) { const k = low(c.account); if (!lastCheck[k] || c.at > lastCheck[k].at) lastCheck[k] = c; }
  const list = sources.map((s) => {
    /* a payment tied to a source counts for that source only; the payer's name decides only when it is tied to none
       (17 Nov 2026: a payment tied to CREATE still showed under the payout service its payer is named after) */
    const mine = entries.filter((e) => (s.kind === "account" ? low(e.account) === low(s.name) || srcMatches(s, e.account) : e.source ? low(e.source) === s.id : srcMatches(s, e.payer)));
    const last = mine.reduce((a, e) => (!a || e.date > a.date ? e : a), null);
    const chk = s.kind === "account" ? lastCheck[low(s.name)] || Object.values(lastCheck).find((c) => srcMatches(s, c.account)) || null : null;
    const lastLogged = mine.reduce((a, e) => (!a || e.at > a ? e.at : a), null); /* the last time anything was logged for it, as a São Paulo day */
    const lastLook = [lastLogged && spDay(Date.parse(lastLogged)), chk && chk.day].filter(Boolean).sort().pop() || null;
    const monthTotal = {};
    for (const e of mine) if (e.date.slice(0, 7) === month && e.status !== "transfer" && e.status !== "unsorted" && e.status !== "statement only" && !e.movedTo && !isHold(e) && !(e.paidBy && OWED.includes(e.status))) add(monthTotal, e.currency, e.amount);
    /* this month, received only (16 Nov 2026, Luke): received = green; a MONTHLY source past the day it usually
       pays by with nothing = late (red); otherwise waiting (not highlighted, as every month starts) */
    const got = mine.filter((e) => e.status === "received" && e.date.slice(0, 7) === month && !e.movedTo && !isHold(e));
    const gotAmt = {};
    for (const e of got) add(gotAmt, e.currency, e.amount);
    const dueDay = Number.isInteger(s.dueDay) ? s.dueDay : null;
    const thisMonth = s.kind === "account" ? null : { state: got.length ? "received" : dueDay && (s.cadence || "monthly") === "monthly" && Number(today.slice(8, 10)) > dueDay ? "late" : "waiting",
      amount: got.length ? gotAmt : null, date: got.length ? got.map((e) => e.date).sort().pop() : null, dueDay };
    let verdict = "ok", why = "";
    if (s.state === "not_tracked") { verdict = "not_tracked"; why = "Nobody is logging this yet"; }
    else if (s.state === "blocked") { verdict = "blocked"; why = s.blocker || "Blocked"; }
    else if (s.kind === "account") {
      if (!lastLook) { verdict = "never"; why = "Never checked through the connector"; }
      else if (lastLook < today) { verdict = daysBetween(lastLook, today) > 1 ? "overdue" : "due"; why = `Last checked ${lastLook}`; }
    } else if (!last) { verdict = s.cadence === "irregular" ? "quiet" : "never"; why = "No payment logged yet"; }
    else if (DUE_DAYS[s.cadence] && daysBetween(last.date, today) > DUE_DAYS[s.cadence]) { verdict = "overdue"; why = `Last payment ${last.date}; expected ${s.cadence}`; }
    /* round 2 (Luke: "hq should show the second routenote account"): a source paid into several accounts
       shows each one, with its last payment (the seed's accounts first, then any other seen on a payment) */
    const accts = [...(s.kind !== "account" && Array.isArray(s.accounts) ? s.accounts : [])];
    if (accts.length) for (const e of mine) if (e.account && !STATEMENT.test(e.account) && !accts.some((a) => payerName(a) === payerName(e.account))) accts.push(e.account);
    const byAccount = accts.length > 1 ? accts.map((acc) => {
      const l = mine.filter((e) => payerName(e.account) === payerName(acc) && e.status !== "transfer" && e.status !== "unsorted").reduce((a, e) => (!a || e.date > a.date ? e : a), null);
      return { account: acc, last: l ? { date: l.date, amount: l.amount, currency: l.currency, status: l.status } : null };
    }) : null;
    return { id: s.id, name: s.name, kind: s.kind, category: s.category, currency: s.currency, lands: s.lands, ...(s.accounts ? { accounts: s.accounts } : {}), ...(byAccount ? { byAccount } : {}), ...(s.editedBy ? { editedBy: s.editedBy, editedAt: s.editedAt } : {}),
      cadence: s.cadence, owner: s.owner, how: s.how, state: s.state, ...(s.main ? { main: true } : {}), ...(thisMonth ? { thisMonth } : {}),
      blocker: s.blocker, needsLuke: s.needsLuke, last: last ? { date: last.date, amount: last.amount, currency: last.currency, status: last.status } : null,
      checked: chk ? { day: chk.day, by: chk.by, new: chk.new } : null, lastLook, monthTotal, verdict, why };
  });
  /* payments whose payer matches no known source: a new source nobody has named yet */
  const payers = sources.filter((s) => s.kind !== "account");
  /* Luke's own money accounts (PayPal, Wise…: the account sources) are never a "new payer" (16 Nov 2026) */
  const ownAccts = sources.filter((s) => s.kind === "account");
  const unknown = [...new Set(entries.filter((e) => e.status !== "transfer" && e.status !== "unsorted" && !payers.some((s) => low(e.source) === s.id || srcMatches(s, e.payer)) && !ownAccts.some((s) => srcMatches(s, e.payer))).map((e) => e.payer))].slice(0, 20);
  const accounts = list.filter((s) => s.kind === "account"), src = list.filter((s) => s.kind !== "account");
  const problems = [];
  for (const a of accounts) if (["never", "overdue", "due"].includes(a.verdict)) problems.push(`${a.name}: not checked today${a.owner ? " (" + a.owner + ")" : ""}`);
  for (const s of src) if (s.verdict === "overdue") problems.push(`${s.name}: ${s.why}`);
  for (const s of list) if (s.verdict === "blocked") problems.push(`${s.name}: blocked. ${s.blocker}`.trim());
  if (unknown.length) problems.push(`New payer(s) not on the list of sources: ${unknown.join(", ")}`);
  if (twice.length) problems.push(`${twice.length === 1 ? "1 payment was" : twice.length + " payments were"} logged twice under two payer names, counted once: ${twice.slice(0, 5).map(([k, e]) => `${k.payer} = ${e.payer} (${e.currency} ${e.amount}, ${e.date})`).join("; ")}`);
  const oldPending = entries.filter((e) => (e.status === "pending" || e.status === "payable") && !e.paidBy && daysBetween(e.date, today) > 30).length;
  if (oldPending) problems.push(`${oldPending} pending payment${oldPending === 1 ? "" : "s"} older than 30 days`);
  /* seen in an account (the bank reader), not yet said what it is: listed apart, in no total */
  const pool = entries.concat(older || []);
  const unsorted = pool.filter((e) => e.status === "unsorted").sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.at < b.at ? 1 : -1));
  if (unsorted.length) problems.push(`${unsorted.length} payment${unsorted.length === 1 ? "" : "s"} in ${[...new Set(unsorted.map((e) => e.account))].join(" and ")} that nobody has sorted yet`);
  /* the oldest month "To sort" reads: what is still unsorted there drops off the list when this month ends */
  const edge = monthsBack(month, UNSORTED_MONTHS).pop(), leaving = unsorted.filter((e) => e.date.slice(0, 7) <= edge).length;
  if (leaving) problems.push(`${leaving} unsorted payment${leaving === 1 ? "" : "s"} from ${MONTH[Number(edge.slice(5, 7)) - 1]} ${edge.slice(0, 4)} drop${leaving === 1 ? "s" : ""} off "To sort" when this month ends: sort ${leaving === 1 ? "it" : "them"} before then`);
  /* the money of a statement logged as pending? Offered only when every statement that fits is the same payer's (the oldest is taken, as the bank reader does) */
  const pend = pool.filter((p) => OWED.includes(p.status) && !p.paidBy);
  const withMatch = (e) => {
    const fit = pend.filter((p) => pendingFits(p, e)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (!fit.length || new Set(fit.map((p) => low(p.payer))).size > 1) return e;
    const p = fit[0];
    return { ...e, pendingMatch: { id: p.id, payer: p.payer, amount: p.amount, currency: p.currency, date: p.date } };
  };
  /* this year, received only, per currency (round 3, Sheet: to check against the ledger), every month read */
  const receivedYear = {}, yr = today.slice(0, 4), seenY = [];
  for (const e of entries.concat((older || []).map((x) => (x.arrived && x.arrived !== x.date ? { ...x, date: x.arrived } : x)))) {
    if (e.status !== "received" || e.movedTo || isHold(e) || e.date.slice(0, 4) !== yr || seenY.some((x) => samePayment(x, e))) continue;
    seenY.push(e); add(receivedYear, e.currency, e.amount);
  }
  /* received per month, every month read (12), each payment once: "this month and the ones before" */
  const receivedByMonth = {}, seenM = [];
  for (const e of entries.concat((older || []).map((x) => (x.arrived && x.arrived !== x.date ? { ...x, date: x.arrived } : x)))) {
    if (e.status !== "received" || e.movedTo || isHold(e) || seenM.some((x) => samePayment(x, e))) continue;
    seenM.push(e); add(receivedByMonth[e.date.slice(0, 7)] || (receivedByMonth[e.date.slice(0, 7)] = {}), e.currency, e.amount);
  }
  const duplicates = twice.map(([k, e]) => ({ kept: k.payer, also: e.payer, amount: e.amount, currency: e.currency, date: e.date, id: e.id }));
  const seenId = new Set(entries.map((e) => e && e.id));
  const money = moneyExpectations(entries.concat((older || []).filter((e) => e && !seenId.has(e.id))), sources, today);
  return { month, received, pending, payable, statementOnly, royaltiesOnly, pendingOnly, receivedYear, receivedByMonth, duplicates, byCategory: byCat, count: entries.filter((e) => e.date.slice(0, 7) === month).length, unsorted: unsorted.slice(0, 40).map(withMatch), unsortedCount: unsorted.length,
    expected: money.expected, routes: money.routes,
    entries: [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.at < b.at ? 1 : -1)).slice(0, 60).map((e) => (isHold(e) ? { ...e, holding: true } : e)),
    holding, holdingList: entries.concat(older || []).filter(isHold).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40),
    accounts, sources: src, unknown, problems,
    lastEntryAt: entries.reduce((a, e) => (!a || e.at > a ? e.at : a), null) };
}
export async function incomeState(store, now) {
  /* this month and the three before for the totals, the sources and the list; a year for "To sort" */
  const today = spDay(now), months = monthsBack(today.slice(0, 7), UNSORTED_MONTHS);
  const [inc, chk, sources] = await Promise.all([
    Promise.all(months.map((k) => readDoc(store, incKey(k), []))), Promise.all(months.slice(0, 2).map((k) => readDoc(store, chkKey(k), []))), getSources(store)]);
  const flat = (docs) => docs.flatMap((d) => (Array.isArray(d.data) ? d.data : []));
  return incomeReport(flat(inc.slice(0, 4)), flat(chk), sources, today, flat(inc.slice(4)));
}

/* ---------- batch 4 (15 Nov 2026): ad spend and growth numbers the bots log on the desk ----------
   The site can't write the team's sheets; these rows live on the desk and HQ reads them WITH the sheet's
   (hq.mjs mergeDeskSpend / mergeDeskGrowth): a desk row replaces the sheet's for the same platform and day
   (spend), or fills the numbers the sheet's row lacks (growth). */
export const SPEND_PLATFORMS = ["Meta", "Google", "TikTok"];
export const SPENDERS = ["Forge", "Nova", "Claude", "Luke", "HQ"]; /* HQ: Meta's own numbers (B3, 17 Nov 2026) */
const spendKey = (month) => `spend/${month}.json`;
export async function recordSpend(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  if (!SPENDERS.includes(by)) fail("Ad spend is Forge's to record (Nova may do it for him). Tell Forge.", "not_allowed");
  const platform = SPEND_PLATFORMS.find((p) => low(p) === low(a.platform));
  if (!platform) fail("platform must be Meta, Google or TikTok.");
  const account = clean(a.account, 60) || platform;
  const date = clean(a.date, 10), today = spDay(now);
  if (!isDay(date)) fail("date must be the day the money was spent, YYYY-MM-DD.");
  if (date > today) fail("date is in the future.");
  const has = a.amount != null && String(a.amount).trim() !== "";
  const notRead = clean(a.not_read, 120);
  let amount = null, currency = "";
  if (has) {
    amount = amountOf(a.amount);
    if (amount == null || amount < 0) fail('amount must be a number, written like 112.01 (a point for the cents, no thousands separator). 0 for a day with no ads. If you could not read it, send not_read with the reason instead.');
    currency = clean(a.currency, 12).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) fail("currency must be the three-letter code the account is billed in (USD, EUR...). Never convert.");
  } else if (notRead.length < 3) fail("Give amount or not_read: the amount with its currency, or why the number could not be read.");
  noSecrets(account, notRead);
  const at = new Date(now).toISOString();
  return mutate(store, spendKey(date.slice(0, 7)), [], (list) => {
    const old = list.find((x) => x.platform === platform && low(x.account) === low(account) && x.date === date);
    if (old) {
      if (!has) return { skip: true, value: { entry: old, added: false, updated: false, duplicate: true } }; /* a number already there stays */
      if (old.amount === amount && old.currency === currency) return { skip: true, value: { entry: old, added: false, updated: false, duplicate: true } };
      if (old.amount != null) old.was = old.amount;
      Object.assign(old, { amount, currency, notRead: "", by, at });
      return { value: { entry: old, added: false, updated: true, duplicate: false } };
    }
    if (list.length >= 500) fail("This month's spend list is full. Tell Claude.", "limit");
    const e = { id: newId("s", now), platform, account, date, amount, currency, notRead: has ? "" : notRead, by, at };
    list.push(e);
    return { value: { entry: e, added: true, updated: false, duplicate: false } };
  });
}
/* B3 (17 Nov 2026, Forge): Meta's own daily spend on the desk, recorded by HQ from the read-only Meta key (the
   hourly job), so Forge records only Google and TikTok. rows = account-level insight rows {day, spend, currency};
   every finished day from since to until gets ONE Meta row (a day Meta lists nothing for = 0). A day where Forge
   already has ONE Meta row: that row is updated (its account kept, the old amount kept as was); a day with two or
   more Meta rows is left alone (a person split it on purpose). No rows at all: the currency is unknown, nothing is
   written. -> {added, updated, skipped} */
export async function recordMetaSpend(store, now, roster, rows, { since, until }) {
  const out = { added: 0, updated: 0, skipped: 0 };
  const list = Array.isArray(rows) ? rows : [];
  const currency = (list.find((r) => r && r.currency) || {}).currency || "";
  if (!/^[A-Z]{3}$/.test(currency) || !isDay(since) || !isDay(until)) return out;
  const byDay = {};
  for (const r of list) if (r && isDay(r.day)) byDay[r.day] = round((byDay[r.day] || 0) + (Number(r.spend) || 0));
  const have = await Promise.all([since.slice(0, 7), until.slice(0, 7)].filter((m, i, a) => a.indexOf(m) === i).map((m) => readDoc(store, spendKey(m), [])));
  const desk = have.flatMap((d) => (Array.isArray(d.data) ? d.data : [])).filter((x) => x.platform === "Meta");
  for (let d = since; d <= until && d < spDay(now); d = addDays(d, 1)) {
    const mine = desk.filter((x) => x.date === d);
    if (mine.length > 1) { out.skipped++; continue; }
    const r = await recordSpend(store, now, roster, { by: "HQ", platform: "Meta", account: mine.length ? mine[0].account : "Meta", date: d, amount: (byDay[d] || 0).toFixed(2), currency });
    if (r.added) out.added++; else if (r.updated) out.updated++; else out.skipped++;
  }
  return out;
}
/* this month's and last month's spend rows (the cap's month and the one before) */
export async function listSpend(store, now) {
  const m = spDay(now).slice(0, 7);
  const docs = await Promise.all([m, prevMonth(m)].map((k) => readDoc(store, spendKey(k), [])));
  return docs.flatMap((d) => (Array.isArray(d.data) ? d.data : []));
}

export const GROWERS = ["Steve", "Atlas", "Kevin", "Laura", "Nova", "Claude", "HQ"]; /* HQ: the Instagram reader (B4, 17 Nov 2026) */
/* A8 (17 Nov 2026, Atlas): monthly_listeners and brazil_listeners are the artist's Spotify numbers: platform Spotify */
const GROWTH_NUM = ["followers", "views", "channel_views", "shorts_views", "monthly_listeners", "brazil_listeners"], SONG_NUM = ["streams", "listeners", "saves", "playlist_adds"];
const growKey = (month) => `grow/${month}.json`;
/* a count: "1240" or "1,240" (never "about 1k", never a guess) */
function countOf(v, name) {
  const t = String(v).trim().replace(/\s/g, "");
  if (!/^(\d{1,3}(,\d{3})+|\d+)$/.test(t)) fail(`${name} must be a number as shown (for example 1240 or 1,240), never an estimate. If you could not read it, leave it out and name it in gaps.`);
  return Number(t.replace(/,/g, ""));
}
const fmtN = (n) => Number(n).toLocaleString("en-US");
const shortDay = (d) => `${Number(d.slice(8, 10))} ${MONTH[Number(d.slice(5, 7)) - 1]}`;
export async function listGrowth(store, now, months = 2) {
  let m = spDay(now).slice(0, 7);
  const keys = [];
  for (let i = 0; i < months; i++) { keys.push(growKey(m)); m = prevMonth(m); }
  const docs = await Promise.all(keys.map((k) => readDoc(store, k, [])));
  return docs.flatMap((d) => (Array.isArray(d.data) ? d.data : []));
}
/* One call: the day's Growth (platform) or Songs (song) numbers. The change in followers is worked out
   against the last reading before that day (the desk's, or a.prev from the sheet when it is later); the
   same numbers again are skipped; a later call fills what was missing; the duty is marked done (with its
   gaps) through post_update. a.gaps: {field: why} for numbers that could not be read. */
export async function logGrowth(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  if (!GROWERS.includes(by)) fail("Growth and song numbers are logged by Steve, Atlas, Kevin or Laura (or Nova for them).", "not_allowed");
  const date = clean(a.date, 10), today = spDay(now);
  if (!isDay(date)) fail("date must be the day the numbers are for, YYYY-MM-DD.");
  if (date > today) fail("date is in the future.");
  const platform = clean(a.platform, 40), song = clean(a.song, 120);
  if (!!platform === !!song) fail("Give platform OR song: platform for followers and views (Growth), song for its Spotify numbers (Songs).");
  const kind = song ? "song" : "growth", names = song ? SONG_NUM : GROWTH_NUM;
  const vals = {};
  for (const n of names) if (a[n] != null && String(a[n]).trim() !== "") vals[n] = countOf(a[n], n);
  const extra = {};
  if (!song) {
    if (a.best_post != null && clean(a.best_post, 200)) extra.best_post = clean(a.best_post, 200);
    if (a.best_post_link != null && String(a.best_post_link).trim()) { const l = httpsLink(clean(a.best_post_link, 400)); if (!l) fail("best_post_link must start with https://"); extra.best_post_link = l; }
  }
  const gin = a.gaps == null ? {} : typeof a.gaps === "string" ? { note: a.gaps } : a.gaps;
  if (typeof gin !== "object" || Array.isArray(gin)) fail('gaps must be {"views": "why it could not be read"}.');
  const gaps = {};
  for (const [k, v] of Object.entries(gin)) { const w = clean(v, 160); if (w) gaps[clean(k, 30)] = w; }
  if (!Object.keys(vals).length && !Object.keys(extra).length) fail(`There are no numbers in this call. Send at least one of: ${names.join(", ")}.`);
  const account = clean(a.account, 60);
  noSecrets(platform, song, account, JSON.stringify(gaps), extra.best_post || "");
  const key = song ? "s:" + songKey(song) : "g:" + low(platform);
  const at = new Date(now).toISOString();
  const earlier = (await listGrowth(store, now, 3)).filter((x) => x.key === key && x.date < date && x.followers != null).sort((x, y) => (x.date < y.date ? 1 : -1))[0];
  const prevF = a.prev && isDay(a.prev.date) && a.prev.date < date && (!earlier || a.prev.date > earlier.date) && a.prev.followers != null ? a.prev.followers : earlier ? earlier.followers : null;
  const res = await mutate(store, growKey(date.slice(0, 7)), [], (list) => {
    const old = list.find((x) => x.key === key && x.date === date);
    if (old) {
      const filled = [], replaced = [];
      for (const [k, v] of Object.entries({ ...vals, ...extra })) {
        if (old[k] == null || old[k] === "") { old[k] = v; filled.push(k); delete (old.gaps || {})[k]; }
        else if (old[k] !== v) { (old.was || (old.was = {}))[k] = old[k]; old[k] = v; replaced.push(k); }
      }
      for (const [k, w] of Object.entries(gaps)) if (old[k] == null) (old.gaps || (old.gaps = {}))[k] = w;
      if (!filled.length && !replaced.length) return { skip: true, value: { row: old, duplicate: true, filled, replaced } };
      if (!song && (filled.includes("followers") || replaced.includes("followers"))) old.change = prevF != null ? old.followers - prevF : null;
      old.updatedAt = at; old.by = by;
      return { value: { row: old, duplicate: false, filled, replaced } };
    }
    if (list.length >= 2000) fail("This month's growth list is full. Tell Claude.", "limit");
    const row = { id: newId("g", now), key, kind, date, ...(song ? { song } : { platform, account }), ...Object.fromEntries(names.map((n) => [n, vals[n] ?? null])), ...extra,
      ...(song ? {} : { change: vals.followers != null && prevF != null ? vals.followers - prevF : null }), gaps, by, at };
    list.push(row);
    return { value: { row, duplicate: false, filled: [], replaced: [], added: true } };
  });
  /* round 3 (16 Nov 2026): the change is ALWAYS the day before's saved total, whatever order the days came
     in (Atlas sent 13 Nov before 12 Nov and both read +13). Every call puts the whole run right, so sending a
     day again corrects a change saved wrong before. */
  const corrected = song ? [] : await restitch(store, now, key);
  const mine = corrected.find((c) => c.date === date);
  if (mine && res.row) res.row.change = mine.to;
  if (res.duplicate) return corrected.length ? { ...res, corrected } : res;
  /* HQ's own rows (the Instagram reader) mark no duty: the bot whose duty it is still says it did it */
  if (by === "HQ") return { ...res, duty: null, ...(corrected.length ? { corrected } : {}) };
  /* the duty: done (with its gaps), through the same live log as post_update */
  const r = res.row, words = [];
  if (!song && r.followers != null && (res.added || res.filled.includes("followers") || res.replaced.includes("followers"))) words.push(`${fmtN(r.followers)} followers` + (r.change != null ? ` (${r.change >= 0 ? "+" : ""}${fmtN(r.change)})` : ""));
  for (const n of names) if (n !== "followers" && r[n] != null && (res.added || res.filled.includes(n) || res.replaced.includes(n))) words.push(`${n.replace("_", " ")} ${fmtN(r[n])}`);
  const gapText = Object.entries(r.gaps || {}).map(([k, w]) => `${k}: ${w}`).join("; ");
  const msg = `${song || platform} ${shortDay(date)}: ${words.join(", ") || "numbers filled in"}` + (res.added ? "" : " (filled in)");
  let duty = null;
  try { await postUpdate(store, now, roster, { bot: by, status: "done", message: msg, duty: a.duty, gaps: gapText }); duty = gapText ? "done, with gaps" : "done"; } catch { duty = "not marked: the live log is full"; }
  return { ...res, duty, gapText, ...(corrected.length ? { corrected } : {}) };
}
/* every growth row of one platform in the last 3 months, in day order: change = followers minus the
   last saved total before it (null when there is none, unless the row came with its own and has no
   saved day before it). Writes only the month files whose rows changed. -> [{date, from, to}] */
async function restitch(store, now, key) {
  const rows = (await listGrowth(store, now, 3)).filter((x) => x.key === key).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  const fix = {};
  let prev = null;
  for (const x of rows) {
    if (x.followers == null) continue;
    if (prev) { const want = x.followers - prev.followers; if (x.change !== want) fix[x.id] = { date: x.date, from: x.change ?? null, to: want }; }
    prev = x;
  }
  const ids = Object.keys(fix);
  if (!ids.length) return [];
  for (const m of [...new Set(ids.map((id) => fix[id].date.slice(0, 7)))]) {
    await mutate(store, growKey(m), [], (list) => {
      let n = 0;
      for (const x of list) if (fix[x.id]) { x.change = fix[x.id].to; n++; }
      return n ? { value: n } : { skip: true, value: 0 };
    });
  }
  return ids.map((id) => fix[id]).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* ---------- cards (what a bot says it is working on) and last-seen ---------- */
export async function setCard(store, now, roster, a) {
  const bot = whoIs(a.bot, roster);
  const card = { workingOn: cleanText(a.working_on, 400), needs: cleanText(a.needs, 400), at: new Date(now).toISOString() };
  /* blockers (14 Nov 2026): the bot's own word on what stands in its way. It replaces the blocker written
     in its roster profile; "" clears it. Left out, the last word stands. */
  const setB = a.blockers !== undefined && a.blockers !== null;
  if (setB) { card.blockers = cleanText(a.blockers, 300); card.blockersAt = card.at; }
  noSecrets(card.workingOn, card.needs, card.blockers || "");
  const saved = await mutate(store, "cards.json", {}, (all) => {
    const old = all[low(bot)];
    const c = !setB && old && typeof old.blockers === "string" ? { ...card, blockers: old.blockers, blockersAt: old.blockersAt || "" } : card;
    all[low(bot)] = c;
    return { value: c };
  });
  return { bot, ...saved };
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
  const all = messages.filter((m) => m.from !== name && (!since || m.at > since) && (m.to === name || m.to === "all" || m.about === name || (!!m.re && mine.has(m.re))))
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
/* where the song is at the distributor (14 Nov 2026, batch 3): a FIXED list, kept with history
   (r.storeLog, newest last), which is also Drop's moderation log (what RouteNote said, and why) */
export const STORE_STATUS = ["not uploaded", "uploaded", "in moderation", "rejected", "resubmitted", "approved", "delivered", "live"];
/* RouteNote's own words for them (16 Nov 2026, Drop: "Pending Moderation" was refused) */
export const STORE_ALIAS = { "pending moderation": "in moderation", "in review": "in moderation", "under review": "in moderation", "pending review": "in moderation",
  "action needed": "rejected", "action required": "rejected", "needs action": "rejected" };
export const storeWord = (v) => { const k = low(v).replace(/\s+/g, " ").trim(); return STORE_STATUS.includes(k) ? k : STORE_ALIAS[k] || ""; };
export const PACK_FIELDS = [
  /* Whose release is it (11 Nov 2026, Luke: "i want it to be if it's self release or released with
     label; for instance touch me: [the label] own 50% of that"). First on the form. */
  F("kind", "Self-release or with a label", "Self-release or label", "choice", "deal", { required: true, choices: [SELF_KIND, LABEL_KIND], hint: "With a label = a label owns part of it or delivers it to the stores." }),
  F("label", "The label", "Label", "line", "deal", { requiredWhen: WITH_LABEL, max: 120, hint: "The label's name, as on the contract." }),
  F("split", "The split (who owns what)", "Split", "line", "deal", { requiredWhen: WITH_LABEL, hint: 'For example "badscandal 50% · Sample Records 50%".' }),
  /* who delivers it and the deal's words are label questions: shown only "With a label" (14 Nov 2026, Luke:
     "that label part should only appear to write if we don't check self release") */
  F("distributor", "Who delivers it to the stores", "Distributor", "line", "deal", { showWhen: WITH_LABEL, max: 120, hint: `Leave empty when the label delivers it to the stores. Write "RouteNote" if we deliver it ourselves.` }),
  F("deal", "The deal in a few words (contract, date signed, where the money comes from)", "The deal", "text", "deal", { showWhen: WITH_LABEL, max: 600, hint: 'Optional. For example "Contract signed 3 Mar 2026; the label pays royalties twice a year".' }),
  F("wav", "Master WAV (link)", "Master WAV", "link", "files", { required: true, hint: "A download link to the final master, as a WAV file (Dropbox, Google Drive...). It must start with https://" }),
  F("artwork", "Artwork, 3000 x 3000 (link)", "Artwork", "link", "files", { required: true, hint: "A link to the cover: square, 3000 x 3000 pixels, JPG or PNG. No store logos or web addresses on it." }),
  /* the visualiser (14 Nov 2026, Luke: "should be visualiser for laura and i add the link there for her to
     upload to YT, and she should put the description on yt like the other visualisers") */
  /* optional, and never "needed" by any step (14 Nov 2026, the bots: it made Laura's video step look
     blocked on Me Dá Seu Body, which has no visualiser) */
  F("visualiser", "Visualiser video (link)", "Visualiser", "link", "files", { fill: [], hint: "Optional. A download link to the visualiser video (Dropbox, Google Drive...). Laura uploads it to YouTube and writes the description like the other visualisers. It must start with https://" }),
  /* 17 Nov 2026 (Luke via Nova): the Spotify Canvas, Luke's; Atlas uploads it (step "canvas", only when there is one) */
  F("canvas", "Spotify Canvas video (link)", "Spotify Canvas", "link", "files", { hint: "Optional. A link to the Canvas video (the short loop on Spotify). Atlas uploads it in Spotify for Artists once the song shows there." }),
  F("folder", "Folder with the release files (link)", "Folder", "link", "files", { hint: "Optional. One shared folder with the master, the cover, stems and clips." }),
  F("language", "Language of the lyrics", "Language", "line", "stores", { required: true, hint: 'For example "Portuguese", "English", or "Instrumental".' }),
  F("explicit", "Explicit lyrics?", "Explicit", "choice", "stores", { required: true, choices: ["No", "Yes", "Clean version"], hint: "Yes if the lyrics swear or are sexual. RouteNote asks for it." }),
  F("genre", "Genre", "Genre", "line", "stores", { required: true, hint: 'The main store genre, for example "Dance" or "Electronic".' }),
  F("subgenre", "Second genre", "Second genre", "line", "stores", { hint: 'Optional, for example "House".' }),
  F("version", "Version (Original, Radio edit...)", "Version", "line", "stores", { hint: "Leave empty for the original." }),
  F("writers", "Writers: full legal names, who wrote music and who wrote lyrics", "Writers", "text", "stores", { required: true, max: 600, hint: 'One person per line, for example "Full Legal Name: music and lyrics". Legal names, not artist names.' }),
  F("producers", "Producers", "Producers", "line", "stores", { hint: "Optional. As they should be credited." }),
  F("featuring", "Featured artists", "Featured artists", "line", "stores", { hint: "Only artists credited in the title." }),
  /* round 3 (16 Nov 2026, Drop: Love You is co-primary, not "featuring") */
  F("primary", "Primary artists (when the song has more than one, exactly as in the stores)", "Primary artists", "line", "stores", { hint: 'Optional: only when another artist is a main artist too, for example "badscandal, Sample Singer".' }),
  /* required to send a SELF-RELEASE since 11 Nov 2026 (evening): it cannot be uploaded without it. A label
     release the label delivers doesn't use it (review, 11 Nov 2026); one we upload ourselves needs it for
     the upload. showWhen: the form shows it whatever the kind (requiredWhen alone would hide it). */
  F("copyright", "Copyright line (℗ and ©)", "Copyright line", "line", "stores", { requiredWhen: { field: "kind", equals: SELF_KIND }, showWhen: null, neededBy: "upload", hint: 'For example "℗ 2026 badscandal · © 2026 badscandal" (always lowercase). Drop needs it for the upload.' }),
  /* Luke's words only (11 Nov 2026): Verse puts them live, it never writes them (the guide: "never write,
     guess or copy lyrics"), so no bot fills this field */
  F("lyrics", "Lyrics, full text", "Lyrics", "text", "lyrics", { neededBy: "lyrics", max: 8000, hint: "The whole text, line by line, as sung. Verse puts them live in the stores." }),
  F("mood", "Mood (for the pitch)", "Mood", "line", "pitch", { neededBy: "pitch", hint: 'Can wait. For example "late night, euphoric".' }),
  F("instruments", "Instruments (for the pitch)", "Instruments", "line", "pitch", { neededBy: "pitch", hint: 'Can wait. For example "synths, drum machine, vocal chops".' }),
  F("story", "The song in two lines (for the pitch)", "The song in two lines", "text", "pitch", { neededBy: "pitch", max: 400, hint: "Can wait. What the song is about and why it matters, for Atlas's Spotify pitch." }),
  F("isrc", "ISRC", "ISRC", "line", "later", { fill: ["Drop"], max: 40, hint: "Drop fills it from RouteNote." }),
  F("upc", "UPC", "UPC", "line", "later", { fill: ["Drop"], max: 40, hint: "Drop fills it from RouteNote." }),
  F("storeStatus", "Status at the distributor", "Status at the distributor", "choice", "later", { fill: ["Drop"], choices: STORE_STATUS, hint: "Drop keeps it current with store_status (a rejection with RouteNote's reason). Every change is kept." }),
  F("spotifyTrack", "Spotify track link", "Spotify track link", "link", "later", { fill: ["Atlas", "Webmaster"], hint: "https://open.spotify.com/track/... once the song is out." }),
  /* Laura's RESULT, not her input (11 Nov 2026): never "missing" before her step, like the ISRC */
  F("video", "Video (link)", "Video", "link", "later", { fill: ["Laura"], hint: "Laura fills it once the video is scheduled." }),
  F("page", "Song page (link)", "Song page", "link", "later", { fill: ["Webmaster"], hint: "Webmaster fills it once the page is live: https://badscandal.com/<slug>" }),
  /* round 3 (16 Nov 2026, Verse): where the lyrics are on Musixmatch, kept by Verse */
  F("musixmatch", "Lyrics on Musixmatch", "Musixmatch", "choice", "later", { fill: ["Verse"], choices: ["not listed", "submitted", "pending", "live"], hint: "Verse keeps it current after the release: not listed (the song isn't on Musixmatch yet), submitted, pending (in review), live." }),
  /* 17 Nov 2026 (Luke, via Nova): his notes on the ads he set up for the song (the release page shows them) */
  F("adplan", "Ad plan (what you set up, and your notes)", "Ad plan", "text", "notes", { max: 1500, hint: "Optional. Your notes on the ads for this song: platforms, audience, budget, dates, what you set up." }),
  /* 17 Nov 2026 (Luke: Love You "went through RouteNote before HQ existed"): no pack needed, nothing chased */
  F("prehq", "Released through the distributor before HQ: no pack needed", "Before HQ", "choice", "notes", { choices: ["Yes"], hint: "Only for a song that already went to the distributor before HQ: its missing fields stop showing and no bot chases them." }),
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
  /* waits for RouteNote's approval (16 Nov 2026, Atlas: Love You showed "due today" while RouteNote still had
     it In Review); a label release skips the approval, so it never waits */
  { key: "spotify", label: "Showing as upcoming in Spotify for Artists", owner: "Atlas", days: 15, after: "approved" },
  { key: "pitch", label: "Spotify pitch sent", owner: "Atlas", days: 14, after: "spotify", asap: true },
  /* 17 Nov 2026: only when the pack has a Canvas link (needs); once the song shows in Spotify for Artists, by a week after the release */
  { key: "canvas", label: "Spotify Canvas uploaded", owner: "Atlas", days: -7, after: "spotify", needs: "canvas" },
  { key: "page", label: "Song page live on badscandal.com", owner: "Webmaster", days: 7 },
  /* YouTube on a schedule (16 Nov 2026, Luke: "the day a new song releases the upload is released or scheduled
     in advance goal is two per month"): scheduled a week ahead, public on the release day */
  { key: "video", label: "YouTube video scheduled for the release day", owner: "Laura", days: 7 },
  /* the ads come AFTER the release, made with Luke (16 Nov 2026, Luke: "ads should not be made by forge himself
     i should help oversee that always after a release goes live ... we may make multiple sets"): waiting until
     the release day (and the song page: they link to it), due two days after it */
  { key: "ads", label: "Ads made with Luke, after the release", owner: "Forge", days: -2, after: "page", fromRelease: true },
  { key: "live", label: "Release day: Spotify link on the song page and the home card", owner: "Webmaster", days: 0 },
  /* the lyrics come AFTER the release (15 Nov 2026, Luke: they go on only once the song is on Musixmatch,
     "watching for release on musixmatch immediately after release"): waiting until the
     release day (fromRelease), then due a week after it. The teaser steps (batch 3) are gone (15 Nov 2026,
     Luke: "remove all the teaser clips fully im going to build a new section for that later"). */
  { key: "lyrics", label: "Lyrics live on Musixmatch", owner: "Verse", days: -7, fromRelease: true },
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
  /* a self-release is always ours (RouteNote): a distributor typed while it was a label release doesn't count */
  if (p.kind === SELF_KIND) return SELF_DISTRIBUTOR;
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
    out = f.choices.find((c) => low(c) === low(s)) || (f.key === "storeStatus" ? storeWord(s) || undefined : undefined);
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
/* Webmaster's song page (14 Nov 2026, Luke: "web masters job is to create the link for the song before it
   comes out … in order of what song is next and one week after the previous song releases"): due a week
   after the previous song's release day (that song has had its week as "Out now"), never later than the
   day before its own release; with no song before it, a week before its own day. Never in the past. */
/* never later than a week before its own day (16 Nov 2026: Love You is 3 days after Me Dá Seu Body, and its
   page came due the day before release, too late for anything that links to it) */
export function pageDue(date, prevDate, today) {
  let want = isDay(prevDate) ? addDays(prevDate, 7) : addDays(date, -7);
  if (want > addDays(date, -7)) want = addDays(date, -7);
  return want < today ? today : want;
}
/* the release that comes out last before `date` (scheduled, not recorded-after-it-came-out), not `id` */
export function prevReleaseDate(list, id, date) {
  const before = (list || []).filter((x) => x && x.id !== id && x.status === "scheduled" && !x.alreadyOut && isDay(x.date) && x.date < date).map((x) => x.date).sort();
  return before.length ? before[before.length - 1] : null;
}
/* after a release is sent, moved or cancelled: every song page not started yet follows the release order,
   and the one-pitch rule is applied again. Returns the ids of the releases it changed. */
function reorderPages(list, today, at = null) {
  const changed = new Set();
  for (const r of list || []) {
    if (!r || r.status !== "scheduled" || r.alreadyOut || !isDay(r.date)) continue;
    const st = (r.steps || []).find((x) => x.key === "page");
    if (st && st.status === "todo") { const due = pageDue(r.date, prevReleaseDate(list, r.id, r.date), today); if (st.due !== due) { st.due = due; changed.add(r.id); } }
  }
  for (const id of pitchRule(list, today, at)) changed.add(id);
  return [...changed];
}
/* ONE pitch in two weeks (16 Nov 2026, Luke: "only one song can be pitched in two weeks so for instance if one
   song is releasing and we're pitching that and one song is out a few days later we can't pitch that"). In
   release order, a song out less than 14 days after the last song that IS pitched (or to be) has its pitch
   skipped, saying why (rule "one-pitch"); when that stops being true (a move, a cancel) it opens again. A pitch
   already working, blocked or done is never touched. Returns the ids changed. */
export const PITCH_GAP_DAYS = 14;
const ONE_PITCH = "one-pitch";
const pitchNote = (t, d) => `Not pitched: ${t} (out ${dayWords(d)}) is the song pitched in these two weeks, and Spotify takes one pitch at a time (Luke, 16 Nov 2026)`;
function pitchRule(list, today, at = null) {
  const rel = (list || []).filter((r) => r && r.status === "scheduled" && !r.alreadyOut && isDay(r.date)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const changed = [];
  let last = null;
  for (const r of rel) {
    const p = (r.steps || []).find((x) => x.key === "pitch");
    if (!p) continue;
    const byRule = p.status === "skipped" && p.rule === ONE_PITCH;
    const clash = last && daysBetween(last.date, r.date) < PITCH_GAP_DAYS;
    if (clash && (p.status === "todo" || byRule)) {
      const note = pitchNote(last.title, last.date);
      if (p.status !== "skipped" || p.note !== note) { Object.assign(p, { status: "skipped", note, rule: ONE_PITCH }); changed.push(r.id); if (at) logIt(r, at, "HQ", `HQ skipped the pitch: ${last.title} is the song pitched in these two weeks`); }
    } else if (!clash && byRule) {
      p.status = "todo"; p.note = ""; delete p.rule;
      if (p.due && p.due < today) p.due = today;
      changed.push(r.id);
      if (at) logIt(r, at, "HQ", "HQ opened the pitch again: no other song is pitched in these two weeks");
    }
    if (p.status !== "skipped") last = r;
  }
  return changed;
}
const NEEDS_NOTE = "No Spotify Canvas link in the pack (Luke adds one if there is a Canvas)";
export function scheduleSteps(date, today, o = {}) {
  if (o.alreadyOut) return { steps: RELEASE_STEPS.map((s) => ({ key: s.key, label: s.label, owner: s.owner, due: null, status: "skipped", note: OUT_NOTE, link: "", at: null, by: null })), tight: false };
  const steps = RELEASE_STEPS.map((s) => {
    const want = addDays(date, -s.days);
    const skip = o.labelDelivers && (s.key === "upload" || s.key === "approved");
    const noNeed = s.needs && !filled((o.pack || {})[s.needs]); /* the Canvas step without a Canvas link */
    const due = s.key === "page" ? pageDue(date, o.prevDate, today) : want < today ? today : want;
    return { key: s.key, label: s.label, owner: s.owner, due, status: skip || noNeed ? "skipped" : "todo", note: skip ? LABEL_NOTE : noNeed ? NEEDS_NOTE : "", link: "", at: null, by: null };
  });
  return { steps, tight: daysBetween(today, date) < 21 };
}
/* a step that can't start yet: its `after` step is not finished (the pitch before the song shows in
   Spotify for Artists; the ads before the song page is live), or (fromRelease) the release day hasn't come
   (the lyrics, 15 Nov 2026). A release from before 11 Nov 2026 has no spotify step: its pitch never waits. */
const RELEASE_DAY = { key: "release", label: "the release day", owner: "" };
function waitingFor(steps, s, date, today) {
  if (finished(s) || !STEP[s.key]) return null;
  if (STEP[s.key].fromRelease && isDay(date) && isDay(today) && today < date) return RELEASE_DAY;
  const after = STEP[s.key].after;
  if (!after) return null;
  const a = steps.find((x) => x.key === after);
  return a && !finished(a) ? a : null;
}
const WAIT_WORDS = { spotify: "waiting: the song is not in Spotify for Artists yet", page: "waiting: the song page is not live yet (the ads link to it)",
  approved: "waiting: RouteNote has not approved it yet", release: "waiting: starts on the release day, once the song shows on Musixmatch" };
const ADS_WAIT = "waiting: the ads are made with Luke once the song is out";
const waitWords = (a, s) => (a.key === "release" && s && s.key === "ads" ? ADS_WAIT : WAIT_WORDS[a.key] || `waiting for "${a.label}"`);
/* the moment a step is done (or skipped), the steps that waited for it become ordinary steps: the pitch
   (asap) is due TODAY, the day the song shows in Spotify for Artists (14 Nov 2026, Luke: "spotify pitch
   should be sent immediately when the song becomes available in spotify"); any other step keeps its own
   day, and only a day already gone becomes today (never born late) */
function freeWaiting(r, key, today) {
  for (const s of r.steps || []) if (STEP[s.key] && STEP[s.key].after === key && !finished(s) && s.due) s.due = !STEP[s.key].asap && s.due > today ? s.due : today;
}
/* The desk's releases follow the pipeline as it is now (15 Nov 2026, Luke). A release sent before it:
   - loses the teaser steps (Luke: "remove all the teaser clips fully"), whatever their state;
   - gets the lyrics step after the release: renamed, due a week after the release day (today if that has
     passed), and a lyrics step blocked because the song isn't on Musixmatch yet is open again (Luke: "hes
     not actually block[ed] the song just doesn't exist yet"); a finished one is only renamed;
   - has its steps in the pipeline's order.
   Recognised by its steps (a teaser step, or the old "Lyrics live" label), so it runs once per release. */
const RETIRED_STEPS = ["teasers", "teaser_tiktok", "teaser_instagram", "teaser_youtube"];
const OLD_LYRICS = "Lyrics live";
const needsUpgrade = (r) => !!r && Array.isArray(r.steps) && r.steps.some((s) => RETIRED_STEPS.includes(s.key) || (s.key === "lyrics" && s.label === OLD_LYRICS));
function upgradeOne(r, today, at) {
  if (!needsUpgrade(r)) return false;
  const gone = r.steps.filter((s) => RETIRED_STEPS.includes(s.key));
  r.steps = r.steps.filter((s) => !RETIRED_STEPS.includes(s.key));
  const ly = r.steps.find((s) => s.key === "lyrics");
  let lyWords = "";
  if (ly && ly.label === OLD_LYRICS) {
    ly.label = STEP.lyrics.label;
    if (!finished(ly) && r.status === "scheduled" && !r.alreadyOut && isDay(r.date)) {
      const want = addDays(r.date, -STEP.lyrics.days);
      ly.due = want < today ? today : want;
      if (ly.status === "blocked") { ly.status = "todo"; ly.note = ""; }
      lyWords = `the lyrics go on Musixmatch after the release (due ${dayWords(ly.due)})`;
    }
  }
  const order = RELEASE_STEPS.map((x) => x.key), at_ = (k) => (order.includes(k) ? order.indexOf(k) : order.length);
  r.steps.sort((x, y) => at_(x.key) - at_(y.key));
  const said = [gone.length ? "took off the teaser steps" : "", lyWords].filter(Boolean);
  if (said.length) logIt(r, at, "HQ", `HQ ${joinWords(said)} (Luke, 15 Nov 2026)`);
  return true;
}
/* Once per release: reads first and writes only when a release still has the old steps, so calling it
   before every answer costs one read. Returns the releases changed. */
export async function upgradeReleases(store, now) {
  const today = spDay(now), at = new Date(now).toISOString();
  const list = await listReleases(store);
  if (!tidyAll(JSON.parse(JSON.stringify(list)), today, at).length) return { changed: [] };
  return mutate(store, REL_KEY, [], (rows) => {
    const ids = tidyAll(rows, today, at);
    const changed = rows.filter((r) => ids.includes(r.id)).map((r) => ({ id: r.id, title: r.title }));
    return changed.length ? { value: { changed } } : { skip: true, value: { changed } };
  });
}
/* everything a release on the desk is brought up to (15 and 16 Nov 2026); each part changes something only
   once, so a desk that is already up to date is never written */
const OLD_ADS = "Ad drafts ready, inside the cap", OLD_VIDEO = "Video scheduled on YouTube";
function healOne(r, today, at) {
  if (!r || !Array.isArray(r.steps)) return false;
  const said = [];
  /* the song page step done with its link: the pack's page says it too (16 Nov 2026, Verse) */
  const pg = r.steps.find((s) => s.key === "page");
  if (pg && pg.status === "done" && httpsLink(pg.link) && !filled((r.pack || {}).page)) { r.pack = r.pack || {}; r.pack.page = httpsLink(pg.link); said.push("put the song page's link in the pack"); }
  /* the ads, made with Luke after the release (16 Nov 2026) */
  const ad = r.steps.find((s) => s.key === "ads");
  if (ad && ad.label === OLD_ADS) {
    ad.label = STEP.ads.label;
    if (!finished(ad) && r.status === "scheduled" && !r.alreadyOut && isDay(r.date)) { const want = addDays(r.date, -STEP.ads.days); ad.due = want < today ? today : want; }
    said.push(`the ads are made with Luke after the release${ad.due ? ` (due ${dayWords(ad.due)})` : ""}`);
  }
  /* a release missing a step of the pipeline gets it (17 Nov 2026: Me Dá Seu Body had no YouTube step), dated as if it
     had been sent with it; a step done long ago elsewhere is never invented as done */
  /* only a song not out yet; never the Spotify for Artists step (an old release gets that one when Luke moves it: its
     pitch may have gone out already, 11 Nov 2026) */
  if (r.status === "scheduled" && !r.alreadyOut && isDay(r.date) && r.date >= today) {
    const have = new Set(r.steps.map((s) => s.key)), add = RELEASE_STEPS.filter((x) => !have.has(x.key) && x.key !== "spotify");
    if (add.length) {
      const fresh = scheduleSteps(r.date, today, { labelDelivers: labelDelivers(r.pack), pack: r.pack }).steps;
      for (const x of add) r.steps.push(fresh.find((y) => y.key === x.key));
      const order = RELEASE_STEPS.map((x) => x.key);
      r.steps.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
      said.push(`added the step${add.length === 1 ? "" : "s"} ${joinWords(add.map((x) => `"${x.label}"`))}`);
    }
  }
  const vd = r.steps.find((s) => s.key === "video");
  if (vd && vd.label === OLD_VIDEO) { vd.label = STEP.video.label; said.push("the YouTube video goes public on the release day"); }
  if (said.length) logIt(r, at, "HQ", `HQ: ${joinWords(said)} (Luke, 16 Nov 2026)`);
  return said.length > 0;
}
function tidyAll(rows, today, at) {
  const ids = new Set();
  for (const r of rows) { if (upgradeOne(r, today, at)) ids.add(r.id); if (healOne(r, today, at)) ids.add(r.id); }
  for (const id of pitchRule(rows, today, at)) ids.add(id);
  return [...ids];
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

/* L7 (18 Nov 2026): the Spotify editorial pitch, as HQ shows it. HQ never pitches and never calls
   Spotify. Atlas sends the pitch in Spotify for Artists and records the day; after release he records
   each editorial playlist he sees there. Status is not pitched, pitched (with the day), or missed
   (the deadline passed and it was not sent). A song the one-pitch rule skipped is not pitched, and
   it is not missed. Deadline = 7 days before release. The warning runs from 14 days out, while there
   is still time. */
export const PITCH_DEADLINE_DAYS = 7;
export const PITCH_WARN_DAYS = 14;
export const PITCH_RECENT_DAYS = 28; /* a playlist add still shows for a month after release */
export const PITCH_LOGGERS = ["Atlas", "Nova", "Claude", "Luke"];
const EDITORIAL_CAP = 24;
const pitchStepOf = (v) => ((v && v.steps) || []).find((s) => s.key === "pitch") || null;
const pitchedOnOf = (p) => (p && p.status === "done" ? (isDay(p.doneOn) ? p.doneOn : (p.at ? spDay(Date.parse(p.at)) : "")) : "");
const samePlay = (a, b) => { const ka = songKey(a), kb = songKey(b); return ka || kb ? ka === kb : ownWords(a) !== "" && ownWords(a) === ownWords(b); };
export function editorialOf(r) {
  return (Array.isArray(r && r.editorial) ? r.editorial : [])
    .filter((e) => e && isDay(e.date) && clean(e.name, 80))
    .map((e) => ({ name: clean(e.name, 80), date: e.date, by: clean(e.by, 40) }))
    .slice(-EDITORIAL_CAP);
}
export function pitchOf(v, today, editorial = null) {
  const eds = editorial || editorialOf(v);
  if (!v || v.status === "cancelled" || v.status === "draft") return null;
  const pitch = pitchStepOf(v);
  if (v.alreadyOut) return eds.length ? { status: "not pitched", skipped: false, waiting: false, pitchedOn: null, deadline: null, line: "Pitch: not tracked (already out when it was recorded)", editorial: eds } : null;
  if (!pitch && !eds.length) return null;
  const date = isDay(v.date) ? v.date : null;
  const deadline = date ? addDays(date, -PITCH_DEADLINE_DAYS) : null;
  const days = v.daysToGo != null ? v.daysToGo : (date && isDay(today) ? daysBetween(today, date) : null);
  const one = !!(pitch && pitch.status === "skipped" && pitch.rule === ONE_PITCH);
  const sentBefore = !!(pitch && pitch.status === "skipped" && pitch.note === PITCHED_NOTE);
  const done = !!(pitch && pitch.status === "done") || sentBefore;
  const waiting = !!(pitch && pitch.waiting && !done && !one);
  const missed = !!(pitch && !done && !one && days != null && days < PITCH_DEADLINE_DAYS);
  const status = done ? "pitched" : missed ? "missed" : "not pitched";
  const pitchedOn = done && pitch && pitch.status === "done" ? pitchedOnOf(pitch) : "";
  const who = done && pitch && pitch.status === "done" ? clean(pitch.by, 40) : "";
  const by = deadline ? dayWords(deadline) : "";
  let line;
  /* 18 Nov 2026, Luke: a pitch Atlas sent is not an approval. The card's pitch line says who sent it. */
  if (done) line = (pitchedOn ? `Pitch: pitched ${dayWords(pitchedOn)}` : "Pitch: pitched") + (who ? ` by ${who}` : "");
  else if (one) line = pitch.note ? `Pitch: ${pitch.note.charAt(0).toLowerCase()}${pitch.note.slice(1)}` : "Pitch: not pitched";
  else if (missed) line = by ? `Pitch: missed. Spotify needed it by ${by}` : "Pitch: missed";
  else if (waiting) line = by ? `Pitch: not pitched yet. It waits until the song shows in Spotify for Artists. Deadline ${by}` : "Pitch: not pitched yet. It waits until the song shows in Spotify for Artists";
  else if (by && days != null && days >= PITCH_DEADLINE_DAYS && days <= PITCH_WARN_DAYS) line = `Pitch: not pitched. Still time: send it by ${by}`;
  else line = by ? `Pitch: not pitched. Deadline ${by}` : "Pitch: not pitched";
  return { status, skipped: one, waiting, pitchedOn: pitchedOn || null, deadline, line, editorial: eds, ...(one && pitch.note ? { reason: pitch.note } : {}) };
}
/* the two-week pitch slots: the song that holds the slot, then the songs the one-pitch rule left out.
   Upcoming songs and songs out in the last 28 days. */
export function pitchSlots(views, today) {
  const rel = (views || []).filter((v) => v && v.status === "scheduled" && !v.alreadyOut && isDay(v.date))
    .slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const slots = [];
  let cur = null;
  const bit = (v, p) => ({ id: v.id, title: v.title, date: v.date, dateWords: v.dateWords || dayWords(v.date), status: p.status, line: p.line, pitchedOn: p.pitchedOn || null, deadline: p.deadline || null,
    editorial: (p.editorial || []).map((e) => `${e.name} (${dayWords(e.date)})`) });
  for (const v of rel) {
    const p = v.pitch || pitchOf(v, today);
    if (!p) continue;
    if (p.skipped && cur) { cur.also.push(bit(v, p)); continue; }
    cur = { ...bit(v, p), also: [] };
    slots.push(cur);
  }
  const recent = (d) => isDay(d) && isDay(today) && daysBetween(today, d) >= -PITCH_RECENT_DAYS;
  return slots.filter((s) => recent(s.date) || s.also.some((a) => recent(a.date)));
}
export function pitchSlotLines(slots) {
  return (slots || []).map((s) => {
    const ed = s.editorial && s.editorial.length ? `; editorial: ${s.editorial.join(", ")}` : "";
    const also = s.also && s.also.length ? `; not pitched in this slot: ${s.also.map((a) => `${a.title} (out ${a.dateWords})`).join(", ")}` : "";
    return `${s.title} (out ${s.dateWords}): ${s.line}${ed}${also}`;
  });
}

/* what one release looks like to /hq and to the tools. o.sightings: the latest Spotify for Artists
   report (sightingsView or the stored document), for the warnings. */
export function releaseView(r, today, o = {}) {
  const date = isDay(r.date) ? r.date : null;
  const pack = r.pack || {};
  const raw = r.steps || [];
  const steps = raw.map((s) => {
    const w = waitingFor(raw, s, date, today), skipped = s.status === "skipped";
    return { ...s, late: !finished(s) && !w && !!s.due && s.due < today, dueIn: s.due ? daysBetween(today, s.due) : null, waiting: !!w,
      ...(w ? { waitingFor: w.key, waitingText: waitWords(w, s) } : {}), ...(skipped ? { skipped: true } : {}), ...(STEP[s.key] && STEP[s.key].after ? { after: STEP[s.key].after } : {}) };
  });
  const dueOf = (key) => { const s = steps.find((x) => x.key === key); return s ? s.due : date && STEP[key] ? addDays(date, -STEP[key].days) : null; };
  /* released through the distributor before HQ (17 Nov 2026): no pack needed, nothing is missing, nobody chases it */
  const out = outAlready(r, today) || pack.prehq === "Yes";
  const preHq = pack.prehq === "Yes";
  const missing = [];
  if (!date) missing.push({ key: "date", label: "Release day", short: "Release day", required: true, neededBy: "", step: "", owner: "", due: null });
  /* already out: only whose song it is matters (the files and the details went to the stores long ago) */
  for (const f of PACK_FIELDS) if (!preHq && requiredNow(f, pack) && !filled(pack[f.key]) && (!out || f.group === "deal")) missing.push({ key: f.key, label: f.label, short: f.short, required: true, neededBy: "", step: "", owner: "", due: null });
  for (const f of PACK_FIELDS) if (!out && !requiredNow(f, pack) && f.neededBy && !filled(pack[f.key])) {
    const st = steps.find((x) => x.key === f.neededBy);
    if (st && finished(st)) continue; /* the label delivers it, or the step is done already: nothing needs the field any more */
    if (!st && labelDelivers(pack) && (f.neededBy === "upload" || f.neededBy === "approved")) continue; /* nor in a draft */
    missing.push({ key: f.key, label: f.label, short: f.short, required: false, neededBy: f.neededBy, step: STEP[f.neededBy].label, owner: STEP[f.neededBy].owner, due: dueOf(f.neededBy) });
  }
  /* after what is needed to send, the most urgent first: the field whose step is due soonest (14 Nov 2026).
     A step that waits (the pitch, for Spotify for Artists) has no real day yet: its fields go last. */
  const firstOpt = missing.findIndex((m) => !m.required);
  const when = (m) => { const st = steps.find((x) => x.key === m.neededBy); return st && st.waiting ? "9" : m.due || "9"; };
  if (firstOpt >= 0) missing.splice(firstOpt, missing.length - firstOpt, ...missing.slice(firstOpt).map((m, i) => [m, i]).sort((a, b) => (when(a[0]) < when(b[0]) ? -1 : when(a[0]) > when(b[0]) ? 1 : a[1] - b[1])).map((x) => x[0]));
  /* "Pack: 14 of 17 filled": the fields Luke fills about the song; the team's "later" fields and the
     deal (shown on its own line) are not counted */
  const own = PACK_FIELDS.filter((f) => f.key !== "prehq" && f.key !== "adplan" && f.group !== "later" && f.group !== "deal");
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
      blocked: steps.filter((s) => s.status === "blocked" && !blockIsWait(s)).length, skipped: steps.filter((s) => s.status === "skipped").length, waiting: steps.filter((s) => s.waiting).length },
    next: next ? { key: next.key, label: next.label, owner: next.owner, due: next.due, dueIn: next.dueIn, status: next.status, late: next.late, waiting: next.waiting, note: next.note || "",
      ...(next.waiting ? { waitingFor: next.waitingFor, waitingText: next.waitingText } : {}) } : null,
    /* batch 3: the status at the distributor with its history, and Luke's approvals (the lyrics' one says
       whether the pack's lyrics are still the ones he approved) */
    store: storeOf(r),
    approvals: approvalsOf(r),
    log: (r.log || []).slice().reverse() };
  v.pitch = pitchOf(v, today, editorialOf(r)); /* L7: not pitched / pitched with the day / missed */
  v.warnings = releaseWarnings(v, o.sightings || null, today);
  v.preflight = r.status === "cancelled" ? [] : preflightOf(r); /* A6, 17 Nov 2026 */
  v.where = whereWords(v, today);
  return v;
}
function approvalsOf(r) {
  const a = r.approvals || {}, lyr = (r.pack || {}).lyrics || "";
  /* a pitch that went out with no approval on the desk reads as sent, never "not approved" (16 Nov 2026, Verse) */
  const ps = (r.steps || []).find((s) => s.key === "pitch");
  const sentOnly = !a.pitch && ps && ps.status === "done" ? { sentOnly: true, on: ps.doneOn || (ps.at ? spDay(Date.parse(ps.at)) : ""), by: ps.by || "" } : null;
  return { pitch: a.pitch ? { ...a.pitch } : sentOnly, lyrics: a.lyrics ? { ...a.lyrics, current: a.lyrics.text === lyr } : null };
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
    if (v.pack && v.pack.prehq === "Yes") return "Released through the distributor before HQ: no pack needed · ready to send";
    if (v.date && v.date < today) return `Release day ${dayWords(v.date)} has passed: sending records it as already out, with no steps` + (req.length ? ` · still missing: ${joinWords(req.map((m) => m.short))}` : "");
    return "In the pipeline: " + filledLine + (req.length ? ` · still missing: ${joinWords(req.map((m) => m.short))}` : " · ready to send");
  }
  if (v.alreadyOut) return `Already out (${v.dateWords || "no date"}): recorded for its deal`;
  const n = `${v.counts.done} of ${v.counts.total} steps done`;
  if (v.released) return (v.daysToGo === 0 ? "Out today" : `Out since ${v.dateWords}`) + " · " + n;
  const x = v.next;
  if (!x) return `All ${v.counts.total} steps done · out ${v.dateWords}`;
  /* blocked before late (11 Nov 2026, review): "late" pointed at Drop when the step waits on Luke's cover */
  return `${n} · next: ${x.label}, ${x.owner}, ` + (x.waiting ? (x.waitingText && x.waitingFor !== "spotify" ? x.waitingText : "waiting: not in Spotify for Artists yet") : x.status === "blocked" ? "blocked" + (x.note ? `: ${cutNote(x.note, 60)}` : "") : x.late ? `late since ${dayWords(x.due)}` : dayWords(x.due) || "no date yet");
}

/* ---------- warnings on a release (V5, 11 Nov 2026): a fact with a consequence, most urgent first ----------
   Each item { kind, text }; releaseWarnings() gives the sentences. kinds: today | blocked | late |
   twice | pitch | spotify | date | soon | without | unrecorded | split | tight. sightings: the latest Spotify for Artists report
   (sightingsView or the stored document), or null. */
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
/* a bot's note cut to fit a warning, with "…" when it was cut (15 Nov 2026: "... on the Musixmatch artist page. Will" read as broken) */
const cutNote = (t, n) => { const x = String(t || "").replace(/\s+/g, " ").trim(); return x.length > n ? x.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : x; };
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
  for (const s of v.steps) if (s.status === "blocked" && !blockIsWait(s)) out.push({ kind: "blocked", rank: 1, text: `${s.label} is blocked (${s.owner})` + (s.note ? `: ${cutNote(s.note, 160)}` : "") });
  /* batch 3: the distributor turned it down, and it hasn't been fixed yet */
  if (v.store && v.store.status === "rejected") out.push({ kind: "rejected", rank: 1, text: "Rejected at the distributor" + (v.store.reason ? `: ${cutNote(v.store.reason, 160)}` : "") + (v.store.by ? ` (${v.store.by})` : "") });
  const pitchTooLate = pitch && !finished(pitch) && days > 0 && days < PITCH_DEADLINE_DAYS;
  /* still time (L7, 18 Nov 2026): from 14 days out down to the deadline, and only when Atlas can
     actually send it (not waiting on Spotify for Artists, not skipped by the one-pitch rule) */
  const pitchSoon = pitch && !finished(pitch) && !pitch.waiting && days >= PITCH_DEADLINE_DAYS && days <= PITCH_WARN_DAYS;
  /* only while the pitch is still to go (11 Nov 2026, review): a pitch already sent (an older release
     moved, or marked by Luke) can't be held up by it */
  const other = otherDate(sightings, v);
  const spotMissing = spot && !finished(spot) && pitch && !finished(pitch) && days > 0 && days <= 14 && !inReport(sightings, v) && !other;
  for (const s of v.steps.filter((x) => x.late && x.status !== "blocked").sort((a, b) => a.dueIn - b.dueIn)) {
    if (s.key === "live" && days === 0) continue; /* said above */
    if (s.key === "pitch" && (pitchTooLate || pitchSoon)) continue; /* said below, with what it means */
    if (s.key === "spotify" && spotMissing) continue;
    out.push({ kind: "late", rank: 2, text: `${s.label} is ${plural(-s.dueIn, "day")} late (${s.owner})` });
  }
  if (pitchTooLate) out.push({ kind: "pitch", rank: 3, text: "Too late for a Spotify pitch: Spotify needs it 7 days before release" });
  if (pitchSoon) out.push({ kind: "pitch", rank: 3, text: days === PITCH_DEADLINE_DAYS
    ? "Last day to pitch: Spotify needs it today (7 days before release)"
    : `Still time to pitch: send it by ${dayWords(addDays(v.date, -PITCH_DEADLINE_DAYS))} (Spotify needs it 7 days before release)` });
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
/* 18 Nov 2026, Luke: red is for a failure. A blocked step that is waiting (on a date, on him, or on a
   decision he already made) is not a failure. */
export function blockIsWait(st) {
  if (!st || st.status !== "blocked") return false;
  if (st.waiting) return true;
  const note = String(st.note || ""), label = String(st.label || "");
  if (/\b(reject|rejected|fail|failed|error|denied|routenote|cover)\b/i.test(note)) return false;
  if (/^Ads made with Luke/i.test(label) && /\b(luke|no solo)\b/i.test(note)) return true;
  if (/\b(luke|you)\b/i.test(note) && /\b(need|needs|waiting|none provided|not yet|no solo)\b/i.test(note)) return true;
  return false;
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
/* the store status's history (batch 3): one entry per change, the current status mirrored in the pack's
   storeStatus (so every older reader, HQ's merged list included, still works). The last 40 are kept. */
/* kept in the order of the days they happened (16 Nov 2026: Drop filling in 6, 9 and 14 Nov after today's
   word made "uploaded" the status now); the same day keeps the order they were said in */
function storeEntry(r, e) {
  const log = (r.storeLog || []).concat({ status: e.status, on: e.on, at: e.at, by: e.by, ...(e.reason ? { reason: e.reason } : {}), ...(e.note ? { note: e.note } : {}) });
  r.storeLog = log.map((x, i) => [x, i]).sort((a, b) => (a[0].on < b[0].on ? -1 : a[0].on > b[0].on ? 1 : a[1] - b[1])).map((x) => x[0]).slice(-40);
  r.pack = r.pack || {};
  r.pack.storeStatus = r.storeLog[r.storeLog.length - 1].status;
}
/* what the view, the tools and HQ show: the status now (with the reason when it is a rejection), the
   history newest first, and an old free-text status written before the fixed list (legacy) */
function storeOf(r) {
  const log = Array.isArray(r.storeLog) ? r.storeLog : [];
  const last = log[log.length - 1] || null, cur = (r.pack || {}).storeStatus || "";
  const legacy = !last && cur && !STORE_STATUS.includes(cur) ? cur : "";
  const status = last ? last.status : STORE_STATUS.includes(cur) ? cur : "";
  return { status, since: last ? last.on : null, by: last ? last.by : "", reason: last && last.status === "rejected" ? last.reason || "" : "", note: last ? last.note || "" : "",
    ...(legacy ? { legacy } : {}), history: log.slice().reverse() };
}
/* approvals (batch 3): "Pitch approved" and "Final lyrics approved". Only Luke (Alfred may record his
   words); who may ASK Luke for each */
export const APPROVALS = { pitch: { label: "Pitch approved", asks: ["Atlas", "Nova", "Claude"] }, lyrics: { label: "Final lyrics approved", asks: ["Verse", "Nova", "Claude"] } };
export const APPROVE_OPTIONS = ["Approve", "Not yet"];
export const RESUBMIT_OPTIONS = ["Yes, resubmit", "Not yet"];

/* ---------- the bots propose releases (16 Nov 2026, Luke: "give the bots better controls they should be
   able to add edit and change upcoming songs and should always ask me if something is correct before
   making the addition") ----------
   A bot proposes a new song, or changes to one on the desk (title, release day, any pack field), and may
   ask for it to be sent to the team in the same go. The desk checks everything FIRST (a proposal that
   could never be applied never reaches Luke), then asks Luke ONE question, "Yes, correct" / "No", with
   every change listed from and to. Only his "Yes, correct" (on the dashboard, or recorded by Alfred or
   Nova from their chat) applies it, in Luke's name; if the song changed in the meantime nothing is
   overwritten and the bot is told to ask again. */
export const PROPOSE_OPTIONS = ["Yes, correct", "No"];
const PROPOSE_YES = "yes, correct";
const shown = (v, max = 300) => { const t = String(v == null ? "" : v); return t.length > max ? t.slice(0, max) + "…" : t; };
export async function proposeRelease(store, now, roster, a) {
  const by = whoIs(a.by, roster); /* the team only: Luke and Claude change songs on the dashboard themselves */
  const today = spDay(now);
  const list = await listReleases(store);
  const song = clean(a.song, 120), title = clean(a.title, 120);
  noSecrets(title);
  const dateGiven = a.date != null && String(a.date).trim() !== "";
  const date = clean(a.date, 10);
  if (dateGiven && (!isDay(date) || Number.isNaN(Date.parse(date + "T12:00:00Z")))) fail("The release day must be a date written YYYY-MM-DD, for example 2026-12-11. Nothing was asked.");
  const pack = a.pack == null ? {} : a.pack;
  if (typeof pack !== "object" || Array.isArray(pack)) fail('pack must be the fields to set, each with its value, for example {"genre": "Dance"}.');
  const unknown = Object.keys(pack).filter((k) => !FIELD[k]);
  if (unknown.length) fail(`${unknown.length === 1 ? "This is not a field" : "These are not fields"} of a release: ${unknown.map((k) => clean(k, 40)).join(", ")}. The fields are: ${PACK_FIELDS.map((f) => f.key).join(", ")}. Nothing was asked.`);
  const values = Object.fromEntries(Object.keys(pack).map((k) => [k, packValue(k, pack[k])]));
  const why = cleanText(a.why, 400);
  noSecrets(why);
  const send = a.send === true;
  const clash = (t, self) => { const k = songKey(t); return k ? list.find((x) => x !== self && x.status !== "cancelled" && (x.id === k || songKey(x.title) === k)) : null; };
  const changes = [];
  let p;
  if (!song) {
    if (!title) fail("Give the new song's title (title), or the song to change (song). Nothing was asked.");
    const c = clash(title, null);
    if (c) fail(`There is already a release called "${c.title}"${c.status === "draft" ? " (a draft)" : ""}: propose changes to it with song instead. Nothing was asked.`, "exists");
    if (send && !dateGiven) fail("To send it to the team it needs its release day (date): every step is dated from it. Nothing was asked.");
    changes.push({ key: "title", label: "Title", from: "", to: title });
    if (dateGiven) changes.push({ key: "date", label: "Release day", from: "", to: dayWords(date) + (date < today ? " (already out)" : "") });
    for (const [k, v] of Object.entries(values)) if (v) changes.push({ key: k, label: FIELD[k].short, from: "", to: shown(v) });
    p = { action: "add", title, ...(dateGiven ? { date } : {}), pack: Object.fromEntries(Object.entries(values).filter(([, v]) => v)), send };
  } else {
    const r = findRelease(list, song, { drafts: true });
    if (r.status === "cancelled") fail(`${r.title} was cancelled. Propose it as a new song instead. Nothing was asked.`);
    const before = { pack: {} }, set = {};
    if (title && title !== r.title) {
      const c = clash(title, r);
      if (c) fail(`There is already a release called "${c.title}". Pick another title. Nothing was asked.`, "exists");
      changes.push({ key: "title", label: "Title", from: r.title, to: title }); before.title = r.title; set.newTitle = title;
    }
    if (dateGiven && date !== (r.date || "")) {
      if (r.status === "scheduled" && !r.alreadyOut && date < today) fail(`${dayWords(date)} has already passed: a release still to come can only move to today or later. Nothing was asked.`);
      changes.push({ key: "date", label: "Release day", from: dayWords(r.date), to: dayWords(date) }); before.date = r.date || ""; set.date = date;
    }
    const pk = {};
    for (const [k, v] of Object.entries(values)) {
      const old = (r.pack || {})[k] || "";
      if (old === v) continue;
      changes.push({ key: k, label: FIELD[k].short, from: shown(old), to: shown(v) }); before.pack[k] = old; pk[k] = v;
    }
    const sendIt = send && r.status === "draft";
    if (sendIt && !(set.date || r.date)) fail(`To send ${r.title} to the team it needs its release day (date). Nothing was asked.`);
    if (!changes.length && !sendIt) fail(`Nothing would change: ${r.title} already has ${Object.keys(values).length || title || dateGiven ? "those values" : "no changes in what you sent"}. Nothing was asked.`);
    p = { action: "change", id: r.id, title: r.title, ...set, pack: pk, before, send: sendIt };
  }
  /* one open question per bot and song: never a pile of the same ask */
  const key = p.id || songKey(p.title);
  const open = (await listMessages(store, now)).find((m) => m.proposal && m.from === by && isOpen(m) && (m.proposal.id || songKey(m.proposal.title)) === key);
  if (open) fail(`You already asked Luke about ${p.title} (message ${open.id}) and he has not answered yet. Wait for his answer (or ask Nova to remind him). Nothing was asked.`, "exists");
  const listLine = changes.map((c) => `${c.label}: ${c.from ? `${shown(c.from, 80)} → ` : ""}${shown(c.to, 120)}`).join("; ");
  const head = p.action === "add" ? `Add a new song: ${p.title}` + (p.date ? `, out ${dayWords(p.date)}.` : " (no release day yet).") : `Change ${p.title}:`;
  const text = `${by} asks: is this correct? ${head}` + (p.action === "change" ? ` ${listLine}.` : changes.length > 2 ? ` ${changes.slice(2).map((c) => `${c.label}: ${shown(c.to, 120)}`).join("; ")}.` : "") +
    (p.send ? " Then send it to the team (every bot gets its steps)." : "") + (why ? ` Why: ${why}` : "") + ` Nothing changes until you say "Yes, correct".`;
  const r = await sendMessage(store, now, roster, { from: by, to: "Luke", needs: "decision", text, proposal: { ...p, by, changes: changes.map(({ label, from, to }) => ({ label, from, to })) } });
  return { message: r.message, proposal: p, changes };
}
/* ---------- song pages without Luke's Mac (16 Nov 2026; Luke chose "GitHub does it") ----------
   Webmaster (or Nova) proposes a song page (kind "new": address, title, day, cover link) or the release-day
   Spotify link (kind "track"); it is the same "is this correct?" question as proposeRelease. On "Yes,
   correct" the site asks GitHub to build it (netlify/lib/github.mjs, set up by the function with
   useSongDispatch). The page itself, the images and every test run on GitHub (song-page.yml). */
let songDispatch = null;
export const useSongDispatch = (fn) => { songDispatch = typeof fn === "function" ? fn : null; };
/* the build reports (A2, 17 Nov 2026): netlify/lib/github.mjs readSongReport, set on the published site only
   (functions/staff.mjs and functions/pushhourly.mjs); a preview never reads them */
let songReports = null;
export const useSongReports = (fn) => { songReports = typeof fn === "function" ? fn : null; };
export const SONG_PAGE_BOTS = ["Webmaster", "Nova"];
export async function proposeSongPage(store, now, roster, a) {
  const by = whoIs(a.by, roster);
  if (!SONG_PAGE_BOTS.includes(by)) fail("Song pages are Webmaster's (Nova may ask for him). Tell Webmaster what is needed. Nothing was asked.", "not_allowed");
  const kind = low(a.kind);
  if (!["new", "track", "card"].includes(kind)) fail('kind must be "new" (a new song page), "track" (the Spotify link on release day) or "card" (the song on the home card). Nothing was asked.');
  const slug = clean(a.slug, 60);
  if (!SLUG_RE.test(slug)) fail(`The address must be lowercase letters and digits (dashes allowed), for example "loveyou" for badscandal.com/loveyou. Nothing was asked.`);
  const why = cleanText(a.why, 400);
  noSecrets(why);
  const song = SONGS.find((x) => x.slug === slug);
  let p, changes, head;
  if (kind === "new") {
    if (song) fail(`badscandal.com/${slug} already has a page (${song.title}). For its Spotify link on release day use kind "track". Nothing was asked.`, "exists");
    if (SONG_RESERVED.has(slug)) fail(`badscandal.com/${slug} is taken by the site itself. Pick another address. Nothing was asked.`);
    const title = clean(a.title, 120);
    if (!title) fail("Give the song's title, exactly as in the stores. Nothing was asked.");
    noSecrets(title);
    const date = clean(a.date, 10);
    if (!isDay(date) || Number.isNaN(Date.parse(date + "T12:00:00Z"))) fail("The release day must be a date written YYYY-MM-DD, for example 2026-11-27. Nothing was asked.");
    const cover = httpsLink(a.cover);
    if (!cover) fail("cover must be a link to the cover picture that starts with https:// (the square JPG or PNG; a Dropbox link is fine). Nothing was asked.");
    p = { action: "page", kind, slug, title, date, cover };
    changes = [{ label: "Address", from: "", to: `badscandal.com/${slug}` }, { label: "Title", from: "", to: title }, { label: "Release day", from: "", to: dayWords(date) }, { label: "Cover", from: "", to: cover }];
    head = `Make the song page badscandal.com/${slug} for ${title}, out ${dayWords(date)} (a countdown and "Follow on Spotify" until then)`;
  } else if (kind === "card") {
    /* the home card (16 Nov 2026): only a song with its own page; the rule says which song is due */
    if (!song) fail(`There is no page called badscandal.com/${slug}: a song needs its page before it can go on the home card. The song pages are: ${SONGS.map((x) => x.slug).join(", ")}. Nothing was asked.`, "not_found");
    const now0 = homeCardPublished();
    if (now0.slug === slug) fail(`${song.title} is already on the home card. Nothing was asked.`, "exists");
    const rule = homeCardSong(SONGS, spDay(now));
    p = { action: "card", kind, slug, title: song.title };
    changes = [{ label: "Home card", from: now0.title || "", to: song.title }];
    head = `Put ${song.title} on the home card (badscandal.com), ` + (song.date > spDay(now) ? `with its countdown to ${dayWords(song.date)}` : `out since ${dayWords(song.date)}`) +
      (rule ? `. The rule says: ${rule.why}` + (rule.slug !== slug ? ` (so it would be ${rule.title})` : "") : "");
  } else {
    if (!song) fail(`There is no page called badscandal.com/${slug}. The song pages are: ${SONGS.map((x) => x.slug).join(", ")}. Nothing was asked.`, "not_found");
    const track = clean(a.track, 200);
    if (!TRACK_RE.test(track)) fail("track must be the song's Spotify link exactly like https://open.spotify.com/track/<22 letters and digits>, without ?si= or anything after it. Nothing was asked.");
    if (song.spotifyTrack === track) fail(`badscandal.com/${slug} already has that Spotify link. Nothing was asked.`);
    p = { action: "track", kind, slug, title: song.title, track };
    changes = [{ label: "Spotify link", from: song.spotifyTrack || "", to: track }];
    head = `Put the Spotify link on badscandal.com/${slug} (${song.title})`;
  }
  const open = (await listMessages(store, now)).find((m) => m.proposal && isOpen(m) && (kind === "card" ? m.proposal.action === "card" : m.from === by && (m.proposal.action === "page" || m.proposal.action === "track") && m.proposal.slug === slug));
  if (open) fail(kind === "card" ? `Luke has not answered the last home-card question yet (message ${open.id}). Wait for his answer. Nothing was asked.` : `You already asked Luke about badscandal.com/${slug} (message ${open.id}) and he has not answered yet. Wait for his answer. Nothing was asked.`, "exists");
  const text = `${by} asks: is this correct? ${head}.` + (kind === "track" ? ` Link: ${p.track}.` : kind === "new" ? ` Cover: ${p.cover}.` : "") + (why ? ` Why: ${why}` : "") +
    ` On "Yes, correct" GitHub builds it, checks it and puts it live (about 2 minutes).`;
  const r = await sendMessage(store, now, roster, { from: by, to: "Luke", needs: "decision", text, proposal: { ...p, by, changes } });
  return { message: r.message, proposal: p, changes };
}

/* What happened to each song-page request (song_pages, 16 Nov 2026, Webmaster: so routines don't ask twice):
   newest first, from the last two months of messages. A request Luke said yes to is "live" once the published
   site has it (the song in songs.json, its Spotify link, or the home card), checked against the site as
   deployed (a GitHub publish redeploys it); else "sent to GitHub … not live yet". */
export async function songPages(store, now) {
  const list = (await listMessages(store, now, 2)).filter((m) => m.proposal && ["page", "track", "card"].includes(m.proposal.action));
  const card = homeCardPublished();
  const live = (p) => (p.action === "page" ? SONGS.some((x) => x.slug === p.slug) : p.action === "track" ? SONGS.some((x) => x.slug === p.slug && x.spotifyTrack === p.track) : card.slug === p.slug);
  return list.sort((a, b) => (a.at < b.at ? 1 : -1)).map((m) => {
    const p = m.proposal, r = m.proposalResult;
    let state;
    if (isOpen(m)) state = "waiting on Luke";
    else if (!r && m.resolved && low(m.resolved.note) !== PROPOSE_YES) state = "Luke said no";
    else if (r && !r.done) state = `not sent: ${r.error || "it could not be sent"}`;
    else if (r && r.build && !r.build.ok) state = `not done: GitHub's build stopped at "${r.build.step}": ${r.build.reason}`;
    else if (live(p)) state = "live";
    else if (r && r.build && r.build.ok) state = "built by GitHub: going live in a minute or two";
    else state = `sent to GitHub ${r && r.at ? spStamp(Date.parse(r.at)).slice(5) : ""}: not live yet` + (r && r.at && now - Date.parse(r.at) > 15 * 60000 ? " (over 15 minutes and no report from GitHub yet: tell Claude)" : "");
    return { id: m.id, asked: m.sp, by: m.from, what: p.action === "card" ? `home card: ${p.title}` : p.action === "track" ? `Spotify link on ${p.title}` : `new page: ${p.title}`,
      address: `badscandal.com/${p.slug}`, slug: p.slug, state };
  });
}

/* How each song-page build ended (A2, 17 Nov 2026, Webmaster: the /loveyou build failed and the desk never said
   "Not done"). For every request sent to GitHub in the last 3 days whose report hasn't been read, read it
   (songReports); the first time one is there it is kept on the question (proposalResult.build) and:
     failed -> ONE message from HQ to the bot that asked: "Not done: … stopped at "<step>": <why>" + the run link;
     worked, but other tests failed after it went live -> ONE message from HQ to Claude (they never block a page).
   The report is claimed in the same write that keeps it, so two checks at once tell once. Run by song_pages and
   the hourly job. Returns the reports read this time. */
export async function checkSongBuilds(store, now, roster) {
  if (!songReports) return [];
  const pending = (await listMessages(store, now, 2)).filter((m) => m.proposal && ["page", "track", "card"].includes(m.proposal.action) &&
    m.proposalResult && m.proposalResult.done && !m.proposalResult.build && now - Date.parse(m.proposalResult.at) < 3 * 86400000);
  const found = [];
  await Promise.all(pending.map(async (m) => {
    let rep = null;
    try { rep = await songReports(m.id); } catch { rep = null; }
    if (!rep || rep.msg !== m.id) return;
    const build = { ok: !!rep.ok, ...(rep.ok ? {} : { step: clean(rep.step, 40), reason: clean(rep.reason, 300) }), ...(rep.others ? { others: clean(rep.others, 400) } : {}),
      run: /^https:\/\/github\.com\//.test(rep.run || "") ? rep.run : "", at: new Date(now).toISOString() };
    let claimed = false;
    try {
      await mutate(store, msgKey(monthOfId(m.id)), [], (list) => {
        const x = list.find((y) => y.id === m.id);
        if (!x || !x.proposalResult || x.proposalResult.build) return { skip: true, value: null };
        x.proposalResult.build = build; claimed = true;
        return { value: x };
      });
    } catch { return; }
    if (!claimed) return;
    found.push({ id: m.id, ...build });
    const where = `badscandal.com/${m.proposal.slug}`, what = m.proposal.action === "card" ? `The home card change (${where})` : m.proposal.action === "track" ? `The Spotify link on ${where}` : where;
    try {
      if (!build.ok) await sendMessage(store, now, roster, { from: "HQ", to: m.from, needs: "none", re: m.id,
        text: `Not done: ${what} did not go live. GitHub's build stopped at "${build.step}": ${build.reason.replace(/[.\s]+$/, "")}. Nothing was published, so the site is as it was. Fix what it says, then ask again with song_page.` + (build.run ? ` Run: ${build.run}` : "") });
      else if (build.others) await sendMessage(store, now, roster, { from: "HQ", to: "Claude", needs: "none",
        text: `${where} went live, but ${build.others.replace(/^(\d+ other tests? failed|Other tests failed)/, (w) => w.charAt(0).toLowerCase() + w.slice(1))}. Fix them in the code.` + (build.run ? ` Run: ${build.run}` : "") });
    } catch {}
  }));
  return found;
}

/* ---------- covers on the desk (16 Nov 2026, Webmaster: a Drive link answered with a sign-in page) ----------
   Webmaster (or Nova) sends the cover itself (base64) or a link the site can open; the desk keeps it
   (covers/<id>.json: type + base64) and answers with a public link, https://badscandal.com/api/staff/cover/<id>.<ext>,
   for song_page. Only a real JPG, PNG or WebP, at least 1000 px on each side when its size can be read, 4 MB at
   most; the newest 40 are kept. A cover is public on purpose: it goes on the song page anyway. */
export const COVER_BOTS = ["Webmaster", "Nova"];
const COVER_MAX = 4 * 1024 * 1024;
const COVER_TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
function pictureOf(buf) {
  const b = Buffer.from(buf);
  if (b.length > 24 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.length > 12 && b.slice(0, 4).toString("latin1") === "RIFF" && b.slice(8, 12).toString("latin1") === "WEBP") return { ext: "webp", w: null, h: null };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const mk = b[i + 1];
      if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) return { ext: "jpg", h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      if (mk === 0xd8 || mk === 0x01 || (mk >= 0xd0 && mk <= 0xd7)) { i += 2; continue; }
      i += 2 + b.readUInt16BE(i + 2);
    }
    return { ext: "jpg", w: null, h: null };
  }
  return null;
}
export async function uploadCover(store, now, roster, a, fetchImpl = fetch) {
  const by = whoIs(a.by, roster);
  if (!COVER_BOTS.includes(by)) fail("Covers are uploaded by Webmaster (Nova may for him). Tell Webmaster. Nothing was saved.", "not_allowed");
  const song = clean(a.song, 120);
  if (!song) fail("Say which song the cover is for (song). Nothing was saved.");
  let buf;
  const b64 = String(a.image_base64 || "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (b64) {
    if (b64.length > Math.ceil(COVER_MAX / 3) * 4 + 8) fail("The picture is over 4 MB. Send a smaller JPG (3000 x 3000 at about 85% quality is fine). Nothing was saved.");
    buf = Buffer.from(b64, "base64");
  } else if (a.url) {
    const url = httpsLink(a.url);
    if (!url) fail("url must start with https://. Nothing was saved.");
    let res;
    try { res = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined }); } catch { fail("The site could not open that link. Send the picture itself in image_base64. Nothing was saved."); }
    if (!res.ok) fail(`That link answered ${res.status}. Send the picture itself in image_base64. Nothing was saved.`);
    if (Number((res.headers && res.headers.get && res.headers.get("content-length")) || 0) > COVER_MAX) fail("The picture is over 4 MB. Nothing was saved.");
    buf = Buffer.from(await res.arrayBuffer());
  } else fail("Send the cover as image_base64 or url: image_base64 = the file itself, url = a link the site can open without signing in. Nothing was saved.");
  if (buf.length > COVER_MAX) fail("The picture is over 4 MB. Send a smaller JPG (3000 x 3000 at about 85% quality is fine). Nothing was saved.");
  const pic = pictureOf(buf);
  if (!pic) fail("That is not a JPG, PNG or WebP picture (a share page or a sign-in page instead of the file?). Send the picture itself. Nothing was saved.");
  if (pic.w != null && (pic.w < 1000 || pic.h < 1000)) fail(`The picture is ${pic.w} x ${pic.h}: a cover needs at least 1000 pixels on each side (3000 x 3000 is best). Nothing was saved.`);
  const id = newId("c", now) + Math.floor(Math.random() * 1e4).toString(36);
  const at = new Date(now).toISOString();
  await store.setJSON(`covers/${id}.json`, { type: COVER_TYPES[pic.ext], b64: buf.toString("base64") });
  const gone = await mutate(store, "covers.json", [], (list) => {
    list.unshift({ id, ext: pic.ext, song, by, at, bytes: buf.length, w: pic.w, h: pic.h });
    const old = list.splice(40);
    return { value: old };
  });
  for (const x of gone || []) { try { await store.delete(`covers/${x.id}.json`); } catch {} }
  return { id, link: `https://badscandal.com/api/staff/cover/${id}.${pic.ext}`, width: pic.w, height: pic.h, bytes: buf.length, warnings: coverWarnings(pic.w, pic.h) };
}
/* GET /api/staff/cover/<id>.<ext>: public, the picture only, never anything else on the desk */
export async function coverResponse(store, name) {
  const m = /^(c[a-z0-9]{4,40})\.(jpg|png|webp)$/.exec(String(name || ""));
  const nf = () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  if (!m) return nf();
  let doc = null;
  try { doc = await store.get(`covers/${m[1]}.json`, { type: "json" }); } catch {}
  if (!doc || !doc.b64 || doc.type !== COVER_TYPES[m[2]]) return nf();
  return new Response(Buffer.from(doc.b64, "base64"), { status: 200, headers: { "content-type": doc.type, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });
}

/* Luke said "Yes, correct": apply it in his name. Returns {done, text} or {done:false, error}; never throws
   (the answer is already saved and the question closed). The bot that asked is told either way. */
async function applyProposal(store, now, roster, parent, via) {
  const p = parent.proposal, asker = parent.from, said = `proposed by ${asker}` + (via ? `, Luke said yes via ${via}` : "");
  let out;
  try {
    if (p.action === "page" || p.action === "track" || p.action === "card") {
      if (!songDispatch) throw new StaffError("The site is not connected to GitHub here, so nothing was built.");
      const job = p.action === "page" ? { kind: "new", slug: p.slug, title: p.title, date: p.date, cover: p.cover } : p.action === "card" ? { kind: "card", slug: p.slug } : { kind: "track", slug: p.slug, track: p.track };
      const d = await songDispatch({ ...job, by: asker, msg: parent.id });
      if (!d || !d.ok) throw new StaffError((d && d.error) || "GitHub could not be asked. Nothing was built.");
      out = { done: true, text: p.action === "card" ? `GitHub is putting ${p.title} on the home card now (about 2 minutes). Open badscandal.com to make sure.` : p.action === "page"
        ? `GitHub is building badscandal.com/${p.slug} now. It runs the song-page checks and puts it live in about 2 minutes; if a check fails nothing goes live and you get a "Not done" message here with the reason. Open the page to make sure, then mark your page step done with the link.`
        : `GitHub is putting the Spotify link on badscandal.com/${p.slug} now (about 2 minutes). Open the page to make sure the button says Listen on Spotify and opens the song.` };
    } else if (p.action === "profile") {
      /* L12: yes remembers the image. The platform changes only when the owner uploads it and records it. */
      out = { done: true, text: await approveProfile(store, now, p, asker, parent.id) };
    } else if (p.action === "add") {
      const r = await saveRelease(store, now, roster, { by: "Luke", title: p.title, date: p.date || "", pack: p.pack || {}, from: said });
      let sent = "";
      if (p.send) { const s = await sendRelease(store, now, roster, { by: "Luke", id: r.id, anyway: true }); sent = s.alreadyOut ? " It was recorded as already out." : " It went to the team: every bot has its steps."; }
      if (filled((p.pack || {}).lyrics)) await approveRelease(store, now, roster, { by: "Luke", via, id: r.id, what: "lyrics", msg: parent.id, words: `said yes to ${asker}'s lyrics` });
      out = { done: true, id: r.id, text: `${r.title} is on the desk${r.status === "draft" && !p.send ? " as a draft in the pipeline" : ""}.${sent}` + (filled((p.pack || {}).lyrics) ? " The lyrics are recorded as approved by Luke." : "") };
    } else {
      const cur = (await listReleases(store)).find((x) => x.id === p.id);
      if (!cur || cur.status === "cancelled") throw new StaffError(`${p.title} is no longer on the desk (or was cancelled).`);
      const b = p.before || { pack: {} };
      const moved = [];
      if ("title" in b && cur.title !== b.title) moved.push("the title");
      if ("date" in b && (cur.date || "") !== b.date) moved.push("the release day");
      for (const k of Object.keys(b.pack || {})) if (((cur.pack || {})[k] || "") !== b.pack[k]) moved.push(FIELD[k] ? FIELD[k].short : k);
      if (moved.length) throw new StaffError(`${joinWords(moved)} changed since ${asker} asked, so nothing was overwritten. ${asker}: look at it again and ask Luke again if it is still needed.`);
      const scheduled = cur.status === "scheduled";
      if (p.newTitle || Object.keys(p.pack || {}).length || (p.date && !scheduled)) await saveRelease(store, now, roster, { by: "Luke", id: p.id, ...(p.newTitle ? { title: p.newTitle } : {}), ...(p.date && !scheduled ? { date: p.date } : {}), pack: p.pack || {} });
      if (p.date && scheduled) await moveRelease(store, now, roster, { by: "Luke", id: p.id, date: p.date });
      if (p.send) await sendRelease(store, now, roster, { by: "Luke", id: p.id, anyway: true });
      const at = new Date(now).toISOString();
      await mutate(store, REL_KEY, [], (list) => { const r = list.find((x) => x.id === p.id); if (!r) return { skip: true, value: null }; logIt(r, at, "Luke", `Luke said yes to ${asker}'s changes` + (via ? ` (via ${via})` : "")); return { value: r }; });
      /* the lyrics he said yes to ARE the final lyrics (16 Nov 2026, Verse: the pack had 5x "fode" while Luke approved 4x) */
      const lyr = "lyrics" in (p.pack || {}) && filled(p.pack.lyrics);
      if (lyr) await approveRelease(store, now, roster, { by: "Luke", via, id: p.id, what: "lyrics", msg: parent.id, words: `said yes to ${asker}'s lyrics` });
      out = { done: true, id: p.id, text: `${p.newTitle || cur.title}: the changes are made${p.date && scheduled ? " (every open step moved with the new day, and the team is told)" : ""}${p.send ? "; it went to the team" : ""}.` + (lyr ? " The lyrics are recorded as approved by Luke." : "") };
    }
  } catch (e) { out = { done: false, error: e && e.message ? e.message : "it could not be applied" }; }
  try { await sendMessage(store, now, roster, { from: "HQ", to: asker, needs: "none", text: out.done ? `Done: Luke said yes. ${out.text}` : `Not done: ${out.error}` }); } catch {}
  return out;
}

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
      if (changed.includes("storeStatus") && values.storeStatus) storeEntry(r, { status: values.storeStatus, on: today, at, by });
      /* a step that needs a field (the Canvas): it applies once the field is filled, and stops applying when cleared */
      for (const st of r.steps || []) {
        const need = STEP[st.key] && STEP[st.key].needs;
        if (!need || !changed.includes(need)) continue;
        if (filled(r.pack[need]) && st.status === "skipped" && st.note === NEEDS_NOTE) { st.status = "todo"; st.note = ""; if (isDay(r.date)) { const want = addDays(r.date, -STEP[st.key].days); st.due = want < today ? today : want; } }
        else if (!filled(r.pack[need]) && st.status === "todo") { st.status = "skipped"; st.note = NEEDS_NOTE; }
      }
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
    const s = scheduleSteps(r.date, today, { alreadyOut, labelDelivers: labelDelivers(r.pack), prevDate: prevReleaseDate(list, r.id, r.date), pack: r.pack });
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
    reorderPages(list, today, at);
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
      const s = scheduleSteps(date, today, { prevDate: prevReleaseDate(list, r.id, date) });
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
    reorderPages(list, today, at);
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
    reorderPages(list, spDay(now), at);
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
  if (key === "storeStatus" && value === "rejected") fail("A rejection needs RouteNote's reason: use store_status with status rejected and the reason. Nothing was saved.");
  const at = new Date(now).toISOString();
  return mutate(store, REL_KEY, [], (list) => {
    const r = findRelease(list, a.id || a.song, { drafts: by === "Luke" || by === "Claude" });
    if (r.status === "cancelled") fail(`${r.title} was cancelled. Nothing was saved.`);
    r.pack = r.pack || {};
    if (r.pack[key] === value) return { skip: true, value: r };
    const had = filled(r.pack[key]);
    if (key === "storeStatus") storeEntry(r, { status: value, on: spDay(now), at, by });
    r.pack[key] = value; r.updatedAt = at;
    logIt(r, at, by, `${by} ${had ? "changed" : "filled"} ${f.short}`);
    return { value: r };
  });
}

/* the step's owner, Nova, Claude or Luke marks a step. A bot's mark is also a line in the live log. */
export async function setStep(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  const today0 = spDay(now);
  const status = low(a.status);
  if (!STEP_STATUS.includes(status)) fail(`status must be one of: ${STEP_STATUS.join(", ")}. Use done only when it is really done.`);
  /* done_on (14 Nov 2026, batch 3): the real day it was done, when that was before today (a pack sent
     late: the upload was done days earlier, and must not read "done today") */
  const doneOn = a.done_on != null && String(a.done_on).trim() ? clean(a.done_on, 10) : "";
  if (doneOn && !isDay(doneOn)) fail("done_on must be a date written YYYY-MM-DD, for example 2026-11-09. Nothing was saved.");
  if (doneOn && status !== "done") fail("done_on goes only with status done: the day the step was really done. Nothing was saved.");
  if (doneOn && doneOn > today0) fail(`done_on can't be in the future (${dayWords(doneOn)}). Nothing was saved.`);
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
    /* the pitch can't really have gone out before the song shows in Spotify for Artists (11 Nov 2026), the
       ads before the song page is live, the lyrics before the song is out (15 Nov 2026): a bot is told what
       comes first; Luke and Claude may still record what they know */
    const w = waitingFor(r.steps, st, r.date, today0);
    if (w && status === "done" && !PEOPLE.includes(by)) fail(`"${st.label}" ` + (w.key === "release" ? (st.key === "ads" ? `waits for the release day (${dayWords(r.date)}): the ads are made with Luke once the song is out, never before and never alone.` : `waits for the release day (${dayWords(r.date)}): the lyrics go on Musixmatch once the song is out and shows there. Not showing yet is not a block.`)
      : `is waiting for "${w.label}" (${w.owner}): it can't be done before that.` + (w.key === "spotify" ? " When the song shows as upcoming in Spotify for Artists, Atlas reports it with spotify_upcoming and the pitch opens." : w.key === "page" ? " The ads link to the song page (badscandal.com/<song>, with the Meta pixel), so they start once Webmaster has it live." : "")), "waiting");
    /* L7: the one-pitch rule is not undone by marking the skipped pitch done */
    if (st.key === "pitch" && status === "done" && st.status === "skipped" && st.rule === ONE_PITCH) fail(`${st.note || "This song is not pitched: another song is the one pitched in these two weeks."} Nothing was saved.`);
    if (st.status === status && st.note === note && (!link || st.link === link) && (!doneOn || st.doneOn === doneOn)) return { skip: true, value: { release: r, st, changed: false } };
    Object.assign(st, { status, note, ...(link ? { link } : {}), at, by });
    if (doneOn) st.doneOn = doneOn; else if (status !== "done") delete st.doneOn; /* reopened: the old day goes with it */
    if (finished(st)) freeWaiting(r, st.key, today);
    /* the song page's link goes in the pack's page too (16 Nov 2026) */
    if (st.key === "page" && status === "done" && link && !filled((r.pack || {}).page)) { r.pack = r.pack || {}; r.pack.page = link; }
    r.updatedAt = at;
    logIt(r, at, by, `${by}: ${st.label} — ${status === "todo" ? "reopened" : status}` + (doneOn ? ` on ${dayWords(doneOn)}` : "") + (note ? ` (${note})` : ""));
    return { value: { release: r, st, changed: true } };
  });
  if (changed && !PEOPLE.includes(by)) {
    try {
      await postUpdate(store, now, roster, { bot: by, status: status === "todo" || status === "skipped" ? "info" : status, message: `${r.title}: ${st.label} — ${status === "todo" ? "reopened" : status}` + (note ? `: ${note}` : ""), link: st.link }, { release: r.id });
    } catch {} /* the step is saved; a full live log must not undo it */
  }
  return r;
}

/* L7 (18 Nov 2026): Atlas records a pitch he already sent, or an editorial playlist he saw in Spotify
   for Artists. This never sends a pitch and never calls Spotify. pitched_on marks the pitch step done
   on that day (the one-pitch rule then applies again). playlist + added_on is kept once the song is out. */
export async function logPitch(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  if (!PITCH_LOGGERS.includes(by)) fail("Only Atlas records a Spotify pitch or an editorial playlist (Nova may record it for him). HQ never pitches a song: Atlas sends it in Spotify for Artists, then records it here.", "not_allowed");
  const pitchedOn = a.pitched_on != null && String(a.pitched_on).trim() ? clean(a.pitched_on, 10) : "";
  const playlist = clean(a.playlist, 80);
  const addedOn = a.added_on != null && String(a.added_on).trim() ? clean(a.added_on, 10) : "";
  if (!pitchedOn && !playlist) fail("Say what you saw. pitched_on is the day you sent the pitch, YYYY-MM-DD. Or playlist is the editorial playlist's name, with added_on. Nothing was saved.");
  if (addedOn && !playlist) fail("added_on goes with playlist: the editorial playlist's name, as Spotify for Artists shows it. Nothing was saved.");
  if (pitchedOn && !isDay(pitchedOn)) fail("pitched_on must be the day you sent the pitch, written YYYY-MM-DD. Nothing was saved.");
  if (playlist && playlist.length < 2) fail("playlist must be the editorial playlist's name, as Spotify for Artists shows it. Nothing was saved.");
  if (playlist && !addedOn) fail("added_on is the day the song was added to that playlist, YYYY-MM-DD. Nothing was saved.");
  if (addedOn && !isDay(addedOn)) fail("added_on must be a date written YYYY-MM-DD. Nothing was saved.");
  const today = spDay(now), at = new Date(now).toISOString();
  if (pitchedOn && pitchedOn > today) fail(`pitched_on can't be in the future (${dayWords(pitchedOn)}). Nothing was saved.`);
  if (addedOn && addedOn > today) fail(`added_on can't be in the future (${dayWords(addedOn)}). Nothing was saved.`);
  if (playlist) noSecrets(playlist);
  const out = await mutate(store, REL_KEY, [], (list) => {
    const r = findRelease(list, a.song || a.id, { drafts: by === "Luke" || by === "Claude" });
    if (r.status === "cancelled") fail(`${r.title} was cancelled. Nothing was saved.`);
    if (r.status !== "scheduled") fail(`${r.title} has not been sent to the team yet. Nothing was saved.`);
    let pitchChange = "", editChange = "", changed = false;
    if (pitchedOn) {
      const st = (r.steps || []).find((s) => s.key === "pitch");
      if (!st) fail(`${r.title} has no Spotify pitch step. Nothing was saved.`);
      if (st.status === "skipped" && st.rule === ONE_PITCH) fail(`${st.note || "This song is not pitched: another song is the one pitched in these two weeks."} Nothing was saved.`);
      if (r.alreadyOut || (st.status === "skipped" && st.note === OUT_NOTE)) fail(`${r.title} was already out when it was recorded, so there is no pitch to log. Nothing was saved.`);
      const w = waitingFor(r.steps, st, r.date, today);
      if (w && !PEOPLE.includes(by)) fail(`The pitch is waiting for "${w.label}": it can't be sent before that. When the song shows as upcoming in Spotify for Artists, report it with spotify_upcoming. Nothing was saved.`, "waiting");
      if (!(st.status === "done" && pitchedOnOf(st) === pitchedOn)) {
        Object.assign(st, { status: "done", at, by, doneOn: pitchedOn });
        freeWaiting(r, "pitch", today);
        logIt(r, at, by, `${by} recorded the Spotify pitch: sent ${dayWords(pitchedOn)}`);
        pitchChange = pitchedOn;
        changed = true;
        pitchRule(list, today, at);
      }
    }
    if (playlist) {
      if (!isDay(r.date) || r.date > today) fail(`Editorial playlist adds are recorded once ${r.title} is out${r.date ? ` (${dayWords(r.date)})` : ""}. Nothing was saved.`);
      if (addedOn < r.date) fail(`added_on (${dayWords(addedOn)}) is before the release day (${dayWords(r.date)}). Nothing was saved.`);
      const eds = Array.isArray(r.editorial) ? r.editorial : [];
      if (!eds.some((e) => isDay(e.date) && e.date === addedOn && samePlay(e.name, playlist))) {
        eds.push({ name: playlist, date: addedOn, by, at });
        r.editorial = eds.slice(-EDITORIAL_CAP);
        logIt(r, at, by, `${by} recorded an editorial playlist: ${playlist} (${dayWords(addedOn)})`);
        editChange = playlist;
        changed = true;
      }
    }
    if (!changed) return { skip: true, value: { release: r, already: true, pitchChange: "", editChange: "" } };
    r.updatedAt = at;
    return { value: { release: r, already: false, pitchChange, editChange } };
  });
  if (!out.already && !PEOPLE.includes(by)) {
    const bits = [out.pitchChange ? `Spotify pitch recorded, sent ${dayWords(out.pitchChange)}` : "", out.editChange ? `editorial playlist ${out.editChange}` : ""].filter(Boolean);
    try { await postUpdate(store, now, roster, { bot: by, status: "info", message: `${out.release.title}: ${bits.join("; ")}` }, { release: out.release.id }); } catch {}
  }
  return { ...out, view: releaseView(out.release, today) };
}

/* Drop (Nova, Claude, Luke): where the song is at the distributor, from the fixed list, with history.
   A rejection carries RouteNote's reason in its words. on = the day it happened, when not today.
   ready_to_resubmit (only while it is rejected): asks Luke "Ready to resubmit?" as ONE decision (Yes,
   resubmit / Not yet); his answer goes back to Drop like any answer. Asked again while that is open, the
   same question is returned, not a second one. */
export async function setStoreStatus(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  if (!["Drop", "Nova", "Claude", "Luke"].includes(by)) fail("The status at the distributor is Drop's to keep (Nova may set it for him). If it is wrong, tell Drop.", "not_allowed");
  const status = storeWord(clean(a.status, 40));
  if (!status) fail(`status must be one of: ${STORE_STATUS.join(", ")} (RouteNote's "Pending Moderation" or "In review" = in moderation, "Action needed" = rejected). Nothing was saved.`);
  const reason = cleanText(a.reason, 300), note = cleanText(a.note, 300);
  const today = spDay(now), at = new Date(now).toISOString();
  const on = a.on != null && String(a.on).trim() ? clean(a.on, 10) : today;
  if (!isDay(on)) fail("on must be a date written YYYY-MM-DD, for example 2026-11-12. Nothing was saved.");
  if (on > today) fail(`on can't be in the future (${dayWords(on)}). Nothing was saved.`);
  noSecrets(reason, note);
  const ready = a.ready_to_resubmit === true || low(a.ready_to_resubmit) === "true";
  if (ready && status !== "rejected") fail("ready_to_resubmit goes only after a rejection, with status rejected: it asks Luke whether to resubmit. Nothing was saved.");
  const out = await mutate(store, REL_KEY, [], (list) => {
    const r = findRelease(list, a.id || a.song, { drafts: by === "Luke" || by === "Claude" });
    if (r.status === "cancelled") fail(`${r.title} was cancelled. Nothing was saved.`);
    const cur = storeOf(r);
    /* asking Luke about a rejection already recorded: no new entry (the note goes in the question) */
    if (ready && cur.status === "rejected" && !reason) return { skip: true, value: { release: r, store: cur } };
    if (status === "rejected" && reason.length < 3) fail("A rejection needs its reason: write what RouteNote said, in its words, in reason. Nothing was saved.");
    /* the same status again with nothing new: no new entry */
    if (cur.status === status && !reason && !note && on === today) return { skip: true, value: { release: r, store: cur } };
    storeEntry(r, { status, on, at, by, reason, note });
    r.updatedAt = at;
    logIt(r, at, by, `${by}: at the distributor: ${status}` + (on !== today ? ` on ${dayWords(on)}` : "") + (reason ? ` (${reason})` : ""));
    return { value: { release: r, store: storeOf(r) } };
  });
  if (!ready) return out;
  const r = out.release, st = storeOf(r);
  const open = (await listMessages(store, now)).find((m) => m.ask === "resubmit" && m.release === r.id && isOpen(m));
  if (open) return { ...out, asked: open.id, already: true };
  const sentMsg = await sendMessage(store, now, roster, { from: by, to: "Luke", needs: "decision", options: RESUBMIT_OPTIONS, release: r.id, ask: "resubmit",
    text: `${r.title} (out ${dayWords(r.date)}): ready to resubmit to the distributor? It was rejected` + (st.reason ? `: "${st.reason}"` : "") + "." + (note ? ` What changed: ${note}` : "") });
  return { ...out, asked: sentMsg.message.id, already: false };
}

/* Luke approves the pitch or the final lyrics (batch 3): who, when, the exact text. Through Alfred: via
   "Alfred" and Luke's own words. The lyrics are approved as they are in the pack at that moment (the view
   says when they changed since). withdraw: takes the approval back. Nobody else approves. */
export async function approveRelease(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  if (by !== "Luke") fail("Only Luke approves the pitch or the final lyrics. Ask him with send_message and approval, and his answer records it.", "not_allowed");
  const what = low(a.what);
  if (!APPROVALS[what]) fail("what must be pitch or lyrics.");
  const via = a.via ? whoIs(a.via, roster) : "";
  const words = cleanText(a.words, 600);
  const at = new Date(now).toISOString();
  let text = "";
  if (!a.withdraw && what === "pitch") {
    text = cleanText(a.text, 3000);
    if (text.length < 10) fail("Write the pitch itself, exactly as it is approved, in text. Nothing was saved.");
    noSecrets(text);
  }
  return mutate(store, REL_KEY, [], (list) => {
    const r = list.find((x) => x.id === clean(a.id, 60)) || findRelease(list, a.id || a.song);
    if (r.status === "cancelled") fail(`${r.title} was cancelled. Nothing was saved.`);
    r.approvals = r.approvals || {};
    if (a.withdraw) {
      /* 18 Nov 2026, Luke: a Spotify pitch that has been sent can't be undone */
      if (what === "pitch" && (r.steps || []).some((s) => s.key === "pitch" && s.status === "done")) fail(`The Spotify pitch for ${r.title} was already sent. A sent pitch can't be taken back. Nothing was changed.`);
      if (!r.approvals[what]) return { skip: true, value: r };
      delete r.approvals[what]; r.updatedAt = at;
      logIt(r, at, by, `Luke took back the approval: ${APPROVALS[what].label.toLowerCase()}`);
      return { value: r };
    }
    if (what === "lyrics") {
      text = (r.pack || {}).lyrics || "";
      if (!filled(text)) fail(`There are no lyrics in the pack for ${r.title} yet: Luke fills them in first. Nothing was saved.`);
    }
    r.approvals[what] = { by: "Luke", ...(via ? { via } : {}), at, text, ...(words ? { words } : {}), ...(a.msg ? { msg: clean(a.msg, 20) } : {}) };
    r.updatedAt = at;
    logIt(r, at, by, `Luke approved the ${what === "pitch" ? "pitch" : "final lyrics"}` + (via ? ` (via ${via})` : ""));
    return { value: r };
  });
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
export function workers(roster, { hq, updates, messages, cards, seen, today, nowHM, releases = [], deskUpdates = [] }) {
  const duties = (hq && hq.team && hq.team.duties && hq.team.duties.byOwner) || [];
  const tasks = (hq && hq.team && hq.team.tasks) || [];
  return roster.map((b) => {
    const k = low(b.name);
    const mine = duties.find((d) => low(d.owner) === k);
    const items = mine ? mine.items : [];
    /* the shared live log keeps the newest 40 lines only: a bot's own last word is looked up in the desk's
       full list too (16 Nov 2026, Steve and Verse read "none yet" after a busy morning) */
    const last = updates.find((u) => low(u.bot) === k) || deskUpdates.find((u) => low(u.bot) === k) || null;
    const todays = updates.filter((u) => low(u.bot) === k && u.sp.slice(0, 10) === today);
    const open = tasks.filter((t) => low(t.owner) === k);
    const asks = waitingOn(messages, b.name);
    const relSteps = releases.filter(releaseActive).flatMap((r) => r.steps.filter((s) => !finished(s) && low(s.owner) === k)
      .map((s) => ({ id: r.id, title: r.title, key: s.key, label: s.label, due: s.due, dueIn: s.dueIn, status: s.status, late: s.late, note: s.note || "", waiting: !!s.waiting,
        ...(s.waitingFor ? { waitingFor: s.waitingFor, waitingText: s.waitingText } : {}), ...(s.link ? { link: s.link } : {}), ...(s.key === "live" && r.pack && r.pack.spotifyTrack ? { spotifyTrack: r.pack.spotifyTrack } : {}) })))
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
      blockers: cards[k] && typeof cards[k].blockers === "string" ? cards[k].blockers : b.blockers || "", paused: b.state === "paused", state, duties: items, tasks: open.slice(0, 12), lateTasks: open.filter((t) => t.late).length,
      last: last ? { at: last.sp, status: last.status, message: last.message, link: last.link } : null, updatesToday: todays.length,
      card: cardNow(cards[k], today), waiting: asks.map((m) => ({ id: m.id, from: m.from, text: m.text.slice(0, 200), needs: m.needs, at: m.sp })),
      releaseSteps: relSteps, seen: s ? s.at : null, connected: !!s };
  });
}

/* a card's "needs" not said again for 2 days stops being an ask (14 Nov 2026, the bots: "needs Luke"
   text written once never cleared); it is kept as oldNeeds */
function cardNow(card, today) {
  if (!card) return null;
  const day = card.at ? spDay(Date.parse(card.at)) : null;
  return card.needs && day && daysBetween(day, today) >= 2 ? { ...card, needs: "", oldNeeds: card.needs } : card;
}
export async function loadDesk(store, now) {
  const [roster, updates, messages, cardsDoc, config, releases, sightings] = await Promise.all([getRoster(store), listUpdates(store, now, 3), listMessages(store, now, 2), readDoc(store, "cards.json", {}), getConfig(store), listReleases(store), getSightings(store)]);
  const [seen, read, income, closesDoc, profiles] = await Promise.all([getSeen(store, roster), getRead(store, roster), incomeState(store, now), readDoc(store, "closes.json", []), getProfiles(store)]);
  return { roster, updates, messages, cards: cardsDoc.data || {}, seen, read, income, config, releases, sightings, closes: Array.isArray(closesDoc.data) ? closesDoc.data : [], profiles };
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
  /* the approved lyrics are lyrics too: their length only */
  const ap = v.approvals && v.approvals.lyrics ? (({ text, ...rest }) => ({ ...rest, textChars: String(text || "").length }))(v.approvals.lyrics) : null;
  return { ...v, pack, lyricsChars: lyrics ? String(lyrics).length : 0, log: [], logCount: (v.log || []).length, slim: true, ...(v.approvals ? { approvals: { ...v.approvals, lyrics: ap } } : {}) };
}
/* what the page needs to build the form and the pipeline without hard-coding either */
export const packFieldsOut = () => PACK_FIELDS.map((f) => ({ key: f.key, label: f.label, short: f.short, kind: f.kind, required: f.required, requiredWhen: f.requiredWhen, showWhen: f.showWhen, neededBy: f.neededBy, choices: f.choices, hint: f.hint, fill: f.fill, group: f.group, max: f.max }));
export const releaseStepsOut = () => RELEASE_STEPS.map((s) => ({ key: s.key, label: s.label, owner: s.owner, days: s.days, ...(s.after ? { after: s.after } : {}), ...(s.fromRelease ? { fromRelease: true } : {}) }));

/* What is waiting on Luke (12 Nov 2026, the HQ apps): ONE rule for the app badge, GET
   /api/hq/push/waiting and the push alerts (netlify/lib/push.mjs). luke_briefing keeps its own output.
     message  an open question to Luke (needs decision / reply / action, not settled)  -> #messages/<id>
     spotify  a song in Spotify for Artists Luke has to say something about (unknown or retry) -> #releases
   The text shows on a lock screen: it says who and what kind, NEVER the message itself (no amounts,
   payers, account names or lyrics). Oldest first. now (optional) = the clock for the sightings' claims. */
const ASKS = { decision: "asked you to decide something", reply: "is waiting for your reply", action: "needs you to do something" };
export function waitingOnLuke(desk, today, now = null) {
  const out = [];
  for (const m of waitingOn(desk.messages || [], "Luke")) {
    if (!ASKS[m.needs]) continue;
    out.push({ key: "m:" + m.id, kind: "message", id: m.id, text: `${clean(m.from, 40)} ${ASKS[m.needs]}`, href: "#messages/" + m.id, at: m.at || null });
  }
  const sv = sightingsView(desk.sightings || null, desk.releases || [], today, now);
  for (const x of sv.items) {
    if (x.state !== "unknown" && x.state !== "retry") continue;
    out.push({ key: "s:" + x.key, kind: "spotify", id: x.key, text: `${clean(x.title, 80)} is in Spotify for Artists: say what it is`, href: "#releases", at: x.firstSeen || null });
  }
  return out.sort((a, b) => (a.at == null ? 1 : b.at == null ? -1 : a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

export function board(desk, now, hq) {
  const today = spDay(now), nowHM = spHM(now);
  const views = (desk.releases || []).map((r) => releaseView(r, today, { sightings: desk.sightings || null }));
  const read = desk.read || {};
  const mark = (m) => ({ ...m, ...readMark(read, desk.roster, m) });
  /* one log: when the sheet was read, its Updates tab and the connector are already merged there
     (hqModel -> team.live.feed), so a bot that still writes only the sheet is not shown as silent */
  const live = hq && hq.team && hq.team.live && hq.team.live.ready ? hq.team.live.feed : null;
  const updates = live ? live.map((u) => ({ sp: u.at, at: u.at, bot: u.bot, status: u.status, message: u.message, link: u.link || "" })) : desk.updates;
  const staff = workers(desk.roster, { hq, updates, messages: desk.messages, cards: desk.cards, seen: desk.seen, today, nowHM, releases: views, deskUpdates: desk.updates || [] });
  const lastSeen = Object.entries(desk.seen).filter(([n]) => n !== "Claude").sort((a, b) => (a[1].at < b[1].at ? 1 : -1))[0] || null;
  return {
    today, now: spStamp(now), staff,
    updates: updates.slice(0, 60),
    messages: threads(desk.messages).slice(0, 80).map((t) => ({ ...mark(t), replies: t.replies.map(mark) })),
    answered: answeredByLuke(desk.messages, read, now),
    releases: releaseOrder(views).slice(0, 20).map(slimRelease), pitchSlots: pitchSlots(views, today), packFields: packFieldsOut(), releaseSteps: releaseStepsOut(),
    profiles: profilesView(desk.profiles || {}, desk.messages || []), /* L12 */
    sightings: sightingsView(desk.sightings || null, desk.releases || [], today, now),
    waiting: { luke: waitingOn(desk.messages, "Luke"), claude: waitingOn(desk.messages, "Claude"), bots: desk.messages.filter((m) => isOpen(m) && !PEOPLE.includes(m.to)).length },
    income: desk.income,
    closes: desk.closes || [], /* A7, 17 Nov 2026: the closed months (closes.json) */
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
  else if (hq) problems.push("Duties: the Tasks tab has no duty rows for today" + (dutyResetTime(desk.roster) ? ` (Nova resets them at ${dutyResetTime(desk.roster)})` : ""));
  else problems.push("Duties: not read (the team's sheet could not be read)");
  /* a bot whose duty times on the board match none of its card's times (batch 5: Webmaster showed as both
     09:10 and 09:20): named, so Nova or the card is put right. A second duty at another hour (Forge's
     evening cap check) is fine as long as one matches. */
  for (const w of withDuty) {
    const card = [w.time, ...(w.schedule || []).map((x) => x.time)].filter((t) => /^\d{2}:\d{2}$/.test(t || ""));
    const off = w.duties.filter((x) => x.due && card.length && !card.includes(x.due));
    if (off.length && off.length === w.duties.filter((x) => x.due).length && w.time) problems.push(`Times disagree: ${w.name}'s duty is due ${off.map((x) => x.due).join(", ")} on the board, ${w.time} on the team card`);
  }
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
  lines.push(`Income received this month: ${cur(inc.received)}`); /* received only (Luke, 16 Nov 2026) */
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
    for (const st of v.steps) if (st.status === "blocked" && !blockIsWait(st)) problems.push(`${v.title}: ${st.label} is blocked (${st.owner})` + (st.note ? `: ${st.note.replace(/\s+/g, " ").slice(0, 120)}` : ""));
    /* the warnings that say what lateness MEANS (V5): said instead of the plain late line for that step */
    const warn = warningsOf(v, sightings, today).filter((w) => ["today", "twice", "rejected", "pitch", "spotify", "date", "without", "split"].includes(w.kind));
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
