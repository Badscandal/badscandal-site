/* A6 (17 Nov 2026, Forge, Drop, Verse): pre-flight checks before anything reaches the stores or the ads.
   - the artist name "badscandal", one word (18 Nov 2026: capitalisation is a note, not a failure; "Basdcandal" and "Bad Scandal" are still flagged)
   - the song page and every ad link = https://badscandal.com/<the song> (never Feature.fm or a store link)
   - the master is a WAV, the artwork a JPG or PNG; a cover upload says when it isn't square or is under 3000 px
   Shown on the release (releaseView().preflight, the card, the releases / release_pack tools) and checkable on
   demand with the preflight tool. Made-up songs and links only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, toolsFor } from "../netlify/lib/staff-tools.mjs";
import { SONGS } from "../netlify/lib/songs.mjs";

await import("../js/hq-lib.js");
const HL = globalThis.HQLib;
const NOW = Date.parse("2026-11-17T15:00:00Z");
const R = S.DEFAULT_ROSTER;
const slug = SONGS[0].slug;
const call = (d, name, args, o = {}) => callTool(TOOLS.find((t) => t.name === name), args, { store: d, now: NOW, role: o.role || "bot", hq: async () => null }).catch((e) => ({ error: e.message }));

test("artistProblems: only exactly 'badscandal' passes", () => {
  assert.deepEqual(S.artistProblems("badscandal feat. Someone Made Up"), []);
  assert.match(S.artistProblems("Basdcandal")[0], /“Basdcandal” looks like a misspelling: the stores need “badscandal”/);
  assert.match(S.artistProblems("Bad Scandal & Friend")[0], /“Bad Scandal”.*“badscandal”/);
  /* 18 Nov 2026: case is not a problem */
  assert.deepEqual(S.artistProblems("BADSCANDAL"), []);
  assert.deepEqual(S.artistProblems("℗ 2026 Badscandal"), []);
  assert.match(S.artistNotes("BADSCANDAL")[0], /capitalisation does not matter/);
  assert.deepEqual(S.artistProblems("Sandal Records, Bad Company"), [], "other words that merely look close are left alone");
  assert.deepEqual(S.artistProblems(""), []);
});
test("adLinkProblem: badscandal.com/<song> only", () => {
  assert.equal(S.adLinkProblem(`https://badscandal.com/${slug}?utm_source=meta&utm_campaign=br&utm_content={{ad.name}}`, slug), "");
  assert.equal(S.adLinkProblem(`https://badscandal.com/${slug}`), "");
  assert.match(S.adLinkProblem("https://ffm.to/made-up"), /Feature\.fm is cancelled/);
  assert.match(S.adLinkProblem("https://open.spotify.com/track/abc"), /send people to badscandal\.com\/<song>.*not open\.spotify\.com/);
  assert.match(S.adLinkProblem("https://badscandal.com/nosuchsong"), /no song page at badscandal\.com\/nosuchsong/);
  assert.match(S.adLinkProblem(`https://badscandal.com/${slug}`, "othersong"), new RegExp(`goes to /${slug}, not this song's page /othersong`));
  assert.match(S.adLinkProblem("http://badscandal.com/" + slug), /https/);
});
test("preflightOf: the release's own checks", () => {
  const r = { id: "papermoon", title: "Paper Moon", status: "scheduled", pack: {
    primary: "Basdcandal", featuring: "Made Up Singer", copyright: "℗ 2026 BADSCANDAL",
    wav: "https://example.com/files/paper-moon-master.mp3", artwork: "https://example.com/files/cover.webp",
    page: "https://ffm.to/papermoon", adplan: "Story ads to https://open.spotify.com/track/xyz and to https://badscandal.com/papermoon" } };
  const p = S.preflightOf(r);
  const by = (f) => p.filter((x) => x.field === f).map((x) => x.text);
  assert.equal(by("primary").length, 1);
  assert.equal(by("copyright").length, 0, "18 Nov 2026: BADSCANDAL in the copyright line is not a failure");
  assert.match(by("wav")[0], /master must be a WAV.*not an \.mp3/);
  assert.match(by("artwork")[0], /JPG or PNG, 3000 x 3000.*\.webp/);
  assert.match(by("page")[0], /Feature\.fm/);
  assert.equal(by("adplan").length, 1, "only the Spotify link; the song's own page is fine");
  assert.deepEqual(S.preflightOf({ id: "papermoon", pack: { primary: "badscandal", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", page: "https://badscandal.com/papermoon" } }), []);
  /* on the view, and through the tools */
  assert.equal(S.releaseView(r, "2026-11-17").preflight.length, p.length);
});
test("the preflight tool: a song, a text, a link", async () => {
  const d = memoryDesk();
  await S.saveRelease(d, NOW, R, { by: "Luke", title: "Paper Moon", date: "2026-12-18", pack: { primary: "Bad Scandal" } });
  const a = await call(d, "preflight", { bot: "Drop", song: "Paper Moon" });
  assert.equal(a.ok, false);
  assert.match(a.problems[0], /Primary artists: “Bad Scandal”/);
  const b = await call(d, "preflight", { bot: "Forge", link: "https://open.spotify.com/track/abc", text: "badscandal" });
  assert.equal(b.ok, false);
  assert.equal(b.problems.length, 1);
  const c = await call(d, "preflight", { bot: "Forge", link: `https://badscandal.com/${slug}?utm_source=meta` });
  assert.equal(c.ok, true);
  assert.deepEqual(c.problems, []);
  assert.ok((c.checked || []).some((x) => /badscandal\.com/.test(x)));
  assert.match(String((await call(d, "preflight", { bot: "Forge" })).error), /Give song, text, link or asset/); /* + asset (L8, 17 Nov 2026) */
  assert.ok(toolsFor("Forge", R).some((t) => t.name === "preflight") && toolsFor("Drop", R).some((t) => t.name === "preflight") && toolsFor("Verse", R).some((t) => t.name === "preflight") && toolsFor("Webmaster", R).some((t) => t.name === "preflight"));
  assert.ok(!toolsFor("Kevin", R).some((t) => t.name === "preflight"));
  /* the tool count is pinned in mcp.test.mjs */
});
test("upload_cover says when a cover is not square or under 3000 px", () => {
  assert.deepEqual(S.coverWarnings(3000, 3000), []);
  assert.deepEqual(S.coverWarnings(null, null), []);
  /* v18, 21 Nov 2026: one cover rule, a square 3000 x 3000 everywhere (the song page no longer has its own 1000 px rule) */
  assert.match(S.coverWarnings(1400, 1400)[0], /1400 x 1400 is too small: a cover is a square 3000 x 3000/);
  assert.match(S.coverWarnings(3000, 2000)[0], /not square/);
  assert.match(readFileSync(new URL("../netlify/lib/staff-tools.mjs", import.meta.url), "utf8"), /coverWarnings|r\.warnings/);
});
test("the card shows the pre-flight list (HQLib.preflightLine)", () => {
  assert.equal(HL.preflightLine({ preflight: [] }), "");
  assert.equal(HL.preflightLine({ preflight: [{ field: "primary", text: "a" }, { field: "wav", text: "b" }] }), "Check before it goes to the stores: 2 things");
  assert.match(readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8"), /L\.preflightLine\(v\)/);
});
