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

test("Waiting on you is one list: empty when nothing is there, red then oldest when something is", () => {
  assert.deepEqual(V.waitingOnYou({}), []);
  const list = V.waitingOnYou({
    today: "2026-11-19",
    messages: [
      { id: "m-new", to: "Luke", needs: "reply", text: "A newer question", at: "2026-11-19T12:00:00Z" },
      { id: "m-old", to: "Luke", needs: "decision", text: "An older decision", at: "2026-11-17T12:00:00Z", options: ["Yes", "No"] }
    ],
    tasks: [
      { id: "T-30", status: "blocked", task: "Site analytics", blocker: "Netlify Viewer not granted", deadline: "2026-11-18" },
      { id: "D-1", status: "blocked", task: "A duty, not a T-row" },
      { id: "T-9", status: "done", task: "Already done" }
    ],
    disputes: [
      { id: "d-green", song: "Paper Moon", platform: "RouteNote", status: "solved - confirm", waitingSince: "2026-11-18T12:00:00Z" },
      { id: "d-red", song: "Northwind", platform: "YouTube", status: "waiting on Luke", waitingSince: "2026-11-16T12:00:00Z" },
      { id: "d-test", song: "Love You", platform: "TEST", status: "waiting on Luke" },
      { id: "d-shut", song: "Closed", platform: "Spotify", status: "resolved" }
    ]
  });
  assert.deepEqual(list.map((x) => x.id), ["d-red", "m-old", "T-30", "m-new", "d-green"]);
  assert.equal(list.find((x) => x.id === "T-30").reason, "Netlify Viewer not granted");
  assert.equal(list.find((x) => x.id === "T-30").title, "Site analytics");
  assert.equal(list.find((x) => x.id === "d-green").tone, "green");
  assert.equal(list.some((x) => x.id === "d-test" || x.id === "D-1" || x.id === "T-9"), false);
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
  /* v18, 21 Nov 2026: a missing figure says why and where it is (Forge), still never invented */
  assert.equal(pins.engagement.vs, "Meta's engagements aren't read here. A boost's cost per engagement is on Growth.");
  const plot = V.creativePlot([
    { ad: "A", spend: 30, engagements: 2, cpeSeries: [1, 2, 3] },
    { ad: "B", spend: 4, engagements: 20 }
  ]);
  assert.equal(plot.points.find((p) => p.name === "A").over, true);
  assert.equal(plot.points.find((p) => p.name === "A").fatigue, true);
  assert.equal(V.creativePlot([{ ad: "A", spend: 10 }]).reported, false);
  assert.equal(V.runningNow([{ ad: "A" }]).reported, false);
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
