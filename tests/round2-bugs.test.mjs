/* HQ round-2 bugs (18 Nov 2026). Made-up songs, links and handles only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import * as IG from "../netlify/lib/instagram.mjs";
import * as P from "../netlify/lib/postrank.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";

const NOW = Date.parse("2026-11-18T15:00:00Z");
const TODAY = "2026-11-18";
const R = S.DEFAULT_ROSTER;
const call = (d, name, args, o = {}) => callTool(TOOLS.find((t) => t.name === name), args, { store: d, now: o.now || NOW, role: "bot", hq: async () => null, ig: o.ig, fetch: o.fetch });
const mem = () => { const m = new Map(); return { m, get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); }, delete: async (k) => { m.delete(k); } }; };

test("a pre-HQ pack marks only the RouteNote fields not needed, and a done step's link shows", async () => {
  const d = memoryDesk();
  const r = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Paper Moon", date: "2026-11-27", pack: { kind: "Self-release", prehq: "Yes" } });
  await S.sendRelease(d, NOW, R, { by: "Luke", id: r.id });
  await S.setStep(d, NOW, R, { by: "Laura", id: r.id, step: "video", status: "done", link: "https://youtu.be/madeupvideo", done_on: "2026-11-17" });
  const pack = await call(d, "release_pack", { bot: "Laura", song: "Paper Moon" });
  const by = Object.fromEntries(pack.pack.map((f) => [f.field, f]));
  assert.equal(by.wav.state, "not needed");
  assert.equal(by.artwork.state, "not needed");
  assert.equal(by.language.state, "not needed");
  assert.notEqual(by.spotifyTrack.state, "not needed");
  assert.notEqual(by.musixmatch.state, "not needed");
  assert.notEqual(by.lyrics.state, "not needed");
  assert.equal(by.video.value, "https://youtu.be/madeupvideo");
  assert.equal(by.video.done_on, "2026-11-17");
  assert.equal(by.video.state, undefined);
});

test("a Canvas step skipped because there was no link comes back when the link is added", async () => {
  const d = memoryDesk();
  const r = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Night Drive", date: "2026-12-11", pack: { kind: "Self-release", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", language: "English", explicit: "No", genre: "Dance", writers: "Sample Writer", copyright: "℗ 2026 badscandal" } });
  await S.sendRelease(d, NOW, R, { by: "Luke", id: r.id });
  const saved = await S.saveRelease(d, NOW, R, { by: "Luke", id: r.id, pack: { canvas: "https://example.com/canvas.mp4" } });
  const st = saved.steps.find((s) => s.key === "canvas");
  assert.equal(st.status, "todo");
  assert.equal(st.note, "");
});

test("preflight: flags do not fail, a pre-HQ song is skipped, a folder link could not be checked", async () => {
  const d = memoryDesk();
  await S.saveRelease(d, NOW, R, { by: "Luke", title: "Paper Moon", date: "2026-12-18", pack: { primary: "Sample Singer", featuring: "Badscandal", wav: "https://example.com/folder/abc", artwork: "https://example.com/folder/abc", folder: "https://example.com/folder/abc" } });
  const a = await call(d, "preflight", { bot: "Drop", song: "Paper Moon" });
  assert.equal(a.ok, true, a.problems && a.problems.join(" | "));
  assert.ok((a.flags || []).some((x) => /Flagged only/.test(x) && /Featured/.test(x)));
  assert.ok((a.flags || []).some((x) => /same link/.test(x)));
  assert.ok(!(a.checked || []).some((x) => /matches Spotify/.test(x)));
  assert.ok((a.couldnt_check || []).some((x) => /could not be checked/.test(x)));
  assert.equal((JSON.stringify(a).match(/capitalisation does not matter/g) || []).length, 1);
  await S.saveRelease(d, NOW, R, { by: "Luke", title: "Glass House", date: "2026-11-20", pack: { prehq: "Yes" } });
  const b = await call(d, "preflight", { bot: "Drop", song: "Glass House" });
  assert.equal(b.ok, true);
  assert.match(b.skipped, /skipped: pre-HQ song/);
  assert.ok(!(b.checked || []).some((x) => /matches Spotify/.test(x)));
});

test("my_day schedule drops a done step and a past date, and does not cut a Monday line", async () => {
  const d = memoryDesk();
  const r = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Paper Moon", date: "2026-11-27", pack: { kind: "Self-release", prehq: "Yes" } });
  await S.sendRelease(d, NOW, R, { by: "Luke", id: r.id });
  await S.setStep(d, NOW, R, { by: "Webmaster", id: r.id, step: "page", status: "done", link: "https://badscandal.com/papermoon", done_on: "2026-11-17" });
  await S.editRosterCard(d, NOW, R, { by: "Nova", for: "Webmaster", schedule: [{ time: "7 days before a rele", what: "Song page live" }, { time: "Monday 10:00", what: "What engages best and whether it holds on Ti" }] });
  await S.editRosterCard(d, NOW, R, { by: "Nova", for: "Atlas", schedule: [{ time: "14 days before a rel", what: "a rel" }] });
  const web = await call(d, "my_day", { bot: "Webmaster" });
  const lines = web.schedule.map((s) => `${s.time} ${s.what}`);
  assert.ok(!lines.some((x) => /song page/i.test(x)), lines.join(" | "));
  assert.ok(lines.some((x) => /recommendation/.test(x) && !/holds on Ti/.test(x)));
  const atlas = await call(d, "my_day", { bot: "Atlas" });
  const pitch = atlas.schedule.map((s) => `${s.time} ${s.what}`).join(" | ");
  assert.match(pitch, /Send the Spotify pitch/);
  assert.doesNotMatch(pitch, /Fri 13 Nov a rel/);
});

test("a note to everyone leaves once the song is pre-HQ, and a lyrics blocker clears when a proposal is waiting", async () => {
  const d = memoryDesk();
  const r = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Paper Moon", date: "2026-11-27", pack: { kind: "Self-release", prehq: "Yes" } });
  await S.sendMessage(d, Date.parse("2026-11-16T12:00:00Z"), R, { from: "Nova", to: "all", text: "Paper Moon is missing the Master WAV, the artwork and the language." });
  const day = await call(d, "my_day", { bot: "Nova" });
  assert.ok(!(day.notes_for_everyone || []).some((m) => /Master WAV/.test(m.text)));
  await S.sendRelease(d, NOW, R, { by: "Luke", id: r.id });
  await S.setStep(d, NOW, R, { by: "Verse", id: r.id, step: "lyrics", status: "blocked", note: "None provided yet, so there is no lyric video." });
  await S.setCard(d, NOW, R, { bot: "Verse", blockers: "Needs Luke's full Paper Moon lyrics text" });
  assert.equal(S.blockerForDuty("Lyrics for Glass House on Musixmatch", "Needs Luke's full Paper Moon lyrics text", ["Paper Moon", "Glass House"]), "");
  const asked = await S.proposeRelease(d, NOW, R, { by: "Verse", song: "Paper Moon", pack: { lyrics: "la la la, a made-up line" } });
  const verse = await call(d, "my_day", { bot: "Verse" });
  assert.equal(verse.your_known_blockers, undefined);
  await S.sendMessage(d, NOW + 1000, R, { from: "Luke", to: "Verse", text: "Yes, correct", re: asked.message.id, note: "Yes, correct" });
  const lyrics = S.releaseView((await S.listReleases(d)).find((x) => x.id === r.id), TODAY).steps.find((s) => s.key === "lyrics");
  assert.equal(lyrics.note, "Luke said yes to the lyrics.");
  assert.equal((await d.get("cards.json", { type: "json" })).verse.blockers, "");
});

test("0-view and old posts are not waiting, and under 10 ranked says not settled", () => {
  const now = NOW;
  const posts = [
    { id: "z0", at: new Date(now - 2 * 86400000).toISOString(), caption: "The rain makes it feel like I know what I'm doing", link: "", likes: 725, snaps: {}, latest: { views: 0, likes: 725 } },
    { id: "z1", at: new Date(now - 40 * 86400000).toISOString(), caption: "Old one", link: "", likes: 10, snaps: {}, latest: { views: 400, likes: 10 } },
    { id: "z2", at: new Date(now - 3 * 86400000).toISOString(), caption: "New one", link: "https://www.instagram.com/reel/abc/", likes: 50, snaps: { d1: { at: now - 2 * 86400000, views: 2000, likes: 50, comments: 2, saves: 3, shares: 1 } }, latest: { views: 2000, likes: 50 } },
  ];
  const r = P.rankPosts(posts, { at: now, ads: [] }, { now });
  assert.ok(!r.ranked.concat(r.tooFew, r.older).some((x) => x.id === "z0"));
  assert.ok(!r.tooFew.some((x) => x.id === "z1"));
  assert.equal(r.notSettled, true);
  assert.match(P.rankLine(r.ranked[0] || r.older[0]), /song not linked/);
  const linked = P.rankPosts(posts, { at: now, ads: [] }, { now, songs: { abc: "Paper Moon" } });
  const row = linked.ranked.concat(linked.older).find((x) => x.id === "z2");
  assert.equal(row.song, "Paper Moon");
  assert.match(P.rankLine(row), /song Paper Moon/);
});

test("song_pages reports a live status and the time, and a failed fetch says it could not check", async () => {
  const d = memoryDesk();
  const ok = await call(d, "song_pages", { bot: "Webmaster" }, { fetch: async () => ({ status: 200, ok: true }) });
  assert.ok(ok.pages.every((p) => p.status === 200 && /200 at /.test(p.live)));
  const bad = await call(d, "song_pages", { bot: "Webmaster" }, { fetch: async () => { throw new Error("offline"); } });
  assert.ok(bad.pages.every((p) => /couldn't check/.test(p.live) && p.status == null));
});

test("Steve records a post's song, and a second Instagram read within 20 minutes does not spend a call", async () => {
  const st = mem();
  st.m.set("key.json", JSON.stringify({ token: "IGAAnotarealkey" + "x".repeat(40), username: "ouraccount", route: "fb" }));
  st.m.set("state.json", JSON.stringify({ username: "ouraccount", followers: 10, lastOkAt: NOW }));
  st.m.set("posts.json", JSON.stringify([]));
  const d = memoryDesk();
  const ig = () => st;
  const saved = await call(d, "instagram", { bot: "Steve", post: "abc", song: "Paper Moon" }, { ig });
  assert.equal(saved.state, "linked");
  assert.equal(saved.song, "Paper Moon");
  const first = await call(d, "instagram", { bot: "Steve" }, { ig });
  const second = await call(d, "instagram", { bot: "Steve" }, { now: NOW + 5 * 60000, ig });
  assert.match(second.cached, /did not use a call/);
  assert.equal(second.calls_left, first.calls_left);
});
