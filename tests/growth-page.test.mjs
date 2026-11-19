/* Growth page and Rights (19 Nov 2026). Numbers in here are made up. A missing one stays "not reported". */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { boostReport as Pboost } from "../netlify/lib/postrank.mjs";
import { liveReport } from "../netlify/lib/hq.mjs";
import { evaluate } from "../netlify/lib/account-health.mjs";
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

test("a boosted post keeps the title emoji, and a later log that leaves it out does not rewrite it", async () => {
  const d = memoryDesk();
  const title = "Stuck in traffic 🚕🤐";
  const saved = await call(d, "log_growth", { bot: "Steve", platform: "Instagram", date: "2026-11-19", followers: "10", best_post: title, posts: [{ id: "traffic", hook: title, link: "https://example.com/traffic", boosted: true, likes: "10", comments: "2", saves: "3", shares: "5" }] });
  assert.equal(saved.saved, true);
  assert.equal(S.clean(title, 200), title);
  const row = (await S.listGrowth(d, NOW)).find((x) => x.platform === "Instagram" && x.date === "2026-11-19");
  assert.equal(row.best_post, title);
  assert.equal(row.posts[0].hook, title);
  const again = await call(d, "log_growth", { bot: "Steve", platform: "Instagram", date: "2026-11-19", followers: "11" });
  assert.equal(again.saved, true);
  const kept = (await S.listGrowth(d, NOW)).find((x) => x.date === "2026-11-19");
  assert.equal(kept.best_post, title);
  assert.equal(kept.posts[0].hook, title);
});

test("Boosted spend is the post's own read, and cost joins that post's engagements", async () => {
  const posts = [
    { platform: "Instagram", id: "traffic", date: "2026-11-18", hook: "Stuck in traffic 🚕🤐", link: "https://example.com/traffic", boosted: true, likes: 10, comments: 2, saves: 3, shares: 5, follows: 4, views_24h: 800 },
    { platform: "Instagram", date: "2026-11-18", hook: "Other clip", boosted: false, likes: 1, comments: 0, saves: 0, shares: 0, views_24h: 1000 },
  ];
  const asOf = Date.parse("2026-11-18T21:00:00Z");
  const fresh = L.growthHtml({
    rows: [{ platform: "Instagram", date: "2026-11-18", ad_spend: 11.11, ad_currency: "USD", ads_read_at: "2026-11-18 11:05", posts }],
    ranking: { ranked: [{ id: "traffic", caption: "Stuck in traffic 🚕🤐", link: "https://example.com/traffic", at: "2026-11-18T12:00:00Z", boosted: true, engReported: true, likes: 10, comments: 2, saves: 3, shares: 5, follows: 4,
      paid: { spend: 40, currency: "USD", asOf, scope: "ad", stale: false, engaged: 20, costPerEng: 2 } }] },
  });
  assert.match(fresh, /Spend USD 40\.00 as of 2026-11-18 18:00/);
  assert.match(fresh, /Cost per engagement 2\.00/);
  assert.match(fresh, /cost per follow 10\.00/);
  assert.doesNotMatch(fresh, /11\.11/);
  const stale = L.growthHtml({
    rows: [{ platform: "Instagram", date: "2026-11-18", ad_spend: 11.11, ad_currency: "USD", posts }],
    ranking: { ranked: [{ id: "traffic", caption: "Stuck in traffic", link: "https://example.com/traffic", boosted: true, paid: { spend: null, stale: true, scope: "ad", asOf: Date.parse("2026-11-18T14:05:00Z") } }] },
  });
  assert.match(stale, /spend not read since boost started/);
  assert.doesNotMatch(stale, /11\.11/);
  const titled = L.growthHtml({
    rows: [{ platform: "Instagram", date: "2026-11-18", posts: [{ platform: "Instagram", date: "2026-11-18", hook: "Stuck in traffic 🫠", boosted: true, likes: 10, comments: 2, saves: 3, shares: 5, follows: 4 }] }],
    ranking: { ranked: [{ id: "other-id", caption: "Stuck in traffic", at: "2026-11-18T12:00:00Z", boosted: true, paid: { spend: 40, currency: "USD", asOf, scope: "post", stale: false } }] },
  });
  assert.match(titled, /Spend USD 40\.00/);
  assert.match(titled, /Cost per engagement 2\.00/);
  assert.doesNotMatch(titled, /11\.11/);
  const missing = L.growthHtml({
    rows: [{ platform: "Instagram", date: "2026-11-18", posts: [{ platform: "Instagram", id: "traffic", hook: "Stuck in traffic", boosted: true, likes: 10 }] }],
    ranking: { ranked: [{ id: "traffic", caption: "Stuck in traffic", boosted: true, paid: { spend: 40, currency: "USD", asOf, scope: "ad", stale: false } }] },
  });
  assert.match(missing, /Spend USD 40\.00/);
  assert.match(missing, /not reported/);
  assert.doesNotMatch(missing, /Cost per engagement 0/);
  const d = memoryDesk();
  await call(d, "log_growth", { bot: "Steve", platform: "Instagram", date: "2026-11-18", followers: "10", posts: [
    { id: "traffic", hook: "Stuck in traffic 🚕🤐", date: "2026-11-18", boosted: true, boost_started: "2026-11-18 14:55", likes: "10", comments: "2", saves: "3", shares: "5", follows: "4" },
    { id: "other", hook: "Other clip", date: "2026-11-18", boosted: true, likes: "1", comments: "0", saves: "0", shares: "0" },
  ] });
  await d.setJSON("spend/2026-11.json", [
    { id: "s-account", platform: "Meta", account: "Meta", date: "2026-11-18", amount: 11.11, currency: "USD", song: "", by: "HQ", at: "2026-11-18T21:00:00Z" },
    { id: "s-post", platform: "Meta", account: "Meta", date: "2026-11-18", amount: 40, currency: "USD", song: "", post: "traffic", by: "Forge", at: "2026-11-18T21:00:00Z" },
  ]);
  const read = await call(d, "read_growth", { bot: "Steve", platform: "Instagram" });
  const hit = read.boosts.find((b) => b.post.includes("Stuck in traffic"));
  const other = read.boosts.find((b) => b.post === "Other clip");
  assert.equal(hit.spend, 40);
  assert.equal(hit.engagements, 20);
  assert.equal(hit.cost_per_engagement, 2);
  assert.equal(hit.cost_per_follower, 10);
  assert.equal(hit.as_of, "2026-11-18 18:00");
  assert.equal(hit.note, "");
  assert.equal(other.spend, null);
  assert.equal(other.note, "spend not read since boost started");
  assert.equal(other.cost_per_engagement, null);
  assert.equal(read.rows.find((r) => r.date === "2026-11-18").ad_spend ?? null, null);
});

test("a best post with no posts[] entry is a boost when the ranking or an ad names it", async () => {
  const link = "https://www.instagram.com/reel/TESTCODE01/";
  const account = { id: "s-account", platform: "Meta", account: "Meta", date: "2026-11-18", amount: 11.11, currency: "USD", song: "", by: "HQ", at: "2026-11-18T21:00:00Z" };
  const row = { platform: "Instagram", date: "2026-11-18", best_post: "Stuck in traffic", best_post_link: link, ad_spend: 11.11, ad_currency: "USD", ads_read_at: "2026-11-18 11:05" };
  const staleRank = { ranked: [{ id: "1789000111", caption: "Stuck in traffic", link, at: "2026-11-18T12:00:00Z", boosted: true, boost: "boosted", engReported: true, likes: 10, comments: 2, saves: 3, shares: 5, follows: 4, paid: { spend: 11.11, currency: "USD", spendOnly: true } }] };
  const bare = Pboost([row], [account]);
  assert.deepEqual(bare, []);
  const fromRank = Pboost([row], [account], { ranking: staleRank });
  assert.equal(fromRank.length, 1);
  assert.equal(fromRank[0].post, "Stuck in traffic");
  assert.equal(fromRank[0].link, link);
  assert.equal(fromRank[0].spend, null);
  assert.equal(fromRank[0].note, "spend not read since boost started");
  assert.equal(fromRank[0].engagements, 20);
  const named = Pboost([row], [account, { id: "s-post", platform: "Meta", account: "Meta", date: "2026-11-18", amount: 40, currency: "USD", link, by: "Forge", at: "2026-11-18T21:00:00Z" }], { ranking: staleRank });
  assert.equal(named[0].spend, 40);
  assert.equal(named[0].engagements, 20);
  assert.equal(named[0].cost_per_engagement, 2);
  assert.equal(named[0].cost_per_follower, 10);
  assert.equal(named[0].note, "");
  const fromAd = Pboost([row], [account], { ads: [{ id: "ad1", media: "TESTCODE01", name: "reel TESTCODE01", spend: 11.11, currency: "USD" }] });
  assert.equal(fromAd.length, 1);
  assert.equal(fromAd[0].spend, null);
  assert.equal(fromAd[0].note, "spend not read since boost started");
  const html = L.growthHtml({
    rows: [row],
    ranking: staleRank,
  });
  assert.match(html, /Stuck in traffic/);
  assert.match(html, /spend not read since boost started/);
  assert.doesNotMatch(html, /11\.11/);
  assert.doesNotMatch(html, /engagements not on this spend row/);
  const d = memoryDesk();
  await call(d, "log_growth", { bot: "Steve", platform: "Instagram", date: "2026-11-18", followers: "10", best_post: "Stuck in traffic", best_post_link: link });
  await d.setJSON("spend/2026-11.json", [account]);
  const ig = { get: async (k) => ig.m.get(k) ?? null, setJSON: async (k, v) => { ig.m.set(k, v); }, m: new Map() };
  const posted = "2026-11-17T18:00:00Z";
  ig.m.set("posts.json", [{ id: "traffic", at: posted, type: "reels", caption: "Stuck in traffic", link, snaps: { d1: { at: Date.parse(posted) + 86400000, views: 8000, likes: 10, comments: 2, saves: 3, shares: 5, follows: 4 } } }]);
  ig.m.set("adposts.json", { at: Date.parse("2026-11-18T14:05:00Z"), ads: [{ id: "ad1", media: "traffic", status: "ACTIVE", created: "2026-11-18T17:55:00Z", spend: 9, currency: "USD", impressions: 100, likes: 1, comments: 0, saves: 0, shares: 0 }] });
  const tool = TOOLS.find((t) => t.name === "read_growth");
  const staleRead = await callTool(tool, { bot: "Steve", platform: "Instagram" }, { store: d, now: NOW, role: "bot", ig: () => ig, hq: async () => null });
  const staleHit = staleRead.boosts.find((b) => b.post === "Stuck in traffic");
  assert.ok(staleHit, "the best post is a boost when the ad names it");
  assert.equal(staleHit.spend, null);
  assert.equal(staleHit.note, "spend not read since boost started");
  assert.equal(JSON.stringify(staleRead).includes("11.11"), false);
  await d.setJSON("spend/2026-11.json", [account, { id: "s-post", platform: "Meta", account: "Meta", date: "2026-11-18", amount: 40, currency: "USD", song: "", post: "traffic", by: "Forge", at: "2026-11-18T21:00:00Z" }]);
  const freshRead = await callTool(tool, { bot: "Steve", platform: "Instagram" }, { store: d, now: NOW, role: "bot", ig: () => ig, hq: async () => null });
  const freshHit = freshRead.boosts.find((b) => b.post === "Stuck in traffic");
  assert.equal(freshHit.spend, 40);
  assert.equal(freshHit.engagements, 20);
  assert.equal(freshHit.cost_per_engagement, 2);
  assert.equal(freshHit.note, "");
});

test("Steve logs a boost with the post link, the ad id, the spend and paused", async () => {
  const link = "https://www.instagram.com/reel/TESTCODE01/";
  const d = memoryDesk();
  const saved = await call(d, "log_growth", { bot: "Steve", platform: "Instagram", date: "2026-11-19", followers: "10", best_post: "Stuck in traffic", best_post_link: link, ad_spend: "11.11", ad_currency: "USD", boosts: [{ link, ad: "100000000000001", spend: 40.12, currency: "USD", status: "paused" }] });
  assert.equal(saved.saved, true);
  assert.equal(saved.boosts_logged, 1);
  assert.equal(saved.boosts[0].status, "paused");
  assert.match(saved.note, /not added to the ad cap/);
  await assert.rejects(call(d, "log_growth", { bot: "Forge", platform: "Instagram", date: "2026-11-19", boosts: [{ link, ad: "100000000000001", spend: 40.12, currency: "USD", status: "paused" }] }), /Steve/);
  await assert.rejects(call(d, "log_growth", { bot: "Steve", platform: "Instagram", date: "2026-11-18", followers: "9", boosts: [{ link, ad: "100000000000001", spend: 40.12, currency: "USD" }] }), /status/);
  await d.setJSON("spend/2026-11.json", [{ id: "s-account", platform: "Meta", account: "Meta", date: "2026-11-19", amount: 11.11, currency: "USD", song: "", by: "HQ", at: "2026-11-19T16:47:00Z" }]);
  const read = await S.readGrowth(d, NOW, { platform: "Instagram", ranking: { ranked: [{ id: "999000111", caption: "Stuck in traffic", link, at: "2026-11-18T12:00:00Z", boost: "unknown", boosted: false, paid: null }] } });
  const hit = read.boosts.find((b) => b.link === link);
  assert.equal(hit.ad, "100000000000001");
  assert.equal(hit.spend, 40.12);
  assert.equal(hit.currency, "USD");
  assert.equal(hit.status, "paused");
  assert.equal(hit.note, "");
  assert.match(read.how_to_log_a_boost, /link/);
  assert.match(read.how_to_log_a_boost, /paused/);
  assert.doesNotMatch(JSON.stringify(read.boosts), /11\.11/);
  assert.match(TOOLS.find((t) => t.name === "log_growth").description, /boosts/);
  assert.match(TOOLS.find((t) => t.name === "log_growth").description, /not the ad account/);
  const html = L.growthHtml({ rows: [{ platform: "Instagram", date: "2026-11-19", ad_spend: 11.11, best_post: "Stuck in traffic", best_post_link: link, boosts: [{ link, ad: "100000000000001", spend: 40.12, currency: "USD", status: "paused" }] }], ranking: { ranked: [{ id: "999000111", caption: "Stuck in traffic", link, boost: "unknown", boosted: false }] } });
  assert.match(html, /40\.12/);
  assert.match(html, /paused/);
  assert.doesNotMatch(html, /11\.11/);
  assert.doesNotMatch(html, /spend not read since boost started/);
});

test("an Instagram boost with no ad id is keyed on the post link, and an ad account id is refused", async () => {
  const link = "https://www.instagram.com/reel/APPBOOST01/";
  const other = "https://www.instagram.com/reel/OTHERPOST1/";
  const d = memoryDesk();
  const saved = await call(d, "log_growth", { bot: "Steve", platform: "Instagram", date: "2026-11-19", followers: "10", boosts: [{ link, ad: "not shown", spend: 4.5, currency: "USD", status: "active" }] });
  assert.equal(saved.saved, true);
  assert.equal(saved.boosts[0].link, link);
  assert.equal(saved.boosts[0].ad, undefined);
  const again = await call(d, "log_growth", { bot: "Steve", platform: "Instagram", date: "2026-11-19", followers: "10", boosts: [
    { link, ad: "", spend: 6, currency: "USD", status: "paused" },
    { link: other, ad: "100000000000002", spend: 1, currency: "USD", status: "active" },
  ] });
  assert.equal(again.boosts.length, 2);
  const keyed = again.boosts.find((b) => b.link === link);
  assert.equal(keyed.spend, 6);
  assert.equal(keyed.status, "paused");
  assert.equal(keyed.ad, undefined);
  assert.equal(again.boosts.find((b) => b.link === other).ad, "100000000000002");
  await assert.rejects(call(d, "log_growth", { bot: "Steve", platform: "Instagram", date: "2026-11-18", followers: "9", boosts: [{ link, ad: "230002830106369", spend: 1, currency: "USD", status: "active" }] }), /ad account/);
  await assert.rejects(call(d, "log_growth", { bot: "Steve", platform: "Instagram", date: "2026-11-18", followers: "9", boosts: [{ link, ad: "act_230002830106369", spend: 1, currency: "USD", status: "active" }] }), /ad account/);
});

test("ideas keep one hook each and every one names a song", async () => {
  const d = memoryDesk();
  const ideas = [
    { hook: "Open on the chorus", text: "the chorus", format: "Reel", platform: "Instagram", why: "It held.", song: "Northwind", status: "posted", views: "2000", epv: "0.2" },
    { hook: "Open on the chorus", text: "copied", format: "Reel", platform: "TikTok", why: "The same hook on another post." },
    { hook: "A second line", text: "second", format: "Reel", platform: "TikTok", why: "A try.", song: "Paper Moon" },
    { hook: "A third line", text: "third", format: "Short", platform: "YouTube", why: "Another try.", song: "Paper Moon" },
  ];
  const posts = [
    { whose: "ours", platform: "Instagram", title: "Winner", views: 1000, likes: 200, comments: 0, saves: 0, shares: 0, at: "2026-11-18" },
    { whose: "ours", platform: "Instagram", title: "Quiet", views: 1000, likes: 10, comments: 0, saves: 0, shares: 0, at: "2026-11-17" },
  ];
  const saved = await call(d, "content_ideas", { bot: "Spark", ideas, posts });
  assert.equal(saved.ideas.length, 3);
  assert.equal(saved.ideas.filter((i) => i.hook === "Open on the chorus").length, 1);
  assert.equal(saved.ideas.every((i) => i.song), true);
  assert.equal(saved.ideas.some((i) => i.auto), false);
});

test("a rounded Studio view is kept as approximate, and Studio's own subscriber change wins", async () => {
  const d = memoryDesk();
  const late = await call(d, "log_growth", { bot: "Laura", platform: "YouTube", date: "2026-11-17", subscribers: "100", late_read: true });
  assert.equal(late.saved, true);
  const day = await call(d, "log_growth", { bot: "Laura", platform: "YouTube", date: "2026-11-18", subscribers: "102", views: "1.7k", official_views: "3.8k", change: "+1" });
  assert.equal(day.saved, true);
  assert.equal(day.change, 1);
  const read = await call(d, "read_growth", { bot: "Laura", platform: "YouTube", date: "2026-11-18" });
  assert.equal(read.rows[0].views, 1700);
  assert.equal(read.rows[0].shown.views, "1.7k");
  assert.equal(read.rows[0].approx.views, true);
  assert.equal(read.rows[0].change, 1);
  assert.equal(read.rows[0].change_source, "studio");
  assert.equal(read.rows[0].shown.official_views, "3.8k");
  await call(d, "log_growth", { bot: "Laura", platform: "YouTube", date: "2026-11-19", subscribers: "104" });
  const computed = await call(d, "read_growth", { bot: "Laura", platform: "YouTube", date: "2026-11-19" });
  assert.equal(computed.rows[0].change, 2);
  assert.equal(computed.rows[0].change_approx, false);
  await call(d, "log_growth", { bot: "Kevin", platform: "TikTok", date: "2026-11-18", followers: "10" });
  await call(d, "log_growth", { bot: "Kevin", platform: "TikTok", date: "2026-11-17", followers: "8", late_read: true });
  const next = await call(d, "log_growth", { bot: "Kevin", platform: "TikTok", date: "2026-11-18", followers: "10" });
  assert.equal(next.duplicate, true);
  const again = await call(d, "read_growth", { bot: "Kevin", platform: "TikTok", date: "2026-11-18" });
  assert.equal(again.rows[0].change, 2);
  assert.equal(again.rows[0].change_approx, true);
  await assert.rejects(call(d, "log_growth", { bot: "Atlas", platform: "Spotify", date: "2026-11-18", monthly_listeners: "about 41k" }), (e) => /never an estimate/.test(e.message));
});

test("a Content ID claim keeps one id, and the health note says it once", async () => {
  const d = memoryDesk();
  const video = "fOkECq4AIKU";
  await d.setJSON("claims.json", { items: ["2026-11-17", "2026-11-18", "2026-11-19"].map((date) => ({
    key: `touchme|samplechannel|${date}`, claim: "Touch Me", claimant: "Sample Channel", video_id: video, claim_type: "audio",
    date, first_seen: date, last_checked: date, by: "Laura", impact: "one video flagged",
  })), checked: {} });
  const read = await call(d, "read_claims", { bot: "Laura" });
  assert.equal(read.claims.length, 1);
  assert.equal(read.claims[0].id, video + "|samplechannel|audio");
  assert.equal(read.claims[0].first_seen, "2026-11-17");
  assert.equal(read.claims[0].last_checked, "2026-11-19");
  const again = await call(d, "log_growth", { bot: "Laura", date: "2026-11-19", claim: "Touch Me", claimant: "Sample Channel", video_id: video, claim_type: "audio", impact: "one video flagged" });
  assert.equal(again.duplicate, true);
  const report = evaluate({ now: NOW, claims: (await S.loadDesk(d, NOW)).claims });
  const yt = report.accounts.find((a) => a.id === "youtube");
  const notes = yt.signals.filter((s) => String(s.id).startsWith("claim:"));
  assert.equal(notes.length, 1);
  assert.equal((notes[0].text.match(/Touch Me/g) || []).length, 1);
});

test("my_day keeps the full duty text beside the short one", async () => {
  const d = memoryDesk();
  const day = await call(d, "my_day", { bot: "Laura" });
  assert.equal(typeof day.daily_duty, "string");
  assert.equal(typeof day.daily_duty_full, "string");
  assert.ok(day.daily_duty_full.length >= day.daily_duty.length);
  assert.ok(day.daily_duty_full.startsWith(day.daily_duty.slice(0, 40)));
});
