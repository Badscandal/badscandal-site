/* 24 Nov 2026, Luke: "fully remove the rights section totally unnecessary and leave a note for the bots to ignore
   this"; "remove claudes api tasks he is no longer required"; "disputes can be removed from the task bar, since
   its contained in songs section". Money is removed in its own test (hq-no-money). Made-up messages. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { STEPS } from "../netlify/lib/hq.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;
const NOW = Date.parse("2026-11-24T15:00:00Z");
const R = S.DEFAULT_ROSTER;
const call = (d, name, args, now = NOW, role = "bot") => callTool(TOOLS.find((t) => t.name === name), args, { store: d, now, role, hq: async () => null });
const page = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
const shell = readFileSync(new URL("../js/hq-shell.js", import.meta.url), "utf8");
const navOf = (html) => html.slice(html.indexOf('<nav class="nav"'), html.indexOf("</nav>"));
const moreOf = (html) => html.slice(html.indexOf('<div class="moresheet"'), html.indexOf("</div>", html.indexOf('<div class="moresheet"') + 30));

test("Rights is gone: no page, no tab, no claims tool, no claim fields; old #rights links land on Needs you", () => {
  assert.doesNotMatch(page, /id="rights"|href="#rights"|rightsBody|claimsBox|claimbadge/);
  assert.equal(TOOLS.some((t) => t.name === "read_claims"), false);
  const grow = TOOLS.find((t) => t.name === "log_growth").inputSchema.properties;
  for (const k of ["claim", "claimant", "impact", "claims_checked", "claim_type", "song_claim", "strike"]) assert.equal(k in grow, false, k);
  assert.equal("claim_id" in TOOLS.find((t) => t.name === "open_case").inputSchema.properties, false);
  assert.equal(typeof S.readClaims, "undefined");
  assert.equal(typeof L.claimCaseLinks, "undefined");
  assert.match(shell, /rights: "today"/);
  assert.equal(L.cmdIndex({}).some((x) => x.href === "#rights"), false);
});

test("Laura is told to stop checking Content ID; a real problem is still a dispute case", async () => {
  const d = memoryDesk();
  const day = await call(d, "my_day", { bot: "Laura" });
  assert.match(day.rights_removed, /Rights page is gone/);
  assert.match(day.rights_removed, /delete any task/);
  assert.equal(day.claims_page, undefined);
  const steve = await call(d, "my_day", { bot: "Steve" });
  assert.equal(steve.rights_removed, undefined, "only Laura carried the claims");
  const o = await call(d, "open_case", { bot: "Laura", song: "Glass Heart", platform: "YouTube", type: "Content ID claim", issue: "A channel claimed our own video." });
  assert.equal(o.saved, true);
});

test("Disputes is off the bar and the More sheet; Songs has it and takes Money's place on the phone bar", () => {
  assert.doesNotMatch(navOf(page), /songs\/disputes|>Disputes</);
  assert.doesNotMatch(moreOf(page), /songs\/disputes|>Disputes</);
  assert.match(navOf(page), /href="#songs" data-tab="songs" class="t bar4"/);
  assert.match(page, /\.nav a\.bar4\{order:4\}/);
  assert.doesNotMatch(navOf(page), /data-tab="money"|data-tab="rights"/);
  assert.match(shell, /disputes: "songs\/disputes"/);
  assert.equal(L.cmdResults(L.cmdIndex({}), "disputes")[0].href, "#songs");
});

test("Claude is off the desk: no new note to Claude, an answer to an old one still lands, and Claude's asks leave Needs you", async () => {
  const d = memoryDesk();
  await assert.rejects(S.sendMessage(d, NOW, R, { from: "Drop", to: "Claude", text: "Can you fix the page?" }), /no longer on the desk.*Nova/);
  await assert.rejects(S.sendMessage(d, NOW, R, { from: "Luke", to: "Claude", text: "Look at this." }), /Nova/);
  const old = (await S.sendMessage(d, NOW - 60000, R, { from: "Claude", to: "Luke", text: "Shall I move the song?", needs: "reply" })).message;
  const fromNova = (await S.sendMessage(d, NOW - 30000, R, { from: "Nova", to: "Luke", text: "Is the cover final?", needs: "reply" })).message;
  const ans = await S.sendMessage(d, NOW, R, { from: "Drop", to: "Claude", text: "Done.", re: old.id });
  assert.ok(ans.message.id);
  const desk = await S.loadDesk(d, NOW);
  const ids = S.waitingOn(desk.messages, "Luke").map((m) => m.id);
  assert.deepEqual(ids, [fromNova.id], "Claude's old question no longer waits on Luke");
  assert.deepEqual(L.composeNames(["Nova", "Claude", "Drop"]).map((x) => x.value), ["Nova", "Drop", "all"]);
  assert.doesNotMatch(page, /<option value="Claude">/);
  assert.doesNotMatch(page, /One board for you, Claude/);
  assert.equal(STEPS.some((s) => /Claude/.test(s.owner)), false);
  for (const b of R) assert.doesNotMatch(b.why || "", /Claude/, b.name);
  assert.doesNotMatch(TOOLS.find((t) => t.name === "send_message").inputSchema.properties.to.description, /Claude/);
});
