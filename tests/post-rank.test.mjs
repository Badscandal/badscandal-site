/* L2, adapted (17 Nov 2026, Luke: "i spend 90 on one ad and it got 23k views but 1.6k likes … another i spend 300
   dollars it got almost 300k views but only 3k likes so obviously the engagement on one was better … these signals
   help us shift our ads to the post performing the best"). Posts are ranked by ENGAGEMENT PER VIEW (paid views
   bring few engagements, so a boosted post doesn't win on views alone), next to the ad's own numbers and the
   post's numbers from BEFORE the ad. Made-up posts, ads and numbers only; no real call is made. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as P from "../netlify/lib/postrank.mjs";
import * as IG from "../netlify/lib/instagram.mjs";
import { toolsFor, INSTRUCTIONS } from "../netlify/lib/staff-tools.mjs";
import * as S from "../netlify/lib/staff.mjs";

await import("../js/hq-lib.js");
const H = 3600000, DAY = 86400000, NOW = Date.parse("2026-11-17T15:00:00Z");
const TOKEN = "EAAadsmadeup" + "a".repeat(60);
const memStore = () => { const m = new Map(); return { m, get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); } }; };

test("an ad's actions -> likes, comments, saves, shares (reactions count as likes when there is no like)", () => {
  assert.deepEqual(P.actionsOf([{ action_type: "like", value: "1400" }, { action_type: "comment", value: "30" }, { action_type: "onsite_conversion.post_save", value: "80" }, { action_type: "post", value: "40" }, { action_type: "video_view", value: "9000" }]),
    { likes: 1400, comments: 30, saves: 80, shares: 40 });
  assert.deepEqual(P.actionsOf([{ action_type: "post_reaction", value: "12" }]), { likes: 12, comments: 0, saves: 0, shares: 0 });
  assert.deepEqual(P.actionsOf(null), { likes: 0, comments: 0, saves: 0, shares: 0 });
});

function fakeAds(o = {}) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url: String(url), auth: (init.headers || {}).Authorization || "" });
    if (o.error) return new Response(JSON.stringify({ error: o.error }), { status: 400 });
    const u = new URL(url);
    if (!u.searchParams.get("after")) return new Response(JSON.stringify({ data: [
      { id: "a1", name: "Made up clip A", effective_status: "ACTIVE", created_time: new Date(NOW - 2 * DAY).toISOString(), creative: { effective_instagram_media_id: "m1" },
        insights: { data: [{ spend: "90.00", impressions: "21000", reach: "15000", account_currency: "USD", actions: [{ action_type: "like", value: "1400" }, { action_type: "comment", value: "30" }, { action_type: "onsite_conversion.post_save", value: "80" }, { action_type: "post", value: "40" }] }] } },
      { id: "a9", name: "Not a post ad", creative: {} }],
      paging: { next: "https://graph.facebook.com/v27.0/act_1/ads?after=X&access_token=" + TOKEN } }), { status: 200 });
    return new Response(JSON.stringify({ data: [{ id: "a2", name: "Made up clip B", effective_status: "PAUSED", created_time: new Date(NOW - 5 * DAY).toISOString(), creative: { effective_instagram_media_id: "m2" },
      insights: { data: [{ spend: "300.00", impressions: "290000", reach: "200000", account_currency: "USD", actions: [{ action_type: "like", value: "2600" }] }] } }] }), { status: 200 });
  };
  return { f, calls };
}
test("fetchAdPosts: one read-only GET per page, the key only in the header, ads tied to their Instagram post", async () => {
  const fk = fakeAds();
  const r = await P.fetchAdPosts(TOKEN, "1", fk.f);
  assert.equal(r.error, undefined);
  assert.deepEqual(r.ads.map((a) => [a.id, a.media, a.spend, a.impressions, a.likes]), [["a1", "m1", 90, 21000, 1400], ["a2", "m2", 300, 290000, 2600]]);
  assert.equal(r.ads[0].currency, "USD"); assert.equal(r.ads[0].status, "ACTIVE");
  assert.match(fk.calls[0].url, /\/act_1\/ads\?/); assert.match(decodeURIComponent(fk.calls[0].url), /creative\{effective_instagram_media_id\}/);
  assert.match(decodeURIComponent(fk.calls[0].url), /insights\.date_preset\(maximum\)\{/);
  assert.ok(fk.calls.every((c) => !c.url.includes(TOKEN) && c.auth === "Bearer " + TOKEN), "the key never goes in an address");
  const bad = await P.fetchAdPosts(TOKEN, "1", fakeAds({ error: { message: "(#17) User request limit reached", code: 17 } }).f);
  assert.equal(bad.code, 17); assert.match(bad.error, /limit/);
});
test("syncAdPosts: hourly, stored for the page and the bots; a limit pauses it for a day; no key = nothing", async () => {
  const st = memStore();
  assert.deepEqual(await P.syncAdPosts({ store: st, token: "", account: "1", now: NOW, fetchImpl: fakeAds().f }), { ok: false, skipped: "no key" });
  const r = await P.syncAdPosts({ store: st, token: TOKEN, account: "1", now: NOW, fetchImpl: fakeAds().f });
  assert.equal(r.ok, true); assert.equal(r.ads, 2);
  const doc = await st.get("adposts.json");
  assert.equal(doc.at, NOW); assert.equal(doc.ads.length, 2); assert.equal(JSON.stringify(doc).includes(TOKEN), false);
  const lim = fakeAds({ error: { message: "(#17) User request limit reached", code: 17 } });
  const l = await P.syncAdPosts({ store: st, token: TOKEN, account: "1", now: NOW + H, fetchImpl: lim.f });
  assert.equal(l.ok, false); assert.equal(l.kind, "limit");
  const n = lim.calls.length;
  assert.equal((await P.syncAdPosts({ store: st, token: TOKEN, account: "1", now: NOW + 5 * H, fetchImpl: lim.f })).skipped, "paused");
  assert.equal(lim.calls.length, n, "no call while paused");
  assert.equal((await st.get("adposts.json")).ads.length, 2, "the last good read is kept");
  assert.equal((await P.syncAdPosts({ store: st, token: TOKEN, account: "1", now: NOW + DAY + 2 * H, fetchImpl: fakeAds().f })).ok, true, "a day later it reads again");
});

/* Luke's own example, made-up posts: A boosted with 90 (23k views, 1.6k likes), B boosted with 300 (~300k views,
   3k likes), C not boosted, D too new to judge */
const posts = [
  { id: "m1", at: new Date(NOW - 3 * DAY).toISOString(), type: "reels", caption: "Clip A: the drop", link: "https://www.instagram.com/reel/a/", likes: 1600, comments: 40,
    snaps: { h6: { views: 2100, reach: 1500, likes: 160, saves: 12, shares: 8, at: NOW - 3 * DAY + 6 * H } }, latest: { views: 23000, reach: 17000, likes: 1600, saves: 100, shares: 60 } },
  { id: "m2", at: new Date(NOW - 6 * DAY).toISOString(), type: "reels", caption: "Clip B: studio", link: "https://www.instagram.com/reel/b/", likes: 3000, comments: 50,
    snaps: {}, latest: { views: 300000, reach: 210000, likes: 3000, saves: 80, shares: 70 } },
  { id: "m3", at: new Date(NOW - 4 * DAY).toISOString(), type: "feed", caption: "Cover reveal", link: "https://www.instagram.com/p/c/", likes: 500, comments: 20, snaps: {}, latest: { views: 5000, reach: 4000, likes: 500, saves: 30, shares: 10 } },
  { id: "m4", at: new Date(NOW - 2 * H).toISOString(), type: "reels", caption: "Just posted", link: "", likes: 3, comments: 0, snaps: {}, latest: { views: 120, reach: 100, likes: 3, saves: 0, shares: 0 } }];
const adDoc = { at: NOW - 10 * 60000, ads: [
  { id: "a1", name: "Clip A ad", media: "m1", status: "ACTIVE", created: new Date(NOW - 2 * DAY).toISOString(), spend: 90, currency: "USD", impressions: 21000, reach: 15000, likes: 1400, comments: 30, saves: 80, shares: 40 },
  { id: "a2", name: "Clip B ad", media: "m2", status: "PAUSED", created: new Date(NOW - 5 * DAY).toISOString(), spend: 300, currency: "USD", impressions: 290000, reach: 200000, likes: 2600, comments: 20, saves: 30, shares: 10 }] };

test("rankPosts: engagement per view wins, not views; the ad's own numbers and cost per engagement; before the ad", () => {
  const r = P.rankPosts(posts, adDoc, { now: NOW });
  assert.deepEqual(r.ranked.map((x) => x.id), ["m3", "m1", "m2"], "C (11%) > A (7.8%) > B (1.1%)");
  assert.deepEqual(r.tooFew.map((x) => x.id), ["m4"]);
  const a = r.ranked[1];
  assert.equal(a.engaged, 1800); assert.equal(Math.round(a.rate * 1000) / 10, 7.8);
  assert.equal(a.boosted, true);
  assert.equal(a.paid.spend, 90); assert.equal(a.paid.engaged, 1550); assert.equal(Math.round(a.paid.costPerEng * 1000) / 1000, 0.058);
  assert.equal(Math.round(a.paid.rate * 1000) / 10, 7.4);
  assert.deepEqual(a.before, { mark: "6 hours", views: 2100, engaged: 180, rate: 180 / 2100 }, "the 6-hour numbers were taken before the ad started");
  const b = r.ranked[2];
  assert.equal(b.before, null, "B's ad started before any snapshot");
  assert.equal(Math.round(b.paid.costPerEng * 100) / 100, 0.11);
  assert.equal(r.ranked[0].boosted, false); assert.equal(r.ranked[0].paid, null);
  assert.equal(r.adsAt, NOW - 10 * 60000);
});
test("rankLine: one post in plain words, for Luke and the bots", () => {
  const r = P.rankPosts(posts, adDoc, { now: NOW });
  assert.equal(P.rankLine(r.ranked[1]), "“Clip A: the drop” · reels · 2026-11-14 · 7.8% engaged (1,800 of 23,000 views) · boosted USD 90.00 (ACTIVE): 1,550 engagements from the ad, USD 0.058 each · before the ad (6 hours): 8.6% of 2,100 views");
  assert.equal(P.rankLine(r.ranked[0]), "“Cover reveal” · feed · 2026-11-13 · 11.2% engaged (560 of 5,000 views) · not boosted");
  assert.equal(P.rankLine(r.ranked[2]), "“Clip B: studio” · reels · 2026-11-11 · 1.1% engaged (3,200 of 300,000 views) · boosted USD 300.00 (PAUSED): 2,660 engagements from the ad, USD 0.113 each");
});
test("igView carries the ranking; the sample has one; the bots get it (Steve, Kevin and Forge) with the how-to", async () => {
  const st = memStore(); st.m.set("posts.json", JSON.stringify(posts)); st.m.set("adposts.json", JSON.stringify(adDoc));
  const v = await IG.igView(st, NOW);
  assert.deepEqual(v.ranking.ranked.map((x) => x.id), ["m3", "m1", "m2"]);
  assert.ok(IG.sampleView(NOW).ranking.ranked.length >= 2);
  for (const b of ["Steve", "Kevin", "Forge"]) assert.ok(toolsFor(b, S.DEFAULT_ROSTER).some((t) => t.name === "instagram"), b);
  assert.match(INSTRUCTIONS, /engagement per view/i);
  assert.match(INSTRUCTIONS, /never (?:change|touch|start|pause)[^.]*ads?/i);
  const src = readFileSync(new URL("../netlify/lib/staff-tools.mjs", import.meta.url), "utf8");
  assert.match(src, /ranking: \{ how: /);
  assert.match(readFileSync(new URL("../netlify/functions/pushhourly.mjs", import.meta.url), "utf8"), /syncAdPosts\(/);
  assert.match(readFileSync(new URL("../js/hq.js", import.meta.url), "utf8"), /What engages best/);
  const x = globalThis.HQLib.rankParts(P.rankPosts(posts, adDoc, { now: NOW }).ranked[1]);
  assert.deepEqual(x, { rate: "7.8% engaged", views: "1,800 of 23,000 views · 1,600 likes · 100 saves · 60 shares", paid: "Boosted USD 90.00 (active) · 1,550 engagements from the ad · USD 0.058 each", before: "Before the ad (6 hours): 8.6% of 2,100 views" });
});
