/* /api/hq/summary (11 Nov 2026): the phone summary for the LDashboard app's BADSCANDAL tab.
   The endpoint is exercised for real here: @netlify/blobs is swapped for an in-memory fake and
   fetch (the ECB rates) is stubbed, so no network and no Netlify are needed. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { hqModel, hqSummary } from "../netlify/lib/hq.mjs";
import { sampleSheets } from "../netlify/lib/hq-sample.mjs";
import { bearerOk } from "../netlify/lib/session.mjs";

const TODAY = "2026-11-11";
const FX = { "2026-11": { USD: 1.12 }, "2026-10": { USD: 1.12 } };

const FAKE_BLOBS = `const s = new Map();
const store = () => ({ get: async (k) => (s.has(k) ? JSON.parse(s.get(k)) : null), setJSON: async (k, v) => { s.set(k, JSON.stringify(v)); } });
export const getStore = store; export const getDeployStore = store;`;
registerHooks({ resolve(spec, ctx, next) {
  if (spec === "@netlify/blobs") return { url: "data:text/javascript," + encodeURIComponent(FAKE_BLOBS), shortCircuit: true };
  return next(spec, ctx);
} });
const ENV = {};
globalThis.Netlify = { env: { get: (k) => ENV[k] } };
globalThis.fetch = async () => new Response("{}", { status: 503 }); /* no ECB rates in tests */
const { default: hq } = await import("../netlify/functions/hq.mjs");
const TOKEN = "t".repeat(20) + "-correct-horse-battery-staple-0123456789";
const call = (headers = {}, q = "?sample=1", method = "GET") =>
  hq(new Request("https://badscandal.com/api/hq/summary" + q, { method, headers }), { deploy: { context: "production" } });

test("hq summary: no HQ_APP_TOKEN on Netlify -> 503, closed even with a token sent", async () => {
  delete ENV.HQ_APP_TOKEN;
  const r = await call({ authorization: "Bearer anything" });
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /HQ_APP_TOKEN/);
});

test("hq summary: wrong, missing or cookie-only auth -> 401; no CORS, never cached", async () => {
  ENV.HQ_APP_TOKEN = TOKEN; ENV.ADMIN_KEY = "admin-pass";
  for (const h of [{}, { authorization: "Bearer nope" }, { authorization: TOKEN }, { authorization: "Basic " + TOKEN },
    { authorization: "Bearer " + TOKEN + "x" }, { cookie: "__Host-bs_admin=whatever" }]) {
    const r = await call(h);
    assert.equal(r.status, 401, JSON.stringify(h));
    assert.equal(r.headers.get("access-control-allow-origin"), null);
  }
});

test("hq summary: the right token gets the trimmed numbers (sample), GET only", async () => {
  ENV.HQ_APP_TOKEN = TOKEN;
  const r = await call({ authorization: "Bearer " + TOKEN });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), null, "no CORS: other sites' pages can't read it");
  assert.equal(r.headers.get("set-cookie"), null);
  assert.match(r.headers.get("cache-control"), /no-store/);
  const j = await r.json();
  assert.equal(j.sample, true); assert.equal(j.connected, true); assert.equal(j.v, 1);
  for (const k of ["cap", "next", "songs", "growth", "fans", "money", "tasks"]) assert.ok(k in j, k);
  assert.equal((await call({ authorization: "Bearer " + TOKEN }, "?sample=1", "POST")).status, 405);
  /* without sample and without the sheet settings: says what is missing, like /api/hq/data */
  const off = await (await call({ authorization: "Bearer " + TOKEN }, "")).json();
  assert.deepEqual(off, { connected: false, need: ["GOOGLE_SA_KEY", "HQ_SHEET_ID"] });
});

test("hq summary: /api/hq/data still needs the admin cookie, the app token doesn't open it", async () => {
  ENV.HQ_APP_TOKEN = TOKEN; ENV.ADMIN_KEY = "admin-pass";
  const r = await hq(new Request("https://badscandal.com/api/hq/data?sample=1", { headers: { authorization: "Bearer " + TOKEN } }), { deploy: { context: "production" } });
  assert.equal(r.status, 401);
});

test("hq summary: bearerOk compares safely", async () => {
  assert.equal(await bearerOk("Bearer abc", "abc"), true);
  assert.equal(await bearerOk("bearer  abc ", "abc"), true);
  assert.equal(await bearerOk("Bearer abc", ""), false, "no token set: nothing opens");
  assert.equal(await bearerOk("Bearer ", "abc"), false);
  assert.equal(await bearerOk("Bearer ab", "abc"), false);
  assert.equal(await bearerOk("Bearer " + "a".repeat(600), "abc"), false);
  assert.equal(await bearerOk(null, "abc"), false);
});

test("hq summary: same numbers as /hq, trimmed for a phone", () => {
  const m = hqModel(sampleSheets(TODAY), TODAY, FX);
  const s = hqSummary(m);
  assert.equal(s.cap.spent, m.money.cap.spent); assert.equal(s.cap.status, m.money.cap.status); assert.equal(s.cap.amount, 1000);
  assert.equal(s.next.song, m.next.song); assert.equal(s.next.late, m.next.late);
  assert.equal(s.next.lateSteps.length, m.next.late, "every late step of the next release is named");
  assert.equal(s.songs.length, m.songs.length);
  for (const [i, x] of s.songs.entries()) {
    const y = m.songs[i];
    assert.equal(x.streams, y.streams); assert.equal(x.dayChange, y.dayChange); assert.equal(x.momentum, y.momentum); assert.equal(x.trend, y.trend);
    assert.ok(x.spark.length <= 14);
    assert.ok(!("series" in x) && !("royalties" in x), "trimmed");
  }
  assert.deepEqual(s.growth.map((g) => [g.platform, g.followers, g.day, g.week]), m.growth.map((g) => [g.platform, g.followers, g.day, g.week]));
  assert.ok(s.fans.length <= 10);
  for (let i = 1; i < s.fans.length; i++) assert.ok(s.fans[i - 1].last >= s.fans[i].last, "most recent first");
  assert.equal(s.money.month, "2026-11");
  assert.equal(s.money.netEur, m.money.months.find((x) => x.month === "2026-11").netEur);
  assert.equal(s.tasks.late, m.team.late); assert.equal(s.tasks.blocked, m.team.blocked);
  assert.deepEqual(s.tasks.forLuke.map((t) => t.task), m.team.forLuke.map((t) => t.task));
  assert.ok(JSON.stringify(s).length < JSON.stringify(m).length / 2, "well under half the size");
});

test("hq summary: an empty sheet gives empty lists and missing money, never invented zeros", () => {
  const s = hqSummary(hqModel({}, TODAY, {}));
  assert.equal(s.next, null);
  assert.deepEqual([s.songs, s.growth, s.fans, s.tasks.forLuke], [[], [], [], []]);
  assert.equal(s.money.netEur, null); assert.equal(s.money.spendEur, null);
  assert.equal(s.cap.spent, 0); assert.equal(s.cap.status, "ok");
});
