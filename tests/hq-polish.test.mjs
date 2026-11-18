/* HQ polish (18 Nov 2026): the desk answers the bots asked for, and the page stops saying
   "blocked" when the note says the step is waiting. Made-up names only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, connectorStatus } from "../netlify/lib/staff-tools.mjs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const NOW = Date.parse("2026-11-18T15:00:00Z");
const HOUR = 3600000;
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, o = {}) => callTool(tool(name), args, { store: d, now: o.now || NOW, role: "bot", hq: o.hq || (async () => null) });

test("my_day names the live tool count, and says reconnect needed when the bot's copy is old", async () => {
  const d = memoryDesk();
  const day = await call(d, "my_day", { bot: "Kevin" });
  assert.equal(day.connector.tools, TOOLS.length);
  assert.equal(day.connector.reconnect_needed, false);
  assert.match(day.reconnect, new RegExp("The desk has " + TOOLS.length + " tools"));
  assert.match(day.reconnect, /reconnect needed/);
  const old = await call(d, "my_day", { bot: "Steve", tools_seen: 12, list_version: "00000000" });
  assert.equal(old.connector.reconnect_needed, true);
  assert.match(old.reconnect, /^reconnect needed:/);
  assert.match(old.reconnect, /you see 12 tools/);
  const same = connectorStatus(TOOLS, { tools_seen: TOOLS.length, list_version: day.connector.version });
  assert.equal(same.reconnect_needed, false);
});

test("set_my_card: working_on can be left out, so a blocker clears on its own", async () => {
  const d = memoryDesk();
  await call(d, "set_my_card", { bot: "Kevin", working_on: "Daily numbers", blockers: "Comments tab won't load" });
  const c = await call(d, "set_my_card", { bot: "Kevin", blockers: "" });
  assert.equal(c.working_on, "Daily numbers");
  assert.equal(c.blockers, "");
  assert.equal(S.board(await S.loadDesk(d, NOW), NOW, null).staff.find((w) => w.name === "Kevin").blockers, "");
  await assert.rejects(call(d, "set_my_card", { bot: "Kevin" }), /working_on, needs, or blockers/);
});

test("a card blocker older than 48 hours is 'old, still true?' and leaves the headline", async () => {
  const d = memoryDesk();
  await call(d, "set_my_card", { bot: "Drop", working_on: "Upload", blockers: "Waiting on a file" }, { now: NOW - 49 * HOUR });
  const w = S.board(await S.loadDesk(d, NOW), NOW, null).staff.find((x) => x.name === "Drop");
  assert.equal(w.blockersStale, true);
  assert.match(w.blockers, /Waiting on a file/);
  const day = await call(d, "my_day", { bot: "Drop" });
  assert.equal(day.your_known_blockers, undefined);
  assert.match(day.your_known_blockers_old, /^old, still true\? Waiting on a file$/);
  const fresh = await call(d, "set_my_card", { bot: "Drop", blockers: "Waiting on a file" });
  assert.equal(fresh.blockers, "Waiting on a file");
  assert.equal(S.board(await S.loadDesk(d, NOW), NOW, null).staff.find((x) => x.name === "Drop").blockersStale, false);
});

test("my_day lists this bot's open questions to Luke and how long each has waited", async () => {
  const d = memoryDesk();
  await call(d, "send_message", { bot: "Kevin", to: "Luke", text: "Which cover do you want?", needs: "decision", options: ["Red", "Black"] }, { now: NOW - 3 * HOUR });
  await call(d, "send_message", { bot: "Steve", to: "Luke", text: "Not Kevin's question.", needs: "reply" }, { now: NOW - HOUR });
  const day = await call(d, "my_day", { bot: "Kevin" });
  assert.equal(day.questions_to_luke.length, 1);
  assert.equal(day.questions_to_luke[0].needs, "decision");
  assert.match(day.questions_to_luke[0].waiting, /3 h/);
  assert.match(day.questions_to_luke[0].text, /Which cover/);
});

test("income_problems names each unsorted payment by id and date", async () => {
  const d = memoryDesk();
  const a = await S.submitIncome(d, NOW, S.DEFAULT_ROSTER, { bot: "HQ", payer: "Made-up Friend", amount: 12, currency: "EUR", account: "Revolut", date: "2026-11-09", status: "unsorted", reference: "tx-polish" });
  const inc = await S.incomeState(d, NOW);
  assert.ok(inc.problems.includes("1 payment in Revolut that nobody has sorted yet"), "the short line stays, so Alfred's briefing does not change");
  const day = await call(d, "my_day", { bot: "Ledger" });
  assert.match(day.income_problems.join("\n"), new RegExp(a.entry.id + " \\(2026-11-09\\)"));
});

test("Atlas's stale duty text is rewritten: monthly listeners are a field, and there is no Salvation card", async () => {
  const hq = async () => ({ team: { duties: { done: 0, total: 1, late: 0, blocked: 0, byOwner: [{ owner: "Atlas", items: [{ id: "D-atlas-1", task: "Log Spotify monthly listeners in note. Salvation card.", status: "todo", late: false, due: "09:15", blocker: "" }] }] }, tasks: [] } });
  const day = await call(memoryDesk(), "my_day", { bot: "Atlas" }, { hq });
  const duty = day.duties_today.find((x) => x.id === "D-atlas-1");
  assert.match(duty.task, /monthly_listeners and brazil_listeners/);
  assert.match(duty.task, /no Salvation card/);
  assert.doesNotMatch(duty.task, /in note/);
  assert.match(day.numbers_how, /no Salvation card/);
  assert.match(S.DEFAULT_ROSTER.find((b) => b.name === "Atlas").schedule[0].what, /monthly_listeners and brazil_listeners/);
});

test("a blocked step whose note says it is waiting for the release day is shown as waiting", () => {
  const st = { status: "blocked", label: "Lyrics live on Musixmatch", note: "waiting for the release day" };
  assert.equal(S.blockIsWait(st), true);
  assert.equal(S.blockIsWait({ status: "blocked", label: "Uploaded to RouteNote with the release date", note: "Needs the cover" }), false);
  const words = L.stepState(st, "2026-11-18");
  assert.equal(words.waiting, true);
  assert.equal(words.bad, false);
  assert.match(words.text, /^waiting/);
  assert.doesNotMatch(words.text, /^blocked/);
  assert.match(L.stepState({ status: "blocked", note: "Needs the cover" }, "2026-11-18").text, /^blocked/);
});

test("dates and desk times never read Invalid Date, and an ISO instant is São Paulo time", () => {
  /* phone HQ says "not reported" for a broken date (18 Nov 2026), never a blank and never the words Invalid Date */
  assert.equal(L.day("Invalid Date"), "not reported");
  assert.equal(L.day("2026-11-20"), "Fri 20 Nov");
  assert.equal(L.spWhen("Invalid Date", "2026-11-18"), "");
  assert.equal(L.spWhen("2026-11-18T04:21:00.000Z", "2026-11-18"), "01:21");
  assert.equal(L.spWhen("2026-11-18 22:30", "2026-11-18"), "22:30");
  const html = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("../js/hq.js", import.meta.url), "utf8");
  assert.match(html, /\.rsteps \.linkbtn[\s\S]*min-height:44px;min-width:44px/);
  assert.match(js, /The rest of the note/);
  assert.match(html, /class="t-card fold"/);
});
