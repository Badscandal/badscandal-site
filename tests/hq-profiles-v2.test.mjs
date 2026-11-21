/* Profiles (21 Nov 2026, Luke): "just have profile photo and banner I upload ... green should indicate that they're
   using my uploaded banner ... red means there's an issue ... a card saying the issue clearly and with a chance for
   me to respond easily to the bot". Made-up links and sizes. */
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
const find = (b, plat, id) => b.platforms.find((p) => p.platform === plat).slots.find((s) => !id || s.id === id);

test("before any upload: everything is grey and the line says to upload", () => {
  const b = L.profileBlocks(S.profilesView({}, []));
  for (const p of b.platforms) for (const s of p.slots) assert.equal(s.state.tone, "none");
  assert.equal(find(b, "YouTube", "youtube-banner").state.label, "Waiting for your banner");
  assert.equal(find(b, "Spotify", "spotify-photo").state.label, "Waiting for your photo");
  const o = L.profileOverview(b);
  assert.equal(o.line, "Upload your profile photo and banner to start.");
  assert.equal(o.issues.length, 0);
});

test("after uploads: green where the copy is made from them, red with a clear sentence where a bot makes an AI version", async () => {
  const d = memoryDesk();
  await P.saveProfileMaster(d, NOW, R, { by: "Luke", kind: "photo", image_base64: png(1000, 1000) });
  await P.saveProfileMaster(d, NOW, R, { by: "Luke", kind: "banner", image_base64: png(3000, 1000) });
  /* the page stores the copies that fit (here: Spotify's photo) */
  await P.saveProfileVersion(d, NOW, R, { by: "Luke", slot: "spotify-photo", image_base64: png(750, 750) });
  const b = L.profileBlocks(S.profilesView(await S.getProfiles(d), []));
  const sp = find(b, "Spotify", "spotify-photo");
  assert.deepEqual([sp.state.tone, sp.state.label, sp.state.line], ["ok", "Uses your photo", "Atlas uploads it"]);
  const tidal = find(b, "TIDAL");
  assert.equal(tidal.state.tone, "issue");
  assert.equal(tidal.state.label, "Your photo is too small");
  assert.equal(tidal.issue, "Your photo is 1000 × 1000. TIDAL needs 1500 × 1500. Atlas is making a bigger AI version that looks exactly like yours.");
  const yt = find(b, "YouTube", "youtube-banner");
  assert.equal(yt.state.label, "Different shape needed");
  assert.equal(yt.issue, "Your banner is 3000 × 1000. YouTube needs 2560 × 1440, a different shape. Laura is making an AI version that looks exactly like yours. Nothing is cropped.");
  assert.equal(yt.to, "Laura");
  assert.equal(find(b, "Instagram").to, "Nova", "Instagram has no bot: questions go to Nova");
  const o = L.profileOverview(b);
  const chip = (n) => o.chips.find((c) => c.platform === n);
  assert.equal(chip("YouTube").tone, "issue");
  assert.equal(chip("YouTube").href, "#profiles/issue-youtube");
  assert.equal(chip("YouTube").initials, "YT");
  assert.equal(chip("Amazon Music").label, "Amazon");
  const ytCard = o.issues.find((g) => g.platformId === "youtube");
  assert.ok(ytCard, "one issue card per platform with a problem");
  assert.equal(ytCard.to, "Laura");
  assert.ok(ytCard.items.some((x) => x.id === "youtube-banner"));
  assert.match(o.line, /^\d+ of 17 use your uploads · \d+ issues?/);
});

test("the platform's copy is green once uploaded; a new image waiting for his yes is red with Answer", async () => {
  const d = memoryDesk();
  await P.saveProfileMaster(d, NOW, R, { by: "Luke", kind: "photo", image_base64: png(1000, 1000) });
  await P.saveProfileVersion(d, NOW, R, { by: "Luke", slot: "spotify-photo", image_base64: png(750, 750) });
  await P.markProfileUploaded(d, NOW, R, { by: "Atlas", slot: "spotify-photo", link: "https://example.com/spotify-live.jpg" });
  const msgs = [{ id: "mabc", from: "Laura", to: "Luke", needs: "decision", resolved: null, proposal: { action: "profile", slot: "youtube-photo", link: "https://example.com/yt.jpg" } }];
  const b = L.profileBlocks(S.profilesView(await S.getProfiles(d), msgs));
  assert.equal(find(b, "Spotify", "spotify-photo").state.label, "Live with your photo");
  assert.equal(find(b, "Spotify", "spotify-photo").state.tone, "ok");
  const yt = find(b, "YouTube", "youtube-photo");
  assert.deepEqual([yt.state.tone, yt.state.label], ["issue", "Needs your yes"]);
  const card = L.profileOverview(b).issues.find((g) => g.platformId === "youtube").items[0];
  assert.equal(card.answer, "#messages/mabc");
});

test("a thumbnail only from an image link or HQ's own file", () => {
  const own = L.profileBlocks({ platforms: [{ id: "x", platform: "X", slots: [{ id: "x-photo", kind: "Profile photo", status: "ready", preview: "/api/staff/profile-file/slot-x-photo", circle: true }] }] });
  assert.equal(own.platforms[0].slots[0].thumb, "/api/staff/profile-file/slot-x-photo");
  const bad = L.profileBlocks({ platforms: [{ id: "x", platform: "X", slots: [{ id: "x-photo", kind: "Profile photo", current: { link: "javascript:alert(1).jpg" } }] }] });
  assert.equal(bad.platforms[0].slots[0].thumb, "");
});

test("the page: uploads first, the strip, issue cards with a reply to the bot, every platform folded", () => {
  const b = L.profileBlocks(sampleBoard(NOW).profiles);
  assert.ok(L.profileOverview(b).chips.length > 0);
  const page = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  for (const id of ["profSum", "profStrip", "profIssues", "profiles-all", "profPhoto", "profBanner"]) assert.match(page, new RegExp('id="' + id + '"'));
  const staff = readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8");
  assert.match(staff, /data-pfreply/, "a reply box on each issue card");
  assert.match(staff, /About the /, "the reply names what it is about");
  assert.match(staff, /data-pthumb/);
});
