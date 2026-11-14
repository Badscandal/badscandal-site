/* Planning releases (14 Nov 2026, Luke: "a calender with team reccomendations for next release timelines on
   how long it takes for things to get to the store from routenote etc, and delays issues etc … we want to
   have them scheduled correctly well in advance … when i upload it should suggest dates"). The rules the
   Upcoming page draws with (js/hq-lib.js): suggested release days, the advice on a chosen day, the month. */
import { test } from "node:test";
import assert from "node:assert/strict";

await import("../js/hq-lib.js");
const L = globalThis.HQLib;
const TODAY = "2026-11-14"; /* a Saturday */
const rel = (id, title, date, status = "scheduled", o = {}) => ({ id, title, date, status, steps: [], ...o });

test("the team's rule and how long things take, in plain words", () => {
  assert.deepEqual(L.PLAN_RULE, { recommend: 28, minimum: 21, gap: 14, weekday: "Friday" });
  assert.ok(L.PLAN_TIMELINE.length >= 5);
  for (const x of L.PLAN_TIMELINE) assert.ok(x.what && x.time, JSON.stringify(x));
  assert.ok(L.PLAN_TIMELINE.some((x) => /RouteNote/.test(x.what)));
  assert.ok(L.PLAN_TIMELINE.some((x) => /pitch/i.test(x.what) && /7 days/.test(x.time)));
  assert.ok(L.PLAN_TIMELINE.some((x) => /holiday/i.test(x.what)));
});

test("suggestDates: Fridays at least 4 weeks out, 2 weeks clear of every other song, the soonest first", () => {
  assert.deepEqual(L.suggestDates(TODAY, []).map((s) => s.date), ["2026-12-18", "2026-12-25", "2027-01-01"], "28 days = Sat 12 Dec: the next Friday is 18 Dec");
  const s = L.suggestDates(TODAY, [])[0];
  assert.deepEqual([s.words, s.weeks, s.best], ["Fri 18 Dec", 5, true]);
  assert.match(L.suggestDates(TODAY, [])[1].note, /holiday/i, "Christmas week: the stores are slower");
  /* Me Dá Seu Body on Fri 25 Dec: nothing from 12 Dec to 7 Jan */
  const taken = [rel("mdsb", "Me Dá Seu Body", "2026-12-25")];
  assert.deepEqual(L.suggestDates(TODAY, taken).map((s) => s.date), ["2027-01-08", "2027-01-15", "2027-01-22"]);
  /* the draft being planned doesn't block itself; cancelled songs and songs already out long ago don't count */
  const mine = [rel("surv", "Survivors", "2026-12-18", "draft"), rel("gone", "Gone", "2027-01-01", "cancelled")];
  assert.equal(L.suggestDates(TODAY, mine, { except: "surv" })[0].date, "2026-12-18");
  assert.deepEqual(L.suggestDates(TODAY, mine).map((s) => s.date).slice(0, 2), ["2027-01-01", "2027-01-08"], "another draft with a day keeps its slot");
  assert.equal(L.suggestDates(TODAY, [], { n: 1 }).length, 1);
});

test("planAdvice: what is wrong or risky about a chosen day, in the team's words", () => {
  const others = [rel("mdsb", "Me Dá Seu Body", "2026-12-25")];
  const words = (d, o) => L.planAdvice(d, TODAY, others, o).map((a) => (a.bad ? "!" : "") + a.text);
  assert.deepEqual(words("2027-01-15"), [], "a Friday, 9 weeks out, 3 weeks after the last song: nothing to say");
  assert.deepEqual(words("2026-11-27"), ["!Only 13 days away: RouteNote and the stores need 3 weeks at the very least (4 is the team's rule). The Spotify pitch may miss."]);
  assert.deepEqual(words("2026-12-11"), ["27 days away: it can work, but 4 weeks is the team's rule."]);
  assert.deepEqual(words("2027-01-01"), ["!Me Dá Seu Body comes out on Fri 25 Dec: leave 2 weeks between songs (a week as Out now, a week as next).", "Holiday weeks: the stores are slower, allow an extra week."]);
  assert.deepEqual(words("2027-01-13"), ["Songs come out on Fridays: Fri 15 Jan is the nearest."]);
  assert.deepEqual(words("2027-01-01", { except: "mdsb" }).filter((t) => /Me Dá/.test(t)), [], "a release never clashes with itself");
  assert.deepEqual(L.planAdvice("", TODAY, others), []);
  assert.deepEqual(L.planAdvice("2026-11-01", TODAY, others), [], "a day already gone is said elsewhere (recorded as already out)");
});

test("calendarMonth: weeks from Monday, release days and the open steps due each day", () => {
  const r = rel("mdsb", "Me Dá Seu Body", "2026-12-25", "scheduled", { steps: [
    { key: "lyrics", label: "Lyrics live", owner: "Verse", due: "2026-12-15", status: "todo" },
    { key: "upload", label: "Uploaded to RouteNote with the release date", owner: "Drop", due: "2026-12-04", status: "done" },
    { key: "pitch", label: "Spotify pitch sent", owner: "Atlas", due: "2026-12-11", status: "todo", waiting: true },
  ] });
  const m = L.calendarMonth("2026-12", [r, rel("surv", "Survivors", "2026-12-18", "draft"), rel("x", "Gone", "2026-12-04", "cancelled")], TODAY);
  assert.equal(m.title, "December 2026");
  assert.deepEqual([m.prev, m.next], ["2026-11", "2027-01"]);
  assert.equal(m.weeks.length, 5);
  assert.equal(m.weeks[0][0].date, "2026-11-30", "the first row starts on the Monday before the 1st");
  assert.equal(m.weeks[0][0].inMonth, false);
  const day = (d) => m.weeks.flat().find((c) => c.date === d);
  assert.deepEqual(day("2026-12-25").items, [{ kind: "release", id: "mdsb", title: "Me Dá Seu Body", draft: false }]);
  assert.deepEqual(day("2026-12-18").items, [{ kind: "release", id: "surv", title: "Survivors", draft: true }], "a draft's planned day shows too");
  assert.deepEqual(day("2026-12-15").items, [{ kind: "step", id: "mdsb", title: "Me Dá Seu Body", label: "Lyrics live", owner: "Verse", late: false }]);
  assert.deepEqual(day("2026-12-04").items, [], "done steps and cancelled songs are not on the calendar");
  assert.deepEqual(day("2026-12-11").items, [], "a waiting step has no real day yet");
  const n = L.calendarMonth("2026-11", [rel("old", "Old", "2026-11-20", "scheduled", { steps: [{ key: "page", label: "Song page live on badscandal.com", owner: "Webmaster", due: "2026-11-10", status: "todo" }] })], TODAY);
  assert.equal(n.weeks.flat().find((c) => c.date === "2026-11-14").today, true);
  assert.equal(n.weeks.flat().find((c) => c.date === "2026-11-10").items[0].late, true, "a step past its day and not done is late");
  assert.equal(L.calendarMonth("bad", [], TODAY).title, "November 2026", "nonsense falls back to this month");
});
