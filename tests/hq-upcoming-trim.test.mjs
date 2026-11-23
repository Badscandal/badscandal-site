/* Upcoming, trimmed (23 Nov 2026, Luke): the next 6 weeks and the Spotify pitches go (he has the calendar),
   "In Spotify for Artists" shows only a song that skipped Upcoming (the steps cover the rest), and "What the
   distributor said" reads at a glance: "a lot to see many brackets etc, make it simpler to digest when
   glancing". Made-up names and numbers. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const store = {
  status: "approved", since: "2026-11-17", by: "Drop",
  history: [
    { status: "approved", on: "2026-11-17", by: "Drop", note: 'The distributor shows "Approved: 17/11/26" (UPC 0000000000017), no moderator comments.' },
    { status: "in moderation", on: "2026-11-16", by: "Drop", note: "Read 16 Nov 09:33: Pending Moderation (In Review tab), no comments." },
    { status: "resubmitted", on: "2026-11-14", by: "Drop", note: "Resubmitted on Luke's yes in chat." },
    { status: "rejected", on: "2026-11-09", by: "Drop", reason: "RouteNote Action Needed: proof of rights for Sample Singer to be emailed to the moderation team, then resubmit (Drop's summary, not the verbatim text).", note: "Proof sent before the resubmit." },
    { status: "uploaded", on: "2026-11-06", by: "Drop", note: "Went straight to In Review." },
  ],
};

test("the distributor's history: the day, one word, and a reason only for a rejection; no brackets", () => {
  const rows = L.storeRows(store);
  assert.deepEqual(rows.map((r) => [r.day, r.word, r.tone]), [
    ["Tue 17 Nov", "Approved", "ok"], ["Mon 16 Nov", "In review", ""], ["Sat 14 Nov", "Resubmitted", ""],
    ["Mon 9 Nov", "Rejected", "bad"], ["Fri 6 Nov", "Uploaded", ""]]);
  assert.equal(rows[3].why, "Proof of rights for Sample Singer to be emailed to the moderation team, then resubmit");
  assert.ok(rows.filter((r, i) => i !== 3).every((r) => r.why === ""), "notes stay on the desk");
  for (const line of L.storeHistory(store)) assert.doesNotMatch(line, /[()]/, line);
  assert.equal(L.storeLine(store), "At the distributor: Approved since Tue 17 Nov");
  assert.equal(L.storeLine({ status: "rejected", since: "2026-11-09", reason: "Action needed: the artwork has a web address on it (seen twice)." }),
    "At the distributor: Rejected since Mon 9 Nov · The artwork has a web address on it");
});

test("a long reason is cut at a word, and stray brackets never show", () => {
  assert.equal(L.storeWhy("cover (see (nested) note) is blurry"), "Cover is blurry");
  assert.equal(L.storeWhy("half open ( bracket"), "Half open bracket");
  const long = L.storeWhy("word ".repeat(60));
  assert.ok(long.length <= 141 && long.endsWith("…"), long);
});

test("the page: no six weeks, no pitch tile; Spotify for Artists shows only what needs Luke", () => {
  const staff = readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  assert.doesNotMatch(staff, /sixTitle|pitchTitle/);
  assert.match(page, /<div id="relSpotWrap" hidden>/);
  const draw = staff.slice(staff.indexOf("function drawSpotify()"), staff.indexOf('$("relSpot").addEventListener("input"'));
  assert.match(draw, /wrap\.hidden = !\(ask\.length \|\| rest\.length\)/);
  assert.doesNotMatch(draw, /sightingsHead|sv\.note/, "no 'Atlas looked at…' or his note");
  assert.match(staff, /<ul class=\\"slog\\">/);
  assert.doesNotMatch(staff, /What the distributor said \(/, "no count in brackets");
});
