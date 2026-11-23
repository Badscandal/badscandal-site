/* Songs › Disputes (23 Nov 2026, Luke): "the full note … doesn't look selectable"; "on this resolved drop down
   let's say what exactly was resolved"; in the song "kind of unclear what the issue is"; "waiting on bot: can it
   say what the bot is waiting for". Made-up songs and cases. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;
const NOW = Date.parse("2026-11-23T15:00:00Z");
const call = (d, name, args, now = NOW) => callTool(TOOLS.find((t) => t.name === name), args, { store: d, now, role: "bot", hq: async () => null });

test("a bot writes the issue and, when it closes, the outcome; both reach the page", async () => {
  const d = memoryDesk();
  const o = await call(d, "open_case", { bot: "Drop", song: "Glass Heart", platform: "RouteNote", type: "moderation", issue: "RouteNote says the cover has a web address on it." });
  const id = o.id;
  await call(d, "update_case", { bot: "Drop", id, status: "resolved", outcome: "New cover accepted; the release is approved." }, NOW + 3600000);
  const read = await call(d, "read_cases", { bot: "Drop", song: "Glass Heart" });
  const c = read.cases[0];
  assert.equal(c.issue, "RouteNote says the cover has a web address on it.");
  assert.equal(c.outcome, "New cover accepted; the release is approved.");
  assert.ok(c.closedAt);
  const html = L.disputeHtml(read.cases, { today: "2026-11-23" });
  assert.match(html, /1 resolved/);
  assert.match(html, /<b>Glass Heart<\/b> · RouteNote · Solved Mon 23 Nov/);
  assert.match(html, /The issue<\/span><br>RouteNote says the cover has a web address on it\./);
  assert.match(html, /How it ended<\/span><br>New cover accepted; the release is approved\./);
});

test("waiting on bot says what the bot has to do, from Luke's decision", () => {
  const base = { id: "c1", song: "Glass Heart", platform: "RouteNote", type: "dispute", owner: "Drop", opened: "2026-11-17", nextCheck: "2026-11-24", timeline: [] };
  const confirmed = { ...base, status: "waiting on bot", waitingOn: "Drop", decision: { choice: "confirm", text: "To: x\nBody: hi", at: "2026-11-20T15:00:00Z" } };
  assert.equal(L.caseWaitWords(confirmed), "Drop has to send what you confirmed on Fri 20 Nov");
  assert.equal(L.caseWaitWords(confirmed, true), "Drop is sending what you confirmed");
  const replied = { ...base, status: "waiting on bot", waitingOn: "Drop", decision: { choice: "respond", text: "Ask them to check the split again", at: "2026-11-21T15:00:00Z" } };
  assert.equal(L.caseWaitWords(replied), "Drop has to act on your reply of Sat 21 Nov: “Ask them to check the split again”");
  assert.equal(L.caseWaitWords({ ...base, status: "waiting on bot", waitingOn: "the label's answer" }), "Drop is waiting for the label's answer");
  assert.equal(L.caseWaitWords({ ...base, status: "waiting on bot", waitingOn: "Drop" }), "Drop is on the next step");
  assert.equal(L.caseWaitWords({ ...base, status: "waiting on Luke", waitingOn: "A human" }), "Needs your decision");
  const html = L.disputeHtml({ items: [confirmed] }, { today: "2026-11-23" });
  assert.doesNotMatch(html, /waiting on bot/, "never the raw status word");
  assert.match(html, /Drop has to send what you confirmed on Fri 20 Nov\. Next check Tue 24 Nov/);
  assert.equal(L.songMark({ items: [confirmed] }, "Glass Heart", "2026-11-23", []).badge, "1 dispute · Drop is sending what you confirmed");
});

test("the issue: the bot's own words, else the first real timeline line, never the desk's automatic ones", () => {
  assert.equal(L.caseIssue({ issue: "Wrong artist name." }), "Wrong artist name.");
  const tl = [
    { by: "Drop", text: "Status: waiting on Luke. Recommendation updated", at: "2026-11-20T10:00:00Z" },
    { by: "Drop", text: "RouteNote replied: they need proof of the sample licence.", at: "2026-11-18T10:00:00Z" },
    { by: "Drop", text: "RouteNote held the release: a sample is not cleared.", at: "2026-11-17T10:00:00Z" },
    { by: "Drop", text: "Opened. dispute with RouteNote.", at: "2026-11-17T09:00:00Z" },
  ];
  assert.equal(L.caseIssue({ timeline: tl }), "RouteNote held the release: a sample is not cleared.");
  assert.equal(L.caseOutcome({ status: "resolved", timeline: tl }), "RouteNote replied: they need proof of the sample licence.");
  assert.equal(L.caseIssue({ timeline: [{ by: "Drop", text: "Opened. dispute with RouteNote." }] }), "");
  const card = L.disputeHtml({ items: [{ id: "c2", song: "X", platform: "RouteNote", type: "dispute", status: "open", owner: "Drop", timeline: [] }] }, { song: "X", compact: true });
  assert.match(card, /The issue<\/span><br>Not written yet/);
  assert.match(card, /<summary>Dispute<\/summary>/, "no count in brackets");
});

test("the full note is a pill that looks tappable", () => {
  const page = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  assert.match(page, /\.dcase-more > summary\{[^}]*border-radius:999px[^}]*cursor:pointer/);
  assert.match(page, /\.dcase-more\[open\] > summary::after\{transform:rotate\(90deg\)\}/);
});
