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
  assert.equal(TOOLS.length, 54); /* + open_case, update_case, read_cases (19 Nov 2026) */
  for (const n of ["open_case", "update_case", "read_cases"]) assert.ok(TOOLS.some((t) => t.name === n), n);
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

test("waiting on Luke is a Needs you item, and the phone line does not carry the draft", async () => {
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
  assert.doesNotMatch(w[0].text, /Please release/);
  const board = S.board(desk, NOW, null);
  const phone = L.phoneWatchers(board);
  const card = phone.find((x) => x.kind === "dispute");
  assert.ok(card);
  assert.equal(card.href, "#songs/" + opened.item.id);
  assert.doesNotMatch(card.line, /Please release/);
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
  assert.doesNotMatch(w[0].text, /Please release/);
  const one = L.disputeHtml(desk.disputes, { song: "Slow Burn", compact: true });
  assert.match(one, /Open the case/);
  assert.doesNotMatch(one, /data-case-do/);
  assert.equal(L.disputeHtml(desk.disputes, { song: "No Such Song", compact: true }), "");
});
