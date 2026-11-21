/* Profiles v2 (21 Nov 2026, Luke: "perfect the profile page"). One clear state per image, an overview strip
   with each platform's photo, thumbnails instead of "Image" links, size rules folded away. Made-up links. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { sampleBoard } from "../netlify/lib/staff-sample.mjs";
await import("../js/hq-lib.js");
const L = globalThis.HQLib;
const NOW = Date.parse("2026-11-21T15:00:00Z");

function view() {
  return S.profilesView({
    slots: {
      "spotify-photo": { current: { link: "https://example.com/spot.jpg", changed: "2026-10-01", by: "Atlas" } },
      "tiktok-photo": { current: { link: "https://example.com/profile/badscandal", changed: "unknown", by: "Kevin" } },
      "instagram-photo": { approved: { link: "https://example.com/ig.jpg", by: "Steve", at: "2026-11-18T12:00:00Z" } },
    },
  }, [{ id: "mabc", from: "Laura", to: "Luke", needs: "decision", resolved: null, proposal: { action: "profile", slot: "youtube-banner", link: "https://example.com/yt.jpg" } }]);
}
const find = (b, plat, id) => b.platforms.find((p) => p.platform === plat).slots.find((s) => !id || s.id === id);

test("each image has ONE state: needs your yes, with the bots, live, or not recorded", () => {
  const b = L.profileBlocks(view());
  const yt = find(b, "YouTube", "youtube-banner");
  assert.deepEqual([yt.state.key, yt.state.tone, yt.state.label], ["you", "you", "Needs your yes"]);
  const ig = find(b, "Instagram");
  assert.deepEqual([ig.state.key, ig.state.tone, ig.state.label], ["approved", "bot", "Approved"]);
  assert.equal(ig.state.line, "You upload it by hand");
  const sp = find(b, "Spotify", "spotify-photo");
  assert.deepEqual([sp.state.key, sp.state.tone, sp.state.label], ["live", "live", "Live"]);
  assert.equal(sp.state.line, "Since Thu 1 Oct");
  const tt = find(b, "TikTok");
  assert.equal(tt.state.key, "live");
  assert.equal(tt.state.line, "", "an unknown day is not invented");
  const am = find(b, "Amazon Music");
  assert.deepEqual([am.state.key, am.state.tone, am.state.label], ["none", "none", "Not recorded"]);
  assert.equal(am.state.line, "Atlas records what is live");
  assert.equal(find(b, "X").state.line, "You record what is live");
  for (const p of b.platforms) for (const s of p.slots) assert.notEqual(s.state.label, "Waiting", "the old ambiguous word is gone");
});

test("a thumbnail only from an image link or HQ's own file; a profile page link is not a picture", () => {
  const b = L.profileBlocks(view());
  assert.equal(find(b, "Spotify", "spotify-photo").thumb, "https://example.com/spot.jpg");
  assert.equal(find(b, "TikTok").thumb, "", "a page link is opened, not drawn");
  assert.equal(find(b, "TikTok").openLink, "https://example.com/profile/badscandal");
  assert.equal(find(b, "YouTube", "youtube-banner").thumb, "https://example.com/yt.jpg", "the image waiting for yes is shown");
  const own = L.profileBlocks({ platforms: [{ id: "x", platform: "X", slots: [{ id: "x-photo", kind: "Profile photo", status: "ready", preview: "/api/staff/profile-file/slot-x-photo", circle: true }] }] });
  assert.equal(own.platforms[0].slots[0].thumb, "/api/staff/profile-file/slot-x-photo");
  const bad = L.profileBlocks({ platforms: [{ id: "x", platform: "X", slots: [{ id: "x-photo", kind: "Profile photo", current: { link: "javascript:alert(1).jpg" } }] }] });
  assert.equal(bad.platforms[0].slots[0].thumb, "");
});

test("the overview: one line of counts and one chip per platform, coloured by what matters most", () => {
  const b = L.profileBlocks(view());
  const o = L.profileOverview(b);
  const total = b.platforms.reduce((n, p) => n + p.slots.length, 0);
  assert.equal(o.total, total);
  assert.equal(o.counts.you, 1);
  assert.equal(o.counts.live, 2);
  assert.equal(o.counts.bot, 1);
  assert.equal(o.counts.none, total - 4);
  assert.equal(o.line, `2 of ${total} live · 1 needs your yes · 1 with the owner · ${total - 4} not recorded`);
  const chip = (name) => o.chips.find((c) => c.platform === name);
  assert.equal(chip("YouTube").tone, "you");
  assert.equal(chip("Instagram").tone, "bot");
  assert.equal(chip("Spotify").tone, "none", "Spotify's header is not recorded yet, so the chip is not green");
  assert.equal(chip("Spotify").thumb, "https://example.com/spot.jpg", "the chip shows the profile photo");
  assert.equal(chip("TikTok").tone, "live");
  assert.equal(chip("TikTok").initials, "TT");
  assert.equal(chip("Amazon Music").initials, "AM");
  assert.equal(chip("Amazon Music").label, "Amazon");
  assert.equal(chip("YouTube").initials, "YT");
  assert.equal(chip("Facebook Page").label, "Facebook");
  assert.equal(chip("YouTube").href, "#profiles/youtube");
  assert.equal(L.profileOverview({ platforms: [] }).line, "No profiles listed.");
});

test("the sample draws the overview and the page has its places", () => {
  const b = L.profileBlocks(sampleBoard(NOW).profiles);
  const o = L.profileOverview(b);
  assert.ok(o.counts.you >= 1 && o.counts.live >= 1);
  const page = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  assert.match(page, /id="profSum"/);
  assert.match(page, /id="profStrip"/);
  const staff = readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8");
  assert.match(staff, /profileOverview/);
  assert.match(staff, /data-pthumb/, "a broken thumbnail falls back to a plain tile");
  assert.match(staff, /<details class="pf-rule">/, "the size rule is folded away");
});
