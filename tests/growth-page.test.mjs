/* Growth page and Rights (19 Nov 2026). Numbers in here are made up. A missing one stays "not reported". */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { liveReport } from "../netlify/lib/hq.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";

await import("../js/hq-lib.js");
await import("../js/hq-growth.js");
const L = globalThis.HQLib;

const NOW = Date.parse("2026-11-19T15:00:00Z");
const call = (d, name, args, now = NOW) => callTool(TOOLS.find((t) => t.name === name), args, { store: d, now, role: "bot", hq: async () => null });

test("watch hours keep a decimal, YouTube says subscribers, and a video id is enough", async () => {
  const d = memoryDesk();
  const r = await call(d, "log_growth", { bot: "Laura", platform: "YouTube", date: "2026-11-18", subscribers: "1000", watch_hours: "56.6", video_id: "dQw4w9wg", official_views: "120", other_views: "30", duty: "D-laura" });
  assert.equal(r.saved, true);
  assert.equal(r.duty, "done");
  const row = (await S.listGrowth(d, NOW)).find((x) => x.platform === "YouTube");
  assert.equal(row.watch_hours, 56.6);
  assert.equal(row.followers, 1000);
  assert.equal(row.video_id, "dQw4w9wg");
  assert.equal(row.official_views, 120);
  const updates = await S.listUpdates(d, NOW, 1);
  const line = updates.map((u) => u.message).join(" ");
  assert.match(line, /subscribers/);
  assert.doesNotMatch(line, /followers/);
  assert.equal(r.channel_views_is, undefined);
  assert.equal(r.official_views_is, "views that day on the official channel");
});

test("TikTok gate uses the +6h numbers and is not reported when one is missing", async () => {
  const d = memoryDesk();
  const pass = await call(d, "log_growth", { bot: "Kevin", platform: "TikTok", date: "2026-11-18", followers: "10", views_6h: "10000", follows_6h: "20", avg_watch_6h: "3.2", views_date: "2026-11-17" });
  assert.equal(pass.gate_6h, "pass");
  const row = (await S.listGrowth(d, NOW)).find((x) => x.date === "2026-11-18");
  assert.equal(row.views_date, "2026-11-17");
  const fail = await call(d, "log_growth", { bot: "Kevin", platform: "TikTok", date: "2026-11-17", followers: "9", views_6h: "10000", follows_6h: "2", avg_watch_6h: "3.2" });
  assert.equal(fail.gate_6h, "fail");
  const open = await call(d, "log_growth", { bot: "Kevin", platform: "TikTok", date: "2026-11-16", followers: "8", avg_watch_6h: "3.2" });
  assert.equal(open.gate_6h, undefined);
  const read = await call(d, "read_growth", { bot: "Kevin", platform: "TikTok", date: "2026-11-16" });
  assert.equal(read.read_only, true);
  assert.equal(read.rows[0].followers, 8);
  assert.equal(read.rows[0].views_6h, null);
});

test("Content ID claims keep the old row and add the Rights fields, and Laura can mark the day", async () => {
  const d = memoryDesk();
  const saved = await call(d, "log_growth", { bot: "Laura", date: "2026-11-18", claim: "Sample claim", claimant: "Sample Channel", impact: "video muted", song_claim: "Northwind", video: "abcdefghijk", strike: "yes", claim_type: "audio", status: "muted" });
  assert.equal(saved.saved, true);
  assert.match(saved.shown_on, /Rights/);
  const again = await call(d, "log_growth", { bot: "Laura", date: "2026-11-18", claim: "Sample claim", claimant: "Sample Channel", impact: "video muted" });
  assert.equal(again.duplicate, true);
  const day = await call(d, "log_growth", { bot: "Laura", date: "2026-11-19", claims_checked: true });
  assert.equal(day.checked_today, true);
  const read = await call(d, "read_claims", { bot: "Laura" });
  assert.equal(read.checked_today, true);
  assert.equal(read.claims[0].song, "Northwind");
  assert.equal(read.claims[0].strike, "yes");
  assert.equal(read.claims[0].money_effect, "not reported");
  const html = L.claimsHtml((await S.loadDesk(d, NOW)).claims, "2026-11-19");
  assert.match(html, /Northwind/);
  assert.match(html, /not reported/);
  assert.match(html, /licence_queue/);
  assert.doesNotMatch(html, />0</);
});

test("the week card and the post table share one engagement-per-view figure", () => {
  const posts = [
    { platform: "Instagram", date: "2026-11-18", hook: "North hook", views_24h: 1000, views_7d: 4000, likes: 100, comments: 10, saves: 20, shares: 10, follows: 5, boosted: false, link: "https://example.com/a" },
    { platform: "TikTok", date: "2026-11-18", hook: "Quiet hook", views_24h: 1000, likes: 1, comments: 0, saves: 0, shares: 0, follows: 0, boosted: false },
    { platform: "YouTube", date: "2026-11-18", hook: "Mid hook", views_24h: 1000, likes: 40, comments: 4, saves: 4, shares: 2, follows: 1, boosted: true },
  ];
  const html = L.growthHtml({ rows: [{ platform: "Instagram", date: "2026-11-18", posts: posts.slice(0, 1), pattern: "The chorus in the first second." }, { platform: "TikTok", date: "2026-11-18", posts: [posts[1]] }, { platform: "YouTube", date: "2026-11-18", posts: [posts[2]], followers: 50, subscribers: 50 }], platforms: [{ platform: "YouTube", followers: 50, day: 2, d7: null, d28: null, gapDays: [] }], igPosts: [] });
  assert.match(html, /Subscribers/);
  assert.match(html, /The chorus in the first second/);
  assert.match(html, /Engagement/);
  assert.doesNotMatch(html, /Account health/);
  const north = L.growthEpv(posts[0]);
  assert.equal(north, 0.14);
  assert.match(html, /14\.00%/);
  assert.match(html, /not settled yet/);
  const bare = L.growthHtml({ platforms: [], rows: [], igPosts: [] });
  assert.match(bare, /not reported/);
  assert.match(bare, /Subscribers/);
  assert.doesNotMatch(bare, /<div class="big num">0</);
});

test("a blocking claim is a badge, and a quiet claim is not", () => {
  const on = L.growthHtml({ claims: { items: [{ claim: "Sample", strike: "yes", status: "muted" }] }, platforms: [], rows: [] });
  assert.match(on, /claimbadge/);
  assert.match(on, /href="#rights"/);
  const off = L.growthHtml({ claims: { items: [{ claim: "Sample", strike: "no", status: "active" }] }, platforms: [], rows: [] });
  assert.doesNotMatch(off, /claimbadge/);
});

test("team_board lists a platform once per day", async () => {
  const d = memoryDesk();
  await call(d, "log_growth", { bot: "Laura", platform: "YouTube", date: "2026-11-18", subscribers: "10", duty: "D-1" });
  await call(d, "log_growth", { bot: "Laura", platform: "youtube", date: "2026-11-18", views: "4", duty: "D-1" });
  const board = await call(d, "team_board", { bot: "Nova" });
  const yt = board.growth.filter((g) => g.platform === "YouTube" && g.date === "2026-11-18");
  assert.equal(yt.length, 1);
  assert.equal(yt[0].unit, "subscribers");
  assert.equal(yt[0].views, 4);
  const lines = board.latest_updates.filter((l) => /youtube 18 Nov:/i.test(l));
  assert.equal(lines.length, 1);
});

test("a duty cut at Luke upload is restored, and the live log does not cut mid-word", () => {
  const full = "Profiles: HQ keeps the photo and the banner on every official platform. When the shape fits, a sized copy is made. Instagram is Luke's to upload. X has no owner yet: Luke uploads that one himself. Deezer is a square.";
  const at = full.indexOf("Luke upload");
  const cut = full.slice(0, at + "Luke upload".length);
  assert.equal(S.fullDuty(cut, [full]), full);
  const msg = "Luke uploads the banner himself and then " + "more words ".repeat(40);
  const shown = liveReport([{ time: "2026-11-19 10:00", bot: "Laura", status: "done", message: msg }]).feed[0].message;
  const body = shown.endsWith("…") ? shown.slice(0, -1) : shown;
  assert.ok(msg.startsWith(body));
  if (body.length < msg.length) assert.equal(msg[body.length], " ");
});

test("the guide bots read no longer tells them to write Growth into Sheets", async () => {
  const d = memoryDesk();
  const g = await call(d, "read_guide", { bot: "Laura" });
  const text = typeof g === "string" ? g : g.guide || g.text || JSON.stringify(g);
  assert.match(text, /read_growth/);
  assert.match(text, /read_claims/);
  assert.match(text, /not written into a Google Sheet/);
  assert.doesNotMatch(text, /you still write your numbers into the Google Sheets/i);
});

test("a post that beats the others adds a next idea without inventing the song", async () => {
  const d = memoryDesk();
  const ideas = [
    { hook: "Open on the chorus", text: "the chorus", format: "Reel", platform: "Instagram", why: "It held.", song: "Northwind", status: "posted", views: "2000", epv: "0.2" },
    { hook: "A second line", text: "second", format: "Reel", platform: "TikTok", why: "A try." },
    { hook: "A third line", text: "third", format: "Short", platform: "YouTube", why: "Another try." },
  ];
  const posts = [
    { whose: "ours", platform: "Instagram", title: "Winner", views: 1000, likes: 200, comments: 0, saves: 0, shares: 0, at: "2026-11-18" },
    { whose: "ours", platform: "Instagram", title: "Quiet", views: 1000, likes: 10, comments: 0, saves: 0, shares: 0, at: "2026-11-17" },
  ];
  const saved = await call(d, "content_ideas", { bot: "Spark", ideas, posts });
  assert.equal(saved.ideas.length, 4);
  const next = saved.ideas.find((i) => i.auto);
  assert.equal(next.hook, "Open on the chorus");
  assert.equal(next.song, undefined);
  assert.match(next.why, /beat the other official posts/);
});
