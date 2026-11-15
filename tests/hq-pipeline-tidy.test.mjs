/* The release pipeline, tidied (15 Nov 2026, Luke):
   - "remove all the teaser clips fully im going to build a new section for that later": no teaser steps,
     and the releases already sent lose theirs;
   - the lyrics go on Musixmatch once the song is out: Verse's step waits for the release day, then is due
     a week after it; a lyrics step blocked only because the song isn't on Musixmatch yet is open again;
   - "forge should be after webmaster": the ads link to the song page (badscandal.com/<song>, the Meta
     pixel), so Forge's step waits until Webmaster's page is live;
   - "badscandal should never be capatalised";
   - a bot's long note in a warning ends with "…" where it was cut. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, INSTRUCTIONS } from "../netlify/lib/staff-tools.mjs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const NOW = Date.parse("2026-11-15T15:00:00Z"); /* Sun 15 Nov, 12:00 in São Paulo */
const TODAY = "2026-11-15";
const DAY = 86400000;
const R = S.DEFAULT_ROSTER;
const fails = (p, re) => assert.rejects(p, (e) => e.name === "StaffError" && re.test(e.message));
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, now = NOW) => callTool(tool(name), args, { store: d, now, role: "bot", hq: async () => null });
const PACK = { kind: "Self-release", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", language: "Portuguese", explicit: "No", genre: "Dance", writers: "Sample Writer: music and lyrics", copyright: "℗ 2026 sample · © 2026 sample" };
async function sent(d, title = "Night Drive", date = "2026-12-11", now = NOW) {
  const r = await S.saveRelease(d, now, R, { by: "Luke", title, date, pack: PACK });
  return (await S.sendRelease(d, now, R, { by: "Luke", id: r.id })).release;
}
const stored = async (d, id) => (await S.listReleases(d)).find((x) => x.id === id);
const view = async (d, id, today = TODAY) => S.releaseView(await stored(d, id), today);
const step = (v, key) => v.steps.find((s) => s.key === key);
/* a release as the desk kept it before 15 Nov 2026: lyrics 10 days before release, and the four teaser steps */
const OLD_TEASERS = [
  { key: "teasers", label: "Teaser clips approved for posting", owner: "Luke" },
  { key: "teaser_tiktok", label: "Teaser posted on TikTok", owner: "Kevin" },
  { key: "teaser_instagram", label: "Teaser posted on Instagram", owner: "Steve" },
  { key: "teaser_youtube", label: "Teaser posted on YouTube", owner: "Laura" }];
function oldStyle(r, lyrics = {}) {
  const steps = r.steps.filter((s) => s.key !== "lyrics");
  const ly = { key: "lyrics", label: "Lyrics live", owner: "Verse", due: "2026-11-14", status: "todo", note: "", link: "", at: null, by: null, ...lyrics };
  steps.splice(4, 0, ly); /* where it used to be: after the pitch */
  const at = steps.findIndex((s) => s.key === "ads");
  steps.splice(at, 0, ...OLD_TEASERS.map((t) => ({ ...t, due: "2026-12-08", status: "todo", note: "", link: "", at: null, by: null })));
  return { ...r, steps };
}

test("the pipeline: no teaser steps, the ads after the song page, the lyrics a week after the release", () => {
  assert.deepEqual(S.RELEASE_STEPS.map((s) => s.key), ["upload", "approved", "spotify", "pitch", "page", "video", "ads", "live", "lyrics"]);
  assert.ok(!S.RELEASE_STEPS.some((s) => /teaser/.test(s.key) || s.owner === "Luke"));
  const steps = S.scheduleSteps("2026-12-11", TODAY).steps;
  assert.deepEqual(steps.map((s) => [s.key, s.due]).slice(-3), [["ads", "2026-12-10"], ["live", "2026-12-11"], ["lyrics", "2026-12-18"]]);
  assert.deepEqual(S.releaseStepsOut().find((s) => s.key === "lyrics"), { key: "lyrics", label: "Lyrics live on Musixmatch", owner: "Verse", days: -7, fromRelease: true });
  assert.deepEqual(S.releaseStepsOut().find((s) => s.key === "ads"), { key: "ads", label: "Ad drafts ready, inside the cap", owner: "Forge", days: 1, after: "page" });
  /* the page says it the same way */
  assert.match(L.stepsSummary(S.releaseStepsOut()), /1 ad drafts\. After it: lyrics within 7 days\.$/);
});

test("releases already sent lose the teaser steps and get the lyrics after the release, once; finished work is kept", async () => {
  const d = memoryDesk();
  const a = await sent(d, "Night Drive", "2026-12-11");
  const b = await sent(d, "Me Da Seu Body", "2026-11-24");
  const c = await sent(d, "Done Lyrics", "2027-01-08");
  await S.saveRelease(d, NOW, R, { by: "Luke", title: "A Draft", date: "2027-01-22", pack: { kind: "Self-release" } });
  const gone = await sent(d, "Gone Song", "2027-02-05");
  await S.cancelRelease(d, NOW, R, { by: "Luke", id: gone.id });
  const BLOCK = "Luke approved the final text and asked to submit after the release. Track still isn't on the Musixmatch artist page.";
  const list = (await S.listReleases(d)).map((r) => (r.id === b.id ? oldStyle(r, { status: "blocked", note: BLOCK, by: "Verse" })
    : r.id === c.id ? oldStyle(r, { status: "done", by: "Verse", at: "2026-11-10T12:00:00Z" }) : r.steps && r.steps.length ? oldStyle(r) : r));
  await d.setJSON("releases.json", list);
  const upload = JSON.stringify((await stored(d, a.id)).steps.find((s) => s.key === "upload"));

  const up = await S.upgradeReleases(d, NOW);
  assert.deepEqual(up.changed.map((x) => x.title).sort(), ["Done Lyrics", "Gone Song", "Me Da Seu Body", "Night Drive"], "the draft has no steps: nothing to change");
  for (const id of [a.id, b.id, c.id]) assert.deepEqual((await stored(d, id)).steps.map((s) => s.key), S.RELEASE_STEPS.map((s) => s.key), "no teaser steps, in the pipeline's order");
  assert.equal(JSON.stringify((await stored(d, a.id)).steps.find((s) => s.key === "upload")), upload, "the other steps are untouched");
  /* Night Drive: the lyrics a week after its day */
  const na = step(await stored(d, a.id), "lyrics");
  assert.deepEqual([na.label, na.due, na.status], ["Lyrics live on Musixmatch", "2026-12-18", "todo"]);
  assert.match((await stored(d, a.id)).log.at(-1).what, /^HQ took off the teaser steps and the lyrics go on Musixmatch after the release \(due Fri 18 Dec\) \(Luke, 15 Nov 2026\)$/);
  /* Me Dá Seu Body: Verse's "blocked" was only the song not being out yet: open again, waiting for 24 Nov */
  const mb = await view(d, b.id);
  assert.deepEqual([step(mb, "lyrics").status, step(mb, "lyrics").note, step(mb, "lyrics").due, step(mb, "lyrics").waiting], ["todo", "", "2026-12-01", true]);
  assert.ok(!mb.warnings.some((w) => /Lyrics/.test(w)), mb.warnings.join("\n"));
  /* finished lyrics are only renamed */
  const cl = step(await stored(d, c.id), "lyrics");
  assert.deepEqual([cl.label, cl.status, cl.due, cl.by], ["Lyrics live on Musixmatch", "done", "2026-11-14", "Verse"]);
  /* a cancelled song loses the teaser steps too, nothing else */
  assert.ok(!(await stored(d, gone.id)).steps.some((s) => /teaser/.test(s.key)));
  /* once: the second time reads and writes nothing */
  const etag = d._map.get("releases.json").etag;
  assert.deepEqual((await S.upgradeReleases(d, NOW + DAY)).changed, []);
  assert.equal(d._map.get("releases.json").etag, etag);
});

test("the tools bring an old release up to date before answering: Verse's lyrics wait, nobody has a teaser step", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Night Drive", "2026-11-24");
  await d.setJSON("releases.json", (await S.listReleases(d)).map((x) => oldStyle(x, { status: "blocked", note: "not on Musixmatch yet", by: "Verse" })));
  const day = await call(d, "my_day", { bot: "Verse" });
  const ly = day.release_steps.find((s) => s.step === "lyrics");
  assert.deepEqual([ly.song, ly.state, ly.label], ["Night Drive", "waiting", "Lyrics live on Musixmatch"]);
  assert.match(ly.waiting_for, /^the release day: then check Musixmatch every day/);
  assert.deepEqual((await call(d, "my_day", { bot: "Kevin" })).release_steps || [], []);
  assert.equal((await stored(d, r.id)).steps.length, 9);
});

test("Verse's lyrics: waiting before the release day (done refused), open from it, late a week after", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Night Drive", "2026-11-27");
  await fails(S.setStep(d, NOW, R, { by: "Verse", id: r.id, step: "lyrics", status: "done" }), /waits for the release day \(Fri 27 Nov\): the lyrics go on Musixmatch once the song is out and shows there\. Not showing yet is not a block\./);
  assert.equal(step(await view(d, r.id, "2026-11-26"), "lyrics").waitingText, "waiting: starts on the release day, once the song shows on Musixmatch");
  const out = await view(d, r.id, "2026-11-27");
  assert.deepEqual([step(out, "lyrics").waiting, step(out, "lyrics").late, step(out, "lyrics").due], [false, false, "2026-12-04"]);
  assert.equal(step(await view(d, r.id, "2026-12-05"), "lyrics").late, true);
  const done = await S.setStep(d, Date.parse("2026-11-28T15:00:00Z"), R, { by: "Verse", id: r.id, step: "lyrics", status: "done", link: "https://example.com/musixmatch" });
  assert.equal(step(done, "lyrics").status, "done");
});

test("Forge's ads wait for Webmaster's song page; once it is live they keep their own day", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Night Drive", "2026-12-11");
  const v = await view(d, r.id);
  assert.deepEqual([step(v, "ads").waiting, step(v, "ads").waitingFor, step(v, "ads").waitingText], [true, "page", "waiting: the song page is not live yet (the ads link to it)"]);
  await fails(S.setStep(d, NOW, R, { by: "Forge", id: r.id, step: "ads", status: "done" }), /is waiting for "Song page live on badscandal\.com" \(Webmaster\).*The ads link to the song page \(badscandal\.com\/<song>, with the Meta pixel\)/);
  const forge = await call(d, "my_day", { bot: "Forge" });
  assert.match(forge.release_steps.find((s) => s.step === "ads").waiting_for, /^Webmaster's song page \(badscandal\.com\/<song>\) to be live/);
  await S.setStep(d, NOW, R, { by: "Webmaster", id: r.id, step: "page", status: "done", link: "https://badscandal.com/nightdrive" });
  const after = await view(d, r.id);
  assert.deepEqual([step(after, "ads").waiting, step(after, "ads").due], [false, "2026-12-10"], "freed early: still the day before release, not today");
  /* the pitch still goes the day the song shows in Spotify for Artists */
  await S.setStep(d, NOW, R, { by: "Atlas", id: r.id, step: "spotify", status: "done" });
  assert.equal(step(await view(d, r.id), "pitch").due, TODAY);
});

test("the bots' instructions, the roster and the tool say it the new way", () => {
  assert.match(INSTRUCTIONS, /The artist name is badscandal, all lowercase, everywhere/);
  assert.match(INSTRUCTIONS, /Forge and Webmaster: every ad links to the song's own page, badscandal\.com\/<song>, which carries the Meta pixel/);
  assert.match(INSTRUCTIONS, /Verse: the lyrics go on Musixmatch only once the song is out and shows there/);
  assert.doesNotMatch(INSTRUCTIONS, /post the teaser|release_step due/);
  assert.match(INSTRUCTIONS, /There are no teaser steps on releases any more/);
  const rs = tool("release_step");
  assert.ok(!("due" in rs.inputSchema.properties));
  assert.deepEqual(rs.inputSchema.required, ["bot", "song", "step", "status"]);
  assert.doesNotMatch(rs.description, /teaser/i);
  assert.equal(R.find((b) => b.name === "Verse").duty, "Lyrics on Musixmatch once each song is out");
  assert.match(S.PACK_FIELDS.find((f) => f.key === "copyright").hint, /℗ 2026 badscandal · © 2026 badscandal/);
});

test("a long note in a warning is cut at a word and ends with …", () => {
  const note = "Luke approved the final text and on 15 Nov asked to submit after the 24 Nov release. Track still isn't on the artist page. Will check again every morning and report back.";
  const v = { status: "scheduled", date: "2026-12-11", daysToGo: 26, steps: [{ key: "upload", label: "Uploaded to RouteNote with the release date", owner: "Drop", status: "blocked", note }], missing: [] };
  const w = S.warningsOf(v, null, TODAY)[0].text;
  assert.ok(w.endsWith("…"), w);
  assert.ok(!/\s…$/.test(w) && w.length <= "Uploaded to RouteNote with the release date is blocked (Drop): ".length + 160, w);
  const short = S.warningsOf({ ...v, steps: [{ ...v.steps[0], note: "Needs the cover" }] }, null, TODAY)[0].text;
  assert.equal(short, "Uploaded to RouteNote with the release date is blocked (Drop): Needs the cover");
});
