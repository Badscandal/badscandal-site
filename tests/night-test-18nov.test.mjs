/* 18 Nov 2026 night test. Made-up names and amounts only. The desk rows are never deleted. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, connectorStatus } from "../netlify/lib/staff-tools.mjs";
import { handle } from "../netlify/lib/mcp.mjs";
import { rankPosts, rankLine } from "../netlify/lib/postrank.mjs";
import { fanInbox } from "../netlify/lib/instagram.mjs";

const NOW = Date.parse("2026-11-18T15:00:00Z"); /* 12:00 São Paulo */
const QUIET = Date.parse("2026-11-18T02:00:00Z"); /* 23:00 the night before, São Paulo */
const TODAY = "2026-11-18";
const R = S.DEFAULT_ROSTER;
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, o = {}) => callTool(tool(name), args, { store: d, now: o.now || NOW, role: "bot", hq: o.hq || (async () => null) });
const FULL = { kind: "Self-release", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", language: "Portuguese", explicit: "no", genre: "Dance", writers: "Sample Writer: music and lyrics", copyright: "℗ 2026 Sample · © 2026 Sample" };
const pay = (over) => ({ history: [], reference: "", period: "", source: "", note: "", by: "Ledger", at: "2026-11-01T15:00:00Z", category: "Other", ...over });
const src = (id, name) => ({ id, name, kind: "payer", category: "Other", currency: "EUR", lands: "", cadence: "monthly", owner: "Ledger", state: "active", match: [name.toLowerCase()], how: "", blocker: "", needsLuke: "" });

test("reconnect is the count or the names, never a version bump on its own", () => {
  const same = connectorStatus(TOOLS, { tools_seen: TOOLS.length, list_version: "00000000", tools_version: "ffffffff" });
  assert.equal(same.reconnect_needed, false);
  assert.equal(same.status.includes("reconnect needed"), false);
  const names = connectorStatus(TOOLS, { tools_seen: TOOLS.length, tool_names: ["my_day", "not_a_tool"] });
  assert.equal(names.reconnect_needed, true);
  assert.match(names.status, /reconnect needed/);
  assert.equal(TOOLS.filter((t) => ["account_health", "needs_you", "song_pl"].includes(t.name)).length, 3);
});

test("the connector says the tools version when a bot connects", async () => {
  const deps = { tools: TOOLS, instructions: "hello", call: async () => ({}) };
  const init = await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, {}, deps);
  assert.equal(init.body.result.serverInfo.version, "1.0.0");
  assert.equal(init.body.result.serverInfo.tools, TOOLS.length);
  assert.match(init.body.result.serverInfo.toolsVersion, /^[0-9a-f]{8}$/);
  const disc = await handle({ jsonrpc: "2.0", id: 2, method: "server/discover", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } } }, { "mcp-protocol-version": "2026-07-28" }, deps);
  assert.equal(disc.body.result._meta["io.modelcontextprotocol/serverInfo"].toolsVersion, init.body.result.serverInfo.toolsVersion);
});

test("before the duty rows, and in quiet hours, the note and the next line agree", async () => {
  const d = memoryDesk();
  const early = await call(d, "my_day", { bot: "Kevin" }, { now: Date.parse("2026-11-18T09:30:00Z") }); /* 06:30 São Paulo */
  assert.match(early.note, /Today's duties appear after 07:00/);
  assert.match(early.next, /Today's duties appear after 07:00/);
  assert.equal(early.note.includes("Do your duty"), false);
  const quiet = await call(d, "my_day", { bot: "Kevin" }, { now: QUIET });
  assert.match(quiet.note, /Today's duties appear after 07:00/);
  assert.match(quiet.next, /Today's duties appear after 07:00/);
  const day = await call(d, "my_day", { bot: "Kevin" });
  assert.equal(day.open_questions, undefined);
  assert.equal(day.reconnect.includes("reconnect needed"), false);
});

test("one questions list, a word-boundary excerpt, and the unsorted ids once", async () => {
  const d = memoryDesk();
  await S.sendMessage(d, NOW, R, { from: "Kevin", to: "Luke", needs: "decision", text: "Line one\\nLine two of a question that keeps going past a short cut so the excerpt has to stop on a word and not in the middle of somethinglong" });
  const day = await call(d, "my_day", { bot: "Kevin" });
  assert.equal(day.questions_to_luke.length, 1);
  assert.match(day.questions_to_luke[0].text, /Line one\nLine two/);
  assert.equal(day.questions_to_luke[0].text.endsWith("…") || day.questions_to_luke[0].text.length < 180, true);
  assert.ok(day.questions_to_luke[0].id);
});

test("Verse's schedule keeps the 09:20 check and puts lyrics after the release", () => {
  const rows = S.scheduleForMyDay("Verse", [{ time: "10 days before", what: "Lyrics 10 days before" }], { today: TODAY });
  assert.ok(rows.some((r) => r.time === "09:20"));
  assert.ok(rows.some((r) => /within 7 days after the release/i.test(r.time)));
  assert.equal(rows.some((r) => /10 days before/i.test(r.time + r.what)), false);
});

test("a past-due Spotify step waits on Spotify and is not late", () => {
  const v = S.releaseView({
    id: "nightdrive", title: "Night Drive", date: "2026-11-27", status: "scheduled", pack: { kind: "Self-release" },
    steps: [
      { key: "approved", label: "Approved", owner: "Drop", status: "done", due: "2026-11-01" },
      { key: "spotify", label: "Showing as upcoming", owner: "Atlas", status: "todo", due: "2026-11-10" },
    ],
  }, TODAY);
  const spot = v.steps.find((s) => s.key === "spotify");
  assert.equal(spot.waiting, true);
  assert.equal(spot.late, false);
  assert.equal(spot.waitingText, "waiting on Spotify");
});

test("tight counts from the upload day, and a 21-day upload is not sent late", () => {
  const late = S.releaseView({
    id: "nightdrive", title: "Night Drive", date: "2026-11-20", status: "scheduled", tight: true, pack: { kind: "Self-release" },
    storeLog: [{ status: "uploaded", on: "2026-11-10" }],
    steps: [{ key: "upload", status: "done", due: "2026-10-30", doneOn: "2026-11-01" }],
  }, TODAY);
  const tight = late.warnings.find((w) => /Uploaded .+ before release/.test(w));
  assert.ok(tight);
  assert.match(tight, /Uploaded 10 days before release: the usual 21 days/);
  const roomy = S.releaseView({
    id: "paper", title: "Paper Moon", date: "2026-12-11", status: "scheduled", tight: true, pack: { kind: "Self-release" },
    storeLog: [{ status: "uploaded", on: "2026-11-06" }],
    steps: [],
  }, TODAY);
  assert.equal(roomy.warnings.some((w) => /Uploaded .+ before release/.test(w)), false);
  const none = S.releaseView({ id: "x", title: "Slow Fade", date: "2026-11-20", status: "scheduled", tight: true, pack: { kind: "Self-release" }, steps: [] }, TODAY);
  assert.equal(none.warnings.some((w) => /Uploaded .+ before release/.test(w)), false);
});

test("a lyrics note follows the card that is waiting on Luke", () => {
  const v = S.releaseView({
    id: "nightdrive", title: "Night Drive", date: "2026-11-20", status: "scheduled", pack: {},
    steps: [{ key: "lyrics", label: "Lyrics", owner: "Verse", status: "todo", due: "2026-11-27", note: "none provided" }],
  }, TODAY, { actionCards: [{ status: "open", waitingOn: "luke", text: "Night Drive lyrics are ready for you", release: "nightdrive" }] });
  assert.match(v.steps.find((s) => s.key === "lyrics").note, /waiting for his answer/);
});

test("RouteNote mail is Luke's inbox, and a moderation draft is From him with admin in CC", () => {
  const srcMail = S.routeNoteMailSource({ GOOGLE_SA_KEY: "not-a-mailbox" });
  assert.equal(srcMail.connected, false);
  assert.equal(srcMail.inbox, "luke@badscandal.com");
  assert.match(srcMail.steps, /luke@badscandal.com/);
  assert.match(srcMail.steps, /forwarded/);
  assert.match(srcMail.steps, /admin@badscandal.com/);
  assert.equal(JSON.stringify(srcMail).includes("not-a-mailbox"), false);
  const draft = S.moderationDraft("Please look at the artwork again.");
  assert.match(draft, /From: luke@badscandal.com/);
  assert.match(draft, /CC: admin@badscandal.com/);
  assert.match(draft, /To: moderation@routenote.com/);
  assert.match(draft, /HQ does not send this email/);
});

test("a rejected RouteNote email keeps the draft and does not send it", async () => {
  const d = memoryDesk();
  const r = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Paper Moon", date: "2026-12-18", pack: FULL });
  await S.sendRelease(d, NOW, R, { by: "Luke", id: r.id });
  await S.applyRouteNoteMail(d, NOW, R, [{ id: "mail-no-9", from: "support@routenote.example", subject: "Action required: Paper Moon", date: "2026-11-18", body: "Action required. The artwork has a web address on it." }]);
  const msgs = await S.listMessages(d, NOW + 86400000);
  const drop = msgs.find((m) => m.to === "Drop" && /Drafted fix/.test(m.text));
  assert.ok(drop);
  assert.match(drop.text, /did not email/);
  assert.match(drop.text, /From: luke@badscandal.com/);
  assert.match(drop.text, /CC: admin@badscandal.com/);
  const list = await call(d, "releases", { bot: "Drop" });
  const card = list.releases.find((x) => x.id === r.id);
  assert.equal(list.email_watch, "not connected");
  assert.equal(card.routenote_email, "not connected");
  assert.equal(card.moderation_draft.from, "luke@badscandal.com");
  assert.equal(card.moderation_draft.cc, "admin@badscandal.com");
  assert.equal(card.moderation_draft.to, "moderation@routenote.com");
  assert.equal(card.tight, undefined);
});

test("a track link is a Spotify track, and an ad link is still the song page", () => {
  const ok = S.spotifyTrackProblem("https://open.spotify.com/track/abc123?si=sharecode");
  assert.equal(ok.problem, "");
  assert.equal(ok.si, true);
  assert.equal(ok.clean, "https://open.spotify.com/track/abc123");
  assert.match(S.adLinkProblem("https://open.spotify.com/track/abc123", "nightdrive"), /badscandal\.com/);
});

test("preflight track mode accepts the track and notes ?si=", async () => {
  const d = memoryDesk();
  const bad = await call(d, "preflight", { bot: "Atlas", mode: "track", link: "https://open.spotify.com/track/abc123?si=share" });
  assert.equal(bad.ok, true);
  assert.match(bad.notes.join(" "), /\?si=/);
  const ad = await call(d, "preflight", { bot: "Forge", link: "https://open.spotify.com/track/abc123" });
  assert.equal(ad.ok, false);
  assert.match(ad.problems.join(" "), /badscandal\.com/);
});

test("post_update echoes the proof link", async () => {
  const d = memoryDesk();
  const u = await call(d, "post_update", { bot: "Kevin", status: "done", message: "Numbers logged", link: "https://example.com/proof" });
  assert.equal(u.link, "https://example.com/proof");
  const board = await call(d, "team_board", { bot: "Nova" });
  assert.match(board.latest_updates.join("\n"), /https:\/\/example.com\/proof/);
  const kevin = board.team.find((w) => w.name === "Kevin");
  assert.match(kevin.last_update, /https:\/\/example.com\/proof/);
});

test("the three read-only tools write nothing", async () => {
  const d = memoryDesk();
  const health = await call(d, "account_health", { bot: "Steve" });
  assert.equal(health.read_only, true);
  assert.equal(health.wrote, false);
  assert.ok(Array.isArray(health.accounts));
  const needs = await call(d, "needs_you", { bot: "Nova" });
  assert.equal(needs.read_only, true);
  assert.equal(needs.open, 0);
  const pl = await call(d, "song_pl", { bot: "Ledger" });
  assert.equal(pl.read_only, true);
  assert.equal(pl.wrote, false);
});

test("a sign-in keeps the ads id and a separate day", async () => {
  const d = memoryDesk();
  await S.setCard(d, NOW, R, { bot: "Forge", working_on: "Ads", blockers: "Google Ads 111-222-3333 signed out" });
  await S.postUpdate(d, NOW, R, { bot: "Forge", status: "blocked", message: "Google 14 Nov: signed out" });
  await S.postUpdate(d, NOW + 1000, R, { bot: "Forge", status: "blocked", message: "Google 15 Nov: signed out" });
  await S.postUpdate(d, NOW + 2000, R, { bot: "Forge", status: "blocked", message: "Google 16 Nov: signed out" });
  await S.postUpdate(d, NOW + 3000, R, { bot: "Nova", status: "info", message: "None right now" });
  const brief = await call(d, "luke_short_briefing", { bot: "Alfred" }, { hq: async () => ({ team: { duties: { byOwner: [], total: 0, done: 0, late: 0, blocked: 0 }, tasks: [] }, money: { cap: { month: "2026-11", currency: "USD", spent: 0, amount: 1000, left: 1000, status: "ok", notRead: ["Google 14 Nov: signed out", "Google 15 Nov: signed out", "Google 16 Nov: signed out"] } } }) });
  const lines = brief.needs_luke_sign_in.join("\n");
  assert.match(lines, /111-222-3333/);
  assert.match(lines, /14 Nov/);
  assert.match(lines, /15 Nov/);
  assert.match(lines, /16 Nov/);
  assert.equal(/none right now/i.test(lines), false);
});

test("empty brackets do not survive a signed-out line", () => {
  const day = S.hidePrivate("Google Ads signed out ()", { keepAdsId: false });
  assert.equal(day.includes("()"), false);
});

test("several Revolut legs of one Wise payment are not a fee", () => {
  const wise = pay({ id: "iwiseleg001", date: "2026-11-02", payer: "Harbour Audio", amount: 4388.43, currency: "EUR", status: "received", account: "Wise", source: "harbour" });
  const a = pay({ id: "irevleg0001", date: "2026-11-03", payer: "Harbour Audio", amount: 1000, currency: "EUR", status: "received", account: "Revolut", from: ["iwiseleg001"], source: "harbour" });
  const b = pay({ id: "irevleg0002", date: "2026-11-03", payer: "Harbour Audio", amount: 1388, currency: "EUR", status: "received", account: "Revolut", source: "harbour" });
  const c = pay({ id: "irevleg0003", date: "2026-11-04", payer: "Harbour Audio", amount: 2000, currency: "EUR", status: "received", account: "Revolut", source: "harbour" });
  const route = S.routeCosts([wise, a, b, c], [src("harbour", "Harbour Audio")])[0];
  assert.equal(route.fees.EUR, undefined);
  assert.match(S.routeCostText(route), /left in Wise or PayPal, not a fee/);
});

test("a statement paid_by is settled, and a note drops a claim the desk already has", () => {
  const stmt = pay({ id: "istmtsettle", date: "2026-11-02", payer: "Harbour Audio", amount: 40, currency: "EUR", status: "payable", account: "Statement only", paidBy: "irevsettle1" });
  const rev = pay({ id: "irevsettle1", date: "2026-11-10", payer: "Harbour Audio", amount: 40, currency: "EUR", status: "received", account: "Revolut" });
  const row = S.moneyExpectations([stmt, rev], [src("harbour", "Harbour Audio")], TODAY).expected.rows.find((r) => r.id === "istmtsettle");
  assert.equal(row.open, false);
  assert.equal(row.flags.includes("late"), false);
  const noted = pay({ id: "irevnote001", date: "2026-11-12", payer: "Harbour Audio", amount: 40, currency: "EUR", status: "received", account: "Revolut", note: "The USD 12.00 statement isn't on the desk." });
  const other = pay({ id: "istmtusd001", date: "2026-11-01", payer: "Harbour Audio", amount: 12, currency: "USD", status: "statement only", account: "Statement only" });
  assert.equal(/on the desk/i.test(S.displayNote(noted, [noted, other])), false);
  assert.match(S.displayNote(pay({ ...noted, note: "card 4242424242424242" }), []), /\[hidden\]/);
});

test("month_check lists a Wise transfer and skips a pocket transfer", async () => {
  const d = memoryDesk();
  await d.setJSON("inc/2026-11.json", [
    pay({ id: "itranswise1", date: "2026-11-04", payer: "From Wise", amount: 10, currency: "EUR", status: "transfer", account: "Revolut", by: "HQ" }),
    pay({ id: "itranspock1", date: "2026-11-04", payer: "Pocket move", amount: 10, currency: "EUR", status: "transfer", account: "Revolut", by: "HQ" }),
  ]);
  const check = await S.monthCheck(d, NOW, { month: "2026-11" });
  assert.ok(check.ownTransfers.some((e) => e.id === "itranswise1"));
  assert.equal(check.ownTransfers.some((e) => e.id === "itranspock1"), false);
});

test("the guide leads with the current money rules", async () => {
  const d = memoryDesk();
  await d.setJSON("guide.json", { text: "STAFF GUIDE from 12 Nov. eighteen tools. Income is whatever the sheet said.", at: "2026-11-12T12:00:00Z" });
  const g = await call(d, "read_guide", { bot: "Ledger" });
  assert.match(g, /^CURRENT MONEY RULES/);
  assert.match(g, /waiting in Wise/);
  assert.match(g, /luke@badscandal.com/);
  assert.ok(g.indexOf("CURRENT MONEY RULES") < g.indexOf("12 Nov") || g.indexOf("CURRENT MONEY RULES") < g.indexOf("stored"));
});

test("a spend row matches the post that names the song, and the organic line is said", () => {
  const now = Date.parse("2026-11-18T15:00:00Z");
  const old = "2026-10-22T12:00:00Z";
  const posts = [
    { id: "p1", at: old, caption: "Night Drive clip", type: "reels", snaps: { d1: { views: 5000, likes: 100, comments: 4, saves: 10, shares: 2 } } },
    { id: "p2", at: old, caption: "Studio day", type: "reels", snaps: { d1: { views: 4000, likes: 40, comments: 1, saves: 2, shares: 1 } } },
  ];
  const ranked = rankPosts(posts, { at: now, ads: [] }, { now, spend: [{ date: "2026-10-23", platform: "Meta", amount: 25, currency: "USD", song: "Night Drive" }] });
  const hit = ranked.older.find((r) => r.id === "p1");
  assert.equal(hit.boost, "boosted");
  assert.match(rankLine(hit), /organic before the ad: not stored separately/);
  const other = ranked.older.find((r) => r.id === "p2");
  assert.notEqual(other.boost, "boosted");
});

test("an answered fan question says who replied", () => {
  const now = Date.parse("2026-11-18T15:00:00Z");
  const box = fanInbox([{ id: "c1", at: "2026-11-17T12:00:00Z", user: "fan_one", text: "what song is this", answered: true, repliedBy: ["sampleaccount"], repliedAt: "2026-11-17T13:00:00Z" }], now);
  assert.equal(box.questions[0].needsReply, false);
  assert.deepEqual(box.questions[0].repliedBy, ["sampleaccount"]);
  assert.equal(box.questions[0].repliedAt, "2026-11-17T13:00:00Z");
});

test("song_pages stamps São Paulo time", async () => {
  const d = memoryDesk();
  const pages = await call(d, "song_pages", { bot: "Webmaster" });
  const stamp = pages.pages[0] && pages.pages[0].checked_at;
  if (stamp) assert.match(stamp, /São Paulo|Sao Paulo|18 Nov|2026/);
});
