/* One list, one spend figure, no mid-word cuts. Fake rows only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { needsCount } from "../netlify/lib/action-cards.mjs";
import { songProfit } from "../netlify/lib/hq.mjs";
import { evaluate } from "../netlify/lib/account-health.mjs";
import { needsDesk } from "../netlify/lib/needs.mjs";

const NOW = Date.parse("2026-11-19T16:00:00Z");
const R = S.DEFAULT_ROSTER;

test("cuts end on a word", () => {
  const long = "Upcoming filed: only the first two songs are on the list today";
  const cut = S.clipWords(long, 20);
  assert.match(cut, /…$/);
  assert.equal(cut.includes("onl"), false);
  assert.equal(S.excerptText("shows the channel and then stops", 12).includes("cha"), false);
  const whole = "alpha";
  assert.equal(S.clipWords(whole + " beta", 3), "alpha…");
});

test("a long update is echoed in full", async () => {
  const d = memoryDesk();
  const text = "Checked the desk and the numbers match the page. ".repeat(20).trim();
  const u = await S.postUpdate(d, NOW, R, { bot: "Nova", status: "done", message: text });
  assert.equal(u.full || u.message, text);
  assert.ok(!u.message.endsWith("cha"));
});

test("signed-out lines are one plain line per real account", () => {
  const lines = S.signedOutLines([
    { who: "Atlas", text: "None right now, SfA is signed in" },
    { who: "Drop", text: "RouteNote sessions expire often" },
    { who: "Forge", text: "Google Ads 111-222-3333 signed out since 14 Nov" },
    { who: "Forge", text: "Google Ads 111-222-3333 signed out since 14 Nov, still" },
    { who: "Forge", text: "Google Ads sign-in from Luke for account, so the read failed" },
  ]);
  assert.deepEqual(lines.map((x) => x.line), ["Google Ads 111-222-3333 signed out since 14 Nov"]);
});

test("google unread days collapse to one line", () => {
  const line = S.unreadSpendLine([
    "Google Fri 14 Nov: signed out",
    "Google Sat 15 Nov: signed out",
    "Google Sun 16 Nov: signed out",
  ]);
  assert.equal(line, "Google not read since 14 Nov (signed out)");
});

test("needs you counts sign-ins, access, a yes, and a fan reply", () => {
  const desk = {
    messages: [], releases: [], sightings: null, disputes: [],
    cards: {
      Drop: { needs: "Waiting on Luke's yes for the featured-artist line" },
      Webmaster: { needs: "Needs Netlify Viewer access" },
      Forge: { needs: "Google Ads 111-222-3333 signed out since 14 Nov" },
      Atlas: { blockers: "None right now, SfA is signed in" },
    },
    needsReply: [{ id: "fan1", text: "Can we record something together" }],
  };
  const n = needsCount(desk, "2026-11-19", NOW);
  assert.ok(n.total >= 4, n.line);
  assert.equal(n.line.includes("Nothing"), false);
  assert.ok(n.items.some((x) => x.kind === "signin"));
  assert.ok(n.items.some((x) => x.kind === "access"));
  assert.ok(n.items.some((x) => x.kind === "yes"));
  assert.ok(n.items.some((x) => x.kind === "fan"));
  assert.equal(needsCount({ messages: [], releases: [], disputes: [] }, "2026-11-19", NOW).line, "Nothing needs you");
});

test("a stale site check is replaced with the live duty count", () => {
  const report = { at: "2026-11-19T12:35:00Z", text: "Laura blocked. Duties: 8 of 13. 1 blocked. Spend 100.00." };
  const live = S.freshReport(report, { team: { duties: { done: 12, total: 13, blocked: 0 } } });
  assert.equal(live.stale, true);
  assert.match(live.text, /12 of 13/);
  assert.match(live.text, /0 blocked/);
  const same = S.freshReport({ text: "Duties: 12 of 13. 0 blocked." }, { team: { duties: { done: 12, total: 13, blocked: 0 } } });
  assert.equal(same.stale, undefined);
});

test("editing a case does not reset how long it has been waiting", async () => {
  const d = memoryDesk();
  const opened = await S.openCase(d, NOW, R, { by: "Drop", song: "Northwind", platform: "RouteNote", type: "moderation", status: "waiting on Luke", waiting_on: "Luke", proposal: "Hello.\nThe cover is fixed." });
  const first = opened.item.waitingSince;
  assert.ok(first);
  const again = await S.updateCase(d, NOW + 3600000, R, { by: "Drop", id: opened.item.id, entry: "Still waiting.", proposal: "To: desk@example.com\nCC: cc@example.com\nSubject: Cover\nBody: Please look again." });
  assert.equal(again.item.waitingSince, first);
  assert.match(again.item.proposal, /To: desk@example.com\nCC:/);
  const moved = await S.updateCase(d, NOW + 7200000, R, { by: "Drop", id: opened.item.id, waiting_on: "a reply", waiting_since: "2026-11-18 09:00" });
  assert.equal(moved.item.waitingSince, "2026-11-18 09:00");
});

test("HQ does not overwrite a bot's growth reading, and 1.7k is a number", async () => {
  const d = memoryDesk();
  const roster = R.concat([{ name: "HQ", role: "site" }]);
  await S.logGrowth(d, NOW, roster, { by: "Steve", date: "2026-11-18", platform: "TikTok", followers: "1.7k", views: "900", views_date: "2026-11-17" });
  const second = await S.logGrowth(d, NOW, roster, { by: "HQ", date: "2026-11-18", platform: "TikTok", followers: "9999" });
  assert.equal(second.row.followers, 1700);
  assert.equal(second.row.views_date, "2026-11-17");
  assert.equal(second.replaced && second.replaced.includes("followers"), false);
});

test("unlinked ad spend carries its months and is not the cap", () => {
  const pl = songProfit({ spend: [
    { date: "2026-09-02", platform: "Meta", amount: 10, currency: "USD", song: "" },
    { date: "2026-11-02", platform: "Meta", amount: 5, currency: "USD", song: "" },
  ] });
  assert.equal(pl.unlinked.spend.from, "2026-09");
  assert.equal(pl.unlinked.spend.to, "2026-11");
  assert.match(pl.unlinked.spend.note, /Not the monthly ad cap/);
});

test("a no-impact claim is not Watch, and a blank account is not enough data", () => {
  const quiet = evaluate({ now: NOW, claims: [{ claim: "A quiet claim", claimant: "our own label", impact: "no impact", date: "2026-11-18", by: "Laura", last_checked: "2026-11-18" }] });
  const yt = quiet.accounts.find((a) => a.id === "youtube");
  assert.equal(yt.signals.some((s) => s.id.startsWith("claim") && s.level === "watch"), false);
  const blank = evaluate({ now: NOW, growth: [], checks: [] });
  const tt = blank.accounts.find((a) => a.id === "tiktok");
  assert.equal(tt.state, "gap");
  assert.match(tt.headline, /Not enough data/);
});

test("month_check is not ready while an FX transfer is still listed", async () => {
  const d = memoryDesk();
  await d.setJSON("inc/2026-10.json", [{ id: "fx1", date: "2026-10-20", payer: "FX conversion", amount: 10, currency: "EUR", status: "transfer", account: "Revolut", by: "HQ", category: "FX" }]);
  const check = await S.monthCheck(d, NOW, { month: "2026-10" });
  assert.ok(check.ownTransfers.some((e) => e.id === "fx1"));
  assert.equal(check.ready, false);
});

test("to sort shows this month only", async () => {
  const d = memoryDesk();
  await d.setJSON("sources.json", []);
  await d.setJSON("inc/2026-11.json", [{ id: "n1", date: "2026-11-04", payer: "Sample", amount: 3, currency: "EUR", status: "unsorted", account: "Revolut", by: "HQ" }]);
  await d.setJSON("inc/2026-09.json", [{ id: "s1", date: "2026-09-04", payer: "Sample", amount: 3, currency: "EUR", status: "unsorted", account: "Revolut", by: "HQ" }]);
  const inc = await S.incomeState(d, NOW);
  assert.deepEqual(inc.unsortedMonth.map((e) => e.id), ["n1"]);
  assert.ok(inc.unsorted.length >= 1);
});

test("needs you includes a fan question stored on Instagram", async () => {
  const d = memoryDesk();
  const ig = { async get(k) {
    if (k === "comments.json") return [{ id: "c1", at: "2026-11-18T12:00:00Z", user: "fan", text: "can I sing with you?", postCaption: "a clip", link: "https://www.instagram.com/p/sample" }];
    if (k === "posts.json" || k === "countries.json") return k === "posts.json" ? [] : null;
    return null;
  } };
  const desk = await needsDesk(d, NOW, { ig });
  const n = needsCount(desk, "2026-11-19", NOW);
  assert.ok(n.items.some((x) => x.kind === "fan"));
  assert.ok(n.total >= 1);
});
