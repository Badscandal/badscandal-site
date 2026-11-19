/* Profile masters (18 Nov 2026). Made-up pictures only: a PNG header with a width and a height,
   the same way the cover upload is checked. No platform is called. HQ never sends a file out. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import * as P from "../netlify/lib/profile-images.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, toolsFor } from "../netlify/lib/staff-tools.mjs";

const NOW = Date.parse("2026-11-18T15:00:00Z");
const R = S.DEFAULT_ROSTER;
const png = (w, h) => {
  const b = Buffer.alloc(32);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};
const b64 = (w, h) => png(w, h).toString("base64");
const spec = (id) => S.profileSpec(S.PROFILE_SLOTS.find((s) => s.id === id));
const openToLuke = async (d, now = NOW) => (await S.listMessages(d, now)).filter((m) => m.to === "Luke" && m.needs === "decision" && !m.resolved);

test("a matching shape is scaled down, a small one is not scaled up, and a different shape is not cropped", () => {
  const ig = spec("instagram-photo");
  assert.deepEqual(ig.exact, [320, 320]);
  const fit = S.profilePlan(2000, 2000, ig);
  assert.equal(fit.fit, true);
  assert.deepEqual(fit.out, [320, 320]);
  const small = S.profilePlan(100, 100, ig);
  assert.equal(small.fit, false);
  assert.equal(small.problem, "small");
  const wide = S.profilePlan(4000, 1714, spec("spotify-header"));
  assert.equal(wide.fit, true, wide.reason);
  assert.deepEqual(wide.out, [2660, 1140]);
  const yt = S.profilePlan(4000, 1714, spec("youtube-banner"));
  assert.equal(yt.fit, false);
  assert.equal(yt.problem, "ratio");
  assert.deepEqual(yt.out, [2560, 1440]);
  assert.match(yt.reason, /nothing was cropped/i);
  assert.deepEqual(spec("facebook-cover").exact, [851, 315], "the fast-loading size, not a new recommended rule");
  assert.deepEqual(spec("tiktok-photo").exact, [720, 720]);
  assert.deepEqual(spec("deezer-photo").exact, [1200, 1200]);
  assert.deepEqual(spec("tidal-photo").exact, [1500, 1500]);
  assert.deepEqual(spec("apple-image").exact, [800, 800]);
});

test("a small master asks Luke once and opens no crop job", async () => {
  const d = memoryDesk();
  const first = await P.saveProfileMaster(d, NOW, R, { by: "Luke", kind: "photo", image_base64: b64(100, 100) });
  assert.equal(first.width, 100);
  assert.ok(first.slots.every((s) => s.fit === false));
  assert.equal((await S.getProfiles(d)).jobs.length, 0, "a square that is only too small is not given to a bot to crop");
  const asks = await openToLuke(d);
  assert.equal(asks.length, 1);
  assert.match(asks[0].text, /100 x 100/);
  assert.match(asks[0].text, /not scaled up/);
  assert.match(asks[0].text, /Deezer \(1200 x 1200\)/);
  assert.match(asks[0].text, /TIDAL \(1500 x 1500\)/);
  assert.deepEqual(asks[0].options, ["I'll upload a bigger one", "Leave it"]);
  await P.saveProfileMaster(d, NOW + 1000, R, { by: "Luke", kind: "photo", image_base64: b64(100, 100) });
  assert.equal((await openToLuke(d, NOW + 1000)).length, 1, "the same small photo does not ask again");
  const file = await P.profileFileResponse(d, "master-photo");
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("content-type"), "image/png");
  assert.equal(file.headers.get("cache-control"), "private, no-store");
  assert.equal((await P.profileFileResponse(d, "master-banner")).status, 404);
  assert.equal((await P.profileFileResponse(d, "../covers/x")).status, 404);
});

test("a banner that does not fit becomes a job; the fitting copy is stored only at the exact size", async () => {
  const d = memoryDesk();
  const saved = await P.saveProfileMaster(d, NOW, R, { by: "Luke", kind: "banner", image_base64: b64(4000, 1714) });
  const spot = saved.slots.find((s) => s.id === "spotify-header");
  const yt = saved.slots.find((s) => s.id === "youtube-banner");
  assert.equal(spot.fit, true);
  assert.equal(yt.fit, false);
  assert.match(yt.reason, /nothing was cropped/i);
  const jobs = (await S.getProfiles(d)).jobs.filter((j) => j.status === "open");
  assert.ok(jobs.some((j) => j.slot === "youtube-banner"));
  assert.ok(!jobs.some((j) => j.slot === "spotify-header"));
  await assert.rejects(() => P.saveProfileVersion(d, NOW, R, { by: "Luke", slot: "youtube-banner", image_base64: b64(2560, 1440), source: "resized" }), /nothing was cropped/i);
  const copy = await P.saveProfileVersion(d, NOW, R, { by: "Luke", slot: "spotify-header", image_base64: b64(2660, 1140), source: "resized" });
  assert.equal(copy.saved, true);
  const view = S.profilesView(await S.getProfiles(d), []);
  const header = view.platforms.find((p) => p.platform === "Spotify").slots.find((s) => s.id === "spotify-header");
  assert.equal(header.status, "ready");
  assert.match(header.statusLine, /2660 x 1140/);
  const banner = view.platforms.find((p) => p.platform === "YouTube").slots.find((s) => s.id === "youtube-banner");
  assert.equal(banner.status, "rework");
  assert.match(banner.statusLine, /Needs rework/);
  const laura = await callTool(TOOLS.find((t) => t.name === "profile_jobs"), { bot: "Laura" }, { store: d, now: NOW, role: "bot" });
  assert.ok(laura.jobs.some((j) => j.slot === "youtube-banner" && j.exact[0] === 2560 && j.exact[1] === 1440));
  assert.ok(!laura.jobs.some((j) => j.slot === "spotify-header"));
  const kevin = await callTool(TOOLS.find((t) => t.name === "profile_jobs"), { bot: "Kevin" }, { store: d, now: NOW, role: "bot" });
  assert.ok(!kevin.jobs.some((j) => j.platform === "YouTube"));
  const master = await callTool(TOOLS.find((t) => t.name === "profile_master"), { bot: "Laura", slot: "youtube-banner" }, { store: d, now: NOW, role: "bot" });
  assert.equal(master.ready, true);
  assert.match(master.url, /^https:\/\/badscandal\.com\/api\/staff\/profile-file\/master-banner$/);
  assert.match(master.how, /Authorization/);
  assert.match(String((await callTool(TOOLS.find((t) => t.name === "profile_master"), { bot: "Steve", slot: "youtube-banner" }, { store: d, now: NOW, role: "bot" }).catch((e) => ({ error: e.message }))).error), /Laura/);
});

test("a rework must be the exact size; a bad one is not stored and Luke is told once", async () => {
  const d = memoryDesk();
  await P.saveProfileMaster(d, NOW, R, { by: "Luke", kind: "banner", image_base64: b64(4000, 1714) });
  const bad = await callTool(TOOLS.find((t) => t.name === "profile_rework"), { bot: "Laura", slot: "youtube-banner", image_base64: b64(10, 10) }, { store: d, now: NOW, role: "bot" }).catch((e) => ({ error: e.message }));
  assert.match(bad.error, /exactly 2560 x 1440/);
  assert.equal((await S.getProfiles(d)).versions["youtube-banner"], undefined);
  const asks = (await openToLuke(d)).filter((m) => (m.options || []).includes("Send it back"));
  assert.equal(asks.length, 1);
  assert.match(asks[0].text, /not saved/);
  assert.match(asks[0].text, /nothing was sent to the platform/i);
  await callTool(TOOLS.find((t) => t.name === "profile_rework"), { bot: "Laura", slot: "youtube-banner", image_base64: b64(10, 10) }, { store: d, now: NOW + 5, role: "bot" }).catch(() => null);
  assert.equal((await openToLuke(d, NOW + 5)).filter((m) => (m.options || []).includes("Send it back")).length, 1);
  assert.match(String((await callTool(TOOLS.find((t) => t.name === "profile_rework"), { bot: "Kevin", slot: "youtube-banner", image_base64: b64(2560, 1440) }, { store: d, now: NOW, role: "bot" }).catch((e) => ({ error: e.message }))).error), /Laura/);
  const good = await callTool(TOOLS.find((t) => t.name === "profile_rework"), { bot: "Laura", slot: "youtube-banner", image_base64: b64(2560, 1440) }, { store: d, now: NOW, role: "bot" });
  assert.equal(good.saved, true);
  assert.equal(good.width, 2560);
  let view = S.profilesView(await S.getProfiles(d), []);
  assert.equal(view.platforms.find((p) => p.platform === "YouTube").slots.find((s) => s.id === "youtube-banner").status, "ready");
  assert.ok(!(await S.getProfiles(d)).jobs.some((j) => j.slot === "youtube-banner" && j.status === "open"));
  const marked = await callTool(TOOLS.find((t) => t.name === "profile_uploaded"), { bot: "Laura", slot: "youtube-banner", link: "https://example.com/yt-banner" }, { store: d, now: NOW, role: "bot" });
  assert.match(marked.note, /did not log in/i);
  view = S.profilesView(await S.getProfiles(d), []);
  const slot = view.platforms.find((p) => p.platform === "YouTube").slots.find((s) => s.id === "youtube-banner");
  assert.equal(slot.status, "uploaded");
  assert.match(slot.statusLine, /Live/);
  const rejected = await callTool(TOOLS.find((t) => t.name === "profile_uploaded"), { bot: "Laura", slot: "youtube-banner", rejected: true, note: "The picture was too busy." }, { store: d, now: NOW + 10, role: "bot" });
  assert.equal(rejected.rejected, true);
  view = S.profilesView(await S.getProfiles(d), await S.listMessages(d, NOW + 10));
  const again = view.platforms.find((p) => p.platform === "YouTube").slots.find((s) => s.id === "youtube-banner");
  assert.equal(again.status, "rework");
  assert.match(again.statusLine, /rejected/);
  const no = (await openToLuke(d, NOW + 10)).find((m) => (m.options || []).includes("Make another version"));
  assert.ok(no);
  assert.deepEqual(no.options, ["Make another version", "Leave the current one"]);
  const src = readFileSync(new URL("../netlify/lib/profile-images.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /fetch\(|spotify\.com|youtube\.com|graph\.facebook|instagram\.com/);
});

test("a job open more than a day asks Luke once", async () => {
  const d = memoryDesk();
  await P.saveProfileMaster(d, NOW, R, { by: "Luke", kind: "banner", image_base64: b64(4000, 1714) });
  assert.equal((await P.profileAlerts(d, NOW, R)).asked, false, "a new job is not late");
  const late = await P.profileAlerts(d, NOW + 25 * 60 * 60 * 1000, R);
  assert.equal(late.asked, true);
  const asks = await openToLuke(d, NOW + 25 * 60 * 60 * 1000);
  const stuck = asks.find((m) => (m.options || []).includes("Chase them"));
  assert.ok(stuck);
  assert.match(stuck.text, /more than a day/);
  assert.match(stuck.text, /nothing was sent to the platform/i);
  assert.deepEqual(stuck.options, ["Chase them", "I'll handle it"]);
  assert.equal((await P.profileAlerts(d, NOW + 26 * 60 * 60 * 1000, R)).asked, false);
});

test("the new tools are on the connector for the owners, and the page buttons set their own colours", () => {
  assert.equal(TOOLS.length, 55); /* content_ideas (Spark) + profile image tools plus account_health, needs_you, song_pl (18 Nov 2026 night test) */
  for (const name of ["profile_jobs", "profile_master", "profile_rework", "profile_uploaded"]) {
    assert.ok(TOOLS.some((t) => t.name === name), name);
    assert.ok(toolsFor("Atlas", R).some((t) => t.name === name), name);
    assert.ok(toolsFor("Laura", R).some((t) => t.name === name), name);
    assert.ok(toolsFor("Kevin", R).some((t) => t.name === name), name);
    assert.ok(!toolsFor("Drop", R).some((t) => t.name === name), name);
  }
  const page = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../hq-sw.js", import.meta.url), "utf8");
  assert.match(page, /-webkit-appearance:\s*none/);
  assert.match(page, /background-color:#1a1d27;color:#f2f2f2/);
  assert.match(page, /color-scheme:\s*dark/);
  assert.match(page, /id="profPhoto"/);
  assert.match(page, /id="profBanner"/);
  assert.match(sw, /var CACHE = "bs-hq-v16"/); /* v16: Needs you. v15: Luke's screens. */
  const fn = readFileSync(new URL("../netlify/functions/staff.mjs", import.meta.url), "utf8");
  assert.match(fn, /profile_rework/);
  assert.match(fn, /profile-file/);
  assert.match(fn, /Only Luke uploads a master/);
});
