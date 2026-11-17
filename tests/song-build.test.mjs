/* A2 (17 Nov 2026): song-page builds report back to the desk.
   Webmaster: on 17 Nov the /loveyou build failed (run 44037180913) but the desk kept saying "sent to GitHub: not
   live yet" and never said "Not done"; and 14 unrelated bank tests held the page up for ~20 minutes.
   Now: only the song-page checks can stop a page; the rest of the tests run AFTER it is live and only report.
   Every build writes a short report (tools/song-report.mjs) to the song-builds branch; the site reads it (no
   key: the repo is public) and the desk says "Not done: <why>" to the bot that asked, once.
   Made-up songs, links and ids only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";
import { readSongReport, REPORT_BRANCH } from "../netlify/lib/github.mjs";
import { buildReport } from "../tools/song-report.mjs";

const NOW = Date.parse("2026-11-17T07:00:00Z");
const MIN = 60000;
const R = S.DEFAULT_ROSTER;
const MSG = "mmi2abcde01ab";
const RUN = "https://github.com/Badscandal/badscandal-site/actions/runs/1234567";
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const ok = { outcome: "success" }, bad = { outcome: "failure" }, skip = { outcome: "skipped" };
const job = { kind: "new", slug: "papermoon", title: "Paper Moon", date: "2026-11-27", cover: "https://example.com/p.jpg", by: "Webmaster", msg: MSG };

/* ---------- the workflow ---------- */
test("song-page.yml: only the song-page checks run before Publish; every other test runs after it and never blocks", () => {
  const y = read(".github/workflows/song-page.yml");
  const at = (s) => { const i = y.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at("npm run test:song") < at("name: Publish"));
  assert.ok(at("name: Publish") < at("npm test"));
  assert.match(y.slice(at("name: Publish")), /continue-on-error: true/);
  assert.equal((y.slice(0, at("name: Publish")).match(/npm test\b/g) || []).length, 0, "the whole suite must not block a page");
  assert.match(y, /set -o pipefail/);
  assert.match(y, /name: Tell the desk[\s\S]*if: always\(\)/);
  assert.match(y, /node tools\/song-report\.mjs/);
  assert.match(y, /refs\/heads\/song-builds/);
  assert.equal(REPORT_BRANCH, "song-builds");
});
test("test:song = the song-page checks, files that exist", () => {
  const p = JSON.parse(read("package.json"));
  const files = p.scripts["test:song"].split(/\s+/).filter((x) => x.endsWith(".mjs"));
  for (const f of ["tests/songs.test.mjs", "tests/song-pages-desk.test.mjs", "tests/webmaster-tools.test.mjs", "tests/song-build.test.mjs"]) assert.ok(files.includes(f), f);
  for (const f of files) assert.ok(existsSync(new URL("../" + f, import.meta.url)), f);
  assert.ok(!files.includes("tests/bank.test.mjs"));
  assert.equal(p.scripts.test, "node --test tests/*.test.mjs");
});

/* ---------- the report ---------- */
test("buildReport: where it stopped and why, in plain words", () => {
  const base = { job, runUrl: RUN, at: "2026-11-17T07:04:00Z" };
  const r1 = buildReport({ ...base, steps: { tools: ok, install: ok, make: bad, songtests: skip, publish: skip }, songError: "the cover link answered with a web page, not a picture" });
  assert.deepEqual(r1, { msg: MSG, slug: "papermoon", kind: "new", ok: false, step: "Make the page", reason: "the cover link answered with a web page, not a picture", run: RUN, at: "2026-11-17T07:04:00Z" });
  const log = "✔ songs.json follows the rules (1ms)\n✖ every song has its page, and each page is exactly what the list + template produce (3ms)\nnot ok 2 - every song has its page\n";
  const r2 = buildReport({ ...base, steps: { tools: ok, install: ok, make: ok, songtests: bad, publish: skip }, songLog: log });
  assert.equal(r2.step, "Song-page checks");
  assert.equal(r2.reason, "a song-page check failed: every song has its page, and each page is exactly what the list + template produce");
  assert.equal(buildReport({ ...base, steps: { tools: ok, install: ok, make: ok, songtests: ok, publish: bad } }).step, "Publish");
  assert.match(buildReport({ ...base, steps: { tools: ok, install: ok, make: ok, songtests: ok, publish: bad } }).reason, /changed at the same moment.*ask again/);
  assert.match(buildReport({ ...base, steps: { tools: bad } }).reason, /could not set up/);
  assert.match(buildReport({ ...base, steps: { tools: ok, install: ok, make: { outcome: "cancelled" } } }).reason, /stopped/);
  const live = buildReport({ ...base, steps: { tools: ok, install: ok, make: ok, songtests: ok, publish: ok, alltests: bad }, allLog: "✖ bank: a made-up test (2ms)\n✖ bank: another made-up test (2ms)\n" });
  assert.equal(live.ok, true);
  assert.equal(live.others, "2 other tests failed after it went live (they don't stop song pages): bank: a made-up test; bank: another made-up test");
  assert.equal(buildReport({ ...base, steps: { tools: ok, install: ok, make: ok, songtests: ok, publish: ok, alltests: ok } }).others, undefined);
  /* no desk id (an old or hand-made dispatch): no report */
  assert.equal(buildReport({ ...base, job: { ...job, msg: "../../etc" }, steps: {} }), null);
  /* reasons are one short line, no control characters */
  const long = buildReport({ ...base, steps: { tools: ok, install: ok, make: bad }, songError: "x".repeat(900) + "\u0007" });
  assert.ok(long.reason.length <= 300 && !/[\u0000-\u001f]/.test(long.reason));
});

/* ---------- the site reads it ---------- */
test("readSongReport: the public report file; missing or odd = null; never throws", async () => {
  const urls = [];
  const f = (body, status = 200) => async (u) => { urls.push(String(u)); return new Response(body, { status }); };
  const good = { msg: MSG, slug: "papermoon", kind: "new", ok: false, step: "Make the page", reason: "made up", run: RUN, at: "2026-11-17T07:04:00Z" };
  assert.deepEqual(await readSongReport(MSG, f(JSON.stringify(good))), good);
  assert.match(urls[0], new RegExp("^https://raw\\.githubusercontent\\.com/Badscandal/badscandal-site/song-builds/builds/" + MSG + "\\.json"));
  assert.equal(await readSongReport(MSG, f("Not Found", 404)), null);
  assert.equal(await readSongReport(MSG, f(JSON.stringify({ ...good, msg: "mother" }))), null);
  assert.equal(await readSongReport(MSG, f(JSON.stringify({ ...good, run: "https://evil.example/x" }))), null);
  assert.equal(await readSongReport("../x", f("{}")), null);
  assert.equal(await readSongReport(MSG, async () => { throw new Error("offline"); }), null);
});

/* ---------- the desk ---------- */
async function sent(d, reports, t) {
  const dispatched = [];
  S.useSongDispatch(async (j) => { dispatched.push(j); return { ok: true }; });
  S.useSongReports(async (id) => reports[id] || null);
  t.after(() => { S.useSongDispatch(null); S.useSongReports(null); });
  const tool = TOOLS.find((x) => x.name === "song_page");
  const r = await callTool(tool, { bot: "Webmaster", kind: "new", slug: "papermoon", title: "Paper Moon", date: "2026-11-27", cover: "https://example.com/p.jpg" }, { store: d, now: NOW, role: "bot", hq: async () => null });
  await S.sendMessage(d, NOW + MIN, R, { from: "Luke", to: "Webmaster", text: "yes", re: r.id, note: "Yes, correct" });
  return r.id;
}
const toWebmaster = async (d, at) => (await S.listMessages(d, at)).filter((m) => m.to === "Webmaster" && m.from === "HQ");

test("a failed build: song_pages says Not done with the reason, and Webmaster gets ONE Not done message", async (t) => {
  const d = memoryDesk(), reports = {};
  const id = await sent(d, reports, t);
  const later = NOW + 10 * MIN;
  /* no report yet: still on its way */
  assert.deepEqual(await S.checkSongBuilds(d, later, R), []);
  reports[id] = { msg: id, slug: "papermoon", kind: "new", ok: false, step: "Make the page", reason: "the cover link answered with a web page, not a picture", run: RUN, at: new Date(later).toISOString() };
  const found = await S.checkSongBuilds(d, later, R);
  assert.equal(found.length, 1);
  const msgs = await toWebmaster(d, later);
  const nd = msgs.filter((m) => /^Not done:/.test(m.text));
  assert.equal(nd.length, 1);
  assert.match(nd[0].text, /^Not done: badscandal\.com\/papermoon did not go live\. GitHub's build stopped at "Make the page": the cover link answered with a web page, not a picture\. Nothing was published/);
  assert.match(nd[0].text, /actions\/runs\/1234567/);
  /* checked again: nothing new */
  assert.deepEqual(await S.checkSongBuilds(d, later + MIN, R), []);
  assert.equal((await toWebmaster(d, later + MIN)).filter((m) => /^Not done:/.test(m.text)).length, 1);
  const list = await S.songPages(d, later + MIN);
  assert.equal(list[0].state, 'not done: GitHub\'s build stopped at "Make the page": the cover link answered with a web page, not a picture');
});
test("song_pages checks the builds itself before answering", async (t) => {
  const d = memoryDesk(), reports = {};
  const id = await sent(d, reports, t);
  reports[id] = { msg: id, slug: "papermoon", kind: "new", ok: false, step: "Song-page checks", reason: "a song-page check failed: made up", run: RUN, at: new Date(NOW).toISOString() };
  const s = await callTool(TOOLS.find((x) => x.name === "song_pages"), { bot: "Webmaster" }, { store: d, now: NOW + 5 * MIN, role: "bot", hq: async () => null });
  assert.match(s.requests[0].state, /^not done: GitHub's build stopped at "Song-page checks"/);
  assert.equal((await toWebmaster(d, NOW + 5 * MIN)).filter((m) => /^Not done:/.test(m.text)).length, 1);
});
test("a build that worked: no Not done; other tests failing afterwards go to Claude, once", async (t) => {
  const d = memoryDesk(), reports = {};
  const id = await sent(d, reports, t);
  reports[id] = { msg: id, slug: "papermoon", kind: "new", ok: true, others: "2 other tests failed after it went live (they don't stop song pages): bank: a made-up test; bank: another", run: RUN, at: new Date(NOW).toISOString() };
  await S.checkSongBuilds(d, NOW + 5 * MIN, R);
  await S.checkSongBuilds(d, NOW + 6 * MIN, R);
  const all = await S.listMessages(d, NOW + 6 * MIN);
  assert.equal(all.filter((m) => /^Not done:/.test(m.text)).length, 0);
  const toClaude = all.filter((m) => m.to === "Claude" && m.from === "HQ");
  assert.equal(toClaude.length, 1);
  assert.match(toClaude[0].text, /papermoon went live, but 2 other tests failed after it went live/);
  const st = (await S.songPages(d, NOW + 6 * MIN))[0].state;
  assert.match(st, /^(live|built by GitHub: going live in a minute or two)$/);
});
test("no reader (a preview) or a request older than 3 days: nothing is fetched", async (t) => {
  const d = memoryDesk(), asked = [];
  const id = await sent(d, {}, t);
  S.useSongReports(async (x) => { asked.push(x); return null; });
  await S.checkSongBuilds(d, NOW + 4 * 86400000, R);
  assert.deepEqual(asked, []);
  S.useSongReports(null);
  assert.deepEqual(await S.checkSongBuilds(d, NOW + MIN, R), []);
  await S.checkSongBuilds(d, NOW + 20 * MIN, R).then(() => {});
  assert.ok(id);
});
test("the hourly job and the song_page wording say how a failure is reported", () => {
  assert.match(read("netlify/functions/pushhourly.mjs"), /checkSongBuilds/);
  assert.match(read("netlify/functions/pushhourly.mjs"), /useSongReports/);
  const desc = TOOLS.find((x) => x.name === "song_page").description;
  assert.match(desc, /Not done/);
  assert.doesNotMatch(desc, /runs every check/);
});
