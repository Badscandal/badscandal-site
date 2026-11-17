/* A8 (17 Nov 2026, Atlas): Spotify monthly listeners and Brazil listeners through log_growth (platform Spotify:
   they are the artist's numbers, not one song's), and a chart of them on Songs.
   B3 (17 Nov 2026, Forge): Meta's daily spend recorded on the desk by HQ itself from the read-only Meta key, so
   Forge only records Google and TikTok. Made-up numbers only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, INSTRUCTIONS } from "../netlify/lib/staff-tools.mjs";
import { artistReport, hqModel } from "../netlify/lib/hq.mjs";

await import("../js/hq-lib.js");
const HL = globalThis.HQLib;
const R = S.DEFAULT_ROSTER;
const NOW = Date.parse("2026-11-17T15:00:00Z");
const call = (d, name, args, now = NOW) => callTool(TOOLS.find((t) => t.name === name), args, { store: d, now, role: "bot", hq: async () => null }).catch((e) => ({ error: e.message }));

/* ---------- A8 ---------- */
test("log_growth takes monthly_listeners and brazil_listeners (platform Spotify)", async () => {
  const d = memoryDesk();
  const r = await call(d, "log_growth", { bot: "Atlas", date: "2026-11-16", platform: "Spotify", monthly_listeners: "41,200", brazil_listeners: "9,870" });
  assert.equal(r.saved, true, JSON.stringify(r));
  const rows = await S.listGrowth(d, NOW);
  assert.equal(rows[0].monthly_listeners, 41200);
  assert.equal(rows[0].brazil_listeners, 9870);
  assert.match(String((await call(d, "log_growth", { bot: "Atlas", date: "2026-11-16", platform: "Spotify", monthly_listeners: "about 41k" })).error), /never an estimate/);
  const p = TOOLS.find((t) => t.name === "log_growth").inputSchema.properties;
  assert.ok(p.monthly_listeners && p.brazil_listeners);
});
test("artistReport: the latest, the change over 7 days (or fewer, said), Brazil's share, the series", () => {
  const rows = [["2026-11-10", 40000, 9000], ["2026-11-13", 40500, 9400], ["2026-11-17", 41200, 9870]].map(([date, m, b]) => ({ kind: "growth", platform: "Spotify", date, monthly_listeners: m, brazil_listeners: b }));
  const a = artistReport(rows);
  assert.equal(a.monthly, 41200);
  assert.equal(a.change, 1200);
  assert.equal(a.changeDays, 7);
  assert.equal(a.brazil, 9870);
  assert.equal(a.brazilShare, 24);
  assert.equal(a.lastDay, "2026-11-17");
  assert.deepEqual(a.series.map((p) => p.v), [40000, 40500, 41200]);
  const short = artistReport(rows.slice(1));
  assert.equal(short.change, 700);
  assert.equal(short.changeDays, 4);
  assert.equal(artistReport([]), null);
  /* it reaches the model through the desk's rows */
  const m = hqModel({}, "2026-11-17", {}, null, "12:00", { growth: rows });
  assert.equal(m.artist.monthly, 41200);
});
test("Songs draws the monthly listeners card (HQLib.artistLines)", () => {
  assert.deepEqual(HL.artistLines({ monthly: 41200, change: 1200, changeDays: 7, brazil: 9870, brazilShare: 24, lastDay: "2026-11-17" }),
    { big: "41,200", sub: "+1,200 in 7 days · Brazil 9,870 (24%) · logged Tue 17 Nov" });
  assert.equal(HL.artistLines({ monthly: 41200, change: 700, changeDays: 4, lastDay: "2026-11-17" }).sub, "+700 in 4 days · logged Tue 17 Nov");
  assert.equal(HL.artistLines(null), null);
  assert.match(readFileSync(new URL("../js/hq.js", import.meta.url), "utf8"), /L\.artistLines\(/);
  assert.match(readFileSync(new URL("../hq.html", import.meta.url), "utf8"), /id="artistCard"/);
});

/* ---------- B3 ---------- */
const metaRows = [{ day: "2026-11-14", spend: 12.5, currency: "USD" }, { day: "2026-11-14", spend: 2.5, currency: "USD" }, { day: "2026-11-16", spend: 30, currency: "USD" }];
test("recordMetaSpend: one Meta row per finished day by HQ (a day without spend = 0), never twice", async () => {
  const d = memoryDesk();
  const r = await S.recordMetaSpend(d, NOW, R, metaRows, { since: "2026-11-14", until: "2026-11-16" });
  assert.deepEqual(r, { added: 3, updated: 0, skipped: 0 });
  const rows = (await S.listSpend(d, NOW)).filter((x) => x.platform === "Meta").sort((a, b) => (a.date < b.date ? -1 : 1));
  assert.deepEqual(rows.map((x) => [x.date, x.amount, x.currency, x.by, x.account]), [["2026-11-14", 15, "USD", "HQ", "Meta"], ["2026-11-15", 0, "USD", "HQ", "Meta"], ["2026-11-16", 30, "USD", "HQ", "Meta"]]);
  assert.deepEqual(await S.recordMetaSpend(d, NOW, R, metaRows, { since: "2026-11-14", until: "2026-11-16" }), { added: 0, updated: 0, skipped: 3 });
});
test("recordMetaSpend: updates Forge's own Meta row for that day instead of adding a second; leaves a day with two rows alone", async () => {
  const d = memoryDesk();
  await S.recordSpend(d, NOW, R, { by: "Forge", platform: "Meta", account: "Meta ads (made up)", date: "2026-11-16", amount: "28.00", currency: "USD" });
  await S.recordSpend(d, NOW, R, { by: "Forge", platform: "Meta", account: "A", date: "2026-11-14", amount: "1.00", currency: "USD" });
  await S.recordSpend(d, NOW, R, { by: "Forge", platform: "Meta", account: "B", date: "2026-11-14", amount: "1.00", currency: "USD" });
  const r = await S.recordMetaSpend(d, NOW, R, metaRows, { since: "2026-11-14", until: "2026-11-16" });
  assert.deepEqual(r, { added: 1, updated: 1, skipped: 1 });
  const d16 = (await S.listSpend(d, NOW)).filter((x) => x.platform === "Meta" && x.date === "2026-11-16");
  assert.equal(d16.length, 1);
  assert.equal(d16[0].amount, 30);
  assert.equal(d16[0].was, 28);
  /* no rows at all from Meta: the currency is unknown, nothing is written */
  assert.deepEqual(await S.recordMetaSpend(memoryDesk(), NOW, R, [], { since: "2026-11-14", until: "2026-11-16" }), { added: 0, updated: 0, skipped: 0 });
});
test("the hourly job records it; Forge is told", () => {
  const js = readFileSync(new URL("../netlify/functions/pushhourly.mjs", import.meta.url), "utf8");
  assert.match(js, /recordMetaSpend/);
  assert.match(js, /META_ADS_TOKEN/);
  assert.match(INSTRUCTIONS, /HQ records Meta's spend itself/);
});
