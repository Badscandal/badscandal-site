/* The release pipeline, v2 (11 Nov 2026, evening): whose release it is (self-release or with a label,
   the split), skipped steps, "send anyway", songs already out, the Spotify for Artists step and the
   pitch that waits for it, warnings, what Spotify for Artists shows as upcoming (spotify_upcoming,
   Luke's four answers), and "read" instead of "active". Pure functions + the in-memory desk. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk, sampleBoard } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";
import { hqModel, mergeReleases, releasesReport } from "../netlify/lib/hq.mjs";

const NOW = Date.parse("2026-11-12T12:20:00Z"); /* Thu 12 Nov, 09:20 in São Paulo */
const TODAY = "2026-11-12";
const DAY = 86400000, HOUR = 3600000;
const R = S.DEFAULT_ROSTER;
const fails = (p, re) => assert.rejects(p, (e) => e.name === "StaffError" && re.test(e.message));
const FULL = { kind: "Self-release", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", language: "English", explicit: "No", genre: "Dance", writers: "Sample Writer: music and lyrics", copyright: "℗ 2026 Sample · © 2026 Sample" };
const LABEL = { ...FULL, kind: "With a label", label: "Sample Records", split: "BADSCANDAL 50% · Sample Records 50%" };
async function sent(d, title, date, pack = FULL, now = NOW, o = {}) {
  const r = await S.saveRelease(d, now, R, { by: "Luke", title, date, pack });
  return (await S.sendRelease(d, now, R, { by: "Luke", id: r.id, ...o })).release;
}
const call = (d, name, args, now = NOW, role = "bot") => callTool(TOOLS.find((t) => t.name === name), args, { store: d, now, role, hq: null });
const all = (d) => S.listMessages(d, NOW + 30 * DAY);
const step = (r, key) => r.steps.find((s) => s.key === key);
/* a release as stored, sent on `sentDay`, with some steps changed */
const made = (date, sentDay, o = {}) => ({ id: "x", title: o.title || "X", date, status: "scheduled", pack: o.pack || { ...FULL, lyrics: "la", mood: "m", instruments: "i", story: "s" },
  sentAt: (o.sentAt || sentDay + "T13:00:00Z"), tight: S.scheduleSteps(date, sentDay).tight,
  steps: S.scheduleSteps(date, sentDay, o.sched).steps.map((s) => ({ ...s, ...((o.set || {})[s.key] || {}) })) });
const warn = (r, sightings = null, today = TODAY) => S.releaseWarnings(S.releaseView(r, today), sightings, today);

/* ---------- V2: the deal ---------- */
test("deal: the label and the split are required only 'With a label', and the refusal says so (and 'or send anyway')", async () => {
  const label = S.PACK_FIELDS.find((f) => f.key === "label"), split = S.PACK_FIELDS.find((f) => f.key === "split");
  assert.deepEqual([S.requiredNow(label, { kind: "With a label" }), S.requiredNow(label, { kind: "Self-release" }), S.requiredNow(split, {}), S.requiredNow(split, { kind: "With a label" })], [true, false, false, true]);
  const v = (pack) => S.releaseView({ id: "x", title: "X", date: "2026-12-11", status: "draft", pack }, TODAY);
  assert.deepEqual(v({ ...FULL, kind: "With a label" }).missing.filter((m) => m.required).map((m) => m.key), ["label", "split"]);
  assert.deepEqual(v(FULL).missing.filter((m) => m.required), [], "a self-release needs no label and no split");
  assert.ok(!v(FULL).missing.some((m) => m.key === "label" || m.key === "split"));
  const d = memoryDesk();
  const r = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Label Song", date: "2026-12-11", pack: { ...FULL, kind: "with a label" } });
  assert.equal(r.pack.kind, "With a label", "a choice is matched without capitals");
  await assert.rejects(S.sendRelease(d, NOW, R, { by: "Luke", id: r.id }), (e) => e.message === "Still missing: Label, Split. Fill them in, then send again. Or send anyway: what is missing stays on the release as a warning." && e.anyway === true && e.missing.join() === "label,split");
  await fails(S.saveRelease(d, NOW, R, { by: "Luke", id: r.id, pack: { kind: "Major" } }), /Self-release or label must be one of: Self-release, With a label/);
  assert.deepEqual(S.dealOf({ id: "a", pack: { kind: "Self-release" } }), { kind: "Self-release", label: "", split: "", distributor: "RouteNote (badscandaladmin)", id: "a" });
  assert.deepEqual(S.dealOf({ id: "b", pack: { kind: "With a label", label: "Sample Records" } }).distributor, "Sample Records", "a label release is delivered by the label unless the pack says otherwise");
  assert.deepEqual(S.dealOf({ id: "c", pack: {} }), { kind: "", label: "", split: "", distributor: "", id: "c" }, "not recorded yet");
});

test("deal: a label release the label delivers has its RouteNote upload and approval skipped; never late, never open, never Drop's", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Slow Burn", "2026-11-20", LABEL); /* 8 days out: every early step is due today */
  assert.deepEqual(["upload", "approved"].map((k) => [step(r, k).status, step(r, k).note]), [["skipped", "The label delivers this one"], ["skipped", "The label delivers this one"]]);
  const later = S.releaseView((await S.listReleases(d))[0], "2026-11-15");
  assert.deepEqual([step(later, "upload").late, step(later, "upload").skipped, later.counts.total, later.counts.skipped], [false, true, 8, 2], "skipped is never late and never counted as a step to do");
  assert.notEqual(later.next.key, "upload");
  const b = S.board(await S.loadDesk(d, NOW + 3 * DAY), NOW + 3 * DAY, null);
  assert.deepEqual(b.staff.find((w) => w.name === "Drop").releaseSteps, []);
  assert.match((await all(d)).find((m) => /^New release from Luke: Slow Burn/.test(m.text)).text, /Sample Records delivers it to the stores: no RouteNote upload for us\./);
  /* we deliver a label release ourselves: the steps are ours */
  const own = await sent(d, "Own Upload", "2026-12-11", { ...LABEL, distributor: "RouteNote" });
  assert.equal(step(own, "upload").status, "todo");
  /* the deal changed after sending: the upload and the approval follow it, while nobody has started them */
  const self = await sent(d, "Was Self", "2026-12-18");
  const nowLabel = await S.saveRelease(d, NOW + 1, R, { by: "Luke", id: self.id, pack: { kind: "With a label", label: "Sample Records", split: "50/50" } });
  assert.equal(step(nowLabel, "upload").status, "skipped");
  assert.match(nowLabel.log.at(-1).what, /skipped Uploaded to RouteNote with the release date and Approved by RouteNote \(nothing waiting\) \(the label delivers it\)$/);
  assert.equal(step(await S.saveRelease(d, NOW + 2, R, { by: "Luke", id: self.id, pack: { kind: "Self-release" } }), "upload").status, "todo", "back to a self-release: ours again");
});

test("skipped: only Luke, Claude or Nova, always with a note; never late, never open", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Survivors", "2026-11-20");
  await fails(S.setStep(d, NOW, R, { by: "Laura", id: r.id, step: "video", status: "skipped", note: "no video for this one" }), /Only Luke, Claude or Nova can skip a step/);
  await fails(S.setStep(d, NOW, R, { by: "Nova", id: r.id, step: "video", status: "skipped" }), /A skipped step needs a note: say why it does not apply/);
  const x = await S.setStep(d, NOW, R, { by: "Nova", id: r.id, step: "video", status: "skipped", note: "No video for this one" });
  assert.deepEqual([step(x, "video").status, step(x, "video").by], ["skipped", "Nova"]);
  const v = S.releaseView(x, "2026-11-19");
  assert.deepEqual([step(v, "video").late, v.counts.total, v.counts.skipped], [false, 9, 1]);
  const b = S.board(await S.loadDesk(d, NOW + 7 * DAY), NOW + 7 * DAY, null);
  assert.deepEqual(b.staff.find((w) => w.name === "Laura").releaseSteps, [], "a skipped step is not Laura's to do");
  assert.equal((await S.listUpdates(d, NOW, 1)).find((u) => u.bot === "Nova").status, "info", "a skip is a plain line in the live log, never a done");
});

test("send anyway: Luke or Claude only; what is missing stays as a warning and the team is told; never without a day", async () => {
  const d = memoryDesk();
  const { copyright, ...noCopy } = FULL;
  const r = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Hurry", date: "2026-12-11", pack: noCopy });
  await fails(S.sendRelease(d, NOW, R, { by: "Luke", id: r.id }), /^Still missing: Copyright line\. Fill it in, then send again\. Or send anyway/);
  await fails(S.sendRelease(d, NOW, R, { by: "Nova", id: r.id, anyway: true }), /Only Luke or Claude can send a release/);
  await fails(S.sendRelease(d, NOW, R, { by: "Luke", id: r.id, anyway: "yes" }), /Still missing: Copyright line/, "only a real true sends anyway");
  const out = await S.sendRelease(d, NOW, R, { by: "Luke", id: r.id, anyway: true });
  assert.deepEqual([out.release.status, out.without], ["scheduled", ["copyright"]]);
  assert.match(out.release.log.at(-1).what, /^Luke sent it to the team for Fri 11 Dec without Copyright line \(sent anyway\)$/);
  assert.deepEqual(out.release.sentWithout, ["copyright"], "what was left out is kept on the release");
  assert.ok(S.releaseView(out.release, TODAY).warnings.includes("Sent without Copyright line: fill it in under Edit the details"), "Luke's words, not the developer's 'pack'");
  const rep = S.checkReport({ desk: await S.loadDesk(d, NOW), hq: null, hqState: null, now: NOW });
  assert.ok(rep.problems.includes("Hurry: Sent without Copyright line: fill it in under Edit the details"), rep.problems.join("\n"));
  await S.saveRelease(d, NOW + 1, R, { by: "Luke", id: r.id, pack: { copyright: "℗ 2026 Sample" } });
  assert.deepEqual(S.releaseView((await S.listReleases(d))[0], TODAY).warnings.filter((w) => /Sent without/.test(w)), [], "filled in later: the warning goes");
  assert.match((await all(d)).find((m) => /^New release from Luke: Hurry/.test(m.text)).text, /Still missing, to be added to the pack: Copyright line\.$/);
  const noDay = await S.saveRelease(d, NOW, R, { by: "Claude", title: "No Day", pack: FULL });
  await assert.rejects(S.sendRelease(d, NOW, R, { by: "Claude", id: noDay.id, anyway: true }), (e) => /The release day can't be left out/.test(e.message) && e.anyway === false);
});

test("already out: recorded for its deal, with no dated steps; nobody is told; it is never on the team's list", async () => {
  const d = memoryDesk();
  const r = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Touch Me", date: "2026-10-30", pack: { kind: "With a label", label: "Sample Records", split: "BADSCANDAL 50% · Sample Records 50%" } });
  const draft = S.releaseView(r, TODAY);
  assert.deepEqual(draft.missing, [], "already out: the files and the store details are not asked for, only the deal");
  assert.match(draft.where, /^Release day Fri 30 Oct has passed: sending records it as already out, with no steps/);
  const out = await S.sendRelease(d, NOW, R, { by: "Luke", id: r.id });
  assert.deepEqual([out.alreadyOut, out.told, out.release.alreadyOut, out.release.status], [true, null, true, "scheduled"]);
  assert.ok(out.release.steps.every((s) => s.status === "skipped" && s.due === null && s.note === "Already out when it was recorded"));
  assert.match(out.release.log.at(-1).what, /^Luke recorded it as already out \(Fri 30 Oct\): no steps$/);
  assert.equal((await all(d)).length, 0, "nothing to do for the team: no message");
  const v = S.releaseView(out.release, TODAY);
  assert.deepEqual([v.where, v.warnings, v.counts.total, S.releaseActive(v), v.released], ["Already out (Fri 30 Oct): recorded for its deal", [], 0, false, true]);
  assert.deepEqual((await call(d, "releases", { bot: "Webmaster" })).releases, []);
  await fails(S.moveRelease(d, NOW, R, { by: "Luke", id: r.id, date: "2026-12-11" }), /recorded as already out: its day must be today or earlier/);
  assert.equal((await S.moveRelease(d, NOW, R, { by: "Luke", id: r.id, date: "2026-10-23" })).told, null, "its day corrected, quietly");
});

/* ---------- V3: Songs says whose song it is ---------- */
test("songs[].deal: from the desk release of the same name, accents and capitals ignored; null when there is none", () => {
  const sheet = { Songs: [["date", "song", "spotify_streams"], ["2026-11-10", "Me Da Seu Body", "10"], ["2026-11-10", "Other Song", "5"], ["2026-11-10", "Old One", "3"]] };
  const view = (title, pack, status = "scheduled", id = S.releaseId(title)) => S.releaseView({ id, title, date: "2026-10-30", status, pack, steps: [] }, TODAY);
  const m = hqModel(sheet, TODAY, {}, undefined, "09:20", { updates: [], overlay: null, releases: [view("Me Dá Seu Body", LABEL), view("Old One", {}, "scheduled")] });
  const by = Object.fromEntries(m.songs.map((s) => [s.song, s.deal]));
  assert.deepEqual(by["Me Da Seu Body"], { kind: "With a label", label: "Sample Records", split: "BADSCANDAL 50% · Sample Records 50%", distributor: "Sample Records", id: "medaseubody" });
  assert.equal(by["Other Song"], null, "no desk record: not recorded yet");
  assert.deepEqual([by["Old One"].kind, by["Old One"].id], ["", "oldone"], "a desk record from before 11 Nov 2026: kind empty, the id to open it");
  assert.equal(hqModel(sheet, TODAY).songs[0].deal, null, "no desk: every song null");
  assert.deepEqual(m.releases.find((r) => r.id === "medaseubody").deal.kind, "With a label", "the merged release card carries it too");
});

/* ---------- V4: what Spotify for Artists shows ---------- */
test("spotify_upcoming: each report replaces the list, keeps firstSeen, an empty list is a report; only Atlas or Nova", async () => {
  const d = memoryDesk();
  const a = await call(d, "spotify_upcoming", { bot: "Atlas", releases: [{ title: "Velvet Night", date: "2026-11-28", shown_as: "BADSCANDAL · Sample Distro" }, { title: "Other", date: "2026-12-04" }] });
  assert.deepEqual([a.saved, a.songs, a.not_in_the_pipeline], [true, 2, ["Velvet Night, Sat 28 Nov: Luke is asked what it is", "Other, Fri 4 Dec: Luke is asked what it is"]]);
  const b = await call(d, "spotify_upcoming", { bot: "nova", releases: [{ title: "Velvet Night", date: "2026-11-28" }] }, NOW + 2 * DAY);
  assert.equal(b.songs, 1);
  const doc = await S.getSightings(d);
  assert.deepEqual(doc.list.map((x) => [x.key, x.firstSeen]), [["velvetnight|2026-11-28", TODAY]], "replaced, and first seen the day it first showed");
  assert.equal(doc.by, "Nova");
  const empty = await call(d, "spotify_upcoming", { bot: "Atlas", releases: [] }, NOW + 3 * DAY);
  assert.deepEqual([empty.saved, empty.songs, empty.note], [true, 0, "Recorded: nothing is upcoming in Spotify for Artists."]);
  assert.deepEqual((await S.getSightings(d)).list, []);
  await fails(call(d, "spotify_upcoming", { bot: "Drop", releases: [] }), /Only Atlas reports what Spotify for Artists shows as upcoming \(Nova may report for him\)/);
  await fails(call(d, "spotify_upcoming", { bot: "Atlas", releases: "none" }), /send an empty list: \[\]\. If you could not open Spotify for Artists, do not call this/);
  await fails(call(d, "spotify_upcoming", { bot: "Atlas", releases: [{ title: "X", date: "27/11" }] }), /"X": date must be its release day .* YYYY-MM-DD/);
  await fails(call(d, "spotify_upcoming", { bot: "Atlas", releases: Array.from({ length: 21 }, (_, i) => ({ title: "S" + i, date: "2026-12-01" })) }), /the most a report can hold is 20/);
  assert.deepEqual((await S.getSightings(d)).list, [], "a refused report changes nothing");
  const tool = TOOLS.find((t) => t.name === "spotify_upcoming");
  assert.match(tool.description, /EMPTY|empty list/); assert.match(tool.description, /do NOT call this/); assert.match(tool.description, /Example/);
});

test("a song in the pipeline that shows in Spotify for Artists: its step is done once, by the reporter, and the pitch opens", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Night Drive", "2026-12-11");
  assert.equal(S.releaseView(r, TODAY).steps.find((s) => s.key === "pitch").waiting, true);
  const out = await call(d, "spotify_upcoming", { bot: "Atlas", releases: [{ title: "NIGHT DRIVE", date: "2026-12-11" }] });
  assert.deepEqual([out.in_the_pipeline, out.steps_done], [["NIGHT DRIVE"], ["Night Drive: Showing as upcoming in Spotify for Artists (the Spotify pitch is open now)"]]);
  let x = (await S.listReleases(d))[0];
  assert.deepEqual([step(x, "spotify").status, step(x, "spotify").by, step(x, "spotify").note], ["done", "Atlas", "Showing in Spotify for Artists since Thu 12 Nov"]);
  assert.equal(S.releaseView(x, TODAY).steps.find((s) => s.key === "pitch").waiting, false);
  const again = await call(d, "spotify_upcoming", { bot: "Atlas", releases: [{ title: "Night Drive", date: "2026-12-11" }] }, NOW + DAY);
  assert.deepEqual(again.steps_done, [], "once");
  x = (await S.listReleases(d))[0];
  assert.equal(step(x, "spotify").at, new Date(NOW).toISOString());
  assert.equal((await S.listUpdates(d, NOW + DAY, 2)).filter((u) => u.bot === "Atlas" && /Night Drive: Showing as upcoming/.test(u.message)).length, 1, "one line in the live log");
});

test("the pitch WAITS while the song is not in Spotify for Artists, and is an ordinary step (never born late) after", async () => {
  const d = memoryDesk(), early = Date.parse("2026-11-01T12:00:00Z");
  const r = await sent(d, "Wait For It", "2026-11-25", { ...FULL, mood: "m", instruments: "i", story: "s" }, early);
  let v = S.releaseView((await S.listReleases(d))[0], TODAY);
  const p = v.steps.find((s) => s.key === "pitch");
  assert.deepEqual([p.due, p.late, p.waiting, p.waitingText], ["2026-11-11", false, true, "waiting: the song is not in Spotify for Artists yet"]);
  await fails(S.setStep(d, NOW, R, { by: "Atlas", id: r.id, step: "pitch", status: "done" }), /"Spotify pitch sent" is waiting for "Showing as upcoming in Spotify for Artists" \(Atlas\)/);
  const t = await call(d, "my_day", { bot: "Atlas" });
  assert.deepEqual(t.release_steps.find((s) => s.step === "pitch").state, "waiting");
  /* the spotify step is done by the daily report, never by release_step (review, 11 Nov 2026) */
  assert.match(t.next, /^Report what Spotify for Artists shows as upcoming with spotify_upcoming: the first report that lists Wait For It marks "Showing as upcoming in Spotify for Artists" done \(due Tue 10 Nov \(2026-11-10\), LATE\)\. Do not mark it with release_step\. You have 2 open release steps in all/, "the waiting pitch is not what to do next");
  assert.equal(t.next.split("spotify_upcoming").length - 1, 1, "said once, not again as 'Every day: …'");
  assert.equal(t.release_steps.find((s) => s.step === "spotify").how, "done by your spotify_upcoming report, not by release_step");
  assert.equal(t.release_steps.find((s) => s.step === "pitch").waiting_for, "the song to show as upcoming in Spotify for Artists");
  const own = (await call(d, "releases", { bot: "Atlas" })).releases[0].your_steps;
  assert.deepEqual([own.find((s) => s.step === "pitch").waiting_for, own.find((s) => s.step === "spotify").how], ["the song to show as upcoming in Spotify for Artists", "done by your spotify_upcoming report, not by release_step"], "the same words in releases");
  assert.match(TOOLS.find((x) => x.name === "release_step").description, /The step spotify .* is done by Atlas's spotify_upcoming report, not by this tool/);
  await S.setStep(d, NOW, R, { by: "Atlas", id: r.id, step: "spotify", status: "done" });
  v = S.releaseView((await S.listReleases(d))[0], TODAY);
  const q = v.steps.find((s) => s.key === "pitch");
  assert.deepEqual([q.due, q.late, q.waiting], [TODAY, false, false], "due today, not late");
  assert.equal(S.releaseView((await S.listReleases(d))[0], "2026-11-13").steps.find((s) => s.key === "pitch").late, true, "and late from tomorrow");
  /* a release from before the Spotify step: its pitch never waits */
  const old = { id: "o", title: "Old", date: "2026-11-25", status: "scheduled", pack: FULL, steps: S.scheduleSteps("2026-11-25", "2026-11-01").steps.filter((s) => s.key !== "spotify") };
  assert.deepEqual([old.steps.length, S.releaseView(old, TODAY).steps.find((s) => s.key === "pitch").late], [9, true]);
});

/* ---------- V5: warnings ---------- */
test("warnings: each sentence, most urgent first", () => {
  const S2 = (k, o) => ({ [k]: o });
  /* a late step */
  assert.deepEqual(warn(made("2026-12-05", "2026-11-01", { set: S2("lyrics", { due: "2026-11-10" }) })), ["Lyrics live is 2 days late (Verse)"]);
  assert.deepEqual(warn(made("2026-12-05", "2026-11-01", { set: S2("lyrics", { due: "2026-11-11" }) })), ["Lyrics live is 1 day late (Verse)"]);
  /* a blocked step */
  assert.deepEqual(warn(made("2026-12-05", "2026-11-01", { set: S2("upload", { status: "blocked", note: "Needs the cover" }) })), ["Uploaded to RouteNote with the release date is blocked (Drop): Needs the cover"]);
  /* something missing that a step needs within 3 days */
  assert.deepEqual(warn(made("2026-11-24", "2026-11-01", { pack: FULL, set: S2("spotify", { status: "done" }) })).filter((w) => /missing/.test(w)), ["Lyrics are missing and Lyrics live is due Sat 14 Nov", "Mood, instruments and the song in two lines are missing and Spotify pitch sent was due Tue 10 Nov"]);
  assert.deepEqual(warn(made("2026-12-05", "2026-11-01", { pack: { ...FULL, lyrics: "la", instruments: "i" }, set: { spotify: { status: "done" }, pitch: { due: "2026-11-14" } } })), ["Mood and the song in two lines are missing and Spotify pitch sent is due Sat 14 Nov"]);
  /* not in Spotify for Artists, 14 days or fewer before release */
  const s14 = made("2026-11-26", "2026-11-01");
  assert.ok(warn(s14).includes("Not showing in Spotify for Artists yet, 14 days before release: the pitch cannot be sent until it does"));
  assert.ok(!warn(made("2026-11-27", "2026-11-01")).some((w) => /Not showing in Spotify for Artists/.test(w)), "15 days before: not yet a warning");
  assert.ok(!warn(s14, { list: [{ title: "x", date: "2026-11-26" }] }).some((w) => /Not showing/.test(w)), "the report shows it");
  assert.ok(!warn(s14).some((w) => /Showing as upcoming in Spotify for Artists is/.test(w)), "the step's lateness is said once, with what it means");
  /* the pitch: fewer than 7 days to go */
  const p6 = made("2026-11-18", "2026-11-01", { set: S2("spotify", { status: "done" }) });
  assert.deepEqual(warn(p6).filter((w) => /pitch/i.test(w)), ["Too late for a Spotify pitch: Spotify needs it 7 days before release"]);
  assert.ok(!warn(made("2026-11-19", "2026-11-01", { set: S2("spotify", { status: "done" }) })).some((w) => /Too late for a Spotify pitch/.test(w)), "7 days before: still in time");
  /* sent fewer than 21 days before release */
  assert.ok(warn(made("2026-11-25", TODAY, { set: S2("spotify", { status: "done" }) })).includes("Sent 13 days before release: the usual 21 days for the stores could not be kept"));
  /* release day */
  assert.equal(warn(made(TODAY, "2026-10-01", { set: Object.fromEntries(S.RELEASE_STEPS.filter((s) => s.key !== "live").map((s) => [s.key, { status: "done" }])) }))[0], "Out today and the Spotify link is not on the song page yet");
  /* a label release with no split; not also said as "sent without" */
  const noSplit = warn(made("2026-12-30", TODAY, { pack: { ...LABEL, split: "", lyrics: "la", mood: "m", instruments: "i", story: "s" }, sched: { labelDelivers: true } }));
  assert.deepEqual(noSplit, ["A label release with no split recorded: write down who owns what (us and Sample Records)"]);
  /* order: blocked before late before missing */
  const many = warn(made("2026-11-25", "2026-11-01", { pack: FULL, set: { approved: { status: "blocked", note: "cover" }, upload: { due: "2026-11-10" } } }));
  assert.deepEqual(many.map((w) => w.split(" ")[0]), ["Approved", "Uploaded", "Not", "Lyrics"]);
  assert.deepEqual(warn({ ...made("2026-11-25", "2026-11-01"), status: "draft" }), [], "a draft has no warnings");
});

/* ---------- unknown songs everywhere they must show ---------- */
test("a song upcoming in Spotify for Artists that is not in the pipeline: on the board, in the briefing, team_board, releases and the site check", async () => {
  const d = memoryDesk();
  await sent(d, "Night Drive", "2026-12-11");
  await call(d, "spotify_upcoming", { bot: "Atlas", releases: [{ title: "Night Drive", date: "2026-12-11" }, { title: "Velvet Night", date: "2026-11-28", shown_as: "BADSCANDAL · Sample Distro" }] });
  const b = S.board(await S.loadDesk(d, NOW + HOUR), NOW + HOUR, null);
  assert.deepEqual(b.sightings.items.map((x) => [x.title, x.state, x.match]), [["Night Drive", "pipeline", "nightdrive"], ["Velvet Night", "unknown", null]]);
  assert.equal(b.sightings.items[1].question, "Velvet Night is upcoming in Spotify for Artists for Sat 28 Nov, and it has not gone through the pipeline. What is it?");
  assert.deepEqual([b.sightings.unknown, b.sightings.waitingOnLuke, b.sightings.never, b.sightings.stale, b.sightings.choices.map((c) => c.answer)], [1, 1, false, false, ["self", "label", "notmine", "mistake"]]);
  assert.deepEqual((await call(d, "luke_briefing", { bot: "Alfred" })).unknown_in_spotify, ["Velvet Night, Sat 28 Nov"]);
  const s4a = { reported_at: S.spStamp(NOW), unknown: ["Velvet Night"], waiting_on_luke: 1 };
  assert.deepEqual((await call(d, "team_board", { bot: "Nova" })).spotify_for_artists, s4a);
  assert.deepEqual((await call(d, "releases", { bot: "Drop" })).spotify_for_artists, s4a);
  const rep = S.checkReport({ desk: await S.loadDesk(d, NOW + HOUR), hq: null, hqState: null, now: NOW + HOUR });
  assert.ok(rep.problems.includes("'Velvet Night' is upcoming in Spotify for Artists but not in the pipeline: Luke has to say what it is"), rep.problems.join("\n"));
  assert.ok(!rep.problems.some((p) => /Night Drive.*Spotify for Artists but not/.test(p)));
});

test("Luke's four answers: a draft that then matches; ONE message to Nova; answered songs stay listed quietly", async () => {
  const d = memoryDesk();
  const list = [{ title: "Velvet Night", date: "2026-11-28", shown_as: "BADSCANDAL · Sample Distro" }, { title: "Paper Sky", date: "2026-12-04", shown_as: "Someone Else · Other Distro" },
    { title: "Glass Heart", date: "2026-12-18" }, { title: "Late Bloom", date: "2026-11-27", shown_as: "BADSCANDAL · Sample Label" }];
  await call(d, "spotify_upcoming", { bot: "Atlas", releases: list });
  const key = (t, dt) => S.sightKey(t, dt);
  await fails(S.answerSighting(d, NOW, R, { by: "Claude", key: key("Velvet Night", "2026-11-28"), answer: "self" }), /Only Luke answers/);
  await fails(S.answerSighting(d, NOW, R, { by: "Luke", key: "nope|2026-01-01", answer: "self" }), /not in the latest Spotify for Artists report any more/);
  await fails(S.answerSighting(d, NOW, R, { by: "Luke", key: key("Late Bloom", "2026-11-27"), answer: "label" }), /Write the label's name/);
  await fails(S.answerSighting(d, NOW, R, { by: "Luke", key: key("Late Bloom", "2026-11-27"), answer: "maybe" }), /answer must be one of: self, label, notmine, mistake/);
  /* 1. mine, a self-release: a draft in the pipeline, and the song now matches */
  const one = await S.answerSighting(d, NOW, R, { by: "Luke", key: key("Velvet Night", "2026-11-28"), answer: "self" });
  assert.deepEqual([one.release.status, one.release.title, one.release.date, one.release.pack.kind, one.told], ["draft", "Velvet Night", "2026-11-28", "Self-release", null]);
  assert.match(one.release.log[0].what, /\(seen in Spotify for Artists\)$/);
  assert.deepEqual(one.sightings.items.find((x) => x.title === "Velvet Night").state, "pipeline");
  /* 2. mine, with a label */
  const two = await S.answerSighting(d, NOW, R, { by: "Luke", key: key("Late Bloom", "2026-11-27"), answer: "label", label: "Sample Label" });
  assert.deepEqual([two.release.pack.kind, two.release.pack.label], ["With a label", "Sample Label"]);
  /* 3. not mine: ONE message from Luke to Nova, whatever happens next */
  const three = await S.answerSighting(d, NOW, R, { by: "Luke", key: key("Paper Sky", "2026-12-04"), answer: "notmine", note: "Never heard of it" });
  assert.ok(three.told);
  await S.answerSighting(d, NOW + 1000, R, { by: "Luke", key: key("Paper Sky", "2026-12-04"), answer: "notmine" });
  const toNova = (await all(d)).filter((m) => m.from === "Luke" && m.to === "Nova");
  assert.equal(toNova.length, 1, "written once");
  assert.deepEqual([toNova[0].needs, toNova[0].text], ["action", "'Paper Sky' is upcoming in our Spotify for Artists for Fri 4 Dec (shown as: Someone Else · Other Distro). Luke says: it is not his, or it is on the wrong account. Luke's note: Never heard of it. Find out who delivered it and from which account, say what has to be done, and report back on the desk."]);
  /* 4. a mistake */
  await S.answerSighting(d, NOW, R, { by: "Luke", key: key("Glass Heart", "2026-12-18"), answer: "mistake" });
  assert.match((await all(d)).find((m) => /Glass Heart/.test(m.text)).text, /\(shown as: not given\)\. Luke says: it is a mistake and should not be there\. Find out/);
  /* the next report: answered songs stay listed, with the answer and its day; nothing waits on Luke */
  await call(d, "spotify_upcoming", { bot: "Atlas", releases: list }, NOW + DAY);
  const sv = S.board(await S.loadDesk(d, NOW + DAY), NOW + DAY, null).sightings;
  assert.deepEqual(sv.items.map((x) => [x.title, x.state]), [["Velvet Night", "pipeline"], ["Paper Sky", "answered"], ["Glass Heart", "answered"], ["Late Bloom", "pipeline"]]);
  const ps = sv.items.find((x) => x.title === "Paper Sky").answer;
  assert.deepEqual([ps.answer, ps.text, ps.note, ps.day, !!ps.told], ["notmine", "Not mine, or on the wrong account", "Never heard of it", TODAY, true]);
  assert.equal(sv.unknown, 0);
  assert.equal((await all(d)).filter((m) => m.from === "Luke" && m.to === "Nova").length, 2, "Paper Sky once, Glass Heart once");
});

test("the report: never, stale after 48 hours, and the site check says so only while something is coming", async () => {
  assert.deepEqual([S.sightingsView(null, [], TODAY).never, S.sightingsView(null, [], TODAY).items], [true, []]);
  const doc = (ago) => ({ at: new Date(NOW - ago).toISOString(), sp: S.spStamp(NOW - ago), by: "Atlas", note: "", list: [], answers: {} });
  assert.equal(S.sightingsView(doc(47 * HOUR), [], TODAY, NOW).stale, false);
  assert.equal(S.sightingsView(doc(49 * HOUR), [], TODAY, NOW).stale, true);
  const d = memoryDesk();
  let rep = S.checkReport({ desk: await S.loadDesk(d, NOW), hq: null, hqState: null, now: NOW });
  assert.ok(!rep.problems.some((p) => /Atlas has not reported/.test(p)), "nothing coming: nothing to say");
  await sent(d, "Night Drive", "2026-12-11");
  rep = S.checkReport({ desk: await S.loadDesk(d, NOW), hq: null, hqState: null, now: NOW });
  assert.ok(rep.problems.includes("Atlas has not reported what is upcoming in Spotify for Artists yet"));
  await call(d, "spotify_upcoming", { bot: "Atlas", releases: [] }, NOW - 50 * HOUR);
  rep = S.checkReport({ desk: await S.loadDesk(d, NOW), hq: null, hqState: null, now: NOW });
  assert.ok(rep.problems.includes("Atlas has not reported what is upcoming in Spotify for Artists since Tue 10 Nov 07:20"), rep.problems.join("\n"));
  assert.equal(S.board(await S.loadDesk(d, NOW), NOW, null).sightings.stale, true);
});

test("a sheet-only release: a late 'Spotify pitch sent' waits only while a CURRENT report doesn't show the song, and only before its day", () => {
  const rows = releasesReport([{ song: "Me Da Seu Body", release_date: "2026-11-20", "t-14 pitched": "" }], TODAY);
  const pitchOf = (r) => r.steps.find((s) => s.label === "Spotify pitch sent");
  assert.equal(pitchOf(rows[0]).late, true, "the sheet alone: late");
  const report = (ago, list = []) => ({ at: new Date(NOW - ago).toISOString(), sp: S.spStamp(NOW - ago), by: "Atlas", list, answers: {} });
  const waitRow = mergeReleases(rows, [], TODAY, report(3 * HOUR), NOW)[0];
  assert.deepEqual([pitchOf(waitRow).late, pitchOf(waitRow).waiting, pitchOf(waitRow).waitingText], [false, true, "waiting: not in Spotify for Artists yet"]);
  assert.equal(waitRow.late, rows[0].late - 1);
  assert.equal(pitchOf(mergeReleases(rows, [], TODAY, report(3 * HOUR, [{ title: "Me Dá Seu Body", date: "2026-11-20" }]), NOW)[0]).late, true, "it shows there: late is late");
  assert.equal(pitchOf(mergeReleases(rows, [], TODAY, undefined, NOW)[0]).late, true, "the desk was not read: the sheet's word stands");
  /* review, 11 Nov 2026: nobody has looked, the look is old, or the song is already out: late is late */
  assert.equal(pitchOf(mergeReleases(rows, [], TODAY, null, NOW)[0]).late, true, "Atlas never reported: nobody has looked");
  assert.equal(pitchOf(mergeReleases(rows, [], TODAY, report(49 * HOUR), NOW)[0]).late, true, "a report over 48 hours old says nothing about today");
  assert.equal(pitchOf(mergeReleases(rows, [], TODAY, report(3 * HOUR))[0]).waiting, true, "no clock given: judged by the São Paulo day");
  assert.equal(pitchOf(mergeReleases(rows, [], TODAY, report(3 * DAY))[0]).late, true);
  const out = releasesReport([{ song: "Old Song", release_date: "2026-11-07", "t-14 pitched": "" }], TODAY);
  assert.equal(pitchOf(mergeReleases(out, [], TODAY, report(3 * HOUR), NOW)[0]).late, true, "out since 7 Nov: it will never show under Upcoming, so it never waits");
  const sheet = { Releases: [["song", "release_date", "T-14 pitched"], ["Me Da Seu Body", "2026-11-20", ""]] };
  assert.equal(pitchOf(hqModel(sheet, TODAY, {}, undefined, "09:20", { updates: [], overlay: null, releases: [], sightings: report(3 * HOUR), now: NOW }).releases[0]).waiting, true);
  assert.equal(pitchOf(hqModel(sheet, TODAY, {}, undefined, "09:20", { updates: [], overlay: null, releases: [], sightings: null, now: NOW }).releases[0]).late, true);
  assert.equal(pitchOf(hqModel(sheet, TODAY).releases[0]).late, true);
});

/* ---------- V6: read, not active ---------- */
test("read markers: only my_day, read_messages and Alfred's luke_briefing write them; a bot that only posts has NOT read", async () => {
  const d = memoryDesk();
  const m = (await S.sendMessage(d, NOW, R, { from: "Luke", to: "Drop", text: "New cover is in the folder." })).message;
  const toLedger = (await S.sendMessage(d, NOW, R, { from: "Luke", to: "Ledger", text: "Thanks." })).message;
  const toAlfred = (await S.sendMessage(d, NOW, R, { from: "Luke", to: "Alfred", text: "Short message today." })).message;
  const toNova = (await S.sendMessage(d, NOW, R, { from: "Luke", to: "Nova", text: "Hi." })).message;
  await call(d, "post_update", { bot: "Drop", status: "working", message: "Uploading the new cover" }, NOW + 60000);
  await call(d, "team_board", { bot: "Nova" }, NOW + 60000);
  await call(d, "luke_briefing", { bot: "Nova" }, NOW + 60000);
  let b = S.board(await S.loadDesk(d, NOW + 120000), NOW + 120000, null);
  const mark = (id) => { const x = b.messages.find((t) => t.id === id); return [x.seen, x.seenAt]; };
  assert.deepEqual(mark(m.id), [false, null], "Drop used the desk but did not read");
  assert.ok(b.staff.find((w) => w.name === "Drop").seen, "…and still shows as having used it");
  assert.deepEqual(mark(toNova.id), [false, null], "team_board and someone else's briefing hand over no messages");
  await call(d, "my_day", { bot: "Drop" }, NOW + 180000);
  await call(d, "read_messages", { bot: "Ledger" }, NOW + 180000);
  await call(d, "luke_briefing", { bot: "Alfred" }, NOW + 180000);
  b = S.board(await S.loadDesk(d, NOW + 240000), NOW + 240000, null);
  for (const id of [m.id, toLedger.id, toAlfred.id]) assert.deepEqual(mark(id), [true, new Date(NOW + 180000).toISOString()], id);
  assert.deepEqual(mark(toNova.id), [false, null]);
  assert.deepEqual(Object.keys(await S.getRead(d, R)).sort(), ["Alfred", "Drop", "Ledger"]);
  /* Claude's own key: my_day writes Claude's marker */
  const toClaude = (await S.sendMessage(d, NOW, R, { from: "Luke", to: "Claude", text: "Look at the cap." })).message;
  await call(d, "my_day", { bot: "x" }, NOW + 300000, "claude");
  b = S.board(await S.loadDesk(d, NOW + 360000), NOW + 360000, null);
  assert.equal(mark(toClaude.id)[0], true);
});

test("read: Luke's answers say 'read' from the marker, and a note to everyone says how many read it", async () => {
  const d = memoryDesk();
  const q = (await S.sendMessage(d, NOW, R, { from: "Drop", to: "Luke", text: "New cover please.", needs: "action" })).message;
  await S.sendMessage(d, NOW + 1000, R, { from: "Luke", to: "Drop", text: "In the folder.", re: q.id });
  const note = (await S.sendMessage(d, NOW + 2000, R, { from: "Claude", to: "all", text: "From today: my_day first." })).message;
  const fromNova = (await S.sendMessage(d, NOW + 2000, R, { from: "Nova", to: "all", text: "Standup at 09:00." })).message;
  await S.touchSeen(d, NOW + 5000, "Drop", "post_update");
  let b = S.board(await S.loadDesk(d, NOW + 6000), NOW + 6000, null);
  assert.deepEqual([b.answered[0].reply.seen, b.answered[0].reply.seenAt], [false, null], "used the desk, not read");
  for (const n of ["Drop", "Nova", "Atlas"]) await S.touchRead(d, NOW + 10000, n);
  b = S.board(await S.loadDesk(d, NOW + 11000), NOW + 11000, null);
  assert.deepEqual([b.answered[0].reply.seen, b.answered[0].reply.seenAt], [true, new Date(NOW + 10000).toISOString()]);
  const n1 = b.messages.find((t) => t.id === note.id), n2 = b.messages.find((t) => t.id === fromNova.id);
  assert.deepEqual([n1.seen, n1.read], [null, { by: 3, of: 12, names: ["Nova", "Atlas", "Drop"] }], "Read by 3 of 12");
  assert.deepEqual([n2.read.by, n2.read.of], [2, 11], "its sender is not counted");
  const reply = b.messages.find((t) => t.id === q.id).replies[0];
  assert.deepEqual([reply.seen, reply.read], [true, undefined], "a message to one bot has seen/seenAt, no count");
  /* the made-up board shows both kinds */
  const sb = sampleBoard(NOW);
  assert.deepEqual(sb.answered.map((a) => [a.from, a.reply.seen]), [["Drop", false], ["Atlas", true]]);
  assert.deepEqual(sb.messages.find((t) => t.to === "all").read.by, 6);
});

/* ---------- three small improvements ---------- */
test("team_board: each release lists its late steps and its warnings", async () => {
  const d = memoryDesk();
  await sent(d, "Close One", "2026-11-25", FULL, Date.parse("2026-11-01T12:00:00Z"));
  const rel = (await call(d, "team_board", { bot: "Nova" })).releases[0];
  assert.deepEqual(rel.late_steps, ["Uploaded to RouteNote with the release date (Drop)", "Approved by RouteNote (nothing waiting) (Drop)", "Showing as upcoming in Spotify for Artists (Atlas)"]);
  assert.deepEqual(rel.warnings, ["Uploaded to RouteNote with the release date is 8 days late (Drop)", "Approved by RouteNote (nothing waiting) is 3 days late (Drop)",
    "Not showing in Spotify for Artists yet, 13 days before release: the pitch cannot be sent until it does", "Lyrics are missing and Lyrics live is due Sun 15 Nov"]);
});

test("moving the date names the steps already done with the old date outside the desk", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Survivors", "2026-12-11");
  for (const [by, key] of [["Drop", "upload"], ["Drop", "approved"], ["Laura", "video"]]) await S.setStep(d, NOW, R, { by, id: r.id, step: key, status: "done" });
  await S.moveRelease(d, NOW + 1, R, { by: "Luke", id: r.id, date: "2026-12-18" });
  const msg = (await all(d)).find((m) => /^Luke moved Survivors/.test(m.text)).text;
  assert.equal(msg, "Luke moved Survivors from Fri 11 Dec to Fri 18 Dec. Every step that is not done has a new date: see my_day. Already done with the old date, so change it there too: Uploaded to RouteNote with the release date (Drop) and Video scheduled on YouTube (Laura).");
  const plain = await sent(d, "Plain", "2026-12-11");
  await S.moveRelease(d, NOW + 2, R, { by: "Luke", id: plain.id, date: "2026-12-18" });
  assert.doesNotMatch((await all(d)).find((m) => /^Luke moved Plain/.test(m.text)).text, /Already done/);
});

test("the copyright line is required to send a self-release; a label release the label delivers doesn't need it", async () => {
  const d = memoryDesk();
  const { copyright, ...rest } = FULL;
  const r = await S.saveRelease(d, NOW, R, { by: "Luke", title: "No Copyright", date: "2026-12-11", pack: rest });
  await assert.rejects(S.sendRelease(d, NOW, R, { by: "Luke", id: r.id }), (e) => e.missing.join() === "copyright" && /^Still missing: Copyright line\./.test(e.message));
  /* review, 11 Nov 2026: nothing of ours uses it when the label delivers */
  const { copyright: c2, ...labelNoCopy } = LABEL;
  const lab = await sent(d, "Label No Copyright", "2026-12-18", labelNoCopy);
  assert.equal(lab.status, "scheduled", "sent without being refused");
  const lv = S.releaseView(lab, TODAY);
  assert.deepEqual([lv.missing.some((m) => m.key === "copyright"), lv.warnings.some((w) => /Copyright/.test(w))], [false, false]);
  assert.ok(!S.releaseView({ id: "z", title: "Z", status: "draft", date: "2026-12-18", pack: labelNoCopy }, TODAY).missing.some((m) => m.key === "copyright"), "nor in its draft");
  /* a label release we upload ourselves: needed for OUR upload, not to send */
  const own = await sent(d, "Own Upload", "2026-12-25", { ...labelNoCopy, distributor: "RouteNote" });
  assert.deepEqual(S.releaseView(own, TODAY).missing.filter((m) => m.key === "copyright").map((m) => [m.required, m.neededBy]), [[false, "upload"]]);
});

/* ---------- releases stored before 11 Nov 2026 (no kind, no spotify step) ---------- */
test("an older release (no kind, no Spotify step) still reads, is never given a step on its own, and gets one when Luke moves it", async () => {
  const d = memoryDesk();
  const steps = S.scheduleSteps("2026-12-11", "2026-11-01").steps.filter((s) => s.key !== "spotify");
  const { kind, copyright, ...pack } = FULL;
  await d.setJSON("releases.json", [{ id: "oldsong", title: "Old Song", date: "2026-12-11", status: "scheduled", createdAt: "2026-11-01T12:00:00Z", createdBy: "Luke", updatedAt: "2026-11-01T12:00:00Z", sentAt: "2026-11-01T12:00:00Z", tight: false, pack, steps, log: [] }]);
  const v = S.releaseView((await S.listReleases(d))[0], TODAY);
  assert.deepEqual([v.steps.length, v.deal.kind, v.steps.find((s) => s.key === "pitch").waiting], [9, "", false]);
  /* review, 11 Nov 2026: it was never "sent without" anything (nothing was required then) */
  assert.ok(!v.warnings.some((w) => /Sent without/.test(w)), v.warnings.join("\n"));
  assert.ok(v.warnings.includes("Not recorded yet: self-release or label"));
  const rep = S.checkReport({ desk: await S.loadDesk(d, NOW), hq: null, hqState: null, now: NOW });
  assert.ok(!rep.problems.some((p) => /Old Song: (Sent without|Not recorded yet)/.test(p)), "kept out of the site's check: " + rep.problems.join("\n"));
  assert.equal((await S.sendRelease(d, NOW, R, { by: "Luke", id: "oldsong" })).already, true, "sending again changes nothing");
  assert.equal(S.board(await S.loadDesk(d, NOW), NOW, null).releases[0].steps.length, 9, "reading never adds a step");
  const m = await S.moveRelease(d, NOW, R, { by: "Luke", id: "oldsong", date: "2026-12-18" });
  assert.deepEqual(m.release.steps.map((s) => s.key), ["upload", "approved", "spotify", "pitch", "lyrics", "page", "video", "teasers", "ads", "live"]);
  assert.equal(step(m.release, "spotify").due, "2026-12-03");
  assert.match(m.release.log.at(-1).what, /; added the step "Showing as upcoming in Spotify for Artists"$/);
  assert.equal((await S.moveRelease(d, NOW, R, { by: "Luke", id: "oldsong", date: "2026-12-25" })).release.steps.length, 10, "once");
});

/* ---------- fixes after the two reviews (11 Nov 2026) ---------- */
test("read means handed over: my_day gives every new message for the bot (Luke's reply, needs none, older notes to all) before marking it read", async () => {
  const d = memoryDesk();
  const q = (await S.sendMessage(d, NOW, R, { from: "Ledger", to: "Luke", text: "Which account for the sample payment?", needs: "reply" })).message;
  const rep = (await S.sendMessage(d, NOW + 1000, R, { from: "Luke", to: "Ledger", text: "Wise, please.", needs: "none", re: q.id })).message;
  const fyi = (await S.sendMessage(d, NOW + 2000, R, { from: "Luke", to: "Ledger", text: "Just so you know: the bank row is fine." })).message;
  /* six notes to all: my_day's notes_for_everyone shows the newest five; the sixth must still be handed over */
  const notes = [];
  for (let i = 0; i < 6; i++) notes.push((await S.sendMessage(d, NOW + 3000 + i, R, { from: "Nova", to: "all", text: "Note number " + i })).message);
  const day = await call(d, "my_day", { bot: "Ledger" }, NOW + HOUR);
  const text = JSON.stringify(day);
  for (const m of [rep, fyi, ...notes]) assert.ok(text.includes(m.text), "handed over: " + m.text);
  const got = day.messages_for_you.find((m) => m.id === rep.id);
  assert.deepEqual([got.from, got.reply_to, got.answering_yours], ["Luke", q.id, "Which account for the sample payment?"]);
  assert.ok(!day.messages_for_you.some((m) => day.notes_for_everyone.some((n) => n.id === m.id)), "not said twice in one answer");
  const b = S.board(await S.loadDesk(d, NOW + 2 * HOUR), NOW + 2 * HOUR, null);
  assert.equal(b.answered[0].reply.seen, true, "and only now: Read by Ledger");
  /* the next my_day hands over only what is new since */
  const late = (await S.sendMessage(d, NOW + 3 * HOUR, R, { from: "Luke", to: "Ledger", text: "One more thing." })).message;
  assert.deepEqual((await call(d, "my_day", { bot: "Ledger" }, NOW + 4 * HOUR)).messages_for_you.map((m) => m.id), [late.id]);
  /* Alfred's luke_briefing marks his messages read: it hands them over too; nobody else's briefing does */
  const toAlfred = (await S.sendMessage(d, NOW, R, { from: "Luke", to: "Alfred", text: "Keep it to five lines today." })).message;
  assert.deepEqual((await call(d, "luke_briefing", { bot: "Alfred" }, NOW + HOUR)).messages_for_you.map((m) => m.text), [toAlfred.text, ...notes.map((n) => n.text)], "his own, oldest first, and the notes to all");
  assert.equal((await call(d, "luke_briefing", { bot: "Nova" }, NOW + HOUR)).messages_for_you, undefined);
  /* Claude's own my_day too */
  const toClaude = (await S.sendMessage(d, NOW, R, { from: "Luke", to: "Claude", text: "Thanks, noted." })).message;
  assert.ok((await call(d, "my_day", { bot: "x" }, NOW + HOUR, "claude")).messages_for_you.some((m) => m.id === toClaude.id));
  assert.match(TOOLS.find((t) => t.name === "my_day").description, /messages_for_you/);
});

test("a release sent before the Spotify step, moved after its pitch went out: the step is added as skipped, and no 'pitch cannot be sent' warning", async () => {
  const d = memoryDesk();
  const steps = S.scheduleSteps("2026-11-24", "2026-11-01").steps.filter((s) => s.key !== "spotify")
    .map((s) => (["upload", "approved", "pitch"].includes(s.key) ? { ...s, status: "done", by: "Atlas" } : s));
  await d.setJSON("releases.json", [{ id: "oldone", title: "Old One", date: "2026-11-24", status: "scheduled", sentAt: "2026-11-01T12:00:00Z", pack: { ...FULL, lyrics: "la" }, steps, log: [] }]);
  const m = await S.moveRelease(d, NOW, R, { by: "Luke", id: "oldone", date: "2026-11-25" });
  const sp = step(m.release, "spotify");
  assert.deepEqual([sp.status, sp.note], ["skipped", "The pitch was sent before this step existed"]);
  assert.match(m.release.log.at(-1).what, /added the step "Showing as upcoming in Spotify for Artists" \(skipped: the pitch was already sent\)$/);
  const v = S.releaseView(m.release, TODAY);
  assert.ok(!v.warnings.some((w) => /Spotify for Artists/.test(w)), v.warnings.join("\n"));
  assert.ok(!/Showing as upcoming/.test(v.where), v.where);
  assert.deepEqual(S.board(await S.loadDesk(d, NOW), NOW, null).staff.find((w) => w.name === "Atlas").releaseSteps, [], "no new step for Atlas");
  /* the pitch marked done by Luke while it waits: the song not showing can no longer hold it up */
  const r = await sent(d, "Marked", "2026-11-25");
  await S.setStep(d, NOW, R, { by: "Luke", id: r.id, step: "pitch", status: "done", note: "Sent from my phone" });
  assert.ok(!S.releaseView((await S.listReleases(d)).find((x) => x.id === r.id), TODAY).warnings.some((w) => /the pitch cannot be sent/.test(w)));
});

test("Spotify for Artists: a song matches its release by title AND date (within a day); another artist's same-title song is asked about, and a different date is a warning", async () => {
  const d = memoryDesk();
  await S.saveRelease(d, NOW, R, { by: "Luke", title: "Love You", date: "2026-03-01", pack: { kind: "Self-release" } });
  await S.sendRelease(d, NOW, R, { by: "Luke", id: "loveyou" });
  const later = await sent(d, "Night Drive", "2026-12-11");
  const out = await call(d, "spotify_upcoming", { bot: "Atlas", releases: [{ title: "Love You", date: "2026-11-27", shown_as: "Someone Else · DistroKid" }, { title: "Night Drive", date: "2026-12-04" }] });
  assert.deepEqual([out.in_the_pipeline, out.steps_done], [[], []], "nothing completed by a title alone");
  const sv = S.board(await S.loadDesk(d, NOW), NOW, null).sightings;
  assert.deepEqual(sv.items.map((x) => [x.title, x.state, x.match]), [["Love You", "unknown", null], ["Night Drive", "unknown", null]]);
  assert.equal(sv.items[0].near, undefined, "a song already out is never offered as 'It is …'");
  assert.equal(step((await S.listReleases(d)).find((x) => x.id === later.id), "spotify").status, "todo");
  const v = S.releaseView((await S.listReleases(d)).find((x) => x.id === later.id), TODAY, { sightings: await S.getSightings(d) });
  assert.ok(v.warnings.includes("Spotify for Artists shows Fri 4 Dec, the pack says Fri 11 Dec"), v.warnings.join("\n"));
  assert.ok(!v.warnings.some((w) => /Not showing in Spotify for Artists/.test(w)), "it does show, on another day: said as that");
  const rep = S.checkReport({ desk: await S.loadDesk(d, NOW), hq: null, hqState: null, now: NOW });
  assert.ok(rep.problems.includes("Night Drive: Spotify for Artists shows Fri 4 Dec, the pack says Fri 11 Dec"), rep.problems.join("\n"));
  /* within a day counts as the same song (a time zone) */
  await call(d, "spotify_upcoming", { bot: "Atlas", releases: [{ title: "Night Drive", date: "2026-12-10" }] }, NOW + HOUR);
  assert.equal(step((await S.listReleases(d)).find((x) => x.id === later.id), "spotify").status, "done");
  /* a release sent while the report shows its title on another day: not marked done */
  await call(d, "spotify_upcoming", { bot: "Atlas", releases: [{ title: "Glass Heart", date: "2026-12-04" }] }, NOW + 2 * HOUR);
  assert.equal(step(await sent(d, "Glass Heart", "2026-12-18", FULL, NOW + 3 * HOUR), "spotify").status, "todo");
});

test("titles with no Latin letter: each keeps its own key and never matches another (no '' === '')", async () => {
  const d = memoryDesk();
  assert.notEqual(S.sightKey("Ночь", "2026-12-11"), S.sightKey("День", "2026-12-11"));
  assert.match(S.sightKey("Ночь", "2026-12-11"), /^t[0-9a-z]+\|2026-12-11$/, "ASCII, so the page's ids stay apart too");
  assert.equal(S.sightKey("Ночь", "2026-12-11"), S.sightKey(" ночь ", "2026-12-11"));
  assert.deepEqual([S.sameSong("Ночь", "День"), S.sameSong("Ночь", "ночь"), S.sameSong("", ""), S.sameSong("Me Dá Seu Body", "me da seu body")], [false, true, false, true]);
  await sent(d, "День", "2026-12-11");
  const out = await call(d, "spotify_upcoming", { bot: "Atlas", releases: [{ title: "Ночь", date: "2026-12-11" }, { title: "День", date: "2026-12-11" }] });
  assert.equal(out.songs, 2, "both kept");
  const sv = S.board(await S.loadDesk(d, NOW), NOW, null).sightings;
  assert.deepEqual(sv.items.map((x) => [x.title, x.state]), [["Ночь", "unknown"], ["День", "pipeline"]]);
  assert.deepEqual(out.steps_done, ["День: Showing as upcoming in Spotify for Artists (the Spotify pitch is open now)"], "only its own release");
  const m = hqModel({ Songs: [["date", "song", "spotify_streams"], ["2026-11-10", "Ночь", "1"]] }, TODAY, {}, undefined, "09:20", { updates: [], overlay: null, releases: (await S.listReleases(d)).map((r) => S.releaseView(r, TODAY)) });
  assert.equal(m.songs[0].deal, null, "Songs: another song's deal is never borrowed");
  assert.deepEqual(mergeReleases([{ song: "Ночь", date: "2026-12-11", steps: [] }], [S.releaseView((await S.listReleases(d))[0], TODAY)], TODAY).map((r) => r.song).sort(), ["День", "Ночь"], "two cards, not one");
});

test("'Not mine' twice in a hurry: Nova is told ONCE (the send is claimed in the same write as the answer)", async () => {
  const base = memoryDesk();
  const slow = new Proxy(base, { get: (t, k) => (typeof t[k] === "function" ? async (...a) => { await new Promise((r) => setTimeout(r, 8)); return t[k](...a); } : t[k]) });
  await call(base, "spotify_upcoming", { bot: "Atlas", releases: [{ title: "Paper Sky", date: "2026-12-04" }] });
  const key = S.sightKey("Paper Sky", "2026-12-04");
  for (const gap of [0, 15, 35]) {
    await base.setJSON("msg/2026-11.json", []);
    await base.setJSON("sightings.json", { ...(await S.getSightings(base)), answers: {} });
    const one = S.answerSighting(slow, NOW, R, { by: "Luke", key, answer: "notmine" });
    await new Promise((r) => setTimeout(r, gap));
    const two = S.answerSighting(slow, NOW + 50, R, { by: "Luke", key, answer: "notmine" });
    const res = await Promise.all([one, two]);
    assert.equal((await S.listMessages(base, NOW)).filter((m) => m.to === "Nova").length, 1, "gap " + gap + " ms");
    assert.ok(res.every((x) => x.told || x.sending), "neither tap is told it failed");
  }
});

test("'Not mine' whose message to Nova could not go: the answer is kept, the song is offered 'Send it to Nova again', and that sends it", async () => {
  const d = memoryDesk();
  await call(d, "spotify_upcoming", { bot: "Atlas", releases: [{ title: "Paper Sky", date: "2026-12-04", shown_as: "Someone Else" }] });
  const key = S.sightKey("Paper Sky", "2026-12-04");
  /* Luke has hit the day's limit of messages: the message can't go */
  await d.setJSON("msg/2026-11.json", Array.from({ length: S.LIMITS.messagesPerSenderPerDay }, (_, i) => ({ id: "mfill" + i, at: new Date(NOW - i).toISOString(), sp: S.spStamp(NOW - i), from: "Luke", to: "Nova", text: "x", needs: "none", re: "", options: [], kind: "note", resolved: null })));
  const first = await S.answerSighting(d, NOW, R, { by: "Luke", key, answer: "notmine" });
  assert.deepEqual([first.told, first.sightings.items[0].state, first.sightings.retry, first.sightings.waitingOnLuke], [null, "retry", 1, 1]);
  assert.equal((await S.getSightings(d)).answers[key].msg, null, "the claim is let go");
  await d.setJSON("msg/2026-11.json", []);
  const again = await S.answerSighting(d, NOW + DAY, R, { by: "Luke", key, answer: "notmine" });
  assert.ok(again.told);
  assert.deepEqual([again.sightings.items[0].state, again.sightings.items[0].answer.told], ["answered", again.told]);
  assert.equal((await S.listMessages(d, NOW + DAY)).filter((m) => m.to === "Nova").length, 1);
});

test("'It is <song>': a song in the pipeline shown under another title is offered, and answering marks its Spotify step done", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Me Dá Seu Body", "2026-11-24");
  await call(d, "spotify_upcoming", { bot: "Atlas", releases: [{ title: "Me Dá Seu Body (feat. Sample)", date: "2026-11-24" }, { title: "Something Else", date: "2026-12-30" }] });
  let sv = S.board(await S.loadDesk(d, NOW), NOW, null).sightings;
  const item = sv.items[0];
  assert.deepEqual([item.state, item.near && item.near.id, item.near && item.near.title], ["unknown", r.id, "Me Dá Seu Body"]);
  assert.equal(sv.items[1].near, undefined, "nothing like it: no fifth answer");
  await fails(S.answerSighting(d, NOW, R, { by: "Luke", key: item.key, answer: "it", id: "nope" }), /not in the pipeline any more/);
  const out = await S.answerSighting(d, NOW, R, { by: "Luke", key: item.key, answer: "it", id: r.id });
  const st = step(out.release, "spotify");
  assert.deepEqual([st.status, st.by, st.note], ["done", "Luke", 'Showing in Spotify for Artists as "Me Dá Seu Body (feat. Sample)" since Thu 12 Nov']);
  assert.equal(S.releaseView(out.release, TODAY).steps.find((s) => s.key === "pitch").waiting, false, "the pitch opens");
  assert.deepEqual([out.sightings.items[0].state, out.sightings.items[0].match, out.sightings.unknown], ["pipeline", r.id, 1]);
  assert.equal((await S.listReleases(d)).length, 1, "no duplicate draft");
  /* the next report keeps it matched */
  await call(d, "spotify_upcoming", { bot: "Atlas", releases: [{ title: "Me Dá Seu Body (feat. Sample)", date: "2026-11-24" }] }, NOW + DAY);
  sv = S.board(await S.loadDesk(d, NOW + DAY), NOW + DAY, null).sightings;
  assert.deepEqual([sv.items[0].state, sv.items[0].match], ["pipeline", r.id]);
});

test("the deal changed after sending: Drop is told once, an upload already started is a warning, and his reopened steps are never born late", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Switch", "2026-12-11");
  await S.setStep(d, NOW, R, { by: "Drop", id: r.id, step: "upload", status: "working" });
  const lab = await S.saveRelease(d, NOW + 1000, R, { by: "Luke", id: r.id, pack: { kind: "With a label", label: "Sample Records", split: "50/50" } });
  assert.deepEqual([step(lab, "upload").status, step(lab, "approved").status], ["working", "skipped"]);
  const toDrop = (await all(d)).filter((m) => m.to === "Drop");
  assert.equal(toDrop.length, 1);
  assert.deepEqual([toDrop[0].from, toDrop[0].needs], ["HQ", "action"]);
  assert.equal(toDrop[0].text, 'Luke changed whose release Switch is (out Fri 11 Dec): Sample Records delivers it to the stores, not us. Approved by RouteNote (nothing waiting) is skipped. "Uploaded to RouteNote with the release date" is already working: stop, and tell Luke on the desk whether it went to RouteNote, so the song is not delivered twice.');
  assert.ok(S.releaseView(lab, TODAY).warnings.includes("A label release, but Uploaded to RouteNote with the release date is working (Drop): one song must not be delivered twice"));
  const rep = S.checkReport({ desk: await S.loadDesk(d, NOW), hq: null, hqState: null, now: NOW });
  assert.ok(rep.problems.some((p) => /Switch: A label release, but Uploaded to RouteNote/.test(p)), rep.problems.join("\n"));
  /* the split edited again: nothing of Drop's changes, nobody is told */
  await S.saveRelease(d, NOW + 2000, R, { by: "Luke", id: r.id, pack: { split: "BADSCANDAL 50% · Sample Records 50%" } });
  assert.equal((await all(d)).filter((m) => m.to === "Drop").length, 1);
  /* back to a self-release, weeks later: the approval is his again, due today at the earliest, and he is told */
  const back = await S.saveRelease(d, Date.parse("2026-11-28T12:00:00Z"), R, { by: "Luke", id: r.id, pack: { kind: "Self-release" } });
  assert.deepEqual([step(back, "approved").status, step(back, "approved").due], ["todo", "2026-11-28"]);
  assert.match((await S.listMessages(d, Date.parse("2026-11-28T12:00:00Z"))).find((m) => m.to === "Drop").text, /we deliver it now, through RouteNote \(badscandaladmin\)\. Approved by RouteNote \(nothing waiting\) is yours again/);
});

test("small wording: release_step says Upcoming; 'started the song'; a blocked next step says blocked; a pitch too late has no 'until it does'", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Words", "2026-12-11");
  assert.equal((await call(d, "release_step", { bot: "Drop", song: "Words", step: "upload", status: "working" })).shown_on, "badscandal.com/hq, Upcoming and the live log");
  assert.match(r.log[0].what, /^Luke started the song for Fri 11 Dec$/);
  const w = warn(made("2026-11-17", "2026-11-01"));
  assert.ok(w.includes("Not showing in Spotify for Artists yet, 5 days before release"), w.join("\n"));
  assert.ok(w.includes("Too late for a Spotify pitch: Spotify needs it 7 days before release"));
  assert.ok(!w.some((x) => /until it does/.test(x)));
});
