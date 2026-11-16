/* The Upcoming tab, overhauled (15 Nov 2026, Luke: "its too chaotic … make it more user friendly"). What
   needs Luke comes first; each song is a compact card (its day, a progress bar, ONE status line: the most
   urgent problem, else the next step) and the rest (every step, warning, history, files) folds behind one tap.
   Rules in js/hq-lib.js: relStatus, relProgress, upcomingAsks, stepGroups. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;
const TODAY = "2026-11-15";

const step = (key, label, owner, due, o = {}) => ({ key, label, owner, due, status: "todo", ...o });
const rel = (o = {}) => ({ id: "night", title: "Night Drive", date: "2026-12-11", status: "scheduled", warnings: [], counts: { done: 1, total: 4 },
  steps: [step("upload", "Uploaded to RouteNote with the release date", "Drop", "2026-11-13", { status: "done", by: "Drop" }),
    step("spotify", "Showing as upcoming in Spotify for Artists", "Atlas", "2026-11-26"),
    step("pitch", "Spotify pitch sent", "Atlas", "2026-11-27", { waiting: true, waitingText: "waiting: the song is not in Spotify for Artists yet" }),
    step("video", "YouTube video scheduled for the release day", "Laura", "2026-12-04")], ...o });

test("relStatus: one line, the most urgent first: a warning (with how many more), else the next step someone can do", () => {
  assert.deepEqual(L.relStatus(rel({ warnings: ["Lyrics live is 2 days late (Verse)", "Sent 12 days before release"] }), TODAY),
    { text: "Lyrics live is 2 days late (Verse)", bad: true, more: 1 });
  /* no warnings: the soonest open step that isn't waiting */
  assert.deepEqual(L.relStatus(rel(), TODAY), { text: "Next: Spotify for Artists · Atlas · Thu 26 Nov", bad: false, more: 0 });
  const vid = rel({ steps: [step("video", "YouTube video scheduled for the release day", "Laura", "2026-11-20")] });
  assert.equal(L.relStatus(vid, TODAY).text, "Next: video · Laura · Fri 20 Nov");
  /* the lyrics wait for the release day (15 Nov 2026) */
  const ly = rel({ steps: [step("lyrics", "Lyrics live on Musixmatch", "Verse", "2026-12-18", { waiting: true, waitingText: "waiting: starts on the release day, once the song shows on Musixmatch" })] });
  assert.equal(L.relStatus(ly, TODAY).text, "Waiting: starts on the release day, once the song shows on Musixmatch");
  /* a late step with no warning (an old copy): red, with how late */
  const late = rel({ steps: [step("lyrics", "Lyrics live", "Verse", "2026-11-12")] });
  assert.deepEqual(L.relStatus(late, TODAY), { text: "Late: lyrics · Verse · 3 days", bad: true, more: 0 });
  /* only waiting steps left */
  const wait = rel({ steps: [step("pitch", "Spotify pitch sent", "Atlas", "2026-11-27", { waiting: true, waitingText: "waiting: the song is not in Spotify for Artists yet" })] });
  assert.deepEqual(L.relStatus(wait, TODAY), { text: "Waiting: the song is not in Spotify for Artists yet", bad: false, more: 0 });
  /* everything done or skipped */
  assert.deepEqual(L.relStatus(rel({ steps: [step("upload", "x", "Drop", "2026-11-13", { status: "done" }), step("approved", "y", "Drop", "2026-11-14", { status: "skipped" })] }), TODAY),
    { text: "All steps done", bad: false, more: 0 });
});

test("relProgress: done of the steps that count (skipped ones don't), and a whole percentage", () => {
  assert.deepEqual(L.relProgress({ counts: { done: 1, total: 4 } }), { done: 1, total: 4, pct: 25, text: "1 of 4 steps done" });
  assert.deepEqual(L.relProgress({ counts: { done: 0, total: 0 } }), { done: 0, total: 0, pct: 0, text: "" });
  assert.deepEqual(L.relProgress({ counts: { done: 2, total: 3 } }).pct, 67);
  assert.deepEqual(L.relProgress({}), { done: 0, total: 0, pct: 0, text: "" });
});

test("stepGroups: what is still to do (soonest first, problems on top) apart from what is done or not ours", () => {
  const g = L.stepGroups(rel({ steps: [
    step("upload", "Upload", "Drop", "2026-11-13", { status: "done" }),
    step("approved", "Approved", "Drop", "2026-11-14", { status: "skipped" }),
    step("page", "Page", "Webmaster", "2026-12-04"),
    step("lyrics", "Lyrics", "Verse", "2026-11-20", { status: "blocked", note: "x" }),
    step("spotify", "Spotify", "Atlas", "2026-11-26")] }), TODAY);
  assert.deepEqual(g.open.map((s) => s.key), ["lyrics", "spotify", "page"]);
  assert.deepEqual(g.done.map((s) => s.key), ["upload", "approved"]);
});

test("upcomingAsks: what on this tab waits on Luke, each with where it goes", () => {
  const board = {
    today: TODAY,
    releases: [rel(),
      rel({ id: "slow", title: "Slow Fade", date: "2026-12-25" }),
      rel({ id: "old", title: "Old One", date: "2026-11-01", released: true }),
      { id: "surv", title: "Survivors", status: "draft", steps: [] }],
    messages: [
      { id: "m1", from: "Drop", to: "Luke", ask: "resubmit", release: "night", resolved: null, needs: "decision", text: "Resubmit?" },
      { id: "m2", from: "Atlas", to: "Luke", approval: { id: "slow", title: "Slow Fade", what: "pitch" }, resolved: null, needs: "decision", text: "Pitch OK?" },
      { id: "m3", from: "Verse", to: "Luke", approval: { id: "night", title: "Night Drive", what: "lyrics" }, resolved: { by: "Luke" }, needs: "decision", text: "done already" }],
    sightings: { items: [{ key: "velvet", title: "Velvet Night", state: "unknown" }, { key: "touch", title: "Touch Me", state: "pipeline" }] },
  };
  assert.deepEqual(L.upcomingAsks(board, TODAY), [
    { kind: "resubmit", id: "night", text: "Night Drive: Drop asks whether to resubmit it to the distributor", go: "card" },
    { kind: "approval", id: "slow", text: "Slow Fade: Atlas asks you to approve the pitch", go: "message", msg: "m2" },
    { kind: "spotify", id: "velvet", text: "Velvet Night is in Spotify for Artists: say what it is", go: "spotify" },
  ], "an out song and a draft ask nothing; no release step is Luke's (the teaser step went, 15 Nov 2026)");
  assert.deepEqual(L.upcomingAsks({ today: TODAY, releases: [], messages: [] }, TODAY), []);
  assert.deepEqual(L.upcomingAsks(null, TODAY), []);
});

test("the page: Needs you, Coming up, In the pipeline, Planning, In Spotify for Artists, in that order", () => {
  const page = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  const sec = page.slice(page.indexOf('id="releases"'), page.indexOf('id="money"'));
  const order = ['id="relNow"', 'relh">Coming up<', 'relh">In the pipeline<', 'relh">Planning<', '>In Spotify for Artists<'].map((t) => sec.indexOf(t));
  assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), "order: " + order);
  assert.ok(sec.indexOf('id="relDesk"') > sec.indexOf("Coming up") && sec.indexOf('id="relDesk"') < sec.indexOf("In the pipeline"));
  assert.ok(sec.indexOf('id="relPlan"') > sec.indexOf("Planning<"));
});
