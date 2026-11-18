/* Phone HQ (18 Nov 2026). The rules the opening screen, the money lines, the spend gauge,
   the Monday pick and the lyrics card draw from. Made-up names and amounts only: the repo is public. */
import { test } from "node:test";
import assert from "node:assert/strict";

await import("../js/hq-lib.js");
const L = globalThis.HQLib;

test("a broken date says not reported, and a real one still reads as a day", () => {
  assert.equal(L.day("Invalid Date"), "not reported");
  assert.equal(L.day("Friday"), "Friday");
  assert.equal(L.day("2026-11-18"), "Wed 18 Nov");
  assert.equal(L.dutyWhen({ status: "todo", due: "Invalid Date" }), "not reported");
  assert.equal(L.dutyWhen({ status: "todo", due: "09:15" }), "due 09:15");
  assert.equal(L.dutyWhen({ status: "done", due: "Invalid Date" }), "done");
  assert.equal(L.spStampOf("2026-11-18 14:05"), "2026-11-18 14:05", "a São Paulo stamp is not shifted again");
  assert.equal(L.deskWhen("2026-11-18 14:05", "2026-11-18"), "14:05");
  assert.equal(L.deskWhen("Invalid Date", "2026-11-18"), "not reported");
});

test("received, payable and waiting are three lines and never one total", () => {
  const h = L.moneyHead({ received: { USD: 40, EUR: 10 }, payable: { USD: 5 }, holding: { EUR: 7 } });
  assert.equal(h.received.length, 2);
  assert.deepEqual(h.payable, [L.money(5, "USD")]);
  assert.deepEqual(h.waiting, [L.money(7, "EUR")]);
  assert.equal(L.moneyHead({}).received.length, 0);
  const landed = { id: "r", date: "2026-11-18", statement: "2026-11-02", account: "Revolut", status: "received", payer: "Sample Label", amount: 40, currency: "USD" };
  const wise = { id: "w", date: "2026-11-01", account: "Wise", status: "received", movedTo: "r", payer: "Sample Label", amount: 40, currency: "USD" };
  const flow = L.payFlow(landed, [landed, wise]);
  assert.deepEqual(flow.map((s) => s.missing), [false, false, false]);
  assert.equal(flow[0].label, "Statement");
  assert.equal(flow[1].label, "Wise");
  assert.equal(flow[2].label, "Landed at Revolut");
  const held = L.payFlow({ id: "h", date: "2026-11-10", account: "PayPal", status: "received", payer: "Sample Label" }, []);
  assert.equal(held[0].missing, true, "no statement");
  assert.equal(held[1].missing, false);
  assert.equal(held[2].missing, true, "not at Revolut yet");
  assert.equal(held[2].text, "missing");
});

test("the spend gauge is the cap, split by platform, with unread days named and no controls", () => {
  assert.equal(L.spendGauge(null).reported, false);
  assert.equal(L.spendGauge(null).label, "not reported");
  const g = L.spendGauge({
    spent: 420, amount: 1000, warn: 750, stop: 900, currency: "USD",
    byPlatform: { TikTok: { USD: 40 }, Meta: { USD: 300 }, Google: { USD: 80 } },
    notRead: ["Google Fri 14 Nov: signed out", "Google Sat 15 Nov: signed out", "Google Sun 16 Nov: signed out"],
  });
  assert.equal(g.amount, 1000);
  assert.equal(g.warn, 750);
  assert.equal(g.stop, 900);
  assert.deepEqual(g.parts.map((p) => p.name), ["Google", "Meta", "TikTok"]);
  assert.deepEqual(g.gaps, ["Google 14-16 Nov, signed out"]);
  assert.equal(JSON.stringify(g).includes("pause"), false);
});

test("a decision card offers the recommended option as yes, and lyrics preview keeps the lines", () => {
  const cards = L.decisionCards([
    { id: "m1", to: "Luke", needs: "decision", resolved: null, from: "Forge", text: "Put the ad money on this one.", options: ["No", "Yes"], recommendations: [{ by: "Nova", option: "Yes", why: "It engaged more." }] },
    { id: "m2", to: "Nova", needs: "decision", options: ["Yes"] },
  ]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].yes, "Yes");
  assert.equal(cards[0].no, "No");
  assert.equal(cards[0].recommended, "Yes");
  assert.equal(cards[0].later, "");
  const ly = L.decisionCards([{ id: "m3", to: "Luke", needs: "decision", from: "Verse", text: "Are the lyrics right?", options: ["Approve", "Not yet"], approval: { id: "song1", title: "Paper Moon", what: "lyrics" } }]);
  assert.equal(ly[0].lyrics, true);
  assert.equal(ly[0].yes, "Approve");
  assert.equal(ly[0].releaseId, "song1");
  assert.deepEqual(L.lyricsPreview("Line one\n\nLine two").lines, ["Line one", "", "Line two"]);
  assert.equal(L.lyricsPreview("").empty, true);
});

test("a release face shows the next step, green/amber/red dots, and hides warnings on a pre-HQ song", () => {
  const v = {
    id: "s1", title: "Paper Moon", date: "2026-11-27", status: "scheduled", released: false, daysToGo: 9,
    pack: { prehq: "Yes", upc: "0000000000017", isrc: "QZ0000000001" },
    steps: [{ status: "done" }, { status: "blocked" }, { status: "todo", waiting: true }, { status: "skipped" }],
    counts: { done: 1, total: 3 },
    next: { label: "Lyrics live", owner: "Verse", status: "todo", due: "2026-11-20", dueIn: 2 },
    warnings: ["Missing the artwork"],
    store: { status: "approved", since: "2026-11-01" },
  };
  const f = L.releaseFace(v, "2026-11-18", { cover: "/assets/made-up.jpg", taps: 3, people: 8 });
  assert.deepEqual(f.dots, ["done", "bad", "wait"]);
  assert.equal(f.prehq, true);
  assert.deepEqual(f.warnings, []);
  assert.match(f.distributor, /at distributor: approved/);
  assert.match(f.distributor, /UPC 0000000000017/);
  assert.equal(f.next.owner, "Verse");
  assert.equal(f.progress.text, "1 of 3 steps done");
  const out = L.releaseFace({ ...v, pack: {}, released: true, daysToGo: -2, warnings: [] }, "2026-11-18");
  assert.equal(out.when, "Out now");
});

test("team dots are red only when late or blocked, and the week lists releases, the card and Monday", () => {
  const dots = L.teamDots([{ name: "Nova", state: "done" }, { name: "Forge", state: "blocked" }, { name: "Atlas", state: "working" }, { name: "Drop", state: "late" }]);
  assert.deepEqual(dots.map((d) => d.tone), ["grey", "bad", "on", "bad"]);
  const week = L.weekAhead({
    today: "2026-11-18",
    releases: [{ id: "s1", title: "Paper Moon", date: "2026-11-20", status: "scheduled" }, { id: "old", title: "Old", date: "2026-11-01", status: "scheduled" }],
    homeCard: { now: { slug: "old", title: "Old", date: "2026-11-14" }, due: { slug: "s1", title: "Paper Moon", date: "2026-11-20" } },
  });
  assert.deepEqual(week.map((x) => x.kind), ["release", "card", "ads"]);
  assert.equal(week[2].date, "2026-11-23");
  assert.equal(week[2].href, "#ads");
});

test("quiet mode keeps one line per bot, and a missing follower is not reported", () => {
  const g = L.quietFeed([{ bot: "Nova", at: "2026-11-18 09:00", message: "older" }, { bot: "Forge", at: "2026-11-18 10:00", message: "ads" }, { bot: "Nova", at: "2026-11-18 11:00", message: "newer" }]);
  assert.equal(g.length, 2);
  assert.equal(g[0].latest.message, "older");
  assert.equal(g[0].older.length, 1);
  const strip = L.followerStrip([{ platform: "TikTok", followers: 10, day: 2, series: [1, 2] }, { platform: "Instagram", followers: null }]);
  assert.equal(strip[0].reported, true);
  assert.equal(strip[1].reported, false);
  assert.equal(strip[2].platform, "YouTube");
  assert.equal(strip[2].reported, false);
});

test("Monday's pick uses the ranking, and Yes is the decision's own option", () => {
  assert.equal(L.mondayPick(null, null, []), null);
  const pick = L.mondayPick({
    ranked: [
      { caption: "Paper Moon out now", link: "https://example.com/a", rate: 0.12, views: 100, engaged: 12, likes: 8, comments: 1, saves: 2, shares: 1, deep: 0.03, paid: { spend: 4, currency: "USD", engaged: 10, costPerEng: 0.4 } },
      { caption: "Another clip", link: "https://example.com/b", rate: 0.05, views: 80, engaged: 4, likes: 3, comments: 1, saves: 0, shares: 0, deep: 0 },
    ],
  }, { id: "m9", options: ["Skip it", "Boost it"], recommendations: [{ by: "Nova", option: "Boost it", why: "More saves." }], resolved: null }, [{ title: "Paper Moon", cover: "/assets/made-up.jpg" }]);
  assert.equal(pick.pick.song, "Paper Moon");
  assert.equal(pick.pick.cover, "/assets/made-up.jpg");
  assert.match(pick.pick.cost, /0\.400/);
  assert.equal(pick.runner.song, "Another clip");
  assert.equal(pick.decisionId, "m9");
  assert.equal(pick.yes, "Boost it");
  assert.equal(pick.no, "Skip it");
  const bare = L.mondayPick({ ranked: [{ caption: "No song named", rate: 0.1, views: 10, engaged: 1, likes: 1, comments: 0, saves: 0, shares: 0, deep: 0 }] }, null, []);
  assert.equal(bare.decisionId, "");
  assert.equal(bare.yes, "");
  assert.equal(bare.pick.cost, "not reported");
});

test("a red account is in Needs you, and a watch or a green is only a dot", () => {
  const home = L.accountHealthHome({
    accounts: [
      { id: "tiktok", label: "TikTok", state: "red", known: true, headline: "The last 3 posts are each under 30%.", next: "Pause hashtags, check Account Status, post normally, no deleting." },
      { id: "youtube", label: "YouTube", state: "watch", known: true, headline: "One recent post is under 30%." },
      { id: "instagram", label: "Instagram", state: "green", known: true, headline: "Recent posts are in line." },
      { id: "spotify", label: "Spotify", state: "watch", known: false, headline: "Not enough data." },
    ],
    connection: { state: "watch", text: "Meta asked HQ to slow down. This is the connection, not the account." },
  });
  assert.deepEqual(home.needs.map((n) => n.id), ["tiktok"]);
  assert.match(home.needs[0].next, /Pause hashtags, check Account Status, post normally, no deleting/);
  assert.equal(home.dots.find((d) => d.id === "youtube").state, "watch");
  assert.equal(home.dots.find((d) => d.id === "instagram").state, "green");
  assert.equal(home.dots.find((d) => d.id === "spotify").state, "gap", "only missing numbers is not a warning dot");
  assert.equal(home.connection.state, "watch");
  const down = L.accountHealthHome({ accounts: [], connection: { state: "down", text: "Meta told HQ to stop, so HQ has stopped reading Instagram." } });
  assert.equal(down.needs[0].title, "HQ connection");
  assert.match(down.needs[0].line, /connection|stopped/i);
  assert.equal(L.accountHealthHome(null).needs.length, 0);
});
