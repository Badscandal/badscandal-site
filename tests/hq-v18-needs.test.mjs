/* HQ v18 (21 Nov 2026): Needs you cards. Decision cards = one short question + Yes / No / Reply, the email
   only on Reply. Ask cards = a reply box, plus Done for an action. Made-up names, songs and addresses. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";
import { needsCount } from "../netlify/lib/action-cards.mjs";
import { needsDesk } from "../netlify/lib/needs.mjs";
import { emailParts, emailText, questionOf, yesNo, yesTitle, needCard } from "../netlify/lib/need-cards.mjs";
import { dutiesReport } from "../netlify/lib/hq.mjs";

const NOW = Date.parse("2026-11-21T15:00:00Z");
const R = S.DEFAULT_ROSTER;
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, hq) => callTool(tool(name), args, { store: d, now: NOW, role: "bot", hq: hq || (async () => null) });
const EMAIL = "To: desk@example.com\nCC: team@example.com\nSubject: Made-up Song: fixed the typo\nBody: Hi team,\n\nWe fixed the artist name.\nPlease look again.\n\nThanks";

test("an email is read into To, CC, Subject and a body that keeps its line breaks", () => {
  const e = emailParts("Draft below.\n" + EMAIL);
  assert.equal(e.to, "desk@example.com");
  assert.equal(e.cc, "team@example.com");
  assert.equal(e.subject, "Made-up Song: fixed the typo");
  assert.equal(e.body, "Hi team,\n\nWe fixed the artist name.\nPlease look again.\n\nThanks");
  assert.equal(e.intro, "Draft below.");
  /* a bot that wrote \n as two characters, all on one line */
  const flat = emailParts("To: desk@example.com\\nSubject: Hi\\nBody: Line one\\nLine two");
  assert.equal(flat.body, "Line one\nLine two");
  /* one line, no breaks at all */
  const inline = emailParts("To: desk@example.com CC: team@example.com Subject: Hi Body: Please look again.");
  assert.equal(inline.cc, "team@example.com");
  assert.equal(inline.subject, "Hi");
  assert.equal(inline.body, "Please look again.");
  assert.equal(emailParts("Can you send it to RouteNote?"), null);
  assert.equal(emailParts("Reply to: nobody"), null);
  assert.match(emailText(e), /^To: desk@example\.com\nCC: team@example\.com\nSubject: Made-up Song: fixed the typo\nBody:\nHi team,\n\nWe fixed/);
});

test("a question is short and plain; options become Yes and No", () => {
  assert.equal(questionOf("Hi Luke, RouteNote still shows it. Shall I send the follow-up today? It says 2026-11-24."), "Shall I send the follow-up today?");
  assert.ok(questionOf("x ".repeat(200)).length <= 91);
  assert.deepEqual(yesNo(["Not yet", "Yes, send it"]), { yes: "Yes, send it", no: "Not yet", rest: [] });
  assert.deepEqual(yesNo(["Pause the ad", "Keep it running", "Lower the budget"]), { yes: "Pause the ad", no: "Keep it running", rest: ["Lower the budget"] });
  assert.equal(yesTitle("Waiting on Luke's Yes, correct for the made-up featured-artist typo fix."), "Yes to the made-up featured-artist typo fix?");
});

async function caseDesk() {
  const d = memoryDesk();
  const c = await S.openCase(d, NOW - 7200000, R, { by: "Drop", song: "Made-up Song", platform: "RouteNote", type: "moderation", status: "waiting on Luke",
    waiting_on: "RouteNote", next_check: "2026-11-24", recommendation: "Send it today: the release is close.\nMore detail here.", proposal: EMAIL });
  return { d, c: c.item || c };
}

test("a dispute is a decision card: short question, facts, one-line recommendation, the email only for Reply", async () => {
  const { d } = await caseDesk();
  const desk = await needsDesk(d, NOW, {});
  const count = needsCount(desk, S.spDay(NOW), NOW);
  const x = count.items.find((i) => i.kind === "dispute");
  assert.ok(x, "the case waiting on Luke is on the list");
  assert.equal(x.type, "decision");
  assert.equal(x.title, "Send the RouteNote email for Made-up Song?");
  assert.doesNotMatch(x.title, /desk@example|Subject|Body/);
  assert.deepEqual(x.facts, { song: "Made-up Song", status: "RouteNote · moderation", waiting: "RouteNote", next: "Tue 24 Nov" });
  assert.equal(x.recommend, "Send it today: the release is close.");
  assert.equal(x.yes.choice, "confirm");
  assert.equal(x.no.choice, "ignore");
  assert.equal(x.via, "case");
  assert.equal(x.email.to, "desk@example.com");
  assert.match(x.email.body, /\n\nWe fixed the artist name\.\n/);
});

test("Reply on a case records the edited email as the response, the same way as before", async () => {
  const { d, c } = await caseDesk();
  const edited = emailText({ to: "desk@example.com", cc: "", subject: "New subject", body: "Line one\n\nLine two" });
  const item = await S.decideCase(d, NOW, R, { by: "Luke", id: c.id, choice: "respond", text: edited });
  assert.equal(item.status, "waiting on bot");
  assert.equal(item.decision.choice, "respond");
  assert.match(item.decision.text, /Subject: New subject\nBody:\nLine one\n\nLine two/);
});

test("a message decision: question, Yes/No from its options, and its email parsed", async () => {
  const d = memoryDesk();
  const r = await S.sendMessage(d, NOW - 60000, R, { from: "Drop", to: "Luke", needs: "decision", options: ["Not yet", "Yes, send it"],
    text: "Shall I send RouteNote the follow-up for Made-up Song?\n" + EMAIL, recommend: "Send it: moderation is slow.", recommend_option: "Yes, send it" });
  const desk = await needsDesk(d, NOW, {});
  const x = needsCount(desk, S.spDay(NOW), NOW).items.find((i) => i.id === r.message.id);
  assert.equal(x.type, "decision");
  assert.equal(x.title, "Shall I send RouteNote the follow-up for Made-up Song?");
  assert.equal(x.yes.choice, "Yes, send it");
  assert.equal(x.no.choice, "Not yet");
  assert.equal(x.via, "message");
  assert.equal(x.to, "Drop");
  assert.equal(x.email.subject, "Made-up Song: fixed the typo");
  assert.equal(x.recommend, "Yes, send it: Send it: moderation is slow.");
});

test("asks: sign-in and access get Done, a fan gets a reply box to Steve; ids are short", async () => {
  const d = memoryDesk();
  await S.setCard(d, NOW - 3600000, R, { bot: "Forge", needs: "Google Ads signed out since 14 Nov: Luke needs to sign in" }).catch(() => null);
  await S.setCard(d, NOW - 3600000, R, { bot: "Webmaster", needs: "Luke to give me Netlify Viewer access" }).catch(() => null);
  const desk = await needsDesk(d, NOW, {});
  desk.needsReply = [{ id: "123456789", text: "can I sing with you?" }];
  const items = needsCount(desk, S.spDay(NOW), NOW).items;
  const sign = items.find((i) => i.kind === "signin");
  assert.ok(sign, JSON.stringify(items.map((i) => i.text)));
  assert.match(sign.id, /^sign-[a-z0-9-]+$/);
  assert.ok(sign.id.length <= 45);
  assert.equal(sign.type, "ask");
  assert.equal(sign.done, true);
  assert.equal(sign.to, "Forge");
  const acc = items.find((i) => i.kind === "access");
  assert.equal(acc.title, "Give Webmaster Netlify Viewer access");
  assert.equal(acc.done, true);
  const fan = items.find((i) => i.kind === "fan");
  assert.equal(fan.title, "A fan on Instagram asks: “can I sing with you?”");
  assert.equal(fan.to, "Steve");
});

test("Done on an ask records a mark and a message to the bot, and the ask leaves the list", async () => {
  const d = memoryDesk();
  await S.setCard(d, NOW - 3600000, R, { bot: "Webmaster", needs: "Luke to give me Netlify Viewer access" });
  let desk = await needsDesk(d, NOW, {});
  const acc = needsCount(desk, S.spDay(NOW), NOW).items.find((i) => i.kind === "access");
  assert.ok(acc);
  await assert.rejects(S.markNeedDone(d, NOW, R, { by: "Nova", key: acc.key, to: "Webmaster", text: "Done" }), /Only Luke/);
  const r = await S.markNeedDone(d, NOW, R, { by: "Luke", key: acc.key, to: "Webmaster", text: "Done: you have Netlify Viewer access." });
  assert.equal(r.done, true);
  assert.equal(r.message.from, "Luke");
  assert.equal(r.message.to, "Webmaster");
  desk = await needsDesk(d, NOW + 1000, {});
  assert.equal(needsCount(desk, S.spDay(NOW), NOW + 1000).items.some((i) => i.kind === "access"), false);
  /* the bot saying it again later brings it back */
  await S.setCard(d, NOW + 60000, R, { bot: "Webmaster", needs: "Luke to give me Netlify Viewer access, still no access" });
  desk = await needsDesk(d, NOW + 120000, {});
  assert.equal(needsCount(desk, S.spDay(NOW), NOW + 120000).items.some((i) => i.kind === "access"), true);
});

test("T-32 (the Meta system user) is on the list, without runbook words; a step waiting on his yes is a Yes card", async () => {
  const d = memoryDesk();
  const desk = await needsDesk(d, NOW, {});
  desk.lukeTasks = [{ id: "T-32", owner: "Nova", task: "Meta system user (runbook B)", status: "blocked", blocker: "Waiting on Luke to make the Meta system user (runbook B)" }];
  desk.releases = [{ id: "madeup", title: "Made-up Song", status: "scheduled", date: "2026-11-30", steps: [{ key: "upload", label: "Uploaded", owner: "Drop", status: "blocked", note: "Waiting on Luke's Yes, correct for the made-up featured-artist typo fix" }] }];
  const items = needsCount(desk, S.spDay(NOW), NOW).items;
  const t = items.find((i) => i.id === "T-32");
  assert.ok(t);
  assert.match(t.title, /Meta system user/);
  assert.doesNotMatch(t.title, /runbook/i);
  const y = items.find((i) => i.kind === "yes" && i.from === "Drop");
  assert.ok(y);
  assert.equal(y.type, "decision");
  assert.equal(y.title, "Yes to the made-up featured-artist typo fix?");
});

test("needs_you, my_day, team_board say the short question once; luke_briefing keeps its row shape", async () => {
  const d = memoryDesk();
  await S.sendMessage(d, NOW - 60000, R, { from: "Verse", to: "Luke", needs: "decision", options: ["Yes", "No"], text: "Is the made-up line right? It came from the old draft." });
  const you = await call(d, "needs_you", { bot: "Nova" });
  const row = you.waiting[0];
  assert.equal(row.text, "Is the made-up line right?");
  assert.equal(row.what, undefined);
  assert.equal(row.screen, undefined);
  assert.equal(row.card, "decision");
  const day = await call(d, "my_day", { bot: "Nova" });
  assert.deepEqual(day.waiting_on_luke.map((x) => x.text), you.waiting.map((x) => x.text));
  const brief = await call(d, "luke_briefing", { bot: "Alfred" });
  const b = brief.decisions_waiting_on_luke[0];
  assert.ok(b.what && b.screen, "luke_briefing rows keep what and screen (rule 6)");
  assert.equal(JSON.stringify(brief).includes("\"card\""), false);
});

test("the Salvation line is gone from Atlas's duty and from the reminder built from it", () => {
  const rows = [{ id: "D-atlas-1", owner: "Atlas", task: "Log yesterday's Spotify numbers. Answer the Salvation question in Spotify for Artists. Then post done.", deadline: "2026-11-21 09:15", status: "todo", blocker: "" }];
  const r = dutiesReport(rows, "2026-11-21", "12:00");
  const all = JSON.stringify(r);
  assert.doesNotMatch(all, /salvation/i);
  assert.match(all, /Log yesterday's Spotify numbers\. Then post done\./);
  assert.doesNotMatch(S.freshDuty("Check SfA. The Salvation card waits on Luke. Log listeners."), /salvation/i);
});

test("the card: Yes / No / Reply, and the email only after Reply, editable with its line breaks", async () => {
  await import("../js/hq-look.js");
  const V = globalThis.HQLook;
  const x = { key: "d:c1", kind: "dispute", id: "c1", type: "decision", title: "Send the RouteNote email for Made-up Song?", from: "Drop",
    facts: { song: "Made-up Song", status: "RouteNote · moderation", waiting: "RouteNote", next: "Tue 24 Nov" }, recommend: "Send it today.",
    yes: { label: "Yes", sub: "Send it", choice: "confirm" }, no: { label: "No", sub: "Close the case", choice: "ignore" }, via: "case",
    email: { to: "desk@example.com", cc: "team@example.com", subject: "Fixed <b>", body: "Hi team,\n\nPlease look again." } };
  const shut = V.needCardHtml(x, { first: true });
  assert.match(shut, /Do this first · Drop/);
  assert.match(shut, /<h3 class="dq">Send the RouteNote email for Made-up Song\?<\/h3>/);
  assert.match(shut, /Made-up Song · RouteNote · moderation · Waiting on RouteNote · Next check Tue 24 Nov/);
  assert.match(shut, /data-nact="yes"[^>]*>Yes<small>Send it<\/small>/);
  assert.match(shut, /data-nact="no"/);
  assert.match(shut, /data-nact="reply"[^>]*>Reply</);
  assert.doesNotMatch(shut, /desk@example\.com|Subject/, "the email stays closed until Reply");
  const open = V.needCardHtml(x, { open: true });
  assert.match(open, /data-nf="to"[^>]*value="desk@example\.com"/);
  assert.match(open, /data-nf="cc"[^>]*value="team@example\.com"/);
  assert.match(open, /value="Fixed &lt;b&gt;"/);
  assert.match(open, /<textarea rows="9" data-nf="body"[^>]*>Hi team,\n\nPlease look again\.<\/textarea>/);
  assert.match(open, />Close</);
  assert.equal(V.needEmailText({ to: "a@example.com", cc: "", subject: "S", body: "x\n\ny" }), "To: a@example.com\nSubject: S\nBody:\nx\n\ny");
  const ask = V.needCardHtml({ key: "acc:Webmaster", kind: "access", type: "ask", title: "Give Webmaster Netlify Viewer access", to: "Webmaster", done: true, via: "mark" }, {});
  assert.match(ask, /data-nf="text"/);
  assert.match(ask, /data-nact="done"[^>]*>Done</);
  assert.match(ask, /data-nact="send"/);
  assert.doesNotMatch(ask, /data-nact="yes"/);
  const fan = V.needCardHtml({ key: "fan:1", kind: "fan", type: "ask", title: "A fan asks", to: "Steve", done: true, via: "mark" }, { sample: true });
  assert.match(fan, /data-nact="send"[^>]*disabled/);
});
