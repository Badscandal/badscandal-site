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
  assert.deepEqual(p2.snaps, {}, "older than 8 days: no marks");
  /* since 17 Nov (Nova): an older post gets its lifetime numbers once (numbers + follows), never again */
  assert.equal(ig.calls.filter((c) => c.path === "/p2/insights").length, 2);
  assert.equal(p2.lifetime, true);
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
    "2026-11-17 · reels · “Made up” · a day: 1,240 views, 880 reach, 60 likes, ? comments, 9 saves, 4 shares · https://www.instagram.com/reel/x/");
  assert.equal(IG.postLine({ at: "2026-11-17T08:00:00Z", type: "reels", caption: "Made up", link: "", comments: 3, snaps: { d1: { views: 1240, reach: 880, likes: 60, saves: 9, shares: 4, follows: 7, profile_visits: 30 } } }),
    "2026-11-17 · reels · “Made up” · a day: 1,240 views, 880 reach, 60 likes, 3 comments, 9 saves, 4 shares, 7 follows, 30 profile visits");
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

/* ---------- the Facebook-login route (17 Nov 2026: Meta blocked the portfolio link the Instagram route needs) ---------- */
const USER = "EAAusermadeup" + "u".repeat(60), PAGE = "EAApagemadeup" + "p".repeat(60);
function fakeFb(o = {}) {
  const calls = [];
  const f = async (url, init) => {
    const u = new URL(url), path = u.pathname.replace(/^\/v[\d.]+\//, "/");
    calls.push({ host: u.host, path, q: Object.fromEntries(u.searchParams), auth: (init.headers || {}).Authorization || "" });
    const ok = (j) => new Response(JSON.stringify(j), { status: 200 });
    if (path === "/me/accounts") {
      if (o.noPerms) return new Response(JSON.stringify({ error: { message: "(#100) Missing permissions", type: "OAuthException", code: 100 } }), { status: 400 });
      return ok({ data: [{ id: "111", name: "Some Other Page", access_token: "EAAother" + "o".repeat(60) },
        ...(o.noIg ? [] : [{ id: "222", name: "MADE UP PAGE", access_token: PAGE, instagram_business_account: { id: "17841400000000001", username: "madeupaccount" } }])] });
    }
    if (path === "/17841400000000001") return ok({ username: "madeupaccount", followers_count: 2222, media_count: 3 });
    if (path === "/17841400000000001/media") return ok({ data: [{ id: "f1", caption: "Made up FB-route reel", media_product_type: "REELS", timestamp: new Date(NOW - 7 * H).toISOString(), permalink: "https://www.instagram.com/reel/fb1/", like_count: 3, comments_count: 0 }] });
    if (path === "/f1/insights") return ok({ data: [{ name: "views", values: [{ value: 90 }] }, { name: "reach", values: [{ value: 60 }] }] });
    if (path === "/17841400000000001/insights") return ok({ data: [] });
    return new Response("{}", { status: 404 });
  };
  return { f, calls };
}
test("Facebook route: a user key is swapped for the Page's key; only the Page key is kept, and it never needs renewing", async () => {
  const st = memStore(), fb = fakeFb();
  const r = await IG.saveKey(st, USER, NOW, fb.f);
  assert.deepEqual(r, { username: "madeupaccount", followers: 2222 });
  assert.equal(fb.calls[0].host, "graph.facebook.com");
  assert.equal(fb.calls[0].auth, "Bearer " + USER);
  assert.equal(fb.calls[1].auth, "Bearer " + PAGE, "the Instagram account is read with the Page's key");
  const stored = JSON.stringify([...st.m.values()]);
  assert.equal(stored.includes(USER), false, "the user key is never kept");
  assert.ok(stored.includes(PAGE));
  const s = await IG.igStatus(st, NOW);
  assert.equal(s.route, "fb"); assert.equal(s.daysLeft, null); assert.equal(s.renews, false); assert.equal(s.page, "MADE UP PAGE");
  assert.equal(HL.igStatusLine({ ...s, lastOkAt: NOW - 60000 }, NOW), "@madeupaccount · read 1 min ago · through the MADE UP PAGE Page · the key doesn't run out");
  /* a read, weeks later: no renewal call, the same paths through the account's id */
  const rows = [];
  const out = await IG.syncInstagram({ store: st, now: NOW + 30 * DAY, fetchImpl: fb.f, logGrowth: async (x) => rows.push(x) });
  assert.equal(out.ok, true, out.error);
  assert.equal(fb.calls.some((c) => c.path === "/refresh_access_token"), false);
  assert.deepEqual(rows, [{ platform: "Instagram", account: "@madeupaccount", followers: "2222" }]);
});
test("Facebook route: no linked Instagram account, or a key without the Page permissions, is said plainly", async () => {
  /* since 17 Nov: no Page with Instagram in /me/accounts -> the known Page is read; here it can't be opened, so HQ
     says that, never "not linked" (that is only for a Page with no Instagram: the portfolio tests below) */
  await assert.rejects(IG.saveKey(memStore(), USER, NOW, fakeFb({ noIg: true }).f), (e) => e.kind === "noPageAccess" && !/Linked accounts/.test(e.message));
  await assert.rejects(IG.saveKey(memStore(), USER, NOW, fakeFb({ noPerms: true }).f), (e) => e.kind === "noPerms" && /pages_show_list/.test(e.message));
});

/* The safety brake (17 Nov 2026, Luke: "our prime goal is not to get our account restricted or disabled, we need
   ads"). HQ never keeps knocking: a rate limit pauses every read for a day; a block, a restriction or a refused key
   stops reading altogether until a new key is pasted. Read now obeys the brake too. */
function errIg(error, status = 400) {
  const calls = [];
  const f = async (url) => { calls.push(url); return new Response(JSON.stringify({ error }), { status }); };
  return { f, calls };
}
test("brake: a rate limit pauses every read for a day, then reading starts again", async () => {
  for (const code of [4, 17, 32, 613, 80002]) {
    const st = memStore(); await IG.saveKey(st, TOKEN, NOW - DAY, fakeIg().f);
    const lim = errIg({ message: "Application request limit reached", type: "OAuthException", code });
    const r = await IG.syncInstagram({ store: st, now: NOW, fetchImpl: lim.f });
    assert.equal(r.kind, "limit", "code " + code);
    const n = lim.calls.length;
    const again = await IG.syncInstagram({ store: st, now: NOW + 3 * H, fetchImpl: lim.f });
    assert.equal(again.kind, "paused"); assert.equal(lim.calls.length, n, "no call while paused");
    const s = await IG.igStatus(st, NOW + 3 * H);
    assert.equal(s.pausedUntil, NOW + DAY); assert.match(s.lastError, /paused/i);
    const ok = await IG.syncInstagram({ store: st, now: NOW + DAY + 1, fetchImpl: fakeIg().f });
    assert.equal(ok.ok, true, "a day later it reads again");
  }
  const st = memStore(); await IG.saveKey(st, TOKEN, NOW - DAY, fakeIg().f);
  assert.equal((await IG.syncInstagram({ store: st, now: NOW, fetchImpl: errIg({ message: "Too many calls" }, 429).f })).kind, "limit", "HTTP 429");
});
test("brake: a block, a restriction or a refused key stops reading until a new key is pasted", async () => {
  const cases = [{ message: "You have been temporarily blocked from performing this action.", code: 368 },
    { message: "Your account is restricted right now", code: 10 },
    { message: "Error validating access token: The session has been invalidated", type: "OAuthException", code: 190 }];
  for (const error of cases) {
    const st = memStore(); await IG.saveKey(st, TOKEN, NOW - DAY, fakeIg().f);
    const bad = errIg(error);
    const r = await IG.syncInstagram({ store: st, now: NOW, fetchImpl: bad.f });
    assert.ok(["blocked", "refused"].includes(r.kind), error.message);
    const n = bad.calls.length;
    for (const later of [H, DAY, 30 * DAY]) assert.equal((await IG.syncInstagram({ store: st, now: NOW + later, fetchImpl: bad.f })).kind, "stopped");
    assert.equal(bad.calls.length, n, "never another call");
    assert.equal((await IG.igStatus(st, NOW + H)).stopped, true);
    await IG.saveKey(st, TOKEN, NOW + 2 * DAY, fakeIg().f);
    assert.equal((await IG.syncInstagram({ store: st, now: NOW + 2 * DAY, fetchImpl: fakeIg().f })).ok, true, "a new key starts it again");
  }
  const st = memStore(); await IG.saveKey(st, TOKEN, NOW - DAY, fakeIg().f);
  const r = await IG.syncInstagram({ store: st, now: NOW, fetchImpl: errIg({ message: "You have been temporarily blocked" }, 400).f });
  assert.equal(r.kind, "blocked"); assert.match(r.error, /stopped/i);
});
test("brake: a normal read stays small (well under Meta's limits)", async () => {
  const st = memStore(), ig = fakeIg(); await IG.saveKey(st, TOKEN, NOW - DAY, ig.f);
  const n0 = ig.calls.length;
  await IG.syncInstagram({ store: st, now: NOW, fetchImpl: ig.f });
  assert.ok(ig.calls.length - n0 <= 10, "first read: " + (ig.calls.length - n0) + " calls");
  const n1 = ig.calls.length;
  await IG.syncInstagram({ store: st, now: NOW + H, fetchImpl: ig.f });
  assert.ok(ig.calls.length - n1 <= 3, "an ordinary hour: " + (ig.calls.length - n1) + " calls");
});

/* The Page reached through the business portfolio (17 Nov 2026): Luke's access to the Page comes through the
   portfolio, not a direct Page role, so /me/accounts answers {"data": []} although every permission is granted and
   the Page itself reads fine. HQ then reads the known Page (DEFAULT_PAGE_ID, or env FB_PAGE_ID); if Meta won't hand
   over the Page's own key, it keeps the user key (about 60 days) and says when to make a new one. */
function portfolioFb(o = {}) {
  const calls = [];
  const f = async (url, init) => {
    const u = new URL(url), path = u.pathname.replace(/^\/v[\d.]+\//, "/"), q = Object.fromEntries(u.searchParams);
    calls.push({ path, q, auth: (init.headers || {}).Authorization || "" });
    const ok = (j) => new Response(JSON.stringify(j), { status: 200 });
    const no = (code, message) => new Response(JSON.stringify({ error: { message, type: "OAuthException", code } }), { status: 400 });
    if (path === "/me/accounts") return ok({ data: o.otherPage ? [{ id: "111", name: "Some Other Page", access_token: "EAAother" + "o".repeat(60) }] : [] });
    if (path === "/" + (o.pageId || "333")) {
      if (o.pageDenied) return no(100, "(#100) Object does not exist, cannot be loaded due to missing permissions");
      if (/access_token/.test(q.fields || "")) return o.pageToken ? ok({ id: "333", access_token: PAGE }) : no(200, "(#200) Requires pages_manage_metadata permission");
      return ok({ id: "333", name: "MADE UP PAGE", ...(o.noIg ? {} : { instagram_business_account: { id: "17841400000000001", username: "madeupaccount" } }) });
    }
    if (path === "/17841400000000001") return ok({ username: "madeupaccount", followers_count: 2222, media_count: 3 });
    if (path === "/17841400000000001/media") return ok({ data: [] });
    if (path === "/17841400000000001/insights") return ok({ data: [] });
    return new Response("{}", { status: 404 });
  };
  return { f, calls };
}
test("portfolio Page: /me/accounts empty -> the known Page is read; Meta keeps its key -> the user key stays, ~60 days", async () => {
  const st = memStore(), fb = portfolioFb();
  const r = await IG.saveKey(st, USER, NOW, fb.f, { pageId: "333" });
  assert.deepEqual(r, { username: "madeupaccount", followers: 2222 });
  assert.ok(fb.calls.some((c) => c.path === "/333"), "the known Page was read");
  assert.ok(fb.calls.every((c) => !JSON.stringify(c.q).includes(USER)), "the key never goes in an address");
  const s = await IG.igStatus(st, NOW);
  assert.equal(s.route, "fb"); assert.equal(s.keyType, "user"); assert.equal(s.renews, false); assert.equal(s.daysLeft, 60); assert.equal(s.page, "MADE UP PAGE");
  assert.equal(JSON.stringify(s).includes(USER), false);
  const line = HL.igStatusLine({ ...s, lastOkAt: NOW - 60000 }, NOW);
  assert.equal(line, "@madeupaccount · read 1 min ago · through the MADE UP PAGE Page · Meta key: expires around Sat 16 Jan, make a new one before then");
  /* reads work with the user key */
  const out = await IG.syncInstagram({ store: st, now: NOW + H, fetchImpl: fb.f });
  assert.equal(out.ok, true, out.error);
  assert.ok(fb.calls.filter((c) => c.path.startsWith("/1784")).every((c) => c.auth === "Bearer " + USER));
});
test("portfolio Page: when Meta does hand over the Page's key, only that is kept (it doesn't run out)", async () => {
  const st = memStore(), fb = portfolioFb({ pageToken: true, otherPage: true });
  await IG.saveKey(st, USER, NOW, fb.f, { pageId: "333" });
  const stored = JSON.stringify([...st.m.values()]);
  assert.equal(stored.includes(USER), false); assert.ok(stored.includes(PAGE));
  const s = await IG.igStatus(st, NOW);
  assert.equal(s.keyType, "page"); assert.equal(s.daysLeft, null);
});
test("portfolio Page: 'not linked' only when the Page itself has no Instagram; a Page the key can't open says so", async () => {
  await assert.rejects(IG.saveKey(memStore(), USER, NOW, portfolioFb({ noIg: true }).f, { pageId: "333" }), (e) => e.kind === "noPage" && /Linked accounts/.test(e.message));
  await assert.rejects(IG.saveKey(memStore(), USER, NOW, portfolioFb({ pageDenied: true }).f, { pageId: "333" }), (e) => e.kind === "noPageAccess" && !/Linked accounts/.test(e.message) && /333/.test(e.message));
});
test("the Page id: Badscandal's by default, env FB_PAGE_ID overrides; the route passes it", () => {
  assert.equal(IG.DEFAULT_PAGE_ID, "101630812698451");
  assert.equal(IG.pageIdFrom(() => undefined), "101630812698451");
  assert.equal(IG.pageIdFrom((k) => (k === "FB_PAGE_ID" ? " 123456789 " : undefined)), "123456789");
  assert.equal(IG.pageIdFrom(() => "not-a-number"), "101630812698451");
  const fn = readFileSync(new URL("../netlify/functions/hq.mjs", import.meta.url), "utf8");
  assert.match(fn, /saveKey\(store, body && body\.token, now, fetch, \{ pageId: IG\.pageIdFrom\(/);
});

/* Nova's points, 17 Nov 2026: compare posts at the same age; older posts need numbers too; follows; our replies */
function richIg(o = {}) {
  const calls = [];
  const posts = o.posts;
  const f = async (url, init) => {
    const u = new URL(url), path = u.pathname.replace(/^\/v[\d.]+\//, "/"), q = Object.fromEntries(u.searchParams);
    calls.push({ path, q });
    const ok = (j) => new Response(JSON.stringify(j), { status: 200 });
    if (path === "/me") return ok({ user_id: "1", username: "madeupaccount", account_type: "BUSINESS", followers_count: 10, media_count: posts.length });
    if (path === "/me/media") return ok({ data: posts });
    if (/\/insights$/.test(path) && q.metric === "follows,profile_visits") return o.noFollows ? new Response(JSON.stringify({ error: { message: "(#100) metric not supported", code: 100 } }), { status: 400 }) : ok({ data: [{ name: "follows", values: [{ value: 7 }] }, { name: "profile_visits", values: [{ value: 30 }] }] });
    if (/\/insights$/.test(path)) return ok({ data: [{ name: "views", values: [{ value: 1000 }] }, { name: "likes", values: [{ value: 80 }] }, { name: "comments", values: [{ value: 5 }] }] });
    if (/\/comments$/.test(path)) return ok({ data: [{ id: "k1", text: "can i use this song?", username: "made_up_fan", timestamp: new Date(NOW - H).toISOString(), replies: { data: [{ username: "MadeUpAccount" }] } }] });
    return ok({ data: [] });
  };
  return { f, calls };
}
const mp = (id, ageMs) => ({ id, caption: "post " + id, media_product_type: "REELS", timestamp: new Date(NOW - ageMs).toISOString(), permalink: "https://www.instagram.com/reel/" + id + "/", like_count: 1, comments_count: 1 });
test("marks are taken only near their age: a post first seen at 3 days gets no '1 day' numbers", async () => {
  const st = memStore(); await IG.saveKey(st, TOKEN, NOW - DAY, fakeIg().f);
  const ig = richIg({ posts: [mp("young", 25 * H), mp("late", 3 * DAY)] });
  await IG.syncInstagram({ store: st, now: NOW, fetchImpl: ig.f });
  const posts = await st.get("posts.json"), y = posts.find((p) => p.id === "young"), l = posts.find((p) => p.id === "late");
  assert.ok(y.snaps.d1 && y.snaps.h6 === undefined, "25 hours: the 1-day mark, the 6-hour one is long past");
  assert.deepEqual(Object.keys(l.snaps), [], "3 days old when first seen: no mark at all");
  assert.equal(y.snaps.d1.follows, 7); assert.equal(y.snaps.d1.profile_visits, 30);
  assert.ok(l.latest, "it still has its numbers so far");
});
test("older posts get their lifetime numbers once, a few per hour; follows only when the post type has them", async () => {
  const st = memStore(); await IG.saveKey(st, TOKEN, NOW - DAY, fakeIg().f);
  const old = Array.from({ length: 6 }, (_, i) => mp("old" + i, (20 + i) * DAY));
  const ig = richIg({ posts: old, noFollows: true });
  const r = await IG.syncInstagram({ store: st, now: NOW, fetchImpl: ig.f });
  assert.equal(r.backfilled, 4);
  let posts = await st.get("posts.json");
  assert.equal(posts.filter((p) => p.latest && p.lifetime).length, 4);
  assert.equal(posts[0].latest.follows, undefined, "a refused follows metric is just left out");
  const n = ig.calls.length;
  await IG.syncInstagram({ store: st, now: NOW + H, fetchImpl: ig.f });
  posts = await st.get("posts.json");
  assert.equal(posts.filter((p) => p.latest).length, 6, "the rest the next hour");
  const n2 = ig.calls.length;
  await IG.syncInstagram({ store: st, now: NOW + 2 * H, fetchImpl: ig.f });
  assert.ok(ig.calls.length - n2 <= 3, "once read, never again: " + (ig.calls.length - n2) + " calls");
  assert.ok(n2 - n <= 8);
});
test("comments keep who replied (usernames only), so a question we answered isn't 'needs a reply'", async () => {
  const st = memStore(); await IG.saveKey(st, TOKEN, NOW - DAY, fakeIg().f);
  const ig = richIg({ posts: [mp("p", 30 * H)] });
  await IG.syncInstagram({ store: st, now: NOW, fetchImpl: ig.f });
  assert.match(ig.calls.find((c) => /comments$/.test(c.path)).q.fields, /replies\{username\}/);
  const list = await st.get("comments.json");
  assert.deepEqual(list[0].repliedBy, ["madeupaccount"]);
  const v = await IG.igView(st, NOW);
  assert.equal(v.needsReply.length, 0, "our own account replied");
});

test("the post's own picture comes in the same read (no extra call), and an expired one falls back on the page (18 Nov 2026)", async () => {
  const posts = [
    { id: "p1", caption: "Made up reel", media_type: "VIDEO", media_product_type: "REELS", timestamp: new Date(NOW - 7 * H).toISOString(), permalink: "https://www.instagram.com/reel/madeup1/", like_count: 40, comments_count: 2, thumbnail_url: "https://cdn.example.com/thumb1.jpg", media_url: "https://cdn.example.com/video1.mp4" },
    { id: "p2", caption: "Made up photo", media_type: "IMAGE", timestamp: new Date(NOW - 30 * DAY).toISOString(), permalink: "https://www.instagram.com/p/madeup2/", like_count: 9, comments_count: 0, media_url: "https://cdn.example.com/photo2.jpg" },
    { id: "p3", caption: "No picture", media_type: "IMAGE", timestamp: new Date(NOW - 31 * DAY).toISOString(), permalink: "https://www.instagram.com/p/madeup3/", like_count: 1, comments_count: 0, media_url: "javascript:alert(1)" }];
  const ig = fakeIg({ posts }), st = memStore();
  await IG.saveKey(st, TOKEN, NOW, ig.f);
  const before = ig.calls.length;
  await IG.syncInstagram({ store: st, now: NOW, fetchImpl: ig.f });
  const media = ig.calls.slice(before).filter((c) => /\/media$/.test(c.path));
  assert.equal(media.length, 1, "one media read, as before");
  assert.match(media[0].q.fields, /media_url,thumbnail_url/);
  const saved = await st.get("posts.json");
  assert.equal(saved.find((p) => p.id === "p1").thumb, "https://cdn.example.com/thumb1.jpg", "a video shows its thumbnail, never the video file");
  assert.equal(saved.find((p) => p.id === "p2").thumb, "https://cdn.example.com/photo2.jpg");
  assert.equal(saved.find((p) => p.id === "p3").thumb, undefined, "only https pictures");
  const pick = HL.mondayPick({ ranked: [{ caption: "Made up reel", thumb: "https://cdn.example.com/thumb1.jpg", song: "Made Up Song", rate: 0.05 }] }, null, [{ title: "Made Up Song", cover: "/assets/made-up-cover.webp" }]);
  assert.equal(pick.pick.cover, "https://cdn.example.com/thumb1.jpg");
  assert.equal(pick.pick.fallback, "/assets/made-up-cover.webp", "the linked song's cover if Instagram's link expired");
  assert.equal(pick.pick.song, "Made Up Song");
  const noThumb = HL.mondayPick({ ranked: [{ caption: "Studio night", song: "Made Up Song", rate: 0.05 }] }, null, [{ title: "Made Up Song", cover: "/assets/made-up-cover.webp" }]);
  assert.equal(noThumb.pick.cover, "/assets/made-up-cover.webp", "the song Steve or Forge linked gives the cover even when the caption doesn't name it");
});
