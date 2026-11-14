/* The release calendar's team rules (14 Nov 2026, Luke: "drop submits everything … spotify pitch should be
   sent immediately when the song becomes available in spotify and atlas should improve my wording …
   visualiser for laura … web masters job is to create the link for the song … in order of what song is
   next and one week after the previous song releases … make sure the team get all of this too"). */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { INSTRUCTIONS } from "../netlify/lib/staff-tools.mjs";

const NOW = Date.parse("2026-11-14T15:00:00Z"); /* Sat 14 Nov, 12:00 in São Paulo */
const DAY = 86400000;
const R = S.DEFAULT_ROSTER;
const FULL = { kind: "Self-release", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", language: "English", explicit: "No", genre: "Dance", writers: "Sample Writer: music and lyrics", copyright: "℗ 2026 Sample · © 2026 Sample" };
const step = (r, k) => r.steps.find((s) => s.key === k);
async function sent(d, title, date, now = NOW, pack = FULL) {
  const r = await S.saveRelease(d, now, R, { by: "Luke", title, date, pack });
  return (await S.sendRelease(d, now, R, { by: "Luke", id: r.id })).release;
}

test("the visualiser: Luke's link on the form, for Laura's YouTube step", () => {
  const f = S.PACK_FIELDS.find((x) => x.key === "visualiser");
  assert.deepEqual([f.kind, f.group, f.neededBy, f.required, f.fill], ["link", "files", "video", false, []]);
  assert.match(f.hint, /Laura/);
  assert.match(f.hint, /description/);
  assert.throws(() => S.packValue("visualiser", "http://example.com/v.mp4"), /https/);
  const v = S.releaseView({ id: "x", title: "X", date: "2026-12-18", status: "scheduled", pack: FULL, steps: S.scheduleSteps("2026-12-18", "2026-11-14").steps }, "2026-11-14");
  const miss = v.missing.find((m) => m.key === "visualiser");
  assert.deepEqual([miss.required, miss.owner, miss.step], [false, "Laura", "Video scheduled on YouTube"], "missing for Laura's step, not needed to send");
});

test("the pitch is due the day the song shows in Spotify for Artists, whatever its planned day", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Far Song", "2027-01-29"); /* 11 weeks out: the pitch was planned for 15 Jan */
  assert.equal(step(r, "pitch").due, "2027-01-15");
  const shows = NOW + 5 * DAY; /* Thu 19 Nov it shows */
  await S.reportSightings(d, shows, R, { by: "Atlas", releases: [{ title: "Far Song", date: "2027-01-29" }] });
  const after = (await S.listReleases(d)).find((x) => x.id === r.id);
  assert.equal(step(after, "spotify").status, "done");
  assert.equal(step(after, "pitch").due, "2026-11-19", "the pitch goes the same day it shows");
});

test("Webmaster's song page is due a week after the previous song comes out (in release order), never after its own day", async () => {
  const d = memoryDesk();
  const a = await sent(d, "First Song", "2026-12-11");
  assert.equal(step(a, "page").due, "2026-12-04", "no song before it: a week before its own day, as before");
  const b = await sent(d, "Second Song", "2027-01-08");
  assert.equal(step(b, "page").due, "2026-12-18", "a week after First Song is out: Out now has had its week");
  const c = await sent(d, "Close Song", "2027-01-14");
  assert.equal(step(c, "page").due, "2027-01-13", "a week after Second Song would be after its own day: the day before");
  /* Second Song moves after Close Song: the order is First, Close, Second now, and every page not started
     yet follows the new order */
  const moved = (await S.moveRelease(d, NOW, R, { by: "Luke", id: b.id, date: "2027-01-22" })).release;
  assert.equal(step(moved, "page").due, "2027-01-21", "a week after Close Song now");
  const list = await S.listReleases(d), page = (id) => step(list.find((x) => x.id === id), "page").due;
  assert.equal(page(c.id), "2026-12-18", "Close Song comes right after First Song now");
  assert.equal(page(a.id), "2026-12-04");
  assert.deepEqual(S.pageDue("2027-02-05", "2027-01-22", "2026-11-14"), "2027-01-29");
  assert.deepEqual(S.pageDue("2026-11-20", null, "2026-11-14"), "2026-11-14", "a week before would be in the past: today");
});

test("the team gets the rules: the connector's instructions say who does what", () => {
  assert.match(INSTRUCTIONS, /Drop:.*submit.*RouteNote/i);
  assert.match(INSTRUCTIONS, /Drop:.*schedul/i);
  assert.match(INSTRUCTIONS, /Atlas.*pitch.*same day.*Spotify for Artists/i);
  assert.match(INSTRUCTIONS, /Atlas.*(improve|polish|reword).*Luke's words/i);
  assert.match(INSTRUCTIONS, /Laura.*visualiser.*YouTube.*description/i);
  assert.match(INSTRUCTIONS, /Webmaster.*song page.*order/i);
  assert.match(INSTRUCTIONS, /Out now.*7 days|seven days/i);
  assert.match(INSTRUCTIONS, /Verse.*lyrics/i);
  assert.match(INSTRUCTIONS, /4 weeks/);
});
