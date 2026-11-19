/* Growth & Fans, tidied (19 Nov 2026, Luke: "some things are overlapping and it could look better"). Made-up data only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { growthReport } from "../netlify/lib/hq.mjs";

await import("../js/hq-lib.js");
await import("../js/hq-look.js");
const L = globalThis.HQLib, V = globalThis.HQLook;
const page = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
const hq = readFileSync(new URL("../js/hq.js", import.meta.url), "utf8");

test("a platform with no views has no views line (Spotify said 0 views in the last 7 days)", () => {
  const rows = ["2026-11-15", "2026-11-16", "2026-11-17"].map((date, i) => ({ date, platform: "Spotify", account: "made up", followers: String(100 + i), change: "1" }));
  const g = growthReport(rows, "2026-11-18").find((x) => x.platform === "Spotify");
  assert.equal(g.views7, null);
  const withViews = growthReport(rows.map((r) => ({ ...r, platform: "YouTube", views: "10" })), "2026-11-18").find((x) => x.platform === "YouTube");
  assert.equal(withViews.views7, 30);
});

test("the best post's title says the day in words and keeps the caption as a quote, not the title", () => {
  const ranking = { ranked: [{ views: 2765, caption: "Killed my camera for this shot #fyp\nsecond line", rate: 0.0901, at: "2026-11-11", link: "https://example.com/p" }] };
  const best = V.bestPost(ranking, [], L);
  assert.equal(best.title, "Instagram post · " + L.day("2026-11-11"));
  assert.doesNotMatch(best.title, /\d{4}-\d{2}-\d{2}/);
  assert.equal(best.caption, "Killed my camera for this shot #fyp");
  const linked = V.bestPost({ ranked: [{ ...ranking.ranked[0], song: "Made Up Song" }] }, [], L);
  assert.match(linked.title, /^Made Up Song · /);
});

test("Growth & Fans: a jump row, the Instagram block first, no duplicate fan card, captions not in capitals", () => {
  for (const id of ["growth-ig", "growth-ideas", "growth-claims", "growth-fans"]) assert.match(page, new RegExp('id="' + id + '"'), id);
  assert.match(page, /class="jumpto"/);
  assert.ok(page.indexOf('id="igBox"') < page.indexOf('id="ideasBox"'), "Instagram before the content ideas");
  assert.equal(/Fan question/.test(hq), false, "the fan inbox lists the questions; no second card");
  assert.equal(/class=\\?"lbl\\?">on /.test(hq), false, "'on <post>' is normal text (.fanon), not the small capital label");
  assert.match(hq, /Intl\.DisplayNames/, "countries by name");
  assert.match(page, /\.igrank li::before\{content:"#" counter\(rk\);position:static/, "the rank number no longer sits on top of 'At 1 day'");
});
