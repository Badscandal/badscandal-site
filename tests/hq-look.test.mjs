/* The phone look (18 Nov 2026): presentation only. Made-up songs and amounts. */
import { test } from "node:test";
import assert from "node:assert/strict";

await import("../js/hq-look.js");
const V = globalThis.HQLook;

test("the opening line counts what needs Luke and what there is to check", () => {
  assert.equal(V.homePulse({ need: [{}], risk: [{}, {}] }).line, "1 need you · 2 to check");
  assert.equal(V.homePulse({}).line, "You're all caught up");
});

test("a milestone appears only when the latest logged point crossed a mark", () => {
  const hit = V.milestones([{ song: "Paper Moon", series: [90000, 120000], lastDay: "2026-11-01" }]);
  assert.equal(hit.length, 1);
  assert.match(hit[0].line, /Paper Moon passed 100,000 streams/);
  assert.equal(V.milestones([{ song: "Paper Moon", series: [120000, 130000] }]).length, 0);
  assert.equal(V.milestones([{ song: "Paper Moon", series: [100] }]).length, 0);
});

test("the release hero is the soonest song still to come", () => {
  const hero = V.releaseHero([
    { id: "later", title: "Later", date: "2026-12-20", status: "scheduled" },
    { id: "soon", title: "Paper Moon", date: "2026-11-20", status: "scheduled" },
    { id: "draft", title: "Draft", date: "2026-11-18", status: "draft" }
  ], "2026-11-18", {});
  assert.equal(hero.title, "Paper Moon");
  assert.equal(hero.reported, true);
});

test("a missing 7-day change is not reported, never zero", () => {
  const row = V.platformKpis([{ platform: "TikTok", followers: 10, week: null }], null).find((p) => p.platform === "TikTok");
  const followers = row.cards.find((c) => c.label === "Followers");
  assert.equal(followers.hero, "not reported");
  assert.notEqual(followers.hero, "0");
  const views = row.cards.find((c) => c.label === "Views");
  assert.equal(views.hero, "not reported");
});

test("a health dot uses the panel when it is there", () => {
  assert.equal(V.healthDot("TikTok", { TikTok: { state: "bad", text: "Locked" } }, { followers: 1 }).state, "bad");
  assert.equal(V.healthDot("TikTok", null, { followers: 1, stale: 5 }).state, "bad");
  assert.equal(V.healthDot("TikTok", null, null).state, "off");
});

test("Nova's recommendation is the yes, and a blocked T- task is parked", () => {
  const stack = V.decisionStack([
    { id: "m1", to: "Luke", needs: "decision", text: "Send the USD 40 boost?\n2026-11-20", options: ["No", "Yes"], recommendations: [{ by: "Steve", option: "No" }, { by: "Nova", option: "Yes" }] }
  ], [{ id: "T-30", status: "blocked", task: "Old login", blocker: "Needs a code" }]);
  assert.equal(stack.top.yes, "Yes");
  assert.equal(stack.top.recommended, "Yes");
  assert.equal(stack.top.amount, "USD 40");
  assert.equal(stack.parked[0].id, "T-30");
});

test("a rejected release opens on the moderator's words", () => {
  const rows = V.releaseRows([{ id: "pm", title: "Paper Moon", date: "2026-11-27", status: "scheduled", store: { status: "rejected", reason: "Artwork is 2000 px" } }], "2026-11-18");
  assert.equal(rows[0].store.tone, "bad");
  const tl = V.releaseTimeline({ id: "pm", store: { status: "rejected", reason: "Artwork is 2000 px" }, steps: [] });
  const bad = tl.filter((s) => s.autoOpen);
  assert.ok(bad.length);
  assert.match(bad[0].note, /Artwork is 2000 px/);
  assert.equal(V.readinessBox(["Artwork is 2000 px"]).ready, false);
  assert.equal(V.readinessBox([]).line, "Files and details: nothing missing");
  assert.equal(V.readinessBox(["Artwork is 2000 px"]).line, "1 thing missing from the files and details");
  assert.equal(V.stampDay("2026-11-16T22:15:20.940Z", { day: (d) => "day " + d }), "day 2026-11-16");
  assert.equal(V.stampDay("not a date"), "");
});

test("ad tiles name a missing account and never invent a cost per engagement", () => {
  const pins = V.adsPins({ cap: { spent: 40, amount: 1000, currency: "USD", notRead: ["Google yesterday"] }, yesterday: { spend: 4, currency: "USD" } });
  assert.ok(pins.cap.missing.includes("Google not read"));
  assert.equal(pins.engagement.label, "not reported");
  assert.equal(pins.engagement.vs, "vs last week: not reported");
  const plot = V.creativePlot([
    { ad: "A", spend: 30, engagements: 2, cpeSeries: [1, 2, 3] },
    { ad: "B", spend: 4, engagements: 20 }
  ]);
  assert.equal(plot.points.find((p) => p.name === "A").over, true);
  assert.equal(plot.points.find((p) => p.name === "A").fatigue, true);
  assert.equal(V.creativePlot([{ ad: "A", spend: 10 }]).reported, false);
  assert.equal(V.runningNow([{ ad: "A" }]).reported, false);
});

test("one received card per currency, and only landed money counts", () => {
  const cards = V.moneyCards({
    income: { month: "2026-11", received: { USD: 40 }, payable: { EUR: 10 } },
    entries: [
      { status: "received", account: "Revolut", currency: "USD", amount: 40, date: "2026-11-02" },
      { status: "statement only", currency: "USD", amount: 5, date: "2026-11-03" }
    ],
    month: "2026-11"
  });
  assert.deepEqual(cards.cards.map((c) => c.currency), ["USD", "EUR", "GBP"]);
  const usd = cards.cards[0], eur = cards.cards[1], gbp = cards.cards[2];
  assert.equal(usd.landed, 40);
  assert.equal(usd.pending, 5);
  assert.equal(eur.landedText, "Nothing received");
  assert.equal(eur.pending, 10);
  assert.equal(gbp.landedText, "Nothing received");
  assert.equal(gbp.pendingText, "nothing");
  const unread = V.moneyCards({});
  assert.ok(unread.cards.every((c) => c.landedText === "not reported"));
});

test("the month chip says why it is not closed", () => {
  assert.equal(V.monthChip({ month: "2026-11", closes: [{ month: "2026-11" }] }).status, "closed");
  const open = V.monthChip({ month: "2026-11", unsorted: 2 });
  assert.equal(open.status, "open");
  assert.match(open.reason, /2 payments still to sort/);
  assert.equal(V.monthChip({ month: "2026-11", pending: true }).status, "provisional");
  assert.equal(V.monthChip({ month: "2026-11", ready: true }).status, "ready");
  assert.notEqual(V.monthChip({ month: "2026-11" }).status, "ready");
});

test("why this number lists landed Revolut payments and https evidence only", () => {
  const rows = V.whyPayments([
    { status: "received", account: "Revolut", currency: "USD", amount: 40, date: "2026-11-02", payer: "Sample Label", evidence: "https://example.com/a" },
    { status: "received", account: "Revolut", currency: "USD", amount: 9, date: "2026-11-02", payer: "Sample Label", evidence: "javascript:alert(1)" },
    { status: "received", account: "Wise", currency: "USD", amount: 40, date: "2026-11-02", payer: "Sample Label", movedTo: "r1" },
    { status: "payable", account: "Revolut", currency: "USD", amount: 3, date: "2026-11-02", payer: "Sample Label" }
  ], "USD", "2026-11");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].evidence, "https://example.com/a");
  assert.equal(rows[1].evidence, "");
});

test("a split that does not add up is flagged, and words stay plain", () => {
  assert.equal(V.splitOff({ amount: 40, splits: [10, 20] }), true);
  assert.equal(V.splitOff({ amount: 30, splits: [10, 20] }), false);
  assert.equal(V.splitOff({ amount: 40 }), false);
  assert.equal(V.plainStatus("Moved to Revolut"), "Already counted in Revolut");
  assert.equal(V.plainStatus("Statement only (not payable yet)"), "On a statement, not owed yet");
  assert.equal(V.plainStatus("To sort"), "Waiting for you to sort");
  assert.match(V.plainStatus("In Wise. It counts when it reaches Revolut"), /On the way/);
  assert.equal(V.paymentBucket({ movedTo: "r1" }), "confirming");
  assert.equal(V.paymentBucket({ status: "statement only" }), "statement");
  assert.equal(V.paymentBucket({ status: "transfer" }), "transfer");
  assert.equal(V.paymentBucket({ status: "received", account: "Revolut" }), "main");
});

test("the best post skips anything under 1,000 views and does not use the caption as the title", () => {
  const low = V.bestPost({ ranked: [{ views: 400, caption: "buy this now", rate: 0.2 }] }, []);
  assert.equal(low.reported, false);
  const hit = V.bestPost({ ranked: [{ views: 2000, caption: "Paper Moon out now", rate: 0.1, at: "2026-11-10", link: "https://example.com/p" }] }, [{ title: "Paper Moon" }]);
  assert.equal(hit.title, "Paper Moon · 2026-11-10");
  assert.doesNotMatch(hit.title, /buy this|out now/);
  assert.equal(V.uploadSlots([{ hour: 1, followers: 2 }]), null);
  assert.equal(V.uploadSlots(Array.from({ length: 7 }, (_, i) => ({ hour: i, followers: i + 1 }))).length, 7);
});

test("a song page row is green when nothing is wrong, and lyrics compare line by line", () => {
  const rows = V.siteRows([{ id: "papermoon", title: "Paper Moon", address: "badscandal.com/papermoon", lines: [{ label: "Page", text: "Live", tone: "ok" }] }]);
  assert.equal(rows[0].ok, true);
  assert.equal(rows[0].state, "Ready");
  const diff = V.lyricsDiff("one\ntwo", "one\nthree");
  assert.equal(diff.ready, true);
  assert.ok(diff.rows.some((r) => r.kind === "del" && r.text === "two"));
  assert.ok(diff.rows.some((r) => r.kind === "add" && r.text === "three"));
  assert.equal(V.lyricsDiff("", "three").ready, false);
});

test("Luke's first screen hides the connector chatter", () => {
  assert.equal(V.lukeSees("reconnect needed: refresh the tool list"), false);
  assert.equal(V.lukeSees("none right now"), false);
  assert.equal(V.lukeSees("ISRC BR-XXX"), false);
  assert.equal(V.lukeSees("Paper Moon is out on Friday"), true);
});

test("the home markup carries the pulse line and a placeholder while it loads", () => {
  const html = V.homeHtml({ pulse: V.homePulse({ need: 1, risk: 0 }), decision: "<p>Decide</p>", milestones: [], hero: { reported: false }, kpis: [] });
  assert.match(html, /1 need you · 0 to check/);
  assert.match(html, /No release on the board/);
  assert.match(V.homeHtml({ loading: true }), /class="ph big"/);
});
