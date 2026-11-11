/* The Ads Tracker sheet feed + Meta key health + /hq's "Meta from Meta" rule (11 Nov 2026).
   The feed endpoint runs for real: @netlify/blobs is an in-memory fake and fetch is stubbed, so no
   network, no Meta and no Netlify are needed. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { ADS_HEAD, adsRows, cell, csv, DAILY_HEAD, dailyRows, feedRange, keyOk } from "../netlify/lib/feed.mjs";
import { keyHealth, readMeta, KEY_HEALTH } from "../netlify/lib/metaread.mjs";
import { fetchInsights, landingPageViews } from "../netlify/lib/metaspend.mjs";
import { hqModel, metaSpend } from "../netlify/lib/hq.mjs";
import { eventKey } from "../netlify/lib/stats.mjs";

/* ---------- a fake Blobs (shared by every store name) + Netlify env ---------- */
globalThis.__blobs = new Map();
const FAKE_BLOBS = `const S = globalThis.__blobs;
const store = (name) => { const m = S.get(name) || (S.set(name, new Map()), S.get(name));
  return { get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    set: async (k, v) => { m.set(k, String(v)); },
    list: async ({ prefix }) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }) }; };
export const getStore = (n) => store(typeof n === "string" ? n : n.name); export const getDeployStore = getStore;`;
registerHooks({ resolve(spec, ctx, next) {
  if (spec === "@netlify/blobs") return { url: "data:text/javascript," + encodeURIComponent(FAKE_BLOBS), shortCircuit: true };
  return next(spec, ctx);
} });
const ENV = {};
globalThis.Netlify = { env: { get: (k) => ENV[k] } };
let metaAnswer = () => new Response('{"data":[]}', { status: 200 });
const metaCalls = [];
globalThis.fetch = async (url, init) => { metaCalls.push({ url: String(url), init }); return metaAnswer(String(url)); };
const { default: feed } = await import("../netlify/functions/feed.mjs");
const KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6";
const get = (path, q = "?key=" + KEY) => feed(new Request("https://badscandal.com" + path + q), { deploy: { context: "production" } });
const reset = () => { globalThis.__blobs.clear(); metaCalls.length = 0; };

/* ---------- the range: 1st of last month .. yesterday, Dublin ---------- */
test("feed range: the 1st of last month up to yesterday in Dublin (finished days only)", () => {
  /* November: Dublin is on UTC. 23:30 UTC on the 11th is still the 11th -> yesterday = the 10th */
  assert.deepEqual(feedRange(Date.parse("2026-11-11T23:30:00Z")), { since: "2026-10-01", until: "2026-11-10" });
  assert.deepEqual(feedRange(Date.parse("2026-11-12T00:05:00Z")), { since: "2026-10-01", until: "2026-11-11" });
  /* July: Dublin is UTC+1. 23:30 UTC on 1 Jul is already 2 Jul in Dublin -> yesterday = 1 Jul */
  assert.deepEqual(feedRange(Date.parse("2026-07-01T23:30:00Z")), { since: "2026-06-01", until: "2026-07-01" });
  assert.deepEqual(feedRange(Date.parse("2026-07-01T22:30:00Z")), { since: "2026-06-01", until: "2026-06-30" });
  /* new year: last month is December of the year before; the 1st of a month -> yesterday is last month */
  assert.deepEqual(feedRange(Date.parse("2027-01-01T10:00:00Z")), { since: "2026-12-01", until: "2026-12-31" });
  assert.deepEqual(feedRange(Date.parse("2026-12-01T10:00:00Z")), { since: "2026-11-01", until: "2026-11-30" });
});

/* ---------- the CSV shapes ---------- */
test("meta-daily.csv: one row per calendar day, whole account, 0.00 for a day Meta reports nothing for", () => {
  const rows = [{ day: "2026-11-01", spend: 40.5, currency: "USD" }, { day: "2026-11-03", spend: 12, currency: "USD" }, { day: "2026-11-03", spend: 0.334, currency: "USD" }];
  const out = csv(DAILY_HEAD, dailyRows(rows, "2026-11-01", "2026-11-04"));
  assert.equal(out, "date,platform,campaign,spend,currency\r\n" +
    "2026-11-01,Meta,ALL (account),40.50,USD\r\n2026-11-02,Meta,ALL (account),0.00,USD\r\n" +
    "2026-11-03,Meta,ALL (account),12.33,USD\r\n2026-11-04,Meta,ALL (account),0.00,USD\r\n");
  assert.equal(dailyRows([], "2026-10-01", "2026-10-31").length, 31, "every day, even with no spend at all");
});

test("meta-ads.csv: columns, song matching, people-only taps per ad per day, cost per tap empty at 0 taps", () => {
  assert.deepEqual(ADS_HEAD, ["date", "campaign", "ad_set", "ad", "song", "spend", "currency", "impressions", "reach", "link_clicks", "landing_page_views", "spotify_taps", "cost_per_tap"]);
  const rows = [
    { day: "2026-11-02", campaign: "Touch Me BR", adset: "BR 18-34", ad: "TM BR - Coração", spend: 10, currency: "USD", impressions: 2000, reach: 1500, linkClicks: 40, lpv: 30 },
    { day: "2026-11-02", campaign: "Me Da Seu Body launch", adset: "BR", ad: "teaser, \"night\"", spend: 4.5, currency: "USD", impressions: 900, reach: 800, linkClicks: 9, lpv: 0 },
    { day: "2026-11-01", campaign: "Other", adset: "x", ad: "random", spend: 1, currency: "USD", impressions: null, reach: null, linkClicks: null, lpv: null },
  ];
  const songs = [{ id: "touchme", title: "Touch Me", tapsByAd: { tmbrcoracao: 4 } }, { id: "medaseubody", title: "Me Dá Seu Body", tapsByAd: {} }];
  const out = adsRows(rows, songs, { "2026-11-02|tmbrcoracao": 4 });
  assert.deepEqual(out[0], ["2026-11-01", "Other", "x", "random", "", "1.00", "USD", null, null, null, null, 0, ""]);
  assert.deepEqual(out[1], ["2026-11-02", "Me Da Seu Body launch", "BR", "teaser, \"night\"", "Me Dá Seu Body", "4.50", "USD", 900, 800, 9, 0, 0, ""], "nobody tapped from it yet: matched by the title in the campaign name");
  assert.equal(adsRows([{ ...rows[1], campaign: "MDSB launch" }], songs, {})[0][4], "", "no title in any name: not matched");
  assert.deepEqual(out[2], ["2026-11-02", "Touch Me BR", "BR 18-34", "TM BR - Coração", "Touch Me", "10.00", "USD", 2000, 1500, 40, 30, 4, "2.50"]);
  const text = csv(ADS_HEAD, out);
  assert.ok(text.includes('"teaser, ""night"""'), "commas and quotes are quoted");
  assert.ok(text.split("\r\n")[1].endsWith(",,,,,0,"), "unknown numbers are empty, never 0");
  assert.equal(cell(null), ""); assert.equal(cell("a\nb"), '"a\nb"');
  assert.equal(landingPageViews([{ action_type: "link_click", value: "9" }, { action_type: "landing_page_view", value: "7" }]), 7);
  assert.equal(landingPageViews([]), 0); assert.equal(landingPageViews(undefined), null);
});

test("Meta reader: ad level asks for impressions, reach, link clicks and actions; keeps landing page views", async () => {
  const calls = [];
  const fake = async (u, init) => { calls.push({ u, init }); return new Response(JSON.stringify({ data: [{ date_start: "2026-11-02", ad_name: "A", spend: "3.10", account_currency: "USD",
    impressions: "1200", reach: "1000", inline_link_clicks: "33", actions: [{ action_type: "landing_page_view", value: "21" }, { action_type: "video_view", value: "500" }] }] }), { status: 200 }); };
  const { rows } = await fetchInsights("SECRET", "1", "2026-11-01", "2026-11-02", fake);
  assert.deepEqual(rows[0], { day: "2026-11-02", ad: "A", adset: "", campaign: "", spend: 3.1, currency: "USD", impressions: 1200, reach: 1000, linkClicks: 33, lpv: 21 });
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer SECRET");
  assert.ok(!calls[0].u.includes("SECRET"));
  assert.match(new URL(calls[0].u).searchParams.get("fields"), /impressions,reach,inline_link_clicks,actions/);
});

/* ---------- the key in the address ---------- */
test("feed: wrong, missing or unset key -> a plain 404; nothing is asked of Meta", async () => {
  reset(); ENV.META_ADS_TOKEN = "SECRET";
  delete ENV.SHEET_FEED_KEY;
  assert.equal((await get("/api/feed/meta-daily.csv")).status, 404, "env unset: closed");
  ENV.SHEET_FEED_KEY = KEY;
  for (const q of ["", "?key=", "?key=wrong", "?key=" + KEY.slice(0, -1), "?key=" + KEY + "0", "?KEY=" + KEY]) {
    const r = await get("/api/feed/meta-daily.csv", q);
    assert.equal(r.status, 404, q);
    assert.equal(await r.text(), "Not found\n");
  }
  assert.equal((await get("/api/feed/other.csv")).status, 404, "unknown file");
  assert.equal(metaCalls.length, 0);
  assert.equal(await keyOk(KEY, KEY), true); assert.equal(await keyOk(KEY, ""), false); assert.equal(await keyOk(undefined, KEY), false);
});

test("feed: the right key gets the daily CSV (no-store), read-only GET, token in the header", async () => {
  reset(); ENV.SHEET_FEED_KEY = KEY; ENV.META_ADS_TOKEN = "SECRET";
  const { since, until } = feedRange();
  metaAnswer = () => new Response(JSON.stringify({ data: [{ date_start: since, spend: "7.00", account_currency: "USD" }] }), { status: 200 });
  const r = await get("/api/feed/meta-daily.csv");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /text\/csv/);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const lines = (await r.text()).trim().split("\r\n");
  assert.equal(lines[0], "date,platform,campaign,spend,currency");
  assert.equal(lines[1], since + ",Meta,ALL (account),7.00,USD");
  assert.equal(lines[lines.length - 1].slice(0, 10), until, "ends yesterday");
  assert.equal(metaCalls.length, 1);
  assert.equal(metaCalls[0].init.method, "GET");
  assert.ok(!metaCalls[0].url.includes("SECRET") && !metaCalls[0].url.includes(KEY));
  assert.equal(new URL(metaCalls[0].url).searchParams.get("level"), "account");
  await get("/api/feed/meta-daily.csv");
  assert.equal(metaCalls.length, 1, "the second call within the hour comes from meta-cache");
});

test("feed: Meta's error -> 502 and one plain scrubbed line, never rows of zeros; code 190 = key expired", async () => {
  reset(); ENV.SHEET_FEED_KEY = KEY; ENV.META_ADS_TOKEN = "EAABwzLixnjYBO1234567890abc";
  metaAnswer = () => new Response(JSON.stringify({ error: { message: "Error validating access token: Session has expired EAABwzLixnjYBO1234567890abc", code: 190 } }), { status: 400 });
  for (const f of ["meta-daily.csv", "meta-ads.csv"]) {
    reset();
    const r = await get("/api/feed/" + f);
    assert.equal(r.status, 502);
    const body = await r.text();
    assert.equal(body.trim().split("\n").length, 1, "one line");
    assert.match(body, /^Meta error: Error validating access token/);
    assert.ok(!body.includes("EAABwz") && !body.includes("0.00"), body);
  }
  const health = JSON.parse(globalThis.__blobs.get("meta-cache").get(KEY_HEALTH));
  assert.equal(health.ok, false); assert.equal(health.code, 190);
  assert.equal(keyHealth(health, true).text, "The Meta key has expired: make a new one");
});

test("feed: meta-ads.csv counts only people's Spotify taps for that ad and day", async () => {
  reset(); ENV.SHEET_FEED_KEY = KEY; ENV.META_ADS_TOKEN = "SECRET";
  const { until } = feedRange();
  const ts = Date.parse(until + "T15:00:00Z"); /* noon in São Paulo, inside the same day */
  const st = globalThis.__blobs.get("stats") || (globalThis.__blobs.set("stats", new Map()), globalThis.__blobs.get("stats"));
  const base = { page: "touchme", src: "meta", country: "br", campaign: "br", content: "tm-br-vocal", app: "instagram", os: "ios", device: "mobile", browser: "webview" };
  const person = (n, extra = {}) => {
    const b = { ...base, visitor: "v" + n, pv: "p" + n, ...extra };
    st.set(eventKey({ ...b, type: "view", ms: 300 }, ts + n * 1000, "a" + n), "");
    if (!extra.bot) st.set(eventKey({ ...b, type: "act", target: "touch", ms: 900 }, ts + n * 1000 + 500, "b" + n), "");
    st.set(eventKey({ ...b, type: "click", target: "spotify", ms: 4000 }, ts + n * 1000 + 3000, "c" + n), "");
  };
  person(1); person(2); person(3, { bot: "dc-meta" }); /* the scanner's tap is not a person's */
  metaAnswer = () => new Response(JSON.stringify({ data: [{ date_start: until, ad_name: "TM BR - vocal", adset_name: "BR 18-34", campaign_name: "Touch Me BR", spend: "9.00", account_currency: "USD",
    impressions: "1000", reach: "800", inline_link_clicks: "20", actions: [{ action_type: "landing_page_view", value: "12" }] }] }), { status: 200 });
  const r = await get("/api/feed/meta-ads.csv");
  assert.equal(r.status, 200);
  const lines = (await r.text()).trim().split("\r\n");
  assert.equal(lines[0], ADS_HEAD.join(","));
  assert.equal(lines[1], until + ",Touch Me BR,BR 18-34,TM BR - vocal,Touch Me,9.00,USD,1000,800,20,12,2,4.50");
});

/* ---------- key health ---------- */
test("key health: reading OK with the age, expired on code 190, plain error otherwise", async () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  assert.equal(keyHealth({ ok: true, at: now - 12 * 60000 }, true, now).text, "Meta key: reading OK, last read 12 min ago");
  assert.equal(keyHealth({ ok: false, at: now, code: 190, error: "x" }, true, now).state, "expired");
  assert.equal(keyHealth({ ok: false, at: now, code: 4, error: "Too many calls (HTTP 400, code 4)", lastOk: now - 3600000 }, true, now).text,
    "Meta key: couldn't read (Too many calls (HTTP 400, code 4)), last good read 1 h ago");
  assert.equal(keyHealth(null, false).state, "off");
  /* readMeta: a cache hit doesn't touch the health record; a real read does */
  const m = new Map(); const cache = { get: async (k) => (m.has(k) ? m.get(k) : null), setJSON: async (k, v) => { m.set(k, v); } };
  let n = 0; const ok = async () => { n++; return new Response('{"data":[{"date_start":"2026-11-10","spend":"5","account_currency":"USD"}]}', { status: 200 }); };
  await readMeta({ cache, token: "t", account: "1", since: "2026-11-01", until: "2026-11-10", level: "account", key: "k", fetchImpl: ok, now });
  await readMeta({ cache, token: "t", account: "1", since: "2026-11-01", until: "2026-11-10", level: "account", key: "k", fetchImpl: ok, now: now + 60000 });
  assert.equal(n, 1); assert.equal(m.get(KEY_HEALTH).at, now);
  const bad = async () => new Response('{"error":{"message":"expired","code":190}}', { status: 400 });
  const r = await readMeta({ cache, token: "t", account: "1", since: "2026-11-01", until: "2026-11-10", level: "account", key: "k", fetchImpl: bad, now: now + 2 * 3600000 });
  assert.equal(r.code, 190); assert.equal(r.stale.rows.length, 1);
  assert.equal(m.get(KEY_HEALTH).lastOk, now, "the last good read is remembered");
});

/* ---------- /hq: Meta from Meta ---------- */
const SPEND = [["date", "platform", "campaign", "spend", "currency"],
  ["2026-11-08", "Meta", "x", "100.00", "USD"], ["2026-11-09", "Meta", "x", "50.00", "USD"], ["2026-11-10", "Meta", "x", "20.00", "USD"],
  ["2026-11-10", "TikTok", "y", "10", "EUR"], ["2026-11-09", "Google", "z", "5", "EUR"], ["2026-09-30", "Meta", "old", "999", "USD"]];
const FX = { "2026-11": { USD: 1.12 }, "2026-10": { USD: 1.12 }, "2026-09": { USD: 1.12 } };

test("/hq: when the Meta read works, Meta's part of the cap and Money comes from Meta, Google/TikTok from the sheet", () => {
  const meta = { ok: true, since: "2026-10-01", until: "2026-11-11", rows: [{ day: "2026-11-08", spend: 100.4, currency: "USD" }, { day: "2026-11-09", spend: 61, currency: "USD" }, { day: "2026-11-11", spend: 3, currency: "USD" }] };
  const m = hqModel({ Spend: SPEND }, "2026-11-11", FX, meta).money;
  assert.equal(m.cap.native.USD, 164.4, "100.40 + 61 + 3 from Meta; the sheet's 170 is not used");
  assert.equal(m.cap.spent, Math.round((164.4 + 15 * 1.12) * 100) / 100, "+ TikTok and Google (EUR) from the sheet");
  assert.equal(m.metaSource.from, "meta"); assert.equal(m.metaSource.total, 164.4);
  /* differences over 1.00 are listed ("sheet says X"); 0.40 is not */
  assert.deepEqual(m.metaSource.mismatch, [{ d: "2026-11-09", meta: 61, sheet: 50, currency: "USD" }, { d: "2026-11-10", meta: 0, sheet: 20, currency: "USD" }]);
  const sep = m.months.find((x) => x.month === "2026-09");
  assert.deepEqual(sep.spend, { Meta: { USD: 999 } }, "days before the read range keep the sheet's rows");
  assert.deepEqual(m.months.find((x) => x.month === "2026-11").spend.Meta, { USD: 164.4 });
});

test("/hq: when the Meta read fails, the sheet's Meta rows stay and the reason is passed on", () => {
  const m = hqModel({ Spend: SPEND }, "2026-11-11", FX, { ok: false, reason: "The Meta key has expired (HTTP 400, code 190)", expired: true }).money;
  assert.equal(m.cap.native.USD, 170);
  assert.deepEqual(m.metaSource, { from: "sheet", reason: "The Meta key has expired (HTTP 400, code 190)", expired: true });
  assert.equal(hqModel({ Spend: SPEND }, "2026-11-11", FX).money.metaSource, null, "no Meta argument (sample): nothing to say");
  assert.equal(metaSpend([], { ok: true, rows: [], since: "2026-10-01", until: "2026-11-11" }).source.mismatch.length, 0);
});
