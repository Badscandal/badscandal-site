/* L5 watchers (18 Nov 2026): RouteNote mail, Verse's release-day note, Content ID claims.
   Every title, address and claim here is made up. HQ does not send email, does not change an ad,
   and does not invent a status or a claim it was not given. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";

await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const NOW = Date.parse("2026-11-18T15:00:00Z"); /* Wed 18 Nov, 12:00 in São Paulo */
const DAY = 86400000;
const R = S.DEFAULT_ROSTER;
const FULL = { kind: "Self-release", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", language: "Portuguese", explicit: "No", genre: "Dance", writers: "Sample Writer: music and lyrics", copyright: "℗ 2026 Sample · © 2026 Sample", lyrics: "la la sample line" };
const call = (d, name, args, now = NOW) => callTool(TOOLS.find((t) => t.name === name), args, { store: d, now, role: "bot", hq: async () => null });

async function sent(d, title, date, now = NOW) {
  const r = await S.saveRelease(d, now, R, { by: "Luke", title, date, pack: FULL });
  return (await S.sendRelease(d, now, R, { by: "Luke", id: r.id })).release;
}
const to = async (d, who, now = NOW + DAY) => (await S.listMessages(d, now)).filter((m) => m.to === who);

test("RouteNote mail is not connected: no key the site already has can read a mailbox", () => {
  const src = S.routeNoteMailSource({ GOOGLE_SA_KEY: "not-a-mailbox", META_ADS_TOKEN: "not-a-mailbox" });
  assert.equal(src.connected, false);
  assert.equal(src.line, "not connected");
  assert.deepEqual(src.messages, []);
  assert.match(src.steps, /read-only/);
  assert.match(src.steps, /does not invent/);
  assert.equal(JSON.stringify(src).includes("not-a-mailbox"), false, "a key is never copied into the answer");
  const line = L.routeMailLine(src, { store: { status: "approved", since: "2026-11-01" } });
  assert.equal(line, "RouteNote email: not connected");
  /* 18 Nov 2026 (Luke): RouteNote's emails reach his own inbox, so Needs you has no "not connected" card */
  const phone = L.phoneWatchers({ mail: src, waiting: { luke: [] } });
  assert.equal(phone.length, 0);
});

test("a RouteNote email sets that release's status, notes Drop once, and asks Luke only when he must act", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Paper Moon", "2026-12-18");
  const approved = { id: "mail-ok-1", from: "noreply@routenote.example", subject: "Your release has been approved", date: "2026-11-17", body: "Paper Moon has been approved." };
  const first = await S.applyRouteNoteMail(d, NOW, R, [approved, { id: "other-1", from: "friend@example.com", subject: "lunch", body: "Paper Moon tomorrow" }]);
  assert.equal(first.filter((x) => x.applied).length, 1);
  let view = S.releaseView((await S.listReleases(d)).find((x) => x.id === r.id), "2026-11-18");
  assert.equal(view.store.status, "approved");
  assert.equal(view.mail.status, "approved");
  assert.equal(view.mail.source, "email");
  assert.equal(L.routeMailLine({ connected: true }, view), "RouteNote email: approved · Tue 17 Nov");
  const drop = await to(d, "Drop");
  assert.equal(drop.length, 1);
  assert.match(drop[0].text, /Paper Moon is approved/);
  assert.match(drop[0].text, /did not email/);
  assert.equal((await to(d, "Luke")).length, 0, "an approval does not need Luke");
  const again = await S.applyRouteNoteMail(d, NOW + 1000, R, [approved]);
  assert.equal(again[0].already, true);
  assert.equal((await to(d, "Drop", NOW + DAY)).length, 1, "the same email is not a second note");

  const rejected = { id: "mail-no-1", from: "support@routenote.example", subject: "Action required: Paper Moon", date: "2026-11-18", body: "Action required. The artwork has a web address on it." };
  await S.applyRouteNoteMail(d, NOW + 2000, R, [rejected]);
  view = S.releaseView((await S.listReleases(d)).find((x) => x.id === r.id), "2026-11-18");
  assert.equal(view.store.status, "rejected");
  assert.match(view.store.reason, /web address/);
  assert.equal(view.mail.needsLuke, true);
  const luke = await to(d, "Luke", NOW + DAY);
  assert.equal(luke.length, 1);
  assert.equal(luke[0].ask, "routenote");
  assert.equal(luke[0].needs, "action");
  assert.match(luke[0].text, /web address/);
  const drop2 = await to(d, "Drop", NOW + DAY);
  assert.equal(drop2.length, 2);
  assert.match(drop2[0].text, /Drafted fix/);
  assert.match(drop2[0].text, /web address/);
  assert.equal(drop2[0].text.includes("la la sample"), false, "lyrics never leave the pack");
  const phone = L.phoneWatchers({ mail: { connected: true, line: "connected" }, waiting: { luke } });
  assert.equal(phone.some((x) => x.kind === "connect"), false);
  assert.equal(phone.filter((x) => x.kind === "routenote").length, 1);
  await S.applyRouteNoteMail(d, NOW + 3000, R, [rejected]);
  assert.equal((await to(d, "Luke", NOW + DAY)).length, 1);
  assert.equal((await to(d, "Drop", NOW + DAY)).length, 2);
});

test("a RouteNote email with no known status, or no matching song, changes no card", async () => {
  const d = memoryDesk();
  await sent(d, "Paper Moon", "2026-12-18");
  const odd = { id: "mail-odd", from: "noreply@routenote.example", subject: "Hello from RouteNote", body: "Please see your account. Paper Moon is listed." };
  const nomatch = { id: "mail-miss", from: "noreply@routenote.example", subject: "Action required", body: "Action required. The artwork has a web address on it." };
  await S.applyRouteNoteMail(d, NOW, R, [odd, nomatch]);
  const view = S.releaseView((await S.listReleases(d))[0], "2026-11-18");
  assert.equal(view.store.status, "", "no status was invented");
  assert.equal(view.mail, null);
  const drop = await to(d, "Drop");
  assert.equal(drop.length, 2);
  assert.match(drop.find((m) => m.mailId === "mail-odd").text, /not reported/);
  assert.match(drop.find((m) => m.mailId === "mail-miss").text, /could not match/);
  assert.equal((await to(d, "Luke")).some((m) => m.mailId === "mail-odd#luke"), false);
  assert.equal((await to(d, "Luke")).some((m) => m.mailId === "mail-miss#luke"), true, "a rejection HQ cannot place still needs Luke");
});

test("an email that looks like a password is dropped and never stored", async () => {
  const d = memoryDesk();
  await sent(d, "Paper Moon", "2026-12-18");
  const bad = { id: "mail-secret", from: "noreply@routenote.example", subject: "Action required: Paper Moon", body: "password: hunter42x and the artwork has a web address" };
  const out = await S.applyRouteNoteMail(d, NOW, R, [bad]);
  assert.equal(out[0].skipped, "secret");
  const msgs = await S.listMessages(d, NOW + DAY);
  assert.equal(msgs.some((m) => m.mailId === "mail-secret" || /hunter42x/.test(m.text || "")), false, "the password is not written on the desk");
  assert.equal(S.releaseView((await S.listReleases(d))[0], "2026-11-18").store.status, "");
});

test("on the release day, São Paulo time, Verse gets one duty note and not the lyrics", async () => {
  const d = memoryDesk();
  const today = "2026-11-18";
  const r = await sent(d, "Paper Moon", today);
  const before = await S.verseReleaseDay(d, NOW - DAY, R);
  assert.equal(before.length, 0, "the day before is not release day");
  const first = await S.verseReleaseDay(d, NOW, R);
  assert.equal(first.length, 1);
  assert.equal(first[0].sent, true);
  const second = await S.verseReleaseDay(d, NOW + 60 * 60000, R);
  assert.equal(second[0].already, true);
  const notes = await to(d, "Verse", NOW + DAY);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].needs, "action");
  assert.match(notes[0].text, /Today's duty/);
  assert.match(notes[0].text, /Paper Moon/);
  assert.match(notes[0].text, /Musixmatch/);
  assert.equal(notes[0].text.includes("la la sample"), false);
  assert.equal((await to(d, "Luke", NOW + DAY)).length, 0);
  const view = S.releaseView((await S.listReleases(d)).find((x) => x.id === r.id), today);
  assert.equal(view.verseDuty.on, today);
  const after = await S.verseReleaseDay(d, NOW + DAY, R);
  assert.equal(after.length, 0, "the day after does not send another note");
  const day = await call(d, "my_day", { bot: "Verse" }, NOW);
  assert.equal(day.lyrics_duty.length, 1);
  assert.match(day.lyrics_duty[0], /Paper Moon/);
});

test("Content ID claims are only what Laura records, and the panel never invents one", async () => {
  const d = memoryDesk();
  assert.deepEqual(L.contentClaimRows(null), { reported: false, rows: [], empty: "No Content ID claim has been recorded." });
  assert.equal(L.contentClaimRows({ items: [] }).rows.length, 0);
  await assert.rejects(call(d, "log_growth", { bot: "Steve", date: "2026-11-18", claim: "Sample claim", claimant: "Sample Channel" }), /Laura/);
  const saved = await call(d, "log_growth", { bot: "Laura", date: "2026-11-17", claim: "Sample claim", claimant: "Sample Channel", impact: "one video flagged" });
  assert.equal(saved.saved, true);
  assert.equal(saved.duplicate, false);
  const again = await call(d, "log_growth", { bot: "Laura", date: "2026-11-17", claim: "Sample claim", claimant: "Sample Channel", impact: "one video flagged" });
  assert.equal(again.duplicate, true);
  const blank = await call(d, "log_growth", { bot: "Laura", date: "2026-11-16", claim: "Another sample claim" });
  assert.equal(blank.saved, true);
  const board = S.board(await S.loadDesk(d, NOW), NOW, null);
  const rows = L.contentClaimRows(board.claims);
  assert.equal(rows.reported, true);
  assert.equal(rows.rows.length, 2);
  const open = rows.rows.find((x) => x.claim === "Another sample claim");
  assert.equal(open.claimant, "not reported");
  assert.equal(open.impact, "not reported");
  assert.match(open.date, /16 Nov/);
  const full = rows.rows.find((x) => x.claim === "Sample claim");
  assert.equal(full.claimant, "Sample Channel");
  assert.equal(full.impact, "one video flagged");
  assert.equal(TOOLS.length, 51, "account_health, needs_you, song_pl (18 Nov 2026 night test) + profile_jobs, profile_master, profile_rework, profile_uploaded (PR #87)");
  assert.ok(TOOLS.find((t) => t.name === "log_growth").inputSchema.properties.claim);
});
