/* Nova's list of 17 Nov 2026 (Luke's decisions of the night). The parts under the release page:
   - B: a Spotify Canvas link in the pack (Luke fills it); Atlas's step "Spotify Canvas uploaded" only when there is one
   - C: a song released before HQ: "no pack needed", so nothing shows as missing and nobody chases it
   - a release missing one of the pipeline's steps gets it (Me Dá Seu Body had no YouTube step)
   - F: Revolut stops saying "not connected" after any read where an account worked
   - G: log_growth takes channel views and Shorts views; "Kevin (TikTok)" on the sheet is Kevin
   - D: Nova fixes a bot's job card (duty, schedule, times) on the desk, without the private seed
   Every name and date here is made up. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";
import { teamReport, dutiesReport } from "../netlify/lib/hq.mjs";

const NOW = Date.parse("2026-11-17T15:00:00Z");
const TODAY = "2026-11-17";
const R = S.DEFAULT_ROSTER;
const fails = (p, re) => assert.rejects(p, (e) => e.name === "StaffError" && re.test(e.message));
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args) => callTool(tool(name), args, { store: d, now: NOW, role: "bot", hq: async () => null });
const PACK = { kind: "Self-release", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", language: "English", explicit: "No", genre: "Dance",
  writers: "Sample Writer: music and lyrics", copyright: "℗ 2026 badscandal · © 2026 badscandal" };
async function sent(d, title, date, pack = PACK) { const r = await S.saveRelease(d, NOW, R, { by: "Luke", title, date, pack }); return (await S.sendRelease(d, NOW, R, { by: "Luke", id: r.id })).release; }
const rel = async (d, id) => (await S.listReleases(d)).find((x) => x.id === id);
const step = (r, k) => r.steps.find((s) => s.key === k);

test("Spotify Canvas: a pack link Luke fills; Atlas's step applies only when there is one", async () => {
  const f = S.PACK_FIELDS.find((x) => x.key === "canvas");
  assert.deepEqual([f.kind, f.required, f.fill], ["link", false, []]);
  const d = memoryDesk();
  const r = await sent(d, "Night Drive", "2026-12-11");
  assert.deepEqual([step(r, "canvas").owner, step(r, "canvas").status], ["Atlas", "skipped"]);
  await S.saveRelease(d, NOW, R, { by: "Luke", id: r.id, pack: { canvas: "https://example.com/canvas.mp4" } });
  const v = S.releaseView(await rel(d, r.id), TODAY);
  const c = v.steps.find((s) => s.key === "canvas");
  assert.deepEqual([c.status, c.waiting, c.label], ["todo", true, "Spotify Canvas uploaded"], "waits for Spotify for Artists, then due a week after the release at the latest");
  assert.equal(c.due, "2026-12-18");
});

test("pre-HQ: a song released before HQ shows nothing missing, and no bot is asked for its pack", async () => {
  const d = memoryDesk();
  const r = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Paper Moon", date: "2026-11-27", pack: { kind: "Self-release", prehq: "Yes" } });
  const v = S.releaseView(r, TODAY);
  assert.deepEqual(v.missing, []);
  assert.match(v.where, /before HQ/);
  const sent2 = await S.sendRelease(d, NOW, R, { by: "Luke", id: r.id });
  assert.equal(sent2.release.status, "scheduled", "sent without asking for the pack");
  assert.ok(!S.releaseView(sent2.release, TODAY).warnings.some((w) => /missing|without/i.test(w)));
});

test("a release missing one of the pipeline's steps gets it, once", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Night Drive", "2026-12-11");
  await d.setJSON("releases.json", (await S.listReleases(d)).map((x) => ({ ...x, steps: x.steps.filter((s) => s.key !== "video") })));
  const up = await S.upgradeReleases(d, NOW);
  assert.deepEqual(up.changed.map((x) => x.id), [r.id]);
  const v = step(await rel(d, r.id), "video");
  assert.deepEqual([v.owner, v.status, v.due], ["Laura", "todo", "2026-12-04"]);
  assert.deepEqual((await S.upgradeReleases(d, NOW)).changed, []);
});

test("log_growth: channel views and Shorts views", async () => {
  const d = memoryDesk();
  const r = await call(d, "log_growth", { bot: "Laura", platform: "YouTube", date: "2026-11-16", followers: "1000", channel_views: "5,400", shorts_views: "2100" });
  assert.equal(r.saved, true);
  const row = (await S.listGrowth(d, NOW, 1)).find((x) => x.key === "g:youtube");
  assert.deepEqual([row.channel_views, row.shorts_views], [5400, 2100]);
  assert.ok(tool("log_growth").inputSchema.properties.shorts_views);
});

test("'Kevin (TikTok)' on the sheet is Kevin: his tasks and duties reach his card", () => {
  const t = teamReport([{ id: "T-50", owner: "Kevin (TikTok)", task: "Made-up task", deadline: "", status: "todo" }], [], TODAY);
  assert.equal(t.tasks[0].owner, "Kevin");
  const du = dutiesReport([{ id: "D-laura-1", owner: "Laura (YouTube)", task: "Log YouTube", deadline: "", status: "todo" }], TODAY);
  assert.equal(du.byOwner[0].owner, "Laura");
});

test("roster_card: Nova fixes a bot's job card on the desk; others can't", async () => {
  const d = memoryDesk();
  const r = await call(d, "roster_card", { bot: "Nova", for: "Drop", duty: "Where every release is at the distributor (no royalties: that is Ledger's)", time: "09:20",
    schedule: [{ time: "09:20", what: "store_status for every unreleased song" }], why: "Gets each self-release into the stores on time." });
  assert.equal(r.saved, true);
  const drop = (await S.getRoster(d)).find((b) => b.name === "Drop");
  assert.deepEqual([drop.duty, drop.time, drop.schedule.length], ["Where every release is at the distributor (no royalties: that is Ledger's)", "09:20", 1]);
  const md = await call(d, "my_day", { bot: "Drop" });
  assert.match(md.daily_duty, /no royalties/);
  await fails(call(d, "roster_card", { bot: "Kevin", for: "Drop", duty: "x" }), /Nova/);
  await fails(call(d, "roster_card", { bot: "Nova", for: "Drop", time: "9am" }), /HH:MM/);
});
