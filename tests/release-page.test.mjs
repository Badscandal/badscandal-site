/* The release page (17 Nov 2026, Nova for Luke: "a single view of the whole release: pack fields and what's missing,
   every bot's steps with status and dates, the ad plan with Luke's notes on what he set up, post-launch results, and a
   checklist that shows when everything is ready"). The rules are HQLib.releasePage; the page only draws them. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const NOW = Date.parse("2026-11-17T15:00:00Z");
const TODAY = "2026-11-17";
const R = S.DEFAULT_ROSTER;
const PACK = { kind: "Self-release", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", language: "English", explicit: "No", genre: "Dance",
  writers: "Sample Writer: music and lyrics", copyright: "℗ 2026 badscandal · © 2026 badscandal" };

async function view(pack = PACK, date = "2026-12-11") {
  const d = memoryDesk();
  const r = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Night Drive", date, pack });
  const s = await S.sendRelease(d, NOW, R, { by: "Luke", id: r.id, anyway: true });
  return S.releaseView(s.release, TODAY);
}

test("releasePage: the checklist (each step, the files, the lyrics, the ad plan), ready only when all are", async () => {
  const v = await view();
  const p = L.releasePage(v, TODAY, { fields: S.packFieldsOut() });
  assert.equal(p.title, "Night Drive");
  assert.equal(p.ready, false);
  assert.match(p.readyText, /^\d+ of \d+ ready$/);
  const by = Object.fromEntries(p.checklist.map((c) => [c.key, c]));
  assert.equal(by.files.ok, true, "every field needed to send is there");
  assert.equal(by.lyrics.ok, false);
  assert.equal(by.adplan.ok, false);
  assert.match(by.adplan.text, /^Ad plan: not written yet/);
  assert.ok(by["step:upload"] && !by["step:canvas"], "a step that doesn't apply is not on the list");
  /* every bot's steps, with owner, day and state */
  const up = p.steps.find((s) => s.key === "upload");
  assert.deepEqual([up.owner, up.label], ["Drop", "Uploaded to RouteNote with the release date"]);
  assert.ok(up.state);
  /* the files: filled, missing, optional */
  const f = Object.fromEntries(p.fields.map((x) => [x.key, x]));
  assert.deepEqual([f.wav.state, f.lyrics.state, f.canvas.state], ["filled", "needed later", "optional"]);
});

test("releasePage: the ad plan is Luke's notes; a pre-HQ song needs no files or lyrics", async () => {
  const v = await view({ ...PACK, adplan: "Meta only, Brazil, 10 USD a day from release day (made up)", lyrics: "la la" });
  const p = L.releasePage(v, TODAY, { fields: S.packFieldsOut() });
  assert.equal(p.adPlan, "Meta only, Brazil, 10 USD a day from release day (made up)");
  assert.equal(p.checklist.find((c) => c.key === "adplan").ok, true);
  const pre = L.releasePage(await view({ kind: "Self-release", prehq: "Yes" }), TODAY, { fields: S.packFieldsOut() });
  assert.equal(pre.checklist.find((c) => c.key === "files").ok, true);
  assert.equal(pre.checklist.find((c) => c.key === "files").text, "Files and details: not needed (released before HQ)");
  assert.ok(!pre.checklist.some((c) => c.key === "lyrics"));
});

test("releasePage: after the release, its numbers", async () => {
  const v = await view(PACK, "2026-11-10");
  const p = L.releasePage({ ...v, released: true }, TODAY, { fields: S.packFieldsOut(), song: { song: "Night Drive", week: 3540, prevWeek: 2100, listeners: 900 } });
  assert.deepEqual(p.results, ["3,540 Spotify streams in the last 7 days (2,100 the 7 before)"]);
  assert.deepEqual(L.releasePage(v, TODAY, { fields: S.packFieldsOut() }).results, []);
});

test("the ad plan field: Luke's notes, never counted as a file to fill", () => {
  const f = S.PACK_FIELDS.find((x) => x.key === "adplan");
  assert.deepEqual([f.kind, f.group, f.required, f.fill], ["text", "notes", false, []]);
});

test("the page: a Release page button on each song card, drawn from releasePage", () => {
  const js = readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8");
  assert.match(js, /data-rel="page"/);
  assert.match(js, /L\.releasePage\(/);
  assert.match(readFileSync(new URL("../hq.html", import.meta.url), "utf8"), /id="relPage"/);
});
