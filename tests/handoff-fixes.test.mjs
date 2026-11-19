/* The 18 Nov 2026 handoff's suspected bugs (docs/HQ-FULL-HANDOFF.md section 9). Made-up names only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";
import * as C from "../netlify/lib/action-cards.mjs";
import { needsDesk } from "../netlify/lib/needs.mjs";

await import("../js/hq-look.js");
const V = globalThis.HQLook;

const NOW = Date.parse("2026-11-18T15:00:00Z"); /* 12:00 São Paulo */
const R = S.DEFAULT_ROSTER;
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, o = {}) => callTool(tool(name), args, { store: d, now: o.now || NOW, role: "bot", hq: o.hq || (async () => null), ...(o.ctx || {}) });
async function inbox(d, n, to = "Kevin") {
  for (let i = 0; i < n; i++) await S.sendMessage(d, NOW - (n - i) * 60000, R, { from: "Nova", to, needs: "none", text: `Note number ${i + 1}` });
}

/* bug 7: read_messages moved its read marker past messages it never handed over */
test("a broad read_messages that returns 20 of 25 leaves the other 5 unread", async () => {
  const d = memoryDesk();
  await inbox(d, 25);
  const first = await call(d, "read_messages", { bot: "Kevin" });
  assert.equal(first.messages.length, 20);
  assert.match(first.still_unread, /^5 messages for you are not in this answer/);
  const count = await call(d, "read_messages", { bot: "Kevin", count_only: true });
  assert.equal(count.count, 5);
  const rest = await call(d, "read_messages", { bot: "Kevin", unread: true });
  assert.deepEqual(rest.messages.map((m) => m.text).sort(), ["Note number 1", "Note number 2", "Note number 3", "Note number 4", "Note number 5"].sort());
  assert.equal(rest.still_unread, undefined);
  assert.equal((await call(d, "read_messages", { bot: "Kevin", count_only: true })).count, 0);
});

test("unread hands over the oldest first, so a long backlog is read to the end", async () => {
  const d = memoryDesk();
  await inbox(d, 12);
  const a = await call(d, "read_messages", { bot: "Kevin", unread: true, limit: 5 });
  assert.deepEqual(a.messages.map((m) => m.text).reverse(), ["Note number 1", "Note number 2", "Note number 3", "Note number 4", "Note number 5"]);
  assert.match(a.more, /7 newer ones come next/);
  const b = await call(d, "read_messages", { bot: "Kevin", unread: true, limit: 5 });
  assert.equal(b.messages.at(-1).text, "Note number 6");
  const c = await call(d, "read_messages", { bot: "Kevin", unread: true, limit: 5 });
  assert.equal(c.messages.length, 2);
  assert.equal((await call(d, "read_messages", { bot: "Kevin", count_only: true })).count, 0);
});

test("my_day with more than 30 new messages leaves the older ones unread", async () => {
  const d = memoryDesk();
  await inbox(d, 33);
  const day = await call(d, "my_day", { bot: "Kevin" });
  assert.equal(day.messages_for_you.length, 30);
  assert.match(day.more_messages, /^3 older messages/);
  assert.equal((await call(d, "read_messages", { bot: "Kevin", count_only: true })).count, 3);
});

test("a read that hands over everything still marks it all read", async () => {
  const d = memoryDesk();
  await inbox(d, 3);
  await call(d, "my_day", { bot: "Kevin" });
  assert.equal((await call(d, "read_messages", { bot: "Kevin", count_only: true })).count, 0);
});

/* bugs 5 and 6: a tool marked read-only changed the desk or messaged Luke (profile_jobs asked him about a stuck
   job; song_pages kept a build report and messaged the bot that asked). The read marker and "last used the
   desk" are the only things a read may touch. */
test("every read-only tool leaves the desk as it was, apart from the caller's own markers", async (t) => {
  const d = memoryDesk();
  const old = new Date(NOW - 3 * 86400000).toISOString();
  await d.setJSON("profiles.json", { jobs: [{ id: "j-made-up", slot: "youtube-banner", status: "open", reason: "made up", at: old, by: "Luke", owner: "Laura" }] });
  const reqId = (await S.sendMessage(d, NOW - 3600000, R, { from: "Webmaster", to: "Luke", needs: "decision", options: ["Yes, correct", "No"], text: "Make the made-up page?" })).message.id;
  await S.mutate(d, `msg/${S.spDay(NOW).slice(0, 7)}.json`, [], (list) => {
    const m = list.find((x) => x.id === reqId);
    m.proposal = { action: "page", slug: "madeup", title: "Made Up" };
    m.proposalResult = { done: true, at: new Date(NOW - 1800000).toISOString() };
    m.resolved = { by: "Luke", note: "yes, correct", at: new Date(NOW - 1800000).toISOString() };
    return { value: m };
  });
  S.useSongReports(async (id) => ({ msg: id, ok: false, step: "Song-page checks", reason: "made up", run: "" }));
  t.after(() => S.useSongReports(null));
  const snap = () => new Map([...d._map].filter(([k]) => !/^(seen|read)\//.test(k)).map(([k, v]) => [k, v.body]));
  const before = snap();
  const ro = TOOLS.filter((x) => x.readOnly);
  assert.ok(ro.some((x) => x.name === "profile_jobs"), "profile_jobs is a list");
  assert.ok(ro.some((x) => x.name === "song_pages"));
  assert.equal(ro.some((x) => x.name === "instagram"), false, "instagram saves post links and our accounts: not read-only");
  const extra = { song: "Made Up", kind: "photo", month: "2026-11" };
  for (const x of ro) {
    try { await callTool(x, { bot: "Nova", ...extra }, { store: d, now: NOW, role: "bot", hq: async () => null, fetch: async () => ({ status: 200 }) }); } catch { /* a refusal is fine: nothing may change either way */ }
    const after = snap();
    for (const [k, v] of after) assert.equal(v, before.get(k), `${x.name} changed ${k}`);
    assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), `${x.name} added or removed a key`);
  }
});

test("the hourly job still asks Luke about a stuck profile job, once", async () => {
  const P = await import("../netlify/lib/profile-images.mjs");
  const d = memoryDesk();
  await d.setJSON("profiles.json", { jobs: [{ id: "j-made-up", slot: "youtube-banner", status: "open", reason: "made up", at: new Date(NOW - 2 * 86400000).toISOString(), by: "Luke", owner: "Laura" }] });
  await call(d, "profile_jobs", { bot: "Laura" });
  assert.equal((await S.listMessages(d, NOW)).filter((m) => m.to === "Luke").length, 0, "the list never asks");
  assert.equal((await P.profileAlerts(d, NOW, R)).asked, true);
  assert.equal((await P.profileAlerts(d, NOW + 60000, R)).asked, false);
  const src = await import("node:fs").then((fs) => fs.readFileSync(new URL("../netlify/functions/pushhourly.mjs", import.meta.url), "utf8"));
  assert.match(src, /profileAlerts\(store, now/);
});

/* bug 9: netlify.toml named an edge file that does not exist */
test("every edge or function file netlify.toml names exists", async () => {
  const fs = await import("node:fs");
  const toml = fs.readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");
  const named = [...toml.matchAll(/netlify\/(?:edge-)?functions\/\s+([a-z0-9-]+\.(?:js|mjs))/g)].map((m) => m[1]);
  assert.ok(named.includes("song-geo.js"));
  const files = new Set([...fs.readdirSync(new URL("../netlify/edge-functions/", import.meta.url)), ...fs.readdirSync(new URL("../netlify/functions/", import.meta.url))]);
  for (const f of named) assert.ok(files.has(f), `netlify.toml names ${f}, which is not in netlify/`);
});

/* bug 1: at 03:20 São Paulo on 18 Nov the phone said "1 need you · 11 at risk" and "0 need you · nothing at risk"
   on one screen, over a Verse lyrics approval, and needs_you said open: 0. Now there is one count. */
const QUIET = Date.parse("2026-11-18T06:20:00Z"); /* 03:20 São Paulo */
async function lyricsAsk(d, now) {
  return (await S.sendMessage(d, now, R, { from: "Verse", to: "Luke", needs: "decision", options: ["Yes, correct", "Not yet"], text: "Are these the final lyrics for the made-up song?" })).message;
}
test("Luke's 03:20 screen: one lyrics approval and no cards is 1 need you, everywhere", async () => {
  const d = memoryDesk();
  const m = await lyricsAsk(d, QUIET - 3600000);
  const desk = await needsDesk(d, QUIET, {});
  const server = C.needsCount(desk, S.spDay(QUIET), QUIET);
  assert.equal(server.total, 1);
  assert.equal(server.line, "1 need you");
  assert.deepEqual(server.byKind, { decision: 1 });
  const phone = V.needTotal({ messages: [m], auto: await C.boardAuto(d, QUIET, desk), healthNeeds: [] });
  assert.equal(phone.total, server.total);
  assert.equal(V.homePulse({ need: server.total, risk: 11 }).line, "1 need you · 11 to check");
  const tool = await call(d, "needs_you", { bot: "Nova" }, { now: QUIET });
  assert.equal(tool.total, 1);
  assert.equal(tool.line, "1 need you");
  assert.equal(tool.open, tool.total, "open is the same count as the cards");
  assert.equal(tool.waiting.length, 1);
  assert.equal(tool.waiting[0].kind, "decision");
  assert.equal(tool.waiting[0].what, "Verse asked you to decide something");
  assert.equal(tool.quiet_hours, true);
});

test("one list: messages, Spotify questions, cards (held ones too) and red accounts; the phone's rule agrees", async () => {
  const d = memoryDesk();
  const m = await lyricsAsk(d, NOW - 3600000);
  const other = (await S.sendMessage(d, NOW, R, { from: "Kevin", to: "Luke", needs: "reply", text: "A made-up question" })).message;
  const pay = await C.saveCard(d, NOW, R, { by: "Ledger", kind: "payment", text: "Pay the made-up studio 12.", dedupe_key: "p-1", action: "pay it", amount: 12, currency: "USD", recipient: "Made Up Studio" });
  const note = await C.saveCard(d, NOW, R, { by: "Nova", kind: "message", text: "Send the made-up note.", dedupe_key: "n-1", action: "send it" });
  const report = { accounts: [{ id: "ig", label: "Instagram", state: "red" }, { id: "yt", label: "YouTube", state: "watch" }], connection: { state: "down", text: "made up" } };
  await import("../js/hq-lib.js");
  for (const now of [NOW, QUIET]) {
    const desk = await needsDesk(d, now, { report });
    const server = C.needsCount(desk, S.spDay(now), now);
    assert.equal(server.total, 2 + 2 + 2, "2 messages, 2 cards (one held at night), Instagram red + the connection down");
    const auto = await C.boardAuto(d, now, desk);
    const phone = V.needTotal({ messages: [m, other], auto, healthNeeds: globalThis.HQLib.accountHealthHome(report).needs });
    assert.equal(phone.total, server.total, "the phone's fallback says the same number");
    for (const x of server.items) assert.equal(/12|Studio|made-up/i.test(x.text), false, "lock-screen text never carries an amount, a payee or the message: " + x.text);
  }
  const tool = await call(d, "needs_you", { bot: "Nova" });
  assert.equal(tool.total, 4, "the tool reads the real desk: 2 messages + 2 cards (no red account on this desk)");
  assert.equal(tool.open, tool.total);
});

test("the app badge, Today's line and the push alerts count the same list", async () => {
  const { pushApi } = await import("../netlify/lib/push-api.mjs");
  const d = memoryDesk();
  await lyricsAsk(d, NOW - 3600000);
  await C.saveCard(d, NOW, R, { by: "Nova", kind: "message", text: "Send the made-up note.", dedupe_key: "n-2", action: "send it" });
  const res = await pushApi(new Request("https://badscandal.com/api/hq/push/waiting"), { store: () => d, now: NOW });
  const body = await res.json();
  assert.equal(body.count, 2, "a decision and a card");
  assert.deepEqual(body.items.map((x) => x.kind).sort(), ["card", "message"]);
  const sample = await (await pushApi(new Request("https://badscandal.com/api/hq/push/waiting?sample=1"), { store: () => { throw new Error("no store in the sample"); }, now: NOW })).json();
  assert.equal(sample.sample, true);
  assert.ok(sample.count >= 1);
});

test("the phone no longer draws a second need-you line, and the briefing calls alerts to check", async () => {
  const fs = await import("node:fs");
  const phone = fs.readFileSync(new URL("../js/hq-phone.js", import.meta.url), "utf8");
  assert.equal(/esc\(auto\.header\)/.test(phone), false, "the BADSCANDAL phone shows the count once, in the pulse");
  assert.match(phone, /board\.needs\.total/);
  await import("../js/hq-lib.js");
  const b = globalThis.HQLib.briefing({ sheet: null, ov: null, attention: [{}, {}] });
  assert.equal(b[b.length - 1], "2 things to check below.");
});

/* bug 2: account health called Spotify's tracks "posts" */
test("Spotify's reach line talks about tracks, TikTok's still about posts", async () => {
  const { evaluate } = await import("../netlify/lib/account-health.mjs");
  const DAY = 86400000;
  const day = (n) => new Date(Date.parse("2026-11-18T12:00:00Z") - n * DAY).toISOString().slice(0, 10);
  const pts = [[1, 200], [2, 250], [3, 180], [5, 2000], [7, 2000], [9, 2000], [12, 2000], [16, 2000], [20, 2000]].map(([n, v]) => ({ at: day(n), views: String(v) }));
  const reach = (platform, by) => evaluate({ now: NOW, checks: [{ type: "reading", platform, date: day(1), by, posts: pts }] }).accounts.find((a) => a.id === platform).signals.find((x) => x.id === "reach");
  const spotify = reach("spotify", "Atlas");
  assert.equal(spotify.level, "red");
  assert.match(spotify.text, /^The last 3 tracks are each under 30%/);
  assert.equal(/\bposts?\b/.test(spotify.text + spotify.source), false, spotify.text + " / " + spotify.source);
  assert.equal(spotify.source, "tracks Atlas recorded");
  const few = evaluate({ now: NOW, checks: [{ type: "reading", platform: "spotify", date: day(1), by: "Atlas", posts: pts.slice(0, 2) }] }).accounts.find((a) => a.id === "spotify").signals.find((x) => x.id === "reach");
  assert.match(few.text, /2 tracks with a view or reach number/);
  const tiktok = reach("tiktok", "Kevin");
  assert.match(tiktok.text, /^The last 3 posts are each under 30%/);
  assert.equal(tiktok.source, "posts the bot recorded");
});

test("account_health reads what the board reads (the stored Instagram copy too), so the tool and the phone agree", async () => {
  const { loadReport } = await import("../netlify/lib/account-health.mjs");
  const d = memoryDesk(), ig = memoryDesk(), asked = [];
  const get = ig.get.bind(ig);
  ig.get = async (k, o) => { asked.push(k); return get(k, o); };
  await ig.setJSON("posts.json", []);
  const tool = await call(d, "account_health", { bot: "Nova" }, { ctx: { ig: () => ig } });
  assert.ok(asked.includes("posts.json"), "the tool opened the stored Instagram posts");
  assert.equal(asked.includes("adposts.json"), false, "health no longer reads the ad list: boosted reels stay in the engagement comparison");
  const board = await loadReport({ store: d, ig, now: NOW, claims: { items: [] }, builds: [] });
  assert.deepEqual(tool.accounts.map((a) => [a.id, a.state]), board.accounts.map((a) => [a.id, a.state]));
});

test("a partial read keeps the real reading time for Read by, and the answered list sees ids", async () => {
  const d = memoryDesk();
  await inbox(d, 25);
  await call(d, "read_messages", { bot: "Kevin" });
  const read = await S.readState(d, "Kevin");
  assert.ok(read.also.length === 20);
  const r = await d.get("read/kevin.json", { type: "json" });
  assert.equal(r.readAt, new Date(NOW).toISOString(), "when the reading happened");
  const all = await S.listMessages(d, NOW);
  const handed = all.find((m) => read.also.includes(m.id));
  const seen = S.seenBy({ Kevin: r }, "Kevin", handed.at, handed.id);
  assert.equal(seen.seen, true);
  assert.ok(seen.seenAt >= handed.at, "Read by is never earlier than the message");
});

test("the default read_messages view holds what my_day would hand over (about you, answers to yours)", async () => {
  const d = memoryDesk();
  const mine = (await S.sendMessage(d, NOW - 600000, R, { from: "Kevin", to: "Steve", needs: "reply", text: "Made-up question" })).message;
  await S.sendMessage(d, NOW - 300000, R, { from: "Steve", to: "Nova", needs: "none", about: "Kevin", text: "A made-up note about Kevin" });
  await S.sendMessage(d, NOW - 200000, R, { from: "Steve", to: "Kevin", needs: "none", re: mine.id, text: "A made-up answer" });
  const got = await call(d, "read_messages", { bot: "Kevin" });
  assert.ok(got.messages.some((m) => m.about === "Kevin"));
  assert.equal(got.still_unread, undefined);
  assert.equal((await call(d, "read_messages", { bot: "Kevin", count_only: true })).count, 0);
});

test("a release saved with the old step name 'Approved by RouteNote (nothing waiting)' is renamed quietly", async () => {
  const d = memoryDesk();
  await S.saveRelease(d, NOW, R, { by: "Luke", title: "Made Up Song", date: "2026-12-18", pack: { kind: "Self-release", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", language: "English", explicit: "no", genre: "Dance", writers: "Made Up Writer", copyright: "℗ 2026 Made Up" } });
  await S.sendRelease(d, NOW, R, { by: "Luke", id: "madeupsong" });
  await S.mutate(d, "releases.json", [], (list) => { list[0].steps.find((x) => x.key === "approved").label = "Approved by RouteNote (nothing waiting)"; const n = list[0].log.length; return { value: n }; });
  const logBefore = (await S.listReleases(d))[0].log.length;
  await S.upgradeReleases(d, NOW + 60000);
  const r = (await S.listReleases(d))[0];
  assert.equal(r.steps.find((x) => x.key === "approved").label, "Approved by RouteNote");
  assert.equal(r.log.length, logBefore, "no log line for a rename");
});

test("the one-pitch skip line reads as a sentence on Luke's card", () => {
  const v = { status: "scheduled", date: "2026-11-27", steps: [{ key: "pitch", status: "skipped", rule: "one-pitch", note: "Not pitched: Made Up (out Tue 24 Nov) is the song pitched in these two weeks, and Spotify takes one pitch at a time (Luke, 16 Nov 2026)" }] };
  const p = S.pitchOf ? S.pitchOf(v, "2026-11-18") : null;
  if (p) assert.equal(p.line, "Pitch: not this time. Made Up (out Tue 24 Nov) has the pitch for these two weeks, and Spotify takes one pitch at a time.");
});

test("Needs you: no platform stat blocks and no 'RouteNote email: not connected' card (18 Nov 2026, Luke)", async () => {
  const fs = await import("node:fs");
  const phone = fs.readFileSync(new URL("../js/hq-phone.js", import.meta.url), "utf8");
  assert.equal(/V\.platformKpis\(/.test(phone), false, "the platform numbers live on Growth & Fans");
  await import("../js/hq-lib.js");
  const L = globalThis.HQLib;
  assert.deepEqual(L.phoneWatchers({ mail: { connected: false }, waiting: { luke: [] } }), []);
  const growth = fs.readFileSync(new URL("../js/hq-growth.js", import.meta.url), "utf8");
  assert.match(growth, /Views 7d/);
  assert.match(growth, /Account status/);
  assert.equal(/Account health/.test(growth), false, "the engagement dot is not called account health");
  const staff = fs.readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8");
  assert.equal(/RouteNote email is not connected yet/.test(staff), false);
});
