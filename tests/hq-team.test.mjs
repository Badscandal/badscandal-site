/* Team, simpler (13 Nov 2026, Luke: "the team section … making more sense being simpler and better").
   The rules the page draws with (js/hq-lib.js): three groups (stuck / haven't checked in / on track), the
   counts on top, the ONE list of what is wrong with a stuck bot, and the one line saying what is next. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleBoard } from "../netlify/lib/staff-sample.mjs";

await import("../js/hq-lib.js");
const L = globalThis.HQLib;
const b = sampleBoard(Date.parse("2026-11-12T19:00:00Z")); /* Thu 12 Nov, 16:00 in São Paulo */
const views = L.sortWorkers(b.staff.map((w) => L.workerView(w, null, b.today)));
const bot = (n) => views.find((w) => w.name === n);

test("teamGroups: stuck = blocked or late; haven't checked in = quiet; the rest are on track; order kept", () => {
  const g = L.teamGroups(views);
  /* Atlas is on track since 16 Nov 2026: his Spotify for Artists step waits while RouteNote (Drop, blocked) hasn't approved the song */
  assert.deepEqual(g.stuck.map((w) => w.name), ["Drop", "Kevin", "Laura", "Spark"]);
  /* 24 Nov 2026, Luke: money removed from HQ. Ledger and Sheet wait for new work: no duty time, so Sheet is no
     longer "quiet", and the sample's Ledger payment update is gone */
  assert.deepEqual(g.quiet.map((w) => w.name), ["Alfred", "Verse", "Webmaster"]);
  assert.deepEqual(g.onTrack.map((w) => w.name), ["Forge", "Atlas", "Steve", "Ledger", "Licence", "Nova", "Sheet"]);
  assert.equal(g.stuck.length + g.quiet.length + g.onTrack.length, views.length, "every bot once");
  assert.deepEqual(L.teamGroups([]), { stuck: [], quiet: [], onTrack: [] });
});

test("teamCounts: the three numbers on top", () => {
  assert.deepEqual(L.teamCounts(views), { stuck: 4, quiet: 3, onTrack: 7, total: 14 }); /* 24 Nov 2026: Sheet waits for new work, not quiet */
});

test("botProblems: only what is wrong, in words, blocked before late; nothing for a bot on track", () => {
  assert.deepEqual(L.botProblems(bot("Kevin"), b.today), [{ what: "Log TikTok followers + best post", why: "Blocked: TikTok login expired" }]);
  assert.deepEqual(L.botProblems(bot("Drop"), b.today), [{ what: "Approved by RouteNote", why: "Me Dá Seu Body · blocked: RouteNote wants a cover without the web address on it. Needs a new cover from Luke." }]);
  const atlas = L.botProblems(bot("Atlas"), b.today);
  assert.deepEqual(atlas, [], "a step waiting for RouteNote's approval is not a problem (16 Nov 2026); a done duty neither");
  assert.equal(bot("Atlas").releaseSteps.find((s) => s.key === "spotify").waitingText, "waiting: RouteNote has not approved it yet");
  assert.deepEqual(L.botProblems(bot("Laura"), b.today), [{ what: "Log YouTube subscribers", why: "Late (due 00:30)" }], "with its time when the duty has one");
  assert.deepEqual(L.botProblems(bot("Forge"), b.today), []);
  /* a blocked bot with nothing listed: its own last word says why */
  assert.deepEqual(L.botProblems({ state: "blocked", duties: [], releaseSteps: [], last: { at: b.today + " 10:00", status: "blocked", message: "Sheet won't open" } }, b.today), [{ what: "Said it is blocked", why: "Sheet won't open" }]);
});

test("botNext: one line for the compact row", () => {
  assert.equal(L.botNext(bot("Forge"), b.today), "Next: Check the monthly ad cap · 23:30");
  assert.equal(L.botNext(bot("Verse"), b.today), "No update today", "the lyrics wait for the release day (15 Nov 2026): nothing to do yet");
  assert.equal(L.botNext(bot("Webmaster"), b.today), "Working on: Song page live on badscandal.com · Me Dá Seu Body", "a step already being worked on comes first");
  assert.equal(L.botNext(bot("Steve"), b.today), "All done today");
  assert.equal(L.botNext(bot("Ledger"), b.today), "Nothing to do today", "24 Nov 2026, money removed from HQ: Ledger waits for new work");
  assert.equal(L.botNext(bot("Nova"), b.today), "Nothing to do today", "not the pill's words twice");
  assert.equal(L.botNext(bot("Alfred"), b.today), "No update today");
  assert.equal(L.botNext({ state: "paused" }, b.today), "Paused");
});
