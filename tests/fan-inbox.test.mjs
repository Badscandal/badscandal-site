/* L3 part 1 (18 Nov 2026): song-name questions and repeat fans, from comments HQ already stored.
   No new Instagram call. Two named accounts are never shown. Made-up fans only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as IG from "../netlify/lib/instagram.mjs";
import { callTool, TOOLS, INSTRUCTIONS } from "../netlify/lib/staff-tools.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";

await import("../js/hq-lib.js");
const L = globalThis.HQLib;
const DAY = 86400000, H = 3600000;
const NOW = Date.parse("2026-11-18T15:00:00Z");
const HIDDEN = ["liliancardos", "liliancardosomakeup"];
const memStore = () => { const m = new Map(); return { m, get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); }, delete: async (k) => { m.delete(k); } }; };
const at = (ms) => new Date(NOW - ms).toISOString();
const c = (id, user, text, post, extra = {}) => ({ id, user, text, post, postCaption: "Made-up post " + post, link: "https://www.instagram.com/p/" + post + "/", at: at(H), ...extra });

test("song name and where to listen, in the languages fans write", () => {
  const song = ["what song is this??", "what's the song name", "whats this song", "which song is this", "song name?",
    "Qual é a música??", "qual o nome dessa música", "nome da musica?", "qué canción es esta", "cómo se llama", "como se chama essa"];
  const listen = ["where can I listen to this", "where do I hear the full thing", "need this on spotify", "onde eu ouço isso",
    "link do spotify", "dónde puedo escuchar", "apple music?"];
  /* 18 Nov 2026: "can I use this in my videos?" is a real question and stays until one of our accounts replies */
  const use = ["can i use your music in my videos?", "would it be okay to use it in my videos?"];
  const neither = ["fire", "love this", "when is it out?"];
  assert.deepEqual(song.map(IG.askKind), song.map(() => "song"));
  assert.deepEqual(listen.map(IG.askKind), listen.map(() => "listen"));
  assert.deepEqual(use.map(IG.askKind), use.map(() => "use"));
  assert.deepEqual(neither.map(IG.askKind), neither.map(() => ""));
});

test("fan inbox: unanswered song and listen questions need a reply; a repeat fan commented on more than one post", () => {
  const comments = [
    c("s1", "made_up_fan", "what song is this??", "p1"),
    c("s2", "made_up_fan", "play it again", "p2", { at: at(2 * H) }),
    c("l1", "another_made_up_fan", "need this on spotify", "p1", { at: at(3 * H) }),
    c("a1", "made_up_answered", "what song is this", "p1", { answered: true, at: at(4 * H) }),
    c("o1", "ouraccount", "what song is this", "p1", { own: true }),
    c("n1", "made_up_fan", "song name?", "p1", { at: at(20 * DAY) }),
    c("r1", "made_up_regular", "love this", "p1", { at: at(5 * H) }),
    c("r2", "made_up_regular", "back again", "p2", { at: at(6 * H) }),
    c("same", "made_up_once", "hello", "p1"),
    c("same2", "made_up_once", "hello again", "p1", { at: at(7 * H) }),
    c("h1", "liliancardos", "what song is this", "p2"),
    c("h2", "LilianCardosoMakeup", "onde ouvir", "p1"),
    c("m1", "made_up_mention", "is @liliancardos in this? what song", "p3"),
  ];
  const box = IG.fanInbox(comments, NOW);
  assert.deepEqual(box.questions.map((q) => [q.id, q.kind, q.needsReply]), [
    ["s1", "song", true], ["m1", "song", true], ["l1", "listen", true], ["n1", "song", true], ["a1", "song", false],
  ]);
  assert.equal(box.questions.find((q) => q.id === "m1").text.includes("lilian"), false);
  assert.equal(box.repeats.map((r) => r.user).join(" "), "made_up_fan made_up_regular");
  const fan = box.repeats.find((r) => r.user === "made_up_fan");
  assert.equal(fan.posts, 2); assert.equal(fan.needsReply, true);
  assert.equal(box.repeats.find((r) => r.user === "made_up_regular").needsReply, false);
  assert.equal(JSON.stringify(box).toLowerCase().includes("lilian"), false, "the two accounts never appear");
});

test("the inbox keeps the questions that need a reply when there are more than 15", () => {
  const comments = [];
  for (let i = 0; i < 10; i++) comments.push(c("n" + i, "fan" + i, "what song is this", "p" + i, { at: at((i + 1) * H) }));
  for (let i = 0; i < 10; i++) comments.push(c("a" + i, "old" + i, "what song is this", "p" + i, { answered: true, at: at((i + 1) * H) }));
  const box = IG.fanInbox(comments, NOW);
  assert.equal(box.questions.length, 15);
  assert.equal(box.questions.filter((q) => q.needsReply).length, 10);
});

test("igView and the sample never show the two accounts, and the inbox is built without calling Instagram", async () => {
  const st = memStore();
  st.m.set("key.json", JSON.stringify({ token: "IGAAnotarealkey" + "x".repeat(40), username: "ouraccount", route: "fb" }));
  st.m.set("state.json", JSON.stringify({ username: "ouraccount", followers: 10 }));
  st.m.set("own.json", JSON.stringify({ handles: ["liliancardos"], log: [{ at: NOW, by: "Nova", action: "add", handle: "liliancardos", reason: "family @liliancardosomakeup" }] }));
  st.m.set("comments.json", JSON.stringify([
    c("q1", "made_up_fan", "what song is this??", "p1", { repliedBy: ["liliancardos"] }),
    c("q2", "liliancardosomakeup", "love this", "p1"),
    c("q3", "made_up_fan", "again", "p2"),
  ]));
  let fetches = 0;
  const prev = globalThis.fetch;
  globalThis.fetch = () => { fetches++; return Promise.reject(new Error("Instagram must not be called")); };
  let v;
  try { v = await IG.igView(st, NOW); } finally { globalThis.fetch = prev; }
  assert.equal(fetches, 0);
  /* 18 Nov 2026: the handles are on own so their comments never count. They stay out of comments and the fan inbox. */
  const pub = JSON.stringify({ comments: v.comments, fanInbox: v.fanInbox, needsReply: v.needsReply }).toLowerCase();
  for (const h of HIDDEN) assert.equal(pub.includes(h), false, h);
  for (const h of HIDDEN) assert.ok(v.own.includes(h));
  assert.equal(v.fanInbox.questions.find((q) => q.id === "q1").needsReply, false, "a reply from our own list counts, and the name stays off the page");
  assert.equal(v.ownLog.length, 0);
  assert.deepEqual(v.comments.map((x) => x.id), ["q1", "q3"]);
  const sample = JSON.stringify(IG.sampleView(NOW)).toLowerCase();
  for (const h of HIDDEN) assert.equal(sample.includes(h), false, "sample " + h);
  const sv = IG.sampleView(NOW);
  assert.ok(sv.fanInbox.questions.some((q) => q.kind === "song" && q.needsReply));
  assert.ok(sv.fanInbox.questions.some((q) => q.kind === "listen" && q.needsReply));
  assert.ok(sv.fanInbox.questions.some((q) => q.needsReply === false));
  assert.ok(sv.fanInbox.repeats.some((r) => r.posts >= 2 && r.needsReply));
  assert.ok(sv.fanInbox.repeats.some((r) => r.posts >= 2 && !r.needsReply));
});

test("adding either account is refused without repeating the name; the instagram tool hands Luke the flag", async () => {
  const st = memStore();
  st.m.set("key.json", JSON.stringify({ token: "IGAAnotarealkey" + "x".repeat(40), username: "ouraccount", route: "fb" }));
  st.m.set("comments.json", JSON.stringify([
    c("q1", "made_up_fan", "where can I listen", "p1"),
    c("q2", "made_up_fan", "this too", "p2", { at: at(2 * H) }),
    c("h1", HIDDEN[0], "what song", "p1"),
  ]));
  for (const handle of ["@LilianCardos", "liliancardosomakeup"]) {
    await assert.rejects(IG.editOwn(st, NOW, { by: "Nova", action: "add", handle, reason: "family account" }), (e) => {
      assert.match(e.message, /never shown/);
      assert.equal(e.message.toLowerCase().includes("lilian"), false);
      return true;
    });
  }
  const desk = memoryDesk();
  const res = await callTool(TOOLS.find((t) => t.name === "instagram"), { bot: "Kevin" }, { store: desk, now: NOW, ig: () => st });
  const pub = JSON.stringify({ comments: res.new_comments, needs_reply: res.needs_reply, fan_inbox: res.fan_inbox, ranking: res.ranking }).toLowerCase();
  for (const h of HIDDEN) assert.equal(pub.includes(h), false, h);
  for (const h of HIDDEN) assert.ok(res.own_accounts.map((x) => x.toLowerCase()).includes("@" + h));
  assert.equal(res.fan_inbox.questions[0].needs_reply, true);
  assert.equal(res.fan_inbox.questions[0].kind, "where to listen");
  assert.equal(res.fan_inbox.repeat_fans[0].posts, 2);
  assert.match(res.fan_inbox.note, /Luke/);
  assert.match(res.fan_inbox.note, /[Nn]ever reply/);
  assert.equal(TOOLS.length, 55, "account_health, needs_you, song_pl (18 Nov 2026 night test) + profile_jobs, profile_master, profile_rework, profile_uploaded (PR #87)");
  assert.match(TOOLS.find((t) => t.name === "instagram").description, /fan inbox/i);
  assert.match(INSTRUCTIONS, /fan_inbox/);
  const src = readFileSync(new URL("../netlify/lib/instagram.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /method:\s*["']POST["']/);
});

test("HQ says it in plain words and the list wraps on a phone", () => {
  assert.equal(L.fanFlagWord(true), "Needs your reply");
  assert.equal(L.fanFlagWord(false), "Answered");
  assert.equal(L.fanKindWord("listen"), "Where to listen");
  assert.equal(L.fanKindWord("song"), "Song name");
  assert.match(L.FAN_INTRO, /song's name/);
  assert.match(L.FAN_INTRO, /nothing here replies/i);
  const js = readFileSync(new URL("../js/hq.js", import.meta.url), "utf8");
  assert.match(js, /id="fanInbox"/);
  assert.match(js, /fanFlagWord/);
  assert.match(js, /FAN_BACK/);
  const css = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  const start = css.indexOf(".faninbox");
  const block = css.slice(start, css.indexOf("/* ---------- L2", start));
  assert.match(block, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(block, /<table|display:\s*grid/);
  assert.match(block, /font-size:\s*1[3-9]px/);
});
