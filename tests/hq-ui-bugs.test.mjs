/* Batch A1 (17 Nov 2026): the HQ UI bugs from the bots' round 2.
   1. "Invalid Date" on Sheet deadlines that aren't YYYY-MM-DD: show the text as written.
   2. The phone's bottom bar over the end of a page: the space under the page follows the bar's real height.
   3. Signed out: the More sheet put "Log out" exactly under the More button (a second tap logged out);
      the login now says why it appeared, so a sign-out can be traced.
   4. "on time" next to a red warning on the same song.
   5. Growth "– in 7 days" with fewer than 7 days of readings: the oldest reading, "in N days".
   Made-up names and numbers only (public repo). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { growthReport } from "../netlify/lib/hq.mjs";

await import("../js/hq-lib.js");
const L = globalThis.HQLib;
const src = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

/* ---------- 1. deadlines ---------- */
test("day(): a real date reads as a date, anything else as written, never Invalid Date", () => {
  assert.equal(L.day("2026-11-20"), "Fri 20 Nov");
  assert.equal(L.day("2026-11-20 09:15"), "Fri 20 Nov");
  assert.equal(L.day("Friday"), "Friday");
  assert.equal(L.day("15/11"), "15/11");
  assert.equal(L.day("end of the month"), "end of the month");
  assert.equal(L.day("2026-13-45"), "2026-13-45");
  assert.equal(L.day(""), "");
  for (const x of ["ASAP", "20 Nov", "next week", "2026-11"]) assert.doesNotMatch(L.day(x), /Invalid/);
});
test("hq.js uses the same day() and never cuts a deadline to 10 characters first", () => {
  const js = src("js/hq.js");
  assert.match(js, /function day\(d\) \{ return d \? L\.day\(d\) : "–"; \}/);
  assert.doesNotMatch(js, /deadline\.slice\(0, 10\)/);
});

/* ---------- 2. the bottom bar ---------- */
test("navPad(): the space under a page = the bar's height from the bottom of the screen + 24 px", () => {
  assert.equal(L.navPad({ top: 584, height: 70 }, 664), 104);
  assert.equal(L.navPad({ top: 500, height: 130 }, 664), 188); /* a taller bar (bigger text) */
  assert.equal(L.navPad({ top: 0, height: 0 }, 664), 0);       /* hidden (desktop rail / login) */
  assert.equal(L.navPad(null, 664), 0);
});
test("the page's bottom space follows the bar (CSS var set by hq-shell.js)", () => {
  const html = src("hq.html"), shell = src("js/hq-shell.js");
  assert.match(html, /main\{padding-bottom:max\(calc\(156px \+ env\(safe-area-inset-bottom\)\),var\(--navpad,0px\)\)\}/);
  assert.match(shell, /--navpad/);
  assert.match(shell, /L\.navPad\(/);
});

/* ---------- 3. signed out ---------- */
test("the More sheet stays above the bar, so a second tap on More closes it instead of hitting Log out", () => {
  const html = src("hq.html"), shell = src("js/hq-shell.js");
  assert.match(html, /body\.more-open \.nav\{z-index:45\}/);
  assert.match(html, /#moreSheet\{padding-bottom:calc\(var\(--navpad,96px\) \+ 8px\)\}/);
  assert.match(shell, /classList\.(add|toggle)\("more-open"/);
});
test("signoutWords(): the login says why it appeared", () => {
  const now = Date.parse("2026-11-17T15:00:00Z");
  assert.equal(L.signoutWords({ at: now - 60000, why: "button" }, now), "You logged out with the Log out button at 11:59.");
  assert.equal(L.signoutWords({ at: now - 60000, why: "401", what: "/api/staff/board" }, now), "Signed out at 11:59: the site no longer saw your login (the team's desk answered “not logged in”). Log in again.");
  assert.equal(L.signoutWords({ at: now - 2 * 86400000, why: "button" }, now), ""); /* older than a day: say nothing */
  assert.equal(L.signoutWords(null, now), "");
});
test("hq.js remembers why the login appeared (bs_hq_signout) and the logout sweep keeps it", () => {
  const js = src("js/hq.js");
  assert.match(js, /bs_hq_signout/);
  assert.match(js, /L\.signoutWords\(/);
});

/* ---------- 4. on time next to a warning ---------- */
const sheetWith = (rel) => ({ money: { cap: { status: "ok", left: 500, currency: "USD" } }, next: rel, releases: [rel], songs: [] });
test("briefing: never 'everything is on time' when the song has a warning or a blocked step", () => {
  const warn = { song: "Paper Moon", daysToGo: 9, steps: [{ label: "Uploaded to RouteNote with the release date", owner: "Drop", late: false }], warnings: ["Rejected at the distributor: cover has text (Drop)"] };
  const b1 = L.briefing({ sheet: sheetWith(warn), attention: [] }).join(" ");
  assert.doesNotMatch(b1, /on time/);
  assert.match(b1, /Paper Moon is out in 9 days; Rejected at the distributor: cover has text \(Drop\)\./);
  const two = { ...warn, warnings: ["First thing (Drop)", "Second thing (Atlas)"] };
  assert.match(L.briefing({ sheet: sheetWith(two), attention: [] }).join(" "), /First thing \(Drop\) \(\+1 more\)\./);
  const blocked = { song: "Paper Moon", daysToGo: 9, steps: [{ label: "Song page live", owner: "Webmaster", late: false, done: false, note: "blocked: no cover yet" }] };
  const b2 = L.briefing({ sheet: sheetWith(blocked), attention: [] }).join(" ");
  assert.doesNotMatch(b2, /on time/);
  assert.match(b2, /1 step is blocked/);
  const fine = { song: "Paper Moon", daysToGo: 9, steps: [{ label: "Song page live", owner: "Webmaster", late: false, done: true, note: "" }], warnings: [] };
  assert.match(L.briefing({ sheet: sheetWith(fine), attention: [] }).join(" "), /everything is on time/);
});
test("releaseTrouble(): late, blocked and warnings; onTime only when there are none", () => {
  assert.deepEqual(L.releaseTrouble({ steps: [{ late: true }, { note: "blocked: x" }, { done: true, note: "blocked: old" }], warnings: ["w"] }), { late: 1, blocked: 1, warnings: 1, onTime: false });
  assert.deepEqual(L.releaseTrouble({ steps: [{ done: true }], warnings: [] }), { late: 0, blocked: 0, warnings: 0, onTime: true });
  assert.deepEqual(L.releaseTrouble(null), { late: 0, blocked: 0, warnings: 0, onTime: true });
});
test("Today's next release and the sheet's release card say 'on time' only through releaseTrouble", () => {
  const js = src("js/hq.js");
  assert.match(js, /L\.releaseTrouble\(n\)/);
  assert.match(js, /L\.releaseTrouble\(r\)/);
});

/* ---------- 5. growth with fewer than 7 days ---------- */
const row = (date, followers) => ({ date, platform: "TikTok", account: "@example", followers: String(followers) });
test("growthReport: under 7 days of readings, the change is against the oldest reading and says how many days", () => {
  const [g] = growthReport([row("2026-11-14", 1000), row("2026-11-15", 1010), row("2026-11-17", 1040)], "2026-11-17");
  assert.equal(g.week, 40);
  assert.equal(g.weekDays, 3);
  const [one] = growthReport([row("2026-11-17", 1040)], "2026-11-17");
  assert.equal(one.week, null); /* one reading: nothing to compare */
  assert.equal(one.weekDays, null);
  const full = growthReport([row("2026-11-01", 900), row("2026-11-10", 1000), row("2026-11-17", 1040)], "2026-11-17")[0];
  assert.equal(full.week, 40);
  assert.equal(full.weekDays, 7);
});
test("growthWhen() and the tiles say 'in N days' from weekDays", () => {
  assert.equal(L.growthWhen({ weekDays: 3 }), "in 3 days");
  assert.equal(L.growthWhen({ weekDays: 1 }), "in 1 day");
  assert.equal(L.growthWhen({ weekDays: 7 }), "in 7 days");
  assert.equal(L.growthWhen({}), "in 7 days");
  const t = L.tiles({ sheet: { growth: [{ platform: "TikTok", followers: 1040, week: 40, weekDays: 3, series: [] }] } }).find((x) => x.key === "f:TikTok");
  assert.equal(t.vs, "in 3 days");
  assert.equal(t.change.text, "+40");
  assert.match(src("js/hq.js"), /L\.growthWhen\(g\)/);
});
