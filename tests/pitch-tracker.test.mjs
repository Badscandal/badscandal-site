/* L7 (18 Nov 2026): the Spotify pitch tracker. Status (not pitched / pitched with the day / missed),
   the deadline (7 days before release; a warning from 14 days out, while there is still time), the
   one-pitch rule, and editorial playlist adds Atlas records. HQ never pitches and never calls Spotify.
   Made-up songs only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, INSTRUCTIONS, toolsFor } from "../netlify/lib/staff-tools.mjs";

await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const NOW = Date.parse("2026-11-12T12:20:00Z"); /* Thu 12 Nov, 09:20 São Paulo */
const TODAY = "2026-11-12";
const R = S.DEFAULT_ROSTER;
const fails = (p, re) => assert.rejects(p, (e) => e.name === "StaffError" && re.test(e.message));
const FULL = { kind: "Self-release", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", language: "English", explicit: "No", genre: "Dance", writers: "Sample Writer: music and lyrics", copyright: "℗ 2026 Sample · © 2026 Sample" };
const call = (d, name, args, now = NOW) => callTool(TOOLS.find((t) => t.name === name), args, { store: d, now, role: "bot", hq: null });
async function sent(d, title, date, now = NOW) {
  const r = await S.saveRelease(d, now, R, { by: "Luke", title, date, pack: FULL });
  return (await S.sendRelease(d, now, R, { by: "Luke", id: r.id })).release;
}
const view = async (d, title, now = NOW) => S.releaseView((await S.listReleases(d)).find((r) => r.title === title), S.spDay(now));
async function openPitch(d, title, now = NOW) {
  const r = (await S.listReleases(d)).find((x) => x.title === title);
  await S.setStep(d, now, R, { by: "Drop", id: r.id, step: "approved", status: "done" });
  await S.setStep(d, now, R, { by: "Atlas", id: r.id, step: "spotify", status: "done" });
}

/* one song per desk: two songs inside 14 days would trip the one-pitch rule and hide the status under test */
async function one(title, date) {
  const d = memoryDesk();
  await sent(d, title, date);
  await openPitch(d, title);
  return d;
}
test("pitch status: not pitched, pitched with the day, missed; the deadline is 7 days before", async () => {
  const far = await one("Far Song", "2026-12-11"); /* 29 days out: a deadline, no warning yet */
  let v = await view(far, "Far Song");
  assert.equal(v.pitch.status, "not pitched");
  assert.equal(v.pitch.deadline, "2026-12-04");
  assert.equal(v.pitch.line, "Pitch: not pitched. Deadline Fri 4 Dec");
  assert.ok(!v.warnings.some((w) => /Still time to pitch|Last day to pitch|Too late for a Spotify pitch/.test(w)), v.warnings.join("\n"));

  const win = await one("Window", "2026-11-26"); /* 14 days: still time */
  v = await view(win, "Window");
  assert.equal(v.pitch.status, "not pitched");
  assert.equal(v.pitch.line, "Pitch: not pitched. Still time: send it by Thu 19 Nov");
  assert.ok(v.warnings.includes("Still time to pitch: send it by Thu 19 Nov (Spotify needs it 7 days before release)"));

  const edge = await one("Edge", "2026-11-27"); /* 15 days: not yet */
  v = await view(edge, "Edge");
  assert.ok(!v.warnings.some((w) => /Still time to pitch/.test(w)));
  assert.equal(v.pitch.line, "Pitch: not pitched. Deadline Fri 20 Nov");

  const last = await one("Last Day", "2026-11-19"); /* 7 days: the last day, not missed */
  v = await view(last, "Last Day");
  assert.equal(v.pitch.status, "not pitched");
  assert.ok(v.warnings.includes("Last day to pitch: Spotify needs it today (7 days before release)"));
  assert.ok(!v.warnings.some((w) => /Too late for a Spotify pitch/.test(w)));

  const late = await one("Late One", "2026-11-18"); /* 6 days: missed */
  v = await view(late, "Late One");
  assert.equal(v.pitch.status, "missed");
  assert.equal(v.pitch.line, "Pitch: missed. Spotify needed it by Wed 11 Nov");
  assert.ok(v.warnings.includes("Too late for a Spotify pitch: Spotify needs it 7 days before release"));
  assert.ok(!v.warnings.some((w) => /Still time to pitch|Last day to pitch/.test(w)));

  const logged = await call(win, "pitch_log", { bot: "Atlas", song: "Window", pitched_on: "2026-11-12" });
  assert.equal(logged.status, "pitched");
  assert.equal(logged.pitch, "Pitch: pitched Thu 12 Nov by Atlas"); /* 18 Nov 2026: who sent it, on the pitch line */
  assert.equal(logged.pitched_on, "Thu 12 Nov (2026-11-12)");
  assert.match(logged.note, /never pitches/);
  v = await view(win, "Window");
  assert.equal(v.pitch.status, "pitched");
  assert.equal(v.steps.find((s) => s.key === "pitch").status, "done");
  assert.equal(v.steps.find((s) => s.key === "pitch").doneOn, "2026-11-12");
  assert.ok(!v.warnings.some((w) => /Still time to pitch|Last day to pitch|Too late/.test(w)), "a pitch that went out is not warned about");
  const again = await call(win, "pitch_log", { bot: "Atlas", song: "Window", pitched_on: "2026-11-12" });
  assert.equal(again.already, "Already recorded. Nothing new.");
});

test("the one-pitch rule: the later song is not pitched, and it is not missed", async () => {
  const d = memoryDesk();
  await sent(d, "First", "2026-12-04");
  await sent(d, "Second", "2026-12-11"); /* 7 days after First: skipped */
  const early = await view(d, "Second");
  assert.equal(early.pitch.status, "not pitched");
  assert.equal(early.pitch.skipped, true);
  assert.match(early.pitch.line, /^Pitch: not this time\. First \(out Fri 4 Dec\) has the pitch for these two weeks, and Spotify takes one pitch at a time\.$/);
  assert.ok(!early.warnings.some((w) => /Still time|Last day|Too late|missed/i.test(w)));
  /* the deadline has passed for Second, and it is still not "missed" */
  const late = await view(d, "Second", Date.parse("2026-12-08T15:00:00Z"));
  assert.equal(late.pitch.status, "not pitched");
  assert.equal(late.pitch.skipped, true);
  assert.ok(!late.warnings.some((w) => /Too late for a Spotify pitch/.test(w)));
  await fails(call(d, "pitch_log", { bot: "Atlas", song: "Second", pitched_on: "2026-11-12" }), /Nothing was saved/);
  await fails(S.setStep(d, NOW, R, { by: "Atlas", id: "second", step: "pitch", status: "done" }), /Not pitched: First/);
  const slots = S.pitchSlots([await view(d, "First"), await view(d, "Second")], TODAY);
  assert.equal(slots.length, 1);
  assert.equal(slots[0].title, "First");
  assert.deepEqual(slots[0].also.map((a) => a.title), ["Second"]);
  const block = L.pitchBlock(slots);
  assert.equal(block[0].title, "First");
  assert.match(block[0].also, /^Also in these two weeks, not pitched: Second/);
});

test("a pitch that is still waiting is not 'still time', and it cannot be recorded yet", async () => {
  const d = memoryDesk();
  await sent(d, "Wait", "2026-11-26");
  const v = await view(d, "Wait");
  assert.equal(v.pitch.waiting, true);
  assert.match(v.pitch.line, /waits until the song shows in Spotify for Artists/);
  assert.ok(!v.warnings.some((w) => /Still time to pitch/.test(w)), v.warnings.join("\n"));
  assert.ok(v.warnings.some((w) => /Not showing in Spotify for Artists yet/.test(w)));
  await fails(call(d, "pitch_log", { bot: "Atlas", song: "Wait", pitched_on: "2026-11-12" }), /waiting/);
});

test("editorial playlists: after release, once each, and not before", async () => {
  const d = memoryDesk();
  await sent(d, "Night Drive", "2026-11-20");
  await fails(call(d, "pitch_log", { bot: "Atlas", song: "Night Drive", playlist: "Dance Rising", added_on: "2026-11-12" }), /once Night Drive is out/);
  const day = Date.parse("2026-11-20T15:00:00Z"); /* release day, noon São Paulo */
  const add = await call(d, "pitch_log", { bot: "Atlas", song: "Night Drive", playlist: "Dance Rising", added_on: "2026-11-20" }, day);
  assert.equal(add.editorial, "Dance Rising");
  assert.equal(add.added_on, "Fri 20 Nov (2026-11-20)");
  const v = await view(d, "Night Drive", day);
  assert.deepEqual(v.pitch.editorial.map((e) => [e.name, e.date]), [["Dance Rising", "2026-11-20"]]);
  const dup = await call(d, "pitch_log", { bot: "Atlas", song: "night drive", playlist: "dance rising", added_on: "2026-11-20" }, day);
  assert.equal(dup.already, "Already recorded. Nothing new.");
  assert.equal((await view(d, "Night Drive", day)).pitch.editorial.length, 1);
  await call(d, "pitch_log", { bot: "Nova", song: "Night Drive", playlist: "Fresh Finds", added_on: "2026-11-20" }, day);
  assert.deepEqual((await view(d, "Night Drive", day)).pitch.editorial.map((e) => e.name), ["Dance Rising", "Fresh Finds"]);
  await fails(call(d, "pitch_log", { bot: "Atlas", song: "Night Drive", playlist: "Dance Rising", added_on: "2026-11-19" }, day), /before the release/);
  await fails(call(d, "pitch_log", { bot: "Atlas", song: "Night Drive", playlist: "Too Soon", added_on: "2026-11-21" }, day), /future/);
  await fails(call(d, "pitch_log", { bot: "Drop", song: "Night Drive", playlist: "Dance Rising", added_on: "2026-11-20" }, day), /Only Atlas/);
  await fails(call(d, "pitch_log", { bot: "Atlas", song: "Night Drive" }, day), /Say what you saw/);
});

test("the releases tool shows the pitch and the slots; Atlas is told to log a new editorial playlist", async () => {
  const d = memoryDesk();
  await sent(d, "Night Drive", "2026-11-26");
  await openPitch(d, "Night Drive");
  await call(d, "pitch_log", { bot: "Atlas", song: "Night Drive", pitched_on: "2026-11-12" });
  const out = await call(d, "releases", { bot: "Atlas" });
  const row = out.releases.find((r) => r.song === "Night Drive");
  assert.equal(row.pitch.status, "pitched");
  assert.equal(row.pitch.line, "Pitch: pitched Thu 12 Nov by Atlas");
  assert.ok(out.pitch_slots.some((s) => /Night Drive/.test(s) && /pitched Thu 12 Nov by Atlas/.test(s)));
  const pack = await call(d, "release_pack", { bot: "Atlas", song: "Night Drive" });
  assert.equal(pack.pitch.status, "pitched");
  const day = await call(d, "my_day", { bot: "Atlas" });
  assert.match(day.next, /pitch_log/);
  assert.match(day.next, /editorial playlist/);
  assert.match(day.next, /HQ never pitches/);
  assert.equal(day.next.split("spotify_upcoming").length - 1, 1);
  assert.match(INSTRUCTIONS, /new editorial playlist in Spotify for Artists/);
  assert.match(INSTRUCTIONS, /HQ never pitches a song and never changes Spotify/);
  const tool = TOOLS.find((t) => t.name === "pitch_log");
  assert.match(tool.description, /never pitches/);
  assert.match(tool.description, /editorial playlist/);
  assert.ok(toolsFor("Atlas", R).some((t) => t.name === "pitch_log"));
  assert.ok(!toolsFor("Drop", R).some((t) => t.name === "pitch_log"));
  assert.ok(!toolsFor("Laura", R).some((t) => t.name === "pitch_log"));
  const src = readFileSync(new URL("../netlify/lib/staff.mjs", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export async function logPitch"), src.indexOf("/* Drop (Nova, Claude, Luke): where the song is at the distributor"));
  assert.ok(fn.length > 200);
  assert.doesNotMatch(fn, /fetch\(|api\.spotify|spotify\.com/);
});

test("still time to pitch is a caution, not a red Needs attention line (18 Nov 2026)", () => {
  const text = "Still time to pitch: send it by Thu 19 Nov (Spotify needs it 7 days before release)";
  const board = { releases: [{ id: "window", title: "Window", status: "scheduled", alreadyOut: false, daysToGo: 10, warnings: [text], steps: [] }] };
  assert.equal(L.warnTone(text, board.releases[0]), "caution");
  assert.deepEqual(L.releaseAttention(null, board), []);
  assert.equal(L.relStatus(board.releases[0], "2026-11-12").caution, true);
  assert.equal(L.relStatus(board.releases[0], "2026-11-12").bad, false);
});
