/* HQ workspaces (18 Nov 2026). Farm and Label never mix into the BADSCANDAL numbers.
   Label covers get a licence step, owner_bot Licence, before upload. Official releases do not.
   Made-up names and amounts only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import * as S from "../netlify/lib/staff.mjs";
import * as C from "../netlify/lib/action-cards.mjs";
import * as W from "../netlify/lib/workspaces.mjs";
import { TOOLS, callTool, toolsFor } from "../netlify/lib/staff-tools.mjs";

const NOW = Date.parse("2026-11-18T15:00:00Z");
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const tool = (name) => TOOLS.find((t) => t.name === name);
const call = (d, name, args) => callTool(tool(name), args, { store: d, now: NOW, role: "bot", hq: async () => null });
const rejects = (p, re) => assert.rejects(p, (e) => re.test(e.message));

const LICENCE = {
  esl_order_number: "ESL-100",
  licence_pdf_url: "https://example.com/licence.pdf",
  drive_folder_url: "https://example.com/drive/northwind",
  original_title: "Original Northwind",
  original_writers: "A Writer",
  original_publisher: "Northwind Publishing",
};

test("the switch, the farm note and Add genre are on the page", () => {
  const html = read("hq.html");
  assert.match(html, /data-ws="badscandal"/);
  assert.match(html, /data-ws="farm"/);
  assert.match(html, /data-ws="label"/);
  assert.match(html, /Farm accounts are kept separate from the official BADSCANDAL accounts and ad accounts\./);
  assert.match(read("js/hq-workspaces.js"), /Add genre/);
  assert.match(read("js/hq-workspaces.js"), /not set up/);
  assert.match(read("js/hq-workspaces.js"), /class="dhead"/);
  assert.match(read("js/hq-workspaces.js"), /data-wschoice/);
  assert.equal(TOOLS.length, 54, "content_ideas (Spark) + licence_queue, plus account_health, needs_you, song_pl (18 Nov 2026 night test) + profile_jobs, profile_master, profile_rework, profile_uploaded (PR #87)");
  const step = tool("release_step");
  assert.ok(step.inputSchema.properties.step.enum.includes("licence"));
  assert.ok(step.inputSchema.properties.step.enum.includes("upload"));
  assert.ok(step.inputSchema.properties.step.enum.includes("pack"));
  assert.deepEqual(toolsFor("Licence", S.DEFAULT_ROSTER).map((t) => t.name), ["my_day", "post_update", "send_message", "set_my_card", "releases", "release_step", "licence_queue"]);
});

test("official releases keep their steps and have no licence step", async () => {
  const d = memoryDesk();
  assert.deepEqual(S.scheduleSteps("2026-12-18", "2026-11-18").steps.map((s) => s.key), S.RELEASE_STEPS.map((s) => s.key));
  assert.equal(S.RELEASE_STEPS.some((s) => s.key === "licence"), false);
  await rejects(S.setStep(d, NOW, S.DEFAULT_ROSTER, { by: "Nova", song: "Keep", step: "licence", status: "done" }), /Badscandal releases have no licence step/);
  await d.setJSON("releases.json", [{ id: "keep", title: "Keep", status: "scheduled" }, { id: "lab", title: "Lab", workspace: "label", status: "scheduled" }]);
  assert.deepEqual((await S.listReleases(d)).map((r) => r.id), ["keep"]);
});

test("Label starts with UK garage, one alias, a playlist placeholder and ROI pending", async () => {
  const d = memoryDesk();
  const v = await W.view(d, NOW, "label");
  assert.deepEqual(v.genres.map((g) => g.name), ["UK garage"]);
  assert.equal(v.genres[0].aliases.length, 1);
  assert.equal(v.genres[0].aliases[0].main, true);
  assert.equal(v.genres[0].playlist.name, "");
  assert.equal(v.genres[0].playlist.url, "");
  assert.equal(v.genres[0].playlist.owner_bot, "");
  assert.equal(v.genres[0].playlist.status, "not set up");
  assert.equal(v.genres[0].stats.roi, "pending");
  await W.addGenre(d, NOW, { by: "Luke", name: "Drum and bass" });
  const v2 = await W.view(d, NOW, "label");
  assert.deepEqual(v2.genres.map((g) => g.name), ["UK garage", "Drum and bass"]);
  assert.equal(v2.genres[1].playlist.status, "not set up");
  assert.equal(v2.genres[1].playlist.owner_bot, "");
  await W.addAlias(d, NOW, { by: "Luke", genre: "UK garage", name: "Second Alias" });
  const uk = (await W.view(d, NOW, "label")).genres[0];
  assert.equal(uk.aliases.length, 2);
  assert.equal(uk.aliases.filter((a) => a.main).length, 1);
  await rejects(W.createRelease(d, NOW, { by: "Luke", title: "An Original", date: "2026-12-18", kind: "original" }), /covers only/);
});

test("licence is before upload, only Licence or Nova can mark it, and upload stays blocked", async () => {
  const d = memoryDesk();
  const made = await W.createRelease(d, NOW, { by: "Luke", title: "Northwind Cover", date: "2026-12-18" });
  assert.equal((await S.listReleases(d)).length, 0, "a Label cover is not a BADSCANDAL release");
  let card = (await W.view(d, NOW, "label")).genres[0].releases[0];
  assert.deepEqual(card.steps.map((s) => s.key), ["pack", "licence", "upload", "pitch"]);
  assert.ok(card.steps.findIndex((s) => s.key === "licence") < card.steps.findIndex((s) => s.key === "upload"));
  assert.equal(card.steps[0].owner_bot, "Nova");
  assert.equal(card.steps[1].owner_bot, "Licence");
  assert.equal(card.steps[1].status, "todo");
  assert.equal(card.steps[1].shown, "waiting on licence");
  assert.equal(card.steps[1].proof_link, "");
  assert.equal(card.steps[2].status, "blocked");
  assert.match(card.steps[2].note, /Blocked until the licence is licensed/);
  for (const key of W.LICENCE_FIELDS) assert.ok(key in card.licence, key);
  await rejects(W.markLabelStep(d, NOW, { by: "Steve", song: made.id, step: "licence", status: "paid" }), /Only the Licence bot or Nova/);
  await rejects(W.markLabelStep(d, NOW, { by: "Luke", song: made.id, step: "licence", status: "paid" }), /Only the Licence bot or Nova/);
  await rejects(W.markLabelStep(d, NOW, { by: "Drop", song: made.id, step: "licence", status: "paid" }), /Only the Licence bot or Nova/);
  await rejects(W.markLabelStep(d, NOW, { by: "Licence", song: made.id, step: "licence", status: "paid", amount: 12.4 }), /does not take or send payment/);
  card = (await W.view(d, NOW, "label")).genres[0].releases[0];
  assert.equal(card.licence.status, "todo", "a refused payment does not change the step");
  await rejects(W.markLabelStep(d, NOW, { by: "Licence", song: made.id, step: "licence", status: "flagged" }), /flag_reason/);
  await rejects(W.markLabelStep(d, NOW, { by: "Licence", song: made.id, step: "licence", status: "licensed" }), /Still missing/);
  await rejects(W.markLabelStep(d, NOW, { by: "Drop", workspace: "label", song: made.title, step: "upload", status: "done" }), /upload is blocked/);
  const ordered = await call(d, "release_step", { bot: "Licence", workspace: "label", song: made.title, step: "licence", status: "ordered_waiting_luke", ...LICENCE });
  assert.equal(ordered.status, "ordered_waiting_luke");
  assert.equal(ordered.owner_bot, "Licence");
  assert.equal(ordered.upload, "blocked");
  const paid = await W.markLabelStep(d, NOW, { by: "Nova", song: made.id, step: "licence", status: "paid" });
  assert.equal(paid.licence.status, "paid");
  assert.equal(paid.steps.find((s) => s.key === "upload").status, "blocked");
  await W.markLabelStep(d, NOW, { by: "Luke", song: made.id, step: "pack", status: "done" });
  await W.recordLicenceYes(d, NOW, { by: "Luke", song: made.id, words: "Yes, licence Northwind Cover." });
  const licensed = await call(d, "release_step", { bot: "Licence", workspace: "label", song: "Northwind Cover", step: "licence", status: "licensed", ...LICENCE });
  assert.equal(licensed.status, "licensed");
  assert.equal(licensed.upload, "open");
  assert.match(licensed.payment, /did not take or send any payment/);
  card = (await W.view(d, NOW, "label")).genres[0].releases[0];
  assert.equal(card.steps[1].status, "licensed");
  assert.equal(card.steps[1].shown, "licensed");
  assert.equal(card.steps[1].proof_link, LICENCE.licence_pdf_url);
  assert.equal(card.steps[2].status, "todo");
  assert.equal(card.licence.drive_folder_url, LICENCE.drive_folder_url);
  const uploaded = await call(d, "release_step", { bot: "Drop", workspace: "label", song: made.id, step: "upload", status: "done", link: "https://example.com/routenote" });
  assert.equal(uploaded.status, "done");
  const listed = await call(d, "releases", { bot: "Licence", workspace: "label" });
  assert.equal(listed.workspace, "label");
  assert.equal(listed.releases[0].steps[1].key, "licence");
  assert.equal(listed.releases[0].steps[1].status, "licensed");
  assert.equal(listed.releases[0].steps[1].proof_link, LICENCE.licence_pdf_url);
  assert.equal(listed.releases[0].steps[2].status, "done");
  await rejects(W.workspaceAct(d, NOW, { by: "Luke", action: "mark_licence", step: "licence" }), /Only the Licence bot or Nova/);
});

test("farm posts and label spend and payouts stay out of the official numbers", async () => {
  const d = memoryDesk();
  const growthBefore = await S.listGrowth(d, NOW);
  const spendBefore = await S.listSpend(d, NOW);
  const incomeBefore = JSON.stringify((await S.incomeState(d, NOW)).received);
  await call(d, "log_growth", { bot: "Steve", date: "2026-11-17", workspace: "farm", farm: "account", platform: "TikTok", handle: "northwind.wav", niche: "covers", songs: "Northwind", owner: "Nova", page_status: "active" });
  await call(d, "log_growth", { bot: "Kevin", date: "2026-11-17", workspace: "farm", farm: "post", platform: "TikTok", handle: "northwind.wav", song: "Northwind", content_type: "clip", views: "1200", likes: "40", post_link: "https://example.com/farm" });
  const farm = await W.view(d, NOW, "farm");
  assert.equal(farm.note, W.FARM_NOTE);
  assert.equal(farm.accounts.length, 1);
  assert.equal(farm.posts.length, 1);
  assert.equal(farm.rollups.viewsPerSong[0].song, "Northwind");
  assert.equal(farm.accounts[0].status, "active");
  const spend = await call(d, "record_spend", { bot: "Forge", workspace: "label", platform: "Meta", genre: "UK garage", date: "2026-11-17", amount: 10, currency: "USD" });
  assert.match(spend.note, /Not counted in the USD 1,000 cap/);
  assert.equal((await W.view(d, NOW, "label")).genres[0].stats.roi, "pending");
  await call(d, "submit_income", { bot: "Ledger", workspace: "label", genre: "UK garage", date: "2026-11-17", payer: "Northwind", amount: 4, currency: "USD", account: "Statement only" });
  const stats = (await W.view(d, NOW, "label")).genres[0].stats;
  assert.equal(stats.roi, "0.40");
  assert.deepEqual(await S.listGrowth(d, NOW), growthBefore);
  assert.deepEqual(await S.listSpend(d, NOW), spendBefore);
  assert.equal(JSON.stringify((await S.incomeState(d, NOW)).received), incomeBefore);
  await rejects(call(d, "record_spend", { bot: "Forge", platform: "Meta", genre: "UK garage", date: "2026-11-17", amount: 1, currency: "USD" }), /not in the USD 1,000 cap/);
});

test("a Farm or Label card uses the Needs you header and stays off the BADSCANDAL list", async () => {
  const d = memoryDesk();
  const official = await C.saveCard(d, NOW, S.DEFAULT_ROSTER, { by: "Nova", kind: "message", text: "Send the official sample note.", dedupe_key: "off-1", action: "send the note" });
  const label = await call(d, "send_message", { bot: "Nova", to: "Luke", text: "card", card: { kind: "other", text: "Order the sample licence. HQ does not take payment.", dedupe_key: "lab-1", action: "order the licence", workspace: "label", owner: "Nova" } });
  assert.match(label.note, /Label Needs you/);
  assert.match(label.note, /not on the BADSCANDAL Needs you/);
  const farm = await C.saveCard(d, NOW, S.DEFAULT_ROSTER, { by: "Nova", kind: "other", text: "Confirm the sample farm page is only a record.", dedupe_key: "farm-1", action: "confirm the page", workspace: "farm" });
  const shown = C.presentLuke([official, { ...farm, waitingOn: "luke", status: "open" }], false, NOW);
  assert.deepEqual(shown.needsYou.map((c) => c.id), [official.id]);
  const labelView = await W.view(d, NOW, "label");
  assert.equal(labelView.auto.header, "1 need you · nothing at risk");
  assert.equal(labelView.auto.needsYou.length, 1);
  assert.equal(labelView.auto.needsYou[0].text, "Order the sample licence. HQ does not take payment.");
  const farmView = await W.view(d, NOW, "farm");
  assert.equal(farmView.auto.needsYou.length, 1);
  assert.equal(farmView.auto.needsYou[0].id, farm.id);
  assert.equal(farmView.auto.needsYou.some((c) => c.id === official.id), false);
  const sample = W.sampleWorkspace("label", NOW);
  assert.match(sample.auto.header, /need you/);
  assert.equal(sample.auto.needsYou.length, 1);
  assert.equal(sample.auto.needsYou[0].id, "klabelsample");
  assert.equal(W.sampleWorkspace("farm", NOW).auto.needsYou.some((c) => c.id === "klabelsample"), false);
});
