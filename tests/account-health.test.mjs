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
  assert.equal(sig(edge, "reach").level, "ok", "exactly 30% is not under");

  const one = acc({ checks: [{ type: "reading", platform: "tiktok", date: day(1), by: "Kevin", posts: posts([[1, 200], [2, 2000], [3, 2000], ...older]) }] }, "tiktok");
  assert.equal(sig(one, "reach").level, "watch");
  assert.match(sig(one, "reach").text, /one post/i);
  assert.equal(one.state, "watch");

  const few = acc({ checks: [{ type: "reading", platform: "tiktok", date: day(1), by: "Kevin", posts: posts([[1, 10], [2, 10], [3, 10]]) }] }, "tiktok");
  assert.equal(sig(few, "reach").level, "gap");
  assert.match(sig(few, "reach").text, /Not enough data/);
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
  assert.equal(TOOLS.length, 48); /* account_health, needs_you, song_pl (18 Nov 2026 night test) + profile_jobs, profile_master, profile_rework, profile_uploaded (PR #87) */
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
