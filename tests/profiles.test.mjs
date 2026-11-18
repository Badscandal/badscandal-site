/* L12 (18 Nov 2026): one place for the profile photo and the banner on every official platform.
   The desk records what is live and asks Luke "Yes, correct" before a new image. HQ never logs in
   and never changes a platform. No Meta or Instagram call. Made-up links only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk, sampleBoard } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, toolsFor } from "../netlify/lib/staff-tools.mjs";

await import("../js/hq-lib.js");
const L = globalThis.HQLib;

const NOW = Date.parse("2026-11-18T15:00:00Z"); /* 12:00 São Paulo */
const R = S.DEFAULT_ROSTER;
const call = (d, name, args, role = "bot") => callTool(TOOLS.find((t) => t.name === name), args, { store: d, now: NOW, role, hq: async () => null }).catch((e) => ({ error: e.message }));
const slot = (view, platform, id) => view.platforms.find((p) => p.platform === platform).slots.find((s) => s.id === id);

const GOOD = {
  "spotify-header": { width: 2660, height: 1140, format: "jpg", size_mb: 4 },
  "youtube-banner": { width: 2560, height: 1440, format: "jpg", size_mb: 2 },
  "spotify-photo": { width: 750, height: 750, format: "jpg", size_mb: 2 },
};

test("every official platform is listed, with its owner and only the images it has", () => {
  const ids = S.PROFILE_SLOTS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(S.PROFILE_SLOTS.map((s) => s.platform).filter((p, i, a) => a.indexOf(p) === i),
    ["Facebook Page", "Instagram", "YouTube", "Spotify", "Apple Music", "TikTok", "X", "SoundCloud", "Deezer", "Amazon Music", "TIDAL"]);
  const owner = (platform) => S.PROFILE_SLOTS.filter((s) => s.platform === platform).map((s) => s.owner);
  assert.deepEqual(owner("Facebook Page"), ["Steve", "Steve"]);
  assert.deepEqual(owner("Instagram"), ["Luke"]);
  assert.deepEqual(owner("YouTube"), ["Laura", "Laura"]);
  assert.deepEqual(owner("TikTok"), ["Kevin"]);
  assert.deepEqual(owner("X"), ["", ""]);
  for (const p of ["Spotify", "Apple Music", "SoundCloud", "Deezer", "Amazon Music", "TIDAL"]) assert.ok(owner(p).every((o) => o === "Atlas"), p);
  assert.deepEqual(S.PROFILE_SLOTS.filter((s) => s.platform === "Instagram").map((s) => s.kind), ["Profile photo"], "Instagram has no banner");
  const view = S.profilesView({}, []);
  assert.equal(view.platforms.length, 11);
  assert.match(slot(view, "Instagram", "instagram-photo").rule, /does not publish/);
  assert.match(slot(view, "Instagram", "instagram-photo").rule, /320 x 320/);
  assert.match(slot(view, "TikTok", "tiktok-photo").rule, /at least 20 x 20/);
  assert.match(slot(view, "TikTok", "tiktok-photo").rule, /720 x 720/);
  assert.match(slot(view, "Deezer", "deezer-photo").rule, /1200 x 1200/);
  assert.match(slot(view, "TIDAL", "tidal-photo").rule, /1500 x 1500/);
  assert.match(slot(view, "Spotify", "spotify-header").rule, /2660 x 1140/);
  assert.match(slot(view, "YouTube", "youtube-banner").rule, /min 2048x1152, 2560x1440 recommended/); /* 18 Nov 2026: minimum restored */
  assert.equal(slot(view, "Spotify", "spotify-header").current, null);
  assert.match(view.note, /never logs in/i);
});

test("new size rules are the published ones; a kind with no rule is not invented", () => {
  assert.deepEqual(S.assetProblems("spotify_avatar", { width: 750, height: 750, format: "png", mb: 2 }), []);
  assert.match(S.assetProblems("spotify_avatar", { width: 640, height: 640 }).join(" "), /at least 750 x 750/);
  assert.match(S.assetProblems("spotify_avatar", { format: "webp" })[0], /JPG, PNG or GIF/);
  assert.deepEqual(S.assetProblems("youtube_photo", { width: 800, height: 800, format: "jpg", mb: 1 }), []);
  assert.match(S.assetProblems("youtube_photo", { width: 800, height: 600 }).join(" "), /not square/);
  assert.match(S.assetProblems("youtube_photo", { mb: 16 })[0], /15 MB at most/);
  assert.deepEqual(S.assetProblems("apple_image", { width: 2400, height: 2400, format: "jpg" }), []);
  assert.match(S.assetProblems("apple_image", { width: 700, height: 700 }).join(" "), /at least 800 x 800/);
  assert.deepEqual(S.assetProblems("x_photo", { width: 400, height: 400, format: "png", mb: 1 }), []);
  assert.match(S.assetProblems("x_photo", { mb: 3 })[0], /2 MB at most/);
  assert.deepEqual(S.assetProblems("x_header", { width: 1500, height: 500, format: "jpg" }), []);
  assert.match(S.assetProblems("x_header", { width: 1500, height: 600 }).join(" "), /not 3:1/);
  assert.deepEqual(S.assetProblems("soundcloud_photo", { width: 800, height: 800, format: "jpg", mb: 1 }), []);
  assert.deepEqual(S.assetProblems("soundcloud_header", { width: 2480, height: 520, format: "png", mb: 1 }), []);
  assert.match(S.assetProblems("soundcloud_header", { width: 2000, height: 520 }).join(" "), /at least 2480 x 520/);
  assert.deepEqual(S.assetProblems("facebook_photo", { width: 320, height: 320, format: "png" }), []);
  assert.deepEqual(S.assetProblems("facebook_cover", { width: 851, height: 315, format: "jpg" }), []);
  assert.match(S.assetProblems("facebook_cover", { width: 300, height: 100 }).join(" "), /at least 400 x 150/);
  assert.deepEqual(S.assetProblems("amazon_photo", { width: 500, height: 500, format: "jpg", mb: 1 }), []);
  assert.deepEqual(S.assetProblems("amazon_background", { width: 1920, height: 1440, format: "png", mb: 4 }), []);
  assert.match(S.assetProblems("amazon_background", { width: 1920, height: 1080 }).join(" "), /at least 1920 x 1440/);
  /* the L8 kinds are unchanged, and still come first (18 Nov 2026: profile kinds were added after them) */
  assert.deepEqual(Object.keys(S.ASSETS).slice(0, 4), ["cover", "canvas", "spotify_header", "youtube_banner"]);
});

test("the owner records the live image; another bot cannot; a bad link or a future day is refused", async () => {
  const d = memoryDesk();
  const saved = await call(d, "profiles", { bot: "Nova", action: "record", platform: "Instagram", link: "https://example.com/ig-now.jpg", changed: "2026-10-01" });
  assert.equal(saved.saved, true);
  assert.match(saved.note, /did not change/i);
  const again = await call(d, "profiles", { bot: "Nova", action: "record", platform: "Instagram", image: "profile", link: "https://example.com/ig-now.jpg", changed: "2026-10-01" });
  assert.equal(again.already, true);
  assert.match(String((await call(d, "profiles", { bot: "Steve", action: "record", platform: "Instagram", link: "https://example.com/x.jpg", changed: "2026-10-01" })).error), /Luke/);
  assert.match(String((await call(d, "profiles", { bot: "Kevin", action: "record", platform: "Instagram", link: "https://example.com/x.jpg", changed: "2026-10-01" })).error), /Luke/);
  assert.match(String((await call(d, "profiles", { bot: "Atlas", action: "record", platform: "X", image: "profile", link: "https://example.com/x.jpg", changed: "2026-10-01" })).error), /no owner yet/i);
  assert.match(String((await call(d, "profiles", { bot: "Steve", action: "record", platform: "Facebook", image: "cover", link: "http://example.com/a.jpg", changed: "2026-10-01" })).error), /https/);
  assert.match(String((await call(d, "profiles", { bot: "Steve", action: "record", platform: "Facebook", image: "cover", link: "https://example.com/a.jpg", changed: "2026-11-19" })).error), /future|YYYY-MM-DD/);
  const nova = await call(d, "profiles", { bot: "Nova", action: "record", platform: "YouTube", image: "banner", link: "https://example.com/yt.jpg", changed: "2026-11-18" });
  assert.equal(nova.saved, true, nova.error || "");
  const claude = await call(d, "profiles", { bot: "Claude", action: "record", platform: "X", image: "header", link: "https://example.com/x-header.jpg", changed: "2026-11-02" }, "claude");
  assert.equal(claude.saved, true, claude.error || "");
  const view = S.profilesView(await S.getProfiles(d), []);
  assert.equal(slot(view, "Instagram", "instagram-photo").current.link, "https://example.com/ig-now.jpg");
  assert.equal(slot(view, "Instagram", "instagram-photo").current.changed, "2026-10-01");
  assert.equal(slot(view, "X", "x-header").current.by, "Claude");
});

test("a new image is checked, then waits for Yes, correct; a bad file is not asked", async () => {
  const d = memoryDesk();
  await call(d, "profiles", { bot: "Atlas", action: "record", platform: "Spotify", image: "header", link: "https://example.com/old-header.jpg", changed: "2026-09-01" });
  const bad = await call(d, "profiles", { bot: "Atlas", action: "propose", platform: "Spotify", image: "header", link: "https://example.com/new-header.jpg", width: 1500, height: 500, format: "jpg", size_mb: 2 });
  assert.match(bad.error, /2660 x 1140/);
  assert.match(bad.error, /Nothing was asked/);
  assert.equal((await S.listMessages(d, NOW)).length, 0, "a file that fails the rule never reaches Luke");
  const bare = await call(d, "profiles", { bot: "Atlas", action: "propose", platform: "Spotify", image: "header", link: "https://example.com/new-header.jpg" });
  assert.match(bare.error, /width, height, format, size_mb/);
  const ok = await call(d, "profiles", { bot: "Atlas", action: "propose", platform: "Spotify", image: "header", link: "https://example.com/new-header.jpg", ...GOOD["spotify-header"], why: "A made-up header for the test." });
  assert.equal(ok.asked, true, ok.error || "");
  assert.match(ok.note, /Yes, correct/);
  assert.match(ok.note, /by hand/);
  assert.match(ok.rule, /2660 x 1140/);
  const again = await call(d, "profiles", { bot: "Laura", action: "propose", platform: "Spotify", image: "header", link: "https://example.com/other.jpg", ...GOOD["spotify-header"] });
  assert.match(again.error, /Atlas/);
  const twice = await call(d, "profiles", { bot: "Atlas", action: "propose", platform: "Spotify", image: "header", link: "https://example.com/third.jpg", ...GOOD["spotify-header"] });
  assert.match(twice.error, /not answered/);
  const ig = await call(d, "profiles", { bot: "Nova", action: "propose", platform: "Instagram", link: "https://example.com/ig-next.jpg", width: 320, height: 320, format: "jpg", why: "Made-up." });
  assert.equal(ig.asked, true, ig.error || "");
  assert.match(ig.rule, /320 x 320/);
  assert.match(String((await call(d, "profiles", { bot: "Steve", action: "propose", platform: "Instagram", link: "https://example.com/ig-next.jpg", width: 320, height: 320, format: "jpg" })).error), /Luke/);
  const msg = (await S.listMessages(d, NOW)).find((m) => m.id === ok.message_id);
  assert.deepEqual(msg.options, ["Yes, correct", "No"]);
  assert.equal(msg.proposal.action, "profile");
  assert.equal(msg.proposal.link, "https://example.com/new-header.jpg");
  assert.match(String((await call(d, "profiles", { bot: "Kevin", action: "propose", platform: "YouTube", image: "banner", link: "https://example.com/yt.jpg", ...GOOD["youtube-banner"] })).error), /Laura/);
  /* the functions themselves do not call a platform */
  assert.doesNotMatch(S.proposeProfile.toString() + S.recordProfile.toString() + S.profilesView.toString(), /fetch\(|graph\.facebook|instagram\.com/);
});

test("Yes, correct records the approval and leaves the live image until the bot records the upload", async () => {
  const d = memoryDesk();
  await call(d, "profiles", { bot: "Laura", action: "record", platform: "YouTube", image: "banner", link: "https://example.com/yt-old.jpg", changed: "2026-08-01" });
  const asked = await call(d, "profiles", { bot: "Laura", action: "propose", platform: "YouTube", image: "banner", link: "https://example.com/yt-new.jpg", ...GOOD["youtube-banner"] });
  const yes = await call(d, "record_luke_answer", { bot: "Alfred", reply_to: asked.message_id, luke_said: "Yes, correct", option: "Yes, correct" });
  assert.equal(yes.saved, true, yes.error || "");
  assert.match(yes.release || yes.proposal || "", /by hand|uploads it/);
  let view = S.profilesView(await S.getProfiles(d), await S.listMessages(d, NOW));
  assert.equal(slot(view, "YouTube", "youtube-banner").current.link, "https://example.com/yt-old.jpg", "the live image stays until it is recorded");
  assert.equal(slot(view, "YouTube", "youtube-banner").approved.link, "https://example.com/yt-new.jpg");
  assert.equal(slot(view, "YouTube", "youtube-banner").waiting, null);
  const early = await call(d, "profiles", { bot: "Laura", action: "propose", platform: "YouTube", image: "banner", link: "https://example.com/yt-other.jpg", ...GOOD["youtube-banner"] });
  assert.match(early.error, /already said yes/);
  const recorded = await call(d, "profiles", { bot: "Laura", action: "record", platform: "YouTube", image: "banner", link: "https://example.com/yt-new.jpg", changed: "2026-11-18" });
  assert.equal(recorded.saved, true, recorded.error || "");
  view = S.profilesView(await S.getProfiles(d), await S.listMessages(d, NOW));
  assert.equal(slot(view, "YouTube", "youtube-banner").current.link, "https://example.com/yt-new.jpg");
  assert.equal(slot(view, "YouTube", "youtube-banner").approved, null, "recording the upload clears the yes");
});

test("No leaves the live image and does not approve anything", async () => {
  const d = memoryDesk();
  const asked = await call(d, "profiles", { bot: "Kevin", action: "propose", platform: "TikTok", link: "https://example.com/tt.jpg", width: 720, height: 720, format: "jpg" });
  assert.equal(asked.asked, true, asked.error || "");
  assert.match(asked.rule, /720 x 720/);
  const no = await call(d, "record_luke_answer", { bot: "Alfred", reply_to: asked.message_id, luke_said: "No", option: "No" });
  assert.equal(no.saved, true, no.error || "");
  const view = S.profilesView(await S.getProfiles(d), await S.listMessages(d, NOW));
  assert.equal(slot(view, "TikTok", "tiktok-photo").current, null);
  assert.equal(slot(view, "TikTok", "tiktok-photo").approved, null);
  assert.equal(slot(view, "TikTok", "tiktok-photo").waiting, null);
});

test("the page's lines, the card's confirm, and who has the tool", () => {
  const view = S.profilesView({
    slots: {
      "spotify-photo": { current: { link: "https://example.com/spot.jpg", changed: "2026-10-01", by: "Atlas" } },
      "instagram-photo": { approved: { link: "https://example.com/ig.jpg", by: "Steve", at: "2026-11-18T12:00:00Z" } },
    },
  }, [{ id: "mabc", from: "Laura", to: "Luke", needs: "decision", resolved: null, proposal: { action: "profile", slot: "youtube-banner", link: "https://example.com/yt.jpg" } }]);
  const blocks = L.profileBlocks(view);
  const spot = blocks.platforms.find((p) => p.platform === "Spotify").slots.find((s) => s.id === "spotify-photo");
  assert.equal(spot.currentLine, "Changed Thu 1 Oct · Atlas");
  assert.equal(spot.currentLink, "https://example.com/spot.jpg");
  const ig = blocks.platforms.find((p) => p.platform === "Instagram").slots[0];
  assert.match(ig.approvedLine, /Luke uploads it by hand/);
  assert.match(ig.approvedLine, /does not change the platform/);
  const yt = blocks.platforms.find((p) => p.platform === "YouTube").slots.find((s) => s.id === "youtube-banner");
  assert.match(yt.waitingLine, /Yes, correct/);
  assert.equal(yt.waitingHref, "#messages/mabc");
  const x = blocks.platforms.find((p) => p.platform === "X");
  assert.equal(x.ownerLine, "No owner yet. Luke uploads this himself.");
  assert.equal(blocks.waiting, 1);
  assert.match(L.proposalConfirm({ from: "Atlas", proposal: { action: "profile", title: "Spotify header", owner: "Atlas" } }, "Yes, correct"), /Atlas uploads it by hand/);
  assert.match(L.proposalConfirm({ from: "Atlas", proposal: { action: "profile", title: "Spotify header", owner: "Atlas" } }, "No"), /Nothing changes/);
  assert.ok(toolsFor("Atlas", R).some((t) => t.name === "profiles") && toolsFor("Laura", R).some((t) => t.name === "profiles"));
  assert.ok(toolsFor("Steve", R).some((t) => t.name === "profiles") && toolsFor("Kevin", R).some((t) => t.name === "profiles"));
  assert.ok(!toolsFor("Drop", R).some((t) => t.name === "profiles") && !toolsFor("Forge", R).some((t) => t.name === "profiles"));
  const tool = TOOLS.find((t) => t.name === "profiles");
  assert.match(tool.description, /by hand/);
  assert.match(tool.description, /never logs in|does not log in|does not change/i);
  const page = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../js/hq-shell.js", import.meta.url), "utf8");
  assert.match(page, /id="profiles"/);
  assert.equal(page.split('data-tab="profiles"').length - 1, 2, "rail and More sheet");
  assert.match(shell, /"profiles"/);
  assert.ok(L.cmdIndex({}).some((x) => x.href === "#profiles" && x.label === "Profiles"));
});

test("the sample shows a live image, one waiting for yes, and one Luke already approved", () => {
  const b = sampleBoard(NOW);
  const view = b.profiles;
  assert.equal(slot(view, "Spotify", "spotify-header").current.link, "https://example.com/sample/spotify-header.jpg");
  assert.equal(slot(view, "YouTube", "youtube-banner").waiting.by, "Laura");
  assert.equal(slot(view, "Instagram", "instagram-photo").approved.link, "https://example.com/sample/ig-next.jpg");
  assert.match(L.profileBlocks(view).platforms.find((p) => p.platform === "YouTube").slots.find((s) => s.id === "youtube-banner").waitingLine, /Yes, correct/);
});
