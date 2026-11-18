/* The bots' feedback, round 3 (16 Nov 2026, the bots' list + Luke):
   - Luke: "we should never put pending income only what is received"
   - Luke: "only one song can be pitched in two weeks ... in this case we won't pitch love you"
   - log_growth's change came from the order of the calls (12 and 13 Nov both +13): now from the day before
   - the store's own words (Pending Moderation, In review) and a status on a past day keep the history right
   - Spotify for Artists waits for RouteNote's approval; the song page is due a week before release at the latest
   - a pitch that went out reads as sent; a page step's link fills the pack's page; proposed lyrics Luke says
     yes to are the approved lyrics
   - my_day's last update, task_update's wording and "cancelled", the short briefing's sign-ins and problems
   All names and numbers are made up. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";
import { directLink } from "../tools/song-job.mjs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const NOW = Date.parse("2026-11-16T15:00:00Z"); /* Mon 16 Nov, 12:00 São Paulo */
const TODAY = "2026-11-16";
const MIN = 60000, DAY = 86400000;
const R = S.DEFAULT_ROSTER;
const fails = (p, re) => assert.rejects(p, (e) => e.name === "StaffError" && re.test(e.message));
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, o = {}) => callTool(tool(name), args, { store: d, now: o.now || NOW, role: "bot", hq: o.hq || (async () => null) });
const PACK = { kind: "Self-release", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", language: "English", explicit: "No", genre: "Dance",
  writers: "Sample Writer: music and lyrics", copyright: "℗ 2026 badscandal · © 2026 badscandal" };
async function sent(d, title, date, pack = PACK) {
  const r = await S.saveRelease(d, NOW, R, { by: "Luke", title, date, pack });
  return (await S.sendRelease(d, NOW, R, { by: "Luke", id: r.id })).release;
}
const rel = async (d, id) => (await S.listReleases(d)).find((x) => x.id === id);
const step = (r, k) => r.steps.find((s) => s.key === k);

/* ---------- log_growth: the change is the day before's saved total, whatever order the days come in ---------- */
test("log_growth: days logged out of order get the right change, and a resend corrects a wrong one", async () => {
  const d = memoryDesk();
  const g = (date, followers) => call(d, "log_growth", { bot: "Atlas", platform: "Spotify", date, followers: String(followers) });
  await g("2026-11-11", 1000);
  await g("2026-11-13", 1013);
  await g("2026-11-12", 1003);
  const rows = (await S.listGrowth(d, NOW, 2)).filter((x) => x.key === "g:spotify").sort((a, b) => (a.date < b.date ? -1 : 1));
  assert.deepEqual(rows.map((x) => [x.date, x.change]), [["2026-11-11", null], ["2026-11-12", 3], ["2026-11-13", 10]]);
  /* a row saved wrong before this fix: sending the same numbers again puts it right */
  await d.setJSON("grow/2026-11.json", (await d.get("grow/2026-11.json", { type: "json" })).map((x) => (x.date === "2026-11-12" ? { ...x, change: 13 } : x)));
  const again = await g("2026-11-12", 1003);
  assert.equal(again.duplicate, true);
  assert.deepEqual(again.changes_fixed, ["2026-11-12: +13 -> +3"]);
  assert.equal((await S.listGrowth(d, NOW, 2)).find((x) => x.key === "g:spotify" && x.date === "2026-11-12").change, 3);
});

/* ---------- one pitch in two weeks (Luke) ---------- */
test("one pitch in two weeks: the later song's pitch is skipped, saying why; it opens again if the earlier one moves away", async () => {
  const d = memoryDesk();
  const a = await sent(d, "Night Drive", "2026-12-04");
  const b = await sent(d, "Glass House", "2026-12-11");
  let nb = await rel(d, b.id);
  assert.equal(step(nb, "pitch").status, "skipped");
  assert.match(step(nb, "pitch").note, /^Not pitched: Night Drive \(out Fri 4 Dec\) is the song pitched in these two weeks/);
  assert.equal(step(await rel(d, a.id), "pitch").status, "todo");
  /* two weeks or more apart: both are pitched */
  const c = await sent(d, "Paper Moon", "2026-12-25");
  assert.equal(step(await rel(d, c.id), "pitch").status, "todo", "14 days after Glass House, whose pitch is skipped, and 21 after Night Drive");
  /* Night Drive moves to January: Glass House can be pitched again */
  await S.moveRelease(d, NOW, R, { by: "Luke", id: a.id, date: "2027-01-15" });
  nb = await rel(d, b.id);
  assert.deepEqual([step(nb, "pitch").status, step(nb, "pitch").note], ["todo", ""]);
  assert.equal(step(await rel(d, c.id), "pitch").status, "todo", "exactly 14 days after Glass House: fine");
  /* a pitch already sent is never touched */
  const v = S.releaseView(await rel(d, b.id), TODAY);
  assert.ok(v.steps.find((s) => s.key === "pitch"));
});

test("a release already on the desk gets the rule the next time the desk is read", async () => {
  const d = memoryDesk();
  const a = await sent(d, "Night Drive", "2026-12-04");
  const b = await sent(d, "Glass House", "2026-12-11");
  /* as it was before the rule: both open */
  await d.setJSON("releases.json", (await S.listReleases(d)).map((r) => (r.id === b.id ? { ...r, steps: r.steps.map((s) => (s.key === "pitch" ? { ...s, status: "todo", note: "", rule: undefined } : s)) } : r)));
  const up = await S.upgradeReleases(d, NOW);
  assert.deepEqual(up.changed.map((x) => x.id), [b.id]);
  assert.equal(step(await rel(d, b.id), "pitch").status, "skipped");
  assert.deepEqual((await S.upgradeReleases(d, NOW)).changed, [], "once");
  assert.ok(a);
});

/* ---------- Spotify for Artists waits for RouteNote ---------- */
test("Spotify for Artists waits while RouteNote has not approved the song", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Night Drive", "2026-12-11");
  let v = S.releaseView(await rel(d, r.id), TODAY);
  const sp = v.steps.find((s) => s.key === "spotify");
  assert.deepEqual([sp.waiting, sp.late, sp.waitingText], [true, false, "waiting: RouteNote has not approved it yet"]);
  await S.setStep(d, NOW, R, { by: "Drop", id: r.id, step: "upload", status: "done" });
  await S.setStep(d, NOW, R, { by: "Drop", id: r.id, step: "approved", status: "done" });
  v = S.releaseView(await rel(d, r.id), TODAY);
  /* 18 Nov 2026: once RouteNote has approved, the step waits on Spotify until approval + 3 days */
  assert.equal(v.steps.find((s) => s.key === "spotify").waiting, true);
  assert.match(v.steps.find((s) => s.key === "spotify").waitingText, /waiting on Spotify/);
  /* a label release (RouteNote skipped) never waits on RouteNote */
  const lab = await sent(d, "Slow Fade", "2026-12-25", { ...PACK, kind: "With a label", label: "Sample Records", split: "50/50" });
  assert.equal(S.releaseView(await rel(d, lab.id), TODAY).steps.find((s) => s.key === "spotify").waiting, false);
});

/* ---------- the song page: a week before release at the latest ---------- */
test("the song page is due a week after the song before, but never later than a week before its own day", () => {
  assert.equal(S.pageDue("2026-11-27", "2026-11-24", TODAY), "2026-11-20", "3 days after the song before: still a week before its own day, for the ads");
  assert.equal(S.pageDue("2026-12-25", "2026-12-04", TODAY), "2026-12-11", "far apart: a week after the song before");
  assert.equal(S.pageDue("2026-12-25", null, TODAY), "2026-12-18");
  assert.equal(S.pageDue("2026-11-20", "2026-11-13", TODAY), TODAY, "never in the past");
});

/* ---------- the distributor's own words; a past day keeps the history in order ---------- */
test("store_status takes RouteNote's words and past days, and the newest day is the status now", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Night Drive", "2026-12-11");
  const st = (status, on, o = {}) => call(d, "store_status", { bot: "Drop", song: "Night Drive", status, ...(on ? { on } : {}), ...o });
  await st("Pending Moderation");
  assert.equal(S.releaseView(await rel(d, r.id), TODAY).store.status, "in moderation");
  await st("uploaded", "2026-11-06");
  await st("action needed", "2026-11-09", { reason: "The cover has a web address on it (made up)" });
  await st("resubmitted", "2026-11-14");
  const s = S.releaseView(await rel(d, r.id), TODAY).store;
  assert.equal(s.status, "in moderation", "today's word stays the status now");
  assert.deepEqual(s.history.map((h) => [h.on, h.status]), [["2026-11-16", "in moderation"], ["2026-11-14", "resubmitted"], ["2026-11-09", "rejected"], ["2026-11-06", "uploaded"]]);
  assert.equal(S.packValue("storeStatus", "In review"), "in moderation");
  await fails(st("lost"), /must be one of/);
});

/* ---------- the pitch that went out; the page link; proposed lyrics ---------- */
test("a pitch sent without an approval on the desk reads as sent, not 'not approved'", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Night Drive", "2026-12-11");
  await d.setJSON("releases.json", (await S.listReleases(d)).map((x) => (x.id === r.id ? { ...x, steps: x.steps.map((s) => (s.key === "pitch" ? { ...s, status: "done", by: "Atlas", doneOn: "2026-11-14" } : s)) } : x)));
  const pack = await call(d, "release_pack", { bot: "Atlas", song: "Night Drive" });
  /* 18 Nov 2026: a done step with no approval record is not an ask */
  assert.deepEqual([pack.approvals.pitch.approved, pack.approvals.pitch.sent], [null, true]);
  assert.match(pack.approvals.pitch.state, /done, approval not needed \(sent Sat 14 Nov by Atlas; no approval was recorded on the desk/);
  const v = S.releaseView(await rel(d, r.id), TODAY);
  /* 18 Nov 2026, Luke: a pitch Atlas sent is not his approval, so it is not a row. The pitch line says it. */
  assert.ok(!L.approvalLines(v).some((x) => x.key === "pitch"));
  assert.equal(v.pitch.line, "Pitch: pitched Sat 14 Nov by Atlas");
  assert.equal(L.approvalUndo(L.approvalLines(v).find((x) => x.key === "lyrics")), "");
  await fails(S.approveRelease(d, NOW, R, { by: "Luke", id: r.id, what: "pitch", withdraw: true }), /already sent/);
});

test("the song page step done with its link fills the pack's page (and old releases get it once)", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Night Drive", "2026-12-11");
  await S.setStep(d, NOW, R, { by: "Webmaster", id: r.id, step: "page", status: "done", link: "https://badscandal.com/nightdrive" });
  assert.equal((await rel(d, r.id)).pack.page, "https://badscandal.com/nightdrive");
  /* an older release: the link on the step, nothing in the pack */
  await d.setJSON("releases.json", (await S.listReleases(d)).map((x) => ({ ...x, pack: { ...x.pack, page: "" } })));
  await S.upgradeReleases(d, NOW);
  assert.equal((await rel(d, r.id)).pack.page, "https://badscandal.com/nightdrive");
});

test("lyrics Luke says yes to in a proposal are the approved lyrics", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Night Drive", "2026-12-11", { ...PACK, lyrics: "Line one\nline two" });
  const p = await call(d, "propose_release", { bot: "Verse", song: "Night Drive", pack: { lyrics: "Line one\nLine two" }, why: "the corrected lyrics Luke gave in chat (made up)" });
  await S.sendMessage(d, NOW + MIN, R, { from: "Luke", to: "Verse", text: "yes", re: p.id, note: "Yes, correct" });
  const x = await rel(d, r.id);
  assert.equal(x.pack.lyrics, "Line one\nLine two");
  const ap = S.releaseView(x, TODAY).approvals.lyrics;
  assert.deepEqual([ap.by, ap.current, ap.text], ["Luke", true, "Line one\nLine two"]);
  assert.equal((await call(d, "release_pack", { bot: "Verse", song: "Night Drive" })).approvals.lyrics.approved, true);
});

/* ---------- received only (Luke) ---------- */
test("money: only what is received is income; payable and pending are never added to it", async () => {
  const d = memoryDesk();
  const sub = (o) => S.submitIncome(d, NOW, R, { bot: "Ledger", date: "2026-11-10", currency: "USD", category: "Self-releases", account: "PayPal", ...o });
  await sub({ payer: "Sample Distro", amount: "100", status: "received" });
  await sub({ payer: "Sample Collecting", amount: "200", status: "payable", account: "Statement only" });
  await sub({ payer: "Sample Label", amount: "300", status: "pending", account: "Statement only" });
  const st = await call(d, "income_status", { bot: "Ledger" });
  assert.equal(st.received_this_month, "USD 100.00");
  assert.equal(st.pending_this_month, "USD 300.00", "pending only: the payable is not in it twice");
  assert.equal(st.payable_this_month, "USD 200.00");
  assert.match(st.not_income_yet, /never added to income/);
  assert.ok(Array.isArray(st.duplicates));
  assert.deepEqual(st.received_this_year, "USD 100.00");
  /* Luke's page: Received, and the music's own share; nothing owed */
  const b = await S.board(await S.loadDesk(d, NOW), NOW, null);
  assert.deepEqual(L.incomeTotals(b.income).map((t) => t.label), ["Received"]); /* one total (16 Nov 2026) */
  assert.equal(L.payStatus({ status: "payable", by: "Ledger" }).counted, false);
  /* the short briefing and the site check: received only */
  const sb = await call(d, "luke_short_briefing", { bot: "Alfred" });
  assert.match(sb.income, /^Received USD 100\.00/);
  assert.doesNotMatch(sb.income, /owed|pending|payable/i);
  assert.doesNotMatch(S.checkReport({ desk: await S.loadDesk(d, NOW), hq: null, hqState: null, now: NOW }).text, /pending/i);
});

/* ---------- my_day, task_update, the short briefing ---------- */
test("my_day: your last update even when the shared log is full of everyone else's", async () => {
  const d = memoryDesk();
  await call(d, "post_update", { bot: "Steve", status: "done", message: "Instagram row for 15 Nov written (made up)" }, { now: NOW - 3 * 3600000 });
  for (let i = 0; i < 45; i++) await S.postUpdate(d, NOW - 60 * MIN + i * 1000, R, { bot: ["Kevin", "Laura", "Atlas"][i % 3], status: "info", message: "made-up line " + i });
  const live = Array.from({ length: 40 }, (_, i) => ({ at: "2026-11-16 11:" + String(10 + i).padStart(2, "0"), bot: "Kevin", status: "info", message: "x" + i }));
  const hq = async () => ({ team: { live: { ready: true, feed: live, bots: [] }, tasks: [] } });
  const md = await call(d, "my_day", { bot: "Steve" }, { hq });
  assert.match(md.your_last_update, /done: Instagram row for 15 Nov written/);
});

test("task_update: a corrected title and 'cancelled', shown over the sheet's row", async () => {
  const d = memoryDesk();
  const open = [{ id: "T-31", owner: "Forge", task: "Google Ads 000-000-0000 sign-in (made up)", deadline: "", status: "todo" }];
  const hq = async () => ({ team: { tasks: open } });
  const r = await call(d, "task_update", { bot: "Nova", task: "T-31", status: "todo", title: "Google Ads 111-111-1111 sign-in (made up)", note: "the number was wrong" }, { hq });
  assert.equal(r.title, "Google Ads 111-111-1111 sign-in (made up)");
  const { teamReport } = await import("../netlify/lib/hq.mjs");
  const ov = await S.getTaskOverlay(d);
  assert.equal(teamReport(open, [], TODAY, ov).tasks[0].task, "Google Ads 111-111-1111 sign-in (made up)");
  await call(d, "task_update", { bot: "Nova", task: "T-31", status: "cancelled", note: "not needed any more" }, { hq });
  assert.equal(teamReport(open, [], TODAY, await S.getTaskOverlay(d)).tasks.length, 0, "cancelled = off the open list");
});

test("short briefing: each sign-in once (by account), a 'signed in again' is no sign-in, Ledger's problems named", async () => {
  const d = memoryDesk();
  const lines = ["Google Ads 111-111-1111 needs Luke to sign in (made up)", "Google Ads 111-111-1111: signed out again, sign in please", "TikTok Ads is signed in again"];
  for (const [i, m] of lines.entries()) await S.postUpdate(d, NOW - (10 - i) * MIN, R, { bot: "Forge", status: "blocked", message: m });
  const sb = await call(d, "luke_short_briefing", { bot: "Alfred" });
  /* 18 Nov 2026: the account number is hidden in the tool's answer */
  const google = sb.needs_luke_sign_in.filter((x) => /Google Ads \[account\]/.test(x));
  assert.equal(google.length, 1, JSON.stringify(sb.needs_luke_sign_in));
  assert.ok(!sb.needs_luke_sign_in.some((x) => /111-111-1111/.test(x)));
  assert.ok(!sb.needs_luke_sign_in.some((x) => /signed in again/i.test(x)));
});

/* ---------- small things ---------- */
test("a Google Drive share link becomes its download link", () => {
  assert.equal(directLink("https://drive.google.com/file/d/AbC123_x-Y/view?usp=sharing"), "https://drive.google.com/uc?export=download&id=AbC123_x-Y");
  assert.equal(directLink("https://drive.google.com/open?id=AbC123"), "https://drive.google.com/uc?export=download&id=AbC123");
});

test("songs.json says how pages are made now; read_guide says how many tools there are", async () => {
  const j = JSON.parse(readFileSync(new URL("../songs.json", import.meta.url), "utf8"));
  assert.match(j._readme, /song_page/);
  const g = await call(memoryDesk(), "read_guide", { bot: "Nova" });
  assert.match(g, new RegExp(`The connector has ${TOOLS.length} tools`));
});

test("new pack fields: primary artists, and the Musixmatch status Verse keeps", () => {
  const f = Object.fromEntries(S.PACK_FIELDS.map((x) => [x.key, x]));
  assert.equal(f.primary.short, "Primary artists");
  assert.deepEqual(f.musixmatch.choices, ["not listed", "submitted", "pending", "live"]);
  assert.deepEqual(f.musixmatch.fill, ["Verse"]);
  assert.ok(S.fieldsFor("Verse").includes("musixmatch"));
});

test("Luke's 16 Nov rules are in the bots' instructions: ads with Luke after release, lyric videos only for YouTube, YouTube on release day, one pitch in two weeks", async () => {
  const { INSTRUCTIONS, instructionsFor } = await import("../netlify/lib/staff-tools.mjs");
  assert.match(instructionsFor("Forge", R), /you never make or launch ads on your own\. A song's ads are made WITH Luke after it is out/);
  assert.match(instructionsFor("Forge", R), /A lyric video is never used for ads/);
  assert.match(instructionsFor("Laura", R), /set to go public on its release day .* The goal is two uploads a month/);
  assert.match(INSTRUCTIONS, /One Spotify pitch in two weeks/);
  assert.doesNotMatch(instructionsFor("Kevin", R), /never make or launch ads/, "Forge's line is Forge's");
  assert.deepEqual(S.RELEASE_STEPS.find((s) => s.key === "ads"), { key: "ads", label: "Ads made with Luke, after the release", owner: "Forge", days: -2, after: "page", fromRelease: true });
});
