/* The bots propose releases (16 Nov 2026, Luke: "give the bots better controls they should be able to add
   edit and change upcoming songs and should always ask me if something is correct before making the
   addition"). Nova had no tool to add a song Luke had already said yes to, so it sat missing from the desk.
   Now any bot proposes (propose_release): a new song, or changes to one on the desk (title, release day,
   any pack field), and optionally sending it to the team. NOTHING changes until Luke answers
   "Yes, correct" (on the dashboard, or through Alfred or Nova); "No" changes nothing.
   All names and values here are made up. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, INSTRUCTIONS } from "../netlify/lib/staff-tools.mjs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const NOW = Date.parse("2026-11-16T15:00:00Z"); /* Mon 16 Nov, 12:00 in São Paulo */
const MIN = 60000;
const R = S.DEFAULT_ROSTER;
const fails = (p, re) => assert.rejects(p, (e) => e.name === "StaffError" && re.test(e.message));
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, o = {}) => callTool(tool(name), args, { store: d, now: o.now || NOW, role: "bot", hq: async () => null });
const rels = async (d) => S.listReleases(d);
const byTitle = async (d, t) => (await rels(d)).find((r) => r.title === t);
const yes = (d, m, o = {}) => S.sendMessage(d, (o.now || NOW) + MIN, R, { from: "Luke", to: m.from, text: o.text || "Yes, correct", re: m.id, note: "Yes, correct", via: o.via });
const PACK = { kind: "Self-release", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", language: "English", explicit: "No", genre: "Dance",
  writers: "Sample Writer: music and lyrics", copyright: "℗ 2026 badscandal · © 2026 badscandal" };

test("a new song: the bot proposes, Luke is asked if it is correct, and nothing is added before he says yes", async () => {
  const d = memoryDesk();
  const before = (await rels(d)).length;
  const r = await call(d, "propose_release", { bot: "Nova", title: "Paper Moon", date: "2026-11-27",
    pack: { kind: "Self-release", featuring: "Sample Singer", upc: "0000000000017", storeStatus: "in moderation" }, why: "Luke said yes at 11:40" });
  assert.equal(r.asked, true);
  assert.equal((await rels(d)).length, before, "not added yet");
  const m = await S.getMessage(d, r.id);
  assert.deepEqual([m.to, m.needs, m.options], ["Luke", "decision", S.PROPOSE_OPTIONS]);
  assert.deepEqual(S.PROPOSE_OPTIONS, ["Yes, correct", "No"]);
  assert.equal(m.proposal.action, "add");
  assert.match(m.text, /^Nova asks: is this correct\? Add a new song: Paper Moon, out Fri 27 Nov\./);
  assert.match(m.text, /Why: Luke said yes at 11:40/);
  assert.deepEqual(m.proposal.changes.map((c) => [c.label, c.from, c.to]), [["Title", "", "Paper Moon"], ["Release day", "", "Fri 27 Nov"],
    ["Self-release or label", "", "Self-release"], ["Featured artists", "", "Sample Singer"], ["UPC", "", "0000000000017"], ["Status at the distributor", "", "in moderation"]]);
  /* Luke: Yes, correct -> it is on the desk, as a draft, in Luke's name, saying who proposed it */
  const a = await yes(d, m);
  assert.equal(a.settled, true);
  assert.equal(a.proposal.done, true);
  const rel = await byTitle(d, "Paper Moon");
  assert.deepEqual([rel.status, rel.date, rel.pack.featuring, rel.pack.upc, rel.pack.storeStatus, rel.createdBy], ["draft", "2026-11-27", "Sample Singer", "0000000000017", "in moderation", "Luke"]);
  assert.match(rel.log[rel.log.length - 1].what, /proposed by Nova/);
  /* the bot that asked is told it is done */
  const told = (await S.listMessages(d, NOW + 2 * MIN)).find((x) => x.from === "HQ" && x.to === "Nova");
  assert.match(told.text, /^Done: Luke said yes\. Paper Moon is on the desk/);
});

test("Luke says No (or anything else): nothing changes", async () => {
  const d = memoryDesk();
  const r = await call(d, "propose_release", { bot: "Drop", title: "Glass House", date: "2026-12-18" });
  const m = await S.getMessage(d, r.id);
  const a = await S.sendMessage(d, NOW + MIN, R, { from: "Luke", to: "Drop", text: "No", re: m.id, note: "No" });
  assert.equal(a.settled, true);
  assert.equal(a.proposal, undefined);
  assert.equal(await byTitle(d, "Glass House"), undefined);
});

test("changes to a song on the desk: title, release day (a sent song moves its steps), any pack field", async () => {
  const d = memoryDesk();
  const r0 = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Night Drive", date: "2026-12-11", pack: PACK });
  await S.sendRelease(d, NOW, R, { by: "Luke", id: r0.id });
  const p = await call(d, "propose_release", { bot: "Drop", song: "Night Drive", title: "Night Drive (Original Mix)", date: "2026-12-18", pack: { genre: "Electronic", isrc: "QZ0000000001" } });
  const m = await S.getMessage(d, p.id);
  assert.match(m.text, /^Drop asks: is this correct\? Change Night Drive:/);
  assert.deepEqual(m.proposal.changes.map((c) => [c.label, c.from, c.to]), [["Title", "Night Drive", "Night Drive (Original Mix)"], ["Release day", "Fri 11 Dec", "Fri 18 Dec"],
    ["Genre", "Dance", "Electronic"], ["ISRC", "", "QZ0000000001"]]);
  assert.equal((await rels(d))[0].date, "2026-12-11", "nothing yet");
  const a = await yes(d, m);
  assert.equal(a.proposal.done, true, JSON.stringify(a.proposal));
  const rel = (await rels(d)).find((x) => x.id === r0.id);
  assert.deepEqual([rel.title, rel.date, rel.pack.genre, rel.pack.isrc], ["Night Drive (Original Mix)", "2026-12-18", "Electronic", "QZ0000000001"]);
  assert.equal(rel.steps.find((s) => s.key === "upload").due, "2026-11-27", "the open steps follow the new day (21 days before)");
});

test("changed since the bot asked: Luke's yes does not overwrite it, and the bot is told to ask again", async () => {
  const d = memoryDesk();
  await S.saveRelease(d, NOW, R, { by: "Luke", title: "Night Drive", date: "2026-12-11", pack: PACK });
  const p = await call(d, "propose_release", { bot: "Drop", song: "Night Drive", pack: { genre: "Electronic" } });
  await S.saveRelease(d, NOW, R, { by: "Luke", id: "nightdrive", pack: { genre: "House" } });
  const a = await yes(d, await S.getMessage(d, p.id));
  assert.equal(a.proposal.done, false);
  assert.match(a.proposal.error, /changed since Drop asked/);
  assert.equal((await byTitle(d, "Night Drive")).pack.genre, "House");
  assert.match((await S.listMessages(d, NOW + 2 * MIN)).find((x) => x.from === "HQ" && x.to === "Drop").text, /^Not done:/);
});

test("send it to the team in the same yes; a song can't be sent without its release day", async () => {
  const d = memoryDesk();
  await fails(call(d, "propose_release", { bot: "Nova", title: "Glass House", send: true }), /release day/);
  const p = await call(d, "propose_release", { bot: "Nova", title: "Glass House", date: "2026-12-18", pack: PACK, send: true });
  const m = await S.getMessage(d, p.id);
  assert.match(m.text, /Then send it to the team/);
  await yes(d, m);
  const rel = await byTitle(d, "Glass House");
  assert.equal(rel.status, "scheduled");
  assert.ok(rel.steps.length > 0);
});

test("through Alfred or Nova: Luke's yes recorded from their chat applies it too", async () => {
  const d = memoryDesk();
  const p = await call(d, "propose_release", { bot: "Drop", title: "Glass House", date: "2026-12-18" });
  const rec = await call(d, "record_luke_answer", { bot: "Nova", reply_to: p.id, luke_said: "yes thats right", option: "Yes, correct" });
  assert.equal(rec.closed, true);
  assert.match(rec.release, /Glass House is on the desk/);
  assert.match((await byTitle(d, "Glass House")).log.slice(-1)[0].what, /via Nova/);
});

test("what is refused before Luke is ever asked", async () => {
  const d = memoryDesk();
  await S.saveRelease(d, NOW, R, { by: "Luke", title: "Night Drive", date: "2026-12-11", pack: PACK });
  await fails(call(d, "propose_release", { bot: "Drop", title: "Night Drive" }), /already a release called "Night Drive"/);
  await fails(call(d, "propose_release", { bot: "Drop", song: "Night Drive", pack: { genre: "Dance" } }), /Nothing would change/);
  await fails(call(d, "propose_release", { bot: "Drop", song: "Night Drive", pack: { colour: "red" } }), /not a field/);
  await fails(call(d, "propose_release", { bot: "Drop", song: "Night Drive", date: "11/12/2026" }), /YYYY-MM-DD/);
  await fails(call(d, "propose_release", { bot: "Drop", song: "Night Drive", pack: { wav: "dropbox.com/x" } }), /https/);
  await fails(call(d, "propose_release", { bot: "Drop", song: "No Such Song", pack: { genre: "Dance" } }), /No Such Song/);
  await fails(call(d, "propose_release", { bot: "Drop" }), /title/);
  /* one open question per bot and song: no pile of the same ask */
  const first = await call(d, "propose_release", { bot: "Drop", song: "Night Drive", pack: { genre: "House" } });
  await fails(call(d, "propose_release", { bot: "Drop", song: "Night Drive", pack: { genre: "Electronic" } }), new RegExp(first.id));
  /* Luke and Claude change songs on the dashboard themselves */
  await fails(call(d, "propose_release", { bot: "Luke", title: "X" }), /not a name on the team/);
});

test("the bots are told: propose, never assume; the tool says Luke is asked first", () => {
  const t = tool("propose_release");
  assert.ok(t);
  assert.match(t.description, /Luke is asked/i);
  assert.deepEqual(t.inputSchema.required, ["bot"]);
  assert.match(INSTRUCTIONS, /propose_release/);
});

test("the dashboard: what would change, from and to, and the confirm says what Yes does", () => {
  const m = { from: "Nova", proposal: { action: "add", title: "Paper Moon", changes: [{ label: "Title", from: "", to: "Paper Moon" }, { label: "Genre", from: "Dance", to: "House" }] } };
  assert.deepEqual(L.proposalRows(m), [{ label: "Title", from: "", to: "Paper Moon", text: "Paper Moon" }, { label: "Genre", from: "Dance", to: "House", text: "Dance → House" }]);
  assert.equal(L.proposalConfirm(m, "Yes, correct"), "Add Paper Moon to the releases, as Nova proposed?");
  assert.equal(L.proposalConfirm({ ...m, proposal: { ...m.proposal, action: "change" } }, "Yes, correct"), "Make these changes to Paper Moon, as Nova proposed?");
  assert.equal(L.proposalConfirm(m, "No"), "Answer “No”? Nothing changes, and Nova will see it.");
  assert.deepEqual(L.proposalRows({}), []);
});
