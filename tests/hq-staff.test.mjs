/* /hq, the staff desk on the page (11 Nov 2026): Team as the workers section, Messages, "Money coming
   in". Every rule and sentence the page shows is in js/hq-lib.js and is checked here; js/hq-staff.js
   only draws and sends. The board below is MADE UP (the repo is public: no real payer, amount or note). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sampleBoard, memoryDesk } from "../netlify/lib/staff-sample.mjs";
import * as S from "../netlify/lib/staff.mjs";

await import("../js/hq-lib.js");
const L = globalThis.HQLib;
const NOW = Date.parse("2026-11-11T13:00:00Z"); /* 10:00 in São Paulo */
const TODAY = "2026-11-11", min = 60000;
const iso = (m) => new Date(NOW - m * min).toISOString();
const msg = (id, from, to, needs, over = {}) => ({ id, at: iso(30), sp: "2026-11-11 09:30", from, to, text: "Hello", needs, re: "", options: [], kind: "note", resolved: null, replies: [], ...over });
const worker = (name, state, over = {}) => ({ name, role: "", why: "", duty: "", time: "", schedule: [], writes: "", access: "", blockers: "", paused: false, state, duties: [], tasks: [], lateTasks: 0, last: null, updatesToday: 0, card: null, waiting: [], seen: null, connected: false, ...over });
const boardOf = (over = {}) => ({ today: TODAY, now: TODAY + " 10:00", staff: [], updates: [], messages: [], waiting: { luke: [], claude: [], bots: 0 },
  income: { month: "2026-11", received: {}, pending: {}, count: 0, entries: [], accounts: [], sources: [], unknown: [], problems: [] },
  connector: { botsOn: true, changedAt: null, lastUsed: { bot: "Atlas", at: iso(5), tool: "post_update" }, connected: 6, total: 12, claudeSeen: null }, report: null, names: ["Nova", "Ledger", "Atlas", "Luke", "Claude", "HQ"], hqRead: true, keys: { bots: true, claude: true }, ...over });

test("Team: one pill in plain words, and the order that puts what needs a look first", () => {
  assert.deepEqual(["blocked", "late", "quiet", "todo", "working", "done", "idle", "paused"].map(L.workerLabel), ["Blocked", "Late", "Quiet today", "To do", "Working", "Done", "No duty today", "Paused"]);
  assert.equal(L.workerLabel("something new"), "No duty today");
  const staff = [worker("Zed", "done"), worker("Paula", "paused"), worker("Ida", "idle"), worker("Wes", "working"), worker("Tom", "todo"), worker("Quinn", "quiet"), worker("Lia", "late"), worker("Bo", "blocked"), worker("Abe", "done")];
  assert.deepEqual(L.sortWorkers(staff).map((w) => w.name), ["Bo", "Lia", "Quinn", "Tom", "Wes", "Abe", "Zed", "Ida", "Paula"]);
  assert.equal(staff[0].name, "Zed", "the board itself is not reordered");
  assert.equal(L.slug("Nova"), "nova"); assert.equal(L.slug(' Web <b>"Master" '), "webbmaster", "a card's address is letters and digits only");
});

test("Team: a duty's words are said once, sentence case, with its time", () => {
  assert.equal(L.dutyWhen({ status: "todo", late: true, due: "00:30" }), "late · due 00:30");
  assert.equal(L.dutyWhen({ status: "todo", late: true, due: "" }), "late");
  assert.equal(L.dutyWhen({ status: "todo", due: "09:15" }), "due 09:15");
  assert.equal(L.dutyWhen({ status: "todo", due: "" }), "to do");
  assert.equal(L.dutyWhen({ status: "todo", due: "09:15", working: true }), "working · due 09:15");
  assert.equal(L.dutyWhen({ status: "done", due: "09:15" }), "done");
  assert.equal(L.dutyWhen({ status: "blocked", due: "09:15", late: false }), "blocked");
});

test("Team: counts, the connector line per bot, and the strip on top", () => {
  assert.equal(L.workerCounts(worker("A", "todo", { tasks: [1, 2, 3], lateTasks: 1, waiting: [1, 2] })), "3 open tasks · 1 late · 2 messages waiting on it");
  assert.equal(L.workerCounts(worker("A", "todo", { tasks: [1], waiting: [1] })), "1 open task · 1 message waiting on it");
  assert.equal(L.workerCounts(worker("A", "idle")), "", "nothing to count, nothing said");
  assert.equal(L.seenLine(worker("A", "idle", { seen: iso(5) }), NOW), "Last used the connector 5 min ago");
  assert.equal(L.seenLine(worker("A", "idle"), NOW), "Hasn't used the connector yet");
  let c = L.connectorLine(boardOf(), NOW);
  assert.equal(c.head + " · " + c.rest, "Bots' connector: on · 6 of 12 bots have used it · last used 5 min ago (Atlas)");
  assert.deepEqual(c.notes, []); assert.equal(c.on, true);
  c = L.connectorLine(boardOf({ connector: { botsOn: true, connected: 0, total: 12, lastUsed: null }, keys: { bots: false } }), NOW);
  assert.deepEqual(c.notes, ["The connector's key isn't set on the site yet.", "No bot has connected yet. It starts when the connector is added in the bots' app."]);
  c = L.connectorLine(boardOf({ connector: { botsOn: false, changedAt: iso(3), connected: 6, total: 12, lastUsed: null } }), NOW);
  assert.equal(c.on, false); assert.equal(c.head, "Bots' connector: off");
  assert.match(c.notes[0], /^Switched off 3 min ago\. No bot can send/);
});

test("Team: the sheet's own log still counts for a bot's last word, 'Quiet today' and 'Blocked'", () => {
  const sheet = { team: { live: { ready: true, feed: [], bots: [{ bot: "ATLAS", lastAt: "2026-11-11 09:40", status: "done", message: "Row written", link: "" }, { bot: "Kevin", lastAt: "2026-11-11 08:36", status: "blocked", message: "Login expired", link: "" }, { bot: "Drop", lastAt: "2026-11-10 18:00", status: "done", message: "Yesterday", link: "" }] } } };
  const a = L.workerView(worker("Atlas", "quiet"), sheet, TODAY);
  assert.equal(a.state, "idle", "it did write today, in the sheet"); assert.equal(a.last.message, "Row written");
  assert.equal(L.workerView(worker("Kevin", "todo"), sheet, TODAY).state, "blocked");
  assert.equal(L.workerView(worker("Drop", "quiet"), sheet, TODAY).state, "quiet", "yesterday's word doesn't make today un-quiet");
  const newer = L.workerView(worker("Atlas", "done", { last: { at: "2026-11-11 09:55", status: "done", message: "Through the connector", link: "" } }), sheet, TODAY);
  assert.equal(newer.last.message, "Through the connector", "the newer word wins"); assert.equal(newer.state, "done");
  assert.equal(L.workerView(worker("Nova", "quiet"), null, TODAY).state, "quiet", "no sheet: the board as it is");
  assert.equal(L.workerView(worker("Nova", "<img>"), null, TODAY).state, "idle", "an unknown state never reaches the page as a class");
});

test("Team: ONE live log from the connector and the sheet, the same line never twice, newest first", () => {
  const board = boardOf({ updates: [{ sp: "2026-11-11 09:54", bot: "Ledger", status: "done", message: "Wise checked", link: "" }, { sp: "2026-11-11 09:20", bot: "Atlas", status: "working", message: "Reading Spotify", link: "" }] });
  const sheet = { team: { live: { ready: true, bots: [], feed: [{ at: "2026-11-11 09:40", bot: "Forge", status: "done", message: "Spend logged", link: "https://example.com/row" }, { at: "2026-11-11 09:20", bot: "atlas", status: "working", message: "Reading Spotify ", link: "" }] } } };
  const feed = L.liveFeed(board, sheet);
  assert.deepEqual(feed.map((u) => u.at.slice(11) + " " + u.bot), ["09:54 Ledger", "09:40 Forge", "09:20 Atlas"]);
  assert.equal(feed[1].link, "https://example.com/row");
  assert.equal(L.liveFeed(null, sheet).length, 2, "no board: the sheet's log alone");
  assert.equal(L.liveFeed(board, null).length, 2, "no sheet: the connector's log alone");
  assert.deepEqual(L.liveFeed(null, null), []);
});

test("Team: 'Copy message for Nova' is plain text with the bot, the duty, the state and the blocker", () => {
  const w = worker("Kevin", "blocked", { role: "TikTok", blockers: "Asks for a phone code on a new sign-in", duties: [{ id: "D-1", task: "Log followers", status: "blocked", blocker: "Login expired", due: "09:10", late: false }, { id: "D-2", task: "Best post", status: "done", due: "09:10" }],
    card: { workingOn: "Banner", needs: "A phone code", at: iso(60) }, last: { at: "2026-11-11 08:41", status: "blocked", message: "Signed out", link: "" } });
  assert.equal(L.novaMessage(w), "Nova, please look at Kevin (TikTok).\nState: Blocked\nDuty: Log followers (blocked)\nBlocker: Login expired\nNeeds: A phone code\nLatest update (08:41): Signed out");
  const late = worker("Laura", "late", { blockers: "None known", duties: [{ id: "D-3", task: "Log subscribers", status: "todo", late: true, due: "00:30", blocker: "" }] });
  assert.equal(L.novaMessage(late), "Nova, please look at Laura.\nState: Late\nDuty: Log subscribers (late · due 00:30)\nKnown blocker: None known");
});

test("Messages: when, who it waits on, and what it wants from Luke", () => {
  assert.equal(L.spWhen("2026-11-11 09:15", TODAY), "09:15");
  assert.equal(L.spWhen("2026-11-09 09:15", TODAY), "Mon 9 Nov, 09:15");
  assert.equal(L.spWhen("", TODAY), "");
  assert.equal(L.waitLabel(msg("m1", "Claude", "all", "none")), null, "a note waits on nobody");
  assert.deepEqual(L.waitLabel(msg("m1", "Claude", "Nova", "action")), { text: "waiting on Nova", open: true, mine: false });
  assert.deepEqual(L.waitLabel(msg("m1", "Nova", "Luke", "decision")), { text: "waiting on you", open: true, mine: true });
  assert.equal(L.waitLabel(msg("m1", "Nova", "Ledger", "reply", { resolved: { by: "Ledger", at: iso(1), note: "answered" } })).text, "answered by Ledger");
  assert.equal(L.waitLabel(msg("m1", "Nova", "Luke", "reply", { resolved: { by: "Luke", at: iso(1), note: "answered" } })).text, "answered by you");
  assert.equal(L.waitLabel(msg("m1", "Nova", "Luke", "decision", { resolved: { by: "Luke", at: iso(1), note: "Yes" } })).text, "done");
  assert.deepEqual(["decision", "action", "reply"].map((n) => L.needWords({ needs: n })), ["needs a decision", "asks you to do something", "needs a reply"]);
});

test("Messages: Luke writes to Nova first, then Claude, every bot, then everyone (never to himself or the site)", () => {
  assert.deepEqual(L.composeNames(["Alfred", "Nova", "Ledger", "Luke", "Claude", "HQ"]), [{ value: "Nova", label: "Nova" }, { value: "Claude", label: "Claude" }, { value: "Alfred", label: "Alfred" }, { value: "Ledger", label: "Ledger" }, { value: "all", label: "Everyone" }]);
  assert.deepEqual(L.composeNames(null).map((n) => n.label), ["Claude", "Everyone"]);
});

test("Messages: an answer points at the message that starts the thread, so the board shows it", () => {
  const reply = msg("m2", "Nova", "Luke", "reply", { re: "m1" });
  const board = boardOf({ messages: [msg("m9", "Claude", "all", "none"), msg("m1", "Luke", "Nova", "reply", { replies: [reply] })] });
  assert.equal(L.threadRoot(board, board.messages[1]), "m1");
  assert.equal(L.threadRoot(board, reply), "m1", "a question that is itself an answer: its thread");
  assert.equal(L.threadRoot(board, msg("m3", "Nova", "Luke", "reply", { re: "m2" })), "m1", "an answer to an answer: still the thread");
  assert.equal(L.threadRoot(board, msg("m7", "Nova", "Luke", "reply")), "m7", "not on the board yet: itself");
  assert.equal(L.threadRoot(null, null), "");
});

test("Messages: the site's own check is a title and a body that folds after 8 lines", () => {
  const text = "HQ check, 2026-11-11 morning: 3 things to look at\n\nNeeds a look:\n" + Array.from({ length: 10 }, (_, i) => "- line " + (i + 1)).join("\n");
  const p = L.reportParts(text, 8);
  assert.equal(p.title, "HQ check, 2026-11-11 morning: 3 things to look at");
  assert.equal(p.head.split("\n").length, 8); assert.equal(p.head.split("\n")[0], "Needs a look:", "the blank line under the title is dropped");
  assert.equal(p.more, 3); assert.equal(p.rest.split("\n").pop(), "- line 10");
  assert.deepEqual(L.reportParts("Only a title"), { title: "Only a title", head: "", rest: "", more: 0 });
  assert.equal(L.siteCheckLine({ text, sp: "2026-11-11 09:50" }, TODAY), "Site check 09:50: 3 things to look at");
  assert.equal(L.siteCheckLine({ text: "HQ check, 2026-11-10 evening: all running", sp: "2026-11-10 21:50" }, TODAY), "Site check Tue 10 Nov, 21:50: all running");
  assert.equal(L.siteCheckLine(null, TODAY), "");
});

test("Today: what the staff desk adds to 'Needs attention'", () => {
  assert.deepEqual(L.staffAttention(null), []);
  assert.deepEqual(L.staffAttention(boardOf()), [], "all quiet: nothing added");
  const one = boardOf({ waiting: { luke: [msg("m1", "Nova", "Luke", "decision")], claude: [], bots: 0 } });
  assert.deepEqual(L.staffAttention(one), [{ key: "msgs", text: "1 message is waiting on you", href: "#messages" }]);
  const busy = boardOf({ waiting: { luke: [1, 2, 3], claude: [], bots: 0 }, connector: { botsOn: false, connected: 2, total: 12 },
    income: { problems: ["Wise: not checked today (Ledger)", "Bank: blocked. Not connected yet", "Sample Label: Last payment 2026-08-01; expected monthly", "2 pending payments older than 30 days", "New payer(s) not on the list of sources: Acme Music"], unknown: ["Acme Music"] } });
  assert.deepEqual(L.staffAttention(busy).map((a) => a.text + " -> " + a.href), [
    "3 messages are waiting on you -> #messages",
    "Income: Wise: not checked today (Ledger) -> #money", "Income: Bank: blocked. Not connected yet -> #money", "Income: Sample Label: Last payment 2026-08-01; expected monthly -> #money",
    "Income: +2 more -> #money",
    "The bots' connector is switched off -> #team"]);
  /* inside attention(): messages first (Luke can act on them now), the rest after the sheet's items */
  const att = L.attention({ sheet: null, ov: { metaKey: { state: "expired", text: "Meta key: expired" } }, board: busy });
  assert.equal(att[0].key, "msgs"); assert.equal(att[1].key, "key"); assert.equal(att[att.length - 1].key, "connector");
  assert.deepEqual(L.attention({ sheet: null, ov: null }), [], "no board asked for: as before");
});

test("Data health: the Connector and Site check rows", () => {
  const rows = (b, problem) => L.staffHealth(b, problem, NOW).map((r) => [r.label, r.state, r.text]);
  assert.deepEqual(rows(null), [["Connector", "off", "Not read yet"], ["Site check", "off", "Not read yet"]]);
  assert.deepEqual(rows(null, "Couldn't load (500)")[0], ["Connector", "bad", "Couldn't load (500)"]);
  const rep = { id: "m1", at: iso(12), sp: "2026-11-11 09:48", from: "HQ", kind: "report", text: "HQ check, 2026-11-11 morning: 3 things to look at\n\nNeeds a look:\n- x" };
  assert.deepEqual(rows(boardOf({ report: rep })), [["Connector", "ok", "On · 6 of 12 bots connected · last used 5 min ago (Atlas)"], ["Site check", "ok", "Last check 12 min ago: 3 things to look at"]]);
  assert.deepEqual(rows(boardOf({ keys: { bots: false } }))[0], ["Connector", "off", "The connector's key isn't set on the site yet"]);
  assert.deepEqual(rows(boardOf({ connector: { botsOn: false, changedAt: iso(3), connected: 6, total: 12 } }))[0], ["Connector", "bad", "Switched off 3 min ago: the bots can't send anything"]);
  assert.deepEqual(rows(boardOf({ connector: { botsOn: true, connected: 0, total: 12, lastUsed: null } }))[0], ["Connector", "off", "On · no bot has connected yet"]);
  assert.deepEqual(rows(boardOf())[1], ["Site check", "off", "No check yet. The site checks itself three times a day"]);
  /* three times a day (09:35, 15:35, 21:35): the longest gap is 12 hours overnight */
  assert.equal(rows(boardOf({ report: { ...rep, at: iso(13 * 60) } }))[1][1], "ok", "13 hours: the overnight gap plus a slow run");
  assert.equal(rows(boardOf({ report: { ...rep, at: iso(15 * 60) } }))[1][1], "bad", "15 hours without one: a check didn't run");
  /* healthRows carries them only when the page asks with a board (older callers are unchanged) */
  assert.equal(L.healthRows({ sheet: null, ov: null }, NOW).length, 4);
  assert.deepEqual(L.healthRows({ sheet: null, ov: null, board: null }, NOW).slice(4).map((r) => r.label), ["Connector", "Site check"]);
  assert.equal(L.healthState(L.healthRows({ sheet: null, ov: null, board: boardOf({ connector: { botsOn: false, connected: 1, total: 2 } }) }, NOW)), "bad");
});

test("Money coming in: every currency as given, never added together, never converted", () => {
  assert.deepEqual(L.curList({ USD: 524.54, EUR: 112.01 }), ["EUR 112.01", "USD 524.54"]);
  assert.deepEqual(L.curList({}), [], "nothing logged is nothing, never 0"); assert.deepEqual(L.curList(null), []);
  assert.equal(L.payLine({ date: "2026-11-09", amount: 112.01, currency: "EUR", status: "pending" }), "Mon 9 Nov · EUR 112.01 · pending");
  assert.equal(L.payLine(null), "none logged yet");
  assert.deepEqual(["daily", "monthly", "quarterly", "irregular", "weird"].map(L.cadenceWord), ["Every day", "Every month", "Every 3 months", "Irregular", "Irregular"]);
});

test("Money coming in: accounts and sources in plain words; red only for never / overdue / blocked", () => {
  const acc = (o) => L.accountLine({ name: "Wise", ...o }, TODAY);
  assert.deepEqual(acc({ verdict: "ok", checked: { day: TODAY, by: "Ledger", new: 0 }, lastLook: TODAY }), { text: "checked today by Ledger · 0 new", attn: false });
  assert.deepEqual(acc({ verdict: "ok", checked: null, lastLook: TODAY }), { text: "a payment was logged today", attn: false });
  assert.deepEqual(acc({ verdict: "due", lastLook: "2026-11-10" }), { text: "not checked today · last look Tue 10 Nov", attn: false });
  assert.deepEqual(acc({ verdict: "overdue", lastLook: "2026-11-07" }), { text: "not checked since Sat 7 Nov", attn: true });
  assert.deepEqual(acc({ verdict: "never" }), { text: "never checked through the connector", attn: true });
  assert.deepEqual(acc({ verdict: "blocked", blocker: "Not connected yet" }), { text: "blocked: Not connected yet", attn: true });
  assert.deepEqual(acc({ verdict: "not_tracked" }), { text: "nobody is checking this yet", attn: false });
  const src = (verdict, o = {}) => L.sourceState({ verdict, ...o });
  assert.deepEqual(src("ok"), { text: "Up to date", attn: false });
  assert.deepEqual(src("overdue"), { text: "Overdue", attn: true });
  assert.deepEqual(src("never"), { text: "Nothing logged yet", attn: false });
  assert.deepEqual(src("quiet"), { text: "Nothing yet (irregular)", attn: false });
  assert.deepEqual(src("blocked", { blocker: "No login" }), { text: "Blocked: No login", attn: true });
  assert.deepEqual(src("not_tracked"), { text: "Nobody is logging this yet", attn: false });
});

test("Money coming in: what to look at, a new payer in our own words, and the empty state", () => {
  assert.deepEqual(L.incomeProblems({ problems: ["Bank: blocked. Not connected yet", "New payer(s) not on the list of sources: Acme Music, Beta Songs"], unknown: ["Acme Music", "Beta Songs"] }),
    ["Bank: blocked. Not connected yet", "New payers not on the list: Acme Music, Beta Songs"]);
  assert.deepEqual(L.incomeProblems({ problems: [], unknown: ["Acme Music"] }), ["New payer not on the list: Acme Music"]);
  assert.deepEqual(L.incomeProblems(null), []);
  assert.equal(L.incomeEmpty(boardOf().income), true); assert.equal(L.incomeEmpty(null), true);
  assert.equal(L.incomeEmpty({ count: 0, sources: [{ id: "x" }], entries: [] }), false);
  assert.equal(L.incomeEmpty({ count: 0, sources: [], entries: [{ date: "2026-10-02" }] }), false, "last month's payment still shows");
});

test("the server's made-up board goes through every rule without a hitch", () => {
  const b = sampleBoard(NOW);
  const staff = L.sortWorkers(b.staff.map((w) => L.workerView(w, null, b.today)));
  assert.equal(staff.length, b.staff.length, "every bot gets a card, with or without a duty");
  for (const w of staff) { assert.ok(L.workerLabel(w.state)); assert.match(L.slug(w.name), /^[a-z0-9]+$/); assert.equal(typeof L.workerCounts(w), "string"); assert.match(L.seenLine(w, NOW), /connector/); assert.match(L.novaMessage(w), /^Nova, please look at /); }
  assert.match(L.connectorLine(b, NOW).head, /^Bots' connector: (on|off)$/);
  assert.match(L.siteCheckLine(b.report, b.today), /^Site check \d\d:\d\d: /);
  if (b.waiting.luke.length) assert.match(L.staffAttention(b)[0].text, new RegExp("^" + b.waiting.luke.length + " messages? (is|are) waiting on you$"));
  assert.deepEqual(L.staffHealth(b, "", NOW).map((r) => r.label), ["Connector", "Site check"]);
  for (const r of L.staffHealth(b, "", NOW)) assert.notEqual(r.state, "bad", r.text);
  for (const th of b.messages) { assert.equal(L.threadRoot(b, th), th.id); for (const r of th.replies) assert.equal(L.threadRoot(b, r), th.id); }
  for (const a of b.income.accounts) assert.ok(L.accountLine(a, b.today).text);
  for (const s of b.income.sources) assert.ok(L.sourceState(s).text !== "Not read", s.verdict);
  assert.equal(L.composeNames(b.names).length, b.staff.length + 2, "every bot, Claude and Everyone");
});

test("the page: Messages is the tenth tab, the new script is kept offline, and nothing pops a browser dialog", () => {
  const page = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../js/hq-shell.js", import.meta.url), "utf8");
  const staff = readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../hq-sw.js", import.meta.url), "utf8");
  assert.match(page, /<section class="card view" id="messages">/);
  assert.match(page, /<script src="js\/hq-staff\.js" defer><\/script>/);
  assert.ok(page.indexOf('js/hq.js"') < page.indexOf('js/hq-staff.js"') && page.indexOf('js/hq-staff.js"') < page.indexOf('js/hq-shell.js"'), "after hq.js (it uses window.HQ), before the shell routes");
  assert.equal(page.split('href="#messages" data-tab="messages"').length - 1, 2, "in the rail and in the More sheet");
  assert.ok(page.indexOf('href="#team"') < page.indexOf('href="#messages"'), "after the nine");
  assert.match(shell, /TABS = \["today", "songs", "ads", "pages", "growth", "fans", "releases", "money", "team", "messages"\]/);
  assert.match(shell, /MORE = \[[^\]]*"messages"\]/);
  assert.doesNotMatch(shell, /scrollBy\(/, "the deep link is one plain jump");
  assert.doesNotMatch(page, /scroll-behavior:\s*smooth/);
  assert.match(sw, /var CACHE = "bs-hq-v4"/); assert.match(sw, /"\/js\/hq-cmd\.js"/); assert.match(sw, /"\/js\/hq-staff\.js"/); assert.match(sw, /"\/js\/hq-app\.js"/);
  for (const [name, src] of [["hq-staff.js", staff], ["hq.js", readFileSync(new URL("../js/hq.js", import.meta.url), "utf8")]]) assert.doesNotMatch(src, /\b(confirm|alert|prompt)\s*\(/, name + ": questions are asked on the page, never in a browser dialog");
  assert.doesNotMatch(staff, /innerHTML\s*=\s*[^;]*\b(m|th|r|w|e|s|a)\.(text|message|payer|note|name|task|blocker)\b(?![^;]*esc\()/, "board text is escaped");
  /* Luke's words: the visible text of the new parts never says MCP, token, endpoint or API */
  const visible = (page.slice(page.indexOf('id="team"'), page.indexOf("</main>")) + staff.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"\/api\/staff\/[^"]*"/g, "")).replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(visible, /\b(MCP|tokens?|endpoints?|API)\b/);
});

/* ================= Replies that visibly land + the release pipeline on /hq (11 Nov 2026) ================= */
const isoAt = (sp) => new Date(Date.parse(sp.replace(" ", "T") + ":00-03:00")).toISOString(); /* "YYYY-MM-DD HH:MM" São Paulo -> ISO */

test("replies: where it went and when, in one line; Claude's rounds are said", () => {
  assert.equal(L.spStampOf(isoAt("2026-11-11 17:03")), "2026-11-11 17:03");
  assert.equal(L.spStampOf(null), "");
  const at = Date.parse(isoAt("2026-11-11 17:03"));
  assert.equal(L.sentLine("reply", "Nova", at), "Sent to Nova at 17:03.");
  assert.equal(L.sentLine("message", "all", at), "Sent to everyone at 17:03.");
  assert.equal(L.sentLine("option", "Atlas", at, "Yes"), "Your answer “Yes” went to Atlas at 17:03.");
  assert.equal(L.sentLine("done", "Kevin", at), "Marked as done at 17:03. Kevin sees it on the desk.");
  assert.equal(L.sentLine("reply", "Claude", at), "Sent to Claude at 17:03. Claude reads the desk at 09:40, 15:40 and 21:40.");
});

test("replies: 'Read by Nova 17:10' / 'Not read yet' / 'Read by 7 of 12', and nothing when nobody can read it", () => {
  /* v2 (11 Nov 2026): READ, from the read markers (the tools that hand a bot its messages), not "used the desk" */
  assert.deepEqual(L.seenWords({ to: "Nova", seen: true, seenAt: isoAt("2026-11-11 17:10") }, TODAY), { seen: true, text: "Read by Nova 17:10", note: "" });
  assert.deepEqual(L.seenWords({ to: "Nova", seen: true, seenAt: isoAt("2026-11-10 08:05") }, TODAY), { seen: true, text: "Read by Nova Tue 10 Nov, 08:05", note: "" });
  assert.deepEqual(L.seenWords({ to: "Drop", seen: false, seenAt: null }, TODAY), { seen: false, text: "Not read yet", note: "" });
  assert.equal(L.seenWords({ to: "Claude", seen: false }, TODAY).note, "Claude reads the desk at 09:40, 15:40 and 21:40.");
  assert.deepEqual(L.seenWords({ to: "all", seen: null, read: { by: 7, of: 12, names: [] } }, TODAY), { seen: true, text: "Read by 7 of 12", note: "" });
  assert.deepEqual(L.seenWords({ to: "all", seen: null, read: { by: 0, of: 11, names: [] } }, TODAY), { seen: false, text: "Not read yet", note: "" });
  for (const to of ["all", "Luke", "HQ"]) assert.equal(L.seenWords({ to, seen: null }, TODAY), null, to);
  assert.equal(L.seenWords(null, TODAY), null);
  /* the made-up board: Claude's note to everyone reads "Read by 6 of 12" */
  const b = sampleBoard(NOW), note = b.messages.find((m) => m.to === "all" && m.from === "Claude");
  assert.equal(L.seenWords(note, b.today).text, "Read by 6 of 12");
  /* nowhere on the page says "Seen by" any more */
  const staff = readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const lib = readFileSync(new URL("../js/hq-lib.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(staff + lib, /Seen by/);
});

test("replies: 'You answered' from the board, and a reply deep in a thread is never called 'Marked as done'", () => {
  const b = sampleBoard(NOW), list = L.answeredList(b);
  assert.equal(list.length, b.answered.length);
  for (const a of list) { assert.ok(a.who && a.asked && a.say && a.seen, JSON.stringify(a)); assert.match(a.seen.text, /^(Read by \w+ |Not read yet)/); assert.match(a.status, /^Sent \d\d:\d\d · (Read by \w+ \d\d:\d\d|Not read yet)$/); }
  /* the made-up board: Luke's answer to Atlas is read, his reply to Drop is not */
  assert.match(list.find((a) => a.who === "Atlas").status, /^Sent \d\d:\d\d · Read by Atlas \d\d:\d\d$/);
  assert.match(list.find((a) => a.who === "Drop").status, /^Sent \d\d:\d\d · Not read yet$/);
  const reply = list.find((a) => a.kind === "reply"), settled = list.find((a) => a.kind === "settled");
  assert.match(reply.say, /^You: /); assert.match(settled.say, /^You answered: /);
  /* a bot's question that was itself an answer in a thread: the desk files Luke's reply under the thread's
     first message and closes the question with a plain "answered" */
  const root = msg("m1", "Luke", "Drop", "none", { at: isoAt("2026-11-11 08:00"), sp: "2026-11-11 08:00" });
  const q = msg("m2", "Drop", "Luke", "action", { at: isoAt("2026-11-11 09:00"), sp: "2026-11-11 09:00", re: "m1" });
  const lukes = msg("m3", "Luke", "Drop", "none", { at: isoAt("2026-11-11 09:30"), sp: "2026-11-11 09:30", re: "m1", text: "It's in the folder." });
  root.replies = [q, lukes];
  const board = boardOf({ messages: [root], answered: [{ id: "m2", from: "Drop", to: "Luke", text: q.text, needs: "action", at: q.at, sp: q.sp,
    reply: { by: "Luke", kind: "settled", text: "Marked as done", at: new Date(Date.parse(lukes.at) + 900).toISOString(), sp: "2026-11-11 09:30", seen: false, seenAt: null } }] });
  const a = L.answeredList(board)[0];
  assert.deepEqual([a.kind, a.you, a.say, a.asked, a.when], ["reply", "It's in the folder.", "You: It's in the folder.", "asked you to do something", "09:30"]);
  board.answered[0].reply.at = new Date(Date.parse(lukes.at) + 10 * min).toISOString(); /* marked as done much later: that's what it was */
  assert.equal(L.answeredList(board)[0].say, "You marked it as done.");
  assert.deepEqual(L.answeredList(boardOf()), []);
});

test("releases: the date line under the field, with a quiet note when it isn't a Friday or is close", () => {
  assert.deepEqual(L.releaseDayNote("2026-12-11", TODAY), { line: "Fri 11 Dec, 30 days away", notes: [], bad: false, out: false });
  const close = L.releaseDayNote("2026-11-24", TODAY);
  assert.equal(close.line, "Tue 24 Nov, 13 days away");
  assert.deepEqual(close.notes.map((n) => n.split(".")[0].split(":")[0]), ["Not a Friday", "Fewer than 21 days away"]);
  assert.equal(L.releaseDayNote("2026-11-12", TODAY).line, "Thu 12 Nov, tomorrow");
  assert.equal(L.releaseDayNote(TODAY, TODAY).line, "Wed 11 Nov, today");
  /* v2: a day that has passed is a song already out (recorded for its deal); "Change the date" still refuses it */
  assert.deepEqual(L.releaseDayNote("2026-11-09", TODAY), { line: "Mon 9 Nov, 2 days ago", notes: ["Already out: it is recorded for whose song it is, with no steps and no message to the team."], bad: false, out: true });
  assert.deepEqual(L.releaseDayNote("2026-11-09", TODAY, { move: true }), { line: "Mon 9 Nov, 2 days ago", notes: ["That day has passed. Pick today or a later day."], bad: true, out: false });
  assert.deepEqual(L.releaseDayNote("", TODAY), { line: "", notes: [], bad: false, out: false });
  /* a draft's line (In the pipeline) */
  assert.equal(L.releaseWhen("2026-12-11", TODAY, true), "Fri 11 Dec · 30 days to go · not sent yet");
  assert.equal(L.releaseWhen("2026-10-30", TODAY, true), "Fri 30 Oct · already out, not recorded yet");
  assert.equal(L.releaseWhen(TODAY, TODAY, true), "Wed 11 Nov · today · not sent yet");
  assert.equal(L.releaseWhen("2026-11-24", TODAY), "Tue 24 Nov · 13 days to go");
  assert.equal(L.releaseWhen("2026-11-12", TODAY), "Thu 12 Nov · 1 day to go");
  assert.equal(L.releaseWhen(TODAY, TODAY), "Wed 11 Nov · Release day");
  assert.equal(L.releaseWhen("2026-10-30", TODAY), "Fri 30 Oct · Released 12 days ago");
  assert.equal(L.releaseWhen(null, TODAY), "No release day yet");
});

test("releases: a step's state in words; red only for late and blocked", () => {
  const st = (o) => L.stepState({ key: "x", label: "X", owner: "Drop", status: "todo", note: "", at: null, by: null, ...o }, TODAY);
  assert.deepEqual(st({ status: "done", due: "2026-11-10", at: isoAt("2026-11-12 10:00"), by: "Drop" }), { text: "done 12 Nov by Drop", bad: false, done: true });
  assert.deepEqual(st({ status: "done", due: "2026-11-10" }), { text: "done", bad: false, done: true });
  assert.deepEqual(st({ due: "2026-11-09" }), { text: "late by 2 days", bad: true, done: false });
  assert.deepEqual(st({ status: "blocked", due: "2026-11-20", note: "Needs the cover" }), { text: "blocked: Needs the cover", bad: true, done: false });
  assert.deepEqual(st({ due: TODAY }), { text: "due today", bad: false, done: false });
  assert.deepEqual(st({ due: "2026-11-12" }), { text: "due tomorrow", bad: false, done: false });
  assert.deepEqual(st({ due: "2026-11-16", status: "working" }), { text: "working · due in 5 days", bad: false, done: false });
  assert.equal(L.stepState({ status: "todo", due: "2026-11-10", dueIn: -1 }, "").text, "late by 1 day", "a bot's list carries dueIn: no today needed");
  assert.equal(st({ due: null }).text, "no date yet");
});

test("releases: what's missing, the card's pill, and the same sentence the desk refuses with", async () => {
  const b = sampleBoard(NOW), v = (id) => b.releases.find((r) => r.id === id);
  const mdsb = L.packLine(v("medaseubody"), b.today);
  assert.match(mdsb.filled, /^\d+ of 17 filled$/);
  assert.equal(mdsb.items[0].text, "Lyrics (needed for the lyrics, Sat 14 Nov)");
  assert.equal(mdsb.attn, true, "the lyrics are needed within 3 days");
  assert.deepEqual(mdsb.items.map((x) => x.text.split(" ")[0] + ":" + x.attn), ["Lyrics:true", "The:false"], "lyrics soon; the pitch WAITS for Spotify for Artists (v2), so its field is neither dated nor red; the video link is Laura's to fill, never missing");
  assert.equal(mdsb.items[1].text, "The song in two lines (needed for the Spotify pitch)");
  const draft = L.packLine(v("survivors"), b.today);
  assert.equal(draft.attn, false, "a draft is not late"); assert.equal(draft.items.length, 4); assert.ok(draft.more > 0);
  assert.equal(L.packLine(v("touchme"), b.today).text, v("touchme").packFilled + " of 17 filled");
  assert.equal(L.missingWords({ short: "Copyright line", step: "Uploaded to RouteNote with the release date", due: "2026-11-20" }), "Copyright line (needed for the RouteNote upload, Fri 20 Nov)");
  assert.equal(L.missingWords({ short: "Artwork", step: "" }), "Artwork");
  assert.deepEqual(L.relPill(v("medaseubody"), b.today), { text: "1 blocked", bad: true, rel: false });
  assert.deepEqual(L.relPill(v("survivors"), b.today), { text: "Draft", bad: false, rel: false });
  assert.deepEqual(L.relPill(v("touchme"), b.today), { text: "Released", bad: false, rel: true });
  assert.deepEqual(L.relPill({ ...v("medaseubody"), counts: { done: 1, total: 9, late: 2, blocked: 0 } }, b.today), { text: "2 late", bad: true, rel: false });
  assert.deepEqual(L.relPill({ ...v("medaseubody"), counts: { done: 1, total: 9, late: 0, blocked: 0 } }, b.today), { text: "On time", bad: false, rel: false });
  assert.equal(L.relPill({ ...v("survivors"), status: "cancelled" }, b.today).text, "Cancelled");
  /* the page's sentence is the desk's own */
  const d = memoryDesk(), now = Date.parse("2026-11-12T12:20:00Z");
  const r = await S.saveRelease(d, now, S.DEFAULT_ROSTER, { by: "Luke", title: "Survivors", pack: { wav: "https://example.com/m.wav", genre: "Dance" } });
  const view = S.releaseView(r, "2026-11-12");
  await assert.rejects(S.sendRelease(d, now, S.DEFAULT_ROSTER, { by: "Luke", id: r.id }), (e) => e.message.startsWith(L.missingSentence(view.missing.filter((m) => m.required)))); /* the desk adds "Or send anyway: …" (11 Nov 2026, v2) */
  assert.equal(L.missingSentence([{ key: "artwork", short: "Artwork", required: true }]), "Still missing: Artwork. Fill it in, then send again.");
  assert.equal(L.missingSentence([{ key: "lyrics", short: "Lyrics", required: false }]), "");
});

test("releases: the form sends only what changed, so a field the team filled meanwhile is never overwritten", () => {
  const fields = sampleBoard(NOW).packFields;
  const before = { wav: "https://example.com/a.wav", genre: "Dance", isrc: "XX0000000000" };
  const typed = { wav: "https://example.com/a.wav", genre: " House ", isrc: "XX0000000000", language: "Portuguese", mood: "", lyrics: "" };
  assert.deepEqual(L.packChanges(fields, before, typed), { genre: "House", language: "Portuguese" });
  assert.deepEqual(L.packChanges(fields, before, { ...typed, wav: "" }), { genre: "House", language: "Portuguese", wav: "" }, "emptying a field clears it");
  assert.deepEqual(L.packChanges(fields, {}, { title: "not a field", wav: "" }), {}, "unknown keys and empty new fields are left out");
  assert.equal(L.fillWho({ fill: ["Drop"] }), "Drop fills this");
  assert.equal(L.fillWho({ fill: ["Atlas", "Webmaster"] }), "Atlas or Webmaster fills this");
  assert.equal(L.fillWho({ fill: [] }), "You fill this");
  const g = L.formGroups(fields);
  assert.deepEqual(g.map((x) => x.title), ["Whose release is it", "The files", "For the stores", "Lyrics", "For the pitch (can wait)", "Later, the team fills these", "Notes"]);
  assert.equal(g.reduce((n, x) => n + x.fields.length, 0), fields.length, "every field of the desk is on the form, once");
  assert.deepEqual(g[0].fields.map((f) => f.key), ["kind", "label", "split", "distributor", "deal"], "whose release it is comes first (v2)");
  assert.deepEqual(g[1].fields.map((f) => f.key), ["wav", "artwork", "folder"]);
  assert.deepEqual(L.formGroups([{ key: "bpm", group: "new-group" }])[0].title, "Notes", "a field in a group the page doesn't know still shows");
});

test("releases: one card per song (the desk's first), the sheet's own rows only when the desk doesn't have them", () => {
  const b = sampleBoard(NOW);
  const sheet = { releases: [{ song: "ME DA SEU BODY", date: "2026-11-24", desk: false, steps: [] }, { song: "Old Song", date: "2026-12-04", steps: [] }, { song: "Survivors", desk: true, steps: [] }] };
  const l = L.releaseLists(b, sheet);
  /* v2: In the pipeline (drafts) and Upcoming (sent, not out yet) are two lists; out songs leave Upcoming */
  assert.deepEqual(l.pipeline.map((v) => v.id), ["survivors"], "drafts: In the pipeline");
  assert.deepEqual(l.coming.map((v) => v.id), ["medaseubody", "slowburn"], "sent and not out yet, soonest first");
  assert.deepEqual(l.sheetOnly.map((r) => r.song), ["Old Song"], "accents and case don't make a second card; merged desk rows aren't drawn twice");
  assert.deepEqual(l.out.map((v) => v.id), ["touchme"]);
  assert.deepEqual(l.openOut, [], "Touch Me has every step done: no card, only the line");
  assert.deepEqual(l.cancelled, []);
  const gone = L.releaseLists(b, { releases: [{ song: "Older Song", date: "2026-10-02", daysToGo: -40, steps: [] }, { song: "Today Song", date: TODAY, daysToGo: 0, steps: [] }, { song: "Later Song", date: "2026-12-04", daysToGo: 23, steps: [] }] });
  assert.deepEqual(gone.sheetOnly.map((r) => r.song), ["Later Song"]); assert.deepEqual(gone.sheetOut.map((r) => r.song), ["Older Song", "Today Song"], "the sheet's own songs leave Upcoming on their day too");
  const open = L.releaseLists({ releases: [{ ...b.releases.find((v) => v.id === "medaseubody"), released: true, daysToGo: -2 }] }, null);
  assert.deepEqual(open.openOut.map((v) => v.id), ["medaseubody"], "out with a step still open: its card stays");
  assert.deepEqual(L.releaseLists({ releases: [{ ...open.openOut[0], daysToGo: -20 }] }, null).openOut, [], "not after 14 days");
  const withCancelled = L.releaseLists({ releases: [{ ...b.releases[0], status: "cancelled" }] }, { releases: [{ song: "Me Dá Seu Body", steps: [] }] });
  assert.equal(withCancelled.cancelled.length, 1); assert.equal(withCancelled.sheetOnly.length, 1, "a cancelled desk release doesn't hide the sheet's row");
  assert.deepEqual(L.releaseLists(null, null), { pipeline: [], coming: [], sheetOnly: [], out: [], sheetOut: [], openOut: [], cancelled: [] });
  /* 15 = the Spotify for Artists step (v2) */
  assert.equal(L.stepsSummary(b.releaseSteps), "Counting back from release day: 21 days RouteNote upload, 16 RouteNote approval, 15 Spotify for Artists, 14 Spotify pitch, 10 lyrics, 7 song page and video, 3 teaser clips, 1 ad drafts.");
  assert.equal(L.stepsSummary([]), "");
  assert.equal(L.sendQuestion("Survivors", "2026-12-11"), "Send Survivors to the team for Fri 11 Dec? Every bot gets its steps and dates.");
  assert.match(L.moveQuestion("Survivors", "2026-12-11", "2026-12-18"), /^Move Survivors from Fri 11 Dec to Fri 18 Dec\? Every step that isn't done moves with it, and the team is told\.$/);
  assert.match(L.cancelQuestion({ title: "X", status: "draft" }), /Nobody was told/);
  assert.match(L.cancelQuestion({ title: "X", status: "scheduled" }), /The team is told to stop/);
  /* the pipeline's own labels have short words for Today's sentences */
  assert.equal(L.shortStep("Approved by RouteNote (nothing waiting)"), "RouteNote approval");
  assert.equal(L.shortStep("Something new"), "something new");
});

test("Team: a late or blocked release step is in Nova's message", () => {
  const w = sampleBoard(NOW).staff.find((x) => x.name === "Drop");
  assert.match(L.novaMessage(w), /\nRelease step: Me Dá Seu Body: Approved by RouteNote \(nothing waiting\) \(blocked: RouteNote wants/);
  assert.doesNotMatch(L.novaMessage(worker("A", "late")), /Release step/);
});

test("the page: the Releases tab, its form and 'You answered' are there; no developer words", () => {
  const page = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  const staff = readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8");
  for (const id of ["relNew", "relForm", "relPipe", "relDesk", "relList", "relOut", "relSpot", "releases-spotify", "relSample", "answeredCard", "answeredList"]) assert.match(page, new RegExp('id="' + id + '"'), id);
  for (const path of ['"release"', '"release/send"', '"release/date"', '"release/cancel"', '"release/step"', '"sighting"']) assert.ok(staff.includes("write(" + path), path);
  const code = staff.replace(/\/\*[\s\S]*?\*\//g, "");
  const words = code.replace(/"\/api\/staff\/[^"]*"/g, "");
  assert.doesNotMatch(words, /\b(MCP|tokens?|endpoints?|API)\b/, "plain words on Luke's page");
  assert.doesNotMatch(words, /pack fields/i);
  assert.doesNotMatch(code, /setTimeout\(function \(\) \{ \$\("msgOk"\)/, "'Sent to …' stays until the next message is started");
  /* every write is off in the sample */
  assert.match(code, /function write\(path, body\) \{\s*if \(HQ\.sample\) return Promise\.resolve\(\{ ok: false/);
});

/* ---------- fixes after review (11 Nov 2026) ---------- */
test("replies: a thread's Reply answers the question in it that waits on Luke, not the first message", () => {
  const root = msg("m1", "Luke", "Nova", "action", { at: iso(60), text: "Upload Night Drive" });
  const q = msg("m2", "Nova", "Luke", "reply", { at: iso(30), re: "m1", text: "Which cover, v1 or v2?" });
  const done = msg("m0", "Nova", "Luke", "reply", { at: iso(40), re: "m1", resolved: { by: "Luke", at: iso(35), note: "answered" } });
  assert.equal(L.answerTarget({ ...root, replies: [done, q] }).id, "m2", "the newest open question to Luke from the one he is answering");
  assert.equal(L.answerTarget({ ...root, replies: [done] }).id, "m1", "nothing waits on Luke: the thread's first message");
  assert.equal(L.answerTarget({ ...root, replies: [msg("m3", "Claude", "Luke", "reply", { re: "m1" })] }).id, "m1", "someone else's question is not answered by a reply to Nova");
  const top = msg("m5", "Nova", "Luke", "action", { at: iso(90), text: "Please fill the lyrics" });
  const deep = msg("m6", "Nova", "Luke", "decision", { at: iso(20), re: "m5", options: ["Teaser A", "Teaser B"] });
  assert.equal(L.answerTarget({ ...top, replies: [deep] }).id, "m6", "the newest of two open ones");
  assert.equal(L.answerTarget({ ...msg("m7", "Luke", "all", "none"), replies: [msg("m8", "Atlas", "Luke", "reply", { re: "m7" })] }).id, "m8", "a note to everyone: any bot's question in it");
  assert.equal(L.answerTarget(null), null);
  /* the page files the answer under the message itself and never closes a second one by hand */
  const staff = readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(staff, /re: m\.id/);
  assert.doesNotMatch(staff, /re: L\.threadRoot/);
  assert.doesNotMatch(staff, /write\("resolve", \{ id: m\.id, note/, "no second write that can fail without a word");
});

test("releases: every step of a release that went out keeps its button, also after release day", () => {
  const v = (o) => ({ id: "x", status: "scheduled", released: false, ...o });
  assert.deepEqual(L.stepButton(v({ released: true }), { owner: "Luke", status: "todo" }), { to: "done", text: "Mark as done", main: true }, "released, and Luke's teasers step still open: he can still finish it");
  assert.deepEqual(L.stepButton(v({ released: true }), { owner: "Webmaster", status: "todo" }), { to: "done", text: "Mark done", main: false });
  assert.deepEqual(L.stepButton(v(), { owner: "Drop", status: "done" }), { to: "todo", text: "Reopen", main: false });
  assert.equal(L.stepButton(v({ status: "draft" }), { owner: "Drop", status: "todo" }), null);
  assert.equal(L.stepButton(v({ status: "cancelled" }), { owner: "Drop", status: "todo" }), null);
});

test("releases: what Luke typed is kept per release, so another form never wipes it", () => {
  assert.equal(L.formKey(""), "bs_hq_last_relform:new");
  assert.equal(L.formKey("survivors"), "bs_hq_last_relform:survivors");
  assert.notEqual(L.formKey(""), L.formKey("survivors"));
  assert.match(L.formKey("x"), /^bs_hq_last_/, "logout still clears it");
  const staff = readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8");
  assert.doesNotMatch(staff, /localStorage\.(setItem|getItem|removeItem)\(FORM_KEY/);
});

/* ================= Release pipeline v2 on the page (11 Nov 2026, evening) =================
   Upcoming, whose song it is, warnings, In Spotify for Artists, "read". The labels, splits and titles are made up. */
test("v2: whose song it is, in one line, for the cards and Songs", () => {
  assert.deepEqual(L.dealWords({ kind: "Self-release", label: "", split: "", distributor: "RouteNote (badscandaladmin)", id: "x" }), { text: "Self-release", known: true, id: "x" });
  assert.equal(L.dealWords({ kind: "With a label", label: "Sample Records", split: "BADSCANDAL 50% · Sample Records 50%", id: "tm" }).text, "With Sample Records · BADSCANDAL 50% · Sample Records 50%");
  assert.equal(L.dealWords({ kind: "With a label", label: "Sample Records", split: "" }).text, "With Sample Records · split not recorded yet");
  assert.deepEqual(L.dealWords(null), { text: "Not recorded yet: self-release or label?", known: false, id: "" });
  assert.deepEqual(L.dealWords({ kind: "", id: "oldone" }), { text: "Not recorded yet: self-release or label?", known: false, id: "oldone" }, "a desk record from before: its id opens it");
  const b = sampleBoard(NOW);
  assert.equal(L.songDeal("TOUCH ME", null, b).label, "Sample Records", "the board's own release, accents and case ignored");
  assert.equal(L.songDeal("Me Da Seu Body", { song: "Me Dá Seu Body", deal: null }, b).kind, "Self-release", "the board first: it is the freshest");
  assert.equal(L.songDeal("Night Song", { song: "Night Song", deal: null }, b), null, "the desk has no record of it");
  assert.equal(L.songDeal("Night Song", { song: "Night Song", deal: { kind: "Self-release" } }, null).kind, "Self-release", "no board: what /api/hq/data says");
  assert.equal(L.songDeal("Night Song", { song: "Night Song" }, null), undefined, "nothing read yet: nothing is claimed");
  assert.equal(L.songDeal("Night Song", null, { releases: [] }), null);
  assert.equal(L.songDeal("Survivors", null, { releases: [{ ...b.releases.find((v) => v.id === "survivors"), status: "cancelled" }] }), null, "a cancelled one is no record");
});

test("v2: the form follows the desk's rule: the label and the split only 'With a label'; a song already out needs only its deal", () => {
  const fields = sampleBoard(NOW).packFields, f = (k) => fields.find((x) => x.key === k), steps = sampleBoard(NOW).releaseSteps;
  const self = { kind: "Self-release" }, lab = { kind: "With a label" };
  assert.equal(L.fieldShown(f("label"), self), false); assert.equal(L.fieldShown(f("split"), {}), false);
  assert.equal(L.fieldShown(f("label"), lab), true); assert.equal(L.fieldShown(f("wav"), self), true); assert.equal(L.fieldShown(f("distributor"), self), true);
  assert.equal(L.fieldRequired(f("split"), lab), true); assert.equal(L.fieldRequired(f("split"), self), false);
  assert.equal(L.fieldRequired(f("copyright"), self), true, "the copyright line is needed to send a self-release (v2)");
  /* review, 11 Nov 2026: not for a label release the label delivers, and shown on the form whatever the kind */
  assert.equal(L.fieldRequired(f("copyright"), lab), false);
  assert.deepEqual([L.fieldShown(f("copyright"), lab), L.fieldShown(f("copyright"), {}), L.fieldShown(f("copyright"), self)], [true, true, true]);
  assert.equal(L.needWord(f("copyright"), lab, steps), "", "the label delivers it: nothing of ours needs it");
  assert.equal(L.needWord(f("copyright"), { kind: "With a label", distributor: "RouteNote" }, steps), "needed for the RouteNote upload", "we upload it ourselves");
  assert.equal(L.fieldShown({ key: "label", requiredWhen: { field: "kind", equals: "With a label" } }, self), false, "a field list from before showWhen: as before");
  assert.equal(L.fieldRequired(f("wav"), self, true), false, "already out: the files went to the stores long ago");
  assert.equal(L.fieldRequired(f("kind"), {}, true), true);
  assert.equal(L.needWord(f("wav"), self, steps), "needed to send");
  assert.equal(L.needWord(f("kind"), {}, steps, true), "needed to record it");
  assert.equal(L.needWord(f("lyrics"), self, steps), "needed for the lyrics");
  assert.equal(L.needWord(f("mood"), self, steps), "needed for the Spotify pitch");
  assert.equal(L.needWord(f("lyrics"), self, steps, true), "");
  assert.equal(L.needWord(f("distributor"), lab, steps), "");
  assert.equal(L.sendButton("2026-12-11", TODAY), "Send to the team"); assert.equal(L.sendButton("2026-10-30", TODAY), "Record it as already out");
  assert.equal(L.sendQuestion("Touch Me", "2026-10-30", TODAY), "Record Touch Me as already out (Fri 30 Oct)? There are no steps and nobody is told: it is kept so Songs shows whose song it is.");
  assert.equal(L.sendQuestion("Survivors", "2026-12-11", TODAY), "Send Survivors to the team for Fri 11 Dec? Every bot gets its steps and dates.");
});

test("v2: send anyway, and the note once it went", () => {
  const miss = [{ key: "artwork", short: "Artwork", required: true }, { key: "writers", short: "Writers", required: true }];
  assert.equal(L.missingSentence(miss, true), "Still missing: Artwork, Writers. Fill them in, then send again. Or send anyway: what is missing stays on the release as a warning.");
  assert.equal(L.missingSentence(miss.concat({ key: "date", short: "Release day", required: true }), true), "Still missing: Artwork, Writers, Release day. Fill them in, then send again.", "no release day: it can't be sent anyway");
  assert.equal(L.canSendAnyway(miss), true); assert.equal(L.canSendAnyway(["date"]), false);
  const fields = sampleBoard(NOW).packFields, at = Date.parse(isoAt("2026-11-11 17:03"));
  assert.equal(L.sentNote({ told: true, sentWithout: [] }, at, fields), "Sent to the team at 17:03. Every bot has its steps and dates. Everyone got a note on the board.");
  assert.equal(L.sentNote({ told: true, sentWithout: ["artwork", "writers"] }, at, fields), "Sent to the team at 17:03. Every bot has its steps and dates. Everyone got a note on the board. Sent without Artwork and Writers: they stay on the card as a warning until filled.");
  assert.equal(L.sentNote({ alreadyOut: true }, at, fields), "Recorded as already out at 17:03. Songs shows whose song it is; there are no steps and nobody was told.");
  /* the desk answers a refused send with the same words, plus "Or send anyway" */
  assert.match(L.missingSentence(miss, true), /Or send anyway: what is missing stays on the release as a warning\.$/);
});

test("v2: a step that is not ours, and the pitch that waits for Spotify for Artists, are never red", () => {
  const st = (o) => L.stepState({ key: "x", label: "X", owner: "Drop", status: "todo", note: "", ...o }, TODAY);
  assert.deepEqual(st({ status: "skipped", note: "The label delivers this one", due: "2026-11-01" }), { text: "not ours: the label delivers it", bad: false, done: false, skipped: true });
  assert.equal(st({ status: "skipped", note: "Already out when it was recorded" }).text, "already out when it was recorded");
  assert.equal(st({ status: "skipped", note: "No video for this one" }).text, "skipped: No video for this one");
  assert.deepEqual(st({ due: "2026-11-01", waiting: true, waitingText: "waiting: the song is not in Spotify for Artists yet" }), { text: "waiting: the song is not in Spotify for Artists yet", bad: false, done: false, waiting: true }, "waiting is never late");
  assert.equal(st({ status: "blocked", note: "No mood yet", waiting: true }).text, "blocked: No mood yet", "blocked says blocked");
  assert.equal(L.stepButton({ status: "scheduled" }, { owner: "Drop", status: "skipped" }), null, "not ours: no button");
  /* review, 11 Nov 2026: one tap must not record a pitch that could not have gone out */
  assert.equal(L.stepButton({ status: "scheduled" }, { owner: "Atlas", status: "todo", waiting: true }), null, "a waiting pitch has no Mark done");
  assert.deepEqual(L.stepButton({ status: "scheduled" }, { owner: "Atlas", status: "done", waiting: true }), { to: "todo", text: "Reopen", main: false }, "a pitch already done can still be reopened");
  assert.deepEqual(L.stepButton({ status: "scheduled" }, { owner: "Atlas", status: "blocked", waiting: false }), { to: "done", text: "Mark done", main: false });
  const b = sampleBoard(NOW), sb = b.releases.find((v) => v.id === "slowburn"), mdsb = b.releases.find((v) => v.id === "medaseubody");
  assert.deepEqual(sb.steps.filter((s) => L.stepState(s, b.today).skipped).map((s) => s.key), ["upload", "approved"], "the label delivers Slow Burn");
  assert.equal(L.stepState(mdsb.steps.find((s) => s.key === "pitch"), b.today).text, "waiting: the song is not in Spotify for Artists yet");
  assert.equal(L.shortStep("Showing as upcoming in Spotify for Artists"), "Spotify for Artists");
  /* the release panel (Today's "Next release") says the same */
  const d = L.releaseDetail({ song: "X", date: "2026-11-24", daysToGo: 13, steps: [{ label: "Spotify pitch sent", owner: "Atlas", due: "2026-11-10", done: false, late: false, waiting: true, waitingText: "waiting: not in Spotify for Artists yet" }, { label: "Uploaded", owner: "Drop", due: "2026-11-03", done: true, skipped: true, late: false, note: "The label delivers this one" }] }, TODAY);
  assert.deepEqual(d.missing.map((x) => x.when), ["waiting: not in Spotify for Artists yet"]); assert.deepEqual(d.done.map((x) => x.when), ["not ours"]);
  assert.equal(d.summary, "1 of 2 steps done · 1 to do");
});

test("v2: an Upcoming card: where it is at, its warnings counted in its pill", () => {
  const b = sampleBoard(NOW), v = (id) => b.releases.find((r) => r.id === id);
  const mdsb = v("medaseubody");
  assert.ok(mdsb.warnings.length >= 2, mdsb.warnings.join(" | "));
  assert.deepEqual(L.upcomingPill(mdsb, b.today), { text: mdsb.warnings.length + " warnings", bad: true, rel: false });
  assert.deepEqual(L.upcomingPill({ ...mdsb, warnings: ["Lyrics live is 2 days late (Verse)"] }, b.today), { text: "1 warning", bad: true, rel: false });
  assert.deepEqual(L.upcomingPill({ ...mdsb, warnings: [], counts: { done: 2, total: 10, late: 0, blocked: 0 } }, b.today), { text: "On time", bad: false, rel: false });
  assert.deepEqual(L.upcomingPill(v("survivors"), b.today), { text: "Draft", bad: false, rel: false });
  assert.equal(L.whereLine(mdsb), mdsb.where); assert.match(L.whereLine(mdsb), /^\d+ of \d+ steps done · next: /);
  assert.equal(L.whereLine({ status: "draft", packFilled: 2, packTotal: 17 }), "In the pipeline: 2 of 17 filled", "an older copy kept on this device");
  assert.equal(L.whereLine({ status: "scheduled", counts: { done: 4, total: 9 } }), "4 of 9 steps done");
  assert.equal(L.outLine([{ title: "Touch Me", date: "2026-10-30" }]), "Out: Touch Me (30 Oct).");
  assert.equal(L.outLine([{ title: "A", date: "2026-11-06" }, { title: "B", date: "" }]), "Out: A (6 Nov), B.");
  assert.equal(L.outLine([]), "");
  assert.match(L.outLine(Array.from({ length: 8 }, (_, i) => ({ title: "S" + i, date: "2026-10-01" }))), / and 2 more\.$/);
});

test("v2: Today's 'Needs attention' lists the release warnings (4 at most, then +N more) instead of the bare late steps", () => {
  const b = sampleBoard(NOW);
  const items = L.releaseAttention(null, b);
  const all = b.releases.filter((v) => v.status === "scheduled" && !v.alreadyOut && v.daysToGo >= -14).reduce((n, v) => n + v.warnings.length, 0);
  assert.ok(items.length >= 1 && items.length <= 5);
  assert.match(items[0].text, /^Me Dá Seu Body: /); assert.equal(items[0].href, "#releases/medaseubody");
  if (all > 4) assert.deepEqual(items[4], { key: "rw:more", text: "+" + (all - 4) + " more release warnings", href: "#releases" });
  const many = { releases: [{ id: "a", title: "A", status: "scheduled", daysToGo: 5, warnings: ["w1", "w2", "w3"] }, { id: "b", title: "B", status: "scheduled", daysToGo: 3, warnings: ["x1", "x2", "x3"] }, { id: "c", title: "C", status: "scheduled", alreadyOut: true, daysToGo: -40, warnings: ["never"] }, { id: "d", title: "D", status: "draft", warnings: ["never"] }] };
  assert.deepEqual(L.releaseAttention(null, many).map((x) => x.text), ["B: x1", "B: x2", "B: x3", "A: w1", "+2 more release warnings"], "soonest first; drafts and songs recorded after they came out say nothing");
  /* without the board: the sheet's merged desk rows */
  assert.deepEqual(L.releaseAttention({ releases: [{ song: "A", id: "a", desk: true, daysToGo: 5, warnings: ["w1"] }, { song: "Sheet", daysToGo: 3, steps: [] }] }, null).map((x) => x.text), ["A: w1"]);
  /* inside attention(): after the cap, and the desk's late step is not said a second time */
  const sheet = { money: { cap: { status: "ok" }, metaSource: null }, releases: [{ song: "A", id: "a", desk: true, daysToGo: 5, warnings: ["Lyrics live is 2 days late (Verse)"], steps: [{ label: "Lyrics live", owner: "Verse", due: "2026-11-09", late: true }] }], sheetErrors: {}, team: { team: [], duties: { byOwner: [] } } };
  const att = L.attention({ sheet, ov: null });
  assert.deepEqual(att.map((x) => x.text), ["A: Lyrics live is 2 days late (Verse)"]);
  /* a song in Spotify for Artists that didn't go through the pipeline */
  assert.deepEqual(L.staffAttention(boardOf({ sightings: { unknown: 1 } })), [{ key: "spotify", text: "Spotify for Artists shows 1 song that didn't go through the pipeline: say what it is", href: "#releases/spotify" }]);
  assert.match(L.staffAttention(boardOf({ sightings: { unknown: 2 } }))[0].text, /shows 2 songs .* say what they are$/);
  assert.ok(L.staffAttention(b).some((x) => x.key === "spotify"), "the sample's Velvet Night");
  /* review, 11 Nov 2026: the question only Luke can answer goes first, with the messages, not near the end */
  const order = L.attention({ sheet, ov: { metaKey: { state: "expired", text: "Meta key: expired" } }, board: boardOf({ sightings: { unknown: 1 }, connector: { botsOn: false } }) }).map((x) => x.key);
  assert.deepEqual(order.slice(0, 2), ["spotify", "rw:a:0"], order.join());
  assert.ok(order.indexOf("connector") > order.indexOf("key"), "the rest stays after the sheet's items");
});

test("v2: In Spotify for Artists: when Atlas looked, never, stale, the matched songs and the questions", () => {
  const now = Date.parse(isoAt("2026-11-11 17:00"));
  assert.equal(L.sightingsHead({ never: true }, now, TODAY).never, true);
  assert.match(L.sightingsHead(null, now, TODAY).text, /^Atlas hasn't reported what Spotify for Artists shows as upcoming yet\./);
  const fresh = { never: false, stale: false, at: isoAt("2026-11-11 14:00"), sp: "2026-11-11 14:00", by: "Atlas", items: [{}] };
  assert.deepEqual(L.sightingsHead(fresh, now, TODAY), { text: "Atlas looked at 14:00 (3 h ago).", attn: false, never: false, empty: "" });
  assert.equal(L.sightingsHead({ ...fresh, by: "Nova", at: isoAt("2026-11-10 21:00"), sp: "2026-11-10 21:00" }, now, TODAY).text, "Nova looked on Tue 10 Nov, 21:00 (20 h ago).");
  const stale = L.sightingsHead({ ...fresh, stale: true, at: isoAt("2026-11-08 09:12"), sp: "2026-11-08 09:12", items: [] }, now, TODAY);
  assert.deepEqual(stale, { text: "Atlas last looked on Sun 8 Nov, 09:12 (3 days ago). He should look every day, so this may be out of date.", attn: true, never: false, empty: "Nothing is upcoming there right now." });
  const b = sampleBoard(NOW), sv = b.sightings;
  const unknown = sv.items.find((x) => x.state === "unknown"), matched = sv.items.find((x) => x.state === "pipeline");
  assert.equal(unknown.title, "Velvet Night"); assert.equal(matched.title, "Slow Burn");
  const q = L.sightQuestion(unknown);
  assert.equal(q.title + q.rest, unknown.question, "the page's question is the desk's own");
  assert.deepEqual(L.sightRow(matched), { key: matched.key, title: "Slow Burn", when: matched.dateWords, shown: matched.shownAs, id: "slowburn", text: "In Upcoming" });
  assert.equal(L.sightRow({ ...matched, matchStatus: "draft" }).text, "In the pipeline");
  const ans = (a, told) => L.sightRow({ ...unknown, state: "answered", answer: { answer: a, text: sv.choices.find((c) => c.answer === a).text, label: "", day: "2026-11-11", told } }).text;
  assert.equal(ans("notmine", "m1"), "You said: Not mine, or on the wrong account, Wed 11 Nov. Nova was asked to find out.");
  assert.equal(ans("mistake", null), "You said: A mistake: it should not be there, Wed 11 Nov. The message to Nova couldn't go yet.");
  assert.deepEqual(sv.choices.map((c) => c.answer), ["self", "label", "notmine", "mistake"]);
  const x = { title: "Velvet Night", date: "2026-11-27", dateWords: "Fri 27 Nov" };
  assert.equal(L.sightConfirm(x, "self"), "Start a draft of Velvet Night (Fri 27 Nov) as a self-release? It goes to “In the pipeline”, where you fill in its files and details.");
  assert.equal(L.sightConfirm(x, "label", "Sample Label"), "Start a draft of Velvet Night (Fri 27 Nov) with Sample Label? It goes to “In the pipeline”, where you fill in the split, its files and details.");
  assert.match(L.sightConfirm(x, "notmine"), /^Tell Nova that Velvet Night is not yours, or is on the wrong account\? Nova finds out who delivered it/);
  assert.match(L.sightConfirm(x, "mistake"), /^Tell Nova that Velvet Night is a mistake and should not be there\?/);
  const at = Date.parse(isoAt("2026-11-11 17:03"));
  assert.equal(L.sightDone("Velvet Night", "label", false, at), "Answered at 17:03. Velvet Night is now in “In the pipeline”: fill in its files and details there.");
  assert.equal(L.sightDone("Velvet Night", "notmine", true, at), "Answered at 17:03. Nova was asked to find out who delivered Velvet Night.");
  assert.equal(L.sightDone("Velvet Night", "mistake", false, at), "Your answer is saved, but the message to Nova couldn't go. Press “Send it to Nova again”.");
  assert.equal(L.sightDone("Me Dá Seu Body (feat. Sample)", "it", false, at), "Answered at 17:03. Me Dá Seu Body (feat. Sample) counts as showing in Spotify for Artists now.");
  /* review, 11 Nov 2026: a message to Nova that couldn't go is offered again (state retry), never a dead end */
  const retry = L.sightRow({ ...unknown, state: "retry", answer: { answer: "mistake", text: "A mistake: it should not be there", label: "", day: "2026-11-11", told: null } });
  assert.deepEqual([retry.text, retry.retry], ["You said: A mistake: it should not be there, Wed 11 Nov. The message to Nova couldn't go.", "mistake"]);
  /* the fifth answer: a song in the pipeline under another title */
  const near = { title: "Me Dá Seu Body (feat. Sample)", date: "2026-11-24", dateWords: "Tue 24 Nov", near: { id: "medaseubody", title: "Me Dá Seu Body", dateWords: "Tue 24 Nov" } };
  assert.equal(L.sightConfirm(near, "it"), "Is Me Dá Seu Body (feat. Sample) the same song as Me Dá Seu Body (Tue 24 Nov)? Its step “Showing as upcoming in Spotify for Artists” is marked done, and Atlas can send the pitch.");
  assert.equal(L.sightRow({ ...matched, answer: { answer: "it", day: "2026-11-11" } }).text, "In Upcoming (you said it is this song, Wed 11 Nov)");
  const staffJs = readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8");
  assert.match(staffJs, /data-sp="resend"/); assert.match(staffJs, /"It is " \+ x\.near\.title/);
  /* titles with no Latin letter are not all one song on the page either */
  assert.notEqual(L.titleKey("Ночь"), L.titleKey("День")); assert.equal(L.titleKey(""), "");
  assert.equal(L.songDeal("Ночь", null, { releases: [{ id: "r1", title: "День", status: "scheduled", deal: { kind: "Self-release" } }] }), null);
});

test("v2: the sheet's own late pitch reads 'waiting' while Spotify for Artists doesn't show the song (Luke's Me Dá Seu Body case)", async () => {
  const { hqModel } = await import("../netlify/lib/hq.mjs");
  const { sampleSheets, sampleMeta } = await import("../netlify/lib/hq-sample.mjs");
  const sh = sampleSheets(TODAY);
  /* a CURRENT report that doesn't list it (review, 11 Nov 2026: no report at all means nobody looked) */
  const report = { at: new Date(NOW - 60 * min).toISOString(), sp: TODAY + " 09:00", by: "Atlas", list: [], answers: {} };
  const m = hqModel(sh, TODAY, {}, sampleMeta(sh, TODAY), "10:00", { updates: [], releases: [], sightings: report, now: NOW });
  const never = hqModel(sh, TODAY, {}, sampleMeta(sh, TODAY), "10:00", { updates: [], releases: [], sightings: null, now: NOW });
  assert.equal(never.releases.find((x) => x.song === "Me Dá Seu Body").steps.find((s) => s.label === "Spotify pitch sent").late, true, "no report yet: late is late");
  const r = m.releases.find((x) => x.song === "Me Dá Seu Body"), pitch = r.steps.find((s) => s.label === "Spotify pitch sent");
  assert.equal(pitch.waiting, true); assert.equal(pitch.late, false);
  assert.ok(!L.attention({ sheet: m, ov: null }).some((a) => /Spotify pitch/.test(a.text)), "not in Needs attention as late");
  assert.equal(L.releaseDetail(r, TODAY).missing.find((x) => x.label === "Spotify pitch sent").when, "waiting: not in Spotify for Artists yet");
});

test("v2: the page: the tab is called Upcoming (its address stays #releases), three parts, no developer words", () => {
  const page = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  const staff = readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8");
  const hq = readFileSync(new URL("../js/hq.js", import.meta.url), "utf8");
  /* review, 11 Nov 2026: "the Releases tab" is the SHEET's tab; Luke's HQ tab is Upcoming */
  assert.ok(hq.includes("The Releases tab in the sheet shows an error.") && !hq.includes("The Releases tab shows an error."));
  assert.equal(page.split('data-tab="releases"').length - 1, 2, "rail and More sheet");
  assert.equal((page.match(/data-tab="releases"[^]*?<span>([^<]+)<\/span>/g) || []).map((x) => x.match(/<span>([^<]+)<\/span>$/)[1]).join(","), "Upcoming,Upcoming");
  assert.match(page, /<section class="card view" id="releases"><h2>Upcoming<\/h2>/);
  const sec = page.slice(page.indexOf('id="releases"'), page.indexOf('id="money"'));
  const order = ["In the pipeline", 'relh">Upcoming<', "In Spotify for Artists"].map((t) => sec.indexOf(t));
  assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), "In the pipeline, Upcoming, In Spotify for Artists: " + order);
  assert.match(sec, />New song</);
  /* the words Luke reads: the section's own text, and every quoted string in the page's scripts */
  const strings = [staff, readFileSync(new URL("../js/hq-lib.js", import.meta.url), "utf8")].map((src) => (src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"\/api\/staff\/[^"]*"/g, "").replace(/write\("[^"]*"/g, "")
    .match(/"[^"\n]*"|'[^'\n]*'/g) || []).join("\n")).join("\n");
  assert.doesNotMatch(sec.replace(/<[^>]+>/g, " "), /\b(MCP|tokens?|endpoints?|API|sightings?|pack)\b/i);
  assert.doesNotMatch(strings, /\b(MCP|tokens?|endpoints?|API|sightings?|Seen by)\b/);
  assert.doesNotMatch(strings, /\bpack\b/i, "never 'pack' on the page: 'files and details'");
  assert.match(hq, /data-adddeal/); assert.match(staff, /addDetails: addDetails/);
  /* every write is still off in the sample (the answers to Spotify for Artists too) */
  assert.match(staff.replace(/\/\*[\s\S]*?\*\//g, ""), /function write\(path, body\) \{\s*if \(HQ\.sample\) return Promise\.resolve\(\{ ok: false/);
});

/* ================= Revolut on /hq (the bank reader's page, 11 Nov 2026) ================= */
const BNOW = Date.parse("2026-11-12T13:00:00Z"); /* 10:00 in São Paulo */
const bst = (over = {}) => ({ configured: true, connected: true, needsApproval: false, aspsp: "Revolut", validUntil: "2027-02-07T21:50:00.000Z", daysLeft: 86, expiring: false,
  accounts: [{ name: "Current", currency: "EUR" }, { name: "Savings", currency: "EUR" }], lastRunAt: "2026-11-12T09:50:00.000Z", lastOkAt: "2026-11-12T09:50:00.000Z",
  lastError: null, lastAdded: 2, partial: false, canConnectHere: true, ...over });

test("Revolut: the one line is the server's sentence, word for word", async () => {
  const B = await import("../netlify/lib/bank.mjs");
  const cases = [bst(), bst({ lastAdded: 1, daysLeft: 1, lastOkAt: "2026-11-11T09:50:00.000Z", lastRunAt: "2026-11-11T09:50:00.000Z" }), bst({ lastAdded: 0, daysLeft: 0, lastOkAt: "2026-11-09T09:50:00.000Z", lastRunAt: "2026-11-09T09:50:00.000Z" }),
    bst({ lastError: "Revolut could not be reached just now.", lastRunAt: "2026-11-12T10:00:00.000Z" }), bst({ lastOkAt: null, lastAdded: null }), bst({ lastOkAt: null, partial: true }),
    bst({ partial: true, lastOkAt: "2026-11-11T09:50:00.000Z" }), bst({ connected: false, daysLeft: null }), bst({ connected: false, needsApproval: true }), bst({ configured: false }), null];
  for (const c of cases) assert.equal(L.bankLine(c, BNOW), B.bankLine(c, BNOW), JSON.stringify(c));
  assert.equal(L.bankLine(bst(), BNOW), "Revolut: read today at 06:50 · 2 payments in · approval ends in 86 days");
  assert.equal(L.bankLine(bst({ partial: true, lastOkAt: "2026-11-11T09:50:00.000Z" }), BNOW), "Revolut: read yesterday at 06:50 · the last read stopped part way, the rest comes at the next read · approval ends in 86 days");
});

test("Revolut: the tile's buttons, red only when Luke has to act, and Connect only where it works", () => {
  let v = L.bankView(bst(), BNOW);
  assert.deepEqual([v.buttons, v.attn, v.accounts, v.error, v.note], [["sync", "disconnect"], false, ["Current · EUR", "Savings · EUR"], "", ""]);
  assert.deepEqual(["connect", "approve", "sync", "disconnect"].map(L.bankButton), ["Connect Revolut", "Approve again", "Read now", "Disconnect"]);
  v = L.bankView(bst({ daysLeft: 14, expiring: true }), BNOW);
  assert.deepEqual([v.buttons, v.attn], [["approve", "sync", "disconnect"], true], "14 days or fewer: attention and Approve again first");
  v = L.bankView(bst({ connected: false, needsApproval: true, daysLeft: null }), BNOW);
  assert.deepEqual([v.line, v.buttons, v.attn], ["Revolut has to be approved again", ["approve", "disconnect"], true]);
  v = L.bankView(bst({ connected: false, daysLeft: null, accounts: [] }), BNOW);
  assert.deepEqual([v.line, v.buttons, v.attn], ["Revolut is not connected", ["connect"], false]);
  v = L.bankView(bst({ connected: false, daysLeft: null, accounts: [], canConnectHere: false }), BNOW);
  assert.deepEqual([v.buttons, v.note], [[], "Connecting Revolut only works on badscandal.com itself, not on a preview."]);
  v = L.bankView(bst({ configured: false, connected: false }), BNOW);
  assert.deepEqual([v.line, v.buttons], ["The site is missing its Revolut settings", []]); assert.match(v.note, /settings on Netlify/);
  v = L.bankView(bst({ lastError: "Revolut could not be reached just now. It tries again at the next daily read.", lastRunAt: "2026-11-12T10:00:00.000Z" }), BNOW);
  assert.equal(v.error, "Revolut could not be reached just now. It tries again at the next daily read.", "the reader's own sentence under the line");
  assert.equal(L.bankView(bst({ lastError: "old", lastRunAt: "2026-11-12T09:50:00.000Z" }), BNOW).error, "", "an error from before the last full read is history");
});

test("Revolut: the bank's return flags say one line, once, and leave the address", () => {
  assert.deepEqual(L.bankFlag("?bank=connected"), { kind: "connected", line: "Revolut is connected. The first read is running.", search: "", had: true });
  /* the button may be "Connect Revolut" or "Approve again": the flags name neither */
  assert.deepEqual(L.bankFlag("?bank=failed"), { kind: "failed", line: "That didn't connect. Press the Revolut button below to try again.", search: "", had: true });
  assert.deepEqual(L.bankFlag("?sample=1&bank=device"), { kind: "device", line: "Finish on the device you started on, or start again here with the Revolut button below.", search: "?sample=1", had: true });
  assert.deepEqual(L.bankFlag("?bank=<script>"), { kind: "", line: "", search: "", had: true }, "an unknown flag says nothing, and goes too");
  assert.deepEqual(L.bankFlag("?sample=1"), { kind: "", line: "", search: "?sample=1", had: false });
  assert.deepEqual(L.bankFlag(""), { kind: "", line: "", search: "", had: false });
});

test("Revolut: Read now says what came in, or the reader's own sentence", () => {
  const at = Date.parse("2026-11-12T13:04:00Z");
  assert.deepEqual(L.syncWords({ ok: true, newPayments: 2, more: false, error: null }, at), { ok: true, text: "Read at 10:04: 2 new payments came in." });
  assert.deepEqual(L.syncWords({ ok: true, newPayments: 1, more: true, error: null }, at), { ok: true, text: "Read at 10:04: 1 new payment came in. The rest comes at the next read." });
  assert.equal(L.syncWords({ ok: true, newPayments: 0 }, at).text, "Read at 10:04: nothing new came in.");
  assert.deepEqual(L.syncWords({ ok: false, error: "Revolut has to be approved again: press Approve again" }, at), { ok: false, text: "Revolut has to be approved again: press Approve again" });
  assert.equal(L.syncWords(null, at).ok, false);
});

test("Revolut: payments say what they are in words; to sort and transfers never count", () => {
  assert.deepEqual(L.payStatus({ status: "unsorted" }), { text: "To sort", counted: false });
  assert.deepEqual(L.payStatus({ status: "transfer", by: "HQ" }), { text: "Your own transfer", counted: false }, "the reader found it is his own money");
  assert.deepEqual(L.payStatus({ status: "transfer", by: "Ledger" }), { text: "Not income", counted: false }, "a bot's transfer may be a refund or a gift");
  assert.deepEqual(L.payStatus({ status: "transfer", by: "HQ", history: [{ by: "Nova", from: "received", to: "transfer" }] }), { text: "Not income", counted: false });
  assert.deepEqual(L.payStatus({ status: "transfer", history: [{ by: "Luke", from: "unsorted", to: "transfer" }] }), { text: "Not income", counted: false }, "sorted as not income: a refund, a gift");
  assert.deepEqual(L.payStatus({ status: "received" }), { text: "Received", counted: true });
  assert.deepEqual(L.payStatus({ status: "pending" }), { text: "Pending", counted: true });
  const e = { payer: "A. Example", amount: 60, currency: "EUR", date: "2026-11-11" };
  assert.equal(L.sortQuestion(e, "received", "Production"), "Sort A. Example's EUR 60.00 (Wed 11 Nov) as income (Production)? It counts as money coming in from then on, and can't be changed here.");
  assert.match(L.sortQuestion(e, "transfer"), /^Sort A\. Example's EUR 60\.00 \(Wed 11 Nov\) as not income\? /);
  assert.equal(L.sortedLine("received", "Production"), "Sorted as income (Production)"); assert.equal(L.sortedLine("transfer"), "Sorted as not income");
  assert.deepEqual(L.SORT_TYPES, S.CATEGORIES, "the six kinds are the desk's own");
});

test("Revolut on Today and in Data health: payments to sort, the approval, the reader's own state", () => {
  const inc = { unsorted: [{ id: "i1", account: "Revolut" }, { id: "i2", account: "Revolut" }], unsortedCount: 2, problems: ["2 payments in Revolut that nobody has sorted yet", "Wise: not checked today (Ledger)"] };
  assert.equal(L.toSortWords(inc), "2 payments in Revolut to sort");
  assert.equal(L.toSortWords({ unsorted: [{ account: "Revolut" }], unsortedCount: 1 }), "1 payment in Revolut to sort");
  assert.equal(L.toSortWords({ unsorted: [], unsortedCount: 0 }), "");
  assert.deepEqual(L.incomeProblems(inc), ["Wise: not checked today (Ledger)"], "said once, as \"to sort\", not again as an income problem");
  assert.deepEqual(L.bankAttention(bst({ daysLeft: 9, expiring: true }), { income: inc }), [{ key: "tosort", text: "2 payments in Revolut to sort", href: "#money" }, { key: "bank", text: "Revolut's approval ends in 9 days", href: "#money" }]);
  assert.deepEqual(L.bankAttention(bst({ connected: false, needsApproval: true }), null), [{ key: "bank", text: "Revolut has to be approved again", href: "#money" }]);
  assert.deepEqual(L.bankAttention(bst(), { income: { unsorted: [] } }), [], "connected, nothing to sort: nothing to say");
  assert.deepEqual(L.bankAttention(bst({ configured: false, needsApproval: true }), null), [], "not set up is not Luke's job today");
  const att = L.attention({ sheet: null, ov: null, board: boardOf({ income: { ...boardOf().income, ...inc } }), bank: bst({ daysLeft: 1, expiring: true }) });
  assert.deepEqual(att.map((a) => a.text), ["Income: Wise: not checked today (Ledger)", "2 payments in Revolut to sort", "Revolut's approval ends tomorrow"]);
  /* Data health: the "Revolut" row, only when the page asked for it */
  const h = (st, problem) => L.bankHealth(st, problem, BNOW);
  assert.deepEqual(h(bst()), { key: "revolut", label: "Revolut", state: "ok", text: "Read 3 h ago · approval ends in 86 days" });
  assert.deepEqual([h(null).state, h(null).text], ["off", "Not read yet"]);
  assert.deepEqual([h(null, "Couldn't be read (500)").state, h(null, "Couldn't be read (500)").text], ["bad", "Couldn't be read (500)"]);
  assert.deepEqual([h(bst({ configured: false })).state, h(bst({ configured: false })).text], ["off", "Not set up: the site is missing its Revolut settings"]);
  assert.equal(h(bst({ connected: false, needsApproval: true })).state, "bad");
  assert.equal(h(bst({ connected: false, daysLeft: null })).text, "Not connected");
  assert.equal(h(bst({ lastError: "Revolut could not be reached just now.", lastRunAt: "2026-11-12T10:00:00.000Z" })).text, "The last read failed: Revolut could not be reached just now.");
  assert.deepEqual([h(bst({ daysLeft: 9, expiring: true })).state, h(bst({ daysLeft: 9, expiring: true })).text], ["bad", "Read 3 h ago · approval ends in 9 days"]);
  assert.deepEqual([h(bst({ lastOkAt: "2026-11-11T09:00:00.000Z" })).state, h(bst({ lastOkAt: "2026-11-11T09:00:00.000Z" })).text], ["bad", "Last full read 28 h ago: it reads every morning at 06:50"]);
  assert.equal(h(bst({ partial: true, lastOkAt: "2026-11-11T09:50:00.000Z" })).state, "off");
  assert.equal(L.healthRows({ sheet: null, ov: null }, BNOW).some((r) => r.key === "revolut"), false);
  assert.equal(L.healthRows({ sheet: null, ov: null, bank: bst() }, BNOW).pop().label, "Revolut");
});

test("Revolut in the sample: made-up rows to sort and a transfer, none of them in the totals", async () => {
  const b = sampleBoard(NOW), inc = b.income;
  assert.deepEqual(inc.unsorted.map((e) => [e.payer, e.account, e.status]), [["A. Example", "Revolut", "unsorted"], ["Made-up Studio Ltd", "Revolut", "unsorted"]]);
  assert.equal(L.toSortWords(inc), "2 payments in Revolut to sort");
  assert.ok(inc.entries.some((e) => e.account === "Revolut" && L.payStatus(e).text === "Your own transfer"));
  assert.deepEqual(inc.received, { USD: 524.54 }, "neither the payments to sort nor the transfer count");
  const { sampleBankStatus } = await import("../netlify/lib/staff-sample.mjs");
  const st = sampleBankStatus(NOW);
  assert.equal(L.bankLine(st, NOW), "Revolut: read today at 06:50 · 2 payments in · approval ends in 86 days");
  assert.equal(L.bankHealth(st, "", NOW).state, "ok");
});

test("Revolut on the page: every bank call is the page's own, sorting goes through write(), and the sample can't press anything", () => {
  const staff = readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(staff, /function bankPost\(path\) \{\s*if \(HQ\.sample\) return Promise\.resolve\(\{ ok: false/);
  assert.match(staff, /write\("sort", \{ id: id, month: String\(e\.date\)\.slice\(0, 7\), status: status/);
  assert.match(staff, /history\.replaceState\(history\.state, "", location\.pathname \+ f\.search \+ location\.hash\)/);
  assert.match(staff, /\/\^https:\\\/\\\/\/\.test\(r\.j\.url\)/, "the browser only goes to an https address");
  const words = (staff.match(/"[^"\n]{3,}"|'[^'\n]{3,}'/g) || []).join(" ");
  for (const bad of [/\bAPI\b/, /\btoken\b/i, /endpoint/i, /Enable Banking session/i, />Unsorted</]) assert.doesNotMatch(words, bad);
});

/* ================= the review of 12 Nov 2026 ================= */
test("Revolut: a failure that names Netlify settings is said in Luke's words, in the tile, Data health, Read now and Connect", async () => {
  const B = await import("../netlify/lib/bank.mjs");
  const ask = "Revolut's settings on Netlify need fixing: ask Claude.";
  for (const [said, kind] of [[B.SAY.keyRefused, "refused"], [B.SAY.keyBad, "key"], [B.SAY.noBank, "no_bank"]]) {
    const st = bst({ lastError: said, errorKind: kind, lastRunAt: "2026-11-12T10:00:00.000Z" });
    assert.equal(L.bankView(st, BNOW).error, ask);
    assert.equal(L.bankHealth(st, "", BNOW).text, "The last read failed: " + ask);
    assert.deepEqual(L.syncWords({ ok: false, error: said, errorKind: kind }, BNOW), { ok: false, text: ask });
    assert.equal(L.bankSays(kind, said), ask);
    assert.equal(L.bankSays("", said), ask, "the words are caught even without the kind");
  }
  assert.equal(L.bankSays("", B.SAY.unreachable), B.SAY.unreachable, "a sentence in Luke's words is kept");
  /* nothing Luke can see names a setting */
  const page = [L.bankView(bst({ configured: false, connected: false }), BNOW).note, ...Object.values(B.SAY).map((x) => L.bankSays(B.errorKind(x), x))].join(" ");
  assert.doesNotMatch(page, /ENABLE_BANKING|PEM|base64|redeploy|application/i);
  const staff = readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8");
  assert.match(staff, /L\.bankSays\(r\.kind, r\.error\)/, "Connect's error goes through bankSays");
});

test("Revolut: ?bank=connected says 'connected' only while connected, and reads by itself only right after connecting", () => {
  const flag = L.bankFlag("?bank=connected"), f = { kind: flag.kind, line: flag.line, auto: true };
  const justNow = new Date(BNOW - 2 * 60000).toISOString();
  assert.deepEqual(L.bankFlagAfter(f, bst({ connectedAt: justNow }), BNOW), { flag: { kind: "connected", line: flag.line, auto: false }, sync: true });
  assert.deepEqual(L.bankFlagAfter(f, bst({ connected: false, daysLeft: null, connectedAt: null }), BNOW), { flag: null, sync: false }, "not connected: the line goes, no read");
  assert.deepEqual(L.bankFlagAfter(f, bst({ connected: false, needsApproval: true, connectedAt: justNow }), BNOW), { flag: null, sync: false });
  assert.deepEqual(L.bankFlagAfter(f, bst({ connectedAt: new Date(BNOW - 3 * 86400000).toISOString() }), BNOW), { flag: null, sync: false }, "an old link or bookmark: no read, no line");
  assert.deepEqual(L.bankFlagAfter(f, bst(), BNOW), { flag: null, sync: false }, "no connectedAt known: no read");
  assert.deepEqual(L.bankFlagAfter({ kind: "connected", line: flag.line, auto: false }, bst({ connectedAt: justNow }), BNOW).sync, false, "once only");
  const failed = { kind: "failed", line: "x", auto: false };
  assert.deepEqual(L.bankFlagAfter(failed, bst({ connected: false }), BNOW), { flag: failed, sync: false });
  assert.deepEqual(L.bankFlagAfter(null, bst(), BNOW), { flag: null, sync: false });
});

test("Revolut: once the reader is set up, the desk's own 'Revolut:' lines are not said again under its tile", () => {
  const inc = { problems: ["Revolut: blocked. Waiting for the bank reader", "Revolut: not checked today (HQ)", "Wise: not checked today (Ledger)"], unknown: [] };
  assert.deepEqual(L.incomeProblems(inc, bst()), ["Wise: not checked today (Ledger)"]);
  assert.deepEqual(L.incomeProblems(inc, bst({ connected: false, needsApproval: true })), ["Wise: not checked today (Ledger)"], "the tile and Today say the approval");
  assert.deepEqual(L.incomeProblems(inc, bst({ configured: false })), inc.problems, "no reader yet: the desk's lines are all there is");
  assert.deepEqual(L.incomeProblems(inc, null), inc.problems);
  const att = L.attention({ sheet: null, ov: null, board: boardOf({ income: { ...boardOf().income, ...inc } }), bank: bst() });
  assert.deepEqual(att.map((a) => a.text), ["Income: Wise: not checked today (Ledger)"]);
  /* the sample: no broken "Bank" beside the connected Revolut */
  const sb = sampleBoard(NOW).income;
  assert.ok(!sb.accounts.some((a) => /bank/i.test(a.name) || a.verdict === "blocked"), JSON.stringify(sb.accounts.map((a) => [a.name, a.verdict])));
  assert.deepEqual(L.incomeProblems(sb, bst()).filter((p) => /bank|blocked/i.test(p)), []);
});

test("Revolut: a payment to sort that may be a pending statement's money is offered as that statement first", () => {
  const e = { id: "i1", payer: "NLR Payments BV", amount: 112.01, currency: "EUR", date: "2026-11-10", pendingMatch: { id: "i2", payer: "Northlight Records", amount: 112.01, currency: "EUR", date: "2026-11-02" } };
  assert.equal(L.pendingAnswer(e), "It's the pending Northlight Records statement (EUR 112.01, Mon 2 Nov)");
  assert.equal(L.pendingAnswer({ ...e, pendingMatch: undefined }), "");
  assert.match(L.pendingQuestion(e), /^Is NLR Payments BV's EUR 112\.01 \(Tue 10 Nov\) the money of the pending Northlight Records statement \(EUR 112\.01, Mon 2 Nov\)\? The statement becomes received on Tue 10 Nov, it leaves Pending/);
  assert.equal(L.pendingSorted(e.pendingMatch), "Sorted as the Northlight Records statement: received");
  const staff = readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(staff, /pending_id: /, "the page sends pending_id");
  assert.match(staff, /function reloadBoard\(fresh\) \{\s*if \(loading\) return fresh \? loading\.then\(/, "a write never reuses a board asked for before it");
  assert.match(staff, /addEventListener\("pageshow"/, "Back from Revolut frees the buttons");
});
