/* Account health (18 Nov 2026). Every number in here is made up. The repo is public. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, INSTRUCTIONS } from "../netlify/lib/staff-tools.mjs";
import { evaluate, loadReport, runAccountHealth, sampleReport, HEALTH_SCHEDULE, connectionFrom } from "../netlify/lib/account-health.mjs";

const NOW = Date.parse("2026-11-18T15:00:00Z"); /* 12:00 São Paulo */
const TODAY = "2026-11-18";
const DAY = 86400000;
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, now = NOW) => callTool(tool(name), args, { store: d, now, role: "bot", hq: async () => null });
const day = (n) => new Date(Date.parse(TODAY + "T12:00:00Z") - n * DAY).toISOString().slice(0, 10);
const acc = (input, id) => evaluate({ now: NOW, ...input }).accounts.find((a) => a.id === id);
const sig = (a, id) => a.signals.find((s) => s.id === id || s.id.startsWith(id + ":"));

function posts(list) {
  return list.map(([n, views]) => ({ at: day(n), views: String(views) }));
}
function growth(platform, rows) {
  return rows.map((r) => ({ kind: "growth", platform, date: r.date, change: r.change, views: r.views, followers: r.followers, monthly_listeners: r.monthly_listeners }));
}

test("the last 3 posts under 30% of the account's own median is a possible suppression, and one weak post is not", () => {
  const older = [[5, 2000], [7, 2000], [9, 2000], [12, 2000], [16, 2000], [20, 2000]];
  const red = acc({ checks: [{ type: "reading", platform: "tiktok", date: day(1), by: "Kevin", posts: posts([[1, 200], [2, 250], [3, 180], ...older]) }] }, "tiktok");
  const reach = sig(red, "reach");
  assert.equal(reach.level, "red");
  assert.match(reach.text, /under 30%/);
  assert.match(reach.text, /30-day median/);
  assert.match(reach.text, /14-day median/);
  assert.match(reach.source, /posts the bot recorded/);
  assert.match(red.guidance, /Pause hashtags, check Account Status, post normally, no deleting/);
  assert.match(red.guidance, /do not buy/i);
  assert.match(red.guidance, /pod/i);
  assert.match(red.guidance, /another login/i);
  assert.match(red.guidance, /will not delete, appeal or post/);
  assert.equal(red.next, "Pause hashtags, check Account Status, post normally, no deleting.");

  const edge = acc({ checks: [{ type: "reading", platform: "tiktok", date: day(1), by: "Kevin", posts: posts([[1, 600], [2, 600], [3, 600], ...older]) }] }, "tiktok");
  /* 18 Nov 2026: exactly 30% is still not the red suppression line, and it is not "in line" either */
  assert.equal(sig(edge, "reach").level, "watch", "exactly 30% is not under the suppression line");
  assert.match(sig(edge, "reach").text, /not under the 30%/);
  assert.doesNotMatch(sig(edge, "reach").text, /in line/);
  assert.doesNotMatch(sig(edge, "reach").text, /Possible suppression/);

  const one = acc({ checks: [{ type: "reading", platform: "tiktok", date: day(1), by: "Kevin", posts: posts([[1, 200], [2, 2000], [3, 2000], ...older]) }] }, "tiktok");
  assert.equal(sig(one, "reach").level, "watch");
  assert.match(sig(one, "reach").text, /one post/i);
  assert.equal(one.state, "watch");

  const few = acc({ checks: [{ type: "reading", platform: "tiktok", date: day(1), by: "Kevin", posts: posts([[1, 10], [2, 10], [3, 10]]) }] }, "tiktok");
  assert.equal(sig(few, "reach").level, "gap");
  assert.match(sig(few, "reach").text, /Not enough data/);
});

function reels(rows) {
  return rows.map((r) => {
    const post = { id: r.id, at: day(r.n) + "T12:00:00Z", snaps: {} };
    if (r.d1 != null) post.snaps.d1 = { views: r.d1 };
    if (r.latest != null) post.latest = { views: r.latest };
    if (r.d1 == null && r.latest == null) post.snaps.d1 = { views: r.views };
    return post;
  });
}
const NO_ADS = { at: NOW, ads: [] };
const ad = (media, spend) => ({ id: "ad-" + media, media, spend, impressions: spend * 100, reach: spend * 80 });

test("last 3 views at about 35% of the median are a dip, not in line and not a suppression", () => {
  /* the live headline: 2,496, 2,888, 2,765 against a 30-day median of 7,860. Each is about 35%, which is over the 30% line. */
  const rows = [[1, 2496], [2, 2888], [3, 2765], [5, 7860], [7, 7860], [9, 7860], [12, 7860]];
  const known = acc({ igPosts: reels(rows.map(([n, views], i) => ({ id: "o" + i, n, views }))), igAds: NO_ADS }, "instagram");
  const reach = sig(known, "reach");
  assert.equal(reach.level, "watch");
  assert.match(reach.text, /2,496, 2,888, 2,765/);
  assert.match(reach.text, /30-day median 7,860/);
  assert.match(reach.text, /not under the 30%/);
  assert.match(reach.text, /dip/);
  assert.doesNotMatch(reach.text, /in line/);
  assert.doesNotMatch(reach.text, /Possible suppression/);
  assert.notEqual(known.state, "green");

  const close = [[1, 7600], [2, 8000], [3, 7900], [5, 7860], [7, 7860], [9, 7860], [12, 7860]];
  const fine = acc({ igPosts: reels(close.map(([n, views], i) => ({ id: "n" + i, n, views }))), igAds: NO_ADS }, "instagram");
  assert.equal(sig(fine, "reach").level, "ok");
  assert.match(sig(fine, "reach").text, /in line/);
  assert.match(sig(fine, "reach").text, /70%/);
  assert.equal(fine.state, "green");
});

test("a paid-inflated median is not a content dip, and totals with no ad list are not called in line", () => {
  const organic = [1, 2, 3, 5, 7, 9, 12].map((n, i) => ({ id: "org" + i, n, views: 8000 + i * 50 }));
  const boosted = [{ id: "b285", n: 4, views: 285000 }, { id: "b273", n: 6, views: 273000 }];
  const igAds = { at: NOW, ads: [ad("b285", 300), ad("b273", 280)] };
  const judged = acc({ igPosts: reels(organic.concat(boosted)), igAds }, "instagram");
  const reach = sig(judged, "reach");
  assert.equal(reach.level, "ok");
  assert.match(reach.text, /in line/);
  assert.match(reach.text, /Boosted posts are left out/);
  assert.doesNotMatch(reach.text, /285,000|273,000|Possible suppression/);
  assert.equal(judged.state, "green");

  /* the three newest had less spend; they are still boosted, so they are left out too */
  const light = [
    { id: "r8", n: 1, views: 8371 }, { id: "r10", n: 2, views: 10900 }, { id: "r24", n: 3, views: 24300 },
    { id: "b285", n: 8, views: 285000 }, { id: "b273", n: 10, views: 273000 },
  ];
  const spent = acc({ igPosts: reels(light), igAds: { at: NOW, ads: [ad("r8", 20), ad("r10", 15), ad("r24", 40), ad("b285", 300), ad("b273", 280)] } }, "instagram");
  const left = sig(spent, "reach");
  assert.equal(left.level, "watch");
  assert.match(left.text, /left out/);
  assert.match(left.text, /not called a dip/);
  assert.doesNotMatch(left.text, /in line|Possible suppression/);
  assert.notEqual(spent.state, "green");

  const blind = acc({ igPosts: reels([[1, 2496], [2, 2888], [3, 2765], [5, 7860], [7, 7860], [9, 7860], [12, 7860]].map(([n, views], i) => ({ id: "u" + i, n, views }))) }, "instagram");
  const unk = sig(blind, "reach");
  assert.equal(unk.level, "watch");
  assert.match(unk.text, /can't judge organic/);
  assert.match(unk.text, /paid reach/);
  assert.doesNotMatch(unk.text, /in line|Possible suppression|2,496/);
  assert.notEqual(blind.state, "green");
});

test("a 1-day snapshot is not compared with the latest total, which is what the Instagram grid shows", () => {
  const posts = [
    { id: "a", n: 1, d1: 2496, latest: 8371 },
    { id: "b", n: 2, d1: 2888, latest: 10900 },
    { id: "c", n: 3, d1: 2765, latest: 24300 },
    ...[5, 7, 9, 11, 13, 15].map((n, i) => ({ id: "old" + i, n, latest: 8000 })),
  ];
  const reach = sig(acc({ igPosts: reels(posts), igAds: NO_ADS }, "instagram"), "reach");
  assert.match(reach.text, /latest stored views/);
  assert.match(reach.text, /8,371/);
  assert.doesNotMatch(reach.text, /2,496/);
  assert.equal(reach.level, "ok");
});

test("under the 14-day median but not the 30-day median is a watch, not a suppression", () => {
  const list = [[1, 400], [2, 400], [3, 400], [5, 2000], [7, 2000], [9, 2000], [12, 2000], [20, 100], [22, 100], [24, 100], [26, 100]];
  const a = acc({ checks: [{ type: "reading", platform: "youtube", date: day(1), by: "Laura", posts: posts(list) }] }, "youtube");
  const reach = sig(a, "reach");
  assert.equal(reach.level, "watch");
  assert.match(reach.text, /14-day median/);
  assert.match(reach.text, /not under the 30-day/);
  assert.equal(a.state === "red", false);
});

test("a sharp drop in non-follower share is flagged, and four days is not enough", () => {
  const days = [1, 2, 3, 4, 5].map((n, i) => ({ type: "reading", platform: "tiktok", date: day(n), by: "Kevin", non_follower_share: i === 0 ? 8 : 50 }));
  const a = acc({ checks: days }, "tiktok");
  assert.equal(sig(a, "non_follower").level, "red");
  assert.match(sig(a, "non_follower").text, /8%/);
  assert.match(sig(a, "non_follower").source, /Kevin/);
  const short = acc({ checks: days.slice(0, 4) }, "tiktok");
  assert.equal(sig(short, "non_follower").level, "gap");
  assert.match(sig(short, "non_follower").text, /Not enough data/);
});

test("three unusual follower losses are red, one is a watch, and flat followers with normal views is a watch", () => {
  const loss = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ date: day(n), change: n < 3 ? -40 : 8, views: 1000, followers: 8000 }));
  const red = acc({ growth: growth("TikTok", loss) }, "tiktok");
  assert.equal(sig(red, "followers").level, "red");
  assert.match(sig(red, "followers").text, /-40/);

  const one = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ date: day(n), change: n === 0 ? -40 : 8, views: 1000, followers: 8000 }));
  assert.equal(sig(acc({ growth: growth("TikTok", one) }, "tiktok"), "followers").level, "watch");

  const flat = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ date: day(n), change: n < 3 ? 0 : 20, views: 1000, followers: 8000 }));
  const held = sig(acc({ growth: growth("YouTube", flat) }, "youtube"), "followers");
  assert.equal(held.level, "watch");
  assert.match(held.text, /barely moved/);
  assert.match(held.text, /1,000/);

  const noViews = flat.map((r) => ({ ...r, views: null }));
  const skipped = sig(acc({ growth: growth("YouTube", noViews) }, "youtube"), "followers");
  assert.equal(skipped.level, "ok");
  assert.match(skipped.text, /not judged/);
});

test("a visibility check and an account-status flag use only what was recorded", () => {
  const no = acc({ checks: [{ type: "reading", platform: "tiktok", date: day(1), by: "Kevin", visible: "no", visible_where: "For You" }] }, "tiktok");
  assert.equal(sig(no, "visibility").level, "red");
  assert.match(sig(no, "visibility").text, /For You/);
  const tag = acc({ checks: [{ type: "reading", platform: "tiktok", date: day(1), by: "Kevin", visible: "no", visible_where: "a hashtag" }] }, "tiktok");
  assert.equal(sig(tag, "visibility").level, "watch");
  const old = acc({ checks: [{ type: "reading", platform: "tiktok", date: day(20), by: "Kevin", visible: "no", visible_where: "For You" }] }, "tiktok");
  assert.equal(sig(old, "visibility").level, "gap");
  const restricted = acc({ checks: [{ type: "reading", platform: "instagram", date: day(2), by: "Steve", account_status: "restricted", status_note: "Restricted" }] }, "instagram");
  assert.equal(sig(restricted, "status").level, "red");
  assert.match(sig(restricted, "status").text, /Restricted/);
  const copy = acc({ checks: [{ type: "reading", platform: "youtube", date: day(2), by: "Laura", account_status: "copyright" }] }, "youtube");
  assert.equal(sig(copy, "status").level, "watch");
  const clear = acc({ checks: [{ type: "reading", platform: "youtube", date: day(2), by: "Laura", account_status: "clear" }] }, "youtube");
  assert.equal(sig(clear, "status").level, "ok");
  assert.match(sig(acc({}, "tiktok"), "status").text, /Not enough data/);
});

test("Content ID claims are the ones already on the desk, and a blank stays not reported", () => {
  const open = acc({ claims: [{ claim: "Another sample claim", date: day(3), by: "Laura" }] }, "youtube");
  const row = sig(open, "claim");
  assert.equal(row.level, "watch");
  assert.match(row.text, /not reported/);
  assert.match(row.text, /Another sample claim/);
  assert.match(row.source, /Content ID claims/);
  const hard = acc({ claims: [{ claim: "Sample claim", claimant: "Sample Channel", impact: "video removed", date: day(4), by: "Laura" }] }, "youtube");
  assert.equal(sig(hard, "claim").level, "red");
  assert.match(sig(hard, "claim").text, /Sample Channel/);
  const none = acc({ claims: [] }, "youtube");
  assert.equal(sig(none, "claims").level, "gap");
  assert.match(sig(none, "claims").text, /does not mean there is none/);
});

test("an Instagram connection problem does not paint the account, and a failed store read does not fetch", async () => {
  const paused = evaluate({ now: NOW, igPosts: [], igState: { lastOkAt: NOW - 3600000, errorKind: "", pausedUntil: NOW + DAY } });
  const ig = paused.accounts.find((a) => a.id === "instagram");
  assert.notEqual(ig.state, "red");
  assert.equal(paused.connection.state, "watch");
  assert.match(paused.connection.text, /connection, not the account/);
  assert.match(paused.connection.text, /São Paulo/);
  const stopped = connectionFrom({ errorKind: "blocked", stopped: true, lastError: "token hunter2 should not be copied" }, NOW);
  assert.equal(stopped.state, "down");
  assert.equal(/hunter2|token/.test(stopped.text), false);
  let fetched = 0;
  const store = { get: async () => { throw new Error("unread"); }, fetch: async () => { fetched += 1; } };
  const report = await loadReport({ store: memoryDesk(), ig: store, now: NOW, claims: [], builds: [] });
  assert.equal(fetched, 0);
  const reach = report.accounts.find((a) => a.id === "instagram").signals.find((s) => s.id === "reach");
  assert.equal(reach.level, "gap");
  assert.match(reach.text, /Nothing was fetched/);
  const hand = acc({ igPosts: [], checks: [{ type: "reading", platform: "instagram", date: day(1), by: "Steve", posts: posts([[1, 10], [2, 10], [3, 10], [4, 10], [5, 10], [6, 10], [7, 10]]) }] }, "instagram");
  assert.equal(sig(hand, "reach").level, "gap", "Instagram reach uses the stored reads, not a hand-typed list");
});

test("Spotify: a listener drop, a moved track, and an artificial-streams warning are red, and absence is not an all-clear", () => {
  const rows = [8, 6, 4, 1].map((n, i) => ({ date: day(n), change: 3, followers: 5000, monthly_listeners: i === 3 ? 6900 : 10000 }));
  const drop = acc({ growth: growth("Spotify", rows) }, "spotify");
  assert.equal(sig(drop, "listeners").level, "red");
  assert.match(sig(drop, "listeners").text, /6,900/);
  assert.match(sig(drop, "listeners").source, /Atlas/);
  const moved = acc({ checks: [{ type: "event", kind: "moved", platform: "spotify", date: day(2), by: "Atlas", text: "Sample Track", moved_to: "Other Profile" }] }, "spotify");
  assert.equal(sig(moved, "moved").level, "red");
  assert.match(sig(moved, "moved").text, /Other Profile/);
  const warn = acc({ checks: [{ type: "event", kind: "artificial", platform: "spotify", date: day(1), by: "Drop", text: "A warning was on the screen" }] }, "spotify");
  assert.equal(sig(warn, "artificial").level, "red");
  assert.match(sig(warn, "artificial").text, /Drop/);
  const quiet = acc({ growth: growth("Deezer", [{ date: day(1), change: -500, followers: 10, monthly_listeners: 1 }]) }, "spotify");
  assert.equal(sig(quiet, "listeners").level, "gap");
  assert.match(sig(quiet, "moved").text, /does not mean none moved/);
  assert.match(sig(quiet, "artificial").text, /does not mean there is none/);
});

test("the site is red when Webmaster records it down, and a failed song-page build is a watch", () => {
  const down = acc({ checks: [{ type: "reading", platform: "site", date: day(0), by: "Webmaster", site_ok: "no", site_note: "the page did not answer" }] }, "site");
  assert.equal(down.state, "red");
  assert.match(down.guidance, /will not delete, appeal or post/);
  const bad = acc({ checks: [{ type: "reading", platform: "site", date: day(0), by: "Webmaster", site_ok: "yes" }], builds: [{ what: "new page: Sample Song", state: "not done: GitHub's build stopped" }] }, "site");
  assert.equal(bad.state, "watch");
  assert.match(sig(bad, "builds").text, /not done/);
});

test("log_growth records a status check without follower numbers, and the wrong bot is refused", async () => {
  assert.equal(TOOLS.length, 47); /* account_health, needs_you, song_pl (18 Nov 2026 night test) + profile_jobs, profile_master, profile_rework, profile_uploaded (PR #87) */
  assert.ok(tool("log_growth").inputSchema.properties.account_status);
  assert.match(INSTRUCTIONS, /Account health/);
  const d = memoryDesk();
  await assert.rejects(call(d, "log_growth", { bot: "Steve", date: TODAY, platform: "TikTok", account_status: "clear" }), /Kevin/);
  await assert.rejects(call(d, "log_growth", { bot: "Drop", date: TODAY, platform: "Spotify", followers: "1200" }), /Steve, Atlas, Kevin or Laura/);
  assert.equal((await S.listGrowth(d, NOW, 1)).length, 0, "a refused follower log writes nothing");
  const warn = await call(d, "log_growth", { bot: "Drop", date: TODAY, platform: "Spotify", artificial_streams: "A warning was on the screen" });
  assert.equal(warn.saved, true);
  assert.match(warn.account_check, /artificial-streams/);
  assert.equal((await S.listGrowth(d, NOW, 1)).length, 0, "a check does not mark a growth duty");
  await assert.rejects(call(d, "log_growth", { bot: "Kevin", date: TODAY, platform: "TikTok", account_status: "clear", status_note: "password: hunter2" }), /password|key/i);
  const claim = await call(d, "log_growth", { bot: "Laura", date: day(1), claim: "Sample claim" });
  assert.equal(claim.saved, true);
  assert.equal(claim.account_check, undefined);
  const both = await call(d, "log_growth", { bot: "Laura", date: day(2), claim: "Another sample claim", platform: "YouTube", account_status: "clear" });
  assert.equal(both.saved, true);
  assert.match(both.account_check, /clear/);
  const kevin = await call(d, "log_growth", {
    bot: "Kevin", date: TODAY, platform: "TikTok", account_status: "clear", visible: "yes", visible_where: "For You",
    recent_posts: posts([[1, 200], [2, 200], [3, 200], [5, 2000], [7, 2000], [9, 2000], [12, 2000]]),
  });
  assert.equal(kevin.saved, true);
  const report = await loadReport({ store: d, ig: null, now: NOW, claims: (await S.loadDesk(d, NOW)).claims, builds: [] });
  assert.equal(report.accounts.find((a) => a.id === "tiktok").state, "red");
  const again = await call(d, "log_growth", { bot: "Kevin", date: TODAY, platform: "TikTok", account_status: "clear" });
  assert.equal(again.duplicate, true);
});

test("the daily check messages the owning bot only when the health changes, and never Luke", async () => {
  const d = memoryDesk();
  const first = await runAccountHealth({ desk: d, ig: null, now: NOW, roster: S.DEFAULT_ROSTER, builds: [] });
  assert.ok(first.sent.length >= 5);
  assert.equal(first.sent.some((s) => s.to === "Luke"), false);
  assert.ok(first.sent.some((s) => s.to === "Kevin" && s.platform === "tiktok"));
  assert.ok(first.sent.some((s) => s.to === "Webmaster" && s.platform === "site"));
  const msgs = await S.listMessages(d, NOW + DAY, 2);
  assert.equal(msgs.some((m) => m.to === "Luke" && String(m.mailId || "").startsWith("health:")), false);
  assert.equal(msgs.some((m) => m.kind === "report" && String(m.mailId || "").startsWith("health:")), false);
  const second = await runAccountHealth({ desk: d, ig: null, now: NOW + 60 * 60000, roster: S.DEFAULT_ROSTER, builds: [] });
  assert.equal(second.sent.length, 0);
  const src = readFileSync(new URL("../netlify/functions/accounthealth.mjs", import.meta.url), "utf8");
  assert.match(src, new RegExp(HEALTH_SCHEDULE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(src.includes("instagram.mjs"), false);
  assert.equal(src.includes("metaread"), false);
  assert.match(src, /runAccountHealth/);
});

test("the sample phone has one red account and does not invent a listener count", () => {
  const r = sampleReport(NOW);
  assert.equal(r.accounts.find((a) => a.id === "tiktok").state, "red");
  assert.equal(r.accounts.find((a) => a.id === "instagram").state, "green");
  assert.equal(r.connection.state, "watch");
  assert.match(r.connection.text, /connection, not the account/);
  const phone = readFileSync(new URL("../js/hq-phone.js", import.meta.url), "utf8");
  const waiting = phone.indexOf("Nothing is waiting on you.");
  const needs = phone.indexOf("health.needs");
  assert.ok(needs > 0 && needs < waiting, "a red health card is drawn before the empty line");
});
