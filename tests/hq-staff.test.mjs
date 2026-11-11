/* /hq, the staff desk on the page (11 Nov 2026): Team as the workers section, Messages, "Money coming
   in". Every rule and sentence the page shows is in js/hq-lib.js and is checked here; js/hq-staff.js
   only draws and sends. The board below is MADE UP (the repo is public: no real payer, amount or note). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sampleBoard } from "../netlify/lib/staff-sample.mjs";

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
  assert.deepEqual(rows(boardOf())[1], ["Site check", "off", "No check yet. The site checks itself twice a day"]);
  assert.equal(rows(boardOf({ report: { ...rep, at: iso(27 * 60) } }))[1][1], "bad", "twice a day: 27 hours without one is a problem");
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
  assert.match(sw, /var CACHE = "bs-hq-v2"/); assert.match(sw, /"\/js\/hq-staff\.js"/);
  for (const [name, src] of [["hq-staff.js", staff], ["hq.js", readFileSync(new URL("../js/hq.js", import.meta.url), "utf8")]]) assert.doesNotMatch(src, /\b(confirm|alert|prompt)\s*\(/, name + ": questions are asked on the page, never in a browser dialog");
  assert.doesNotMatch(staff, /innerHTML\s*=\s*[^;]*\b(m|th|r|w|e|s|a)\.(text|message|payer|note|name|task|blocker)\b(?![^;]*esc\()/, "board text is escaped");
  /* Luke's words: the visible text of the new parts never says MCP, token, endpoint or API */
  const visible = (page.slice(page.indexOf('id="team"'), page.indexOf("</main>")) + staff.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"\/api\/staff\/[^"]*"/g, "")).replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(visible, /\b(MCP|tokens?|endpoints?|API)\b/);
});
