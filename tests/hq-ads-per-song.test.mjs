/* 24 Nov 2026, Luke: "we need it done per song and we want to have it that it shows up at the top the total ad spend
   and then i can click per song and in each song it says the spend on that song for ads and then the return but
   don't log return yet ... we want the meta events health at the bottom of the page". Made-up songs and amounts. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { moneyReport } from "../netlify/lib/hq.mjs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const OV = { range: "7d", from: "2026-11-18", to: "2026-11-24", spend: { connected: true, currency: "USD", unmatched: 5,
  songs: [{ title: "Glass Heart", spend: 60, taps: 30 }, { title: "Paper Moon", spend: 20, taps: 0 }, { title: "Quiet One", spend: 0, taps: 0 }],
  ads: [{ ad: "GH clip 1", song: "Glass Heart", spend: 40, taps: 20 }, { ad: "GH clip 2", song: "Glass Heart", spend: 20, taps: 10 }] } };
const ROWS = [
  { d: "2026-11-20", platform: "TikTok", meta: false, song: "Glass Heart", amount: 12.5, currency: "EUR" },
  { d: "2026-11-21", platform: "Google", meta: false, song: "", amount: 8, currency: "EUR" },
  { d: "2026-11-10", platform: "TikTok", meta: false, song: "Glass Heart", amount: 99, currency: "EUR" }, /* before the range */
  { d: "2026-11-21", platform: "Meta", meta: true, song: "", amount: 85, currency: "USD" }, /* Meta's account total: Meta comes per ad */
];

test("the total, each song's spend by platform, and a Return that is not logged yet", () => {
  const v = L.adsBySong({ ov: OV, rows: ROWS });
  assert.equal(v.ready, true);
  assert.equal(v.rangeWords, "Last 7 days");
  assert.equal(v.totalLine, "EUR 20.50 + USD 85.00", "never added across currencies");
  assert.deepEqual(v.songs.map((s) => s.title), ["Glass Heart", "Paper Moon"], "biggest first; a song with no spend is left out");
  const gh = v.songs[0];
  assert.equal(gh.line, "EUR 12.50 + USD 60.00");
  assert.deepEqual(gh.platforms.map((p) => p.platform + " " + p.line), ["Meta USD 60.00", "TikTok EUR 12.50"]);
  assert.equal(gh.taps, 30);
  assert.equal(gh.cpt, "USD 2.00");
  assert.equal(gh.returnLine, "Not logged yet");
  assert.equal(gh.ads.length, 2);
  assert.equal(v.unlinked.line, "EUR 8.00 + USD 5.00", "Meta's unmatched ads and a Google day with no song");
});

test("Meta not connected: Meta's days count in the total but not per song, and the page says why", () => {
  const v = L.adsBySong({ ov: { ...OV, spend: { connected: false } }, rows: ROWS });
  assert.equal(v.totalLine, "EUR 20.50 + USD 85.00");
  assert.deepEqual(v.songs.map((s) => s.line), ["EUR 12.50"]);
  assert.match(v.metaNote, /not split by song/);
  assert.equal(L.adsBySong({ ov: null, rows: ROWS }).ready, false);
  assert.equal(L.adsBySong({ ov: { ...OV, range: "all", from: "2026-10-11" }, rows: ROWS }).rangeWords, "All time");
});

test("the sheet answer carries each spend row with its song", () => {
  const m = moneyReport([{ date: "2026-11-20", platform: "TikTok", spend: "12.5", currency: "eur", song: "Glass Heart" }, { date: "bad", platform: "Google", spend: "1" }], "2026-11-24");
  assert.deepEqual(m.rows, [{ d: "2026-11-20", platform: "TikTok", meta: false, song: "Glass Heart", amount: 12.5, currency: "EUR" }]);
});

test("the page: the total on top, per song in the middle, Meta events health last; the old cards are gone", () => {
  const page = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  const ads = page.slice(page.indexOf('id="ads"'), page.indexOf("</section>", page.indexOf('id="ads"')));
  const at = (id) => ads.indexOf('id="' + id + '"');
  assert.ok(at("adsTotal") > 0 && at("adsTotal") < at("adsSongs") && at("adsSongs") < at("healthCard"));
  for (const id of ["adsPins", "adsGauge", "capCard", "spendCard"]) assert.equal(at(id), -1, id);
  assert.match(readFileSync(new URL("../js/hq.js", import.meta.url), "utf8"), /kv\("Return", s\.returnLine, "ret"\)/);
});
