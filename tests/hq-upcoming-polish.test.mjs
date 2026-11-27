/* Luke's Upcoming review, parts B and C (26 Nov 2026).
   B: one card per song (no compact rows, no ring, no dots), the problem said once, colours that mean one thing,
      steps in the pipeline's order, 44 px taps, the calendar on the next release's month, the header that gives the
      screen back, the date range only where it changes something.
   C: Copy from a previous song, pick lists for genre and language, the Release Radar countdown, the two optional
      Spotify steps (Atlas; off until Luke switches them on), the asset chips. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { TOOLS } from "../netlify/lib/staff-tools.mjs";
import { SERVER } from "../netlify/lib/mcp.mjs";

await import("../js/hq-lib.js");
const L = globalThis.HQLib;
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const PAGE = read("hq.html"), STAFF = read("js/hq-staff.js"), SHELL = read("js/hq-shell.js");
const T = "2026-11-26";
const NOW = Date.parse("2026-11-26T15:00:00Z");
const R = S.DEFAULT_ROSTER;
const FULL = { kind: "Self-release", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", language: "English", explicit: "No", genre: "Dance", writers: "Sample Writer: music and lyrics", copyright: "℗ 2026 Sample · © 2026 Sample" };
const step = (key, label, owner, due, x = {}) => ({ key, label, owner, due, status: "todo", note: "", ...x });
const rel = (x = {}) => ({ id: "s1", title: "Sample Song", status: "scheduled", date: "2026-12-09", released: false, counts: { done: 1, total: 9, late: 0, blocked: 0 }, warnings: [], steps: [], pack: {}, ...x });

/* ---------- B: one card per song ---------- */
test("one card per song: no compact rows, no ring, no dots and no dots legend on Upcoming", () => {
  assert.ok(!PAGE.includes('id="relRows"'), "the compact Coming up rows are gone");
  assert.ok(!/Dots, in order/.test(STAFF), "no dots legend");
  const card = STAFF.slice(STAFF.indexOf("function relCard(v)"), STAFF.indexOf("function drawNow()"));
  assert.ok(card.length > 100);
  assert.ok(!/class="ring"|rdots|face\.dots/.test(card), "no ring and no dot rows on the card");
  assert.match(card, /rc-head/); assert.match(card, /rc-pill/); assert.match(card, /trackHtml\(v\)/); assert.match(card, /chipsHtml\(v\)/);
  assert.ok(!/function drawRelRows/.test(STAFF));
  /* the artwork sits beside the title inside the card's top; the rest goes full width */
  assert.match(PAGE, /\.rc-head\{[^}]*grid-template-columns:56px minmax\(0,1fr\) 20px/);
  assert.match(PAGE, /\.rc-cover\{grid-area:c;width:56px;height:56px/);
});

test("the ONE pill: Needs you, Blocked, Late, Warning, On track", () => {
  const board = { messages: [{ id: "m1", to: "Luke", ask: "resubmit", release: "s1", resolved: null, from: "Drop", text: "Ready to resubmit?" }] };
  assert.deepEqual(L.cardPill(rel(), T, board), { text: "Needs you", tone: "you", icon: "●" });
  assert.equal(L.cardPill(rel({ counts: { blocked: 1 } }), T, {}).text, "Blocked");
  assert.equal(L.cardPill(rel({ counts: { late: 2 } }), T, {}).text, "Late");
  assert.equal(L.cardPill(rel({ warnings: ["Not recorded yet: self-release or label"] }), T, {}).tone, "warn");
  assert.deepEqual(L.cardPill(rel(), T, {}), { text: "On track", tone: "ok", icon: "✓" });
  assert.equal(L.cardPill(rel({ status: "draft" }), T, {}).text, "Draft");
  /* a dispute waiting on Luke about the song */
  assert.equal(L.cardPill(rel(), T, { disputes: { items: [{ song: "Sample Song", status: "waiting on Luke" }] } }).text, "Needs you");
});

test("the day line and the ONE Next line; a blocked step says only 'blocked' (the reason is said once elsewhere)", () => {
  assert.equal(L.cardWhen(rel(), T), "Wed 9 Dec · 13 days");
  assert.equal(L.cardWhen(rel({ date: T }), T), "Thu 26 Nov · release day");
  const v = rel({ next: { key: "approved", label: "Approved by RouteNote", owner: "Drop", status: "blocked", note: "RouteNote wants a new cover", due: "2026-11-23" } });
  assert.equal(L.cardNext(v, T).text, "Next: RouteNote approval · Drop · blocked");
  assert.equal(L.cardNext(rel({ next: { key: "page", label: "Song page live on badscandal.com", owner: "Webmaster", status: "todo", due: "2026-12-02" } }), T).text, "Next: song page · Webmaster · Wed 2 Dec");
});

test("the bar runs from 3 weeks out to the release day, a tick per step in its colour, today marked", () => {
  const v = rel({ steps: [step("upload", "Uploaded to RouteNote with the release date", "Drop", "2026-11-18", { status: "done" }), step("approved", "Approved by RouteNote", "Drop", "2026-11-23", { status: "blocked", note: "x" }),
    step("lyrics", "Lyrics live on Musixmatch", "Verse", "2026-12-16"), step("canvas", "Spotify Canvas uploaded", "Atlas", "2026-12-16", { status: "skipped" })] });
  const t = L.relTrack(v, T);
  assert.equal(t.start, "2026-11-18");
  assert.deepEqual(t.ticks.map((x) => [x.key, x.pct, x.tone]), [["upload", 0, "done"], ["approved", 23.8, "bad"], ["lyrics", 100, "todo"]], "a skipped step has no tick; a step after the day sits at its end");
  assert.equal(t.today, 38.1);
  assert.equal(L.relTrack(rel({ date: "" }), T), null);
});

test("colours mean one thing, always with an icon or a word", () => {
  const look = (s) => L.stepLook(s, T);
  assert.deepEqual(look(step("a", "A", "Drop", "2026-11-20", { status: "done" })), { tone: "done", icon: "✓", word: "done" });
  assert.deepEqual(look(step("a", "A", "Drop", "2026-12-20")), { tone: "todo", icon: "○", word: "to do" });
  assert.deepEqual(look(step("a", "A", "Drop", "2026-12-20", { waiting: true })), { tone: "wait", icon: "◷", word: "waiting" });
  assert.deepEqual(look(step("a", "A", "Drop", "2026-11-20")), { tone: "bad", icon: "!", word: "late" });
  assert.deepEqual(look(step("a", "A", "Drop", "2026-12-20", { status: "blocked", note: "the cover was rejected" })), { tone: "bad", icon: "!", word: "blocked" });
  /* yellow no longer means "to do": the step list and the ticks use the tones above; amber only for a warning */
  assert.match(PAGE, /\.rsteps li\.done i\.si\{background:#3DDC97/);
  assert.match(PAGE, /\.rsteps li\.bad i\.si\{background:var\(--red\)/);
  assert.match(PAGE, /\.rc-pill\.warn\{color:var\(--amber/);
  assert.match(STAFF, /<i class="si" aria-hidden="true">' \+ esc\(look\.icon\)/);
});

test("say the problem once: the closed card shows the most urgent one with its button; inside, the reason is on its step", () => {
  const board = { messages: [{ id: "m1", to: "Luke", ask: "resubmit", release: "s1", resolved: null, from: "Drop", text: "Ready to resubmit?", options: ["Yes, resubmit", "Not yet"] }] };
  const blockedW = "Approved by RouteNote is blocked (Drop): RouteNote wants a cover without the web address on it";
  const v = rel({ warnings: [blockedW, "Lyrics live on Musixmatch is 2 days late (Verse)"], steps: [step("approved", "Approved by RouteNote", "Drop", "2026-11-23", { status: "blocked", note: "RouteNote wants a cover" })] });
  assert.equal(L.cardProblem(v, board, T).kind, "resubmit", "Drop's question, with Yes, resubmit, is the one problem shown");
  const p = L.cardProblem(v, {}, T);
  assert.deepEqual([p.kind, p.text, p.more], ["bad", blockedW, 1], "without the question: the first failure, and how many more are inside");
  assert.equal(L.stepWarning(blockedW, v), true, "said on its step inside, not again in the list");
  assert.equal(L.stepWarning("Not recorded yet: self-release or label", v), false);
  assert.equal(L.stepWarning("Rejected at the distributor: the cover has a web address on it (Drop)", v), true, "the rejection's reason is on the blocked step");
  assert.equal(L.stepWarning("Rejected at the distributor: the cover has a web address on it (Drop)", rel()), false, "no blocked step: the warning stays");
  /* the step's own link and button still show (a step's look must not overwrite them) */
  assert.ok(!/, lk = L\.stepLook/.test(STAFF));
  /* the distributor's history no longer repeats the reason */
  const store = STAFF.slice(STAFF.indexOf("function storeHtml(v)"), STAFF.indexOf("function approvalsHtml(v)"));
  assert.ok(!/r\.why/.test(store), "the history is the day and the word");
  assert.match(store, /L\.storeLine\(\{ status: st\.status, since: st\.since \}\)/);
});

test("Still to do: blocked first, then the pipeline's order, then the date (the pitch waits for Spotify for Artists, so it comes after it)", () => {
  const g = L.stepGroups(rel({ steps: [
    step("pitch", "Spotify pitch sent", "Atlas", "2026-11-25", { waiting: true }),
    step("spotify", "Showing as upcoming in Spotify for Artists", "Atlas", "2026-11-28"),
    step("page", "Song page", "Webmaster", "2026-12-02"),
    step("lyrics", "Lyrics", "Verse", "2026-12-16", { status: "blocked", note: "x" }),
    step("upload", "Upload", "Drop", "2026-11-13", { status: "done" })] }));
  assert.deepEqual(g.open.map((s) => s.key), ["lyrics", "spotify", "pitch", "page"]);
  /* the page's built-in order is the desk's RELEASE_STEPS */
  assert.deepEqual(L.STEP_ORDER, S.RELEASE_STEPS.map((s) => s.key));
  assert.match(STAFF, /L\.stepGroups\(v, board\.releaseSteps\)/);
});

test("tap sizes: the card's links, the calendar's arrows and days are 44 px; nothing on Upcoming under 13 px", () => {
  assert.match(PAGE, /\.relcard \.racts-more \.linkbtn,\.relcard \.racts \.linkbtn,\.relcard \.linkbtn\{min-height:44px;min-width:44px\}/);
  assert.match(PAGE, /\.cal-head \.iconbtn\{width:44px;height:44px\}/);
  assert.match(PAGE, /\.rc-chip\{[^}]*min-height:44px/);
  assert.match(PAGE, /\.rc-prob \.rmore\{[^}]*min-height:44px;min-width:44px/);
  assert.match(PAGE, /#releases \.pchip small,[^{]*\{font-size:13px\}/);
  /* the new card's own rules: no font under 13px */
  const mine = PAGE.slice(PAGE.indexOf("/* ---------- Upcoming, one card per song"), PAGE.indexOf("/* No zoom on the phone"));
  for (const m of mine.matchAll(/font(?:-size)?:[^;}]*?(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 13, m[0]);
});

test("the calendar opens on the month of the next release", () => {
  const rels = [{ status: "scheduled", date: "2026-11-14" }, { status: "draft", date: "2026-12-26" }, { status: "scheduled", date: "2027-01-08" }, { status: "cancelled", date: "2026-12-01" }];
  assert.equal(L.calendarStart(rels, T), "2027-01", "the next one sent to the team");
  assert.equal(L.calendarStart([{ status: "draft", date: "2026-12-26" }], T), "2026-12", "else a draft with a day");
  assert.equal(L.calendarStart([], T), "2026-11");
  assert.match(STAFF, /L\.calendarMonth\(ui\.cal\.ym \|\| L\.calendarStart\(rels, today\), rels, today\)/);
});

test("the header hides while scrolling down past 150 px and comes back on any scroll up; the range shows only where it changes something", () => {
  assert.match(SHELL, /HIDE_AFTER = 150/);
  assert.match(SHELL, /dy < 0/);
  assert.match(SHELL, /addEventListener\("scroll", [^]*passive: true/);
  assert.match(PAGE, /body\.hdr-hide \.hdr\{transform:translateY\(-110%\)\}/);
  assert.match(PAGE, /@media \(prefers-reduced-motion:reduce\)\{\.hdr\{transition:none\}/);
  assert.match(SHELL, /document\.body\.setAttribute\("data-view", tab\)/);
  for (const t of ["releases", "team", "profiles"]) assert.match(PAGE, new RegExp('body\\[data-view="' + t + '"\\] \\.rangebox'));
  assert.ok(!/body\[data-view="(today|songs|ads|growth|pages)"\] \.rangebox/.test(PAGE), "kept where the range filters the numbers");
});

/* ---------- C: functions that save Luke time ---------- */
test("Copy from a previous song: the last one sent first; only empty fields are filled; title, date, files, lyrics and pitch notes never", () => {
  const rels = [
    { id: "a", title: "Old Draft", status: "draft", createdAt: "2026-11-20", pack: { genre: "Pop" } },
    { id: "b", title: "First", status: "scheduled", sentAt: "2026-10-01", pack: { genre: "Dance" } },
    { id: "c", title: "Latest", status: "scheduled", sentAt: "2026-11-10", pack: { genre: "Dance" } },
    { id: "d", title: "Gone", status: "cancelled", sentAt: "2026-11-20", pack: { genre: "Rock" } },
    { id: "e", title: "Empty", status: "scheduled", sentAt: "2026-11-21", pack: { wav: "https://example.com/x.wav" } }];
  assert.deepEqual(L.copySources(rels, "").map((x) => x.id), ["c", "b", "a"]);
  assert.deepEqual(L.copySources(rels, "c").map((x) => x.id), ["b", "a"], "never the song being edited");
  const src = { pack: { ...FULL, producers: "Sample Producer", primary: "badscandal, Sample Singer", subgenre: "House", lyrics: "la la", mood: "late night", wav: "https://example.com/m.wav" } };
  const got = L.copyValues(src, { genre: "Pop", writers: "", title: "x" });
  assert.deepEqual(got.filled.sort(), ["copyright", "explicit", "kind", "language", "primary", "producers", "subgenre", "writers"]);
  assert.deepEqual(got.kept, ["genre"], "what he typed stays");
  assert.equal(got.vals.genre, "Pop");
  for (const k of ["wav", "artwork", "lyrics", "mood", "story", "instruments"]) assert.equal(got.vals[k], undefined, k + " is never copied");
  assert.deepEqual(L.COPY_KEYS, ["kind", "writers", "producers", "primary", "copyright", "language", "genre", "subgenre", "explicit"]);
  for (const k of L.COPY_KEYS) assert.ok(S.PACK_FIELDS.some((f) => f.key === k), k + " is a pack field");
  assert.match(STAFF, /data-rf-act="copy">Copy</);
});

test("pick lists for genre, second genre and language: what he used before on top, Other… for anything else", () => {
  const rels = [{ pack: { genre: "Dance" } }, { pack: { genre: "dance" } }, { pack: { genre: "Afro House" } }, { status: "cancelled", pack: { genre: "Rock" } }];
  const g = L.pickList("genre", rels);
  assert.deepEqual(g.used, ["Dance", "Afro House"]);
  assert.ok(!g.rest.includes("Dance") && g.rest.includes("Electronic") && g.rest.includes("Rock"));
  assert.ok(L.pickList("language", []).rest.includes("Portuguese"));
  assert.equal(L.pickList("subgenre", []).rest.length, L.pickList("genre", []).rest.length);
  assert.equal(L.pickList("writers", []), null, "only those three");
  assert.match(STAFF, /<option value="__other"/);
  assert.match(STAFF, /Other…/);
  assert.match(STAFF, /optgroup label="Used before"/);
});

test("Release Radar: from 10 days before the pitch deadline until it is sent; red at 2 days or less", () => {
  const v = (deadline, x = {}) => rel({ pitch: { status: "not pitched", deadline, ...x } });
  assert.equal(L.radarChip(v("2026-12-08"), T), null, "12 days away: not yet");
  assert.deepEqual(L.radarChip(v("2026-12-02"), T), { text: "Pitch by Wed 2 Dec for Release Radar · 6 days", bad: false, days: 6 });
  assert.equal(L.radarChip(v("2026-11-28"), T).bad, true);
  assert.equal(L.radarChip(v(T), T).text, "Pitch by Thu 26 Nov for Release Radar · today");
  assert.equal(L.radarChip(v(null, { status: "pitched" }), T), null, "sent: gone");
  assert.equal(L.radarChip(v(null, { skipped: true }), T), null, "the one-pitch rule skipped it");
  assert.equal(L.radarChip(v("2026-11-20", { status: "missed" }), T).bad, true);
  assert.equal(L.radarChip(rel({ status: "draft", pitch: { status: "not pitched", deadline: "2026-12-02" } }), T), null);
});

test("assets at a glance: Artwork, Canvas, Visualiser, Lyrics; a missing one opens Edit the details at that field", () => {
  assert.deepEqual(L.assetChips(rel({ pack: { artwork: "https://example.com/c.jpg" }, lyricsChars: 120 })).map((a) => [a.key, a.ok]), [["artwork", true], ["canvas", false], ["visualiser", false], ["lyrics", true]]);
  for (const k of ["artwork", "canvas", "visualiser", "lyrics"]) assert.ok(S.PACK_FIELDS.some((f) => f.key === k), k);
  assert.match(STAFF, /data-rel="asset" data-id="' \+ esc\(v\.id\) \+ '" data-field="/);
  assert.match(STAFF, /if \(act === "asset"\) \{ ui\.rel\.focusField = /);
});

test("two optional Spotify steps for Atlas: skipped until Luke says Yes in the pack; the pack count stays 20", async () => {
  const vp = S.RELEASE_STEPS.find((s) => s.key === "video_pitch"), ti = S.RELEASE_STEPS.find((s) => s.key === "thisis");
  assert.deepEqual([vp.owner, vp.after, vp.optIn, ti.owner, ti.after, ti.fromRelease, ti.optIn], ["Atlas", "spotify", "videoPitch", "Atlas", "pitch", true, "thisIs"]);
  const d = memoryDesk();
  const r0 = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Night Song", date: "2026-12-25", pack: FULL });
  const r = (await S.sendRelease(d, NOW, R, { by: "Luke", id: r0.id })).release;
  const st = (x, k) => x.steps.find((s) => s.key === k);
  assert.deepEqual([st(r, "video_pitch").status, st(r, "video_pitch").note, st(r, "thisis").status], ["skipped", S.OPT_NOTE, "skipped"]);
  const v = S.releaseView(r, "2026-11-26");
  assert.equal(v.packTotal, 20, "the two switches don't change \"2 of 20 filled\"");
  assert.equal(v.counts.total, 9, "a skipped step is not a step to do");
  /* Luke switches the video pitch on: Atlas's step, dated a week before the release */
  const on = await S.saveRelease(d, NOW, R, { by: "Luke", id: r.id, pack: { videoPitch: "Yes" } });
  assert.deepEqual([st(on, "video_pitch").status, st(on, "video_pitch").due, st(on, "thisis").status], ["todo", "2026-12-18", "skipped"]);
  /* and off again */
  const off = await S.saveRelease(d, NOW, R, { by: "Luke", id: r.id, pack: { videoPitch: "No" } });
  assert.deepEqual([st(off, "video_pitch").status, st(off, "video_pitch").note], ["skipped", S.OPT_NOTE]);
  /* a bot can't switch them */
  await assert.rejects(S.fillRelease(d, NOW, R, { by: "Atlas", id: r.id, field: "thisIs", value: "Yes" }), /Luke or Claude only|not by you/);
  /* a release sent before the steps existed gets the one Luke switches on, in its place; reading never adds them */
  const oldSteps = S.scheduleSteps("2026-12-25", "2026-11-20").steps.filter((s) => s.key !== "video_pitch" && s.key !== "thisis");
  const d2 = memoryDesk();
  await d2.setJSON("releases.json", [{ id: "older", title: "Older", date: "2026-12-25", status: "scheduled", createdAt: "2026-11-20T12:00:00Z", createdBy: "Luke", updatedAt: "2026-11-20T12:00:00Z", sentAt: "2026-11-20T12:00:00Z", tight: false, pack: FULL, steps: oldSteps, log: [] }]);
  assert.equal(S.board(await S.loadDesk(d2, NOW), NOW, null).releases[0].steps.length, 10, "reading never adds an optional step");
  await S.upgradeReleases(d2, NOW);
  assert.equal((await S.listReleases(d2))[0].steps.length, 10, "the tidy-up never adds them either");
  const sw = await S.saveRelease(d2, NOW, R, { by: "Luke", id: "older", pack: { thisIs: "Yes" } });
  assert.deepEqual(sw.steps.map((s) => s.key).slice(-2), ["lyrics", "thisis"]);
  assert.deepEqual([st(sw, "thisis").status, st(sw, "thisis").due], ["todo", "2026-12-28"]);
  assert.equal(sw.steps.length, 11);
});

test("Atlas is told about the optional steps; the tool list says them; the connector version moved", () => {
  const rs = TOOLS.find((t) => t.name === "release_step");
  assert.match(JSON.stringify(rs.inputSchema), /video_pitch \(Music video pitched to Spotify, Atlas\)/);
  assert.match(JSON.stringify(rs.inputSchema), /thisis \(Pinned to This Is on Spotify, Atlas\)/);
  const tools = read("netlify/lib/staff-tools.mjs");
  assert.match(tools, /\["Atlas", "Atlas: two release steps are off unless Luke switched them on for that song in the release form: video_pitch/);
  assert.match(tools, /never a visualiser/);
  assert.equal(SERVER.version, "1.23.0");
  /* the planning sentence keeps to the steps every song has */
  assert.ok(!/video|this is/i.test(L.stepsSummary(S.releaseStepsOut()).replace("song page and video", "")), L.stepsSummary(S.releaseStepsOut()));
});
