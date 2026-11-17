/* A5 (17 Nov 2026, Nova): a 6-week release calendar with every song's steps. One rule on both sides:
   S.sixWeeks (the connector's releases tool, for Nova and Claude) and HQLib.sixWeeks (Upcoming › Planning)
   give the same weeks from the same releases. Made-up songs only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";

await import("../js/hq-lib.js");
const L = globalThis.HQLib;
const TODAY = "2026-11-18"; /* a Wednesday */
const rels = [
  { id: "papermoon", title: "Paper Moon", status: "scheduled", date: "2026-11-27", steps: [
    { key: "upload", label: "Uploaded to RouteNote with the release date", owner: "Drop", due: "2026-11-13", status: "todo" },
    { key: "pitch", label: "Spotify pitch sent", owner: "Atlas", due: "2026-11-20", status: "todo", waiting: true },
    { key: "page", label: "Song page live", owner: "Webmaster", due: "2026-11-20", status: "done" },
    { key: "video", label: "YouTube video scheduled for the release day", owner: "Laura", due: "2026-11-24", status: "todo" },
    { key: "lyrics", label: "Lyrics live on Musixmatch", owner: "Verse", due: "2026-12-04", status: "todo" } ] },
  { id: "slowfade", title: "Slow Fade", status: "draft", date: "2026-12-11", steps: [] },
  { id: "gone", title: "Gone Song", status: "cancelled", date: "2026-11-20", steps: [] },
  { id: "far", title: "Far Away", status: "scheduled", date: "2027-02-05", steps: [{ key: "upload", label: "Uploaded to RouteNote with the release date", owner: "Drop", due: "2027-01-08", status: "todo" }] },
];

test("sixWeeks: Monday-first weeks from this one; release days, open steps on their day, late steps in this week", () => {
  const w = S.sixWeeks(rels, TODAY);
  assert.equal(w.length, 6);
  assert.deepEqual(w.map((x) => x.start), ["2026-11-16", "2026-11-23", "2026-11-30", "2026-12-07", "2026-12-14", "2026-12-21"]);
  assert.equal(w[0].label, "This week");
  assert.equal(w[1].label, "Week of Mon 23 Nov");
  assert.deepEqual(w[0].items.map((i) => [i.kind, i.title, i.owner || "", i.late || false]), [["step", "Paper Moon", "Drop", true]]);
  assert.deepEqual(w[1].items.map((i) => [i.date, i.kind, i.owner || ""]), [["2026-11-24", "step", "Laura"], ["2026-11-27", "release", ""]]);
  assert.deepEqual(w[2].items.map((i) => i.owner), ["Verse"]);
  assert.deepEqual(w[3].items.map((i) => [i.title, i.draft]), [["Slow Fade", true]]);
  assert.equal(w[4].items.length + w[5].items.length, 0, "nothing beyond 6 weeks; cancelled songs never");
});
test("the page's HQLib.sixWeeks gives the same weeks", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(L.sixWeeks(TODAY, rels))), JSON.parse(JSON.stringify(S.sixWeeks(rels, TODAY))));
});
test("sixWeekLines: plain lines for the bots", () => {
  const lines = S.sixWeekLines(S.sixWeeks(rels, TODAY));
  assert.deepEqual(lines[0], { week: "This week", lines: ["Fri 13 Nov · Drop · Uploaded to RouteNote with the release date · Paper Moon · LATE"] });
  assert.deepEqual(lines[1].lines, ["Tue 24 Nov · Laura · YouTube video scheduled for the release day · Paper Moon", "Fri 27 Nov · Paper Moon comes out"]);
  assert.deepEqual(lines[3].lines, ["Fri 11 Dec · Slow Fade comes out (draft: not sent to the team yet)"]);
  assert.deepEqual(lines[4].lines, ["nothing due"]);
});
test("the releases tool gives Nova and Claude six_weeks; other bots don't get it", async () => {
  const d = memoryDesk();
  const now = Date.parse(TODAY + "T15:00:00Z");
  const call = (bot) => callTool(TOOLS.find((t) => t.name === "releases"), { bot }, { store: d, now, role: "bot", hq: async () => null });
  const nova = await call("Nova");
  assert.equal(nova.six_weeks.length, 6);
  assert.equal(nova.six_weeks[0].week, "This week");
  assert.equal((await call("Kevin")).six_weeks, undefined);
});
test("Upcoming › Planning draws the six weeks", () => {
  const js = readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8");
  assert.match(js, /L\.sixWeeks\(/);
  assert.match(js, /The next 6 weeks/);
  assert.match(readFileSync(new URL("../hq.html", import.meta.url), "utf8"), /\.six-weeks/);
});
