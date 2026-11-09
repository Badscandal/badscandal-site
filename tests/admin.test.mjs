import { test } from "node:test";
import assert from "node:assert/strict";
import { compact, dashboard, mergeSummary, resolveRange, spDay, summarize, toCSV, utcDaysFor, visitLog } from "../netlify/lib/admin.mjs";
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
    e("view", { visitor: "a", pv: "p2", ms: 180, ret: 1 }, T + 3600000),                     /* same person later */
    e("view", { visitor: "b", pv: "p3", ms: 700, content: "escada", country: "de", city: "Berlin" }, T + 60000),
    e("click", { visitor: "b", pv: "p3", target: "apple", ms: 5000, content: "escada", country: "de" }, T + 65000),
    e("view", { visitor: "c", pv: "p4", ms: 250, content: "escada", country: "de", city: "Berlin" }, T + 120000),
    e("click", { visitor: "c", pv: "p4", target: "spotify", ms: 3100, meta: 0, content: "escada", country: "de" }, T + 123000),
    e("consent", { visitor: "c", pv: "p4", target: "no", country: "de" }, T + 121000),
    e("view", { visitor: "z", pv: "p9", page: "listen" }, T),                                   /* other page */
    e("view", { visitor: "y", pv: "p8" }, T - 10 * 86400000),                                   /* other day */
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
  assert.deepEqual(s.ads["br|vocal"], { v: 2, t: 1 });
  assert.deepEqual(s.ads["br|escada"], { v: 2, t: 1 });
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

  const csv = toCSV([{ ...first, ad: "=HYPERLINK(\"x\")", city: "a,b" }]);
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
  assert.deepEqual(into.ads["br|vocal"], { v: 4, t: 2 });
  assert.equal(into.hours[12].v, 6);
  assert.equal(into.days["2026-11-09"].v, 8);
});
