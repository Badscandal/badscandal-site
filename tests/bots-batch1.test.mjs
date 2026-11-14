/* The bots' feedback, batch 1 (14 Nov 2026, Luke: "yes let's do it start with 1"): the daily friction.
   - every answer once, compact (it was sent twice: indented text AND the same object again, ~35 KB cut at 8 KB)
   - read_messages: since / unread / from / to / about / search / one message by id / "anything new?"
   - bots close and update their OWN T- tasks (task_update): HQ shows it over the sheet's row
   - decision options and the roster's schedule times are no longer cut off
   - the visualiser never makes Laura's step look blocked (it was "needed for the video" on a song with none) */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";
import { toolResult } from "../netlify/lib/mcp.mjs";
import { teamReport } from "../netlify/lib/hq.mjs";

const NOW = Date.parse("2026-11-14T15:00:00Z"); /* Sat 14 Nov, 12:00 in São Paulo */
const MIN = 60000, HOUR = 3600000;
const R = S.DEFAULT_ROSTER;
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, o = {}) => callTool(tool(name), args, { store: d, now: o.now || NOW, role: o.role || "bot", hq: o.hq || (async () => null) });

test("every answer goes once, compact: no second copy of the same object", () => {
  const v = { a: 1, list: [{ b: "x" }] };
  const r = toolResult(v);
  assert.equal(r.content.length, 1);
  assert.equal(r.content[0].text, '{"a":1,"list":[{"b":"x"}]}', "no indentation");
  assert.equal(r.structuredContent, undefined, "not sent twice");
  assert.deepEqual(JSON.parse(r.content[0].text), v);
  assert.deepEqual(toolResult("Missing: x", true), { content: [{ type: "text", text: "Missing: x" }], isError: true });
});

test("read_messages: since, unread, from, to, about, search, one by id, and 'anything new?'", async () => {
  const d = memoryDesk();
  const say = (min, from, to, text, needs = "none") => S.sendMessage(d, NOW - min * MIN, R, { from, to, text, needs });
  const old = (await say(3 * 24 * 60, "Nova", "Sheet", "Did the 11 Nov income row load?", "reply")).message;
  await say(600, "Kevin", "Luke", "TikTok wants a code.", "action");
  await say(300, "Claude", "Sheet", "Please re-check the Rates tab.", "action");
  await call(d, "my_day", { bot: "Sheet" }, { now: NOW - 200 * MIN }); /* Sheet reads everything up to here */
  const fresh = (await say(100, "Ledger", "Sheet", "Payouts are in for October.")).message;
  await say(50, "Nova", "all", "Standup at 18:00.");

  const any = (await call(d, "read_messages", { bot: "Sheet", count_only: true })).anything_new;
  assert.equal(any, true);
  const c = await call(d, "read_messages", { bot: "Sheet", count_only: true });
  assert.deepEqual([c.anything_new, c.count], [true, 2], "two new for Sheet since it last read (Ledger's and the note to all)");
  assert.equal(c.messages, undefined, "the quick check sends no messages");
  const again = await call(d, "read_messages", { bot: "Sheet", count_only: true });
  assert.equal(again.count, 2, "the quick check doesn't count as reading");

  const unread = await call(d, "read_messages", { bot: "Sheet", unread: true });
  assert.deepEqual(unread.messages.map((m) => m.from), ["Nova", "Ledger"], "only what came since Sheet last read, newest first");
  const after = await call(d, "read_messages", { bot: "Sheet", unread: true });
  assert.deepEqual(after.messages, [], "reading moved the marker");

  const since = await call(d, "read_messages", { bot: "Sheet", show: "all", since: "2026-11-14" });
  assert.ok(since.messages.every((m) => m.at >= "2026-11-14"), "a day = from that day's start in São Paulo");
  assert.ok(!since.messages.some((m) => m.id === old.id));
  const from = await call(d, "read_messages", { bot: "Sheet", show: "all", from: "kevin" });
  assert.deepEqual(from.messages.map((m) => m.from), ["Kevin"]);
  const to = await call(d, "read_messages", { bot: "Sheet", show: "all", to: "Luke" });
  assert.deepEqual(to.messages.map((m) => m.to), ["Luke"]);
  const about = await call(d, "read_messages", { bot: "Sheet", show: "all", about: "Ledger" });
  assert.deepEqual(about.messages.map((m) => m.from), ["Ledger"], "about = from or to that name");
  const search = await call(d, "read_messages", { bot: "Sheet", show: "all", search: "11 nov income" });
  assert.deepEqual(search.messages.map((m) => m.id), [old.id], "Sheet finds its own 11 Nov question");
  const one = await call(d, "read_messages", { bot: "Sheet", id: fresh.id });
  assert.deepEqual([one.message.id, one.message.text], [fresh.id, "Payouts are in for October."]);
  assert.equal(one.messages, undefined);
  await assert.rejects(call(d, "read_messages", { bot: "Sheet", id: "m000000000000" }), /no message with that id/i);
  await assert.rejects(call(d, "read_messages", { bot: "Sheet", since: "yesterday" }), /since/);
  /* the schema says so */
  const p = tool("read_messages").inputSchema.properties;
  for (const k of ["since", "unread", "from", "to", "about", "search", "id", "count_only"]) assert.ok(p[k] && p[k].type && p[k].description, k);
});

test("task_update: a bot closes or updates its OWN T- task; HQ shows it over the sheet's row", async () => {
  const d = memoryDesk();
  const tasks = [{ id: "T-27", owner: "Laura", task: "Schedule the lyric video", status: "todo", deadline: "2026-11-12" },
    { id: "T-30", owner: "Forge", task: "Log Meta spend", status: "blocked", blocker: "no login", deadline: "2026-11-13" }];
  const hq = async () => ({ team: { tasks: teamReport(tasks, [], "2026-11-14").tasks } });
  const done = await call(d, "task_update", { bot: "Laura", task: "t-27", status: "done", note: "Lyric video scheduled for Fri 27 Nov" }, { hq });
  assert.deepEqual([done.saved, done.task, done.status], [true, "T-27", "done"]);
  await call(d, "task_update", { bot: "Forge", task: "T-30", status: "todo", note: "Signed in since 13 Nov" }, { hq });
  await assert.rejects(call(d, "task_update", { bot: "Kevin", task: "T-27", status: "done", note: "x" }, { hq }), /T-27 is Laura's/);
  await assert.rejects(call(d, "task_update", { bot: "Laura", task: "T-99", status: "done", note: "x" }, { hq }), /no open task T-99/i);
  await assert.rejects(call(d, "task_update", { bot: "Forge", task: "T-30", status: "blocked" }, { hq }), /what is needed/i);
  await assert.rejects(call(d, "task_update", { bot: "Laura", task: "T-27", status: "done", note: "x" }, { hq: async () => null }), /sheet/i);
  await assert.rejects(call(d, "task_update", { bot: "Laura", task: "D-12", status: "done", note: "x" }, { hq }), /post_update/);
  assert.ok((await call(d, "task_update", { bot: "Nova", task: "T-30", status: "working", note: "Forge is on it" }, { hq })).saved, "Nova may update anyone's");

  const overlay = await S.getTaskOverlay(d);
  const rep = teamReport(tasks, [], "2026-11-14", overlay);
  assert.deepEqual(rep.tasks.map((t) => [t.id, t.status, t.blocker, t.late]), [["T-30", "working", "", true]], "T-27 is done: off the open list; T-30 no longer blocked");
  assert.equal(rep.tasks[0].note, "Forge is on it");
  assert.equal(rep.tasks[0].by, "Nova");
  assert.equal(rep.blocked, 0);
  /* the sheet's own "done" still wins, and a task the bot calls done stays done even if the sheet says blocked */
  assert.deepEqual(teamReport([{ ...tasks[0], status: "done" }], [], "2026-11-14", overlay).tasks, []);
  /* the tool is listed and described for literal readers */
  const t = tool("task_update");
  assert.ok(t.description.length > 120 && /T-/.test(t.description) && /post_update/.test(t.description));
  assert.deepEqual(t.inputSchema.required, ["bot", "task", "status"]);
});

test("decision options keep their full words; the roster's times aren't cut", async () => {
  const d = memoryDesk();
  const long = "Release Survivors on Fri 18 Dec and move Slow Burn to January so the two don't clash in the same fortnight";
  const m = (await S.sendMessage(d, NOW, R, { from: "Nova", to: "Luke", text: "Which one?", needs: "decision", options: [long, "Keep both as they are"] })).message;
  assert.equal(m.options[0], long);
  const roster = await S.setRoster(d, [{ name: "Webmaster", role: "Website", schedule: [{ time: "7 days before a release", what: "Song page live" }] }]);
  assert.equal(roster[0].schedule[0].time, "7 days before a release");
});

test("the visualiser never makes Laura's step look blocked: it is optional and never 'missing'", () => {
  const f = S.PACK_FIELDS.find((x) => x.key === "visualiser");
  assert.equal(f.neededBy, "");
  assert.match(f.hint, /optional/i);
  const v = S.releaseView({ id: "x", title: "X", date: "2026-12-18", status: "scheduled", pack: { kind: "Self-release" }, steps: S.scheduleSteps("2026-12-18", "2026-11-14").steps }, "2026-11-14");
  assert.ok(!v.missing.some((m) => m.key === "visualiser"));
});
