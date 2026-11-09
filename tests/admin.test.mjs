import { test } from "node:test";
import assert from "node:assert/strict";
import { adLabel, adOf, compact, dashboard, healthSummary, mergeSummary, resolveRange, spDay, summarize, toCSV, utcDaysFor, visitLog } from "../netlify/lib/admin.mjs";
import { healthKey, parseHealthKey, readMetaAnswer } from "../netlify/lib/capi.mjs";
import { checkPassword, makeSession, readCookie, verifySession } from "../netlify/lib/session.mjs";
import { eventKey, parseKey } from "../netlify/lib/stats.mjs";
import { parseUA } from "../netlify/lib/ua.mjs";
import { needsConsent } from "../netlify/lib/geo.mjs";

const SECRET = "correct horse battery staple";
const T = Date.parse("2026-11-09T15:00:00Z"); /* 12:00 in São Paulo */

/* ---------- login ---------- */

test("password check: right one passes, wrong / empty / missing secret fail", async () => {
  assert.equal(await checkPassword(SECRET, SECRET), true);
  assert.equal(await checkPassword("correct horse battery stapl", SECRET), false);
  assert.equal(await checkPassword("", SECRET), false);
  assert.equal(await checkPassword(SECRET, ""), false);
  assert.equal(await checkPassword(undefined, SECRET), false);
});

test("session cookie: valid for 30 days, then dead; tampering and other secrets rejected", async () => {
  const s = await makeSession(SECRET, T);
  assert.equal(await verifySession(s, SECRET, T + 1000), true);
  assert.equal(await verifySession(s, SECRET, T + 29 * 86400000), true);
  assert.equal(await verifySession(s, SECRET, T + 31 * 86400000), false);
  assert.equal(await verifySession(s, "a different password", T + 1000), false);
  const [exp, sig] = s.split(".");
  assert.equal(await verifySession(String(Number(exp) + 86400000 * 365) + "." + sig, SECRET, T), false);
  assert.equal(await verifySession(exp + "." + sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A"), SECRET, T), false);
  assert.equal(await verifySession("", SECRET, T), false);
});

test("readCookie finds our cookie among others", () => {
  assert.equal(readCookie("_fbp=fb.1.2.3; __Host-bs_admin=abc.def; x=1", "__Host-bs_admin"), "abc.def");
  assert.equal(readCookie("", "__Host-bs_admin"), "");
});

/* ---------- user agents + consent countries ---------- */

test("in-app browsers and devices are recognised", () => {
  const ig = parseUA("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 357.0.0.25.101 (iPhone15,2; iOS 18_1; pt_BR; pt; scale=3.00; 1179x2556)");
  assert.deepEqual(ig, { app: "instagram", os: "ios", device: "mobile", browser: "webview" });
  const fb = parseUA("Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]");
  assert.equal(fb.app, "facebook");
  assert.equal(fb.os, "android");
  assert.equal(fb.browser, "webview");
  const safari = parseUA("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1");
  assert.deepEqual(safari, { app: "-", os: "ios", device: "mobile", browser: "safari" });
  const mac = parseUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36");
  assert.deepEqual(mac, { app: "-", os: "macos", device: "desktop", browser: "chrome" });
});

test("consent countries: EU + EEA + UK yes, Brazil no", () => {
  for (const c of ["DE", "fr", "PL", "GB", "NO", "IE"]) assert.equal(needsConsent(c), true, c);
  for (const c of ["BR", "US", "MX", "", undefined]) assert.equal(needsConsent(c), false, String(c));
});

/* ---------- date ranges in São Paulo time ---------- */

test("ranges are São Paulo days, with the previous period right before", () => {
  const late = Date.parse("2026-11-10T02:30:00Z"); /* still 9 Nov in São Paulo */
  assert.equal(spDay(late), "2026-11-09");
  const r = resolveRange({ range: "7d" }, late);
  assert.deepEqual([r.days[0], r.days.at(-1), r.days.length], ["2026-11-03", "2026-11-09", 7]);
  assert.deepEqual([r.prev[0], r.prev.at(-1), r.prev.length], ["2026-10-27", "2026-11-02", 7]);
  assert.deepEqual(resolveRange({ range: "today" }, late).days, ["2026-11-09"]);
  const c = resolveRange({ range: "custom", from: "2026-11-01", to: "2027-01-01" }, late);
  assert.equal(c.days.at(-1), "2026-11-09", "custom ranges stop at today");
  assert.equal(resolveRange({ range: "custom", from: "bad", to: "x" }, late).days.length, 7);
  assert.deepEqual(utcDaysFor(["2026-11-09"]), ["2026-11-09", "2026-11-10"]);
});

/* ---------- the numbers ---------- */

function e(type, o, ts) {
  return parseKey(eventKey({
    type, page: "touchme", src: "meta", country: "br", city: "Recife", device: "mobile", os: "ios",
    browser: "webview", app: "instagram", campaign: "br", content: "vocal", ...o,
  }, ts, Math.random().toString(36).slice(2, 7)));
}

function sample() {
  return [
    e("view", { visitor: "a", pv: "p1", ms: 210 }, T),
    e("click", { visitor: "a", pv: "p1", target: "spotify", ms: 2400, meta: 1 }, T + 2400),
    e("click", { visitor: "a", pv: "p1", target: "spotify", ms: 2900, meta: 1 }, T + 2900), /* double tap */
    e("view", { visitor: "a", pv: "p2", ms: 180, ret: 1 }, T + 3600000),                     /* same person an hour later */
    e("act", { visitor: "a", pv: "p2", target: "touch", ms: 900 }, T + 3600900),             /* ...who touched the screen */
    e("view", { visitor: "b", pv: "p3", ms: 700, content: "escada", country: "de", city: "Berlin" }, T + 60000),
    e("click", { visitor: "b", pv: "p3", target: "apple", ms: 5000, content: "escada", country: "de" }, T + 65000),
    e("view", { visitor: "c", pv: "p4", ms: 250, content: "escada", country: "de", city: "Berlin" }, T + 120000),
    e("click", { visitor: "c", pv: "p4", target: "spotify", ms: 3100, meta: 0, content: "escada", country: "de" }, T + 123000),
    e("consent", { visitor: "c", pv: "p4", target: "no", country: "de" }, T + 121000),
    e("view", { visitor: "z", pv: "p9", page: "listen" }, T),                                   /* other page */
    e("act", { visitor: "z", pv: "p9", page: "listen", target: "touch" }, T),
    e("view", { visitor: "y", pv: "p8" }, T - 10 * 86400000),                                   /* other day */
    e("act", { visitor: "y", pv: "p8", target: "touch" }, T - 10 * 86400000),
  ];
}

test("funnel: visits, unique, Spotify taps (a double tap counts once), other stores", () => {
  const s = summarize(sample(), ["2026-11-09"], "touchme");
  assert.equal(s.visits, 4);
  assert.equal(s.unique, 3);
  assert.equal(s.taps, 2);
  assert.equal(s.tapUnique, 2);
  assert.deepEqual(s.stores, { spotify: 2, apple: 1 });
  assert.deepEqual(s.meta, { sent: 1, notSent: 1, yes: 0, no: 1 });
  assert.deepEqual(s.ads["ad|br|vocal"], { v: 2, t: 1 });
  assert.deepEqual(s.ads["ad|br|escada"], { v: 2, t: 1 });
  assert.deepEqual(s.countries.de, { v: 2, t: 1 });
  assert.equal(s.cities.de.berlin, 2);
  assert.deepEqual(s.speed.fast, { v: 3, t: 2 });
  assert.deepEqual(s.speed.slow, { v: 1, t: 0 });
  assert.equal(s.hours[12].v, 3); /* 12:00 São Paulo */
});

test("dashboard payload: CTR, previous period, ranked breakdowns", () => {
  const cur = summarize(sample(), ["2026-11-09"], "touchme");
  const prev = summarize(sample(), ["2026-10-30"], "touchme");
  const d = dashboard(cur, prev, ["2026-11-09"], "touchme");
  assert.equal(d.kpis.ctr, 0.5);
  assert.equal(d.kpis.ctrUnique, 2 / 3);
  assert.equal(d.kpis.prev.visits, 1);
  assert.equal(d.spark.unit, "hour");
  assert.equal(d.funnel.other, 1);
  assert.equal(d.byCountry[0].cc, "br");
  assert.equal(d.speed.median, 210);
  assert.equal(d.logTotal, 4);
});

test("visit log joins each visit to its taps, newest first; CSV is safe for spreadsheets", () => {
  const s = summarize(sample(), ["2026-11-09"], "touchme");
  const log = visitLog(s);
  assert.equal(log[0].visitor, "a");
  assert.equal(log[0].returning, true);
  assert.equal(log[0].spotify, false);
  const first = log.find((r) => r.ts === T);
  assert.equal(first.spotify, true);
  assert.equal(first.tapMs, 2400);
  assert.equal(first.meta, true);
  assert.equal(first.time, "2026-11-09 12:00:00");
  const b = log.find((r) => r.visitor === "b");
  assert.deepEqual(b.other, ["apple"]);
  assert.equal(b.spotify, false);

  const csv = toCSV([{ ...first, adLabel: "=HYPERLINK(\"x\")", city: "a,b" }]);
  const [head, row] = csv.trim().split("\n");
  assert.ok(head.startsWith("time_sao_paulo,visitor,"));
  assert.ok(row.includes(`"'=HYPERLINK(""x"")"`), row);
  assert.ok(row.includes('"a,b"'));
});

test("rolled-up days merge back in as counts", () => {
  const day = compact(summarize(sample(), ["2026-11-09"], "touchme"));
  assert.equal(day._views, undefined);
  assert.deepEqual(day.speed.samples, []);
  const into = summarize([], ["2026-11-09"], "touchme");
  mergeSummary(into, day);
  mergeSummary(into, day);
  assert.equal(into.visits, 8);
  assert.equal(into.taps, 4);
  assert.deepEqual(into.ads["ad|br|vocal"], { v: 4, t: 2 });
  assert.equal(into.hours[12].v, 6);
  assert.equal(into.days["2026-11-09"].v, 8);
});

/* ---------- Meta health (9 Nov 2026) ---------- */

test("Meta health keys round-trip and carry nothing personal", () => {
  const k = healthKey({ events: "sc", sent: 1, received: 1, result: "ok", test: false }, T, "ab12");
  assert.equal(k, `mh/2026-11-09/${T}-ab12/sc/1/1/ok/-/0`);
  assert.deepEqual(parseHealthKey(k), { day: "2026-11-09", ts: T, events: ["sc"], sent: 1, received: 1, result: "ok", detail: "-", test: false });
  const b = healthKey({ events: "pv.vc", sent: 0, result: "blocked", detail: "dc-meta" }, T, "x");
  assert.equal(parseHealthKey(b).detail, "dc-meta");
  assert.equal(parseHealthKey(b).received, null);
});

test("Meta's answers: success counted, errors coded, IPs masked out of the note", () => {
  assert.deepEqual(readMetaAnswer(200, { events_received: 2, messages: [], fbtrace_id: "A" }), { result: "ok", received: 2, detail: "-", note: "" });
  const err = readMetaAnswer(400, { error: { message: "Invalid parameter for 189.6.1.20 and 2804:14c:1::5", code: 100, error_subcode: 2804050 } });
  assert.equal(err.result, "error");
  assert.equal(err.detail, "http-400-code-100-2804050");
  assert.ok(!/189\.6|2804:14c/.test(err.note), err.note);
  assert.equal(readMetaAnswer(500, null).detail, "http-500");
});

test("Meta health card: today vs the range, taps accepted, bots blocked, last error", () => {
  const H = (o, ts) => parseHealthKey(healthKey(o, ts, "r"));
  const list = [
    H({ events: "pv.vc", sent: 2, received: 2, result: "ok" }, T),
    H({ events: "sc", sent: 1, received: 1, result: "ok" }, T + 1000),
    H({ events: "sc", sent: 1, result: "error", detail: "http-400-code-100" }, T + 2000),
    H({ events: "pv.vc", sent: 0, result: "blocked", detail: "dc-meta" }, T + 3000),
    H({ events: "sc", sent: 1, received: 1, result: "ok" }, T - 2 * 86400000),
  ];
  const h = healthSummary(list, ["2026-11-07", "2026-11-08", "2026-11-09"], T + 5000);
  assert.deepEqual(h.today, { calls: 3, sent: 4, received: 3, errors: 1, blocked: 1, taps: 2, tapsReceived: 1, test: 0 });
  assert.equal(h.range.calls, 4);
  assert.equal(h.range.tapsReceived, 2);
  assert.equal(h.lastError.detail, "http-400-code-100");
  assert.equal(h.lastOk, "2026-11-09 12:00:01");
});

/* ---------- who counts as a person (9 Nov 2026) ---------- */

const DAY = ["2026-11-09"];
function people(evs, opts) { return summarize(evs, DAY, "touchme", opts); }

test("a visit counts only after a touch, scroll, key press or tap; otherwise it's a hidden bot", () => {
  const s = people([
    e("view", { visitor: "p", pv: "a1" }, T),
    e("act", { visitor: "p", pv: "a1", target: "touch" }, T + 1500),         /* person */
    e("view", { visitor: "q", pv: "b1" }, T + 1000),
    e("click", { visitor: "q", pv: "b1", target: "spotify", meta: 1 }, T + 4000), /* a tap is proof too */
    e("view", { visitor: "r", pv: "c1", content: "", campaign: "" }, T + 2000), /* scanner: looked, never touched */
  ]);
  assert.equal(s.visits, 2);
  assert.equal(s.taps, 1);
  assert.deepEqual(s.hidden, { visits: 1, reasons: { noact: 1 } });
  assert.equal(visitLog(s).some((r) => r.visitor === "r"), false);
});

test("last night's real visits: 7 bots, 1 unproven, Luke's two Instagram loads = 1 visit", async () => {
  const fs = await import("node:fs");
  const keys = fs.readFileSync(new URL("./fixtures/2026-11-09-keys.txt", import.meta.url), "utf8").trim().split("\n").filter((l) => !l.startsWith("#"));
  const evs = keys.map(parseKey);
  const s = summarize(evs, DAY, "touchme");
  assert.equal(s.visits, 1, "only the Instagram visit that tapped Spotify");
  assert.equal(s.taps, 1, "two taps within 30 min of each other = one visit, one tap");
  const log = visitLog(s);
  assert.equal(log[0].reloads, 1);
  assert.equal(log[0].adLabel, "Instagram (bio/DM/story)");
  assert.equal(s.hidden.visits, 8);
  assert.deepEqual(s.hidden.reasons, { test: 1, noact: 3, "dc-town": 4 });
});

test("data-centre towns are always hidden; big data-centre cities only without interaction", () => {
  const s = people([
    e("view", { visitor: "m1", pv: "m1", city: "Prineville", country: "us" }, T),
    e("act", { visitor: "m1", pv: "m1", target: "pointer", city: "Prineville", country: "us" }, T + 900),
    e("view", { visitor: "k1", pv: "k1", city: "Kansas City", country: "us" }, T),
    e("act", { visitor: "k1", pv: "k1", target: "touch", city: "Kansas City", country: "us" }, T + 900),
    e("view", { visitor: "k2", pv: "k2", city: "Ashburn", country: "us" }, T),
  ]);
  assert.equal(s.visits, 1, "the Kansas City person who touched the screen");
  assert.deepEqual(s.hidden.reasons, { "dc-town": 1, "dc-city": 1 });
});

test("flags from the server or the page hide the whole page load, even with a touch", () => {
  for (const bot of ["dc-meta", "ua", "webdriver", "headless", "notouch", "hidden", "me"]) {
    const s = people([
      e("view", { visitor: "x", pv: "x1", bot }, T),
      e("act", { visitor: "x", pv: "x1", target: "touch" }, T + 800),
      e("click", { visitor: "x", pv: "x1", target: "spotify", meta: 1 }, T + 2000),
    ]);
    assert.equal(s.visits, 0, bot);
    assert.equal(s.taps, 0, bot);
    assert.deepEqual(s.hidden.reasons, { [bot]: 1 }, bot);
  }
  /* an inhuman tap flags its load after the fact */
  const f = people([e("view", { visitor: "f", pv: "f1" }, T), e("click", { visitor: "f", pv: "f1", target: "spotify", bot: "fasttap" }, T + 100)]);
  assert.deepEqual([f.visits, f.taps, f.hidden.reasons.fasttap], [0, 0, 1]);
});

test("Show bots brings them back, tagged with the reason", () => {
  const evs = [e("view", { visitor: "s1", pv: "q1", bot: "dc-meta" }, T), e("view", { visitor: "p", pv: "q2" }, T), e("act", { visitor: "p", pv: "q2", target: "touch" }, T + 500)];
  const s = people(evs, { bots: true });
  assert.equal(s.visits, 2);
  const log = visitLog(s);
  assert.equal(log.find((r) => r.visitor === "s1").bot, "dc-meta");
  assert.equal(log.find((r) => r.visitor === "p").bot, "");
  assert.equal(log.find((r) => r.visitor === "p").interacted, true);
  const d = dashboard(s, s, DAY, "touchme");
  assert.equal(d.hidden.visits, 1);
  assert.equal(d.hidden.reasons[0].label, "Meta data centre");
});

/* ---------- reloads, caps ---------- */

test("reloads within 30 minutes are one visit (first load's ad and returning flag), a later one is new", () => {
  const v = (pv, ts, o = {}) => [e("view", { visitor: "r", pv, ...o }, ts), e("act", { visitor: "r", pv, target: "touch" }, ts + 500)];
  const s = people([
    ...v("l1", T, { ret: 0 }),
    ...v("l2", T + 10 * 60000, { ret: 1, content: "other-ad" }),  /* reload 10 min later */
    e("click", { visitor: "r", pv: "l2", target: "spotify", meta: 1 }, T + 11 * 60000),
    e("click", { visitor: "r", pv: "l2", target: "spotify", meta: 1 }, T + 12 * 60000), /* double tap */
    ...v("l3", T + 35 * 60000 + 11 * 60000, { ret: 1 }),            /* 35 min after the last load */
  ]);
  assert.equal(s.visits, 2);
  assert.equal(s.taps, 1);
  assert.equal(s.reloads, 1);
  const log = visitLog(s);
  const first = log.find((r) => r.ts === T);
  assert.equal(first.returning, false, "the visit keeps its first load's returning flag");
  assert.equal(first.ad, "vocal", "and its first load's ad");
  assert.equal(first.reloads, 1);
  assert.equal(first.spotify, true);
  assert.equal(log.find((r) => r.ts !== T).returning, true);
});

test("time to tap is capped at 10 minutes", () => {
  const s = people([e("view", { visitor: "c", pv: "c1" }, T), e("click", { visitor: "c", pv: "c1", target: "spotify", ms: 3 * 3600000 }, T + 3 * 3600000)]);
  assert.equal(visitLog(s)[0].tapMs, 600000);
});

/* ---------- where a visit came from (9 Nov 2026) ---------- */

test("source labels: ad name, Meta ad (untagged), Instagram (bio/DM/story), Direct", () => {
  assert.deepEqual(adOf({ src: "meta", campaign: "br", content: "vocal", fb: "1" }), { kind: "ad", campaign: "br", ad: "vocal" });
  assert.equal(adOf({ src: "ig", app: "instagram", campaign: "-", content: "-", fb: "1" }).kind, "untagged", "fbclid wins");
  assert.equal(adOf({ src: "ig", app: "instagram", content: "-", fb: "0" }).kind, "instagram");
  assert.equal(adOf({ src: "direct", app: "-", ref: "l.instagram.com", content: "-", fb: "-" }).kind, "instagram", "Instagram referrer");
  assert.equal(adOf({ src: "ig", content: "link_in_bio", fb: "0" }).kind, "instagram", "Instagram's own bio tag is not an ad");
  assert.equal(adOf({ src: "direct", app: "-", ref: "-", content: "-", fb: "-" }).kind, "direct");
  assert.equal(adOf({ src: "facebook", app: "facebook", ref: "m.facebook.com", content: "-", fb: "0" }).kind, "direct");
  assert.equal(adLabel({ kind: "untagged" }), "Meta ad (untagged)");
  assert.equal(adLabel({ kind: "instagram" }), "Instagram (bio/DM/story)");
  assert.equal(adLabel({ kind: "direct" }), "Direct");
  assert.equal(adLabel({ kind: "ad", ad: "tm-br-vocal" }), "tm br vocal");
});

test("CSV has the source, reload, interaction and bot columns", () => {
  const s = people([
    e("view", { visitor: "d", pv: "d1", src: "ig", app: "instagram", campaign: "", content: "" }, T),
    e("act", { visitor: "d", pv: "d1", target: "touch" }, T + 700),
    e("view", { visitor: "u", pv: "u1", src: "ig", campaign: "", content: "", fb: 1 }, T),
  ], { bots: true });
  const [head, ...rows] = toCSV(visitLog(s)).trim().split("\n");
  for (const col of ["source", "ad_name", "reloads_within_30_min", "interacted", "bot", "bot_reason"]) assert.ok(head.split(",").includes(col), col);
  assert.ok(rows.some((r) => r.includes("Instagram (bio/DM/story)") && r.includes(",yes,")));
  assert.ok(rows.some((r) => r.includes("Meta ad (untagged)") && r.includes("noact") && r.includes("No touch, scroll or tap")));
});

test("crawler and preview user agents are caught; real phones are not", async () => {
  const { BOT } = await import("../netlify/lib/ua.mjs");
  for (const ua of ["facebookexternalhit/1.1", "meta-externalagent/1.1", "Facebot", "WhatsApp/2.23.20.0 A", "TelegramBot (like TwitterBot)",
    "Slackbot-LinkExpanding 1.0", "Twitterbot/1.0", "Mozilla/5.0 (compatible; Discordbot/2.0)", "Mozilla/5.0 (compatible; Googlebot/2.1)",
    "Mozilla/5.0 (compatible; bingbot/2.0)", "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/130.0 Safari/537.36", "Chrome-Lighthouse"]) {
    assert.equal(BOT.test(ua), true, ua);
  }
  for (const ua of [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 357.0.0.25.101",
    "Mozilla/5.0 (Linux; Android 14; SM-S918B; wv) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 11; CUBOT X50) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36"]) {
    assert.equal(BOT.test(ua), false, ua);
  }
});

/* ---------- Meta status line ---------- */

test("the last-call record: OK, or Meta's message with tokens and IPs removed", async () => {
  const { lastRecord, scrub } = await import("../netlify/lib/capi.mjs");
  assert.deepEqual(lastRecord({ result: "ok", received: 1 }, ["SpotifyClick"], T),
    { ok: true, ts: T, events: ["SpotifyClick"], received: 1, detail: "-", message: "", test: false });
  const bad = lastRecord({ result: "error", detail: "http-400-code-190", note: "Error validating access token: Session has expired. token EAABsbCS1iHgBAO8ZBZAx1234567890 for 189.6.1.20" }, ["PageView", "ViewContent"], T);
  assert.equal(bad.ok, false);
  assert.ok(bad.message.startsWith("Error validating access token"));
  assert.ok(!/EAAB|189\.6/.test(bad.message), bad.message);
  assert.equal(scrub("https://graph.facebook.com/x?access_token=EAAsecret123&y=1"), "https://graph.facebook.com/x?access_token=<hidden>&y=1");
});
