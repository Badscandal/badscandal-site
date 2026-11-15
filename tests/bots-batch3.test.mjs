/* The bots' feedback, batch 3 (14 Nov 2026): releases.
   - Kevin, Steve and Laura post the teasers, but the pipeline had no step for them: three "Teaser posted"
     steps, each waiting on Luke's "Teaser clips approved", each on its own day (21 Nov for a 24 Nov song).
     Releases already sent get them too, without touching their finished steps.
   - a pack sent late showed Drop's upload (done days earlier) as "done today": release_step takes done_on.
   - a step's link (the Spotify track URL on release day for Webmaster) must show everywhere.
   - "Pitch approved" and "Final lyrics approved": who, when, the exact text. Only Luke (or Alfred
     recording Luke's words). Atlas and Verse read them in release_pack.
   - Drop's moderation log and the store status are ONE history with a fixed list of statuses; a
     rejection carries RouteNote's reason, and "ready to resubmit" asks Luke Yes / Not yet. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, INSTRUCTIONS } from "../netlify/lib/staff-tools.mjs";
import { mergeReleases } from "../netlify/lib/hq.mjs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const NOW = Date.parse("2026-11-14T15:00:00Z"); /* Sat 14 Nov, 12:00 in São Paulo */
const TODAY = "2026-11-14";
const MIN = 60000, DAY = 86400000;
const R = S.DEFAULT_ROSTER;
const fails = (p, re) => assert.rejects(p, (e) => e.name === "StaffError" && re.test(e.message));
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, o = {}) => callTool(tool(name), args, { store: d, now: o.now || NOW, role: o.role || "bot", hq: async () => null });
const PACK = { kind: "Self-release", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", language: "Portuguese", explicit: "No", genre: "Dance", writers: "Sample Writer: music and lyrics", copyright: "℗ 2026 Sample · © 2026 Sample" };
const LYRICS = "Made-up line one\nMade-up line two";
async function sent(d, title = "Night Drive", date = "2026-11-24", pack = PACK, now = NOW) {
  const r = await S.saveRelease(d, now, R, { by: "Luke", title, date, pack });
  return (await S.sendRelease(d, now, R, { by: "Luke", id: r.id })).release;
}
const view = async (d, id, today = TODAY) => S.releaseView((await S.listReleases(d)).find((x) => x.id === id), today);
const step = (v, key) => v.steps.find((s) => s.key === key);
const TEASERS = ["teaser_tiktok", "teaser_instagram", "teaser_youtube"];

/* ---------- 1. the teaser posts ---------- */
test("three teaser-post steps (Kevin, Steve, Laura) wait on Luke's approval and are due 3 days before release", async () => {
  const t = S.RELEASE_STEPS.filter((s) => TEASERS.includes(s.key));
  assert.deepEqual(t.map((s) => [s.key, s.owner, s.days, s.after, s.ownDay]), [["teaser_tiktok", "Kevin", 3, "teasers", true], ["teaser_instagram", "Steve", 3, "teasers", true], ["teaser_youtube", "Laura", 3, "teasers", true]]);
  assert.deepEqual(t.map((s) => s.label), ["Teaser posted on TikTok", "Teaser posted on Instagram", "Teaser posted on YouTube"]);
  /* right after Luke's approval, before the ads */
  const keys = S.RELEASE_STEPS.map((s) => s.key);
  assert.deepEqual(keys.slice(keys.indexOf("teasers"), keys.indexOf("teasers") + 5), ["teasers", ...TEASERS, "ads"]);
  const d = memoryDesk();
  const r = await sent(d);
  const v = await view(d, r.id);
  for (const k of TEASERS) {
    const s = step(v, k);
    assert.equal(s.due, "2026-11-21", "the bots asked for 21 Nov for a 24 Nov song");
    assert.equal(s.waiting, true);
    assert.equal(s.waitingFor, "teasers");
    assert.match(s.waitingText, /Luke.*teaser clips/i);
  }
  /* a bot can't post-and-mark before Luke approved the clips */
  await fails(S.setStep(d, NOW, R, { by: "Kevin", id: r.id, step: "teaser_tiktok", status: "done" }), /waiting.*Teaser clips approved/i);
  /* Luke approves early (18 Nov): each post keeps its own day, it is not pulled forward to the approval day */
  await S.setStep(d, NOW + 4 * DAY, R, { by: "Luke", id: r.id, step: "teasers", status: "done" });
  const v2 = await view(d, r.id, "2026-11-18");
  assert.ok(TEASERS.every((k) => step(v2, k).due === "2026-11-21" && !step(v2, k).waiting && !step(v2, k).late));
  await S.setStep(d, NOW + 7 * DAY, R, { by: "Kevin", id: r.id, step: "teaser_tiktok", status: "done", link: "https://example.com/tiktok/post" });
  assert.equal(step(await view(d, r.id, "2026-11-21"), "teaser_tiktok").link, "https://example.com/tiktok/post");
});

test("a late approval frees the teaser posts for that day, never born late", async () => {
  const d = memoryDesk();
  const r = await sent(d);
  await S.setStep(d, Date.parse("2026-11-22T15:00:00Z"), R, { by: "Luke", id: r.id, step: "teasers", status: "done" });
  const v = await view(d, r.id, "2026-11-22");
  assert.ok(TEASERS.every((k) => step(v, k).due === "2026-11-22" && !step(v, k).late));
});

test("each teaser post has its own day: its owner (or Nova) sets it, never after release day or in the past", async () => {
  const d = memoryDesk();
  const r = await sent(d);
  const res = await call(d, "release_step", { bot: "Kevin", song: "Night Drive", step: "teaser_tiktok", due: "2026-11-20" });
  assert.equal(res.due, "Fri 20 Nov (2026-11-20)");
  await S.setStep(d, NOW, R, { by: "Nova", id: r.id, step: "teaser_youtube", due: "2026-11-23" });
  const v = await view(d, r.id);
  assert.deepEqual(TEASERS.map((k) => step(v, k).due), ["2026-11-20", "2026-11-21", "2026-11-23"]);
  assert.equal(step(v, "teaser_tiktok").status, "todo", "setting the day alone doesn't change the state");
  await fails(S.setStep(d, NOW, R, { by: "Kevin", id: r.id, step: "teaser_tiktok", due: "2026-11-25" }), /release day/i);
  await fails(S.setStep(d, NOW, R, { by: "Kevin", id: r.id, step: "teaser_tiktok", due: "2026-11-10" }), /passed/i);
  await fails(S.setStep(d, NOW, R, { by: "Kevin", id: r.id, step: "teaser_tiktok", due: "20 Nov" }), /YYYY-MM-DD/);
  await fails(S.setStep(d, NOW, R, { by: "Drop", id: r.id, step: "upload", due: "2026-11-20" }), /own day/i);
  await fails(S.setStep(d, NOW, R, { by: "Steve", id: r.id, step: "teaser_tiktok", due: "2026-11-20" }), /Kevin's step/);
  await fails(S.setStep(d, NOW, R, { by: "Kevin", id: r.id, step: "teaser_tiktok" }), /status must be one of/);
  assert.equal(tool("release_step").inputSchema.properties.due.type, "string");
  assert.deepEqual(tool("release_step").inputSchema.required, ["bot", "song", "step"]);
});

test("releases already sent get the teaser posts once; finished steps, drafts and songs already out are left alone", async () => {
  const d = memoryDesk();
  const r = await sent(d);
  await S.setStep(d, NOW, R, { by: "Drop", id: r.id, step: "upload", status: "done", note: "Uploaded" });
  const out = await sent(d, "Old Song", "2026-11-10"); /* recorded as already out */
  await S.saveRelease(d, NOW, R, { by: "Luke", title: "A Draft", date: "2026-12-18", pack: { kind: "Self-release" } });
  /* as stored before batch 3: ten steps */
  const list = await S.listReleases(d);
  for (const x of list) x.steps = (x.steps || []).filter((s) => !TEASERS.includes(s.key));
  await d.setJSON("releases.json", list);
  const before = JSON.stringify(list.find((x) => x.id === r.id).steps.find((s) => s.key === "upload"));

  const up = await S.upgradeReleases(d, NOW);
  assert.deepEqual(up.added, [{ id: r.id, title: "Night Drive", steps: TEASERS }]);
  const after = (await S.listReleases(d)).find((x) => x.id === r.id);
  assert.deepEqual(after.steps.map((s) => s.key), S.RELEASE_STEPS.map((s) => s.key), "in their place, right after Luke's approval");
  assert.equal(JSON.stringify(after.steps.find((s) => s.key === "upload")), before, "Drop's finished step is untouched");
  assert.ok(after.steps.filter((s) => TEASERS.includes(s.key)).every((s) => s.due === "2026-11-21" && s.status === "todo"));
  assert.match(after.log[after.log.length - 1].what, /teaser/i);
  const all = await S.listReleases(d);
  assert.equal(all.find((x) => x.id === out.id).steps.length, 10, "a song already out gets nothing new to do");
  assert.equal(all.find((x) => x.title === "A Draft").steps.length, 0);
  /* idempotent: the second time writes nothing */
  const etag = d._map.get("releases.json").etag;
  assert.deepEqual((await S.upgradeReleases(d, NOW)).added, []);
  assert.equal(d._map.get("releases.json").etag, etag);
  /* a release whose posts' day already passed gets them due today, never born late */
  const d2 = memoryDesk();
  const soon = await sent(d2, "Soon Song", "2026-11-16");
  const l2 = await S.listReleases(d2);
  l2[0].steps = l2[0].steps.filter((s) => !TEASERS.includes(s.key));
  await d2.setJSON("releases.json", l2);
  await S.upgradeReleases(d2, NOW);
  assert.ok((await S.listReleases(d2)).find((x) => x.id === soon.id).steps.filter((s) => TEASERS.includes(s.key)).every((s) => s.due === TODAY));
});

test("the tools upgrade an old release before answering: Kevin's my_day shows his teaser post", async () => {
  const d = memoryDesk();
  const r = await sent(d);
  const list = await S.listReleases(d);
  list[0].steps = list[0].steps.filter((s) => !TEASERS.includes(s.key));
  await d.setJSON("releases.json", list);
  const day = await call(d, "my_day", { bot: "Kevin" });
  const t = day.release_steps.find((s) => s.step === "teaser_tiktok");
  assert.equal(t.song, "Night Drive");
  assert.equal(t.state, "waiting");
  assert.match(t.waiting_for, /Luke.*teaser clips/i);
  assert.match(day.next, /waiting/i);
  assert.ok(!/Spotify for Artists/.test(t.waiting_for), "not the Spotify wording: it waits for Luke");
  assert.equal((await S.listReleases(d)).find((x) => x.id === r.id).steps.length, 13);
});

/* ---------- 2. the real done date ---------- */
test("done_on: work finished before a late pack was sent shows its real day", async () => {
  const d = memoryDesk();
  const r = await sent(d); /* 10 days out: the upload was due today */
  const res = await call(d, "release_step", { bot: "Drop", song: "Night Drive", step: "upload", status: "done", done_on: "2026-11-09" });
  assert.equal(res.done_on, "Mon 9 Nov (2026-11-09)");
  const s = step(await view(d, r.id), "upload");
  assert.equal(s.doneOn, "2026-11-09");
  assert.equal(L.stepState(s, TODAY).text, "done 9 Nov by Drop");
  const pack = await call(d, "release_pack", { bot: "Drop", song: "Night Drive" });
  assert.equal(pack.steps.find((x) => x.step === "upload").done_on, "Mon 9 Nov (2026-11-09)");
  await fails(S.setStep(d, NOW, R, { by: "Drop", id: r.id, step: "approved", status: "done", done_on: "2026-11-15" }), /future/i);
  await fails(S.setStep(d, NOW, R, { by: "Drop", id: r.id, step: "approved", status: "done", done_on: "9 Nov" }), /YYYY-MM-DD/);
  await fails(S.setStep(d, NOW, R, { by: "Drop", id: r.id, step: "approved", status: "working", done_on: "2026-11-09" }), /only with status done/i);
  /* reopened: the old day goes with it */
  await S.setStep(d, NOW, R, { by: "Drop", id: r.id, step: "upload", status: "todo" });
  assert.equal(step(await view(d, r.id), "upload").doneOn, undefined);
  assert.equal(tool("release_step").inputSchema.properties.done_on.type, "string");
});

/* ---------- 3. a link per step, everywhere ---------- */
test("a step's link is kept and shown everywhere; Webmaster's release-day step carries the Spotify track", async () => {
  const d = memoryDesk();
  const r = await sent(d);
  const LINK = "https://example.com/youtube/scheduled";
  await S.setStep(d, NOW, R, { by: "Laura", id: r.id, step: "video", status: "working", link: LINK });
  /* a later mark without a link keeps the one saved */
  await S.setStep(d, NOW + MIN, R, { by: "Laura", id: r.id, step: "video", status: "blocked", note: "Waiting for the master" });
  const v = await view(d, r.id);
  assert.equal(step(v, "video").link, LINK);
  const laura = await call(d, "my_day", { bot: "Laura" });
  assert.equal(laura.release_steps.find((s) => s.step === "video").link, LINK);
  assert.equal((await call(d, "release_pack", { bot: "Laura", song: "Night Drive" })).steps.find((s) => s.step === "video").link, LINK);
  assert.equal((await call(d, "releases", { bot: "Laura" })).releases[0].your_steps.find((s) => s.step === "video").link, LINK);
  /* HQ's merged list (Today, the release panel) keeps it too */
  const merged = mergeReleases([], [v], TODAY);
  assert.equal(merged[0].steps.find((s) => s.label === "Video scheduled on YouTube").link, LINK);
  /* release day: the Spotify track link, wherever Webmaster looks */
  const TRACK = "https://open.spotify.com/track/sample123";
  await call(d, "release_fill", { bot: "Atlas", song: "Night Drive", field: "spotifyTrack", value: TRACK });
  const wm = await call(d, "my_day", { bot: "Webmaster" });
  assert.equal(wm.release_steps.find((s) => s.step === "live").spotify_track, TRACK);
  assert.equal((await call(d, "release_pack", { bot: "Webmaster", song: "Night Drive" })).steps.find((s) => s.step === "live").spotify_track, TRACK);
  const res = await call(d, "release_step", { bot: "Webmaster", song: "Night Drive", step: "page", status: "done", link: "https://badscandal.com/nightdrive" });
  assert.equal(res.link, "https://badscandal.com/nightdrive");
});

/* ---------- 4. approvals ---------- */
const PITCH = "Night Drive is a warm, late-night dance song about driving home at dawn. (Made-up pitch.)";
test("Atlas asks Luke to approve the pitch; Luke's Approve records who, when and the exact text", async () => {
  const d = memoryDesk();
  const r = await sent(d);
  const ask = await call(d, "send_message", { bot: "Atlas", to: "Luke", text: "Here is the Spotify pitch for Night Drive. OK to send?", approval: { song: "Night Drive", what: "pitch", text: PITCH } });
  assert.equal(ask.needs, "decision");
  const m = await S.getMessage(d, ask.id);
  assert.deepEqual(m.options, ["Approve", "Not yet"]);
  assert.deepEqual(m.approval, { id: r.id, title: "Night Drive", what: "pitch", text: PITCH });
  /* nothing is approved until Luke says so */
  assert.equal((await view(d, r.id)).approvals.pitch, null);
  const a = await S.sendMessage(d, NOW + MIN, R, { from: "Luke", to: "Atlas", text: "Approve", re: ask.id, note: "Approve" });
  assert.equal(a.settled, true);
  assert.equal(a.approved.what, "pitch");
  const ap = (await view(d, r.id)).approvals.pitch;
  assert.deepEqual([ap.by, ap.text, ap.msg, ap.via], ["Luke", PITCH, ask.id, undefined]);
  assert.equal(ap.at, new Date(NOW + MIN).toISOString());
  /* Atlas reads it in release_pack */
  const pack = await call(d, "release_pack", { bot: "Atlas", song: "Night Drive" });
  assert.deepEqual(pack.approvals.pitch, { approved: true, by: "Luke", on: "Sat 14 Nov 12:01", text: PITCH });
  assert.equal(pack.approvals.lyrics.approved, false);
  assert.match((await view(d, r.id)).log.map((x) => x.what).join("\n"), /Luke approved the pitch/);
});

test("Not yet approves nothing; only Atlas asks for the pitch and Verse for the lyrics; refusals say what to do", async () => {
  const d = memoryDesk();
  const r = await sent(d);
  const ask = await call(d, "send_message", { bot: "Atlas", to: "Luke", text: "Pitch OK?", approval: { song: "Night Drive", what: "pitch", text: PITCH } });
  await S.sendMessage(d, NOW + MIN, R, { from: "Luke", to: "Atlas", text: "Not yet: make it shorter", re: ask.id, note: "Not yet" });
  assert.equal((await view(d, r.id)).approvals.pitch, null);
  await fails(call(d, "send_message", { bot: "Verse", to: "Luke", text: "Pitch?", approval: { song: "Night Drive", what: "pitch", text: PITCH } }), /pitch.*Atlas/i);
  await fails(call(d, "send_message", { bot: "Atlas", to: "Kevin", text: "Pitch?", approval: { song: "Night Drive", what: "pitch", text: PITCH } }), /to Luke/i);
  await fails(call(d, "send_message", { bot: "Atlas", to: "Luke", text: "Video?", approval: { song: "Night Drive", what: "video", text: "x" } }), /pitch or lyrics/i);
  await fails(call(d, "send_message", { bot: "Atlas", to: "Luke", text: "Pitch?", approval: { song: "Night Drive", what: "pitch" } }), /the pitch itself/i);
  await fails(call(d, "send_message", { bot: "Verse", to: "Luke", text: "Lyrics final?", approval: { song: "Night Drive", what: "lyrics" } }), /no lyrics/i);
  await fails(call(d, "send_message", { bot: "Atlas", to: "Luke", text: "Pitch?", approval: { song: "No Such Song", what: "pitch", text: PITCH } }), /No Such Song/);
  assert.equal(tool("send_message").inputSchema.properties.approval.type, "object");
});

test("Final lyrics approved through Alfred: Luke's words kept, the lyrics as approved; a later change shows", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Night Drive", "2026-11-24", { ...PACK, lyrics: LYRICS });
  const ask = await call(d, "send_message", { bot: "Verse", to: "Luke", text: "Are the Night Drive lyrics in the pack final?", approval: { song: "Night Drive", what: "lyrics" } });
  const rec = await call(d, "record_luke_answer", { bot: "Alfred", reply_to: ask.id, luke_said: "yes those are final", option: "Approve" });
  assert.equal(rec.closed, true);
  let ap = (await view(d, r.id)).approvals.lyrics;
  assert.deepEqual([ap.by, ap.via, ap.words, ap.text, ap.current], ["Luke", "Alfred", "yes those are final", LYRICS, true]);
  const pack = await call(d, "release_pack", { bot: "Verse", song: "Night Drive" });
  assert.equal(pack.approvals.lyrics.approved, true);
  assert.equal(pack.approvals.lyrics.by, "Luke (via Alfred)");
  assert.equal(pack.approvals.lyrics.matches_the_pack, true);
  /* Luke changes a line: the approval stays on record but no longer matches */
  await S.saveRelease(d, NOW + DAY, R, { by: "Luke", id: r.id, pack: { lyrics: LYRICS + "\nMade-up line three" } });
  ap = (await view(d, r.id)).approvals.lyrics;
  assert.equal(ap.current, false);
  const p2 = await call(d, "release_pack", { bot: "Verse", song: "Night Drive" }, { now: NOW + DAY });
  assert.equal(p2.approvals.lyrics.approved, false);
  assert.match(p2.approvals.lyrics.state, /changed since/i);
});

test("Luke approves the lyrics himself on HQ, or withdraws an approval; nobody else does", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Night Drive", "2026-11-24", { ...PACK, lyrics: LYRICS });
  const ok = await S.approveRelease(d, NOW, R, { by: "Luke", id: r.id, what: "lyrics" });
  assert.equal(ok.approvals.lyrics.text, LYRICS);
  await fails(S.approveRelease(d, NOW, R, { by: "Claude", id: r.id, what: "lyrics" }), /Only Luke/);
  await fails(S.approveRelease(d, NOW, R, { by: "Alfred", id: r.id, what: "lyrics" }), /Only Luke/);
  await fails(S.approveRelease(d, NOW, R, { by: "Luke", id: r.id, what: "pitch" }), /the pitch itself/i);
  await S.approveRelease(d, NOW, R, { by: "Luke", id: r.id, what: "pitch", text: PITCH });
  await S.approveRelease(d, NOW + MIN, R, { by: "Luke", id: r.id, what: "pitch", withdraw: true });
  const v = await view(d, r.id);
  assert.equal(v.approvals.pitch, null);
  assert.equal(v.approvals.lyrics.by, "Luke");
  /* the board's slim copy carries no lyrics, not even inside the approval */
  const slim = S.slimRelease(v);
  assert.equal(slim.approvals.lyrics.text, undefined);
  assert.equal(slim.approvals.lyrics.textChars, LYRICS.length);
  assert.deepEqual(L.approvalLines(v).map((x) => [x.key, x.ok]), [["pitch", false], ["lyrics", true]]);
  assert.match(L.approvalLines(v)[1].text, /^Final lyrics approved by Luke, Sat 14 Nov/);
  assert.match(L.approvalLines(v)[0].text, /^Pitch: not approved yet/);
});

/* ---------- 5 + 7. the store status, one history (Drop's moderation log) ---------- */
test("store_status: a fixed list, kept with history; a rejection needs RouteNote's reason and shows as a warning", async () => {
  assert.deepEqual(S.STORE_STATUS, ["not uploaded", "uploaded", "in moderation", "rejected", "resubmitted", "approved", "delivered", "live"]);
  const d = memoryDesk();
  const r = await sent(d);
  await call(d, "store_status", { bot: "Drop", song: "Night Drive", status: "uploaded", on: "2026-11-12" });
  await call(d, "store_status", { bot: "Drop", song: "Night Drive", status: "in moderation" }, { now: NOW + MIN });
  await fails(call(d, "store_status", { bot: "Drop", song: "Night Drive", status: "rejected" }), /reason/i);
  await fails(call(d, "store_status", { bot: "Drop", song: "Night Drive", status: "in review at RouteNote" }), /must be one of/);
  await fails(call(d, "store_status", { bot: "Kevin", song: "Night Drive", status: "live" }), /Drop/);
  const res = await call(d, "store_status", { bot: "Drop", song: "Night Drive", status: "rejected", reason: "The artwork has a web address on it" }, { now: NOW + 2 * MIN });
  assert.equal(res.status, "rejected");
  const v = await view(d, r.id);
  assert.equal(v.pack.storeStatus, "rejected", "the current status is the pack's field, so every older reader still works");
  assert.equal(v.store.status, "rejected");
  assert.equal(v.store.reason, "The artwork has a web address on it");
  assert.deepEqual(v.store.history.map((h) => [h.status, h.on, h.by]), [["rejected", TODAY, "Drop"], ["in moderation", TODAY, "Drop"], ["uploaded", "2026-11-12", "Drop"]], "newest first");
  assert.ok(v.warnings.some((w) => /Rejected at the distributor: The artwork has a web address on it \(Drop\)/.test(w)));
  const pack = await call(d, "release_pack", { bot: "Drop", song: "Night Drive" });
  assert.equal(pack.store.status, "rejected");
  assert.equal(pack.store.history[0], "Sat 14 Nov: rejected: The artwork has a web address on it (Drop)");
  assert.equal(pack.store.history[2], "Thu 12 Nov: uploaded (Drop)");
  /* release_fill still takes the status (Drop's old habit), but a rejection goes through store_status */
  await fails(call(d, "release_fill", { bot: "Drop", song: "Night Drive", field: "storeStatus", value: "rejected" }), /store_status/);
  await call(d, "release_fill", { bot: "Drop", song: "Night Drive", field: "storeStatus", value: "Resubmitted" });
  /* Luke's own form writes the history too */
  await S.saveRelease(d, NOW + DAY, R, { by: "Luke", id: r.id, pack: { storeStatus: "approved" } });
  const v2 = await view(d, r.id);
  assert.deepEqual(v2.store.history.slice(0, 2).map((h) => [h.status, h.by]), [["approved", "Luke"], ["resubmitted", "Drop"]]);
  assert.ok(!v2.warnings.some((w) => /Rejected/.test(w)), "approved since: no warning");
  assert.deepEqual(L.storeHistory(v2.store).slice(0, 1), ["Sun 15 Nov · approved (Luke)"]);
  assert.equal(L.storeLine(v2.store), "At the distributor: approved · since Sun 15 Nov (Luke)");
  assert.equal(tool("store_status").inputSchema.properties.status.enum.length, 8);
});

test("an old free-text status still shows, as it was written", async () => {
  const d = memoryDesk();
  const r = await sent(d);
  const list = await S.listReleases(d);
  list[0].pack.storeStatus = "in review at RouteNote";
  await d.setJSON("releases.json", list);
  const v = await view(d, r.id);
  assert.deepEqual([v.store.status, v.store.legacy, v.store.history.length], ["", "in review at RouteNote", 0]);
  assert.equal(L.storeLine(v.store), "At the distributor: in review at RouteNote");
});

/* ---------- 6. ready to resubmit ---------- */
test("ready to resubmit: Drop asks once, Luke answers Yes or Not yet, and the answer goes back to Drop", async () => {
  const d = memoryDesk();
  const r = await sent(d);
  await fails(call(d, "store_status", { bot: "Drop", song: "Night Drive", status: "in moderation", ready_to_resubmit: true }), /only after a rejection/i);
  await call(d, "store_status", { bot: "Drop", song: "Night Drive", status: "rejected", reason: "The artwork has a web address on it" });
  const ask = await call(d, "store_status", { bot: "Drop", song: "Night Drive", status: "rejected", ready_to_resubmit: true, note: "New artwork uploaded, no web address" }, { now: NOW + MIN });
  assert.ok(ask.asked_luke);
  const m = await S.getMessage(d, ask.asked_luke);
  assert.deepEqual([m.from, m.to, m.needs, m.options, m.release, m.ask], ["Drop", "Luke", "decision", ["Yes, resubmit", "Not yet"], r.id, "resubmit"]);
  assert.match(m.text, /Night Drive/);
  assert.match(m.text, /web address on it/);
  assert.match(m.text, /New artwork uploaded/);
  /* asked again while open: the same question, not a second one */
  const again = await call(d, "store_status", { bot: "Drop", song: "Night Drive", status: "rejected", ready_to_resubmit: true }, { now: NOW + 2 * MIN });
  assert.equal(again.asked_luke, ask.asked_luke);
  assert.equal((await S.listMessages(d, NOW + DAY)).filter((x) => x.ask === "resubmit").length, 1);
  /* HQ finds it for the release card */
  const board = { messages: await S.listMessages(d, NOW + DAY) };
  assert.equal(L.resubmitAsk(board, r.id).id, ask.asked_luke);
  /* Luke: Yes */
  const yes = await S.sendMessage(d, NOW + 3 * MIN, R, { from: "Luke", to: "Drop", text: "Yes, resubmit", re: ask.asked_luke, note: "Yes, resubmit" });
  assert.equal(yes.settled, true);
  assert.equal(L.resubmitAsk({ messages: await S.listMessages(d, NOW + DAY) }, r.id), null);
  const day = await call(d, "my_day", { bot: "Drop" }, { now: NOW + 4 * MIN });
  assert.ok(day.messages_for_you.some((x) => x.from === "Luke" && /Yes, resubmit/.test(x.text)));
  assert.match((await view(d, r.id)).log.map((x) => x.what).join("\n"), /Luke answered Drop: Yes, resubmit/);
});

/* ---------- the connector and HQ's words ---------- */
test("the connector: 21 tools, the new rules in INSTRUCTIONS; HQ's short words for the new steps", () => {
  assert.ok(TOOLS.length >= 21, "21 with batch 3 (more since: batch 4)");
  assert.ok(tool("store_status"));
  const text = INSTRUCTIONS;
  assert.match(text, /teaser/i);
  assert.match(text, /store_status/);
  assert.match(text, /approval/i);
  assert.match(text, /done_on/);
  assert.deepEqual(["Teaser posted on TikTok", "Teaser posted on Instagram", "Teaser posted on YouTube"].map(L.shortStep), ["TikTok teaser", "Instagram teaser", "YouTube teaser"]);
});
