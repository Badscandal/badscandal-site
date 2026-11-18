/* Connector bug fixes, 18 Nov 2026. Made-up songs, payers and numbers only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import * as P from "../netlify/lib/postrank.mjs";
import * as IG from "../netlify/lib/instagram.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";

const NOW = Date.parse("2026-11-17T15:00:00Z");
const R = S.DEFAULT_ROSTER;
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, o = {}) => callTool(tool(name), args, { store: d, now: o.now || NOW, role: o.role || "bot", hq: async () => null, ig: o.ig });
const PACK = { kind: "Self-release", wav: "https://example.com/a.wav", artwork: "https://example.com/a.jpg", language: "English", explicit: "No", genre: "Dance", writers: "A. Writer", copyright: "℗ 2026 badscandal" };

test("case is a note; Featured Badscandal is flagged and not moved", () => {
  assert.deepEqual(S.artistProblems("Badscandal"), []);
  assert.match(S.artistNotes("Badscandal")[0], /capitalisation does not matter/);
  const p = S.preflightOf({ id: "papermoon", pack: { primary: "Sample Singer", featuring: "Badscandal" } });
  assert.match(p.map((x) => x.text).join(" "), /under Featured, not Primary/);
  assert.equal(S.preflightOf({ id: "papermoon", pack: { primary: "Sample Singer", featuring: "Badscandal" } }).some((x) => x.pack), false);
});

test("set_my_card can clear a blocker without a new working_on line", async () => {
  const d = memoryDesk();
  await call(d, "set_my_card", { bot: "Kevin", working_on: "Counting posts", blockers: "The tab will not load" });
  const c = await call(d, "set_my_card", { bot: "Kevin", blockers: "" });
  assert.equal(c.saved, true);
  assert.equal(c.working_on, "Counting posts");
  assert.equal(c.blockers, "");
});

test("stale duty lines and closed sign-in tasks are rewritten on read", () => {
  assert.match(S.freshDuty("Record Meta too until the meta-api-feed brief says LIVE, and Google (EUR)"), /HQ records Meta itself/);
  assert.match(S.freshDuty("Record Meta too until the meta-api-feed brief says LIVE, and Google (EUR)"), /currency not confirmed/);
  assert.equal(S.freshWhy("Drop", "reports what each song earned"), "Gets each self-release into the stores on time.");
  assert.equal(S.freshBlocker("Revolut can't be read", { revolutLive: true }), "");
  assert.equal(S.staleTask({ id: "T-30", task: "Forge's TikTok Ads sign-in" }), true);
  assert.match(S.hidePrivate("card ending 4242 and account 376-151-8792"), /\[hidden\].*\[account\]/);
  assert.equal(S.hidePrivate("the song is 4 minutes"), "the song is 4 minutes");
});

test("a self-release pack shows RouteNote, and a skipped pitch does not ask for mood", async () => {
  const d = memoryDesk();
  const r = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Paper Moon", date: "2026-12-18", pack: PACK });
  await S.sendRelease(d, NOW, R, { by: "Luke", id: r.id });
  await S.setStep(d, NOW, R, { by: "Nova", id: r.id, step: "pitch", status: "skipped", note: "The one-pitch rule skipped this one." });
  const pack = await call(d, "release_pack", { bot: "Atlas", song: "Paper Moon" });
  const dist = pack.pack.find((f) => f.field === "distributor");
  assert.match(dist.value, /RouteNote/);
  const mood = pack.pack.find((f) => f.field === "mood");
  assert.equal(mood.state, "not needed");
  assert.equal(pack.approvals.pitch.state, "skipped: approval not needed");
});

test("a pre-HQ pack does not list required fields", async () => {
  const d = memoryDesk();
  await S.saveRelease(d, NOW, R, { by: "Luke", title: "Quiet Hour", date: "2026-12-04", pack: { prehq: "Yes", kind: "Self-release" } });
  const pack = await call(d, "release_pack", { bot: "Claude", song: "Quiet Hour" }, { role: "claude" });
  assert.ok(pack.pack.every((f) => f.state !== "missing (required)"), pack.pack.filter((f) => f.state === "missing (required)").map((f) => f.field).join(","));
});

test("words are cut on a space, and a clear yes is a yes", () => {
  const cut = S.clipWords("one two three four five", 12);
  assert.ok(!cut.endsWith("tw") && cut.includes("…"));
  assert.equal(S.clearYes("Yes, correct."), true);
  assert.equal(S.clearYes("no"), false);
  assert.equal(S.clearYes("yes the artwork is the blue one and also change the date"), false);
});

test("ranking uses 1,000 views, keeps an old post, and joins a spend row", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  const posts = [
    { id: "a", at: "2026-11-14T12:00:00Z", caption: "A new one", type: "feed", link: "https://example.com/a", snaps: { d1: { at: "2026-11-15T12:00:00Z", views: 5000, likes: 400, comments: 10, saves: 20, shares: 5 } } },
    { id: "b", at: "2026-10-20T12:00:00Z", caption: "Crazy vibe on this one", type: "feed", link: "https://example.com/b", snaps: { d1: { at: "2026-10-21T12:00:00Z", views: 26136, likes: 800, comments: 20, saves: 40, shares: 10 } } },
    { id: "c", at: "2026-11-15T12:00:00Z", caption: "Small", type: "feed", snaps: { d1: { at: "2026-11-16T12:00:00Z", views: 400, likes: 10, comments: 0, saves: 0, shares: 0 } } },
  ];
  const r = P.rankPosts(posts, { ads: [] }, { now, spend: [{ date: "2026-11-15", amount: 32.71, currency: "USD", platform: "Meta" }] });
  assert.equal(r.minViews, 1000);
  assert.ok(r.ranked.some((x) => x.id === "a" && x.boosted && x.paid.spend === 32.71));
  assert.ok(r.older.some((x) => x.id === "b"));
  assert.ok(r.tooFew.some((x) => x.id === "c" && x.under_1000));
  assert.match(P.rankLine(r.ranked.find((x) => x.id === "a")), /boosted USD 32\.71/);
  const ask = IG.needsReply([{ id: "c1", at: "2026-11-16T21:01:00Z", user: "fan_example", text: "Would it be okay to use it in my videos?", post: "p", postCaption: "A clip", link: "https://example.com/p", own: false }], now);
  assert.equal(ask.length, 1);
  assert.equal(ask[0].id, "c1");
});

test("open messages are only the caller's", async () => {
  const d = memoryDesk();
  await S.sendMessage(d, NOW, R, { from: "Nova", to: "Luke", text: "A question for Luke about the made-up song." });
  await S.sendMessage(d, NOW, R, { from: "Kevin", to: "Nova", text: "A note for Nova." });
  const open = await call(d, "read_messages", { bot: "Kevin", show: "open" });
  assert.ok(open.messages.every((m) => m.from === "Kevin" || m.to === "Kevin"));
  assert.equal(open.messages.some((m) => /question for Luke/.test(m.text)), false);
});

test("a moved Wise row is not counted, and a near-duplicate credit is one row", async () => {
  const d = memoryDesk();
  await S.setSources(d, [
    { id: "revolut", name: "Revolut", kind: "account", owner: "HQ", cadence: "daily", state: "active" },
    { id: "wise", name: "Wise", kind: "account", owner: "Ledger", cadence: "daily", state: "active" }]);
  const wise = await S.submitIncome(d, NOW, R, { bot: "Ledger", date: "2026-11-02", payer: "Sample Distro", amount: "100.00", currency: "EUR", account: "Wise", status: "received", category: "Other" });
  const rev = await S.submitIncome(d, NOW, R, { bot: "Ledger", date: "2026-11-03", payer: "Sample Distro", amount: "100.00", currency: "EUR", account: "Revolut", status: "received", category: "Other" });
  await S.linkTransfer(d, NOW, R, { by: "Ledger", revolut_id: rev.entry.id, month: "2026-11", from: [wise.entry.id] });
  const list = await S.listPayments(d, NOW, { month: "2026-11" });
  const moved = list.payments.find((e) => e.id === wise.entry.id);
  assert.equal(S.payOut(moved).status, "moved to Revolut");
  assert.equal(S.payOut(moved).counted, false);
  const shadow = await S.submitIncome(d, NOW, R, { bot: "HQ", date: "2026-11-03", payer: "Sample Distro", amount: "100.40", currency: "EUR", account: "Revolut", status: "unsorted", category: "Other" });
  const again = await S.listPayments(d, NOW, { month: "2026-11" });
  assert.equal(again.payments.some((e) => e.id === shadow.entry.id), false);
});

test("payable is not called pending, and a guide that says eighteen tools is rewritten", async () => {
  const d = memoryDesk();
  await S.submitIncome(d, NOW, R, { bot: "Ledger", date: "2026-11-04", payer: "Sample Label", amount: "20", currency: "EUR", account: "Revolut", status: "payable", category: "Other" });
  const brief = await call(d, "luke_briefing", { bot: "Alfred" });
  assert.equal(brief.income_this_month.pending, "nothing logged");
  assert.equal(brief.income_this_month.payable, "EUR 20.00");
  await d.setJSON("guide.json", { text: "There are eighteen tools. Start with my_day.", at: "2026-11-11T00:00:00Z" });
  const g = await call(d, "read_guide", { bot: "Ledger" });
  assert.match(g, new RegExp(`${TOOLS.length} tools`));
  assert.doesNotMatch(g, /eighteen tools/);
  assert.match(g, /counts once/);
});

test("several spend days land in one call, and a lyric-like reply stays pending", async () => {
  const d = memoryDesk();
  const r = await call(d, "record_spend", { bot: "Forge", platform: "Google", account: "Sample ads", currency: "USD", days: [{ date: "2026-11-01", amount: 3 }, { date: "2026-11-02", amount: 4 }] });
  assert.equal(r.days, 2);
  assert.match(r.recorded, /2026-11-01/);
  assert.match(r.recorded, /2026-11-02/);
  const lines = ["first line of a verse here", "second line of a verse here", "third line of a verse here", "fourth line of a verse here"].join("\n");
  await S.saveRelease(d, NOW, R, { by: "Luke", title: "Paper Moon", date: "2026-12-18", pack: PACK });
  const sent = await S.sendMessage(d, NOW, R, { from: "Verse", to: "Luke", text: "Lyrics for Paper Moon?", release: "papermoon" });
  const reply = await S.sendMessage(d, NOW, R, { from: "Luke", to: "Verse", text: lines, re: sent.message.id });
  assert.match(reply.lyricsPending.note, /not in the pack/);
  const stored = await S.getMessage(d, reply.message.id);
  assert.equal(stored.lyricsPending.pending, true);
});
