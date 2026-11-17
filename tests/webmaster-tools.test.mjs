/* Webmaster's three tools (16 Nov 2026, Luke: "let's do webmasters 3 fixes"):
   1. upload_cover: the cover goes ON the desk and gets a public badscandal.com link (Drive links answered with a
      sign-in page, so song_page couldn't use them)
   2. song_pages: what happened to each song-page request (waiting on Luke, he said no, sent to GitHub, live)
      and which song the home card should show today
   3. song_page kind "card": the home card (listen.json + the home page's fallback) through the desk, Luke
      confirming, GitHub publishing; the rule for when it switches songs
   Every name, date and picture here is made up. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, INSTRUCTIONS } from "../netlify/lib/staff-tools.mjs";
import { homeCardSong } from "../netlify/lib/songs.mjs";
import { checkJob } from "../tools/song-job.mjs";
import { cardRelease, cardHtml } from "../tools/home-card.mjs";

const NOW = Date.parse("2026-11-16T15:00:00Z");
const MIN = 60000;
const R = S.DEFAULT_ROSTER;
const fails = (p, re) => assert.rejects(p, (e) => e.name === "StaffError" && re.test(e.message));
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args) => callTool(tool(name), args, { store: d, now: NOW, role: "bot", hq: async () => null });
/* a made-up PNG: the signature and an IHDR saying w x h; the rest is filler (the desk never decodes a picture) */
const png = (w, h, extra = 2000) => { const b = Buffer.alloc(33 + extra); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0); b.writeUInt32BE(13, 8); b.write("IHDR", 12, "latin1"); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
/* a made-up JPEG: SOI, one APP0, then a SOF0 saying h x w */
const jpg = (w, h) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03]), Buffer.alloc(1500)]);

/* ---------- 1. the cover on the desk ---------- */
test("upload_cover: Webmaster sends the picture, the desk keeps it and answers with a public badscandal.com link", async () => {
  const d = memoryDesk();
  const r = await call(d, "upload_cover", { bot: "Webmaster", song: "Paper Moon", image_base64: png(1400, 1400).toString("base64") });
  assert.match(r.link, /^https:\/\/badscandal\.com\/api\/staff\/cover\/c[a-z0-9]+\.png$/);
  assert.deepEqual([r.width, r.height], [1400, 1400]);
  const id = r.link.split("/").pop();
  const res = await S.coverResponse(d, id);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), png(1400, 1400));
  assert.equal((await S.coverResponse(d, "cnope.png")).status, 404);
  assert.equal((await S.coverResponse(d, "../covers.json")).status, 404);
  /* a JPEG's size is read too */
  const j = await call(d, "upload_cover", { bot: "Nova", song: "Paper Moon", image_base64: jpg(3000, 3000).toString("base64") });
  assert.deepEqual([j.width, j.height, j.link.endsWith(".jpg")], [3000, 3000, true]);
});

test("upload_cover: from a link the site can open (never a sign-in page); what is refused", async () => {
  const d = memoryDesk();
  const fetchOk = async () => ({ ok: true, status: 200, url: "https://example.com/c.jpg", headers: new Map([["content-length", "1518"]]), arrayBuffer: async () => jpg(1200, 1200) });
  const r = await S.uploadCover(d, NOW, R, { by: "Webmaster", song: "Paper Moon", url: "https://example.com/c.jpg" }, fetchOk);
  assert.match(r.link, /\.jpg$/);
  const signIn = async () => ({ ok: true, status: 200, url: "https://accounts.google.com/x", headers: new Map(), arrayBuffer: async () => Buffer.from("<!doctype html><title>Sign in</title>") });
  await fails(S.uploadCover(d, NOW, R, { by: "Webmaster", song: "Paper Moon", url: "https://drive.google.com/file/d/abc/view" }, signIn), /not a JPG, PNG or WebP picture.*sign-in page/);
  await fails(call(d, "upload_cover", { bot: "Webmaster", song: "Paper Moon", image_base64: png(800, 800).toString("base64") }), /1000 pixels/);
  await fails(call(d, "upload_cover", { bot: "Webmaster", song: "Paper Moon", image_base64: Buffer.from("hello").toString("base64") }), /not a JPG, PNG or WebP/);
  await fails(call(d, "upload_cover", { bot: "Webmaster", song: "Paper Moon", image_base64: png(1400, 1400, 4.6 * 1024 * 1024).toString("base64") }), /4 MB/);
  await fails(call(d, "upload_cover", { bot: "Kevin", song: "Paper Moon", image_base64: png(1400, 1400).toString("base64") }), /Webmaster/);
  await fails(call(d, "upload_cover", { bot: "Webmaster", song: "Paper Moon" }), /image_base64 or url/);
  await fails(S.uploadCover(d, NOW, R, { by: "Webmaster", song: "Paper Moon", url: "http://example.com/c.jpg" }, fetchOk), /https/);
});

/* ---------- 3. the home card: the rule ---------- */
test("homeCardSong: a song out in the last 7 days (the newest), else the next one coming, else the newest out", () => {
  const songs = [{ slug: "a", title: "A", date: "2026-11-24" }, { slug: "b", title: "B", date: "2026-11-27" }, { slug: "c", title: "C", date: "2026-10-30" }];
  const at = (t) => homeCardSong(songs, t).slug;
  assert.equal(at("2026-11-16"), "a", "before either: the next one coming");
  assert.equal(at("2026-11-24"), "a", "its release day");
  assert.equal(at("2026-11-26"), "a");
  assert.equal(at("2026-11-27"), "b", "a newer release takes over on its day");
  assert.equal(at("2026-12-03"), "b", "its 7 days");
  assert.equal(at("2026-12-04"), "b", "nothing coming: the newest out stays");
  assert.equal(homeCardSong([...songs, { slug: "d", title: "D", date: "2026-12-11" }], "2026-12-04").slug, "d", "after its week: the next one coming");
  assert.deepEqual(homeCardSong(songs, "2026-11-27").why, "B came out Fri 27 Nov: it stays on the card for its first 7 days (to Thu 3 Dec)");
  assert.equal(homeCardSong([], "2026-11-16"), null);
});

test("the home card job: listen.json's release and the home page's fallback, from the song's own entry", () => {
  const song = { slug: "papermoon", title: "Paper Moon", date: "2026-11-27", cover: "assets/listen-papermoon-cover-v1.jpg", share: "assets/share-papermoon-1200-v1.jpg", spotifyTrack: "", spotifyArtist: "https://open.spotify.com/artist/AbCdEfGhIjKlMnOpQrStUv" };
  assert.deepEqual(cardRelease(song, "2026-11-20", { kicker: "New single" }), { mode: "upcoming", title: "Paper Moon", kicker: "New single", date: "2026-11-27", cover: "assets/listen-papermoon-cover-v1.jpg", cta: "https://open.spotify.com/artist/AbCdEfGhIjKlMnOpQrStUv", links: {} });
  const out = cardRelease({ ...song, spotifyTrack: "https://open.spotify.com/track/ZyXwVuTsRqPoNmLkJiHgFe" }, "2026-11-28", {});
  assert.deepEqual([out.mode, out.cta, out.kicker], ["out", "https://open.spotify.com/track/ZyXwVuTsRqPoNmLkJiHgFe", "New single"]);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const h = cardHtml(html, song);
  assert.match(h, /<meta property="og:image" content="https:\/\/badscandal\.com\/assets\/share-papermoon-1200-v1\.jpg">/);
  assert.match(h, /<meta name="twitter:image" content="https:\/\/badscandal\.com\/assets\/share-papermoon-1200-v1\.jpg">/);
  assert.match(h, /<meta property="og:image:alt" content="BADSCANDAL — Paper Moon, cover art">/);
  assert.match(h, /data-rel="cover" src="assets\/listen-papermoon-cover-v1\.jpg" alt="Paper Moon — cover"/);
  assert.match(h, /<h2 class="rel-title" data-rel="title">Paper Moon<\/h2>/);
  const a = html.split("\n"), z = h.split("\n");
  assert.equal(a.length, z.length);
  assert.ok(a.filter((l, i) => l !== z[i]).length <= 6, "only the card's and the preview's lines change");
  assert.throws(() => cardHtml("<html>nothing here</html>", song), /couldn't find/);
});

/* ---------- 3. the home card through the desk ---------- */
test("song_page kind card: Luke confirms, GitHub changes the card; the song needs a page, and isn't on the card already", async (t) => {
  const d = memoryDesk(), sent = [];
  S.useSongDispatch(async (job) => { sent.push(job); return { ok: true }; });
  t.after(() => S.useSongDispatch(null));
  await fails(call(d, "song_page", { bot: "Webmaster", kind: "card", slug: "nosuch" }), /no page called/);
  const cur = S.homeCardNow();
  await fails(call(d, "song_page", { bot: "Webmaster", kind: "card", slug: cur.slug }), /already on the home card/);
  const other = ["touchme", "medaseubody"].find((x) => x !== cur.slug);
  const r = await call(d, "song_page", { bot: "Webmaster", kind: "card", slug: other });
  const m = await S.getMessage(d, r.id);
  assert.match(m.text, /^Webmaster asks: is this correct\? Put .+ on the home card \(badscandal\.com\)/);
  assert.equal(m.proposal.action, "card");
  await S.sendMessage(d, NOW + MIN, R, { from: "Luke", to: "Webmaster", text: "yes", re: r.id, note: "Yes, correct" });
  assert.deepEqual(sent, [{ kind: "card", slug: other, by: "Webmaster", msg: r.id }]);
  assert.deepEqual(checkJob({ kind: "card", slug: other, by: "Webmaster" }), { kind: "card", slug: other, by: "Webmaster" });
});

/* ---------- 2. what happened to each request ---------- */
test("song_pages: each request and where it is, newest first; and what the home card should show today", async (t) => {
  const d = memoryDesk();
  let answer = { ok: true };
  S.useSongDispatch(async () => answer);
  t.after(() => S.useSongDispatch(null));
  const ask = (o) => call(d, "song_page", { bot: "Webmaster", ...o });
  const yes = (id) => S.sendMessage(d, NOW + MIN, R, { from: "Luke", to: "Webmaster", text: "yes", re: id, note: "Yes, correct" });
  const a = await ask({ kind: "new", slug: "papermoon", title: "Paper Moon", date: "2026-11-27", cover: "https://example.com/p.jpg" });
  const b = await ask({ kind: "new", slug: "glasshouse", title: "Glass House", date: "2026-12-11", cover: "https://example.com/g.jpg" });
  await S.sendMessage(d, NOW + MIN, R, { from: "Luke", to: "Webmaster", text: "not yet", re: b.id, note: "No" });
  const c = await ask({ kind: "new", slug: "slowfade", title: "Slow Fade", date: "2026-12-25", cover: "https://example.com/s.jpg" });
  answer = { ok: false, error: "GitHub refused the site's key (made up)." };
  await yes(c.id);
  answer = { ok: true };
  await yes(a.id);
  const cur = S.homeCardNow();
  const other = ["touchme", "medaseubody"].find((x) => x !== cur.slug);
  const e = await ask({ kind: "card", slug: other });
  const s = await call(d, "song_pages", { bot: "Webmaster" });
  const by = Object.fromEntries(s.requests.map((x) => [x.address, x]));
  assert.match(by["badscandal.com/papermoon"].state, /^sent to GitHub .*: not live yet/);
  assert.equal(by["badscandal.com/glasshouse"].state, "Luke said no");
  assert.match(by["badscandal.com/slowfade"].state, /^not sent: GitHub refused the site's key/);
  assert.equal(s.requests.find((x) => x.id === e.id).state, "waiting on Luke");
  assert.ok(s.home_card.now && s.home_card.should_show && s.home_card.why);
  assert.match(tool("song_pages").description, /read only/i);
  assert.match(INSTRUCTIONS, /song_pages/);
});
