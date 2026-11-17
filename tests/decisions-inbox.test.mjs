/* A3 (17 Nov 2026): Luke's decisions inbox, with Nova's recommendation on each card.
   A message waiting on Luke can carry recommendations: the bot that asks gives its own when it sends
   (send_message recommend + recommend_option), and Nova (or Claude) adds hers with the recommend tool. One
   recommendation per person per message (a new one replaces that person's old one). Luke's card shows them
   and marks the recommended option; Alfred's short briefing says it. luke_briefing does not change.
   Made-up names and words only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, INSTRUCTIONS, toolsFor } from "../netlify/lib/staff-tools.mjs";

await import("../js/hq-lib.js");
const L = globalThis.HQLib;
const NOW = Date.parse("2026-11-17T15:00:00Z");
const MIN = 60000;
const R = S.DEFAULT_ROSTER;
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, o = {}) => callTool(tool(name), args, { store: d, now: o.now || NOW, role: o.role || "bot", hq: async () => null }).catch((e) => ({ error: e.message }));
const err = (r) => r && r.error;
const ask = (d, extra = {}) => call(d, "send_message", { bot: "Forge", to: "Luke", needs: "decision", text: "Run the made-up clip ad for two more days?", options: ["Yes, two more days", "Stop it now"], ...extra });

test("send_message: the asker's own recommendation goes on the message", async () => {
  const d = memoryDesk();
  const r = await ask(d, { recommend: "It brings taps at half the usual cost.", recommend_option: "yes, two more days" });
  const m = await S.getMessage(d, r.id);
  assert.equal(m.recommendations.length, 1);
  assert.equal(m.recommendations[0].by, "Forge");
  assert.equal(m.recommendations[0].option, "Yes, two more days", "stored exactly as listed");
  assert.equal(m.recommendations[0].why, "It brings taps at half the usual cost.");
});
test("send_message: what a recommendation is refused for", async () => {
  const d = memoryDesk();
  assert.match(String(err(await ask(d, { recommend: "Because.", recommend_option: "Maybe" }))), /recommend_option must be one of the options/);
  assert.match(String(err(await call(d, "send_message", { bot: "Forge", to: "Nova", text: "fyi", recommend: "Do it" }))), /only on a message to Luke that needs him/);
  assert.match(String(err(await call(d, "send_message", { bot: "Forge", to: "Luke", needs: "reply", text: "Which day?", recommend: "Friday.", recommend_option: "Friday" }))), /recommend_option only goes with options/);
  assert.match(String(err(await ask(d, { recommend_option: "Stop it now" }))), /ay why in recommend/);
  /* a reply to Luke that needs him may carry a recommendation without an option */
  const ok = await call(d, "send_message", { bot: "Forge", to: "Luke", needs: "reply", text: "Which day suits you?", recommend: "Friday: the song is out that day." });
  assert.equal((await S.getMessage(d, ok.id)).recommendations[0].option, "");
});
test("recommend (Nova): adds hers, replaces her own earlier one, keeps the asker's", async () => {
  const d = memoryDesk();
  const r = await ask(d, { recommend: "Cheap taps.", recommend_option: "Yes, two more days" });
  const a = await call(d, "recommend", { bot: "Nova", message_id: r.id, option: "Stop it now", why: "The cap is close: 830 of 1000 this month (made up)." });
  assert.equal(a.saved, true);
  await call(d, "recommend", { bot: "Nova", message_id: r.id, option: "Stop it now", why: "The cap is close." }, { now: NOW + MIN });
  const m = await S.getMessage(d, r.id);
  assert.deepEqual(m.recommendations.map((x) => [x.by, x.option, x.why]), [["Forge", "Yes, two more days", "Cheap taps."], ["Nova", "Stop it now", "The cap is close."]]);
});
test("recommend: who may, and on what", async () => {
  const d = memoryDesk();
  const r = await ask(d);
  assert.match(String(err(await call(d, "recommend", { bot: "Kevin", message_id: r.id, why: "Yes." }))), /Only Nova/);
  assert.match(String(err(await call(d, "recommend", { bot: "Nova", message_id: r.id, option: "Perhaps", why: "x y" }))), /must be one of the options/);
  assert.match(String(err(await call(d, "recommend", { bot: "Nova", message_id: r.id, why: "" }))), /why/);
  assert.match(String(err(await call(d, "recommend", { bot: "Nova", message_id: r.id, why: "The password is hunter2abc" }))), /passwords|Never write/i);
  const note = await call(d, "send_message", { bot: "Forge", to: "Kevin", text: "fyi only" });
  assert.match(String(err(await call(d, "recommend", { bot: "Nova", message_id: note.id, why: "Because." }))), /not waiting on Luke/);
  await S.sendMessage(d, NOW + MIN, R, { from: "Luke", to: "Forge", text: "stop it", re: r.id, note: "Stop it now" });
  assert.match(String(err(await call(d, "recommend", { bot: "Nova", message_id: r.id, why: "Too late." }))), /not waiting on Luke/);
  /* Claude may too */
  const r2 = await ask(d);
  const c = await call(d, "recommend", { message_id: r2.id, why: "Stop: made-up reason." }, { role: "claude" });
  assert.equal(c.saved, true);
});
test("the tool list: recommend is Nova's (Claude and plain /mcp get it too); 35 tools", () => {
  assert.equal(TOOLS.length, 35);
  assert.ok(toolsFor("Nova", R).some((t) => t.name === "recommend"));
  assert.ok(!toolsFor("Kevin", R).some((t) => t.name === "recommend"));
  assert.match(INSTRUCTIONS, /recommend/);
  const sm = tool("send_message").inputSchema.properties;
  assert.ok(sm.recommend && sm.recommend_option);
});
test("Alfred's short briefing says the recommendation; luke_briefing does not change", async () => {
  const d = memoryDesk();
  const r = await ask(d);
  await call(d, "recommend", { bot: "Nova", message_id: r.id, option: "Stop it now", why: "The cap is close." });
  const b = await call(d, "luke_short_briefing", { bot: "Alfred" });
  assert.match(b.decisions[0], /Nova recommends: Stop it now \(The cap is close\.\)/);
  const full = await call(d, "luke_briefing", { bot: "Alfred" });
  assert.equal(JSON.stringify(full).includes("recommend"), false);
});

/* ---------- the page ---------- */
test("HQLib.recommendLines / recommendedOption: Nova first, then the asker", () => {
  const m = { from: "Forge", options: ["Yes, two more days", "Stop it now"], recommendations: [
    { by: "Forge", option: "Yes, two more days", why: "Cheap taps." }, { by: "Nova", option: "Stop it now", why: "The cap is close." }] };
  assert.deepEqual(L.recommendLines(m), ["Nova recommends “Stop it now”: The cap is close.", "Forge recommends “Yes, two more days”: Cheap taps."]);
  assert.equal(L.recommendedOption(m), 1);
  assert.equal(L.recommendedOption({ ...m, recommendations: [m.recommendations[0]] }), 0);
  assert.deepEqual(L.recommendLines({ recommendations: [{ by: "Forge", option: "", why: "Friday." }] }), ["Forge recommends: Friday."]);
  assert.deepEqual(L.recommendLines({}), []);
  assert.equal(L.recommendedOption({ options: ["a"] }), -1);
});
test("Waiting on you shows the recommendation and marks the recommended option", () => {
  const js = readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8");
  assert.match(js, /L\.recommendLines\(m\)/);
  assert.match(js, /L\.recommendedOption\(m\)/);
  assert.match(js, /recommended/);
  const html = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  assert.match(html, /\.mrec\{/);
});
test("the sample has a decision with Nova's recommendation", async () => {
  const { sampleBoard } = await import("../netlify/lib/staff-sample.mjs");
  const b = sampleBoard(NOW);
  assert.ok(b.waiting.luke.some((m) => (m.recommendations || []).some((x) => x.by === "Nova")));
});
