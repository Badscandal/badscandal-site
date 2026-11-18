/* Spark, the content-ideas bot (18 Nov 2026). On the roster, reports to Nova only,
   and stores 3 to 5 ideas. HQ never posts them. Made-up titles and links only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import * as S from "../netlify/lib/staff.mjs";
import { TOOLS, callTool, toolsFor } from "../netlify/lib/staff-tools.mjs";

const NOW = Date.parse("2026-11-18T15:00:00Z");
const tool = (name) => TOOLS.find((t) => t.name === name);
const call = (d, name, args) => callTool(tool(name), args, { store: d, now: NOW, role: "bot", hq: async () => null });
const rejects = (p, re) => assert.rejects(p, (e) => re.test(e.message));
await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const ours = (title, views, likes) => ({ whose: "ours", platform: "Instagram", title, views, likes, comments: 10, saves: 10, shares: 10 });
const ideas = [
  { hook: "Open on the drop", text: "Northwind", format: "Reel", platform: "Instagram", why: "The first second holds." },
  { hook: "One line, then the beat", text: "Stay for it", format: "short", platform: "TikTok", why: "Outliers start with one line." },
  { hook: "Chorus, no intro", text: "Chorus first", format: "short", platform: "YouTube", why: "The chorus-first clip ranked higher." },
];

test("Spark and Licence are roster names, and an unknown name is still refused", () => {
  assert.equal(S.whoIs(" spark ", S.DEFAULT_ROSTER), "Spark");
  assert.equal(S.whoIs(" licence ", S.DEFAULT_ROSTER), "Licence");
  assert.throws(() => S.whoIs("Manny", S.DEFAULT_ROSTER), /not a name on the team/);
  const spark = toolsFor("Spark", S.DEFAULT_ROSTER).map((t) => t.name);
  assert.deepEqual(spark, ["my_day", "post_update", "send_message", "set_my_card", "content_ideas", "account_health"]);
  assert.equal(spark.includes("instagram"), false, "the Instagram tool can change a song link");
  const licence = toolsFor("Licence", S.DEFAULT_ROSTER).map((t) => t.name);
  assert.ok(licence.includes("my_day") && licence.includes("licence_queue"));
  assert.equal(S.DEFAULT_ROSTER.find((b) => b.name === "Licence").time, "", "idle until a cover starts");
  assert.equal(S.DEFAULT_ROSTER.find((b) => b.name === "Spark").grok, "13779fd0-37f4-4e62-986a-e601b3142e55");
});

test("my_day gives Spark its job, and messages go to Nova only", async () => {
  const d = memoryDesk();
  const day = await call(d, "my_day", { bot: "Spark" });
  assert.equal(day.you, "Spark");
  assert.equal(day.role, "Content ideas");
  assert.equal(day.reports_to, "Nova");
  assert.equal(day.grok_bot, "13779fd0-37f4-4e62-986a-e601b3142e55");
  assert.match(day.daily_duty, /engagement per view/);
  assert.match(day.why_you_are_needed, /Nova only/);
  assert.match(day.posts, /Never post/);
  const licence = await call(d, "my_day", { bot: "Licence" });
  assert.equal(licence.you, "Licence");
  assert.match(licence.idle_until, /starts a cover/);
  await rejects(call(d, "send_message", { bot: "Spark", to: "Luke", text: "Three ideas." }), /reports to Nova only/);
  const sent = await call(d, "send_message", { bot: "Spark", to: "Nova", text: "Three ideas are on Growth." });
  assert.equal(sent.sent, true);
  assert.equal(sent.to, "Nova");
});

test("account_health accepts Spark and Licence and writes nothing", async () => {
  const d = memoryDesk();
  for (const bot of ["Spark", "Licence"]) {
    const r = await call(d, "account_health", { bot });
    assert.equal(r.wrote, false);
    assert.equal(r.read_only, true);
  }
});

test("content_ideas stores 3 to 5 ideas and the best official post, and never posts", async () => {
  const d = memoryDesk();
  const empty = await call(d, "content_ideas", { bot: "Nova" });
  assert.equal(empty.reported, false);
  await rejects(call(d, "content_ideas", { bot: "Spark", ideas: ideas.slice(0, 2), posts: [ours("Northwind clip", 10000, 400)] }), /3 to 5/);
  await rejects(call(d, "content_ideas", { bot: "Spark", ideas, posts: [ours("Northwind clip", 10000, 400)], comment: "post this" }), /never posts/);
  await rejects(call(d, "content_ideas", { bot: "Steve", ideas, posts: [ours("Northwind clip", 10000, 400)] }), /Only Spark/);
  const saved = await call(d, "content_ideas", { bot: "Spark", ideas, compared: "A similar artist opened on the chorus.",
    posts: [ours("Northwind clip", 10000, 400), { whose: "similar", platform: "TikTok", title: "Someone else", views: 1000, likes: 900, comments: 0, saves: 0, shares: 0 }] });
  assert.equal(saved.saved, true);
  assert.equal(saved.best.title, "Northwind clip", "a similar artist's higher rate does not win");
  assert.equal(saved.best.perView, 0.043);
  assert.equal(saved.ideas.length, 3);
  const again = await call(d, "content_ideas", { bot: "Atlas" });
  assert.equal(again.best.title, "Northwind clip");
  const board = S.board(await S.loadDesk(d, NOW), NOW, null);
  assert.equal(board.contentIdeas.best.title, "Northwind clip");
  const card = L.contentIdeasCard(board.contentIdeas);
  assert.match(card.best, /Northwind clip/);
  assert.equal(card.ideas.length, 3);
  assert.match(card.note, /does not post/);
});
