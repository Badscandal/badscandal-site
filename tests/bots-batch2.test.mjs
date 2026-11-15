/* The bots' feedback, batch 2 (14 Nov 2026): decisions that close properly and reach the right bot, and
   blockers/asks that clear.
   - Verse asked Luke 4 things in one message; Luke's one-word "Correct" closed all 4 (three days lost on
     Me Dá Seu Body). Now: one answer per question, and a message closes only when every one has an answer.
   - a decision ABOUT a bot but addressed to Luke never reached that bot: `about` sends the answer there too.
   - Luke answering in Alfred's chat left no record: record_luke_answer saves his exact words, via Alfred.
   - "Needs Luke" text was written once and never cleared: the owning bot clears its own blockers, and a
     card's "needs" that wasn't said again for 2 days stops showing as an ask. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, INSTRUCTIONS } from "../netlify/lib/staff-tools.mjs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const NOW = Date.parse("2026-11-14T15:00:00Z");
const MIN = 60000, DAY = 86400000;
const R = S.DEFAULT_ROSTER;
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, o = {}) => callTool(tool(name), args, { store: d, now: o.now || NOW, role: o.role || "bot", hq: async () => null });
const QS = ["Is it 'fode' 4 times, not 5?", "Is the second verse in Portuguese?", "Does the bridge repeat?", "Credit Lilian as co-writer?"];

test("several questions in one message: each gets its own answer, and it closes only when all are answered", async () => {
  const d = memoryDesk();
  const ask = await call(d, "send_message", { bot: "Verse", to: "Luke", text: "Four things about the Me Dá Seu Body lyrics.", needs: "reply", questions: QS });
  const m = (await S.getMessage(d, ask.id));
  assert.deepEqual(m.questions.map((q) => q.q), QS);
  assert.ok(m.questions.every((q) => q.answer === ""));
  /* Luke's one word no longer closes all four */
  const plain = await S.sendMessage(d, NOW + MIN, R, { from: "Luke", to: "Verse", text: "Correct", re: ask.id });
  assert.equal(plain.settled, false);
  assert.equal((await S.getMessage(d, ask.id)).resolved, null, "still open: none of the 4 has its own answer");
  /* two answered: still open, and it says which are left */
  const two = await S.sendMessage(d, NOW + 2 * MIN, R, { from: "Luke", to: "Verse", text: "1: yes, 4 times. 3: no.", re: ask.id, answers: { 1: "Yes, 4 times", 3: "No" } });
  assert.equal(two.settled, false);
  const mid = await S.getMessage(d, ask.id);
  assert.deepEqual(mid.questions.map((q) => q.answer), ["Yes, 4 times", "", "No", ""]);
  assert.equal(mid.questions[0].by, "Luke");
  assert.equal(S.isOpen(mid), true);
  /* the rest: closed, with every answer kept */
  const rest = await S.sendMessage(d, NOW + 3 * MIN, R, { from: "Luke", to: "Verse", text: "2: yes. 4: yes.", re: ask.id, answers: ["", "Yes", "", "Yes, as co-writer"] });
  assert.equal(rest.settled, true);
  const done = await S.getMessage(d, ask.id);
  assert.deepEqual(done.questions.map((q) => q.answer), ["Yes, 4 times", "Yes", "No", "Yes, as co-writer"]);
  assert.equal(done.resolved.by, "Luke");
  /* Verse reads the answers per question */
  const read = await call(d, "read_messages", { bot: "Verse", id: ask.id });
  assert.deepEqual(read.message.questions, [{ n: 1, q: QS[0], answer: "Yes, 4 times", by: "Luke" }, { n: 2, q: QS[1], answer: "Yes", by: "Luke" }, { n: 3, q: QS[2], answer: "No", by: "Luke" }, { n: 4, q: QS[3], answer: "Yes, as co-writer", by: "Luke" }]);
  /* refusals a bot can act on */
  await assert.rejects(call(d, "send_message", { bot: "Verse", to: "Luke", text: "x?", needs: "reply", questions: ["Only one?"] }), /2 to 6/);
  await assert.rejects(call(d, "send_message", { bot: "Verse", to: "all", text: "x?", questions: QS.slice(0, 2) }), /one name/i);
  await assert.rejects(call(d, "send_message", { bot: "Verse", to: "Luke", text: "x?", needs: "decision", questions: QS.slice(0, 2), options: ["A", "B"] }), /options.*questions|questions.*options/i);
  await assert.rejects(S.sendMessage(d, NOW, R, { from: "Luke", to: "Verse", text: "9: yes", re: ask.id, answers: { 9: "yes" } }), /question 9/);
  const single = await call(d, "send_message", { bot: "Kevin", to: "Luke", text: "Post today?", needs: "reply" });
  await assert.rejects(S.sendMessage(d, NOW, R, { from: "Luke", to: "Kevin", text: "1: yes", re: single.id, answers: { 1: "yes" } }), /no numbered questions/i);
  assert.equal(tool("send_message").inputSchema.properties.questions.type, "array");
});

test("about: a decision about a bot reaches that bot, and so does Luke's answer", async () => {
  const d = memoryDesk();
  const ask = await call(d, "send_message", { bot: "Nova", to: "Luke", text: "Can Forge switch the Meta ads back on after the cap reset?", needs: "decision", options: ["Yes, on the 1st", "Wait for me"], about: "forge" });
  assert.equal((await S.getMessage(d, ask.id)).about, "Forge");
  await S.sendMessage(d, NOW + 10 * MIN, R, { from: "Luke", to: "Nova", text: "Wait for me", re: ask.id, note: "Wait for me" });
  const day = await call(d, "my_day", { bot: "Forge" }, { now: NOW + 20 * MIN });
  const got = day.messages_for_you.map((m) => m.text);
  assert.ok(got.includes("Can Forge switch the Meta ads back on after the cap reset?"), "the question about Forge");
  assert.ok(got.includes("Wait for me"), "and Luke's answer to it");
  assert.equal(day.messages_for_you.find((m) => m.text === "Wait for me").about, "Forge");
  await assert.rejects(call(d, "send_message", { bot: "Nova", to: "Luke", text: "About Bob", about: "Bob" }), /not a name on the team/);
  /* HQ shows it */
  const t = S.board(await S.loadDesk(d, NOW + 30 * MIN), NOW + 30 * MIN, null).messages.find((x) => x.id === ask.id);
  assert.equal(t.about, "Forge");
});

test("record_luke_answer: Alfred saves Luke's exact words from his chat, as Luke's answer, via Alfred", async () => {
  const d = memoryDesk();
  const ask = await call(d, "send_message", { bot: "Verse", to: "Luke", text: "Two lyric questions.", needs: "reply", questions: QS.slice(0, 2) });
  const r = await call(d, "record_luke_answer", { bot: "Alfred", reply_to: ask.id, luke_said: "yes 4 times and yes portuguese", answers: { 1: "Yes, 4 times", 2: "Yes" } });
  assert.deepEqual([r.saved, r.closed], [true, true]);
  const msgs = await S.listMessages(d, NOW + MIN);
  const ans = msgs.find((m) => m.re === ask.id);
  assert.deepEqual([ans.from, ans.via, ans.to, ans.text], ["Luke", "Alfred", "Verse", "yes 4 times and yes portuguese"]);
  assert.equal((await S.getMessage(d, ask.id)).resolved.by, "Luke");
  /* a decision with options: the picked option settles it */
  const dec = await call(d, "send_message", { bot: "Nova", to: "Luke", text: "Survivors on 18 Dec?", needs: "decision", options: ["Yes", "January"] });
  await assert.rejects(call(d, "record_luke_answer", { bot: "Alfred", reply_to: dec.id, luke_said: "x", option: "Maybe" }), /one of the options/);
  const r2 = await call(d, "record_luke_answer", { bot: "Alfred", reply_to: dec.id, luke_said: "january is better", option: "January" });
  assert.equal(r2.closed, true);
  assert.equal((await S.getMessage(d, dec.id)).resolved.note, "January");
  await assert.rejects(call(d, "record_luke_answer", { bot: "Kevin", reply_to: ask.id, luke_said: "yes" }), /Alfred/);
  const toNova = await call(d, "send_message", { bot: "Kevin", to: "Nova", text: "Can you check?", needs: "reply" });
  await assert.rejects(call(d, "record_luke_answer", { bot: "Alfred", reply_to: toNova.id, luke_said: "yes" }), /waiting on Luke/);
  assert.match(tool("record_luke_answer").description, /exact words/i);
  assert.match(INSTRUCTIONS, /questions/);
});

test("stale blockers and asks: the owning bot clears its own; a 'needs' not said again for 2 days stops showing", async () => {
  const d = memoryDesk();
  await S.setRoster(d, R.map((b) => (b.name === "Kevin" ? { ...b, blockers: "TikTok asks for Luke's phone code on a new sign-in" } : b)));
  let w = S.board(await S.loadDesk(d, NOW), NOW, null).staff.find((x) => x.name === "Kevin");
  assert.match(w.blockers, /phone code/);
  const day = await call(d, "my_day", { bot: "Kevin" });
  assert.match(day.your_known_blockers, /phone code/);
  assert.match(day.your_known_blockers_how, /set_my_card/);
  /* Kevin says it no longer applies */
  const c = await call(d, "set_my_card", { bot: "Kevin", working_on: "Daily TikTok numbers", blockers: "" });
  assert.equal(c.blockers, "");
  w = S.board(await S.loadDesk(d, NOW), NOW, null).staff.find((x) => x.name === "Kevin");
  assert.equal(w.blockers, "", "cleared by the bot that owns it");
  /* a later card without `blockers` keeps them cleared; a new one replaces them */
  await call(d, "set_my_card", { bot: "Kevin", working_on: "Fan signals" });
  assert.equal(S.board(await S.loadDesk(d, NOW), NOW, null).staff.find((x) => x.name === "Kevin").blockers, "");
  await call(d, "set_my_card", { bot: "Kevin", working_on: "Fan signals", blockers: "Comments tab won't load" });
  assert.equal(S.board(await S.loadDesk(d, NOW), NOW, null).staff.find((x) => x.name === "Kevin").blockers, "Comments tab won't load");
  /* needs: said on the 14th, not repeated: gone from the card on the 16th (kept as oldNeeds) */
  await call(d, "set_my_card", { bot: "Forge", working_on: "Meta check", needs: "Luke's TikTok 2FA code" });
  const fresh = S.board(await S.loadDesk(d, NOW + DAY), NOW + DAY, null).staff.find((x) => x.name === "Forge").card;
  assert.equal(fresh.needs, "Luke's TikTok 2FA code");
  const later = S.board(await S.loadDesk(d, NOW + 2 * DAY + MIN), NOW + 2 * DAY + MIN, null).staff.find((x) => x.name === "Forge").card;
  assert.equal(later.needs, "", "not said again for 2 days: no longer asked");
  assert.equal(later.oldNeeds, "Luke's TikTok 2FA code");
  assert.ok(tool("set_my_card").inputSchema.properties.blockers);
});

test("HQ: a message with several questions shows each with its answer, and what is still open", () => {
  const m = { id: "m1", from: "Verse", to: "Luke", needs: "reply", text: "Four things.", questions: [{ q: "A?", answer: "Yes", by: "Luke" }, { q: "B?", answer: "" }], resolved: null };
  assert.deepEqual(L.questionLines(m), [{ n: 1, q: "A?", answer: "Yes", open: false }, { n: 2, q: "B?", answer: "", open: true }]);
  assert.equal(L.questionsLeft(m), "1 of 2 questions still needs an answer");
  assert.equal(L.questionsLeft({ questions: [] }), "");
});
