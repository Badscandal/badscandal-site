/* L4 (18 Nov 2026): per-song profit. Royalties per song and store, next to ad spend that names
   the song, and the release date. A campaign name is never a song. Money with no song says
   "not linked to a song" and is not added into a song. Currencies stay separate. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hqModel, songProfit } from "../netlify/lib/hq.mjs";
import { sampleSheets } from "../netlify/lib/hq-sample.mjs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { TOOLS, callTool, instructionsFor } from "../netlify/lib/staff-tools.mjs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const TODAY = "2026-11-18";
const NOW = Date.parse("2026-11-18T15:00:00Z");
const FX = { "2026-11": { USD: 1.2, EUR: 1 }, "2026-10": { USD: 1.2, EUR: 1 } };
const R = S.DEFAULT_ROSTER;
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, o = {}) => callTool(tool(name), args, { store: d, now: o.now || NOW, role: "bot", hq: o.hq || (async () => null) });
const fails = (p, re) => assert.rejects(p, (e) => e.name === "StaffError" && re.test(e.message));

test("a song's royalties, per store, sit next to spend that names it and its release day", () => {
  const pl = songProfit({
    royalties: [
      { month: "2026-10", song: "Night Drive", store: "Spotify", amount: "10.00", currency: "EUR" },
      { month: "2026-10", song: "Night Drive", store: "Apple Music", amount: "4.50", currency: "EUR" },
      { month: "2026-11", song: "Night Drive", store: "Spotify", amount: "2.00", currency: "EUR" },
    ],
    spend: [
      { date: "2026-11-02", platform: "TikTok", campaign: "Night Drive BR", spend: "3.00", currency: "EUR", song: "Night Drive" },
      { date: "2026-11-03", platform: "Meta", campaign: "Night Drive", spend: "40.00", currency: "USD" },
    ],
    releases: [{ song: "Night Drive", date: "2026-10-30" }],
    fx: FX,
  });
  const v = L.songPLView(pl);
  const s = v.songs.find((x) => x.song === "Night Drive");
  assert.equal(s.dateLine, L.day("2026-10-30"));
  assert.equal(s.moneyIn, L.money(16.5, "EUR"));
  assert.deepEqual(s.stores.sort(), ["Apple Music · " + L.money(4.5, "EUR"), "Spotify · " + L.money(12, "EUR")].sort());
  assert.equal(s.adSpend, L.money(3, "EUR"), "only the row that names the song");
  assert.equal(s.result, L.money(13.5, "EUR"));
  assert.equal(v.unlinked.spend, L.money(40, "USD"));
  assert.match(v.unlinked.label, /not linked to a song/);
  assert.match(v.unlinked.note, /not added together/);
  const html = L.songPLHtml(v);
  assert.match(html, /Not linked to a song/);
  assert.match(html, /<details><summary>Details<\/summary>/);
});

test("a campaign name is never a song, a missing amount is never zero, and an unlinked royalty stays out", () => {
  const pl = songProfit({
    royalties: [
      { month: "2026-11", song: "", store: "Deezer", amount: "3.50", currency: "EUR" },
      { month: "2026-11", song: "Paper Moon", store: "Spotify", amount: "not read", currency: "EUR" },
      { month: "2026-11", song: "Me Dá Seu Body", store: "Spotify", amount: "8", currency: "USD" },
    ],
    spend: [
      { date: "2026-11-01", platform: "Meta", campaign: "Me Dá Seu Body", spend: "9", currency: "USD" },
      { date: "2026-11-02", platform: "Google", spend: "not read", currency: "EUR", song: "Me Dá Seu Body" },
    ],
    releases: [{ song: "medaseubody", date: "2026-11-27" }],
    fx: FX,
  });
  const v = L.songPLView(pl);
  const body = v.songs.find((x) => x.song === "medaseubody");
  assert.equal(body.moneyIn, L.money(8, "USD"), "the accented royalty row is the same song");
  assert.equal(body.adSpend, "not linked to a song");
  assert.match(body.result, /not linked to a song/);
  assert.equal(v.songs.find((x) => x.song === "Paper Moon"), undefined, "a royalty that could not be read is not a zero");
  assert.equal(v.unlinked.royalties, L.money(3.5, "EUR"));
  assert.equal(v.unlinked.spend, L.money(9, "USD"));
  assert.equal(v.songs.find((x) => /Me Dá/.test(x.song)), undefined);
});

test("payments count for a song only when they name it, and are not added on top of recorded royalties", () => {
  const sources = [{ id: "paypal", name: "PayPal", kind: "account" }, { id: "revolut", name: "Revolut", kind: "account" }];
  const pay = (over) => ({ date: "2026-11-04", payer: "Sample Distro", amount: 10, currency: "EUR", status: "received", category: "Self-releases", account: "Revolut", at: "2026-11-04T00:00:00Z", ...over });
  const lines = S.plPayments([
    pay({ song: "Night Drive", store: "Spotify", amount: 6 }),
    pay({ amount: 15, song: "" }),
    pay({ payer: "Sample Distro LLC", amount: 15, at: "2026-11-04T01:00:00Z", song: "Night Drive" }),
    pay({ status: "pending", amount: 4, song: "Night Drive" }),
    pay({ account: "PayPal", amount: 7, song: "Night Drive" }),
    pay({ category: "Salary", amount: 100 }),
    pay({ category: "Production", amount: 50 }),
    pay({ status: "received", movedTo: "i1", amount: 3, song: "Night Drive" }),
  ], sources);
  assert.equal(lines.counted.length, 2, "the duplicate payer name is one payment, and it keeps the first row");
  assert.equal(lines.counted.find((x) => !x.song).amount, 15);
  assert.equal(lines.notReceived, 1);
  assert.equal(lines.holding, 1);
  const pl = songProfit({
    royalties: [{ month: "2026-11", song: "Night Drive", store: "Spotify", amount: 20, currency: "EUR" }],
    payments: lines.counted,
    releases: [{ song: "Night Drive", date: "2026-11-06" }],
    notReceived: lines.notReceived, holding: lines.holding,
    fx: FX,
  });
  const v = L.songPLView(pl);
  const s = v.songs.find((x) => x.song === "Night Drive");
  assert.equal(s.moneyIn, L.money(20, "EUR"));
  assert.match(s.note, /not added/);
  assert.match(s.note, new RegExp(L.money(6, "EUR").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(v.unlinked.payments, L.money(15, "EUR"));
  assert.match(v.unlinked.note, /not received yet/);
  assert.match(v.unlinked.note, /Wise or PayPal/);
});

test("mixed currencies stay separate unless a rate was recorded, and a month average is not used", () => {
  const base = {
    royalties: [{ month: "2026-11", song: "Slow Burn", store: "Spotify", amount: 10, currency: "EUR" }],
    spend: [{ date: "2026-11-08", platform: "Meta", spend: 12, currency: "USD", song: "Slow Burn" }],
    releases: [{ song: "Slow Burn", date: "2026-12-04" }],
  };
  /* 18 Nov 2026: the month's average rate is not a rate for this song. No combined figure. */
  const got = L.songPLView(songProfit({ ...base, fx: FX }));
  assert.match(got.songs[0].result, /No estimate: a rate is missing/);
  assert.doesNotMatch(got.songs[0].result, /About/);
  assert.equal(songProfit({ ...base, fx: FX }).songs[0].estimate, null);
  const rated = songProfit({ ...base, spend: [{ date: "2026-11-08", platform: "Meta", spend: 12, currency: "USD", song: "Slow Burn", rate: { value: 1.2, source: "Revolut exchange row" } }] });
  assert.equal(rated.songs[0].estimate.eur, 0);
  assert.equal(rated.songs[0].estimate.source, "Revolut exchange row");
  const missing = L.songPLView(songProfit({ ...base, fx: {} }));
  assert.match(missing.songs[0].result, /No estimate: a rate is missing/);
  assert.equal(songProfit({ ...base, fx: {} }).songs[0].estimate, null);
});

test("an explicit zero of spend is that song's spend; a song with no money still shows its date", () => {
  const v = L.songPLView(songProfit({
    spend: [{ date: "2026-11-01", platform: "TikTok", spend: 0, currency: "EUR", song: "Paper Moon" }],
    releases: [{ song: "Survivors", date: "2026-12-18" }],
    fx: FX,
  }));
  const paper = v.songs.find((x) => x.song === "Paper Moon");
  assert.equal(paper.moneyIn, "nothing recorded");
  assert.equal(paper.adSpend, L.money(0, "EUR"));
  assert.match(paper.result, /Ad spend only/);
  const surv = v.songs.find((x) => x.song === "Survivors");
  assert.equal(surv.dateLine, L.day("2026-12-18"));
  assert.equal(surv.moneyIn, "nothing recorded");
  assert.equal(surv.adSpend, "not linked to a song");
});

test("the sample shows Touch Me's own spend and leaves the campaign, and the blank royalty, unlinked", () => {
  const today = "2026-11-18";
  const m = hqModel(sampleSheets(today), today, FX);
  const v = L.songPLView(m.songPL);
  const tm = v.songs.find((x) => x.song === "Touch Me");
  assert.equal(tm.moneyIn, L.money(38.2, "EUR"));
  assert.equal(tm.adSpend, L.money(12.5, "EUR"));
  assert.doesNotMatch(tm.adSpend, /USD/, "Touch Me BR is a campaign, not a song");
  assert.equal(tm.result, L.money(25.7, "EUR"));
  const ly = v.songs.find((x) => x.song === "Love You");
  assert.equal(ly.moneyIn, L.money(193.5, "EUR"));
  assert.deepEqual(ly.stores.sort(), ["Apple Music · " + L.money(41.1, "EUR"), "Spotify · " + L.money(152.4, "EUR")].sort());
  assert.equal(ly.adSpend, "not linked to a song");
  assert.equal(v.unlinked.royalties, L.money(3.5, "EUR"));
  assert.match(v.unlinked.spend, new RegExp(L.money(9, "EUR").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(v.unlinked.spend, /12\.50/);
  const html = L.songPLHtml(v);
  assert.match(html, /Not linked to a song/);
  assert.ok(html.includes("Love You") && html.includes("<details>"));
});

test("a Meta account total does not swallow a song Forge named, and the two are not added", () => {
  const sheets = { Spend: [["date", "platform", "campaign", "spend", "currency"], ["2026-11-10", "Meta", "Touch Me BR", "40", "USD"]] };
  const meta = { ok: true, rows: [{ day: "2026-11-10", spend: 40, currency: "USD" }], since: "2026-11-01", until: "2026-11-18" };
  const m = hqModel(sheets, TODAY, FX, meta, "", { spend: [{ date: "2026-11-10", platform: "Meta", account: "Meta", amount: 8, currency: "USD", song: "Night Drive" }] });
  const v = L.songPLView(m.songPL);
  const nd = v.songs.find((x) => x.song === "Night Drive");
  assert.equal(nd.adSpend, L.money(8, "USD"));
  assert.equal(v.unlinked.spend, L.money(40, "USD"));
  assert.equal(m.money.cap.native.USD, 40, "the cap still uses the account total once");
});

test("the page escapes a song name", () => {
  const html = L.songPLHtml(L.songPLView(songProfit({ royalties: [{ month: "2026-11", song: "Night <b>Drive", store: "Spotify", amount: 1, currency: "EUR" }] })));
  assert.match(html, /Night &lt;b&gt;Drive/);
  assert.doesNotMatch(html, /<b>Drive/);
});

test("recording a song on spend or a payment does not add a tool", async () => {
  assert.equal(TOOLS.length, 43); /* + account_health, needs_you, song_pl (18 Nov 2026 night test) */
  assert.ok(tool("record_spend").inputSchema.properties.song);
  assert.ok(tool("submit_income").inputSchema.properties.song);
  assert.ok(tool("submit_income").inputSchema.properties.store);
  assert.ok(TOOLS.find((t) => t.name === "song_pl"), "song_pl is the read-only per-song tool (18 Nov 2026 night test)");
  assert.match(instructionsFor("Forge", R), /not linked to a song/);
  assert.match(instructionsFor("Ledger", R), /per_song/);
  assert.doesNotMatch(instructionsFor("Steve", R), /per_song/);

  const d = memoryDesk();
  await S.setSources(d, [{ id: "paypal", name: "PayPal", kind: "account" }, { id: "revolut", name: "Revolut", kind: "account" }]);
  const named = await call(d, "submit_income", { bot: "Ledger", date: "2026-11-10", payer: "Sample Distro", amount: 6, currency: "EUR", account: "Revolut", category: "Self-releases", song: "Night Drive", store: "Spotify" });
  assert.equal(named.saved, true);
  await fails(call(d, "submit_income", { bot: "Ledger", date: "2026-11-11", payer: "Sample Distro", amount: 1, currency: "EUR", account: "Revolut", category: "Self-releases", store: "Spotify" }), /song/);
  await call(d, "submit_income", { bot: "Ledger", date: "2026-11-12", payer: "Sample Distro", amount: 15, currency: "EUR", account: "Revolut", category: "Self-releases" });
  await call(d, "submit_income", { bot: "Ledger", date: "2026-11-09", payer: "Sample Distro", amount: 4, currency: "EUR", account: "Revolut", status: "pending", category: "Label deals", song: "Night Drive" });
  await call(d, "record_spend", { bot: "Forge", platform: "TikTok", account: "TikTok Ads", date: "2026-11-10", amount: 3, currency: "EUR", song: "Night Drive" });
  await call(d, "record_spend", { bot: "Forge", platform: "TikTok", account: "TikTok Ads", date: "2026-11-10", amount: 9, currency: "EUR" });
  const rows = await S.listSpend(d, NOW);
  assert.equal(rows.filter((x) => x.platform === "TikTok").length, 2);
  const fixed = await call(d, "fix_payment", { bot: "Ledger", id: named.id, month: "2026-11", reason: "The store was wrong", store: "Apple Music" });
  assert.equal(fixed.saved, true);
  const seen = await call(d, "payments", { bot: "Ledger", month: "2026-11" });
  const row = seen.payments.find((p) => p.id === named.id);
  assert.equal(row.song, "Night Drive");
  assert.equal(row.store, "Apple Music");

  const st = await call(d, "income_status", { bot: "Ledger" });
  assert.match(st.per_song.sheet, /not read just now/);
  const night = st.per_song.songs.find((s) => s.song === "Night Drive");
  assert.equal(night.money_in, L.money(6, "EUR"));
  assert.equal(night.ad_spend, L.money(3, "EUR"));
  assert.equal(st.per_song.not_linked_to_a_song.payments, L.money(15, "EUR"));
  assert.equal(st.per_song.not_linked_to_a_song.ad_spend, L.money(9, "EUR"));
  assert.match(st.per_song.not_linked_to_a_song.note, /not received yet/);

  const withSheet = await call(d, "income_status", { bot: "Ledger" }, { hq: async () => hqModel({
    Royalties: [["month", "song", "store", "amount", "currency"], ["2026-11", "Night Drive", "Spotify", "20", "EUR"]],
    Spend: [["date", "platform", "campaign", "spend", "currency"]],
  }, TODAY, FX) });
  assert.equal(withSheet.per_song.sheet, undefined);
  const fromSheet = withSheet.per_song.songs.find((s) => s.song === "Night Drive");
  assert.equal(fromSheet.money_in, L.money(20, "EUR"));
  assert.equal(fromSheet.ad_spend, "not linked to a song");
  assert.equal(fromSheet.note, undefined, "the sheet's royalties are money in; a payment is not added on top when this answer has none");
});

test("Meta's own daily row does not overwrite a song row, and does not add a second account total on top of one", async () => {
  const d = memoryDesk();
  await S.recordSpend(d, NOW, R, { by: "Forge", platform: "Meta", account: "Meta", date: "2026-11-16", amount: "8.00", currency: "USD", song: "Night Drive" });
  const r = await S.recordMetaSpend(d, NOW, R, [{ day: "2026-11-16", spend: 30, currency: "USD" }], { since: "2026-11-16", until: "2026-11-16" });
  assert.equal(r.skipped, 1, "the day already names a song, so no account total is added on top");
  const rows = (await S.listSpend(d, NOW)).filter((x) => x.date === "2026-11-16");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].song, "Night Drive");
  assert.equal(rows[0].amount, 8);
});
