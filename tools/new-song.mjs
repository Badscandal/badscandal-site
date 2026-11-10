#!/usr/bin/env node
/* Adds a song page (10 Nov 2026). Run from the repo root, on the Mac (uses macOS `sips`, and
   `cwebp` from Homebrew when it's there):

     1. Put the cover in assets/ as  listen-<slug>-cover-v1.jpg   (square JPG, 1000 px or more)
     2. node tools/new-song.mjs <slug> "<Title>" <YYYY-MM-DD>
          e.g. node tools/new-song.mjs medaseubody "Me Dá Seu Body" 2026-11-24
     3. npm test, then commit the new files BY NAME (the tool prints the list) and push.

   It makes the 600 px page cover (webp) and the 1200 px link-preview image (JPG under 200 KB, so
   WhatsApp shows it), adds the song to /songs.json (Spotify track empty: the page shows a
   countdown and "Follow on Spotify" until release day, then "Listen on Spotify"), writes
   <slug>.html from tools/song-template.html and adds the page to the edge function's list.
   /admin, the visit counter and the Meta events pick the song up from the list by themselves.

   On release day: paste the track link (https://open.spotify.com/track/…, without ?si=) into
   the song's "spotifyTrack" in songs.json, then:   node tools/new-song.mjs --rebuild
   --rebuild re-renders every song page + the edge list from songs.json (after a template edit
   too). Images are never overwritten: a new picture gets the next -vN name. No pre-save links. */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EDGE, EDGE_RE, edgeConfig, render, ROOT } from "./song-page.mjs";
import { problems } from "../netlify/lib/songs.mjs";

const LIST = join(ROOT, "songs.json");
const die = (msg) => { console.error("✗ " + msg); process.exit(1); };
const has = (cmd) => { try { execFileSync("/usr/bin/which", [cmd], { stdio: "ignore" }); return true; } catch { return false; } };

function nextName(stem, ext) {
  const re = new RegExp("^" + stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-v(\\d+)\\." + ext + "$");
  const used = readdirSync(join(ROOT, "assets")).map((f) => (re.exec(f) || [])[1]).filter(Boolean).map(Number);
  return `assets/${stem}-v${used.length ? Math.max(...used) + 1 : 1}.${ext}`;
}

function images(slug, cover) {
  if (!has("sips")) die("needs macOS `sips` to make the images (run this on the Mac)");
  const abs = (p) => join(ROOT, p);
  let coverWeb;
  if (has("cwebp")) {
    coverWeb = nextName(`${slug}-cover-600`, "webp");
    execFileSync("cwebp", ["-quiet", "-resize", "600", "600", "-q", "80", abs(cover), "-o", abs(coverWeb)]);
  } else {
    coverWeb = nextName(`${slug}-cover-600`, "jpg");
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "78", "-z", "600", "600", abs(cover), "--out", abs(coverWeb)], { stdio: "ignore" });
  }
  /* link preview: 1200x1200 JPG, quality stepped down until it's under 195 KB */
  const share = nextName(`share-${slug}-1200`, "jpg");
  const png = join(tmpdir(), `bs-share-${process.pid}.png`);
  execFileSync("sips", ["-s", "format", "png", "-z", "1200", "1200", abs(cover), "--out", png], { stdio: "ignore" });
  for (const q of [82, 76, 70, 64, 58, 52, 46, 40, 34]) {
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", String(q), png, "--out", abs(share)], { stdio: "ignore" });
    if (statSync(abs(share)).size < 195000) break;
  }
  unlinkSync(png);
  if (statSync(abs(share)).size >= 200000) die(`${share} is still over 200 KB; use a simpler cover`);
  return { coverWeb, share };
}

function writeAll(data) {
  const bad = problems(data.songs);
  if (bad.length) die("songs.json has problems:\n  " + bad.join("\n  "));
  writeFileSync(LIST, JSON.stringify(data, null, 2) + "\n");
  const written = ["songs.json"];
  for (const s of data.songs) {
    writeFileSync(join(ROOT, s.slug + ".html"), render(s, data.spotifyArtist));
    written.push(s.slug + ".html");
  }
  const edge = readFileSync(EDGE, "utf8");
  if (!EDGE_RE.test(edge)) die("couldn't find the path list in " + EDGE);
  writeFileSync(EDGE, edge.replace(EDGE_RE, edgeConfig(data.songs)));
  written.push("netlify/edge-functions/song-geo.js");
  return written;
}

const data = JSON.parse(readFileSync(LIST, "utf8"));
const args = process.argv.slice(2);

if (args[0] === "--rebuild") {
  const files = writeAll(data);
  console.log("✓ rebuilt from songs.json:\n  " + files.join("\n  "));
  process.exit(0);
}

const [slug, title, date] = args;
if (!slug || !title || !date) die('usage: node tools/new-song.mjs <slug> "<Title>" <YYYY-MM-DD>   (or --rebuild)');
if (data.songs.some((s) => s.slug === slug)) die(`"${slug}" is already in songs.json (edit it there, then --rebuild)`);
if (existsSync(join(ROOT, slug + ".html"))) die(`${slug}.html already exists`);
const covers = readdirSync(join(ROOT, "assets")).filter((f) => new RegExp(`^listen-${slug}-cover-v\\d+\\.jpg$`).test(f)).sort();
if (!covers.length) die(`put the cover in assets/ first, named listen-${slug}-cover-v1.jpg`);
const cover = "assets/" + covers[covers.length - 1];

const imgs = images(slug, cover);
const song = { slug, title, date, cover, coverWeb: imgs.coverWeb, share: imgs.share, spotifyTrack: "", spotifyArtist: data.spotifyArtist };
const bad = problems([...data.songs, song]);
if (bad.length) { for (const f of [imgs.coverWeb, imgs.share]) unlinkSync(join(ROOT, f)); die(bad.join("\n  ")); }
data.songs.unshift(song);
const files = writeAll(data);
console.log(`✓ ${title} -> badscandal.com/${slug}\n\nCommit these by name (never git add -A):\n  git add ${[cover, imgs.coverWeb, imgs.share, ...files].join(" ")}\n` +
  `\nThen: npm test, git commit, git push. On release day: paste the Spotify track link into songs.json, run node tools/new-song.mjs --rebuild, commit, push.`);
