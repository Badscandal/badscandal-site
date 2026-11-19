/* Disputes (19 Nov 2026). Bots open and update a case. Luke is the only one who decides.
   Every song, claim and reply here is made up. HQ does not send the email or file the dispute. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk, sampleDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, toolsFor } from "../netlify/lib/staff-tools.mjs";

await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const NOW = Date.parse("2026-11-19T15:00:00Z"); /* Thu 19 Nov, 12:00 in São Paulo */
const R = S.DEFAULT_ROSTER;
const call = (d, name, args, now = NOW, role = "bot") => callTool(TOOLS.find((t) => t.name === name), args, { store: d, now, role, hq: async () => null });
const fails = (p, re) => assert.rejects(p, (e) => e.name === "StaffError" && re.test(e.message));

test("the connector lists open_case, update_case and read_cases, and Licence and Spark do not get them", () => {
  assert.equal(TOOLS.length, 55); /* + open_case, update_case, read_cases, delete_case (19 Nov 2026) */
  for (const n of ["open_case", "update_case", "read_cases", "delete_case"]) assert.ok(TOOLS.some((t) => t.name === n), n);
  assert.equal(TOOLS.find((t) => t.name === "read_cases").readOnly, true);
  const laura = toolsFor("Laura", R).map((t) => t.name);
  assert.ok(laura.includes("open_case") && laura.includes("read_cases"));
  for (const who of ["Licence", "Spark"]) {
    const names = toolsFor(who, R).map((t) => t.name);
    assert.equal(names.includes("open_case"), false, who);
  }
});

test("a bot opens a case, updates it, and reads it back; Luke's decision is not a field a bot can set", async () => {
  const d = memoryDesk();
  const opened = await call(d, "open_case", {
    bot: "Drop", song: "Northwind", platform: "RouteNote", type: "moderation",
    recommendation: "Reply and ask them to look again.",
    proposal: "Hello. The cover is fixed. Please review it again.",
    status: "open", entry: "RouteNote asked about the cover.",
  });
  assert.equal(opened.saved, true);
  assert.equal(opened.owner, "Drop");
  assert.equal(opened.status, "open");
  assert.match(opened.id, /^d/);

  const updated = await call(d, "update_case", {
    bot: "Drop", id: opened.id, status: "waiting on Luke", waiting_on: "Luke",
    next_check: "2026-11-21", entry: "Ready for Luke.",
  });
  assert.equal(updated.status, "waiting on Luke");
  assert.equal(updated.waiting_on, "Luke");
  assert.equal(updated.decision, null);

  await fails(call(d, "update_case", { bot: "Drop", id: opened.id, decision: "confirm" }), /Luke's decision/);
  await fails(call(d, "update_case", { bot: "Nova", id: opened.id, choice: "ignore" }), /Luke's decision/);
  await fails(call(d, "update_case", { bot: "Kevin", id: opened.id, entry: "I will take this." }), /Drop's/);
  await fails(S.decideCase(d, NOW, R, { by: "Laura", id: opened.id, choice: "confirm" }), /Only Luke/);
  await fails(S.decideCase(d, NOW, R, { by: "Claude", id: opened.id, choice: "confirm" }), /Only Luke/);
  await fails(S.decideCase(d, NOW, R, { by: "Luke", id: opened.id, choice: "respond", text: "" }), /Write the response/);

  const read = await call(d, "read_cases", { bot: "Laura", needs_luke: true, song: "Northwind" });
  assert.equal(read.wrote, false);
  assert.equal(read.cases.length, 1);
  assert.equal(read.cases[0].needsLuke, true);
  assert.match(read.cases[0].timeline.map((e) => e.text).join(" "), /RouteNote asked about the cover/);
  assert.equal(read.cases[0].nextCheck, "2026-11-21");
  assert.ok(read.cases[0].waitingSince);

  const byOwner = await call(d, "read_cases", { bot: "Drop", owner: "Laura", status: "open" });
  assert.equal(byOwner.cases.length, 0);
});

test("Luke's confirm, respond and ignore are stored with a time, and a bot reads the decision", async () => {
  const d = memoryDesk();
  const a = await S.openCase(d, NOW, R, { by: "Laura", song: "Northwind", platform: "YouTube", type: "dispute", proposal: "Please release this claim.", recommendation: "It is our own recording.", status: "waiting on Luke", waiting_on: "Luke" });
  const b = await S.openCase(d, NOW, R, { by: "Drop", song: "Paper Moon", platform: "Spotify", type: "takedown", proposal: "This recording is ours.", status: "waiting on Luke" });
  const c = await S.openCase(d, NOW, R, { by: "Atlas", song: "Velvet Night", platform: "RouteNote", type: "other", status: "waiting on Luke" });

  const confirmed = await S.decideCase(d, NOW + 60000, R, { by: "Luke", id: a.item.id, choice: "confirm" });
  assert.equal(confirmed.status, "waiting on bot");
  assert.equal(confirmed.waitingOn, "Laura");
  assert.equal(confirmed.decision.choice, "confirm");
  assert.equal(confirmed.decision.text, "Please release this claim.");
  assert.equal(confirmed.decision.at, new Date(NOW + 60000).toISOString());
  assert.equal(confirmed.decision.by, "Luke");
  assert.match(confirmed.timeline[0].text, /confirmed/);

  const answered = await S.decideCase(d, NOW + 120000, R, { by: "Luke", id: b.item.id, choice: "respond", text: "Tell them the recording is ours and stop there." });
  assert.equal(answered.status, "waiting on bot");
  assert.equal(answered.decision.choice, "respond");
  assert.equal(answered.decision.text, "Tell them the recording is ours and stop there.");
  assert.match(answered.timeline[0].text, /response/);

  const ignored = await S.decideCase(d, NOW + 180000, R, { by: "Luke", id: c.item.id, choice: "ignore", text: "Leave it." });
  assert.equal(ignored.status, "ignored");
  assert.equal(ignored.waitingOn, "");
  assert.equal(ignored.decision.text, "Leave it.");
  await fails(S.updateCase(d, NOW, R, { by: "Drop", id: a.item.id, status: "ignored" }), /Ignored is Luke/);

  const seen = await S.readCases(d, NOW, { song: "Northwind" });
  assert.equal(seen.cases[0].decision.choice, "confirm");
  assert.equal(seen.cases[0].status, "waiting on bot");
  const luke = await S.readCases(d, NOW, { needs_luke: "yes" });
  assert.equal(luke.cases.length, 0);
});

test("a Content ID claim escalates into one case, and a second open is the same case", async () => {
  const d = memoryDesk();
  const claim = await S.recordContentClaim(d, NOW, R, { by: "Laura", date: "2026-11-18", claim: "Sample claim", claimant: "Sample Channel", song: "Northwind", impact: "one video flagged" });
  const id = claim.item.key;
  const first = await call(d, "open_case", { bot: "Laura", song: "Northwind", platform: "YouTube", type: "Content ID claim", claim_id: id, status: "waiting on Luke", recommendation: "Ask them to release it.", proposal: "Please release the claim." });
  assert.equal(first.saved, true);
  assert.equal(first.claim_id, id);
  const again = await call(d, "open_case", { bot: "Laura", song: "Northwind", platform: "YouTube", type: "Content ID claim", claim_id: id });
  assert.equal(again.duplicate, true);
  assert.equal(again.id, first.id);
  await fails(call(d, "open_case", { bot: "Laura", song: "Northwind", platform: "YouTube", type: "dispute", claim_id: "no-such-claim" }), /No Content ID claim/);
  const listed = await S.readClaims(d, NOW);
  assert.equal(listed.claims[0].id, id);
});

test("waiting on Luke is a Needs you item, and the phone line carries the start of the proposal", async () => {
  const d = memoryDesk();
  const opened = await S.openCase(d, NOW, R, { by: "Laura", song: "Northwind", platform: "YouTube", type: "Content ID claim", status: "waiting on Luke", waiting_on: "Luke", proposal: "Please release the claim.", recommendation: "It is ours." });
  await S.openCase(d, NOW, R, { by: "Drop", song: "Paper Moon", platform: "RouteNote", type: "moderation", status: "waiting on them", waiting_on: "RouteNote" });
  const desk = await S.loadDesk(d, NOW);
  const w = S.waitingOnLuke(desk, S.spDay(NOW), NOW);
  assert.deepEqual(w.map((x) => x.kind), ["dispute"]);
  assert.equal(w[0].id, opened.item.id);
  assert.equal(w[0].href, "#songs/" + opened.item.id);
  assert.match(w[0].text, /Laura/);
  assert.match(w[0].text, /Northwind/);
  assert.match(w[0].text, /Please release the claim/);
  const board = S.board(desk, NOW, null);
  const phone = L.phoneWatchers(board);
  const card = phone.find((x) => x.kind === "dispute");
  assert.ok(card);
  assert.equal(card.href, "#songs/" + opened.item.id);
  assert.match(card.line, /Please release the claim/);
  const html = L.disputeHtml(board.disputes);
  assert.match(html, /Disputes/);
  assert.match(html, /Recommendation/);
  assert.match(html, /Please release the claim/);
  assert.match(html, /Waiting on Luke/);
  assert.match(html, /data-case-do="confirm"/);
  assert.match(html, /data-case-do="ignore"/);
  assert.match(html, /data-case-do="respond"/);
  assert.match(html, new RegExp('href="#songs/' + opened.item.songKey + '"'));
  const links = L.claimCaseLinks(board.claims, board.disputes);
  assert.equal(links, "", "no claim id, so Rights has nothing to link");
});

test("Rights links a claim to its case, and the sample desk has one case waiting on Luke", () => {
  const claims = { items: [{ key: "sampleclaimsample|samplechannel|2026-11-01", song: "Slow Burn", claim: "Sample claim (sample)" }] };
  const cases = { items: [{ id: "dsampleyt", claimId: "sampleclaimsample|samplechannel|2026-11-01", song: "Slow Burn", status: "waiting on Luke" }] };
  const html = L.claimCaseLinks(claims, cases);
  assert.match(html, /href="#songs\/dsampleyt"/);
  assert.match(html, /Slow Burn/);
  const desk = sampleDesk(NOW);
  const w = S.waitingOnLuke(desk, S.spDay(NOW), NOW).filter((x) => x.kind === "dispute");
  assert.equal(w.length, 1);
  assert.equal(w[0].id, "dsampleyt");
  assert.match(w[0].text, /Please release the claim/);
  const one = L.disputeHtml(desk.disputes, { song: "Slow Burn", compact: true });
  assert.match(one, /Open the case/);
  assert.doesNotMatch(one, /data-case-do/);
  assert.equal(L.disputeHtml(desk.disputes, { song: "No Such Song", compact: true }), "");
});

test("standup and the briefing share a case waiting on Luke", async () => {
  const d = memoryDesk();
  const opened = await S.openCase(d, NOW, R, { by: "Laura", song: "Northwind", platform: "YouTube", type: "dispute", status: "waiting on Luke", proposal: "Please release the claim." });
  const day = await call(d, "my_day", { bot: "Laura" });
  assert.ok(day.waiting_on_luke.some((x) => x.id === opened.item.id && x.kind === "dispute"));
  const team = await call(d, "team_board", { bot: "Nova" });
  assert.ok(team.waiting_on_luke.some((x) => x.id === opened.item.id));
  const brief = await call(d, "luke_briefing", { bot: "Alfred" });
  assert.equal((brief.decisions_waiting_on_luke || []).some((x) => x.id === opened.item.id), true);
});

test("resolved and ignored clear the next check, and a TEST case can be deleted only by who opened it", async () => {
  const d = memoryDesk();
  const real = await S.openCase(d, NOW, R, { by: "Drop", song: "Northwind", platform: "RouteNote", type: "moderation", status: "waiting on them", waiting_on: "RouteNote", next_check: "2026-11-20" });
  const closed = await call(d, "update_case", { bot: "Drop", id: real.item.id, status: "resolved", next_check: "2026-11-25" });
  assert.equal(closed.status, "resolved");
  assert.equal(closed.next_check, "");
  assert.equal(closed.waiting_on, "");
  const test = await S.openCase(d, NOW, R, { by: "Nova", song: "Love You", platform: "TEST", type: "other", status: "waiting on Luke", proposal: "NOVA TEST" });
  await fails(call(d, "delete_case", { bot: "Laura", id: test.item.id }), /Only Nova/);
  await fails(call(d, "delete_case", { bot: "Drop", id: real.item.id }), /platform is TEST/);
  const gone = await call(d, "delete_case", { bot: "Nova", id: test.item.id });
  assert.equal(gone.deleted, true);
  const desk = await S.loadDesk(d, NOW);
  assert.equal(S.waitingOnLuke(desk, S.spDay(NOW), NOW).some((x) => x.id === test.item.id), false);
  assert.doesNotMatch(L.disputeHtml(S.board(desk, NOW, null).disputes), /Love You/);
  const still = await call(d, "read_cases", { bot: "Nova", song: "Love You" });
  assert.equal(still.cases.length, 0);
});

test("a bot can mark a case solved and waiting for confirm, and only Luke's Confirm closes it", async () => {
  const d = memoryDesk();
  const opened = await S.openCase(d, NOW, R, { by: "Drop", song: "Northwind", platform: "RouteNote", type: "moderation", status: "waiting on them", next_check: "2026-11-18" });
  const solved = await call(d, "update_case", { bot: "Drop", id: opened.item.id, status: "solved - confirm" });
  assert.equal(solved.status, "solved - confirm");
  await fails(call(d, "update_case", { bot: "Drop", id: opened.item.id, decision: "confirm" }), /Luke's decision/);
  const closed = await S.decideCase(d, NOW + 1000, R, { by: "Luke", id: opened.item.id, choice: "confirm" });
  assert.equal(closed.status, "resolved");
  assert.equal(closed.waitingOn, "");
  assert.equal(closed.nextCheck, "");
  assert.match(closed.timeline[0].text, /solved/);
});

test("case colour and the song badge follow the worst open case", () => {
  const today = "2026-11-19";
  const open = { status: "open", platform: "RouteNote", song: "Northwind" };
  const them = { status: "waiting on them", platform: "RouteNote", song: "Northwind", waitingOn: "RouteNote" };
  const luke = { status: "waiting on Luke", platform: "YouTube", song: "Northwind" };
  const green = { status: "solved - confirm", platform: "YouTube", song: "Paper Moon" };
  const done = { status: "resolved", platform: "YouTube", song: "Paper Moon" };
  const late = { status: "waiting on them", platform: "RouteNote", song: "Northwind", nextCheck: "2026-11-18" };
  assert.equal(L.caseColour(open, today, "2026-12-01"), "yellow");
  assert.equal(L.caseColour(them, today, "2026-12-01"), "yellow");
  assert.equal(L.caseColour(luke, today, "2026-12-01"), "red");
  assert.equal(L.caseColour(green, today, "2026-12-01"), "green");
  assert.equal(L.caseColour(done, today, ""), "");
  assert.equal(L.caseColour(late, today, "2026-12-01"), "red");
  assert.equal(L.caseColour(them, today, "2026-11-22"), "red");
  assert.equal(L.caseProgress({ status: "waiting on them", timeline: [{ text: "Submitted to RouteNote." }] }).step, "waiting on them");
  assert.equal(L.caseProgress({ status: "solved - confirm", timeline: [] }).step, "solved");
  const mark = L.songMark({ items: [them, done] }, "Northwind", today, []);
  assert.equal(mark.tone, "yellow");
  assert.equal(mark.badge, "1 dispute - waiting on RouteNote");
  const worse = L.songMark({ items: [them, luke] }, "Northwind", today, []);
  assert.equal(worse.tone, "red");
  const blocked = L.songMark({ items: [] }, "Northwind", today, [{ title: "Northwind", status: "scheduled", date: "2026-12-01", counts: { blocked: 1 }, preflight: [] }]);
  assert.equal(blocked.tone, "red");
  assert.match(blocked.badge, /blocked/i);
  const html = L.disputeHtml({ items: [luke, { ...them, platform: "TEST", song: "Love You" }] }, { today });
  assert.match(html, /tone-red/);
  assert.match(html, /csteps/);
  assert.doesNotMatch(html, /Love You/);
});

test("the opening bot can rename a song and replace the timeline with event dates", async () => {
  const d = memoryDesk();
  const opened = await S.openCase(d, NOW, R, {
    by: "Laura", song: "Love You", platform: "YouTube", type: "Content ID claim",
    status: "waiting on Luke", waiting_on: "A human",
    proposal: "Please release [secure value: hidden] the claim.",
  });
  const id = opened.item.id;
  await call(d, "update_case", { bot: "Laura", id, song: "Love you", entry: "They wrote back.", entry_date: "2026-11-12" });
  await fails(call(d, "update_case", { bot: "Nova", id, timeline: [{ text: "Nova rewrote the history." }] }), /Laura/);
  const replaced = await call(d, "update_case", { bot: "Laura", id, timeline: [
    { text: "Opened the case.", date: "2026-11-01", by: "Laura" },
    { text: "They wrote back.", date: "2026-11-12" },
  ] });
  assert.equal(replaced.saved, true);
  const read = await call(d, "read_cases", { bot: "Laura", song: "Love you" });
  assert.equal(read.cases.length, 1);
  assert.equal(read.cases[0].song, "Love you");
  assert.equal(read.cases[0].waitingOn, "Luke");
  assert.equal(read.cases[0].timeline[0].date, "2026-11-01");
  assert.equal(read.cases[0].timeline[1].date, "2026-11-12");
  assert.equal(read.cases[0].timeline[1].when, "2026-11-12");
  assert.doesNotMatch(read.cases[0].proposal, /secure value/);
  assert.match(read.cases[0].proposal, /Please release the claim/);
  const html = L.disputeHtml(read.cases, { today: "2026-11-19" });
  assert.match(html, /Waiting on Luke/);
  assert.doesNotMatch(html, /A human/);
  assert.doesNotMatch(html, /secure value/);
  assert.match(html, /12 Nov/);
  assert.doesNotMatch(html, /since\s+\S+\s+since/);
  assert.doesNotMatch(html, /\d{2}:\d{2}/);
  await call(d, "update_case", { bot: "Laura", id, status: "resolved" });
  const closed = await call(d, "read_cases", { bot: "Laura", song: "Love you" });
  assert.equal(closed.cases[0].status, "resolved");
  assert.equal(closed.cases[0].waitingSince, "");
  assert.equal(closed.cases[0].waitingOn, "");
  const stale = { ...closed.cases[0], status: "resolved", waitingOn: "A human", waitingSince: "2026-11-01T12:00:00Z" };
  const closedHtml = L.disputeHtml({ items: [stale] }, { today: "2026-11-19" });
  assert.doesNotMatch(closedHtml, /A human/);
  assert.doesNotMatch(closedHtml, /since/);
});
