/* HQ v18 (21 Nov 2026): Forge's v17 re-check and Ledger's lines. Every name, amount and id here is
   made up. The account ids are the shape of an ads id (XXX-XXX-XXXX), not a real one. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";
await import("../js/hq-lib.js");
await import("../js/hq-look.js");
const L = globalThis.HQLib;
const V = globalThis.HQLook;

const NOW = Date.parse("2026-11-21T15:00:00Z"); /* 12:00 in São Paulo */
const R = S.DEFAULT_ROSTER;
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, hq) => callTool(tool(name), args, { store: d, now: NOW, role: "bot", hq: hq || (async () => null) });
const ID = "111-222-3333";

test("an ads id comes out of a line for Luke with the brackets and words that held it", () => {
  for (const [raw, want] of [
    [`Google Ads signed out (at ${ID}).`, "Google Ads signed out."],
    [`Google Ads signed out at ${ID}).`, "Google Ads signed out."],
    [`Google Ads signed out (${ID}).`, "Google Ads signed out."],
    [`Google Ads ${ID} signed out at 09:10`, "Google Ads signed out at 09:10"],
    [`Sign in to Google Ads for account ${ID} please`, "Sign in to Google Ads please"],
    ["Nothing to take out (here).", "Nothing to take out (here)."],
  ]) {
    assert.equal(S.dropAccountId(raw), want, raw);
    assert.equal(L.dropAccountId(raw), want, raw);
  }
  assert.doesNotMatch(S.lukeLine(`Forge: Google Ads signed out at ${ID}).`), /\(\s*\)|at \)|\s\)/);
  assert.doesNotMatch(L.screenText(`Google Ads signed out (${ID}).`), /\(\s*\)/);
});

test("the short briefing's sign-in line has no empty brackets, and a sign-in that is back is not listed", async () => {
  const d = memoryDesk();
  await S.setCard(d, NOW - 60000, R, { bot: "Forge", needs: `Google Ads signed out (${ID}). Luke to sign in.`, blockers: "" });
  await S.setCard(d, NOW - 60000, R, { bot: "Kevin", needs: "TikTok Ads is signed in again.", blockers: "" });
  const short = await call(d, "luke_short_briefing", { bot: "Alfred" });
  const lines = short.needs_luke_sign_in.join(" | ");
  assert.doesNotMatch(lines, /\(\s*\)|at \)/);
  assert.match(lines, /Google Ads/);
  assert.doesNotMatch(lines, /TikTok/);
});

test("luke_briefing keeps its keys, and ad_spend says Google was not read", async () => {
  /* 24 Nov 2026, Luke: money removed from HQ. The income-problem half (lukeProblem) went with the income lines. */
  const d = memoryDesk();
  const cap = { month: "2026-11", currency: "USD", spent: 12.5, amount: 1000, left: 987.5, status: "ok", estimated: true,
    notRead: ["Google Sat 14 Nov: signed out", "Google Sun 15 Nov: signed out", "Google Mon 16 Nov: Luke to sign in at https://example.com/x"] };
  const hq = async () => ({ money: { cap }, team: { duties: { done: 1, total: 1, late: 0, blocked: 0, byOwner: [] }, tasks: [] } });
  const brief = await call(d, "luke_briefing", { bot: "Alfred" }, hq);
  assert.deepEqual(Object.keys(brief.ad_spend).slice(0, 6), ["month", "spent", "cap", "left", "status", "estimated"]);
  assert.match(brief.ad_spend.not_read, /^Google not read since 14 Nov/);
  assert.doesNotMatch(brief.ad_spend.not_read, /https?:/);
  assert.deepEqual(brief.income_this_month, { received: "Money is no longer on HQ.", pending: "Money is no longer on HQ.", payable: "Money is no longer on HQ.", problems: [] });
});

test("read_guide says how many tools there are now, not an old count or version", async () => {
  const d = memoryDesk();
  await S.setGuide(d, NOW - 9 * 86400000, "TEAM GUIDE, v2, Wed 11 Nov 2026\n\nFive new tools: seventeen in all. Use seventeen tools wisely.");
  const g = await call(d, "read_guide", { bot: "Ledger" });
  assert.doesNotMatch(g, /seventeen|v2, Wed 11 Nov 2026/i);
  assert.match(g, new RegExp(`${TOOLS.length} tools in all`));
  assert.match(g, /first written Wed 11 Nov 2026/);
});

test("a task blocker that waits on a sign-in the desk says is back gets a check line", async () => {
  const d = memoryDesk();
  await S.setCard(d, NOW - 60000, R, { bot: "Forge", working_on: "Spend log", needs: "TikTok Ads is signed in again.", blockers: "" });
  const tasks = [{ id: "T-90", owner: "Forge", task: "Restart the made-up campaign", status: "blocked", blocker: "Waiting for Luke's written restart and Forge's TikTok Ads sign-in" }];
  const hq = async () => ({ team: { duties: { done: 0, total: 0, late: 0, blocked: 0, byOwner: [] }, tasks } });
  const day = await call(d, "my_day", { bot: "Forge" }, hq);
  const t = day.open_tasks.find((x) => x.id === "T-90");
  assert.ok(t, "the task stays: the restart still waits on Luke");
  assert.match(t.blocker_check || "", /TikTok is signed in again/);
  assert.match(t.blocker_check || "", /task_update/);
});

test("a wait that started today says today, never 0 days", () => {
  assert.equal(L.waitedWords(0), "today");
  assert.equal(L.waitedWords(1), "1 day");
  assert.equal(L.waitedWords(4), "4 days");
  assert.equal(L.waitedWords(null), "");
  assert.doesNotMatch(fs.readFileSync(new URL("../js/hq-phone.js", import.meta.url), "utf8"), /it\.days \+ " days"/);
});

test("Team says today's duties and the longer tasks apart, so the counts don't clash", () => {
  assert.equal(L.taskListLine({ blocked: 4, late: 6 }), "Today's duties are on track. Longer tasks: 4 blocked, 6 late.");
  assert.equal(L.taskListLine({ blocked: 0, late: 1 }), "Today's duties are on track. Longer tasks: 1 late.");
  assert.equal(L.taskListLine({ blocked: 0, late: 0 }), "Nobody is stuck right now.");
  assert.doesNotMatch(fs.readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8"), /late on the task list/);
});

test("dates on charts and the Meta card read Fri 13 Nov, and engagement has one form", async () => {
  await import("../js/hq-chart.js");
  const C = globalThis.HQChart;
  const m = C.model([{ d: "2026-11-13", v: 1 }, { d: "2026-11-14", v: 2 }]);
  assert.match(C.valueAt(m, 0).label, /^Fri 13 Nov/);
  for (const f of ["../js/hq.js", "../js/hq-pages.js"]) assert.doesNotMatch(fs.readFileSync(new URL(f, import.meta.url), "utf8"), /replace\("-", "\/"\)/, f);
  assert.equal(L.epvPct(0.0897), "8.97%");
  assert.equal(L.epvPct(0.089), "8.90%");
  assert.equal(L.epvPct(null), "not reported");
});

test("Luke's screens and task text say the desk's shorthand in plain words", () => {
  const page = fs.readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  assert.doesNotMatch(page, /Conversions API\)|Browser · Server|Pixel \+ server/);
  assert.doesNotMatch(fs.readFileSync(new URL("../js/hq-growth.js", import.meta.url), "utf8"), /EPV 24h/);
  assert.doesNotMatch(fs.readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8"), /Desk push<\/h3>/);
  /* 24 Nov 2026, Luke: money removed from HQ. The "Revolut-once rule" rewrite went with the money rules. */
  const t = "Make the Meta system user (runbook B). Forge logs Meta too until the meta-api-feed brief says LIVE.";
  for (const out of [S.plainWords(t), L.plainWords(t), S.freshDuty(t)]) assert.doesNotMatch(out, /runbook|meta-api-feed/i, out);
});

test("a site check rewritten from the live board carries the live time, not the old check's", () => {
  const hq = { team: { duties: { done: 13, total: 13, blocked: 0 } } };
  const out = S.freshReport({ sp: "2026-11-20 15:35", text: "HQ check: Duties: 11 of 13 done" }, hq, "2026-11-21 12:00");
  assert.equal(out.sp, "2026-11-21 12:00");
  assert.match(out.text, /13 of 13/);
  const same = S.freshReport({ sp: "2026-11-21 09:35", text: "Duties: 13 of 13 done, 0 blocked" }, hq, "2026-11-21 12:00");
  assert.equal(same.sp, "2026-11-21 09:35");
});

test("Ads: song-page visits come from the song pages, and a missing cost per engagement says why", () => {
  assert.equal(V.songVisits({ songs: [{ people: 3 }, { people: 4 }, {}] }), 7);
  assert.equal(V.songVisits({ songs: [{}] }), null);
  const pins = V.adsPins({ cap: {}, visits: 7, prevVisits: 5 }, L);
  assert.equal(pins.visits.label, "7");
  assert.equal(pins.engagement.label, "not reported");
  assert.match(pins.engagement.vs, /on Growth/);
  assert.match(fs.readFileSync(new URL("../js/hq.js", import.meta.url), "utf8"), /HQLook\.songVisits\(ov\)/);
});

test("a song's Rising pill says what it is compared with", () => {
  assert.deepEqual(L.trendPill({ trend: "rising", momentum: 10.2 }), { cls: "hot", text: "Rising +10% vs the 7 days before" });
  assert.equal(L.trendPill({ trend: "cooling", momentum: -4 }).text, "Cooling -4% vs the 7 days before");
  assert.equal(L.trendPill({ trend: "new" }).text, "New: not 2 full weeks yet");
  assert.equal(L.trendPill(null), null);
});

test("a drawing error is not called Offline: only a request with no answer is", () => {
  const src = fs.readFileSync(new URL("../js/hq.js", import.meta.url), "utf8");
  const sheetPart = src.slice(src.indexOf("function loadSheet()"), src.indexOf("function offSheet("));
  const ovPart = src.slice(src.indexOf("function loadOverview()"), src.indexOf("function drawOverview()"));
  for (const part of [sheetPart, ovPart]) {
    assert.match(part, /answered = true/);
    const c = part.indexOf(".catch(function (e)");
    assert.ok(c > 0 && part.indexOf("if (answered)", c) > c && part.indexOf("if (answered)", c) < part.indexOf('"offline"', c));
  }
});

test("Ads lists Google's unread days as one line, with no web addresses", () => {
  const lines = ["Google Sat 14 Nov: signed out", "Google Sun 15 Nov: Luke to sign in at https://example.com/sign-in?x=1",
    "Google Mon 16 Nov: not read", "TikTok Fri 13 Nov: see https://example.com/tt for the code"];
  const out = L.gapNotes(lines);
  assert.equal(out.filter((l) => /google/i.test(l)).length, 1);
  assert.equal(out[0], "Google not read since 14 Nov (signed out)");
  assert.ok(out.every((l) => !/https?:/.test(l)), out.join(" | "));
  const miss = L.capMissingLine({ notRead: lines });
  assert.doesNotMatch(miss, /https?:|Sun 15 Nov/);
  assert.match(miss, /^Not read: Google not read since 14 Nov/);
});
