/* B4 (17 Nov 2026): the Instagram reader. A fake graph.instagram.com answers; no real call is ever made.
   Made-up account, posts, comments and numbers only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as IG from "../netlify/lib/instagram.mjs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, toolsFor, INSTRUCTIONS } from "../netlify/lib/staff-tools.mjs";

await import("../js/hq-lib.js");
const HL = globalThis.HQLib;
const H = 3600000, DAY = 86400000;
const NOW = Date.parse("2026-11-17T15:00:00Z");
const TOKEN = "IGAAmadeup" + "x".repeat(60);
const R = S.DEFAULT_ROSTER;

/* a fake Instagram: records every request; answers by path */
function fakeIg(o = {}) {
  const calls = [];
  const posts = o.posts || [
    { id: "p1", caption: "Made up reel\nsecond line", media_product_type: "REELS", timestamp: new Date(NOW - 7 * H).toISOString(), permalink: "https://www.instagram.com/reel/madeup1/", like_count: 40, comments_count: 2 },
    { id: "p2", caption: "Older made up post", media_type: "IMAGE", timestamp: new Date(NOW - 30 * DAY).toISOString(), permalink: "https://www.instagram.com/p/madeup2/", like_count: 9, comments_count: 0 }];
  const f = async (url, init) => {
    const u = new URL(url), path = u.pathname.replace(/^\/v[\d.]+\//, "/");
    calls.push({ path, q: Object.fromEntries(u.searchParams), auth: (init.headers || {}).Authorization || "" });
    const ok = (j) => new Response(JSON.stringify(j), { status: 200 });
    if (o.refuse) return new Response(JSON.stringify({ error: { message: "Error validating access token", type: "OAuthException", code: 190 } }), { status: 400 });
    if (path === "/me") return ok({ user_id: "17800000000000001", username: "madeupaccount", account_type: o.type || "BUSINESS", followers_count: 1234, media_count: 2 });
    if (path === "/me/media") return ok({ data: posts });
    if (/\/insights$/.test(path) && path.startsWith("/p")) return ok({ data: [{ name: "views", values: [{ value: 500 }] }, { name: "reach", values: [{ value: 320 }] }, { name: "saved", values: [{ value: 12 }] }, { name: "shares", values: [{ value: 5 }] }, { name: "likes", values: [{ value: 40 }] }] });
    if (/\/comments$/.test(path)) return ok({ data: [{ id: "c1", text: "what song is this??", username: "made_up_fan", timestamp: new Date(NOW - H).toISOString() }] });
    if (path === "/me/insights") return ok({ data: [{ name: "follower_demographics", total_value: { breakdowns: [{ results: [{ dimension_values: ["BR"], value: 700 }, { dimension_values: ["IE"], value: 200 }] }] } }] });
    if (path === "/refresh_access_token") return ok({ access_token: TOKEN.replace("x", "y"), token_type: "bearer", expires_in: 5183944 });
    return new Response("{}", { status: 404 });
  };
  return { f, calls };
}
const memStore = () => { const m = new Map(); return { m, get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); }, delete: async (k) => { m.delete(k); } }; };

test("saveKey: checked against Instagram first; a bad key or a personal account is refused; the key goes in the header", async () => {
  const st = memStore(), ig = fakeIg();
  await assert.rejects(IG.saveKey(st, "not a key", NOW, ig.f), (e) => e.kind === "bad");
  await assert.rejects(IG.saveKey(st, TOKEN, NOW, fakeIg({ type: "PERSONAL" }).f), (e) => e.kind === "notPro");
  await assert.rejects(IG.saveKey(st, TOKEN, NOW, fakeIg({ refuse: true }).f), (e) => e.kind === "refused");
  const r = await IG.saveKey(st, TOKEN, NOW, ig.f);
  assert.deepEqual(r, { username: "madeupaccount", followers: 1234 });
  assert.equal(ig.calls[0].auth, "Bearer " + TOKEN);
  assert.equal(ig.calls[0].q.access_token, undefined, "never in the address while the header works");
});
test("status and view never carry the key", async () => {
  const st = memStore(); await IG.saveKey(st, TOKEN, NOW, fakeIg().f);
  const s = await IG.igStatus(st, NOW);
  assert.equal(s.connected, true); assert.equal(s.username, "madeupaccount"); assert.equal(s.daysLeft, 60);
  assert.equal(JSON.stringify(await IG.igView(st, NOW)).includes(TOKEN), false);
});
test("one read: followers to the desk, post numbers at 6 hours, comments, countries", async () => {
  const st = memStore(), ig = fakeIg(), rows = [];
  await IG.saveKey(st, TOKEN, NOW - DAY, ig.f);
  const r = await IG.syncInstagram({ store: st, now: NOW, fetchImpl: ig.f, logGrowth: async (row) => rows.push(row) });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(rows, [{ platform: "Instagram", account: "@madeupaccount", followers: "1234" }]);
  const v = await IG.igView(st, NOW);
  const p1 = v.posts.find((p) => p.id === "p1");
  assert.deepEqual(Object.keys(p1.snaps), ["h6"], "7 hours old: the 6-hour numbers, not yet a day");
  assert.equal(p1.snaps.h6.views, 500); assert.equal(p1.snaps.h6.saves, 12);
  assert.equal(p1.caption, "Made up reel");
  const p2 = v.posts.find((p) => p.id === "p2");
  assert.deepEqual(p2.snaps, {}, "older than 8 days: no insights call");
  assert.equal(ig.calls.filter((c) => c.path === "/p2/insights").length, 0);
  assert.deepEqual(v.comments.map((c) => [c.user, c.text]), [["made_up_fan", "what song is this??"]]);
  assert.deepEqual(v.countries, [{ country: "BR", count: 700 }, { country: "IE", count: 200 }]);
  /* an hour later: nothing new is taken twice, comments wait for 3 hours */
  const before = ig.calls.length;
  await IG.syncInstagram({ store: st, now: NOW + H, fetchImpl: ig.f });
  assert.equal(ig.calls.slice(before).filter((c) => /comments|insights/.test(c.path)).length, 0);
  assert.equal((await IG.igView(st, NOW + H)).comments.length, 1);
  /* a day later: the 1-day numbers */
  await IG.syncInstagram({ store: st, now: NOW + 18 * H, fetchImpl: ig.f });
  assert.deepEqual(Object.keys((await IG.igView(st, NOW + 18 * H)).posts.find((p) => p.id === "p1").snaps).sort(), ["d1", "h6"]);
});
test("the key renews itself once a week; a refused key is said plainly; no key = not connected", async () => {
  const st = memStore(), ig = fakeIg();
  await IG.saveKey(st, TOKEN, NOW - 8 * DAY, ig.f);
  const r = await IG.syncInstagram({ store: st, now: NOW, fetchImpl: ig.f });
  assert.equal(r.renewed, true);
  const ref = ig.calls.find((c) => c.path === "/refresh_access_token");
  assert.equal(ref.q.grant_type, "ig_refresh_token");
  assert.equal((await IG.igStatus(st, NOW)).daysLeft, 59);
  const st2 = memStore(); await IG.saveKey(st2, TOKEN, NOW, ig.f);
  const bad = await IG.syncInstagram({ store: st2, now: NOW + H, fetchImpl: fakeIg({ refuse: true }).f });
  assert.equal(bad.kind, "refused");
  assert.equal((await IG.igStatus(st2, NOW + H)).lastError, IG.SAY.refused);
  assert.equal((await IG.syncInstagram({ store: memStore(), now: NOW, fetchImpl: ig.f })).kind, "missing");
});
test("postLine: one post in plain words for the bots", () => {
  assert.equal(IG.postLine({ at: "2026-11-17T08:00:00Z", type: "reels", caption: "Made up", link: "https://www.instagram.com/reel/x/", snaps: { d1: { views: 1240, reach: 880, likes: 60, saves: 9, shares: 4 } } }),
    "2026-11-17 · reels · “Made up” · a day: 1,240 views, 880 reach, 60 likes, 9 saves, 4 shares · https://www.instagram.com/reel/x/");
});
test("the desk takes HQ's Instagram row without marking any duty", async () => {
  const d = memoryDesk();
  const r = await S.logGrowth(d, NOW, R, { by: "HQ", date: "2026-11-17", platform: "Instagram", account: "@madeupaccount", followers: "1234" });
  assert.equal(r.duty, null);
  assert.equal((await S.listGrowth(d, NOW))[0].followers, 1234);
});
test("the instagram tool (Steve, Kevin; Nova): read-only, never the key", async () => {
  const d = memoryDesk(), st = memStore();
  await IG.saveKey(st, TOKEN, NOW - DAY, fakeIg().f);
  await IG.syncInstagram({ store: st, now: NOW, fetchImpl: fakeIg().f });
  const out = await callTool(TOOLS.find((t) => t.name === "instagram"), { bot: "Steve" }, { store: d, now: NOW, role: "bot", hq: async () => null, ig: () => st });
  assert.equal(out.connected, true);
  assert.equal(out.followers, 1234);
  assert.match(out.posts[0], /Made up reel/);
  assert.match(out.new_comments[0], /made_up_fan: what song is this\?\?/);
  assert.equal(JSON.stringify(out).includes(TOKEN), false);
  assert.ok(toolsFor("Steve", R).some((t) => t.name === "instagram") && toolsFor("Kevin", R).some((t) => t.name === "instagram"));
  assert.ok(!toolsFor("Ledger", R).some((t) => t.name === "instagram"));
  assert.match(INSTRUCTIONS, /never open Instagram in a browser/);
});
test("routes, the hourly read, and the page's box", () => {
  const fn = readFileSync(new URL("../netlify/functions/hq.mjs", import.meta.url), "utf8");
  assert.match(fn, /\/api\/hq\/instagram/);
  assert.match(readFileSync(new URL("../netlify/functions/pushhourly.mjs", import.meta.url), "utf8"), /syncInstagram/);
  const html = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  assert.match(html, /id="igBox"/);
  assert.equal(HL.igStatusLine({ connected: false }), "Instagram is not connected yet.");
  assert.equal(HL.igStatusLine({ connected: true, username: "madeupaccount", lastOkAt: NOW - 5 * 60000, daysLeft: 59 }, NOW), "@madeupaccount · read 5 min ago · the key renews by itself");
  assert.equal(HL.igStatusLine({ connected: true, username: "madeupaccount", lastError: IG.SAY.refused, errorKind: "refused" }, NOW), IG.SAY.refused);
});
