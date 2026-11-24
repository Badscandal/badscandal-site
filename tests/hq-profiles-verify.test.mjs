/* Profiles, checked (24 Nov 2026). Luke: "deezer is showing up as green with a green ring around it but the bots ...
   should be checking my profiles for each platform and making sure that's my profile photo after i submit a new upload
   ... if it doesn't upload there or isn't uploaded there it should be a yellow or red ring indicating the reason ...
   if its a login issue the circle should be yellow and the bot's name ... if there's an issue it should only show in
   the HQ ... the bot should also take a screengrab of the photo that's on that profile and put that in the ring".
   Made-up pictures (a PNG header), made-up notes and links. No platform is ever called. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import * as S from "../netlify/lib/staff.mjs";
import * as P from "../netlify/lib/profile-images.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, instructionsFor } from "../netlify/lib/staff-tools.mjs";
import { makeSession, sessionCookie } from "../netlify/lib/session.mjs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const FAKE = new URL("./fixtures/fake-blobs.mjs", import.meta.url).href;
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: FAKE, shortCircuit: true } : next(spec, ctx); } });
const ENV = { ADMIN_KEY: "made up horse", STAFF_BOT_KEY: "bot-key-for-tests-0123456789", STAFF_CLAUDE_KEY: "claude-key-for-tests-0123456789" };
globalThis.Netlify = { env: { get: (k) => ENV[k] } };
const { default: staff } = await import("../netlify/functions/staff.mjs");
const { getStore } = await import("./fixtures/fake-blobs.mjs");
const ctx = { ip: "203.0.113.9", deploy: { context: "production" } };
const cookie = sessionCookie(await makeSession("made up horse")).split(";")[0];
const api = (path, init = {}) => staff(new Request("https://badscandal.com/api/staff/" + path, init), ctx);
const asLuke = (path, body) => api(path, { method: "POST", headers: { cookie, origin: "https://badscandal.com", "content-type": "application/json" }, body: JSON.stringify(body) });

const NOW = Date.parse("2026-11-24T15:00:00Z");
const R = S.DEFAULT_ROSTER;
const png = (w, h, pad = 0) => {
  const b = Buffer.alloc(32 + pad);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "latin1"); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b.toString("base64");
};
const view = async (d, now = NOW) => L.profileBlocks(S.profilesView(await S.getProfiles(d), await S.listMessages(d, now)));
const plat = (b, id) => b.platforms.find((p) => p.id === id);
const slot = (b, id) => b.platforms.flatMap((p) => p.slots).find((s) => s.id === id);
const check = (d, now, bot, id, extra) => P.markProfileUploaded(d, now, R, { by: bot, slot: id, ...extra });
const live = (d, now, bot, id) => check(d, now, bot, id, { result: "live", page: "https://example.com/made-up-profile", screenshot_base64: png(40, 40) });
const toLuke = async (d, now) => (await S.listMessages(d, now)).filter((m) => m.to === "Luke");

test("green only after a fresh live check; a ready copy alone is NOT green (the Deezer bug)", async () => {
  const d = memoryDesk();
  await P.saveProfileMaster(d, NOW, R, { by: "Luke", kind: "photo", image_base64: png(2000, 2000) });
  await P.saveProfileVersion(d, NOW, R, { by: "Luke", slot: "deezer-photo", image_base64: png(1200, 1200) });
  let b = await view(d);
  assert.equal(S.profilesView(await S.getProfiles(d), []).platforms.find((p) => p.id === "deezer").slots[0].status, "ready", "HQ has the sized copy");
  assert.equal(plat(b, "deezer").tone, "warn", "but nobody checked Deezer: not green");
  assert.equal(slot(b, "deezer-photo").state.label, "Not uploaded yet: waiting for Atlas");
  await live(d, NOW + 1000, "Atlas", "deezer-photo");
  b = await view(d, NOW + 1000);
  assert.equal(plat(b, "deezer").tone, "ok");
  assert.equal(plat(b, "deezer").headline, "Has your photo");
  assert.match(slot(b, "deezer-photo").state.line, /^Atlas checked Tue 24 Nov, 12:00$/);
  /* a NEW upload makes that check old: not green until the bot checks again */
  await P.saveProfileMaster(d, NOW + 60000, R, { by: "Luke", kind: "photo", image_base64: png(2000, 2000) });
  b = await view(d, NOW + 60000);
  assert.equal(plat(b, "deezer").tone, "warn");
  assert.match(slot(b, "deezer-photo").state.line, /before your new upload/);
  /* a bot's old upload link (no check) never counts */
  const old = L.profileBlocks(S.profilesView({ masters: { photo: { w: 9, h: 9, at: "2026-11-20T00:00:00Z" } }, uploaded: { "deezer-photo": { link: "https://example.com/x", by: "Atlas", at: "2026-11-21T00:00:00Z" } } }, []));
  assert.equal(plat(old, "deezer").tone, "warn");
});

test("a login problem is yellow with the bot's name and its note, even when the platform's other image is missing", async () => {
  const d = memoryDesk();
  await P.saveProfileMaster(d, NOW, R, { by: "Luke", kind: "photo", image_base64: png(3000, 3000) });
  await P.saveProfileMaster(d, NOW, R, { by: "Luke", kind: "banner", image_base64: png(3000, 1286) });
  await check(d, NOW + 1000, "Atlas", "spotify-photo", { result: "login", note: "Spotify for Artists asked for a code sent to the inbox." });
  const b = await view(d, NOW + 1000);
  const p = plat(b, "spotify");
  assert.equal(p.tone, "warn");
  assert.equal(p.headline, "Atlas can't log in");
  assert.equal(p.line, "Spotify for Artists asked for a code sent to the inbox.");
  assert.equal(p.needsYou, true, "a login is Luke's to set up with the bot");
  assert.equal(slot(b, "spotify-photo").state.label, "Atlas can't log in");
  assert.equal(L.profileOverview(b).chips.find((c) => c.id === "spotify").tone, "warn");
  await assert.rejects(() => check(d, NOW, "Atlas", "spotify-photo", { result: "login" }), /what happened/);
  await assert.rejects(() => check(d, NOW, "Atlas", "spotify-photo", { result: "login", note: "the password is madeup9x7k2q" }), /password/i);
  await assert.rejects(() => check(d, NOW, "Kevin", "spotify-photo", { result: "login", note: "made up" }), /Atlas/);
  await assert.rejects(() => check(d, NOW, "Atlas", "spotify-photo", { result: "maybe" }), /live, not_mine, login or failed/);
});

test("one of two images missing is yellow, both missing is red, the only image missing is yellow", async () => {
  const d = memoryDesk();
  await P.saveProfileMaster(d, NOW, R, { by: "Luke", kind: "photo", image_base64: png(3000, 3000) });
  await P.saveProfileMaster(d, NOW, R, { by: "Luke", kind: "banner", image_base64: png(3000, 1286) });
  let b = await view(d);
  assert.equal(plat(b, "spotify").tone, "bad");
  assert.equal(plat(b, "spotify").headline, "Missing your photo and banner");
  assert.equal(plat(b, "tiktok").tone, "warn", "TikTok has one image");
  await live(d, NOW + 1000, "Atlas", "spotify-photo");
  b = await view(d, NOW + 1000);
  assert.equal(plat(b, "spotify").tone, "warn");
  assert.equal(plat(b, "spotify").headline, "Missing your banner");
  await check(d, NOW + 2000, "Atlas", "spotify-header", { result: "failed", note: "The upload button did nothing." });
  b = await view(d, NOW + 2000);
  assert.equal(slot(b, "spotify-header").state.label, "Upload failed: The upload button did nothing.");
  await live(d, NOW + 3000, "Atlas", "spotify-header");
  b = await view(d, NOW + 3000);
  assert.equal(plat(b, "spotify").tone, "ok");
  /* only the images whose group has an upload count: with just a photo, Spotify needs only its photo */
  const d2 = memoryDesk();
  await P.saveProfileMaster(d2, NOW, R, { by: "Luke", kind: "photo", image_base64: png(3000, 3000) });
  await live(d2, NOW + 1000, "Atlas", "spotify-photo");
  assert.equal(plat(await view(d2, NOW + 1000), "spotify").tone, "ok");
  /* nothing uploaded: grey */
  assert.equal(plat(L.profileBlocks(S.profilesView({}, [])), "spotify").tone, "none");
});

test("the ring shows the bot's screenshot when not green, never his own photo; green shows his photo", async () => {
  const d = memoryDesk();
  await P.saveProfileMaster(d, NOW, R, { by: "Luke", kind: "photo", image_base64: png(2000, 2000) });
  await assert.rejects(() => check(d, NOW, "Kevin", "tiktok-photo", { result: "not_mine" }), /screenshot_base64/);
  await check(d, NOW + 1000, "Kevin", "tiktok-photo", { result: "not_mine", screenshot_base64: png(300, 300) });
  let b = await view(d, NOW + 1000);
  const chip = (id) => L.profileOverview(b).chips.find((c) => c.id === id);
  assert.equal(plat(b, "tiktok").tone, "warn");
  assert.equal(slot(b, "tiktok-photo").state.label, "Not your photo");
  assert.match(slot(b, "tiktok-photo").state.line, /^Kevin checked Tue 24 Nov, 12:00$/);
  assert.equal(chip("tiktok").thumb, "/api/staff/profile-file/shot-tiktok-photo");
  assert.equal(slot(b, "tiktok-photo").thumb, "/api/staff/profile-file/shot-tiktok-photo");
  assert.equal(chip("deezer").thumb, "", "no screenshot: the initials, not his master");
  assert.equal(chip("deezer").initials, "DZ");
  await live(d, NOW + 2000, "Kevin", "tiktok-photo");
  b = await view(d, NOW + 2000);
  assert.equal(plat(b, "tiktok").tone, "ok");
  assert.equal(L.profileOverview(b).chips.find((c) => c.id === "tiktok").thumb, "/api/staff/profile-file/master-photo", "green: his own picture");
  /* a check without a screenshot drops the old one */
  await check(d, NOW + 3000, "Kevin", "tiktok-photo", { result: "failed", note: "made up" });
  b = await view(d, NOW + 3000);
  assert.equal(slot(b, "tiktok-photo").shot, "");
  assert.equal((await P.profileFileResponse(d, "shot-tiktok-photo")).status, 404);
});

test("right after Luke's upload: one message from HQ to each owner bot, once per upload; none to Luke", async () => {
  const d = memoryDesk();
  const up = await P.saveProfileMaster(d, NOW, R, { by: "Luke", kind: "photo", image_base64: png(2000, 2000) });
  assert.deepEqual(up.told.sort(), ["Atlas", "Kevin", "Laura", "Steve"]);
  let msgs = await S.listMessages(d, NOW);
  const notes = msgs.filter((m) => m.from === "HQ" && String(m.mailId || "").startsWith("profile-upload-photo-"));
  assert.equal(notes.length, 4);
  assert.ok(notes.every((m) => m.needs === "action" && m.mailId === "profile-upload-photo-" + new Date(NOW).toISOString()));
  const atlas = notes.find((m) => m.to === "Atlas");
  assert.match(atlas.text, /^Luke uploaded a new profile photo\. Now: log in to Spotify, Apple Music, SoundCloud, Deezer, Amazon Music and TIDAL, put it up/);
  assert.match(atlas.text, /profile_uploaded \(result live \+ screenshot_base64\)/);
  assert.match(atlas.text, /Can't log in: result login with what happened, then sort it out with Luke in your chat; once it works, upload, check and record live\./);
  assert.doesNotMatch(atlas.text, /BADSCANDAL|Badscandal/);
  assert.equal(msgs.filter((m) => m.to === "Luke").length, 0);
  const banner = await P.saveProfileMaster(d, NOW + 1000, R, { by: "Luke", kind: "banner", image_base64: png(3000, 1286) });
  assert.deepEqual(banner.told.sort(), ["Atlas", "Laura", "Steve"], "TikTok has no banner; X has no owner; Instagram is Luke's");
  /* a second photo upload: a new note, and the older one is closed */
  await P.saveProfileMaster(d, NOW + 2000, R, { by: "Luke", kind: "photo", image_base64: png(2000, 2000) });
  msgs = await S.listMessages(d, NOW + 2000);
  const open = msgs.filter((m) => m.to === "Atlas" && S.isOpen(m) && String(m.mailId).startsWith("profile-upload-photo-"));
  assert.equal(open.length, 1);
  assert.equal(open[0].mailId, "profile-upload-photo-" + new Date(NOW + 2000).toISOString());
  /* once every Atlas photo is live, his note closes itself */
  for (const id of ["spotify-photo", "apple-image", "soundcloud-photo", "deezer-photo", "amazon-photo", "tidal-photo"]) await live(d, NOW + 3000, "Atlas", id);
  assert.equal((await S.listMessages(d, NOW + 3000)).find((m) => m.id === open[0].id).resolved.by, "Atlas");
});

test("the new results send NO message to Luke; the old rejected path still asks him", async () => {
  const d = memoryDesk();
  await P.saveProfileMaster(d, NOW, R, { by: "Luke", kind: "photo", image_base64: png(2000, 2000) });
  await check(d, NOW + 1, "Atlas", "deezer-photo", { result: "login", note: "made up: a code was needed" });
  await check(d, NOW + 2, "Kevin", "tiktok-photo", { result: "not_mine", screenshot_base64: png(30, 30) });
  await check(d, NOW + 3, "Laura", "youtube-photo", { result: "failed", note: "made up: it did not save" });
  await live(d, NOW + 4, "Steve", "facebook-photo");
  assert.equal((await toLuke(d, NOW + 5)).length, 0);
  const r = await check(d, NOW + 6, "Atlas", "tidal-photo", { rejected: true, note: "made up: too busy" });
  assert.equal(r.rejected, true);
  assert.equal((await toLuke(d, NOW + 6)).length, 1, "the old path is kept as it was");
  assert.equal(slot(await view(d, NOW + 6), "tidal-photo").state.label, "Rejected by TIDAL", "and it counts as failed on the ring");
});

test("profile_jobs lists the upload and Luke's retry, and reading it changes nothing", async () => {
  const d = memoryDesk();
  await P.saveProfileMaster(d, NOW, R, { by: "Luke", kind: "photo", image_base64: png(2000, 2000) });
  await check(d, NOW + 1000, "Atlas", "deezer-photo", { result: "login", note: "made up" });
  await P.retryProfile(d, NOW + 2000, R, { by: "Luke", platform: "deezer" });
  const call = (bot) => callTool(TOOLS.find((t) => t.name === "profile_jobs"), { bot }, { store: d, now: NOW + 3000, role: "bot" });
  const before = new Map([...d._map].filter(([k]) => !/^(seen|read)\//.test(k)).map(([k, v]) => [k, v.body]));
  const atlas = await call("Atlas");
  const after = new Map([...d._map].filter(([k]) => !/^(seen|read)\//.test(k)).map(([k, v]) => [k, v.body]));
  assert.deepEqual(after, before);
  const dz = atlas.jobs.find((j) => j.slot === "deezer-photo");
  assert.equal(dz.kind, "retry");
  assert.equal(dz.last_check.result, "login");
  assert.ok(dz.luke_asked_again);
  assert.equal(atlas.jobs.find((j) => j.slot === "spotify-photo").kind, "upload");
  assert.ok(!atlas.jobs.some((j) => j.platform === "TikTok"), "only his own");
  assert.ok((await call("Kevin")).jobs.some((j) => j.slot === "tiktok-photo" && j.kind === "upload"));
  assert.ok(!(await call("Nova")).jobs.some((j) => j.slot === "instagram-photo" || j.slot === "x-photo"), "Luke's own and the unowned are not a bot's to-do");
  await live(d, NOW + 4000, "Atlas", "deezer-photo");
  assert.ok(!(await callTool(TOOLS.find((t) => t.name === "profile_jobs"), { bot: "Atlas" }, { store: d, now: NOW + 5000, role: "bot" })).jobs.some((j) => j.slot === "deezer-photo"));
});

test("the retry route: Luke only, one open message, X and Instagram refused, the sample never writes", async () => {
  const desk = getStore({ name: "staff" });
  await P.saveProfileMaster(desk, Date.now(), R, { by: "Luke", kind: "photo", image_base64: png(2000, 2000) });
  const msgsTo = async (to) => (await S.listMessages(desk, Date.now())).filter((m) => m.to === to && m.mailId === "profile-retry-deezer");
  assert.equal((await api("profile-retry", { method: "POST", body: "{}" })).status, 401);
  assert.equal((await api("profile-retry", { method: "POST", headers: { authorization: "Bearer " + ENV.STAFF_BOT_KEY }, body: JSON.stringify({ platform: "deezer" }) })).status, 403);
  assert.equal((await api("profile-retry", { method: "POST", headers: { authorization: "Bearer " + ENV.STAFF_CLAUDE_KEY }, body: JSON.stringify({ platform: "deezer" }) })).status, 403);
  const sample = await (await asLuke("profile-retry?sample=1", { platform: "deezer" })).json();
  assert.equal(sample.sample, true);
  assert.equal((await msgsTo("Atlas")).length, 0, "the sample never writes");
  const first = await asLuke("profile-retry", { platform: "deezer" });
  assert.equal(first.status, 200);
  const j = await first.json();
  assert.deepEqual([j.sent, j.to, j.platform], [true, "Atlas", "Deezer"]);
  const sent = await msgsTo("Atlas");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].from, "Luke");
  assert.equal(sent[0].needs, "action");
  assert.match(sent[0].text, /^Try Deezer again: log in, put up my profile photo/);
  assert.match(sent[0].text, /sort it out with me in your chat/);
  const again = await (await asLuke("profile-retry", { platform: "deezer" })).json();
  assert.equal(again.sent, false);
  assert.equal(again.already, true);
  assert.equal((await msgsTo("Atlas")).length, 1, "not while one is still open");
  assert.ok((await S.getProfiles(desk)).retry["deezer-photo"].at);
  const x = await asLuke("profile-retry", { platform: "x" });
  assert.equal(x.status, 400);
  assert.match((await x.json()).error, /X has no bot yet/);
  const ig = await asLuke("profile-retry", { platform: "instagram" });
  assert.equal(ig.status, 400);
  assert.match((await ig.json()).error, /Instagram is yours/);
  /* the page hides the button for those two */
  const b = L.profileBlocks(S.profilesView(await S.getProfiles(desk), []));
  assert.equal(plat(b, "x").retry.can, false);
  assert.equal(plat(b, "instagram").retry.can, false);
  assert.equal(plat(b, "deezer").retry.can, true);
  assert.match(L.profileRetrySent("Atlas", plat(b, "deezer").retry.at), /^Sent to Atlas at \d\d:\d\d\. Atlas tries again on its next run\.$/);
  assert.equal(L.profileRetryAsk(plat(b, "deezer")), "Ask Atlas to try Deezer again?");
});

test("the screenshot is served behind the login at /api/staff/profile-file/shot-<slot>; the bot sends it through /mcp", async () => {
  const desk = getStore({ name: "staff" });
  const big = png(500, 500, 70000); /* over the 64 KB a normal call may carry */
  const res = await staff(new Request("https://badscandal.com/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + ENV.STAFF_BOT_KEY },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "profile_uploaded", arguments: { bot: "Kevin", slot: "tiktok-photo", result: "not_mine", screenshot_base64: big, page: "https://example.com/made-up" } } }) }), ctx);
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.result.isError, false, out.result.content[0].text);
  assert.ok((await S.getProfiles(desk)).checks["tiktok-photo"].shot);
  assert.equal((await api("profile-file/shot-tiktok-photo")).status, 401);
  const ok = await api("profile-file/shot-tiktok-photo", { headers: { cookie } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "image/png");
  assert.equal(ok.headers.get("cache-control"), "private, no-store");
  assert.equal((await api("profile-file/shot-tiktok-photo?sample=1", { headers: { cookie } })).status, 404);
  assert.equal((await api("profile-file/shot-not-a-slot", { headers: { cookie } })).status, 404);
  assert.equal((await api("profile-file/shot-deezer-photo", { headers: { cookie } })).status, 404);
});

test("the rules are on the site for the bots; still 43 tools; the sample shows green, yellow and red", async () => {
  assert.equal(TOOLS.length, 43);
  const up = TOOLS.find((t) => t.name === "profile_uploaded");
  assert.deepEqual(up.inputSchema.properties.result.enum, ["live", "not_mine", "login", "failed"]);
  assert.ok(up.inputSchema.properties.screenshot_base64 && up.inputSchema.properties.page);
  assert.match(up.description, /sort it out with Luke in your own chat/);
  assert.match(up.description, /None of these messages Luke/);
  assert.match(TOOLS.find((t) => t.name === "profile_jobs").description, /kind retry = Luke pressed Try again/);
  for (const bot of ["Atlas", "Laura", "Steve", "Kevin"]) {
    const text = instructionsFor(bot, R);
    assert.match(text, /After Luke uploads, the same day: log in to each of your platforms/);
    assert.match(text, /fix it with Luke in your own chat \(never on HQ\); once it works, upload, check and record live/);
  }
  assert.doesNotMatch(instructionsFor("Drop", R), /After Luke uploads, the same day/);
  const fn = readFileSync(new URL("../netlify/functions/staff.mjs", import.meta.url), "utf8");
  assert.match(fn, /UPLOAD_TOOLS = new Set\(\["upload_cover", "profile_rework", "profile_uploaded"\]\)/);
  const { sampleBoard } = await import("../netlify/lib/staff-sample.mjs");
  const b = L.profileBlocks(sampleBoard(NOW).profiles);
  assert.equal(plat(b, "spotify").tone, "ok");
  assert.equal(plat(b, "deezer").headline, "Atlas can't log in");
  assert.equal(slot(b, "tiktok-photo").state.label, "Not your photo");
  assert.equal(plat(b, "tiktok").tone, "warn");
  assert.equal(plat(b, "youtube").tone, "bad");
  assert.equal(plat(b, "spotify").page, "https://open.spotify.com/artist/29kaubgb6Esvwu0idVndGy");
  assert.equal(plat(b, "instagram").page, "https://www.instagram.com/badscandal");
});
