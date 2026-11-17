/* A4 (17 Nov 2026, Nova): automatic chasing. Once an hour (07:00 to 22:00 São Paulo) HQ reminds a bot ONCE a day
   about each of its late duties and late release steps; still not done 2 hours after that reminder, Nova gets
   ONE message to chase or escalate (a late duty of Nova's own goes to Luke). Nova only escalates.
   Made-up names, songs and times only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";

const R = S.DEFAULT_ROSTER;
const at = (hm) => Date.parse(`2026-11-17T${hm}:00-03:00`); /* São Paulo */
const duty = (owner, id, task, due, late = true, status = "todo") => ({ id, owner, task, due, late, status });
const duties = (...items) => ({ byOwner: [{ items }] });
const msgs = async (d, now) => (await S.listMessages(d, now)).filter((m) => m.from === "HQ");

test("a late duty: one reminder to the bot, the same day never twice", async () => {
  const d = memoryDesk();
  const hq = { team: { duties: duties(duty("Kevin", "D-7", "Log TikTok numbers", "09:00")) } };
  const r1 = await S.chaseLate(d, at("10:05"), R, { hq });
  assert.deepEqual(r1.nudged, ["Kevin: Log TikTok numbers"]);
  const m = (await msgs(d, at("10:05")))[0];
  assert.equal(m.to, "Kevin");
  assert.match(m.text, /^Reminder: your duty "Log TikTok numbers" was due at 09:00 and isn't done yet\./);
  assert.match(m.text, /post_update/);
  const r2 = await S.chaseLate(d, at("11:05"), R, { hq });
  assert.deepEqual(r2.nudged, []);
  assert.equal((await msgs(d, at("11:05"))).length, 1);
});
test("still not done 2 hours after the reminder: Nova gets ONE message; done in time: nothing", async () => {
  const d = memoryDesk();
  const late = { team: { duties: duties(duty("Kevin", "D-7", "Log TikTok numbers", "09:00"), duty("Steve", "D-8", "Log Instagram numbers", "09:00")) } };
  await S.chaseLate(d, at("10:05"), R, { hq: late });
  const later = { team: { duties: duties(duty("Kevin", "D-7", "Log TikTok numbers", "09:00"), duty("Steve", "D-8", "Log Instagram numbers", "09:00", false, "done")) } };
  assert.deepEqual((await S.chaseLate(d, at("11:05"), R, { hq: later })).escalated, [], "not 2 hours yet");
  const r = await S.chaseLate(d, at("12:05"), R, { hq: later });
  assert.deepEqual(r.escalated, ["Kevin: Log TikTok numbers"]);
  const toNova = (await msgs(d, at("12:05"))).filter((m) => m.to === "Nova");
  assert.equal(toNova.length, 1);
  assert.equal(toNova[0].needs, "action");
  assert.match(toNova[0].text, /^Kevin still hasn't done "Log TikTok numbers" \(due 09:00\), 2 hours after HQ's reminder\. Chase Kevin, or tell Luke if it needs him\./);
  assert.deepEqual((await S.chaseLate(d, at("13:05"), R, { hq: later })).escalated, []);
});
test("a blocked duty is not chased (the blocker is already said); Nova's own late duty goes to Luke", async () => {
  const d = memoryDesk();
  const hq = { team: { duties: duties(duty("Laura", "D-9", "Log YouTube", "09:00", false, "blocked"), duty("Nova", "D-1", "Reset the duties", "07:00")) } };
  const r = await S.chaseLate(d, at("10:05"), R, { hq });
  assert.deepEqual(r.nudged, ["Nova: Reset the duties"]);
  await S.chaseLate(d, at("12:10"), R, { hq });
  const toLuke = (await msgs(d, at("12:10"))).filter((m) => m.to === "Luke");
  assert.equal(toLuke.length, 1);
  assert.match(toLuke[0].text, /^Nova still hasn't done "Reset the duties"/);
});
test("late release steps are chased too (not waiting, blocked or skipped ones)", async () => {
  const d = memoryDesk();
  const releases = [{ id: "papermoon", title: "Paper Moon", status: "scheduled", date: "2026-11-27", daysToGo: 10, steps: [
    { key: "upload", label: "Uploaded to RouteNote with the release date", owner: "Drop", due: "2026-11-14", status: "todo", late: true },
    { key: "pitch", label: "Spotify pitch sent", owner: "Atlas", due: "2026-11-15", status: "todo", late: false, waiting: true },
    { key: "page", label: "Song page live", owner: "Webmaster", due: "2026-11-16", status: "blocked", late: true },
  ] }];
  const r = await S.chaseLate(d, at("10:05"), R, { releases });
  assert.deepEqual(r.nudged, ["Drop: Paper Moon: Uploaded to RouteNote with the release date"]);
  const m = (await msgs(d, at("10:05")))[0];
  assert.match(m.text, /^Reminder: "Uploaded to RouteNote with the release date" for Paper Moon was due Sat 14 Nov and isn't done yet\./);
  assert.match(m.text, /release_step/);
});
test("quiet hours and paused bots: nothing", async () => {
  const d = memoryDesk();
  const hq = { team: { duties: duties(duty("Kevin", "D-7", "Log TikTok numbers", "06:00")) } };
  assert.deepEqual((await S.chaseLate(d, at("06:30"), R, { hq })).nudged, []);
  assert.deepEqual((await S.chaseLate(d, at("22:30"), R, { hq })).nudged, []);
  const paused = R.map((b) => (b.name === "Kevin" ? { ...b, state: "paused" } : b));
  assert.deepEqual((await S.chaseLate(d, at("10:00"), paused, { hq })).nudged, []);
  /* no sheet read and no releases: nothing, no error */
  assert.deepEqual(await S.chaseLate(d, at("10:00"), R, {}), { nudged: [], escalated: [] });
});
test("the hourly job runs it; the bots are told", () => {
  const js = readFileSync(new URL("../netlify/functions/pushhourly.mjs", import.meta.url), "utf8");
  assert.match(js, /chaseLate/);
  assert.match(js, /loadHq/);
});
