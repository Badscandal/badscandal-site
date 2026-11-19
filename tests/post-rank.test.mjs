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
import { toolsFor, INSTRUCTIONS, TOOLS } from "../netlify/lib/staff-tools.mjs";
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

/* Luke's own example, made-up posts, each compared at the SAME age (its 1-day numbers): A boosted with 90 (23k
   views, 1.6k likes), B boosted with 300 (~300k views, 3k likes), C not boosted, D too new, E an old post HQ only has
   lifetime numbers for */
const d1 = (at, o) => ({ ...o, at: Date.parse(at) + DAY });
const at = (ms) => new Date(NOW - ms).toISOString();
const posts = [
  { id: "m1", at: at(3 * DAY), type: "reels", caption: "Clip A: the drop", link: "https://www.instagram.com/reel/a/", likes: 1700, comments: 45,
    snaps: { h6: { views: 2100, reach: 1500, likes: 160, saves: 12, shares: 8, at: NOW - 3 * DAY + 6 * H }, d1: d1(at(3 * DAY), { views: 23000, reach: 17000, likes: 1600, comments: 40, saves: 100, shares: 60, follows: 120, profile_visits: 300 }) },
    latest: { views: 25000, reach: 18000, likes: 1700, comments: 45, saves: 110, shares: 66 } },
  { id: "m2", at: at(6 * DAY), type: "reels", caption: "Clip B: studio", link: "https://www.instagram.com/reel/b/", likes: 3000, comments: 50,
    snaps: { d1: d1(at(6 * DAY), { views: 300000, reach: 210000, likes: 3000, comments: 50, saves: 80, shares: 70 }) }, latest: { views: 300000, reach: 210000, likes: 3000, saves: 80, shares: 70 } },
  { id: "m3", at: at(4 * DAY), type: "feed", caption: "Cover reveal", link: "https://www.instagram.com/p/c/", likes: 500, comments: 20,
    snaps: { d1: d1(at(4 * DAY), { views: 5000, reach: 4000, likes: 500, comments: 20, saves: 30, shares: 10, follows: 40 }) }, latest: { views: 5000, reach: 4000, likes: 500, saves: 30, shares: 10 } },
  { id: "m4", at: at(2 * H), type: "reels", caption: "Just posted", link: "", likes: 3, comments: 0, snaps: {}, latest: { views: 120, reach: 100, likes: 3, saves: 0, shares: 0 } },
  { id: "m5", at: at(30 * DAY), type: "reels", caption: "Old reel", link: "", likes: 900, comments: 10, snaps: {}, lifetime: true, latest: { views: 9000, reach: 7000, likes: 900, comments: 10, saves: 50, shares: 40 } }];
const adDoc = { at: NOW - 10 * 60000, ads: [
  { id: "a1", name: "Clip A ad", media: "m1", status: "ACTIVE", created: at(2 * DAY), spend: 90, currency: "USD", impressions: 21000, reach: 15000, likes: 1400, comments: 30, saves: 80, shares: 40 },
  { id: "a2", name: "Clip B ad", media: "m2", status: "PAUSED", created: at(5 * DAY), spend: 300, currency: "USD", impressions: 290000, reach: 200000, likes: 2600, comments: 20, saves: 30, shares: 10 }] };
/* three of OUR comments on Clip A before its 1-day mark, one after it; one fan's */
const comments = [
  { id: "c1", post: "m1", user: "ouraccount", own: true, at: at(3 * DAY - 2 * H) }, { id: "c2", post: "m1", user: "ourpartner", own: true, at: at(3 * DAY - 3 * H) },
  { id: "c3", post: "m1", user: "ouraccount", own: true, at: at(3 * DAY - 4 * H) }, { id: "c4", post: "m1", user: "ouraccount", own: true, at: at(DAY) },
  { id: "c5", post: "m1", user: "a_made_up_fan", own: false, at: at(3 * DAY - 5 * H) }];

test("rankPosts: same age (1 day), engagement per view wins, our own comments left out, the ad's numbers, before the ad", () => {
  const r = P.rankPosts(posts, adDoc, { now: NOW, comments });
  assert.deepEqual(r.ranked.map((x) => x.id), ["m3", "m1", "m2"], "C (11.2%) > A (7.8%) > B (1.1%)");
  assert.deepEqual(r.older.map((x) => x.id), ["m5"], "no 1-day numbers: a reference list, not the same age");
  assert.deepEqual(r.tooFew.map((x) => x.id), ["m4"]);
  const a = r.ranked[1];
  assert.equal(a.window, "1 day"); assert.equal(a.views, 23000, "the 1-day numbers, not the latest");
  assert.equal(a.ownComments, 3, "our 3 comments before the 1-day mark are left out (the later one wasn't in those numbers)");
  assert.equal(a.comments, 37); assert.equal(a.engaged, 1797);
  assert.equal(Math.round(a.rate * 1000) / 10, 7.8);
  assert.equal(Math.round(a.deep * 10000) / 100, 0.7, "saves + shares per view");
  assert.equal(a.follows, 120); assert.equal(Math.round(a.followRate * 10000) / 100, 0.52); assert.equal(a.profileVisits, 300);
  assert.equal(a.boosted, true); assert.equal(a.paid.spend, 90); assert.equal(a.paid.engaged, 1550); assert.equal(Math.round(a.paid.costPerEng * 1000) / 1000, 0.058);
  assert.deepEqual(a.before, { mark: "6 hours", views: 2100, engaged: 180, rate: 180 / 2100 }, "the 6-hour numbers were taken before the ad started");
  assert.equal(r.ranked[2].before, null, "B's ad started before its 1-day mark and it had no earlier one");
  assert.equal(r.ranked[0].paid, null); assert.equal(r.ranked[0].follows, 40); assert.equal(r.ranked[0].profileVisits, null);
  assert.equal(r.older[0].window, "lifetime");
});
test("rankLine: one post in plain words, for Luke and the bots", () => {
  const r = P.rankPosts(posts, adDoc, { now: NOW, comments });
  assert.equal(P.rankLine(r.ranked[1]), "“Clip A: the drop” · reels · 2026-11-14 · 1 day: 7.8% engaged (1,797 of 23,000 views) · saves + shares 0.7% · 120 follows (0.5%) · 300 profile visits · 3 of our own comments left out · boosted USD 90.00 (ACTIVE) as of 2026-11-17 11:50: 1,550 engagements from the ad, USD 0.058 each · organic before the ad (6 hours): 8.6% of 2,100 views · song not linked");
  assert.equal(P.rankLine(r.ranked[0]), "“Cover reveal” · feed · 2026-11-13 · 1 day: 11.2% engaged (560 of 5,000 views) · saves + shares 0.8% · 40 follows (0.8%) · not boosted · song not linked");
  /* 18 Nov 2026: an old post the current ads don't cover says boost unknown, and the song is not guessed from the caption */
  assert.equal(P.rankLine(r.older[0]), "“Old reel” · reels · 2026-10-18 · lifetime: 11.1% engaged (1,000 of 9,000 views) · saves + shares 1.0% · boost unknown · song not linked");
});
test("igView: our own accounts' comments left out of the fans' list and the ranking; questions nobody answered need a reply", async () => {
  const st = memStore();
  st.m.set("key.json", JSON.stringify({ token: TOKEN, username: "ouraccount", route: "fb" }));
  st.m.set("state.json", JSON.stringify({ username: "ouraccount" }));
  st.m.set("own.json", JSON.stringify({ handles: ["ourpartner"] }));
  st.m.set("posts.json", JSON.stringify(posts)); st.m.set("adposts.json", JSON.stringify(adDoc));
  st.m.set("comments.json", JSON.stringify([
    { id: "q1", post: "m1", user: "made_up_creator", text: "can i use your music in my videos?", at: at(2 * H), postCaption: "Clip A", link: "" },
    { id: "q2", post: "m1", user: "made_up_fan", text: "what song is this??", at: at(3 * H), postCaption: "Clip A", link: "", repliedBy: ["ouraccount"] },
    { id: "q3", post: "m1", user: "ourpartner", text: "when is it out?", at: at(4 * H), postCaption: "Clip A", link: "" },
    { id: "q4", post: "m1", user: "made_up_fan", text: "fire", at: at(5 * H), postCaption: "Clip A", link: "" },
    { id: "q5", post: "m1", user: "made_up_old", text: "song name?", at: at(20 * DAY), postCaption: "Clip A", link: "" }]));
  const v = await IG.igView(st, NOW);
  /* 18 Nov 2026: the always-ours handles are on the list, and an unanswered question stays past 14 days */
  assert.deepEqual(v.own, ["ouraccount", "ourpartner", "liliancardos", "liliancardosomakeup"]);
  assert.deepEqual(v.comments.map((c) => c.id), ["q1", "q2", "q4", "q5"], "our partner's comment is not a fan's");
  assert.deepEqual(v.needsReply.map((c) => c.id), ["q1", "q5"], "answered by us or ours: left out. An old unanswered question stays.");
  assert.deepEqual(v.ranking.ranked.map((x) => x.id), ["m3", "m1", "m2"]);
  assert.deepEqual(v.ranking.older.map((x) => x.id), ["m5"]);
  const sv = IG.sampleView(NOW);
  assert.ok(sv.ranking.ranked.length >= 1 && sv.needsReply.length >= 1);
});
/* Luke, 17 Nov 2026: "make it a list Nova manages with a tool … add / remove / list … each change needs a short
   reason and is logged with the date, and HQ › Growth & Fans shows the list … Nova only; other bots can read". */
test("our accounts: Nova adds and removes handles with a reason, every change logged; the connected account is always ours", async () => {
  const st = memStore();
  st.m.set("key.json", JSON.stringify({ token: TOKEN, username: "ouraccount", route: "fb" }));
  st.m.set("state.json", JSON.stringify({ username: "ouraccount" }));
  const T1 = NOW, T2 = NOW + H;
  let r = await IG.editOwn(st, T1, { by: "Nova", action: "add", handle: "@Made_Up.Partner", reason: "Luke's own account" });
  assert.deepEqual(r.handles, ["ouraccount", "made_up.partner", "liliancardos", "liliancardosomakeup"]);
  r = await IG.editOwn(st, T1, { by: "Nova", action: "add", handle: "made_up_spam", reason: "spam bot" });
  await assert.rejects(IG.editOwn(st, T1, { by: "Nova", action: "add", handle: "made_up_spam", reason: "again" }), (e) => /already/.test(e.message));
  await assert.rejects(IG.editOwn(st, T1, { by: "Nova", action: "add", handle: "not a handle!", reason: "x y z" }), (e) => e.kind === "bad");
  await assert.rejects(IG.editOwn(st, T1, { by: "Nova", action: "add", handle: "someone", reason: "" }), (e) => /reason/.test(e.message));
  await assert.rejects(IG.editOwn(st, T1, { by: "Nova", action: "remove", handle: "ouraccount", reason: "test" }), (e) => /connected account/.test(e.message));
  await assert.rejects(IG.editOwn(st, T1, { by: "Nova", action: "remove", handle: "nobody_here", reason: "test" }), (e) => /isn't on the list/.test(e.message));
  r = await IG.editOwn(st, T2, { by: "Nova", action: "remove", handle: "made_up_spam", reason: "it was a real fan after all" });
  assert.deepEqual(r.handles, ["ouraccount", "made_up.partner", "liliancardos", "liliancardosomakeup"]);
  const v = await IG.igView(st, T2);
  assert.deepEqual(v.own, ["ouraccount", "made_up.partner", "liliancardos", "liliancardosomakeup"]);
  assert.deepEqual(v.ownLog.map((x) => [x.action, x.handle, x.by, x.reason]), [["remove", "made_up_spam", "Nova", "it was a real fan after all"], ["add", "made_up_spam", "Nova", "spam bot"], ["add", "made_up.partner", "Nova", "Luke's own account"]], "newest first");
  assert.equal(v.ownLog[0].at, T2);
  /* HQ only shows it; there is no write route for it any more */
  const fn = readFileSync(new URL("../netlify/functions/hq.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(fn, /sub === "own"/);
  const js = readFileSync(new URL("../js/hq.js", import.meta.url), "utf8");
  assert.match(js, /Our own accounts/); assert.doesNotMatch(js, /igOwnForm/);
});
test("our_accounts in the instagram tool: Nova (and Claude) change it; every other bot only reads it", async () => {
  const { callTool } = await import("../netlify/lib/staff-tools.mjs");
  const { memoryDesk } = await import("../netlify/lib/staff-sample.mjs");
  const st = memStore();
  st.m.set("key.json", JSON.stringify({ token: TOKEN, username: "ouraccount", route: "fb" }));
  st.m.set("state.json", JSON.stringify({ username: "ouraccount" }));
  const desk = memoryDesk();
  const call = (bot, args) => callTool(TOOLS.find((t) => t.name === "instagram"), { bot, ...args }, { store: desk, now: NOW, ig: () => st }).catch((e) => ({ error: e.message }));
  const ok = await call("Nova", { our_accounts: "add", handle: "made_up_family", reason: "Luke's family" });
  assert.equal(ok.error, undefined, ok.error);
  assert.deepEqual(ok.our_accounts.handles, ["@ouraccount", "@made_up_family", "@liliancardos", "@liliancardosomakeup"]);
  const no = await call("Steve", { our_accounts: "add", handle: "someone_else", reason: "x y z" });
  assert.match(no.error, /Only Nova/);
  const read = await call("Steve", { our_accounts: "list" });
  assert.deepEqual(read.our_accounts.handles, ["@ouraccount", "@made_up_family", "@liliancardos", "@liliancardosomakeup"]);
  assert.equal(read.our_accounts.changes[0].by, "Nova");
  const plain = await call("Kevin", {});
  assert.deepEqual(plain.own_accounts, ["@ouraccount", "@made_up_family", "@liliancardos", "@liliancardosomakeup"]);
  const schema = TOOLS.find((t) => t.name === "instagram").inputSchema.properties;
  assert.deepEqual(schema.our_accounts.enum, ["list", "add", "remove"]);
  assert.ok(schema.handle && schema.reason);
});
test("the bots get the ranking (Steve, Kevin and Forge) with the how-to; HQ draws it", async () => {
  for (const b of ["Steve", "Kevin", "Forge"]) assert.ok(toolsFor(b, S.DEFAULT_ROSTER).some((t) => t.name === "instagram"), b);
  assert.match(INSTRUCTIONS, /engagement per view/i);
  assert.match(INSTRUCTIONS, /never (?:change|touch|start|pause)[^.]*ads?/i);
  const src = readFileSync(new URL("../netlify/lib/staff-tools.mjs", import.meta.url), "utf8");
  assert.match(src, /ranking: \{ how: /); assert.match(src, /needs_reply: /); assert.match(src, /SAME age/);
  assert.match(readFileSync(new URL("../netlify/functions/pushhourly.mjs", import.meta.url), "utf8"), /syncAdPosts\(/);
  const js = readFileSync(new URL("../js/hq.js", import.meta.url), "utf8");
  assert.match(readFileSync(new URL("../js/hq-growth.js", import.meta.url), "utf8"), /What worked this week/);
  assert.match(js, /Needs a reply/); assert.match(js, /Our own accounts/);
  const x = globalThis.HQLib.rankParts(P.rankPosts(posts, adDoc, { now: NOW, comments }).ranked[1]);
  assert.deepEqual(x, { rate: "7.8% engaged", window: "At 1 day", views: "1,797 of 23,000 views · 1,600 likes · 37 comments", deep: "Saves + shares 0.7% (100 saves · 60 shares)",
    follows: "120 follows (0.5% of views) · 300 profile visits", own: "3 of our own comments left out",
    paid: "Boosted USD 90.00 (active) · as of 2026-11-17 11:50 · 1,550 engagements from the ad · USD 0.058 each", before: "Before the ad (6 hours): 8.6% of 2,100 views" });
});

/* 19 Nov 2026: a boost's spend is that ad, or a spend row that names the post. The account day total is a different scope.
   Numbers here are made up. A read from before the boost starts is not a number. */
test("a stale ad read is not the boost's spend, and a later row that names the post is", () => {
  const now = Date.parse("2026-11-19T15:00:00Z");
  const posted = "2026-11-17T18:00:00Z";
  const one = {
    id: "traffic", at: posted, type: "reels", caption: "Stuck in traffic 🚕🤐", link: "https://www.instagram.com/reel/TRAFFIC1/",
    snaps: { d1: { at: Date.parse(posted) + DAY, views: 8000, likes: 10, comments: 2, saves: 3, shares: 5, follows: 4 } },
  };
  const other = { id: "quiet", at: posted, type: "reels", caption: "Quiet hour", snaps: { d1: { at: Date.parse(posted) + DAY, views: 2000, likes: 4, comments: 1, saves: 1, shares: 0 } } };
  const started = "2026-11-18T17:55:00Z";
  const staleAds = { at: Date.parse("2026-11-18T14:05:00Z"), ads: [{ id: "ad1", media: "traffic", status: "ACTIVE", created: started, spend: 9, currency: "USD", impressions: 100, likes: 1, comments: 0, saves: 0, shares: 0 }] };
  const account = { date: "2026-11-18", amount: 11.11, currency: "USD", platform: "Meta", at: "2026-11-18T21:00:00Z" };
  const stale = P.rankPosts([one, other], staleAds, { now, spend: [account] });
  const row = stale.ranked.find((x) => x.id === "traffic");
  assert.equal(row.boost, "boosted");
  assert.equal(row.paid.spend, null);
  assert.match(P.rankLine(row), /spend not read since boost started/);
  assert.doesNotMatch(P.rankLine(row), /11\.11/);
  assert.equal(stale.ranked.find((x) => x.id === "quiet").paid, null);
  const freshAds = { at: Date.parse("2026-11-18T21:00:00Z"), ads: [{ id: "ad1", media: "traffic", status: "ACTIVE", created: started, spend: 40, currency: "USD", impressions: 1000, likes: 8, comments: 1, saves: 1, shares: 0 }] };
  const fresh = P.rankPosts([one], freshAds, { now, spend: [account] });
  assert.equal(fresh.ranked[0].paid.spend, 40);
  assert.equal(fresh.ranked[0].paid.scope, "ad");
  assert.match(P.rankLine(fresh.ranked[0]), /USD 40\.00/);
  assert.match(P.rankLine(fresh.ranked[0]), /as of 2026-11-18 18:00/);
  assert.doesNotMatch(P.rankLine(fresh.ranked[0]), /11\.11/);
  const named = P.rankPosts([one, other], { at: Date.parse("2026-11-18T14:05:00Z"), ads: [] }, { now, spend: [account, { date: "2026-11-18", amount: 40, currency: "USD", platform: "Meta", post: "traffic", at: "2026-11-18T21:00:00Z" }] });
  const hit = named.ranked.find((x) => x.id === "traffic");
  assert.equal(hit.paid.spend, 40);
  assert.equal(hit.paid.engaged, 20);
  assert.equal(Math.round(hit.paid.costPerEng * 1000) / 1000, 2);
  assert.equal(Math.round(hit.paid.costPerFollow * 1000) / 1000, 10);
  assert.match(P.rankLine(hit), /as of 2026-11-18 18:00/);
  assert.doesNotMatch(P.rankLine(hit), /11\.11/);
  assert.equal(named.ranked.find((x) => x.id === "quiet").paid, null);
  const bare = { ...one, snaps: { d1: { at: Date.parse(posted) + DAY, views: 8000, likes: 10 } } };
  const missing = P.rankPosts([bare], { ads: [] }, { now, spend: [{ date: "2026-11-18", amount: 40, currency: "USD", platform: "Meta", post: "traffic", at: "2026-11-18T21:00:00Z" }] });
  assert.equal(missing.ranked[0].paid.spend, 40);
  assert.equal(missing.ranked[0].paid.engaged, null);
  assert.equal(missing.ranked[0].paid.costPerEng, null);
  assert.match(P.rankLine(missing.ranked[0]), /not reported/);
  assert.doesNotMatch(P.rankLine(missing.ranked[0]), /USD 0/);
});
