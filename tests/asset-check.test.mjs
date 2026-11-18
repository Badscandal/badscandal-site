/* L8 (17 Nov 2026, Atlas via Nova: "cover, Canvas and banner vs each platform's rules"): the A6 cover warnings
   extended to the Spotify Canvas and the two banners. Each platform's published rule:
   - cover (RouteNote / the stores): JPG or PNG, square, at least 3000 x 3000
   - Spotify Canvas: MP4 or JPG, 9:16 portrait, at least 720 px tall, 3 to 8 seconds
   - Spotify artist header: JPG or PNG, at least 2660 x 1140, 20 MB at most
   - YouTube channel banner: JPG, PNG, GIF or BMP, 16:9, at least 2048 x 1152, 6 MB at most
   Nothing is refused: the preflight tool lists the problems, the release card shows a bad Canvas link. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, toolsFor } from "../netlify/lib/staff-tools.mjs";

const NOW = Date.parse("2026-11-17T15:00:00Z");
const R = S.DEFAULT_ROSTER;
const call = (d, name, args) => callTool(TOOLS.find((t) => t.name === name), args, { store: d, now: NOW, role: "bot", hq: async () => null }).catch((e) => ({ error: e.message }));

test("every asset kind has a rule in words", () => {
  /* L12 (18 Nov 2026) added profile and banner kinds after these four. The first four stay in this order. */
  assert.deepEqual(Object.keys(S.ASSETS).slice(0, 4), ["cover", "canvas", "spotify_header", "youtube_banner"]);
  for (const a of Object.values(S.ASSETS)) assert.ok(a.label && a.rule && a.formats.length);
});

test("cover: the A6 wording is unchanged", () => {
  assert.deepEqual(S.assetProblems("cover", { width: 3000, height: 3000, format: "jpg" }), []);
  assert.deepEqual(S.assetProblems("cover", { width: 1400, height: 1400 }), S.coverWarnings(1400, 1400));
  assert.match(S.assetProblems("cover", { width: 3000, height: 2000 })[0], /not square/);
  assert.match(S.assetProblems("cover", { format: "webp" })[0], /JPG or PNG/);
});

test("Spotify Canvas: 9:16, 720 px tall, 3 to 8 seconds, MP4 or JPG", () => {
  assert.deepEqual(S.assetProblems("canvas", { width: 1080, height: 1920, seconds: 8, format: "mp4" }), []);
  assert.deepEqual(S.assetProblems("canvas", { width: 720, height: 1280, seconds: 3 }), []);
  assert.match(S.assetProblems("canvas", { width: 1920, height: 1080 })[0], /1920 x 1080 is not 9:16/);
  assert.match(S.assetProblems("canvas", { width: 360, height: 640 }).join(" "), /640 px tall is too small.*at least 720 px tall/);
  assert.match(S.assetProblems("canvas", { seconds: 12 })[0], /12 seconds.*3 to 8/);
  assert.match(S.assetProblems("canvas", { seconds: 2 })[0], /2 seconds.*3 to 8/);
  assert.match(S.assetProblems("canvas", { format: ".MOV" })[0], /MP4 or JPG.*not a \.mov/);
});

test("banners: Spotify header and YouTube banner", () => {
  assert.deepEqual(S.assetProblems("spotify_header", { width: 2660, height: 1140, format: "png", mb: 4 }), []);
  assert.match(S.assetProblems("spotify_header", { width: 1500, height: 500 }).join(" "), /at least 2660 x 1140/);
  assert.match(S.assetProblems("spotify_header", { mb: 25 })[0], /25 MB.*20 MB at most/);
  assert.deepEqual(S.assetProblems("youtube_banner", { width: 2560, height: 1440, format: "jpg", mb: 2 }), []);
  assert.match(S.assetProblems("youtube_banner", { width: 2048, height: 1000 }).join(" "), /not 16:9/);
  assert.match(S.assetProblems("youtube_banner", { width: 1600, height: 900 }).join(" "), /at least 2048 x 1152/);
  assert.match(S.assetProblems("youtube_banner", { mb: 8 })[0], /6 MB at most/);
  assert.match(S.assetProblems("youtube_banner", { format: "webp" })[0], /JPG, PNG, GIF or BMP/);
});

test("nothing known = nothing flagged; an unknown kind is refused in words", () => {
  assert.deepEqual(S.assetProblems("canvas", {}), []);
  assert.throws(() => S.assetProblems("poster", {}), /asset must be one of: cover, canvas/); /* L12 (18 Nov 2026): the sentence lists every kind */
});

test("the release card flags a Canvas link that isn't an MP4 or JPG", () => {
  const p = S.preflightOf({ id: "papermoon", pack: { canvas: "https://example.com/files/loop.mov" } });
  assert.equal(p.length, 1);
  assert.equal(p[0].field, "canvas");
  assert.match(p[0].text, /Spotify Canvas: .*MP4 or JPG.*\.mov/);
  assert.deepEqual(S.preflightOf({ id: "papermoon", pack: { canvas: "https://example.com/files/loop.mp4" } }), []);
  assert.deepEqual(S.preflightOf({ id: "papermoon", pack: { canvas: "https://drive.example.com/folder/abc" } }), [], "a link with no file type says nothing");
});

test("the preflight tool checks an asset and gives the rule", async () => {
  const d = memoryDesk();
  const a = await call(d, "preflight", { bot: "Atlas", asset: "canvas", width: 1920, height: 1080, seconds: 10, format: "mp4" });
  assert.equal(a.ok, false);
  assert.equal(a.problems.length, 2);
  assert.match(a.problems[0], /^Spotify Canvas: /);
  assert.match(a.rule, /9:16/);
  const b = await call(d, "preflight", { bot: "Laura", asset: "youtube_banner", width: 2560, height: 1440 });
  assert.equal(b.ok, true);
  assert.match(b.rule, /2048 x 1152/);
  assert.match(String((await call(d, "preflight", { bot: "Atlas", asset: "poster" })).error), /cover, canvas/);
  assert.match(String((await call(d, "preflight", { bot: "Atlas" })).error), /Give song, text, link or asset/);
  assert.match(String((await call(d, "preflight", { bot: "Atlas", asset: "canvas", width: "big" })).error), /width.*number/);
  /* Atlas uploads the Canvas, Laura the YouTube banner: both get the tool now */
  assert.ok(toolsFor("Atlas", R).some((t) => t.name === "preflight") && toolsFor("Laura", R).some((t) => t.name === "preflight"));
  assert.ok(!toolsFor("Kevin", R).some((t) => t.name === "preflight"));
});
