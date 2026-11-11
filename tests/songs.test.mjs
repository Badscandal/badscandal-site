/* The song list (/songs.json) and everything that must agree with it (10 Nov 2026). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { edgePaths, problems, SONGS, songFromPath } from "../netlify/lib/songs.mjs";
import { LINKS, defaultLink } from "../netlify/lib/admin.mjs";
import { EDGE, EDGE_RE, edgeConfig, render, ROOT } from "../tools/song-page.mjs";

const DATA = JSON.parse(readFileSync(join(ROOT, "songs.json"), "utf8"));
const read = (f) => readFileSync(join(ROOT, f), "utf8");

test("songs.json follows the rules (slugs, dates, -vN assets, Spotify links, no pre-saves)", () => {
  assert.deepEqual(problems(), []);
  assert.ok(SONGS.length >= 2);
  assert.deepEqual(problems([{ slug: "x", title: "X", date: "2026-1-1", cover: "a.jpg", coverWeb: "assets/x-v1.webp", share: "assets/s-v1.jpg",
    spotifyTrack: "https://ffm.to/presave", spotifyArtist: "nope" }]).length > 3, true, "bad entries are caught");
});

test("every song has its page, and each page is exactly what the list + template produce", () => {
  for (const s of DATA.songs) {
    const f = s.slug + ".html";
    assert.ok(existsSync(join(ROOT, f)), f + " is missing: run node tools/new-song.mjs --rebuild");
    assert.equal(read(f), render(s, DATA.spotifyArtist), f + " drifted from songs.json: run node tools/new-song.mjs --rebuild");
  }
});

test("the edge function's literal path list matches the list", () => {
  const edge = readFileSync(EDGE, "utf8");
  assert.equal(edge.match(EDGE_RE)[0], edgeConfig(DATA.songs), "run node tools/new-song.mjs --rebuild");
  for (const p of edgePaths()) assert.ok(edge.includes(`"${p}"`), p);
});

test("every image a song uses exists; share images are under 200 KB (WhatsApp)", () => {
  for (const s of DATA.songs) {
    for (const k of ["cover", "coverWeb", "share"]) assert.ok(existsSync(join(ROOT, s[k])), s[k]);
    assert.ok(statSync(join(ROOT, s.share)).size < 200 * 1024, s.share + " is over 200 KB");
  }
});

test("/admin lists every song (newest first) plus the home page, and opens on the newest song that is out", () => {
  const ids = LINKS.map((l) => l.id);
  for (const s of SONGS) assert.ok(ids.includes(s.slug), s.slug);
  assert.equal(ids.at(-1), "home");
  assert.equal(defaultLink(Date.parse("2026-11-10T12:00:00Z")).id, "touchme");
  assert.equal(defaultLink(Date.parse("2026-11-25T12:00:00Z")).id, "medaseubody");
});

test("song paths: /slug, /slug.html and /slug/ are the song; anything else is not", () => {
  assert.equal(songFromPath("/touchme").title, "Touch Me");
  assert.equal(songFromPath("/touchme.html").title, "Touch Me");
  assert.equal(songFromPath("/medaseubody/").title, "Me Dá Seu Body");
  for (const p of ["/", "/admin", "/touchme/x", "/../touchme", "/privacy", "", null]) assert.equal(songFromPath(p), null, String(p));
});

test("the visit counter accepts every song, the home page and the old listen page", () => {
  const hit = read("netlify/functions/hit.mjs");
  assert.match(hit, /new Set\(\["home", "listen", \.\.\.SONGS\.map/);
});

/* ---------- link previews ---------- */

const PAGES = readdirSync(ROOT).filter((f) => f.endsWith(".html"));
test("every og:image is an absolute https://badscandal.com/ URL to a file that exists", () => {
  for (const f of PAGES) {
    for (const m of read(f).matchAll(/<meta property="og:image" content="([^"]+)"/g)) {
      assert.match(m[1], /^https:\/\/badscandal\.com\/assets\//, f);
      assert.ok(existsSync(join(ROOT, m[1].replace("https://badscandal.com/", ""))), f + ": " + m[1]);
    }
  }
});

test("home, /touchme and /medaseubody previews: 1200x1200 JPG under 200 KB, og:url, og:type, twitter:card", () => {
  for (const f of ["index.html", "touchme.html", "medaseubody.html"]) {
    const h = read(f);
    const img = h.match(/<meta property="og:image" content="https:\/\/badscandal\.com\/([^"]+)"/)[1];
    assert.match(img, /^assets\/share-[a-z0-9-]+-1200-v\d+\.jpg$/, f);
    assert.ok(statSync(join(ROOT, img)).size < 200 * 1024, img);
    assert.match(h, /<meta property="og:image:width" content="1200">/, f);
    assert.match(h, /<meta property="og:image:height" content="1200">/, f);
    assert.match(h, /<meta property="og:url" content="https:\/\/badscandal\.com\//, f);
    assert.match(h, /<meta property="og:type" content="[a-z.]+">/, f);
    assert.match(h, /<meta name="twitter:card" content="summary_large_image">/, f);
  }
});

/* ---------- Feature.fm is gone, no pre-saves ---------- */

test("no Feature.fm, music.badscandal.com or pre-save links in anything the site serves", () => {
  const served = [...PAGES, "_redirects", "listen.json", "songs.json", ...readdirSync(join(ROOT, "js")).map((f) => "js/" + f)];
  for (const f of served) {
    const t = read(f);
    assert.doesNotMatch(t, /(https?:)?\/\/[^\s"'<>]*(music\.badscandal\.com|ffm\.to|feature\.fm)/i, f);
    assert.doesNotMatch(t, /href="[^"]*pre-?save|"presave"\s*:\s*"http/i, f);
  }
  assert.match(read("_redirects"), /^\/listen\s+\/\s+302!$/m);
  assert.match(read("_redirects"), /^\/listen\.html\s+\/\s+302!$/m);
  for (const f of ["hq.html", "js/hq.js", "js/hq-pages.js", "index.html", "js/listen.js"]) assert.doesNotMatch(read(f), /Feature\.fm/i, f);
});
