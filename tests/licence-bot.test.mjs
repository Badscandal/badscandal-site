/* Licence, the cover-licensing bot (18 Nov 2026). On the roster, reports to Nova only,
   and marks a Label licence only after the pack is ready and Luke has said yes.
   Made-up titles and links only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import * as S from "../netlify/lib/staff.mjs";
import * as W from "../netlify/lib/workspaces.mjs";
import { TOOLS, callTool, toolsFor } from "../netlify/lib/staff-tools.mjs";

const NOW = Date.parse("2026-11-18T15:00:00Z");
const tool = (name) => TOOLS.find((t) => t.name === name);
const call = (d, name, args, role = "bot") => callTool(tool(name), args, { store: d, now: NOW, role, hq: async () => null });
const rejects = (p, re) => assert.rejects(p, (e) => re.test(e.message));
const PROOF = "https://example.com/licence.pdf";

test("Licence is a roster name, and an unknown name is still refused", () => {
  assert.equal(S.whoIs(" licence ", S.DEFAULT_ROSTER), "Licence");
  assert.throws(() => S.whoIs("Manny", S.DEFAULT_ROSTER), /not a name on the team/);
  const names = toolsFor("Licence", S.DEFAULT_ROSTER).map((t) => t.name);
  assert.ok(names.includes("my_day") && names.includes("licence_queue"));
  assert.equal(names.includes("record_spend"), false);
  assert.equal(TOOLS.some((t) => t.name === "licence_queue"), true);
});

test("my_day gives Licence its job card, and messages go to Nova only", async () => {
  const d = memoryDesk();
  const day = await call(d, "my_day", { bot: "Licence" });
  assert.equal(day.you, "Licence");
  assert.equal(day.role, "Cover licensing");
  assert.equal(day.reports_to, "Nova");
  assert.match(day.daily_duty, /mechanical licence/);
  assert.match(day.why_you_are_needed, /Easy Song Licensing/);
  assert.match(day.why_you_are_needed, /Nova only/);
  assert.ok(day.licence_queue && Array.isArray(day.licence_queue.queue));
  await rejects(call(d, "send_message", { bot: "Licence", to: "Luke", text: "The cover is ready." }), /reports to Nova only/);
  const sent = await call(d, "send_message", { bot: "Licence", to: "Nova", text: "Northwind Cover is waiting on the licence." });
  assert.equal(sent.sent, true);
  assert.equal(sent.to, "Nova");
});

test("the Label queue waits for the pack and for Luke's yes, then takes a proof link", async () => {
  const d = memoryDesk();
  const made = await W.createRelease(d, NOW, { by: "Luke", title: "Northwind Cover", date: "2026-12-18" });
  assert.deepEqual(made.steps.map((s) => s.key), ["pack", "licence", "upload", "pitch"]);
  let card = (await W.view(d, NOW, "label")).genres[0].releases[0];
  const lic = card.steps.find((s) => s.key === "licence");
  assert.equal(lic.shown, "waiting on licence");
  assert.equal(lic.proof_link, "");
  let queue = await call(d, "licence_queue", { bot: "Licence" });
  assert.deepEqual(queue.queue, []);
  await W.markLabelStep(d, NOW, { by: "Nova", song: made.id, step: "pack", status: "done" });
  queue = await call(d, "licence_queue", { bot: "Licence" });
  assert.equal(queue.queue.length, 1);
  assert.equal(queue.queue[0].song, "Northwind Cover");
  assert.equal(queue.queue[0].status, "waiting on licence");
  assert.equal(queue.queue[0].luke_yes, false);
  await rejects(call(d, "licence_queue", { bot: "Licence", song: made.id, proof_link: PROOF }), /has not said yes/);
  await rejects(call(d, "licence_queue", { bot: "Licence", song: made.id, luke_said: "Yes", proof_link: PROOF }), /cannot record the yes/);
  await rejects(call(d, "licence_queue", { bot: "Licence", song: made.id, proof_link: PROOF, amount: "12.40" }), /does not take or send payment/);
  await rejects(W.markLicenceDone(d, NOW, { by: "Drop", song: made.id, proof_link: PROOF }), /Only the Licence bot or Nova/);
  await rejects(W.markLicenceDone(d, NOW, { by: "Steve", song: made.id, proof_link: PROOF }), /Only the Licence bot or Nova/);
  await rejects(S.setStep(d, NOW, S.DEFAULT_ROSTER, { by: "Nova", song: "Keep", step: "licence", status: "done" }), /Badscandal releases have no licence step/);
  const yes = await call(d, "licence_queue", { bot: "Nova", song: "Northwind Cover", luke_said: "Yes, licence Northwind Cover." });
  assert.equal(yes.luke_yes, true);
  assert.equal(yes.status, "waiting on licence");
  const done = await call(d, "licence_queue", { bot: "Licence", song: made.title, proof_link: PROOF });
  assert.equal(done.status, "licensed");
  assert.equal(done.shown, "licensed");
  assert.equal(done.proof_link, PROOF);
  assert.equal(done.upload, "open");
  card = (await W.view(d, NOW, "label")).genres[0].releases[0];
  assert.equal(card.steps.find((s) => s.key === "licence").shown, "licensed");
  assert.equal(card.steps.find((s) => s.key === "licence").proof_link, PROOF);
  assert.equal(card.steps.find((s) => s.key === "upload").status, "todo");
  queue = await call(d, "licence_queue", { bot: "Licence" });
  assert.deepEqual(queue.queue, []);
  assert.equal(queue.licensed[0].status, "licensed");
  assert.equal(queue.licensed[0].proof_link, PROOF);
});
