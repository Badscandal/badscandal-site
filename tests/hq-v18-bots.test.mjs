/* HQ v18 (21 Nov 2026): the bots' re-check list after v17 (Kevin, Webmaster, Drop, Atlas, Steve, Laura, Spark).
   Made-up names, numbers and links only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";
import { evaluate } from "../netlify/lib/account-health.mjs";
await import("../js/hq-lib.js");
await import("../js/hq-growth.js");
const L = globalThis.HQLib;

const NOW = Date.parse("2026-11-21T15:00:00Z"); /* 12:00 São Paulo, Sat 21 Nov */
const TODAY = "2026-11-21";
const R = S.DEFAULT_ROSTER;
const tool = (n) => TOOLS.find((t) => t.name === n);
/* a fake fetch: song_pages checks each page, and a test never calls the live site */
const noNet = async () => ({ status: 200, ok: true, headers: new Map(), arrayBuffer: async () => new ArrayBuffer(0) });
const call = (d, name, args, hq, now = NOW) => callTool(tool(name), args, { store: d, now, role: "bot", hq: hq || (async () => null), fetch: noNet });
const png = (w, h, extra = 2000) => { const b = Buffer.alloc(33 + extra); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0); b.writeUInt32BE(13, 8); b.write("IHDR", 12, "latin1"); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const TRACK = "https://open.spotify.com/track/AbCdEfGhIjKlMnOpQrStUv";

function release(o = {}) {
  const date = o.date || "2026-12-04";
  const { steps } = S.scheduleSteps(date, "2026-11-10", { pack: o.pack || {} });
  return { id: o.id || "papermoon", title: o.title || "Paper Moon", date, status: "scheduled", createdAt: "2026-11-10T12:00:00Z", pack: { kind: "Self-release", ...(o.pack || {}) },
    steps: o.steps ? o.steps(steps) : steps };
}

/* ---------- Spark and Webmaster: the duty state ---------- */
test("Spark's built-in duty is done once Spark posted done today, even when the shared feed is full", () => {
  const spark = R.filter((b) => b.name === "Spark");
  const line = { bot: "Spark", sp: "2026-11-21 10:14", at: "2026-11-21T13:14:00Z", status: "done", message: "Filed today's ideas" };
  const base = { hq: null, messages: [], cards: {}, seen: {}, today: TODAY, nowHM: "12:00" };
  const fromDesk = S.workers(spark, { ...base, updates: [], deskUpdates: [line] })[0];
  assert.equal(fromDesk.duties[0].status, "done");
  assert.equal(fromDesk.state, "done");
  assert.ok(fromDesk.last);
  const fromFeed = S.workers(spark, { ...base, updates: [line], deskUpdates: [] })[0];
  assert.equal(fromFeed.duties[0].status, "done");
  const none = S.workers(spark, { ...base, updates: [], deskUpdates: [] })[0];
  assert.equal(none.duties[0].status, "late");
});

/* ---------- Atlas and Laura: releases ---------- */
test("a Canvas step with no link waits before its deadline instead of reading skipped", async () => {
  const d = memoryDesk();
  await d.setJSON("releases.json", [release()]);
  const r = await call(d, "releases", { bot: "Atlas" });
  const canvas = r.releases[0].your_steps.find((s) => s.step === "canvas");
  assert.equal(canvas.state, "waiting");
  assert.match(canvas.note, /Canvas link from Luke/);
});

test("a Spotify step past its day is due when Spotify lists it, not on a stale date", async () => {
  const d = memoryDesk();
  await d.setJSON("releases.json", [release({ date: "2026-11-27", steps: (st) => st.map((s) => (s.key === "upload" || s.key === "approved" ? { ...s, status: "done", by: "Drop" } : s.key === "spotify" ? { ...s, due: "2026-11-17" } : s)) })]);
  const r = await call(d, "releases", { bot: "Atlas" });
  const spot = r.releases[0].your_steps.find((s) => s.step === "spotify");
  assert.equal(spot.due, "when Spotify lists it");
  const day = await call(d, "my_day", { bot: "Atlas" });
  assert.equal(JSON.stringify(day).includes("Tue 17 Nov"), false);
});

test("the RouteNote email lines are said once, at the top of releases", async () => {
  const d = memoryDesk();
  await d.setJSON("releases.json", [release()]);
  const r = await call(d, "releases", { bot: "Drop" });
  assert.equal(r.email_watch, "not connected");
  assert.ok(r.inbox);
  const card = r.releases[0];
  assert.equal(card.routenote_email, "not connected");
  assert.equal("email_watch" in card, false);
  assert.equal("inbox" in card, false);
});

test("the Spotify track link is required from the release day", async () => {
  const d = memoryDesk();
  await d.setJSON("releases.json", [release({ id: "outnow", title: "Out Now", date: "2026-11-20" }), release()]);
  const out = await call(d, "release_pack", { bot: "Webmaster", song: "Out Now" });
  assert.equal(out.pack.find((f) => f.field === "spotifyTrack").state, "missing (required)");
  const soon = await call(d, "release_pack", { bot: "Webmaster", song: "Paper Moon" });
  assert.notEqual(soon.pack.find((f) => f.field === "spotifyTrack").state, "missing (required)");
  const v = S.releaseView((await S.listReleases(d)).find((x) => x.id === "outnow"), TODAY);
  assert.ok(v.missing.some((m) => m.key === "spotifyTrack" && m.required));
});

test("song_pages shows the release step for each request", async () => {
  const d = memoryDesk();
  await d.setJSON("releases.json", [release({ id: "newsongx", title: "New Song X" })]);
  await call(d, "song_page", { bot: "Webmaster", kind: "new", slug: "newsongx", title: "New Song X", date: "2026-12-04", cover: "https://example.com/cover.jpg" });
  const r = await call(d, "song_pages", { bot: "Webmaster" });
  const req = r.requests.find((x) => x.slug === "newsongx");
  assert.match(req.release_step, /Song page live/);
  assert.match(req.release_step, /to do/);
});

/* ---------- Webmaster: covers, preflight, ?si= ---------- */
test("one cover rule: a square 3000 x 3000 everywhere", async () => {
  const d = memoryDesk();
  await assert.rejects(call(d, "upload_cover", { bot: "Webmaster", song: "Paper Moon", image_base64: png(1400, 1400).toString("base64") }), /3000 x 3000/);
  const ok = await call(d, "upload_cover", { bot: "Webmaster", song: "Paper Moon", image_base64: png(3000, 3000).toString("base64") });
  assert.equal(ok.saved, true);
  assert.match(S.coverWarnings(1400, 1400)[0], /3000 x 3000/);
  assert.equal(/fine for the song page/.test(S.coverWarnings(1400, 1400)[0]), false);
  const cover = tool("song_page").inputSchema.properties.cover.description;
  assert.match(cover, /3000 x 3000/);
  assert.equal(/1000/.test(cover + tool("upload_cover").description), false);
});

test("preflight's description says capitalisation does not matter", () => {
  const t = tool("preflight").description;
  assert.equal(/all lowercase|exactly "badscandal"/.test(t), false);
  assert.match(t, /capitalisation does not matter/);
});

test("?si= is said one way: removed for you", async () => {
  const d = memoryDesk();
  const p = await call(d, "preflight", { bot: "Atlas", mode: "track", link: TRACK + "?si=share" });
  assert.ok(p.notes.some((n) => n.startsWith("?si= is removed for you.")));
  assert.match(tool("preflight").inputSchema.properties.mode.description, /\?si= is removed for you\./);
  assert.match(tool("song_page").inputSchema.properties.track.description, /\?si= is removed for you\./);
  for (const w of [S.spotifyTrackProblem("not a link").problem, S.spotifyTrackProblem("https://example.com/x").problem]) assert.equal(/with no \?si=/.test(w), false);
});

/* ---------- Atlas, Steve, Laura: profiles ---------- */
test("a profile image with a live link reads Live, and the note is said once", async () => {
  const d = memoryDesk();
  await d.setJSON("profiles.json", { slots: { "youtube-photo": { current: { link: "https://example.com/yt.jpg", changed: "2026-11-18", by: "Laura" } } } });
  const r = await call(d, "profiles", { bot: "Laura" });
  const yt = r.profiles.find((p) => p.platform === "YouTube").images.find((s) => s.id === "youtube-photo");
  assert.equal(yt.status, "Live");
  assert.equal(/You upload/.test(r.note), false);
  assert.match(r.note, /The owner uploads/);
});

/* ---------- Kevin: the TikTok block ---------- */
test("TikTok block: plain first-6-hours line, 2-decimal watch time, best post label, lag flag, gaps on one line", () => {
  const row = { platform: "TikTok", date: "2026-11-19", views: 852, views_date: "2026-11-18", views_6h: 400, follows_6h: 0, avg_watch_6h: 3.456, avg_watch: 2.1, best_post: "Hook A", best_post_link: "https://example.com/a",
    followers: null, gaps: { followers: "TikTok did not load the profile page this morning, tried twice and then gave up after the second time it failed", follows_48h: "not out yet" } };
  const html = L.growthHtml({ rows: [row], platforms: [], igPosts: [] });
  assert.match(html, /First 6 hours: watch time ok, no new followers/);
  assert.equal(/PASS|FAIL|\+6h gate/.test(html), false);
  assert.match(html, /3\.46s/);
  assert.match(html, /2\.10s/);
  assert.match(html, /Best post, last 7 days/);
  assert.match(html, /1 day views 852 \(for [^)]*18 Nov[^)]*, a day late\)/);
  const gap = (html.match(/<p class="d">Not reported:[^<]*<\/p>/) || [""])[0];
  assert.ok(gap, "one Not reported line");
  assert.ok(gap.length < 220);
});

test("a gap note is stored on one line and cut at a word", async () => {
  const d = memoryDesk();
  const long = "TikTok did not load the analytics page this morning and the second try also failed so nothing could be read at all, will try again tomorrow at the usual time";
  await call(d, "log_growth", { bot: "Kevin", platform: "TikTok", date: "2026-11-20", followers: "500", gaps: { views: long } });
  const read = await call(d, "read_growth", { bot: "Kevin", platform: "TikTok", date: "2026-11-20" });
  const g = read.rows[0].gaps.views;
  assert.ok(g.length <= 121);
  assert.match(g, /…$/);
});

/* ---------- Atlas: a gap note that the next day answered ---------- */
test("a gap note clears once the day it waited for is logged, or the row is filled in", async () => {
  const d = memoryDesk();
  await call(d, "log_growth", { bot: "Atlas", platform: "Spotify", date: "2026-11-16", followers: "300", gaps: "17 Nov not yet in Spotify for Artists" });
  await call(d, "log_growth", { bot: "Atlas", platform: "Spotify", date: "2026-11-17", followers: "302" });
  const read = await call(d, "read_growth", { bot: "Atlas", platform: "Spotify", date: "2026-11-16" });
  assert.equal(Object.keys(read.rows[0].gaps || {}).length, 0);
  const once = S.growthOnce(await S.listGrowth(d, NOW, 2)).find((r) => r.date === "2026-11-16");
  assert.equal(Object.keys(once.gaps).length, 0);
  await call(d, "log_growth", { bot: "Atlas", platform: "Spotify", date: "2026-11-18", followers: "303", gaps: "listeners not shown yet" });
  await call(d, "log_growth", { bot: "Atlas", platform: "Spotify", date: "2026-11-18", monthly_listeners: "900" });
  const filled = await call(d, "read_growth", { bot: "Atlas", platform: "Spotify", date: "2026-11-18" });
  assert.equal(filled.rows[0].gaps.note, undefined);
});

/* ---------- Steve: a logged day stays as logged ---------- */
test("a day's logged followers stay; a later different number is kept beside it as a later read", async () => {
  const d = memoryDesk();
  await call(d, "log_growth", { bot: "Steve", platform: "Instagram", date: "2026-11-19", followers: "1000" });
  await call(d, "log_growth", { bot: "Steve", platform: "Instagram", date: "2026-11-19", followers: "1007" });
  let row = (await call(d, "read_growth", { bot: "Steve", platform: "Instagram", date: "2026-11-19" })).rows[0];
  assert.equal(row.followers, 1000);
  assert.equal(row.live.followers, 1007);
  await call(d, "log_growth", { bot: "Steve", platform: "Instagram", date: "2026-11-19", followers: "1005", correct: true });
  row = (await call(d, "read_growth", { bot: "Steve", platform: "Instagram", date: "2026-11-19" })).rows[0];
  assert.equal(row.followers, 1005);
});

test("a boost Steve logged without as_of says when it was logged", async () => {
  const d = memoryDesk();
  await call(d, "log_growth", { bot: "Steve", platform: "Instagram", date: "2026-11-20", followers: "10", boosts: [{ link: "https://www.instagram.com/reel/SAMPLEcode1/", ad: "", spend: 4.5, currency: "USD", status: "paused" }] });
  const read = await call(d, "read_growth", { bot: "Steve", platform: "Instagram" });
  assert.ok(read.boosts.length);
  assert.ok(read.boosts[0].as_of, "as_of is not blank");
});

/* ---------- Spark: content ideas ---------- */
const IDEAS = [
  { hook: "One", text: "On screen a", format: "Reel", platform: "Instagram", why: "It held.", song: "Northwind" },
  { hook: "Two", text: "On screen b", format: "Short", platform: "YouTube", why: "A try.", song: "Paper Moon" },
  { hook: "Three", text: "On screen c", format: "Reel", platform: "TikTok", why: "Another.", song: "Paper Moon" },
];
test("a count that was not reported is not stored as 0, and a fully counted post ranks first", async () => {
  const d = memoryDesk();
  const saved = await call(d, "content_ideas", { bot: "Spark", ideas: IDEAS, posts: [
    { whose: "ours", platform: "YouTube", title: "Likes only", views: 1000, likes: 300 },
    { whose: "ours", platform: "Instagram", title: "Full count", views: 1000, likes: 50, comments: 5, saves: 5, shares: 5 },
  ] });
  const yt = saved.posts.find((p) => p.title === "Likes only");
  assert.equal(yt.comments, null);
  assert.deepEqual(yt.not_reported, ["comments", "saves", "shares"]);
  assert.equal(saved.best.title, "Full count");
  const card = L.contentIdeasCard(saved);
  assert.match(card.best, /Full count/);
});

test("an old stored set loses duplicate hooks, ideas with no song and auto cards", () => {
  const v = S.contentIdeasView({ latest: { at: "2026-11-19T13:00:00Z", ideas: [...IDEAS, { ...IDEAS[1], platform: "TikTok" }, { hook: "No song", text: "x", format: "Reel", platform: "TikTok", why: "y" }, { hook: "Auto", text: "x", format: "Reel", platform: "TikTok", why: "y", song: "Paper Moon", auto: true }] } });
  assert.deepEqual(v.ideas.map((i) => i.hook), ["One", "Two", "Three"]);
});

/* ---------- Spark, Steve: account health ---------- */
test("Not enough data says what is missing; YouTube names an open claim; Instagram views name their age", () => {
  const blank = evaluate({ now: NOW, growth: [], checks: [] });
  const tt = blank.accounts.find((a) => a.id === "tiktok");
  assert.match(tt.headline, /^Not enough data: /);
  assert.match(tt.headline, /Account Status/);
  const quiet = evaluate({ now: NOW, claims: [{ claim: "A quiet claim", claimant: "our own label", impact: "no impact", date: "2026-11-18", by: "Laura", last_checked: "2026-11-20" }],
    checks: [{ type: "reading", platform: "youtube", date: "2026-11-20", by: "Laura", at: "2026-11-20", account_status: "clear" }] });
  const yt = quiet.accounts.find((a) => a.id === "youtube");
  assert.match(yt.headline, /Content ID claim/);
  const igPosts = [];
  for (let i = 0; i < 8; i++) igPosts.push({ id: "p" + i, at: new Date(NOW - (1 + i * 2) * 86400000).toISOString().slice(0, 10) + "T12:00:00Z", snaps: { d1: { views: 2000 + i, likes: 100, comments: 5, saves: 5, shares: 5 } } });
  const ig = evaluate({ now: NOW, igPosts }).accounts.find((a) => a.id === "instagram");
  const reach = ig.signals.find((s) => s.id === "reach");
  assert.match(reach.text, /views at 1 day [\d,]/);
});

/* ---------- for_luke, duty lines, the feed, cards ---------- */
test("lukeLine keeps a sentence whole when it drops task ids, and leaves a named zone alone", () => {
  assert.equal(S.lukeLine("Nothing chased. T-31 and T-32 stay carried."), "Nothing chased. 2 tasks stay carried.");
  assert.match(S.lukeLine("Waiting on T-32."), /Waiting on a task\./);
  assert.equal(/SP Paris|SP Europe/.test(S.lukeLine("Paused at 13:27 Paris (12:27 Europe/Dublin).")), false);
  assert.match(S.lukeLine("Read at 09:11."), /09:11 SP/);
});

test("for_luke drops a trailing Draft only. and stays short", async () => {
  const d = memoryDesk();
  const long = "Pitch drafted for Paper Moon. Audience: " + Array.from({ length: 30 }, (_, i) => `Sample City ${i}`).join(", ") + ". Draft only.";
  await S.postUpdate(d, NOW - 60000, R, { bot: "Atlas", status: "done", message: long });
  const team = await call(d, "team_board", { bot: "Nova" });
  const atlas = team.team.find((w) => w.name === "Atlas");
  assert.equal(/Draft only\.?$/.test(atlas.for_luke), false);
  assert.ok(atlas.for_luke.length <= 220, atlas.for_luke.length);
  assert.match(atlas.for_luke, /^Atlas: Pitch drafted for Paper Moon\./);
});

test("duty lines: bot shorthand is plain, and a cut last fragment is not shown", () => {
  const nova = S.freshDuty("Reset D- rows at 07:00; todo -> blocked when one is missed.");
  assert.equal(/D- rows|->|→/.test(nova), false);
  const pair = S.dutyPair("Daily growth, best video and fan signals for every channel. Profile images when Luke upload", []);
  assert.equal(pair.text, "Daily growth, best video and fan signals for every channel.");
  assert.match(pair.full, /Luke upload$/);
  assert.equal(S.dutyPair("Daily growth, best video, fan signals", []).text, "Daily growth, best video, fan signals");
  const known = "Idle until a cover starts. Then the licence, before the upload";
  assert.equal(S.dutyPair(known, [known]).text, known, "a known full line is never cut");
});

test("the team feed drops a blocked line the same bot has moved past", async () => {
  const d = memoryDesk();
  await S.postUpdate(d, NOW - 86400000, R, { bot: "Laura", status: "blocked", message: "Google asks Verify it's you" });
  await S.postUpdate(d, NOW - 60000, R, { bot: "Laura", status: "done", message: "YouTube numbers logged" });
  await S.postUpdate(d, NOW - 30000, R, { bot: "Forge", status: "blocked", message: "Google Ads signed out" });
  const team = await call(d, "team_board", { bot: "Nova" });
  const feed = team.latest_updates.join("\n");
  assert.equal(/Verify it's you/.test(feed), false);
  assert.match(feed, /YouTube numbers logged/);
  assert.match(feed, /Google Ads signed out/);
});

test("a working-on line whose date has passed leaves the card", async () => {
  const d = memoryDesk();
  await S.setCard(d, Date.parse("2026-11-18T12:00:00Z"), R, { bot: "Kevin", working_on: "Fan signals due 18 Nov" });
  const team = await call(d, "team_board", { bot: "Nova" });
  assert.equal(team.team.find((w) => w.name === "Kevin").working_on, "");
});

test("Webmaster's release-day line is plain, and still the live step", () => {
  const web = R.find((b) => b.name === "Webmaster");
  assert.equal(web.schedule.some((s) => /^Add the Spotify link$/.test(s.what)), false);
  assert.ok(web.schedule.some((s) => s.what === "Put the Spotify link on the song's page"));
});

/* ---------- Drop ---------- */
test("update_case answers with waiting_since", async () => {
  const d = memoryDesk();
  const opened = await call(d, "open_case", { bot: "Drop", song: "Northwind", platform: "RouteNote", type: "moderation" });
  const r = await call(d, "update_case", { bot: "Drop", id: opened.id, waiting_since: "2026-11-18", proposal: "Hello\n\nSecond line." });
  assert.equal(r.waiting_since, "2026-11-18");
});
