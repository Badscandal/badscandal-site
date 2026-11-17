/* L6 (17 Nov 2026, Webmaster's #15): one tile per song page: is it live, what the button does, people and Spotify
   taps, whether Meta is receiving THIS page's events, and the home card. Made-up numbers only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { healthKey, parseHealthKey, pageOf } from "../netlify/lib/capi.mjs";
import { pageHealth } from "../netlify/lib/admin.mjs";
import * as S from "../netlify/lib/staff.mjs";

await import("../js/hq-lib.js");
const L = globalThis.HQLib;
const NOW = Date.parse("2026-11-17T15:00:00Z"), MIN = 60000;

test("Meta's health record carries the page; old records (no page) still read", () => {
  const k = healthKey({ events: "sc", sent: 1, received: 1, result: "ok", page: "touchme" }, NOW, "abc");
  assert.equal(k.split("/").length, 10);
  assert.equal(parseHealthKey(k).page, "touchme");
  const old = healthKey({ events: "sc", sent: 1, received: 1, result: "ok" }, NOW, "abc");
  assert.equal(old.split("/").length, 9, "a record without a page is written exactly as before");
  assert.equal(parseHealthKey(old).page || "", "");
  assert.equal(pageOf({ url: "https://badscandal.com/touchme?utm_source=meta" }), "touchme");
  assert.equal(pageOf({ url: "https://badscandal.com/nothere" }), "");
  assert.equal(pageOf({}), "");
});
test("pageHealth: per page, in the range: sends, refusals, bots blocked, the last good one and the last error", () => {
  const day = "2026-11-17";
  const h = (o, ts) => parseHealthKey(healthKey(o, ts, "x" + ts));
  const list = [h({ events: "pv.vc", sent: 2, received: 2, result: "ok", page: "touchme" }, NOW - 50 * MIN),
    h({ events: "sc", sent: 1, received: 1, result: "ok", page: "touchme" }, NOW - 10 * MIN),
    h({ events: "sc", sent: 1, result: "error", detail: "http-400", page: "loveyou" }, NOW - 5 * MIN),
    h({ events: "sc", sent: 0, result: "blocked", detail: "ua", page: "loveyou" }, NOW - 4 * MIN),
    h({ events: "sc", sent: 1, received: 1, result: "ok" }, NOW - 3 * MIN), /* old record: no page */
    h({ events: "sc", sent: 1, received: 1, result: "ok", page: "touchme" }, NOW - 3 * 86400000)]; /* out of range */
  const p = pageHealth(list, [day]);
  assert.deepEqual(p.touchme, { sends: 2, errors: 0, blocked: 0, lastOk: NOW - 10 * MIN, lastError: null });
  assert.deepEqual(p.loveyou, { sends: 1, errors: 1, blocked: 1, lastOk: null, lastError: { ts: NOW - 5 * MIN, detail: "http-400" } });
  assert.equal(p[""], undefined, "records without a page are not given to any page");
});

const song = (o) => ({ id: "touchme", title: "Touch Me", date: "2026-10-30", path: "/touchme", visits: 40, people: 30, taps: 9, track: true,
  health: { sends: 12, errors: 0, blocked: 2, lastOk: NOW - 7 * MIN, lastError: null }, ...o });
const card = { now: { slug: "touchme", title: "Touch Me" }, due: { slug: "touchme", title: "Touch Me", why: "Touch Me came out…" } };
const line = (t, label) => (t.lines.find((x) => x.label === label) || {});
test("songTile: a released page doing its job is all green", () => {
  const t = L.songTile(song(), { today: "2026-11-17", now: NOW, card, builds: [] });
  assert.equal(t.address, "badscandal.com/touchme"); assert.equal(t.tone, "ok");
  assert.equal(line(t, "Page").text, "Live");
  assert.equal(line(t, "Button").text, "Listen on Spotify: goes to the track");
  assert.equal(line(t, "Visitors").text, "30 people · 9 Spotify taps (30%)");
  assert.equal(line(t, "Meta").text, "Receiving this page's events · last 7 min ago");
  assert.equal(line(t, "Home card").text, "On the home card");
});
test("songTile: what goes wrong is said, in red or amber", () => {
  const out = L.songTile(song({ track: false, people: 0, visits: 0, taps: 0, health: { sends: 4, errors: 2, blocked: 0, lastOk: NOW - 90 * MIN, lastError: { ts: NOW - 20 * MIN, detail: "http-400-code-100" } } }),
    { today: "2026-11-17", now: NOW, card: { now: { slug: "loveyou", title: "Love You" }, due: { slug: "touchme", title: "Touch Me", why: "Touch Me came out Fri 30 Oct" } },
      builds: [{ slug: "touchme", state: "not done: GitHub's build stopped at \"Make the page\": the cover could not be read", asked: "2026-11-17 10:00" }] });
  assert.equal(out.tone, "bad");
  assert.equal(line(out, "Page").tone, "bad"); assert.match(line(out, "Page").text, /^The last change didn't go live: GitHub's build stopped/);
  assert.equal(line(out, "Button").tone, "bad"); assert.equal(line(out, "Button").text, "Out since Fri 30 Oct, but there's no Spotify track link yet: the button goes to the artist profile");
  assert.equal(line(out, "Visitors").text, "No visits in this range");
  assert.equal(line(out, "Meta").tone, "bad"); assert.equal(line(out, "Meta").text, "Meta refused 2 of 4 sends in this range (last: http-400-code-100, 20 min ago)");
  assert.equal(line(out, "Home card").tone, "warn"); assert.equal(line(out, "Home card").text, "Should be on the home card now (Touch Me came out Fri 30 Oct); Love You is there");
});
test("songTile: before release, waiting builds, no Meta events, and a card the rule has moved on from", () => {
  const t = L.songTile(song({ id: "loveyou", title: "Love You", date: "2026-11-27", track: false, health: null }),
    { today: "2026-11-17", now: NOW, card: { now: { slug: "loveyou", title: "Love You" }, due: { slug: "medaseubody", title: "Me Dá Seu Body", why: "" } },
      builds: [{ slug: "loveyou", state: "waiting on Luke", asked: "2026-11-17 09:00" }, { slug: "loveyou", state: "live", asked: "2026-11-10 09:00" }] });
  assert.equal(line(t, "Page").text, "Live · a change is waiting on your yes"); assert.equal(line(t, "Page").tone, "warn");
  assert.equal(line(t, "Button").text, "Follow on Spotify, with the countdown to Fri 27 Nov"); assert.equal(line(t, "Button").tone, "ok");
  assert.equal(line(t, "Meta").text, "No Meta events in this range"); assert.equal(line(t, "Meta").tone, "");
  assert.equal(line(t, "Home card").text, "On the home card, but the rule says Me Dá Seu Body now"); assert.equal(line(t, "Home card").tone, "warn");
  const g = L.songTile(song({ id: "x", title: "X" }), { today: "2026-11-17", now: NOW, card, builds: [{ slug: "x", state: "sent to GitHub 11-17 10:00: not live yet" }] });
  assert.equal(line(g, "Page").text, "Going live: sent to GitHub 11-17 10:00: not live yet");
  assert.equal(line(g, "Home card").text, undefined, "not on the card and not due: no line");
});
test("songPages hands each request's page slug (the tile matches on it)", async () => {
  const src = readFileSync(new URL("../netlify/lib/staff.mjs", import.meta.url), "utf8");
  assert.match(src, /address: `badscandal\.com\/\$\{p\.slug\}`, slug: p\.slug,/);
  assert.ok(typeof S.songPages === "function");
});
test("the board carries pageBuilds; overview carries track, health and the home card; HQ draws the tiles", () => {
  const fn = readFileSync(new URL("../netlify/functions/staff.mjs", import.meta.url), "utf8");
  assert.match(fn, /const pageBuilds = await S\.songPages\(st\.desk, now\)/); assert.match(fn, /pageBuilds, hqRead/);
  const adm = readFileSync(new URL("../netlify/functions/admin.mjs", import.meta.url), "utf8");
  assert.match(adm, /track: !!l\.track/); assert.match(adm, /homeCard: \{ now: homeCardNow\(\), due: homeCardSong\(/);
  const cf = readFileSync(new URL("../netlify/functions/capi.mjs", import.meta.url), "utf8");
  assert.match(cf, /const page = pageOf\(body\);/);
  const html = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  assert.ok(html.indexOf('id="songTiles"') > html.indexOf('id="pages"'), "the tiles open the Pages tab");
  assert.match(readFileSync(new URL("../js/hq.js", import.meta.url), "utf8"), /function drawSongTiles\(/);
});
