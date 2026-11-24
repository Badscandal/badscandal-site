/* The bots' feedback, round 2 (15 Nov 2026, the bots' COMBINED.md).
   - Nova's yes counts as Luke's, as long as Luke told Nova yes himself (Luke, 15 Nov 2026: "yes novas
     counts as long as i told him yes"). Never for money (the bots' own rule, which Luke said yes to). */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, INSTRUCTIONS, toolsFor } from "../netlify/lib/staff-tools.mjs";
import { readFileSync } from "node:fs";
await import("../js/hq-lib.js");

const NOW = Date.parse("2026-11-15T15:00:00Z");
const MIN = 60000;
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, o = {}) => callTool(tool(name), args, { store: d, now: o.now || NOW, role: "bot", hq: async () => null });

test("record_luke_answer: Nova records the yes Luke gave Nova, as Luke's answer via Nova", async () => {
  const d = memoryDesk();
  const dec = await call(d, "send_message", { bot: "Drop", to: "Luke", text: "Fix the Featured typo in the pack?", needs: "decision", options: ["Yes", "Not yet"] });
  const r = await call(d, "record_luke_answer", { bot: "Nova", reply_to: dec.id, luke_said: "yes fix it", option: "Yes" });
  assert.deepEqual([r.saved, r.closed], [true, true]);
  assert.match(r.shown_on, /via Nova/);
  const ans = (await S.listMessages(d, NOW + MIN)).find((m) => m.re === dec.id);
  assert.deepEqual([ans.from, ans.via, ans.to, ans.text], ["Luke", "Nova", "Drop", "yes fix it"]);
  assert.equal((await S.getMessage(d, dec.id)).resolved.note, "Yes");
});

test("record_luke_answer: an approval Nova records says via Nova", async () => {
  const d = memoryDesk();
  const PACK = { kind: "Self-release", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", language: "Portuguese", explicit: "No", genre: "Dance",
    writers: "Sample Writer: music and lyrics", copyright: "℗ 2026 Sample · © 2026 Sample", lyrics: "Made-up line one\nMade-up line two" };
  const r0 = await S.saveRelease(d, NOW, S.DEFAULT_ROSTER, { by: "Luke", title: "Night Drive", date: "2026-12-11", pack: PACK });
  const r = (await S.sendRelease(d, NOW, S.DEFAULT_ROSTER, { by: "Luke", id: r0.id })).release;
  const ask = await call(d, "send_message", { bot: "Verse", to: "Luke", text: "Final lyrics OK?", approval: { song: "Night Drive", what: "lyrics" } });
  const rec = await call(d, "record_luke_answer", { bot: "Nova", reply_to: ask.id, luke_said: "yes final", option: "Approve" });
  assert.match(rec.approved, /via Nova/);
  const ap = (await S.listReleases(d)).find((x) => x.id === r.id).approvals.lyrics;
  assert.deepEqual([ap.by, ap.via, ap.words], ["Luke", "Nova", "yes final"]);
});

test("record_luke_answer: never money for Nova (Forge asks about ad spend), and nobody else", async () => {
  const d = memoryDesk();
  /* 24 Nov 2026, Luke: money removed from HQ. Ledger and Sheet no longer ask about money; Forge's ad spend still is */
  for (const bot of ["Forge"]) {
    const m = await call(d, "send_message", { bot, to: "Luke", text: "Is this payment ours?", needs: "decision", options: ["Yes", "No"] });
    await assert.rejects(call(d, "record_luke_answer", { bot: "Nova", reply_to: m.id, luke_said: "yes", option: "Yes" }), /money/i);
    const ok = await call(d, "record_luke_answer", { bot: "Alfred", reply_to: m.id, luke_said: "yes", option: "Yes" });
    assert.equal(ok.closed, true, "Alfred still records Luke's money answers from his own chat");
  }
  const m = await call(d, "send_message", { bot: "Drop", to: "Luke", text: "Resubmit?", needs: "reply" });
  await assert.rejects(call(d, "record_luke_answer", { bot: "Kevin", reply_to: m.id, luke_said: "yes" }), /Alfred or Nova/);
});

test("the rule is written for the bots: only Luke's own yes to Nova, his exact words, never money", () => {
  assert.match(tool("record_luke_answer").description, /NOVA/);
  assert.match(tool("record_luke_answer").description, /money/i);
  assert.match(INSTRUCTIONS, /Nova's yes counts as Luke's/);
  assert.ok(toolsFor("Nova", S.DEFAULT_ROSTER).some((t) => t.name === "record_luke_answer"));
  assert.ok(!toolsFor("Kevin", S.DEFAULT_ROSTER).some((t) => t.name === "record_luke_answer"));
});
