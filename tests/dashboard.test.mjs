/* The one dashboard (11 Nov 2026): /hq replaces /admin. Covers the redirects, the unchanged login and
   lockout, the new /api/admin/overview (auth, shape, people-only), the sample mode never touching the
   real stores or Meta, visible sheet errors, today's duties, and the cached meta-ads.csv. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dutiesReport, hqModel, sheetErrors } from "../netlify/lib/hq.mjs";
import { sampleSheets } from "../netlify/lib/hq-sample.mjs";

/* ---------- a fake Blobs that records every store it is asked for ---------- */
globalThis.__blobs = new Map(); globalThis.__asked = [];
const FAKE = `const S = globalThis.__blobs;
const store = (n) => { const name = typeof n === "string" ? n : n.name; globalThis.__asked.push(name); const m = S.get(name) || (S.set(name, new Map()), S.get(name));
  return { get: async (k, o) => (m.has(k) ? (o && o.type === "json" ? JSON.parse(m.get(k)) : m.get(k)) : null), setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    set: async (k, v) => { m.set(k, String(v)); }, delete: async (k) => { m.delete(k); },
    list: async ({ prefix }) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }) }; };
export const getStore = store; export const getDeployStore = store;`;
registerHooks({ resolve(spec, ctx, next) {
  if (spec === "@netlify/blobs") return { url: "data:text/javascript," + encodeURIComponent(FAKE), shortCircuit: true };
  return next(spec, ctx);
} });
const ENV = { ADMIN_KEY: "correct horse" };
globalThis.Netlify = { env: { get: (k) => ENV[k] } };
const fetches = [];
globalThis.fetch = async (u) => { fetches.push(String(u)); return new Response('{"data":[]}', { status: 200 }); };
const { default: admin } = await import("../netlify/functions/admin.mjs");
const { makeSession, sessionCookie } = await import("../netlify/lib/session.mjs");
const cookie = sessionCookie(await makeSession("correct horse")).split(";")[0];
const ctx = { ip: "203.0.113.5", deploy: { context: "production" } };
const call = (path, init = {}) => admin(new Request("https://badscandal.com" + path, init), ctx);

test("/admin, /admin.html and /stats are permanent, forced redirects to /hq; robots and headers cover /hq", () => {
  const r = readFileSync(new URL("../_redirects", import.meta.url), "utf8");
  for (const from of ["/admin", "/admin.html", "/stats", "/stats.html"]) assert.match(r, new RegExp("^" + from.replace(".", "\\.") + "\\s+/hq\\s+301!\\s*$", "m"), from);
  assert.match(readFileSync(new URL("../robots.txt", import.meta.url), "utf8"), /^Disallow: \/hq$/m);
  const h = readFileSync(new URL("../_headers", import.meta.url), "utf8");
  assert.match(h, /^\/hq\n  X-Robots-Tag: noindex, nofollow\n  X-Frame-Options: DENY/m);
  const page = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  /* Growth and Fans are one page since 12 Nov 2026 (Luke: "growth and fans can be on the same page") */
  for (const id of ["loginForm", "today", "songs", "ads", "pages", "growth", "growth-fans", "releases", "money", "team"]) assert.match(page, new RegExp('id="' + id + '"'), id);
  const order = ["today", "songs", "ads", "pages", "growth", "releases", "money", "team"].map((s) => page.indexOf('href="#' + s + '"'));
  assert.deepEqual([...order].sort((a, b) => a - b), order, "the chip nav is in Luke's order");
});

test("login is unchanged: same endpoint, same cookie, same 5-tries lockout", async () => {
  const wrong = () => call("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: '{"password":"nope"}' });
  const lefts = [];
  for (let i = 0; i < 5; i++) lefts.push((await (await wrong()).json()).left);
  assert.deepEqual(lefts, [4, 3, 2, 1, 0]);
  assert.equal((await wrong()).status, 429, "locked out after 5");
  globalThis.__blobs.get("admin-auth").clear();
  const ok = await call("/api/admin/login", { method: "POST", body: '{"password":"correct horse"}' });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("set-cookie"), /^__Host-bs_admin=.*HttpOnly.*Secure.*SameSite=Strict/);
  assert.equal((await call("/api/admin/login", { method: "POST", headers: { origin: "https://evil.example" }, body: '{"password":"correct horse"}' })).status, 403);
});

test("overview: login required; every song, yesterday, spend, cap, health and the key line", async () => {
  assert.equal((await call("/api/admin/overview")).status, 401);
  assert.equal((await call("/api/admin/overview?sample=1")).status, 401, "the sample needs the login too");
  const j = await (await call("/api/admin/overview?range=7d&sample=1", { headers: { cookie } })).json();
  assert.equal(j.sample, true); assert.equal(j.days, 7);
  assert.deepEqual(j.songs.map((s) => s.id).sort(), ["medaseubody", "touchme"]);
  for (const s of j.songs) { assert.ok(s.people <= s.visits, "people <= visits"); assert.ok(s.taps <= s.visits); assert.ok(!("tapsByAd" in s)); }
  assert.ok(j.yesterday.taps > 0 && j.yesterday.people > 0 && j.yesterday.cpt > 0);
  assert.equal(j.spend.connected, true); assert.ok(j.spend.ads.every((a) => a.song && a.ad));
  assert.equal(j.spend.days.length, 7);
  assert.equal(j.cap.connected, true); assert.ok(j.health.today.sent > 0);
  assert.equal(j.metaKey.state, "ok");
  assert.ok(j.lastEventAt > Date.now() - 2 * 86400000, "Data health: the newest visit record");
  /* Stage 2 (Today briefing): the period before, per day, the last 8 finished days and every ad over 7 */
  assert.equal(j.prev.days, 7); assert.ok(j.prev.taps > 0 && j.prev.spend > 0);
  assert.equal(j.series.length, 7); assert.ok(j.series.every((x) => x.d && x.taps != null && x.spend != null));
  assert.equal(j.recent.days.length, 8); assert.equal(j.recent.days[7].d, j.yesterday.d, "ends yesterday (finished days)");
  assert.equal(j.recent.days[7].taps, j.yesterday.taps);
  const waste = j.recent.ads7.find((a) => a.ad === "TM EU - clip 3");
  assert.ok(waste && waste.spend >= 10 && waste.taps === 0, "the made-up wasting ad");
  assert.ok(j.recent.ads7.find((a) => a.ad === "TM BR - vocal contatinho").taps > 0);
});

test("overview: people only by default; bots don't count", async () => {
  const j = await (await call("/api/admin/overview?range=7d&sample=1", { headers: { cookie } })).json();
  const d = await (await call("/api/admin/data?range=7d&link=touchme&sample=1", { headers: { cookie } })).json();
  const tm = j.songs.find((s) => s.id === "touchme");
  assert.equal(tm.taps, d.kpis.taps, "the same people-only taps as the Pages numbers");
  assert.equal(tm.visits, d.kpis.visits);
  assert.ok(d.hidden.visits > 0, "the sample has bots, and they are hidden");
});

test("sample mode never touches the real stores or Meta", async () => {
  globalThis.__asked.length = 0; fetches.length = 0;
  ENV.META_ADS_TOKEN = "REAL";
  for (const p of ["/api/admin/overview?sample=1", "/api/admin/data?link=touchme&sample=1", "/api/admin/csv?link=touchme&sample=1"]) {
    const r = await call(p, { headers: { cookie } });
    assert.equal(r.status, 200, p);
  }
  assert.deepEqual(globalThis.__asked, [], "no real Blob store was opened");
  assert.deepEqual(fetches, [], "nothing was asked of Meta or anyone");
  delete ENV.META_ADS_TOKEN;
});

test("every existing endpoint still answers as before", async () => {
  assert.equal((await call("/api/admin/data")).status, 401);
  assert.equal((await call("/api/admin/csv")).status, 401);
  assert.equal((await call("/api/admin/exclude", { method: "POST" })).status, 401);
  assert.equal((await call("/api/admin/nothing", { headers: { cookie } })).status, 404);
  const out = await call("/api/admin/logout", { method: "POST" });
  assert.match(out.headers.get("set-cookie"), /Max-Age=0/);
});

/* ---------- the sheet ---------- */
test("sheet errors are reported per tab, never shown as empty", () => {
  const e = sheetErrors({ Income: [["#REF!"]], Fans: [["date", "handle"], ["2026-11-10", "#N/A"], ["2026-11-10", "@x"]], Growth: [["date"], ["2026-11-10"]], Spend: [["date", "spend"], ["2026-11-10", "#ERROR!"]] });
  assert.deepEqual(e, { Fans: { cells: 1, first: "#N/A", readable: 1 }, Spend: { cells: 1, first: "#ERROR!", readable: 0 }, Income: { cells: 1, first: "#REF!", readable: 0 } });
  const m = hqModel({ Income: [["#REF!"]] }, "2026-11-11", {});
  assert.deepEqual(m.sheetErrors.Income, { cells: 1, first: "#REF!", readable: 0 }, "today's real case: Income is #REF!");
  assert.deepEqual(sheetErrors(sampleSheets("2026-11-11")), {}, "the sample is clean");
});

test("today's duties: D- rows for today (or undated), done / todo / blocked; not ordinary tasks", () => {
  const T = (id, owner, task, deadline, status, blocker = "") => ({ id, owner, task, deadline, status, blocker });
  const rows = [T("D-1", "Atlas", "Spotify numbers", "2026-11-11", "done"), T("D-2", "Kevin", "TikTok", "2026-11-11", "Blocked", "login expired"),
    T("D-3", "Kevin", "Standing duty", "", "todo"), T("D-4", "Atlas", "Yesterday's", "2026-11-10", "done"), T("T-1", "Luke", "Master", "2026-11-09", "todo")];
  const d = dutiesReport(rows, "2026-11-11");
  assert.equal(d.total, 3); assert.equal(d.done, 1); assert.equal(d.blocked, 1);
  assert.deepEqual(d.byOwner.map((o) => [o.owner, o.done, o.todo, o.blocked]), [["Kevin", 0, 1, 1], ["Atlas", 1, 0, 0]]);
  assert.equal(d.byOwner[0].items.find((x) => x.status === "blocked").blocker, "login expired");
  const m = hqModel({ Tasks: [["id", "owner", "task", "deadline", "status", "blocker"], ...rows.map((r) => [r.id, r.owner, r.task, r.deadline, r.status, r.blocker])] }, "2026-11-11", {});
  assert.deepEqual(m.team.tasks.map((t) => t.id), ["T-1"], "duties are not tasks (no late D- rows)");
  assert.equal(m.team.late, 1); assert.equal(m.team.duties.total, 3);
});

/* ---------- the feed: the finished meta-ads.csv is kept an hour ---------- */
test("meta-ads.csv: the finished file is cached an hour (no re-reading two months of visits)", async () => {
  const { default: feed } = await import("../netlify/functions/feed.mjs");
  ENV.SHEET_FEED_KEY = "k".repeat(48); ENV.META_ADS_TOKEN = "SECRET";
  globalThis.__blobs.clear();
  const get = () => feed(new Request("https://badscandal.com/api/feed/meta-ads.csv?key=" + "k".repeat(48)), ctx);
  const a = await get();
  assert.equal(a.status, 200);
  const first = await a.text();
  globalThis.__asked.length = 0; fetches.length = 0;
  const b = await get();
  assert.equal(await b.text(), first);
  assert.ok(!globalThis.__asked.includes("stats"), "the second request didn't open the visit records");
  assert.equal(fetches.length, 0, "nor ask Meta");
  const kept = [...globalThis.__blobs.get("meta-cache").keys()].filter((k) => k.startsWith("feed/file/meta-ads.csv/"));
  assert.equal(kept.length, 1);
  delete ENV.SHEET_FEED_KEY; delete ENV.META_ADS_TOKEN;
});
