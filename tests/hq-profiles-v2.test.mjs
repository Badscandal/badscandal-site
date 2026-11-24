/* Profiles (21 Nov 2026, Luke): "just have profile photo and banner I upload ... green should indicate that they're
   using my uploaded banner ... red means there's an issue". Made-up links and sizes.
   24 Nov 2026, Luke: "deezer is showing up as green with a green ring around it but the bots ... should be checking my
   profiles". The old ok/issue/none model is replaced: green needs a bot's fresh live check of the public profile; the
   issue cards and their reply box are gone (he sorts problems out in the bot's own chat). These tests follow that. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import * as P from "../netlify/lib/profile-images.mjs";
import { memoryDesk, sampleBoard } from "../netlify/lib/staff-sample.mjs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;
const NOW = Date.parse("2026-11-21T15:00:00Z");
const R = S.DEFAULT_ROSTER;

/* a PNG header with the given size is enough for the reader */
function png(w, h) {
  const b = Buffer.alloc(32);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "latin1"); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b.toString("base64");
}
const plat = (b, name) => b.platforms.find((p) => p.platform === name);
const find = (b, name, id) => plat(b, name).slots.find((s) => !id || s.id === id);

test("before any upload: everything is grey and the line says to upload", () => {
  const b = L.profileBlocks(S.profilesView({}, []));
  for (const p of b.platforms) { assert.equal(p.tone, "none"); for (const s of p.slots) assert.equal(s.state.tone, "none"); }
  assert.equal(find(b, "YouTube", "youtube-banner").state.label, "Waiting for your banner");
  assert.equal(find(b, "Spotify", "spotify-photo").state.label, "Waiting for your photo");
  assert.equal(plat(b, "Spotify").headline, "Waiting for your photo and banner");
  const o = L.profileOverview(b);
  assert.equal(o.line, "Upload your profile photo and banner to start.");
});

/* 24 Nov 2026: a bot making an AI version is a reason in words on a yellow or red ring, not a red issue card */
test("after uploads: nothing is green until a bot checks; an AI version in the making says who", async () => {
  const d = memoryDesk();
  await P.saveProfileMaster(d, NOW, R, { by: "Luke", kind: "photo", image_base64: png(1000, 1000) });
  await P.saveProfileMaster(d, NOW, R, { by: "Luke", kind: "banner", image_base64: png(3000, 1000) });
  await P.saveProfileVersion(d, NOW, R, { by: "Luke", slot: "spotify-photo", image_base64: png(750, 750) });
  const b = L.profileBlocks(S.profilesView(await S.getProfiles(d), []));
  const sp = find(b, "Spotify", "spotify-photo");
  assert.deepEqual([sp.state.tone, sp.state.label], ["bad", "Not uploaded yet: waiting for Atlas"], "photo and header both missing: red");
  assert.equal(sp.thumb, "", "never his own photo on an image without his upload");
  assert.equal(find(b, "TIDAL").state.label, "Atlas is making an AI version");
  assert.equal(plat(b, "TIDAL").tone, "warn", "the only image missing: yellow");
  assert.equal(find(b, "YouTube", "youtube-banner").state.label, "Laura is making an AI version");
  assert.equal(plat(b, "YouTube").tone, "bad", "photo and banner both missing: red");
  const o = L.profileOverview(b);
  const chip = (n) => o.chips.find((c) => c.platform === n);
  assert.equal(chip("YouTube").tone, "bad");
  assert.equal(chip("YouTube").href, "#profiles/youtube");
  assert.equal(chip("YouTube").initials, "YT");
  assert.equal(chip("Amazon Music").label, "Amazon");
  assert.match(o.line, /^0 of 11 have your uploads · 2 need you · 9 waiting for a bot$/);
});

test("green once the bot's live check lands; a new image waiting for his yes is a reason, not green", async () => {
  const d = memoryDesk();
  await P.saveProfileMaster(d, NOW, R, { by: "Luke", kind: "photo", image_base64: png(1000, 1000) });
  await P.saveProfileVersion(d, NOW, R, { by: "Luke", slot: "spotify-photo", image_base64: png(750, 750) });
  await P.markProfileUploaded(d, NOW + 1000, R, { by: "Atlas", slot: "spotify-photo", link: "https://example.com/spotify-live.jpg" });
  const msgs = [{ id: "mabc", from: "Laura", to: "Luke", needs: "decision", resolved: null, proposal: { action: "profile", slot: "youtube-photo", link: "https://example.com/yt.jpg" } }];
  const b = L.profileBlocks(S.profilesView(await S.getProfiles(d), msgs));
  assert.equal(find(b, "Spotify", "spotify-photo").state.label, "Has your photo");
  assert.equal(find(b, "Spotify", "spotify-photo").state.tone, "ok");
  assert.equal(plat(b, "Spotify").tone, "ok", "the header has no master yet, so it does not count");
  const yt = find(b, "YouTube", "youtube-photo");
  assert.deepEqual([yt.state.tone, yt.state.label], ["warn", "Needs your yes"]);
  assert.equal(yt.waitingHref, "#messages/mabc");
});

test("a thumbnail only from HQ's own file", () => {
  const own = L.profileBlocks({ masters: { photo: { w: 10, h: 10, at: "2026-11-20T00:00:00Z" } }, platforms: [{ id: "x", platform: "X", slots: [{ id: "x-photo", kind: "Profile photo", group: "photo", status: "ready", preview: "/api/staff/profile-file/slot-x-photo", circle: true,
    check: { result: "live", at: "2026-11-21T00:00:00Z", fresh: true, by: "Nova" } }] }] });
  assert.equal(own.platforms[0].slots[0].thumb, "/api/staff/profile-file/slot-x-photo");
  const bad = L.profileBlocks({ masters: { photo: { w: 10, h: 10 } }, platforms: [{ id: "x", platform: "X", slots: [{ id: "x-photo", kind: "Profile photo", group: "photo", preview: "javascript:alert(1).jpg",
    check: { result: "live", fresh: true, shot: "https://example.com/x.jpg" } }] }] });
  assert.equal(bad.platforms[0].slots[0].thumb, "");
});

test("the page: uploads first, the strip of rings, every platform folded; no reply box any more", () => {
  const b = L.profileBlocks(sampleBoard(NOW).profiles);
  assert.ok(L.profileOverview(b).chips.length > 0);
  const page = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  for (const id of ["profSum", "profStrip", "profiles-all", "profList", "profPhoto", "profBanner", "profRule"]) assert.match(page, new RegExp('id="' + id + '"'));
  assert.doesNotMatch(page, /id="profIssues"/, "24 Nov 2026: the issue cards are gone");
  const staff = readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8");
  assert.doesNotMatch(staff, /data-pfreply/, "24 Nov 2026: problems are handled in the bot's own chat");
  assert.match(staff, /data-pthumb/);
  assert.match(staff, /data-pfretry/);
  assert.match(staff, /id="profiles-' \+ esc\(p\.id\)/, "each card is profiles-<id>, the shell's #profiles/<id> target");
});
