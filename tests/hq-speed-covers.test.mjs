/* HQ speed + release covers (26 Nov 2026, Luke: "it loads kinda slowly when you go to the needs you page" and
   "Survivors is the one that doesn't have [the cover] ... make sure that every song in future takes the artwork
   from the Google Drive link or Dropbox link that's posted into the song upload thing in the artwork section").
   Every link, id and picture here is made up. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as A from "../netlify/lib/artwork.mjs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { loadHq, SHEET_TTL, SHEET_STALE_OK } from "../netlify/lib/hq-load.mjs";
import { readTabs } from "../netlify/lib/gsheets.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";
import { generateKeyPairSync } from "node:crypto";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const L = await import("../js/hq-lib.js").then(() => globalThis.HQLib).catch(() => null);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 2)]);
const pic = (buf, type = "image/png") => new Response(buf, { status: 200, headers: { "content-type": type } });
const NOW = Date.parse("2026-11-26T15:00:00Z");
const SECRET = "made-up-secret";
const rel = (id, artwork, extra = {}) => ({ id, title: id, status: "scheduled", pack: { artwork }, ...extra });

/* ---------- the Artwork link ---------- */
test("artworkLink: Drive files and folders, Dropbox files (dl=1) and folders, plain https", () => {
  assert.deepEqual(A.artworkLink("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing"), { kind: "drive-file", id: "1AbCdEfGhIjKlMnOp" });
  assert.deepEqual(A.artworkLink("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp"), { kind: "drive-file", id: "1AbCdEfGhIjKlMnOp" });
  assert.deepEqual(A.artworkLink("https://drive.google.com/drive/folders/1FoLdErIdXyZ12345?usp=drive_link"), { kind: "drive-folder", id: "1FoLdErIdXyZ12345" });
  assert.deepEqual(A.artworkLink("https://drive.google.com/drive/u/0/folders/1FoLdErIdXyZ12345"), { kind: "drive-folder", id: "1FoLdErIdXyZ12345" });
  const db = A.artworkLink("https://www.dropbox.com/scl/fi/abc123/cover.jpg?rlkey=xyz&dl=0");
  assert.equal(db.kind, "dropbox");
  assert.match(db.url, /[?&]dl=1/); assert.match(db.url, /rlkey=xyz/);
  assert.equal(A.artworkLink("https://www.dropbox.com/scl/fo/abc123/def?rlkey=xyz").kind, "dropbox-folder");
  assert.equal(A.artworkLink("https://example.com/c.jpg").kind, "url");
  assert.equal(A.artworkLink("http://example.com/c.jpg").kind, "bad");
  assert.equal(A.artworkLink("not a link").kind, "bad");
});

test("artworkToken: the same release and link = the same address; a new link or another secret = another", () => {
  const t = A.artworkToken("survivors", "https://example.com/a.jpg", SECRET);
  assert.match(t, /^[a-f0-9]{32}$/);
  assert.equal(A.artworkToken("survivors", "https://example.com/a.jpg", SECRET), t);
  assert.notEqual(A.artworkToken("survivors", "https://example.com/b.jpg", SECRET), t);
  assert.notEqual(A.artworkToken("survivors", "https://example.com/a.jpg", "other"), t);
  assert.equal(A.artworkPath(t), "/api/staff/artwork/" + t);
});

/* ---------- the copy ---------- */
test("the picture is fetched ONCE from the link, kept on the desk, and served from the copy after", async () => {
  const d = memoryDesk(), link = "https://www.dropbox.com/scl/fi/abc/cover.png?rlkey=k&dl=0", asked = [];
  const releases = [rel("survivors", link)];
  const token = A.artworkToken("survivors", link, SECRET);
  const fetchImpl = async (u) => { asked.push(u); return pic(PNG); };
  const r1 = await A.artworkResponse(d, token, { releases, secret: SECRET, fetchImpl, now: NOW });
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get("content-type"), "image/png");
  assert.match(r1.headers.get("cache-control"), /immutable/);
  assert.deepEqual(Buffer.from(await r1.arrayBuffer()), PNG);
  assert.equal(asked.length, 1); assert.match(asked[0], /dl=1/);
  const r2 = await A.artworkResponse(d, token, { releases, secret: SECRET, fetchImpl, now: NOW + 60000 });
  assert.equal(r2.status, 200);
  assert.deepEqual(Buffer.from(await r2.arrayBuffer()), PNG);
  assert.equal(asked.length, 1, "the second view is the desk's copy: Dropbox is not asked again");
});

test("an address the board never gave out is 404 and opens no link", async () => {
  const d = memoryDesk(); let asked = 0;
  const fetchImpl = async () => { asked++; return pic(PNG); };
  const releases = [rel("survivors", "https://example.com/c.png")];
  assert.equal((await A.artworkResponse(d, "0".repeat(32), { releases, secret: SECRET, fetchImpl })).status, 404);
  assert.equal((await A.artworkResponse(d, "../../etc", { releases, secret: SECRET, fetchImpl })).status, 404);
  assert.equal(asked, 0);
});

test("a link that can't be shown says why in plain words, kept 30 minutes, and ?why=1 hands the reason over", async () => {
  const d = memoryDesk(), link = "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view";
  const releases = [rel("survivors", link)];
  const token = A.artworkToken("survivors", link, SECRET);
  let asked = 0;
  const signIn = async () => { asked++; return new Response("<html><title>Sign in - Google Accounts</title>accounts.google.com</html>", { status: 200, headers: { "content-type": "text/html" } }); };
  const r = await A.artworkResponse(d, token, { releases, secret: SECRET, fetchImpl: signIn, now: NOW });
  assert.equal(r.status, 404);
  assert.match((await r.json()).why, /Anyone with the link/);
  const w = await A.artworkResponse(d, token, { releases, secret: SECRET, fetchImpl: signIn, now: NOW + 60000, why: true });
  assert.match((await w.json()).why, /sign in/i);
  assert.equal(asked, 1, "inside 30 minutes the reason is the kept one");
  await A.artworkResponse(d, token, { releases, secret: SECRET, fetchImpl: signIn, now: NOW + A.ART_RETRY_MS + 1 });
  assert.equal(asked, 2, "after 30 minutes it is tried again (Luke may have shared it meanwhile)");
});

test("folders, zips, non-pictures and huge files are refused with what to do", async () => {
  await assert.rejects(A.fetchArtwork("https://www.dropbox.com/scl/fo/abc/def?rlkey=k"), (e) => /Dropbox folder/.test(e.why));
  await assert.rejects(A.fetchArtwork("https://drive.google.com/drive/folders/1FoLdErIdXyZ12345"), (e) => /Google Drive folder/.test(e.why));
  await assert.rejects(A.fetchArtwork("https://example.com/c.zip", { fetchImpl: async () => pic(Buffer.from([0x50, 0x4b, 3, 4, 0, 0])) }), (e) => /folder or a zip/.test(e.why));
  await assert.rejects(A.fetchArtwork("https://example.com/c.txt", { fetchImpl: async () => pic(Buffer.from("hello there")) }), (e) => /isn't a JPG, PNG or WebP/.test(e.why));
  await assert.rejects(A.fetchArtwork("https://example.com/big.jpg", { fetchImpl: async () => new Response("x", { headers: { "content-length": String(A.ART_MAX + 1) } }) }), (e) => /over 25 MB/.test(e.why));
  await assert.rejects(A.fetchArtwork("https://example.com/gone.jpg", { fetchImpl: async () => new Response("", { status: 404 }) }), (e) => /wasn't found/.test(e.why));
});

test("Drive: through the service account first, else the public download; a shared folder gives its cover", async () => {
  const streamed = [];
  const drive = { stream: async (id) => { streamed.push(id); return pic(JPG, "image/jpeg"); },
    list: async () => [{ id: "1aaaaaaaaaaa", name: "back.png", mimeType: "image/png" }, { id: "1cccccccccccc", name: "Survivors COVER 3000.jpg", mimeType: "image/jpeg" }] };
  const f = await A.fetchArtwork("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view", { drive, fetchImpl: async () => { throw new Error("no public fetch"); } });
  assert.equal(f.type, "jpg"); assert.deepEqual(streamed, ["1AbCdEfGhIjKlMnOp"]);
  const g = await A.fetchArtwork("https://drive.google.com/drive/folders/1FoLdErIdXyZ12345", { drive });
  assert.equal(g.type, "jpg"); assert.equal(streamed.pop(), "1cccccccccccc", "the picture named like the cover");
  /* not shared with the service account: the public download */
  const asked = [];
  const no = { stream: async () => { throw new Error("404"); } };
  const h = await A.fetchArtwork("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view", { drive: no, fetchImpl: async (u) => { asked.push(u); return pic(PNG); } });
  assert.equal(h.type, "png"); assert.match(asked[0], /uc\?export=download&id=1AbCdEfGhIjKlMnOp/);
});

test("the board hands every release with an Artwork link its cover address; the route is public and before the login", async () => {
  const d = memoryDesk();
  await S.saveRelease(d, NOW, S.DEFAULT_ROSTER, { by: "Luke", title: "Survivors", date: "2026-12-20", pack: { artwork: "https://www.dropbox.com/scl/fi/abc/surv.jpg?rlkey=k&dl=0" } });
  const desk = await S.loadDesk(d, NOW);
  const b = S.board(desk, NOW, null, { artworkUrl: (id, link) => A.artworkPath(A.artworkToken(id, link, SECRET)) });
  const r = b.releases.find((x) => x.title === "Survivors");
  assert.equal(r.artworkUrl, A.artworkPath(A.artworkToken(r.id, r.pack.artwork, SECRET)));
  assert.equal(S.board(desk, NOW, null).releases[0].artworkUrl, undefined, "no address function, no address");
  const fn = read("netlify/functions/staff.mjs");
  assert.ok(fn.indexOf('path.startsWith("artwork/")') < fn.indexOf("const luke = await isLuke(req)"), "served before the login, like the desk covers");
  assert.match(fn, /artworkUrl: artworkUrlFor/);
  assert.doesNotMatch(read("netlify/lib/artwork.mjs"), /console\.(log|error)\([^)]*(link|artwork)/, "a link is never logged");
});

test("song_page with no cover takes the Artwork link from the song's release form", async (t) => {
  const d = memoryDesk();
  S.useSongDispatch(async () => ({ ok: true }));
  t.after(() => S.useSongDispatch(null));
  const art = "https://www.dropbox.com/scl/fi/made/up-cover.jpg?rlkey=k&dl=0";
  await S.saveRelease(d, NOW, S.DEFAULT_ROSTER, { by: "Luke", title: "Paper Moon", date: "2026-12-20", pack: { artwork: art } });
  const tool = TOOLS.find((x) => x.name === "song_page");
  const r = await callTool(tool, { bot: "Webmaster", kind: "new", slug: "papermoon", title: "Paper Moon", date: "2026-12-20" }, { store: d, now: NOW, role: "bot", hq: async () => null });
  assert.ok(!r.isError, JSON.stringify(r).slice(0, 300));
  const asked = (await S.listMessages(d, NOW + 60000)).filter((m) => m.to === "Luke");
  assert.ok(JSON.stringify(asked).includes("up-cover.jpg"), "Luke is asked about the page with the Artwork link as its cover");
  /* no release with that name and no cover: still refused, and the sentence says how */
  await assert.rejects(callTool(tool, { bot: "Webmaster", kind: "new", slug: "glasshouse", title: "Glass House", date: "2026-12-20" }, { store: d, now: NOW, role: "bot", hq: async () => null }),
    (e) => e.name === "StaffError" && /release form/.test(e.message));
});

/* ---------- the page ---------- */
test("artworkThumb: the site's copy through Netlify's picture service at 200 px; anything else untouched", () => {
  const src = read("js/hq-lib.js");
  assert.match(src, /artworkThumb: artworkThumb/);
  const fn = new Function("return (" + src.slice(src.indexOf("function artworkThumb"), src.indexOf("function releaseFace")) + ")")();
  const p = "/api/staff/artwork/" + "a".repeat(32);
  assert.equal(fn(p), "/.netlify/images?url=" + encodeURIComponent(p) + "&w=200&h=200&fit=cover&q=80");
  assert.equal(fn("assets/x.webp"), "assets/x.webp");
  assert.equal(fn(""), "");
});

test("Upcoming: the song page's cover first, else the Artwork copy (small, then full), else the sheet's; a failure says why", () => {
  const js = read("js/hq-staff.js");
  assert.match(js, /var cover = pageCover \|\| \(art \? L\.artworkThumb\(art\) : ""\) \|\| \(sheetSong && sheetSong\.cover\) \|\| ""/);
  assert.match(js, /data-art="/);
  assert.match(js, /t\.setAttribute\("src", orig\)/, "the small copy failing falls back to the site's own copy");
  assert.match(js, /src \+ "\?why=1"/);
  assert.match(js, /'<p class="rdist rcoverwhy">Cover: '/);
});

test("opening HQ draws this device's last good copies at once, then the fresh answers replace them", () => {
  const hq = read("js/hq.js"), st = read("js/hq-staff.js");
  assert.ok(hq.indexOf("drawKept();\n    refresh();") > 0, "the kept copies before the network is asked");
  assert.match(hq, /function drawKept\(\) \{\n    if \(sample\) return;/);
  assert.match(hq, /"updating…"/);
  assert.match(st, /function showKept\(\) \{\n    if \(board \|\| HQ\.sample\) return false;/);
  assert.match(st, /showKept: showKept/);
});

test("the offline helper: versioned scripts from the copy first, the page waits 3.5 s at most", () => {
  const sw = read("hq-sw.js");
  assert.match(sw, /var PAGE_MS = 3500;/);
  assert.match(sw, /url\.search\.indexOf\("\?v="\) === 0/);
  assert.match(sw, /return hit \|\| fetchWithTimeout\(req\)/);
});

/* ---------- the server ---------- */
const KEY = (() => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
  return JSON.stringify({ client_email: "made-up@example.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
})();
function google() {
  const n = { token: 0, read: 0 };
  const fetchImpl = async (u) => {
    if (String(u).includes("oauth2")) { n.token++; return new Response(JSON.stringify({ access_token: "made-up", expires_in: 3600 }), { status: 200 }); }
    if (String(u).includes("sheets.googleapis.com")) { n.read++; const tabs = [...new URL(u).searchParams.getAll("ranges")]; return new Response(JSON.stringify({ valueRanges: tabs.map(() => ({ values: [["a"]] })) }), { status: 200 }); }
    return new Response("{}", { status: 500 });
  };
  return { n, fetchImpl };
}

test("the Google token is asked for once and reused; three reads at once share it", async () => {
  const g = google();
  await Promise.all([readTabs(KEY, "sheet", ["A"], g.fetchImpl), readTabs(KEY, "sheet", ["B"], g.fetchImpl), readTabs(KEY, "sheet", ["C"], g.fetchImpl)]);
  await readTabs(KEY, "sheet", ["D"], g.fetchImpl);
  assert.equal(g.n.token, 1);
  assert.equal(g.n.read, 4);
  /* a refused key is not kept */
  const bad = async (u) => (String(u).includes("oauth2") ? new Response("{}", { status: 400 }) : new Response("{}", { status: 500 }));
  assert.match((await readTabs(KEY, "sheet", ["A"], bad)).error, /refused/);
  assert.match((await readTabs(KEY, "sheet", ["A"], bad)).error, /refused/);
});

test("the page's read answers with a copy up to 15 minutes old and reads the sheet after; a bot's read still waits", async () => {
  assert.ok(SHEET_STALE_OK > SHEET_TTL);
  const cache = memoryDesk();
  const env = (k) => ({ GOOGLE_SA_KEY: KEY, HQ_SHEET_ID: "sheet" })[k];
  const seed = (age) => cache.setJSON("hq/sheets.json", { at: NOW - age, sheets: { Growth: [], Songs: [], Fans: [], Releases: [], Tasks: [], Spend: [] } });
  /* 5 minutes old, the page's read: no wait for Google, the read goes to the background */
  await seed(5 * 60000);
  let g = google(); const later = [];
  const a = await loadHq({ cache, env, now: NOW, fetchImpl: g.fetchImpl, later: (p) => later.push(p) });
  assert.equal(a.connected, true);
  assert.equal(a.readAt, new Date(NOW - 5 * 60000).toISOString(), "the copy is what answered, and the page says when it was read");
  assert.equal(later.length, 1);
  await Promise.all(later);
  assert.equal(g.n.read, 3, "the background read: the tabs, Updates and Rates at once");
  assert.ok((await cache.get("hq/sheets.json", { type: "json" })).at > NOW - 60000, "the background read saved the new copy");
  /* 20 minutes old: too old, it waits */
  await seed(20 * 60000); g = google(); later.length = 0;
  const b = await loadHq({ cache, env, now: NOW, fetchImpl: g.fetchImpl, later: (p) => later.push(p) });
  assert.equal(later.length, 0); assert.equal(g.n.read, 3); assert.equal(b.readAt, new Date(NOW).toISOString());
  /* 5 minutes old but no `later` (a bot's tool call): it waits for Google */
  await seed(5 * 60000); g = google();
  const c = await loadHq({ cache, env, now: NOW, fetchImpl: g.fetchImpl });
  assert.equal(g.n.read, 3); assert.equal(c.readAt, new Date(NOW).toISOString());
});

test("the board reads side by side and says where the time went (Server-Timing)", () => {
  const fn = read("netlify/functions/staff.mjs");
  assert.match(fn, /const \[desk, hqAns, pageBuilds\] = await Promise\.all\(\[/);
  assert.match(fn, /const \[auto, accountHealth\] = await Promise\.all\(\[/);
  assert.match(fn, /"Server-Timing": Object\.entries\(lap\)/);
  assert.match(fn, /hqLoader\(st, later\)\(\)/);
  assert.match(read("netlify/functions/hq.mjs"), /fresh: url\.searchParams\.get\("fresh"\) === "1", later \}/);
});
