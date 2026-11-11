/* /hq Stage 2 (11 Nov 2026): Today as a morning briefing. Every rule in js/hq-lib.js: the sentences,
   "Needs attention", "Since you last looked", the headline tiles and the WhatsApp text. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hqModel } from "../netlify/lib/hq.mjs";
import { sampleSheets, sampleMeta } from "../netlify/lib/hq-sample.mjs";

await import("../js/hq-lib.js");
const L = globalThis.HQLib;
const TODAY = "2026-11-11";
const FX = { "2026-11": { USD: 1.12 }, "2026-10": { USD: 1.12 } };
const sheetOf = (over = {}) => { const s = sampleSheets(TODAY); const m = hqModel({ ...s, ...over }, TODAY, FX, sampleMeta(s, TODAY)); return m; };
const day = (d, spend, taps, people = taps * 2) => ({ d, spend, taps, people });
const ovOf = (over = {}) => ({
  range: "7d", days: 7,
  yesterday: { d: "2026-11-10", people: 64, taps: 25, spend: 25.97, cpt: 25.97 / 25, currency: "USD" },
  prev: { days: 7, spend: 150, taps: 100, people: 300, visits: 400 },
  series: ["05", "06", "07", "08", "09", "10", "11"].map((x) => day("2026-11-" + x, 25, 20)),
  recent: { days: ["03", "04", "05", "06", "07", "08", "09", "10"].map((x) => day("2026-11-" + x, 20, 20)), ads7: [] },
  spend: { connected: true, currency: "USD" }, metaKey: { state: "ok", text: "Meta key: reading OK" }, ...over });

test("median: the middle value", () => {
  assert.equal(L.median([3, 1, 2]), 2); assert.equal(L.median([4, 1, 3, 2]), 2.5); assert.equal(L.median([]), null); assert.equal(L.median([null, 5]), 5);
});

test("change: vs the period before, in plain words", () => {
  assert.deepEqual(L.change(120, 100), { text: "+20%", dir: "up" });
  assert.deepEqual(L.change(95, 100), { text: "−5.0%", dir: "down" });
  assert.deepEqual(L.change(5, 0), { text: "new", dir: "up" });
  assert.deepEqual(L.change(100, 100), { text: "same", dir: "flat" });
  assert.deepEqual(L.change(null, 100), { text: "–", dir: "flat" }, "not read is never 0");
});

test("briefing: Luke's example sentences, 3 to 5 of them", () => {
  const sheet = sheetOf(), ov = ovOf();
  const att = L.attention({ sheet, ov });
  const b = L.briefing({ sheet, ov, attention: att });
  assert.ok(b.length >= 3 && b.length <= 5, b.length);
  assert.equal(b[0], "Yesterday: USD 25.97 for 25 real Spotify taps (USD 1.04 each).");
  assert.match(b[1], /^USD \d[\d,]* left this month\.$/);
  assert.equal(b[2], "Me Dá Seu Body is out in 13 days; 1 step is late (Spotify pitch, Atlas).");
  assert.match(b[b.length - 1], /things? needs? you below\.$|^Nothing needs you today\.$/);
});

test("briefing: no spend yesterday, a cap warning, everything on time", () => {
  const sheet = sheetOf();
  sheet.money.cap = { ...sheet.money.cap, status: "warn", spent: 802.4, left: 197.6 };
  sheet.releases = sheet.releases.map((r) => ({ ...r, late: 0, steps: r.steps.map((s) => ({ ...s, late: false })) }));
  const b = L.briefing({ sheet, ov: ovOf({ yesterday: { d: "2026-11-10", people: 12, taps: 3, spend: 0, cpt: null, currency: "USD" } }), attention: [] });
  assert.equal(b[0], "Yesterday: 3 real Spotify taps from 12 people, with no ad spend.");
  assert.equal(b[1], "Ad spend is past 750: USD 802 of 1,000 this month.");
  assert.equal(b[2], "Me Dá Seu Body is out in 13 days; everything is on time.");
  assert.equal(b[b.length - 1], "Nothing needs you today.");
});

test("needs attention: every rule, each with its place to go", () => {
  const sheet = sheetOf({ Income: [["#REF!"]] });
  sheet.money.cap = { ...sheet.money.cap, status: "stop", spent: 910 };
  const ov = ovOf({
    metaKey: { state: "expired", text: "The Meta key has expired: make a new one" },
    recent: { days: [...["03", "04", "05", "06", "07", "08", "09"].map((x) => day("2026-11-" + x, 20, 20)), day("2026-11-10", 30, 10)],
      ads7: [{ ad: "TM EU - clip 3", spend: 17.5, taps: 0, currency: "USD" }, { ad: "Small", spend: 4, taps: 0, currency: "USD" }, { ad: "OK", spend: 40, taps: 30, currency: "USD" }] },
  });
  const a = L.attention({ sheet, ov });
  const by = (k) => a.filter((x) => x.key.startsWith(k));
  assert.match(by("cap")[0].text, /past 900/); assert.equal(by("cap")[0].href, "#ads");
  assert.equal(by("late:")[0].text, "The Spotify pitch for Me Dá Seu Body is late (Atlas, due Tue 10 Nov)"); assert.equal(by("late:")[0].href, "#releases");
  assert.equal(by("sheet:Income")[0].href, "#money");
  assert.equal(by("key")[0].text, "The Meta key has expired: make a new one"); assert.equal(by("key")[0].href, "#health");
  assert.deepEqual(by("ad:").map((x) => x.text), ["“TM EU - clip 3” spent USD 17.50 in 7 days with no real Spotify taps"], "only USD 10+ with 0 taps");
  assert.equal(by("cpt")[0].text, "Cost per tap yesterday was USD 3.00, more than double the usual USD 1.00");
  assert.match(by("duty:")[0].text, /^Kevin's duty is blocked: TikTok login expired$/);
  assert.match(by("mismatch")[0].text, /differs from Meta on 1 day/);
});

test("needs attention: quiet bots only from 3 days (Spotify's numbers are 2 days late); calm when all is well", () => {
  const sheet = sheetOf();
  sheet.team.team = [{ owner: "Atlas", lastLogged: "2026-11-09", quiet: 2 }, { owner: "Steve", lastLogged: "2026-11-07", quiet: 4 }, { owner: "Luke", lastLogged: "2026-11-01", quiet: 10 }];
  const a = L.attention({ sheet, ov: ovOf() });
  assert.deepEqual(a.filter((x) => x.key.startsWith("quiet:")).map((x) => x.text), ["Steve hasn't logged a number for 4 days"]);
  const calm = L.attention({ sheet: null, ov: ovOf() });
  assert.deepEqual(calm, []);
  /* zero-tap spend yesterday */
  const z = L.attention({ sheet: null, ov: ovOf({ recent: { days: [day("2026-11-09", 5, 5), day("2026-11-10", 12, 0)], ads7: [] } }) });
  assert.equal(z[0].text, "Yesterday USD 12.00 was spent with no real Spotify taps");
});

test("since you last looked: what moved between two visits", () => {
  const sheet = sheetOf(), ov = ovOf();
  const before = L.snapshot({ sheet, ov, now: 1 });
  const s2 = JSON.parse(JSON.stringify(sheet));
  s2.songs[0].total += 1240; s2.growth[0].followers += 21; s2.money.cap.spent = Math.round((s2.money.cap.spent + 27.48) * 100) / 100;
  s2.fans.total += 2; s2.team.duties.done += 1;
  const after = L.snapshot({ sheet: s2, ov: { ...ov, yesterday: { ...ov.yesterday, d: "2026-11-11", taps: 30 } }, now: 2 });
  const c = L.changesSince(before, after);
  assert.ok(c.includes("+1,240 Spotify streams logged for " + sheet.songs[0].song), c.join(" | "));
  assert.ok(c.includes("+21 followers on " + sheet.growth[0].platform));
  assert.ok(c.includes("USD 27.48 more ad spend this month"));
  assert.ok(c.includes("2 new fans noticed"));
  assert.ok(c.includes("1 more duty done today"));
  assert.ok(c.includes("A new day closed: 30 real Spotify taps on Wed 11 Nov"));
  assert.deepEqual(L.changesSince(before, before), [], "nothing moved: nothing listed");
  assert.deepEqual(L.changesSince(null, after), [], "first visit: nothing to compare");
});

test("headline tiles: value, change vs the period before, trend; not read stays –", () => {
  const t = L.tiles({ sheet: sheetOf(), ov: ovOf() });
  const k = Object.fromEntries(t.map((x) => [x.key, x]));
  assert.equal(k.spend.value, "USD 175.00"); assert.deepEqual(k.spend.change, { text: "+17%", dir: "up" }); assert.equal(k.spend.vs, "vs the 7 days before");
  assert.equal(k.taps.value, "140"); assert.equal(k.taps.green, true); assert.deepEqual(k.taps.change, { text: "+40%", dir: "up" });
  assert.equal(k.cpt.value, "USD 1.25"); assert.deepEqual(k.cpt.change, { text: "−17%", dir: "down" });
  assert.equal(k.spend.series.length, 7);
  assert.ok(k.streams && k.listeners, "Spotify streams and listeners");
  assert.ok(t.some((x) => x.key === "f:Instagram"), "followers per platform");
  const off = L.tiles({ sheet: null, ov: ovOf({ spend: { connected: false }, prev: { taps: 0 } }) });
  assert.deepEqual(off.map((x) => x.key), ["taps"], "no Meta: no spend tiles, never USD 0");
});

test("copy today's summary: plain text for WhatsApp", () => {
  const sheet = sheetOf(), ov = ovOf();
  const att = L.attention({ sheet, ov });
  const txt = L.summaryText({ date: "Wed 11 Nov", briefing: L.briefing({ sheet, ov, attention: att }), attention: att, tiles: L.tiles({ sheet, ov }) });
  const lines = txt.split("\n");
  assert.equal(lines[0], "BADSCANDAL · Wed 11 Nov");
  assert.equal(lines[1], "Yesterday: USD 25.97 for 25 real Spotify taps (USD 1.04 each).");
  assert.ok(lines.includes("Needs attention:"));
  assert.ok(lines.some((l) => /^• The Spotify pitch for Me Dá Seu Body is late/.test(l)));
  assert.ok(lines.some((l) => /^Real Spotify taps: 140 \(\+40% vs the 7 days before\)$/.test(l)));
  assert.ok(!/<|&amp;/.test(txt), "no HTML in the text");
});
